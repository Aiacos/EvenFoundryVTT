/**
 * Unit tests for DropConcentrationInputSchema (Plan 07-05 — CONC-01).
 *
 * Covers:
 * - Valid round-trip with actor_id + effect_id
 * - Missing actor_id rejected
 * - Empty actor_id rejected (min(1))
 * - Missing effect_id rejected
 * - Empty effect_id rejected (min(1))
 * - Extra fields rejected (strict object)
 *
 * @see packages/shared-protocol/src/tools/drop-concentration.ts
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 2
 */
import { describe, expect, it } from 'vitest';
import { DropConcentrationInputSchema } from './drop-concentration.js';

describe('DropConcentrationInputSchema', () => {
  describe('valid payloads', () => {
    it('accepts valid actor_id + effect_id', () => {
      const result = DropConcentrationInputSchema.safeParse({
        actor_id: 'actor-abc-123',
        effect_id: 'eff-concentration-456',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.actor_id).toBe('actor-abc-123');
        expect(result.data.effect_id).toBe('eff-concentration-456');
      }
    });

    it('accepts arbitrary non-empty string IDs', () => {
      const result = DropConcentrationInputSchema.safeParse({
        actor_id: 'x',
        effect_id: 'y',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid payloads', () => {
    it('rejects missing actor_id', () => {
      const result = DropConcentrationInputSchema.safeParse({
        effect_id: 'eff-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty actor_id (min(1))', () => {
      const result = DropConcentrationInputSchema.safeParse({
        actor_id: '',
        effect_id: 'eff-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing effect_id', () => {
      const result = DropConcentrationInputSchema.safeParse({
        actor_id: 'actor-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty effect_id (min(1))', () => {
      const result = DropConcentrationInputSchema.safeParse({
        actor_id: 'actor-1',
        effect_id: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects extra fields (strict object)', () => {
      const result = DropConcentrationInputSchema.safeParse({
        actor_id: 'actor-1',
        effect_id: 'eff-1',
        extra: 'field',
      });
      expect(result.success).toBe(false);
    });

    it('rejects null values', () => {
      const result = DropConcentrationInputSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('rejects non-string actor_id', () => {
      const result = DropConcentrationInputSchema.safeParse({
        actor_id: 42,
        effect_id: 'eff-1',
      });
      expect(result.success).toBe(false);
    });
  });
});
