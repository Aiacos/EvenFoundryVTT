/**
 * Unit tests for canvas-extractor — Foundry PIXI canvas → FramePng dispatch (v0.1.15).
 *
 * Quick Task 260611-e71 updates:
 *   - CE-2/CE-3/CE-5/CE-6/CE-INT-1 now assert FramePngSchema (pngB64) instead of FramePixelsSchema (pixelsB64)
 *   - New tests: leading+trailing throttle, captureIntervalMs live gating,
 *     identical-frame hash skip, changed-frame re-emit, PNG luma roundtrip
 *
 * Retained tests (unchanged behavior):
 *   - CE-1   registerCanvasExtractor registers all 5 hooks
 *   - CE-3   Two hook fires within throttle window → trailing emit after window
 *   - CE-4   canvas.app.renderer undefined → emit NOT called; no throw
 *   - CE-7   Idempotency: a second registerCanvasExtractor is a no-op
 *   - CE-INT-2  unregister clears the interval
 *   - CE-INT-3  canvasPan hook is registered
 *   - CE-INT-4  Idempotent singleton — second register installs no second interval
 *   - CE-NORM-*  Contrast normalization (unchanged algorithm)
 *   - CE-VP-*   Viewport capture, byte-length guard & RT path (unchanged)
 *
 * New tests (260611-e71):
 *   - CE-PNG-1  Hook fire → emit receives FramePngSchema-conforming payload (pngB64)
 *   - CE-PNG-2  PNG luma roundtrip: pngB64 decoded (UPNG.decode→toRGBA8) R=G=B equals source luma
 *   - CE-PNG-3  Identical-frame skip: same luma → emit called ONCE (second skipped)
 *   - CE-PNG-4  Changed frame → emit called again after hash change
 *   - CE-PNG-5  live capture cadence: with getter returning 250, the loop emits exactly every 250 ms
 *   - CE-PNG-6  Continuous pan throttle: firing hook 5× without draining → emit called ≥2 (leading + trailing)
 *   - CE-FPS-1  no scheduler fps cap: 33 ms interval (30 fps) → 10 emits in 330 ms
 *   - CE-FPS-2  live interval change (250→50 ms) applies from the next cycle without re-register
 *   - CE-KF-1   static scene → keyframe forced every 5 s despite identical-frame skip
 *
 * @see .planning/quick/260611-e71-modulo-v0-1-15-frame-png-captureinterval/260611-e71-PLAN.md Task 2
 * @see ./canvas-extractor.ts (system under test)
 */

import { FramePngSchema } from '@evf/shared-protocol';
import * as UPNG from 'upng-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetCanvasExtractor,
  extractCurrentFrame,
  registerCanvasExtractor,
} from './canvas-extractor.js';

type HookHandler = (...args: unknown[]) => void;

/** Hooks stub that records every `on`/`off` call and lets tests fire events. */
function makeHooksMock() {
  const handlers = new Map<string, HookHandler[]>();
  return {
    on: vi.fn((event: string, fn: HookHandler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(fn);
      handlers.set(event, existing);
      return existing.length;
    }),
    off: vi.fn((event: string, fn: HookHandler) => {
      const existing = handlers.get(event) ?? [];
      const idx = existing.indexOf(fn);
      if (idx !== -1) {
        existing.splice(idx, 1);
        handlers.set(event, existing);
      }
    }),
    fire(event: string, ...args: unknown[]): void {
      const fns = handlers.get(event) ?? [];
      for (const fn of fns) {
        fn(...args);
      }
    },
  };
}

interface CanvasMockOpts {
  readonly width: number;
  readonly height: number;
  readonly fill?: number;
  readonly noRenderer?: boolean;
  readonly sceneId?: string;
  readonly bufferScale?: number;
  readonly rawBuffer?: Uint8Array;
}

/** Build a stub for Foundry's `canvas` global with controllable dimensions. */
function makeCanvasMock(opts: CanvasMockOpts) {
  const fill = opts.fill ?? 0x80;
  const k = opts.bufferScale ?? 1;
  const bufW = opts.width * k;
  const bufH = opts.height * k;
  const pixels: Uint8Array = opts.rawBuffer ?? new Uint8Array(bufW * bufH * 4).fill(fill);
  const base = {
    scene: { id: opts.sceneId ?? 'scene1' },
    stage: { __marker: 'stage' },
  };
  if (opts.noRenderer) {
    return base;
  }
  return {
    ...base,
    app: {
      renderer: {
        width: opts.width,
        height: opts.height,
        extract: {
          pixels: vi.fn(() => pixels),
        },
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CE-1: Hook registration
// ─────────────────────────────────────────────────────────────────────────────

describe('registerCanvasExtractor — hook registration (CE-1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-1: registers Hooks.on for canvasReady, drawCanvas, refreshToken, updateScene, canvasPan', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const unregister = registerCanvasExtractor({ emit: vi.fn() });

    const events = hooks.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('canvasReady');
    expect(events).toContain('drawCanvas');
    expect(events).toContain('refreshToken');
    expect(events).toContain('updateScene');
    expect(events).toContain('canvasPan');
    expect(hooks.on).toHaveBeenCalledTimes(5);

    unregister();
    expect(hooks.off).toHaveBeenCalledTimes(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-PNG: frame_png schema conformance + roundtrip
// ─────────────────────────────────────────────────────────────────────────────

describe('registerCanvasExtractor — FramePng emit (CE-PNG-1, CE-PNG-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-PNG-1: hook fire → emit receives FramePngSchema-conforming payload (pngB64)', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const emit = vi.fn();
    registerCanvasExtractor({ emit });

    // Leading edge fires immediately on first hook fire.
    hooks.fire('canvasReady');
    expect(emit).toHaveBeenCalledTimes(1);

    const [payload] = emit.mock.calls[0] as [unknown];
    const result = FramePngSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(576);
      expect(result.data.height).toBe(288);
      expect(result.data.sceneId).toBe('scene1');
      expect(result.data.ts).toBeGreaterThan(0);
      // Must have pngB64, not pixelsB64.
      expect(typeof result.data.pngB64).toBe('string');
      expect(result.data.pngB64.length).toBeGreaterThan(0);
    }
  });

  it('CE-PNG-2: PNG luma roundtrip — pngB64 decoded (UPNG.decode → UPNG.toRGBA8) R=G=B equals Rec.601 luma', () => {
    const W = 50;
    const H = 30;
    // Known pixel values: all R=100, G=150, B=200.
    const srcVal = 0x80;
    const pixels = new Uint8Array(W * H * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = srcVal;
      pixels[i + 1] = srcVal;
      pixels[i + 2] = srcVal;
      pixels[i + 3] = 255;
    }
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: { renderer: { width: W, height: H, extract: { pixels: vi.fn(() => pixels) } } },
    };

    const fp = extractCurrentFrame(fakeCanvas);
    expect(fp).not.toBeNull();
    if (fp === null) return;

    // Decode the PNG back.
    const pngBytes = Buffer.from(fp.pngB64, 'base64');
    const decoded = UPNG.decode(
      pngBytes.buffer.slice(
        pngBytes.byteOffset,
        pngBytes.byteOffset + pngBytes.byteLength,
      ) as ArrayBuffer,
    );
    const rgbaFrames = UPNG.toRGBA8(decoded);
    expect(rgbaFrames.length).toBeGreaterThan(0);
    const rgbaBytes = new Uint8Array(rgbaFrames[0] as ArrayBuffer);

    // Rec.601 luma of (0x80, 0x80, 0x80) = 0x80 = 128.
    // The PNG content region (centered at padX/padY) should have R=G=B = 128.
    // Check a pixel in the center of the content area (not letterbox).
    const padX = Math.floor((576 - W) / 2);
    const padY = Math.floor((288 - H) / 2);
    const centerX = padX + Math.floor(W / 2);
    const centerY = padY + Math.floor(H / 2);
    const idx = (centerY * 576 + centerX) * 4;
    const r = rgbaBytes[idx] ?? 0;
    const g = rgbaBytes[idx + 1] ?? 0;
    const b = rgbaBytes[idx + 2] ?? 0;
    // Rec.601 luma of (128,128,128) = 128, then 16-level quantize:
    // ((128*15 + 127.5) / 255 | 0) * 17 = 8 * 17 = 136.
    expect(r).toBe(136);
    expect(g).toBe(136);
    expect(b).toBe(136);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-PNG: identical-frame skip and changed-frame re-emit
// ─────────────────────────────────────────────────────────────────────────────

describe('registerCanvasExtractor — identical-frame skip (CE-PNG-3, CE-PNG-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-PNG-3: identical consecutive captures (same luma) → emit called ONCE (second skipped)', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    // Static canvas — all pixels the same on every extract.
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144, fill: 0x50 }));

    const emit = vi.fn();
    const INTERVAL_MS = 500;
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => INTERVAL_MS });

    // Advance twice — same content → only the first emit fires.
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INTERVAL_MS);
    // Still 1 — identical frame skipped.
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('CE-PNG-4: changed luma between captures → emit called again', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    // Build a canvas whose pixels we can mutate between captures.
    const W = 50;
    const H = 30;
    const pixelsBuf = new Uint8Array(W * H * 4).fill(0x50);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: W,
          height: H,
          extract: { pixels: vi.fn(() => pixelsBuf) },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    const emit = vi.fn();
    const INTERVAL_MS = 500;
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => INTERVAL_MS });

    // First capture — emitted.
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(1);

    // Mutate pixels — different content.
    pixelsBuf.fill(0xa0);

    // Second capture — changed, must emit again.
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-PNG: live capture cadence (self-rescheduling loop, captureFps setting)
// ─────────────────────────────────────────────────────────────────────────────

describe('registerCanvasExtractor — live capture cadence (CE-PNG-5, CE-FPS-1..2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-PNG-5: getCaptureIntervalMs=250ms → emit only every 250ms', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    // Use different content each time so the hash check doesn't swallow emits.
    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              // Change content slightly each call to defeat hash skip.
              fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    const emit = vi.fn();
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => 250 });

    // After 100ms — first 250ms wait not elapsed → no emit
    vi.advanceTimersByTime(100);
    expect(emit).toHaveBeenCalledTimes(0);

    // After 250ms total — first cycle fires → 1 emit
    vi.advanceTimersByTime(150);
    expect(emit).toHaveBeenCalledTimes(1);

    // After 500ms total — second cycle fires → 2 emits
    vi.advanceTimersByTime(250);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('CE-FPS-1: 33ms interval (30fps) → 10 emits in 330ms — NO scheduler-imposed fps cap', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    const emit = vi.fn();
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => 33 });

    // 330ms = 10 full 33ms cycles. The old TICK_MS=100 gate would have
    // allowed only 3 captures here (10fps hard cap) — the self-rescheduling
    // loop must deliver all 10.
    vi.advanceTimersByTime(330);
    expect(emit).toHaveBeenCalledTimes(10);
  });

  it('CE-FPS-2: live interval change 250ms → 50ms applies from the next cycle without re-register', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    let interval = 250;
    const emit = vi.fn();
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => interval });

    // First cycle at the slow cadence.
    vi.advanceTimersByTime(250);
    expect(emit).toHaveBeenCalledTimes(1);

    // DM changes the captureFps world setting → getter now returns 50ms.
    // The wait already armed with 250ms still completes once (no mid-wait
    // interruption), THEN every subsequent wait uses the new value.
    interval = 50;
    vi.advanceTimersByTime(250);
    expect(emit).toHaveBeenCalledTimes(2);

    // From here on the loop runs at 50ms: 4 more cycles in 200ms.
    vi.advanceTimersByTime(200);
    expect(emit).toHaveBeenCalledTimes(6);
  });

  it('CE-KF-1: static scene → keyframe forced every 5s despite identical-frame skip', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    // Content NEVER changes — every capture produces the same luma hash.
    vi.stubGlobal('canvas', makeCanvasMock({ width: 50, height: 30 }));

    const emit = vi.fn();
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => 250 });

    // First cycle (t=250ms) emits the initial frame; the next 4.75s of cycles
    // are identical-content skips until the 5s keyframe window elapses.
    vi.advanceTimersByTime(250);
    expect(emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4500);
    expect(emit).toHaveBeenCalledTimes(1); // still inside the keyframe window — all skipped

    vi.advanceTimersByTime(1000);
    expect(emit).toHaveBeenCalledTimes(2); // keyframe forced after >=5s idle

    vi.advanceTimersByTime(5250);
    expect(emit).toHaveBeenCalledTimes(3); // and again on the next window
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-PNG: continuous pan throttle (leading+trailing)
// ─────────────────────────────────────────────────────────────────────────────

describe('registerCanvasExtractor — leading+trailing throttle (CE-PNG-6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-PNG-6: firing hook 5× without draining → emit called ≥2 (leading + trailing)', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    const emit = vi.fn();
    // Use a very long interval so only hook fires drive emits here.
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => 100_000 });

    // Fire hook 5× in rapid succession (no timer drain between them).
    hooks.fire('canvasPan');
    hooks.fire('canvasPan');
    hooks.fire('canvasPan');
    hooks.fire('canvasPan');
    hooks.fire('canvasPan');

    // Leading edge: 1 emit on first fire.
    expect(emit).toHaveBeenCalledTimes(1);

    // Drain the throttle timer (THROTTLE_MS=200ms) — trailing emit fires.
    vi.advanceTimersByTime(200);
    expect(emit.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-3: within-window fires coalesce (now uses throttle, not debounce)
// ─────────────────────────────────────────────────────────────────────────────

describe('registerCanvasExtractor — throttle window behavior (CE-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-3: hook fires within throttle window produce leading emit immediately + trailing after window', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    const emit = vi.fn();
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => 100_000 });

    // First fire → leading emit (1 emit).
    hooks.fire('canvasReady');
    expect(emit).toHaveBeenCalledTimes(1);

    // Second fire within 200ms → trailing pending (no new emit yet).
    vi.advanceTimersByTime(100);
    hooks.fire('refreshToken');
    expect(emit).toHaveBeenCalledTimes(1);

    // Timer drains at 200ms → trailing emit fires (total: 2).
    vi.advanceTimersByTime(150);
    expect(emit).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-4: canvas not ready
// ─────────────────────────────────────────────────────────────────────────────

describe('canvas not ready (CE-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-4: canvas.app undefined → emit NOT called and no throw', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 0, height: 0, noRenderer: true }));

    const emit = vi.fn();
    registerCanvasExtractor({ emit });

    expect(() => {
      hooks.fire('canvasReady');
      vi.advanceTimersByTime(500);
    }).not.toThrow();
    expect(emit).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-5, CE-6: extractCurrentFrame output shape + fit-downscale
// ─────────────────────────────────────────────────────────────────────────────

describe('extractCurrentFrame (CE-5, CE-6)', () => {
  beforeEach(() => {
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-5: returns a FramePng with width=576 height=288 after extractCurrentFrame', () => {
    const fakeCanvas = makeCanvasMock({ width: 288, height: 144, fill: 0xab });
    const fp = extractCurrentFrame(fakeCanvas);
    expect(fp).not.toBeNull();
    if (fp === null) return;
    expect(fp.width).toBe(576);
    expect(fp.height).toBe(288);
    const result = FramePngSchema.safeParse(fp);
    expect(result.success).toBe(true);
  });

  it('CE-6: oversized 1920×1080 source is fit-downscaled to exactly 576×288 — WHOLE scene captured', () => {
    const W = 1920;
    const H = 1080;
    const fakeCanvas = makeCanvasMock({ width: W, height: H, fill: 0x10 });
    const src = (
      fakeCanvas as { app: { renderer: { extract: { pixels(): Uint8Array } } } }
    ).app.renderer.extract.pixels();
    const mark = (x0: number, y0: number): void => {
      for (let y = y0; y < y0 + 8; y++) {
        for (let x = x0; x < x0 + 8; x++) {
          const i = (y * W + x) * 4;
          src[i] = 0xff;
          src[i + 1] = 0xff;
          src[i + 2] = 0xff;
        }
      }
    };
    mark(0, 0);
    mark(W - 8, 0);
    mark(0, H - 8);
    mark(W - 8, H - 8);

    const fp = extractCurrentFrame(fakeCanvas);
    expect(fp).not.toBeNull();
    if (fp === null) return;
    expect(fp.width).toBe(576);
    expect(fp.height).toBe(288);
    expect(FramePngSchema.safeParse(fp).success).toBe(true);

    // Verify the PNG decodes to a frame with bright corners (markers preserved).
    const pngBytes = Buffer.from(fp.pngB64, 'base64');
    const decoded = UPNG.decode(
      pngBytes.buffer.slice(
        pngBytes.byteOffset,
        pngBytes.byteOffset + pngBytes.byteLength,
      ) as ArrayBuffer,
    );
    const rgbaFrames = UPNG.toRGBA8(decoded);
    const out = new Uint8Array(rgbaFrames[0] as ArrayBuffer);

    const padX = Math.floor((576 - Math.round(W * (288 / H))) / 2);
    const sample = (x: number, y: number): number => out[(y * 576 + x) * 4] ?? 0;
    expect(sample(padX + 1, 0)).toBeGreaterThan(0x40);
    expect(sample(576 - padX - 2, 0)).toBeGreaterThan(0x40);
    expect(sample(padX + 1, 287)).toBeGreaterThan(0x40);
    expect(sample(576 - padX - 2, 287)).toBeGreaterThan(0x40);
    // Letterbox band is opaque black.
    expect(sample(0, 144)).toBe(0);
  });

  it('returns null when canvas is not ready', () => {
    const fakeCanvas = makeCanvasMock({ width: 0, height: 0, noRenderer: true });
    expect(extractCurrentFrame(fakeCanvas)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-7: Idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('registerCanvasExtractor — idempotency (CE-7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-7: calling register twice does not register hooks twice (idempotent)', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const emit = vi.fn();
    const unregister1 = registerCanvasExtractor({ emit });
    const unregister2 = registerCanvasExtractor({ emit });

    expect(hooks.on).toHaveBeenCalledTimes(5);

    unregister1();
    unregister2();
    expect(hooks.off).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-INT: Continuous interval capture
// ─────────────────────────────────────────────────────────────────────────────

describe('registerCanvasExtractor — continuous interval capture (CE-INT-1..CE-INT-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-INT-1: interval fires emit N times at getCaptureIntervalMs cadence with no hooks fired', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    const emit = vi.fn();
    const INTERVAL_MS = 1000;
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => INTERVAL_MS });

    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(3);

    const [payload] = emit.mock.calls[0] as [unknown];
    const result = FramePngSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(576);
      expect(result.data.height).toBe(288);
    }
  });

  it('CE-INT-2: unregister clears the interval — no additional emits after unregister', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    const emit = vi.fn();
    const INTERVAL_MS = 500;
    const unregister = registerCanvasExtractor({ emit, getCaptureIntervalMs: () => INTERVAL_MS });

    vi.advanceTimersByTime(INTERVAL_MS * 2);
    const emitCountBeforeUnregister = emit.mock.calls.length;
    expect(emitCountBeforeUnregister).toBeGreaterThanOrEqual(2);

    unregister();

    vi.advanceTimersByTime(INTERVAL_MS * 5);
    expect(emit.mock.calls.length).toBe(emitCountBeforeUnregister);
  });

  it('CE-INT-3: canvasPan hook is registered and triggers leading emit', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    const emit = vi.fn();
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => 100_000 });

    const events = hooks.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('canvasPan');

    // canvasPan fires leading emit immediately.
    hooks.fire('canvasPan');
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('CE-INT-4: idempotent singleton — second register installs NO second interval', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    const emit = vi.fn();
    const INTERVAL_MS = 1000;
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => INTERVAL_MS });
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => INTERVAL_MS });

    expect(hooks.on).toHaveBeenCalledTimes(5);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-NORM: Contrast normalization (unchanged algorithm)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a canvas mock whose source pixels represent a dark scene with three
 * distinct luma bands.
 */
function makeDarkSceneCanvas(
  width: number,
  height: number,
  veryDarkVal: number,
  midVal: number,
  brightVal: number,
): ReturnType<typeof makeCanvasMock> {
  const totalPixels = width * height;
  const pixels = new Uint8Array(totalPixels * 4);

  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = midVal;
    pixels[i + 1] = midVal;
    pixels[i + 2] = midVal;
    pixels[i + 3] = 255;
  }

  const darkRowCount = Math.max(1, Math.floor(totalPixels * 0.02) / width);
  for (let y = 0; y < darkRowCount; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = veryDarkVal;
      pixels[i + 1] = veryDarkVal;
      pixels[i + 2] = veryDarkVal;
    }
  }

  const brightRowCount = Math.max(1, Math.floor(totalPixels * 0.18) / width);
  for (let y = height - brightRowCount; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = brightVal;
      pixels[i + 1] = brightVal;
      pixels[i + 2] = brightVal;
    }
  }

  return {
    scene: { id: 'dark-scene' },
    stage: { __marker: 'stage' },
    app: {
      renderer: {
        width,
        height,
        extract: { pixels: vi.fn(() => pixels) },
      },
    },
  };
}

function contentMedianLuma(
  rgbaBytes: Uint8Array,
  frameWidth: number,
  outW: number,
  outH: number,
  padX: number,
  padY: number,
): number {
  const lumas: number[] = [];
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const i = ((padY + dy) * frameWidth + (padX + dx)) * 4;
      const r = rgbaBytes[i] ?? 0;
      lumas.push(r); // R=G=B for greyscale PNG output
    }
  }
  lumas.sort((a, b) => a - b);
  const mid = Math.floor(lumas.length / 2);
  return lumas[mid] ?? 0;
}

describe('extractCurrentFrame — normalize levels-stretch (CE-NORM-1..CE-NORM-5)', () => {
  beforeEach(() => {
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-NORM-1: dark-scene content with normalize:"auto" has significantly higher median luma than normalize:"off"', () => {
    const W = 288;
    const H = 144;
    const fakeCanvas = makeDarkSceneCanvas(W, H, 3, 21, 50);

    const fpOff = extractCurrentFrame(fakeCanvas, { normalize: 'off' });
    const fpAuto = extractCurrentFrame(fakeCanvas, { normalize: 'auto' });

    expect(fpOff).not.toBeNull();
    expect(fpAuto).not.toBeNull();
    if (fpOff === null || fpAuto === null) return;

    // Decode both PNGs to compare median luma.
    const decodeToRgba = (fp: typeof fpOff & object): Uint8Array => {
      if (fp === null) return new Uint8Array(0);
      const pngBytes = Buffer.from(fp.pngB64, 'base64');
      const decoded = UPNG.decode(
        pngBytes.buffer.slice(
          pngBytes.byteOffset,
          pngBytes.byteOffset + pngBytes.byteLength,
        ) as ArrayBuffer,
      );
      const frames = UPNG.toRGBA8(decoded);
      return new Uint8Array(frames[0] as ArrayBuffer);
    };

    const outW = W;
    const outH = H;
    const padX = Math.floor((576 - outW) / 2);
    const padY = Math.floor((288 - outH) / 2);

    const decodedOff = decodeToRgba(fpOff);
    const decodedAuto = decodeToRgba(fpAuto);

    const medianOff = contentMedianLuma(decodedOff, 576, outW, outH, padX, padY);
    const medianAuto = contentMedianLuma(decodedAuto, 576, outW, outH, padX, padY);

    expect(medianAuto).toBeGreaterThan(medianOff * 1.5);
  });

  it('CE-NORM-2: wide-range frame (p98-p2 >= 220) with normalize:"auto" is byte-identical to normalize:"off"', () => {
    const W = 100;
    const H = 100;
    const pixels = new Uint8Array(W * H * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      const v = i < pixels.length / 2 ? 0 : 255;
      pixels[i] = v;
      pixels[i + 1] = v;
      pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
    const fakeCanvas = {
      scene: { id: 'wide' },
      stage: {},
      app: { renderer: { width: W, height: H, extract: { pixels: vi.fn(() => pixels) } } },
    };

    const fpOff = extractCurrentFrame(fakeCanvas, { normalize: 'off' });
    const fpAuto = extractCurrentFrame(fakeCanvas, { normalize: 'auto' });

    expect(fpOff).not.toBeNull();
    expect(fpAuto).not.toBeNull();
    if (fpOff === null || fpAuto === null) return;

    expect(fpAuto.pngB64).toBe(fpOff.pngB64);
  });

  it('CE-NORM-3: degenerate near-flat frame (p98-p2 < 8) with normalize:"auto" is byte-identical to normalize:"off"', () => {
    const W = 100;
    const H = 100;
    const pixels = new Uint8Array(W * H * 4).fill(128);
    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = 255;
    }
    const fakeCanvas = {
      scene: { id: 'flat' },
      stage: {},
      app: { renderer: { width: W, height: H, extract: { pixels: vi.fn(() => pixels) } } },
    };

    const fpOff = extractCurrentFrame(fakeCanvas, { normalize: 'off' });
    const fpAuto = extractCurrentFrame(fakeCanvas, { normalize: 'auto' });

    expect(fpOff).not.toBeNull();
    expect(fpAuto).not.toBeNull();
    if (fpOff === null || fpAuto === null) return;

    expect(fpAuto.pngB64).toBe(fpOff.pngB64);
  });

  it('CE-NORM-4: normalize:"auto" on oversized source — letterbox bands stay pure black (R=G=B=0), alpha stays 255', () => {
    const W = 1920;
    const H = 1080;
    const fakeCanvas = makeDarkSceneCanvas(W, H, 3, 15, 40);

    const fp = extractCurrentFrame(fakeCanvas, { normalize: 'auto' });
    expect(fp).not.toBeNull();
    if (fp === null) return;

    const pngBytes = Buffer.from(fp.pngB64, 'base64');
    const decoded = UPNG.decode(
      pngBytes.buffer.slice(
        pngBytes.byteOffset,
        pngBytes.byteOffset + pngBytes.byteLength,
      ) as ArrayBuffer,
    );
    const rgbaFrames = UPNG.toRGBA8(decoded);
    const out = new Uint8Array(rgbaFrames[0] as ArrayBuffer);

    const scale = Math.min(576 / W, 288 / H, 1);
    const outW = Math.round(W * scale);
    const padX = Math.floor((576 - outW) / 2);

    if (padX > 0) {
      const idx = (144 * 576 + 0) * 4;
      expect(out[idx]).toBe(0); // R
      expect(out[idx + 1]).toBe(0); // G
      expect(out[idx + 2]).toBe(0); // B
      expect(out[idx + 3]).toBe(255); // A
    }

    for (let i = 3; i < out.length; i += 4) {
      expect(out[i]).toBe(255);
    }
  });

  it('CE-NORM-5: getNormalize evaluated per capture — returning "off" then "auto" changes output without re-registering', () => {
    vi.useFakeTimers();
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    const W = 200;
    const H = 100;

    let fillValue = 0x10;
    const darkCanvas = makeDarkSceneCanvas(W, H, 3, 15, 45);
    // Override pixels mock to change per-call so hash skip doesn't prevent second emit
    const mockRenderer = (
      darkCanvas as { app: { renderer: { extract: { pixels: ReturnType<typeof vi.fn> } } } }
    ).app.renderer.extract;
    const originalPixels = mockRenderer.pixels;
    mockRenderer.pixels = vi.fn(() => {
      fillValue = (fillValue + 32) & 0xff; // step >= 17 so the 16-level quantizer sees a content change
      const result = (originalPixels as unknown as () => Uint8Array)();
      (result as Uint8Array)[0] = fillValue;
      return result as Uint8Array;
    });

    vi.stubGlobal('canvas', darkCanvas);

    const emittedPayloads: string[] = [];
    const emit = vi.fn((payload: { pngB64: string }) => {
      emittedPayloads.push(payload.pngB64);
    });

    let callCount = 0;
    const getNormalize = vi.fn((): 'off' | 'auto' => {
      callCount++;
      return callCount === 1 ? 'off' : 'auto';
    });

    const INTERVAL_MS = 500;
    registerCanvasExtractor({ emit, getCaptureIntervalMs: () => INTERVAL_MS, getNormalize });

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(2);

    expect(getNormalize.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(emittedPayloads.length).toBe(2);
    expect(emittedPayloads[0]).not.toBe(emittedPayloads[1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-VP: Viewport capture, byte-length guard & RT path (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

describe('extractCurrentFrame — viewport capture, byte-length guard & RT path (CE-VP-1..CE-VP-8)', () => {
  beforeEach(() => {
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as { PIXI?: unknown }).PIXI;
    _resetCanvasExtractor();
  });

  it('CE-VP-1: extract.pixels() is called with NO target argument (viewport capture regression guard)', () => {
    const fakeCanvas = makeCanvasMock({ width: 400, height: 200, fill: 0x80 });
    extractCurrentFrame(fakeCanvas);
    const pixelsMock = (
      fakeCanvas as {
        app: { renderer: { extract: { pixels: ReturnType<typeof vi.fn> } } };
      }
    ).app.renderer.extract.pixels;
    expect(pixelsMock).toHaveBeenCalledTimes(1);
    const callArgs = pixelsMock.mock.calls[0] as unknown[];
    expect(callArgs.length).toBe(0);
  });

  it('CE-VP-2: k=2 buffer inference — oversized renderer buffer produces a correct frame', () => {
    const W = 576;
    const H = 288;
    const k = 2;
    const bufW = W * k;
    const bufH = H * k;
    const buf = new Uint8Array(bufW * bufH * 4).fill(0x10);
    const markBuf = (x0: number, y0: number): void => {
      for (let y = y0; y < y0 + 8; y++) {
        for (let x = x0; x < x0 + 8; x++) {
          const i = (y * bufW + x) * 4;
          buf[i] = 0xff;
          buf[i + 1] = 0xff;
          buf[i + 2] = 0xff;
          buf[i + 3] = 0xff;
        }
      }
    };
    markBuf(0, 0);
    markBuf(bufW - 8, 0);
    markBuf(0, bufH - 8);
    markBuf(bufW - 8, bufH - 8);
    const fakeCanvas = makeCanvasMock({ width: W, height: H, rawBuffer: buf });
    const fp = extractCurrentFrame(fakeCanvas);
    expect(fp).not.toBeNull();
    if (fp === null) return;
    expect(fp.width).toBe(576);
    expect(fp.height).toBe(288);
    expect(FramePngSchema.safeParse(fp).success).toBe(true);
  });

  it('CE-VP-3: garbage-length buffer (non-integer k) returns null and calls console.warn', () => {
    const W = 100;
    const H = 100;
    const expected = W * H * 4;
    const garbageBuffer = new Uint8Array(expected * 3).fill(0xaa);
    const fakeCanvas = makeCanvasMock({ width: W, height: H, rawBuffer: garbageBuffer });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = extractCurrentFrame(fakeCanvas);
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const argsStr = (warnSpy.mock.calls[0] as unknown[]).map(String).join(' ');
      expect(argsStr).toContain(String(expected));
      expect(argsStr).toContain(String(expected * 3));
    } finally {
      warnSpy.mockRestore();
    }
  });

  function installPIXIStub(screenDims?: { width: number; height: number }) {
    const rtStub = { destroy: vi.fn(), __isRtStub: true as const };
    const RTCreate = vi.fn(() => rtStub);
    vi.stubGlobal('PIXI', { RenderTexture: { create: RTCreate } });
    const rendererExt = {
      render: vi.fn(),
      ...(screenDims !== undefined ? { screen: screenDims } : {}),
    };
    return { rtStub, RTCreate, rendererExt };
  }

  it('CE-VP-4: RT path — renderer.render called with stage+{renderTexture,clear:true}; extract.pixels(rt) called with rt; rt.destroy(true) called', () => {
    const { rtStub, RTCreate, rendererExt } = installPIXIStub();
    const W = 400;
    const H = 200;
    const pixels = new Uint8Array(W * H * 4).fill(0x80);
    const pixelsSpy = vi.fn(() => pixels);
    const rtCanvas = {
      scene: { id: 'rt-scene' },
      stage: { __rtStageMarker: true },
      app: { renderer: { width: W, height: H, extract: { pixels: pixelsSpy }, ...rendererExt } },
    };
    const fp = extractCurrentFrame(rtCanvas);
    expect(fp).not.toBeNull();
    expect(RTCreate).toHaveBeenCalledTimes(1);
    expect(RTCreate).toHaveBeenCalledWith({ width: W, height: H });
    expect(rendererExt.render).toHaveBeenCalledTimes(1);
    const [renderTarget, renderOpts] = rendererExt.render.mock.calls[0] as [
      unknown,
      { renderTexture: unknown; clear: boolean },
    ];
    expect(renderTarget).toBe(rtCanvas.stage);
    expect(renderOpts.renderTexture).toBe(rtStub);
    expect(renderOpts.clear).toBe(true);
    expect(pixelsSpy).toHaveBeenCalledTimes(1);
    const pixelsCallArgs = pixelsSpy.mock.calls[0] as unknown[];
    expect(pixelsCallArgs.length).toBe(1);
    expect(pixelsCallArgs[0]).toBe(rtStub);
    expect(rtStub.destroy).toHaveBeenCalledTimes(1);
    expect(rtStub.destroy).toHaveBeenCalledWith(true);
  });

  it('CE-VP-5: destroy-on-throw — extract.pixels throws on RT path → null returned, console.warn called, rt.destroy(true) still called', () => {
    const { rtStub, rendererExt } = installPIXIStub();
    const pixelsSpy = vi.fn(() => {
      throw new Error('GPU context lost');
    });
    const rtCanvas = {
      scene: { id: 'throw-scene' },
      stage: { __rtStageMarker: true },
      app: {
        renderer: { width: 400, height: 200, extract: { pixels: pixelsSpy }, ...rendererExt },
      },
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(extractCurrentFrame(rtCanvas)).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(rtStub.destroy).toHaveBeenCalledWith(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('CE-VP-6: fallback — without globalThis.PIXI, extract.pixels called with ZERO args', () => {
    delete (globalThis as { PIXI?: unknown }).PIXI;
    const fakeCanvas = makeCanvasMock({ width: 400, height: 200, fill: 0x80 });
    extractCurrentFrame(fakeCanvas);
    const pixelsMock = (
      fakeCanvas as { app: { renderer: { extract: { pixels: ReturnType<typeof vi.fn> } } } }
    ).app.renderer.extract.pixels;
    expect(pixelsMock).toHaveBeenCalledTimes(1);
    expect((pixelsMock.mock.calls[0] as unknown[]).length).toBe(0);
  });

  it('CE-VP-7: screen dims — RT path with renderer.screen present → RenderTexture created with screen dims', () => {
    const screenW = 576;
    const screenH = 288;
    const { rtStub, RTCreate, rendererExt } = installPIXIStub({ width: screenW, height: screenH });
    const pixels = new Uint8Array(screenW * screenH * 4).fill(0x80);
    const pixelsSpy = vi.fn(() => pixels);
    const rtCanvas = {
      scene: { id: 'screen-dims-scene' },
      stage: { __rtStageMarker: true },
      app: {
        renderer: { width: 400, height: 200, extract: { pixels: pixelsSpy }, ...rendererExt },
      },
    };
    const fp = extractCurrentFrame(rtCanvas);
    expect(fp).not.toBeNull();
    expect(RTCreate).toHaveBeenCalledWith({ width: screenW, height: screenH });
    expect(rtStub.destroy).toHaveBeenCalledWith(true);
  });

  it('CE-VP-8: fractional screen dims → RT.create called with integer dims; frame emitted', () => {
    const screenW = 2348.25;
    const screenH = 824.25;
    const floorW = Math.floor(screenW);
    const floorH = Math.floor(screenH);
    const { rtStub, RTCreate, rendererExt } = installPIXIStub({ width: screenW, height: screenH });
    const pixels = new Uint8Array(floorW * floorH * 4).fill(0x80);
    const pixelsSpy = vi.fn(() => pixels);
    const rtCanvas = {
      scene: { id: 'fractional-screen-scene' },
      stage: { __rtStageMarker: true },
      app: {
        renderer: { width: 800, height: 600, extract: { pixels: pixelsSpy }, ...rendererExt },
      },
    };
    const fp = extractCurrentFrame(rtCanvas);
    expect(fp).not.toBeNull();
    expect(RTCreate).toHaveBeenCalledWith({ width: floorW, height: floorH });
    expect(rtStub.destroy).toHaveBeenCalledWith(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE-EN: live stream-source gate (isEnabled)
// ─────────────────────────────────────────────────────────────────────────────

describe('registerCanvasExtractor — isEnabled gate (CE-EN-1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-EN-1: isEnabled=false suppresses captures; flipping to true resumes on the next cycle', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    let fillValue = 0x10;
    const pixelsBuf = new Uint8Array(50 * 30 * 4).fill(fillValue);
    const fakeCanvas = {
      scene: { id: 'scene1' },
      stage: {},
      app: {
        renderer: {
          width: 50,
          height: 30,
          extract: {
            pixels: vi.fn(() => {
              fillValue = (fillValue + 32) & 0xff;
              pixelsBuf.fill(fillValue);
              return pixelsBuf;
            }),
          },
        },
      },
    };
    vi.stubGlobal('canvas', fakeCanvas);

    let enabled = false;
    const emit = vi.fn();
    registerCanvasExtractor({ emit, isEnabled: () => enabled, getCaptureIntervalMs: () => 100 });

    // Disabled: neither hook fires nor the capture loop may emit.
    hooks.fire('canvasPan');
    vi.advanceTimersByTime(500);
    expect(emit).toHaveBeenCalledTimes(0);

    // Election flips (e.g. GM leaves, this client becomes leader): next cycle captures.
    enabled = true;
    vi.advanceTimersByTime(200);
    expect(emit.mock.calls.length).toBeGreaterThan(0);
  });
});
