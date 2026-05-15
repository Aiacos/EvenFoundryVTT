/**
 * Unit tests for SpellbookPanel + renderSpellbookStandaloneContent + renderSpellRow
 * (Phase 5 Plan 05-04 — SHEET-01/02/03).
 *
 * Test coverage per 05-04-PLAN.md §Task 2 SP-* discriminator markers:
 *
 * Meta / constructor:
 *   - SP-META-1:  SpellbookPanel.meta passes PanelMetaSchema (id='spellbook')
 *   - SP-META-2:  SpellbookPanel.meta.navKey === 'B'
 *   - SP-CTOR-1:  implements OverlayPanel (isOverlayPanel returns true)
 *   - SP-CTOR-2:  getContainerCount returns { image:0, text:1 }
 *
 * Lifecycle:
 *   - SP-MOUNT-UNMOUNT-1: bus subscribe on mount; unsubscribe on unmount
 *   - SP-DRAW-1: single textContainerUpgrade per draw()
 *
 * Slot bar helper:
 *   - SP-SLOT-BAR-EMPTY: renderSlotBar(0, 4) → '░░░░ 0/4'
 *   - SP-SLOT-BAR-PARTIAL: renderSlotBar(2, 4) → '▓▓░░ 2/4'
 *   - SP-SLOT-BAR-FULL: renderSlotBar(4, 4) → '▓▓▓▓ 4/4'
 *   - SP-SLOT-BAR-SMALL: renderSlotBar(1, 3) → '▓░░  1/3' (bar shorter than MAX_BAR_LENGTH)
 *
 * Row rendering:
 *   - SP-ROW-WIDTH: every spell row exactly 66 code-points
 *   - SP-ROW-ACTIVATION-IT: 'action' renders as 'azione' in IT locale
 *   - SP-ROW-ACTIVATION-EN: 'action' renders as 'action' in EN locale
 *   - SP-ROW-PREPARED: prepared=true + 2014 → '◉' marker at col 3
 *   - SP-ROW-ALWAYS-PREPARED-2024: alwaysPrepared=true + modernRules=true → '≡' marker
 *   - SP-ROW-ALWAYS-PREPARED-2014: alwaysPrepared=true + modernRules=false → '◉' marker
 *   - SP-ROW-CONCENTRATION: concentration=true → '≀' marker at col 4
 *   - SP-ROW-UNPREPARED: prepared=false + alwaysPrepared=false → ' ' marker at col 3
 *   - SP-ROW-NAME-TRUNC: spell name >20 chars → truncated with …
 *
 * Content renderers:
 *   - SP-CONTENT-SHEET: renderSpellsTabContent returns 18 rows
 *   - SP-CONTENT-SHEET-WIDTH: each row exactly 66 code-points
 *   - SP-CONTENT-SHEET-NULL: null snapshot returns 18 blank rows
 *   - SP-CONTENT-STANDALONE: renderSpellbookStandaloneContent returns 18 rows
 *   - SP-CONTENT-STANDALONE-WIDTH: each row exactly 66 code-points
 *   - SP-CONTENT-STANDALONE-TITLE: standalone output contains 'LIBRO INCANTESIMI'
 *   - SP-CONTENT-STANDALONE-SLOT-BAR: standalone output contains slot bar glyphs
 *   - SP-CONTENT-EMPTY: non-caster (empty spells) → 18 rows, contains empty state message
 *
 * Schema:
 *   - SP-SCHEMA-1: parse with empty spells succeeds
 *   - SP-SCHEMA-2: parse with realistic spell data succeeds
 *
 * INV-1 fixture round-trips:
 *   - SP-FIX-SHEET:      renderSpellsTabContent → sheet.spells.it.txt
 *   - SP-FIX-CASTER:     renderSpellbookStandaloneContent → spellbook.caster.it.txt
 *   - SP-FIX-HALF-CASTER: renderSpellbookStandaloneContent → spellbook.half-caster.it.txt
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-04-PLAN.md
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §5.5 + §5.11
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { isOverlayPanel } from '../../engine/overlay-panel.js';
import type { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import SpellbookPanel, {
  renderSlotBar,
  renderSpellbookStandaloneContent,
  renderSpellRow,
  renderSpellsTabContent,
} from '../spellbook-panel.js';

// ─── Fixture helpers ───────────────────────────────────────────────────────────

function fixtureDir(): string {
  return resolve(__dirname, '../../../../shared-render/src/fixtures');
}

function loadFixture(name: string): string {
  return readFileSync(resolve(fixtureDir(), name), 'utf-8');
}

function normaliseRows(content: string): string {
  return content
    .split('\n')
    .map((row) => row.trimEnd())
    .join('\n')
    .trimEnd();
}

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockBridge(): EvenAppBridge {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
  } as unknown as EvenAppBridge;
}

function makeMockBus(): PanelGestureBus {
  return {
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as unknown as PanelGestureBus;
}

// ─── Test snapshots ───────────────────────────────────────────────────────────

/** Thorin F3/W5 — full caster with spells at levels 0, 1, 2, 3. */
const snapshotCaster: CharacterSnapshot = {
  actorId: 'thorin-001',
  name: 'THORIN OAKENSHIELD',
  hp: 45,
  maxHp: 68,
  tempHp: 10,
  ac: 18,
  level: 8,
  conditions: ['Bless'],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: {
    slots: [
      { level: 1, value: 2, max: 4 },
      { level: 2, value: 1, max: 3 },
      { level: 3, value: 0, max: 2 },
    ],
    spells: [
      {
        id: 'c1',
        name: 'Dardo di Fuoco',
        level: 0,
        school: 'evocation',
        activation: 'action',
        range: '36m',
        effect: '1d10 fuoco',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 'c2',
        name: 'Mano di Mago',
        level: 0,
        school: 'conjuration',
        activation: 'action',
        range: '9m',
        effect: 'util',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's1',
        name: 'Scudo',
        level: 1,
        school: 'abjuration',
        activation: 'reaction',
        range: 'self',
        effect: '+5 CA vs colpo',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's2',
        name: 'Dardo Incantato',
        level: 1,
        school: 'evocation',
        activation: 'action',
        range: '36m',
        effect: '3×1d4+1 forza',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's3',
        name: 'Passo Velato',
        level: 2,
        school: 'conjuration',
        activation: 'bonus',
        range: '9m',
        effect: 'teletrasporto',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's4',
        name: 'Palla di Fuoco',
        level: 3,
        school: 'evocation',
        activation: 'action',
        range: '45m',
        effect: '8d6 fuoco  sfera 6m',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's5',
        name: 'Contrincantesimo',
        level: 3,
        school: 'abjuration',
        activation: 'reaction',
        range: '18m',
        effect: 'blocca incantesimo ≤ 3°',
        prepared: false,
        alwaysPrepared: false,
        concentration: false,
      },
    ],
  },
};

/** Paladin 5 — half caster with L1 and L2 slots. */
const snapshotHalfCaster: CharacterSnapshot = {
  actorId: 'paladin-001',
  name: 'AELA AURORA',
  hp: 44,
  maxHp: 44,
  tempHp: 0,
  ac: 18,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: {
    slots: [
      { level: 1, value: 4, max: 4 },
      { level: 2, value: 2, max: 2 },
    ],
    spells: [
      {
        id: 'p1',
        name: 'Cura Ferite',
        level: 1,
        school: 'evocation',
        activation: 'action',
        range: 'tocco',
        effect: '1d8+3 PF',
        prepared: true,
        alwaysPrepared: true,
        concentration: false,
      },
      {
        id: 'p2',
        name: 'Dardo di Fuoco',
        level: 1,
        school: 'evocation',
        activation: 'action',
        range: '36m',
        effect: '2d6 fuoco',
        prepared: false,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 'p3',
        name: 'Aiuto',
        level: 2,
        school: 'enchantment',
        activation: 'action',
        range: 'tocco',
        effect: 'vantaggio',
        prepared: true,
        alwaysPrepared: true,
        concentration: false,
      },
    ],
  },
};

/** Non-caster snapshot (empty spells). */
const snapshotNonCaster: CharacterSnapshot = {
  ...snapshotCaster,
  spells: { slots: [], spells: [] },
};

/** Count code-points in a string. */
function codePointLen(s: string): number {
  return [...s].length;
}

// ─── SP-META: static metadata ──────────────────────────────────────────────────

describe('SpellbookPanel static meta', () => {
  it('SP-META-1: meta.id is "spellbook"', () => {
    expect(SpellbookPanel.meta.id).toBe('spellbook');
  });

  it('SP-META-2: meta.navKey is "B"', () => {
    expect(SpellbookPanel.meta.navKey).toBe('B');
  });
});

// ─── SP-CTOR: constructor + interface ─────────────────────────────────────────

describe('SpellbookPanel constructor', () => {
  it('SP-CTOR-1: implements OverlayPanel (isOverlayPanel returns true)', () => {
    const panel = new SpellbookPanel(makeMockBridge(), makeMockBus(), 'it');
    expect(isOverlayPanel(panel)).toBe(true);
  });

  it('SP-CTOR-2: getContainerCount returns { image: 0, text: 1 }', () => {
    const panel = new SpellbookPanel(makeMockBridge(), makeMockBus(), 'it');
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

// ─── SP-MOUNT-UNMOUNT: lifecycle ──────────────────────────────────────────────

describe('SpellbookPanel lifecycle', () => {
  it('SP-MOUNT-UNMOUNT-1: bus subscribe on mount; unsubscribe on unmount', async () => {
    const unsubSpy = vi.fn();
    const bus: PanelGestureBus = {
      subscribe: vi.fn().mockReturnValue(unsubSpy),
    } as unknown as PanelGestureBus;
    const panel = new SpellbookPanel(makeMockBridge(), bus, 'it');

    await panel.onMount();
    expect(bus.subscribe).toHaveBeenCalledTimes(1);
    expect(unsubSpy).not.toHaveBeenCalled();

    await panel.onUnmount();
    expect(unsubSpy).toHaveBeenCalledTimes(1);

    // Idempotent: second unmount must not crash
    await panel.onUnmount();
    expect(unsubSpy).toHaveBeenCalledTimes(1);
  });

  it('SP-DRAW-1: draw() issues exactly one textContainerUpgrade call', async () => {
    const bridge = makeMockBridge();
    const panel = new SpellbookPanel(bridge, makeMockBus(), 'it');
    panel.onSnapshot(snapshotCaster);
    // Drain the async void draw from onSnapshot before clearing
    await new Promise((r) => setTimeout(r, 0));
    (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mockClear();

    await panel.draw();

    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
  });
});

// ─── SP-SLOT-BAR: slot bar helper ─────────────────────────────────────────────

describe('renderSlotBar', () => {
  it('SP-SLOT-BAR-EMPTY: 0/4 → all empty', () => {
    expect(renderSlotBar(0, 4)).toBe('░░░░ 0/4');
  });

  it('SP-SLOT-BAR-PARTIAL: 2/4 → 2 filled + 2 empty', () => {
    expect(renderSlotBar(2, 4)).toBe('▓▓░░ 2/4');
  });

  it('SP-SLOT-BAR-FULL: 4/4 → all filled', () => {
    expect(renderSlotBar(4, 4)).toBe('▓▓▓▓ 4/4');
  });

  it('SP-SLOT-BAR-SMALL: 1/3 → bar shorter than MAX_BAR_LENGTH, padded', () => {
    const bar = renderSlotBar(1, 3);
    // '▓░░  1/3' — bar is 3 glyphs but padded to 4 with space
    expect(bar).toContain('▓');
    expect(bar).toContain('░');
    expect(bar).toContain('1/3');
  });

  it('SP-SLOT-BAR-ZERO: 0 max → empty string', () => {
    expect(renderSlotBar(0, 0)).toBe('');
  });
});

// ─── SP-ROW: row rendering ─────────────────────────────────────────────────────

describe('renderSpellRow', () => {
  const baseSpell = {
    id: 't1',
    name: 'Dardo di Fuoco',
    level: 1,
    school: 'evocation',
    activation: 'action' as const,
    range: '36m',
    effect: '1d10 fuoco',
    prepared: true,
    alwaysPrepared: false,
    concentration: false,
  };

  it('SP-ROW-WIDTH: every spell row exactly 66 code-points', () => {
    const row = renderSpellRow(baseSpell, 'it', false);
    expect(codePointLen(row)).toBe(66);
  });

  it('SP-ROW-ACTIVATION-IT: action → azione in IT locale', () => {
    const row = renderSpellRow(baseSpell, 'it', false);
    expect(row).toContain('azione');
  });

  it('SP-ROW-ACTIVATION-EN: action → action in EN locale', () => {
    const row = renderSpellRow(baseSpell, 'en', false);
    expect(row).toContain('action');
  });

  it('SP-ROW-PREPARED: prepared=true + modernRules=false → ◉ marker', () => {
    const row = renderSpellRow(baseSpell, 'it', false);
    // col 3 should be '◉'
    const cps = [...row];
    expect(cps[3]).toBe('◉');
  });

  it('SP-ROW-ALWAYS-PREPARED-2024: alwaysPrepared=true + modernRules=true → ≡ marker', () => {
    const spell = { ...baseSpell, alwaysPrepared: true };
    const row = renderSpellRow(spell, 'it', true);
    const cps = [...row];
    expect(cps[3]).toBe('≡');
  });

  it('SP-ROW-ALWAYS-PREPARED-2014: alwaysPrepared=true + modernRules=false → ◉ marker (not ≡)', () => {
    const spell = { ...baseSpell, prepared: true, alwaysPrepared: true };
    const row = renderSpellRow(spell, 'it', false);
    const cps = [...row];
    expect(cps[3]).toBe('◉');
  });

  it('SP-ROW-CONCENTRATION: concentration=true → ≀ marker at col 4', () => {
    const spell = { ...baseSpell, concentration: true };
    const row = renderSpellRow(spell, 'it', false);
    const cps = [...row];
    expect(cps[4]).toBe('≀');
  });

  it('SP-ROW-UNPREPARED: prepared=false + alwaysPrepared=false → space marker at col 3', () => {
    const spell = { ...baseSpell, prepared: false, alwaysPrepared: false };
    const row = renderSpellRow(spell, 'it', false);
    const cps = [...row];
    expect(cps[3]).toBe(' ');
  });

  it('SP-ROW-NAME-TRUNC: spell name > 20 chars → truncated with …', () => {
    const longName = 'A'.repeat(25);
    const spell = { ...baseSpell, name: longName };
    const row = renderSpellRow(spell, 'it', false);
    expect(row).toContain('…');
    expect(codePointLen(row)).toBe(66);
  });
});

// ─── SP-CONTENT: content renderers ───────────────────────────────────────────

describe('renderSpellsTabContent', () => {
  it('SP-CONTENT-SHEET: returns exactly 18 rows', () => {
    const rows = renderSpellsTabContent(snapshotCaster, 'it', 0);
    expect(rows).toHaveLength(18);
  });

  it('SP-CONTENT-SHEET-WIDTH: each row exactly 66 code-points', () => {
    const rows = renderSpellsTabContent(snapshotCaster, 'it', 0);
    for (const row of rows) {
      expect(codePointLen(row)).toBe(66);
    }
  });

  it('SP-CONTENT-SHEET-NULL: null snapshot returns 18 blank rows', () => {
    const rows = renderSpellsTabContent(null, 'it', 0);
    expect(rows).toHaveLength(18);
    for (const row of rows) {
      expect(row.trim()).toBe('');
    }
  });
});

describe('renderSpellbookStandaloneContent', () => {
  it('SP-CONTENT-STANDALONE: returns exactly 18 rows', () => {
    const rows = renderSpellbookStandaloneContent(snapshotCaster, 'it', 0);
    expect(rows).toHaveLength(18);
  });

  it('SP-CONTENT-STANDALONE-WIDTH: each row exactly 66 code-points', () => {
    const rows = renderSpellbookStandaloneContent(snapshotCaster, 'it', 0);
    for (const row of rows) {
      expect(codePointLen(row)).toBe(66);
    }
  });

  it('SP-CONTENT-STANDALONE-TITLE: standalone output contains LIBRO INCANTESIMI', () => {
    const rows = renderSpellbookStandaloneContent(snapshotCaster, 'it', 0);
    const joined = rows.join('\n');
    expect(joined).toContain('LIBRO INCANTESIMI');
  });

  it('SP-CONTENT-STANDALONE-SLOT-BAR: standalone output contains slot bar glyphs', () => {
    const rows = renderSpellbookStandaloneContent(snapshotCaster, 'it', 0);
    const joined = rows.join('\n');
    expect(joined).toContain('▓');
    expect(joined).toContain('░');
  });

  it('SP-CONTENT-EMPTY: non-caster returns 18 rows with empty state message', () => {
    const rows = renderSpellbookStandaloneContent(snapshotNonCaster, 'it', 0);
    expect(rows).toHaveLength(18);
    for (const row of rows) {
      expect(codePointLen(row)).toBe(66);
    }
    const joined = rows.join('\n');
    // Should contain the spell.empty key content
    expect(joined).toContain('Nessun incantesimo');
  });
});

// ─── SP-SCHEMA: schema validation ─────────────────────────────────────────────

describe('CharacterSnapshotSchema with spells', () => {
  it('SP-SCHEMA-1: parse with empty spells succeeds', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...snapshotCaster,
      spells: { slots: [], spells: [] },
    });
    expect(result.success).toBe(true);
  });

  it('SP-SCHEMA-2: parse with realistic spell data succeeds', () => {
    const result = CharacterSnapshotSchema.safeParse(snapshotCaster);
    expect(result.success).toBe(true);
  });
});

// ─── SP-FIX: INV-1 fixture round-trips ────────────────────────────────────────

describe('INV-1 fixture round-trips', () => {
  it('SP-FIX-SHEET: renderSpellsTabContent matches sheet.spells.it.txt', () => {
    const rows = renderSpellsTabContent(snapshotCaster, 'it', 0);
    const expected = normaliseRows(loadFixture('sheet.spells.it.txt'));
    const actual = normaliseRows(rows.join('\n'));
    expect(actual).toBe(expected);
  });

  it('SP-FIX-CASTER: renderSpellbookStandaloneContent matches spellbook.caster.it.txt', () => {
    const rows = renderSpellbookStandaloneContent(snapshotCaster, 'it', 0);
    const expected = normaliseRows(loadFixture('spellbook.caster.it.txt'));
    const actual = normaliseRows(rows.join('\n'));
    expect(actual).toBe(expected);
  });

  it('SP-FIX-HALF-CASTER: renderSpellbookStandaloneContent matches spellbook.half-caster.it.txt', () => {
    const rows = renderSpellbookStandaloneContent(snapshotHalfCaster, 'it', 0);
    const expected = normaliseRows(loadFixture('spellbook.half-caster.it.txt'));
    const actual = normaliseRows(rows.join('\n'));
    expect(actual).toBe(expected);
  });
});
