/**
 * Unit tests for action-economy-state (Plan 09-01 — COMB-02 Wave 0).
 *
 * RED phase (TDD): tests written before implementation.
 *
 * Tests validate:
 * - AES-CACHE-01: getActionEconomyState returns null when no envelope seen
 * - AES-CACHE-02: after setActionEconomyState, getActionEconomyState returns the payload
 * - AES-CACHE-03: clearActionEconomyState resets the cache to empty Map
 *
 * @see packages/g2-app/src/panels/action-economy-state.ts
 * @see .planning/phases/09-action-economy-edge-cases/09-01-PLAN.md Task 3
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ActionEconomyPayload } from '@evf/shared-protocol';

const VALID_PAYLOAD: ActionEconomyPayload = {
  actorId: 'actor-1',
  actionsUsed: 1,
  bonusActionsUsed: 0,
  reactionsUsed: 0,
  multiAttackInProgress: false,
  recipientUserId: 'user-player-abc',
};

describe('action-economy-state', () => {
  let getActionEconomyState: (actorId: string) => ActionEconomyPayload | null;
  let setActionEconomyState: (payload: ActionEconomyPayload) => void;
  let clearActionEconomyState: () => void;

  beforeEach(async () => {
    // Re-import each test to get a fresh module state (module-scoped Map)
    const mod = await import('./action-economy-state.js');
    getActionEconomyState = mod.getActionEconomyState;
    setActionEconomyState = mod.setActionEconomyState;
    clearActionEconomyState = mod.clearActionEconomyState;
    // Clear before each test to ensure isolation
    clearActionEconomyState();
  });

  // ── AES-CACHE-01 ────────────────────────────────────────────────────────────

  it('AES-CACHE-01: getActionEconomyState returns null when no envelope seen for actorId', () => {
    expect(getActionEconomyState('actor-1')).toBeNull();
    expect(getActionEconomyState('nonexistent-actor')).toBeNull();
  });

  // ── AES-CACHE-02 ────────────────────────────────────────────────────────────

  it('AES-CACHE-02: after setActionEconomyState, getActionEconomyState returns that payload', () => {
    setActionEconomyState(VALID_PAYLOAD);
    const result = getActionEconomyState('actor-1');
    expect(result).toStrictEqual(VALID_PAYLOAD);
  });

  it('AES-CACHE-02b: setActionEconomyState overwrites previous state for same actorId', () => {
    setActionEconomyState(VALID_PAYLOAD);

    const updated: ActionEconomyPayload = {
      ...VALID_PAYLOAD,
      actionsUsed: 0,
      bonusActionsUsed: 1,
    };
    setActionEconomyState(updated);

    const result = getActionEconomyState('actor-1');
    expect(result?.actionsUsed).toBe(0);
    expect(result?.bonusActionsUsed).toBe(1);
  });

  it('AES-CACHE-02c: multiple actors tracked independently', () => {
    const payload2: ActionEconomyPayload = {
      actorId: 'actor-2',
      actionsUsed: 0,
      bonusActionsUsed: 0,
      reactionsUsed: 1,
      multiAttackInProgress: false,
      recipientUserId: 'user-player-xyz',
    };

    setActionEconomyState(VALID_PAYLOAD);
    setActionEconomyState(payload2);

    expect(getActionEconomyState('actor-1')).toStrictEqual(VALID_PAYLOAD);
    expect(getActionEconomyState('actor-2')).toStrictEqual(payload2);
  });

  // ── AES-CACHE-03 ────────────────────────────────────────────────────────────

  it('AES-CACHE-03: clearActionEconomyState resets cache to empty (getActionEconomyState returns null)', () => {
    setActionEconomyState(VALID_PAYLOAD);
    expect(getActionEconomyState('actor-1')).not.toBeNull();

    clearActionEconomyState();

    expect(getActionEconomyState('actor-1')).toBeNull();
  });

  it('AES-CACHE-03b: clearActionEconomyState is a no-op on empty cache (does not throw)', () => {
    expect(() => clearActionEconomyState()).not.toThrow();
  });
});
