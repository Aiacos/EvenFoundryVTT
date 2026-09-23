/**
 * 4-bit grey framebuffer for the G2 image containers (docs/design/g2-sheet-ux.html
 * §Linguaggio visivo): one byte per pixel holding a level 0–15, row-major.
 *
 * Every primitive is integer and deterministic (no anti-aliasing, no DOM/canvas), so
 * the same code runs in the Even App WebView and in Vitest/Node and produces
 * byte-identical output — the basis of the per-zone golden fixtures (INV-1).
 *
 * Coordinate convention: a shape of size `w × h` at `(x, y)` covers the pixels
 * `x … x + w − 1` and `y … y + h − 1` (the reference renderer strokes at `x + .5`).
 * Writes outside the pixmap or the active clip rectangle are ignored.
 *
 * @see docs/design/g2-sheet-ux.html (reference canvas renderer)
 */

/** Integer point. */
export interface Point {
  x: number;
  y: number;
}

/** Highest grey level (brightest phosphor green). */
export const MAX_LEVEL = 15;

/** Clamps and rounds a level to 0–15. */
export function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
}

interface Clip {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Mutable 4-bit framebuffer. */
export class Pixmap {
  readonly data: Uint8Array;
  private clip: Clip;
  private readonly clipStack: Clip[] = [];

  /**
   * @param width - Width in pixels (> 0).
   * @param height - Height in pixels (> 0).
   * @throws Error for non-positive or non-integer sizes.
   */
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Pixmap: invalid size ${width}×${height}`);
    }
    this.data = new Uint8Array(width * height);
    this.clip = { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  }

  /** Level at (x, y); 0 outside the pixmap. */
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.data[y * this.width + x] ?? 0;
  }

  /** Sets one pixel (clipped). */
  set(x: number, y: number, level: number): void {
    const c = this.clip;
    if (x < c.x0 || y < c.y0 || x > c.x1 || y > c.y1) return;
    this.data[y * this.width + x] = level;
  }

  /** Restricts drawing to a rectangle (intersected with the current clip). */
  pushClip(x: number, y: number, w: number, h: number): void {
    this.clipStack.push(this.clip);
    const c = this.clip;
    this.clip = {
      x0: Math.max(c.x0, x),
      y0: Math.max(c.y0, y),
      x1: Math.min(c.x1, x + w - 1),
      y1: Math.min(c.y1, y + h - 1),
    };
  }

  /** Restores the clip saved by the matching {@link pushClip}. */
  popClip(): void {
    const prev = this.clipStack.pop();
    if (prev) this.clip = prev;
  }

  /** Fills `w × h` at (x, y). */
  fillRect(x: number, y: number, w: number, h: number, level: number): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, level);
  }

  /** Horizontal run from x0 to x1 inclusive. */
  hline(x0: number, x1: number, y: number, level: number): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, level);
  }

  /** Vertical run from y0 to y1 inclusive. */
  vline(x: number, y0: number, y1: number, level: number): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, level);
  }

  /**
   * Bresenham line; `dash` = on/off run length (the reference uses 3/3), 0 = solid.
   */
  line(x0: number, y0: number, x1: number, y1: number, level: number, dash = 0): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (let i = 0; ; i++) {
      if (dash === 0 || i % (2 * dash) < dash) this.set(x, y, level);
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

  /**
   * Rounded rectangle covering `w × h` at (x, y): 1 px stroke at `stroke` (or none when
   * null) and optional interior `fill`.
   */
  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    stroke: number | null,
    fill: number | null = null,
  ): void {
    const rad = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
    const x1 = x + w - 1;
    const y1 = y + h - 1;
    for (let yy = y; yy <= y1; yy++) {
      const inset = cornerInset(yy - y, y1 - yy, rad);
      const from = x + inset;
      const to = x1 - inset;
      if (fill !== null) this.hline(from, to, yy, fill);
      if (stroke === null) continue;
      // Edge pixels of this row, plus the run joining it to the previous/next row inset.
      const edge = Math.max(
        inset,
        yy > y ? cornerInset(yy - 1 - y, y1 - yy + 1, rad) : inset,
        yy < y1 ? cornerInset(yy + 1 - y, y1 - yy - 1, rad) : inset,
      );
      if (yy === y || yy === y1) {
        this.hline(from, to, yy, stroke);
      } else {
        this.hline(from, x + edge, yy, stroke);
        this.hline(x1 - edge, to, yy, stroke);
      }
    }
  }

  /** Square-cornered 1 px outline. */
  strokeRect(x: number, y: number, w: number, h: number, level: number): void {
    this.roundRect(x, y, w, h, 0, level);
  }

  /** Circle of radius `r` centred on (cx, cy): outline, or filled when `filled`. */
  circle(cx: number, cy: number, r: number, level: number, filled = false): void {
    this.ellipse(cx, cy, r, r, level, filled);
  }

  /**
   * Axis-aligned ellipse centred on (cx, cy) with radii `rx`, `ry` (pixels whose centre
   * lies inside the ellipse; the outline is the inside boundary of that set).
   */
  ellipse(cx: number, cy: number, rx: number, ry: number, level: number, filled = false): void {
    const inside = (x: number, y: number): boolean => {
      const nx = (x - cx) / (rx + 0.5);
      const ny = (y - cy) / (ry + 0.5);
      return nx * nx + ny * ny <= 1;
    };
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (!inside(x, y)) continue;
        const edge =
          !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        if (filled || edge) this.set(x, y, level);
      }
    }
  }

  /** Fills a polygon (even-odd rule, pixel centres). */
  fillPolygon(points: readonly Point[], level: number): void {
    if (points.length < 3) return;
    const ys = points.map((p) => p.y);
    const top = Math.floor(Math.min(...ys));
    const bottom = Math.ceil(Math.max(...ys));
    for (let y = top; y <= bottom; y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i] as Point;
        const b = points[(i + 1) % points.length] as Point;
        if (a.y <= sy !== b.y <= sy) xs.push(a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const from = Math.ceil((xs[i] as number) - 0.5);
        const to = Math.floor((xs[i + 1] as number) - 0.5);
        if (to >= from) this.hline(from, to, y, level);
      }
    }
  }

  /** Closed outline through `points` (rounded to pixels). */
  strokePolygon(points: readonly Point[], level: number): void {
    for (let i = 0; i < points.length; i++) {
      const a = points[i] as Point;
      const b = points[(i + 1) % points.length] as Point;
      this.line(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y), level);
    }
  }

  /** Copies `src` with its top-left at (x, y); level 0 is copied too (opaque blit). */
  blit(src: Pixmap, x: number, y: number): void {
    for (let yy = 0; yy < src.height; yy++) {
      for (let xx = 0; xx < src.width; xx++) this.set(x + xx, y + yy, src.get(xx, yy));
    }
  }

  /** Copy of the `w × h` region at (x, y). */
  crop(x: number, y: number, w: number, h: number): Pixmap {
    const out = new Pixmap(w, h);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) out.set(xx, yy, this.get(x + xx, y + yy));
    return out;
  }

  /** Multiplies every level in the region by `factor` (rounded) — dimming. */
  scale(factor: number, x = 0, y = 0, w = this.width, h = this.height): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, clampLevel(this.get(xx, yy) * factor));
    }
  }

  /** One hex digit (`0`–`f`) per pixel, one string per row — the golden-fixture format. */
  toHexRows(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) row += this.get(x, y).toString(16);
      rows.push(row);
    }
    return rows;
  }

  /**
   * Parses {@link toHexRows} output.
   *
   * @throws Error on ragged rows or non-hex characters.
   */
  static fromHexRows(rows: readonly string[]): Pixmap {
    const first = rows[0];
    if (first === undefined) throw new Error('Pixmap.fromHexRows: no rows');
    const p = new Pixmap(first.length, rows.length);
    rows.forEach((row, y) => {
      if (row.length !== first.length) throw new Error(`Pixmap.fromHexRows: row ${y} is ragged`);
      for (let x = 0; x < row.length; x++) {
        const v = Number.parseInt(row[x] as string, 16);
        if (Number.isNaN(v)) throw new Error(`Pixmap.fromHexRows: bad digit at ${x},${y}`);
        p.set(x, y, v);
      }
    });
    return p;
  }

  /** 32-bit FNV-1a of the pixels (change detection per zone). */
  hash(): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.data.length; i++) {
      h ^= this.data[i] ?? 0;
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
}

/** Horizontal inset of a rounded-rect row `dy` px from the top and `dyBottom` from the bottom. */
function cornerInset(dy: number, dyBottom: number, r: number): number {
  const d = Math.min(dy, dyBottom);
  if (r === 0 || d >= r) return 0;
  const t = r - d - 0.5;
  return Math.max(0, Math.round(r - Math.sqrt(Math.max(0, r * r - t * t))));
}

/** Points of a quadratic Bézier from `p0` to `p2` (control `p1`), `n` segments. */
export function quadratic(p0: Point, p1: Point, p2: Point, n = 8): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
}

/** Points of a cubic Bézier from `p0` to `p3`, `n` segments. */
export function cubic(p0: Point, p1: Point, p2: Point, p3: Point, n = 10): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}
