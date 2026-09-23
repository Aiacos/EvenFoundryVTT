/**
 * Map art window: composites the decoded scene art (background → tiles → token art)
 * under the map viewport, pixelates it (block average → nearest upscale, blocks
 * anchored to scene pixels), masks it to the own token's sight and Floyd–Steinberg
 * dithers it to the G2 levels `0 … MAP_TONE.max`. Pure and deterministic.
 *
 * @see ./pixelate.ts (pixel ops, tone curve) · ./sight.ts (privacy mask)
 */
import type { MapSnapshot } from '@evf/shared-protocol';
import type { ArtLayer } from './layers.js';
import { blockAverage, ditherFS, MAP_TONE, toneLevel, upscaleNearest } from './pixelate.js';
import { DEFAULT_SIGHT_CELLS, sightMask } from './sight.js';

/** Pixelation block sizes in G2 pixels (phone setting «Arte mappa»). */
export type MapPixelSize = 1 | 2 | 3;
/** Brightness kept at full scene darkness (darkness 1 → 40 %). */
const DARKNESS_DIM = 0.6;

/** Where the art window sits, in viewport pixels at `cellPx` pixels per cell. */
export interface ArtView {
  /** Viewport origin in scaled scene pixels (`viewport.x · cellPx`, integer). */
  ox: number;
  oy: number;
  cellPx: number;
  /** Window side in pixels (square). */
  size: number;
  pixelSize: MapPixelSize;
}

/** Dithered art of the window: `size × size` levels and the in-sight flags. */
export interface ArtFrame {
  size: number;
  levels: Uint8Array;
  /** 1 where the pixel is in the own token's sight (and inside the scene). */
  lit: Uint8Array;
}

/** Luminance (0–255) of the composited layers at cell point (cx, cy); 0 when uncovered. */
function composite(layers: readonly ArtLayer[], cx: number, cy: number): number {
  let v = 0;
  for (const l of layers) {
    const u = (cx - l.x) / l.w;
    const t = (cy - l.y) / l.h;
    if (u < 0 || u >= 1 || t < 0 || t >= 1) continue;
    const img = l.image;
    const i = Math.floor(t * img.height) * img.width + Math.floor(u * img.width);
    const a = (img.alpha[i] ?? 0) / 255;
    v += ((img.luma[i] ?? 0) - v) * a;
  }
  return v;
}

/**
 * Renders the art window.
 *
 * @param snap - Scene snapshot (walls, own token + sight, darkness, size).
 * @param layers - Decoded art layers (see `collectArt`), bottom to top.
 * @param view - Window placement, zoom and block size.
 * @returns The dithered levels and the sight mask of the window.
 */
export function renderArtWindow(
  snap: MapSnapshot,
  layers: readonly ArtLayer[],
  view: ArtView,
): ArtFrame {
  const { ox, oy, cellPx, size, pixelSize: b } = view;
  const bx0 = Math.floor(ox / b);
  const by0 = Math.floor(oy / b);
  const cols = Math.floor((ox + size - 1) / b) - bx0 + 1;
  const rows = Math.floor((oy + size - 1) / b) - by0 + 1;
  const bw = cols * b;
  const bh = rows * b;
  // Only the layers crossing the window take part.
  const x0 = (bx0 * b) / cellPx;
  const y0 = (by0 * b) / cellPx;
  const x1 = x0 + bw / cellPx;
  const y1 = y0 + bh / cellPx;
  const visible = layers.filter((l) => l.x < x1 && l.x + l.w > x0 && l.y < y1 && l.y + l.h > y0);
  const full = new Float32Array(bw * bh);
  for (let py = 0; py < bh; py++) {
    const cy = y0 + (py + 0.5) / cellPx;
    for (let px = 0; px < bw; px++)
      full[py * bw + px] = composite(visible, x0 + (px + 0.5) / cellPx, cy);
  }
  const lum = blockAverage(full, bw, bh, b);

  const step = b / cellPx;
  const self = snap.tokens.find((t) => t.id === snap.selfTokenId);
  const eye = self ? { x: self.x + self.w / 2, y: self.y + self.h / 2 } : { x: -1e9, y: -1e9 };
  const radius = self?.sight ?? DEFAULT_SIGHT_CELLS;
  const bx = x0 + step / 2;
  const by = y0 + step / 2;
  const mask = sightMask({ x0: bx, y0: by, step, cols, rows }, eye, radius, snap.walls);
  const dim = 1 - DARKNESS_DIM * snap.darkness;
  const values = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const cy = by + j * step;
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const cx = bx + i * step;
      if (cx < 0 || cy < 0 || cx >= snap.cols || cy >= snap.rows) mask[k] = 0;
      if (mask[k]) values[k] = toneLevel(lum[k] ?? 0, MAP_TONE, dim);
    }
  }
  const q = ditherFS(values, cols, rows, MAP_TONE.max, mask);
  const sx = ox - bx0 * b;
  const sy = oy - by0 * b;
  return {
    size,
    levels: upscaleNearest(q, cols, b, size, size, sx, sy),
    lit: upscaleNearest(mask, cols, b, size, size, sx, sy),
  };
}
