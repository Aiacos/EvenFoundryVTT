/**
 * Unit tests for scene-input — WS message receiver that dispatches valid
 * `frame_pixels` envelopes to the raster controller.
 *
 * Covers Plan 4a-06 Task 3 behaviour SI-1..SI-8:
 *   - SI-1   attachSceneInputToWs returns an unsubscribe function
 *   - SI-2   Valid envelope → controller.requestFrame called with correctly
 *            sized Uint8ClampedArray + width + height
 *   - SI-3   Non-JSON or missing-session_id envelope → not dispatched + warn
 *   - SI-4   Valid envelope with type ≠ 'frame_pixels' → not dispatched
 *   - SI-5   Valid envelope with invalid FramePixels payload → not dispatched + warn
 *   - SI-6   pixelsB64 length-mismatch decode failure → not dispatched (caught)
 *   - SI-7   Dispatched Uint8ClampedArray owns its ArrayBuffer
 *            (transferable-prerequisite; final Worker transfer is Plan 03 RC-2)
 *   - SI-8   unsubscribe() removes the ws message listener
 *
 * NF-1 closure: scene-input.ts uses the real `EnvelopeSchema` export and
 * reads the carrier via the `payload` field; the test fixtures include the
 * required `session_id` UUID. See 04A-PLAN-CHECK.md §NF-1 for the full list
 * of forbidden drift patterns.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-06-PLAN.md Task 3
 * @see ../scene-input.ts (system under test)
 */
import { encodeFramePixels } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RasterControllerLike } from '../engine/layer-types.js';
import { attachSceneInputToWs } from '../scene-input.js';

// ─── MockSocket pattern (PATTERNS.md §capability-handshake.test.ts analog) ────

interface MockSocket {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  /** Fire a synthetic `message` event with the given `data` string. */
  fire: (data: string) => void;
}

function makeMockSocket(): MockSocket {
  const listeners: Array<(ev: MessageEvent) => void> = [];
  const addEventListener = vi.fn((event: string, handler: (ev: MessageEvent) => void) => {
    if (event === 'message') {
      listeners.push(handler);
    }
  });
  const removeEventListener = vi.fn((event: string, handler: (ev: MessageEvent) => void) => {
    if (event === 'message') {
      const idx = listeners.indexOf(handler);
      if (idx !== -1) {
        listeners.splice(idx, 1);
      }
    }
  });
  return {
    addEventListener,
    removeEventListener,
    fire: (data: string) => {
      for (const handler of listeners) {
        // MessageEvent constructor is unavailable in node; minimal shape works.
        handler({ data } as MessageEvent);
      }
    },
  };
}

interface MockController {
  readonly requestFrame: ReturnType<typeof vi.fn>;
  readonly setBleVerdict: ReturnType<typeof vi.fn>;
  readonly getBleVerdict: ReturnType<typeof vi.fn>;
  readonly startIdleHeartbeat: ReturnType<typeof vi.fn>;
  readonly stopIdleHeartbeat: ReturnType<typeof vi.fn>;
  readonly terminate: ReturnType<typeof vi.fn>;
}

function makeMockController(): MockController {
  return {
    requestFrame: vi.fn().mockResolvedValue({ frameId: 1, changedTiles: [] }),
    setBleVerdict: vi.fn(),
    getBleVerdict: vi.fn().mockReturnValue(null),
    startIdleHeartbeat: vi.fn(),
    stopIdleHeartbeat: vi.fn(),
    terminate: vi.fn(),
  };
}

/** Cast helper — narrowing for the SUT signature without losing mock-spec access. */
function asRasterControllerLike(c: MockController): RasterControllerLike {
  return c as unknown as RasterControllerLike;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_UUID = '00000000-0000-4000-8000-000000000000';

function makeRgba(width: number, height: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = i & 0xff;
  }
  return buf;
}

function makeFrameEnvelope(
  overrides: { width?: number; height?: number; type?: string; session_id?: string | null } = {},
): unknown {
  const width = overrides.width ?? 288;
  const height = overrides.height ?? 144;
  const pixelsB64 = encodeFramePixels(makeRgba(width, height));
  const type = overrides.type ?? 'frame_pixels';
  const env: Record<string, unknown> = {
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type,
    payload: { sceneId: 'scene1', width, height, pixelsB64, ts: Date.now() },
  };
  if (overrides.session_id !== null) {
    env.session_id = overrides.session_id ?? VALID_UUID;
  }
  return env;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attachSceneInputToWs — return + unsubscribe (SI-1, SI-8)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SI-1: returns a function (the unsubscribe handle)', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    const unsubscribe = attachSceneInputToWs(
      ws as unknown as WebSocket,
      asRasterControllerLike(ctrl),
    );
    expect(typeof unsubscribe).toBe('function');
    expect(ws.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('SI-8: unsubscribe() removes the ws message listener', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    const unsubscribe = attachSceneInputToWs(
      ws as unknown as WebSocket,
      asRasterControllerLike(ctrl),
    );
    unsubscribe();
    expect(ws.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    // After unsubscribe a synthetic message must NOT reach the controller.
    ws.fire(JSON.stringify(makeFrameEnvelope()));
    expect(ctrl.requestFrame).not.toHaveBeenCalled();
  });
});

describe('attachSceneInputToWs — happy path (SI-2, SI-7)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SI-2: valid envelope → requestFrame called with correct Uint8ClampedArray + dims', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    attachSceneInputToWs(ws as unknown as WebSocket, asRasterControllerLike(ctrl));

    ws.fire(JSON.stringify(makeFrameEnvelope({ width: 288, height: 144 })));

    expect(ctrl.requestFrame).toHaveBeenCalledTimes(1);
    const args = ctrl.requestFrame.mock.calls[0] as [Uint8ClampedArray, number, number];
    expect(args[0]).toBeInstanceOf(Uint8ClampedArray);
    expect(args[0].length).toBe(288 * 144 * 4);
    expect(args[1]).toBe(288);
    expect(args[2]).toBe(144);
  });

  it('SI-7: dispatched Uint8ClampedArray owns a fresh ArrayBuffer (transferable-prerequisite)', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    attachSceneInputToWs(ws as unknown as WebSocket, asRasterControllerLike(ctrl));

    ws.fire(JSON.stringify(makeFrameEnvelope({ width: 288, height: 144 })));

    expect(ctrl.requestFrame).toHaveBeenCalledTimes(1);
    const args = ctrl.requestFrame.mock.calls[0] as [Uint8ClampedArray, number, number];
    expect(args[0].byteOffset).toBe(0);
    expect(args[0].byteLength).toBe(args[0].buffer.byteLength);
    // Plan 06 verifies only the prerequisite (own buffer). The actual Worker
    // transfer via postMessage(msg, [buffer]) is RasterController's
    // responsibility (Plan 03 RC-2) — not asserted here.
  });
});

describe('attachSceneInputToWs — defense-in-depth parse (SI-3, SI-4, SI-5, SI-6)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* swallow */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('SI-3 (non-JSON): garbage frame payload → requestFrame not called; warn emitted', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    attachSceneInputToWs(ws as unknown as WebSocket, asRasterControllerLike(ctrl));

    ws.fire('this is not JSON');

    expect(ctrl.requestFrame).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('SI-3 (missing session_id): envelope without session_id → not dispatched; warn emitted', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    attachSceneInputToWs(ws as unknown as WebSocket, asRasterControllerLike(ctrl));

    ws.fire(JSON.stringify(makeFrameEnvelope({ session_id: null })));

    expect(ctrl.requestFrame).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('SI-4: envelope with type ≠ frame_pixels is dropped silently (different consumer)', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    attachSceneInputToWs(ws as unknown as WebSocket, asRasterControllerLike(ctrl));

    ws.fire(JSON.stringify(makeFrameEnvelope({ type: 'character.delta' })));

    expect(ctrl.requestFrame).not.toHaveBeenCalled();
    // Silent drop — no warn for unrelated envelope types.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('SI-5: valid envelope but FramePixels width below 20 (bound violation) → not dispatched; warn emitted', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    attachSceneInputToWs(ws as unknown as WebSocket, asRasterControllerLike(ctrl));

    // Build a payload with width=10 (below the 20 min). Bypass our fixture
    // helper to avoid the encoder's size assumption.
    const env = {
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'frame_pixels',
      session_id: VALID_UUID,
      payload: {
        sceneId: 's',
        width: 10,
        height: 20,
        pixelsB64: encodeFramePixels(makeRgba(20, 20)),
        ts: Date.now(),
      },
    };
    ws.fire(JSON.stringify(env));

    expect(ctrl.requestFrame).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('SI-6: pixelsB64 decoded length ≠ width × height × 4 → caught, not dispatched, warn emitted', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    attachSceneInputToWs(ws as unknown as WebSocket, asRasterControllerLike(ctrl));

    // Schema is satisfied (width / height in bounds, pixelsB64 a string) but
    // the decoded byte count won't match. decodeFramePixels throws → caught.
    const env = {
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'frame_pixels',
      session_id: VALID_UUID,
      payload: {
        sceneId: 's',
        width: 288,
        height: 144,
        pixelsB64: encodeFramePixels(makeRgba(20, 20)), // way too small
        ts: Date.now(),
      },
    };
    ws.fire(JSON.stringify(env));

    expect(ctrl.requestFrame).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
