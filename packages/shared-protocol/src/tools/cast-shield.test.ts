/**
 * Unit tests for CastShieldInputSchema — SS-CSH-01..05.
 *
 * Tests cover: positive parse, missing required fields, bounds enforcement,
 * default values, and strict-object rejection of extra keys.
 *
 * @see packages/shared-protocol/src/tools/cast-shield.ts
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 1
 */
import { describe, expect, it } from 'vitest';

import { CastShieldInputSchema } from './cast-shield.js';

describe('CastShieldInputSchema', () => {
  // SS-CSH-01: positive parse — minimum fields
  it('SS-CSH-01: parses valid input with required fields only', () => {
    const result = CastShieldInputSchema.safeParse({
      actor_id: 'actor-abc',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actor_id).toBe('actor-abc');
      expect(result.data.slot_level).toBe(1); // default applied
      expect(result.data.activity_id).toBeUndefined();
    }
  });

  // SS-CSH-02: parses with all optional fields present
  it('SS-CSH-02: parses valid input with all fields present', () => {
    const result = CastShieldInputSchema.safeParse({
      actor_id: 'actor-abc',
      activity_id: 'act-123',
      slot_level: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activity_id).toBe('act-123');
      expect(result.data.slot_level).toBe(1);
    }
  });

  // SS-CSH-03: missing actor_id → fail
  it('SS-CSH-03: rejects missing actor_id', () => {
    const result = CastShieldInputSchema.safeParse({ slot_level: 1 });
    expect(result.success).toBe(false);
  });

  // SS-CSH-03b: empty actor_id → fail
  it('SS-CSH-03b: rejects empty actor_id', () => {
    const result = CastShieldInputSchema.safeParse({ actor_id: '' });
    expect(result.success).toBe(false);
  });

  // SS-CSH-04: slot_level bounds — max is 1, so 2 should fail
  it('SS-CSH-04: rejects slot_level > 1 (no upcast for Shield)', () => {
    const result = CastShieldInputSchema.safeParse({
      actor_id: 'actor-abc',
      slot_level: 2,
    });
    expect(result.success).toBe(false);
  });

  // SS-CSH-04b: slot_level < 1 → fail
  it('SS-CSH-04b: rejects slot_level < 1', () => {
    const result = CastShieldInputSchema.safeParse({
      actor_id: 'actor-abc',
      slot_level: 0,
    });
    expect(result.success).toBe(false);
  });

  // SS-CSH-05: strict-object rejects extra keys
  it('SS-CSH-05: rejects extra keys (strict-object)', () => {
    const result = CastShieldInputSchema.safeParse({
      actor_id: 'actor-abc',
      extra_field: 'should_fail',
    });
    expect(result.success).toBe(false);
  });
});
