/**
 * CanvasCompositor — master 400×200 canvas compositor for the HUD raster path.
 *
 * Owns a master 400×200 OffscreenCanvas (or HTMLCanvasElement fallback in
 * browser main-thread). Composites registered per-layer canvases in ascending
 * ZIndex order via `drawImage`, implements dirty-skip (layers whose state
 * has not changed since the last `composite()` call are blitted from their
 * cached canvas without calling `paint()` again), and returns a 400×200×4
 * RGBA `Uint8ClampedArray` consumed by `buildHudTiles` → `pushHudTiles`.
 *
 * # Canvas acquisition (acquireCanvas2d pattern)
 *
 * The master canvas is created in the same environment-resolution order as
 * `acquireCanvas2d` in `hud-canvas-renderer.ts`:
 *   1. `OffscreenCanvas` — Web Worker context.
 *   2. `document.createElement('canvas')` — WebView / browser main thread.
 *   3. Throws — no canvas API available (test environment must inject via
 *      `_testSetMasterContext`).
 *
 * # Geometry coupling
 *
 * `COMPOSITOR_W = 400` and `COMPOSITOR_H = 200` MUST equal `FRAME_W`/`FRAME_H`
 * in `hud-raster-frame.ts`. The master RGBA buffer produced by `composite()` is
 * passed directly to `buildHudTiles()`, which validates
 * `rgba.length === 400*200*4 = 320000`.
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1 — compositor model)
 * @see packages/g2-app/src/hud/hud-raster-frame.ts (FRAME_W/FRAME_H coupling)
 * @see packages/g2-app/src/hud/hud-canvas-renderer.ts (acquireCanvas2d pattern source)
 * @see packages/g2-app/src/engine/layer-types.ts (ZIndex, CanvasLayer)
 */

import type { CanvasLayer, ZIndex } from './layer-types.js';

// ── Geometry constants ────────────────────────────────────────────────────────

/**
 * Master canvas width (pixels).
 *
 * MUST equal `FRAME_W` in `hud-raster-frame.ts` (400 px).
 * INV-2 verified 2026-06-05: 4 tiles × 100 px each, 2 columns = 400 px.
 */
export const COMPOSITOR_W = 400;

/**
 * Master canvas height (pixels).
 *
 * MUST equal `FRAME_H` in `hud-raster-frame.ts` (200 px).
 * INV-2 verified 2026-06-05: 2 rows × 100 px each = 200 px.
 */
export const COMPOSITOR_H = 200;

// ── Internal types ─────────────────────────────────────────────────────────────

/** Registered layer entry inside the compositor's layer map. */
interface LayerEntry {
  /** The CanvasLayer whose `paint()` is called when dirty. */
  readonly layer: CanvasLayer;
  /** The layer's own OffscreenCanvas or HTMLCanvasElement, blitted to master via drawImage. */
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
}

// ── Public interface ───────────────────────────────────────────────────────────

/**
 * Public contract for the canvas compositor.
 *
 * `LayerManager` accepts a `CanvasCompositorLike` constructor parameter
 * (plan 19-04) so tests can inject a stub without the full implementation.
 */
export interface CanvasCompositorLike {
  /**
   * Register a layer's offscreen canvas in the compositor at the given z-index.
   *
   * The layer is marked dirty so `composite()` paints it on the first call.
   * Called by `LayerManager.bundle()` at layer mount time (plan 19-04).
   *
   * @param z      ZIndex key for ordering and lookup.
   * @param canvas The layer's own OffscreenCanvas or HTMLCanvasElement.
   * @param layer  The CanvasLayer that owns the canvas.
   */
  registerLayer(z: ZIndex, canvas: OffscreenCanvas | HTMLCanvasElement, layer: CanvasLayer): void;

  /**
   * Remove a layer from the compositor.
   *
   * The layer is never painted or blitted after this call. Idempotent if `z`
   * was not registered.
   */
  deregisterLayer(z: ZIndex): void;

  /**
   * Mark the layer at `z` dirty so `composite()` calls `paint()` before blitting.
   *
   * No-op when `z` is not registered.
   */
  markDirty(z: ZIndex): void;

  /**
   * Composite all registered layers in ascending z-order and return the master
   * 400×200×4 RGBA buffer.
   *
   * - Dirty layers: `layer.paint()` called first (re-renders to the layer canvas),
   *   then `drawImage(canvas, 0, 0)` onto the master.
   * - Clean layers: `drawImage` only (skip `paint()` — dirty-skip optimisation).
   * - Returns a new `Uint8ClampedArray` of length `400 * 200 * 4 = 320000` backed
   *   by a copy of the master canvas's ImageData buffer.
   * - When no layers are registered, returns a blank (all-zero) 320000-byte buffer.
   *
   * @returns 400×200×4 RGBA Uint8ClampedArray.
   * @see packages/g2-app/src/hud/hud-raster-frame.ts buildHudTiles (consumer)
   */
  composite(): Uint8ClampedArray;
}

// ── Implementation ─────────────────────────────────────────────────────────────

/**
 * Default implementation of {@link CanvasCompositorLike}.
 *
 * Instantiate once per rendering context; do NOT use as a module-level
 * singleton. Injected into `LayerManager` via constructor parameter (plan 19-04).
 * No `CanvasLayer` implementations exist in Phase 19 — `composite()` returns a
 * blank buffer when no layers are registered.
 */
export class CanvasCompositor implements CanvasCompositorLike {
  /** Registered layers keyed by ZIndex. Iteration order is insertion order — sorted at composite time. */
  private readonly _layers = new Map<ZIndex, LayerEntry>();

  /**
   * Master 2D context — all per-layer canvases are blitted here via drawImage.
   *
   * Lazily acquired on first `composite()` call (or immediately overridden by
   * `_testSetMasterContext` in unit tests). The `null` sentinel is replaced
   * before any actual use.
   */
  private _masterCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  constructor() {
    // Attempt eager acquisition; leave null in test environments that lack
    // a real canvas — _testSetMasterContext() must be called before composite().
    try {
      this._masterCtx = CanvasCompositor._acquireMasterCtx();
    } catch {
      // Deferred — unit tests inject via _testSetMasterContext().
      this._masterCtx = null;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  registerLayer(z: ZIndex, canvas: OffscreenCanvas | HTMLCanvasElement, layer: CanvasLayer): void {
    this._layers.set(z, { layer, canvas });
  }

  deregisterLayer(z: ZIndex): void {
    this._layers.delete(z);
  }

  /**
   * No-op — dirtiness is now delegated entirely to each `CanvasLayer.isDirty()`
   * (CR-02 fix: the single source of truth is the layer's own flag, not a
   * redundant `LayerEntry.isDirty` copy). The method is retained so existing
   * callers and tests that call `markDirty(z)` continue to compile.
   *
   * @param _z ZIndex parameter — unused; kept for interface compatibility.
   */
  markDirty(_z: ZIndex): void {
    // Delegated to layer.isDirty() — no per-entry tracking needed.
  }

  composite(): Uint8ClampedArray {
    const ctx = this._masterCtx;
    if (ctx === null) {
      // No 2D context available (test environment without _testSetMasterContext, or
      // OffscreenCanvas + document both unavailable). Return a zeroed RGBA buffer
      // (all-black / transparent) rather than throwing — _compositeAndPush callers
      // should degrade gracefully to a blank frame rather than crashing the engine.
      // In unit tests that need real compositing, call _testSetMasterContext() first.
      console.warn(
        '[EVF] CanvasCompositor.composite(): no 2D context — returning empty RGBA (all-zero).',
      );
      return new Uint8ClampedArray(COMPOSITOR_W * COMPOSITOR_H * 4);
    }

    // WR-02 fix: clear the master canvas before compositing so deregistered-layer
    // pixels do not ghost onto subsequent frames.
    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);

    // Sort by ascending ZIndex value — Map iteration is insertion-order only
    // (same pattern as LayerManager.getTopLayer() line 408).
    const sorted = [...this._layers.entries()].sort(([a], [b]) => a - b);

    for (const [, entry] of sorted) {
      // CR-02 fix: delegate dirtiness to the layer's own isDirty() flag — this is
      // the single source of truth. The old LayerEntry.isDirty copy was never updated
      // by CanvasStatusHudLayer._dirty transitions and went permanently false after the
      // first composite(), causing paint() to never be called again on delta events.
      if (entry.layer.isDirty()) {
        entry.layer.paint(); // paint() resets _dirty=false as its last statement
      }
      ctx.drawImage(entry.canvas, 0, 0);
    }

    const imageData = ctx.getImageData(0, 0, COMPOSITOR_W, COMPOSITOR_H);
    // Return a copy so callers cannot mutate the internal buffer.
    return new Uint8ClampedArray(imageData.data.buffer.slice(0));
  }

  // ── Test escape hatch ──────────────────────────────────────────────────────

  /**
   * Replace the master 2D context with a test-provided mock.
   *
   * ONLY to be called from unit tests — allows testing compositor logic without
   * a real canvas environment (happy-dom has no OffscreenCanvas).
   *
   * Not callable from production code: the constructor always acquires the real
   * context; tests override it immediately after construction.
   *
   * @internal
   */
  _testSetMasterContext(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    this._masterCtx = ctx;
  }

  // ── Private static helpers ─────────────────────────────────────────────────

  /**
   * Acquire a 2D rendering context for the master 400×200 canvas.
   *
   * Environment resolution order (mirrors `acquireCanvas2d` in hud-canvas-renderer.ts):
   *   1. `OffscreenCanvas` — Web Worker context.
   *   2. `document.createElement('canvas')` — WebView / browser main thread.
   *   3. Throws — test environment; tests must call `_testSetMasterContext`.
   *
   * @see packages/g2-app/src/hud/hud-canvas-renderer.ts acquireCanvas2d
   */
  private static _acquireMasterCtx(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(COMPOSITOR_W, COMPOSITOR_H);
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        throw new Error('[EVF] CanvasCompositor: OffscreenCanvas getContext("2d") returned null');
      }
      return ctx as OffscreenCanvasRenderingContext2D;
    }

    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = COMPOSITOR_W;
      canvas.height = COMPOSITOR_H;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        throw new Error(
          '[EVF] CanvasCompositor: document.createElement canvas getContext("2d") returned null',
        );
      }
      return ctx;
    }

    throw new Error(
      '[EVF] CanvasCompositor: no canvas API available in this environment ' +
        '(neither OffscreenCanvas nor document). ' +
        'Unit tests must call _testSetMasterContext() immediately after construction.',
    );
  }
}
