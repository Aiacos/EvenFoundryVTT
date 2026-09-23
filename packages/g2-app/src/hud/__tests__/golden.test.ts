/**
 * INV-1 golden fixtures of the image zones (docs/design/g2-sheet-ux.html S1–S12):
 * every zone of every design screen is rendered by the pure view composer and compared
 * pixel-for-pixel with `packages/shared-render/src/fixtures/sheet.<zone>.<scenario>.txt`
 * (one hex digit 0–f per pixel, one line per row).
 *
 * Coverage: IT with the design content (all zones, S1–S12), EN (header + sheet, and the
 * full screens), and the `max` content variant (long names, 345/999 PF, every condition)
 * in both locales. The same states also assert that zone frames never move (INV-1).
 */
import { matchPixelFixture, type Pixmap } from '@evf/shared-render';
import { describe, expect, it } from 'vitest';
import { type MockState, mockStates, type Variant } from '../../demo/fixtures.js';
import { demoArtPicture } from '../../demo/map-art.js';
import { dwarfPortrait } from '../../demo/portrait-art.js';
import { type HudLocale, strings } from '../i18n.js';
import { buildEntries } from '../input/entries.js';
import { ZONES, type Zone } from '../layout.js';
import type { ArtState } from '../map-art/image.js';
import { collectArt } from '../map-art/layers.js';
import { effectivePage } from '../model.js';
import { fullScreenOf, layoutModeFor, renderZones } from '../view.js';
import { renderFullScreen } from '../zones/fullscreen.js';
import type { DecodeRequest } from '../zones/luma.js';
import { computeViewport } from '../zones/map.js';

/** Relative to this test file (`toMatchFileSnapshot` resolves it). */
const FIXTURES = '../../../../shared-render/src/fixtures/';
/** Clock of the fixtures (`lastSyncAt` 0 → "2 min ago"). */
const NOW = 120_000;
const PORTRAIT = dwarfPortrait();
/** Demo scene art resolved synchronously (the HUD decodes it through its cache). */
const ART = new Map<string, ArtState>();
const artLookup = (req: DecodeRequest): ArtState => {
  const key = `${req.url}|${req.width}x${req.height}`;
  let st = ART.get(key);
  if (!st) {
    const image = demoArtPicture(req);
    st = image ? { state: 'ready', image } : { state: 'failed' };
    ART.set(key, st);
  }
  return st;
};

function zonesOf(m: MockState, loc: HudLocale): Record<Zone, Pixmap> {
  const s = strings(loc);
  const target = buildEntries(m.app, m.ui, s)[m.ui.cursor]?.intent;
  const targetId =
    m.ui.view === 'target' && target?.k === 'target' && target.tokenId ? target.tokenId : undefined;
  return renderZones(
    { app: m.app, ui: m.ui, strings: s, now: NOW },
    {
      portrait: PORTRAIT,
      art: m.app.map ? collectArt(m.app.map, artLookup) : null,
      viewport: m.app.map ? computeViewport(m.app.map, m.app.settings.mapCellPx, true) : null,
      reach: m.ui.view === 'target' && m.ui.pending?.kind === 'weapon',
      ...(targetId === undefined ? {} : { targetId }),
    },
  );
}

const fixture = (zone: string, id: string, loc: HudLocale, v: Variant) =>
  `${FIXTURES}sheet.${zone}.${id.toLowerCase()}.${loc}.${v}.txt`;

interface Case {
  loc: HudLocale;
  variant: Variant;
  /** Zones compared with fixtures (full screens always are). */
  zones: readonly Zone[];
  /** Screens covered (all when omitted). */
  only?: readonly string[];
}

const CASES: readonly Case[] = [
  { loc: 'it', variant: 'min', zones: ZONES },
  { loc: 'en', variant: 'min', zones: ['header', 'sheet'] },
  { loc: 'it', variant: 'max', zones: ['header', 'sheet'], only: ['S2', 'S8', 'S9'] },
  { loc: 'en', variant: 'max', zones: ['header', 'sheet'], only: ['S2', 'S8', 'S9'] },
];

describe('golden zone fixtures (S1–S12)', () => {
  for (const c of CASES) {
    for (const m of mockStates(c.variant)) {
      if (c.only && !c.only.includes(m.id)) continue;
      it(`${m.id} ${c.loc} ${c.variant}`, async () => {
        if (layoutModeFor(m.app) === 'full') {
          if (c.variant === 'max') return;
          const screen = renderFullScreen(fullScreenOf(m.app), strings(c.loc));
          await matchPixelFixture(screen, fixture('full', m.id, c.loc, c.variant));
          return;
        }
        const zones = zonesOf(m, c.loc);
        for (const z of c.zones)
          await matchPixelFixture(zones[z], fixture(z, m.id, c.loc, c.variant));
      });
    }
  }
});

/** `1` for lit pixels of a rectangle, row-major. */
function mask(p: Pixmap, x0: number, y0: number, x1: number, y1: number): string {
  let out = '';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out += p.get(x, y) > 0 ? '1' : '0';
  return out;
}

/** Frame probes per zone: rectangles whose lit mask must be identical in every state. */
const FRAMES: Record<Zone, Array<[number, number, number, number]>> = {
  // Rules, PF box top/left border, mini boxes left/right borders.
  header: [
    [6, 40, 282, 40],
    [6, 106, 282, 106],
    [66, 46, 207, 46],
    [62, 50, 62, 95],
    [218, 49, 218, 59],
    [281, 49, 281, 95],
  ],
  // Map frame edges.
  map: [
    [5, 1, 138, 1],
    [1, 5, 1, 138],
    [142, 26, 142, 126],
    [26, 142, 126, 142],
  ],
  // Portrait frame edges (level varies with the turn, the position never does).
  portrait: [
    [10, 2, 133, 2],
    [2, 10, 2, 133],
    [141, 10, 141, 95],
  ],
  // Tab rule (tabbed pages only; the death page is checked separately).
  sheet: [[2, 18, 285, 18]],
};

describe('INV-1: zone frames never move', () => {
  const all = (['min', 'max'] as const).flatMap((v) =>
    (['it', 'en'] as const).flatMap((loc) =>
      mockStates(v)
        .filter((m) => layoutModeFor(m.app) === 'sheet')
        .map((m) => ({ m, loc, zones: zonesOf(m, loc) })),
    ),
  );

  it('keeps header, map and portrait frames identical across states × locales × content', () => {
    for (const z of ['header', 'map', 'portrait'] as const) {
      const [first, ...rest] = all;
      if (!first) throw new Error('no sheet states');
      const ref = FRAMES[z].map((r) => mask(first.zones[z], ...r));
      for (const { m, loc, zones } of rest) {
        expect(
          FRAMES[z].map((r) => mask(zones[z], ...r)),
          `${z} ${m.id} ${loc}`,
        ).toEqual(ref);
      }
    }
  });

  it('keeps the sheet tab rule and the six ability boxes in place on every tabbed page', () => {
    const tabbed = all.filter(
      ({ m }) => effectivePage(m.app.character, m.ui.sheetPage) !== 'death',
    );
    const rule = (p: Pixmap) => FRAMES.sheet.map((r) => mask(p, ...r)).join('|');
    const ref = tabbed.map(({ zones }) => rule(zones.sheet))[0];
    for (const { m, loc, zones } of tabbed) expect(rule(zones.sheet), `${m.id} ${loc}`).toBe(ref);
    const abilities = tabbed.filter(({ m }) => m.ui.sheetPage === 'abilities');
    const boxes = (p: Pixmap) =>
      Array.from({ length: 6 }, (_, i) => mask(p, 4 + i * 47, 30, 4 + i * 47, 110)).join('|');
    const refBoxes = abilities.map(({ zones }) => boxes(zones.sheet))[0];
    for (const { m, loc, zones } of abilities)
      expect(boxes(zones.sheet), `${m.id} ${loc}`).toBe(refBoxes);
  });
});
