/**
 * Pixel-width budgeting for the G2 proportional firmware font.
 *
 * Every string the HUD sends is measured with `@evenrealities/pretext` (the LVGL
 * metrics of the firmware font) and truncated by **pixel width** with `…`, so a
 * line never wraps or overflows its container (INV-1).
 *
 * Glyph policy: the firmware silently drops code points it has no glyph for, and
 * pretext reports an advance width of 0 for them. {@link sanitize} removes those
 * code points before measuring, so what we measure is what the glasses draw.
 * Note: several glyphs listed as "verified" in docs/design/g2-thirds-layout.md
 * (`▮ ▯ ◉ ⚠ ✓ ✖ ⌖ ▓ ░`) have advance width 0 in pretext 0.1.4 and are therefore
 * never emitted; {@link GLYPH} holds the font-present substitutes.
 *
 * @see docs/design/g2-thirds-layout.md §Griglia e budget container
 * @see https://www.npmjs.com/package/@evenrealities/pretext (0.1.4)
 */
import { getAdvW, getTextWidth } from '@evenrealities/pretext';

/** Font-present glyphs used by the HUD (all have a non-zero pretext advance). */
export const GLYPH = {
  cursor: '▶',
  turn: '▲',
  full: '●',
  empty: '○',
  expert: '★',
  barFull: '■',
  barEmpty: '□',
  dot: '·',
  ellipsis: '…',
  arrow: '→',
  dash: '—',
} as const;

const ELLIPSIS_PX = getTextWidth(GLYPH.ellipsis);
const SPACE_PX = getTextWidth(' ');

/** Returns true when the firmware font can draw `ch` (control chars excluded). */
function isDrawable(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp === 0x20 || (cp > 0x20 && getAdvW(cp) > 0);
}

/**
 * Removes code points the firmware font cannot draw and collapses newlines/tabs
 * to spaces (callers join lines themselves).
 *
 * @param text - Arbitrary text (Foundry names are user-provided).
 * @returns Text containing only drawable glyphs.
 */
export function sanitize(text: string): string {
  let out = '';
  for (const ch of text.replace(/[\t\r\n]+/g, ' ')) {
    if (isDrawable(ch)) out += ch;
  }
  return out;
}

/**
 * Fits `text` into `maxPx`: sanitizes, then truncates by pixel width appending `…`.
 *
 * @param text - Line content (single line).
 * @param maxPx - Pixel budget (inner container width minus safety margin).
 * @returns A string whose measured width is ≤ `maxPx`.
 */
export function fit(text: string, maxPx: number): string {
  const clean = sanitize(text).trimEnd();
  if (getTextWidth(clean) <= maxPx) return clean;
  const chars = [...clean];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (getTextWidth(chars.slice(0, mid).join('')) + ELLIPSIS_PX <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '' : `${chars.slice(0, lo).join('').trimEnd()}${GLYPH.ellipsis}`;
}

/**
 * Lays out cells at fixed pixel columns: each cell is fitted to its width and padded
 * with spaces so the next cell starts as close as possible to its column (±space).
 * The last cell is fitted to its width without padding.
 *
 * @param cells - `[text, widthPx]` pairs, left to right.
 * @returns One line of text.
 */
export function row(cells: ReadonlyArray<readonly [string, number]>): string {
  let out = '';
  let target = 0;
  cells.forEach(([text, width], i) => {
    target += width;
    const cell = fit(text, width);
    out += cell;
    if (i < cells.length - 1) {
      let w = getTextWidth(out);
      while (w + SPACE_PX <= target) {
        out += ' ';
        w += SPACE_PX;
      }
      if (!out.endsWith(' ')) out += ' ';
    }
  });
  return out;
}

/**
 * Horizontal gauge of `cells` glyphs (■/□) for a 0–1 fraction; empty string when the
 * fraction is unknown.
 */
export function gauge(fraction: number | undefined, cells: number): string {
  if (fraction === undefined || !Number.isFinite(fraction)) return '';
  const clamped = Math.min(1, Math.max(0, fraction));
  const filled = clamped > 0 ? Math.max(1, Math.round(clamped * cells)) : 0;
  return GLYPH.barFull.repeat(filled) + GLYPH.barEmpty.repeat(cells - filled);
}

/**
 * Fits every line to `maxPx` and keeps at most `maxLines` lines.
 *
 * @returns The lines joined with `\n` (container content).
 */
export function block(lines: readonly string[], maxPx: number, maxLines: number): string {
  return lines
    .slice(0, maxLines)
    .map((l) => fit(l, maxPx))
    .join('\n');
}

/**
 * Returns a window of `max` items that keeps index `focus` visible (list scrolling).
 */
export function windowAround<T>(items: readonly T[], focus: number, max: number): T[] {
  if (items.length <= max) return [...items];
  const start = Math.min(Math.max(0, focus - Math.floor(max / 2)), items.length - max);
  return items.slice(start, start + max);
}

/** Formats a signed modifier: `+3`, `-1`, `+0`. */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
