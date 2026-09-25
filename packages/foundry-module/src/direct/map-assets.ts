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
  ASSET_REF_PREFIX,
  type MapImage,
  type MapSnapshot,
  toBase64Url,
} from '@evf/shared-protocol';

/** Longest side of the encoded background (px). */
export const BACKGROUND_MAX_SIDE = 768;
/** Longest side of an encoded tile / token picture (px). */
export const PIECE_MAX_SIDE = 128;
/** Encoded pictures kept in memory (one scene's background, tiles and token art). */
const MAX_CACHED = 96;

/** A picture ready for an `asset` message. */
export interface MapAsset {
  id: string;
  data: string;
}

/** Encodes `src` into a downsized `data:` URL (rejects on any failure). */
export type AssetEncoder = (src: string, maxSide: number, type: 'jpeg' | 'png') => Promise<string>;

/** Stable asset id of a source URL: base64url of the first 16 bytes of SHA-256. */
export async function assetIdOf(src: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
  return toBase64Url(new Uint8Array(digest).slice(0, 16));
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

  constructor(private readonly encode: AssetEncoder = browserAssetEncoder) {}

  /**
   * Rewrites `snapshot` for the glasses. Pictures that cannot be encoded are dropped
   * (warned once per source).
   */
  async prepare(snapshot: MapSnapshot): Promise<PreparedMap> {
    const assets = new Map<string, MapAsset>();
    const ref = async (src: string, maxSide: number, type: 'jpeg' | 'png') => {
      const asset = await this.get(src, maxSide, type);
      if (asset === null) return undefined;
      assets.set(asset.id, asset);
      return `${ASSET_REF_PREFIX}${asset.id}`;
    };
    const image = async (img: MapImage | undefined, maxSide: number, type: 'jpeg' | 'png') => {
      if (img === undefined) return undefined;
      const src = await ref(img.src, maxSide, type);
      return src === undefined ? undefined : { ...img, src };
    };

    const background = await image(snapshot.background, BACKGROUND_MAX_SIDE, 'jpeg');
    const tiles = [];
    for (const tile of snapshot.tiles ?? []) {
      const t = await image(tile, PIECE_MAX_SIDE, 'png');
      if (t !== undefined) tiles.push({ ...t, z: tile.z });
    }
    const tokens = [];
    for (const token of snapshot.tokens) {
      const { img, ...rest } = token;
      const src = img === undefined ? undefined : await ref(img, PIECE_MAX_SIDE, 'png');
      tokens.push(src === undefined ? rest : { ...rest, img: src });
    }
    const { background: _bg, tiles: _tiles, ...base } = snapshot;
    const map: MapSnapshot = {
      ...base,
      ...(background !== undefined ? { background } : {}),
      ...(tiles.length > 0 ? { tiles } : {}),
      tokens,
    };
    return { map, assets: [...assets.values()] };
  }

  private get(src: string, maxSide: number, type: 'jpeg' | 'png'): Promise<MapAsset | null> {
    const key = `${src}|${maxSide}|${type}`;
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const pending = (async (): Promise<MapAsset | null> => {
      try {
        return { id: await assetIdOf(key), data: await this.encode(src, maxSide, type) };
      } catch (err) {
        console.warn(`[EVF] map picture skipped (${src}): ${String(err)}`);
        return null;
      }
    })();
    this.entries.set(key, pending);
    while (this.entries.size > MAX_CACHED) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return pending;
  }
}
