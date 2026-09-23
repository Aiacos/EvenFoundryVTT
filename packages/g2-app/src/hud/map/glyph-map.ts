/**
 * Glyph fallback for column B (design §Mappa pixelata: "se due frame consecutivi
 * falliscono, la colonna B passa in modalità glyph"). Down-samples the pixel map
 * to 12 × 10 characters; each character shows the most important element of its
 * 16 × 28.8 px block. Only font-present ASCII is used (`▓▒░` from the design mock
 * are not in the firmware font).
 */
import { LEVEL, MAP_H, MAP_W } from './pixel-map.js';

export const GLYPH_COLS = 12;
export const GLYPH_ROWS = 10;

function charFor(max: number): string {
  if (max >= LEVEL.self) return '@';
  if (max >= LEVEL.enemy) return 'g';
  if (max >= LEVEL.ally) return 'a';
  if (max >= LEVEL.neutral) return 'n';
  if (max >= LEVEL.wall) return '#';
  if (max >= 3) return '.';
  return ' ';
}

/**
 * @param pixels - 192×288 grey-4 map from `renderPixelMap`.
 * @returns {@link GLYPH_ROWS} lines of {@link GLYPH_COLS} characters.
 */
export function glyphMapLines(pixels: Uint8Array): string[] {
  const lines: string[] = [];
  for (let r = 0; r < GLYPH_ROWS; r++) {
    const y0 = Math.floor((r * MAP_H) / GLYPH_ROWS);
    const y1 = Math.floor(((r + 1) * MAP_H) / GLYPH_ROWS);
    let line = '';
    for (let col = 0; col < GLYPH_COLS; col++) {
      const x0 = Math.floor((col * MAP_W) / GLYPH_COLS);
      const x1 = Math.floor(((col + 1) * MAP_W) / GLYPH_COLS);
      let max = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) max = Math.max(max, pixels[y * MAP_W + x] ?? 0);
      }
      line += charFor(max);
    }
    lines.push(line);
  }
  return lines;
}
