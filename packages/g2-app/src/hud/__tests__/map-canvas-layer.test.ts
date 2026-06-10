/**
 * Unit tests for MapCanvasLayer — z=0 compositor layer for full-screen Foundry
 * canvas frames.
 *
 * Covers quick-task 260610-d42 Task 2 behaviour MCL-1..MCL-4:
 *   - MCL-1: MapCanvasLayer implements CanvasLayer; id='map-canvas';
 *            getContainerCount returns {image:0, text:0}; no getCaptureContainer
 *   - MCL-2: setFrame caches frame, sets _dirty=true, invokes onFrame callback
 *            exactly once per setFrame call
 *   - MCL-3: paint() blits the cached frame via putImageData at (0,0); no frame
 *            received → paint() is a no-op; _dirty=false after paint() in both cases
 *   - MCL-4: isDirty() is true at construction and after setFrame; false after paint()
 *
 * @see packages/g2-app/src/hud/map-canvas-layer.ts (system under test)
 * @see .planning/quick/260610-d42-full-screen-streamed-map-text-container-/260610-d42-PLAN.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapCanvasLayer } from '../map-canvas-layer.js';

// Stub globalThis.ImageData for happy-dom (which lacks this constructor).
// The stub creates a minimal ImageData-like object with `data`, `width`,
// `height` fields, matching the shape that putImageData expects from our usage.
beforeEach(() => {
  if (typeof ImageData === 'undefined') {
    vi.stubGlobal(
      'ImageData',
      class FakeImageData {
        readonly data: Uint8ClampedArray;
        readonly width: number;
        readonly height: number;
        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      },
    );
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Shared fake-ctx factory ────────────────────────────────────────────────────

/**
 * Build a minimal fake 2D context with the methods MapCanvasLayer may call.
 */
function makeFakeCtx() {
  return {
    putImageData: vi.fn(),
    clearRect: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: test fake
    canvas: { width: 400, height: 200 } as any,
  };
}

function makeFakeCanvas(ctx?: ReturnType<typeof makeFakeCtx>) {
  const resolvedCtx = ctx ?? makeFakeCtx();
  return {
    canvas: {
      width: 400,
      height: 200,
      getContext: vi.fn().mockReturnValue(resolvedCtx),
      // biome-ignore lint/suspicious/noExplicitAny: test fake
    } as any as HTMLCanvasElement,
    ctx: resolvedCtx,
  };
}

/** Build a synthetic 400×200 RGBA pixel buffer. */
function makeRgba(w = 400, h = 200): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4).fill(0x80);
}

// ── MCL-1: implements CanvasLayer, correct id, no capture container ─────────

describe('MapCanvasLayer — MCL-1: CanvasLayer contract + container budget', () => {
  it('MCL-1: id is "map-canvas"', () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    expect(layer.id).toBe('map-canvas');
  });

  it('MCL-1: getContainerCount returns {image:0, text:0} (canvas-budget compliant)', () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    expect(layer.getContainerCount()).toEqual({ image: 0, text: 0 });
  });

  it('MCL-1: getCaptureContainer is NOT defined (map layer is not a capture provider)', () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    // CanvasStatusHudLayer remains the sole hud-capture provider
    expect((layer as { getCaptureContainer?: unknown }).getCaptureContainer).toBeUndefined();
  });

  it('MCL-1: attachCanvas returns a Promise<void>', async () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    const { canvas } = makeFakeCanvas();
    const result = layer.attachCanvas(canvas);
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('MCL-1: draw() returns a resolved Promise<void>', async () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    await expect(layer.draw()).resolves.toBeUndefined();
  });

  it('MCL-1: destroy() does not throw', async () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    const { canvas } = makeFakeCanvas();
    await layer.attachCanvas(canvas);
    expect(() => layer.destroy()).not.toThrow();
  });
});

// ── MCL-2: setFrame caches frame and invokes onFrame exactly once ─────────

describe('MapCanvasLayer — MCL-2: setFrame callback + dirty flag', () => {
  it('MCL-2: setFrame invokes onFrame callback exactly once', () => {
    const onFrame = vi.fn();
    const layer = new MapCanvasLayer({ onFrame });
    const rgba = makeRgba();
    layer.setFrame(rgba, 400, 200);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('MCL-2: two setFrame calls invoke onFrame twice', () => {
    const onFrame = vi.fn();
    const layer = new MapCanvasLayer({ onFrame });
    layer.setFrame(makeRgba(), 400, 200);
    layer.setFrame(makeRgba(), 400, 200);
    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  it('MCL-2: setFrame sets _dirty=true', () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    // layer is dirty at construction, paint to clear, then setFrame to re-dirty
    // (we'll test via isDirty below, but setFrame after construction: still dirty)
    layer.setFrame(makeRgba(), 400, 200);
    expect(layer.isDirty()).toBe(true);
  });
});

// ── MCL-3: paint() blits frame or is a no-op with correct dirty reset ────────

describe('MapCanvasLayer — MCL-3: paint() blits frame at (0,0)', () => {
  it('MCL-3: paint() calls putImageData when a frame was set', async () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    const ctx = makeFakeCtx();
    const { canvas } = makeFakeCanvas(ctx);
    await layer.attachCanvas(canvas);

    layer.setFrame(makeRgba(), 400, 200);
    layer.paint();

    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    const [imageData, x, y] = ctx.putImageData.mock.calls[0] as [ImageData, number, number];
    expect(imageData).toBeInstanceOf(ImageData);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  it('MCL-3: paint() is a no-op (no putImageData call) when no frame was set', async () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    const ctx = makeFakeCtx();
    const { canvas } = makeFakeCanvas(ctx);
    await layer.attachCanvas(canvas);
    layer.paint(); // no setFrame — should be a no-op
    expect(ctx.putImageData).not.toHaveBeenCalled();
  });

  it('MCL-3: paint() resets _dirty=false even when no frame was set', async () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    const { canvas } = makeFakeCanvas();
    await layer.attachCanvas(canvas);
    // layer starts dirty, paint without a frame — must still reset dirty
    layer.paint();
    expect(layer.isDirty()).toBe(false);
  });
});

// ── MCL-4: isDirty() lifecycle ────────────────────────────────────────────────

describe('MapCanvasLayer — MCL-4: isDirty() lifecycle', () => {
  it('MCL-4: isDirty() is true at construction', () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    expect(layer.isDirty()).toBe(true);
  });

  it('MCL-4: isDirty() is true after setFrame', async () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    const { canvas } = makeFakeCanvas();
    await layer.attachCanvas(canvas);
    layer.paint(); // clear dirty
    expect(layer.isDirty()).toBe(false);

    layer.setFrame(makeRgba(), 400, 200);
    expect(layer.isDirty()).toBe(true);
  });

  it('MCL-4: isDirty() is false after paint()', async () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    const { canvas } = makeFakeCanvas();
    await layer.attachCanvas(canvas);
    layer.setFrame(makeRgba(), 400, 200);
    layer.paint();
    expect(layer.isDirty()).toBe(false);
  });

  it('MCL-4: isDirty() cycle: construction dirty → paint clean → setFrame dirty → paint clean', async () => {
    const layer = new MapCanvasLayer({ onFrame: vi.fn() });
    const { canvas } = makeFakeCanvas();
    await layer.attachCanvas(canvas);

    expect(layer.isDirty()).toBe(true);
    layer.paint();
    expect(layer.isDirty()).toBe(false);
    layer.setFrame(makeRgba(), 400, 200);
    expect(layer.isDirty()).toBe(true);
    layer.paint();
    expect(layer.isDirty()).toBe(false);
  });
});
