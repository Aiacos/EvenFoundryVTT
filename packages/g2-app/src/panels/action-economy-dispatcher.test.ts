/**
 * Unit tests for action-economy-dispatcher (Plan 09-01 — COMB-02 Wave 0).
 *
 * RED phase (TDD): tests written before implementation.
 *
 * Tests validate:
 * - AED-01: malformed JSON → console.warn + ignore + cache unchanged
 * - AED-02: envelope fails outer EnvelopeSchema.safeParse → warn + ignore
 * - AED-03: envelope.type !== R1_ACTION_ECONOMY_TYPE → silent return (no warn)
 * - AED-04: inner ActionEconomyPayloadSchema.safeParse fails → warn + ignore
 * - AED-05: payload.recipientUserId !== currentUserId → SILENT return (no warn — T-08-02 pattern)
 * - AED-06: happy path with matching recipient → setActionEconomyState called once
 * - AED-07: attachActionEconomyHandler returns unsubscribe closure that removes the listener
 * - AED-08: multi-attack flow: receive envelope with multiAttackInProgress=true → cache reflects it
 * - AED-09: empty recipientUserId sentinel vs non-matching currentUserId → silent drop
 *
 * @see packages/g2-app/src/panels/action-economy-dispatcher.ts
 * @see packages/g2-app/src/panels/action-result-dispatcher.ts (pattern reference)
 * @see .planning/phases/09-action-economy-edge-cases/09-01-PLAN.md Task 3
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock socket ──────────────────────────────────────────────────────────────

/** Minimal EventEmitter-backed mock socket — mirrors action-result-dispatcher.test.ts. */
class MockSocket {
  private readonly handlers: Map<string, Array<(ev: MessageEvent) => void>> = new Map();

  addEventListener(event: string, handler: (ev: MessageEvent) => void): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  removeEventListener(event: string, handler: (ev: MessageEvent) => void): void {
    const existing = this.handlers.get(event) ?? [];
    const filtered = existing.filter((h) => h !== handler);
    this.handlers.set(event, filtered);
  }

  send(_data: string): void {
    // no-op
  }

  fireMessage(data: unknown): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const event = { data: payload } as MessageEvent;
    const handlers = this.handlers.get('message') ?? [];
    for (const handler of handlers) {
      handler(event);
    }
  }

  listenerCount(event: string): number {
    return (this.handlers.get(event) ?? []).length;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const CURRENT_USER_ID = 'user-player-abc';
const ACTOR_ID = 'actor-fighter-1';

function makeValidEnvelope(overrides?: Record<string, unknown>) {
  return {
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: 'r1.action.economy',
    session_id: VALID_UUID,
    payload: {
      actorId: ACTOR_ID,
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: CURRENT_USER_ID,
      ...overrides,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attachActionEconomyHandler', () => {
  let socket: MockSocket;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    socket = new MockSocket();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Clear state before each test
    const { clearActionEconomyState } = await import('./action-economy-state.js');
    clearActionEconomyState();
  });

  // AED-07: subscribe + unsubscribe ───────────────────────────────────────────

  it('AED-07: attachActionEconomyHandler subscribes message listener and returns unsubscribe closure', async () => {
    const { attachActionEconomyHandler } = await import('./action-economy-dispatcher.js');
    const unsubscribe = attachActionEconomyHandler(socket, CURRENT_USER_ID);

    expect(socket.listenerCount('message')).toBe(1);
    unsubscribe();
    expect(socket.listenerCount('message')).toBe(0);

    // Double-call should not throw
    expect(() => unsubscribe()).not.toThrow();
  });

  // AED-06: happy path ────────────────────────────────────────────────────────

  it('AED-06: valid envelope with matching recipient → setActionEconomyState called once', async () => {
    const { attachActionEconomyHandler } = await import('./action-economy-dispatcher.js');
    const { getActionEconomyState } = await import('./action-economy-state.js');

    attachActionEconomyHandler(socket, CURRENT_USER_ID);
    socket.fireMessage(makeValidEnvelope());

    const cached = getActionEconomyState(ACTOR_ID);
    expect(cached).not.toBeNull();
    expect(cached?.actionsUsed).toBe(1);
    expect(cached?.actorId).toBe(ACTOR_ID);
    expect(cached?.recipientUserId).toBe(CURRENT_USER_ID);
  });

  // AED-01: malformed JSON ────────────────────────────────────────────────────

  it('AED-01: malformed JSON → console.warn + ignore + cache unchanged', async () => {
    const { attachActionEconomyHandler } = await import('./action-economy-dispatcher.js');
    const { getActionEconomyState } = await import('./action-economy-state.js');

    attachActionEconomyHandler(socket, CURRENT_USER_ID);

    // Send raw invalid JSON directly
    const event = { data: '{not valid json}}}' } as MessageEvent;
    const handlers = (
      socket as unknown as { handlers: Map<string, Array<(ev: MessageEvent) => void>> }
    ).handlers;
    const msgHandlers = handlers.get('message') ?? [];
    for (const h of msgHandlers) h(event);

    expect(getActionEconomyState(ACTOR_ID)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  // AED-02: outer envelope parse failure ─────────────────────────────────────

  it('AED-02: envelope fails outer EnvelopeSchema.safeParse → warn + ignore', async () => {
    const { attachActionEconomyHandler } = await import('./action-economy-dispatcher.js');
    const { getActionEconomyState } = await import('./action-economy-state.js');

    attachActionEconomyHandler(socket, CURRENT_USER_ID);
    socket.fireMessage({ not_an_envelope: true });

    expect(getActionEconomyState(ACTOR_ID)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  // AED-03: wrong envelope type → silent return, no warn ─────────────────────

  it('AED-03: envelope.type !== R1_ACTION_ECONOMY_TYPE → silent return, no warn', async () => {
    const { attachActionEconomyHandler } = await import('./action-economy-dispatcher.js');
    const { getActionEconomyState } = await import('./action-economy-state.js');

    attachActionEconomyHandler(socket, CURRENT_USER_ID);

    warnSpy.mockClear();
    socket.fireMessage({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'character.delta', // different type
      session_id: VALID_UUID,
      payload: {},
    });

    expect(getActionEconomyState(ACTOR_ID)).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // AED-04: inner payload parse failure ──────────────────────────────────────

  it('AED-04: inner ActionEconomyPayloadSchema fails → warn + ignore', async () => {
    const { attachActionEconomyHandler } = await import('./action-economy-dispatcher.js');
    const { getActionEconomyState } = await import('./action-economy-state.js');

    attachActionEconomyHandler(socket, CURRENT_USER_ID);

    // Missing recipientUserId — inner schema rejects
    socket.fireMessage({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'r1.action.economy',
      session_id: VALID_UUID,
      payload: {
        actorId: ACTOR_ID,
        actionsUsed: 1,
        bonusActionsUsed: 0,
        reactionsUsed: 0,
        multiAttackInProgress: false,
        // recipientUserId intentionally missing
      },
    });

    expect(getActionEconomyState(ACTOR_ID)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  // AED-05: recipient mismatch → SILENT drop ─────────────────────────────────

  it('AED-05 (T-08-02): recipientUserId !== currentUserId → SILENT return (no warn, no cache write)', async () => {
    const { attachActionEconomyHandler } = await import('./action-economy-dispatcher.js');
    const { getActionEconomyState } = await import('./action-economy-state.js');

    attachActionEconomyHandler(socket, CURRENT_USER_ID);

    warnSpy.mockClear();
    socket.fireMessage(makeValidEnvelope({ recipientUserId: 'some-other-player' }));

    expect(getActionEconomyState(ACTOR_ID)).toBeNull();
    // T-08-02 pattern: no warn on recipient mismatch (prevents signalling cross-player activity)
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // AED-08: multiAttackInProgress=true stored in cache ──────────────────────

  it('AED-08: envelope with multiAttackInProgress=true stores it in cache', async () => {
    const { attachActionEconomyHandler } = await import('./action-economy-dispatcher.js');
    const { getActionEconomyState } = await import('./action-economy-state.js');

    attachActionEconomyHandler(socket, CURRENT_USER_ID);
    socket.fireMessage(makeValidEnvelope({ multiAttackInProgress: true }));

    const cached = getActionEconomyState(ACTOR_ID);
    expect(cached?.multiAttackInProgress).toBe(true);
  });

  // AED-09: empty recipientUserId vs non-matching currentUserId → silent drop ─

  it('AED-09: empty string recipientUserId vs non-empty currentUserId → fails schema (inner reject) or silent drop', async () => {
    const { attachActionEconomyHandler } = await import('./action-economy-dispatcher.js');
    const { getActionEconomyState } = await import('./action-economy-state.js');

    attachActionEconomyHandler(socket, CURRENT_USER_ID);

    // recipientUserId='' — fails ActionEconomyPayloadSchema.min(1) → inner parse failure → warn
    socket.fireMessage(makeValidEnvelope({ recipientUserId: '' }));

    // Either warn (schema rejected) or silent drop (mismatch) — in either case cache is empty
    expect(getActionEconomyState(ACTOR_ID)).toBeNull();
  });
});
