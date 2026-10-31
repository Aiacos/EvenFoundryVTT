/**
 * Scene pictures for the glasses map, prepared by the projector (ADR-0019 §Decision
 * Outcome 5).
 *
 * The phone never reaches Foundry, so the projector — a logged-in Foundry tab that can
 * load the scene art same-origin (or cross-origin with CORS, e.g. The Forge assets CDN) —
 * downsizes each picture once and sends it as a `data:` URL in an `asset` message; the
 * {@link MapSnapshot} then references it as `evf-asset:<id>`. The phone's pixelation
 * pipeline is unchanged: it decodes the asset instead of fetching a URL.
 *
 * Sizes: the background at most {@link BACKGROUND_MAX_SIDE} px (JPEG — it has no alpha),
 * tiles and token art at most {@link PIECE_MAX_SIDE} px (PNG — alpha matters). The map
 * shows ≤ 12 px per cell over a 144 px window, so this keeps every visible detail while a
 * whole scene fits one relay frame. Failures (404, CORS, decode) drop that picture only:
 * the phone falls back to the schematic map when the background is missing.
 *
 * @see packages/g2-app/src/hud/map-art/ (phone-side decode + pixelation)
 * @see https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob
 */
import {
  ASSET_DATA_MAX,
  ASSET_REF_PREFIX,
  type MapImage,
  type MapSnapshot,
  sha256Digest,
  toBase64Url,
} from '@evf/shared-protocol';

/** Longest side of the encoded background (px). */
export const BACKGROUND_MAX_SIDE = 768;
/** Longest side of an encoded tile / token picture (px). */
export const PIECE_MAX_SIDE = 128;
/** Encoded pictures kept (LRU); sized above a large scene so cyclic access still hits. */
export const MAX_CACHED = 256;

/**
 * Pictures encoded at the same time on a cold cache: parallel enough that a scene full of
 * tokens is ready quickly, bounded so the tab does not decode dozens of images at once.
 */
export const ENCODE_CONCURRENCY = 4;

/** A picture that failed to encode is tried again after this long (ms), not every refresh. */
export const FAILED_RETRY_MS = 60_000;

/** A picture ready for an `asset` message. */
export interface MapAsset {
  id: string;
  data: string;
}

/** Encodes `src` into a downsized `data:` URL (rejects on any failure). */
export type AssetEncoder = (src: string, maxSide: number, type: 'jpeg' | 'png') => Promise<string>;

/**
 * Stable asset id of a source URL: base64url of the first 16 bytes of SHA-256 (WebCrypto,
 * or the shared-protocol fallback on an http Foundry tab — same id either way).
 */
export async function assetIdOf(src: string): Promise<string> {
  const digest = await sha256Digest(new TextEncoder().encode(src));
  return toBase64Url(digest.slice(0, 16));
}

/** Fits `w × h` inside `max` (never upscales). */
export function fitSize(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Browser encoder: `fetch` (same-origin credentials; cross-origin needs CORS) →
 * `createImageBitmap` → `OffscreenCanvas` → `convertToBlob` → `data:` URL.
 */
export const browserAssetEncoder: AssetEncoder = async (src, maxSide, type) => {
  const res = await fetch(src, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const { width, height } = fitSize(bitmap.width, bitmap.height, maxSide);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    bitmap.close();
    throw new Error('OffscreenCanvas 2d context unavailable');
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: `image/${type}`, quality: 0.75 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
};

/** Result of {@link MapAssetCache.prepare}. */
export interface PreparedMap {
  /** The snapshot with every picture replaced by its `evf-asset:` reference. */
  map: MapSnapshot;
  /** The pictures the snapshot references (the caller sends the unsent ones first). */
  assets: MapAsset[];
}

/** Encodes and remembers scene pictures across map refreshes (one per projector). */
export class MapAssetCache {
  private readonly entries = new Map<string, Promise<MapAsset | null>>();
  /** When each failed key may be retried (a transient 5xx must not stick for the session). */
  private readonly retryAt = new Map<string, number>();
  /** Sources already warned about, so a broken picture logs once, not once per retry. */
  private readonly warned = new Set<string>();
  /** Encodes running now, and the ones waiting for a slot ({@link ENCODE_CONCURRENCY}). */
  private encoding = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly encode: AssetEncoder = browserAssetEncoder,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Rewrites `snapshot` for the glasses. Pictures that cannot be encoded, or that encode
   * above {@link ASSET_DATA_MAX}, are dropped (warned once per source) and retried after
   * {@link FAILED_RETRY_MS}.
   */
  async prepare(snapshot: MapSnapshot): Promise<PreparedMap> {
    // Every picture is requested at once (encodes are bounded by the cache); results are
    // collected in map order so the assets keep background → tiles → tokens.
    const tileList = snapshot.tiles ?? [];
    const [bgAsset, tileAssets, tokenAssets] = await Promise.all([
      snapshot.background === undefined
        ? null
        : this.get(snapshot.background.src, BACKGROUND_MAX_SIDE, 'jpeg'),
      Promise.all(tileList.map((tile) => this.get(tile.src, PIECE_MAX_SIDE, 'png'))),
      Promise.all(
        snapshot.tokens.map((token) =>
          token.img === undefined ? null : this.get(token.img, PIECE_MAX_SIDE, 'png'),
        ),
      ),
    ]);
    const assets = new Map<string, MapAsset>();
    const ref = (asset: MapAsset | null): string | undefined => {
      if (asset === null) return undefined;
      assets.set(asset.id, asset);
      return `${ASSET_REF_PREFIX}${asset.id}`;
    };
    const bgSrc = ref(bgAsset);
    const background: MapImage | undefined =
      snapshot.background === undefined || bgSrc === undefined
        ? undefined
        : { ...snapshot.background, src: bgSrc };
    const tiles = [];
    for (const [i, tile] of tileList.entries()) {
      const src = ref(tileAssets[i] ?? null);
      if (src !== undefined) tiles.push({ ...tile, src });
    }
    const tokens = snapshot.tokens.map((token, i) => {
      const { img: _img, ...rest } = token;
      const src = ref(tokenAssets[i] ?? null);
      return src === undefined ? rest : { ...rest, img: src };
    });
    const { background: _bg, tiles: _tiles, ...base } = snapshot;
    const map: MapSnapshot = {
      ...base,
      ...(background !== undefined ? { background } : {}),
      ...(tiles.length > 0 ? { tiles } : {}),
      tokens,
    };
    return { map, assets: [...assets.values()] };
  }

  /** Runs `task` once one of the {@link ENCODE_CONCURRENCY} encode slots is free. */
  private async bounded<T>(task: () => Promise<T>): Promise<T> {
    while (this.encoding >= ENCODE_CONCURRENCY) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.encoding++;
    try {
      return await task();
    } finally {
      this.encoding--;
      this.waiting.shift()?.();
    }
  }

  private get(src: string, maxSide: number, type: 'jpeg' | 'png'): Promise<MapAsset | null> {
    const key = `${src}|${maxSide}|${type}`;
    const retry = this.retryAt.get(key);
    if (retry !== undefined && this.now() >= retry) {
      this.retryAt.delete(key);
      this.entries.delete(key);
    }
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const pending = (async (): Promise<MapAsset | null> => {
      try {
        const data = await this.bounded(() => this.encode(src, maxSide, type));
        if (data.length > ASSET_DATA_MAX) {
          // Would seal above the relay's 1 MiB frame limit: the relay would eject the
          // projector, which would reconnect and send it again (a loop). Schematic instead.
          throw new Error(`encoded picture too large (${data.length} > ${ASSET_DATA_MAX} chars)`);
        }
        this.warned.delete(src);
        return { id: await assetIdOf(key), data };
      } catch (err) {
        if (!this.warned.has(src)) {
          this.warned.add(src);
          console.warn(`[EVF] map picture skipped (${src}): ${String(err)}`);
        }
        this.retryAt.set(key, this.now() + FAILED_RETRY_MS);
        return null;
      }
    })();
    this.entries.set(key, pending);
    while (this.entries.size > MAX_CACHED) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
      this.retryAt.delete(oldest);
    }
    return pending;
  }
}
