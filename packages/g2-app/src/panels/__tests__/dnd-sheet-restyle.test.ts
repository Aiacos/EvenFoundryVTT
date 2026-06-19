/**
 * Feature 001 D3 — D&D-sheet restyle tests.
 *
 * Two concerns:
 *  1. Canvas icon path: `paintMainTab` draws the AC/INI/VEL vitals as shared
 *     icon-dictionary glyphs (via `drawIcon`) plus their values.
 *  2. INV-1 width invariance: every restyled string-renderer row stays exactly
 *     `INNER_WIDTH` (66) code-points across content extremes (HP 7 vs 700, long
 *     name, condition overflow) and IT/EN — the glyph consolidation must not move
 *     a single column.
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { paintMainTab, renderTabContent } from '../character-sheet-tab-renderers.js';
import { IconId, iconToUnicode } from '../icon-dictionary.js';

const INNER_WIDTH = 66;

/** Code-point length (Unicode-aware — matches the renderer's width budgeting). */
const cpLen = (s: string): number => [...s].length;

/** Build a complete, valid CharacterSnapshot with optional field overrides. */
function makeSnapshot(over: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  const ability = (value: number, mod: number) => ({
    value,
    mod,
    save: mod,
    proficient: false,
    dc: 8,
  });
  const skill = (ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') => ({
    total: 0,
    ability,
    proficient: 0 as const,
    passive: 10,
  });
  return {
    actorId: 'a1',
    name: 'Shin',
    hp: 12,
    maxHp: 30,
    tempHp: 0,
    ac: 16,
    level: 5,
    class: 'Fighter',
    initiative: 3,
    speed: 30,
    conditions: [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: false },
    inventory: [],
    spells: { slots: [], spells: [] },
    abilities: {
      str: ability(16, 3),
      dex: ability(14, 2),
      con: ability(14, 2),
      int: ability(12, 1),
      wis: ability(10, 0),
      cha: ability(8, -1),
    },
    skills: {
      acr: skill('dex'),
      ani: skill('wis'),
      arc: skill('int'),
      ath: skill('str'),
      dec: skill('cha'),
      his: skill('int'),
      ins: skill('wis'),
      itm: skill('cha'),
      inv: skill('int'),
      med: skill('wis'),
      nat: skill('int'),
      prc: skill('wis'),
      prf: skill('cha'),
      per: skill('cha'),
      rel: skill('int'),
      slt: skill('dex'),
      ste: skill('dex'),
      sur: skill('wis'),
    },
    ...over,
  } as CharacterSnapshot;
}

function fakeCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const ctx = {
    fillText: vi.fn((...a: unknown[]) => calls.push({ method: 'fillText', args: a })),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: '',
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('paintMainTab — D&D vitals icons (canvas path)', () => {
  it('draws the AC/INI/VEL icon glyphs and their values', () => {
    const { ctx, calls } = fakeCtx();
    paintMainTab(
      ctx,
      makeSnapshot({ ac: 18, initiative: 3, speed: 30 }),
      {
        x: 8,
        y: 30,
        w: 560,
        h: 252,
      },
      '27px VT323',
    );
    const texts = calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));
    const joined = texts.join('|');
    // Icons rendered via drawIcon → fillText of the shared glyphs.
    expect(joined).toContain(iconToUnicode(IconId.ArmorClass)); // ⛨
    expect(joined).toContain(iconToUnicode(IconId.Initiative)); // ⚡
    expect(joined).toContain(iconToUnicode(IconId.Speed)); // ⚔
    // Values still drawn.
    expect(texts.some((t) => t.includes('18'))).toBe(true);
    expect(texts.some((t) => t.includes('+3'))).toBe(true);
    expect(texts.some((t) => t.includes('30'))).toBe(true);
  });
});

describe('INV-1 width invariance across extremes + locales (restyled tabs)', () => {
  const extremes: ReadonlyArray<readonly [string, CharacterSnapshot]> = [
    ['hp 7/7', makeSnapshot({ hp: 7, maxHp: 7 })],
    ['hp 700/700', makeSnapshot({ hp: 700, maxHp: 700 })],
    ['long name', makeSnapshot({ name: 'Aurelio Vandermeer di Castelpietra il Terzo' })],
    [
      'condition overflow',
      makeSnapshot({
        conditions: ['prone', 'poisoned', 'frightened', 'blinded', 'grappled', 'restrained'],
      }),
    ],
  ];

  for (const tab of ['main', 'skills', 'inventory', 'spells'] as const) {
    for (const locale of ['it', 'en'] as const) {
      for (const [label, snap] of extremes) {
        it(`${tab}/${locale}/${label}: every row is exactly ${INNER_WIDTH} code-points`, () => {
          const rows = renderTabContent(tab, snap, locale, 0);
          for (const row of rows) {
            expect(cpLen(row)).toBe(INNER_WIDTH);
          }
        });
      }
    }
  }
});
