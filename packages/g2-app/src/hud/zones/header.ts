/**
 * Zone B — header «Intestazione», 288 × 144 (docs/design/g2-sheet-ux.html `header()`):
 * name + inspiration star, class line, CA shield, PF box (heart, big current, /max,
 * TEMP badge, bar), mini boxes INIZ · VEL · COMP, and a bottom row with the action
 * economy (combat) and the condition chips. `▲ TUO TURNO` chip on the player's turn.
 *
 * Every element has a fixed rectangle (INV-1): variable content is fitted into it
 * (names truncated with `…`, PF digits fall back to the medium face, chips that do not
 * fit collapse into a `+N` chip).
 */
import {
  boot,
  d20,
  disc,
  drawText,
  economyMark,
  fitText,
  heart,
  hourglass,
  LABEL_FONT,
  LARGE_FONT,
  MEDIUM_FONT,
  measure,
  Pixmap,
  shield,
  skull,
  star,
} from '@evf/shared-render';
import type { HudStrings } from '../i18n.js';
import type { Chip, SheetModel } from '../model.js';

const HEADER_W = 288;
const HEADER_H = 144;

/** Fixed geometry (INV-1: identical in every state). */
export const HEADER_BOX = {
  name: { x: 8, y: 7, maxW: 86 },
  star: { cx: 104, cy: 12 },
  turnChip: { x: 176, y: 4, w: 106, h: 18 },
  ac: { x: 8, y: 46, w: 46, h: 54 },
  hp: { x: 62, y: 46, w: 150, h: 54 },
  minis: { x: 218, y: 46, w: 64, h: 16, pitch: 18 },
  rules: [40, 106],
  bottomY: 113,
} as const;

/** Economy slot widths (fixed so the movement block never moves between locales). */
const ECONOMY_SLOTS = [32, 36, 36] as const;
const MOVE_W = 52;

function nameRow(p: Pixmap, m: SheetModel, s: HudStrings): void {
  const b = HEADER_BOX.name;
  drawText(p, MEDIUM_FONT, fitText(MEDIUM_FONT, m.name, b.maxW, true), b.x, b.y, 15, 'left', true);
  star(p, HEADER_BOX.star.cx, HEADER_BOX.star.cy, 6, m.inspiration ? 15 : 6, m.inspiration);
  const chip = HEADER_BOX.turnChip;
  if (m.turn?.mine) {
    p.roundRect(chip.x, chip.y, chip.w, chip.h, 3, 15, 15);
    const label = fitText(LABEL_FONT, `▲ ${s.yourTurn} · R${m.turn.round}`, chip.w - 8);
    drawText(p, LABEL_FONT, label, chip.x + chip.w / 2, chip.y + 6, 0, 'center');
  } else if (m.turn) {
    const label = fitText(LABEL_FONT, `${s.turnOf}: ${m.turn.current}`, 150);
    drawText(p, LABEL_FONT, label, 280, 10, 8, 'right');
  }
  drawText(p, LABEL_FONT, fitText(LABEL_FONT, m.sub, 272), 8, 27, 8);
}

function acShield(p: Pixmap, m: SheetModel, s: HudStrings): void {
  const b = HEADER_BOX.ac;
  shield(p, b.x, b.y, b.w, b.h, 12, 1);
  const cx = b.x + Math.floor(b.w / 2);
  drawText(p, LABEL_FONT, s.ac, cx, b.y + 7, 9, 'center');
  const value = String(m.ac);
  const font = measure(LARGE_FONT, value) <= b.w - 12 ? LARGE_FONT : MEDIUM_FONT;
  drawText(p, font, value, cx, font === LARGE_FONT ? b.y + 22 : b.y + 26, 15, 'center');
}

function hpBox(p: Pixmap, m: SheetModel, s: HudStrings): void {
  const b = HEADER_BOX.hp;
  const down = m.hp <= 0;
  p.roundRect(b.x, b.y, b.w, b.h, 4, down ? 15 : 8, down ? 2 : null);
  heart(p, b.x + 6, b.y + 5, 10, down ? 15 : 12);
  drawText(p, LABEL_FONT, s.hitPoints, b.x + 20, b.y + 6, 9);
  // Current HP: large digits while they fit before the TEMP badge, else the medium face.
  const hasTemp = m.temp > 0 && !down;
  const room = (hasTemp ? 96 : 134) - 4;
  const cur = String(m.hp);
  const max = `/${m.hpMax}`;
  const large = measure(LARGE_FONT, cur) + 2 + measure(MEDIUM_FONT, max) <= room;
  const x = b.x + 10;
  if (large) {
    const w = drawText(p, LARGE_FONT, cur, x, b.y + 24, 15);
    drawText(p, MEDIUM_FONT, max, x + w + 2, b.y + 30, 10);
  } else {
    const w = drawText(
      p,
      MEDIUM_FONT,
      fitText(MEDIUM_FONT, cur, room),
      x,
      b.y + 28,
      15,
      'left',
      true,
    );
    drawText(p, MEDIUM_FONT, fitText(MEDIUM_FONT, max, room - w - 2), x + w + 2, b.y + 28, 10);
  }
  if (hasTemp) {
    p.roundRect(b.x + 106, b.y + 22, 38, 18, 3, 11);
    const t = fitText(LABEL_FONT, `+${m.temp}`, 34);
    drawText(p, LABEL_FONT, t, b.x + 125, b.y + 24, 13, 'center');
    drawText(p, LABEL_FONT, s.temp, b.x + 125, b.y + 32, 9, 'center');
  }
  const barW = 138;
  const frac = m.hpMax > 0 ? Math.min(1, Math.max(0, m.hp / m.hpMax)) : 0;
  p.fillRect(b.x + 6, b.y + 45, barW, 4, 3);
  p.fillRect(b.x + 6, b.y + 45, Math.round(barW * frac), 4, frac < 0.34 ? 15 : 12);
}

function minis(p: Pixmap, m: SheetModel, s: HudStrings): void {
  const b = HEADER_BOX.minis;
  const rows: Array<[string, string, 'd20' | 'boot' | 'prof']> = [
    [s.initiativeShort, m.init, 'd20'],
    [s.speedShort, m.speed, 'boot'],
    [s.profShort, m.prof, 'prof'],
  ];
  rows.forEach(([label, value, icon], i) => {
    const y = b.y + i * b.pitch;
    p.roundRect(b.x, y, b.w, b.h, 3, 6);
    if (icon === 'd20') d20(p, b.x + 9, y + 8, 5.5, 10);
    else if (icon === 'boot') boot(p, b.x + 2, y + 2, 10);
    else disc(p, b.x + 9, y + 8, 4.5, 10, true);
    const v = fitText(MEDIUM_FONT, value, 22);
    const vw = measure(MEDIUM_FONT, v);
    drawText(p, LABEL_FONT, fitText(LABEL_FONT, label, b.w - 22 - vw), b.x + 18, y + 5, 8);
    drawText(p, MEDIUM_FONT, v, b.x + 60, y + 3, 14, 'right');
  });
}

function chipWidth(c: Chip): number {
  return measure(LABEL_FONT, c.label) + 22;
}

function drawChip(p: Pixmap, c: Chip, x: number, w: number): void {
  const y = HEADER_BOX.bottomY;
  const bad = c.kind === 'bad';
  p.roundRect(x, y, w, 18, 9, bad ? 15 : 9);
  if (c.kind === 'conc') hourglass(p, x + 6, y + 3, 12);
  else if (bad) skull(p, x + 4, y + 3, 14);
  else star(p, x + 10, y + 9, 4, 12, true);
  drawText(p, LABEL_FONT, fitText(LABEL_FONT, c.label, w - 22), x + 18, y + 6, bad ? 15 : 11);
}

function bottomRow(p: Pixmap, m: SheetModel, s: HudStrings): void {
  const y = HEADER_BOX.bottomY;
  let x = 8;
  if (m.economy) {
    const labels = [s.economyShort.action, s.economyShort.bonus, s.economyShort.reaction];
    (['a', 'b', 'r'] as const).forEach((kind, i) => {
      const on = m.economy?.[i] === true;
      economyMark(p, kind, x, y + 3, on ? 15 : 6, on);
      drawText(p, LABEL_FONT, labels[i] ?? '', x + 13, y + 6, on ? 12 : 6);
      x += ECONOMY_SLOTS[i] ?? 36;
    });
    boot(p, x, y + 1, 10);
    drawText(
      p,
      LABEL_FONT,
      fitText(LABEL_FONT, `${m.moveFt} ${s.ft}`, MOVE_W - 17),
      x + 15,
      y + 6,
      11,
    );
    x += MOVE_W;
    p.vline(x - 4, y - 1, y + 19, 3);
  }
  const right = 284;
  if (m.chips.length === 0) {
    drawText(p, LABEL_FONT, fitText(LABEL_FONT, s.noConditions, right - x), x, y + 6, 6);
    return;
  }
  for (let i = 0; i < m.chips.length; i++) {
    const chip = m.chips[i] as Chip;
    const rest = m.chips.length - i - 1;
    const reserve = rest > 0 ? measure(LABEL_FONT, `+${rest}`) + 15 : 0;
    const w = chipWidth(chip);
    if (x + w + reserve <= right) {
      drawChip(p, chip, x, w);
      x += w + 5;
      continue;
    }
    // Overflow (INV-1: never clipped): a last chip is truncated with `…`, otherwise the
    // remaining chips collapse into one `+N` chip.
    if (rest === 0 && right - x >= 40) {
      drawChip(p, chip, x, right - x);
      return;
    }
    const n = `+${rest + 1}`;
    p.roundRect(x, y, measure(LABEL_FONT, n) + 10, 18, 9, 9);
    drawText(p, LABEL_FONT, n, x + 5, y + 6, 11);
    return;
  }
}

/**
 * Renders zone B.
 *
 * @param m - Sheet model (null → empty frame rules only, before the first snapshot).
 * @param s - Locale strings.
 * @returns 288 × 144 pixmap.
 */
export function renderHeader(m: SheetModel | null, s: HudStrings): Pixmap {
  const p = new Pixmap(HEADER_W, HEADER_H);
  for (const y of HEADER_BOX.rules) p.hline(6, 282, y, 3);
  if (!m) return p;
  nameRow(p, m, s);
  acShield(p, m, s);
  hpBox(p, m, s);
  minis(p, m, s);
  bottomRow(p, m, s);
  return p;
}
