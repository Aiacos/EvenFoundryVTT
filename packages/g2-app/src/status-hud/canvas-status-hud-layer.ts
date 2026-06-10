/**
 * CanvasStatusHudLayer — always-visible z=1 Status HUD layer (canvas path).
 *
 * The canvas-mode replacement for the glyph `StatusHudLayer`. Implements
 * `CanvasLayer` at `ZIndex.Z1_STATUS_HUD`. Core contract:
 *
 *   1. Subscribes to `character.delta` WS events; validates every payload via
 *      `CharacterSnapshotSchema.safeParse` (T-20-01 mitigation). Malformed
 *      payloads are logged and dropped — the layer does NOT become dirty.
 *   2. **Corner card (layout B, 2026-06-10):** `paint()` draws a small
 *      translucent card in the TOP-RIGHT corner (fps line when the indicator is
 *      enabled, then PF/CA/LV) over the full-screen 576×288 map. No full-frame
 *      chrome, no strip — the map owns the screen. `attachCanvas()` async-loads
 *      VT323 via `ensureVt323Loaded()` for crisp card text.
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
 * async font load is fired and stored in `_chromePrebakePromise` so callers
 * (LayerManager.bundle STEP 2.5) can await it before the first composite.
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
 */
export interface CanvasStatusHudLayerOpts {
  /** WS event bus — must expose `character.delta`. */
  readonly wsEvents: CharacterDeltaEvents;
  /**
   * Optional repaint trigger (typically `hudDeltaDriver.requestCycle()`).
   *
   * Called whenever the corner-card CONTENT changes outside a WS delta (the
   * 1 Hz fps ticker, the [F] toggle) so the debounced delta loop composites
   * and pushes the changed tiles. WS `character.delta` events do not need it —
   * the driver already subscribes to that channel.
   */
  readonly onDirty?: () => void;

  /**
   * Optional FPS supplier (typically `hudDeltaDriver.getFps()`).
   *
   * When provided AND the indicator is enabled (default ON, toggled via
   * `setFpsIndicatorEnabled` — Quick Action menu `[F] FPS`), a 1 Hz ticker
   * appends a small right-aligned `NNfps` field to the `hud-status` native
   * text row. The ticker pushes a `textContainerUpgrade` ONLY when the
   * composed line actually changed (zero-push-on-idle for text).
   */
  readonly getFps?: () => number;
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

  /**
   * Optional bridge reference for pushing status to the native `hud-status` container.
   *
   * `undefined` in test environments that don't inject a bridge. In production, wired
   * via `CanvasStatusHudLayerOpts.bridge` from `boot-engine-core`.
   */
  private readonly _onDirty: (() => void) | undefined;

  /** Optional FPS supplier (see {@link CanvasStatusHudLayerOpts.getFps}). */
  private readonly _getFps: (() => number) | undefined;

  /** FPS indicator enabled flag — default ON (user decision 2026-06-10). */
  private _fpsEnabled = true;

  /** 1 Hz FPS ticker handle — started in `attachCanvas`, cleared in `destroy`. */
  private _fpsTimer: ReturnType<typeof setInterval> | null = null;

  /** Last composed corner-card content — dedupe gate (zero-repaint-on-idle). */
  private _lastCardKey = '';

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
    this._onDirty = opts.onDirty;
    this._getFps = opts.getFps;
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

    // FPS ticker (1 Hz) — refreshes the right-aligned fps field on the
    // corner card. Repaint is dedupe-gated inside _refreshCard, so an idle
    // HUD (fps value unchanged) produces ZERO text pushes. Started here (mount
    // time) rather than in the constructor so unit tests that never attach a
    // canvas get no timer side-effects. Cleared in destroy().
    if (this._getFps !== undefined && this._fpsTimer === null) {
      this._fpsTimer = setInterval(() => {
        this._refreshCard();
      }, 1000);
    }
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
    _drawCornerCard(ctx, this._composeCardLines(), this._fontFamily);
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
    if (this._fpsTimer !== null) {
      clearInterval(this._fpsTimer);
      this._fpsTimer = null;
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
  }

  // ── Private — delta handler ───────────────────────────────────────────────

  /**
   * Receive a raw WS payload and validate via `CharacterSnapshotSchema`.
   *
   * T-20-01 mitigation: `safeParse` gate before caching. On failure: `console.warn`
   * with `[EVF]` prefix + return without touching `_dirty`. On success: cache the
   * snapshot, set `_dirty = true`, and (if a bridge is wired) push a status line to
   * the native `hud-status` text container via `bridge.textContainerUpgrade`.
   *
   * The bridge push is fire-and-forget (best-effort, await-guarded try/catch) — a
   * rejected promise logs a warning and does NOT crash the WS handler.
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

    // Update the native hud-status card (dedupe-gated push).
    this._refreshCard();
  }

  /**
   * Enable/disable the small FPS field at the right end of the hud-status row.
   *
   * Default ON. Wired to the Quick Action menu `[F] FPS` toggle in
   * boot-engine-core (persisted in the Even Hub kv store — never localStorage).
   * Takes effect on the next composite (immediate `_refreshCard()` call).
   *
   * @param enabled `true` to show the FPS field, `false` to hide it.
   */
  setFpsIndicatorEnabled(enabled: boolean): void {
    this._fpsEnabled = enabled;
    this._refreshCard();
  }

  /**
   * Compose the hud-status right-column card (fps line when enabled + PF/CA/LV
   * lines from the latest snapshot) and push it via `textContainerUpgrade` —
   * ONLY when the composed content differs from the last pushed one (text
   * zero-push-on-idle).
   *
   * Best-effort: fire-and-forget; rejected promise is caught and logged.
   */
  private _refreshCard(): void {
    const lines = this._composeCardLines();
    const key = lines.join('\n');
    if (key === this._lastCardKey) {
      return;
    }
    this._lastCardKey = key;
    this._dirty = true;
    // Outside-WS triggers (fps ticker, [F] toggle) need an explicit cycle kick;
    // character.delta events already schedule one via the driver subscription.
    this._onDirty?.();
  }

  /**
   * Compose the corner-card lines: fps first (when the indicator is enabled
   * and a supplier is wired), then PF/CA/LV from the latest snapshot.
   * Empty array = no card painted (boot state with indicator off).
   */
  private _composeCardLines(): string[] {
    const lines: string[] = [];
    if (this._fpsEnabled && this._getFps !== undefined) {
      const fps = Math.min(99, Math.round(this._getFps()));
      lines.push(`${String(fps)}fps`);
    }
    if (this._snapshot !== null) {
      const snap = this._snapshot;
      lines.push(`PF ${snap.hp}/${snap.maxHp}`, `CA ${snap.ac}`, `LV ${snap.level}`);
    }
    return lines;
  }
}

// ── Module-level pure helpers ──────────────────────────────────────────────────
// These are separated from the class so SC2 tests can spy on ctx draw calls
// without needing to reach into private class internals.

/** Background color — black fill (dithered to darkest palette step on G2). */
/** Corner-card geometry (layout B): top-right plate over the full-screen map. */
const CARD_W = 132;
const CARD_MARGIN = 6;
const CARD_PAD = 6;
const CARD_LINE_H = 18;

/** Translucent card plate — dark veil, map remains visible underneath. */
const CARD_BG = 'rgba(0, 0, 0, 0.55)';

/** Foreground color — white lines/text (quantized to brightest palette step on G2). */
const CHROME_FG = '#ffffff';

/**
 * Draw the top-right corner card: fps line first (when present), then the
 * PF/CA/LV status lines, on a translucent dark plate so the text reads over
 * the full-screen map raster without hiding it (layout B, 2026-06-10).
 *
 * Exported for direct unit testing (SC2 idiom — tests spy on ctx calls).
 *
 * @param ctx        The 2D rendering context to draw on.
 * @param lines      Card lines (already composed; empty array = no card).
 * @param fontFamily CSS font string resolved by `ensureVt323Loaded`.
 */
export function _drawCornerCard(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  lines: ReadonlyArray<string>,
  fontFamily: string,
): void {
  if (lines.length === 0) {
    return;
  }
  const w = CARD_W;
  const h = CARD_PAD * 2 + lines.length * CARD_LINE_H;
  const x = COMPOSITOR_W - w - CARD_MARGIN;
  const y = CARD_MARGIN;
  // Translucent plate — dithers to a dark veil, keeps the map readable below.
  ctx.fillStyle = CARD_BG;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = CHROME_FG;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = CHROME_FG;
  ctx.font = fontFamily;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? '', x + CARD_PAD, y + CARD_PAD + (i + 1) * CARD_LINE_H - 4);
  }
}
