/**
 * MapCanvasLayer — z=0 compositor layer for the full-screen Foundry map.
 *
 * Implements `CanvasLayer` at `ZIndex.Z0_MAP`. Holds the latest 400×200 RGBA
 * frame received from the Foundry canvas extractor and paints it via
 * `putImageData` at (0,0) on its layer canvas. Each `setFrame` call triggers
 * the injected `onFrame` callback (typically `hudDeltaDriver.requestCycle()`) so
 * the debounced delta loop pushes only changed sub-tiles — zero BLE writes when
 * the frame is unchanged.
 *
 * # Threat mitigations
 *
 * - T-d42-02: frame bytes arrive from `scene-input.ts` which enforces
 *   `FramePixelsSchema + padFrameToCanonical` before calling `setFrame` — the
 *   bytes are pre-validated; no additional schema check needed here.
 *
 * # Container budget
 *
 * `getContainerCount()` returns `{image:0, text:0}` — canvas layers do NOT
 * allocate individual SDK containers (ADR-0013 Amendment 1, locked decision #3).
 *
 * # getCaptureContainer
 *
 * NOT implemented. `CanvasStatusHudLayer` remains the sole `'hud-capture'`
 * provider so the capture-invariant (`_assertCaptureInvariant`) stays satisfied
 * with exactly ONE capture provider per page.
 *
 * @see packages/g2-app/src/engine/layer-types.ts (CanvasLayer interface)
 * @see packages/g2-app/src/engine/canvas-compositor.ts (COMPOSITOR_W/COMPOSITOR_H)
 * @see packages/g2-app/src/engine/hud-delta-driver.ts (requestCycle — typical onFrame cb)
 * @see packages/g2-app/src/scene-input.ts (MapFrameSink consumer — routes frame_pixels here)
 * @see .planning/quick/260610-d42-full-screen-streamed-map-text-container-/260610-d42-PLAN.md
 */

import type { CanvasLayer } from '../engine/layer-types.js';

// ── Constructor options ────────────────────────────────────────────────────────

/**
 * Constructor options for `MapCanvasLayer`.
 */
export interface MapCanvasLayerOpts {
  /**
   * Callback invoked exactly once per `setFrame` call.
   *
   * Typically wired to `hudDeltaDriver.requestCycle()` so a new Foundry frame
   * triggers the debounced delta loop — pushing only the sub-tiles that changed.
   * Injected at construction rather than imported to keep the layer testable
   * without a full HudDeltaDriver instance.
   */
  readonly onFrame: () => void;
}

// ── Implementation ─────────────────────────────────────────────────────────────

/**
 * z=0 canvas compositor layer — holds and paints the latest full-screen Foundry
 * map frame.
 *
 * Lifecycle:
 *   1. `new MapCanvasLayer({ onFrame })` — subscribes to nothing; passively
 *      receives frames via `setFrame`.
 *   2. `await attachCanvas(canvas)` — obtains the 2D rendering context; no-op
 *      on null context (happy-dom test environment).
 *   3. `setFrame(rgba, w, h)` — called by `scene-input.ts` after parsing a
 *      `frame_pixels` envelope; stores raw RGBA bytes, marks dirty, fires
 *      `onFrame`.
 *   4. `paint()` — called by `CanvasCompositor` when `isDirty()` returns `true`;
 *      blits the cached `ImageData` at (0,0) via `putImageData`.
 *   5. `destroy()` — no subscriptions to release; no-op.
 */
export class MapCanvasLayer implements CanvasLayer {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'map-canvas';

  /** 2D rendering context provided via `attachCanvas` — null until mounted. */
  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

  /**
   * Raw RGBA bytes + dimensions of the latest frame, or null if no frame yet.
   *
   * We store the raw bytes rather than a pre-constructed `ImageData` because
   * `ImageData` is not available in happy-dom test environments (where tests
   * run without a real canvas 2D API). The `ImageData` is constructed lazily
   * inside `paint()` where the rendering context is available.
   */
  private _frame: { rgba: Uint8ClampedArray; w: number; h: number } | null = null;

  /**
   * Dirty flag — `true` at construction so the first composite always paints.
   *
   * Set to `false` at the LAST LINE of `paint()`. Set to `true` on every
   * `setFrame` call. The `CanvasCompositor` skips `paint()` for clean layers
   * (dirty-skip optimisation).
   *
   * NEVER check this inside `paint()` — the compositor is responsible for
   * calling `isDirty()` before dispatching `paint()`.
   */
  private _dirty = true;

  /** Injected callback fired on every `setFrame`. */
  private readonly _opts: MapCanvasLayerOpts;

  // ── Constructor ───────────────────────────────────────────────────────────

  /**
   * Create a new `MapCanvasLayer`.
   *
   * @param opts Constructor options — must provide `onFrame` callback.
   */
  constructor(opts: MapCanvasLayerOpts) {
    this._opts = opts;
  }

  // ── CanvasLayer interface ─────────────────────────────────────────────────

  /**
   * Assign the OffscreenCanvas (or HTMLCanvasElement fallback) this layer
   * paints on.
   *
   * Returns a resolved `Promise<void>` — no async init required (no font load,
   * no chrome pre-bake). Degrades gracefully when `getContext('2d')` returns
   * `null` (happy-dom test environment): `_ctx` stays null and `paint()` is a
   * no-op for the canvas-null case, but `_dirty` is still managed correctly.
   *
   * @param canvas The OffscreenCanvas or HTMLCanvasElement this layer paints on.
   */
  async attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (ctx === null) {
      console.warn(
        '[EVF] MapCanvasLayer.attachCanvas: getContext("2d") returned null ' +
          '— running in degraded mode (no canvas 2D context; paint() is a no-op).',
      );
      return;
    }
    this._ctx = ctx;
  }

  /**
   * Store a new Foundry map frame, mark the layer dirty, and invoke `onFrame`.
   *
   * T-d42-02: `scene-input.ts` applies `FramePixelsSchema + padFrameToCanonical`
   * before calling `setFrame` — the `rgba` bytes are pre-validated; no additional
   * schema check needed here.
   *
   * @param rgba  RGBA pixel bytes (length = `w * h * 4`), pre-validated canonical
   *              400×200 frame produced by `scene-input.ts` / `padFrameToCanonical`.
   * @param w     Frame width (should be `COMPOSITOR_W = 400`).
   * @param h     Frame height (should be `COMPOSITOR_H = 200`).
   */
  setFrame(rgba: Uint8ClampedArray, w: number, h: number): void {
    // Store raw bytes — ImageData is constructed lazily in paint() where the
    // rendering context is available (and ImageData global is guaranteed to exist).
    //
    // No defensive copy: the `rgba` buffer is always a fresh, owned, single-use
    // buffer that `scene-input.ts` does not retain — `padFrame` either allocates
    // a new padded buffer or returns the freshly-decoded one (decodeFramePixels /
    // native getImageData / new Uint8ClampedArray(firstFrame)), none of which are
    // reused after `setFrame` returns. Copying here was a redundant per-frame
    // hot-path allocation (576×288×4 = 663552 bytes/frame at the capture rate).
    this._frame = { rgba, w, h };
    this._dirty = true;
    this._opts.onFrame();
  }

  /**
   * Repaint the layer's canvas from the cached frame.
   *
   * Blits `_frame` via `putImageData` at (0,0). When no frame has been received
   * yet, `paint()` is a no-op (leaves the canvas untouched). Resets `_dirty =
   * false` as the LAST line in both cases.
   *
   * Called by `CanvasCompositor` ONLY when `isDirty()` returns `true`.
   */
  paint(): void {
    const ctx = this._ctx;
    if (ctx !== null && this._frame !== null) {
      // Construct ImageData here (where the 2D API is guaranteed to exist for
      // a live OffscreenCanvas / HTMLCanvasElement context). We guard with a
      // typeof check so the `paint()` no-op path (ctx null or no frame) in
      // happy-dom tests does not ReferenceError. In production the guard is
      // always true — canvas 2D contexts are only available when ImageData is.
      if (typeof ImageData !== 'undefined') {
        // No defensive copy: the ImageData constructor adopts the array as its
        // backing store WITHOUT copying, and `putImageData` only READS from it
        // (it never mutates the source). `_frame.rgba` is never mutated in place
        // — `setFrame` replaces the whole `_frame` object wholesale — so the
        // transient alias here is safe. Removing the copy drops a redundant
        // 663552-byte allocation on every paint() of the same frame.
        const imageData = new ImageData(this._frame.rgba, this._frame.w, this._frame.h);
        ctx.putImageData(imageData, 0, 0);
      }
    }
    // MUST be the last line — do NOT double-guard isDirty() here.
    this._dirty = false;
  }

  /**
   * Returns `true` when the layer has un-flushed state changes since the last
   * `paint()` call.
   *
   * `true` at construction + after each `setFrame`. `false` after `paint()`.
   * The `CanvasCompositor` polls this before calling `paint()`.
   */
  isDirty(): boolean {
    return this._dirty;
  }

  /**
   * No-op draw — the compositor drives `paint()` directly.
   *
   * Canvas layers do not push to the bridge here — the `CanvasCompositor`
   * assembles all layers and `LayerManager._compositeAndPush` pushes the result.
   *
   * @returns A resolved `Promise<void>`.
   */
  draw(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Report container footprint.
   *
   * Canvas layers return `{image:0, text:0}` — the fixed 5-container page
   * schema is declared once at page creation (ADR-0013 Amendment 1, locked
   * decision #3). `LayerManager._assertContainerBudget` validates this via
   * `isCanvasLayer()`.
   */
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 0 };
  }

  /**
   * Tear down the layer.
   *
   * No subscriptions, timers, or workers to release — this is a passive
   * receiver. The `_frame` ImageData is GC-eligible after `destroy()` returns
   * (the outer `CanvasCompositor` no longer holds the layer canvas reference).
   *
   * Idempotent — safe to call multiple times.
   */
  destroy(): void {
    // No-op: no subscriptions, no workers, no timers.
    // _ctx and _frame are GC-eligible once the LayerManager drops its reference.
  }
}
