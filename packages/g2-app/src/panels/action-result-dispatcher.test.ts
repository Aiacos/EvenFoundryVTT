/**
 * Unit tests for action-result-dispatcher (Plan 08-01 — ACT-01).
 *
 * Covers ARD-01..13:
 * - ARD-01: attachActionResultHandler subscribes message listener; returns unsubscribe closure
 * - ARD-02: Valid envelope → toastQueue.enqueue called once with typed toast
 * - ARD-03: Outer EnvelopeSchema parse failure → console.warn + NO enqueue
 * - ARD-04: Envelope type !== 'r1.action.result' → silent return, NO enqueue, NO warn
 * - ARD-05: Inner ActionResultPayloadSchema parse failure → console.warn + NO enqueue
 * - ARD-06 (T-08-02): recipientUserId !== currentUserId → silent drop, NO enqueue, NO warn
 * - ARD-07: Severity mapping (success/failure/error → info/info/error)
 * - ARD-08: IT hit message format: "[d20=18] Colpito! 1d8+3 = 7 sl"
 * - ARD-09: IT miss message format: "[d20=4] Mancato"
 * - ARD-10: EN save-success message format includes save marker
 * - ARD-11: Error message format: "❌ <localized error.action.<kind>>"
 * - ARD-12: Toast id is deterministic: "action-result-<idempotencyKey>"
 * - ARD-13: JSON.parse throw → console.warn + NO enqueue
 *
 * @see packages/g2-app/src/panels/action-result-dispatcher.ts
 * @see .planning/phases/08-manual-action-ux/08-01-PLAN.md Task 3
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Toast } from '../status-hud/toast-types.js';
import type { ActionResultToastQueue } from './action-result-dispatcher.js';

// Plan 09-03: mock conc-retry-cache so ARD-CONC tests can spy on markRetryConfirmed.
vi.mock('./conc-retry-cache.js', () => ({
  cacheRetryEnvelope: vi.fn(),
  markRetryConfirmed: vi.fn(),
  consumeRetryEnvelope: vi.fn(() => null),
  consumeLatestConfirmed: vi.fn(() => null),
  clearRetryCache: vi.fn(),
}));
import { markRetryConfirmed } from './conc-retry-cache.js';

// ─── Mock socket ──────────────────────────────────────────────────────────────

/** Minimal EventEmitter-backed mock socket — matches reaction-toast-dispatcher.test.ts pattern. */
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

function makeValidEnvelope(overrides?: Record<string, unknown>) {
  return {
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: 'r1.action.result',
    session_id: VALID_UUID,
    payload: {
      idempotencyKey: VALID_UUID,
      toolId: 'cast-spell',
      d20: 18,
      outcome: 'hit',
      damage: '1d8+3 = 7 sl',
      status: 'success',
      recipientUserId: CURRENT_USER_ID,
      ...overrides,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attachActionResultHandler', () => {
  let socket: MockSocket;
  let toastQueueMock: ActionResultToastQueue & { enqueue: ReturnType<typeof vi.fn> };
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    socket = new MockSocket();
    const enqueueMock = vi.fn<(toast: Toast) => void>();
    toastQueueMock = { enqueue: enqueueMock } as unknown as ActionResultToastQueue & {
      enqueue: ReturnType<typeof vi.fn>;
    };
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // ARD-01: subscribe + unsubscribe
  it('ARD-01: subscribes message listener; returns idempotent unsubscribe closure', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    const unsubscribe = attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    expect(socket.listenerCount('message')).toBe(1);
    unsubscribe();
    expect(socket.listenerCount('message')).toBe(0);

    // Double-call should not throw
    expect(() => unsubscribe()).not.toThrow();
  });

  // ARD-02: valid envelope → enqueue called once
  it('ARD-02: valid envelope enqueues a typed toast exactly once', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(makeValidEnvelope());

    expect(toastQueueMock.enqueue).toHaveBeenCalledTimes(1);
    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast).toBeDefined();
    expect(toast.id).toBeDefined();
    expect(toast.severity).toBeDefined();
    expect(toast.message).toBeDefined();
    expect(toast.emittedAt).toBeTypeOf('number');
  });

  // ARD-03: outer envelope parse failure → console.warn + NO enqueue
  it('ARD-03: malformed envelope (missing session_id) → console.warn + NO enqueue', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'en', CURRENT_USER_ID);

    socket.fireMessage({ not_an_envelope: true });

    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  // ARD-04: wrong type → silent return, NO enqueue, NO warn
  it('ARD-04: envelope type="character.delta" → silent return, NO enqueue, NO console.warn', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'en', CURRENT_USER_ID);

    const otherEnvelope = {
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'character.delta',
      session_id: VALID_UUID,
      payload: {},
    };
    warnSpy.mockClear();
    socket.fireMessage(otherEnvelope);

    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // ARD-05: inner payload parse failure → console.warn + NO enqueue
  it('ARD-05: inner ActionResultPayloadSchema failure (missing recipientUserId) → console.warn + NO enqueue', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'en', CURRENT_USER_ID);

    // Missing recipientUserId — inner schema rejects
    const invalidPayload = {
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'r1.action.result',
      session_id: VALID_UUID,
      payload: {
        idempotencyKey: VALID_UUID,
        toolId: 'cast-spell',
        d20: 18,
        outcome: 'hit',
        status: 'success',
        // recipientUserId intentionally missing
      },
    };

    socket.fireMessage(invalidPayload);

    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  // ARD-06 (T-08-02): recipientUserId mismatch → silent drop, NO warn
  it('ARD-06 (T-08-02): recipientUserId !== currentUserId → silent drop, NO enqueue, NO console.warn', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'en', CURRENT_USER_ID);

    const otherPlayerEnvelope = makeValidEnvelope({ recipientUserId: 'other-player-id' });
    warnSpy.mockClear();
    socket.fireMessage(otherPlayerEnvelope);

    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
    // T-08-02: silent drop — no console.warn (would signal cross-player activity to attacker)
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // ARD-07: severity mapping
  it('ARD-07: status="success" outcome="hit" → severity="info"', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(makeValidEnvelope({ status: 'success', outcome: 'hit' }));

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.severity).toBe('info');
  });

  it('ARD-07b: status="failure" outcome="miss" → severity="info" (informational miss)', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({ status: 'failure', outcome: 'miss', damage: undefined }),
    );

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.severity).toBe('info');
  });

  it('ARD-07c: status="error" → severity="error"', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({
        status: 'error',
        outcome: 'no_roll',
        d20: null,
        errorKind: 'no-targets',
        damage: undefined,
      }),
    );

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.severity).toBe('error');
  });

  // ARD-08: IT hit message format
  it('ARD-08: IT hit message format includes d20 and damage', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({ d20: 18, outcome: 'hit', damage: '1d8+3 = 7 sl', status: 'success' }),
    );

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.message).toContain('18');
    expect([...toast.message].length).toBeLessThanOrEqual(38);
  });

  // ARD-09: IT miss message format
  it('ARD-09: IT miss message format includes d20', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({ d20: 4, outcome: 'miss', damage: undefined, status: 'failure' }),
    );

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.message).toContain('4');
    expect(toast.message.toLowerCase()).toMatch(/mancato|miss|daneben/);
    expect([...toast.message].length).toBeLessThanOrEqual(38);
  });

  // ARD-10: EN save-success message
  it('ARD-10: EN save-success includes save marker', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'en', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({ d20: 15, outcome: 'save_success', damage: undefined, status: 'success' }),
    );

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.message).toContain('15');
    // Should include a save success indicator
    expect(toast.message).toMatch(/save|✓/i);
    expect([...toast.message].length).toBeLessThanOrEqual(38);
  });

  // ARD-11: Error message format with localized error kind
  it('ARD-11 IT: error toast = "❌ Nessun bersaglio" for no-targets', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({
        status: 'error',
        outcome: 'no_roll',
        d20: null,
        errorKind: 'no-targets',
        damage: undefined,
      }),
    );

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.message).toContain('❌');
    expect(toast.message).toContain('Nessun bersaglio');
  });

  it('ARD-11 EN: error toast = "❌ No targets" for no-targets', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'en', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({
        status: 'error',
        outcome: 'no_roll',
        d20: null,
        errorKind: 'no-targets',
        damage: undefined,
      }),
    );

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.message).toContain('❌');
    expect(toast.message).toContain('No targets');
  });

  it('ARD-11 DE: error toast = "❌ Keine Ziele" for no-targets', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'de', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({
        status: 'error',
        outcome: 'no_roll',
        d20: null,
        errorKind: 'no-targets',
        damage: undefined,
      }),
    );

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.message).toContain('❌');
    expect(toast.message).toContain('Keine Ziele');
  });

  // ARD-12: Toast id deterministic
  it('ARD-12: toast id is "action-result-<idempotencyKey>" (deterministic)', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(makeValidEnvelope());

    const toast = toastQueueMock.enqueue.mock.calls[0]?.[0] as Toast;
    expect(toast.id).toBe(`action-result-${VALID_UUID}`);
  });

  // ARD-13: JSON.parse throw → console.warn + NO enqueue
  it('ARD-13: JSON.parse throw (malformed data) → console.warn + NO enqueue', async () => {
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    // Send raw invalid JSON
    const event = { data: '{not valid json}}}' } as MessageEvent;
    const handlers = (
      socket as unknown as { handlers: Map<string, Array<(ev: MessageEvent) => void>> }
    ).handlers;
    const msgHandlers = handlers.get('message') ?? [];
    for (const h of msgHandlers) h(event);

    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  // ─── ARD-CONC: Plan 09-03 concentration-required routing ─────────────────

  /**
   * ARD-CONC-01: errorKind === 'concentration-required' → markRetryConfirmed called;
   * toast NOT enqueued (modal mount via conc.conflict envelope is the UX surface).
   */
  it('ARD-CONC-01: concentration-required errorKind → markRetryConfirmed called; NO toast', async () => {
    vi.mocked(markRetryConfirmed).mockClear();
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({
        status: 'failure',
        outcome: 'no_roll',
        d20: null,
        errorKind: 'concentration-required',
        damage: undefined,
      }),
    );

    // markRetryConfirmed must be called with the idempotencyKey
    expect(markRetryConfirmed).toHaveBeenCalledOnce();
    expect(vi.mocked(markRetryConfirmed).mock.calls[0]?.[0]).toBe(VALID_UUID);

    // NO toast enqueued — the conc.conflict envelope triggers the modal instead
    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
  });

  /**
   * ARD-CONC-02: regular errorKind ('gm-rejected') → normal toast enqueue path;
   * markRetryConfirmed NOT called.
   */
  it('ARD-CONC-02: regular errorKind (gm-rejected) → toast enqueued; markRetryConfirmed NOT called', async () => {
    vi.mocked(markRetryConfirmed).mockClear();
    const { attachActionResultHandler } = await import('./action-result-dispatcher.js');
    attachActionResultHandler(socket, toastQueueMock, 'it', CURRENT_USER_ID);

    socket.fireMessage(
      makeValidEnvelope({
        status: 'error',
        outcome: 'no_roll',
        d20: null,
        errorKind: 'gm-rejected',
        damage: undefined,
      }),
    );

    expect(toastQueueMock.enqueue).toHaveBeenCalledOnce();
    expect(markRetryConfirmed).not.toHaveBeenCalled();
  });
});
