/**
 * Pure pixel operations of the map art pipeline (Specs.md §7.4b.4/§7.4b.5 lineage —
 * the retired raster worker's greyscale + Floyd–Steinberg to 16 levels, now in plain
 * deterministic TS): block-average pixelation, nearest upscale, the G2 tone curve and
 * a serpentine Floyd–Steinberg dither with a mask.
 */

/**
 * Block-average downsample: every `block × block` square of `src` (`w × h`, row-major)
 * becomes one value, its mean. Partial blocks at the right/bottom edge average the
 * pixels they contain.
 *
 * @returns `ceil(w / block) × ceil(h / block)` means, row-major.
 */
export function blockAverage(
  src: ArrayLike<number>,
  w: number,
  h: number,
  block: number,
): Float32Array {
  const cols = Math.ceil(w / block);
  const rows = Math.ceil(h / block);
  const sum = new Float32Array(cols * rows);
  const count = new Uint16Array(cols * rows);
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / block) * cols;
    for (let x = 0; x < w; x++) {
      const i = row + Math.floor(x / block);
      sum[i] = (sum[i] ?? 0) + (src[y * w + x] ?? 0);
      count[i] = (count[i] ?? 0) + 1;
    }
  }
  for (let i = 0; i < sum.length; i++) sum[i] = (sum[i] ?? 0) / (count[i] || 1);
  return sum;
}

/**
 * Nearest-neighbour upscale of a `cols × rows` grid of blocks into a `w × h` picture,
 * block `(bx, by)` covering pixels `[bx·block − shiftX, …)` — the shift anchors the
 * blocks to scene pixels so they do not crawl while the view scrolls.
 */
export function upscaleNearest(
  blocks: ArrayLike<number>,
  cols: number,
  block: number,
  w: number,
  h: number,
  shiftX = 0,
  shiftY = 0,
): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = Math.floor((y + shiftY) / block) * cols;
    for (let x = 0; x < w; x++)
      out[y * w + x] = blocks[row + Math.floor((x + shiftX) / block)] ?? 0;
  }
  return out;
}

/** Tone curve of the map art on the G2 (see {@link toneLevel}). */
export interface Tone {
  /** Brightest art level: kept below the HUD's critical numbers (15) and the markers. */
  max: number;
  /** Lowest level of a lit, in-sight area (level 0–1 is invisible on the waveguide). */
  lift: number;
  /** Contrast around mid-grey (1 = unchanged). */
  contrast: number;
  /** Gamma applied after contrast (< 1 lifts the dark mid-tones typical of battle maps). */
  gamma: number;
}

/**
 * Tuned on the Even Hub simulator 0.9.5 (sim-check 01-explore / 04-target): mid-grey
 * battle-map floors land on levels 4–6, masonry and highlights on 6–9, joints and dark
 * rugs on 1–2 — the lit area reads as a room without out-shining the portrait (max 8)
 * and leaves 10–15 to the walls, token markers and HUD numbers ("Prima i numeri che
 * uccidono", docs/design/g2-sheet-ux.html).
 */
export const MAP_TONE: Tone = { max: 9, lift: 1, contrast: 1.3, gamma: 1.3 };

/**
 * Maps a luminance (0–255) to a continuous art level `lift … max`, scaled by `dim`
 * (scene darkness).
 */
export function toneLevel(lum: number, tone: Tone = MAP_TONE, dim = 1): number {
  const v = Math.min(1, Math.max(0, (lum / 255 - 0.5) * tone.contrast + 0.5));
  return (tone.lift + v ** tone.gamma * (tone.max - tone.lift)) * dim;
}

/**
 * Serpentine Floyd–Steinberg error diffusion of continuous levels to integers
 * `0 … max` (weights 7/16 · 3/16 · 5/16 · 1/16, direction alternating per row).
 *
 * @param values - `w × h` continuous levels, row-major (not modified).
 * @param mask - Optional: cells with 0 are forced to level 0 and neither receive nor
 *               spread error (out of sight / outside the scene stays pitch black).
 * @returns Quantized levels.
 */
export function ditherFS(
  values: ArrayLike<number>,
  w: number,
  h: number,
  max: number,
  mask?: ArrayLike<number>,
): Uint8Array {
  const buf = Float32Array.from(values);
  const out = new Uint8Array(w * h);
  const open = (i: number): boolean => mask === undefined || (mask[i] ?? 0) !== 0;
  const push = (x: number, y: number, e: number): void => {
    if (x < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (open(i)) buf[i] = (buf[i] ?? 0) + e;
  };
  for (let y = 0; y < h; y++) {
    const ltr = y % 2 === 0;
    const dir = ltr ? 1 : -1;
    for (let k = 0; k < w; k++) {
      const x = ltr ? k : w - 1 - k;
      const i = y * w + x;
      if (!open(i)) continue;
      const v = buf[i] ?? 0;
      const q = Math.min(max, Math.max(0, Math.round(v)));
      out[i] = q;
      const e = v - q;
      push(x + dir, y, (e * 7) / 16);
      push(x - dir, y + 1, (e * 3) / 16);
      push(x, y + 1, (e * 5) / 16);
      push(x + dir, y + 1, e / 16);
    }
  }
  return out;
}
