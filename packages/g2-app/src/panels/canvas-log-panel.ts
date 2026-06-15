/**
 * CanvasLogPanel — z=2 canvas overlay panel for the Foundry chat-log tail (read-only).
 *
 * Dual-interface class implementing BOTH:
 *   - `CanvasLayer` (`attachCanvas` / `paint` / `isDirty`) — canvas compositor path
 *   - `OverlayPanel` (`onMount` / `onUnmount` / `onEvent`) — panel-router lifecycle
 *
 * This is the canvas-mode counterpart of the glyph `LogPanel`. Both expose a
 * distinct `static meta.id` (`'canvas-log'` vs `'log'`); boot-engine-core selects
 * the correct one based on `layerManager.getRenderMode()` (Pitfall 2 from
 * 21-RESEARCH.md — boot-time conditional dispatch, not glob sort order).
 *
 * # Why this panel exists
 *
 * In canvas mode `LayerManager._assertContainerBudget` requires every mounted layer
 * to declare `{image:0,text:0}` (ADR-0013 Amendment 1, locked decision #3). The glyph
 * `LogPanel` declares `{image:0,text:1}` (one `overlay-block` text container), so
 * mounting it in canvas mode throws `panel_mount_budget_exceeded`. This panel paints
 * the same log rows onto the shared compositor canvas instead of allocating an SDK
 * text container, satisfying the canvas budget while keeping the glyph `LogPanel`
 * intact for the BLE/glyph fallback path.
 *
 * # Approach A — glyph strings to ctx.fillText (mirrors CanvasCombatTrackerPanel)
 *
 * This panel reuses the glyph panel's tested business logic by importing and calling
 * `renderLogContent` from `log-panel.ts`, which returns 18 string rows. Each row is
 * drawn with `ctx.fillText` at a fixed line interval — the exact pattern the canvas
 * sheet uses to reuse `renderInventoryTabContent` / `renderSpellsTabContent`.
 *
 * # Chrome pre-bake (RFONT-02 / SC2 pattern)
 *
 * `attachCanvas()` fires an async init (`_initAsync`) that loads VT323 and pre-bakes
 * the static chrome (background fill + outer border) into an `ImageBitmap`. In
 * happy-dom (no `createImageBitmap`), `_chromeBitmap` stays `null` and `paint()`
 * falls back to `_drawStaticChrome` inline.
 *
 * # Dirty-gate (RFONT-03 pattern)
 *
 * `isDirty()` returns `true` at construction and after every valid log delta or
 * gesture. `paint()` resets `_dirty = false` as its LAST statement.
 *
 * # Subscription lifecycle (T-21-LEAK / Pitfall 4)
 *
 * `onMount` subscribes to the `LOG_DELTA_TYPE` channel (stored in `_unsubscribeLog`)
 * plus the gesture bus. `onUnmount` invokes and clears both — idempotent (null guards
 * prevent double-free). Subscriptions are lifecycle-tied, NOT boot-time
 * (do NOT subscribe inside `setWsEventBus`).
 *
 * # Gesture semantics (mirrors glyph LogPanel)
 *
 *   - `scroll-down` → reveal older events (`_scrollOffset += 1`, clamped); dirty
 *   - `scroll-up`   → reveal newer events (`_scrollOffset -= 1`, min 0); dirty
 *   - `tap`         → no-op (Phase 5 stub; canvas parity with glyph LogPanel)
 *   - `double-tap`  → no-op stub; router closes panel at bus level (ADR-0012)
 *
 * `isAtTopBoundary()` = `_scrollOffset === 0` — DO NOT add conditions (ADR-0012 gate).
 *
 * # Threat mitigations
 *
 *   - T-21-01 (Tampering): `LogSnapshotSchema.safeParse` gate in `_onLogDelta`.
 *   - T-21-02 (DoS scroll): `_scrollOffset` clamped to `[0, events.length - 1]`.
 *   - T-21-LEAK (DoS leak): idempotent unsubscribe in `onUnmount`.
 *
 * @see packages/g2-app/src/panels/canvas-combat-tracker-panel.ts (structural template)
 * @see packages/g2-app/src/panels/log-panel.ts (glyph panel; shared business logic)
 * @see packages/g2-app/src/engine/layer-types.ts (CanvasLayer + OverlayPanel interfaces)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { LOG_DELTA_TYPE, type LogSnapshot, LogSnapshotSchema } from '@evf/shared-protocol';
import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer, OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';
import { renderLogContent } from './log-panel.js';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Background fill color — black. */
const CHROME_BG = '#000000';

/** Foreground color — white lines/text. */
const CHROME_FG = '#ffffff';

/** Line height in pixels for log rows (matches CanvasCombatTrackerPanel). */
const ROW_LINE_HEIGHT = 16;

/** Y offset for the first content row (below chrome border). */
const CONTENT_Y_START = 16;

/** X offset for row text (inside border). */
const CONTENT_X = 2;

// ── WS event bus interface ─────────────────────────────────────────────────────

/**
 * Minimal WS event bus shape required by `CanvasLogPanel`.
 *
 * Matches the `wsEventBus.subscribe` API from `boot-engine-core.ts`. Using a
 * structural interface (not importing the concrete type) keeps this panel
 * decoupled from the boot module (Pitfall 5 from 23-RESEARCH.md).
 */
interface WsEventBusLike {
  subscribe(channel: string, fn: (payload: unknown) => void): () => void;
}

// ── CanvasLogPanel ───────────────────────────────────────────────────────────

/**
 * Canvas z=2 overlay panel implementing the read-only chat-log tail.
 *
 * Constructed by `PanelRouter.openPanel('canvas-log', deps)` in canvas mode
 * (boot-engine-core `onNavigate` gate). In glyph mode the router opens `'log'`
 * (the glyph `LogPanel`) instead.
 */
export default class CanvasLogPanel implements CanvasLayer, OverlayPanel {
  /**
   * Static metadata validated by `PanelRouter.discoverPanels` at boot.
   *
   * `id: 'canvas-log'` is DISTINCT from the glyph panel's `'log'` — boot-engine-core
   * gates which is opened on `layerManager.getRenderMode()` (Pitfall 2).
   */
  static meta: PanelMeta = {
    id: 'canvas-log',
    title: { it: 'Registro', en: 'Log', de: 'Protokoll' },
    navKey: 'L',
    requiredCaps: [],
  };

  /** Stable panel id matching `static meta.id` (LayerManager + telemetry). */
  public readonly id = 'canvas-log';

  /** Z-index slot — z=2 overlay per ADR-0009 Amendment 1. */
  public readonly z = ZIndex.Z2_OVERLAY;

  // ── Private state ─────────────────────────────────────────────────────────

  /**
   * 2D rendering context provided via `attachCanvas`.
   *
   * `null` until `attachCanvas` is called, or when `getContext('2d')` returns
   * null in happy-dom. `paint()` null-guards on this field.
   */
  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

  /**
   * Latest valid `LogSnapshot` from `_onLogDelta`.
   *
   * `null` until the first valid delta arrives. `renderLogContent` handles null
   * by rendering the empty-state message.
   */
  private _snapshot: LogSnapshot | null = null;

  /**
   * Scroll offset into the event list (oldest entries revealed by scrolling down).
   *
   * Incremented by `scroll-down`, decremented by `scroll-up`. Clamped to
   * `[0, events.length - 1]` (T-21-02 DoS guard).
   */
  private _scrollOffset = 0;

  /**
   * Dirty flag — `true` at construction so the first composite always paints.
   *
   * Set to `false` at the LAST LINE of `paint()`. Set to `true` on valid log
   * deltas and gesture events.
   *
   * NEVER check this inside `paint()` — the compositor calls `isDirty()` before
   * dispatching `paint()`. Double-guarding breaks the dirty-skip pattern.
   */
  private _dirty = true;

  /**
   * CSS font string resolved by `ensureVt323Loaded`.
   *
   * Defaults to `'16px monospace'` (safe fallback) until `_initAsync` settles.
   */
  private _fontFamily = '16px monospace';

  /**
   * Pre-baked chrome `ImageBitmap` — null until `_prebakeChrome` succeeds.
   *
   * In environments lacking `createImageBitmap` (happy-dom), stays `null` and
   * `paint()` falls back to `_drawStaticChrome` inline.
   */
  private _chromeBitmap: ImageBitmap | null = null;

  /**
   * Fire-and-forget Promise returned by `_initAsync`.
   *
   * Stored so tests can await it via `LayerManager.bundle()`.
   */
  private _chromePrebakePromise: Promise<void> | null = null;

  // ── Subscription handles ──────────────────────────────────────────────────

  /**
   * Unsubscribe closure returned by `gestureBus.subscribe`.
   *
   * Set in `onMount`; invoked and nulled in `onUnmount`. The null guard makes
   * `onUnmount` idempotent (T-21-LEAK / Pitfall 4).
   */
  private _unsubscribeGesture: (() => void) | null = null;

  /**
   * Unsubscribe closure returned by `wsEventBus.subscribe(LOG_DELTA_TYPE, ...)`.
   *
   * Set in `onMount` when `_wsEventBus` is non-null; invoked and nulled in
   * `onUnmount`. Null guard makes `onUnmount` idempotent (T-21-LEAK).
   */
  private _unsubscribeLog: (() => void) | null = null;

  /**
   * WS event bus injected before `onMount` via `setWsEventBus`.
   *
   * `null` until boot-engine-core calls `setPanelInstanceHandler` (Pitfall 5).
   * If still null at `onMount`, the log subscription is skipped silently.
   */
  private _wsEventBus: WsEventBusLike | null = null;

  // ── Constructor ───────────────────────────────────────────────────────────

  /**
   * Construct a new `CanvasLogPanel`.
   *
   * Mirrors the glyph `LogPanel` constructor signature so boot-engine-core can
   * inject it via `PanelRouter.openPanel(id, deps)` without special-casing.
   *
   * @param _bridge     EvenAppBridge instance (kept for constructor parity with the
   *                    glyph panel; not used directly — canvas output goes to the
   *                    shared compositor).
   * @param _gestureBus PanelGestureBus for R1 gesture subscription.
   * @param _locale     Active HUD locale (forwarded to `renderLogContent`).
   */
  constructor(
    _bridge: EvenAppBridge,
    private readonly _gestureBus: PanelGestureBus,
    private readonly _locale: HudLocale,
  ) {
    // _bridge is accepted for constructor parity with the glyph LogPanel so that
    // PanelRouter.openPanel can inject deps uniformly without special-casing the
    // canvas variant. Canvas output goes to the shared CanvasCompositor.
    void _bridge;
  }

  // ── Injection seams ───────────────────────────────────────────────────────

  /**
   * Inject the WS event bus dependency post-construction.
   *
   * Called by boot-engine-core via `setPanelInstanceHandler('canvas-log', ...)`
   * BEFORE `onMount` — same injection pattern as `CanvasCombatTrackerPanel`. If not
   * called, `onMount` skips the log subscription silently (panel renders empty state).
   *
   * @param bus WS event bus exposing `subscribe(channel, fn): () => void`.
   */
  setWsEventBus(bus: WsEventBusLike): void {
    this._wsEventBus = bus;
  }

  // ── CanvasLayer interface ─────────────────────────────────────────────────

  /**
   * Assign the OffscreenCanvas (or HTMLCanvasElement fallback) and start async init.
   *
   * Null-context degradation: when `getContext('2d')` returns `null` (happy-dom),
   * logs a warning and returns. Subsequent `paint()` calls return early via the
   * `_ctx === null` null-guard — no crash.
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
        '[EVF] CanvasLogPanel.attachCanvas: getContext("2d") returned null — ' +
          'running in degraded mode (no canvas 2D context; paint() is a no-op).',
      );
      return;
    }
    this._ctx = ctx;
    this._chromePrebakePromise = this._initAsync();
    await this._chromePrebakePromise;
    this._dirty = true;
  }

  /**
   * Repaint the layer's canvas from current cached state.
   *
   * 1. Blits pre-baked static chrome bitmap (GPU-accelerated) or draws static
   *    chrome inline — background fill + outer border only.
   * 2. For each row from `renderLogContent`: draw the row text with `ctx.fillText`.
   * 3. Sets `_dirty = false` as the LAST line.
   *
   * Called by `CanvasCompositor` ONLY when `isDirty()` returns `true`.
   */
  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) return;

    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);

    // Static chrome layer — GPU-blit pre-baked bitmap or inline fallback.
    if (this._chromeBitmap !== null) {
      ctx.drawImage(this._chromeBitmap, 0, 0);
    } else {
      _drawStaticChrome(ctx);
    }

    // Render content rows via Approach A: glyph strings → ctx.fillText per row.
    const rows = renderLogContent(this._snapshot, this._locale, this._scrollOffset, Date.now());

    ctx.font = this._fontFamily;
    ctx.fillStyle = CHROME_FG;

    for (let i = 0; i < rows.length; i++) {
      const y = CONTENT_Y_START + i * ROW_LINE_HEIGHT;
      ctx.fillText(rows[i] ?? '', CONTENT_X, y + ROW_LINE_HEIGHT - 2);
    }

    // MUST be the last line — do NOT double-guard isDirty() here.
    this._dirty = false;
  }

  /**
   * Returns `true` when the layer has un-flushed state changes since the last
   * `paint()` call.
   */
  isDirty(): boolean {
    return this._dirty;
  }

  /**
   * No-op draw — the compositor drives `paint()` directly.
   *
   * @returns A resolved `Promise<void>`.
   */
  draw(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Report container footprint.
   *
   * Canvas layers return `{image:0, text:0}` — the fixed 5-container HUD raster
   * page schema is declared once at page creation (ADR-0013 Amendment 1, locked
   * decision #3). This is the whole reason this panel exists (the glyph LogPanel
   * declares `{image:0,text:1}` and trips the canvas budget assertion).
   *
   * @returns Narrow literal type `{image:0; text:0}`.
   */
  getContainerCount(): { image: 0; text: 0 } {
    return { image: 0, text: 0 };
  }

  /**
   * Capture-container name for canvas mode.
   *
   * Returns `'hud-capture'` — the full-screen text container declared in the
   * HUD raster page schema, satisfying the LayerManager capture-invariant.
   */
  getCaptureContainer(): string {
    return 'hud-capture';
  }

  /**
   * Tear down the panel.
   *
   * Closes the `ImageBitmap` cache to release GPU memory. Bus unsubscription lives
   * in `onUnmount` — LayerManager calls `onUnmount` BEFORE `destroy`.
   */
  destroy(): void {
    if (this._chromeBitmap !== null) {
      this._chromeBitmap.close();
      this._chromeBitmap = null;
    }
  }

  // ── OverlayPanel interface ─────────────────────────────────────────────────

  /**
   * Acquire panel resources.
   *
   * 1. Subscribe to gesture bus (stored for idempotent unsubscription). Guard
   *    against double-mount without prior `onUnmount` (WR-02 double-mount guard).
   * 2. If `_wsEventBus` is set: subscribe to `LOG_DELTA_TYPE` — forwards each raw
   *    payload to `_onLogDelta`, which validates via `LogSnapshotSchema.safeParse`
   *    (T-21-01).
   * 3. Set `_dirty = true` so the first composite paints.
   *
   * NOTE: do NOT subscribe inside `setWsEventBus` — subscriptions must be
   * lifecycle-tied (onMount/onUnmount), not boot-time (Pitfall 4).
   */
  async onMount(): Promise<void> {
    // WR-02: guard against double-mount without prior onUnmount.
    if (this._unsubscribeGesture !== null) {
      this._unsubscribeGesture();
      this._unsubscribeGesture = null;
    }
    this._unsubscribeGesture = this._gestureBus.subscribe((gesture) => this.onEvent(gesture));

    if (this._wsEventBus !== null) {
      this._unsubscribeLog = this._wsEventBus.subscribe(LOG_DELTA_TYPE, (raw) =>
        this._onLogDelta(raw),
      );
    }

    this._dirty = true;
  }

  /**
   * Release all subscriptions (T-21-LEAK / Pitfall 4 mitigation).
   *
   * Idempotent: calling `onUnmount` twice is safe (null guards prevent double-free
   * of gesture and log channel subscriptions).
   */
  async onUnmount(): Promise<void> {
    if (this._unsubscribeGesture !== null) {
      this._unsubscribeGesture();
      this._unsubscribeGesture = null;
    }
    if (this._unsubscribeLog !== null) {
      this._unsubscribeLog();
      this._unsubscribeLog = null;
    }
  }

  /**
   * Handle a published R1 gesture (synchronous — schedules its own re-paint by
   * setting `_dirty = true`).
   *
   * Dispatch table (mirrors glyph LogPanel):
   *   - `tap`          → no-op (Phase 5 parity stub)
   *   - `scroll-down`  → reveal older events (`_scrollOffset += 1`, clamped); dirty
   *   - `scroll-up`    → reveal newer events (`_scrollOffset -= 1`, min 0); dirty
   *   - `double-tap`   → no-op stub; router closes panel at bus level (ADR-0012)
   *
   * `isAtTopBoundary()` = `_scrollOffset === 0` — DO NOT modify (ADR-0012 gate).
   *
   * @param gesture R1 gesture from the PanelGestureBus.
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'tap':
        // Phase 5 parity no-op (mirrors glyph LogPanel).
        break;

      case 'scroll':
        if (gesture.direction === 'down') {
          // T-21-02: clamp to [0, events.length - 1] so the panel cannot scroll
          // past all content and get permanently stuck.
          const maxOffset = Math.max(0, (this._snapshot?.events.length ?? 0) - 1);
          this._scrollOffset = Math.min(this._scrollOffset + 1, maxOffset);
        } else {
          this._scrollOffset = Math.max(0, this._scrollOffset - 1);
        }
        this._dirty = true;
        break;

      case 'double-tap':
        // No-op stub — router closes panel at bus level per ADR-0012.
        break;
    }
  }

  /**
   * Whether the event scroll window is at its top boundary (ADR-0012 D-2).
   *
   * The router-level over-scroll dispatcher reads this on a `scroll-up` gesture:
   * `true` means a further swipe-up is an over-scroll that opens the Quick Action menu.
   *
   * Verbatim: `return this._scrollOffset === 0` — DO NOT add conditions.
   */
  isAtTopBoundary(): boolean {
    return this._scrollOffset === 0;
  }

  // ── Test-only accessor ────────────────────────────────────────────────────

  /**
   * Return the rendered string rows for the current snapshot (test-seam).
   *
   * Production code MUST NOT gate behaviour on this getter. Used by unit tests to
   * inspect Approach-A string output without requiring a real canvas.
   *
   * @returns Array of 18 content rows from `renderLogContent`.
   */
  getRenderedRows(): string[] {
    return renderLogContent(this._snapshot, this._locale, this._scrollOffset, Date.now());
  }

  // ── Private — async init ──────────────────────────────────────────────────

  /**
   * Async initialisation: VT323 font load + chrome pre-bake.
   */
  private async _initAsync(): Promise<void> {
    this._fontFamily = await ensureVt323Loaded();
    await this._prebakeChrome();
  }

  /**
   * Draw static chrome onto a scratch OffscreenCanvas and cache as `ImageBitmap`.
   *
   * "Static chrome" = background fill + outer border.
   *
   * On success: `_chromeBitmap` is set.
   * On failure (happy-dom / no `createImageBitmap`): `_chromeBitmap` stays `null`;
   * `paint()` falls back to `_drawStaticChrome` inline.
   */
  private async _prebakeChrome(): Promise<void> {
    try {
      const scratch = new OffscreenCanvas(COMPOSITOR_W, COMPOSITOR_H);
      const sCtx = scratch.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      if (sCtx === null) {
        console.warn('[EVF] CanvasLogPanel._prebakeChrome: scratch ctx null — skipping pre-bake');
        return;
      }
      _drawStaticChrome(sCtx);
      this._chromeBitmap = await createImageBitmap(scratch);
    } catch {
      // createImageBitmap absent (happy-dom) — _chromeBitmap stays null, paint() falls back.
    }
  }

  // ── Private — log delta handler ───────────────────────────────────────────

  /**
   * Handle an incoming `log.delta` envelope (T-21-01 mitigation).
   *
   * 1. Validates via `LogSnapshotSchema.safeParse`; on failure logs and returns —
   *    `_snapshot` and `_dirty` are UNCHANGED (malformed payload dropped).
   * 2. Resets `_scrollOffset = 0` (show newest events first — mirrors glyph
   *    LogPanel.onSnapshot).
   * 3. Updates `_snapshot` and sets `_dirty = true`.
   *
   * @param raw Untrusted WS payload from the `log.delta` channel.
   */
  private _onLogDelta(raw: unknown): void {
    const parsed = LogSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn('[EVF] canvas-log-panel: malformed log delta payload — ignoring.');
      return;
    }
    this._scrollOffset = 0;
    this._snapshot = parsed.data;
    this._dirty = true;
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

/**
 * Draw the static chrome onto `ctx`.
 *
 * Renders background fill + outer border. Content rows are drawn inline on every
 * `paint()` call (Approach A — glyph strings to ctx.fillText).
 *
 * Called:
 *   - During `_prebakeChrome()` onto a scratch OffscreenCanvas (production path).
 *   - Inline from `paint()` when `_chromeBitmap` is null (happy-dom fallback).
 *
 * @param ctx 2D rendering context.
 */
function _drawStaticChrome(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
): void {
  // Black background fill.
  ctx.fillStyle = CHROME_BG;
  ctx.fillRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);

  // Outer border — white (brightest palette step → phosphor green on G2).
  ctx.strokeStyle = CHROME_FG;
  ctx.strokeRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
}
