/**
 * Unit tests for the Deepgram STT adapter — Plan 12-03 Task 1 + Plan 15-02 Task 1.
 *
 * Test IDs:
 *   - DG-01: isEnabled() === false when apiKey is undefined
 *   - DG-02: isEnabled() === false when apiKey is ''
 *   - DG-03: isEnabled() === true when apiKey is a non-empty string
 *   - DG-04: connect() uses the canonical Deepgram URL with all required query params
 *   - DG-05: connect() uses urlOverride instead of the canonical URL when provided
 *   - DG-06: WebSocket is constructed with `Authorization: Token <apiKey>` header (NOT `Bearer`)
 *   - DG-07: onTranscript fires when a valid Results frame arrives
 *   - DG-08: Malformed JSON frames are silently dropped (no crash)
 *   - DG-09: Non-Results frame types are silently dropped
 *   - DG-10: Missing alternatives array is silently dropped
 *   - DG-11: sendAudio forwards a Uint8Array as a binary WS send
 *   - DG-12: close() terminates the underlying WebSocket
 *   - DG-13: connect() on disabled adapter returns a no-op stream (no WS created)
 *
 * Phase 15 Plan 02 — Deepgram Keyterm Prompting wiring:
 *   - DGKT-01: connect() builds a URL containing one keyterm= per keytermProvider entry
 *   - DGKT-02: Each keyterm value is URL-encoded via encodeURIComponent (RFC 3986; spaces %20, `&` and `=` escaped)
 *   - DGKT-03: Keyterm params are appended AFTER the existing canonical query string
 *   - DGKT-04: Empty keytermProvider output → URL has ZERO keyterm= occurrences (Phase 12 baseline byte-for-byte)
 *   - DGKT-05: keytermProvider is called exactly once per connect() invocation (lazy evaluation)
 *   - DGKT-06: Omitted keytermProvider → URL identical to DGKT-04 (default opt-out)
 *
 * @see ./deepgram-stt.ts
 * @see .planning/phases/12-v2-voice-ux-tuning/12-03-PLAN.md Task 1
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-02-PLAN.md Task 1
 */

import { describe, expect, it, vi } from 'vitest';
import { createDeepgramStt, type DeepgramResultsFrame } from './deepgram-stt.js';

// ─── Silent logger stub ───────────────────────────────────────────────────────

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as Parameters<typeof createDeepgramStt>[0]['logger'];

// ─── Mock WebSocket factory ───────────────────────────────────────────────────

interface MockWsInstance {
  url: string;
  options: unknown;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  _messageHandlers: ((data: Buffer) => void)[];
  _closeHandlers: (() => void)[];
  on(event: string, handler: (...args: unknown[]) => void): MockWsInstance;
  emit(event: string, ...args: unknown[]): void;
  readyState: number;
}

function createMockWsFactory(): {
  factory: (url: string, options: unknown) => MockWsInstance;
  instances: MockWsInstance[];
} {
  const instances: MockWsInstance[] = [];
  const factory = (url: string, options: unknown): MockWsInstance => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const instance: MockWsInstance = {
      url,
      options,
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1, // OPEN
      _messageHandlers: [],
      _closeHandlers: [],
      on(event, handler) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
        if (event === 'message') {
          this._messageHandlers.push(handler as (data: Buffer) => void);
        }
        if (event === 'close') {
          this._closeHandlers.push(handler as () => void);
        }
        return this;
      },
      emit(event, ...args) {
        for (const h of handlers[event] ?? []) {
          h(...args);
        }
      },
    };
    instances.push(instance);
    return instance;
  };
  return { factory, instances };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createDeepgramStt — isEnabled (DG-01..DG-03)', () => {
  it('DG-01: isEnabled() === false when apiKey is undefined', () => {
    const adapter = createDeepgramStt({
      apiKey: undefined,
      logger: silentLogger,
    });
    expect(adapter.isEnabled()).toBe(false);
  });

  it("DG-02: isEnabled() === false when apiKey is ''", () => {
    const adapter = createDeepgramStt({
      apiKey: '',
      logger: silentLogger,
    });
    expect(adapter.isEnabled()).toBe(false);
  });

  it("DG-03: isEnabled() === true when apiKey is 'sk-real'", () => {
    const { factory } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    expect(adapter.isEnabled()).toBe(true);
  });
});

describe('createDeepgramStt — URL construction (DG-04..DG-06)', () => {
  it('DG-04: connect() uses canonical Deepgram URL with all required query params', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    adapter.connect('session-1');
    expect(instances).toHaveLength(1);
    const url = instances[0]!.url;
    expect(url).toContain('wss://api.deepgram.com/v1/listen');
    expect(url).toContain('model=nova-3');
    expect(url).toContain('language=multi');
    expect(url).toContain('punctuate=true');
    expect(url).toContain('encoding=linear16');
    expect(url).toContain('sample_rate=16000');
    expect(url).toContain('channels=1');
  });

  it('DG-05: connect() uses urlOverride instead of canonical URL', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      urlOverride: 'ws://localhost:9999/mock-deepgram',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    adapter.connect('session-2');
    expect(instances[0]!.url).toContain('ws://localhost:9999/mock-deepgram');
    expect(instances[0]!.url).not.toContain('api.deepgram.com');
  });

  it("DG-06: WebSocket options include Authorization header with 'Token ' prefix (NOT 'Bearer ')", () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    adapter.connect('session-3');
    const options = instances[0]!.options as { headers?: Record<string, string> };
    const authHeader = options.headers?.['Authorization'] ?? options.headers?.['authorization'];
    expect(authHeader).toBe('Token sk-real');
    expect(authHeader).not.toMatch(/^Bearer/);
  });
});

describe('createDeepgramStt — Results frame handling (DG-07..DG-10)', () => {
  it('DG-07: onTranscript fires exactly once when a valid Results frame arrives', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    const stream = adapter.connect('session-4');
    const cb = vi.fn<(frame: DeepgramResultsFrame) => void>();
    stream.onTranscript(cb);

    const resultsFrame = JSON.stringify({
      type: 'Results',
      channel: { alternatives: [{ transcript: 'palla di fuoco', confidence: 0.94 }] },
      is_final: true,
    });
    instances[0]!.emit('message', Buffer.from(resultsFrame));

    expect(cb).toHaveBeenCalledTimes(1);
    const arg = (cb.mock.calls[0] as [DeepgramResultsFrame])[0];
    expect(arg.type).toBe('Results');
    expect(arg.channel.alternatives[0]!.transcript).toBe('palla di fuoco');
    expect(arg.is_final).toBe(true);
  });

  it('DG-08: Malformed JSON frames are silently dropped — no crash', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    const stream = adapter.connect('session-5');
    const cb = vi.fn();
    stream.onTranscript(cb);

    expect(() => {
      instances[0]!.emit('message', Buffer.from('not valid json'));
    }).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });

  it("DG-09: Non-Results frame types are silently dropped (type='Metadata')", () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    const stream = adapter.connect('session-6');
    const cb = vi.fn();
    stream.onTranscript(cb);

    instances[0]!.emit('message', Buffer.from(JSON.stringify({ type: 'Metadata', duration: 1.5 })));
    expect(cb).not.toHaveBeenCalled();
  });

  it('DG-10: Results frame with missing alternatives is silently dropped', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    const stream = adapter.connect('session-7');
    const cb = vi.fn();
    stream.onTranscript(cb);

    instances[0]!.emit(
      'message',
      Buffer.from(
        JSON.stringify({ type: 'Results', channel: { alternatives: [] }, is_final: true }),
      ),
    );
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('createDeepgramStt — sendAudio + close (DG-11..DG-12)', () => {
  it('DG-11: sendAudio forwards Uint8Array as binary WS send', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    const stream = adapter.connect('session-8');
    const pcm = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    stream.sendAudio(pcm);
    expect(instances[0]!.send).toHaveBeenCalledWith(pcm);
  });

  it('DG-12: close() terminates the underlying WebSocket', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    const stream = adapter.connect('session-9');
    stream.close();
    expect(instances[0]!.close).toHaveBeenCalled();
  });
});

describe('createDeepgramStt — disabled adapter behaviour', () => {
  it('DG-13: connect() on disabled adapter returns a no-op stream (no WS created)', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: undefined,
      logger: silentLogger,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    // Should not throw
    const stream = adapter.connect('session-disabled');
    expect(instances).toHaveLength(0); // no WS created
    const cb = vi.fn();
    stream.onTranscript(cb);
    stream.sendAudio(new Uint8Array([0x00]));
    stream.close();
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── Phase 15 Plan 02 — Keyterm Prompting wiring (DGKT-01..DGKT-06) ───────────
//
// VOICE-06 integration: createDeepgramStt accepts a `keytermProvider: () => string[]`
// callback. The adapter invokes it lazily on every connect() call, URL-encodes each
// entry via encodeURIComponent (RFC 3986), and appends `&keyterm=<encoded>` query
// params to the Deepgram WS URL. Empty/undefined provider → no keyterm params,
// preserving the Phase 12 baseline byte-for-byte (DGKT-04, DGKT-06).

describe('createDeepgramStt — keyterm wiring (DGKT-01..DGKT-06)', () => {
  // The Phase 12 baseline URL — DGKT-04 must match this byte-for-byte when
  // keytermProvider returns []. Kept inline here (not imported) because the
  // baseline URL is the contract under test; any drift in DEEPGRAM_URL should
  // surface as a test failure, not silently pass via shared constant.
  const PHASE_12_BASELINE_URL =
    'wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&punctuate=true&encoding=linear16&sample_rate=16000&channels=1';

  it('DGKT-01: connect() URL contains one keyterm= param per keytermProvider entry', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      keytermProvider: () => ['fireball', 'palla di fuoco', 'counterspell'],
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    adapter.connect('session-kt-1');
    const url = instances[0]!.url;
    const matches = url.match(/keyterm=/g);
    expect(matches?.length).toBe(3);
  });

  it('DGKT-02: Each keyterm value is URL-encoded via encodeURIComponent (RFC 3986)', () => {
    const { factory, instances } = createMockWsFactory();
    // Mix three escapability stress cases:
    //   - 'palla di fuoco' → spaces become %20 (NOT '+')
    //   - 'foo&punctuate=false' → & and = MUST be escaped (T-15-05 mitigation)
    //   - 'è accentata' → accented bytes percent-escaped UTF-8
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      keytermProvider: () => ['palla di fuoco', 'foo&punctuate=false', 'è accentata'],
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    adapter.connect('session-kt-2');
    const url = instances[0]!.url;
    // Spaces become %20 — the strict RFC 3986 form. Form-style `+` is NOT acceptable.
    expect(url).toContain('keyterm=palla%20di%20fuoco');
    expect(url).not.toContain('keyterm=palla+di+fuoco');
    // & and = are escaped: T-15-05 URL-injection mitigation. The malicious payload
    // 'foo&punctuate=false' must NOT split into a parsed `punctuate=false` override.
    expect(url).toContain('keyterm=foo%26punctuate%3Dfalse');
    // The `punctuate=true` canonical param must still be present, NOT overridden.
    expect(url).toContain('punctuate=true');
    expect(url).not.toContain('punctuate=false');
    // Accented characters are percent-escaped as UTF-8 bytes.
    expect(url).toContain('keyterm=%C3%A8%20accentata');
  });

  it('DGKT-03: Keyterm params are appended AFTER the canonical query string', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      keytermProvider: () => ['fireball', 'shield'],
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    adapter.connect('session-kt-3');
    const url = instances[0]!.url;
    // The canonical query string must appear before the first keyterm= occurrence.
    const firstKeyterm = url.indexOf('keyterm=');
    expect(firstKeyterm).toBeGreaterThan(0);
    expect(url.indexOf('model=nova-3')).toBeLessThan(firstKeyterm);
    expect(url.indexOf('language=multi')).toBeLessThan(firstKeyterm);
    expect(url.indexOf('punctuate=true')).toBeLessThan(firstKeyterm);
    expect(url.indexOf('encoding=linear16')).toBeLessThan(firstKeyterm);
    expect(url.indexOf('sample_rate=16000')).toBeLessThan(firstKeyterm);
    expect(url.indexOf('channels=1')).toBeLessThan(firstKeyterm);
    // No keyterm interleaves with the canonical block — channels=1 directly
    // precedes &keyterm= (after the optional ampersand).
    expect(url).toMatch(/channels=1&keyterm=/);
  });

  it('DGKT-04: Empty keytermProvider output → Phase 12 baseline URL byte-for-byte', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      keytermProvider: () => [],
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    adapter.connect('session-kt-4');
    const url = instances[0]!.url;
    expect(url.match(/keyterm=/g)).toBeNull();
    expect(url).toBe(PHASE_12_BASELINE_URL);
  });

  it('DGKT-05: keytermProvider is called exactly once per connect() invocation', () => {
    const { factory } = createMockWsFactory();
    const provider = vi.fn(() => ['fireball']);
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      keytermProvider: provider,
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    expect(provider).not.toHaveBeenCalled();
    adapter.connect('session-kt-5');
    expect(provider).toHaveBeenCalledTimes(1);
    // A second connect() invocation re-invokes the provider — that's the hot-update
    // contract that plan 15-03 relies on (cache may have changed between sessions).
    adapter.connect('session-kt-5-again');
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('DGKT-06: Omitted keytermProvider → URL identical to Phase 12 baseline (default opt-out)', () => {
    const { factory, instances } = createMockWsFactory();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger: silentLogger,
      // keytermProvider deliberately omitted — adapter must behave like Phase 12.
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    adapter.connect('session-kt-6');
    const url = instances[0]!.url;
    expect(url.match(/keyterm=/g)).toBeNull();
    expect(url).toBe(PHASE_12_BASELINE_URL);
  });
});
