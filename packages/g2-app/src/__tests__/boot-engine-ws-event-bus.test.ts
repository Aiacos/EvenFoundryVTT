/**
 * Unit tests for the `createWsEventBus` persistent-listener + last-value-replay bus
 * (quick-task 260605-e9t Task 1 — RED phase).
 *
 * Covers the 7 must-have truths from E9T-BUS-01:
 *   (a) REPLAY-BEFORE-SUBSCRIBE — a message arriving BEFORE subscribe() is replayed.
 *   (b) FORWARD-AFTER-SUBSCRIBE — messages arriving AFTER subscribe() are forwarded.
 *   (c) PER-CHANNEL — replay is scoped to the subscribed channel; no cross-channel leak.
 *   (d) LAST-VALUE-ONLY — only the last cached value is replayed on subscribe.
 *   (e) SEQ + PERF HOOKS — seqTracker.observe() + perfProbe.mark() fire on every inbound.
 *   (f) UNSUBSCRIBE-SCOPED — unsubscribe removes only the target fn; global listener lives.
 *   (g) ORDERING — the on-connect timing bug: pre-subscribe message is replayed later.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerfProbe } from '../engine/perf-probe.js';
import { SeqTracker } from '../engine/seq-tracker.js';
import { createWsEventBus } from '../internal/boot-engine-core.js';

// ---------------------------------------------------------------------------
// MockSocket — minimal EventEmitter-backed WebSocket stub
// (copied from boot-engine-reconnect-rewire.test.ts — do NOT import; local helper)
// ---------------------------------------------------------------------------

interface MockSocket extends EventEmitter {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  addEventListener: (event: string, handler: EventListener, opts?: AddEventListenerOptions) => void;
  removeEventListener: (event: string, handler: EventListener) => void;
  fireOpen: () => void;
  fireMessage: (data: string) => void;
}

function makeMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.setMaxListeners(50);
  emitter.readyState = 1; // OPEN
  emitter.send = vi.fn();
  // Map each public listener to a private wrapper so removeEventListener works.
  const wrappers = new WeakMap<EventListener, (data: unknown) => void>();
  emitter.addEventListener = (event, handler, opts): void => {
    const wrapped = (data: unknown): void => {
      (handler as (ev: unknown) => void)({ data, type: event });
    };
    wrappers.set(handler, wrapped);
    if (opts?.once === true) emitter.once(event, wrapped);
    else emitter.on(event, wrapped);
  };
  emitter.removeEventListener = (event, handler): void => {
    const wrapped = wrappers.get(handler);
    if (wrapped) emitter.off(event, wrapped);
  };
  emitter.fireOpen = (): void => {
    emitter.readyState = 1;
    emitter.emit('open');
  };
  emitter.fireMessage = (data: string): void => {
    emitter.emit('message', data);
  };
  return emitter;
}

// ---------------------------------------------------------------------------
// Helper: serialise an envelope to a JSON string
// ---------------------------------------------------------------------------
function msg(type: string, payload: unknown, seq = 1): string {
  return JSON.stringify({ type, payload, seq });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWsEventBus — persistent-listener + last-value-replay bus', () => {
  let ws: MockSocket;

  beforeEach(() => {
    ws = makeMockSocket();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) REPLAY-BEFORE-SUBSCRIBE: message arriving BEFORE subscribe() is replayed synchronously on subscribe', () => {
    const bus = createWsEventBus(ws as unknown as WebSocket);
    // Simulate on-connect push arriving BEFORE any subscribe.
    ws.fireMessage(msg('character.delta', { actorId: 'a1' }, 5));

    const fn = vi.fn();
    bus.subscribe('character.delta', fn);

    // fn must have been called exactly once with the cached last value.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ actorId: 'a1' });
  });

  it('(b) FORWARD-AFTER-SUBSCRIBE: message arriving AFTER subscribe() is forwarded to subscriber', () => {
    const bus = createWsEventBus(ws as unknown as WebSocket);

    const fn = vi.fn();
    bus.subscribe('character.delta', fn);
    // fn should NOT have been called before any message (no cached value).
    expect(fn).toHaveBeenCalledTimes(0);

    ws.fireMessage(msg('character.delta', { actorId: 'b1' }, 2));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ actorId: 'b1' });
  });

  it('(c) PER-CHANNEL: subscribing to character.delta does NOT replay an r1.movement.budget value', () => {
    const bus = createWsEventBus(ws as unknown as WebSocket);
    // Push an r1.movement.budget envelope.
    ws.fireMessage(msg('r1.movement.budget', { budget: 30 }, 3));

    const fn = vi.fn();
    bus.subscribe('character.delta', fn);

    // No cross-channel replay should have occurred.
    expect(fn).not.toHaveBeenCalled();
  });

  it('(d) LAST-VALUE-ONLY: only the last payload per channel is replayed on subscribe', () => {
    const bus = createWsEventBus(ws as unknown as WebSocket);
    ws.fireMessage(msg('character.delta', { n: 1 }, 1));
    ws.fireMessage(msg('character.delta', { n: 2 }, 2));

    const fn = vi.fn();
    bus.subscribe('character.delta', fn);

    // Must be called once with {n:2} only.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ n: 2 });
  });

  it('(e) SEQ + PERF HOOKS: seqTracker.observe() and perfProbe.mark() fire on inbound envelopes', () => {
    const seqTracker = new SeqTracker();
    const perfProbe = new PerfProbe({
      enabled: true,
      sessionId: 's',
      wsSend: vi.fn(),
      seqProvider: () => 0,
    });
    const markSpy = vi.spyOn(perfProbe, 'mark');

    const _bus = createWsEventBus(ws as unknown as WebSocket, seqTracker, perfProbe);
    void _bus; // bus created for side-effect (attaches global listener); subscribe not needed for this test

    // No subscribe needed — hooks fire on inbound regardless.
    const idempotencyKey = 'abcdef0123456789';
    ws.fireMessage(msg('r1.action.result', { idempotencyKey }, 9));

    expect(seqTracker.getLastConfirmedSeq()).toBe(9);
    expect(markSpy).toHaveBeenCalledWith('result_envelope', idempotencyKey);
  });

  it('(f) UNSUBSCRIBE-SCOPED: unsubscribe removes only the target fn; global listener + other subscriber still live', () => {
    const bus = createWsEventBus(ws as unknown as WebSocket);

    const fnA = vi.fn();
    const fnB = vi.fn();
    const unsubA = bus.subscribe('character.delta', fnA);
    bus.subscribe('character.delta', fnB);

    // Unsubscribe fnA only.
    unsubA();

    ws.fireMessage(msg('character.delta', { actorId: 'f1' }, 4));

    // fnB must have received the message.
    expect(fnB).toHaveBeenCalledTimes(1);
    // fnA must NOT have received any new messages after unsubscribe.
    expect(fnA).not.toHaveBeenCalled();
  });

  it('(g) ORDERING (the bug): pre-subscribe message is captured by persistent listener and replayed', () => {
    // This test directly exercises the race that the plan fixes:
    // the WS opens and a character.delta arrives BEFORE StatusHudLayer.subscribe() is called.
    const bus = createWsEventBus(ws as unknown as WebSocket);

    // Simulate the on-connect push (bridge sends character.delta right after handshake
    // response, BEFORE g2-app's StatusHudLayer subscribes at boot step 12).
    ws.fireMessage(msg('character.delta', { actorId: 'g1', hp: 88 }, 1));

    // StatusHudLayer subscribes LATER (at boot step 12 — simulated by this call).
    const fn = vi.fn();
    bus.subscribe('character.delta', fn);

    // The persistent listener captured the pre-subscribe envelope; subscribe() replays it.
    expect(fn).toHaveBeenCalledWith({ actorId: 'g1', hp: 88 });
  });
});
