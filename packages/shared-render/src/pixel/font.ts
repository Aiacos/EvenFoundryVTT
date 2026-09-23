/**
 * Bitmap text for the image zones: three faces built from {@link LABEL_ROWS},
 * {@link MEDIUM_ROWS} and {@link LARGE_ROWS}, pixel-exact measurement, drawing and
 * width fitting with `…` (INV-1: every string is width-budgeted, never best-effort).
 *
 * Text normalisation ({@link normalize}): upper-case (all faces are caps-only), then any
 * character without a glyph falls back to its unaccented base letter (NFD), else `?`.
 * Accented capitals À È É Ì Ò Ù (and Á Í Ó Ú) are composed from the base letter plus a
 * 2 px accent drawn 3 rows above the cap height — callers leave that headroom.
 *
 * @see docs/design/g2-sheet-ux.html §Linguaggio visivo (type scale)
 */
import { type GlyphRows, LABEL_ROWS, LARGE_ROWS, MEDIUM_ROWS } from './font-data.js';
import type { Pixmap } from './pixmap.js';

/** One glyph: ink rows (`#`), top offset relative to the cap line (negative = above). */
export interface Glyph {
  readonly w: number;
  readonly top: number;
  readonly rows: readonly string[];
}

/** A bitmap face. */
export interface BitmapFont {
  readonly name: string;
  /** Cap / digit height in pixels. */
  readonly height: number;
  /** Blank columns between glyphs. */
  readonly gap: number;
  readonly glyphs: ReadonlyMap<string, Glyph>;
}

const GRAVE = ['#.', '.#'];
const ACUTE = ['.#', '#.'];
const ACCENTED: Readonly<Record<string, readonly [string, readonly string[]]>> = {
  À: ['A', GRAVE],
  Á: ['A', ACUTE],
  È: ['E', GRAVE],
  É: ['E', ACUTE],
  Ì: ['I', GRAVE],
  Í: ['I', ACUTE],
  Ò: ['O', GRAVE],
  Ó: ['O', ACUTE],
  Ù: ['U', GRAVE],
  Ú: ['U', ACUTE],
};
/** Rows between the top of an accent and the cap line. */
const ACCENT_RISE = 3;

function build(name: string, table: GlyphRows, height: number, gap: number): BitmapFont {
  const glyphs = new Map<string, Glyph>();
  for (const [ch, rows] of Object.entries(table)) {
    const w = rows[0]?.length ?? 0;
    if (rows.length !== height || rows.some((r) => r.length !== w)) {
      throw new Error(`font ${name}: glyph ${JSON.stringify(ch)} is not ${height} rows × ${w}`);
    }
    glyphs.set(ch, { w, top: 0, rows });
  }
  for (const [ch, [base, accent]] of Object.entries(ACCENTED)) {
    const g = glyphs.get(base);
    if (!g) continue;
    const left = Math.floor((g.w - 2) / 2);
    const accentRows = accent.map((r) => '.'.repeat(left) + r + '.'.repeat(g.w - 2 - left));
    const pad = Array<string>(ACCENT_RISE - accent.length).fill('.'.repeat(g.w));
    glyphs.set(ch, { w: g.w, top: -ACCENT_RISE, rows: [...accentRows, ...pad, ...g.rows] });
  }
  return { name, height, gap, glyphs };
}

/** Labels, legends, chips (7 px caps). */
export const LABEL_FONT = build('label', LABEL_ROWS, 7, 1);
/** Secondary values, names, scores (10 px caps and digits). */
export const MEDIUM_FONT = build('medium', MEDIUM_ROWS, 10, 1);
/** Critical digits: CA, PF, modifiers (16 px digits, `+ - /`). */
export const LARGE_FONT = build('large', LARGE_ROWS, 16, 2);

/**
 * Upper-cases `text` and maps characters the face lacks to their NFD base letter or
 * `?`. Newlines/tabs become spaces.
 */
export function normalize(font: BitmapFont, text: string): string {
  let out = '';
  for (const raw of text.replace(/[\t\r\n]+/g, ' ').toUpperCase()) {
    if (font.glyphs.has(raw)) {
      out += raw;
      continue;
    }
    const base = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += font.glyphs.has(base) ? base : '?';
  }
  return out;
}

/** Characters of `text` (after upper-casing) the face cannot draw without a fallback. */
export function missingGlyphs(font: BitmapFont, text: string): string[] {
  const missing = new Set<string>();
  for (const ch of text.replace(/[\t\r\n]+/g, ' ').toUpperCase()) {
    if (!font.glyphs.has(ch)) missing.add(ch);
  }
  return [...missing];
}

/** Pixel width of `text` in `font` (normalised). */
export function measure(font: BitmapFont, text: string): number {
  const chars = [...normalize(font, text)];
  let w = 0;
  for (const ch of chars) w += font.glyphs.get(ch)?.w ?? 0;
  return chars.length === 0 ? 0 : w + font.gap * (chars.length - 1);
}

/**
 * Truncates `text` so it measures ≤ `maxPx`, appending `…` when shortened.
 *
 * @param bold - Measure as {@link drawText} with `bold` does.
 * @returns Normalised text (possibly empty when not even `…` fits).
 */
export function fitText(font: BitmapFont, text: string, maxPx: number, bold = false): string {
  const width = (t: string): number => (bold ? measureBold(font, t) : measure(font, t));
  const clean = normalize(font, text).trimEnd();
  if (width(clean) <= maxPx) return clean;
  const ellipsis = font.glyphs.has('…') ? '…' : '.';
  const chars = [...clean];
  for (let n = chars.length - 1; n > 0; n--) {
    const candidate = `${chars.slice(0, n).join('').trimEnd()}${ellipsis}`;
    if (width(candidate) <= maxPx) return candidate;
  }
  return width(ellipsis) <= maxPx ? ellipsis : '';
}

/** Horizontal anchor of {@link drawText}. */
export type Align = 'left' | 'center' | 'right';

/**
 * Draws `text` with its cap line at `y`. `x` is the left edge, centre or right edge per
 * `align`. `bold` smears every glyph one column right (pixel bold, +1 px per glyph).
 *
 * @returns The drawn width in pixels.
 */
export function drawText(
  pix: Pixmap,
  font: BitmapFont,
  text: string,
  x: number,
  y: number,
  level: number,
  align: Align = 'left',
  bold = false,
): number {
  const chars = [...normalize(font, text)];
  const extra = bold ? chars.length : 0;
  const width = measure(font, text) + extra;
  let cx = align === 'left' ? x : align === 'center' ? x - Math.floor(width / 2) : x - width + 1;
  for (const ch of chars) {
    const g = font.glyphs.get(ch);
    if (!g) continue;
    g.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] !== '#') continue;
        pix.set(cx + rx, y + g.top + ry, level);
        if (bold) pix.set(cx + rx + 1, y + g.top + ry, level);
      }
    });
    cx += g.w + font.gap + (bold ? 1 : 0);
  }
  return width;
}

/** Width of `text` drawn bold (see {@link drawText}). */
export function measureBold(font: BitmapFont, text: string): number {
  const n = [...normalize(font, text)].length;
  return measure(font, text) + n;
}
