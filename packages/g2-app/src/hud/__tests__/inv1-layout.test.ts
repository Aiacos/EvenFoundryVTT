/**
 * INV-1 layout integrity for the thirds HUD (docs/design/g2-thirds-layout.md M01–M11):
 * every state × IT/EN × min/max content keeps the same column boundaries, every line
 * fits its region's pixel budget, line counts never exceed region capacity, and only
 * firmware-font glyphs are emitted.
 *
 * @see Specs.md §7.1a
 */
import { getAdvW, getTextWidth } from '@evenrealities/pretext';
import {
  type AsciiGrid,
  columnBoundaries,
  frameColumns,
  matchAsciiFixture,
  RULE,
} from '@evf/shared-render';
import { describe, expect, it } from 'vitest';
import { type MockState, mockStates, type Variant } from '../../demo/fixtures.js';
import { type HudLocale, strings } from '../i18n.js';
import { TEXT, type TextContent, type TextRegion } from '../layout.js';
import { glyphMapLines } from '../map/glyph-map.js';
import { renderPixelMap } from '../map/pixel-map.js';
import { layoutModeFor, renderTexts } from '../view.js';

const COL_CHARS = 46;
/** Relative to this test file (toMatchFileSnapshot resolves against the test path). */
const FIXTURES = '../../../../shared-render/src/fixtures/';

function lines(c: TextContent | undefined, n: number): string[] {
  const out = c ? c.content.split('\n') : [];
  while (out.length < n) out.push('');
  return out;
}

function render(m: MockState, locale: HudLocale) {
  const mode = layoutModeFor(m.app, false);
  const texts = renderTexts(mode, {
    app: m.app,
    ui: m.ui,
    strings: strings(locale),
    now: 2_000,
    glyphMap: [],
  });
  return { mode, texts };
}

function grid(m: MockState, locale: HudLocale): AsciiGrid {
  const { mode, texts } = render(m, locale);
  if (mode === 'full') return frameColumns([lines(texts.full, TEXT.full.lines)], COL_CHARS * 3 + 2);
  const map = m.app.map
    ? glyphMapLines(renderPixelMap(m.app.map, { cellPx: m.app.settings.mapCellPx, follow: true }))
    : [];
  return frameColumns(
    [
      [...lines(texts.aHead, TEXT.aHead.lines), RULE, ...lines(texts.aBody, TEXT.aBody.lines)],
      map,
      [
        ...lines(texts.cHead, TEXT.cHead.lines),
        RULE,
        ...lines(texts.cBody, TEXT.cBody.lines),
        RULE,
        ...lines(texts.cFoot, TEXT.cFoot.lines),
      ],
    ],
    COL_CHARS,
  );
}

const MATRIX: Array<[HudLocale, Variant]> = [
  ['it', 'min'],
  ['it', 'max'],
  ['en', 'min'],
  ['en', 'max'],
];

describe('INV-1 thirds layout', () => {
  it('keeps identical column boundaries across M01–M11 × IT/EN × min/max', () => {
    const thirds = new Set<string>();
    const full = new Set<string>();
    for (const [loc, v] of MATRIX) {
      for (const m of mockStates(v)) {
        const g = grid(m, loc);
        const key = JSON.stringify(columnBoundaries(g));
        (m.id === 'M09' || m.id === 'M10' ? full : thirds).add(key);
        expect(g.width).toBe(COL_CHARS * 3 + 4);
      }
    }
    expect(thirds.size).toBe(1);
    expect(full.size).toBe(1);
  });

  it('fits every line in its pixel budget and region capacity, with font-present glyphs only', () => {
    for (const [loc, v] of MATRIX) {
      for (const m of mockStates(v)) {
        const { texts } = render(m, loc);
        for (const [region, c] of Object.entries(texts) as [TextRegion, TextContent][]) {
          const spec = TEXT[region];
          const ls = c.content.split('\n');
          expect(ls.length, `${m.id} ${loc} ${v} ${region}`).toBeLessThanOrEqual(spec.lines);
          for (const l of ls) {
            expect(getTextWidth(l), `${m.id} ${loc} ${v} ${region}: ${l}`).toBeLessThanOrEqual(
              spec.budgetPx,
            );
            for (const ch of l) {
              expect(ch === ' ' || getAdvW(ch.codePointAt(0) ?? 0) > 0, `glyph ${ch} in ${l}`).toBe(
                true,
              );
            }
          }
          expect(c.content.length).toBeLessThanOrEqual(1000);
        }
      }
    }
  });

  it('uses the full-screen layout only for M09/M10', () => {
    for (const m of mockStates('min')) {
      expect(render(m, 'it').mode).toBe(m.id === 'M09' || m.id === 'M10' ? 'full' : 'thirds');
    }
  });

  it('truncates long content with an ellipsis instead of overflowing', () => {
    const m01 = mockStates('max')[0];
    if (!m01) throw new Error('fixture');
    const aHead = render(m01, 'it').texts.aHead?.content ?? '';
    expect(aHead.split('\n')[0]).toMatch(/…$/);
  });

  for (const [loc, v] of [
    ['it', 'min'],
    ['en', 'max'],
  ] as Array<[HudLocale, Variant]>) {
    for (const m of mockStates(v)) {
      it(`matches the ${m.id} ${loc} ${v} fixture`, async () => {
        await matchAsciiFixture(
          grid(m, loc),
          `${FIXTURES}thirds.${m.id.toLowerCase()}.${loc}.${v}.txt`,
        );
      });
    }
  }
});
