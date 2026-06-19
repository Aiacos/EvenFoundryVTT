/**
 * @evf/shared-protocol — CombatantSchema extension tests.
 *
 * Phase 5 Plan 05-01 Wave-0 atomic extension: CombatantSchema gains an optional
 * `concentration` sub-object for combatants that are concentrating on a spell.
 *
 * Covers COMB-CONC-1..5:
 *   - COMB-CONC-1  combatant WITHOUT concentration parses successfully (optional field)
 *   - COMB-CONC-2  combatant WITH concentration parses successfully
 *   - COMB-CONC-3  concentration: {} (missing required sub-fields) FAILS
 *   - COMB-CONC-4  concentration: { spellName: 'Bless' } (missing duration) FAILS
 *   - COMB-CONC-5  extra fields in concentration PASS (open z.object, not strictObject)
 *
 * Phase 23 Plan 23-01 extension: CombatantSchema gains an optional `ac` field
 * (int, nonnegative) for displaying real Armor Class in the combat tracker.
 *
 * Covers RDATA-05 (AC-1..5):
 *   - AC-1  combatant WITHOUT `ac` still parses (backward-compat, no downstream update)
 *   - AC-2  combatant WITH `ac: 18` parses and `parsed.data.ac === 18`
 *   - AC-3  `ac: -1` fails safeParse (.nonnegative() guard)
 *   - AC-4  `ac: 17.5` fails safeParse (.int() guard)
 *   - AC-5  `ac` absent → `parsed.data.ac === undefined` (optional, not defaulted)
 *
 * @see ./combat.ts (schema definitions)
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-01-PLAN.md Task 3
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 4
 * @see .planning/phases/EVF-23-combat-tracker-su-canvas-combatant-ac/23-01-PLAN.md RDATA-05
 */
import { describe, expect, it } from 'vitest';
import { CombatantSchema } from './combat.js';

/** Canonical valid combatant without concentration (base for all tests). */
const VALID_COMBATANT = {
  id: 'cbt-1',
  name: 'Thorin',
  actorId: 'actor-1',
  initiative: 18,
  hp: 45,
  maxHp: 68,
  isCurrentTurn: true,
};

describe('CombatantSchema — concentration extension (COMB-CONC)', () => {
  it('COMB-CONC-1: combatant WITHOUT concentration parses successfully (optional field)', () => {
    const result = CombatantSchema.safeParse(VALID_COMBATANT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.concentration).toBeUndefined();
    }
  });

  it('COMB-CONC-2: combatant WITH valid concentration parses successfully', () => {
    const result = CombatantSchema.safeParse({
      ...VALID_COMBATANT,
      concentration: { spellName: 'Bless', duration: '1m' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.concentration?.spellName).toBe('Bless');
      expect(result.data.concentration?.duration).toBe('1m');
    }
  });

  it('COMB-CONC-3: concentration: {} (missing spellName + duration) FAILS', () => {
    const result = CombatantSchema.safeParse({
      ...VALID_COMBATANT,
      concentration: {},
    });
    expect(result.success).toBe(false);
  });

  it('COMB-CONC-4: concentration: { spellName only } (missing duration) FAILS', () => {
    const result = CombatantSchema.safeParse({
      ...VALID_COMBATANT,
      concentration: { spellName: 'Bless' },
    });
    expect(result.success).toBe(false);
  });

  it('COMB-CONC-5: extra fields in concentration PASS (open z.object for forward-compat)', () => {
    // ConcentrationSchema uses z.object (not z.strictObject) for forward-compat.
    // Phase 7+ may add spellId or other fields without breaking Phase 5 consumers.
    const result = CombatantSchema.safeParse({
      ...VALID_COMBATANT,
      concentration: { spellName: 'Bless', duration: '1m', spellId: 'future-field' },
    });
    expect(result.success).toBe(true);
  });
});

describe('CombatantSchema.ac (RDATA-05)', () => {
  it('AC-1: combatant WITHOUT ac still parses (backward-compat — no downstream literal update needed)', () => {
    // Proves that existing combatant literals without `ac` continue to parse through
    // CombatantSchema.safeParse after the optional field is added. 31+ existing test
    // literals depend on this (strictObject + optional = backwards-compatible).
    const result = CombatantSchema.safeParse(VALID_COMBATANT);
    expect(result.success).toBe(true);
  });

  it('AC-2: combatant WITH ac: 18 parses and data.ac === 18', () => {
    const result = CombatantSchema.safeParse({ ...VALID_COMBATANT, ac: 18 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ac).toBe(18);
    }
  });

  it('AC-3: ac: -1 fails safeParse (.nonnegative() guard)', () => {
    const result = CombatantSchema.safeParse({ ...VALID_COMBATANT, ac: -1 });
    expect(result.success).toBe(false);
  });

  it('AC-4: ac: 17.5 fails safeParse (.int() guard)', () => {
    const result = CombatantSchema.safeParse({ ...VALID_COMBATANT, ac: 17.5 });
    expect(result.success).toBe(false);
  });

  it('AC-5: ac absent → data.ac === undefined (optional, not defaulted)', () => {
    const result = CombatantSchema.safeParse(VALID_COMBATANT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ac).toBeUndefined();
    }
  });
});
