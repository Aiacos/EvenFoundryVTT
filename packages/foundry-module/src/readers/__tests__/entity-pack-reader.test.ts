/**
 * Unit tests for entity-pack-reader.ts.
 *
 * Quick Task 260517-k2g.
 *
 * Uses vi.stubGlobal to mock Foundry globals (`game`, `Hooks`).
 * No real Foundry runtime.
 *
 * Test coverage (per PLAN Task 1):
 *   (1) item pack with weapon + equipment + spell → only weapon + equipment
 *       (spell leak prevention; parallel pipeline does NOT touch spells).
 *   (2) actor pack with npc + character → only npc (character excluded).
 *   (3) 3-pack aggregation (2 Item + 1 Actor) — correct counts and kinds.
 *   (4) De-duplication by `_id` cross-pack first-pack-wins.
 *   (5) `entityKind` correctly 'item' vs 'actor' from pack metadata.type.
 *   (6) `nameLocalized` uses `game.i18n.localize` with fallback to entry.name.
 *   (7) Defensive: `game.packs === undefined` → empty payload.
 *   (8) `registerEntityPackReader`: immediate emit + debounced re-emit.
 *   (9) Skip pack when `metadata.system !== 'dnd5e'`.
 *  (10) T-EP-04 warn when entries.length > 10000.
 *
 * @see packages/foundry-module/src/readers/entity-pack-reader.ts
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md Task 1
 */

import { R1_ENTITIES_AVAILABLE_TYPE } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAvailableEntities, registerEntityPackReader } from '../entity-pack-reader.js';

// ─── Mock factories ────────────────────────────────────────────────────────────

/** Build a mock index entry (works for both Items and Actors). */
function makeItemEntry(id: string, name: string, type = 'weapon') {
  return { _id: id, name, type, img: 'icons/svg/mystery-man.svg' };
}

function makeActorEntry(id: string, name: string, type = 'npc') {
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

// ─── Hooks mock infrastructure ────────────────────────────────────────────────

/** Capture registered Hooks.on callbacks by event name. */
const hookHandlers: Map<string, Array<(...args: unknown[]) => unknown>> = new Map();
let hookIdCounter = 100;
const offCalls: number[] = [];

function makeHooksMock() {
  return {
    once: vi.fn(),
    on: vi.fn().mockImplementation((event: string, fn: (...args: unknown[]) => unknown) => {
      if (!hookHandlers.has(event)) hookHandlers.set(event, []);
      const handlers = hookHandlers.get(event);
      if (handlers !== undefined) handlers.push(fn);
      return hookIdCounter++;
    }),
    off: vi.fn().mockImplementation((id: number) => {
      offCalls.push(id);
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('readAvailableEntities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(1) item pack with weapon + equipment + spell → keeps weapon + equipment, drops spell', () => {
    const itemPack = makePack('dnd5e.items', 'dnd5e', 'Item', [
      makeItemEntry('weapon-001', 'Longsword', 'weapon'),
      makeItemEntry('armor-001', 'Plate', 'equipment'),
      makeItemEntry('spell-001', 'Fireball', 'spell'), // must be skipped (covered by spell-pack)
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [itemPack],
        size: 1,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableEntities();

    expect(result.source).toBe('foundry-packs');
    expect(result.count).toBe(2);
    const ids = result.entries.map((e) => e.id);
    expect(ids).toContain('weapon-001');
    expect(ids).toContain('armor-001');
    expect(ids).not.toContain('spell-001');
    // All entries are entityKind='item'
    for (const e of result.entries) {
      expect(e.entityKind).toBe('item');
    }
  });

  it('(2) actor pack with npc + character → keeps npc, drops character', () => {
    const actorPack = makePack('dnd5e.monsters', 'dnd5e', 'Actor', [
      makeActorEntry('goblin-1', 'Goblin', 'npc'),
      makeActorEntry('dragon-1', 'Adult Red Dragon', 'npc'),
      makeActorEntry('hero-1', 'Hero', 'character'), // must be skipped (world-unique)
      makeActorEntry('vehicle-1', 'Galleon', 'vehicle'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [actorPack],
        size: 1,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableEntities();

    expect(result.count).toBe(3); // 2 npc + 1 vehicle
    const ids = result.entries.map((e) => e.id);
    expect(ids).toContain('goblin-1');
    expect(ids).toContain('dragon-1');
    expect(ids).toContain('vehicle-1');
    expect(ids).not.toContain('hero-1');
    // All entries are entityKind='actor'
    for (const e of result.entries) {
      expect(e.entityKind).toBe('actor');
    }
  });

  it('(3) 3-pack aggregation: 2 Item + 1 Actor → correct counts and kinds', () => {
    const itemsPack = makePack('dnd5e.items', 'dnd5e', 'Item', [
      makeItemEntry('weapon-001', 'Longsword', 'weapon'),
      makeItemEntry('tool-001', "Smith's Tools", 'tool'),
    ]);
    const consumablesPack = makePack('dnd5e.consumables', 'dnd5e', 'Item', [
      makeItemEntry('potion-001', 'Potion of Healing', 'consumable'),
    ]);
    const monstersPack = makePack('dnd5e.monsters', 'dnd5e', 'Actor', [
      makeActorEntry('goblin-1', 'Goblin', 'npc'),
      makeActorEntry('dragon-1', 'Adult Red Dragon', 'npc'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [itemsPack, consumablesPack, monstersPack],
        size: 3,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableEntities();

    expect(result.count).toBe(5);
    const itemCount = result.entries.filter((e) => e.entityKind === 'item').length;
    const actorCount = result.entries.filter((e) => e.entityKind === 'actor').length;
    expect(itemCount).toBe(3);
    expect(actorCount).toBe(2);
  });

  it('(4) de-duplicates by _id (first-pack-wins) across packs', () => {
    const srdItems = makePack('dnd5e.items', 'dnd5e', 'Item', [
      makeItemEntry('weapon-001', 'Longsword', 'weapon'),
    ]);
    // Expansion re-publishes same _id — should be skipped
    const expansionItems = makePack('dnd5e.expansion', 'dnd5e', 'Item', [
      makeItemEntry('weapon-001', 'Longsword (Enhanced)', 'weapon'), // same _id
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [srdItems, expansionItems],
        size: 2,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableEntities();

    expect(result.count).toBe(1);
    expect(result.entries[0]?.name).toBe('Longsword');
    expect(result.entries[0]?.packId).toBe('dnd5e.items');
  });

  it('(5) entityKind discriminator follows pack.metadata.type (Item→item, Actor→actor)', () => {
    const itemPack = makePack('dnd5e.items', 'dnd5e', 'Item', [
      makeItemEntry('w', 'Longsword', 'weapon'),
    ]);
    const actorPack = makePack('dnd5e.monsters', 'dnd5e', 'Actor', [
      makeActorEntry('g', 'Goblin', 'npc'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [itemPack, actorPack],
        size: 2,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableEntities();

    const longsword = result.entries.find((e) => e.id === 'w');
    const goblin = result.entries.find((e) => e.id === 'g');

    expect(longsword?.entityKind).toBe('item');
    expect(longsword?.entityType).toBe('weapon');
    expect(goblin?.entityKind).toBe('actor');
    expect(goblin?.entityType).toBe('npc');
  });

  it('(6) nameLocalized uses game.i18n.localize with fallback to entry.name', () => {
    const itemPack = makePack('dnd5e.items', 'dnd5e', 'Item', [
      makeItemEntry('weapon-001', 'Longsword', 'weapon'),
      makeItemEntry('weapon-002', 'Greatsword', 'weapon'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [itemPack],
        size: 1,
        get: vi.fn(),
      },
      i18n: {
        lang: 'it',
        localize: (key: string) => {
          const map: Record<string, string> = {
            Longsword: 'Spada Lunga',
            // Greatsword intentionally missing → fallback to key (English)
          };
          return map[key] ?? key;
        },
      },
    });

    const result = readAvailableEntities();

    const longsword = result.entries.find((e) => e.id === 'weapon-001');
    const greatsword = result.entries.find((e) => e.id === 'weapon-002');

    expect(longsword?.nameLocalized).toBe('Spada Lunga');
    expect(longsword?.name).toBe('Longsword');
    // Fallback case: localize returns the key (English name)
    expect(greatsword?.nameLocalized).toBe('Greatsword');
  });

  it('(7) defensive: game.packs === undefined → empty payload', () => {
    vi.stubGlobal('game', {
      packs: undefined,
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableEntities();

    expect(result.count).toBe(0);
    expect(result.entries).toHaveLength(0);
    expect(result.source).toBe('foundry-packs');
  });

  it('(9) skip pack when metadata.system !== "dnd5e"', () => {
    const pf2ePack = makePack('pf2e.items', 'pf2e', 'Item', [
      makeItemEntry('pf2e-1', 'Longsword', 'weapon'),
    ]);
    const dnd5ePack = makePack('dnd5e.items', 'dnd5e', 'Item', [
      makeItemEntry('dnd-1', 'Longsword', 'weapon'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [pf2ePack, dnd5ePack],
        size: 2,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableEntities();

    expect(result.count).toBe(1);
    expect(result.entries[0]?.packId).toBe('dnd5e.items');
  });

  it('skip pack when metadata.type is neither Item nor Actor (e.g., JournalEntry)', () => {
    const journalPack = makePack('dnd5e.journals', 'dnd5e', 'JournalEntry', [
      makeItemEntry('j-1', 'Travels in the Sword Coast', 'base'),
    ]);
    const itemPack = makePack('dnd5e.items', 'dnd5e', 'Item', [
      makeItemEntry('w-1', 'Longsword', 'weapon'),
    ]);

    vi.stubGlobal('game', {
      packs: {
        contents: [journalPack, itemPack],
        size: 2,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const result = readAvailableEntities();

    expect(result.count).toBe(1);
    expect(result.entries[0]?.id).toBe('w-1');
  });

  it('(10) T-EP-04: emits console.warn when entries.length > 10000', () => {
    // Build a fake pack of 10001 entries.
    const bigEntries = Array.from({ length: 10001 }, (_, i) =>
      makeActorEntry(`monster-${i}`, `Monster ${i}`, 'npc'),
    );
    const bigPack = makePack('homebrew.bestiary', 'dnd5e', 'Actor', bigEntries);

    vi.stubGlobal('game', {
      packs: {
        contents: [bigPack],
        size: 1,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = readAvailableEntities();

    expect(result.count).toBe(10001);
    // Telemetry warn fired with substring 'exceeds 10000'
    expect(warnSpy).toHaveBeenCalled();
    const messages = warnSpy.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((msg) => msg.includes('exceeds 10000'));
    expect(messages.length).toBeGreaterThanOrEqual(1);

    warnSpy.mockRestore();
  });

  it('handles empty pack index defensively', () => {
    const emptyPack = {
      collection: 'dnd5e.items',
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

    const result = readAvailableEntities();

    expect(result.count).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('includes generatedAt as a recent timestamp', () => {
    vi.stubGlobal('game', {
      packs: { contents: [], size: 0, get: vi.fn() },
      i18n: { lang: 'en', localize: (key: string) => key },
    });

    const before = Date.now();
    const result = readAvailableEntities();
    const after = Date.now();

    expect(result.generatedAt).toBeGreaterThanOrEqual(before);
    expect(result.generatedAt).toBeLessThanOrEqual(after);
  });
});

describe('registerEntityPackReader', () => {
  beforeEach(() => {
    hookHandlers.clear();
    offCalls.length = 0;
    hookIdCounter = 100;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(8) emits immediately when called', () => {
    vi.stubGlobal('game', {
      packs: {
        contents: [
          makePack('dnd5e.items', 'dnd5e', 'Item', [makeItemEntry('w-1', 'Longsword', 'weapon')]),
        ],
        size: 1,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });
    vi.stubGlobal('Hooks', makeHooksMock());

    const emit = vi.fn();
    registerEntityPackReader(emit);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      R1_ENTITIES_AVAILABLE_TYPE,
      expect.objectContaining({ source: 'foundry-packs', count: 1 }),
    );
  });

  it('(8) registers updateCompendium hook and re-emits with 500ms debounce', () => {
    vi.useFakeTimers();

    vi.stubGlobal('game', {
      packs: {
        contents: [
          makePack('dnd5e.items', 'dnd5e', 'Item', [makeItemEntry('w-1', 'Longsword', 'weapon')]),
        ],
        size: 1,
        get: vi.fn(),
      },
      i18n: { lang: 'en', localize: (key: string) => key },
    });
    vi.stubGlobal('Hooks', makeHooksMock());

    const emit = vi.fn();
    registerEntityPackReader(emit);

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
      R1_ENTITIES_AVAILABLE_TYPE,
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
    registerEntityPackReader(emit);

    expect(emit).toHaveBeenCalledTimes(1); // Initial

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
    const unsubscribe = registerEntityPackReader(emit);

    unsubscribe();

    expect(hooksMock.off).toHaveBeenCalledTimes(1);
    expect(hooksMock.off).toHaveBeenCalledWith(100);
  });
});
