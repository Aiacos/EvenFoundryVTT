/**
 * Glyph coverage: every string the image zones can draw (both locales, design and max
 * content) exists in the bitmap face that draws it — no `?` fallback on the glasses
 * (INV-1: nothing is best-effort). Firmware text (zone E) is covered by
 * `context.test.ts` via pretext.
 */
import { LABEL_FONT, LARGE_FONT, MEDIUM_FONT, missingGlyphs } from '@evf/shared-render';
import { describe, expect, it } from 'vitest';
import { character, mockStates } from '../../demo/fixtures.js';
import { type HudLocale, type HudStrings, strings } from '../i18n.js';
import { sheetModel } from '../model.js';

function labelStrings(s: HudStrings): string[] {
  const models = (['min', 'max'] as const).flatMap((v) =>
    mockStates(v).flatMap((m) => {
      const model = sheetModel(m.app, s);
      return model ? [model] : [];
    }),
  );
  return [
    s.level,
    `▲ ${s.yourTurn} · R123`,
    `${s.turnOf}: Goblin B`,
    s.hitPoints,
    s.ac,
    s.temp,
    '+120',
    s.initiativeShort,
    s.speedShort,
    s.profShort,
    ...Object.values(s.economyShort),
    `-5 ${s.ft}`,
    `5 ${s.ft}`,
    s.noConditions,
    ...Object.values(s.conditions),
    s.exhaustion(6),
    '+6',
    ...Object.values(s.abilities),
    ...Object.values(s.skills),
    s.tabs.abilities,
    s.tabs.saves,
    s.savesTitle,
    s.skillsTitle,
    s.profLegend,
    s.passivePerception(14),
    s.darkvision(60),
    s.passiveInsight(17, 10),
    s.deathTitle,
    s.deathSuccess,
    s.deathFailure,
    s.deathHint,
    s.north,
    s.unpairedSubtitle,
    s.revokedSubtitle,
    ...s.pairSteps.map(([, b]) => b),
    s.scan,
    s.exitHint,
    s.connectingTo('foundry.una-casa-molto-lontana.example.org'),
    s.cancelHint,
    ...models.flatMap((m) => [m.sub, m.senses, m.passives, ...m.chips.map((c) => c.label)]),
  ];
}

function mediumStrings(s: HudStrings): string[] {
  return [
    s.appTitle,
    ...s.pairSteps.map(([a]) => a),
    s.steps.server,
    s.steps.login('Luca (G2)'),
    s.steps.gm('Anna'),
    s.steps.character('Thorin'),
    s.steps.scene,
    character('min').name,
    character('max').name,
    '/999',
    '+10',
    '-1',
    '20',
    '1234567890',
  ];
}

describe('bitmap glyph coverage', () => {
  for (const loc of ['it', 'en'] as HudLocale[]) {
    it(`label face draws every label (${loc})`, () => {
      for (const t of labelStrings(strings(loc)))
        expect(missingGlyphs(LABEL_FONT, t), t).toEqual([]);
    });
    it(`medium face draws names, titles and connection steps (${loc})`, () => {
      for (const t of mediumStrings(strings(loc)))
        expect(missingGlyphs(MEDIUM_FONT, t), t).toEqual([]);
    });
  }

  it('large face draws every CA / PF / modifier value', () => {
    for (const t of ['0123456789', '+10', '-5', '345', '/'])
      expect(missingGlyphs(LARGE_FONT, t)).toEqual([]);
  });
});
