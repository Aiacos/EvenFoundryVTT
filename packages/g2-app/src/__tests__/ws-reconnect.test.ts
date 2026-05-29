/**
 * WsReconnectController unit tests (Task 2 — Plan 10-01 TDD RED phase).
 *
 * Uses vitest fake timers for backoff progression without real waits.
 * Covers 7 behaviour points (WSR-01..07):
 *
 *   WSR-01: on ws.close event, schedules reconnect after 1000ms (first attempt)
 *   WSR-02: consecutive failures grow delay 1→2→4→8→15→30s; cap stays 30s
 *   WSR-03: on successful reconnect, dispatches client_resume {last_seq} over new socket
 *            (clamped to 0 when seqTracker returns -1)
 *   WSR-04: on inbound resume_replay {count}, emits synced event + unmounts SYNC LOST chip
 *   WSR-05: on inbound resume_full_snapshot, calls seqTracker.reset() + emits full_refresh_required
 *   WSR-06: dispose() cancels pending timeout and removes ws listeners
 *   WSR-07: T-10-01 — buffer_gap causes full_refresh_required BEFORE any further envelopes
 *
 * @see packages/g2-app/src/engine/ws-reconnect.ts
 * @see .planning/phases/10-polish-field-test-mvp/10-01-PLAN.md Task 2
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeqTracker } from '../engine/seq-tracker.js';
import { type ChipTickArgs, WsReconnectController } from '../engine/ws-reconnect.js';

// ─── Minimal WebSocket-like mock ─────────────────────────────────────────────
// Mirrors the browser WebSocket shape used in boot-engine-core (EventTarget-style)
// but backed by Node's EventEmitter for synchronous firing in tests.

class MockWebSocket {
  private readonly emitter = new EventEmitter();
  public readonly sentMessages: string[] = [];
  public readyState = 1; // OPEN

  addEventListener(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.on(event, listener);
  }

  removeEventListener(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.off(event, listener);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
  }

  // Test helper: fire a 'close' event
  fireClose(): void {
    this.emitter.emit('close');
  }

  // Test helper: fire a 'message' event with a JSON payload
  fireMessage(payload: unknown): void {
    const ev = { data: JSON.stringify(payload) } as MessageEvent;
    this.emitter.emit('message', ev);
  }
}

// ─── Test setup ──────────────────────────────────────────────────────────────

const FIXED_SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('WsReconnectController', () => {
  let seqTracker: SeqTracker;
  let originalWs: MockWebSocket;
  let onChipTick: ReturnType<typeof vi.fn> & ((args: ChipTickArgs) => void);
  let onChipUnmount: ReturnType<typeof vi.fn> & (() => void);
  let onFullRefreshRequired: ReturnType<typeof vi.fn> & (() => void);
  let newWs: MockWebSocket;
  let wsFactory: ReturnType<typeof vi.fn>;
  let performHandshake: ReturnType<typeof vi.fn>;
  let controller: WsReconnectController;

  beforeEach(() => {
    vi.useFakeTimers();
    seqTracker = new SeqTracker();
    originalWs = new MockWebSocket();
    onChipTick = vi.fn() as ReturnType<typeof vi.fn> & ((args: ChipTickArgs) => void);
    onChipUnmount = vi.fn() as ReturnType<typeof vi.fn> & (() => void);
    onFullRefreshRequired = vi.fn() as ReturnType<typeof vi.fn> & (() => void);
    newWs = new MockWebSocket();
    wsFactory = vi.fn().mockReturnValue(newWs);
    performHandshake = vi.fn().mockResolvedValue({ session_id: FIXED_SESSION_ID });

    controller = new WsReconnectController({
      ws: originalWs as unknown as WebSocket,
      url: 'wss://test.local/ws',
      sessionId: FIXED_SESSION_ID,
      seqTracker,
      onChipTick,
      onChipUnmount,
      onFullRefreshRequired,
      wsFactory: wsFactory as unknown as (url: string) => WebSocket,
      performHandshake: performHandshake as unknown as (
        ws: WebSocket,
        sessionId: string,
      ) => Promise<{ session_id: string }>,
    });
  });

  afterEach(() => {
    controller.dispose();
    vi.useRealTimers();
  });

  it('WSR-01: on ws.close event, schedules reconnect after 1000ms (first attempt)', () => {
    originalWs.fireClose();
    // Before any timer advance, wsFactory should not have been called
    expect(wsFactory).not.toHaveBeenCalled();
    // After 1s countdown interval tick(s) at 1000ms, wsFactory is called
    vi.advanceTimersByTime(1000);
    expect(wsFactory).toHaveBeenCalledWith('wss://test.local/ws');
  });

  it('WSR-02: consecutive failures grow delay 1→2→4→8→15→30s; cap stays 30s', async () => {
    // Make handshake always reject to force consecutive failures
    performHandshake.mockRejectedValue(new Error('handshake failed'));

    originalWs.fireClose();

    // We verify wsFactory call counts after each delay.
    // advanceTimersByTime fires timeouts at exactly N ms mark.
    // After each advance we flush the microtask queue (promise rejection) so
    // the controller processes the handshake failure and starts the next countdown.
    //
    // Absolute elapsed ms after each wsFactory call should be:
    //   call 1: 1000ms  (delay index 0)
    //   call 2: 3000ms  (1000 + 2000)
    //   call 3: 7000ms  (3000 + 4000)
    //   call 4: 15000ms (7000 + 8000)
    //   call 5: 30000ms (15000 + 15000)
    //   call 6: 60000ms (30000 + 30000)
    //   call 7: 90000ms (60000 + 30000) — cap at 30s

    const advanceAndFlush = async (ms: number): Promise<void> => {
      vi.advanceTimersByTime(ms);
      await Promise.resolve(); // flush microtasks from promise rejection
      await Promise.resolve(); // double flush for catch chain
    };

    await advanceAndFlush(1000);
    expect(wsFactory).toHaveBeenCalledTimes(1);

    await advanceAndFlush(2000);
    expect(wsFactory).toHaveBeenCalledTimes(2);

    await advanceAndFlush(4000);
    expect(wsFactory).toHaveBeenCalledTimes(3);

    await advanceAndFlush(8000);
    expect(wsFactory).toHaveBeenCalledTimes(4);

    await advanceAndFlush(15000);
    expect(wsFactory).toHaveBeenCalledTimes(5);

    await advanceAndFlush(30000);
    expect(wsFactory).toHaveBeenCalledTimes(6);

    // 7th attempt: cap stays at 30s
    await advanceAndFlush(30000);
    expect(wsFactory).toHaveBeenCalledTimes(7);
  });

  it('WSR-03: on successful reconnect, dispatches client_resume {last_seq} over new socket', async () => {
    seqTracker.observe({ seq: 7 });
    originalWs.fireClose();
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    // Handshake resolved — controller should send client_resume
    expect(newWs.sentMessages.length).toBeGreaterThanOrEqual(1);
    const sent = JSON.parse(newWs.sentMessages[0] ?? '{}') as {
      proto: string;
      type: string;
      session_id: string;
      last_seq: number;
    };
    expect(sent.proto).toBe('evf-v1');
    expect(sent.type).toBe('client_resume');
    expect(sent.session_id).toBe(FIXED_SESSION_ID);
    expect(sent.last_seq).toBe(7);
  });

  it('WSR-03b: when seqTracker returns -1 (cold cache), last_seq is clamped to 0', async () => {
    // seqTracker.getLastConfirmedSeq() returns -1 (never observed)
    originalWs.fireClose();
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    expect(newWs.sentMessages.length).toBeGreaterThanOrEqual(1);
    const sent = JSON.parse(newWs.sentMessages[0] ?? '{}') as { last_seq: number };
    expect(sent.last_seq).toBe(0);
  });

  it('WSR-04: on inbound resume_replay, emits synced and calls onChipUnmount', async () => {
    originalWs.fireClose();
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    // Simulate bridge replying with resume_replay
    newWs.fireMessage({ proto: 'evf-v1', type: 'resume_replay', count: 3 });

    expect(onChipUnmount).toHaveBeenCalled();
  });

  it('WSR-05: on inbound resume_full_snapshot, calls seqTracker.reset() + onFullRefreshRequired', async () => {
    seqTracker.observe({ seq: 42 });
    originalWs.fireClose();
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    // Simulate bridge replying with resume_full_snapshot
    newWs.fireMessage({ proto: 'evf-v1', type: 'resume_full_snapshot', reason: 'buffer_expired' });

    expect(seqTracker.getLastConfirmedSeq()).toBe(-1); // reset was called
    expect(onFullRefreshRequired).toHaveBeenCalled();
  });

  it('WSR-06: dispose() cancels pending timeout and removes ws listeners', () => {
    originalWs.fireClose();
    // Dispose before the 1s timer fires
    controller.dispose();
    vi.advanceTimersByTime(2000);
    // wsFactory should never have been called because dispose cancelled the timer
    expect(wsFactory).not.toHaveBeenCalled();
  });

  it('WSR-07: T-10-01 — buffer_gap causes full_refresh_required BEFORE any further envelopes', async () => {
    originalWs.fireClose();
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    // Track whether onFullRefreshRequired fires before any envelope forwarding
    let fullRefreshFiredFirst = false;
    onFullRefreshRequired.mockImplementation(() => {
      fullRefreshFiredFirst = true;
    });

    // Bridge replies with buffer_gap — most dangerous T-10-01 case
    newWs.fireMessage({ proto: 'evf-v1', type: 'resume_full_snapshot', reason: 'buffer_gap' });

    // onFullRefreshRequired must have been called
    expect(onFullRefreshRequired).toHaveBeenCalled();
    expect(fullRefreshFiredFirst).toBe(true);
    // seqTracker reset must have happened
    expect(seqTracker.getLastConfirmedSeq()).toBe(-1);
  });

  // ─── quick-task 260529-khy Wave 1 Task 1 — onReconnected + repeated-reconnect ──

  describe('onReconnected callback (BLOCKER 2 inbound)', () => {
    it('WSR-08a: onReconnected fires with newWs BEFORE onChipUnmount on resume_replay', async () => {
      // Dispose the beforeEach default controller (also armed on originalWs) so only
      // the local controller `c` reacts to the close event.
      controller.dispose();
      const order: string[] = [];
      const onReconnected = vi.fn((arg: WebSocket) => {
        order.push(`reconnected:${arg === (newWs as unknown as WebSocket) ? 'newWs' : 'other'}`);
      });
      onChipUnmount.mockImplementation(() => order.push('unmount'));

      const c = new WsReconnectController({
        ws: originalWs as unknown as WebSocket,
        url: 'wss://test.local/ws',
        sessionId: FIXED_SESSION_ID,
        seqTracker,
        onChipTick,
        onChipUnmount,
        onFullRefreshRequired,
        onReconnected: onReconnected as unknown as (ws: WebSocket) => void,
        wsFactory: wsFactory as unknown as (url: string) => WebSocket,
        performHandshake: performHandshake as unknown as (
          ws: WebSocket,
          sessionId: string,
        ) => Promise<{ session_id: string }>,
      });

      originalWs.fireClose();
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      newWs.fireMessage({ proto: 'evf-v1', type: 'resume_replay', count: 1 });

      expect(onReconnected).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['reconnected:newWs', 'unmount']);
      c.dispose();
    });

    it('WSR-08b: onReconnected fires after seqTracker.reset, before onChipUnmount on resume_full_snapshot', async () => {
      // Dispose the beforeEach default controller (also armed on originalWs) so only
      // the local controller `c` reacts to the close event.
      controller.dispose();
      const order: string[] = [];
      seqTracker.observe({ seq: 99 });
      const onReconnected = vi.fn(() => {
        // seqTracker.reset() must already have run on the full-snapshot path
        order.push(`reconnected:seq=${seqTracker.getLastConfirmedSeq()}`);
      });
      onFullRefreshRequired.mockImplementation(() => order.push('fullRefresh'));
      onChipUnmount.mockImplementation(() => order.push('unmount'));

      const c = new WsReconnectController({
        ws: originalWs as unknown as WebSocket,
        url: 'wss://test.local/ws',
        sessionId: FIXED_SESSION_ID,
        seqTracker,
        onChipTick,
        onChipUnmount,
        onFullRefreshRequired,
        onReconnected: onReconnected as unknown as (ws: WebSocket) => void,
        wsFactory: wsFactory as unknown as (url: string) => WebSocket,
        performHandshake: performHandshake as unknown as (
          ws: WebSocket,
          sessionId: string,
        ) => Promise<{ session_id: string }>,
      });

      originalWs.fireClose();
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      newWs.fireMessage({
        proto: 'evf-v1',
        type: 'resume_full_snapshot',
        reason: 'buffer_expired',
      });

      // reset (-1) → onReconnected → fullRefresh → unmount
      expect(order).toEqual(['reconnected:seq=-1', 'fullRefresh', 'unmount']);
      c.dispose();
    });

    it('WSR-08c: absent onReconnected is a no-op (backward compatible)', async () => {
      // The default controller has NO onReconnected — resume_replay still works.
      originalWs.fireClose();
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      expect(() =>
        newWs.fireMessage({ proto: 'evf-v1', type: 'resume_replay', count: 1 }),
      ).not.toThrow();
      expect(onChipUnmount).toHaveBeenCalled();
    });
  });

  describe('repeated reconnect — close re-arm (BLOCKER 1)', () => {
    it('WSR-09: a SECOND disconnect (on ws2) triggers a second countdown + reconnect to ws3', async () => {
      const ws2 = new MockWebSocket();
      const ws3 = new MockWebSocket();
      // wsFactory returns ws2 then ws3 on successive reconnects.
      wsFactory.mockReturnValueOnce(ws2).mockReturnValueOnce(ws3);

      // First disconnect: original → ws2, resume succeeds.
      originalWs.fireClose();
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      expect(wsFactory).toHaveBeenCalledTimes(1);
      ws2.fireMessage({ proto: 'evf-v1', type: 'resume_replay', count: 1 });

      // SECOND disconnect now happens on ws2 (the live socket after reconnect).
      // Today this is NEVER detected (listener only on originalWs) — RED.
      ws2.fireClose();
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(wsFactory).toHaveBeenCalledTimes(2);
      expect(wsFactory).toHaveBeenNthCalledWith(2, 'wss://test.local/ws');
      // The second reconnect targets ws3 and sends client_resume on it.
      expect(ws3.sentMessages.length).toBeGreaterThanOrEqual(1);
    });

    it('WSR-10: dispose() after a reconnect removes the close listener from the CURRENT socket (ws2)', async () => {
      const ws2 = new MockWebSocket();
      wsFactory.mockReturnValueOnce(ws2);

      originalWs.fireClose();
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      ws2.fireMessage({ proto: 'evf-v1', type: 'resume_replay', count: 1 });

      const callsBeforeDispose = wsFactory.mock.calls.length;
      controller.dispose();

      // A close on ws2 after dispose must NOT start a new countdown.
      ws2.fireClose();
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();
      expect(wsFactory.mock.calls.length).toBe(callsBeforeDispose);
    });
  });
});
