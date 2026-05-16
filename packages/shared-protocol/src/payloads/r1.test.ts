/**
 * Unit tests for R1GesturePayloadSchema + R1_GESTURE_TYPE (Plan 06-01 Task 1).
 *
 * Covers the R1 wire-schema behavior block:
 *   - R1-01: valid tap payload parses successfully
 *   - R1-02: all five wire kinds parse (tap, scroll-up, scroll-down, long-press, double-tap)
 *   - R1-03: unknown kind is rejected (enum guard)
 *   - R1-04: missing timestamp is rejected (timestamp required)
 *   - R1-05: string timestamp is rejected (must be integer)
 *   - R1-06: R1_GESTURE_TYPE === 'r1.gesture' exact-literal assertion
 *   - R1-07: re-export from @evf/shared-protocol package entry
 *   - R1-08: extra fields are rejected (strict schema)
 *   - R1-09: timestamp=0 is accepted (edge: zero epoch is valid integer)
 *   - R1-10: floating-point timestamp is rejected (must be int)
 *
 * @see ./r1.ts (schema definitions)
 * @see ../envelope.ts (EnvelopeSchema — canonical wire carrier)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-01-PLAN.md Task 1
 */
import { describe, expect, it } from 'vitest';
import { EnvelopeSchema } from '../envelope.js';
import { R1_GESTURE_TYPE, R1GesturePayloadSchema } from './r1.js';

/** A valid UUID v4 literal for envelope round-trip tests. */
const VALID_UUID_V4 = '11111111-1111-4111-8111-111111111111';

describe('R1GesturePayloadSchema (R1-01..R1-05, R1-08..R1-10)', () => {
  it('R1-01: parses valid tap payload', () => {
    const result = R1GesturePayloadSchema.safeParse({ kind: 'tap', timestamp: 1700000000000 });
    expect(result.success).toBe(true);
  });

  it('R1-02: parses all five wire kinds', () => {
    const kinds = ['tap', 'scroll-up', 'scroll-down', 'long-press', 'double-tap'] as const;
    for (const kind of kinds) {
      const result = R1GesturePayloadSchema.safeParse({ kind, timestamp: 1700000000000 });
      expect(result.success, `kind '${kind}' should parse`).toBe(true);
    }
  });

  it('R1-03: rejects unknown kind (enum guard)', () => {
    const result = R1GesturePayloadSchema.safeParse({ kind: 'unknown', timestamp: 0 });
    expect(result.success).toBe(false);
  });

  it('R1-04: rejects missing timestamp (timestamp required)', () => {
    const result = R1GesturePayloadSchema.safeParse({ kind: 'tap' });
    expect(result.success).toBe(false);
  });

  it('R1-05: rejects string timestamp (must be integer number)', () => {
    const result = R1GesturePayloadSchema.safeParse({ kind: 'tap', timestamp: '0' });
    expect(result.success).toBe(false);
  });

  it('R1-08: rejects extra fields (strict schema)', () => {
    const result = R1GesturePayloadSchema.safeParse({
      kind: 'tap',
      timestamp: 1700000000000,
      extra: 'should-be-rejected',
    });
    expect(result.success).toBe(false);
  });

  it('R1-09: accepts timestamp=0 (zero epoch is valid integer)', () => {
    const result = R1GesturePayloadSchema.safeParse({ kind: 'scroll-up', timestamp: 0 });
    expect(result.success).toBe(true);
  });

  it('R1-10: rejects floating-point timestamp (must be int per z.number().int())', () => {
    const result = R1GesturePayloadSchema.safeParse({ kind: 'tap', timestamp: 1700000000000.5 });
    expect(result.success).toBe(false);
  });
});

describe('R1_GESTURE_TYPE constant (R1-06)', () => {
  it("R1-06: R1_GESTURE_TYPE === 'r1.gesture'", () => {
    expect(R1_GESTURE_TYPE).toBe('r1.gesture');
  });
});

describe('@evf/shared-protocol re-export contract (R1-07)', () => {
  it('R1-07: R1GesturePayloadSchema + R1_GESTURE_TYPE re-exported from package entry', async () => {
    const pkg = await import('../index.js');
    expect(pkg.R1GesturePayloadSchema).toBeDefined();
    expect(pkg.R1_GESTURE_TYPE).toBe('r1.gesture');
  });
});

describe('canonical EnvelopeSchema round-trip with R1 payload', () => {
  it('R1-E1: valid r1.gesture envelope round-trips outer + inner safeParse', () => {
    const envelope = {
      proto: 'evf-v1' as const,
      seq: 0,
      ts: Date.now(),
      type: R1_GESTURE_TYPE,
      session_id: VALID_UUID_V4,
      payload: { kind: 'tap', timestamp: 1700000000000 },
    };
    const outer = EnvelopeSchema.safeParse(envelope);
    expect(outer.success).toBe(true);
    if (outer.success) {
      const inner = R1GesturePayloadSchema.safeParse(outer.data.payload);
      expect(inner.success).toBe(true);
      if (inner.success) {
        expect(inner.data.kind).toBe('tap');
      }
    }
  });
});
