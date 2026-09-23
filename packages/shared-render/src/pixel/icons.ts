/**
 * Pixel-art symbols of the paper 5e sheet, drawn for 16 green levels
 * (docs/design/g2-sheet-ux.html §Linguaggio visivo — icon sheet): shield (CA), heart
 * (PF), star (inspiration), d20 (initiative), boot (speed), hourglass (concentration),
 * skull (down / bad condition), hammer (cleric emblem), action-economy marks and the
 * map reticle. The firmware font has none of these, so they are part of the image zones.
 *
 * Geometry follows the reference canvas renderer: polygon coordinates are canvas
 * coordinates (pixel `i` spans `[i, i+1)`), circles are given by canvas centre/radius.
 */
import { cubic, type Pixmap, type Point, quadratic } from './pixmap.js';

/** Canvas-style circle: centre (cx, cy) and radius `r` in canvas coordinates. */
export function disc(
  p: Pixmap,
  cx: number,
  cy: number,
  r: number,
  level: number,
  filled: boolean,
): void {
  p.ellipse(cx - 0.5, cy - 0.5, r - 0.5, r - 0.5, level, filled);
}

/** Heater shield (CA): outline `stroke`, interior `fill` (or none). */
export function shield(
  p: Pixmap,
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: number,
  fill: number | null,
): void {
  const pts: Point[] = [
    { x, y: y + 4 },
    { x: x + w / 2, y },
    { x: x + w, y: y + 4 },
    { x: x + w, y: y + h * 0.5 },
    ...quadratic(
      { x: x + w, y: y + h * 0.5 },
      { x: x + w, y: y + h * 0.85 },
      { x: x + w / 2, y: y + h },
    ),
    ...quadratic({ x: x + w / 2, y: y + h }, { x, y: y + h * 0.85 }, { x, y: y + h * 0.5 }),
  ];
  if (fill !== null) p.fillPolygon(pts, fill);
  // Stroke inset by half a pixel so the outline stays inside the w × h box.
  const inner = pts.map((q) => ({
    x: Math.min(x + w - 1, Math.max(x, q.x - (q.x > x + w / 2 ? 1 : 0))),
    y: Math.min(y + h - 1, q.y),
  }));
  p.strokePolygon(inner, stroke);
}

/** Heart (PF) in an `s × s` box. */
export function heart(p: Pixmap, x: number, y: number, s: number, level: number): void {
  const bottom = { x: x + s / 2, y: y + s * 0.9 };
  const notch = { x: x + s / 2, y: y + s * 0.25 };
  p.fillPolygon(
    [
      bottom,
      ...cubic(
        bottom,
        { x: x - s * 0.2, y: y + s * 0.45 },
        { x: x + s * 0.1, y: y - s * 0.1 },
        notch,
      ),
      ...cubic(
        notch,
        { x: x + s * 0.9, y: y - s * 0.1 },
        { x: x + s * 1.2, y: y + s * 0.45 },
        bottom,
      ),
    ],
    level,
  );
}

/** Five-pointed star (inspiration) of outer radius `r`. */
export function star(
  p: Pixmap,
  cx: number,
  cy: number,
  r: number,
  level: number,
  filled: boolean,
): void {
  const pts: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  if (filled) p.fillPolygon(pts, level);
  else p.strokePolygon(pts, level);
}

/** d20 (initiative): hexagon with an inner triangle. */
export function d20(p: Pixmap, cx: number, cy: number, r: number, level: number): void {
  const ring = (n: number, rad: number): Point[] =>
    Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { x: cx - 0.5 + Math.cos(a) * rad, y: cy - 0.5 + Math.sin(a) * rad };
    });
  p.strokePolygon(ring(6, r), level);
  p.strokePolygon(ring(3, r * 0.62), level);
}

/** Boot (speed), 13 × 12. */
export function boot(p: Pixmap, x: number, y: number, level: number): void {
  p.fillRect(x + 3, y, 5, 9, level);
  p.fillRect(x + 3, y + 8, 10, 4, level);
}

/** Hourglass (concentration), 9 × 13. */
export function hourglass(p: Pixmap, x: number, y: number, level: number): void {
  p.line(x, y, x + 8, y, level);
  p.line(x, y + 12, x + 8, y + 12, level);
  p.line(x, y, x + 4, y + 6, level);
  p.line(x + 8, y, x + 4, y + 6, level);
  p.line(x + 4, y + 6, x, y + 12, level);
  p.line(x + 4, y + 6, x + 8, y + 12, level);
}

/** Skull (down / incapacitating condition), 12 × 12, eyes punched at level 0. */
export function skull(p: Pixmap, x: number, y: number, level: number): void {
  const dome: Point[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i * Math.PI) / 12;
    dome.push({ x: x + 6 + Math.cos(a) * 5.5, y: y + 5 + Math.sin(a) * 5.5 });
  }
  p.fillPolygon([...dome, { x: x + 11.5, y: y + 9 }, { x: x + 0.5, y: y + 9 }], level);
  p.fillRect(x + 3, y + 9, 6, 3, level);
  p.fillRect(x + 2, y + 5, 3, 3, 0);
  p.fillRect(x + 7, y + 5, 3, 3, 0);
}

/** War hammer (cleric emblem) in an `s × s` box. */
export function hammer(p: Pixmap, x: number, y: number, s: number, level: number): void {
  p.fillRect(
    Math.round(x + s * 0.44),
    Math.round(y + s * 0.3),
    Math.round(s * 0.12),
    Math.round(s * 0.66),
    level,
  );
  p.fillRect(
    Math.round(x + s * 0.18),
    Math.round(y + s * 0.12),
    Math.round(s * 0.64),
    Math.round(s * 0.26),
    level,
  );
}

/** Crossed sword (martial emblem) in an `s × s` box. */
export function sword(p: Pixmap, x: number, y: number, s: number, level: number): void {
  const t = Math.max(2, Math.round(s * 0.08));
  p.fillPolygon(
    [
      { x: x + s * 0.5 - t / 2, y: y + s * 0.05 },
      { x: x + s * 0.5 + t / 2, y: y + s * 0.05 },
      { x: x + s * 0.5 + t / 2, y: y + s * 0.65 },
      { x: x + s * 0.5 - t / 2, y: y + s * 0.65 },
    ],
    level,
  );
  p.fillRect(Math.round(x + s * 0.25), Math.round(y + s * 0.65), Math.round(s * 0.5), t, level);
  p.fillRect(
    Math.round(x + s * 0.5 - t / 2),
    Math.round(y + s * 0.65),
    t,
    Math.round(s * 0.28),
    level,
  );
}

/** Action-economy mark: `a` Azione ●, `b` Bonus ▲, `r` Reazione ◆ (10 × 10). */
export type EconomyKind = 'a' | 'b' | 'r';

/** Draws an action-economy mark, filled when the action is still available. */
export function economyMark(
  p: Pixmap,
  kind: EconomyKind,
  x: number,
  y: number,
  level: number,
  filled: boolean,
): void {
  if (kind === 'a') {
    disc(p, x + 5, y + 5, 5, level, filled);
    return;
  }
  const pts: Point[] =
    kind === 'b'
      ? [
          { x: x + 5, y },
          { x: x + 10, y: y + 10 },
          { x, y: y + 10 },
        ]
      : [
          { x: x + 5, y },
          { x: x + 10, y: y + 5 },
          { x: x + 5, y: y + 10 },
          { x, y: y + 5 },
        ];
  if (filled) p.fillPolygon(pts, level);
  else
    p.strokePolygon(
      pts.map((q) => ({ x: Math.min(x + 9, q.x), y: Math.min(y + 9, q.y) })),
      level,
    );
}

/** Map reticle: ring of radius `r` centred on pixel (cx, cy) plus four 3 px ticks. */
export function reticle(p: Pixmap, cx: number, cy: number, r: number, level: number): void {
  p.circle(cx, cy, r, level);
  p.line(cx - r - 4, cy, cx - r - 1, cy, level);
  p.line(cx + r + 1, cy, cx + r + 4, cy, level);
  p.line(cx, cy - r - 4, cx, cy - r - 1, level);
  p.line(cx, cy + r + 1, cx, cy + r + 4, level);
}
