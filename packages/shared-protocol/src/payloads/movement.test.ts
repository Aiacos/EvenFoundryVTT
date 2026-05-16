/**
 * Unit tests for MovementBudgetPayloadSchema (Plan 08-04 — ACT-01 move variant).
 *
 * Covers MV-01..04: R1_MOVEMENT_BUDGET_TYPE constant, happy-path validation,
 * strict-object rejection, and field type enforcement.
 *
 * All tests use `safeParse` (not `parse`) so success/failure assertions are symmetric.
 *
 * @see packages/shared-protocol/src/payloads/movement.ts
 * @see .planning/phases/08-manual-action-ux/08-04-PLAN.md Task 1
 */

import { describe, expect, it } from 'vitest';

function makeValidPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    actorId: 'actor-abc',
    walkSpeed: 30,
    usedThisTurn: 5,
    remainingFeet: 25,
    ...overrides,
  };
}

describe('MovementBudgetPayloadSchema', () => {
  // MV-01: R1_MOVEMENT_BUDGET_TYPE constant equals 'r1.movement.budget'
  it('MV-01: R1_MOVEMENT_BUDGET_TYPE equals "r1.movement.budget"', async () => {
    const { R1_MOVEMENT_BUDGET_TYPE } = await import('./movement.js');
    expect(R1_MOVEMENT_BUDGET_TYPE).toBe('r1.movement.budget');
  });

  // MV-02: Happy path — valid 4-field payload validates successfully
  it('MV-02: accepts a valid 4-field happy-path payload', async () => {
    const { MovementBudgetPayloadSchema } = await import('./movement.js');
    const result = MovementBudgetPayloadSchema.safeParse(makeValidPayload());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actorId).toBe('actor-abc');
      expect(result.data.walkSpeed).toBe(30);
      expect(result.data.usedThisTurn).toBe(5);
      expect(result.data.remainingFeet).toBe(25);
    }
  });

  // MV-02b: usedThisTurn=0 is valid (start of turn)
  it('MV-02b: accepts usedThisTurn=0 (start of turn)', async () => {
    const { MovementBudgetPayloadSchema } = await import('./movement.js');
    const result = MovementBudgetPayloadSchema.safeParse(
      makeValidPayload({ usedThisTurn: 0, remainingFeet: 30 }),
    );
    expect(result.success).toBe(true);
  });

  // MV-02c: remainingFeet may be negative (over-budget — Phase 9 enforcement)
  it('MV-02c: accepts negative remainingFeet (over-budget move — Phase 9 enforcement deferred)', async () => {
    const { MovementBudgetPayloadSchema } = await import('./movement.js');
    const result = MovementBudgetPayloadSchema.safeParse(
      makeValidPayload({ usedThisTurn: 35, remainingFeet: -5 }),
    );
    expect(result.success).toBe(true);
  });

  // MV-03: Strict-object rejection — extra field smuggling attempt rejected
  it('MV-03: rejects extra field "extra" (strict object — field-smuggling defence)', async () => {
    const { MovementBudgetPayloadSchema } = await import('./movement.js');
    const result = MovementBudgetPayloadSchema.safeParse(makeValidPayload({ extra: 'leak' }));
    expect(result.success).toBe(false);
  });

  // MV-03b: actorId must be non-empty string
  it('MV-03b: rejects empty actorId', async () => {
    const { MovementBudgetPayloadSchema } = await import('./movement.js');
    const result = MovementBudgetPayloadSchema.safeParse(makeValidPayload({ actorId: '' }));
    expect(result.success).toBe(false);
  });

  // MV-03c: walkSpeed must be non-negative integer
  it('MV-03c: rejects negative walkSpeed and float walkSpeed', async () => {
    const { MovementBudgetPayloadSchema } = await import('./movement.js');

    const negResult = MovementBudgetPayloadSchema.safeParse(makeValidPayload({ walkSpeed: -1 }));
    expect(negResult.success).toBe(false);

    const floatResult = MovementBudgetPayloadSchema.safeParse(
      makeValidPayload({ walkSpeed: 30.5 }),
    );
    expect(floatResult.success).toBe(false);
  });

  // MV-04: documented invariant (usedThisTurn + remainingFeet === walkSpeed) is NOT enforced by Zod
  it('MV-04: does NOT enforce usedThisTurn+remainingFeet===walkSpeed (sender responsibility)', async () => {
    const { MovementBudgetPayloadSchema } = await import('./movement.js');
    // 10 + 10 !== 30 — schema still accepts (invariant is documented, not enforced)
    const result = MovementBudgetPayloadSchema.safeParse(
      makeValidPayload({ walkSpeed: 30, usedThisTurn: 10, remainingFeet: 10 }),
    );
    expect(result.success).toBe(true);
  });

  // MV-05: barrel re-export compiles + import resolves from shared-protocol index
  it('MV-05: MovementBudgetPayloadSchema and R1_MOVEMENT_BUDGET_TYPE importable from barrel index', async () => {
    const { MovementBudgetPayloadSchema, R1_MOVEMENT_BUDGET_TYPE } = await import('../index.js');
    expect(MovementBudgetPayloadSchema).toBeDefined();
    expect(R1_MOVEMENT_BUDGET_TYPE).toBe('r1.movement.budget');
  });
});
