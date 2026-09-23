/**
 * Zone C — square map «Mappa», 144 × 144 (docs/design/g2-sheet-ux.html `mapZone()`):
 * 12 px cells by default (≈ 12 × 12 cells ≈ 60 ft) centred on the player's token,
 * inside a rounded frame, with a north mark and the scale bar.
 *
 * Two renderers share the frame and the markers:
 * - **art** (scene background decoded, own token placed): the original Foundry scene
 *   art pixelated, sight-masked and Floyd–Steinberg dithered to levels 0–10
 *   (`../map-art/`), under crisp vector markers with dark halos so tokens stay
 *   readable over busy art. Walls are drawn only outside the lit area (the art shows
 *   them inside); closed doors everywhere.
 * - **schematic** (no background, still loading, decode failed, or no own token): grid
 *   dots, walls and dashed doors, tokens as filled blocks — never a blank map.
 *
 * Palette:
 *
 * | Element | Level |
 * |---|---|
 * | scene art (pixelated, dithered) | 0–10 |
 * | grid dots (schematic) | 2 |
 * | reach dots (schematic / over art) | 4 / 12 |
 * | wall / door (dashed) | 10 / 11 |
 * | neutral token | 10 |
 * | ally token | 12 |
 * | enemy token (cross) | 13 |
 * | own token (ring) / reticle | 15 |
 */
import type { MapSnapshot, MapToken, MapWall } from '@evf/shared-protocol';
import { drawText, LABEL_FONT, Pixmap, reticle } from '@evf/shared-render';
import type { HudStrings } from '../i18n.js';
import { type ArtFrame, type MapPixelSize, renderArtWindow } from '../map-art/art.js';
import type { ArtImage } from '../map-art/image.js';
import type { ArtLayer } from '../map-art/layers.js';

const MAP_W = 144;
const MAP_H = 144;
/** Drawable area inside the frame: origin (2, 2), 140 × 140, clipped to (3, 3)–(140, 140). */
export const MAP_VIEW = { x: 2, y: 2, w: 140, h: 140 } as const;

export const LEVEL = {
  grid: 2,
  reach: 4,
  reachArt: 12,
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
  /** Decoded scene art layers (see `collectArt`), or null → schematic map. */
  art: readonly ArtLayer[] | null;
  /** Pixelation block of the art (setting «Pixel mappa»). */
  pixelSize: MapPixelSize;
  /** Token marked with the reticle. */
  targetId?: string;
  /** Show 5 ft reach dots around the own token (weapon target picker). */
  reach: boolean;
}

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

function drawGrid(p: Pixmap, snap: MapSnapshot, cellPx: number, ox: number, oy: number): void {
  const sceneW = snap.cols * cellPx;
  const sceneH = snap.rows * cellPx;
  for (let y = 0; y < MAP_VIEW.h; y++) {
    const sy = y + oy;
    if (sy < 0 || sy >= sceneH || sy % cellPx !== 0) continue;
    for (let x = 0; x < MAP_VIEW.w; x++) {
      const sx = x + ox;
      if (sx >= 0 && sx < sceneW && sx % cellPx === 0)
        p.set(MAP_VIEW.x + x, MAP_VIEW.y + y, LEVEL.grid);
    }
  }
}

/** A wall (solid, level 10) or door (dashed, level 11) in zone pixels. */
function drawWall(p: Pixmap, w: MapWall, cellPx: number, ox: number, oy: number): void {
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

/** Last art window (re-dithered only when the scene, the art or the view changed). */
let artMemo: {
  snap: MapSnapshot;
  images: readonly ArtImage[];
  key: string;
  frame: ArtFrame;
} | null = null;

function artFrame(
  snap: MapSnapshot,
  layers: readonly ArtLayer[],
  cellPx: number,
  pixelSize: MapPixelSize,
  ox: number,
  oy: number,
): ArtFrame {
  const key = `${ox},${oy},${cellPx},${pixelSize}`;
  const images = layers.map((l) => l.image);
  const m = artMemo;
  if (
    m?.snap === snap &&
    m.key === key &&
    m.images.length === images.length &&
    m.images.every((img, i) => img === images[i])
  ) {
    return m.frame;
  }
  const frame = renderArtWindow(snap, layers, { ox, oy, cellPx, size: MAP_VIEW.w, pixelSize });
  artMemo = { snap, images, key, frame };
  return frame;
}

function drawArt(p: Pixmap, frame: ArtFrame): void {
  for (let y = 0; y < frame.size; y++) {
    for (let x = 0; x < frame.size; x++) {
      p.set(MAP_VIEW.x + x, MAP_VIEW.y + y, frame.levels[y * frame.size + x] ?? 0);
    }
  }
}

/**
 * Walls over the art: closed doors everywhere (dashed), other walls only where the art
 * is dark (out of sight), so the lit art is not scribbled over.
 */
function drawArtWalls(
  p: Pixmap,
  snap: MapSnapshot,
  frame: ArtFrame,
  cellPx: number,
  ox: number,
  oy: number,
): void {
  const layer = new Pixmap(p.width, p.height);
  const doors = new Pixmap(p.width, p.height);
  for (const w of snap.walls) {
    if (w.door !== true) drawWall(layer, w, cellPx, ox, oy);
    else if (w.open !== true) drawWall(doors, w, cellPx, ox, oy);
  }
  for (let y = 0; y < frame.size; y++) {
    for (let x = 0; x < frame.size; x++) {
      const px = MAP_VIEW.x + x;
      const py = MAP_VIEW.y + y;
      const door = doors.get(px, py);
      const wall = frame.lit[y * frame.size + x] ? 0 : layer.get(px, py);
      if (door || wall) p.set(px, py, door || wall);
    }
  }
}

/** Token footprint in zone pixels. */
function footprint(t: MapToken, cellPx: number, ox: number, oy: number) {
  return {
    x0: MAP_VIEW.x + Math.round(t.x * cellPx) - ox,
    y0: MAP_VIEW.y + Math.round(t.y * cellPx) - oy,
    w: Math.round(t.w * cellPx),
    h: Math.round(t.h * cellPx),
  };
}

/**
 * Token marker over the art: outline shapes with a 1 px dark halo, the token art
 * showing through — own token a double ring (15), ally a ring (12), enemy a cross (13),
 * neutral corner ticks (10).
 */
function drawArtToken(p: Pixmap, t: MapToken, cellPx: number, ox: number, oy: number): void {
  const { x0, y0, w, h } = footprint(t, cellPx, ox, oy);
  const r = Math.max(1, Math.floor(Math.min(w, h) / 4));
  switch (t.kind) {
    case 'self':
      p.roundRect(x0 - 1, y0 - 1, w + 2, h + 2, r + 1, 0);
      p.roundRect(x0, y0, w, h, r, LEVEL.self);
      p.roundRect(x0 + 1, y0 + 1, w - 2, h - 2, Math.max(0, r - 1), LEVEL.self);
      p.roundRect(x0 + 2, y0 + 2, w - 4, h - 4, Math.max(0, r - 2), 0);
      return;
    case 'ally':
      p.roundRect(x0, y0, w, h, r, 0);
      p.roundRect(x0 + 1, y0 + 1, w - 2, h - 2, Math.max(0, r - 1), LEVEL.ally);
      p.roundRect(x0 + 2, y0 + 2, w - 4, h - 4, Math.max(0, r - 2), 0);
      return;
    case 'enemy': {
      const a = { x: x0 + 1, y: y0 + 1 };
      const b = { x: x0 + w - 2, y: y0 + h - 2 };
      for (const d of [-1, 1]) {
        p.line(a.x + d, a.y, b.x + d, b.y, 0);
        p.line(b.x + d, a.y, a.x + d, b.y, 0);
      }
      p.line(a.x, a.y, b.x, b.y, LEVEL.enemy);
      p.line(b.x, a.y, a.x, b.y, LEVEL.enemy);
      return;
    }
    case 'neutral': {
      const k = Math.max(2, Math.floor(Math.min(w, h) / 3));
      for (const [cx, cy, dx, dy] of [
        [x0, y0, 1, 1],
        [x0 + w - 1, y0, -1, 1],
        [x0, y0 + h - 1, 1, -1],
        [x0 + w - 1, y0 + h - 1, -1, -1],
      ] as const) {
        p.line(cx, cy, cx + dx * (k - 1), cy, LEVEL.neutral);
        p.line(cx, cy, cx, cy + dy * (k - 1), LEVEL.neutral);
      }
      return;
    }
  }
}

function drawToken(p: Pixmap, t: MapToken, cellPx: number, ox: number, oy: number): void {
  const { x0, y0, w, h } = footprint(t, cellPx, ox, oy);
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

function drawReach(
  p: Pixmap,
  self: MapToken,
  cellPx: number,
  ox: number,
  oy: number,
  overArt: boolean,
): void {
  for (let gy = Math.floor(self.y) - 1; gy <= Math.floor(self.y + self.h); gy++) {
    for (let gx = Math.floor(self.x) - 1; gx <= Math.floor(self.x + self.w); gx++) {
      const inside = gx >= self.x && gx < self.x + self.w && gy >= self.y && gy < self.y + self.h;
      if (inside) continue;
      const cx = MAP_VIEW.x + gx * cellPx - ox + Math.floor(cellPx / 2) - 1;
      const cy = MAP_VIEW.y + gy * cellPx - oy + Math.floor(cellPx / 2) - 1;
      // Over the art: a bright dot on a dark plate, else a dim dot on the empty grid.
      if (overArt) p.fillRect(cx - 1, cy - 1, 4, 4, 0);
      p.fillRect(cx, cy, 2, 2, overArt ? LEVEL.reachArt : LEVEL.reach);
    }
  }
}

/**
 * Renders zone C.
 *
 * @param snapshot - Scene snapshot (cells), or null → frame, north mark and scale only.
 * @param opts - Zoom, viewport, scene art, pixel size, reticle and reach options.
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
    const frame = opts.art ? artFrame(snapshot, opts.art, cellPx, opts.pixelSize, ox, oy) : null;
    if (frame) drawArt(p, frame);
    else drawGrid(p, snapshot, cellPx, ox, oy);
    const self = snapshot.tokens.find((t) => t.id === snapshot.selfTokenId);
    if (opts.reach && self) drawReach(p, self, cellPx, ox, oy, frame !== null);
    if (frame) drawArtWalls(p, snapshot, frame, cellPx, ox, oy);
    else for (const w of snapshot.walls) drawWall(p, w, cellPx, ox, oy);
    const draw = frame ? drawArtToken : drawToken;
    const others = snapshot.tokens.filter((t) => t.id !== snapshot.selfTokenId);
    for (const t of others) draw(p, t, cellPx, ox, oy);
    if (self) draw(p, { ...self, kind: 'self' }, cellPx, ox, oy);
    const target = snapshot.tokens.find((t) => t.id === (opts.targetId ?? snapshot.targetId));
    if (target) {
      const c = center(target);
      const r = Math.round((Math.max(target.w, target.h) * cellPx) / 2) + 3;
      const tx = MAP_VIEW.x + Math.round(c.x * cellPx) - ox;
      const ty = MAP_VIEW.y + Math.round(c.y * cellPx) - oy;
      if (frame) {
        // Dark halo on both sides of the ring so it stays readable over busy art.
        p.circle(tx, ty, r + 1, 0);
        p.circle(tx, ty, r - 1, 0);
      }
      reticle(p, tx, ty, r, LEVEL.reticle);
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
