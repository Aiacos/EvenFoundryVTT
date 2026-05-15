/**
 * @evf/shared-protocol — CombatantSchema concentration extension tests.
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
 * @see ./combat.ts (schema definitions)
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-01-PLAN.md Task 3
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 4
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
