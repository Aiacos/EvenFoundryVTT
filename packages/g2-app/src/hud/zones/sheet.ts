/**
 * Zone D — sheet «Scheda», 288 × 144 (docs/design/g2-sheet-ux.html `sheet()`), two
 * pages plus the 0 PF state:
 * - `abilities` «Caratteristiche»: six boxes like the paper sheet (label, big modifier,
 *   score in the oval) and the passive perception / senses line;
 * - `saves` «Tiri salvezza · Abilità»: saves + the six most relevant skills with
 *   ● proficient / ◉ expertise / ○ none, values right-aligned;
 * - `death` «Tiri contro la morte»: 3 success / 3 failure circles (replaces the tabs).
 */
import {
  disc,
  drawText,
  fitText,
  LABEL_FONT,
  LARGE_FONT,
  MEDIUM_FONT,
  measure,
  Pixmap,
  skull,
} from '@evf/shared-render';
import type { HudStrings } from '../i18n.js';
import type { SheetPage } from '../input/ui-state.js';
import type { SheetModel } from '../model.js';

const SHEET_W = 288;
const SHEET_H = 144;

/** Fixed geometry (INV-1). */
const SHEET_BOX = {
  tabs: { y: 2, w: 140, h: 15, pitch: 142, rule: 18 },
  abilities: { x: 4, y: 22, w: 44, h: 100, pitch: 47 },
  savesDivider: 108,
  rows: { y: 46, pitch: 15 },
} as const;

function tabs(p: Pixmap, page: SheetPage, s: HudStrings): void {
  const t = SHEET_BOX.tabs;
  const labels: Array<[SheetPage, string]> = [
    ['abilities', s.tabs.abilities],
    ['saves', s.tabs.saves],
  ];
  labels.forEach(([key, label], i) => {
    const x = 2 + i * t.pitch;
    const active = key === page;
    if (active) p.roundRect(x, t.y, t.w, t.h, 3, 12, 12);
    const text = fitText(LABEL_FONT, label, t.w - 6);
    drawText(p, LABEL_FONT, text, x + t.w / 2, t.y + 4, active ? 0 : 7, 'center');
  });
  p.hline(2, 285, t.rule, 4);
}

function abilitiesPage(p: Pixmap, m: SheetModel): void {
  const a = SHEET_BOX.abilities;
  m.abilities.forEach((ab, i) => {
    const x = a.x + i * a.pitch;
    const cx = x + a.w / 2;
    p.roundRect(x, a.y, a.w, a.h, 5, 8);
    drawText(p, LABEL_FONT, ab.label, cx, a.y + 5, 9, 'center', true);
    const mod = measure(LARGE_FONT, ab.mod) <= a.w - 4 ? LARGE_FONT : MEDIUM_FONT;
    drawText(p, mod, ab.mod, cx, mod === LARGE_FONT ? a.y + 26 : a.y + 29, 15, 'center');
    p.ellipse(cx - 0.5, a.y + 79.5, 14.5, 9.5, 0, true);
    p.ellipse(cx - 0.5, a.y + 79.5, 14.5, 9.5, 9);
    drawText(p, MEDIUM_FONT, String(ab.score), cx, a.y + 75, 12, 'center');
  });
  drawText(p, LABEL_FONT, fitText(LABEL_FONT, m.senses, 280), 144, 131, 7, 'center');
}

function profMark(p: Pixmap, cx: number, cy: number, prof: 0 | 1 | 2): void {
  if (prof === 0) {
    disc(p, cx, cy, 4, 7, false);
    return;
  }
  disc(p, cx, cy, 4, 14, true);
  if (prof === 2) disc(p, cx, cy, 1.8, 0, true);
}

function savesPage(p: Pixmap, m: SheetModel, s: HudStrings): void {
  const r = SHEET_BOX.rows;
  drawText(p, LABEL_FONT, s.savesTitle, 8, 25, 9, 'left', true);
  m.saves.forEach((sv, i) => {
    const y = r.y + i * r.pitch;
    profMark(p, 13, y - 4, sv.prof ? 1 : 0);
    drawText(p, LABEL_FONT, sv.label, 24, y - 7, sv.prof ? 12 : 8);
    drawText(p, MEDIUM_FONT, sv.value, 96, y - 9, sv.prof ? 15 : 10, 'right');
  });
  p.vline(SHEET_BOX.savesDivider, 24, 134, 3);
  drawText(p, LABEL_FONT, s.skillsTitle, 118, 25, 9, 'left', true);
  const legendX = 118 + measure(LABEL_FONT, s.skillsTitle) + (s.skillsTitle.length + 6);
  drawText(p, LABEL_FONT, fitText(LABEL_FONT, s.profLegend, 282 - legendX), 282, 25, 6, 'right');
  m.skills.forEach((sk, i) => {
    const y = r.y + i * r.pitch;
    profMark(p, 123, y - 4, sk.prof);
    const vw = measure(MEDIUM_FONT, sk.value);
    drawText(
      p,
      LABEL_FONT,
      fitText(LABEL_FONT, sk.label, 282 - 134 - vw - 4),
      134,
      y - 7,
      sk.prof ? 12 : 8,
    );
    drawText(p, MEDIUM_FONT, sk.value, 282, y - 9, sk.prof ? 15 : 10, 'right');
  });
  drawText(p, LABEL_FONT, fitText(LABEL_FONT, m.passives, 280), 144, 136, 6, 'center');
}

function deathPage(p: Pixmap, m: SheetModel, s: HudStrings): void {
  skull(p, 10, 10, 15);
  drawText(p, LABEL_FONT, s.deathTitle, 30, 13, 15, 'left', true);
  p.hline(4, 284, 28, 4);
  const row = (label: string, n: number, y: number, level: number): void => {
    drawText(p, LABEL_FONT, fitText(LABEL_FONT, label, 120, true), 10, y - 7, level, 'left', true);
    for (let i = 0; i < 3; i++) disc(p, 150 + i * 40, y - 5, 12, level, i < n);
  };
  row(s.deathSuccess, m.death.success, 62, 13);
  row(s.deathFailure, m.death.failure, 100, 15);
  drawText(p, LABEL_FONT, fitText(LABEL_FONT, s.deathHint, 280), 144, 127, 7, 'center');
}

/**
 * Renders zone D.
 *
 * @param m - Sheet model (null → blank before the first snapshot).
 * @param page - Page to show (`death` = 0 PF state).
 * @param s - Locale strings.
 * @returns 288 × 144 pixmap.
 */
export function renderSheet(
  m: SheetModel | null,
  page: SheetPage | 'death',
  s: HudStrings,
): Pixmap {
  const p = new Pixmap(SHEET_W, SHEET_H);
  if (!m) return p;
  if (page === 'death') {
    deathPage(p, m, s);
    return p;
  }
  tabs(p, page, s);
  if (page === 'abilities') abilitiesPage(p, m);
  else savesPage(p, m, s);
  return p;
}
