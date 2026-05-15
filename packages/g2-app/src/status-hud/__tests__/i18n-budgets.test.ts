/**
 * Unit tests for HUD_WIDTH_BUDGETS const-as-truth table + assertWithinBudget +
 * getLabel runtime helpers (Phase 4a Plan 04 Task 1).
 *
 * Covers (per 04A-04-PLAN.md `<behavior>` IB-1..IB-5):
 *   - IB-1: verbatim IT/EN/DE strings for hp_label + correct max
 *   - IB-2: DE non-ASCII grapheme `Zustände` round-trips through the table
 *   - IB-3: structural compile-time guard (validated at the source level: the file
 *           contains `satisfies Record` so `pnpm typecheck` fails on shape drift)
 *   - IB-4: assertWithinBudget telemetry — no throw under budget, warn on overflow
 *   - IB-5: getLabel returns the per-locale string round-trip
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-04-PLAN.md Task 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertWithinBudget, getBudget, getLabel, HUD_WIDTH_BUDGETS } from '../i18n-budgets.js';

describe('HUD_WIDTH_BUDGETS — verbatim UI-SPEC table', () => {
  it('IB-1: hp_label = PF/HP/TP @ max 2', () => {
    expect(HUD_WIDTH_BUDGETS.hp_label.it).toBe('PF');
    expect(HUD_WIDTH_BUDGETS.hp_label.en).toBe('HP');
    expect(HUD_WIDTH_BUDGETS.hp_label.de).toBe('TP');
    expect(HUD_WIDTH_BUDGETS.hp_label.max).toBe(2);
  });

  it('IB-2: conditions_section DE grapheme = Zustände @ max 10 (8 BMP chars)', () => {
    expect(HUD_WIDTH_BUDGETS.conditions_section.de).toBe('Zustände');
    expect(HUD_WIDTH_BUDGETS.conditions_section.max).toBe(10);
    // The German label fits under the IT/EN budget (Condizioni=10, Conditions=10)
    expect('Zustände'.length).toBeLessThanOrEqual(HUD_WIDTH_BUDGETS.conditions_section.max);
  });

  it('IB-3: every entry satisfies WidthBudgetRow shape (it/en/de:string + max:number)', () => {
    // Structural check at runtime — the load-bearing gate is the `satisfies`
    // clause at compile time (verified by pnpm typecheck). This runtime
    // assertion is a safety net that proves the static guard's intent.
    for (const [field, row] of Object.entries(HUD_WIDTH_BUDGETS)) {
      expect(typeof row.it).toBe('string');
      expect(typeof row.en).toBe('string');
      expect(typeof row.de).toBe('string');
      expect(typeof row.max).toBe('number');
      // Every locale string must fit within max — this is the human-authored
      // invariant the `satisfies` brand would catch if a brand were feasible.
      expect(row.it.length, `${field}.it`).toBeLessThanOrEqual(row.max);
      expect(row.en.length, `${field}.en`).toBeLessThanOrEqual(row.max);
      expect(row.de.length, `${field}.de`).toBeLessThanOrEqual(row.max);
    }
  });
});

describe('assertWithinBudget — telemetry-only guard', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('IB-4a: under-budget value does NOT warn', () => {
    assertWithinBudget('Condiz...', 'conditions_section'); // length 9, max 10
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('IB-4b: at-budget value does NOT warn', () => {
    assertWithinBudget('Condizioni', 'conditions_section'); // length 10, max 10
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('IB-4c: over-budget value warns with field + budget + value in message', () => {
    assertWithinBudget('ConditionsLong', 'conditions_section'); // length 14 > 10
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const arg = warnSpy.mock.calls[0]?.[0];
    expect(typeof arg).toBe('string');
    expect(arg).toContain('conditions_section');
    expect(arg).toContain('10'); // budget
    expect(arg).toContain('ConditionsLong');
  });

  it('IB-4d: never throws on overflow (truncate-and-warn policy)', () => {
    expect(() => assertWithinBudget('XXXXXXXXXXXXXXXX', 'hp_label')).not.toThrow();
  });
});

describe('getLabel / getBudget — per-locale lookup', () => {
  it('IB-5a: getLabel returns the per-locale string', () => {
    expect(getLabel('hp_label', 'it')).toBe('PF');
    expect(getLabel('hp_label', 'en')).toBe('HP');
    expect(getLabel('hp_label', 'de')).toBe('TP');
    expect(getLabel('speed_label', 'it')).toBe('VEL');
    expect(getLabel('concentration', 'de')).toBe('Konzentr.');
  });

  it('IB-5b: getBudget returns the numeric max budget', () => {
    expect(getBudget('hp_label')).toBe(2);
    expect(getBudget('conditions_section')).toBe(10);
    expect(getBudget('move_label')).toBe(3);
  });
});
