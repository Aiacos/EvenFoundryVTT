/**
 * CanvasCombatTrackerPanel — z=2 canvas overlay panel for the 5-row combat tracker.
 *
 * Dual-interface class implementing BOTH:
 *   - `CanvasLayer` (`attachCanvas` / `paint` / `isDirty`) — canvas compositor path
 *   - `OverlayPanel` (`onMount` / `onUnmount` / `onEvent`) — panel-router lifecycle
 *
 * This is the canvas-mode counterpart of the glyph `CombatTrackerPanel`. Both
 * expose a distinct `static meta.id` (`'canvas-combat-tracker'` vs `'combat-tracker'`);
 * boot-engine-core selects the correct one based on `layerManager.getRenderMode()`
 * (Pitfall 2 from 21-RESEARCH.md — boot-time conditional dispatch, not glob sort order).
 *
 * # Approach A — glyph strings to ctx.fillText
 *
 * This panel reuses the glyph panel's tested business logic by importing and calling
 * `renderCombatTrackerContent` from `combat-tracker-panel.ts`, which returns 18
 * string rows. Each row is drawn with `ctx.fillText` at a fixed line interval.
 * The current-turn row receives a full-contrast inverted fill band drawn beforehand
 * (Pattern 6 / A3 — `_drawCurrentTurnHighlight` seam).
 *
 * # Chrome pre-bake (RFONT-02 / SC2 pattern)
 *
 * `attachCanvas()` fires an async init (`_initAsync`) that:
 *   1. Loads VT323 via `ensureVt323Loaded()`.
 *   2. Pre-bakes the static chrome (background fill + outer border) into an `ImageBitmap`.
 *
 * In happy-dom (no createImageBitmap), `_chromeBitmap` stays `null` and `paint()`
 * falls back to `_drawStaticChrome` inline.
 *
 * # Dirty-gate (RFONT-03 pattern)
 *
 * `isDirty()` returns `true` at construction and after every valid combat delta or
 * gesture. `paint()` resets `_dirty = false` as its LAST statement.
 *
 * # Subscription lifecycle (T-23-03 / Pitfall 4)
 *
 * `onMount` subscribes to BOTH `combat.turn` and `combat.state` channels (stored in
 * `_unsubscribeCombat` array) plus the gesture bus. `onUnmount` invokes and clears
 * all subscriptions — idempotent (null/empty guards prevent double-free).
 *
 * # Auto-follow on turn advance (D-23.3)
 *
 * When `_onCombatDelta` detects a new `currentCombatantId`, `_scrollOffset` is reset
 * to 0 to re-center the active combatant, and `_multiAttackState` is cleared (WR-02).
 *
 * # AC rendering (D-23.2 / RDATA-05)
 *
 * AC flows via `renderCombatTrackerContent` → `renderCombatantRow`. The shared renderer
 * (combat-tracker-panel.ts) was updated in Plan 23-03 to read `c.ac` instead of a
 * hard-coded `' --'` placeholder — real AC or the `' --'` fallback are both preserved.
 *
 * # Gesture semantics
 *
 *   - `scroll-up / scroll-down` → shift `_scrollOffset` ±1, clamped to `[-maxOff, +maxOff]`
 *   - `tap`                     → QA-bar cycle / double-tap-fire (mirrors glyph panel CTQ-04/05)
 *   - `double-tap`              → no-op stub; router closes panel at bus level (ADR-0012)
 *
 * # Threat mitigations
 *
 *   - T-23-01 (Tampering): `CombatSnapshotSchema.safeParse` gate in `_onCombatDelta`.
 *   - T-23-02 (DoS scroll): `_scrollOffset` clamped to `[-maxOff, +maxOff]`.
 *   - T-23-03 (DoS leak): idempotent unsubscribe in `onUnmount`.
 *
 * @see packages/g2-app/src/panels/canvas-character-sheet-panel.ts (structural template)
 * @see packages/g2-app/src/panels/combat-tracker-panel.ts (glyph panel; shared business logic)
 * @see packages/g2-app/src/engine/layer-types.ts (CanvasLayer + OverlayPanel interfaces)
 * @see .planning/phases/EVF-23-combat-tracker-su-canvas-combatant-ac/23-03-PLAN.md
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  type CombatSnapshot,
  CombatSnapshotSchema,
} from '@evf/shared-protocol';
import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer, OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';
import { type MultiAttackState, renderCombatTrackerContent } from './combat-tracker-panel.js';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Background fill color — black. */
const CHROME_BG = '#000000';

/** Foreground color — white lines/text. */
const CHROME_FG = '#ffffff';

/** Line height in pixels for combat tracker rows. */
const ROW_LINE_HEIGHT = 16;

/** Y offset for the first content row (below chrome border). */
const CONTENT_Y_START = 16;

/** X offset for row text (inside border). */
const CONTENT_X = 2;

/**
 * Quick-action bar key order (matches glyph CombatTrackerPanel).
 *
 * Index 0=A (Attack), 1=S (Spell), 2=I (Item), 3=M (Move).
 */
const QA_KEYS: ReadonlyArray<'A' | 'S' | 'I' | 'M'> = ['A', 'S', 'I', 'M'] as const;

/** Double-tap window in milliseconds for QA-bar key fire (CTQ-05). */
const DOUBLE_TAP_WINDOW_MS = 600;

// ── WS event bus interface ─────────────────────────────────────────────────────

/**
 * Minimal WS event bus shape required by `CanvasCombatTrackerPanel`.
 *
 * Matches the `wsEventBus.subscribe` API from `boot-engine-core.ts`.
 * Using a structural interface (not importing the concrete type) keeps this
 * panel decoupled from the boot module (Pitfall 5 from 23-RESEARCH.md).
 */
interface WsEventBusLike {
  subscribe(channel: string, fn: (payload: unknown) => void): () => void;
}

// ── CanvasCombatTrackerPanel ───────────────────────────────────────────────────

/**
 * Canvas z=2 overlay panel implementing the 5-row sliding combat tracker.
 *
 * Constructed by `PanelRouter.openPanel('canvas-combat-tracker', deps)` in canvas
 * mode (boot-engine-core `onNavigate` gate — Phase 23 / RCOMB-01 / D-23.5).
 * In glyph mode the router opens `'combat-tracker'` (the glyph `CombatTrackerPanel`) instead.
 */
export default class CanvasCombatTrackerPanel implements CanvasLayer, OverlayPanel {
  /**
   * Static metadata validated by `PanelRouter.discoverPanels` at boot.
   *
   * `id: 'canvas-combat-tracker'` is DISTINCT from the glyph panel's
   * `'combat-tracker'` — boot-engine-core gates which is opened on
   * `layerManager.getRenderMode()` (Pitfall 2 from 21-RESEARCH.md).
   */
  static meta: PanelMeta = {
    id: 'canvas-combat-tracker',
    title: { it: 'Combat', en: 'Combat', de: 'Kampf' },
    navKey: 'C',
    requiredCaps: [],
  };

  /** Stable panel id matching `static meta.id` (LayerManager + telemetry). */
  public readonly id = 'canvas-combat-tracker';

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
   * Latest valid `CombatSnapshot` from `_onCombatDelta`.
   *
   * `null` until the first valid delta arrives. `renderCombatTrackerContent`
   * handles null by rendering the empty-state message.
   */
  private _snapshot: CombatSnapshot | null = null;

  /**
   * Signed scroll offset applied to the windowing center.
   *
   * Reset to 0 on every `_onCombatDelta` when `currentCombatantId` changes
   * (turn advance — D-23.3 auto-follow). Shifted by ±1 on scroll gesture.
   * Clamped to `[-maxOff, +maxOff]` (T-23-02).
   */
  private _scrollOffset = 0;

  /**
   * The last seen `currentCombatantId` — used to detect turn advances.
   *
   * When a delta arrives with a different value, `_scrollOffset` is reset to 0
   * so the new active combatant is re-centered (D-23.3).
   */
  private _lastCurrentCombatantId: string | null = null;

  /**
   * Dirty flag — `true` at construction so the first composite always paints.
   *
   * Set to `false` at the LAST LINE of `paint()`. Set to `true` on valid combat
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

  /**
   * Transient multi-attack state (mirrors glyph CombatTrackerPanel MULTI-01).
   *
   * Cleared on turn-advance in `_onCombatDelta` (WR-02).
   */
  private _multiAttackState: MultiAttackState | null = null;

  // ── QA bar tap state (mirrors glyph CombatTrackerPanel CTQ-04/05) ──────────

  /**
   * Index of the currently-selected quick-action key (0=A, 1=S, 2=I, 3=M).
   *
   * Cycles on each tap when a handler is set (CTQ-04).
   */
  private _qaSelectedIdx = 0;

  /**
   * Timestamp (ms) of the most recent tap that advanced `_qaSelectedIdx`.
   *
   * Used to detect the 600ms double-tap window (CTQ-05). `0` = no previous tap.
   */
  private _lastTapAt = 0;

  /**
   * The `_qaSelectedIdx` value active when the most recent tap fired.
   *
   * `-1` = no previous tap (initial sentinel).
   */
  private _lastTapIdx = -1;

  /**
   * Injected quick-action handler (Plan 08-05 — boot-engine-core step 11i).
   *
   * Null until `setQuickActionHandler` is called by the boot orchestrator.
   * When null, tap events are no-ops.
   */
  private _quickActionHandler: ((key: 'A' | 'S' | 'I' | 'M') => void) | null = null;

  // ── Subscription handles ──────────────────────────────────────────────────

  /**
   * Unsubscribe closure returned by `gestureBus.subscribe`.
   *
   * Set in `onMount`; invoked and nulled in `onUnmount`. The null guard makes
   * `onUnmount` idempotent (T-23-03 / Pitfall 4).
   */
  private _unsubscribeGesture: (() => void) | null = null;

  /**
   * Unsubscribe closures returned by `wsEventBus.subscribe` — one per channel.
   *
   * Both `combat.turn` and `combat.state` share the same `_onCombatDelta` handler.
   * Each entry is invoked and the array is cleared in `onUnmount` (T-23-03).
   */
  private _unsubscribeCombat: Array<() => void> = [];

  /**
   * WS event bus injected before `onMount` via `setWsEventBus`.
   *
   * `null` until boot-engine-core calls `setPanelInstanceHandler` (Pitfall 5).
   * If still null at `onMount`, combat delta subscriptions are skipped silently.
   */
  private _wsEventBus: WsEventBusLike | null = null;

  // ── Constructor ───────────────────────────────────────────────────────────

  /**
   * Construct a new `CanvasCombatTrackerPanel`.
   *
   * Mirrors the glyph `CombatTrackerPanel` constructor signature so boot-engine-core
   * can inject it via `PanelRouter.openPanel(id, deps)` without special-casing.
   *
   * @param _bridge      EvenAppBridge instance (kept for constructor parity with glyph panel;
   *                     not used directly — canvas output goes to the shared compositor).
   * @param _gestureBus  PanelGestureBus for R1 gesture subscription.
   * @param _locale      Active HUD locale (forwarded to `renderCombatTrackerContent`).
   * @param _ownActorId  Actor ID for the YOU-marker (forwarded to row renderer).
   */
  constructor(
    _bridge: EvenAppBridge,
    private readonly _gestureBus: PanelGestureBus,
    private readonly _locale: string,
    private readonly _ownActorId = '',
  ) {
    // _bridge is accepted for constructor parity with the glyph CombatTrackerPanel so that
    // PanelRouter.openPanel can inject deps uniformly without special-casing the canvas variant.
    // Canvas output goes to the shared CanvasCompositor; bridge is intentionally unused here.
    void _bridge;
  }

  // ── Injection seams ───────────────────────────────────────────────────────

  /**
   * Inject the WS event bus dependency post-construction.
   *
   * Called by boot-engine-core via `setPanelInstanceHandler('canvas-combat-tracker', ...)`
   * BEFORE `onMount` — same injection pattern as glyph CombatTrackerPanel (Pitfall 5).
   * If not called, `onMount` skips combat subscriptions silently.
   *
   * @param bus WS event bus exposing `subscribe(channel, fn): () => void`.
   */
  setWsEventBus(bus: WsEventBusLike): void {
    this._wsEventBus = bus;
  }

  /**
   * Inject (or clear) the quick-action dispatch handler.
   *
   * Called by boot-engine-core step 11i after `PanelRouter.discoverPanels`.
   * Mirrors `CombatTrackerPanel.setQuickActionHandler` API.
   *
   * @param handler  Callback dispatched when the user double-taps a QA-bar key.
   *                 Pass `null` to clear.
   */
  setQuickActionHandler(handler: ((key: 'A' | 'S' | 'I' | 'M') => void) | null): void {
    this._quickActionHandler = handler;
  }

  /**
   * Set or clear the multi-attack chip state, then mark dirty for re-paint.
   *
   * Called by `attachMultiAttackProgressHandler` (via `MultiAttackPanelHandle`) on
   * each validated `r1.multiattack.progress` envelope. Call with `null` to clear the
   * chip (dispatcher does so when `current === total` — final iteration complete).
   * Auto-clearing on turn-advance is handled in `_onCombatDelta`.
   *
   * Mirrors `CombatTrackerPanel.setMultiAttackState` (combat-tracker-panel.ts:789)
   * so that `multi-attack-progress-dispatcher.ts` can call this via the shared
   * `MultiAttackPanelHandle` interface regardless of render mode (CR-02).
   *
   * @param state Multi-attack state to display, or null to clear.
   */
  public setMultiAttackState(state: MultiAttackState | null): void {
    this._multiAttackState = state;
    this._dirty = true;
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
        '[EVF] CanvasCombatTrackerPanel.attachCanvas: getContext("2d") returned null — ' +
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
   * 2. For each row from `renderCombatTrackerContent`: if the row belongs to the
   *    current-turn combatant, draw the full-contrast highlight band first
   *    (`_drawCurrentTurnHighlight`), then draw the row text.
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
    const qaIdx = this._quickActionHandler !== null ? this._qaSelectedIdx : -1;
    const rows = renderCombatTrackerContent(
      this._snapshot,
      this._locale as never,
      this._scrollOffset,
      this._ownActorId,
      this._multiAttackState,
      qaIdx,
    );

    // Determine which row index corresponds to the current-turn combatant for highlight.
    const currentTurnRowIdx = this._findCurrentTurnRowIndex(rows);

    ctx.font = this._fontFamily;
    ctx.fillStyle = CHROME_FG;

    for (let i = 0; i < rows.length; i++) {
      const y = CONTENT_Y_START + i * ROW_LINE_HEIGHT;

      // Full-contrast inverted highlight band for the current-turn row (Pattern 6 / A3).
      if (i === currentTurnRowIdx) {
        this._drawCurrentTurnHighlight(ctx, y);
        // Draw text in background color (inverted) on top of the highlight band.
        ctx.fillStyle = CHROME_BG;
        ctx.fillText(rows[i] ?? '', CONTENT_X, y + ROW_LINE_HEIGHT - 2);
        ctx.fillStyle = CHROME_FG;
      } else {
        ctx.fillText(rows[i] ?? '', CONTENT_X, y + ROW_LINE_HEIGHT - 2);
      }
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
   * decision #3).
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
   * HUD raster page schema.
   */
  getCaptureContainer(): string {
    return 'hud-capture';
  }

  /**
   * Tear down the panel.
   *
   * Closes the `ImageBitmap` cache to release GPU memory. Bus unsubscription
   * lives in `onUnmount` — LayerManager calls `onUnmount` BEFORE `destroy`.
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
   * 1. Subscribe to gesture bus (stored for idempotent unsubscription).
   * 2. If `_wsEventBus` is set: subscribe to BOTH `COMBAT_TURN_DELTA_TYPE` and
   *    `COMBAT_STATE_DELTA_TYPE` channels — both deliver `CombatSnapshot` payloads
   *    (Open Question 1/A4 resolution: both channels share the same handler).
   * 3. Set `_dirty = true` so the first composite paints.
   *
   * NOTE: do NOT subscribe inside `setPanelInstanceHandler` — subscriptions must
   * be lifecycle-tied (onMount/onUnmount), not boot-time (Pitfall 4 from 23-RESEARCH.md).
   */
  async onMount(): Promise<void> {
    this._unsubscribeGesture = this._gestureBus.subscribe((gesture) => this.onEvent(gesture));

    if (this._wsEventBus !== null) {
      const unsub1 = this._wsEventBus.subscribe(COMBAT_TURN_DELTA_TYPE, (raw) =>
        this._onCombatDelta(raw),
      );
      const unsub2 = this._wsEventBus.subscribe(COMBAT_STATE_DELTA_TYPE, (raw) =>
        this._onCombatDelta(raw),
      );
      this._unsubscribeCombat.push(unsub1, unsub2);
    }

    this._dirty = true;
  }

  /**
   * Release all subscriptions (T-23-03 / Pitfall 4 mitigation).
   *
   * Idempotent: calling `onUnmount` twice is safe (null/empty-array guards
   * prevent double-free of gesture and combat channel subscriptions).
   */
  async onUnmount(): Promise<void> {
    // Gesture bus unsubscription
    if (this._unsubscribeGesture !== null) {
      this._unsubscribeGesture();
      this._unsubscribeGesture = null;
    }

    // Combat channel unsubscriptions (both combat.turn + combat.state)
    for (const unsub of this._unsubscribeCombat) {
      unsub();
    }
    this._unsubscribeCombat = [];
  }

  /**
   * Handle a published R1 gesture (synchronous — schedules its own re-paint
   * by setting `_dirty = true`).
   *
   * Dispatch table (mirrors glyph CombatTrackerPanel):
   *   - `tap`          → QA-bar cycle / double-tap-fire (CTQ-04/05); no-op if handler null
   *   - `scroll-up`    → shift `_scrollOffset` -1; clamped; `_dirty = true`
   *   - `scroll-down`  → shift `_scrollOffset` +1; clamped; `_dirty = true`
   *   - `double-tap`   → no-op stub; router closes panel at bus level (ADR-0012)
   *
   * `isAtTopBoundary()` = `_scrollOffset === 0` — DO NOT modify (Pitfall 6 — ADR-0012 gate).
   *
   * @param gesture R1 gesture from the PanelGestureBus.
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'tap': {
        // CTQ-03: no-op when handler is null (preserves pre-Phase-8 behaviour).
        if (this._quickActionHandler === null) break;

        const now = Date.now();
        const sameIdx = this._lastTapIdx === this._qaSelectedIdx;
        const withinWindow = now - this._lastTapAt < DOUBLE_TAP_WINDOW_MS;

        if (sameIdx && withinWindow) {
          // Double-tap on the currently-selected key: FIRE the action (CTQ-05).
          const key = QA_KEYS[this._qaSelectedIdx] ?? 'A';
          this._lastTapAt = 0;
          this._lastTapIdx = -1;
          this._quickActionHandler(key);
        } else {
          // First-tap or timeout: advance to next key, record selection (CTQ-04).
          this._qaSelectedIdx = (this._qaSelectedIdx + 1) % QA_KEYS.length;
          this._lastTapIdx = this._qaSelectedIdx;
          this._lastTapAt = now;
          this._dirty = true;
        }
        break;
      }

      case 'scroll': {
        // WR-02 / T-23-02: clamp scrollOffset to [-maxOff, +maxOff] so the window
        // cannot scroll past content and leave the panel permanently stuck.
        const maxOff = Math.max(0, (this._snapshot?.combatants.length ?? 0) - 3);
        this._scrollOffset = Math.max(
          -maxOff,
          Math.min(this._scrollOffset + (gesture.direction === 'down' ? 1 : -1), maxOff),
        );
        this._dirty = true;
        break;
      }

      case 'double-tap':
        // No-op stub — router closes panel at bus level per ADR-0012.
        break;
    }
  }

  /**
   * Whether the sliding window is at its top boundary (ADR-0012 D-2).
   *
   * The router-level over-scroll dispatcher reads this on a `scroll-up` gesture:
   * `true` means a further swipe-up is an over-scroll that opens the Quick Action menu.
   *
   * Verbatim: `return this._scrollOffset === 0` — DO NOT add conditions (Pitfall 6).
   */
  isAtTopBoundary(): boolean {
    return this._scrollOffset === 0;
  }

  // ── Test-only accessor ────────────────────────────────────────────────────

  /**
   * Return the rendered string rows for the current snapshot (test-seam).
   *
   * Production code MUST NOT gate behaviour on this getter. Used by RCOMB-WIN and
   * RCOMB-AC tests to inspect Approach-A string output without requiring a real canvas.
   *
   * @returns Array of 18 content rows from `renderCombatTrackerContent`.
   */
  getRenderedRows(): string[] {
    return renderCombatTrackerContent(
      this._snapshot,
      this._locale as never,
      this._scrollOffset,
      this._ownActorId,
      this._multiAttackState,
      this._quickActionHandler !== null ? this._qaSelectedIdx : -1,
    );
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
        console.warn(
          '[EVF] CanvasCombatTrackerPanel._prebakeChrome: scratch ctx null — skipping pre-bake',
        );
        return;
      }
      _drawStaticChrome(sCtx);
      this._chromeBitmap = await createImageBitmap(scratch);
    } catch {
      // createImageBitmap absent (happy-dom) — _chromeBitmap stays null, paint() falls back.
    }
  }

  // ── Private — combat delta handler ───────────────────────────────────────

  /**
   * Handle an incoming `combat.turn` or `combat.state` delta (T-23-01 mitigation).
   *
   * 1. Validates via `CombatSnapshotSchema.safeParse`; on failure logs and returns
   *    — `_snapshot` and `_dirty` are UNCHANGED (T-23-01: malformed payload dropped).
   * 2. On `currentCombatantId` change: resets `_scrollOffset = 0` (D-23.3 auto-follow),
   *    clears `_multiAttackState` (WR-02 stale-chip guard), updates `_lastCurrentCombatantId`.
   * 3. Updates `_snapshot` and sets `_dirty = true`.
   *
   * @param raw Untrusted WS payload from `combat.turn` or `combat.state` channel.
   */
  private _onCombatDelta(raw: unknown): void {
    const parsed = CombatSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn('[EVF] canvas-combat-tracker-panel: malformed combat delta payload — ignoring.');
      return;
    }

    const snap = parsed.data;

    // D-23.3 auto-follow: reset scroll to re-center the new active combatant.
    if (snap.currentCombatantId !== this._lastCurrentCombatantId) {
      this._scrollOffset = 0;
      this._lastCurrentCombatantId = snap.currentCombatantId;
      // WR-02: clear stale multi-attack chip on turn advance.
      this._multiAttackState = null;
    }

    this._snapshot = snap;
    this._dirty = true;
  }

  // ── Private — current-turn highlight ─────────────────────────────────────

  /**
   * Find the row index (in `rows`) that corresponds to the current-turn combatant.
   *
   * Matches `'▶ '` (U+25B6 + trailing space) exclusively. This distinguishes the
   * combatant-row marker from the QA-bar `[▶X]` slot (no trailing space), which
   * would cause a false-positive when the current-turn combatant is scrolled out of
   * the visible window and a QA key is selected (CR-01 fix).
   *
   * Returns -1 if no row contains the marker (empty state, no current turn, or
   * current-turn combatant scrolled out of the visible window).
   *
   * @param rows Content rows from `renderCombatTrackerContent`.
   */
  private _findCurrentTurnRowIndex(rows: string[]): number {
    for (let i = 0; i < rows.length; i++) {
      // Match "▶ " (marker + space) to avoid false-positive on "[▶X]" QA bar (CR-01).
      if ((rows[i] ?? '').includes('▶ ')) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Draw the full-contrast inverted fill band for the current-turn combatant row.
   *
   * Paints a white rectangle behind the row text; the subsequent `fillText` call
   * renders the row in `CHROME_BG` (black) for the inverted effect (Pattern 6 / A3
   * from 23-RESEARCH.md).
   *
   * @param ctx  2D rendering context.
   * @param rowY Y coordinate of the row's top edge.
   */
  private _drawCurrentTurnHighlight(
    ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
    rowY: number,
  ): void {
    const prevFill = ctx.fillStyle;
    ctx.fillStyle = CHROME_FG; // white band
    ctx.fillRect(0, rowY, COMPOSITOR_W, ROW_LINE_HEIGHT);
    ctx.fillStyle = prevFill;
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

/**
 * Draw the static chrome onto `ctx`.
 *
 * Renders background fill + outer border. Content rows are drawn inline on
 * every `paint()` call (Approach A — glyph strings to ctx.fillText).
 *
 * Called:
 *   - During `_prebakeChrome()` onto a scratch OffscreenCanvas (production path).
 *   - Inline from `paint()` when `_chromeBitmap` is null (happy-dom fallback).
 *
 * @param ctx  2D rendering context.
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
