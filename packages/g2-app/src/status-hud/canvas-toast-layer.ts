/**
 * CanvasToastLayer — transient toast messages drawn ON the canvas (canvas path).
 *
 * The canvas-mode replacement for the glyph `ToastQueueLayer`. The glyph layer
 * renders via `bridge.textContainerUpgrade` (a TEXT container, `{image:0,text:1}`),
 * which is incompatible with the canvas image-tile page: upgrading a text
 * container while image tiles are mounted corrupts the next `updateImageRawData`
 * push (`sendFailed`) and blanks the display until restart (the
 * `TODO(ADR-0013): canvas toast overlay layer` documented in boot-engine-core).
 *
 * This layer instead implements `CanvasLayer` at `ZIndex.Z1_5_TOAST` and draws a
 * translucent bottom strip with the toast text directly onto its OffscreenCanvas,
 * so it composites cleanly with the map (z=0) + status HUD (z=1) image tiles.
 *
 * Contract (mirrors `CanvasStatusHudLayer`):
 *   1. `enqueue(toast)` — same minimal sink interface as `ToastQueueLayer.enqueue`,
 *      so every existing dispatcher (reaction / action-result / concentration /
 *      Quick-Action [M]/[A]) routes here unchanged in canvas mode.
 *   2. Single visible toast at a time + FIFO `_buffer` for the rest; each visible
 *      toast dwells `TOAST_DWELL_MS` (3 s) then the next is promoted (or the strip
 *      clears). `TOAST_BUFFER_SOFT_CAP` bounds the buffer (DoS mitigation).
 *   3. `attachCanvas()` async-loads VT323 via `ensureVt323Loaded()`.
 *   4. `paint()` clears the canvas, draws the strip when a toast is visible, and
 *      resets `_dirty = false` as its LAST statement. On enqueue AND on dwell-out
 *      it calls `onDirty` (= `hudDeltaDriver.requestCycle`) so the compositor
 *      recomposites + pushes the changed tiles.
 *   5. `getContainerCount()` returns `{image:0, text:0}` — a canvas layer, NOT a
 *      capture provider (the status HUD remains the sole `hud-capture` owner).
 *
 * @see packages/g2-app/src/status-hud/toast-queue-layer.ts (glyph analog — text container)
 * @see packages/g2-app/src/status-hud/canvas-status-hud-layer.ts (canvas layer pattern mirrored here)
 * @see packages/g2-app/src/status-hud/toast-types.ts (Toast schema + dwell/cap constants)
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1 — canvas compositor)
 */

import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer } from '../engine/layer-types.js';
import {
  SEVERITY_PREFIX,
  TOAST_BUFFER_SOFT_CAP,
  TOAST_DWELL_MS,
  type Toast,
  ToastSchema,
} from './toast-types.js';
import { ensureVt323Loaded } from './vt323-font-loader.js';

// ── Strip geometry + style (mirrors the status-card visual language) ─────────────

/** Toast strip height in px. */
const STRIP_H = 26;
/** Strip top edge — anchored to the bottom of the 576×288 canvas. */
const STRIP_Y = COMPOSITOR_H - STRIP_H;
/** Left padding before the text. */
const STRIP_PAD = 8;
/** Text baseline offset from the strip bottom. */
const STRIP_BASELINE = STRIP_H - 8;
/** Translucent backdrop (matches the corner card's `rgba(0,0,0,0.55)` family, a touch darker for legibility over the map). */
const STRIP_BG = 'rgba(0, 0, 0, 0.7)';
/** Foreground (white → bright phosphor green on the G2 4-bit display, same as the status card). */
const STRIP_FG = '#ffffff';

// ── Constructor options ──────────────────────────────────────────────────────────

/** Constructor options for {@link CanvasToastLayer}. */
export interface CanvasToastLayerOpts {
  /**
   * Repaint trigger — typically `hudDeltaDriver.requestCycle()`. Called on every
   * toast enqueue AND on dwell-out so the debounced delta loop composites and
   * pushes the changed tiles (the strip appearing / clearing). Optional so tests
   * can construct the layer without a driver.
   */
  readonly onDirty?: () => void;
}

// ── Implementation ─────────────────────────────────────────────────────────────

/**
 * Transient toast layer — canvas path (z=1.5, between Status HUD and overlay).
 */
export class CanvasToastLayer implements CanvasLayer {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'canvas-toast';

  /** 2D context provided via `attachCanvas` — null until mounted (or in degraded test env). */
  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

  /** CSS font string resolved by `ensureVt323Loaded()`; safe monospace fallback until init settles. */
  private _fontFamily = '16px monospace';

  /** Fire-and-forget font-load Promise (awaited by `LayerManager.bundle()`). */
  private _fontPromise: Promise<void> | null = null;

  /** Currently visible toast, or null when the strip is empty. */
  private _current: Toast | null = null;

  /** FIFO buffer of pending toasts behind the visible one. */
  private readonly _buffer: Toast[] = [];

  /** Dwell timer for the visible toast — cleared on dwell-out / destroy. */
  private _timer: ReturnType<typeof setTimeout> | null = null;

  /** Dirty flag — true at construction so the first composite paints. Reset at the end of `paint()`. */
  private _dirty = true;

  /** Repaint trigger (see {@link CanvasToastLayerOpts.onDirty}). */
  private readonly _onDirty: (() => void) | undefined;

  constructor(opts: CanvasToastLayerOpts = {}) {
    this._onDirty = opts.onDirty;
  }

  // ── Toast sink (same shape as ToastQueueLayer.enqueue) ───────────────────────

  /**
   * Enqueue a toast. Validates via `ToastSchema` (trust boundary); a malformed
   * payload is dropped with a telemetry warning. If no toast is visible it is
   * shown immediately, otherwise it is buffered (bounded by `TOAST_BUFFER_SOFT_CAP`).
   */
  enqueue(toast: Toast): void {
    const parsed = ToastSchema.safeParse(toast);
    if (!parsed.success) {
      console.warn('[EVF] CanvasToastLayer.enqueue: malformed toast payload — ignoring.');
      return;
    }
    const t = parsed.data;
    if (this._current === null) {
      this._activate(t);
      return;
    }
    if (this._buffer.length >= TOAST_BUFFER_SOFT_CAP) {
      this._buffer.shift();
      console.warn('[EVF] CanvasToastLayer: buffer soft cap reached — dropping oldest toast.');
    }
    this._buffer.push(t);
  }

  /** Promote a toast to visible, mark dirty, request a recompose, arm the dwell timer. */
  private _activate(t: Toast): void {
    this._current = t;
    this._dirty = true;
    this._onDirty?.();
    if (this._timer !== null) {
      clearTimeout(this._timer);
    }
    this._timer = setTimeout(() => this._expire(), TOAST_DWELL_MS);
  }

  /** Dwell-out: promote the next buffered toast, or clear the strip. */
  private _expire(): void {
    this._timer = null;
    const next = this._buffer.shift();
    if (next !== undefined) {
      this._activate(next);
      return;
    }
    this._current = null;
    this._dirty = true; // repaint to erase the strip
    this._onDirty?.();
  }

  // ── CanvasLayer interface ────────────────────────────────────────────────────

  async attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (ctx === null) {
      // happy-dom / no-2D-context test env — paint() null-guards, so no-op renderer.
      console.warn(
        '[EVF] CanvasToastLayer.attachCanvas: getContext("2d") returned null — ' +
          'running in degraded mode (paint() is a no-op).',
      );
      return;
    }
    this._ctx = ctx;
    this._fontPromise = this._initAsync();
    await this._fontPromise;
    this._dirty = true;
  }

  /** Load the VT323 pixel font (monospace fallback on failure). */
  private async _initAsync(): Promise<void> {
    this._fontFamily = await ensureVt323Loaded();
  }

  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) {
      return;
    }
    // Transparent everywhere except the strip → the compositor blits the map +
    // status HUD through untouched, the strip overlays the bottom band.
    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
    const t = this._current;
    if (t !== null) {
      ctx.fillStyle = STRIP_BG;
      ctx.fillRect(0, STRIP_Y, COMPOSITOR_W, STRIP_H);
      ctx.strokeStyle = STRIP_FG;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, STRIP_Y + 0.5, COMPOSITOR_W - 1, STRIP_H - 1);
      ctx.fillStyle = STRIP_FG;
      ctx.font = this._fontFamily;
      ctx.fillText(
        `${SEVERITY_PREFIX[t.severity]}${t.message}`,
        STRIP_PAD,
        STRIP_Y + STRIP_BASELINE,
      );
    }
    // MUST be the last statement — the compositor owns the isDirty() gate.
    this._dirty = false;
  }

  isDirty(): boolean {
    return this._dirty;
  }

  /** Base `Layer` no-op — the CanvasCompositor drives `paint()`; nothing pushes to the bridge here. */
  draw(): Promise<void> {
    return Promise.resolve();
  }

  /** Canvas layer → zero container footprint (fixed canvas page schema, ADR-0013 Amendment 1). */
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 0 };
  }

  /** Release the dwell timer + queues so no `setTimeout` survives the layer. */
  destroy(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._current = null;
    this._buffer.length = 0;
  }

  /** Test-only: the resolved CSS font string ('16px VT323' or '16px monospace'). */
  getFontFamilyForTest(): string {
    return this._fontFamily;
  }

  /** Test-only: the currently visible toast (or null). */
  getVisibleForTest(): Toast | null {
    return this._current;
  }
}
