/**
 * Unit tests for registerAudioStreamRoute — Plan 12-03 Task 1.
 *
 * Test IDs:
 *   - ASR-01: WS upgrade without Authorization header is rejected (close 1008)
 *   - ASR-02: WS upgrade with invalid bearer is rejected (close 1008)
 *   - ASR-03: WS upgrade with valid bearer + deepgramStt disabled → close 1011 'voice-disabled'
 *   - ASR-04: WS upgrade with valid bearer + deepgramStt enabled → deepgramStt.connect called
 *   - ASR-05: Binary frame from client is forwarded via stream.sendAudio
 *   - ASR-06: Deepgram Results frame triggers VoiceTranscriptPayload envelope via deltaEmitter.emitDelta
 *   - ASR-07: Client WS close triggers stream.close()
 *   - ASR-08: emitDelta payload parses via VoiceTranscriptPayloadSchema (defence-in-depth)
 *   - ASR-09: WS upgrade authenticated via ?token= query param (no Authorization header) → connect called
 *
 * @see ./audio-stream-route.ts
 * @see .planning/phases/12-v2-voice-ux-tuning/12-03-PLAN.md Task 1
 */

import { R1_VOICE_TRANSCRIPT_TYPE, VoiceTranscriptPayloadSchema } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { registerAudioStreamRoute } from './audio-stream-route.js';
import type { DeepgramAdapter, DeepgramResultsFrame, DeepgramStream } from './deepgram-stt.js';

// ─── Minimal mock helpers ─────────────────────────────────────────────────────

interface TestDeepgramStream {
  _transcriptCbs: ((f: DeepgramResultsFrame) => void)[];
  _closed: boolean;
  sendAudio: ReturnType<typeof vi.fn>;
  onTranscript(cb: (f: DeepgramResultsFrame) => void): void;
  close(): void;
  fireResults(frame: DeepgramResultsFrame): void;
}

interface TestDeepgramAdapter {
  lastStream: TestDeepgramStream;
  isEnabled: () => boolean;
  connect: (sessionId: string) => DeepgramStream;
  /** Spy handle for assertions — same function as connect, but typed for vitest .toHaveBeenCalledTimes */
  connectSpy: ReturnType<typeof vi.fn>;
  /** Phase 15 Plan 03 — VOICE-09 invalidation API; no-op stub for audio-stream-route tests. */
  refreshKeyterm: () => void;
}

function buildEnabledDeepgramAdapter(): TestDeepgramAdapter {
  let capturedCb: ((f: DeepgramResultsFrame) => void) | null = null;
  const sendAudio = vi.fn();
  const lastStream: TestDeepgramStream = {
    sendAudio,
    _transcriptCbs: [],
    _closed: false,
    onTranscript(cb: (f: DeepgramResultsFrame) => void) {
      capturedCb = cb;
      this._transcriptCbs.push(cb);
    },
    close() {
      this._closed = true;
    },
    fireResults(frame: DeepgramResultsFrame) {
      capturedCb?.(frame);
    },
  };

  const connectSpy = vi.fn().mockReturnValue(lastStream);

  return {
    isEnabled: () => true,
    connect: connectSpy as (sessionId: string) => DeepgramStream,
    connectSpy,
    lastStream,
    refreshKeyterm: vi.fn(),
  };
}

function buildDisabledDeepgramAdapter(): DeepgramAdapter {
  return {
    isEnabled: () => false,
    connect: vi.fn(),
    refreshKeyterm: vi.fn(),
  };
}

/** Minimal mock Fastify app that captures route handlers */
function buildMockApp() {
  let wsHandler:
    | ((socket: MockWsSocket, req: { headers: Record<string, string>; url?: string }) => void)
    | null = null;

  return {
    get(
      path: string,
      _opts: unknown,
      handler: (
        socket: MockWsSocket,
        req: { headers: Record<string, string>; url?: string },
      ) => void,
    ) {
      if (path === '/v1/audio/stream') {
        wsHandler = handler;
      }
    },
    _invokeWsHandler(socket: MockWsSocket, req: { headers: Record<string, string>; url?: string }) {
      wsHandler?.(socket, req);
    },
  };
}

/** Minimal mock WebSocket (server-side) */
interface MockWsSocket {
  close: ReturnType<typeof vi.fn>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  _handlers: Record<string, ((...args: unknown[]) => void)[]>;
  fireMessage(data: Buffer): void;
  fireClose(): void;
}

function buildMockWsSocket(): MockWsSocket {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    close: vi.fn(),
    _handlers: handlers,
    on(event, handler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    fireMessage(data) {
      for (const h of handlers['message'] ?? []) h(data);
    },
    fireClose() {
      for (const h of handlers['close'] ?? []) h();
    },
  };
}

function buildMockDeltaEmitter() {
  return {
    emitDelta: vi.fn(),
  };
}

function buildMockTokenCache(valid: boolean) {
  return {
    validate: vi.fn().mockResolvedValue({ valid }),
  };
}

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
} as unknown as Parameters<typeof registerAudioStreamRoute>[0]['logger'];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerAudioStreamRoute — bearer gate (ASR-01..ASR-03)', () => {
  it('ASR-01: WS upgrade without Authorization header → close 1008', async () => {
    const app = buildMockApp();
    const delta = buildMockDeltaEmitter();
    const deepgramStt = buildEnabledDeepgramAdapter();
    const tokenCache = buildMockTokenCache(false);
    await registerAudioStreamRoute({
      app: app as unknown as Parameters<typeof registerAudioStreamRoute>[0]['app'],
      deltaEmitter: delta as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['deltaEmitter'],
      deepgramStt,
      tokenCache: tokenCache as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['tokenCache'],
      logger: silentLogger,
    });
    const socket = buildMockWsSocket();
    app._invokeWsHandler(socket, { headers: {} });
    await Promise.resolve(); // flush microtasks
    expect(socket.close).toHaveBeenCalledWith(1008, expect.stringContaining('bearer'));
  });

  it('ASR-02: WS upgrade with invalid bearer → close 1008', async () => {
    const app = buildMockApp();
    const delta = buildMockDeltaEmitter();
    const deepgramStt = buildEnabledDeepgramAdapter();
    const tokenCache = buildMockTokenCache(false);
    await registerAudioStreamRoute({
      app: app as unknown as Parameters<typeof registerAudioStreamRoute>[0]['app'],
      deltaEmitter: delta as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['deltaEmitter'],
      deepgramStt,
      tokenCache: tokenCache as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['tokenCache'],
      logger: silentLogger,
    });
    const socket = buildMockWsSocket();
    app._invokeWsHandler(socket, { headers: { authorization: 'Bearer invalid-bearer' } });
    await Promise.resolve(); // flush validate microtask
    expect(socket.close).toHaveBeenCalledWith(1008, expect.stringContaining('bearer'));
  });

  it("ASR-03: valid bearer + deepgramStt disabled → close 1011 'voice-disabled'", async () => {
    const app = buildMockApp();
    const delta = buildMockDeltaEmitter();
    const deepgramStt = buildDisabledDeepgramAdapter();
    const tokenCache = buildMockTokenCache(true);
    await registerAudioStreamRoute({
      app: app as unknown as Parameters<typeof registerAudioStreamRoute>[0]['app'],
      deltaEmitter: delta as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['deltaEmitter'],
      deepgramStt,
      tokenCache: tokenCache as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['tokenCache'],
      logger: silentLogger,
    });
    const socket = buildMockWsSocket();
    app._invokeWsHandler(socket, { headers: { authorization: 'Bearer valid-bearer' } });
    await Promise.resolve();
    expect(socket.close).toHaveBeenCalledWith(1011, 'voice-disabled');
  });
});

describe('registerAudioStreamRoute — enabled path (ASR-04..ASR-08)', () => {
  it('ASR-04: valid bearer + deepgramStt enabled → deepgramStt.connect called', async () => {
    const app = buildMockApp();
    const delta = buildMockDeltaEmitter();
    const deepgramStt = buildEnabledDeepgramAdapter();
    const tokenCache = buildMockTokenCache(true);
    await registerAudioStreamRoute({
      app: app as unknown as Parameters<typeof registerAudioStreamRoute>[0]['app'],
      deltaEmitter: delta as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['deltaEmitter'],
      deepgramStt,
      tokenCache: tokenCache as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['tokenCache'],
      logger: silentLogger,
    });
    const socket = buildMockWsSocket();
    app._invokeWsHandler(socket, { headers: { authorization: 'Bearer valid-bearer' } });
    await Promise.resolve();
    expect(deepgramStt.connectSpy).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('ASR-05: binary frame from client forwarded via stream.sendAudio', async () => {
    const app = buildMockApp();
    const delta = buildMockDeltaEmitter();
    const deepgramStt = buildEnabledDeepgramAdapter();
    const tokenCache = buildMockTokenCache(true);
    await registerAudioStreamRoute({
      app: app as unknown as Parameters<typeof registerAudioStreamRoute>[0]['app'],
      deltaEmitter: delta as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['deltaEmitter'],
      deepgramStt,
      tokenCache: tokenCache as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['tokenCache'],
      logger: silentLogger,
    });
    const socket = buildMockWsSocket();
    app._invokeWsHandler(socket, { headers: { authorization: 'Bearer valid-bearer' } });
    await Promise.resolve();

    const pcm = Buffer.from([0x01, 0x02, 0x03]);
    socket.fireMessage(pcm);
    expect(deepgramStt.lastStream.sendAudio).toHaveBeenCalledWith(expect.any(Uint8Array));
  });

  it('ASR-06: Deepgram Results frame triggers deltaEmitter.emitDelta with voice transcript envelope', async () => {
    const app = buildMockApp();
    const delta = buildMockDeltaEmitter();
    const deepgramStt = buildEnabledDeepgramAdapter();
    const tokenCache = buildMockTokenCache(true);
    await registerAudioStreamRoute({
      app: app as unknown as Parameters<typeof registerAudioStreamRoute>[0]['app'],
      deltaEmitter: delta as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['deltaEmitter'],
      deepgramStt,
      tokenCache: tokenCache as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['tokenCache'],
      logger: silentLogger,
    });
    const socket = buildMockWsSocket();
    app._invokeWsHandler(socket, { headers: { authorization: 'Bearer valid-bearer' } });
    await Promise.resolve();

    deepgramStt.lastStream.fireResults({
      type: 'Results',
      channel: { alternatives: [{ transcript: 'palla di fuoco', confidence: 0.94 }] },
      is_final: true,
    });

    expect(delta.emitDelta).toHaveBeenCalledTimes(1);
    const [type, payload] = delta.emitDelta.mock.calls[0] as [string, unknown];
    expect(type).toBe(R1_VOICE_TRANSCRIPT_TYPE);
    expect(payload).toBeDefined();
  });

  it('ASR-07: Client WS close triggers stream.close()', async () => {
    const app = buildMockApp();
    const delta = buildMockDeltaEmitter();
    const deepgramStt = buildEnabledDeepgramAdapter();
    const tokenCache = buildMockTokenCache(true);
    await registerAudioStreamRoute({
      app: app as unknown as Parameters<typeof registerAudioStreamRoute>[0]['app'],
      deltaEmitter: delta as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['deltaEmitter'],
      deepgramStt,
      tokenCache: tokenCache as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['tokenCache'],
      logger: silentLogger,
    });
    const socket = buildMockWsSocket();
    app._invokeWsHandler(socket, { headers: { authorization: 'Bearer valid-bearer' } });
    await Promise.resolve();

    socket.fireClose();
    expect(deepgramStt.lastStream._closed).toBe(true);
  });

  it('ASR-08: emitDelta payload parses via VoiceTranscriptPayloadSchema', async () => {
    const app = buildMockApp();
    const delta = buildMockDeltaEmitter();
    const deepgramStt = buildEnabledDeepgramAdapter();
    const tokenCache = buildMockTokenCache(true);
    await registerAudioStreamRoute({
      app: app as unknown as Parameters<typeof registerAudioStreamRoute>[0]['app'],
      deltaEmitter: delta as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['deltaEmitter'],
      deepgramStt,
      tokenCache: tokenCache as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['tokenCache'],
      logger: silentLogger,
    });
    const socket = buildMockWsSocket();
    app._invokeWsHandler(socket, { headers: { authorization: 'Bearer valid-bearer' } });
    await Promise.resolve();

    deepgramStt.lastStream.fireResults({
      type: 'Results',
      channel: { alternatives: [{ transcript: 'fireball', confidence: 0.99 }] },
      is_final: false,
    });

    const [, payload] = delta.emitDelta.mock.calls[0] as [string, unknown];
    const parseResult = VoiceTranscriptPayloadSchema.safeParse(payload);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.transcript).toBe('fireball');
      expect(parseResult.data.language).toBe('multi');
      expect(parseResult.data.isFinal).toBe(false);
    }
  });

  it('ASR-09: WS upgrade authenticated via ?token= query param (no Authorization header) → deepgramStt.connect called', async () => {
    // Regression test: browser/WKWebView WebSocket ignores the `headers` option.
    // Production auth path relies on `?token=` query param appended by audio-capture.ts.
    const app = buildMockApp();
    const delta = buildMockDeltaEmitter();
    const deepgramStt = buildEnabledDeepgramAdapter();
    const tokenCache = buildMockTokenCache(true);
    await registerAudioStreamRoute({
      app: app as unknown as Parameters<typeof registerAudioStreamRoute>[0]['app'],
      deltaEmitter: delta as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['deltaEmitter'],
      deepgramStt,
      tokenCache: tokenCache as unknown as Parameters<
        typeof registerAudioStreamRoute
      >[0]['tokenCache'],
      logger: silentLogger,
    });
    const socket = buildMockWsSocket();
    // No Authorization header — bearer travels only via ?token= query param.
    app._invokeWsHandler(socket, {
      headers: {},
      url: '/v1/audio/stream?token=valid-bearer',
    });
    await Promise.resolve();
    expect(deepgramStt.connectSpy).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();
  });
});
