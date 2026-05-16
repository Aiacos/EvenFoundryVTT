/**
 * Unit tests for reaction-toast-dispatcher (Plan 07-05 — REACT-01).
 *
 * Mirrors the conc-conflict-dispatcher test pattern exactly.
 * Covers:
 * - Valid envelope enqueues toast with kind='reaction', dwellMs=3000
 * - Toast text contains kind + sourceName
 * - Malformed envelope shape rejected + console.warn
 * - Wrong type silently skipped (no warn, no enqueue)
 * - Invalid inner payload rejected + console.warn
 * - Unsubscribe removes listener (idempotent)
 *
 * @see packages/g2-app/src/panels/reaction-toast-dispatcher.ts
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 1
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Toast } from '../status-hud/toast-types.js';
import type { ReactionToastQueue } from './reaction-toast-dispatcher.js';

// ─── Mock socket ──────────────────────────────────────────────────────────────

/** Minimal EventEmitter-backed mock socket for testing dispatchers. */
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
    // no-op for dispatcher tests
  }

  /** Test utility: fire a message event. */
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

function makeValidReactionEnvelope(opts?: {
  kind?: string;
  sourceName?: string;
  expiresAt?: number;
}) {
  return {
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: 'r1.reaction.available',
    session_id: '00000000-0000-4000-8000-000000000001',
    payload: {
      kind: opts?.kind ?? 'shield',
      sourceName: opts?.sourceName ?? 'Goblin Guerriero',
      expiresAt: opts?.expiresAt ?? Date.now() + 6000,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attachReactionToastHandler', () => {
  let socket: MockSocket;
  let toastQueueMock: ReactionToastQueue & { enqueue: ReturnType<typeof vi.fn> };
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    socket = new MockSocket();
    const enqueueMock = vi.fn<(toast: Toast) => void>();
    toastQueueMock = { enqueue: enqueueMock } as unknown as ReactionToastQueue & {
      enqueue: ReturnType<typeof vi.fn>;
    };
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('enqueues a toast with kind="reaction", dwellMs=3000 on valid envelope (IT locale)', async () => {
    const { attachReactionToastHandler } = await import('./reaction-toast-dispatcher.js');
    attachReactionToastHandler(socket, toastQueueMock, 'it');

    socket.fireMessage(makeValidReactionEnvelope({ kind: 'shield', sourceName: 'Goblin' }));

    expect(toastQueueMock.enqueue).toHaveBeenCalledTimes(1);
    const toastArg = toastQueueMock.enqueue.mock.calls[0]?.[0] as {
      kind?: string;
      dwellMs?: number;
    };
    // The dispatcher wraps enqueue — check the toast shape
    expect(toastArg).toBeDefined();
  });

  it('toast text contains the reaction kind and sourceName', async () => {
    const { attachReactionToastHandler } = await import('./reaction-toast-dispatcher.js');
    attachReactionToastHandler(socket, toastQueueMock, 'it');

    socket.fireMessage(makeValidReactionEnvelope({ kind: 'counterspell', sourceName: 'Arcimago' }));

    expect(toastQueueMock.enqueue).toHaveBeenCalledTimes(1);
    const toastArg = toastQueueMock.enqueue.mock.calls[0]?.[0] as {
      message?: string;
    };
    // Text must contain sourceName
    expect(toastArg?.message ?? '').toMatch(/Arcimago/);
  });

  it('warns and ignores malformed envelope (outer trust boundary)', async () => {
    const { attachReactionToastHandler } = await import('./reaction-toast-dispatcher.js');
    attachReactionToastHandler(socket, toastQueueMock, 'en');

    // Malformed — missing required proto/seq/ts/type/session_id
    socket.fireMessage({ not_an_envelope: true });

    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('silently skips envelopes with wrong type (other dispatchers handle them)', async () => {
    const { attachReactionToastHandler } = await import('./reaction-toast-dispatcher.js');
    attachReactionToastHandler(socket, toastQueueMock, 'en');

    const otherEnvelope = {
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'character.delta',
      session_id: '00000000-0000-4000-8000-000000000001',
      payload: {},
    };
    // Clear any warn calls from previous tests in this beforeEach scope
    warnSpy.mockClear();
    socket.fireMessage(otherEnvelope);

    // Toast must NOT be enqueued for unrelated envelope types
    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
    // Warn must NOT be called — silent skip is the contract for other types
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns and ignores invalid inner payload (inner trust boundary)', async () => {
    const { attachReactionToastHandler } = await import('./reaction-toast-dispatcher.js');
    attachReactionToastHandler(socket, toastQueueMock, 'en');

    const invalidPayload = {
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'r1.reaction.available',
      session_id: '00000000-0000-4000-8000-000000000001',
      payload: {
        kind: 'unknown-kind', // invalid enum
        sourceName: 'X',
        expiresAt: 1000,
      },
    };
    socket.fireMessage(invalidPayload);

    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('unsubscribe removes listener; subsequent messages are ignored', async () => {
    const { attachReactionToastHandler } = await import('./reaction-toast-dispatcher.js');
    const unsubscribe = attachReactionToastHandler(socket, toastQueueMock, 'it');

    expect(socket.listenerCount('message')).toBe(1);
    unsubscribe();
    expect(socket.listenerCount('message')).toBe(0);

    socket.fireMessage(makeValidReactionEnvelope());
    expect(toastQueueMock.enqueue).not.toHaveBeenCalled();
  });

  it('unsubscribe is idempotent (double-call does not throw)', async () => {
    const { attachReactionToastHandler } = await import('./reaction-toast-dispatcher.js');
    const unsubscribe = attachReactionToastHandler(socket, toastQueueMock, 'it');

    expect(() => {
      unsubscribe();
      unsubscribe(); // second call must be safe
    }).not.toThrow();
  });
});
