/**
 * Unit tests for canvas-extractor — Foundry PIXI canvas → FramePixels dispatch.
 *
 * Covers Plan 4a-06 Task 2 behaviour CE-1..CE-7:
 *   - CE-1   registerCanvasExtractor registers all 4 hooks
 *            (canvasReady, drawCanvas, refreshToken, updateScene)
 *   - CE-2   On hook fire + debounce expiry, emit is called with a payload
 *            satisfying FramePixelsSchema
 *   - CE-3   Two hook fires within debounce window coalesce to a single emit
 *   - CE-4   canvas.app.renderer undefined → emit NOT called; no throw
 *   - CE-5   extractCurrentFrame returns FramePixels with clamped dims
 *   - CE-6   Oversized canvas (1920×1080) is fit-downscaled to exactly 400×200, whole scene captured (ADR-0013 Amendment 1)
 *   - CE-7   Idempotency: a second registerCanvasExtractor is a no-op
 *
 * Foundry globals (Hooks, canvas, game) are stubbed via vi.stubGlobal, matching
 * the established pattern in `module.test.ts` + `readers.test.ts`. No live
 * Foundry runtime required.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-06-PLAN.md Task 2
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

  it('CE-1: registers Hooks.on for canvasReady, drawCanvas, refreshToken, updateScene', () => {
    const hooks = makeHooksMock();
    vi.stubGlobal('Hooks', hooks);
    vi.stubGlobal('canvas', makeCanvasMock({ width: 288, height: 144 }));

    const unregister = registerCanvasExtractor({ emit: vi.fn() });

    const events = hooks.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('canvasReady');
    expect(events).toContain('drawCanvas');
    expect(events).toContain('refreshToken');
    expect(events).toContain('updateScene');
    expect(hooks.on).toHaveBeenCalledTimes(4);

    // Returned unregister calls Hooks.off the same number of times.
    unregister();
    expect(hooks.off).toHaveBeenCalledTimes(4);
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

    // Second registration is a no-op: 4 events on the first call, no additional.
    expect(hooks.on).toHaveBeenCalledTimes(4);

    // Both unregister handles still work without double-off cascade.
    unregister1();
    unregister2();
    expect(hooks.off).toHaveBeenCalled();
  });
});
