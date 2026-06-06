/**
 * CanvasStatusHudLayer — always-visible z=1 Status HUD layer (canvas path).
 *
 * The canvas-mode replacement for the glyph `StatusHudLayer`. Implements
 * `CanvasLayer` at `ZIndex.Z1_STATUS_HUD`. Core contract:
 *
 *   1. Subscribes to `character.delta` WS events; validates every payload via
 *      `CharacterSnapshotSchema.safeParse` (T-20-01 mitigation). Malformed
 *      payloads are logged and dropped — the layer does NOT become dirty.
 *   2. **Chrome pre-bake (RFONT-02 / SC2):** `attachCanvas()` fires-and-forgets
 *      an async init (`_initAsync`) that loads VT323 via `ensureVt323Loaded()`
 *      and then tries to pre-bake the static chrome (frames, labels, tab strip,
 *      backgrounds) into an `ImageBitmap` via `createImageBitmap`. In happy-dom
 *      (and iOS 16 WKWebView workers that lack `createImageBitmap`), `_chromeBitmap`
 *      stays `null`; subsequent `paint()` calls fall back to drawing chrome inline.
 *   3. **Dirty-gate (RFONT-03 / SC3):** `isDirty()` returns `true` at construction
 *      and after every valid `character.delta`. `paint()` resets `_dirty = false`
 *      as its LAST statement. The `CanvasCompositor` skips `paint()` for clean
 *      layers — idle frames cost nothing.
 *   4. `getContainerCount()` returns `{image:0, text:0}` — canvas mode uses a fixed
 *      5-container page schema (ADR-0013 Amendment 1, locked decision #3).
 *
 * # Async init lifecycle
 *
 * `attachCanvas()` is synchronous (preserving the `CanvasLayer` interface). The
 * async work (font load + chrome pre-bake) is fired and stored in
 * `_chromePrebakePromise`. On every `paint()` call, if `_chromeBitmap` is still
 * `null`, chrome is drawn inline (once per dirty cycle). Once the pre-bake
 * completes and `_chromeBitmap` is non-null, subsequent `paint()` calls GPU-blit
 * the cached bitmap instead. This guarantees correctness in both environments:
 * first-paint fallback in happy-dom tests, and optimal GPU-blit in production.
 *
 * # Threat mitigations
 *
 * - T-20-01 (Tampering): `CharacterSnapshotSchema.safeParse` gate in `_onDelta`.
 *   Malformed payloads: `console.warn('[EVF]')` + return without dirtying.
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1 — canvas compositor)
 * @see packages/g2-app/src/engine/layer-types.ts (CanvasLayer interface)
 * @see packages/g2-app/src/engine/canvas-compositor.ts (compositor that drives paint())
 * @see packages/g2-app/src/status-hud/vt323-font-loader.ts (VT323 font loader)
 * @see packages/g2-app/src/status-hud/status-hud-layer.ts (glyph analog — character.delta pattern)
 * @see .planning/phases/EVF-20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline/20-PATTERNS.md
 *   (§canvas-status-hud-layer.ts: class skeleton, _initAsync, paint dirty-gate, _onDelta)
 */

import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer } from '../engine/layer-types.js';
import type { CharacterDeltaEvents } from './status-hud-layer.js';
import { ensureVt323Loaded } from './vt323-font-loader.js';

/** The WS delta channel that carries `CharacterSnapshot` payloads. */
const CHARACTER_DELTA_CHANNEL = 'character.delta';

// ── Constructor options ────────────────────────────────────────────────────────

/**
 * Constructor options for `CanvasStatusHudLayer`.
 *
 * Intentionally minimal — the canvas layer does not need a `bridge` ref
 * (all output goes to the shared `CanvasCompositor`).
 */
export interface CanvasStatusHudLayerOpts {
  /** WS event bus — must expose `character.delta`. */
  readonly wsEvents: CharacterDeltaEvents;
}

// ── Implementation ─────────────────────────────────────────────────────────────

/**
 * Always-visible z=1 Status HUD layer — canvas path.
 *
 * Constructs once per app boot; the `LayerManager` calls `attachCanvas()` at
 * mount time and `paint()` via `CanvasCompositor.composite()` on dirty cycles.
 * `destroy()` releases the WS subscription and closes the `ImageBitmap` cache.
 */
export class CanvasStatusHudLayer implements CanvasLayer {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'canvas-status-hud';

  /** 2D rendering context provided via `attachCanvas` — null until mounted. */
  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

  /**
   * CSS font string resolved by `ensureVt323Loaded()`.
   *
   * Defaults to `'16px monospace'` (the safe fallback) until `_initAsync` settles.
   * Updated in-place when the async init completes.
   */
  private _fontFamily = '16px monospace';

  /**
   * Pre-baked chrome `ImageBitmap` — null until `_prebakeChrome()` succeeds.
   *
   * In environments that lack `createImageBitmap` (happy-dom, some iOS WKWebView
   * Worker contexts), this stays `null` and `paint()` falls back to `_drawChrome`
   * inline (SC2 fallback path).
   */
  private _chromeBitmap: ImageBitmap | null = null;

  /**
   * Fire-and-forget Promise returned by `_initAsync`.
   *
   * Stored so callers can await it in tests or via `LayerManager.bundle()`.
   * `null` until `attachCanvas()` is called.
   */
  private _chromePrebakePromise: Promise<void> | null = null;

  /** Latest valid `CharacterSnapshot` received via `character.delta`. */
  private _snapshot: CharacterSnapshot | null = null;

  /**
   * Dirty flag — `true` at construction so the first composite always paints.
   *
   * Set to `false` at the LAST LINE of `paint()`. Set to `true` on every valid
   * `character.delta`. The `CanvasCompositor` skips `paint()` when this is `false`
   * (dirty-skip optimisation — SC3 / RFONT-03).
   *
   * NEVER check this inside `paint()` — the compositor is responsible for calling
   * `isDirty()` before dispatching `paint()`. Double-guarding here would prevent
   * the compositor pattern from working correctly.
   */
  private _dirty = true;

  /** Unsubscribe closure returned by `wsEvents.subscribe`. */
  private readonly _unsubscribe: () => void;

  // ── Constructor ───────────────────────────────────────────────────────────

  /**
   * Create a new `CanvasStatusHudLayer`.
   *
   * Subscribes to `character.delta` immediately. Call `attachCanvas()` to
   * provide the rendering surface before the first `paint()` call.
   *
   * @param opts Constructor options — must provide `wsEvents`.
   */
  constructor(opts: CanvasStatusHudLayerOpts) {
    // Subscribe to character.delta (T-20-01: all payloads go through safeParse gate).
    this._unsubscribe = opts.wsEvents.subscribe(CHARACTER_DELTA_CHANNEL, (raw) =>
      this._onDelta(raw),
    );
  }

  // ── CanvasLayer interface ─────────────────────────────────────────────────

  /**
   * Assign the OffscreenCanvas (or HTMLCanvasElement fallback) and start the
   * async initialisation (VT323 font load + chrome ImageBitmap pre-bake).
   *
   * Returns a `Promise<void>` per the widened `CanvasLayer.attachCanvas` signature
   * (ADR-0013 Amendment 1, Q1 resolution — 20-01). The caller (LayerManager.bundle)
   * MUST await this Promise to guarantee font resolution before the first frame.
   *
   * Null-context degradation: when `getContext('2d')` returns `null` (test
   * environment — happy-dom has no canvas 2D implementation), the method logs a
   * warning and returns without initialising `_ctx`. Subsequent `paint()` calls
   * return early via the existing `if (ctx === null) return` null-guard. This
   * mirrors the `CanvasCompositor.composite()` null-guard pattern (Rule 2 fix,
   * plan 20-05) — integration tests that boot through `_bootEngineCore` survive
   * the canvas-mode boot path without requiring a real 2D context.
   *
   * @param canvas The OffscreenCanvas or HTMLCanvasElement this layer paints on.
   */
  async attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (ctx === null) {
      // Degrade gracefully in test environments (happy-dom returns null for
      // getContext('2d')). paint() already null-guards _ctx, so no further
      // initialisation is needed — the layer becomes a no-op renderer.
      console.warn(
        '[EVF] CanvasStatusHudLayer.attachCanvas: getContext("2d") returned null ' +
          '— running in degraded mode (no canvas 2D context; paint() is a no-op).',
      );
      return;
    }
    this._ctx = ctx;
    // Fire and store the async init — returns synchronously so LayerManager can
    // also await it if needed.
    this._chromePrebakePromise = this._initAsync();
    await this._chromePrebakePromise;
    // Mark dirty after attach so the first composite always paints.
    this._dirty = true;
  }

  /**
   * Repaint the layer's canvas from current cached state.
   *
   * Blits the pre-baked chrome bitmap (GPU-accelerated) if available; otherwise
   * draws chrome inline (happy-dom fallback or first frame before pre-bake settles).
   * Then draws dynamic HUD data on top. Resets `_dirty = false` as the LAST line.
   *
   * Called by `CanvasCompositor` ONLY when `isDirty()` returns `true`.
   * The compositor must NOT call this on clean layers (dirty-skip — SC3).
   */
  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) {
      return;
    }
    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
    if (this._chromeBitmap !== null) {
      // GPU-blit pre-baked chrome (RFONT-02 / SC2 fast path).
      ctx.drawImage(this._chromeBitmap, 0, 0);
    } else {
      // Fallback: draw chrome inline (happy-dom / pre-bake not yet settled).
      _drawChrome(ctx, this._fontFamily);
    }
    _drawDynamic(ctx, this._snapshot, this._fontFamily);
    // MUST be the last line — do NOT double-guard isDirty() here.
    this._dirty = false;
  }

  /**
   * Returns `true` when the layer has un-flushed state changes since the last
   * `paint()` call.
   *
   * `true` at construction + after each valid `character.delta`. `false` after
   * `paint()`. The `CanvasCompositor` polls this before calling `paint()`.
   */
  isDirty(): boolean {
    return this._dirty;
  }

  /**
   * No-op draw — the compositor drives `paint()` directly.
   *
   * `draw()` is part of the base `Layer` interface for the glyph path (bridge push).
   * Canvas layers do not push to the bridge here — the `CanvasCompositor` assembles
   * all layers and `LayerManager._compositeAndPush` pushes the result.
   *
   * @returns A resolved `Promise<void>`.
   */
  draw(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Report container footprint.
   *
   * Canvas layers return `{image:0, text:0}` — the fixed 5-container page schema
   * is declared once at page creation (ADR-0013 Amendment 1, locked decision #3).
   * `LayerManager._assertContainerBudget` validates this via `isCanvasLayer()`.
   */
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 0 };
  }

  /**
   * Capture-container provider for canvas mode.
   *
   * Returns `'hud-capture'` — the full-screen text container (576×288,
   * `isEventCapture:1`) declared in the HUD raster page schema
   * (`buildHudRasterPageSchema()`). This satisfies the LayerManager
   * capture-invariant (exactly one mounted layer provides a capture container)
   * when operating in canvas mode with no glyph `MapBaseLayer` mounted.
   *
   * Note: in canvas mode the `'hud-capture'` container routes R1 gestures
   * (INV-5). In glyph mode `MapBaseLayer` provides `'map-capture'` instead;
   * the two serve distinct page schemas with different geometry.
   *
   * @see packages/g2-app/src/engine/container-registry.ts ('hud-capture' entry, id=4)
   * @see packages/g2-app/src/engine/layer-manager.ts (_assertCaptureInvariant)
   */
  getCaptureContainer(): string {
    return 'hud-capture';
  }

  /**
   * Tear down the layer.
   *
   * - Unsubscribes from `character.delta`.
   * - Closes and nulls the `ImageBitmap` cache to release GPU memory.
   *
   * Idempotent — safe to call multiple times.
   */
  destroy(): void {
    this._unsubscribe();
    if (this._chromeBitmap !== null) {
      this._chromeBitmap.close();
      this._chromeBitmap = null;
    }
  }

  // ── Test-only accessors ───────────────────────────────────────────────────

  /**
   * Return the resolved CSS font-family string (test-only).
   *
   * Exposes the internal `_fontFamily` field so SC1-style assertions can verify
   * the happy-dom fallback path returns `'16px monospace'` after `attachCanvas`.
   *
   * Production code MUST NOT gate behaviour on this getter.
   *
   * @returns `'16px VT323'` on successful load; `'16px monospace'` on fallback.
   */
  getFontFamily(): string {
    return this._fontFamily;
  }

  // ── Private — async init ──────────────────────────────────────────────────

  /**
   * Async initialisation sequence run once by `attachCanvas`.
   *
   * 1. Load VT323 font (with `monospace` fallback via `ensureVt323Loaded`).
   * 2. Try to pre-bake static chrome into an `ImageBitmap`.
   *
   * Errors from step 2 (e.g., `createImageBitmap` absent in happy-dom) are caught
   * and logged — the layer continues without a pre-baked bitmap, falling back to
   * inline chrome rendering in `paint()`.
   */
  private async _initAsync(): Promise<void> {
    this._fontFamily = await ensureVt323Loaded();
    await this._prebakeChrome();
  }

  /**
   * Draw static chrome onto a scratch `OffscreenCanvas` and cache as `ImageBitmap`.
   *
   * On success: `_chromeBitmap` is set; subsequent `paint()` calls GPU-blit it.
   * On failure (e.g., `createImageBitmap` or `OffscreenCanvas` absent in happy-dom):
   * logs a debug message and leaves `_chromeBitmap = null`. `paint()` falls back to
   * `_drawChrome` inline (SC2 fallback path).
   */
  private async _prebakeChrome(): Promise<void> {
    try {
      const scratch = new OffscreenCanvas(COMPOSITOR_W, COMPOSITOR_H);
      const sCtx = scratch.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      if (sCtx === null) {
        console.warn(
          '[EVF] CanvasStatusHudLayer._prebakeChrome: scratch getContext("2d") returned null — skipping pre-bake',
        );
        return;
      }
      _drawChrome(sCtx, this._fontFamily);
      this._chromeBitmap = await createImageBitmap(scratch);
    } catch {
      // createImageBitmap absent (happy-dom) or OffscreenCanvas unavailable.
      // _chromeBitmap stays null; paint() draws chrome inline as fallback.
      // Silent — this is a normal environment-detection path, not an error.
    }
  }

  // ── Private — delta handler ───────────────────────────────────────────────

  /**
   * Receive a raw WS payload and validate via `CharacterSnapshotSchema`.
   *
   * T-20-01 mitigation: `safeParse` gate before caching. On failure: `console.warn`
   * with `[EVF]` prefix + return without touching `_dirty`. On success: cache the
   * snapshot and set `_dirty = true` so the next composite re-paints.
   *
   * @param raw Untrusted WS payload.
   */
  private _onDelta(raw: unknown): void {
    const parsed = CharacterSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn('[EVF] canvas-status-hud-layer: malformed character.delta payload — ignoring.');
      return;
    }
    this._snapshot = parsed.data;
    this._dirty = true;
  }
}

// ── Module-level pure helpers ──────────────────────────────────────────────────
// These are separated from the class so SC2 tests can spy on ctx draw calls
// without needing to reach into private class internals.

/**
 * Draw the static HUD chrome onto `ctx`.
 *
 * "Chrome" = everything that does NOT change with character state: outer frame,
 * section dividers, tab strip backgrounds, and static labels. Called:
 *   - During `_prebakeChrome()` onto a scratch OffscreenCanvas (production path).
 *   - Inline from `paint()` when `_chromeBitmap` is null (happy-dom fallback).
 *
 * The implementation is intentionally minimal for Phase 20 — it draws the outer
 * frame rectangle and a tab-strip separator. Future phases will enrich this
 * (detailed borders, section labels, background fills).
 *
 * @param ctx   The 2D rendering context to draw on.
 * @param fontFamily CSS font string resolved by `ensureVt323Loaded`.
 */
function _drawChrome(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  fontFamily: string,
): void {
  // Outer border — phosphor green on black (VFD / CRT aesthetic).
  ctx.strokeRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
  // Tab-strip separator line (divides HP/AC header from body).
  const TAB_H = 24;
  ctx.fillRect(0, TAB_H, COMPOSITOR_W, 1);
  // Section label region placeholder — font needed even for chrome labels.
  ctx.font = fontFamily;
}

/**
 * Draw dynamic HUD data (HP, slots, turns, conditions) over the chrome.
 *
 * Called from `paint()` on every dirty cycle. Renders the `snapshot` values
 * in the VT323 pixel font. If `snapshot` is `null` (no delta received yet),
 * renders an idle placeholder.
 *
 * The implementation is intentionally minimal for Phase 20 — it renders a
 * single HP line. Future phases (21/23) will enrich with slots, turns, and
 * conditions panels.
 *
 * @param ctx       The 2D rendering context to draw on.
 * @param snapshot  Latest `CharacterSnapshot` or `null` if not yet received.
 * @param fontFamily CSS font string resolved by `ensureVt323Loaded`.
 */
function _drawDynamic(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  snapshot: CharacterSnapshot | null,
  fontFamily: string,
): void {
  ctx.font = fontFamily;
  if (snapshot === null) {
    ctx.fillText('PF — / —', 4, 18);
    return;
  }
  // HP line — e.g. "PF 36/52"
  const hpText = `PF ${snapshot.hp}/${snapshot.maxHp}`;
  ctx.fillText(hpText, 4, 18);
  // AC line — e.g. "CA 16"
  ctx.fillText(`CA ${snapshot.ac}`, 60, 18);
  // Level line — e.g. "LV 7"
  ctx.fillText(`LV ${snapshot.level}`, 100, 18);
}
