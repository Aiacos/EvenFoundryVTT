/**
 * Branch-coverage tests for character-reader.ts fallback / variant arms.
 *
 * These pin the defensive per-field defaults, dnd5e activation-type mapping,
 * homebrew clamp arms, legacy-vs-modern spell-preparation shapes, and the
 * `consentingOwnerName` player-owner scan (ADR-0015 §C) that the primary
 * readers.test.ts suite does not exercise. Every assertion checks an observable
 * field value, never merely "does not throw".
 *
 * @see packages/foundry-module/src/readers/character-reader.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sys = Record<string, unknown>;

/** Build a minimal character actor with a caller-supplied `system` + items. */
function actorWith(system: Sys, items: unknown[] = [], extra: Sys = {}) {
  return {
    id: 'a1',
    name: 'Test',
    type: 'character',
    img: '',
    system: {
      attributes: {
        hp: { value: 10, max: 10, temp: null, tempmax: null },
        ac: { value: 12 },
        exhaustion: 0,
        death: { success: 0, failure: 0 },
      },
      details: { level: 1 },
      spells: {},
      ...system,
    },
    statuses: new Set<string>(),
    items: { contents: items },
    ...extra,
  };
}

function gameWith(actor: ReturnType<typeof actorWith>, users: unknown[] = []) {
  return {
    actors: {
      get: (id: string) => (id === actor.id ? actor : undefined),
      contents: [actor],
    },
    users: { contents: users },
    settings: { get: vi.fn().mockReturnValue('legacy') },
  };
}

let getCharacterSnapshot: typeof import('./character-reader.js').getCharacterSnapshot;
let listPlayerCharacters: typeof import('./character-reader.js').listPlayerCharacters;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./character-reader.js');
  getCharacterSnapshot = mod.getCharacterSnapshot;
  listPlayerCharacters = mod.listPlayerCharacters;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('inventory field fallbacks', () => {
  it('item with no id and no name → stable evf- id + "Unknown Item" name', () => {
    const item = { type: 'weapon', system: { damage: { parts: [] } } };
    vi.stubGlobal('game', gameWith(actorWith({}, [item])));
    const inv = getCharacterSnapshot('a1')?.inventory;
    expect(inv).toHaveLength(1);
    expect(inv?.[0]?.name).toBe('Unknown Item');
    expect(inv?.[0]?.id).toMatch(/^evf-[0-9a-f]{8}$/);
  });

  it('item with undefined type → dropped by mapItemType null-guard', () => {
    const item = { id: 'x', name: 'Mystery', system: {} };
    vi.stubGlobal('game', gameWith(actorWith({}, [item])));
    expect(getCharacterSnapshot('a1')?.inventory).toHaveLength(0);
  });

  it('properties as plain array → tags surfaced verbatim', () => {
    const item = {
      id: 'w',
      name: 'Spear',
      type: 'weapon',
      system: { damage: { parts: [] }, properties: ['thrown', 'versatile'] },
    };
    vi.stubGlobal('game', gameWith(actorWith({}, [item])));
    expect(getCharacterSnapshot('a1')?.inventory[0]?.tags).toEqual(['thrown', 'versatile']);
  });

  it('properties neither Set nor array → tags omitted', () => {
    const item = {
      id: 'w',
      name: 'Rock',
      type: 'weapon',
      system: { damage: { parts: [] }, properties: { bogus: true } },
    };
    vi.stubGlobal('game', gameWith(actorWith({}, [item])));
    expect(getCharacterSnapshot('a1')?.inventory[0]?.tags).toBeUndefined();
  });

  it('weight present and quantity != 1 → both surfaced', () => {
    const item = {
      id: 'w',
      name: 'Ration',
      type: 'consumable',
      system: { quantity: 5, weight: { value: 2 }, damage: { parts: [] } },
    };
    vi.stubGlobal('game', gameWith(actorWith({}, [item])));
    const entry = getCharacterSnapshot('a1')?.inventory[0];
    expect(entry?.weight).toBe(2);
    expect(entry?.quantity).toBe(5);
  });
});

describe('spell field fallbacks & activation mapping', () => {
  function spell(system: Sys, over: Sys = {}) {
    return { id: 's', name: 'Sp', type: 'spell', system, ...over };
  }

  it('activation reaction → "reaction"', () => {
    vi.stubGlobal(
      'game',
      gameWith(actorWith({}, [spell({ level: 1, activation: { type: 'reaction' } })])),
    );
    expect(getCharacterSnapshot('a1')?.spells.spells[0]?.activation).toBe('reaction');
  });

  it('activation ritual and special both → "ritual"', () => {
    vi.stubGlobal(
      'game',
      gameWith(
        actorWith({}, [
          spell({ level: 1, activation: { type: 'ritual' } }, { id: 's1', name: 'R' }),
          spell({ level: 1, activation: { type: 'special' } }, { id: 's2', name: 'S' }),
        ]),
      ),
    );
    const spells = getCharacterSnapshot('a1')?.spells.spells;
    expect(spells?.every((s) => s.activation === 'ritual')).toBe(true);
  });

  it('missing name/school → "Unknown Spell" / empty school', () => {
    const s = { type: 'spell', system: { level: 2 } };
    vi.stubGlobal('game', gameWith(actorWith({}, [s])));
    const entry = getCharacterSnapshot('a1')?.spells.spells[0];
    expect(entry?.name).toBe('Unknown Spell');
    expect(entry?.school).toBe('');
  });

  it('range unit self → "self"', () => {
    vi.stubGlobal(
      'game',
      gameWith(actorWith({}, [spell({ level: 2, range: { value: 0, units: 'self' } })])),
    );
    expect(getCharacterSnapshot('a1')?.spells.spells[0]?.range).toBe('self');
  });

  it('legacy preparation mode "always" → alwaysPrepared + prepared true', () => {
    // No top-level method/prepared → falls back to the deprecated `preparation` object.
    const s = spell({ level: 3, preparation: { mode: 'always', prepared: false } });
    vi.stubGlobal('game', gameWith(actorWith({}, [s])));
    const entry = getCharacterSnapshot('a1')?.spells.spells[0];
    expect(entry?.alwaysPrepared).toBe(true);
    expect(entry?.prepared).toBe(true);
  });

  it('legacy preparation "innate" → alwaysPrepared', () => {
    const s = spell({ level: 3, preparation: { mode: 'innate' } });
    vi.stubGlobal('game', gameWith(actorWith({}, [s])));
    expect(getCharacterSnapshot('a1')?.spells.spells[0]?.alwaysPrepared).toBe(true);
  });

  it('level clamped to 0..9 (level 12 → 9, level -3 → 0)', () => {
    vi.stubGlobal(
      'game',
      gameWith(
        actorWith({}, [
          spell({ level: 12 }, { id: 'hi', name: 'High' }),
          spell({ level: -3 }, { id: 'lo', name: 'Low' }),
        ]),
      ),
    );
    const spells = getCharacterSnapshot('a1')?.spells.spells;
    const hi = spells?.find((s) => s.name === 'High');
    const lo = spells?.find((s) => s.name === 'Low');
    expect(hi?.level).toBe(9);
    expect(lo?.level).toBe(0);
  });

  it('spell with damage parts → effect string "formula type"', () => {
    const s = spell({ level: 3, damage: { parts: [['8d6', 'fire']] } });
    vi.stubGlobal('game', gameWith(actorWith({}, [s])));
    expect(getCharacterSnapshot('a1')?.spells.spells[0]?.effect).toBe('8d6 fire');
  });
});

describe('spell slots default arm', () => {
  it('slot with max present but no value → value defaults to 0', () => {
    vi.stubGlobal('game', gameWith(actorWith({ spells: { spell1: { max: 3 } } })));
    const slot = getCharacterSnapshot('a1')?.spells.slots.find((s) => s.level === 1);
    expect(slot?.value).toBe(0);
    expect(slot?.max).toBe(3);
  });
});

describe('ability per-field defensive defaults', () => {
  it('partial ability (only value) → mod/save/dc default, proficient false', () => {
    vi.stubGlobal('game', gameWith(actorWith({ abilities: { str: { value: 16 } } })));
    const str = getCharacterSnapshot('a1')?.abilities.str;
    expect(str).toEqual({ value: 16, mod: 0, save: 0, proficient: false, dc: 10 });
  });

  it('ability with save object missing .value → save 0', () => {
    vi.stubGlobal(
      'game',
      gameWith(actorWith({ abilities: { dex: { value: 14, mod: 2, save: {} } } })),
    );
    expect(getCharacterSnapshot('a1')?.abilities.dex.save).toBe(0);
  });
});

describe('skill homebrew clamp arms', () => {
  it('non-canonical ability string → clamped to SKILL_DEFAULT_ABILITY', () => {
    const skills = { acr: { total: 1, ability: 'luck', proficient: 0, passive: 11 } };
    vi.stubGlobal('game', gameWith(actorWith({ skills: skills as unknown as Sys })));
    // acr's canonical default ability is dex
    expect(getCharacterSnapshot('a1')?.skills.acr.ability).toBe('dex');
  });

  it('out-of-enum proficient (3) → clamped to 0', () => {
    const skills = { ath: { total: 2, ability: 'str', proficient: 3, passive: 12 } };
    vi.stubGlobal('game', gameWith(actorWith({ skills: skills as unknown as Sys })));
    expect(getCharacterSnapshot('a1')?.skills.ath.proficient).toBe(0);
  });

  it('negative passive → clamped to 0', () => {
    const skills = { prc: { total: 1, ability: 'wis', proficient: 0, passive: -5 } };
    vi.stubGlobal('game', gameWith(actorWith({ skills: skills as unknown as Sys })));
    expect(getCharacterSnapshot('a1')?.skills.prc.passive).toBe(0);
  });
});

describe('consentingOwnerName (ADR-0015 §C owner scan)', () => {
  function user(over: Partial<{ id: string; name: string; isGM: boolean; consent: boolean }>) {
    return {
      id: over.id ?? 'u',
      name: over.name ?? 'User',
      isGM: over.isGM ?? false,
      getFlag: (_scope: string, _key: string) => over.consent === true,
    };
  }

  it('consenting non-GM owner → userName surfaced (GM user is skipped)', () => {
    const actor = actorWith({});
    // consentingOwnerName scans actor.testUserPermission per user.
    (actor as Record<string, unknown>).testUserPermission = (u: { name: string }) =>
      u.name === 'Alice';
    const users = [
      user({ id: 'gm', name: 'GM', isGM: true, consent: true }),
      user({ id: 'a', name: 'Alice', consent: true }),
    ];
    vi.stubGlobal('game', gameWith(actor, users));
    expect(listPlayerCharacters()[0]?.userName).toBe('Alice');
  });

  it('non-GM without consent flag → skipped, no userName', () => {
    const actor = actorWith({});
    (actor as Record<string, unknown>).testUserPermission = () => true;
    const users = [user({ id: 'b', name: 'Bob', consent: false })];
    vi.stubGlobal('game', gameWith(actor, users));
    expect(listPlayerCharacters()[0]?.userName).toBeUndefined();
  });

  it('consenting non-owner → no userName (testUserPermission false)', () => {
    const actor = actorWith({});
    (actor as Record<string, unknown>).testUserPermission = () => false;
    const users = [user({ id: 'd', name: 'Dave', consent: true })];
    vi.stubGlobal('game', gameWith(actor, users));
    expect(listPlayerCharacters()[0]?.userName).toBeUndefined();
  });

  it('actor.testUserPermission throwing does not break the roster', () => {
    const actor = actorWith({});
    (actor as Record<string, unknown>).testUserPermission = () => {
      throw new Error('boom');
    };
    const users = [user({ id: 'c', name: 'Carol', consent: true })];
    vi.stubGlobal('game', gameWith(actor, users));
    const roster = listPlayerCharacters();
    expect(roster).toHaveLength(1);
    expect(roster[0]?.userName).toBeUndefined();
  });
});
