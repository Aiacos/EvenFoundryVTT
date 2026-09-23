/**
 * Demo scene art for the crypt of the design map (fixtures `mapSnap`): a stone-floored
 * room with a rug, a table and two columns, an open door and a corridor, carved in dark
 * rock — plus round token pictures. Generated procedurally (resolution-independent, no
 * copyrighted assets) so demo mode, the golden fixtures and the simulator show the
 * pixelated map art without fetching anything. Served through the HUD's injectable
 * {@link ArtDecoder}.
 */
import type { ArtDecoder, ArtImage } from '../hud/map-art/image.js';
import type { DecodeRequest } from '../hud/zones/luma.js';
import { DEMO_MAP_URL, DEMO_TOKEN_ART } from './fixtures.js';

/** Scene size of the crypt, in cells (matches `mapSnap`). */
const SCENE_CELLS = 30;

/** Deterministic 0–1 hash noise of an integer lattice point. */
function hash(x: number, y: number, seed = 0): number {
  let h =
    (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise at (x, y) in lattice units. */
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed) + (hash(xi + 1, yi, seed) - hash(xi, yi, seed)) * sx;
  const b = hash(xi, yi + 1, seed) + (hash(xi + 1, yi + 1, seed) - hash(xi, yi + 1, seed)) * sx;
  return a + (b - a) * sy;
}

const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
  x >= x0 && x < x1 && y >= y0 && y < y1;

/** Half-thickness of the carved walls, in cells. */
const WALL = 0.28;

/** Flagstone floor: one stone per half cell pair, dark mortar joints. */
function floor(x: number, y: number): number {
  const row = Math.floor(y * 2);
  const off = row % 2 === 0 ? 0 : 0.5;
  const col = Math.floor(x * 1.5 + off);
  const fx = x * 1.5 + off - col;
  const fy = y * 2 - row;
  if (fx < 0.08 || fy < 0.1) return 70;
  return 125 + hash(col, row, 3) * 45 + (noise(x * 4, y * 4, 5) - 0.5) * 30;
}

/** Dark rock outside the dug-out area. */
function rock(x: number, y: number): number {
  return 28 + noise(x * 1.3, y * 1.3, 1) * 30 + noise(x * 5, y * 5, 2) * 14;
}

/** Wall masonry band. */
function masonry(x: number, y: number): number {
  return 175 + (noise(x * 6, y * 6, 7) - 0.5) * 40;
}

/**
 * Luminance (0–255) of the crypt at scene point (x, y) in cells.
 */
export function cryptLuma(x: number, y: number): number {
  const room = inRect(x, y, 9, 8, 16, 17);
  const corridor = inRect(x, y, 16, 11, 24, 13);
  const band = (x0: number, y0: number, x1: number, y1: number) =>
    inRect(x, y, x0 - WALL, y0 - WALL, x1 + WALL, y1 + WALL) &&
    !inRect(x, y, x0 + WALL, y0 + WALL, x1 - WALL, y1 - WALL);
  const inDoorGap = inRect(x, y, 16 - WALL, 11 + WALL, 16 + WALL, 13 - WALL);
  const wall =
    (band(9, 8, 16, 17) && !inDoorGap) ||
    (inRect(x, y, 16, 11 - WALL, 24, 11 + WALL) && !inRect(x, y, 16 - WALL, 11, 16 + WALL, 13)) ||
    inRect(x, y, 16, 13 - WALL, 24, 13 + WALL);
  if (wall) return masonry(x, y);
  if (inDoorGap) return 95 + (Math.floor(y * 6) % 2) * 25; // open door: wooden threshold
  if (!room && !corridor) return rock(x, y);
  // Columns: bright drums with a dark shadow ring.
  for (const [cx, cy] of [
    [11.15, 10],
    [11.15, 15],
  ] as const) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < 0.42) return 235 - d * 120;
    if (d < 0.55) return 20;
  }
  // Table: dark planks with a bright rim.
  if (inRect(x, y, 13.3, 15.1, 15.7, 16.5)) {
    if (!inRect(x, y, 13.4, 15.2, 15.6, 16.4)) return 215;
    return 80 + (Math.floor((x - 13.3) * 5) % 2) * 22 + noise(x * 9, y * 2, 11) * 20;
  }
  // Rug: bright border, dark field with a diamond.
  if (inRect(x, y, 10.6, 11.4, 15.4, 14.6)) {
    if (!inRect(x, y, 10.8, 11.6, 15.2, 14.4)) return 210;
    const d = Math.abs(x - 13) / 2.2 + Math.abs(y - 13) / 1.4;
    if (d > 0.92 && d < 1.02) return 190;
    return d < 0.45 ? 160 : 60 + noise(x * 8, y * 8, 13) * 18;
  }
  return floor(x, y);
}

/** Round token picture: shaded disc with a bright rim, transparent corners. */
function tokenPicture(
  width: number,
  height: number,
  base: number,
  face: (u: number, v: number) => number | null,
): ArtImage {
  const luma = new Uint8Array(width * height);
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width - 0.5;
      const v = (y + 0.5) / height - 0.5;
      const r = Math.hypot(u, v);
      if (r > 0.5) continue;
      const i = y * width + x;
      alpha[i] = 255;
      luma[i] = r > 0.42 ? 225 : (face(u, v) ?? base - r * 120);
    }
  }
  return { width, height, luma, alpha };
}

const PICTURES: Record<string, (w: number, h: number) => ArtImage> = {
  // Helmeted dwarf: bright helmet dome, dark face band, bright beard.
  thorin: (w, h) =>
    tokenPicture(w, h, 150, (u, v) =>
      v < -0.08 ? 215 : v < 0.05 ? 70 : Math.abs(u) < 0.25 ? 200 : null,
    ),
  // Hooded mage: dark hood around a pale face.
  mira: (w, h) => tokenPicture(w, h, 70, (u, v) => (Math.hypot(u, v + 0.02) < 0.18 ? 190 : null)),
  // Goblin: dark green-grey skin, bright eyes.
  goblin: (w, h) =>
    tokenPicture(w, h, 95, (u, v) =>
      Math.abs(v + 0.05) < 0.06 && Math.abs(Math.abs(u) - 0.14) < 0.06 ? 235 : null,
    ),
  // Hobgoblin: helmeted brute, bright crest.
  hobgoblin: (w, h) =>
    tokenPicture(w, h, 110, (u, v) => (Math.abs(u) < 0.06 && v < 0 ? 230 : null)),
};

/** Renders the crypt at the requested decode size (the whole 30 × 30-cell scene). */
function cryptPicture({ width, height }: DecodeRequest): ArtImage {
  const luma = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = ((x + 0.5) / width) * SCENE_CELLS;
      const cy = ((y + 0.5) / height) * SCENE_CELLS;
      luma[y * width + x] = Math.max(0, Math.min(255, Math.round(cryptLuma(cx, cy))));
    }
  }
  return { width, height, luma, alpha: new Uint8Array(width * height).fill(255) };
}

/**
 * Synchronous demo picture for a decode request, or null for unknown URLs (golden
 * fixtures resolve the art without a cache).
 */
export function demoArtPicture(req: DecodeRequest): ArtImage | null {
  if (req.url === DEMO_MAP_URL) return cryptPicture(req);
  const name = Object.entries(DEMO_TOKEN_ART).find(([, url]) => url === req.url)?.[0];
  const draw = name === undefined ? undefined : PICTURES[name];
  return draw ? draw(req.width, req.height) : null;
}

/** Decoder serving the demo scene art; any other URL fails (→ documented fallbacks). */
export const demoArtDecoder: ArtDecoder = (req) => {
  const img = demoArtPicture(req);
  return img ? Promise.resolve(img) : Promise.reject(new Error(`demo: no map art for ${req.url}`));
};
