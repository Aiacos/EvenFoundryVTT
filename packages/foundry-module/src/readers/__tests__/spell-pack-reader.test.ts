/**
 * Unit tests for spell-pack-reader.ts.
 *
 * Uses vi.stubGlobal to mock Foundry globals (`game`, `Hooks`).
 * No real Foundry runtime.
 *
 * Test coverage:
 * - readAvailableSpells: 3-pack aggregation + de-duplication by _id
 * - readAvailableSpells: i18n localize for IT names
 * - readAvailableSpells: skips non-dnd5e packs and non-Item packs
 * - readAvailableSpells: skips non-spell item types
 * - readAvailableSpells: defensive against empty packs / missing index
 * - readAvailableSpells: defensive against undefined game.packs
 * - registerSpellPackReader: emits immediately + on updateCompendium
 *
 * @see packages/foundry-module/src/readers/spell-pack-reader.ts
 * @see .planning/quick/20260517-spell-lookup-foundry-derived/PLAN.md Task 1
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { R1_SPELLS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import { readAvailableSpells, registerSpellPackReader } from '../spell-pack-reader.js';

// ─── Mock factories ────────────────────────────────────────────────────────────

/** Build a mock index entry for a spell. */
function makeSpellEntry(id: string, name: string) {
  return { _id: id, name, type: 'spell', img: 'icons/svg/mystery-man.svg' };
}

/** Build a mock index entry for a non-spell item. */
function makeItemEntry(id: string, name: string, type = 'weapon') {
  return { _id: id, name, type, img: 'icons/svg/mystery-man.svg' };
}

/** Build a mock CompendiumCollection. */
function makePack(
  collection: string,
  system: string,
  type: string,
  entries: Array<{ _id: string; name: string; type: string; img?: string }>,
) {
  return {
    collection,
    metadata: { type, system, label: collection },
    index: { contents: entries, size: entries.length },
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

/** Capture registered Hooks.on callbacks by event name. */
const hookHandlers: Map<string, Array<(...args: unknown[]) => unknown>> = new Map();
let hookIdCounter = 100;
const offCalls: number[] = [];

function makeHooksMock() {
  return {
    once: vi.fn(),
    on: vi.fn().mockImplementation((event: string, fn: (...args: unknown[]) => unknown) => {
      if (!hookHandlers.has(event)) hookHandlers.set(event, []);
      hookHandlers.get(event)!.push(fn);
      return hookIdCounter++;
    }),
    off: vi.fn().mockImplementation((id: number) => {
      offCalls.push(id);
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('readAvailableSpells', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates spells from 3 packs and excludes non-spell items', () => {
    const srdSpells = makePack('dnd5e.spells', 'dnd5e', 'Item', [
      makeSpellEntry('spell-001', 'Fireball'),
      makeSpellEntry('spell-002', 'Magic Missile'),
      makeItemEntry('item-001', 'Longsword', 'weapon'), // should be skipped
    ]);
    const tashasSpells = makePack('dnd5e.tashas', 'dnd5e', 'Item', [
      makeSpellEntry('spell-003', 'Tasha\'s Hideous Laughter'),
      makeSpellEntry('spell-004', 'Booming Blade'),
    ]);
    const homebrewSpells = makePack('world.homebrew', 'dnd5e', 'Item', [
      makeSpellEntry('spell-005', 'Chromatic Explosion'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [srdSpells, tashasSpells, homebrewSpells],
        size: 3,
        get: vi.fn(),
      },
      i18n: {
        lang: 'en',
        localize: (key: string) => key, // EN: returns key unchanged
      },
    });

    const result = readAvailableSpells();

    expect(result.source).toBe('foundry-packs');
    expect(result.count).toBe(5); // 2 + 2 + 1 (weapon excluded)
    expect(result.entries).toHaveLength(5);
    expect(result.entries.map((e) => e.id)).toContain('spell-001');
    expect(result.entries.map((e) => e.id)).toContain('spell-005');
    expect(result.entries.map((e) => e.id)).not.toContain('item-001');
  });

  it('de-duplicates by _id (first-pack-wins)', () => {
    const srdSpells = makePack('dnd5e.spells', 'dnd5e', 'Item', [
      makeSpellEntry('spell-001', 'Fireball'),
    ]);
    // Expansion re-publishes same _id — should be skipped
    const expansionSpells = makePack('dnd5e.expansion', 'dnd5e', 'Item', [
      makeSpellEntry('spell-001', 'Fireball (Enhanced)'), // same _id!
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [srdSpells, expansionSpells],
        size: 2,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableSpells();

    expect(result.count).toBe(1);
    // First-pack-wins: 'Fireball' from SRD, not 'Fireball (Enhanced)'
    expect(result.entries[0]?.name).toBe('Fireball');
    expect(result.entries[0]?.packId).toBe('dnd5e.spells');
  });

  it('uses game.i18n.localize for nameLocalized (IT translations)', () => {
    const srdSpells = makePack('dnd5e.spells', 'dnd5e', 'Item', [
      makeSpellEntry('spell-001', 'Fireball'),
      makeSpellEntry('spell-002', 'Magic Missile'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [srdSpells],
        size: 1,
        get: vi.fn(),
      },
      i18n: {
        lang: 'it',
        localize: (key: string) => {
          const map: Record<string, string> = {
            Fireball: 'Palla di Fuoco',
            'Magic Missile': 'Dardo Incantato',
          };
          return map[key] ?? key;
        },
      },
    });

    const result = readAvailableSpells();

    const fireball = result.entries.find((e) => e.id === 'spell-001');
    const magic = result.entries.find((e) => e.id === 'spell-002');

    expect(fireball?.nameLocalized).toBe('Palla di Fuoco');
    expect(magic?.nameLocalized).toBe('Dardo Incantato');
    // name stays as English canonical
    expect(fireball?.name).toBe('Fireball');
  });

  it('skips non-dnd5e system packs', () => {
    const pf2ePack = makePack('pf2e.spells', 'pf2e', 'Item', [
      makeSpellEntry('pf2e-001', 'Fireball'),
    ]);
    const dnd5ePack = makePack('dnd5e.spells', 'dnd5e', 'Item', [
      makeSpellEntry('dnd-001', 'Fireball'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [pf2ePack, dnd5ePack],
        size: 2,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableSpells();

    expect(result.count).toBe(1);
    expect(result.entries[0]?.packId).toBe('dnd5e.spells');
  });

  it('skips non-Item type packs (e.g. Actor, JournalEntry packs)', () => {
    const actorPack = makePack('dnd5e.monsters', 'dnd5e', 'Actor', [
      makeSpellEntry('monster-001', 'Fireball'),
    ]);
    const spellPack = makePack('dnd5e.spells', 'dnd5e', 'Item', [
      makeSpellEntry('spell-001', 'Fireball'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [actorPack, spellPack],
        size: 2,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableSpells();

    expect(result.count).toBe(1);
    expect(result.entries[0]?.packId).toBe('dnd5e.spells');
  });

  it('returns empty payload when game.packs is undefined (defensive)', () => {
    vi.stubGlobal('game', {
      packs: undefined,
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableSpells();

    expect(result.count).toBe(0);
    expect(result.entries).toHaveLength(0);
    expect(result.source).toBe('foundry-packs');
  });

  it('handles empty pack index defensively', () => {
    const emptyPack = {
      collection: 'dnd5e.spells',
      metadata: { type: 'Item', system: 'dnd5e' },
      index: { contents: [], size: 0 },
    };

    vi.stubGlobal('game', {
      packs: {
        contents: [emptyPack],
        size: 1,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableSpells();

    expect(result.count).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('includes generatedAt as a recent timestamp', () => {
    vi.stubGlobal('game', {
      packs: { contents: [], size: 0, get: vi.fn() },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const before = Date.now();
    const result = readAvailableSpells();
    const after = Date.now();

    expect(result.generatedAt).toBeGreaterThanOrEqual(before);
    expect(result.generatedAt).toBeLessThanOrEqual(after);
  });
});

describe('registerSpellPackReader', () => {
  beforeEach(() => {
    hookHandlers.clear();
    offCalls.length = 0;
    hookIdCounter = 100;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits immediately when called', () => {
    vi.stubGlobal('game', {
      packs: {
        contents: [
          makePack('dnd5e.spells', 'dnd5e', 'Item', [makeSpellEntry('s1', 'Fireball')]),
        ],
        size: 1,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });
    vi.stubGlobal('Hooks', makeHooksMock());

    const emit = vi.fn();
    registerSpellPackReader(emit);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      R1_SPELLS_AVAILABLE_TYPE,
      expect.objectContaining({ source: 'foundry-packs', count: 1 }),
    );
  });

  it('registers updateCompendium hook and re-emits on invocation', () => {
    vi.useFakeTimers();

    vi.stubGlobal('game', {
      packs: {
        contents: [
          makePack('dnd5e.spells', 'dnd5e', 'Item', [makeSpellEntry('s1', 'Fireball')]),
        ],
        size: 1,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });
    vi.stubGlobal('Hooks', makeHooksMock());

    const emit = vi.fn();
    registerSpellPackReader(emit);

    // Initial emit
    expect(emit).toHaveBeenCalledTimes(1);

    // Fire the updateCompendium hook
    const handlers = hookHandlers.get('updateCompendium');
    expect(handlers).toBeDefined();
    handlers?.[0]?.();

    // Before debounce delay — no extra emit
    expect(emit).toHaveBeenCalledTimes(1);

    // Advance past debounce
    vi.advanceTimersByTime(600);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(
      R1_SPELLS_AVAILABLE_TYPE,
      expect.objectContaining({ source: 'foundry-packs' }),
    );

    vi.useRealTimers();
  });

  it('debounces rapid updateCompendium events into a single emit', () => {
    vi.useFakeTimers();

    vi.stubGlobal('game', {
      packs: { contents: [], size: 0, get: vi.fn() },
      i18n: { lang: 'en', localize: (key: string) => key },
    });
    vi.stubGlobal('Hooks', makeHooksMock());

    const emit = vi.fn();
    registerSpellPackReader(emit);

    expect(emit).toHaveBeenCalledTimes(1); // Initial

    // Fire 3 rapid updateCompendium events
    const handlers = hookHandlers.get('updateCompendium');
    handlers?.[0]?.();
    vi.advanceTimersByTime(100);
    handlers?.[0]?.();
    vi.advanceTimersByTime(100);
    handlers?.[0]?.();
    vi.advanceTimersByTime(100);

    // Still 1 — debounce not yet expired
    expect(emit).toHaveBeenCalledTimes(1);

    // Advance past debounce
    vi.advanceTimersByTime(500);

    // Only 1 additional emit (debounced)
    expect(emit).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('unsubscribe closure calls Hooks.off with the hook ID', () => {
    vi.stubGlobal('game', {
      packs: { contents: [], size: 0, get: vi.fn() },
      i18n: { lang: 'en', localize: (key: string) => key },
    });
    const hooksMock = makeHooksMock();
    vi.stubGlobal('Hooks', hooksMock);

    const emit = vi.fn();
    const unsubscribe = registerSpellPackReader(emit);

    unsubscribe();

    expect(hooksMock.off).toHaveBeenCalledTimes(1);
    // The hook ID returned by Hooks.on starts at 100 in our mock
    expect(hooksMock.off).toHaveBeenCalledWith(100);
  });
});
