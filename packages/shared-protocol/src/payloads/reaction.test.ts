/**
 * Unit tests for ReactionAvailablePayloadSchema (Plan 07-05 — REACT-01).
 *
 * Covers:
 * - Valid round-trip for all three reaction kinds
 * - Missing required fields rejected
 * - Unknown kind enum rejected
 * - Extra fields rejected (strict object)
 * - Wrong types rejected
 * - Negative expiresAt allowed (z.number().int() — no nonnegative constraint)
 *
 * @see packages/shared-protocol/src/payloads/reaction.ts
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 1
 */
import { describe, expect, it } from 'vitest';
import { R1_REACTION_AVAILABLE_TYPE, ReactionAvailablePayloadSchema } from './reaction.js';

describe('R1_REACTION_AVAILABLE_TYPE', () => {
  it('equals "r1.reaction.available"', () => {
    expect(R1_REACTION_AVAILABLE_TYPE).toBe('r1.reaction.available');
  });
});

describe('ReactionAvailablePayloadSchema', () => {
  describe('valid payloads', () => {
    it('accepts shield reaction', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'shield',
        sourceName: 'Goblin',
        expiresAt: Date.now() + 6000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe('shield');
      }
    });

    it('accepts counterspell reaction', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'counterspell',
        sourceName: 'Archmage',
        expiresAt: Date.now() + 6000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe('counterspell');
      }
    });

    it('accepts opportunity-attack reaction', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'opportunity-attack',
        sourceName: 'Orc Warrior',
        expiresAt: Date.now() + 6000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe('opportunity-attack');
      }
    });

    it('allows negative expiresAt (int, no nonnegative constraint)', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'shield',
        sourceName: 'Goblin',
        expiresAt: -1,
      });
      expect(result.success).toBe(true);
    });

    it('allows sourceName with special characters', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'counterspell',
        sourceName: "Mago dell'Oscurità",
        expiresAt: 1000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid payloads', () => {
    it('rejects missing kind', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        sourceName: 'Goblin',
        expiresAt: 1000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown kind enum value', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'parry',
        sourceName: 'Goblin',
        expiresAt: 1000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing sourceName', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'shield',
        expiresAt: 1000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty sourceName', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'shield',
        sourceName: '',
        expiresAt: 1000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing expiresAt', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'shield',
        sourceName: 'Goblin',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer expiresAt', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'shield',
        sourceName: 'Goblin',
        expiresAt: 1000.5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects extra fields (strict object)', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'shield',
        sourceName: 'Goblin',
        expiresAt: 1000,
        extra: 'field',
      });
      expect(result.success).toBe(false);
    });

    it('rejects wrong type for sourceName', () => {
      const result = ReactionAvailablePayloadSchema.safeParse({
        kind: 'shield',
        sourceName: 42,
        expiresAt: 1000,
      });
      expect(result.success).toBe(false);
    });
  });
});
