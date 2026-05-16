/**
 * Unit tests for detectActiveConcentration (Plan 09-03, Task 1 — RED phase).
 *
 * Tests CD-01..06 cover the pure detection logic:
 *   - CD-01: non-concentration spell → null (no conflict regardless of effects)
 *   - CD-02: concentration spell + no concentrating effect → null
 *   - CD-03: concentration spell + concentrating effect → payload with names/ids
 *   - CD-04: `effect.statuses` is an Array (not Set) — handled
 *   - CD-05: missing `flags.dnd5e.item.name` → fallback to effect.name → fallback '<unknown>'
 *   - CD-06: `effect.statuses === undefined` (effect without statuses) → null (no false positive)
 *
 * @see packages/foundry-module/src/write-path/concentration-detector.ts
 * @see .planning/phases/09-action-economy-edge-cases/09-03-PLAN.md Task 1
 */

import { describe, expect, it } from 'vitest';
import { detectActiveConcentration } from './concentration-detector.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSpellItem(opts: { id?: string; name?: string; isConcentration?: boolean }) {
  return {
    id: opts.id ?? 'spell-1',
    name: opts.name ?? 'Fireball',
    system: {
      components: {
        concentration: opts.isConcentration ?? false,
      },
    },
  };
}

function makeEffect(opts: {
  id?: string;
  name?: string;
  statusesAsSet?: boolean;
  isConcentrating?: boolean;
  dnd5eItemName?: string;
  noStatuses?: boolean;
}) {
  const statusValue = opts.isConcentrating ? 'concentrating' : 'some-other-status';
  const statuses: Set<string> | string[] | undefined = opts.noStatuses
    ? undefined
    : opts.statusesAsSet
      ? new Set([statusValue])
      : [statusValue];

  return {
    id: opts.id ?? 'eff-1',
    name: opts.name ?? 'Hold Person',
    statuses,
    flags:
      opts.dnd5eItemName !== undefined ? { dnd5e: { item: { name: opts.dnd5eItemName } } } : {},
  };
}

function makeActor(opts: { id?: string; effects?: ReturnType<typeof makeEffect>[] }) {
  return {
    id: opts.id ?? 'actor-1',
    effects: {
      contents: opts.effects ?? [],
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('detectActiveConcentration', () => {
  // CD-01: non-concentration spell → null regardless of active effects
  it('CD-01: returns null when spellItem.system.components.concentration is false', () => {
    const actor = makeActor({
      effects: [makeEffect({ isConcentrating: true })],
    });
    const spell = makeSpellItem({ isConcentration: false });

    const result = detectActiveConcentration(actor, spell);

    expect(result).toBeNull();
  });

  // CD-02: concentration spell + no concentrating effect → null
  it('CD-02: returns null when spell IS concentration but actor has no concentrating effect', () => {
    const actor = makeActor({
      effects: [makeEffect({ isConcentrating: false })],
    });
    const spell = makeSpellItem({ isConcentration: true });

    const result = detectActiveConcentration(actor, spell);

    expect(result).toBeNull();
  });

  // CD-03: concentration spell + concentrating effect → full payload
  it('CD-03: returns payload when spell is concentration AND actor has concentrating effect (Set statuses)', () => {
    const actor = makeActor({
      id: 'actor-a',
      effects: [
        makeEffect({
          id: 'eff-hold-person',
          isConcentrating: true,
          statusesAsSet: true,
          dnd5eItemName: 'Hold Person',
        }),
      ],
    });
    const spell = makeSpellItem({
      name: 'Bless',
      isConcentration: true,
    });

    const result = detectActiveConcentration(actor, spell);

    expect(result).not.toBeNull();
    expect(result?.effectId).toBe('eff-hold-person');
    expect(result?.currentConcentrationName).toBe('Hold Person');
    expect(result?.newSpellName).toBe('Bless');
    expect(result?.actorId).toBe('actor-a');
  });

  // CD-04: `effect.statuses` is a regular Array (not Set)
  it('CD-04: handles effect.statuses as Array (not Set) — detects concentrating', () => {
    const actor = makeActor({
      id: 'actor-b',
      effects: [
        makeEffect({
          id: 'eff-bless',
          name: 'Bless',
          isConcentrating: true,
          statusesAsSet: false, // Array, not Set
          dnd5eItemName: 'Bless',
        }),
      ],
    });
    const spell = makeSpellItem({ name: 'Haste', isConcentration: true });

    const result = detectActiveConcentration(actor, spell);

    expect(result).not.toBeNull();
    expect(result?.effectId).toBe('eff-bless');
    expect(result?.currentConcentrationName).toBe('Bless');
    expect(result?.newSpellName).toBe('Haste');
  });

  // CD-05: missing flags.dnd5e.item.name → falls back to effect.name; if both missing → '<unknown>'
  it('CD-05: falls back to effect.name when flags.dnd5e.item.name missing', () => {
    const actor = makeActor({
      effects: [
        makeEffect({
          id: 'eff-1',
          name: 'Fallback Name',
          isConcentrating: true,
          statusesAsSet: true,
          // dnd5eItemName: undefined → no flags.dnd5e.item.name
        }),
      ],
    });
    const spell = makeSpellItem({ isConcentration: true });

    const result = detectActiveConcentration(actor, spell);

    expect(result?.currentConcentrationName).toBe('Fallback Name');
  });

  it('CD-05b: falls back to <unknown> when both flags.dnd5e.item.name and effect.name missing', () => {
    const actor = makeActor({
      effects: [
        {
          id: 'eff-2',
          name: undefined as unknown as string, // deliberately missing — tests fallback to '<unknown>'
          statuses: new Set(['concentrating']),
          flags: {},
        },
      ],
    });
    const spell = makeSpellItem({ isConcentration: true });

    const result = detectActiveConcentration(actor, spell);

    expect(result?.currentConcentrationName).toBe('<unknown>');
  });

  // CD-06: effect.statuses === undefined → no false positive
  it('CD-06: returns null when effect.statuses is undefined (effect without statuses)', () => {
    const actor = makeActor({
      effects: [
        makeEffect({ noStatuses: true }), // statuses is undefined
      ],
    });
    const spell = makeSpellItem({ isConcentration: true });

    const result = detectActiveConcentration(actor, spell);

    expect(result).toBeNull();
  });

  // Edge: actor with no effects
  it('returns null when actor has no effects', () => {
    const actor = makeActor({ effects: [] });
    const spell = makeSpellItem({ isConcentration: true });

    const result = detectActiveConcentration(actor, spell);

    expect(result).toBeNull();
  });

  // Edge: actor.effects.contents undefined (defensive)
  it('returns null when actor.effects.contents is undefined (fail-open)', () => {
    const actor = { id: 'actor-x', effects: {} }; // no contents
    const spell = makeSpellItem({ isConcentration: true });

    const result = detectActiveConcentration(
      actor as Parameters<typeof detectActiveConcentration>[0],
      spell as Parameters<typeof detectActiveConcentration>[1],
    );

    expect(result).toBeNull();
  });
});
