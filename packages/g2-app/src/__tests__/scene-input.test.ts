/**
 * Unit tests for scene-input — WS message receiver that dispatches valid
 * `frame_pixels` / `frame_png` envelopes to the raster controller or MapCanvasLayer.
 *
 * Covers Plan 4a-06 Task 3 behaviour SI-1..SI-8 and quick-task 260610-d42
 * Task 2 SI-CANVAS-1..SI-CANVAS-2 (canvas-mode MapCanvasLayer routing),
 * and quick-task 260611-e71 Task 3 SI-PNG-1..SI-PNG-3 (frame_png decode path):
 *   - SI-1   attachSceneInputToWs returns an unsubscribe function
 *   - SI-2   Valid envelope → controller.requestFrame called with correctly
 *            sized Uint8ClampedArray + width + height
 *   - SI-3   Non-JSON or missing-session_id envelope → not dispatched + warn
 *   - SI-4   Valid envelope with type ≠ 'frame_pixels'/'frame_png' → not dispatched
 *   - SI-5   Valid envelope with invalid FramePixels payload → not dispatched + warn
 *   - SI-6   pixelsB64 length-mismatch decode failure → not dispatched (caught)
 *   - SI-7   Dispatched Uint8ClampedArray owns its ArrayBuffer
 *            (transferable-prerequisite; final Worker transfer is Plan 03 RC-2)
 *   - SI-8   unsubscribe() removes the ws message listener
 *   - SI-CANVAS-1  canvas-mode: valid frame_pixels routed to MapCanvasLayer.setFrame
 *                  (NOT RasterController.requestFrame)
 *   - SI-CANVAS-2  canvas-mode: padFrame normalization preserved before setFrame
 *   - SI-PNG-1     canvas-mode: frame_png decoded and routed to setFrame
 *   - SI-PNG-2     frame_png luma roundtrip: decoded R=G=B equal source luma exactly
 *   - SI-PNG-3     frame_pixels back-compat: existing test still green after frame_png addition
 *
 * NF-1 closure: scene-input.ts uses the real `EnvelopeSchema` export and
 * reads the carrier via the `payload` field; the test fixtures include the
 * required `session_id` UUID. See 04A-PLAN-CHECK.md §NF-1 for the full list
 * of forbidden drift patterns.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-06-PLAN.md Task 3
 * @see .planning/quick/260610-d42-full-screen-streamed-map-text-container-/260610-d42-PLAN.md Task 2
 * @see .planning/quick/260611-e71-modulo-v0-1-15-frame-png-captureinterval/260611-e71-PLAN.md Task 3
 * @see ../scene-input.ts (system under test)
 */
import { encodeFramePixels } from '@evf/shared-protocol';
import * as UPNG from 'upng-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RasterControllerLike } from '../engine/layer-types.js';
import { attachSceneInputToWs, type MapFrameSink } from '../scene-input.js';

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

  it('SI-2: valid envelope → requestFrame called with canonical-padded Uint8ClampedArray + dims', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    attachSceneInputToWs(ws as unknown as WebSocket, asRasterControllerLike(ctrl));

    // An undersized (288×144) frame is center-padded to the canonical 400×200
    // raster region (ADR-0013 Amendment 1 — raster-worker rejects other dims;
    // debug map-frame-pipeline-dims, 2026-06-10).
    ws.fire(JSON.stringify(makeFrameEnvelope({ width: 288, height: 144 })));

    expect(ctrl.requestFrame).toHaveBeenCalledTimes(1);
    const args = ctrl.requestFrame.mock.calls[0] as [Uint8ClampedArray, number, number];
    expect(args[0]).toBeInstanceOf(Uint8ClampedArray);
    expect(args[0].length).toBe(400 * 200 * 4);
    expect(args[1]).toBe(400);
    expect(args[2]).toBe(200);
    // Letterbox padding is opaque black: alpha forced to 255 on the pad bands.
    expect(args[0][3]).toBe(255);
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

// ── SI-CANVAS: canvas-mode MapCanvasLayer routing (260610-d42 Task 2) ─────────

/**
 * Minimal MapFrameSink mock — satisfies the MapFrameSink interface.
 */
function makeMockMapSink(): MapFrameSink & {
  setFrameCalls: Array<[Uint8ClampedArray, number, number]>;
} {
  const setFrameCalls: Array<[Uint8ClampedArray, number, number]> = [];
  return {
    setFrameCalls,
    setFrame(rgba: Uint8ClampedArray, w: number, h: number): void {
      setFrameCalls.push([rgba, w, h]);
    },
  };
}

describe('attachSceneInputToWs — canvas-mode MapCanvasLayer routing (SI-CANVAS-1, SI-CANVAS-2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SI-CANVAS-1: canvas-mode sink routes frame_pixels to setFrame (NOT requestFrame)', () => {
    const ws = makeMockSocket();
    const ctrl = makeMockController();
    const sink = makeMockMapSink();

    attachSceneInputToWs(ws as unknown as WebSocket, sink);

    ws.fire(JSON.stringify(makeFrameEnvelope({ width: 400, height: 200 })));

    // MapCanvasLayer.setFrame is called; RasterController.requestFrame is NOT.
    expect(sink.setFrameCalls).toHaveLength(1);
    expect(ctrl.requestFrame).not.toHaveBeenCalled();
  });

  it('SI-CANVAS-2: padFrame normalization preserved — setFrame receives canonical 576×288', () => {
    const ws = makeMockSocket();
    const sink = makeMockMapSink();

    attachSceneInputToWs(ws as unknown as WebSocket, sink);

    // Undersized 288×144 frame is padded to the full-screen 576×288 canonical.
    ws.fire(JSON.stringify(makeFrameEnvelope({ width: 288, height: 144 })));

    expect(sink.setFrameCalls).toHaveLength(1);
    const firstCall = sink.setFrameCalls[0];
    if (firstCall === undefined) throw new Error('setFrameCalls[0] is undefined');
    const [rgba, w, h] = firstCall;
    expect(rgba).toBeInstanceOf(Uint8ClampedArray);
    expect(rgba.length).toBe(576 * 288 * 4);
    expect(w).toBe(576);
    expect(h).toBe(288);
  });
});

// ── SI-PNG: frame_png decode path (260611-e71 Task 3) ────────────────────────

/**
 * Build a frame_png envelope from a source luma Uint8Array.
 *
 * Encodes a greyscale luma array as UPNG.encode([rgba.buffer], w, h, 0, undefined, true),
 * base64-encodes the result, and wraps it in a valid EnvelopeSchema envelope.
 *
 * @param luma   Source luma values (1 byte/pixel). Length must equal w*h.
 * @param w      Frame width.
 * @param h      Frame height.
 */
function makeFramePngEnvelope(luma: Uint8Array, w: number, h: number): unknown {
  // Build R=G=B=luma RGBA buffer for UPNG.
  const rgbaForPng = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = luma[i] ?? 0;
    const pi = i * 4;
    rgbaForPng[pi] = v;
    rgbaForPng[pi + 1] = v;
    rgbaForPng[pi + 2] = v;
    rgbaForPng[pi + 3] = 255;
  }
  // Encode via the verified recipe (forbidPlte=true → ctype=2 RGB, exact roundtrip).
  const pngBuf = UPNG.encode([rgbaForPng.buffer], w, h, 0, undefined, true);
  // Base64-encode (Node Buffer available in vitest/Node environment).
  const pngB64 = Buffer.from(pngBuf).toString('base64');

  return {
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: 'frame_png',
    session_id: VALID_UUID,
    payload: { sceneId: 'scene1', width: w, height: h, pngB64, ts: Date.now() },
  };
}

describe('attachSceneInputToWs — frame_png decode path (SI-PNG-1, SI-PNG-2, SI-PNG-3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SI-PNG-1: canvas-mode frame_png envelope decoded and routed to setFrame', () => {
    const ws = makeMockSocket();
    const sink = makeMockMapSink();
    const ctrl = makeMockController();

    attachSceneInputToWs(ws as unknown as WebSocket, sink);

    // Build a small 8×4 frame_png (fits within FramePngSchema 20..576 bounds after padFrame).
    // Use a 20×20 frame (minimum bound) so FramePngSchema width/height are valid.
    const W = 20;
    const H = 20;
    const luma = new Uint8Array(W * H);
    for (let i = 0; i < luma.length; i++) {
      luma[i] = (i * 7) & 0xff; // varied values
    }
    ws.fire(JSON.stringify(makeFramePngEnvelope(luma, W, H)));

    // canvas-mode: setFrame must be called; requestFrame must NOT.
    expect(sink.setFrameCalls).toHaveLength(1);
    expect(ctrl.requestFrame).not.toHaveBeenCalled();
    const firstCall = sink.setFrameCalls[0];
    if (firstCall === undefined) throw new Error('setFrameCalls[0] is undefined');
    const [rgba, w, h] = firstCall;
    expect(rgba).toBeInstanceOf(Uint8ClampedArray);
    // padFrame centers 20×20 inside 576×288.
    expect(rgba.length).toBe(576 * 288 * 4);
    expect(w).toBe(576);
    expect(h).toBe(288);
  });

  it('SI-PNG-2: frame_png luma roundtrip — decoded R=G=B equal source luma exactly in the centered region', () => {
    const ws = makeMockSocket();
    const sink = makeMockMapSink();

    attachSceneInputToWs(ws as unknown as WebSocket, sink);

    const W = 20;
    const H = 20;
    const luma = new Uint8Array(W * H);
    // Distinctive pattern: row*8 + col pattern (all in-range).
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        luma[row * W + col] = (row * 8 + col * 3) & 0xff;
      }
    }
    ws.fire(JSON.stringify(makeFramePngEnvelope(luma, W, H)));

    expect(sink.setFrameCalls).toHaveLength(1);
    const firstCall = sink.setFrameCalls[0];
    if (firstCall === undefined) throw new Error('setFrameCalls[0] is undefined');
    const [rgba] = firstCall;

    // padFrame centers the 20×20 source inside the 576×288 canvas.
    const CANVAS_W = 576;
    const CANVAS_H = 288;
    const padX = Math.floor((CANVAS_W - W) / 2);
    const padY = Math.floor((CANVAS_H - H) / 2);

    // Verify the first pixel of the centered region: R=G=B=luma[0].
    const firstContentPixel = (padY * CANVAS_W + padX) * 4;
    const expectedLuma0 = luma[0] ?? 0;
    expect(rgba[firstContentPixel]).toBe(expectedLuma0); // R
    expect(rgba[firstContentPixel + 1]).toBe(expectedLuma0); // G
    expect(rgba[firstContentPixel + 2]).toBe(expectedLuma0); // B

    // Verify a pixel in the interior: luma[W * (H/2) + (W/2)].
    const midRow = Math.floor(H / 2);
    const midCol = Math.floor(W / 2);
    const midPixel = ((padY + midRow) * CANVAS_W + (padX + midCol)) * 4;
    const expectedMid = luma[midRow * W + midCol] ?? 0;
    expect(rgba[midPixel]).toBe(expectedMid); // R
    expect(rgba[midPixel + 1]).toBe(expectedMid); // G
    expect(rgba[midPixel + 2]).toBe(expectedMid); // B
  });

  it('SI-PNG-3: frame_pixels back-compat — existing frame_pixels branch still routes to setFrame', () => {
    const ws = makeMockSocket();
    const sink = makeMockMapSink();

    attachSceneInputToWs(ws as unknown as WebSocket, sink);

    // Send a frame_pixels envelope (back-compat test — must still work).
    ws.fire(JSON.stringify(makeFrameEnvelope({ width: 288, height: 144 })));

    expect(sink.setFrameCalls).toHaveLength(1);
    const firstCall = sink.setFrameCalls[0];
    if (firstCall === undefined) throw new Error('setFrameCalls[0] is undefined');
    const [, w, h] = firstCall;
    expect(w).toBe(576);
    expect(h).toBe(288);
  });
});
