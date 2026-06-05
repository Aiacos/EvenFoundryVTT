/**
 * Unit tests for CanvasCompositor (ADR-0013 Amendment 1, RAST-01).
 *
 * Tests CC-01..CC-05 + blank-buffer case.
 *
 * Canvas rendering is NOT testable in happy-dom (no OffscreenCanvas, no real
 * 2D context). Therefore all tests mock the canvas and 2D context, and assert
 * pure logic: z-order paint call order, dirty-skip behaviour, deregister
 * isolation, and return-buffer shape.
 *
 * Approach: patch `typeof document` / `typeof OffscreenCanvas` is not needed —
 * instead we inject a fabricated canvas+context via the `_testSetMasterCanvas`
 * escape hatch that CanvasCompositor exposes ONLY in test builds. The compositor
 * NEVER uses the hatch in production; it is guarded by `if (typeof process !==
 * 'undefined' && process.env.NODE_ENV === 'test')`.
 *
 * @see packages/g2-app/src/engine/canvas-compositor.ts
 * @see docs/architecture/0013-hud-raster-rendering.md (Amendment 1)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasCompositor } from '../canvas-compositor.js';
import type { CanvasLayer } from '../layer-types.js';
import { ZIndex } from '../layer-types.js';

// ── Shared mock factories ─────────────────────────────────────────────────────

/** Build a minimal fake 2D context backed by a fixed-size buffer. */
function makeFakeCtx(w = 400, h = 200) {
  const buffer = new Uint8ClampedArray(w * h * 4);
  return {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: buffer,
    }),
    // biome-ignore lint/suspicious/noExplicitAny: test fake
    canvas: { width: w, height: h } as any,
  };
}

/** Build a minimal fake HTMLCanvasElement. */
function makeFakeCanvas() {
  return {
    width: 400,
    height: 200,
    // biome-ignore lint/suspicious/noExplicitAny: test fake
  } as any as HTMLCanvasElement;
}

/** Build a stub CanvasLayer with spied paint() and an in-memory canvas. */
function makeLayer(): CanvasLayer & {
  paintSpy: ReturnType<typeof vi.fn>;
} {
  const paintSpy = vi.fn();
  const fakeCanvas = makeFakeCanvas();
  const layer = {
    id: `layer-${Math.random()}`,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    attachCanvas: vi.fn(),
    paint: paintSpy,
    isDirty: vi.fn().mockReturnValue(true),
    paintSpy,
    _canvas: fakeCanvas,
  } satisfies CanvasLayer & { paintSpy: ReturnType<typeof vi.fn>; _canvas: HTMLCanvasElement };
  return layer;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('CanvasCompositor', () => {
  let compositor: CanvasCompositor;
  let fakeCtx: ReturnType<typeof makeFakeCtx>;

  beforeEach(() => {
    compositor = new CanvasCompositor();
    fakeCtx = makeFakeCtx();
    // Inject the mock context so tests don't need a real canvas environment.
    compositor._testSetMasterContext(fakeCtx as unknown as OffscreenCanvasRenderingContext2D);
  });

  // ── blank-buffer case ──────────────────────────────────────────────────────

  it('blank-buffer: composite() with zero layers returns a 320000-length buffer', () => {
    const result = compositor.composite();
    expect(result).toBeInstanceOf(Uint8ClampedArray);
    expect(result).toHaveLength(400 * 200 * 4);
  });

  // ── CC-01: z-order ─────────────────────────────────────────────────────────

  it('CC-01: composite() calls lower-z paint() BEFORE higher-z paint() (ascending z-order)', () => {
    const callOrder: ZIndex[] = [];

    const layerZ2 = makeLayer();
    layerZ2.paint = vi.fn(() => {
      callOrder.push(ZIndex.Z2_OVERLAY);
    });

    const layerZ0 = makeLayer();
    layerZ0.paint = vi.fn(() => {
      callOrder.push(ZIndex.Z0_MAP);
    });

    const canvasZ2 = makeFakeCanvas();
    const canvasZ0 = makeFakeCanvas();

    // Register z=2 FIRST (insertion order), then z=0 — z-order sort must override this.
    compositor.registerLayer(ZIndex.Z2_OVERLAY, canvasZ2, layerZ2);
    compositor.registerLayer(ZIndex.Z0_MAP, canvasZ0, layerZ0);

    compositor.composite();

    // z=0 must be called before z=2 regardless of registration order.
    expect(callOrder).toEqual([ZIndex.Z0_MAP, ZIndex.Z2_OVERLAY]);
  });

  // ── CC-02: dirty-skip ──────────────────────────────────────────────────────

  it('CC-02: clean layer paint() is NOT called on second composite() (dirty-skip)', () => {
    const layer = makeLayer();
    const fakeCanvas = makeFakeCanvas();
    compositor.registerLayer(ZIndex.Z1_STATUS_HUD, fakeCanvas, layer);

    // First composite — layer is dirty (registered with isDirty=true).
    compositor.composite();
    expect(layer.paint).toHaveBeenCalledTimes(1);

    // Second composite WITHOUT markDirty — paint must NOT be called again.
    compositor.composite();
    expect(layer.paint).toHaveBeenCalledTimes(1);
  });

  // ── CC-03: dirty propagation ───────────────────────────────────────────────

  it('CC-03: markDirty(z) forces repaint on next composite()', () => {
    const layer = makeLayer();
    const fakeCanvas = makeFakeCanvas();
    compositor.registerLayer(ZIndex.Z1_STATUS_HUD, fakeCanvas, layer);

    // First composite — paints.
    compositor.composite();
    expect(layer.paint).toHaveBeenCalledTimes(1);

    // Mark dirty — should cause a repaint.
    compositor.markDirty(ZIndex.Z1_STATUS_HUD);
    compositor.composite();
    expect(layer.paint).toHaveBeenCalledTimes(2);
  });

  // ── CC-04: return shape ────────────────────────────────────────────────────

  it('CC-04: composite() returns a Uint8ClampedArray of length 400*200*4 = 320000', () => {
    const layer = makeLayer();
    const fakeCanvas = makeFakeCanvas();
    compositor.registerLayer(ZIndex.Z0_MAP, fakeCanvas, layer);

    const result = compositor.composite();
    expect(result).toBeInstanceOf(Uint8ClampedArray);
    expect(result).toHaveLength(400 * 200 * 4);
  });

  // ── CC-05: deregister ──────────────────────────────────────────────────────

  it('CC-05: deregistered layer paint() is never called', () => {
    const layer = makeLayer();
    const fakeCanvas = makeFakeCanvas();
    compositor.registerLayer(ZIndex.Z1_STATUS_HUD, fakeCanvas, layer);
    compositor.deregisterLayer(ZIndex.Z1_STATUS_HUD);

    compositor.composite();
    expect(layer.paint).not.toHaveBeenCalled();
  });

  // ── markDirty no-op ────────────────────────────────────────────────────────

  it('markDirty() on an unregistered z is a no-op (does not throw)', () => {
    expect(() => compositor.markDirty(ZIndex.Z2_OVERLAY)).not.toThrow();
  });
});
