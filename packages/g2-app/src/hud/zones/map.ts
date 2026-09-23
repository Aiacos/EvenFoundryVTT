/**
 * Zone C — square map «Mappa», 144 × 144 (docs/design/g2-sheet-ux.html `mapZone()`):
 * 12 px cells by default (12 × 12 cells ≈ 60 ft) centred on the player's token, walls
 * and dashed doors, tokens by allegiance, the target reticle, reach dots, a north mark
 * and the scale bar, inside a rounded frame.
 *
 * Palette:
 *
 * | Element | Level |
 * |---|---|
 * | scene background (ordered dither) | 0–5 |
 * | grid dots (no background image) | 2 |
 * | reach dots | 4 |
 * | wall / door (dashed) | 10 / 11 |
 * | neutral token | 10 |
 * | ally token | 12 |
 * | enemy token (dark cross) | 13 |
 * | own token (ring + core) / reticle | 15 |
 *
 * The background dither is anchored to **scene** pixels so the pattern stays fixed
 * while the viewport scrolls (stable zone hash, no shimmer).
 */
import type { MapSnapshot, MapToken } from '@evf/shared-protocol';
import { drawText, LABEL_FONT, Pixmap, reticle } from '@evf/shared-render';
import type { HudStrings } from '../i18n.js';
import type { Luma } from './luma.js';

const MAP_W = 144;
const MAP_H = 144;
/** Drawable area inside the frame: origin (2, 2), 140 × 140, clipped to (3, 3)–(140, 140). */
export const MAP_VIEW = { x: 2, y: 2, w: 140, h: 140 } as const;

export const LEVEL = {
  bgMax: 5,
  grid: 2,
  reach: 4,
  wall: 10,
  door: 11,
  neutral: 10,
  ally: 12,
  enemy: 13,
  self: 15,
  reticle: 15,
} as const;

/** Top-left corner of the view, in grid cells. */
export interface Viewport {
  x: number;
  y: number;
}

export interface MapZoneOptions {
  /** Pixels per grid cell (settings: 6 / 8 / 12). */
  cellPx: number;
  /** Current viewport (see {@link computeViewport}). */
  viewport: Viewport;
  /** Scene background covering the whole scene (any resolution), or null. */
  background: Luma | null;
  /** Token marked with the reticle. */
  targetId?: string;
  /** Show 5 ft reach dots around the own token (weapon target picker). */
  reach: boolean;
}

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

function center(t: MapToken): { x: number; y: number } {
  return { x: t.x + t.w / 2, y: t.y + t.h / 2 };
}

function clampAxis(v: number, view: number, scene: number): number {
  if (scene <= view) return (scene - view) / 2;
  return Math.min(Math.max(v, 0), scene - view);
}

/**
 * Computes the viewport: centred on the own token (or scene) at first, then — when
 * following — recentred only once the token leaves the middle 50 % of the view.
 *
 * @param prev - Previous viewport for the same scene and zoom, if any.
 */
export function computeViewport(
  snapshot: MapSnapshot,
  cellPx: number,
  follow: boolean,
  prev?: Viewport,
): Viewport {
  const vw = MAP_VIEW.w / cellPx;
  const vh = MAP_VIEW.h / cellPx;
  const self = snapshot.tokens.find((t) => t.id === snapshot.selfTokenId);
  const focus = self ? center(self) : { x: snapshot.cols / 2, y: snapshot.rows / 2 };
  let next: Viewport;
  if (!prev) {
    next = { x: focus.x - vw / 2, y: focus.y - vh / 2 };
  } else if (follow && self) {
    const inX = focus.x >= prev.x + vw * 0.25 && focus.x <= prev.x + vw * 0.75;
    const inY = focus.y >= prev.y + vh * 0.25 && focus.y <= prev.y + vh * 0.75;
    next = inX && inY ? prev : { x: focus.x - vw / 2, y: focus.y - vh / 2 };
  } else {
    next = prev;
  }
  return { x: clampAxis(next.x, vw, snapshot.cols), y: clampAxis(next.y, vh, snapshot.rows) };
}

function drawBackground(
  p: Pixmap,
  snap: MapSnapshot,
  cellPx: number,
  ox: number,
  oy: number,
  bg: Luma | null,
): void {
  const sceneW = snap.cols * cellPx;
  const sceneH = snap.rows * cellPx;
  const dim = 1 - 0.7 * snap.darkness;
  for (let y = 0; y < MAP_VIEW.h; y++) {
    const sy = y + oy;
    if (sy < 0 || sy >= sceneH) continue;
    for (let x = 0; x < MAP_VIEW.w; x++) {
      const sx = x + ox;
      if (sx < 0 || sx >= sceneW) continue;
      const px = MAP_VIEW.x + x;
      const py = MAP_VIEW.y + y;
      if (!bg) {
        if (sx % cellPx === 0 && sy % cellPx === 0) p.set(px, py, LEVEL.grid);
        continue;
      }
      const bx = Math.min(bg.width - 1, Math.floor((sx / sceneW) * bg.width));
      const by = Math.min(bg.height - 1, Math.floor((sy / sceneH) * bg.height));
      const lum = (bg.data[by * bg.width + bx] ?? 0) / 255;
      const threshold = ((BAYER_4[(sy & 3) * 4 + (sx & 3)] ?? 0) + 0.5) / 16;
      p.set(px, py, Math.min(LEVEL.bgMax, Math.floor(lum * dim * LEVEL.bgMax + threshold)));
    }
  }
}

function drawToken(p: Pixmap, t: MapToken, cellPx: number, ox: number, oy: number): void {
  const x0 = MAP_VIEW.x + Math.round(t.x * cellPx) - ox;
  const y0 = MAP_VIEW.y + Math.round(t.y * cellPx) - oy;
  const w = Math.round(t.w * cellPx);
  const h = Math.round(t.h * cellPx);
  const inset = cellPx >= 10 ? 2 : 1;
  switch (t.kind) {
    case 'self':
      p.roundRect(x0, y0, w, h, 2, LEVEL.self);
      p.fillRect(x0 + 3, y0 + 3, w - 6, h - 6, LEVEL.self);
      return;
    case 'ally':
      p.fillRect(x0 + inset, y0 + inset, w - 2 * inset, h - 2 * inset, LEVEL.ally);
      return;
    case 'enemy':
      p.fillRect(x0 + inset, y0 + inset, w - 2 * inset, h - 2 * inset, LEVEL.enemy);
      p.line(x0 + inset, y0 + inset, x0 + w - inset - 1, y0 + h - inset - 1, 0);
      p.line(x0 + w - inset - 1, y0 + inset, x0 + inset, y0 + h - inset - 1, 0);
      return;
    case 'neutral':
      p.fillRect(x0 + inset, y0 + inset, w - 2 * inset, h - 2 * inset, LEVEL.neutral);
      return;
  }
}

function drawReach(p: Pixmap, self: MapToken, cellPx: number, ox: number, oy: number): void {
  for (let gy = Math.floor(self.y) - 1; gy <= Math.floor(self.y + self.h); gy++) {
    for (let gx = Math.floor(self.x) - 1; gx <= Math.floor(self.x + self.w); gx++) {
      const inside = gx >= self.x && gx < self.x + self.w && gy >= self.y && gy < self.y + self.h;
      if (inside) continue;
      const cx = MAP_VIEW.x + gx * cellPx - ox + Math.floor(cellPx / 2) - 1;
      const cy = MAP_VIEW.y + gy * cellPx - oy + Math.floor(cellPx / 2) - 1;
      p.fillRect(cx, cy, 2, 2, LEVEL.reach);
    }
  }
}

/**
 * Renders zone C.
 *
 * @param snapshot - Scene snapshot (cells), or null → frame, north mark and scale only.
 * @param opts - Zoom, viewport, background, reticle and reach options.
 * @param s - Locale strings (`N`, `FT`).
 * @returns 144 × 144 pixmap.
 */
export function renderMap(
  snapshot: MapSnapshot | null,
  opts: MapZoneOptions,
  s: HudStrings,
): Pixmap {
  const p = new Pixmap(MAP_W, MAP_H);
  const { cellPx } = opts;
  if (snapshot) {
    const ox = Math.round(opts.viewport.x * cellPx);
    const oy = Math.round(opts.viewport.y * cellPx);
    p.pushClip(3, 3, 138, 138);
    drawBackground(p, snapshot, cellPx, ox, oy, opts.background);
    const self = snapshot.tokens.find((t) => t.id === snapshot.selfTokenId);
    if (opts.reach && self) drawReach(p, self, cellPx, ox, oy);
    for (const w of snapshot.walls) {
      const [x1, y1, x2, y2] = w.c;
      p.line(
        MAP_VIEW.x + Math.round(x1 * cellPx) - ox,
        MAP_VIEW.y + Math.round(y1 * cellPx) - oy,
        MAP_VIEW.x + Math.round(x2 * cellPx) - ox,
        MAP_VIEW.y + Math.round(y2 * cellPx) - oy,
        w.door === true ? LEVEL.door : LEVEL.wall,
        w.door === true ? 3 : 0,
      );
    }
    const others = snapshot.tokens.filter((t) => t.id !== snapshot.selfTokenId);
    for (const t of others) drawToken(p, t, cellPx, ox, oy);
    if (self) drawToken(p, { ...self, kind: 'self' }, cellPx, ox, oy);
    const target = snapshot.tokens.find((t) => t.id === (opts.targetId ?? snapshot.targetId));
    if (target) {
      const c = center(target);
      const r = Math.round((Math.max(target.w, target.h) * cellPx) / 2) + 3;
      reticle(
        p,
        MAP_VIEW.x + Math.round(c.x * cellPx) - ox,
        MAP_VIEW.y + Math.round(c.y * cellPx) - oy,
        r,
        LEVEL.reticle,
      );
    }
    p.popClip();
  }
  p.roundRect(1, 1, 142, 142, 4, 6);
  // North mark and a one-cell scale bar (5 ft), on dark plates so the map never hides them.
  p.fillRect(127, 5, 10, 19, 0);
  drawText(p, LABEL_FONT, s.north, 132, 7, 11, 'center', true);
  p.vline(132, 16, 22, 11);
  const label = `5 ${s.ft}`;
  p.fillRect(6, 128, cellPx + 44, 11, 0);
  p.fillRect(8, 134, cellPx, 2, 9);
  drawText(p, LABEL_FONT, label, 12 + cellPx, 130, 8);
  return p;
}
