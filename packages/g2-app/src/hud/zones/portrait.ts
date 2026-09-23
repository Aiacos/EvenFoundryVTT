/**
 * Zone A — portrait «Ritratto», 144 × 144 (docs/design/g2-sheet-ux.html `portrait()`):
 * the actor image (fallback token image, then the class emblem on a hatched field)
 * ordered-dithered to 16 levels inside a rounded frame, plus the level badge. The frame
 * is brightest on the player's turn; the picture is dimmed at 0 PF.
 */
import {
  disc,
  drawText,
  hammer,
  LABEL_FONT,
  MEDIUM_FONT,
  measure,
  Pixmap,
  star,
  sword,
} from '@evf/shared-render';
import type { HudStrings } from '../i18n.js';
import type { Emblem } from '../model.js';
import type { Luma } from './luma.js';

const PORTRAIT_W = 144;
const PORTRAIT_H = 144;
/** Picture area inside the frame (the decoder is asked for exactly this size). */
export const PICTURE = { x: 4, y: 4, w: 136, h: 136 } as const;
/**
 * Brightest level used by the dithered picture. Kept at mid-tone on purpose: a large
 * filled area reads brighter than its level on the G2 (area × luminance), and the
 * portrait must never out-shine the critical numbers (HP, AC, turn) drawn at 15 —
 * design principle "Prima i numeri che uccidono" (docs/design/g2-sheet-ux.html).
 */
const PICTURE_MAX = 8;
/** Picture dimming at 0 PF. */
const DOWN_DIM = 0.45;

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

export interface PortraitInput {
  /** Decoded picture (any size, drawn scaled to {@link PICTURE}), or null → emblem. */
  picture: Luma | null;
  emblem: Emblem;
  level: number;
  /** Player's turn: frame at level 15. */
  hot: boolean;
  /** 0 PF: picture dimmed. */
  down: boolean;
}

/**
 * Ordered (4×4 Bayer) dither of a luminance picture to levels 0–`max`, sampled
 * nearest-neighbour into `w × h` at (x, y).
 */
export function ditherInto(
  p: Pixmap,
  luma: Luma,
  x: number,
  y: number,
  w: number,
  h: number,
  max = PICTURE_MAX,
): void {
  for (let yy = 0; yy < h; yy++) {
    const sy = Math.min(luma.height - 1, Math.floor((yy * luma.height) / h));
    for (let xx = 0; xx < w; xx++) {
      const sx = Math.min(luma.width - 1, Math.floor((xx * luma.width) / w));
      const v = ((luma.data[sy * luma.width + sx] ?? 0) / 255) * max;
      const t = ((BAYER_4[(yy & 3) * 4 + (xx & 3)] ?? 0) + 0.5) / 16;
      p.set(x + xx, y + yy, Math.max(0, Math.min(max, Math.floor(v + t))));
    }
  }
}

function emblem(p: Pixmap, kind: Emblem): void {
  const { x, y, w, h } = PICTURE;
  // Hatched field (never an empty frame — design §Casi limite «Niente ritratto»).
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) if ((xx + yy) % 6 === 0) p.set(x + xx, y + yy, 2);
  }
  p.fillRect(x + 28, y + 24, 80, 80, 0);
  if (kind === 'hammer') hammer(p, x + 30, y + 22, 76, 11);
  else if (kind === 'sword') sword(p, x + 30, y + 22, 76, 11);
  else star(p, x + 68, y + 64, 34, 11, true);
}

/**
 * Renders zone A.
 *
 * @param input - Picture, emblem, level and state flags.
 * @param s - Locale strings (`LIV` label).
 * @returns 144 × 144 pixmap.
 */
export function renderPortrait(input: PortraitInput, s: HudStrings): Pixmap {
  const p = new Pixmap(PORTRAIT_W, PORTRAIT_H);
  const { x, y, w, h } = PICTURE;
  p.pushClip(x, y, w, h);
  if (input.picture) ditherInto(p, input.picture, x, y, w, h);
  else emblem(p, input.emblem);
  p.popClip();
  if (input.down) p.scale(DOWN_DIM, x, y, w, h);
  p.roundRect(2, 2, 140, 140, 8, input.hot ? 15 : 6);
  // Level badge (bottom-right) with a dark plate behind the «LIV» label.
  const label = s.level;
  const lw = measure(LABEL_FONT, label);
  p.fillRect(124 - Math.ceil(lw / 2) - 2, 99, lw + 4, 11, 0);
  drawText(p, LABEL_FONT, label, 124, 101, 9, 'center');
  disc(p, 124, 124, 13, 15, true);
  drawText(p, MEDIUM_FONT, String(input.level), 124, 119, 0, 'center');
  return p;
}
