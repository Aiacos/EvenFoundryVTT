/**
 * Unit tests for MultiAttackProgressPayloadSchema (Plan 07-04 — MULTI-01).
 *
 * Covers:
 *   - MAT-1: valid payload round-trips successfully
 *   - MAT-2: extra fields rejected (strict schema)
 *   - MAT-3: missing attackId → failure
 *   - MAT-4: non-UUID attackId → failure
 *   - MAT-5: missing current → failure
 *   - MAT-6: missing total → failure
 *   - MAT-7: total > 10 → failure (DoS limit T-07-04-01)
 *   - MAT-8: current < 1 → failure (min(1))
 *   - MAT-9: chatCardId null is allowed (attack produced no card)
 *   - MAT-10: chatCardId string is allowed
 *   - MAT-11: R1_MULTIATTACK_PROGRESS_TYPE constant is 'r1.multiattack.progress'
 *   - MAT-12: missing actorId → failure
 *
 * @see packages/shared-protocol/src/payloads/multi-attack.ts
 * @see .planning/phases/07-foundry-module-write-path/07-04-PLAN.md Task 1
 */

import { describe, expect, it } from 'vitest';
import { MultiAttackProgressPayloadSchema, R1_MULTIATTACK_PROGRESS_TYPE } from './multi-attack.js';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    attackId: VALID_UUID,
    current: 1,
    total: 2,
    chatCardId: 'cm-atk-1',
    actorId: 'actor-aragorn',
    ...overrides,
  };
}

describe('MultiAttackProgressPayloadSchema', () => {
  it('MAT-1: valid payload parses successfully', () => {
    const result = MultiAttackProgressPayloadSchema.safeParse(validPayload());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attackId).toBe(VALID_UUID);
      expect(result.data.current).toBe(1);
      expect(result.data.total).toBe(2);
      expect(result.data.chatCardId).toBe('cm-atk-1');
      expect(result.data.actorId).toBe('actor-aragorn');
    }
  });

  it('MAT-2: extra fields rejected (strict schema)', () => {
    const result = MultiAttackProgressPayloadSchema.safeParse(
      validPayload({ extraField: 'unexpected' }),
    );
    expect(result.success).toBe(false);
  });

  it('MAT-3: missing attackId → failure', () => {
    const { attackId: _dropped, ...rest } = validPayload() as {
      attackId: string;
      [k: string]: unknown;
    };
    const result = MultiAttackProgressPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('MAT-4: non-UUID attackId → failure', () => {
    const result = MultiAttackProgressPayloadSchema.safeParse(
      validPayload({ attackId: 'not-a-uuid' }),
    );
    expect(result.success).toBe(false);
  });

  it('MAT-5: missing current → failure', () => {
    const { current: _dropped, ...rest } = validPayload() as {
      current: number;
      [k: string]: unknown;
    };
    const result = MultiAttackProgressPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('MAT-6: missing total → failure', () => {
    const { total: _dropped, ...rest } = validPayload() as { total: number; [k: string]: unknown };
    const result = MultiAttackProgressPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('MAT-7: total > 10 → failure (T-07-04-01 DoS limit)', () => {
    const result = MultiAttackProgressPayloadSchema.safeParse(validPayload({ total: 11 }));
    expect(result.success).toBe(false);
  });

  it('MAT-8: current < 1 → failure (min(1))', () => {
    const result = MultiAttackProgressPayloadSchema.safeParse(validPayload({ current: 0 }));
    expect(result.success).toBe(false);
  });

  it('MAT-9: chatCardId null is allowed (attack produced no card)', () => {
    const result = MultiAttackProgressPayloadSchema.safeParse(validPayload({ chatCardId: null }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.chatCardId).toBeNull();
    }
  });

  it('MAT-10: chatCardId string is allowed', () => {
    const result = MultiAttackProgressPayloadSchema.safeParse(
      validPayload({ chatCardId: 'cm-attack-99' }),
    );
    expect(result.success).toBe(true);
  });

  it('MAT-12: missing actorId → failure', () => {
    const { actorId: _dropped, ...rest } = validPayload() as {
      actorId: string;
      [k: string]: unknown;
    };
    const result = MultiAttackProgressPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('R1_MULTIATTACK_PROGRESS_TYPE', () => {
  it('MAT-11: constant value is r1.multiattack.progress', () => {
    expect(R1_MULTIATTACK_PROGRESS_TYPE).toBe('r1.multiattack.progress');
  });
});
