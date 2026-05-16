/**
 * Unit tests for multi-attack-progress-dispatcher (Plan 07-04 — MULTI-01).
 *
 * Covers (per 07-04-PLAN.md §Task 2 <behavior>):
 *   - MAPD-1: attachMultiAttackProgressHandler returns an unsubscribe function
 *   - MAPD-2: unsubscribe removes the message listener
 *   - MAPD-3: valid progress envelope (current < total) → panel.setMultiAttackState called
 *   - MAPD-4: final iteration (current === total) → panel.setMultiAttackState(null) clears state
 *   - MAPD-5: malformed JSON → console.warn + no panel update
 *   - MAPD-6: valid envelope but wrong type → silent skip, no warn, no panel update
 *   - MAPD-7: invalid payload (missing attackId) → console.warn + no panel update
 *   - MAPD-8: unsubscribe is idempotent (double-call is safe)
 *   - MAPD-9: missing panelRef.current is a silent no-op (panel not mounted)
 *
 * @see packages/g2-app/src/panels/multi-attack-progress-dispatcher.ts
 * @see .planning/phases/07-foundry-module-write-path/07-04-PLAN.md Task 2
 */

import { EventEmitter } from 'node:events';
import { R1_MULTIATTACK_PROGRESS_TYPE } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachMultiAttackProgressHandler,
  type MultiAttackDispatcherSocket,
} from './multi-attack-progress-dispatcher.js';

// ─── Mock infrastructure ──────────────────────────────────────────────────────

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_SESSION_UUID = '11111111-1111-4111-8111-111111111111';

type MockDispatcherSocket = MultiAttackDispatcherSocket & {
  emitter: EventEmitter;
  fireMessage: (data: string) => void;
  _messageListenerCount: () => number;
};

function makeMockSocket(): MockDispatcherSocket {
  const emitter = new EventEmitter();
  const handlers = new Map<(ev: MessageEvent) => void, (data: unknown) => void>();

  const sock: MockDispatcherSocket = {
    emitter,
    addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void {
      const wrapped = (data: unknown): void => {
        handler({ data } as MessageEvent);
      };
      handlers.set(handler, wrapped);
      emitter.on(event, wrapped);
    },
    removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void {
      const wrapped = handlers.get(handler);
      if (wrapped !== undefined) {
        emitter.off(event, wrapped);
        handlers.delete(handler);
      }
    },
    fireMessage(data: string): void {
      emitter.emit('message', data);
    },
    _messageListenerCount(): number {
      return emitter.listenerCount('message');
    },
  };
  return sock;
}

function makeMockPanel() {
  return {
    setMultiAttackState: vi.fn(),
  };
}

function buildValidProgressEnvelope(overrides: Partial<{
  type: string;
  current: number;
  total: number;
  attackId: string;
  chatCardId: string | null;
  actorId: string;
  session_id: string;
}> = {}): string {
  return JSON.stringify({
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: overrides.type ?? R1_MULTIATTACK_PROGRESS_TYPE,
    session_id: overrides.session_id ?? VALID_SESSION_UUID,
    payload: {
      attackId: overrides.attackId ?? VALID_UUID,
      current: overrides.current ?? 1,
      total: overrides.total ?? 2,
      chatCardId: overrides.chatCardId !== undefined ? overrides.chatCardId : 'cm-atk-1',
      actorId: overrides.actorId ?? 'actor-aragorn',
    },
  });
}

// ─── MAPD-1 / MAPD-2 — attach/detach ──────────────────────────────────────────

describe('multi-attack-progress-dispatcher — attach/detach', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('MAPD-1: attachMultiAttackProgressHandler returns an unsubscribe function', () => {
    const ws = makeMockSocket();
    const panelRef = { current: makeMockPanel() };
    const unsubscribe = attachMultiAttackProgressHandler(ws, panelRef);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('MAPD-2: unsubscribe removes the message listener from the WS', () => {
    const ws = makeMockSocket();
    const panelRef = { current: makeMockPanel() };
    expect(ws._messageListenerCount()).toBe(0);
    const unsubscribe = attachMultiAttackProgressHandler(ws, panelRef);
    expect(ws._messageListenerCount()).toBe(1);
    unsubscribe();
    expect(ws._messageListenerCount()).toBe(0);
  });
});

// ─── MAPD-3 / MAPD-4 — happy path ────────────────────────────────────────────

describe('multi-attack-progress-dispatcher — happy path', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('MAPD-3: valid progress envelope (current < total) → setMultiAttackState called with state', () => {
    const ws = makeMockSocket();
    const panel = makeMockPanel();
    const panelRef = { current: panel };

    attachMultiAttackProgressHandler(ws, panelRef);

    ws.fireMessage(buildValidProgressEnvelope({ current: 1, total: 2, attackId: VALID_UUID, actorId: 'actor-aragorn' }));

    expect(panel.setMultiAttackState).toHaveBeenCalledTimes(1);
    const arg = panel.setMultiAttackState.mock.calls[0]![0];
    expect(arg).toMatchObject({
      current: 1,
      total: 2,
      attackId: VALID_UUID,
      actorId: 'actor-aragorn',
    });
  });

  it('MAPD-4: final iteration (current === total) → setMultiAttackState(null) clears state', () => {
    const ws = makeMockSocket();
    const panel = makeMockPanel();
    const panelRef = { current: panel };

    attachMultiAttackProgressHandler(ws, panelRef);

    ws.fireMessage(buildValidProgressEnvelope({ current: 2, total: 2 }));

    expect(panel.setMultiAttackState).toHaveBeenCalledTimes(1);
    expect(panel.setMultiAttackState).toHaveBeenCalledWith(null);
  });
});

// ─── MAPD-5 / MAPD-6 / MAPD-7 — trust boundary rejections ────────────────────

describe('multi-attack-progress-dispatcher — trust boundary rejections', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('MAPD-5: malformed JSON → console.warn + no panel update', () => {
    const ws = makeMockSocket();
    const panel = makeMockPanel();
    const panelRef = { current: panel };

    attachMultiAttackProgressHandler(ws, panelRef);
    ws.fireMessage('not json at all');

    expect(panel.setMultiAttackState).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('MAPD-6: envelope.type !== r1.multiattack.progress → silent return, no warn, no update', () => {
    const ws = makeMockSocket();
    const panel = makeMockPanel();
    const panelRef = { current: panel };

    attachMultiAttackProgressHandler(ws, panelRef);
    ws.fireMessage(buildValidProgressEnvelope({ type: 'character.delta' }));

    expect(panel.setMultiAttackState).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('MAPD-7: invalid payload (missing attackId) → console.warn + no panel update', () => {
    const ws = makeMockSocket();
    const panel = makeMockPanel();
    const panelRef = { current: panel };

    attachMultiAttackProgressHandler(ws, panelRef);
    ws.fireMessage(
      JSON.stringify({
        proto: 'evf-v1',
        seq: 1,
        ts: Date.now(),
        type: R1_MULTIATTACK_PROGRESS_TYPE,
        session_id: VALID_SESSION_UUID,
        payload: {
          // missing attackId
          current: 1,
          total: 2,
          chatCardId: null,
          actorId: 'actor-1',
        },
      }),
    );

    expect(panel.setMultiAttackState).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    const warnArg = warnSpy.mock.calls[0]![0];
    expect(String(warnArg)).toContain('payload rejected');
  });
});

// ─── MAPD-8 / MAPD-9 — edge cases ────────────────────────────────────────────

describe('multi-attack-progress-dispatcher — edge cases', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('MAPD-8: unsubscribe is idempotent (double-call is safe)', () => {
    const ws = makeMockSocket();
    const panelRef = { current: makeMockPanel() };
    const unsubscribe = attachMultiAttackProgressHandler(ws, panelRef);
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
    expect(ws._messageListenerCount()).toBe(0);
  });

  it('MAPD-9: panelRef.current is null → silent no-op (panel not mounted)', () => {
    const ws = makeMockSocket();
    const panelRef: { current: ReturnType<typeof makeMockPanel> | null } = { current: null };

    attachMultiAttackProgressHandler(ws, panelRef);

    // Should not throw
    expect(() => {
      ws.fireMessage(buildValidProgressEnvelope({ current: 1, total: 2 }));
    }).not.toThrow();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
