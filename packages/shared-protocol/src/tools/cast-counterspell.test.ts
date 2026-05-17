/**
 * Unit tests for CastCounterspellInputSchema — SS-CCSP-01..05.
 *
 * Tests cover: positive parse, missing required fields, bounds enforcement,
 * default values, and strict-object rejection of extra keys.
 *
 * @see packages/shared-protocol/src/tools/cast-counterspell.ts
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 1 (D-13-02)
 */
import { describe, expect, it } from 'vitest';

import { CastCounterspellInputSchema } from './cast-counterspell.js';

describe('CastCounterspellInputSchema', () => {
  // SS-CCSP-01: positive parse — minimum fields
  it('SS-CCSP-01: parses valid input with required fields only', () => {
    const result = CastCounterspellInputSchema.safeParse({
      actor_id: 'actor-wizard',
      target_caster_id: 'actor-enemy',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actor_id).toBe('actor-wizard');
      expect(result.data.target_caster_id).toBe('actor-enemy');
      expect(result.data.slot_level).toBe(3); // default
      expect(result.data.activity_id).toBeUndefined();
    }
  });

  // SS-CCSP-02: parses with all optional fields
  it('SS-CCSP-02: parses valid input with all fields present', () => {
    const result = CastCounterspellInputSchema.safeParse({
      actor_id: 'actor-wizard',
      activity_id: 'act-456',
      slot_level: 5,
      target_caster_id: 'actor-enemy',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slot_level).toBe(5);
      expect(result.data.activity_id).toBe('act-456');
    }
  });

  // SS-CCSP-03: missing actor_id → fail
  it('SS-CCSP-03: rejects missing actor_id', () => {
    const result = CastCounterspellInputSchema.safeParse({
      target_caster_id: 'actor-enemy',
    });
    expect(result.success).toBe(false);
  });

  // SS-CCSP-03b: missing target_caster_id → fail
  it('SS-CCSP-03b: rejects missing target_caster_id', () => {
    const result = CastCounterspellInputSchema.safeParse({
      actor_id: 'actor-wizard',
    });
    expect(result.success).toBe(false);
  });

  // SS-CCSP-04: slot_level bounds — min 3
  it('SS-CCSP-04: rejects slot_level < 3 (min level for Counterspell)', () => {
    const result = CastCounterspellInputSchema.safeParse({
      actor_id: 'actor-wizard',
      target_caster_id: 'actor-enemy',
      slot_level: 2,
    });
    expect(result.success).toBe(false);
  });

  // SS-CCSP-04b: slot_level bounds — max 9
  it('SS-CCSP-04b: rejects slot_level > 9', () => {
    const result = CastCounterspellInputSchema.safeParse({
      actor_id: 'actor-wizard',
      target_caster_id: 'actor-enemy',
      slot_level: 10,
    });
    expect(result.success).toBe(false);
  });

  // SS-CCSP-04c: upcast slot_level 9 allowed
  it('SS-CCSP-04c: accepts slot_level = 9 (max upcast)', () => {
    const result = CastCounterspellInputSchema.safeParse({
      actor_id: 'actor-wizard',
      target_caster_id: 'actor-enemy',
      slot_level: 9,
    });
    expect(result.success).toBe(true);
  });

  // SS-CCSP-05: strict-object rejects extra keys
  it('SS-CCSP-05: rejects extra keys (strict-object)', () => {
    const result = CastCounterspellInputSchema.safeParse({
      actor_id: 'actor-wizard',
      target_caster_id: 'actor-enemy',
      unknown_key: 'boom',
    });
    expect(result.success).toBe(false);
  });
});
