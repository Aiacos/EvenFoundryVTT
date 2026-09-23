/**
 * Tile composer: turns the design zones into the pixels of the real-G2 image containers
 * (the 2 × 2 grid of 288 × 144 tiles anchored at (0, 0) — see `layout.ts`).
 *
 * - `sheet` mode: zones A (portrait) + B (header) + C (map) form one 576 × 144 top band,
 *   cropped into tiles `tl` / `tr`; zone D (sheet) is tile `bl`. The result is pixel-
 *   identical to drawing each zone in its own container.
 * - `full` mode: a 576 × 288 screen split into the four tiles; the sheet HUD fallback
 *   (host rejected the `sheet` page) draws zone E's text as pixels into tile `br`.
 */
import {
  drawText,
  fitText,
  LABEL_FONT,
  MEDIUM_FONT,
  missingGlyphs,
  Pixmap,
} from '@evf/shared-render';
import {
  SCREEN_H,
  SCREEN_W,
  TEXT,
  type TextContent,
  type TextRegion,
  TILE,
  TILE_H,
  TILE_W,
  TILES,
  type Tile,
  ZONE,
  type Zone,
} from '../layout.js';

/** Tiles of the `sheet` layout. */
export type SheetTile = 'tl' | 'tr' | 'bl';

/** The top band (zones A + B + C) as one 576 × 144 framebuffer. */
export function topBand(zones: Readonly<Record<Zone, Pixmap>>): Pixmap {
  const band = new Pixmap(SCREEN_W, TILE_H);
  for (const z of ['portrait', 'header', 'map'] as const) band.blit(zones[z], ZONE[z].x, ZONE[z].y);
  return band;
}

/**
 * Composes the `sheet` tiles.
 *
 * @returns `tl` / `tr` = the halves of the top band, `bl` = zone D.
 */
export function sheetTiles(zones: Readonly<Record<Zone, Pixmap>>): Record<SheetTile, Pixmap> {
  const band = topBand(zones);
  return {
    tl: band.crop(TILE.tl.x, 0, TILE_W, TILE_H),
    tr: band.crop(TILE.tr.x, 0, TILE_W, TILE_H),
    bl: zones.sheet,
  };
}

/** Splits a 576 × 288 screen into the four 288 × 144 image tiles. */
export function splitTiles(screen: Pixmap): Array<[Tile, Pixmap]> {
  if (screen.width !== SCREEN_W || screen.height !== SCREEN_H)
    throw new Error(
      `splitTiles: expected ${SCREEN_W}×${SCREEN_H}, got ${screen.width}×${screen.height}`,
    );
  return TILES.map((t) => {
    const b = TILE[t];
    return [t, screen.crop(b.x, b.y, b.w, b.h)];
  });
}

/** Firmware-only glyphs (cursor, frames) replaced by characters of the bitmap faces. */
function drawable(text: string): string {
  const missing = new Set(missingGlyphs(MEDIUM_FONT, text));
  return [...text.replace(/▶/g, '>')]
    .map((ch) => (missing.has(ch.toUpperCase()) ? ' ' : ch))
    .join('');
}

/**
 * Zone E drawn as pixels (fallback only: the host rejected the `sheet` page, so the HUD
 * runs in the `full` 2 × 2 layout and the context text lives in tile `br`). Same lines
 * as the text containers: head, framed 3-line body, foot — at the firmware 27 px pitch.
 *
 * @returns 288 × 144 pixmap.
 */
export function contextTile(texts: Partial<Record<TextRegion, TextContent>>): Pixmap {
  const p = new Pixmap(TILE_W, TILE_H);
  const line = (region: TextRegion, i: number) =>
    (texts[region]?.content ?? '').split('\n')[i] ?? '';
  const body = TEXT.ctxBody;
  const top = (r: TextRegion) => TEXT[r].y - TILE_H;
  drawText(
    p,
    LABEL_FONT,
    fitText(LABEL_FONT, drawable(line('ctxHead', 0)), TILE_W - 12),
    6,
    top('ctxHead') + 11,
    15,
  );
  p.roundRect(2, top('ctxBody'), TILE_W - 4, body.h, 4, 5);
  for (let i = 0; i < body.lines; i++) {
    const t = fitText(MEDIUM_FONT, drawable(line('ctxBody', i)), TILE_W - 16);
    drawText(p, MEDIUM_FONT, t, 8, top('ctxBody') + 9 + i * 27, 15);
  }
  drawText(
    p,
    LABEL_FONT,
    fitText(LABEL_FONT, drawable(line('ctxFoot', 0)), TILE_W - 12),
    6,
    top('ctxFoot') + 11,
    9,
  );
  return p;
}
