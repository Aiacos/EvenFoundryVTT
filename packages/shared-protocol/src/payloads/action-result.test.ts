/**
 * Unit tests for ActionResultPayloadSchema (Plan 08-01 — ACT-01).
 *
 * Covers ART-01..11: happy path, required field enforcement, enum rejection,
 * strict-object field-smuggling defense, and R1_ACTION_RESULT_TYPE constant.
 *
 * All tests use `safeParse` (not `parse`) so success/failure assertions are symmetric.
 *
 * @see packages/shared-protocol/src/payloads/action-result.ts
 * @see .planning/phases/08-manual-action-ux/08-01-PLAN.md Task 1
 */

import { describe, expect, it } from 'vitest';

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const NON_UUID = 'not-a-uuid';

function makeValidPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    idempotencyKey: VALID_UUID,
    toolId: 'cast-spell',
    d20: 18,
    outcome: 'hit',
    damage: '1d8+3 = 7 sl',
    status: 'success',
    recipientUserId: 'user-abc',
    ...overrides,
  };
}

describe('ActionResultPayloadSchema', () => {
  // ART-01: happy path — 8-field payload validates successfully
  it('ART-01: accepts a valid 8-field happy-path payload', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');
    const result = ActionResultPayloadSchema.safeParse(makeValidPayload());
    expect(result.success).toBe(true);
  });

  // ART-02: recipientUserId is required — T-08-02 mitigation
  it('ART-02: rejects when recipientUserId is missing (T-08-02 — no silent cross-player leak)', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');
    const { recipientUserId: _removed, ...withoutRecipient } = makeValidPayload() as {
      recipientUserId: string;
      [k: string]: unknown;
    };
    const result = ActionResultPayloadSchema.safeParse(withoutRecipient);
    expect(result.success).toBe(false);
  });

  // ART-03: idempotencyKey must be a valid UUID v4
  it('ART-03: rejects when idempotencyKey is not a UUID', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');
    const result = ActionResultPayloadSchema.safeParse(
      makeValidPayload({ idempotencyKey: NON_UUID }),
    );
    expect(result.success).toBe(false);
  });

  // ART-04: toolId must be one of the TOOL_ID_SCHEMA values
  it('ART-04: accepts "cast-spell" as toolId; rejects "unknown-tool"', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');

    const accepted = ActionResultPayloadSchema.safeParse(
      makeValidPayload({ toolId: 'cast-spell' }),
    );
    expect(accepted.success).toBe(true);

    const rejected = ActionResultPayloadSchema.safeParse(
      makeValidPayload({ toolId: 'unknown-tool' }),
    );
    expect(rejected.success).toBe(false);
  });

  // ART-05: outcome must be one of the 6 canonical values
  it('ART-05: accepts canonical outcome values; rejects "critical"', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');

    const canonicalValues = ['hit', 'miss', 'save_success', 'save_fail', 'damage_dealt', 'no_roll'];
    for (const outcome of canonicalValues) {
      const result = ActionResultPayloadSchema.safeParse(makeValidPayload({ outcome }));
      expect(result.success, `outcome=${outcome} should be valid`).toBe(true);
    }

    const rejected = ActionResultPayloadSchema.safeParse(makeValidPayload({ outcome: 'critical' }));
    expect(rejected.success).toBe(false);
  });

  // ART-06: status must be 'success' | 'failure' | 'error'
  it('ART-06: accepts valid status values; rejects "pending"', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');

    for (const status of ['success', 'failure', 'error']) {
      const result = ActionResultPayloadSchema.safeParse(makeValidPayload({ status }));
      expect(result.success, `status=${status} should be valid`).toBe(true);
    }

    const rejected = ActionResultPayloadSchema.safeParse(makeValidPayload({ status: 'pending' }));
    expect(rejected.success).toBe(false);
  });

  // ART-07: errorKind is optional — accepts undefined; rejects 'unknown-error'
  it('ART-07: accepts undefined errorKind; accepts valid enum; rejects "unknown-error"', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');

    // Undefined (not present) is accepted
    const { errorKind: _removed, ...withoutKind } = makeValidPayload() as {
      errorKind?: string;
      [k: string]: unknown;
    };
    const noKind = ActionResultPayloadSchema.safeParse(withoutKind);
    expect(noKind.success).toBe(true);

    // Valid enum values accepted
    const validKinds = [
      'no-targets',
      'out-of-range',
      'out-of-resource',
      'wrong-turn',
      'gm-rejected',
    ];
    for (const errorKind of validKinds) {
      const result = ActionResultPayloadSchema.safeParse(
        makeValidPayload({ status: 'error', errorKind }),
      );
      expect(result.success, `errorKind=${errorKind} should be valid`).toBe(true);
    }

    // Invalid enum rejected
    const rejected = ActionResultPayloadSchema.safeParse(
      makeValidPayload({ errorKind: 'unknown-error' }),
    );
    expect(rejected.success).toBe(false);
  });

  // ART-08: damage is optional string — number rejected
  it('ART-08: accepts string damage; rejects number damage', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');

    const withString = ActionResultPayloadSchema.safeParse(
      makeValidPayload({ damage: '2d6 = 9 fire' }),
    );
    expect(withString.success).toBe(true);

    const withNumber = ActionResultPayloadSchema.safeParse(makeValidPayload({ damage: 42 }));
    expect(withNumber.success).toBe(false);
  });

  // ART-09: d20 is number().int().min(1).max(20).nullable() — null accepted; in-range
  // integer accepted; 21 now REJECTED (out of die range, R-review fix); 0.5 rejected.
  it('ART-09: accepts null d20 (no_roll case) and in-range integer; rejects out-of-range 21 and float 0.5', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');

    const withNull = ActionResultPayloadSchema.safeParse(
      makeValidPayload({ d20: null, outcome: 'no_roll' }),
    );
    expect(withNull.success).toBe(true);

    const withInt = ActionResultPayloadSchema.safeParse(makeValidPayload({ d20: 20 }));
    expect(withInt.success).toBe(true);

    const outOfRange = ActionResultPayloadSchema.safeParse(makeValidPayload({ d20: 21 }));
    expect(outOfRange.success).toBe(false);

    const withFloat = ActionResultPayloadSchema.safeParse(makeValidPayload({ d20: 0.5 }));
    expect(withFloat.success).toBe(false);
  });

  // ART-10: strict object — extra field rejected (T-08-01 belt-and-suspenders)
  it('ART-10: rejects extra field "extra" (strict object — T-08-01 field-smuggling defence)', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');
    const result = ActionResultPayloadSchema.safeParse(makeValidPayload({ extra: 'leak-attempt' }));
    expect(result.success).toBe(false);
  });

  // ART-11: R1_ACTION_RESULT_TYPE constant equals 'r1.action.result'
  it('ART-11: R1_ACTION_RESULT_TYPE equals "r1.action.result"', async () => {
    const { R1_ACTION_RESULT_TYPE } = await import('./action-result.js');
    expect(R1_ACTION_RESULT_TYPE).toBe('r1.action.result');
  });

  // ART-D20-BOUNDS: d20 must be a natural die face in [1, 20] (or null).
  it('ART-D20-BOUNDS: rejects d20 outside 1-20; accepts 1, 20, and null', async () => {
    const { ActionResultPayloadSchema } = await import('./action-result.js');
    for (const bad of [0, 21, -1]) {
      const result = ActionResultPayloadSchema.safeParse(makeValidPayload({ d20: bad }));
      expect(result.success, `d20=${bad} should be rejected`).toBe(false);
    }
    for (const good of [1, 20, null]) {
      const result = ActionResultPayloadSchema.safeParse(makeValidPayload({ d20: good }));
      expect(result.success, `d20=${good} should be accepted`).toBe(true);
    }
  });

  // ART-12: barrel re-export compiles + import resolves from shared-protocol index
  it('ART-12: ActionResultPayloadSchema and R1_ACTION_RESULT_TYPE importable from barrel index', async () => {
    // Import from the package index to verify barrel export is wired.
    // Uses relative path from payloads/ to src/ root (index.ts).
    const { ActionResultPayloadSchema, R1_ACTION_RESULT_TYPE } = await import('../index.js');
    expect(ActionResultPayloadSchema).toBeDefined();
    expect(R1_ACTION_RESULT_TYPE).toBe('r1.action.result');
  });
});
