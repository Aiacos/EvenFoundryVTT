/**
 * Unit tests for ActionEconomyPayloadSchema + R1_ACTION_ECONOMY_TYPE.
 *
 * RED phase (TDD): tests written before implementation per Plan 09-01 Task 1.
 *
 * Tests validate:
 * - AES-01..09: ActionEconomyPayloadSchema field-level validation
 * - AES-09: R1_ACTION_ECONOMY_TYPE constant
 *
 * @see packages/shared-protocol/src/payloads/action-economy.ts
 * @see .planning/phases/09-action-economy-edge-cases/09-01-PLAN.md Task 1
 */
import { describe, expect, it } from 'vitest';
import type { ActionEconomyPayload } from './action-economy.js';
import { ActionEconomyPayloadSchema, R1_ACTION_ECONOMY_TYPE } from './action-economy.js';

/** Minimal valid payload for use in tests. */
const VALID: ActionEconomyPayload = {
  actorId: 'actor-abc',
  actionsUsed: 0,
  bonusActionsUsed: 0,
  reactionsUsed: 0,
  multiAttackInProgress: false,
  recipientUserId: 'user-xyz',
};

describe('R1_ACTION_ECONOMY_TYPE', () => {
  it('AES-09: equals "r1.action.economy"', () => {
    expect(R1_ACTION_ECONOMY_TYPE).toBe('r1.action.economy');
  });
});

describe('ActionEconomyPayloadSchema', () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it('AES-01: accepts a fully valid payload (all zeros, multiAttackInProgress=false)', () => {
    const result = ActionEconomyPayloadSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it('AES-01b: accepts actionsUsed=1, bonusActionsUsed=1, reactionsUsed=1, multiAttackInProgress=true', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      actionsUsed: 1,
      bonusActionsUsed: 1,
      reactionsUsed: 1,
      multiAttackInProgress: true,
    });
    expect(result.success).toBe(true);
  });

  // ── Strict object — extra fields rejected ──────────────────────────────────

  it('AES-02: rejects payload with extra field (strictObject enforcement)', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      evil: 'injected',
    });
    expect(result.success).toBe(false);
  });

  // ── actionsUsed bounds ─────────────────────────────────────────────────────

  it('AES-03: rejects actionsUsed > 1', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      actionsUsed: 2,
    });
    expect(result.success).toBe(false);
  });

  it('AES-04: rejects actionsUsed < 0', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      actionsUsed: -1,
    });
    expect(result.success).toBe(false);
  });

  // ── recipientUserId validation ─────────────────────────────────────────────

  it('AES-05: rejects empty recipientUserId (min(1))', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      recipientUserId: '',
    });
    expect(result.success).toBe(false);
  });

  it('AES-06: rejects missing recipientUserId (required, no .optional)', () => {
    const { recipientUserId: _omitted, ...withoutRecipient } = VALID as Record<string, unknown>;
    const result = ActionEconomyPayloadSchema.safeParse(withoutRecipient);
    expect(result.success).toBe(false);
  });

  // ── bonusActionsUsed and reactionsUsed bounds ──────────────────────────────

  it('AES-07a: rejects bonusActionsUsed < 0', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      bonusActionsUsed: -1,
    });
    expect(result.success).toBe(false);
  });

  it('AES-07b: rejects bonusActionsUsed > 1', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      bonusActionsUsed: 2,
    });
    expect(result.success).toBe(false);
  });

  it('AES-07c: rejects reactionsUsed < 0', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      reactionsUsed: -1,
    });
    expect(result.success).toBe(false);
  });

  it('AES-07d: rejects reactionsUsed > 1', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      reactionsUsed: 2,
    });
    expect(result.success).toBe(false);
  });

  // ── multiAttackInProgress type ─────────────────────────────────────────────

  it('AES-08: rejects missing multiAttackInProgress (required boolean, no default)', () => {
    const { multiAttackInProgress: _omitted, ...withoutFlag } = VALID as Record<string, unknown>;
    const result = ActionEconomyPayloadSchema.safeParse(withoutFlag);
    expect(result.success).toBe(false);
  });

  it('AES-08b: rejects non-boolean multiAttackInProgress', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      multiAttackInProgress: 'yes',
    });
    expect(result.success).toBe(false);
  });

  // ── actorId validation ─────────────────────────────────────────────────────

  it('actorId must be min(1) — empty string rejected', () => {
    const result = ActionEconomyPayloadSchema.safeParse({
      ...VALID,
      actorId: '',
    });
    expect(result.success).toBe(false);
  });

  it('actorId is required — missing field rejected', () => {
    const { actorId: _omitted, ...withoutActorId } = VALID as Record<string, unknown>;
    const result = ActionEconomyPayloadSchema.safeParse(withoutActorId);
    expect(result.success).toBe(false);
  });
});
