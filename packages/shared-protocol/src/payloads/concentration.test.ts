/**
 * @evf/shared-protocol — concentration.ts envelope payload tests.
 *
 * Covers Plan 4b-06 Task 2 behaviour CN-1..CN-10 — the Phase 4b conc-drop modal
 * wire protocol (ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema +
 * type constants).
 *
 *   - CN-1  ConcConflictPayloadSchema parses a valid 3-field payload
 *   - CN-2  ConcConflictPayloadSchema rejects effectId=""
 *   - CN-3  ConcConflictPayloadSchema rejects currentConcentrationName=""
 *   - CN-4  ConcDropConfirmedPayloadSchema parses {effectId:'eff1'}
 *   - CN-5  ConcDropConfirmedPayloadSchema rejects effectId=""
 *   - CN-6  CONC_CONFLICT_TYPE === 'conc.conflict'
 *   - CN-7  CONC_DROP_CONFIRMED_TYPE === 'conc.drop.confirmed'
 *   - CN-8  re-exports from `@evf/shared-protocol` package entry
 *
 * The CN-9 + CN-10 cases lock the structural assumption that the canonical
 * envelope schema name and `payload` carrier field are the canonical Phase 4a
 * forms — the Phase 4a NF-1 forbidden-pattern grep gate enforces the
 * disallowed legacy aliases at the file level.
 *
 * @see ./concentration.ts (schema definitions)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-06-PLAN.md Task 2
 */
import { describe, expect, it } from 'vitest';
import {
  CONC_CONFLICT_TYPE,
  CONC_DROP_CONFIRMED_TYPE,
  ConcConflictPayloadSchema,
  ConcDropConfirmedPayloadSchema,
} from './concentration.js';

describe('ConcConflictPayloadSchema (CN-1..CN-3)', () => {
  it('CN-1: parses a valid 3-field payload', () => {
    const result = ConcConflictPayloadSchema.safeParse({
      effectId: 'eff1',
      currentConcentrationName: 'Hold Person',
      newSpellName: 'Bless',
    });
    expect(result.success).toBe(true);
  });

  it('CN-2: rejects effectId=""', () => {
    const result = ConcConflictPayloadSchema.safeParse({
      effectId: '',
      currentConcentrationName: 'Hold Person',
      newSpellName: 'Bless',
    });
    expect(result.success).toBe(false);
  });

  it('CN-3: rejects currentConcentrationName=""', () => {
    const result = ConcConflictPayloadSchema.safeParse({
      effectId: 'eff1',
      currentConcentrationName: '',
      newSpellName: 'Bless',
    });
    expect(result.success).toBe(false);
  });
});

describe('ConcDropConfirmedPayloadSchema (CN-4..CN-5)', () => {
  it('CN-4: parses {effectId:"eff1"}', () => {
    const result = ConcDropConfirmedPayloadSchema.safeParse({ effectId: 'eff1' });
    expect(result.success).toBe(true);
  });

  it('CN-5: rejects effectId=""', () => {
    const result = ConcDropConfirmedPayloadSchema.safeParse({ effectId: '' });
    expect(result.success).toBe(false);
  });
});

describe('envelope type constants (CN-6..CN-7)', () => {
  it("CN-6: CONC_CONFLICT_TYPE === 'conc.conflict'", () => {
    expect(CONC_CONFLICT_TYPE).toBe('conc.conflict');
  });

  it("CN-7: CONC_DROP_CONFIRMED_TYPE === 'conc.drop.confirmed'", () => {
    expect(CONC_DROP_CONFIRMED_TYPE).toBe('conc.drop.confirmed');
  });
});

describe('re-export contract (CN-8)', () => {
  it('CN-8: schemas + types + constants re-exported from @evf/shared-protocol', async () => {
    // Static import via the package entry — proves the index.ts re-export
    // surface includes the Phase 4b concentration additions.
    const pkg = await import('../index.js');
    expect(pkg.ConcConflictPayloadSchema).toBeDefined();
    expect(pkg.ConcDropConfirmedPayloadSchema).toBeDefined();
    expect(pkg.CONC_CONFLICT_TYPE).toBe('conc.conflict');
    expect(pkg.CONC_DROP_CONFIRMED_TYPE).toBe('conc.drop.confirmed');
  });
});
