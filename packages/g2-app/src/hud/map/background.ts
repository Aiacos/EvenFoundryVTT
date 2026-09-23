/**
 * Scene background loader: fetches the same-origin background URL from the map
 * snapshot, decodes it with `createImageBitmap` + `OffscreenCanvas` and caches the
 * down-scaled `ImageData` for the current scene only (bounded memory).
 *
 * Degradation: when the platform lacks the decode APIs or the fetch/decode fails,
 * the scene is cached as "no background" and the map shows grid dots instead.
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md (page served same-origin by Foundry)
 */
import type { MapSnapshot } from '@evf/shared-protocol';

/** Pixels per cell kept from the source image (= largest zoom level). */
const SAMPLE_PX_PER_CELL = 12;
const MAX_SIDE = 2048;

export interface DecodeDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  createImageBitmap?: (blob: Blob) => Promise<ImageBitmap>;
  OffscreenCanvas?: new (w: number, h: number) => OffscreenCanvas;
}

type Entry =
  | { key: string; state: 'loading' }
  | { key: string; state: 'ready'; image: ImageData | null };

export class BackgroundLoader {
  private entry: Entry | null = null;

  /**
   * @param onLoaded - Called when a background finished loading (re-render trigger).
   * @param deps - Platform APIs (injected for tests).
   */
  constructor(
    private readonly onLoaded: () => void,
    private readonly deps: DecodeDeps,
  ) {}

  /**
   * Returns the cached background for `snapshot` (null while loading / absent) and
   * starts loading it on first request.
   */
  get(snapshot: MapSnapshot): ImageData | null {
    const url = snapshot.background;
    if (!url) return null;
    const key = `${snapshot.sceneId}|${url}`;
    if (this.entry?.key === key) return this.entry.state === 'ready' ? this.entry.image : null;
    this.entry = { key, state: 'loading' };
    void this.load(key, url, snapshot);
    return null;
  }

  private async load(key: string, url: string, snapshot: MapSnapshot): Promise<void> {
    let image: ImageData | null = null;
    try {
      image = await this.decode(url, snapshot);
    } catch (err) {
      console.warn('[hud] background decode failed — grid-only map', err);
    }
    if (this.entry?.key !== key) return;
    this.entry = { key, state: 'ready', image };
    this.onLoaded();
  }

  private async decode(url: string, snapshot: MapSnapshot): Promise<ImageData | null> {
    const { createImageBitmap, OffscreenCanvas } = this.deps;
    if (!createImageBitmap || !OffscreenCanvas) return null;
    const res = await this.deps.fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`background fetch ${res.status}`);
    const bitmap = await createImageBitmap(await res.blob());
    const w = Math.max(1, Math.min(MAX_SIDE, snapshot.cols * SAMPLE_PX_PER_CELL, bitmap.width));
    const h = Math.max(1, Math.min(MAX_SIDE, snapshot.rows * SAMPLE_PX_PER_CELL, bitmap.height));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return ctx.getImageData(0, 0, w, h);
  }
}
