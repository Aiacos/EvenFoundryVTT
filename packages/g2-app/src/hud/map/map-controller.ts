/**
 * MapController — keeps column B in sync with the map snapshot:
 * viewport (follow token) → `renderPixelMap` → 2 tiles → hash skip → PNG →
 * {@link ImageSender}. Renders at most once per second; switches to the glyph
 * fallback after two failed frames and retries images after {@link RETRY_IMAGES_MS}.
 *
 * @see docs/design/g2-thirds-layout.md §Mappa pixelata
 */
import type { MapSnapshot } from '@evf/shared-protocol';
import type { AppSettings } from '../../state/app-store.js';
import { IMAGE } from '../layout.js';
import type { BackgroundLoader } from './background.js';
import { glyphMapLines } from './glyph-map.js';
import { ImageSender, type SendTile, type TileUpdate } from './image-sender.js';
import { computeViewport, renderPixelMap, type Viewport } from './pixel-map.js';
import { encodeTilePng, hashTile, splitTiles } from './tiles.js';

export const MIN_RENDER_MS = 1000;
export const RETRY_IMAGES_MS = 30_000;

export interface MapInput {
  map: MapSnapshot | null;
  settings: AppSettings;
  /** Reticle override (target picker cursor). */
  targetId?: string;
  /** False while column B must stay frozen (offline, glyph mode, full-screen). */
  active: boolean;
}

export interface MapControllerDeps {
  send: SendTile;
  background: BackgroundLoader;
  /** Glyph fallback toggled (true = show glyphs, false = back to images). */
  onFallbackChange: (glyph: boolean) => void;
}

interface RenderKey {
  map: MapSnapshot | null;
  cellPx: number;
  follow: boolean;
  targetId: string | undefined;
  background: ImageData | null;
}

function sameKey(a: RenderKey, b: RenderKey): boolean {
  return (
    a.map === b.map &&
    a.cellPx === b.cellPx &&
    a.follow === b.follow &&
    a.targetId === b.targetId &&
    a.background === b.background
  );
}

export class MapController {
  private readonly sender: ImageSender;
  private viewport: { key: string; vp: Viewport } | null = null;
  private hashes: [number | null, number | null] = [null, null];
  private input: MapInput | null = null;
  /** Inputs of the last render (identity compare; snapshots are replaced, never mutated). */
  private rendered: RenderKey | null = null;
  private lastRenderAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: MapControllerDeps) {
    this.sender = new ImageSender(deps.send, {
      // A failed frame is repainted once more; a second failure triggers the fallback.
      onFrame: (ok) => {
        if (!ok) this.repaint();
      },
      onFallback: () => this.enterFallback(),
    });
  }

  /** Feeds the latest state; renders (throttled) when anything visible changed. */
  update(input: MapInput): void {
    this.input = input;
    if (!input.active || !input.map) return;
    if (this.rendered && sameKey(this.rendered, this.keyOf(input))) return;
    this.schedule();
  }

  /** Forgets what the glasses show (after create/rebuild/foreground) and repaints. */
  resetImages(): void {
    this.sender.reset();
    this.repaint();
  }

  /** Glyph lines for the fallback mode (same viewport as the images). */
  glyphLines(input: MapInput): string[] {
    if (!input.map) return [];
    return glyphMapLines(this.pixels(input.map, input));
  }

  dispose(): void {
    this.sender.dispose();
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
  }

  /** Forces both tiles to be re-sent on the next (throttled) render. */
  private repaint(): void {
    this.hashes = [null, null];
    this.rendered = null;
    if (this.input) this.update(this.input);
  }

  private keyOf(i: MapInput): RenderKey {
    return {
      map: i.map,
      cellPx: i.settings.mapCellPx,
      follow: i.settings.followToken,
      targetId: i.targetId,
      background: i.map ? this.deps.background.get(i.map) : null,
    };
  }

  private schedule(): void {
    if (this.timer !== undefined) return;
    const wait = Math.max(0, this.lastRenderAt + MIN_RENDER_MS - Date.now());
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.render();
    }, wait);
  }

  private pixels(map: MapSnapshot, i: MapInput): Uint8Array {
    const cellPx = i.settings.mapCellPx;
    const key = `${map.sceneId}|${cellPx}`;
    const prev = this.viewport?.key === key ? this.viewport.vp : undefined;
    const vp = computeViewport(map, cellPx, i.settings.followToken, prev);
    this.viewport = { key, vp };
    return renderPixelMap(map, {
      cellPx,
      follow: i.settings.followToken,
      viewport: vp,
      background: this.deps.background.get(map),
      ...(i.targetId === undefined ? {} : { targetId: i.targetId }),
    });
  }

  private render(): void {
    const i = this.input;
    if (!i?.active || !i.map) return;
    this.lastRenderAt = Date.now();
    this.rendered = this.keyOf(i);
    const tiles = splitTiles(this.pixels(i.map, i));
    const regions = [IMAGE.mapTop, IMAGE.mapBottom] as const;
    const changed: TileUpdate[] = [];
    for (const idx of [0, 1] as const) {
      const h = hashTile(tiles[idx]);
      if (this.hashes[idx] === h) continue;
      this.hashes[idx] = h;
      changed.push({
        id: regions[idx].id,
        name: regions[idx].name,
        data: encodeTilePng(tiles[idx]),
      });
    }
    if (changed.length > 0) this.sender.submit(changed);
  }

  private enterFallback(): void {
    this.deps.onFallbackChange(true);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.deps.onFallbackChange(false);
    }, RETRY_IMAGES_MS);
  }
}
