/**
 * Unit tests for audio-capture module — Plan 12-03 Task 2.
 *
 * Tests use spied EvenAppBridge + mock WebSocket factory to verify:
 * - ISM-12-01: When deepgramStt is disabled (simulated via WS close 1011), isCapturing() returns false
 * - ISM-12-06: startAudioCapture → audioControl(true) called exactly once; stopAudioCapture → audioControl(false) called exactly once
 * - Additional assertions:
 *   - AC-01: startAudioCapture returns AudioCaptureHandle with isCapturing() === false initially
 *   - AC-02: handle.start() sets isCapturing() === true
 *   - AC-03: handle.start() calls bridge.audioControl(true) exactly once
 *   - AC-04: handle.start() subscribes to onEvenHubEvent
 *   - AC-05: after start(), audioEvent.audioPcm forwarded as ws.send(Uint8Array)
 *   - AC-06: handle.stop() calls bridge.audioControl(false) exactly once
 *   - AC-07: handle.stop() unsubscribes from onEvenHubEvent (calls the unsub closure)
 *   - AC-08: handle.stop() closes the WS
 *   - AC-09: isCapturing() returns false after stop()
 *   - AC-10: start() is idempotent — calling twice only calls audioControl(true) once
 *   - AC-11: stop() is idempotent — calling twice only calls audioControl(false) once
 *   - AC-12: WS close(1011, 'voice-disabled') leaves isCapturing() === false (ISM-12-01 via mock)
 *   - AC-13: audio WS uses `Bearer <bearer>` auth header
 *   - AC-14: audio WS URL is derived from bridgeUrl with /v1/audio/stream path
 *
 * @see ./audio-capture.ts
 * @see .planning/phases/12-v2-voice-ux-tuning/12-03-PLAN.md Task 2
 */

import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { startAudioCapture } from './audio-capture.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

interface MockBridge {
  audioControl: ReturnType<typeof vi.fn>;
  onEvenHubEvent: ReturnType<typeof vi.fn>;
  _fireAudioEvent(pcm: Uint8Array): void;
  _unsubscribeSpy: ReturnType<typeof vi.fn>;
}

function buildMockBridge(): MockBridge {
  const unsubscribeSpy = vi.fn();
  let capturedEventCb: ((e: EvenHubEvent) => void) | null = null;

  const bridge: MockBridge = {
    audioControl: vi.fn().mockResolvedValue(true),
    onEvenHubEvent: vi.fn().mockImplementation((cb: (e: EvenHubEvent) => void) => {
      capturedEventCb = cb;
      return unsubscribeSpy;
    }),
    _unsubscribeSpy: unsubscribeSpy,
    _fireAudioEvent(pcm: Uint8Array) {
      capturedEventCb?.({
        audioEvent: { audioPcm: pcm },
      } as unknown as EvenHubEvent);
    },
  };

  return bridge;
}

interface MockWsInstance {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
  _handlers: Record<string, ((...args: unknown[]) => void)[]>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  addEventListener(event: string, handler: (...args: unknown[]) => void): void;
  removeEventListener(event: string, handler: (...args: unknown[]) => void): void;
  fireOpen(): void;
  fireClose(code?: number, reason?: string): void;
  url: string;
  _initOpts: unknown;
}

function buildMockWsInstance(url: string, opts: unknown): MockWsInstance {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const instance: MockWsInstance = {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 0, // CONNECTING
    url,
    _initOpts: opts,
    _handlers: handlers,
    on(event, handler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    addEventListener(event, handler) {
      this.on(event, handler);
    },
    removeEventListener(_event, _handler) {
      // No-op for testing
    },
    fireOpen() {
      this.readyState = 1; // OPEN
      for (const h of handlers['open'] ?? []) h();
    },
    fireClose(code = 1000, reason = '') {
      this.readyState = 3; // CLOSED
      for (const h of handlers['close'] ?? []) h({ code, reason });
    },
  };
  return instance;
}

function buildMockWsFactory() {
  const instances: MockWsInstance[] = [];
  const factory = (url: string, opts?: unknown): MockWsInstance => {
    const inst = buildMockWsInstance(url, opts);
    instances.push(inst);
    return inst;
  };
  return { factory, instances };
}

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
} as unknown as Console;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('startAudioCapture — initial state (AC-01)', () => {
  it('AC-01: returns AudioCaptureHandle with isCapturing() === false before start()', () => {
    const { factory } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    expect(handle.isCapturing()).toBe(false);
  });
});

/**
 * Helper: start audio capture and fire the WS open event.
 *
 * `audioControl(true)` is a mockResolvedValue (one microtask tick). After it
 * resolves, the WS is created and `instances[0]` becomes available. We need to
 * flush that microtask before `fireOpen()` so the test doesn't race.
 *
 * Pattern: `handle.start()` → `await flushMicrotasks()` → `fireOpen()` → `await startPromise`.
 */
async function flushMicrotasks(): Promise<void> {
  // Flush two levels of microtasks (audioControl resolve + WS construction)
  await Promise.resolve();
  await Promise.resolve();
}

describe('startAudioCapture — start() behaviour (AC-02..AC-05, ISM-12-06)', () => {
  it('AC-02: handle.start() sets isCapturing() === true', async () => {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const startPromise = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await startPromise;
    expect(handle.isCapturing()).toBe(true);
  });

  it('AC-03 / ISM-12-06: handle.start() calls bridge.audioControl(true) exactly once', async () => {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const startPromise = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await startPromise;
    expect(bridge.audioControl).toHaveBeenCalledTimes(1);
    expect(bridge.audioControl).toHaveBeenCalledWith(true);
  });

  it('AC-04: handle.start() subscribes to onEvenHubEvent', async () => {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const startPromise = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await startPromise;
    expect(bridge.onEvenHubEvent).toHaveBeenCalledTimes(1);
  });

  it('AC-05: after start(), audioEvent.audioPcm is forwarded as ws.send(Uint8Array)', async () => {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const startPromise = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await startPromise;

    const pcm1 = new Uint8Array([0x01, 0x02]);
    const pcm2 = new Uint8Array([0x03, 0x04]);
    const pcm3 = new Uint8Array([0x05, 0x06]);
    bridge._fireAudioEvent(pcm1);
    bridge._fireAudioEvent(pcm2);
    bridge._fireAudioEvent(pcm3);

    expect(instances[0]?.send).toHaveBeenCalledTimes(3);
    expect(instances[0]?.send).toHaveBeenCalledWith(pcm1);
    expect(instances[0]?.send).toHaveBeenCalledWith(pcm2);
    expect(instances[0]?.send).toHaveBeenCalledWith(pcm3);
  });

  it('AC-13: audio WS uses Bearer <bearer> auth header', async () => {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'my-bearer-token',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const startPromise = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await startPromise;

    const instanceOpts = instances[0]?._initOpts as
      | { headers?: Record<string, string> }
      | undefined;
    const authHeader =
      instanceOpts?.headers?.['Authorization'] ?? instanceOpts?.headers?.['authorization'];
    expect(authHeader).toBe('Bearer my-bearer-token');
  });

  it('AC-14: audio WS URL includes /v1/audio/stream path derived from bridgeUrl', async () => {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'token',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const startPromise = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await startPromise;

    expect(instances[0]?.url).toContain('/v1/audio/stream');
    expect(instances[0]?.url).toMatch(/^ws/);
  });
});

describe('startAudioCapture — stop() behaviour (AC-06..AC-09, ISM-12-06)', () => {
  async function buildStartedHandle() {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const startPromise = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await startPromise;
    return { handle, bridge, ws: instances[0]! };
  }

  it('AC-06 / ISM-12-06: handle.stop() calls bridge.audioControl(false) exactly once', async () => {
    const { handle, bridge } = await buildStartedHandle();
    await handle.stop();
    expect(bridge.audioControl).toHaveBeenCalledWith(false);
    expect(bridge.audioControl).toHaveBeenCalledTimes(2); // true on start, false on stop
  });

  it('AC-07: handle.stop() calls the onEvenHubEvent unsubscribe closure', async () => {
    const { handle, bridge } = await buildStartedHandle();
    await handle.stop();
    expect(bridge._unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('AC-08: handle.stop() closes the WS', async () => {
    const { handle, ws } = await buildStartedHandle();
    await handle.stop();
    expect(ws.close).toHaveBeenCalled();
  });

  it('AC-09: isCapturing() returns false after stop()', async () => {
    const { handle } = await buildStartedHandle();
    await handle.stop();
    expect(handle.isCapturing()).toBe(false);
  });
});

describe('startAudioCapture — idempotency (AC-10..AC-11)', () => {
  it('AC-10: start() is idempotent — calling twice only calls audioControl(true) once', async () => {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const p1 = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await p1;
    await handle.start(); // idempotent — no-op
    expect(bridge.audioControl).toHaveBeenCalledTimes(1);
    expect(bridge.audioControl).toHaveBeenCalledWith(true);
  });

  it('AC-11: stop() is idempotent — calling twice only calls audioControl(false) once', async () => {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const p1 = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await p1;
    await handle.stop();
    await handle.stop(); // idempotent — no-op
    expect(bridge.audioControl).toHaveBeenCalledWith(false);
    // audioControl called exactly twice total: true on start, false once on stop
    expect(bridge.audioControl).toHaveBeenCalledTimes(2);
  });
});

describe('startAudioCapture — WS close 1011 (AC-12 / ISM-12-01)', () => {
  it('AC-12 / ISM-12-01: WS close with code 1011 voice-disabled → isCapturing() === false', async () => {
    const { factory, instances } = buildMockWsFactory();
    const bridge = buildMockBridge();
    const handle = startAudioCapture({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger: silentLogger as unknown as Console,
      _bridgeFactory: () => bridge as unknown as EvenAppBridge,
      _wsFactory: factory as unknown as (url: string, opts?: unknown) => WebSocket,
    });
    const startPromise = handle.start();
    await flushMicrotasks();
    instances[0]?.fireOpen();
    await startPromise;

    // Simulate bridge closing WS with 1011 (Deepgram disabled)
    instances[0]?.fireClose(1011, 'voice-disabled');

    // After unexpected WS close, _defensiveMicOff() sets _capturing = false synchronously
    // then issues audioControl(false) asynchronously. Give it a tick.
    await flushMicrotasks();

    // After unexpected WS close, isCapturing should be false
    // and audioControl(false) should have been issued defensively
    expect(handle.isCapturing()).toBe(false);
    expect(bridge.audioControl).toHaveBeenCalledWith(false);
  });
});
