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
 * Foundry globals (Hooks, canvas, game) are stubbed via vi.stubGlobal, matching
 * the established pattern in `module.test.ts` + `readers.test.ts`. No live
 * Foundry runtime required.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-06-PLAN.md Task 2
 * @see .planning/quick/260610-d42-full-screen-streamed-map-text-container-/260610-d42-PLAN.md Task 1
 * @see .planning/quick/260610-evs-contrast-normalization-setting-for-glass/260610-evs-PLAN.md Task 1
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
}

/** Build a stub for Foundry's `canvas` global with controllable dimensions. */
function makeCanvasMock(opts: CanvasMockOpts) {
  const fill = opts.fill ?? 0x80;
  const pixels = new Uint8Array(opts.width * opts.height * 4).fill(fill);
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
