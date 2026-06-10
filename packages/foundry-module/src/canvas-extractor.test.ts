/**
 * Unit tests for canvas-extractor — Foundry PIXI canvas → FramePixels dispatch.
 *
 * Covers Plan 4a-06 Task 2 behaviour CE-1..CE-7 and quick-task 260610-d42 Task 1
 * CE-INT-1..CE-INT-4 (continuous interval capture + canvasPan hook):
 *   - CE-1   registerCanvasExtractor registers all 5 hooks
 *            (canvasReady, drawCanvas, refreshToken, updateScene, canvasPan)
 *   - CE-2   On hook fire + debounce expiry, emit is called with a payload
 *            satisfying FramePixelsSchema
 *   - CE-3   Two hook fires within debounce window coalesce to a single emit
 *   - CE-4   canvas.app.renderer undefined → emit NOT called; no throw
 *   - CE-5   extractCurrentFrame returns FramePixels with clamped dims
 *   - CE-6   Oversized canvas (1920×1080) is fit-downscaled to exactly 400×200, whole scene captured (ADR-0013 Amendment 1)
 *   - CE-7   Idempotency: a second registerCanvasExtractor is a no-op
 *   - CE-INT-1  Interval fires emit N times (no hooks) at intervalMs cadence
 *   - CE-INT-2  unregister clears the interval — no additional emits after unregister
 *   - CE-INT-3  canvasPan hook is registered and triggers debounced extract (200 ms)
 *   - CE-INT-4  Idempotent singleton — second register installs NO second interval
 *
 * Quick-task 260610-evs Task 1 — CE-NORM-1..CE-NORM-5 (normalize:'auto' levels-stretch):
 *   - CE-NORM-1  Dark-scene content (narrow luma range ≥ 8) with normalize:'auto' →
 *                output content median is significantly higher than normalize:'off'
 *   - CE-NORM-2  Wide-range frame (p98−p2 ≥ 220) with normalize:'auto' → byte-identical
 *                to normalize:'off' (skip, no clipping)
 *   - CE-NORM-3  Degenerate near-flat frame (p98−p2 < 8) with normalize:'auto' →
 *                byte-identical to normalize:'off' (skip, avoid noise blow-up)
 *   - CE-NORM-4  normalize:'auto' on oversized source → letterbox bands stay pure black
 *                (R=G=B=0) and alpha stays 255; normalization applied over content only
 *   - CE-NORM-5  getNormalize evaluated per capture: stub returning 'off' then 'auto' between
 *                two interval captures changes output without re-registering
 *
 * Quick-task 260610-fw7 — CE-VP-1..CE-VP-3 (viewport capture + byte-length guard):
 *   - CE-VP-1  extract.pixels() is called with NO target argument (viewport capture regression guard)
 *   - CE-VP-2  k=2 buffer inference: renderer returns a 2×-sized buffer → frame produced correctly
 *   - CE-VP-3  Garbage-length buffer (non-integer k) → returns null + console.warn called
 *
 * Quick-task 260610-lx5 — CE-VP-4..CE-VP-7 (render-to-texture primary capture path):
 *   - CE-VP-4  RT path: with PIXI.RenderTexture + renderer.render + stage → renderer.render called
 *              with stage and {renderTexture: rt, clear: true}; extract.pixels(rt) called with rt;
 *              rt.destroy(true) called
 *   - CE-VP-5  Destroy-on-throw: RT path where extract.pixels throws → null returned, console.warn
 *              called, rt.destroy(true) STILL called (finally block)
 *   - CE-VP-6  Fallback: without globalThis.PIXI → extract.pixels called with ZERO args (no RT)
 *   - CE-VP-7  Screen dims: RT path with renderer.screen present → RenderTexture created with
 *              width=screen.width, height=screen.height
 *
 * Quick-task 260610-n8h — CE-VP-8 (fractional renderer.screen dims — Forge DPR 1.3333):
 *   - CE-VP-8  Fractional screen dims: renderer.screen = {width:2348.25,height:824.25}
 *              → RT.create called with integer {width:2348,height:824}; frame emitted
 *              (byte-length guard must not mismatch — root cause 2026-06-10 Forge evidence)
 *
 * Foundry globals (Hooks, canvas, game) are stubbed via vi.stubGlobal, matching
 * the established pattern in `module.test.ts` + `readers.test.ts`. No live
 * Foundry runtime required.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-06-PLAN.md Task 2
 * @see .planning/quick/260610-d42-full-screen-streamed-map-text-container-/260610-d42-PLAN.md Task 1
 * @see .planning/quick/260610-evs-contrast-normalization-setting-for-glass/260610-evs-PLAN.md Task 1
 * @see .planning/quick/260610-fw7-fix-canvas-extractor-stage-vs-viewport-s/260610-fw7-PLAN.md Task 2
 * @see .planning/quick/260610-lx5-render-to-texture-viewport-capture-in-ca/260610-lx5-PLAN.md Task 2
 * @see .planning/quick/260610-n8h-floor-fractional-viewport-dims-in-rt-cap/260610-n8h-PLAN.md Task 1
 * @see ./canvas-extractor.ts (system under test)
 */
import { decodeFramePixels, FramePixelsSchema } from '@evf/shared-protocol';
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
  /** A constant fill byte for each pixel (R=G=B=A=fill). */
  readonly fill?: number;
  /** Inject a renderer = undefined to simulate canvas not ready. */
  readonly noRenderer?: boolean;
  /** Foundry scene id (defaults to "scene1"). */
  readonly sceneId?: string;
  /**
   * Buffer scale factor (default 1). When set to k, the mock returns a buffer
   * of (width*k) × (height*k) × 4 bytes — simulates high-DPR / resolution-
   * multiplied renderers that return a larger buffer than renderer.width×height.
   * CE-VP-2 uses bufferScale:2 to test k=2 integer-resolution inference.
   */
  readonly bufferScale?: number;
  /**
   * Override the raw pixel buffer returned by extract.pixels() entirely.
   * Takes precedence over fill and bufferScale. Use for CE-VP-3 garbage-length
   * tests where the length must be an arbitrary non-k² value.
   */
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
    return base; // `app` omitted entirely — exactOptionalPropertyTypes-clean.
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

    // Returned unregister calls Hooks.off the same number of times.
    unregister();
    expect(hooks.off).toHaveBeenCalledTimes(5);
  });
});

describe('registerCanvasExtractor — debounced emit (CE-2, CE-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-2: emits a FramePixelsSchema-conforming payload after debounce expiry', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const emit = vi.fn();
    registerCanvasExtractor({ emit, debounceMs: 200 });

    hooks.fire('canvasReady');
    expect(emit).not.toHaveBeenCalled(); // still inside the debounce window

    vi.advanceTimersByTime(200);
    expect(emit).toHaveBeenCalledTimes(1);

    const [payload] = emit.mock.calls[0] as [unknown];
    const result = FramePixelsSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      // Canonical-region contract (ADR-0013 Amendment 1): frames are ALWAYS
      // exactly 400×200 — crop or letterbox-pad, never variable dims.
      expect(result.data.width).toBe(400);
      expect(result.data.height).toBe(200);
      expect(result.data.sceneId).toBe('scene1');
      expect(result.data.ts).toBeGreaterThan(0);
    }
  });

  it('CE-3: two hook fires within debounce window coalesce to a single emit', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const emit = vi.fn();
    registerCanvasExtractor({ emit, debounceMs: 200 });

    hooks.fire('canvasReady');
    vi.advanceTimersByTime(100);
    hooks.fire('refreshToken'); // resets debounce

    vi.advanceTimersByTime(100); // 100 ms past the second fire; not yet 200
    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150); // total 200 ms past the second fire
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

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

describe('extractCurrentFrame (CE-5, CE-6)', () => {
  beforeEach(() => {
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetCanvasExtractor();
  });

  it('CE-5: returns a FramePixels with width × height × 4 bytes after decode', () => {
    const fakeCanvas = makeCanvasMock({ width: 288, height: 144, fill: 0xab });
    const fp = extractCurrentFrame(fakeCanvas);
    expect(fp).not.toBeNull();
    if (fp === null) {
      return;
    }
    expect(fp.width).toBe(400);
    expect(fp.height).toBe(200);
    const result = FramePixelsSchema.safeParse(fp);
    expect(result.success).toBe(true);
  });

  it('CE-6: oversized 1920×1080 source is fit-downscaled to exactly 400×200 — WHOLE scene captured', () => {
    // Source: dark field with bright 8×8 markers in all four corners. The old
    // center-crop kept only a 400×200 window — corner markers were lost. The
    // fit-downscale must preserve them (whole-scene capture, debug
    // map-frame-pipeline-dims 2026-06-10).
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
    if (fp === null) {
      return;
    }
    // Canonical-region contract: fit-downscale yields EXACTLY 400×200.
    expect(fp.width).toBe(400);
    expect(fp.height).toBe(200);
    expect(FramePixelsSchema.safeParse(fp).success).toBe(true);

    // 1920×1080 fit in 400×200 → scale 200/1080, scaled size ≈ 356×200,
    // letterboxed horizontally (padX ≈ 22). Sample the four scaled corners and
    // assert they are markedly brighter than the 0x10 field — proof the source
    // corners survived into the frame.
    const out = decodeFramePixels(fp.pixelsB64, fp.width, fp.height);
    const padX = Math.floor((400 - Math.round(W * (200 / H))) / 2);
    const sample = (x: number, y: number): number => out[(y * 400 + x) * 4] ?? 0;
    expect(sample(padX + 1, 0)).toBeGreaterThan(0x40); // top-left marker
    expect(sample(400 - padX - 2, 0)).toBeGreaterThan(0x40); // top-right
    expect(sample(padX + 1, 199)).toBeGreaterThan(0x40); // bottom-left
    expect(sample(400 - padX - 2, 199)).toBeGreaterThan(0x40); // bottom-right
    // Letterbox band is opaque black.
    expect(sample(0, 100)).toBe(0);
  });

  it('returns null when canvas is not ready', () => {
    const fakeCanvas = makeCanvasMock({ width: 0, height: 0, noRenderer: true });
    expect(extractCurrentFrame(fakeCanvas)).toBeNull();
  });
});

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

    // Second registration is a no-op: 5 events on the first call, no additional.
    expect(hooks.on).toHaveBeenCalledTimes(5);

    // Both unregister handles still work without double-off cascade.
    unregister1();
    unregister2();
    expect(hooks.off).toHaveBeenCalled();
  });
});

// ── CE-INT: Continuous interval capture (quick-task 260610-d42 Task 1) ──────────

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

  it('CE-INT-1: interval fires emit N times at intervalMs cadence with no hooks fired', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const emit = vi.fn();
    const INTERVAL_MS = 1000;
    registerCanvasExtractor({ emit, intervalMs: INTERVAL_MS });

    // No hooks fired — only the interval drives captures.
    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(3);

    // Each emission is a valid FramePixels payload.
    const [payload] = emit.mock.calls[0] as [unknown];
    const result = FramePixelsSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(400);
      expect(result.data.height).toBe(200);
    }
  });

  it('CE-INT-2: unregister clears the interval — no additional emits after unregister', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const emit = vi.fn();
    const INTERVAL_MS = 500;
    const unregister = registerCanvasExtractor({ emit, intervalMs: INTERVAL_MS });

    vi.advanceTimersByTime(INTERVAL_MS * 2);
    const emitCountBeforeUnregister = emit.mock.calls.length;
    expect(emitCountBeforeUnregister).toBeGreaterThanOrEqual(2);

    unregister();

    // After unregister, advancing timers by 5x interval fires zero additional emits.
    vi.advanceTimersByTime(INTERVAL_MS * 5);
    expect(emit.mock.calls.length).toBe(emitCountBeforeUnregister);
  });

  it('CE-INT-3: canvasPan hook is registered and triggers debounced extract (200 ms)', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const emit = vi.fn();
    // Use a very long interval so only hook fires drive the emit here.
    registerCanvasExtractor({ emit, debounceMs: 200, intervalMs: 100_000 });

    const events = hooks.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('canvasPan');

    // Fire canvasPan — should debounce-extract after 200 ms.
    hooks.fire('canvasPan');
    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(emit).toHaveBeenCalledTimes(1);

    // canvasPan debounces just like the other hooks (two fires coalesce).
    hooks.fire('canvasPan');
    vi.advanceTimersByTime(100);
    hooks.fire('canvasPan');
    vi.advanceTimersByTime(100);
    expect(emit).toHaveBeenCalledTimes(1); // debounce not yet expired
    vi.advanceTimersByTime(100);
    expect(emit).toHaveBeenCalledTimes(2); // 200 ms past second fire
  });

  it('CE-INT-4: idempotent singleton — second register installs NO second interval', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const emit = vi.fn();
    const INTERVAL_MS = 1000;
    registerCanvasExtractor({ emit, intervalMs: INTERVAL_MS });
    registerCanvasExtractor({ emit, intervalMs: INTERVAL_MS });

    // First register is active; second is no-op (5 hooks only, no duplicate interval).
    expect(hooks.on).toHaveBeenCalledTimes(5);

    // Advance by interval: emit fires exactly once (single interval, not doubled).
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

// ── CE-NORM: Contrast normalization (quick-task 260610-evs Task 1) ────────────

/**
 * Build a canvas mock whose source pixels represent a dark scene with three
 * distinct luma bands, so the levels-stretch visibly lifts the middle band.
 *
 * Layout (by pixel count):
 *   2%   very-dark fringe (veryDarkVal) — sets p2 below the majority
 *  80%   mid-dark content (midVal)      — the pixels we want lifted
 *  18%   bright accents (brightVal)     — drives p98 high enough for range ≥ 8
 *
 * After normalization, midVal is mapped to a much higher output value.
 * Example: veryDarkVal=3, midVal=21, brightVal=50 → p2≈3, p98≈50,
 * range=47; midVal maps to (21-3)*255/47 ≈ 98 (vs raw 21 before normalization).
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

  // 80% mid-dark content (majority) — fills most of the frame.
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = midVal;
    pixels[i + 1] = midVal;
    pixels[i + 2] = midVal;
    pixels[i + 3] = 255;
  }

  // 2% very-dark fringe — top rows; sets p2 below midVal.
  const darkRowCount = Math.max(1, Math.floor(totalPixels * 0.02) / width);
  for (let y = 0; y < darkRowCount; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = veryDarkVal;
      pixels[i + 1] = veryDarkVal;
      pixels[i + 2] = veryDarkVal;
    }
  }

  // 18% bright accents — bottom rows; drives p98 to brightVal.
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

/** Compute the median luma of the content region (padX..padX+outW, padY..padY+outH). */
function contentMedianLuma(
  decoded: Uint8Array | Uint8ClampedArray,
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
      const r = decoded[i] ?? 0;
      const g = decoded[i + 1] ?? 0;
      const b = decoded[i + 2] ?? 0;
      lumas.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
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
    // Dark scene: 80% of pixels at midVal=21, p2 near 3 (2% fringe), p98 near 50
    // → range ≈ 47; midVal maps to (21-3)*255/47 ≈ 98 vs raw 21 (4.7× lift).
    const W = 200;
    const H = 100;
    const fakeCanvas = makeDarkSceneCanvas(W, H, 3, 21, 50);

    const fpOff = extractCurrentFrame(fakeCanvas, { normalize: 'off' });
    const fpAuto = extractCurrentFrame(fakeCanvas, { normalize: 'auto' });

    expect(fpOff).not.toBeNull();
    expect(fpAuto).not.toBeNull();
    if (fpOff === null || fpAuto === null) return;

    const outW = W; // source fits inside 400×200 → no scaling, placed at padX/padY
    const outH = H;
    const padX = Math.floor((400 - outW) / 2);
    const padY = Math.floor((200 - outH) / 2);

    const decodedOff = decodeFramePixels(fpOff.pixelsB64, fpOff.width, fpOff.height);
    const decodedAuto = decodeFramePixels(fpAuto.pixelsB64, fpAuto.width, fpAuto.height);

    const medianOff = contentMedianLuma(decodedOff, 400, outW, outH, padX, padY);
    const medianAuto = contentMedianLuma(decodedAuto, 400, outW, outH, padX, padY);

    // The normalized output should lift the median substantially (at least double).
    expect(medianAuto).toBeGreaterThan(medianOff * 1.5);
  });

  it('CE-NORM-2: wide-range frame (p98-p2 >= 220) with normalize:"auto" is byte-identical to normalize:"off"', () => {
    // Wide source: half pixels at 0, half at 255 → range = 255 ≥ 220 → skip.
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

    // Byte-identical: pixelsB64 must match.
    expect(fpAuto.pixelsB64).toBe(fpOff.pixelsB64);
  });

  it('CE-NORM-3: degenerate near-flat frame (p98-p2 < 8) with normalize:"auto" is byte-identical to normalize:"off"', () => {
    // Flat source: all pixels at 128 → p98−p2 = 0 < 8 → skip.
    const W = 100;
    const H = 100;
    const pixels = new Uint8Array(W * H * 4).fill(128);
    // Set alpha to 255.
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

    expect(fpAuto.pixelsB64).toBe(fpOff.pixelsB64);
  });

  it('CE-NORM-4: normalize:"auto" on oversized source — letterbox bands stay pure black, alpha stays 255', () => {
    // 1920×1080 dark source → will be letterboxed horizontally.
    const W = 1920;
    const H = 1080;
    const fakeCanvas = makeDarkSceneCanvas(W, H, 3, 15, 40);

    const fp = extractCurrentFrame(fakeCanvas, { normalize: 'auto' });
    expect(fp).not.toBeNull();
    if (fp === null) return;

    const decoded = decodeFramePixels(fp.pixelsB64, fp.width, fp.height);

    // Compute padX for a 1920×1080 → 400×200 fit (scale = 200/1080).
    const scale = Math.min(400 / W, 200 / H, 1);
    const outW = Math.round(W * scale);
    const padX = Math.floor((400 - outW) / 2);

    // Left letterbox band sample at (0, 100) — must be pure black, alpha 255.
    if (padX > 0) {
      const idx = (100 * 400 + 0) * 4;
      expect(decoded[idx]).toBe(0); // R
      expect(decoded[idx + 1]).toBe(0); // G
      expect(decoded[idx + 2]).toBe(0); // B
      expect(decoded[idx + 3]).toBe(255); // A
    }

    // Alpha is 255 everywhere.
    for (let i = 3; i < decoded.length; i += 4) {
      expect(decoded[i]).toBe(255);
    }
  });

  it('CE-NORM-5: getNormalize evaluated per capture — returning "off" then "auto" between interval captures changes output', () => {
    vi.useFakeTimers();
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);

    const W = 200;
    const H = 100;
    vi.stubGlobal('canvas', makeDarkSceneCanvas(W, H, 3, 15, 45));

    const emittedPayloads: string[] = [];
    const emit = vi.fn((payload: { pixelsB64: string }) => {
      emittedPayloads.push(payload.pixelsB64);
    });

    let callCount = 0;
    const getNormalize = vi.fn((): 'off' | 'auto' => {
      callCount++;
      // First capture: 'off'; second capture: 'auto'.
      return callCount === 1 ? 'off' : 'auto';
    });

    const INTERVAL_MS = 500;
    registerCanvasExtractor({ emit, intervalMs: INTERVAL_MS, getNormalize });

    // First interval tick → 'off'.
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(1);

    // Second interval tick → 'auto'.
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(emit).toHaveBeenCalledTimes(2);

    // getNormalize must have been called at least twice.
    expect(getNormalize.mock.calls.length).toBeGreaterThanOrEqual(2);

    // The two payloads must differ (different normalization produced different pixels).
    expect(emittedPayloads.length).toBe(2);
    expect(emittedPayloads[0]).not.toBe(emittedPayloads[1]);
  });
});

// ── CE-VP: Viewport capture, byte-length guard, RT path (260610-fw7 + 260610-lx5) ──────

describe('extractCurrentFrame — viewport capture, byte-length guard & RT path (CE-VP-1..CE-VP-7)', () => {
  beforeEach(() => {
    _resetCanvasExtractor();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Belt-and-suspenders: remove any PIXI stub that was set without vi.stubGlobal
    // (e.g. direct property assignment in a test) so CE-NORM / CE-INT suites that
    // run after this block do NOT accidentally activate the RT primary path.
    delete (globalThis as { PIXI?: unknown }).PIXI;
    _resetCanvasExtractor();
  });

  it('CE-VP-1: extract.pixels() is called with NO target argument (viewport capture regression guard)', () => {
    // This is the core regression guard for the live Forge corruption:
    // pixels(canvas.stage) → whole-world buffer → row-stride mismatch → stripe corruption.
    // After the fix, pixels() must be called with zero arguments.
    const fakeCanvas = makeCanvasMock({ width: 400, height: 200, fill: 0x80 });
    extractCurrentFrame(fakeCanvas);

    const pixelsMock = (
      fakeCanvas as {
        app: { renderer: { extract: { pixels: ReturnType<typeof vi.fn> } } };
      }
    ).app.renderer.extract.pixels;

    expect(pixelsMock).toHaveBeenCalledTimes(1);
    // The call must have been made with ZERO arguments — no canvas.stage passed.
    const callArgs = pixelsMock.mock.calls[0] as unknown[];
    expect(callArgs.length).toBe(0);
  });

  it('CE-VP-2: k=2 buffer inference — oversized renderer buffer produces a correct frame', () => {
    // Simulate a high-DPR renderer: renderer reports 400×200 but extract.pixels()
    // returns a (400*2)×(200*2) = 800×400 buffer with bright 8×8 corner markers
    // placed in the 800×400 space. The extractor should infer k=2, reinterpret dims
    // as 800×400, and produce a valid 400×200 frame with visible corner markers.
    const W = 400;
    const H = 200;
    const k = 2;
    const bufW = W * k;
    const bufH = H * k;
    const bufSize = bufW * bufH * 4;

    const buf = new Uint8Array(bufSize).fill(0x10); // dark field

    // Place bright 8×8 markers at the four corners of the 800×400 space.
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

    // Must not be null — k=2 inference path.
    expect(fp).not.toBeNull();
    if (fp === null) return;

    // Frame dimensions must be the canonical 400×200.
    expect(fp.width).toBe(400);
    expect(fp.height).toBe(200);
    expect(FramePixelsSchema.safeParse(fp).success).toBe(true);

    // The 800×400 source fits exactly in 400×200 (scale = 0.5, no letterbox padding
    // since 800/400 = 400/200 = 2:1 matches the target aspect ratio exactly, padX=0, padY=0).
    const out = decodeFramePixels(fp.pixelsB64, fp.width, fp.height);
    const padX = Math.floor((400 - Math.round(bufW * (400 / bufW))) / 2); // = 0
    const padY = Math.floor((200 - Math.round(bufH * (200 / bufH))) / 2); // = 0
    const sample = (x: number, y: number): number => out[(y * 400 + x) * 4] ?? 0;

    // The four scaled corners must be brighter than the dark field (0x10).
    expect(sample(padX + 1, padY)).toBeGreaterThan(0x40); // top-left
    expect(sample(400 - padX - 2, padY)).toBeGreaterThan(0x40); // top-right
    expect(sample(padX + 1, 199 - padY)).toBeGreaterThan(0x40); // bottom-left
    expect(sample(400 - padX - 2, 199 - padY)).toBeGreaterThan(0x40); // bottom-right
  });

  it('CE-VP-3: garbage-length buffer (non-integer k) returns null and calls console.warn', () => {
    // A buffer whose length is expected*3 has k = sqrt(3) ≈ 1.732 — non-integer.
    // The extractor must return null and call console.warn (never emit garbage).
    const W = 100;
    const H = 100;
    const expected = W * H * 4;
    // Length = expected * 3 → k = sqrt(3), not an integer.
    const garbageBuffer = new Uint8Array(expected * 3).fill(0xaa);

    const fakeCanvas = makeCanvasMock({ width: W, height: H, rawBuffer: garbageBuffer });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = extractCurrentFrame(fakeCanvas);
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // The warning must include the expected and actual lengths.
      const warnArgs = warnSpy.mock.calls[0] as unknown[];
      // Some arg should contain the expected length and the actual length.
      const argsStr = warnArgs.map(String).join(' ');
      expect(argsStr).toContain(String(expected));
      expect(argsStr).toContain(String(expected * 3));
    } finally {
      warnSpy.mockRestore();
    }
  });

  // ── CE-VP-4..CE-VP-7: Render-to-texture primary capture path (260610-lx5) ──

  /**
   * Build a PIXI RenderTexture stub and wire it into globalThis.PIXI via
   * vi.stubGlobal. Returns spies for RT.create, rtStub.destroy, and a renderer
   * extension object with `render` spy and optional `screen` override.
   */
  function installPIXIStub(screenDims?: { width: number; height: number }) {
    const rtStub = {
      destroy: vi.fn(),
      /** Marker so assertions can verify === identity. */
      __isRtStub: true as const,
    };
    const RTCreate = vi.fn(() => rtStub);
    vi.stubGlobal('PIXI', { RenderTexture: { create: RTCreate } });
    const rendererExt = {
      render: vi.fn(),
      ...(screenDims !== undefined ? { screen: screenDims } : {}),
    };
    return { rtStub, RTCreate, rendererExt };
  }

  it('CE-VP-4: RT path — renderer.render called with stage+{renderTexture,clear:true}; extract.pixels(rt) called with rt; rt.destroy(true) called', () => {
    // Install a PIXI.RenderTexture stub so the RT primary path is activated.
    const { rtStub, RTCreate, rendererExt } = installPIXIStub();

    const W = 400;
    const H = 200;
    const pixels = new Uint8Array(W * H * 4).fill(0x80);
    const pixelsSpy = vi.fn(() => pixels);

    // Build a canvas whose renderer carries the RT-path required fields.
    const rtCanvas = {
      scene: { id: 'rt-scene' },
      stage: { __rtStageMarker: true },
      app: {
        renderer: {
          width: W,
          height: H,
          extract: { pixels: pixelsSpy },
          ...rendererExt,
        },
      },
    };

    const fp = extractCurrentFrame(rtCanvas);
    expect(fp).not.toBeNull();

    // RT.create must have been called with the viewport dims.
    expect(RTCreate).toHaveBeenCalledTimes(1);
    expect(RTCreate).toHaveBeenCalledWith({ width: W, height: H });

    // renderer.render must have been called once with the stage and {renderTexture: rt, clear: true}.
    expect(rendererExt.render).toHaveBeenCalledTimes(1);
    const [renderTarget, renderOpts] = rendererExt.render.mock.calls[0] as [
      unknown,
      { renderTexture: unknown; clear: boolean },
    ];
    expect(renderTarget).toBe(rtCanvas.stage);
    expect(renderOpts.renderTexture).toBe(rtStub);
    expect(renderOpts.clear).toBe(true);

    // extract.pixels must have been called with exactly one argument === rtStub (not no-arg).
    expect(pixelsSpy).toHaveBeenCalledTimes(1);
    const pixelsCallArgs = pixelsSpy.mock.calls[0] as unknown[];
    expect(pixelsCallArgs.length).toBe(1);
    expect(pixelsCallArgs[0]).toBe(rtStub);

    // rt.destroy(true) must have been called (finally block, GPU memory freed).
    expect(rtStub.destroy).toHaveBeenCalledTimes(1);
    expect(rtStub.destroy).toHaveBeenCalledWith(true);
  });

  it('CE-VP-5: destroy-on-throw — extract.pixels throws on RT path → null returned, console.warn called, rt.destroy(true) still called', () => {
    const { rtStub, rendererExt } = installPIXIStub();

    const W = 400;
    const H = 200;
    // extract.pixels throws — simulates GPU context-lost on real device.
    const pixelsSpy = vi.fn(() => {
      throw new Error('GPU context lost');
    });

    const rtCanvas = {
      scene: { id: 'throw-scene' },
      stage: { __rtStageMarker: true },
      app: {
        renderer: {
          width: W,
          height: H,
          extract: { pixels: pixelsSpy },
          ...rendererExt,
        },
      },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = extractCurrentFrame(rtCanvas);

      // Must return null — no retry storm.
      expect(result).toBeNull();

      // console.warn must have been called once.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMsg = (warnSpy.mock.calls[0] as unknown[]).map(String).join(' ');
      expect(warnMsg).toContain('[EVF canvas-extractor]');

      // rt.destroy(true) MUST still have been called (finally block protects GPU memory).
      expect(rtStub.destroy).toHaveBeenCalledTimes(1);
      expect(rtStub.destroy).toHaveBeenCalledWith(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('CE-VP-6: fallback — without globalThis.PIXI, extract.pixels called with ZERO args', () => {
    // Explicitly ensure PIXI is NOT on globalThis (afterEach also deletes it, but
    // be explicit so this test is self-contained and documents the fallback trigger).
    delete (globalThis as { PIXI?: unknown }).PIXI;

    const W = 400;
    const H = 200;
    // makeCanvasMock has no `render` field on the renderer — same as all other tests.
    const fakeCanvas = makeCanvasMock({ width: W, height: H, fill: 0x80 });

    extractCurrentFrame(fakeCanvas);

    const pixelsMock = (
      fakeCanvas as {
        app: { renderer: { extract: { pixels: ReturnType<typeof vi.fn> } } };
      }
    ).app.renderer.extract.pixels;

    // On the fallback path, pixels() must be called with ZERO arguments (no rt).
    expect(pixelsMock).toHaveBeenCalledTimes(1);
    const callArgs = pixelsMock.mock.calls[0] as unknown[];
    expect(callArgs.length).toBe(0);
  });

  it('CE-VP-7: screen dims — RT path with renderer.screen present → RenderTexture created with screen dims', () => {
    const screenW = 576;
    const screenH = 288;
    // renderer.width/height differ from screen to prove screen wins.
    const rendererW = 400;
    const rendererH = 200;

    const { rtStub, RTCreate, rendererExt } = installPIXIStub({ width: screenW, height: screenH });

    const pixels = new Uint8Array(screenW * screenH * 4).fill(0x80);
    const pixelsSpy = vi.fn(() => pixels);

    const rtCanvas = {
      scene: { id: 'screen-dims-scene' },
      stage: { __rtStageMarker: true },
      app: {
        renderer: {
          width: rendererW,
          height: rendererH,
          extract: { pixels: pixelsSpy },
          ...rendererExt,
        },
      },
    };

    const fp = extractCurrentFrame(rtCanvas);
    expect(fp).not.toBeNull();

    // RT.create must have been called with screen dims, NOT renderer.width/height.
    expect(RTCreate).toHaveBeenCalledTimes(1);
    expect(RTCreate).toHaveBeenCalledWith({ width: screenW, height: screenH });

    // rt.destroy(true) still called.
    expect(rtStub.destroy).toHaveBeenCalledWith(true);
  });

  it('CE-VP-8: fractional screen dims → RT.create called with integer dims; frame emitted', () => {
    // Live evidence: Forge client 2026-06-10 — renderer.screen = {width:2348.25, height:824.25}
    // at devicePixelRatio 1.3333. PIXI floors internally, so the pixel buffer is
    // 2348×824×4 bytes, but a naive float vw/vh produces k≈0.9998 → frame skip.
    const screenW = 2348.25;
    const screenH = 824.25;
    const floorW = Math.floor(screenW); // 2348
    const floorH = Math.floor(screenH); // 824

    const { rtStub, RTCreate, rendererExt } = installPIXIStub({ width: screenW, height: screenH });

    // The RT buffer must match the integer-floored dims exactly (what PIXI actually returns).
    const pixels = new Uint8Array(floorW * floorH * 4).fill(0x80);
    const pixelsSpy = vi.fn(() => pixels);

    const rtCanvas = {
      scene: { id: 'fractional-screen-scene' },
      stage: { __rtStageMarker: true },
      app: {
        renderer: {
          width: 800, // intentionally different from screen dims
          height: 600,
          extract: { pixels: pixelsSpy },
          ...rendererExt,
        },
      },
    };

    const fp = extractCurrentFrame(rtCanvas);

    // Frame must be emitted — byte-length guard must not mismatch.
    expect(fp).not.toBeNull();

    // RT.create must have been called with integer dims (Math.floor applied).
    expect(RTCreate).toHaveBeenCalledTimes(1);
    expect(RTCreate).toHaveBeenCalledWith({ width: floorW, height: floorH });

    // rt.destroy(true) still called.
    expect(rtStub.destroy).toHaveBeenCalledWith(true);
  });
});
