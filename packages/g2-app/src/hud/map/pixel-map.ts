/**
 * Pixelated map renderer — column B (docs/design/g2-thirds-layout.md §Mappa pixelata).
 *
 * Pure: `(MapSnapshot, options) → Uint8Array` of 192×288 grey-4 levels (0–15, one
 * byte per pixel, row-major). Palette:
 *
 * | Element | Level |
 * |---|---|
 * | scene background (ordered dither) | 0–5 |
 * | grid dots (no background image) | 2 |
 * | wall / door (dashed) | 9 |
 * | neutral token | 10 |
 * | ally token | 12 |
 * | enemy token (dark cross) | 13 |
 * | own token (ring + core) / target reticle | 15 |
 *
 * The background uses a 4×4 Bayer ordered dither anchored to **scene** pixels rather
 * than Floyd–Steinberg: the pattern stays fixed while the viewport scrolls, so
 * unchanged regions keep identical bytes (tile hashes stay stable, no shimmer).
 * The own token does not blink (design: 15/11 per frame) because blinking would
 * force a full map resend every frame over a 10–30 KB/s BLE link.
 */
import type { MapSnapshot, MapToken } from '@evf/shared-protocol';

export const MAP_W = 192;
export const MAP_H = 288;

export const LEVEL = {
  bgMax: 5,
  grid: 2,
  wall: 9,
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

export interface PixelMapOptions {
  /** Pixels per grid cell (settings: 6 / 8 / 12). */
  cellPx: number;
  /** Follow the own token (recenter when it leaves the middle 50 %). */
  follow: boolean;
  /** Current viewport; computed with {@link computeViewport} when omitted. */
  viewport?: Viewport;
  /** Scene background covering the whole scene (any resolution), or null. */
  background?: ImageData | null;
  /** Token to mark with the reticle (defaults to `snapshot.targetId`). */
  targetId?: string;
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
 * Computes the viewport: centred on the own token (or scene) at first, then —
 * when following — recentred only once the token leaves the middle 50 % of the view.
 *
 * @param snapshot - Scene snapshot.
 * @param cellPx - Pixels per cell.
 * @param follow - Follow-token setting.
 * @param prev - Previous viewport for the same scene and zoom, if any.
 */
export function computeViewport(
  snapshot: MapSnapshot,
  cellPx: number,
  follow: boolean,
  prev?: Viewport,
): Viewport {
  const vw = MAP_W / cellPx;
  const vh = MAP_H / cellPx;
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

class Canvas {
  readonly px = new Uint8Array(MAP_W * MAP_H);

  set(x: number, y: number, v: number): void {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    this.px[y * MAP_W + x] = v;
  }

  rect(x0: number, y0: number, x1: number, y1: number, v: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, v);
  }

  outline(x0: number, y0: number, x1: number, y1: number, v: number): void {
    for (let x = x0; x <= x1; x++) {
      this.set(x, y0, v);
      this.set(x, y1, v);
    }
    for (let y = y0; y <= y1; y++) {
      this.set(x0, y, v);
      this.set(x1, y, v);
    }
  }

  /** Bresenham line; `dashed` plots 2 on / 2 off. */
  line(x0: number, y0: number, x1: number, y1: number, v: number, dashed: boolean): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (let i = 0; ; i++) {
      if (!dashed || i % 4 < 2) this.set(x, y, v);
      if (x === x1 && y === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Midpoint circle outline. */
  circle(cx: number, cy: number, r: number, v: number): void {
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      for (const [px, py] of [
        [x, y],
        [y, x],
        [-y, x],
        [-x, y],
        [-x, -y],
        [-y, -x],
        [y, -x],
        [x, -y],
      ] as const) {
        this.set(cx + px, cy + py, v);
      }
      y++;
      if (err < 0) err += 2 * y + 1;
      else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }
}

function drawBackground(
  c: Canvas,
  snap: MapSnapshot,
  cellPx: number,
  ox: number,
  oy: number,
  bg: ImageData | null,
): void {
  const sceneW = snap.cols * cellPx;
  const sceneH = snap.rows * cellPx;
  const dim = 1 - 0.7 * snap.darkness;
  for (let y = 0; y < MAP_H; y++) {
    const sy = y + oy;
    if (sy < 0 || sy >= sceneH) continue;
    for (let x = 0; x < MAP_W; x++) {
      const sx = x + ox;
      if (sx < 0 || sx >= sceneW) continue;
      if (!bg) {
        if (sx % cellPx === 0 && sy % cellPx === 0) c.set(x, y, LEVEL.grid);
        continue;
      }
      const bx = Math.min(bg.width - 1, Math.floor((sx / sceneW) * bg.width));
      const by = Math.min(bg.height - 1, Math.floor((sy / sceneH) * bg.height));
      const i = (by * bg.width + bx) * 4;
      const lum =
        0.299 * (bg.data[i] ?? 0) + 0.587 * (bg.data[i + 1] ?? 0) + 0.114 * (bg.data[i + 2] ?? 0);
      const threshold = ((BAYER_4[(sy & 3) * 4 + (sx & 3)] ?? 0) + 0.5) / 16;
      c.set(x, y, Math.min(LEVEL.bgMax, Math.floor((lum / 255) * dim * LEVEL.bgMax + threshold)));
    }
  }
}

function drawToken(c: Canvas, t: MapToken, cellPx: number, ox: number, oy: number): void {
  const x0 = Math.round(t.x * cellPx) - ox;
  const y0 = Math.round(t.y * cellPx) - oy;
  const x1 = Math.round((t.x + t.w) * cellPx) - ox - 1;
  const y1 = Math.round((t.y + t.h) * cellPx) - oy - 1;
  switch (t.kind) {
    case 'self':
      c.outline(x0, y0, x1, y1, LEVEL.self);
      c.rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, LEVEL.self);
      return;
    case 'ally':
      c.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, LEVEL.ally);
      return;
    case 'enemy':
      c.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, LEVEL.enemy);
      c.line(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 0, false);
      c.line(x0 + 1, y1 - 1, x1 - 1, y0 + 1, 0, false);
      return;
    case 'neutral':
      c.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, LEVEL.neutral);
      return;
  }
}

function drawReticle(c: Canvas, t: MapToken, cellPx: number, ox: number, oy: number): void {
  const { x, y } = center(t);
  const cx = Math.round(x * cellPx) - ox;
  const cy = Math.round(y * cellPx) - oy;
  const r = Math.round((Math.max(t.w, t.h) * cellPx) / 2) + 2;
  c.circle(cx, cy, r, LEVEL.reticle);
  c.line(cx - r - 3, cy, cx - r, cy, LEVEL.reticle, false);
  c.line(cx + r, cy, cx + r + 3, cy, LEVEL.reticle, false);
  c.line(cx, cy - r - 3, cx, cy - r, LEVEL.reticle, false);
  c.line(cx, cy + r, cx, cy + r + 3, LEVEL.reticle, false);
}

/**
 * Renders the 192×288 grey-4 map.
 *
 * @param snapshot - Scene snapshot (cells).
 * @param opts - Zoom, follow, viewport, background and target override.
 * @returns 55 296 bytes, one grey level (0–15) per pixel, row-major.
 */
export function renderPixelMap(snapshot: MapSnapshot, opts: PixelMapOptions): Uint8Array {
  const { cellPx } = opts;
  const vp = opts.viewport ?? computeViewport(snapshot, cellPx, opts.follow);
  const ox = Math.round(vp.x * cellPx);
  const oy = Math.round(vp.y * cellPx);
  const c = new Canvas();
  drawBackground(c, snapshot, cellPx, ox, oy, opts.background ?? null);
  for (const w of snapshot.walls) {
    const [x1, y1, x2, y2] = w.c;
    c.line(
      Math.round(x1 * cellPx) - ox,
      Math.round(y1 * cellPx) - oy,
      Math.round(x2 * cellPx) - ox,
      Math.round(y2 * cellPx) - oy,
      LEVEL.wall,
      w.door === true,
    );
  }
  const others = snapshot.tokens.filter((t) => t.id !== snapshot.selfTokenId);
  const self = snapshot.tokens.filter((t) => t.id === snapshot.selfTokenId);
  for (const t of [...others, ...self]) {
    drawToken(c, t.id === snapshot.selfTokenId ? { ...t, kind: 'self' } : t, cellPx, ox, oy);
  }
  const targetId = opts.targetId ?? snapshot.targetId;
  const target = snapshot.tokens.find((t) => t.id === targetId);
  if (target) drawReticle(c, target, cellPx, ox, oy);
  return c.px;
}
