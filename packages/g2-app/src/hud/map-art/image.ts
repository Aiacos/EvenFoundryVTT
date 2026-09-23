/**
 * Scene-art images for the pixelated map (zone C): same-origin image → luminance +
 * alpha, decoded behind the injectable {@link ArtDecoder} (tests and demo mode feed
 * procedural pictures; the WebView uses {@link browserArtDecoder}) and kept in a small
 * LRU per URL and size.
 *
 * Unlike the portrait's {@link Luma} (alpha premultiplied to black), map art keeps the
 * alpha channel: tiles and round token art are composited over the background.
 *
 * Degradation: a failed fetch/decode is cached as "failed" (no retry storms); a failed
 * background makes the map fall back to the schematic renderer, a failed tile/token
 * picture is simply not drawn.
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md (page served same-origin by Foundry)
 */
import type { DecodeDeps, DecodeRequest } from '../zones/luma.js';

/** 8-bit luminance (0 black – 255 white) and alpha (0 transparent – 255 opaque), row-major. */
export interface ArtImage {
  width: number;
  height: number;
  luma: Uint8Array;
  alpha: Uint8Array;
}

/** Decodes `req.url` into an {@link ArtImage} of the requested size (rejects on failure). */
export type ArtDecoder = (req: DecodeRequest) => Promise<ArtImage>;

export type ArtState =
  | { state: 'loading' }
  | { state: 'ready'; image: ArtImage }
  | { state: 'failed' };

/** Entries kept: one background, the tiles and the distinct token pictures of a scene. */
const MAX_ENTRIES = 64;

/** LRU of decoded scene-art pictures keyed by URL and size. */
export class ArtCache {
  private readonly entries = new Map<string, ArtState>();

  /**
   * @param decode - Platform decoder.
   * @param onSettled - Called when a decode finished (re-render trigger).
   */
  constructor(
    private readonly decode: ArtDecoder,
    private readonly onSettled: () => void,
  ) {}

  /** Returns the state of `req`, starting the decode on first request. */
  get(req: DecodeRequest): ArtState {
    const key = `${req.url}|${req.width}x${req.height}|${req.fit}`;
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const loading: ArtState = { state: 'loading' };
    this.entries.set(key, loading);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.decode(req).then(
      (image) => this.settle(key, { state: 'ready', image }),
      (err: unknown) => {
        console.warn(`[hud] map art decode failed (${req.url}) — using the fallback`, err);
        this.settle(key, { state: 'failed' });
      },
    );
    return loading;
  }

  private settle(key: string, state: ArtState): void {
    if (!this.entries.has(key)) return;
    this.entries.set(key, state);
    this.onSettled();
  }
}

/** Straight (not premultiplied) Rec. 601 luminance and alpha of RGBA pixels. */
export function rgbaToArt(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): ArtImage {
  const luma = new Uint8Array(width * height);
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    alpha[i] = rgba[i * 4 + 3] ?? 255;
  }
  return { width, height, luma, alpha };
}

/**
 * Browser decoder: same-origin `fetch` → `createImageBitmap` → `OffscreenCanvas`
 * (stretched to the request size; `cover` centre-crops) → luminance + alpha.
 *
 * @throws (rejects) on HTTP errors or when the 2D context is unavailable.
 */
export function browserArtDecoder(deps: DecodeDeps): ArtDecoder {
  return async ({ url, width, height, fit }) => {
    const res = await deps.fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const bitmap = await deps.createImageBitmap(await res.blob());
    const canvas = new deps.OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('OffscreenCanvas 2d context unavailable');
    }
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (fit === 'cover') {
      const scale = Math.max(width / sw, height / sh);
      sx = (sw - width / scale) / 2;
      sy = (sh - height / scale) / 2;
      sw = width / scale;
      sh = height / scale;
    }
    // Averaged (not nearest) resampling: the pixelation happens later, on purpose.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    bitmap.close();
    return rgbaToArt(ctx.getImageData(0, 0, width, height).data, width, height);
  };
}
