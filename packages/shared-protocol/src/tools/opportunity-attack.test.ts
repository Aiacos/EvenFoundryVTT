/**
 * Unit tests for OpportunityAttackInputSchema — SS-OAT-01..05.
 *
 * Tests cover: positive parse, missing required fields, strict-object rejection.
 *
 * @see packages/shared-protocol/src/tools/opportunity-attack.ts
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 1 (D-13-03)
 */
import { describe, expect, it } from 'vitest';

import { OpportunityAttackInputSchema } from './opportunity-attack.js';

describe('OpportunityAttackInputSchema', () => {
  // SS-OAT-01: positive parse
  it('SS-OAT-01: parses valid input', () => {
    const result = OpportunityAttackInputSchema.safeParse({
      actor_id: 'actor-fighter',
      item_id: 'item-longsword',
      target_id: 'token-goblin',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actor_id).toBe('actor-fighter');
      expect(result.data.item_id).toBe('item-longsword');
      expect(result.data.target_id).toBe('token-goblin');
    }
  });

  // SS-OAT-02: missing actor_id → fail
  it('SS-OAT-02: rejects missing actor_id', () => {
    const result = OpportunityAttackInputSchema.safeParse({
      item_id: 'item-longsword',
      target_id: 'token-goblin',
    });
    expect(result.success).toBe(false);
  });

  // SS-OAT-03: missing item_id → fail
  it('SS-OAT-03: rejects missing item_id', () => {
    const result = OpportunityAttackInputSchema.safeParse({
      actor_id: 'actor-fighter',
      target_id: 'token-goblin',
    });
    expect(result.success).toBe(false);
  });

  // SS-OAT-03b: missing target_id → fail
  it('SS-OAT-03b: rejects missing target_id', () => {
    const result = OpportunityAttackInputSchema.safeParse({
      actor_id: 'actor-fighter',
      item_id: 'item-longsword',
    });
    expect(result.success).toBe(false);
  });

  // SS-OAT-04: empty strings → fail
  it('SS-OAT-04: rejects empty actor_id', () => {
    const result = OpportunityAttackInputSchema.safeParse({
      actor_id: '',
      item_id: 'item-longsword',
      target_id: 'token-goblin',
    });
    expect(result.success).toBe(false);
  });

  it('SS-OAT-04b: rejects empty item_id', () => {
    const result = OpportunityAttackInputSchema.safeParse({
      actor_id: 'actor-fighter',
      item_id: '',
      target_id: 'token-goblin',
    });
    expect(result.success).toBe(false);
  });

  // SS-OAT-05: strict-object rejects extra keys
  it('SS-OAT-05: rejects extra keys (strict-object)', () => {
    const result = OpportunityAttackInputSchema.safeParse({
      actor_id: 'actor-fighter',
      item_id: 'item-longsword',
      target_id: 'token-goblin',
      extra: 'bad',
    });
    expect(result.success).toBe(false);
  });
});
