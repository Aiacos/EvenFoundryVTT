/**
 * Same-origin image → luminance, for the portrait (zone A) and the scene background
 * (zone C). Decoding happens at runtime only, behind the injectable {@link LumaDecoder}
 * (tests feed raw luminance arrays; the WebView uses {@link browserDecoder}).
 *
 * Degradation: a failed fetch/decode is cached as "failed" so the caller falls back
 * (token image → class emblem; background → grid dots) without retry storms.
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md (page served same-origin by Foundry)
 */

/** 8-bit luminance picture (0 = black, 255 = white), row-major. */
export interface Luma {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Target size and fit of a decode: `cover` crops to the aspect ratio, `stretch` does not. */
export interface DecodeRequest {
  url: string;
  width: number;
  height: number;
  fit: 'cover' | 'stretch';
}

/** Decodes `req.url` into a {@link Luma} of the requested size (rejects on failure). */
export type LumaDecoder = (req: DecodeRequest) => Promise<Luma>;

export type LumaState = { state: 'loading' } | { state: 'ready'; luma: Luma } | { state: 'failed' };

/** Entries kept per cache (scene background + portrait candidates). */
const MAX_ENTRIES = 4;

/** Small LRU of decoded pictures keyed by request. */
export class LumaCache {
  private readonly entries = new Map<string, LumaState>();

  /**
   * @param decode - Platform decoder.
   * @param onSettled - Called when a decode finished (re-render trigger).
   */
  constructor(
    private readonly decode: LumaDecoder,
    private readonly onSettled: () => void,
  ) {}

  /** Returns the state of `req`, starting the decode on first request. */
  get(req: DecodeRequest): LumaState {
    const key = `${req.url}|${req.width}x${req.height}|${req.fit}`;
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const loading: LumaState = { state: 'loading' };
    this.entries.set(key, loading);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.decode(req).then(
      (luma) => this.settle(key, { state: 'ready', luma }),
      (err: unknown) => {
        console.warn(`[hud] image decode failed (${req.url}) — using the fallback`, err);
        this.settle(key, { state: 'failed' });
      },
    );
    return loading;
  }

  private settle(key: string, state: LumaState): void {
    if (!this.entries.has(key)) return;
    this.entries.set(key, state);
    this.onSettled();
  }
}

/** Platform APIs used by {@link browserDecoder} (injected for tests). */
export interface DecodeDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  createImageBitmap: (blob: Blob) => Promise<ImageBitmap>;
  OffscreenCanvas: new (w: number, h: number) => OffscreenCanvas;
}

/** Luminance (Rec. 601) of RGBA pixels; transparent pixels count as black. */
export function rgbaToLuma(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Luma {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    const a = (rgba[i * 4 + 3] ?? 255) / 255;
    data[i] = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * a);
  }
  return { width, height, data };
}

/**
 * Browser decoder: same-origin `fetch` → `createImageBitmap` → `OffscreenCanvas`
 * (cover-cropped or stretched to the request size) → luminance.
 *
 * @throws (rejects) on HTTP errors or when the 2D context is unavailable.
 */
export function browserDecoder(deps: DecodeDeps): LumaDecoder {
  return async ({ url, width, height, fit }) => {
    const res = await deps.fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const bitmap = await deps.createImageBitmap(await res.blob());
    const canvas = new deps.OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (fit === 'cover') {
      const scale = Math.max(width / sw, height / sh);
      const cw = width / scale;
      const ch = height / scale;
      sx = (sw - cw) / 2;
      sy = (sh - ch) / 4; // faces sit in the upper part of portraits
      sw = cw;
      sh = ch;
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    bitmap.close();
    return rgbaToLuma(ctx.getImageData(0, 0, width, height).data, width, height);
  };
}
