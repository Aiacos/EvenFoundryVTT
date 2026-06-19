/**
 * Reader unit tests — character, combat, scene, event-log, hook-subscribers.
 *
 * Uses vi.stubGlobal to mock Foundry globals (game, canvas, Hooks).
 * No real Foundry runtime or HTTP calls.
 *
 * NOTE (M-2): Mock shapes are derived from the dnd5e 5.x interfaces documented in
 * foundry-globals.d.ts and the 02-05-PLAN.md interfaces block. If fvtt-types is
 * adopted in a future phase, these mocks should be reconciled against the generated types.
 * TODO (#44): validate mock shapes against fvtt-types when package stabilises.
 *
 * @see packages/foundry-module/src/readers/character-reader.ts
 * @see packages/foundry-module/src/readers/combat-reader.ts
 * @see packages/foundry-module/src/readers/scene-reader.ts
 * @see packages/foundry-module/src/readers/event-log-reader.ts
 * @see packages/foundry-module/src/readers/hook-subscribers.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global mock helpers ──────────────────────────────────────────────

function makeActiveEffect(name: string, dnd5eConcentrating: boolean, durationLabel?: string) {
  return {
    name,
    flags: { dnd5e: { concentrating: dnd5eConcentrating } },
    duration: durationLabel !== undefined ? { label: durationLabel } : undefined,
  };
}

/** Minimal mock of a dnd5e item document for inventory testing. */
function makeItem(
  overrides: Partial<{
    id: string;
    name: string;
    type: string;
    damage: string;
    quantity: number;
    weight: number;
  }> = {},
) {
  return {
    id: overrides.id ?? 'item-1',
    name: overrides.name ?? 'Sword',
    type: overrides.type ?? 'weapon',
    system: {
      quantity: overrides.quantity ?? 1,
      weight: overrides.weight !== undefined ? { value: overrides.weight } : undefined,
      damage:
        overrides.damage !== undefined
          ? { base: { formula: overrides.damage }, parts: [] }
          : { parts: [] },
      properties: new Set<string>(),
    },
  };
}

/** Minimal mock of a dnd5e spell item document. */
function makeSpellItem(
  overrides: Partial<{
    id: string;
    name: string;
    level: number;
    activation: string;
    concentration: boolean;
    range: { value: number | undefined; units: string };
  }> = {},
) {
  return {
    id: overrides.id ?? 'spell-1',
    name: overrides.name ?? 'Fireball',
    type: 'spell',
    system: {
      level: overrides.level ?? 3,
      school: 'evocation',
      activation: { type: overrides.activation ?? 'action' },
      range: overrides.range ?? { value: 150, units: 'ft' },
      damage: { parts: [['8d6', 'fire']] },
      components: { concentration: overrides.concentration ?? false },
      preparation: { mode: 'prepared', prepared: true },
    },
  };
}

/**
 * Phase 16 Plan 16-02: dnd5e 5.x per-ability sub-object mock shape.
 *
 * Mirrors `actor.system.abilities.<k>` canonical shape verified by INV-2
 * cross-check (github.com/foundryvtt/dnd5e release-5.3.3 module/data/actor/
 * templates/common.mjs + dnd5e wiki Roll-Formulas, 2026-05-18). `save` is an
 * OBJECT `{value: number}` (NOT a bare number) — the reader must read
 * `save.value`. `proficient` is `0 | 0.5 | 1 | 2` (none/half/full/expertise);
 * the reader coerces 0|0.5 → false, 1|2 → true for Main tab consumption per
 * CONTEXT D-Area-2.
 */
type AbilityMockShape = {
  value?: number;
  mod?: number;
  save?: { value: number };
  proficient?: 0 | 0.5 | 1 | 2;
  dc?: number;
};

/**
 * Phase 17 Plan 17-02: dnd5e 5.x per-skill sub-object mock shape.
 *
 * Mirrors `actor.system.skills.<k>` canonical shape verified by INV-2
 * cross-check (github.com/foundryvtt/dnd5e release-5.3.3 module/data/actor/
 * templates/common.mjs + dnd5e wiki Roll-Formulas, 2026-05-18). `total` is
 * a BARE NUMBER (NOT `{value: number}` — different from Phase 16 `save`).
 * `proficient` is `0 | 0.5 | 1 | 2` (none/half/full/expertise); the reader
 * passes through verbatim (NOT coerced to boolean — Skills tab needs the
 * full glyph spectrum per UI-SPEC §3, unlike Phase 16's Main tab boolean).
 */
type SkillMockShape = {
  total?: number;
  ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  proficient?: 0 | 0.5 | 1 | 2;
  passive?: number;
};

/** 18-key dnd5e canonical skill code (Phase 17 Plan 17-02). */
type SkillMockKey =
  | 'acr'
  | 'ani'
  | 'arc'
  | 'ath'
  | 'dec'
  | 'his'
  | 'ins'
  | 'itm'
  | 'inv'
  | 'med'
  | 'nat'
  | 'prc'
  | 'prf'
  | 'per'
  | 'rel'
  | 'slt'
  | 'ste'
  | 'sur';

function makeActor(
  overrides: Partial<{
    id: string;
    name: string;
    type: string;
    hp: { value: number; max: number; temp: number | null; tempmax: number | null };
    acValue: number;
    level: number;
    statuses: Set<string>;
    exhaustion: number;
    // Phase 4b: death-saves field. `undefined` exercises the
    // nullish-coalesce defensive default in character-reader.ts (CR-DS-3).
    // To omit it entirely, pass `death: undefined` explicitly.
    death: { success: number; failure: number } | undefined;
    // Phase 5: active effects for concentration detection (CMRD-CONC-*)
    effects: ReturnType<typeof makeActiveEffect>[];
    // Phase 5 Plan 05-04: items for inventory + spells
    items: (ReturnType<typeof makeItem> | ReturnType<typeof makeSpellItem>)[];
    // Phase 5 Plan 05-04: spell slot data
    spellSlots: Record<string, { value: number; max: number }>;
    // Plan 13-03: actor portrait URL (actor.img)
    img: string | undefined;
    // Phase 16 Plan 16-02: per-ability mock overrides. Explicit `undefined`
    // is permitted (under `exactOptionalPropertyTypes`) so CR-AB-2 may pass
    // `abilities: undefined` to exercise the truly-missing defensive-default
    // branch in the reader. When the `abilities` key is absent from
    // `overrides`, `system.abilities` is omitted entirely.
    abilities:
      | Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', AbilityMockShape>>
      | undefined;
    // Phase 17 Plan 17-02: per-skill mock overrides. Explicit `undefined` is
    // permitted (under `exactOptionalPropertyTypes`) so CR-SK-2 may pass
    // `skills: undefined` to exercise the truly-missing defensive-default
    // branch. When the `skills` key is absent from `overrides`,
    // `system.skills` is omitted entirely (per-field defaults still apply
    // when a partial subset is provided).
    skills: Partial<Record<SkillMockKey, SkillMockShape>> | undefined;
    // Phase 21 Plan 21-01: initiative modifier override.
    // When absent from overrides, `system.attributes.init` is omitted entirely
    // so CR-INI-2 can test the missing-field defensive-default branch.
    initTotal: number | undefined;
    // Phase 21 Plan 21-01: walking speed override.
    // When absent from overrides, `system.attributes.movement` is omitted
    // entirely so CR-SPD-2 can test the missing-field defensive-default branch.
    movementWalk: number | undefined;
    // Phase 21 Plan 21-01: class item names.
    // When absent from overrides, items has no type==='class' entries.
    classNames: string[];
  }> = {},
) {
  const death =
    'death' in overrides
      ? overrides.death
      : ({ success: 0, failure: 0 } as { success: number; failure: number });

  // Build spell slot system shape: spell1..spell9 keys
  const spellSlotSystem: Record<string, { value: number; max: number }> =
    overrides.spellSlots ?? {};

  // Phase 16 Plan 16-02: pass `abilities` through verbatim — the reader is
  // the contract owner for defensive defaults. When `overrides.abilities` is
  // present-but-undefined, system.abilities is set to undefined so CR-AB-2
  // exercises the missing-field branch. When `abilities` is not in
  // `overrides` at all, system.abilities is omitted entirely.
  const abilitiesField = 'abilities' in overrides ? { abilities: overrides.abilities } : {};

  // Phase 17 Plan 17-02: pass `skills` through verbatim — the reader is the
  // contract owner for defensive defaults. When `overrides.skills` is
  // present-but-undefined, system.skills is set to undefined so CR-SK-2
  // exercises the missing-field branch. When `skills` is not in `overrides`
  // at all, system.skills is omitted entirely.
  const skillsField = 'skills' in overrides ? { skills: overrides.skills } : {};

  // Phase 21 Plan 21-01: initiative total — only present when `initTotal` is
  // explicitly set in overrides (exercises the missing-field branch when absent).
  const initField =
    'initTotal' in overrides && overrides.initTotal !== undefined
      ? { init: { total: overrides.initTotal } }
      : {};

  // Phase 21 Plan 21-01: movement walk speed — only present when `movementWalk`
  // is explicitly set in overrides (exercises the missing-field branch when absent).
  const movementField =
    'movementWalk' in overrides && overrides.movementWalk !== undefined
      ? { movement: { walk: overrides.movementWalk } }
      : {};

  // Phase 21 Plan 21-01: class items — injected into the items.contents array
  // alongside any inventory/spell items passed in `overrides.items`.
  const classItems = (overrides.classNames ?? []).map((name, idx) => ({
    id: `class-${idx}`,
    name,
    type: 'class',
    system: {},
  }));

  const allItems = [...classItems, ...(overrides.items ?? [])];

  return {
    id: overrides.id ?? 'actor-1',
    name: overrides.name ?? 'Aragorn',
    type: overrides.type ?? 'character',
    system: {
      attributes: {
        hp: overrides.hp ?? { value: 42, max: 50, temp: 5, tempmax: 0 },
        ac: { value: overrides.acValue ?? 18 },
        exhaustion: overrides.exhaustion ?? 0,
        death,
        ...initField,
        ...movementField,
      },
      details: {
        level: overrides.level ?? 5,
      },
      spells: spellSlotSystem,
      ...abilitiesField,
      ...skillsField,
    },
    statuses: overrides.statuses ?? new Set<string>(),
    effects: { contents: overrides.effects ?? [] },
    items: { contents: allItems },
    // img is optional — omit key entirely if undefined to exercise the absence guard
    ...('img' in overrides && overrides.img !== undefined ? { img: overrides.img } : {}),
  };
}

function makeGameMock(
  actors: ReturnType<typeof makeActor>[] = [],
  combat: unknown = null,
  activeScene: unknown = null,
) {
  const actorMap = new Map(actors.map((a) => [a.id, a]));
  return {
    actors: {
      get: (id: string) => actorMap.get(id),
      contents: actors,
    },
    combat,
    scenes: {
      active: activeScene,
    },
    user: {
      id: 'user-1',
      targets: new Set<unknown>(),
    },
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    i18n: { lang: 'en', localize: (k: string) => k },
  };
}

// ─── Character reader tests ────────────────────────────────────────────────────

describe('getCharacterSnapshot', () => {
  let getCharacterSnapshot: typeof import('./character-reader.js').getCharacterSnapshot;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./character-reader.js');
    getCharacterSnapshot = mod.getCharacterSnapshot;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when actor not found', () => {
    vi.stubGlobal('game', makeGameMock([]));
    expect(getCharacterSnapshot('missing-id')).toBeNull();
  });

  it('returns null when actor type is not "character"', () => {
    const npc = makeActor({ id: 'npc-1', type: 'npc' });
    vi.stubGlobal('game', makeGameMock([npc]));
    expect(getCharacterSnapshot('npc-1')).toBeNull();
  });

  it('returns correct CharacterSnapshot for a PC actor', () => {
    const actor = makeActor({
      id: 'hero-1',
      name: 'Legolas',
      hp: { value: 30, max: 40, temp: 0, tempmax: 0 },
      acValue: 15,
      level: 7,
      statuses: new Set(['poisoned']),
      exhaustion: 1,
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('hero-1');
    expect(snap).not.toBeNull();
    expect(snap?.actorId).toBe('hero-1');
    expect(snap?.name).toBe('Legolas');
    expect(snap?.hp).toBe(30);
    expect(snap?.maxHp).toBe(40);
    expect(snap?.tempHp).toBe(0);
    expect(snap?.ac).toBe(15);
    expect(snap?.level).toBe(7);
    expect(snap?.conditions).toEqual(['poisoned']);
    expect(snap?.exhaustion).toBe(1);
    // Phase 5: world.modernRules defaults to false when rulesVersion is not 'modern'
    expect(snap?.world.modernRules).toBe(false);
  });

  it('coerces null hp.temp to 0 (dnd5e leaves temp null with no temporary HP)', () => {
    // Regression: dnd5e sets hp.temp to null (NOT 0) when an actor has no temp HP.
    // The bridge's CharacterSnapshotSchema requires tempHp: number().nonnegative(),
    // so a passthrough null made the bridge silently drop the WHOLE snapshot
    // (POST /internal/delta → 200, but GET /v1/character/:id → 404). character-reader
    // must coerce null → 0.
    const actor = makeActor({
      id: 'hero-null-temp',
      name: 'Shin',
      hp: { value: 81, max: 81, temp: null, tempmax: null },
      acValue: 18,
      level: 11,
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('hero-null-temp');
    expect(snap).not.toBeNull();
    expect(snap?.tempHp).toBe(0);
  });

  it('includes multiple conditions from statuses Set', () => {
    const actor = makeActor({
      statuses: new Set(['poisoned', 'prone', 'blinded']),
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('actor-1');
    expect(snap?.conditions).toHaveLength(3);
    expect(snap?.conditions).toContain('poisoned');
    expect(snap?.conditions).toContain('prone');
    expect(snap?.conditions).toContain('blinded');
  });

  it('returns empty conditions array when statuses is empty', () => {
    const actor = makeActor({ statuses: new Set() });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('actor-1');
    expect(snap?.conditions).toEqual([]);
  });

  // ── Phase 4b: death-saves extension (CR-DS-1..CR-DS-5) ─────────────────────

  it('CR-DS-1: emits death={success:0,failure:0} for an idle actor', () => {
    const actor = makeActor({ id: 'pc-1', death: { success: 0, failure: 0 } });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-1');
    expect(snap?.death).toEqual({ success: 0, failure: 0 });
  });

  it('CR-DS-2: emits death.failure=2 when actor.system.attributes.death.failure=2', () => {
    const actor = makeActor({ id: 'pc-2', death: { success: 1, failure: 2 } });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-2');
    expect(snap?.death.success).toBe(1);
    expect(snap?.death.failure).toBe(2);
  });

  it('CR-DS-3: defaults death to {success:0,failure:0} when actor.system.attributes.death is undefined', () => {
    // Fresh dnd5e actors may have attributes.death undefined until the first
    // death save is rolled — the reader's nullish-coalesce defends.
    const actor = makeActor({ id: 'pc-3', death: undefined });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-3');
    expect(snap?.death).toEqual({ success: 0, failure: 0 });
  });

  it('CR-DS-4: returned snapshot satisfies CharacterSnapshotSchema (round-trip)', async () => {
    const actor = makeActor({ id: 'pc-4', death: { success: 2, failure: 1 } });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-4');
    expect(snap).not.toBeNull();
    // Round-trip through the canonical schema — proves no missing or extra
    // fields and that the death values flow through unmodified.
    const { CharacterSnapshotSchema } = await import('@evf/shared-protocol');
    const result = CharacterSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(true);
  });

  it('CR-DS-5: existing HP/AC/level fields preserved after death-field addition (regression-safe)', () => {
    const actor = makeActor({
      id: 'pc-5',
      hp: { value: 21, max: 30, temp: 4, tempmax: 0 },
      acValue: 19,
      level: 6,
      death: { success: 0, failure: 0 },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-5');
    expect(snap?.hp).toBe(21);
    expect(snap?.maxHp).toBe(30);
    expect(snap?.tempHp).toBe(4);
    expect(snap?.ac).toBe(19);
    expect(snap?.level).toBe(6);
  });

  // ── Phase 5: world.modernRules extension (CHRD-MR-1..3) ──────────────────

  it('CHRD-MR-1: rulesVersion="modern" → world.modernRules === true', () => {
    const actor = makeActor({ id: 'pc-mr-1' });
    const gameMock = makeGameMock([actor]);
    gameMock.settings.get.mockReturnValue('modern');
    vi.stubGlobal('game', gameMock);

    const snap = getCharacterSnapshot('pc-mr-1');
    expect(snap?.world.modernRules).toBe(true);
  });

  it('CHRD-MR-2: rulesVersion="legacy" → world.modernRules === false', () => {
    const actor = makeActor({ id: 'pc-mr-2' });
    const gameMock = makeGameMock([actor]);
    gameMock.settings.get.mockReturnValue('legacy');
    vi.stubGlobal('game', gameMock);

    const snap = getCharacterSnapshot('pc-mr-2');
    expect(snap?.world.modernRules).toBe(false);
  });

  it('CHRD-MR-3: rulesVersion=undefined (fresh world) → world.modernRules === false', () => {
    const actor = makeActor({ id: 'pc-mr-3' });
    const gameMock = makeGameMock([actor]);
    gameMock.settings.get.mockReturnValue(undefined);
    vi.stubGlobal('game', gameMock);

    const snap = getCharacterSnapshot('pc-mr-3');
    expect(snap?.world.modernRules).toBe(false);
  });

  // ── Phase 5 Plan 05-04: inventory extension (CHRD-INV-1..5) ─────────────

  it('CHRD-INV-1: actor with no items → empty inventory array', () => {
    const actor = makeActor({ id: 'pc-inv-1', items: [] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-inv-1');
    expect(snap?.inventory).toEqual([]);
  });

  it('CHRD-INV-2: actor with a weapon item → inventory has one weapon entry', () => {
    const sword = makeItem({
      id: 'sword-1',
      name: 'Spada lunga',
      type: 'weapon',
      damage: '1d8 sl',
    });
    const actor = makeActor({ id: 'pc-inv-2', items: [sword] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-inv-2');
    expect(snap?.inventory).toHaveLength(1);
    expect(snap?.inventory[0]?.name).toBe('Spada lunga');
    expect(snap?.inventory[0]?.type).toBe('weapon');
  });

  it('CHRD-INV-3: actor with mixed items (weapon + consumable) → multiple inventory entries', () => {
    const sword = makeItem({ id: 'sword-1', name: 'Spada', type: 'weapon' });
    const potion = makeItem({ id: 'pot-1', name: 'Pozione', type: 'consumable', quantity: 3 });
    const actor = makeActor({ id: 'pc-inv-3', items: [sword, potion] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-inv-3');
    expect(snap?.inventory).toHaveLength(2);
  });

  it('CHRD-INV-4: snapshot round-trips through CharacterSnapshotSchema when inventory is populated', async () => {
    const sword = makeItem({ id: 'sword-rt', name: 'Spada', type: 'weapon' });
    const actor = makeActor({ id: 'pc-inv-4', items: [sword] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-inv-4');
    const { CharacterSnapshotSchema } = await import('@evf/shared-protocol');
    const result = CharacterSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(true);
  });

  it('CHRD-INV-5: actor with a spell item → spell excluded from inventory', () => {
    const spell = makeSpellItem({ id: 'sp-1', name: 'Fireball' });
    const actor = makeActor({ id: 'pc-inv-5', items: [spell] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-inv-5');
    // Spells should NOT appear in inventory
    expect(snap?.inventory).toHaveLength(0);
  });

  // ── CR-STABLE-ID: id-less items get a STABLE deterministic fallback id ─────
  // Regression: the old `String(Math.random())` fallback gave the same id-less
  // item a different id on every snapshot, defeating g2-app diff/dedup.

  it('CR-STABLE-ID-1: id-less inventory item yields the SAME id across two extractions', () => {
    // makeItem always injects an id; build the id-less item inline. Cast to the
    // mock item shape (the reader reads `id` defensively as `string | undefined`).
    const makeIdless = () =>
      ({
        name: 'Torcia',
        type: 'consumable',
        system: { quantity: 1, damage: { parts: [] }, properties: new Set<string>() },
      }) as unknown as ReturnType<typeof makeItem>;

    const actorA = makeActor({ id: 'pc-stable-1', items: [makeIdless()] });
    vi.stubGlobal('game', makeGameMock([actorA]));
    const snapA = getCharacterSnapshot('pc-stable-1');

    const actorB = makeActor({ id: 'pc-stable-1', items: [makeIdless()] });
    vi.stubGlobal('game', makeGameMock([actorB]));
    const snapB = getCharacterSnapshot('pc-stable-1');

    const idA = snapA?.inventory[0]?.id;
    const idB = snapB?.inventory[0]?.id;
    expect(idA).toBeDefined();
    expect(idA).toBe(idB);
    expect(idA).toMatch(/^evf-[0-9a-f]{8}$/);
  });

  it('CR-STABLE-ID-2: id-less spell yields the SAME id across two extractions', () => {
    const makeIdlessSpell = () =>
      ({
        name: 'Dardo Incantato',
        type: 'spell',
        system: {
          level: 1,
          school: 'evocation',
          activation: { type: 'action' },
          range: { value: 36, units: 'ft' },
          damage: { parts: [['1d4+1', 'force']] },
          components: { concentration: false },
          preparation: { mode: 'prepared', prepared: true },
        },
      }) as unknown as ReturnType<typeof makeSpellItem>;

    const actorA = makeActor({ id: 'pc-stable-2', items: [makeIdlessSpell()] });
    vi.stubGlobal('game', makeGameMock([actorA]));
    const idA = getCharacterSnapshot('pc-stable-2')?.spells.spells[0]?.id;

    const actorB = makeActor({ id: 'pc-stable-2', items: [makeIdlessSpell()] });
    vi.stubGlobal('game', makeGameMock([actorB]));
    const idB = getCharacterSnapshot('pc-stable-2')?.spells.spells[0]?.id;

    expect(idA).toBeDefined();
    expect(idA).toBe(idB);
    expect(idA).toMatch(/^evf-[0-9a-f]{8}$/);
  });

  // ── CR-02 regression: damage-formula ternary fix ──────────────────────────

  it('CR-02-BASE-FORMULA: base.formula present → damage field uses base.formula value, not parts[0]', () => {
    // dnd5e 5.x modern field: damage.base.formula = '1d8+3'; parts = [['1d6','fire']]
    // Before fix: ternary used parts[0] ('1d6,fire') even when base.formula was set.
    // After fix: base.formula takes precedence.
    const sword = {
      id: 'sword-cr02',
      name: 'Longsword',
      type: 'weapon',
      system: {
        quantity: 1,
        weight: undefined,
        damage: {
          base: { formula: '1d8+3' },
          parts: [['1d6', 'fire']], // should be ignored when base.formula present
        },
        properties: new Set<string>(),
      },
    };
    const actor = makeActor({
      id: 'pc-cr02-1',
      items: [sword as unknown as ReturnType<typeof makeItem>],
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-cr02-1');
    const item = snap?.inventory[0];
    expect(item).toBeDefined();
    // Must use base.formula '1d8+3', not parts[0] which would stringify to '1d6,fire'
    expect(item?.damage).toBe('1d8+3');
    expect(item?.damage).not.toContain('1d6');
  });

  it('CR-02-PARTS-FALLBACK: base.formula absent → falls back to parts[0]', () => {
    // Legacy dnd5e items use parts array; base.formula is undefined.
    const bow = {
      id: 'bow-cr02',
      name: 'Shortbow',
      type: 'weapon',
      system: {
        quantity: 1,
        weight: undefined,
        damage: {
          base: { formula: undefined },
          parts: [['1d6', 'piercing']],
        },
        properties: new Set<string>(),
      },
    };
    const actor = makeActor({
      id: 'pc-cr02-2',
      items: [bow as unknown as ReturnType<typeof makeItem>],
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-cr02-2');
    const item = snap?.inventory[0];
    expect(item).toBeDefined();
    // parts[0] stringified as '1d6,piercing' (tuple join)
    expect(item?.damage).toContain('1d6');
  });

  it('CR-02-NO-DAMAGE: no base.formula and no parts → damage field absent', () => {
    const shield = {
      id: 'shield-cr02',
      name: 'Shield',
      type: 'armor',
      system: {
        quantity: 1,
        weight: undefined,
        damage: { base: {}, parts: [] },
        properties: new Set<string>(),
      },
    };
    const actor = makeActor({
      id: 'pc-cr02-3',
      items: [shield as unknown as ReturnType<typeof makeItem>],
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-cr02-3');
    const item = snap?.inventory[0];
    expect(item).toBeDefined();
    expect(item?.damage).toBeUndefined();
  });

  // ── WR-03 regression: dead spell-type guard removed ──────────────────────

  it('WR-03-SPELL-EXCLUSION: spell items excluded via null-guard from mapItemType (not dead code)', () => {
    // 'spell' is not in INVENTORY_ITEM_TYPES → mapItemType returns null → continue.
    // The old dead code `if (type === ('spell' as string)) continue` was unreachable.
    // This test verifies exclusion still works without the dead guard.
    const spell = makeSpellItem({ id: 'sp-wr03', name: 'Cure Wounds' });
    const sword = makeItem({ id: 'sw-wr03', name: 'Sword', type: 'weapon' });
    const actor = makeActor({ id: 'pc-wr03', items: [spell, sword] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-wr03');
    // Only the weapon appears; spell is excluded
    expect(snap?.inventory).toHaveLength(1);
    expect(snap?.inventory[0]?.name).toBe('Sword');
  });

  // ── Phase 5 Plan 05-04: spells extension (CHRD-SPL-1..5) ─────────────────

  it('CHRD-SPL-1: actor with no spell items and no slots → empty spellbook', () => {
    const actor = makeActor({ id: 'pc-spl-1', items: [], spellSlots: {} });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-spl-1');
    expect(snap?.spells.slots).toHaveLength(0);
    expect(snap?.spells.spells).toHaveLength(0);
  });

  it('CHRD-SPL-2: actor with spell slots → slots populated correctly', () => {
    const actor = makeActor({
      id: 'pc-spl-2',
      spellSlots: {
        spell1: { value: 2, max: 4 },
        spell2: { value: 1, max: 3 },
      },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-spl-2');
    expect(snap?.spells.slots.length).toBeGreaterThan(0);
    const l1 = snap?.spells.slots.find((s) => s.level === 1);
    expect(l1?.value).toBe(2);
    expect(l1?.max).toBe(4);
  });

  it('CHRD-SPL-3: actor with a spell item → spell appears in spellbook', () => {
    const fireball = makeSpellItem({ id: 'fb-1', name: 'Fireball', level: 3 });
    const actor = makeActor({ id: 'pc-spl-3', items: [fireball] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-spl-3');
    expect(snap?.spells.spells).toHaveLength(1);
    expect(snap?.spells.spells[0]?.name).toBe('Fireball');
    expect(snap?.spells.spells[0]?.level).toBe(3);
  });

  it('CHRD-SPL-DEP51: reads dnd5e 5.1 method/prepared fields (no deprecated `preparation` object)', () => {
    // dnd5e 5.1 moved SpellData#preparation.{mode,prepared} → SpellData#{method,prepared}.
    // A spell with ONLY the new fields (no `preparation`) must still extract — proving
    // the reader no longer depends on the deprecated getter.
    // Deliberately the dnd5e 5.1+ shape (method/prepared, NO `preparation`/`damage`);
    // cast through unknown since it intentionally differs from the legacy mock shape.
    const modernSpell = {
      id: 'sp-51',
      name: 'Misty Step',
      type: 'spell',
      system: {
        level: 2,
        school: 'con',
        activation: { type: 'bonus' },
        range: { value: 0, units: 'self' },
        components: { concentration: false },
        method: 'prepared',
        prepared: true,
      },
    } as unknown as ReturnType<typeof makeSpellItem>;
    const actor = makeActor({ id: 'pc-spl-51', items: [modernSpell] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-spl-51');
    expect(snap?.spells.spells).toHaveLength(1);
    expect(snap?.spells.spells[0]?.name).toBe('Misty Step');
    expect(snap?.spells.spells[0]?.level).toBe(2);
  });

  it('CHRD-SPL-4: concentration spell carries concentration=true flag (RESEARCH assumption A2)', () => {
    const conc = makeSpellItem({ id: 'conc-sp', name: 'Bless', concentration: true });
    const actor = makeActor({ id: 'pc-spl-4', items: [conc] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-spl-4');
    expect(snap?.spells.spells[0]?.concentration).toBe(true);
  });

  it('CHRD-SPL-RANGE-0: range.value 0 with a non-self/non-touch unit → "--" (not "0m")', () => {
    const noRange = makeSpellItem({
      id: 'sp-r0',
      name: 'Sacred Flame',
      range: { value: 0, units: 'ft' },
    });
    const actor = makeActor({ id: 'pc-r0', items: [noRange] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-r0');
    expect(snap?.spells.spells[0]?.range).toBe('--');
  });

  it('CHRD-SPL-RANGE-POS: positive range.value → "{value}m"', () => {
    const ranged = makeSpellItem({
      id: 'sp-r150',
      name: 'Fireball',
      range: { value: 150, units: 'ft' },
    });
    const actor = makeActor({ id: 'pc-r150', items: [ranged] });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-r150');
    expect(snap?.spells.spells[0]?.range).toBe('150m');
  });

  it('CHRD-SPL-5: snapshot round-trips through CharacterSnapshotSchema when spells populated', async () => {
    const fireball = makeSpellItem({ id: 'fb-rt', name: 'Fireball', level: 3 });
    const actor = makeActor({
      id: 'pc-spl-5',
      items: [fireball],
      spellSlots: { spell3: { value: 2, max: 3 } },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-spl-5');
    const { CharacterSnapshotSchema } = await import('@evf/shared-protocol');
    const result = CharacterSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(true);
  });

  // ── Phase 16 Plan 16-02: abilities extension (CR-AB-1..5) ─────────────────
  //
  // Producer-half of SHEET-06. The reader emits `snapshot.abilities` as a
  // REQUIRED 6-key container with per-ability `{value, mod, save, proficient, dc}`.
  // dnd5e canonical shape verified by INV-2 cross-check 2026-05-18: `save` is
  // `{value: number}` (read `.value`), `proficient` is `0|0.5|1|2` (coerce
  // 0|0.5 → false, 1|2 → true per CONTEXT D-Area-2). Defensive defaults for
  // fresh actors lacking `system.abilities` emit 6× `{value:10, mod:0, save:0,
  // proficient:false, dc:10}` mirroring the Phase 4b death-saves pattern.

  it('CR-AB-1: canonical dnd5e abilities (Thorin spread) → snapshot.abilities populated correctly', () => {
    // Thorin Oakenshield Lv5 fighter — Specs.md §7.5.2 canonical character.
    // STR 16/+3/+5 PROF, DEX 14/+2/+2, CON 14/+2/+5 PROF, INT 18/+4/+4,
    // WIS 12/+1/+1, CHA 8/-1/-1.
    const actor = makeActor({
      id: 'pc-ab-1',
      abilities: {
        str: { value: 16, mod: 3, save: { value: 5 }, proficient: 1, dc: 8 },
        dex: { value: 14, mod: 2, save: { value: 2 }, proficient: 0, dc: 8 },
        con: { value: 14, mod: 2, save: { value: 5 }, proficient: 1, dc: 8 },
        int: { value: 18, mod: 4, save: { value: 4 }, proficient: 0, dc: 8 },
        wis: { value: 12, mod: 1, save: { value: 1 }, proficient: 0, dc: 8 },
        cha: { value: 8, mod: -1, save: { value: -1 }, proficient: 0, dc: 8 },
      },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-ab-1');
    expect(snap).not.toBeNull();
    // STR row — prof bonus applies, save = mod + prof
    expect(snap?.abilities.str).toEqual({
      value: 16,
      mod: 3,
      save: 5,
      proficient: true,
      dc: 8,
    });
    // CHA row — negative mod and save
    expect(snap?.abilities.cha.value).toBe(8);
    expect(snap?.abilities.cha.mod).toBe(-1);
    expect(snap?.abilities.cha.save).toBe(-1);
    expect(snap?.abilities.cha.proficient).toBe(false);
    // CON row — second proficient save
    expect(snap?.abilities.con.proficient).toBe(true);
    expect(snap?.abilities.con.save).toBe(5);
    // DEX row — not prof
    expect(snap?.abilities.dex.proficient).toBe(false);
  });

  it('CR-AB-2: missing actor.system.abilities → defensive zero-defaults (6 × {10,0,0,false,10})', () => {
    // Fresh dnd5e actor — prep not yet run; system.abilities may be undefined.
    // Reader emits 6 zero-default ability scores instead of throwing.
    const actor = makeActor({ id: 'pc-ab-2', abilities: undefined });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-ab-2');
    expect(snap).not.toBeNull();
    const zero = { value: 10, mod: 0, save: 0, proficient: false, dc: 10 };
    expect(snap?.abilities.str).toEqual(zero);
    expect(snap?.abilities.dex).toEqual(zero);
    expect(snap?.abilities.con).toEqual(zero);
    expect(snap?.abilities.int).toEqual(zero);
    expect(snap?.abilities.wis).toEqual(zero);
    expect(snap?.abilities.cha).toEqual(zero);
  });

  it('CR-AB-3: proficient=0.5 (half-prof) → coerced to false on Main tab', () => {
    // dnd5e Jack of All Trades / Bard Expertise half-step. CONTEXT
    // §domain "Explicitly out of scope" — Main tab uses boolean; Phase 17
    // Skills tab will introduce the full glyph spectrum (○/◉/◈).
    const actor = makeActor({
      id: 'pc-ab-3',
      abilities: {
        str: { value: 14, mod: 2, save: { value: 3 }, proficient: 0.5, dc: 10 },
        dex: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
        con: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
        int: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
        wis: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
        cha: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
      },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-ab-3');
    expect(snap?.abilities.str.proficient).toBe(false);
    expect(snap?.abilities.str.value).toBe(14);
    expect(snap?.abilities.str.mod).toBe(2);
  });

  it('CR-AB-4: proficient=2 (expertise) → coerced to true on Main tab', () => {
    // dnd5e Rogue/Bard Expertise. CONTEXT D-Area-2: `proficient` strict
    // equality with `1 || 2` → true; `0 || 0.5` → false. Phase 17 will
    // distinguish expertise (◉ vs ◈) on the Skills tab.
    const actor = makeActor({
      id: 'pc-ab-4',
      abilities: {
        str: { value: 18, mod: 4, save: { value: 7 }, proficient: 2, dc: 12 },
        dex: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
        con: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
        int: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
        wis: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
        cha: { value: 10, mod: 0, save: { value: 0 }, proficient: 0, dc: 10 },
      },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-ab-4');
    expect(snap?.abilities.str.proficient).toBe(true);
    expect(snap?.abilities.str.value).toBe(18);
    expect(snap?.abilities.str.save).toBe(7);
  });

  it('CR-AB-5: full snapshot round-trips through CharacterSnapshotSchema (Wave-1→Wave-2 atomic close)', async () => {
    // Closes the atomic-extension loop: Plan 16-01 made `abilities` REQUIRED
    // on the schema; Plan 16-02 makes the reader emit it. Together they
    // guarantee every snapshot round-trips clean.
    const actor = makeActor({
      id: 'pc-ab-5',
      abilities: {
        str: { value: 16, mod: 3, save: { value: 5 }, proficient: 1, dc: 8 },
        dex: { value: 14, mod: 2, save: { value: 2 }, proficient: 0, dc: 8 },
        con: { value: 14, mod: 2, save: { value: 5 }, proficient: 1, dc: 8 },
        int: { value: 18, mod: 4, save: { value: 4 }, proficient: 0, dc: 8 },
        wis: { value: 12, mod: 1, save: { value: 1 }, proficient: 0, dc: 8 },
        cha: { value: 8, mod: -1, save: { value: -1 }, proficient: 0, dc: 8 },
      },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-ab-5');
    expect(snap).not.toBeNull();
    const { CharacterSnapshotSchema } = await import('@evf/shared-protocol');
    const result = CharacterSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(true);
  });

  // ── Phase 17 Plan 17-02: skills extension (CR-SK-1..6) ──────────────────
  //
  // Producer-half of SHEET-09. The reader emits `snapshot.skills` as a
  // REQUIRED 18-key container with per-skill `{total, ability, proficient, passive}`.
  // dnd5e canonical shape verified by INV-2 cross-check 2026-05-18: `total`
  // is a BARE NUMBER (NOT `{value: number}` — different from Phase 16 `save`);
  // `proficient` is `0|0.5|1|2` and the reader passes through verbatim (NOT
  // coerced to boolean — Skills tab needs the full glyph spectrum ○/◉/★ per
  // UI-SPEC §3, unlike Phase 16's Main tab boolean). `passive` is the dnd5e
  // prep-time computed value read directly (NOT recomputed as 10 + total —
  // Observant feat / magic items may diverge). Defensive defaults for fresh
  // actors lacking `system.skills` emit 18× `{total:0, ability:<canonical
  // default per SKILL_DEFAULT_ABILITY>, proficient:0, passive:10}` mirroring
  // the Phase 4b death-saves / Phase 16 abilities pattern.

  /**
   * Canonical Thorin Oakenshield skills spread (Specs.md §7.5.3 + existing
   * DEFAULT_SKILLS renderer). Lv 8 fighter — Athletics +6 (prof, STR),
   * Insight +1 (WIS), Investigation total 0 / passive 14 (INT 18 → 10+4),
   * Perception/Insight passive 11 (Wis 12 +1 → 10+1).
   */
  function thorinSkills(): Partial<Record<SkillMockKey, SkillMockShape>> {
    return {
      acr: { total: 2, ability: 'dex', proficient: 0, passive: 12 },
      ani: { total: 4, ability: 'wis', proficient: 1, passive: 14 },
      arc: { total: 0, ability: 'int', proficient: 0, passive: 14 },
      ath: { total: 6, ability: 'str', proficient: 1, passive: 16 },
      dec: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
      his: { total: 0, ability: 'int', proficient: 0, passive: 14 },
      ins: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
      itm: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
      inv: { total: 0, ability: 'int', proficient: 0, passive: 14 },
      med: { total: 4, ability: 'wis', proficient: 1, passive: 14 },
      nat: { total: 0, ability: 'int', proficient: 0, passive: 14 },
      prc: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
      prf: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
      per: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
      rel: { total: 0, ability: 'int', proficient: 0, passive: 14 },
      slt: { total: 2, ability: 'dex', proficient: 0, passive: 12 },
      ste: { total: 2, ability: 'dex', proficient: 0, passive: 12 },
      sur: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
    };
  }

  it('CR-SK-1: canonical dnd5e skills (Thorin spread) → snapshot.skills populated correctly', () => {
    // Thorin Oakenshield Lv8 fighter — Specs.md §7.5.3 canonical spread.
    // Athletics +6 proficient, Investigation passive 14 (INT 18 driver),
    // Perception/Insight passive 11 (WIS 12 +1 = 10+1).
    const actor = makeActor({
      id: 'pc-sk-1',
      skills: thorinSkills(),
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-sk-1');
    expect(snap).not.toBeNull();
    // Athletics — proficient STR-based, total +6, passive 16
    expect(snap?.skills.ath).toEqual({
      total: 6,
      ability: 'str',
      proficient: 1,
      passive: 16,
    });
    // Investigation — total 0 but passive 14 (the divergence Main tab surfaces)
    expect(snap?.skills.inv.total).toBe(0);
    expect(snap?.skills.inv.passive).toBe(14);
    expect(snap?.skills.inv.ability).toBe('int');
    // Perception — wisdom-based, passive 11 (10 + WIS mod 1)
    expect(snap?.skills.prc.passive).toBe(11);
    expect(snap?.skills.prc.ability).toBe('wis');
    // Insight — wisdom-based, passive 11 (Main tab senses line)
    expect(snap?.skills.ins.passive).toBe(11);
    // Animal Handling — proficient WIS-based, total +4
    expect(snap?.skills.ani.proficient).toBe(1);
    expect(snap?.skills.ani.total).toBe(4);
  });

  it('CR-SK-2: missing actor.system.skills → 18 defensive zero-defaults with SKILL_DEFAULT_ABILITY map', () => {
    // Fresh dnd5e actor — prep not yet run; system.skills may be undefined.
    // Reader emits 18 zero-default skills with canonical default ability per
    // SKILL_DEFAULT_ABILITY (acr→dex, ath→str, prc→wis, etc.) instead of throwing.
    const actor = makeActor({ id: 'pc-sk-2', skills: undefined });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-sk-2');
    expect(snap).not.toBeNull();
    // SKILL_DEFAULT_ABILITY mapping correctness — gate for the static map.
    expect(snap?.skills.acr.ability).toBe('dex'); // Acrobatics
    expect(snap?.skills.ath.ability).toBe('str'); // Athletics
    expect(snap?.skills.prc.ability).toBe('wis'); // Perception
    expect(snap?.skills.arc.ability).toBe('int'); // Arcana
    expect(snap?.skills.dec.ability).toBe('cha'); // Deception
    expect(snap?.skills.ste.ability).toBe('dex'); // Stealth
    expect(snap?.skills.sur.ability).toBe('wis'); // Survival
    // Defensive default values — all 18 entries present with zero defaults
    const zeroAcr = { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 };
    expect(snap?.skills.acr).toEqual(zeroAcr);
    // Verify all 18 keys present (no missing key — closed enum at schema layer)
    const expectedKeys = [
      'acr',
      'ani',
      'arc',
      'ath',
      'dec',
      'his',
      'ins',
      'itm',
      'inv',
      'med',
      'nat',
      'prc',
      'prf',
      'per',
      'rel',
      'slt',
      'ste',
      'sur',
    ] as const;
    for (const key of expectedKeys) {
      expect(snap?.skills[key]).toBeDefined();
      expect(snap?.skills[key]?.total).toBe(0);
      expect(snap?.skills[key]?.proficient).toBe(0);
      expect(snap?.skills[key]?.passive).toBe(10);
    }
  });

  it('CR-SK-3: proficient=0.5 (half-prof) → preserved verbatim (NO boolean coercion)', () => {
    // Bard Jack of All Trades / racial half-prof feature. Phase 17 Skills tab
    // needs the full glyph spectrum (○/◉/★) per UI-SPEC §3 — the renderer is
    // responsible for half-prof glyph round-up at render time, the reader
    // passes the raw enum through verbatim.
    const actor = makeActor({
      id: 'pc-sk-3',
      skills: {
        acr: { total: 3, ability: 'dex', proficient: 0.5, passive: 13 },
      },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-sk-3');
    expect(snap).not.toBeNull();
    // Verbatim pass-through — must NOT be boolean true/false, must be 0.5.
    expect(snap?.skills.acr.proficient).toBe(0.5);
    expect(snap?.skills.acr.total).toBe(3);
    expect(snap?.skills.acr.ability).toBe('dex');
    expect(snap?.skills.acr.passive).toBe(13);
  });

  it('CR-SK-4: proficient=2 (expertise) → preserved verbatim (★ glyph at render time)', () => {
    // Rogue/Bard Expertise. Phase 17 distinguishes expertise (★) from full
    // proficiency (◉) at render time — the reader emits the raw enum.
    const actor = makeActor({
      id: 'pc-sk-4',
      skills: {
        ath: { total: 8, ability: 'str', proficient: 2, passive: 18 },
      },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-sk-4');
    expect(snap).not.toBeNull();
    // Verbatim pass-through — expertise = 2, not coerced to 1 or true.
    expect(snap?.skills.ath.proficient).toBe(2);
    expect(snap?.skills.ath.total).toBe(8);
  });

  it('CR-SK-5: passive read-through (NOT recomputed from 10 + total)', () => {
    // Observant feat / magic item bonuses make dnd5e's prep-time `passive`
    // diverge from the naive `10 + total` formula. The reader must read
    // `passive` directly, never recompute it. CONTEXT §Area 2: "Read passive
    // directly".
    const actor = makeActor({
      id: 'pc-sk-5',
      skills: {
        prc: { total: 1, ability: 'wis', proficient: 0, passive: 18 },
      },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-sk-5');
    expect(snap).not.toBeNull();
    // passive=18 even though total=1 (Observant +5 would give 10+1+5 = 16;
    // here we test 18 to assert the reader doesn't recompute via 10+total).
    expect(snap?.skills.prc.passive).toBe(18);
    expect(snap?.skills.prc.total).toBe(1);
  });

  it('CR-SK-6: full snapshot with skills round-trips through CharacterSnapshotSchema (Wave-1→Wave-2 atomic close)', async () => {
    // Closes the Plan 17-01 → Plan 17-02 atomic loop: Plan 17-01 made `skills`
    // REQUIRED on the schema; Plan 17-02 makes the reader emit it. Together
    // they guarantee every snapshot round-trips clean.
    const actor = makeActor({
      id: 'pc-sk-6',
      abilities: {
        str: { value: 16, mod: 3, save: { value: 5 }, proficient: 1, dc: 8 },
        dex: { value: 14, mod: 2, save: { value: 2 }, proficient: 0, dc: 8 },
        con: { value: 14, mod: 2, save: { value: 5 }, proficient: 1, dc: 8 },
        int: { value: 18, mod: 4, save: { value: 4 }, proficient: 0, dc: 8 },
        wis: { value: 12, mod: 1, save: { value: 1 }, proficient: 0, dc: 8 },
        cha: { value: 8, mod: -1, save: { value: -1 }, proficient: 0, dc: 8 },
      },
      skills: thorinSkills(),
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-sk-6');
    expect(snap).not.toBeNull();
    const { CharacterSnapshotSchema } = await import('@evf/shared-protocol');
    const result = CharacterSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(true);
  });

  // ── CR-PORT: Plan 13-03 portrait passthrough tests ────────────────────────

  it('CR-PORT-01: actor with img → portrait.url surfaced in snapshot', async () => {
    vi.stubGlobal(
      'game',
      makeGameMock([makeActor({ id: 'pc-port-1', img: 'worlds/my-world/portraits/thorin.webp' })]),
    );

    const snap = getCharacterSnapshot('pc-port-1');
    expect(snap).not.toBeNull();
    expect(snap?.portrait?.url).toBe('worlds/my-world/portraits/thorin.webp');
  });

  it('CR-PORT-02: actor with empty-string img → portrait field omitted', async () => {
    vi.stubGlobal('game', makeGameMock([makeActor({ id: 'pc-port-2', img: '' })]));

    const snap = getCharacterSnapshot('pc-port-2');
    expect(snap).not.toBeNull();
    expect(snap?.portrait).toBeUndefined();
  });

  it('CR-PORT-03: actor with no img field → portrait field omitted', async () => {
    vi.stubGlobal(
      'game',
      makeGameMock([makeActor({ id: 'pc-port-3' })]), // no img override
    );

    const snap = getCharacterSnapshot('pc-port-3');
    expect(snap).not.toBeNull();
    expect(snap?.portrait).toBeUndefined();
  });

  // ── Phase 21 Plan 21-01: class reader (CR-CLS-1..4) ───────────────────────

  it('CR-CLS-1: single class item → snapshot.class = class name', () => {
    // Standard single-class actor: one item with type==='class'.
    vi.stubGlobal('game', makeGameMock([makeActor({ id: 'pc-cls-1', classNames: ['Fighter'] })]));

    const snap = getCharacterSnapshot('pc-cls-1');
    expect(snap).not.toBeNull();
    expect(snap?.class).toBe('Fighter');
  });

  it('CR-CLS-2: two class items → snapshot.class = "Fighter / Wizard" (multiclass)', () => {
    // Multiclass: two type==='class' items joined by ' / '.
    vi.stubGlobal(
      'game',
      makeGameMock([makeActor({ id: 'pc-cls-2', classNames: ['Fighter', 'Wizard'] })]),
    );

    const snap = getCharacterSnapshot('pc-cls-2');
    expect(snap).not.toBeNull();
    expect(snap?.class).toBe('Fighter / Wizard');
  });

  it('CR-CLS-3: no class items → snapshot.class = "" (classless / fresh actor)', () => {
    // Fresh actor with no items of type==='class': empty string.
    vi.stubGlobal(
      'game',
      makeGameMock([makeActor({ id: 'pc-cls-3' })]), // no classNames
    );

    const snap = getCharacterSnapshot('pc-cls-3');
    expect(snap).not.toBeNull();
    expect(snap?.class).toBe('');
  });

  it('CR-CLS-4: items array has non-class items — only class items contribute', () => {
    // Verify filter: weapon items are not counted as class names.
    vi.stubGlobal(
      'game',
      makeGameMock([
        makeActor({
          id: 'pc-cls-4',
          classNames: ['Ranger'],
          items: [makeItem({ name: 'Longbow', type: 'weapon' })],
        }),
      ]),
    );

    const snap = getCharacterSnapshot('pc-cls-4');
    expect(snap).not.toBeNull();
    expect(snap?.class).toBe('Ranger');
  });

  // ── Phase 21 Plan 21-01: initiative reader (CR-INI-1..4) ──────────────────

  it('CR-INI-1: actor.system.attributes.init.total = 3 → snapshot.initiative = 3', () => {
    vi.stubGlobal('game', makeGameMock([makeActor({ id: 'pc-ini-1', initTotal: 3 })]));

    const snap = getCharacterSnapshot('pc-ini-1');
    expect(snap).not.toBeNull();
    expect(snap?.initiative).toBe(3);
  });

  it('CR-INI-2: missing actor.system.attributes.init → defaults to 0', () => {
    // Actor without init field: defensive default of 0.
    vi.stubGlobal(
      'game',
      makeGameMock([makeActor({ id: 'pc-ini-2' })]), // no initTotal
    );

    const snap = getCharacterSnapshot('pc-ini-2');
    expect(snap).not.toBeNull();
    expect(snap?.initiative).toBe(0);
  });

  it('CR-INI-3: negative initiative modifier (DEX penalty) → preserved verbatim', () => {
    // D&D 5e: negative DEX modifier reduces initiative. Must not be clamped.
    vi.stubGlobal('game', makeGameMock([makeActor({ id: 'pc-ini-3', initTotal: -1 })]));

    const snap = getCharacterSnapshot('pc-ini-3');
    expect(snap).not.toBeNull();
    expect(snap?.initiative).toBe(-1);
  });

  it('CR-INI-4: initiative = 0 → preserved (not treated as falsy/missing)', () => {
    vi.stubGlobal('game', makeGameMock([makeActor({ id: 'pc-ini-4', initTotal: 0 })]));

    const snap = getCharacterSnapshot('pc-ini-4');
    expect(snap).not.toBeNull();
    expect(snap?.initiative).toBe(0);
  });

  // ── Phase 21 Plan 21-01: walk speed reader (CR-SPD-1..4) ──────────────────

  it('CR-SPD-1: actor.system.attributes.movement.walk = 25 → snapshot.speed = 25 (dwarf)', () => {
    vi.stubGlobal('game', makeGameMock([makeActor({ id: 'pc-spd-1', movementWalk: 25 })]));

    const snap = getCharacterSnapshot('pc-spd-1');
    expect(snap).not.toBeNull();
    expect(snap?.speed).toBe(25);
  });

  it('CR-SPD-2: missing actor.system.attributes.movement → defaults to 30 (D&D standard)', () => {
    // Actor without movement field: D&D 5e standard walk speed of 30 ft.
    vi.stubGlobal(
      'game',
      makeGameMock([makeActor({ id: 'pc-spd-2' })]), // no movementWalk
    );

    const snap = getCharacterSnapshot('pc-spd-2');
    expect(snap).not.toBeNull();
    expect(snap?.speed).toBe(30);
  });

  it('CR-SPD-3: movement.walk = 0 → preserved (immobilised actor, not treated as missing)', () => {
    vi.stubGlobal('game', makeGameMock([makeActor({ id: 'pc-spd-3', movementWalk: 0 })]));

    const snap = getCharacterSnapshot('pc-spd-3');
    expect(snap).not.toBeNull();
    expect(snap?.speed).toBe(0);
  });

  it('CR-SPD-4: movement.walk = 60 (fast actor) → preserved', () => {
    vi.stubGlobal('game', makeGameMock([makeActor({ id: 'pc-spd-4', movementWalk: 60 })]));

    const snap = getCharacterSnapshot('pc-spd-4');
    expect(snap).not.toBeNull();
    expect(snap?.speed).toBe(60);
  });
});

// ─── extractFeats reader tests (Phase 22 Plan 22-02; RDATA-03) ────────────────

describe('extractFeats', () => {
  let extractFeats: typeof import('./character-reader.js').extractFeats;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./character-reader.js');
    extractFeats = mod.extractFeats;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Helper: build a minimal feat item mock.
   * `systemType` controls the type/subtype object; omit for PHB 2014 fallback path.
   */
  function makeFeatItem(
    overrides: {
      name?: string;
      systemType?: { value?: string; subtype?: string };
      description?: string;
    } = {},
  ) {
    return {
      id: 'feat-1',
      name: overrides.name ?? 'War Caster',
      type: 'feat',
      system: {
        ...(overrides.systemType !== undefined ? { type: overrides.systemType } : {}),
        description: { value: overrides.description ?? '' },
      },
    };
  }

  /**
   * Helper: build a minimal actor mock with given feat items.
   * Non-feat items are excluded from extractFeats output.
   */
  function makeActorWithFeats(featItems: ReturnType<typeof makeFeatItem>[]) {
    return {
      id: 'actor-feats',
      name: 'Tester',
      type: 'character',
      items: { contents: featItems },
    };
  }

  it('CR-FT-1: PHB 2024 origin feat → category:feat, isOrigin:true, HTML stripped', () => {
    vi.stubGlobal('game', makeGameMock([]));
    const actor = makeActorWithFeats([
      makeFeatItem({
        name: 'War Caster',
        systemType: { value: 'feat', subtype: 'origin' },
        description: '<p>conc adv</p>',
      }),
    ]);
    const result = extractFeats(actor as unknown as ReturnType<typeof game.actors.get>);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'feat',
      name: 'War Caster',
      isOrigin: true,
      description: 'conc adv',
    });
  });

  it('CR-FT-2: PHB 2014 feat (no system.type) → category:general, isOrigin:false, no throw', () => {
    vi.stubGlobal('game', makeGameMock([]));
    const actor = makeActorWithFeats([
      makeFeatItem({ name: 'Alert', description: 'Always alert.' }),
    ]);
    const result = extractFeats(actor as unknown as ReturnType<typeof game.actors.get>);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'general',
      name: 'Alert',
      isOrigin: false,
      description: 'Always alert.',
    });
  });

  it('CR-FT-3: actor with zero feat items → returns []', () => {
    vi.stubGlobal('game', makeGameMock([]));
    const actor = makeActorWithFeats([]);
    const result = extractFeats(actor as unknown as ReturnType<typeof game.actors.get>);
    expect(result).toEqual([]);
  });

  it('CR-FT-4: background feat → category:background, isOrigin:false', () => {
    vi.stubGlobal('game', makeGameMock([]));
    const actor = makeActorWithFeats([
      makeFeatItem({
        name: 'Acolyte Feature',
        systemType: { value: 'background' },
        description: 'You gain a benefit.',
      }),
    ]);
    const result = extractFeats(actor as unknown as ReturnType<typeof game.actors.get>);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'background',
      isOrigin: false,
    });
  });

  it('CR-FT-5: actor === undefined → returns [] (mirrors extractClass null-safety)', () => {
    vi.stubGlobal('game', makeGameMock([]));
    const result = extractFeats(undefined as unknown as ReturnType<typeof game.actors.get>);
    expect(result).toEqual([]);
  });
});

// ─── extractBiography reader tests (Phase 22 Plan 22-02; RDATA-04) ────────────

describe('extractBiography', () => {
  let extractBiography: typeof import('./character-reader.js').extractBiography;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./character-reader.js');
    extractBiography = mod.extractBiography;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Helper: build a minimal actor mock with given details overrides. */
  function makeActorWithDetails(details: Record<string, unknown>) {
    return {
      id: 'actor-bio',
      name: 'Tester',
      type: 'character',
      items: { contents: [] },
      system: { details },
    };
  }

  it('CR-BIO-1: all fields present → maps trait→personality, HTML-strips backstory', () => {
    vi.stubGlobal('game', makeGameMock([]));
    const actor = makeActorWithDetails({
      trait: 'brave',
      ideal: 'loyalty',
      bond: 'home',
      flaw: 'pride',
      biography: { value: '<p>veteran</p>' },
    });
    const result = extractBiography(actor as unknown as ReturnType<typeof game.actors.get>);
    expect(result).toMatchObject({
      personality: 'brave',
      ideal: 'loyalty',
      bond: 'home',
      flaw: 'pride',
      backstory: 'veteran',
    });
  });

  it('CR-BIO-2: HTML-stripping — complex HTML tags stripped from backstory', () => {
    vi.stubGlobal('game', makeGameMock([]));
    const actor = makeActorWithDetails({
      biography: { value: '<h2>Hi</h2><strong>x</strong>' },
    });
    const result = extractBiography(actor as unknown as ReturnType<typeof game.actors.get>);
    // Block-level tags (<h2>) inject a separating space so adjacent runs don't merge;
    // inline tags (<strong>) strip without one (WR-03 fix). → "Hi" + " " + "x".
    expect(result.backstory).toBe('Hi x');
  });

  it('CR-BIO-3: empty/missing details → all five fields are empty strings, no throw', () => {
    vi.stubGlobal('game', makeGameMock([]));
    const actor = makeActorWithDetails({});
    const result = extractBiography(actor as unknown as ReturnType<typeof game.actors.get>);
    expect(result).toMatchObject({
      personality: '',
      ideal: '',
      bond: '',
      flaw: '',
      backstory: '',
    });
  });

  it('CR-BIO-4: actor === undefined → all-empty-string BiographySnapshot', () => {
    vi.stubGlobal('game', makeGameMock([]));
    const result = extractBiography(undefined as unknown as ReturnType<typeof game.actors.get>);
    expect(result).toMatchObject({
      personality: '',
      ideal: '',
      bond: '',
      flaw: '',
      backstory: '',
    });
  });
});

// ─── Integration: getCharacterSnapshot carries feats + biography (Phase 22) ───

describe('getCharacterSnapshot — feats + biography integration (CR-FT-6 / CR-BIO-5)', () => {
  let getCharacterSnapshot: typeof import('./character-reader.js').getCharacterSnapshot;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./character-reader.js');
    getCharacterSnapshot = mod.getCharacterSnapshot;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('CR-FT-6 / CR-BIO-5: snapshot carries feats[] and biography from real actor details', () => {
    const actor = {
      ...makeActor({
        id: 'pc-bio-ft',
        classNames: [],
      }),
      system: {
        ...makeActor({ id: 'pc-bio-ft' }).system,
        details: {
          level: 5,
          trait: 'bold',
          ideal: 'justice',
          bond: 'family',
          flaw: 'reckless',
          biography: { value: '<p>A veteran warrior.</p>' },
        },
      },
      items: {
        contents: [
          {
            id: 'feat-war',
            name: 'War Caster',
            type: 'feat',
            system: {
              type: { value: 'feat', subtype: 'origin' },
              description: { value: '<b>Advantage</b> on concentration checks.' },
            },
          },
        ],
      },
    };

    vi.stubGlobal('game', makeGameMock([actor as unknown as ReturnType<typeof makeActor>]));

    const snap = getCharacterSnapshot('pc-bio-ft');
    expect(snap).not.toBeNull();

    // CR-FT-6: feats array populated from actor.items
    expect(snap?.feats).toBeDefined();
    expect(snap?.feats).toHaveLength(1);
    expect(snap?.feats?.[0]).toMatchObject({
      category: 'feat',
      name: 'War Caster',
      isOrigin: true,
    });

    // CR-BIO-5: biography.personality sourced from details.trait (NOT details.personality)
    expect(snap?.biography).toBeDefined();
    expect(snap?.biography?.personality).toBe('bold');
    expect(snap?.biography?.backstory).toBe('A veteran warrior.');
  });
});

// ─── Combat reader tests ───────────────────────────────────────────────────────

describe('getCombatSnapshot', () => {
  let getCombatSnapshot: typeof import('./combat-reader.js').getCombatSnapshot;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./combat-reader.js');
    getCombatSnapshot = mod.getCombatSnapshot;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when game.combat is null', () => {
    vi.stubGlobal('game', makeGameMock([], null));
    expect(getCombatSnapshot()).toBeNull();
  });

  it('returns correct CombatSnapshot when combat is active', () => {
    const actor = makeActor({ id: 'actor-1', hp: { value: 20, max: 30, temp: 0, tempmax: 0 } });
    const combatant1 = {
      id: 'cbt-1',
      name: 'Frodo',
      actorId: 'actor-1',
      actor,
      initiative: 15,
    };
    // Sauron: unlinked combatant (actor: null) — no concentration possible
    const combatant2 = {
      id: 'cbt-2',
      name: 'Sauron',
      actorId: null,
      actor: null,
      initiative: 20,
    };
    const combat = {
      id: 'combat-1',
      round: 2,
      turn: 0,
      combatant: combatant1,
      combatants: { contents: [combatant1, combatant2] },
    };

    vi.stubGlobal('game', makeGameMock([actor], combat));

    const snap = getCombatSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.combatId).toBe('combat-1');
    expect(snap?.round).toBe(2);
    expect(snap?.turn).toBe(0);
    expect(snap?.currentCombatantId).toBe('cbt-1');
    expect(snap?.combatants).toHaveLength(2);

    const frodo = snap?.combatants.find((c) => c.id === 'cbt-1');
    expect(frodo?.isCurrentTurn).toBe(true);
    expect(frodo?.hp).toBe(20);
    expect(frodo?.maxHp).toBe(30);
    expect(frodo?.initiative).toBe(15);

    const sauron = snap?.combatants.find((c) => c.id === 'cbt-2');
    expect(sauron?.isCurrentTurn).toBe(false);
    expect(sauron?.hp).toBeNull();
    expect(sauron?.actorId).toBeNull();
  });

  it('sets currentCombatantId to null when combat.combatant is null', () => {
    const combat = {
      id: 'combat-2',
      round: 0,
      turn: 0,
      combatant: null,
      combatants: { contents: [] },
    };
    vi.stubGlobal('game', makeGameMock([], combat));

    const snap = getCombatSnapshot();
    expect(snap?.currentCombatantId).toBeNull();
  });

  // ── Phase 5: concentration extension (CMRD-CONC-1..4) ────────────────────

  it('CMRD-CONC-1: combatant with NO concentrating effect → no concentration field', () => {
    const actor = makeActor({
      id: 'actor-conc-1',
      effects: [makeActiveEffect('Bless', false, '1 minute')], // not concentrating
    });
    const combatant = {
      id: 'cbt-conc-1',
      name: 'Lyra',
      actorId: 'actor-conc-1',
      actor,
      initiative: 14,
    };
    const combat = {
      id: 'combat-conc',
      round: 1,
      turn: 0,
      combatant,
      combatants: { contents: [combatant] },
    };
    vi.stubGlobal('game', makeGameMock([actor], combat));

    const snap = getCombatSnapshot();
    const lyra = snap?.combatants.find((c) => c.id === 'cbt-conc-1');
    expect(lyra).toBeDefined();
    expect(lyra?.concentration).toBeUndefined();
  });

  it('CMRD-CONC-2: combatant WITH concentrating effect → concentration sub-object present', () => {
    const actor = makeActor({
      id: 'actor-conc-2',
      effects: [makeActiveEffect('Bless', true, '1 minute')],
    });
    const combatant = {
      id: 'cbt-conc-2',
      name: 'Gandalf',
      actorId: 'actor-conc-2',
      actor,
      initiative: 18,
    };
    const combat = {
      id: 'combat-conc-2',
      round: 1,
      turn: 0,
      combatant,
      combatants: { contents: [combatant] },
    };
    vi.stubGlobal('game', makeGameMock([actor], combat));

    const snap = getCombatSnapshot();
    const gandalf = snap?.combatants.find((c) => c.id === 'cbt-conc-2');
    expect(gandalf?.concentration).toEqual({ spellName: 'Bless', duration: '1 minute' });
  });

  it('CMRD-CONC-3: multiple effects, only one concentrating → correct effect picked', () => {
    const actor = makeActor({
      id: 'actor-conc-3',
      effects: [
        makeActiveEffect('Poison', false, '1 hour'),
        makeActiveEffect("Hunter's Mark", true, '1 hour'),
        makeActiveEffect('Haste', false, '1 minute'),
      ],
    });
    const combatant = {
      id: 'cbt-conc-3',
      name: 'Ranger',
      actorId: 'actor-conc-3',
      actor,
      initiative: 12,
    };
    const combat = {
      id: 'combat-conc-3',
      round: 1,
      turn: 0,
      combatant,
      combatants: { contents: [combatant] },
    };
    vi.stubGlobal('game', makeGameMock([actor], combat));

    const snap = getCombatSnapshot();
    const ranger = snap?.combatants.find((c) => c.id === 'cbt-conc-3');
    expect(ranger?.concentration?.spellName).toBe("Hunter's Mark");
  });

  it('CMRD-CONC-4: combatant.actor === null → no concentration field', () => {
    const combatant = {
      id: 'cbt-conc-4',
      name: 'Ghost',
      actorId: null,
      actor: null, // unlinked token
      initiative: 8,
    };
    const combat = {
      id: 'combat-conc-4',
      round: 1,
      turn: 0,
      combatant,
      combatants: { contents: [combatant] },
    };
    vi.stubGlobal('game', makeGameMock([], combat));

    const snap = getCombatSnapshot();
    const ghost = snap?.combatants.find((c) => c.id === 'cbt-conc-4');
    expect(ghost).toBeDefined();
    expect(ghost?.concentration).toBeUndefined();
  });

  // ── Phase 23: AC extraction (RDATA-05) ────────────────────────────────────

  describe('ac extraction (RDATA-05)', () => {
    it('RDATA-05-AC-R1: combatant with ac.value === 18 → snapshot ac === 18', () => {
      const actor = makeActor({ id: 'actor-ac-1', acValue: 18 });
      const combatant = {
        id: 'cbt-ac-1',
        name: 'Paladin',
        actorId: 'actor-ac-1',
        actor,
        initiative: 14,
      };
      const combat = {
        id: 'combat-ac-1',
        round: 1,
        turn: 0,
        combatant,
        combatants: { contents: [combatant] },
      };
      vi.stubGlobal('game', makeGameMock([actor], combat));

      const snap = getCombatSnapshot();
      const paladin = snap?.combatants.find((c) => c.id === 'cbt-ac-1');
      expect(paladin?.ac).toBe(18);
    });

    it('RDATA-05-AC-R2: unlinked combatant (actor === null) → ac key absent', () => {
      const combatant = {
        id: 'cbt-ac-2',
        name: 'UnlinkedToken',
        actorId: null,
        actor: null,
        initiative: 10,
      };
      const combat = {
        id: 'combat-ac-2',
        round: 1,
        turn: 0,
        combatant,
        combatants: { contents: [combatant] },
      };
      vi.stubGlobal('game', makeGameMock([], combat));

      const snap = getCombatSnapshot();
      const unlinked = snap?.combatants.find((c) => c.id === 'cbt-ac-2');
      expect(unlinked).toBeDefined();
      expect('ac' in (unlinked ?? {})).toBe(false);
    });

    it('RDATA-05-AC-R3: ac.value is undefined/string/NaN → ac key absent', () => {
      // Construct an actor whose ac.value is not a number (string '18')
      const actorWithStringAc = {
        id: 'actor-ac-3',
        name: 'StringAc',
        type: 'character',
        system: {
          attributes: {
            hp: { value: 30, max: 30, temp: 0, tempmax: 0 },
            ac: { value: '18' as unknown as number }, // non-numeric: string
            exhaustion: 0,
            death: { success: 0, failure: 0 },
          },
          details: { level: 5 },
          spells: {},
        },
        statuses: new Set<string>(),
        effects: { contents: [] },
        items: { contents: [] },
      };
      const combatant = {
        id: 'cbt-ac-3',
        name: 'StringAc',
        actorId: 'actor-ac-3',
        actor: actorWithStringAc,
        initiative: 10,
      };
      const combat = {
        id: 'combat-ac-3',
        round: 1,
        turn: 0,
        combatant,
        combatants: { contents: [combatant] },
      };
      vi.stubGlobal('game', makeGameMock([], combat));

      const snap = getCombatSnapshot();
      const c3 = snap?.combatants.find((c) => c.id === 'cbt-ac-3');
      expect(c3).toBeDefined();
      expect('ac' in (c3 ?? {})).toBe(false);
    });

    it('RDATA-05-AC-R4: ac.value 18.6 rounds to 19; negative clamps to 0', () => {
      // Two combatants: one with 18.6, one with -5
      const actorFloat = {
        id: 'actor-ac-4a',
        name: 'FloatAc',
        type: 'character',
        system: {
          attributes: {
            hp: { value: 40, max: 40, temp: 0, tempmax: 0 },
            ac: { value: 18.6 },
            exhaustion: 0,
            death: { success: 0, failure: 0 },
          },
          details: { level: 5 },
          spells: {},
        },
        statuses: new Set<string>(),
        effects: { contents: [] },
        items: { contents: [] },
      };
      const actorNeg = {
        id: 'actor-ac-4b',
        name: 'NegAc',
        type: 'character',
        system: {
          attributes: {
            hp: { value: 10, max: 10, temp: 0, tempmax: 0 },
            ac: { value: -5 },
            exhaustion: 0,
            death: { success: 0, failure: 0 },
          },
          details: { level: 1 },
          spells: {},
        },
        statuses: new Set<string>(),
        effects: { contents: [] },
        items: { contents: [] },
      };
      const cbtFloat = {
        id: 'cbt-ac-4a',
        name: 'FloatAc',
        actorId: 'actor-ac-4a',
        actor: actorFloat,
        initiative: 12,
      };
      const cbtNeg = {
        id: 'cbt-ac-4b',
        name: 'NegAc',
        actorId: 'actor-ac-4b',
        actor: actorNeg,
        initiative: 5,
      };
      const combat = {
        id: 'combat-ac-4',
        round: 1,
        turn: 0,
        combatant: cbtFloat,
        combatants: { contents: [cbtFloat, cbtNeg] },
      };
      vi.stubGlobal('game', makeGameMock([], combat));

      const snap = getCombatSnapshot();
      const floatAc = snap?.combatants.find((c) => c.id === 'cbt-ac-4a');
      expect(floatAc?.ac).toBe(19); // Math.round(18.6) = 19

      const negAc = snap?.combatants.find((c) => c.id === 'cbt-ac-4b');
      expect(negAc?.ac).toBe(0); // Math.max(0, Math.round(-5)) = 0
    });
  });
});

// ─── Scene reader tests ────────────────────────────────────────────────────────

describe('getSceneViewport', () => {
  let getSceneViewport: typeof import('./scene-reader.js').getSceneViewport;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./scene-reader.js');
    getSceneViewport = mod.getSceneViewport;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns zero-state when no active scene', () => {
    vi.stubGlobal('game', makeGameMock([], null, null));
    vi.stubGlobal('canvas', null);

    const vp = getSceneViewport();
    expect(vp.sceneId).toBe('');
    expect(vp.viewX).toBe(0);
    expect(vp.viewY).toBe(0);
    expect(vp.scale).toBe(1.0);
    expect(vp.tokenIds).toEqual([]);
  });

  it('returns correct sceneId and token list', () => {
    const scene = {
      id: 'scene-abc',
      name: 'Dungeon',
      tokens: { contents: [{ id: 'token-1' }, { id: 'token-2' }] },
    };
    vi.stubGlobal('game', makeGameMock([], null, scene));
    vi.stubGlobal('canvas', {
      stage: { pivot: { x: 100, y: 200 }, scale: { x: 1.5 } },
    });

    const vp = getSceneViewport();
    expect(vp.sceneId).toBe('scene-abc');
    expect(vp.sceneName).toBe('Dungeon');
    expect(vp.viewX).toBe(100);
    expect(vp.viewY).toBe(200);
    expect(vp.scale).toBe(1.5);
    expect(vp.tokenIds).toEqual(['token-1', 'token-2']);
  });

  it('defaults to scale=1.0 when canvas is null', () => {
    const scene = {
      id: 'scene-1',
      name: 'Test',
      tokens: { contents: [] },
    };
    vi.stubGlobal('game', makeGameMock([], null, scene));
    vi.stubGlobal('canvas', null);

    const vp = getSceneViewport();
    expect(vp.scale).toBe(1.0);
  });
});

// ─── Hook subscribers tests ────────────────────────────────────────────────────

describe('registerHookSubscribers', () => {
  let registerHookSubscribers: typeof import('./hook-subscribers.js').registerHookSubscribers;
  let _resetEventSeq: () => void;

  // Capture registered hook callbacks for manual invocation in tests
  const hookCallbacks = new Map<string, Array<(...args: unknown[]) => void>>();
  const registeredIds: Map<number, string> = new Map();
  let hookIdCounter = 0;

  function makeHooksMock() {
    return {
      once: vi.fn(),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        if (!hookCallbacks.has(event)) {
          hookCallbacks.set(event, []);
        }
        // biome-ignore lint/style/noNonNullAssertion: just set it above
        hookCallbacks.get(event)!.push(fn);
        const id = ++hookIdCounter;
        registeredIds.set(id, event);
        return id;
      }),
      off: vi.fn((id: number) => {
        registeredIds.delete(id);
      }),
    };
  }

  function fireHook(event: string, ...args: unknown[]): void {
    const callbacks = hookCallbacks.get(event) ?? [];
    for (const cb of callbacks) {
      cb(...args);
    }
  }

  beforeEach(async () => {
    vi.resetModules();
    hookCallbacks.clear();
    registeredIds.clear();
    hookIdCounter = 0;

    const mod = await import('./hook-subscribers.js');
    registerHookSubscribers = mod.registerHookSubscribers;
    _resetEventSeq = mod._resetEventSeq;

    vi.stubGlobal('Hooks', makeHooksMock());
    vi.stubGlobal('game', makeGameMock([]));
    vi.stubGlobal('canvas', null);
    _resetEventSeq();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers hooks and returns a cleanup function', () => {
    const emitFn = vi.fn();
    const cleanup = registerHookSubscribers(emitFn);
    expect(typeof cleanup).toBe('function');
    // Should have registered multiple hooks
    expect((Hooks as ReturnType<typeof makeHooksMock>).on).toHaveBeenCalled();
  });

  it('cleanup calls Hooks.off for all registered hooks', () => {
    const emitFn = vi.fn();
    const cleanup = registerHookSubscribers(emitFn);
    cleanup();
    expect((Hooks as ReturnType<typeof makeHooksMock>).off).toHaveBeenCalled();
  });

  it('updateActor emits character.delta when HP changes', () => {
    const emitFn = vi.fn();
    const actor = makeActor({ id: 'a1', hp: { value: 10, max: 20, temp: 0, tempmax: 0 } });
    vi.stubGlobal('game', makeGameMock([actor]));

    registerHookSubscribers(emitFn);

    const changes = { system: { attributes: { hp: { value: 10 } } } };
    fireHook('updateActor', actor, changes);

    expect(emitFn).toHaveBeenCalledWith(
      'character.delta',
      expect.objectContaining({
        actorId: 'a1',
        hp: 10,
      }),
    );
  });

  it('updateActor does NOT emit when unrelated fields change', () => {
    const emitFn = vi.fn();
    const actor = makeActor({ id: 'a1' });
    vi.stubGlobal('game', makeGameMock([actor]));

    registerHookSubscribers(emitFn);

    // Unrelated change — only flags changed
    const changes = { flags: { 'some-module': { key: 'value' } } };
    fireHook('updateActor', actor, changes);

    expect(emitFn).not.toHaveBeenCalled();
  });

  it('updateActor emits when statuses change', () => {
    const emitFn = vi.fn();
    const actor = makeActor({ id: 'a1', statuses: new Set(['poisoned']) });
    vi.stubGlobal('game', makeGameMock([actor]));

    registerHookSubscribers(emitFn);

    const changes = { statuses: new Set(['poisoned', 'prone']) };
    fireHook('updateActor', actor, changes);

    expect(emitFn).toHaveBeenCalledWith('character.delta', expect.anything());
  });

  it('updateActor does NOT emit on a non-attribute system change with no status change', () => {
    // Guard-rewrite regression: a `system` change that does NOT touch
    // `system.attributes` (HP/AC/exhaustion) and has no status change must skip.
    // The previous nested guard had an effectively-dead `&& !statusesChanged`
    // term; this asserts the single-predicate rewrite still skips correctly.
    const emitFn = vi.fn();
    const actor = makeActor({ id: 'a1' });
    vi.stubGlobal('game', makeGameMock([actor]));

    registerHookSubscribers(emitFn);

    // system changed, but only currency (not under attributes), no statuses key.
    const changes = { system: { currency: { gp: 5 } } };
    fireHook('updateActor', actor, changes);

    expect(emitFn).not.toHaveBeenCalled();
  });

  it('createChatMessage pushes to ring buffer and emits event.log.delta', () => {
    const emitFn = vi.fn();
    registerHookSubscribers(emitFn);

    const message = {
      content: 'You hit the goblin!',
      flavor: '',
      speaker: { actor: 'actor-1', scene: 'scene-1', token: 'token-1', alias: 'Aragorn' },
    };
    fireHook('createChatMessage', message);

    expect(emitFn).toHaveBeenCalledWith(
      'event.log.delta',
      expect.objectContaining({
        seq: 1,
        type: 'chat',
        actorId: 'actor-1',
        content: 'You hit the goblin!',
      }),
    );
  });

  it('targetToken emits combat.targets with user targets', () => {
    const emitFn = vi.fn();
    registerHookSubscribers(emitFn);

    const mockToken: {
      id: string;
      name: string;
      document: { actorId: string };
    } = {
      id: 'token-5',
      name: 'Orc Chief',
      document: { actorId: 'actor-orc' },
    };

    const mockUser = {
      id: 'user-gm',
      targets: new Set([mockToken]),
    };

    fireHook('targetToken', mockUser, mockToken, true);

    expect(emitFn).toHaveBeenCalledWith(
      'combat.targets',
      expect.objectContaining({
        userId: 'user-gm',
        targets: expect.arrayContaining([
          expect.objectContaining({ tokenId: 'token-5', actorId: 'actor-orc', name: 'Orc Chief' }),
        ]),
      }),
    );
  });

  it('canvasReady emits scene.viewport', () => {
    const emitFn = vi.fn();
    const scene = {
      id: 'scene-1',
      name: 'Forest',
      tokens: { contents: [] },
    };
    vi.stubGlobal('game', makeGameMock([], null, scene));
    vi.stubGlobal('canvas', { stage: { pivot: { x: 0, y: 0 }, scale: { x: 1 } } });

    registerHookSubscribers(emitFn);
    fireHook('canvasReady', {});

    expect(emitFn).toHaveBeenCalledWith(
      'scene.viewport',
      expect.objectContaining({
        sceneId: 'scene-1',
      }),
    );
  });

  it('combatStart emits combat.state', () => {
    const emitFn = vi.fn();
    const combat = {
      id: 'combat-new',
      round: 1,
      turn: 0,
      combatant: null,
      combatants: { contents: [] },
    };
    vi.stubGlobal('game', makeGameMock([], combat));

    registerHookSubscribers(emitFn);
    fireHook('combatStart', combat);

    expect(emitFn).toHaveBeenCalledWith(
      'combat.state',
      expect.objectContaining({
        combatId: 'combat-new',
      }),
    );
  });
});

// ─── ADR-0014: per-user roster scoping (listPlayerCharactersForUser) ───────────

describe('listPlayerCharactersForUser (ADR-0014)', () => {
  let listPlayerCharacters: typeof import('./character-reader.js').listPlayerCharacters;
  let listPlayerCharactersForUser: typeof import('./character-reader.js').listPlayerCharactersForUser;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal(
      'game',
      makeGameMock([
        makeActor({ id: 'actor-alice', name: 'Alice', type: 'character' }),
        makeActor({ id: 'actor-bob', name: 'Bob', type: 'character' }),
        makeActor({ id: 'npc-1', name: 'Goblin', type: 'npc' }),
      ]),
    );
    const mod = await import('./character-reader.js');
    listPlayerCharacters = mod.listPlayerCharacters;
    listPlayerCharactersForUser = mod.listPlayerCharactersForUser;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters the roster to the authorized actor ids', () => {
    const roster = listPlayerCharactersForUser(['actor-bob']);
    expect(roster.map((c) => c.actorId)).toEqual(['actor-bob']);
  });

  it('returns every owned PC when all ids are authorized (still excludes NPCs)', () => {
    const roster = listPlayerCharactersForUser(['actor-alice', 'actor-bob', 'npc-1']);
    // NPCs are never characters, so npc-1 never appears even if "authorized".
    expect(roster.map((c) => c.actorId).sort()).toEqual(['actor-alice', 'actor-bob']);
  });

  it('fail-closed: empty authorized set yields an empty roster', () => {
    expect(listPlayerCharactersForUser([])).toEqual([]);
  });

  it('is a strict subset of the global listPlayerCharacters roster', () => {
    const global = listPlayerCharacters().map((c) => c.actorId);
    const scoped = listPlayerCharactersForUser(['actor-alice']).map((c) => c.actorId);
    expect(scoped.every((id) => global.includes(id))).toBe(true);
    expect(scoped).toEqual(['actor-alice']);
  });
});
