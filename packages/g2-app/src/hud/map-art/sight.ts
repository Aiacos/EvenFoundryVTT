/**
 * Sight mask of the map art: what the own token can see — within its sight radius and
 * not behind a sight-blocking wall. Everything else stays black so the art never
 * reveals unexplored rooms (the vector walls/markers keep their existing rules).
 *
 * Approximation (documented): a straight line-of-sight test from the token centre to
 * each block centre against the snapshot walls — no light sources, no fog-of-war
 * memory, no elevation. A wall flagged `open` (open door, sight-transparent wall) does
 * not block.
 */
import type { MapWall } from '@evf/shared-protocol';

/**
 * Sight radius (cells) when the own token carries none — vision disabled or unlimited
 * in Foundry: 12 cells = 60 ft, the common darkvision range.
 */
export const DEFAULT_SIGHT_CELLS = 12;

/** A point in cells. */
export interface CellPoint {
  x: number;
  y: number;
}

/**
 * True when the sight line `p→q` is cut by the wall `a→b`: `p` and `q` lie strictly on
 * opposite sides of the wall line, and the wall reaches the sight line (an endpoint
 * lying exactly on it counts — so a line through the joint of two walls is blocked
 * instead of leaking through the corner).
 */
export function segmentsCross(p: CellPoint, q: CellPoint, a: CellPoint, b: CellPoint): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(a, b, q);
  const d3 = cross(p, q, a);
  const d4 = cross(p, q, b);
  return d1 * d2 < 0 && d3 * d4 <= 0;
}

function cross(o: CellPoint, a: CellPoint, b: CellPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Visibility of a grid of sample points (block centres).
 *
 * @param points - Sample centres in cells, `(x0 + i·step, y0 + j·step)` for a
 *                 `cols × rows` grid.
 * @param eye - Own token centre (cells).
 * @param radius - Sight radius (cells).
 * @param walls - Snapshot walls (cells).
 * @returns `cols × rows` flags, 1 = visible.
 */
export function sightMask(
  points: { x0: number; y0: number; step: number; cols: number; rows: number },
  eye: CellPoint,
  radius: number,
  walls: readonly MapWall[],
): Uint8Array {
  const { x0, y0, step, cols, rows } = points;
  const blocking = walls.filter((w) => {
    if (w.open === true) return false;
    const [ax, ay, bx, by] = w.c;
    return (
      Math.max(ax, bx) >= eye.x - radius &&
      Math.min(ax, bx) <= eye.x + radius &&
      Math.max(ay, by) >= eye.y - radius &&
      Math.min(ay, by) <= eye.y + radius
    );
  });
  const out = new Uint8Array(cols * rows);
  const r2 = radius * radius;
  for (let j = 0; j < rows; j++) {
    const y = y0 + j * step;
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * step;
      if ((x - eye.x) ** 2 + (y - eye.y) ** 2 > r2) continue;
      const p = { x, y };
      const hidden = blocking.some((w) =>
        segmentsCross(eye, p, { x: w.c[0], y: w.c[1] }, { x: w.c[2], y: w.c[3] }),
      );
      if (!hidden) out[j * cols + i] = 1;
    }
  }
  return out;
}
