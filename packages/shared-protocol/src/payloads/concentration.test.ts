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
 *   - CN-9  positive envelope round-trip: a valid envelope carrying a
 *           ConcDropConfirmedPayload parses against the canonical EnvelopeSchema
 *           AND the inner payload parses against ConcDropConfirmedPayloadSchema
 *           (W-4 closure precursor — proves Plan 05's modal envelope
 *           construction will round-trip cleanly through the bridge)
 *   - CN-10 negative envelope round-trip: an envelope WITHOUT session_id is
 *           rejected by the canonical EnvelopeSchema (W-4 NF-1-class regression
 *           guard — locks in `session_id: z.string().uuid()` requirement)
 *
 * The CN-9 + CN-10 cases lock the structural assumption that the canonical
 * envelope schema name and `payload` carrier field are the canonical Phase 4a
 * forms — the Phase 4a NF-1 forbidden-pattern grep gate enforces the
 * disallowed legacy aliases at the file level.
 *
 * @see ./concentration.ts (schema definitions)
 * @see ../envelope.ts (EnvelopeSchema — canonical wire carrier)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-06-PLAN.md Task 2
 */
import { describe, expect, it } from 'vitest';
import { EnvelopeSchema } from '../envelope.js';
import {
  CONC_CONFLICT_TYPE,
  CONC_DROP_CONFIRMED_TYPE,
  ConcConflictPayloadSchema,
  ConcDropConfirmedPayloadSchema,
} from './concentration.js';

/** A valid UUID v4 literal (version nibble 4 + variant 8/9/a/b). */
const VALID_UUID_V4 = '11111111-1111-4111-8111-111111111111';

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

describe('canonical EnvelopeSchema round-trip (CN-9..CN-10, W-4 closure)', () => {
  it('CN-9: valid envelope carrying ConcDropConfirmedPayload parses outer + inner', () => {
    const envelope = {
      proto: 'evf-v1' as const,
      seq: 0,
      ts: Date.now(),
      type: CONC_DROP_CONFIRMED_TYPE,
      session_id: VALID_UUID_V4,
      payload: { effectId: 'eff1' },
    };
    const outer = EnvelopeSchema.safeParse(envelope);
    expect(outer.success).toBe(true);
    if (outer.success) {
      // The outer schema narrows `payload` to `unknown`; the consumer
      // (Plan 05 conc-conflict-dispatcher.ts) re-narrows via the payload
      // schema. CN-9 proves both layers safeParse cleanly.
      const inner = ConcDropConfirmedPayloadSchema.safeParse(outer.data.payload);
      expect(inner.success).toBe(true);
      if (inner.success) {
        expect(inner.data.effectId).toBe('eff1');
      }
    }
  });

  it('CN-10: envelope WITHOUT session_id is rejected (NF-1-class guard)', () => {
    const envelope = {
      proto: 'evf-v1' as const,
      seq: 0,
      ts: Date.now(),
      type: CONC_DROP_CONFIRMED_TYPE,
      // session_id intentionally omitted
      payload: { effectId: 'eff1' },
    };
    const result = EnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(false);
  });
});
