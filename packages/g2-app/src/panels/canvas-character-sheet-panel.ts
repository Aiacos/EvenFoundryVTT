/**
 * CanvasCharacterSheetPanel — z=2 canvas overlay panel for the 6-tab character sheet.
 *
 * Dual-interface class implementing BOTH:
 *   - `CanvasLayer` (`attachCanvas` / `paint` / `isDirty`) — canvas compositor path
 *   - `OverlayPanel` (`onMount` / `onUnmount` / `onEvent`) — panel-router lifecycle
 *
 * This is the canvas-mode counterpart of the glyph `CharacterSheetPanel`. Both
 * expose a distinct `static meta.id` (`'canvas-character-sheet'` vs `'character-sheet'`);
 * boot-engine-core selects the correct one based on `layerManager.getRenderMode()`
 * (Pitfall 2 from 21-RESEARCH.md — boot-time conditional dispatch, not glob sort order).
 *
 * # Chrome pre-bake (RSHEET-01 / RFONT-02 pattern)
 *
 * `attachCanvas()` fires an async init (`_initAsync`) that:
 *   1. Loads VT323 via `ensureVt323Loaded()`.
 *   2. Pre-bakes the STATIC chrome (background fill + border + separator line)
 *      into an `ImageBitmap`.  The tab strip text is NOT baked — it is drawn
 *      inline on every `paint()` call so the active-tab highlight always tracks
 *      the current gesture state (CR-01 fix).
 *
 * In happy-dom (no createImageBitmap), `_chromeBitmap` stays `null` and `paint()`
 * falls back to `_drawStaticChrome` inline (SC2 fallback path).
 *
 * # Dirty-gate (RSHEET-01 / RFONT-03 pattern)
 *
 * `isDirty()` returns `true` at construction and after every valid `onSnapshot` or
 * gesture. `paint()` resets `_dirty = false` as its LAST statement. The
 * `CanvasCompositor` skips `paint()` for clean layers.
 *
 * # Gesture semantics (RSHEET-02)
 *
 * Tab navigation is byte-identical to the glyph `CharacterSheetPanel`:
 *   - `tap`        → advance tab mod 6
 *   - `scroll-up`  → decrement tab mod 6
 *   - `scroll-down`→ advance tab mod 6 (same as tap)
 *   - `double-tap` → no-op stub — router closes panel at bus level (ADR-0012)
 *
 * `panel-gesture-bus.ts` is NOT modified (SC2 gesture-identity locked decision).
 *
 * # Threat mitigations
 *
 * - T-21-01 (Tampering): `CharacterSnapshotSchema.safeParse` gate in `onSnapshot`.
 * - T-21-LEAK (DoS): idempotent unsubscribe in `onUnmount` (null guard per T-4b-01-03).
 *
 * @see packages/g2-app/src/status-hud/canvas-status-hud-layer.ts (CanvasLayer template)
 * @see packages/g2-app/src/panels/character-sheet-panel.ts (OverlayPanel template)
 * @see packages/g2-app/src/engine/layer-types.ts (CanvasLayer + OverlayPanel interfaces)
 * @see .planning/phases/EVF-21-character-sheet-su-canvas-dati-main-tab/21-03-PLAN.md
 * @see .planning/phases/EVF-21-character-sheet-su-canvas-dati-main-tab/21-PATTERNS.md §canvas-character-sheet-panel.ts
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import * as UPNG from 'upng-js';
import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer, OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import { buildGreyscalePalette, ditherTile } from '../raster/dither-utils.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';
import {
  buildTabStrip,
  type MapBaseLayerLike,
  PERSIST_KEY,
  TABS,
  type TabId,
} from './character-sheet-panel.js';
import {
  type PaintBounds,
  paintBioTab,
  paintFeatsTab,
  paintInventoryTab,
  paintMainTab,
  paintSkillsTab,
  paintSpellsTab,
} from './character-sheet-tab-renderers.js';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Background fill color — black (dithered to darkest G2 palette step). */
const CHROME_BG = '#000000';

// ── WS event bus interface ─────────────────────────────────────────────────────

/**
 * Minimal WS event bus shape required by `CanvasCharacterSheetPanel`.
 *
 * Matches the `wsEventBus.subscribe` API from `boot-engine-core.ts`.
 * Using a structural interface (not importing the concrete type) keeps this
 * panel decoupled from the boot module (Pitfall 5 from 21-PATTERNS.md).
 *
 * Mirrors the identical interface in `canvas-combat-tracker-panel.ts` — kept
 * local so neither panel depends on the other.
 */
interface WsEventBusLike {
  subscribe(channel: string, fn: (payload: unknown) => void): () => void;
}

/**
 * Hard ceiling for `_scrollOffset` on scrollable tabs (bio, feats).
 *
 * Far above any realistic bio/feats line count; prevents unbounded integer
 * growth when the user holds swipe-down. Renderers clamp to actual content
 * length independently — this is a gesture-layer safety limit only.
 */
const MAX_SCROLL_OFFSET = 200;

/** Foreground color — white lines/text (quantized to brightest G2 palette step). */
const CHROME_FG = '#ffffff';

// ── CanvasCharacterSheetPanel ──────────────────────────────────────────────────

/**
 * Canvas z=2 overlay panel implementing the 6-tab character sheet.
 *
 * Constructed by `PanelRouter.openPanel('canvas-character-sheet', deps)` in canvas
 * mode (boot-engine-core step 11c `onNavigate`). In glyph mode the router opens
 * `'character-sheet'` (the glyph `CharacterSheetPanel`) instead.
 */
export default class CanvasCharacterSheetPanel implements CanvasLayer, OverlayPanel {
  /**
   * Static metadata validated by `PanelRouter.discoverPanels` at boot.
   *
   * `id: 'canvas-character-sheet'` is DISTINCT from the glyph panel's
   * `'character-sheet'` — boot-engine-core gates which is opened on
   * `layerManager.getRenderMode()` (Pitfall 2 from 21-RESEARCH.md).
   */
  static meta: PanelMeta = {
    id: 'canvas-character-sheet',
    title: { it: 'Scheda', en: 'Sheet', de: 'Blatt' },
    navKey: 'S',
    requiredCaps: [],
    defaultTab: 'main',
  };

  /** Stable panel id matching `static meta.id` (LayerManager + telemetry). */
  public readonly id = 'canvas-character-sheet';

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
   * Active HUD locale forwarded to paint*Tab renderers.
   *
   * Stored as an instance field (assigned in constructor) to allow runtime locale updates
   * in future phases. Threaded through `_paintActiveTab` to all `paint*Tab` calls
   * (WR-02 fix: eliminates dead `void this._locale` suppression).
   */
  private _locale: string;

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
   * `paint()` falls back to `_drawChrome` inline.
   */
  private _chromeBitmap: ImageBitmap | null = null;

  /**
   * Fire-and-forget Promise returned by `_initAsync`.
   *
   * Stored so tests can await it via `LayerManager.bundle()`.
   */
  private _chromePrebakePromise: Promise<void> | null = null;

  /** Latest valid `CharacterSnapshot` from `onSnapshot`. */
  private _snapshot: CharacterSnapshot | null = null;

  /**
   * Dirty flag — `true` at construction so the first composite always paints.
   *
   * Set to `false` at the LAST LINE of `paint()`. Set to `true` on snapshot
   * updates and every gesture that changes tab state.
   *
   * NEVER check this inside `paint()` — the compositor calls `isDirty()` before
   * dispatching `paint()`. Double-guarding breaks the dirty-skip pattern.
   */
  private _dirty = true;

  /** Zero-based index into {@link TABS} for the currently visible tab. */
  private _activeTabIndex = 0;

  /**
   * One-shot initial tab override set by boot-engine-core via {@link setInitialTab}.
   *
   * When non-null, `_restoreLastTab` selects this tab instead of the persisted
   * `view.sheet.lastTab` value, then clears it (single-use). This lets the Quick
   * Action menu open the sheet directly on a specific tab — e.g. `[I] Inventario`
   * → INV tab, `[B] Libro` → SPL tab — without persisting that choice as the
   * user's default sheet tab (the override is NOT written to kv storage).
   *
   * `null` = no override (restore persisted tab, the pre-existing behaviour).
   */
  private _initialTab: TabId | null = null;

  /**
   * Scroll offset within the active tab's content area.
   *
   * Reset to 0 on every tab change (T-05-02-02 mitigation).
   */
  private _scrollOffset = 0;

  /**
   * Unsubscribe closure returned by `gestureBus.subscribe`.
   *
   * Set in `onMount`; invoked and nulled in `onUnmount`. The null guard makes
   * `onUnmount` idempotent (T-4b-01-03 mitigation — T-21-LEAK).
   */
  private _unsubscribeGesture: (() => void) | null = null;

  /**
   * Unsubscribe closure returned by `wsEventBus.subscribe('character.delta', ...)`.
   *
   * Set in `onMount` when `_wsEventBus` is non-null; invoked and nulled in
   * `onUnmount`. Null guard makes `onUnmount` idempotent (T-21-LEAK).
   */
  private _unsubscribeCharacter: (() => void) | null = null;

  /**
   * WS event bus injected before `onMount` via `setWsEventBus`.
   *
   * `null` until boot-engine-core calls `setPanelInstanceHandler` (Pitfall 5).
   * If still null at `onMount`, character.delta subscriptions are skipped silently.
   */
  private _wsEventBus: WsEventBusLike | null = null;

  /**
   * Optional `MapBaseLayer` instance for portrait slot override (Plan 21-04).
   *
   * Injected by boot-engine-core via `setPanelInstanceHandler` BEFORE `onMount`.
   * When null, portrait wiring is silently skipped.
   */
  private _mapBaseLayer: MapBaseLayerLike | null;

  /** Portrait slot index (slot 3 = bottom-right tile, same as glyph panel). */
  private readonly _portraitSlot = 3;

  /**
   * Async-once guard for the portrait fetch pipeline.
   *
   * Set to `true` after `_fetchPortraitAsync` is called for the first time
   * during a mount cycle. Reset to `false` in `onUnmount` so re-opening the
   * panel re-fetches the portrait (in case the snapshot URL changed).
   */
  private _portraitFetched = false;

  // ── Constructor ───────────────────────────────────────────────────────────

  /**
   * Construct a new `CanvasCharacterSheetPanel`.
   *
   * Mirrors the glyph `CharacterSheetPanel` constructor signature so boot-engine-core
   * can inject it via `PanelRouter.openPanel(id, deps)` without special-casing.
   *
   * @param _bridge      EvenAppBridge instance (used for tab persistence via kv store).
   * @param gestureBus   PanelGestureBus for R1 gesture subscription.
   * @param _locale      Active HUD locale (used by paint*Tab methods).
   * @param mapBaseLayer Optional MapBaseLayer for portrait slot override.
   */
  constructor(
    private readonly _bridge: EvenAppBridge,
    private readonly _gestureBus: PanelGestureBus,
    locale: string,
    mapBaseLayer: MapBaseLayerLike | null = null,
  ) {
    this._locale = locale;
    this._mapBaseLayer = mapBaseLayer;
  }

  /**
   * Inject the MapBaseLayer dependency post-construction.
   *
   * Called by boot-engine-core via `setPanelInstanceHandler('canvas-character-sheet', ...)`
   * BEFORE `onMount` — same injection pattern as the glyph panel.
   *
   * @param mapBase Boot-time MapBaseLayer singleton, or null to clear (tests only).
   */
  setMapBaseLayer(mapBase: MapBaseLayerLike | null): void {
    this._mapBaseLayer = mapBase;
  }

  /**
   * Inject the WS event bus dependency post-construction.
   *
   * Called by boot-engine-core via `setPanelInstanceHandler('canvas-character-sheet', ...)`
   * BEFORE `onMount` — same injection pattern as `CanvasCombatTrackerPanel.setWsEventBus`
   * (Pitfall 5 from 21-PATTERNS.md: do NOT subscribe here; subscriptions are lifecycle-tied
   * to `onMount`/`onUnmount`).
   *
   * Without this call, `onMount` silently skips character.delta subscriptions and
   * all 6 tabs render null/empty at runtime (BLOCKER-01).
   *
   * @param bus WS event bus exposing `subscribe(channel, fn): () => void`.
   */
  setWsEventBus(bus: WsEventBusLike): void {
    this._wsEventBus = bus;
  }

  /**
   * Pre-select the tab shown on the next `onMount`, overriding the persisted tab.
   *
   * Called by boot-engine-core via `setPanelInstanceHandler('canvas-character-sheet', ...)`
   * BEFORE `onMount` when the Quick Action menu routes a tab-specific entry to the
   * sheet — `[I] Inventario` → `'inventory'`, `[B] Libro` → `'spells'`. The override
   * is consumed once by `_restoreLastTab` and is NOT persisted to kv storage, so it
   * never clobbers the user's default sheet tab.
   *
   * Invalid tab ids are ignored (defensive — `TABS.indexOf` would yield -1).
   *
   * @param tab Tab id to open on mount, or null to clear (restore persisted tab).
   */
  setInitialTab(tab: TabId | null): void {
    this._initialTab = tab;
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
        '[EVF] CanvasCharacterSheetPanel.attachCanvas: getContext("2d") returned null — ' +
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
   *    chrome inline — background fill + outer border + tab separator only.
   * 2. Draws the tab strip inline on EVERY paint() call, so the highlight
   *    reflects the CURRENT `_activeTabIndex` (CR-01 fix: tab strip is dynamic,
   *    not included in the pre-baked bitmap).
   * 3. Dispatches to the active tab's `paint*Tab` method.
   * 4. Sets `_dirty = false` as the LAST line.
   *
   * Called by `CanvasCompositor` ONLY when `isDirty()` returns `true`.
   */
  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) return;

    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);

    // Static chrome layer — GPU-blit pre-baked bitmap or inline fallback.
    // The bitmap contains ONLY background fill + outer border + separator line
    // (NOT the tab strip text, which changes on every gesture).
    if (this._chromeBitmap !== null) {
      ctx.drawImage(this._chromeBitmap, 0, 0);
    } else {
      _drawStaticChrome(ctx);
    }

    // Tab strip — ALWAYS drawn inline so the highlight tracks _activeTabIndex.
    _drawTabStrip(ctx, this._fontFamily, this._activeTabIndex);

    // Active tab content layer.
    this._paintActiveTab(ctx);

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
   * decision #3). `LayerManager._assertContainerBudget` validates this via
   * `isCanvasLayer()`.
   *
   * @returns Narrow literal type `{image:0; text:0}` satisfying
   *   `{image:number; text:number}` covariance (Pitfall 1 from 21-RESEARCH.md).
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
   * 1. Subscribe to the gesture bus (stored for idempotent unsubscription).
   *    Guard against double-mount without prior `onUnmount`: if `_unsubscribeGesture`
   *    is non-null, call and clear it before re-subscribing (WR-02 double-mount guard,
   *    mirrors CanvasCombatTrackerPanel.onMount).
   * 2. If `_wsEventBus` is set: subscribe to `character.delta` — forwards each raw
   *    payload to `onSnapshot` which validates via `CharacterSnapshotSchema.safeParse`
   *    (T-21-01 mitigation). Without this subscription the panel renders null on all
   *    tabs at runtime (BLOCKER-01 fix).
   * 3. Restore last-viewed tab from Even Hub storage.
   * 4. Fire-and-forget the portrait pipeline (`_fetchPortraitAsync`) — must NOT
   *    be awaited here; `LayerManager.bundle` awaits `onMount` and blocking on
   *    a network fetch would delay panel appearance (Pitfall 3 from 21-PATTERNS.md).
   * 5. Set `_dirty = true` so the first composite paints.
   *
   * NOTE: do NOT subscribe inside `setWsEventBus` — subscriptions must be
   * lifecycle-tied (onMount/onUnmount), not boot-time (Pitfall 4 from 21-PATTERNS.md).
   */
  async onMount(): Promise<void> {
    // WR-02: guard against double-mount without prior onUnmount.
    if (this._unsubscribeGesture !== null) {
      this._unsubscribeGesture();
      this._unsubscribeGesture = null;
    }
    this._unsubscribeGesture = this._gestureBus.subscribe((gesture) => this.onEvent(gesture));

    // BLOCKER-01 fix: subscribe to character.delta so onSnapshot receives live data.
    if (this._wsEventBus !== null) {
      this._unsubscribeCharacter = this._wsEventBus.subscribe('character.delta', (raw) =>
        this.onSnapshot(raw),
      );
    }

    await this._restoreLastTab();
    void this._fetchPortraitAsync();
    this._dirty = true;
  }

  /**
   * Release all subscriptions (T-21-LEAK / T-4b-01-03 mitigation).
   *
   * Idempotent: calling `onUnmount` twice is safe (null guards prevent
   * double-free for both gesture and character.delta subscriptions).
   * Resets `_portraitFetched` so re-opening the panel re-fetches the portrait.
   */
  async onUnmount(): Promise<void> {
    // Gesture bus unsubscription
    if (this._unsubscribeGesture !== null) {
      this._unsubscribeGesture();
      this._unsubscribeGesture = null;
    }
    // character.delta unsubscription (BLOCKER-01 / T-21-LEAK)
    if (this._unsubscribeCharacter !== null) {
      this._unsubscribeCharacter();
      this._unsubscribeCharacter = null;
    }
    // Always clear portrait override on unmount (idempotent — null-safe).
    this._mapBaseLayer?.setPortraitOverride(this._portraitSlot, null);
    // Reset async-once guard so re-mounting re-fetches the portrait.
    this._portraitFetched = false;
  }

  /**
   * Handle a published R1 gesture (synchronous — schedules its own re-paint
   * by setting `_dirty = true`).
   *
   * Dispatch table (Phase 22 D-22.5 tab-aware scroll):
   *   - `tap`                             → advance tab mod 6; reset scroll; persist; dirty
   *   - `scroll-down` (bio|feats tab)     → increment _scrollOffset (within-tab scroll); dirty
   *   - `scroll-down` (other tabs)        → advance tab mod 6; reset scroll; persist; dirty
   *   - `scroll-up`   (bio|feats, off>0)  → decrement _scrollOffset; dirty
   *   - `scroll-up`   (bio|feats, off=0)  → cycle tab backward; reset scroll; persist; dirty
   *   - `scroll-up`   (other tabs)        → cycle tab backward; reset scroll; persist; dirty
   *   - `double-tap`                      → no-op; router handles close at bus level (ADR-0012)
   *
   * `isAtTopBoundary()` = `_scrollOffset === 0` (unchanged per Pitfall 5 — ADR-0012 contract).
   *
   * @param gesture R1 gesture from the PanelGestureBus.
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'tap':
        this._activeTabIndex = (this._activeTabIndex + 1) % TABS.length;
        this._scrollOffset = 0;
        void this._persistLastTab();
        this._dirty = true;
        break;

      case 'scroll': {
        // D-22.5: Bio and Feats tabs scroll content via _scrollOffset.
        // Other tabs cycle (existing behaviour). tap always cycles tabs (Open Question 2).
        // isAtTopBoundary() stays _scrollOffset === 0 — DO NOT modify (Pitfall 5: ADR-0012 gate).
        const scrollTab = TABS[this._activeTabIndex] ?? 'main';
        const isScrollableTab = scrollTab === 'bio' || scrollTab === 'feats';
        const prevTabIndex = this._activeTabIndex;
        if (gesture.direction === 'up') {
          if (isScrollableTab && this._scrollOffset > 0) {
            // Within-tab scroll up
            this._scrollOffset--;
          } else {
            // At boundary or non-scrollable: cycle tab backward + reset offset
            this._activeTabIndex = (this._activeTabIndex - 1 + TABS.length) % TABS.length;
            this._scrollOffset = 0;
          }
        } else {
          if (isScrollableTab) {
            // Within-tab scroll down (renderer clamps over-scroll; gesture layer applies ceiling).
            this._scrollOffset = Math.min(this._scrollOffset + 1, MAX_SCROLL_OFFSET);
          } else {
            // Non-scrollable: cycle tab forward + reset offset
            this._activeTabIndex = (this._activeTabIndex + 1) % TABS.length;
            this._scrollOffset = 0;
          }
        }
        // Only persist when the active tab changed — within-tab scroll (bio/feats) does
        // NOT change the tab index and should not generate a BLE storage write on every
        // swipe gesture (WR-02 fix).
        if (this._activeTabIndex !== prevTabIndex) {
          void this._persistLastTab();
        }
        this._dirty = true;
        break;
      }

      case 'double-tap':
        // No-op stub — router closes panel at bus level per ADR-0012.
        break;
    }
  }

  /**
   * Whether the active tab's scroll cursor is at its top boundary (ADR-0012 D-2).
   *
   * `true` means a swipe-up is an over-scroll → router opens the Quick Action menu.
   */
  isAtTopBoundary(): boolean {
    return this._scrollOffset === 0;
  }

  /**
   * Update the panel with a fresh character snapshot without remounting.
   *
   * Validates via `CharacterSnapshotSchema.safeParse` (T-21-01 mitigation).
   * Malformed payloads are logged and dropped — the layer does NOT become dirty.
   *
   * @param rawSnapshot Untrusted snapshot payload.
   */
  onSnapshot(rawSnapshot: unknown): void {
    const parsed = CharacterSnapshotSchema.safeParse(rawSnapshot);
    if (!parsed.success) {
      console.warn('[EVF] canvas-character-sheet-panel: malformed snapshot payload — ignoring.');
      return;
    }
    this._snapshot = parsed.data;
    this._dirty = true;
  }

  // ── Test-only accessor ────────────────────────────────────────────────────

  /**
   * Return the resolved CSS font-family string (test-only).
   *
   * Production code MUST NOT gate behaviour on this getter.
   *
   * @returns `'VT323'`-family on successful load; `'16px monospace'` on fallback.
   */
  getFontFamily(): string {
    return this._fontFamily;
  }

  /**
   * Return the currently active tab id (test-only).
   *
   * Production code MUST NOT gate behaviour on this getter — it exists so tests can
   * assert tab selection (e.g. `setInitialTab` routing `[I]`→INV, `[B]`→SPL) without
   * reaching into the private `_activeTabIndex` field.
   *
   * @returns The active tab id, e.g. `'inventory'` or `'spells'`.
   */
  getActiveTab(): TabId {
    return TABS[this._activeTabIndex] ?? 'main';
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
   * "Static chrome" = background fill + outer border + horizontal separator.
   * The tab strip text is NOT baked here — it is drawn inline on every paint()
   * call so the active-tab highlight always reflects the current gesture state
   * (CR-01 fix).
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
          '[EVF] CanvasCharacterSheetPanel._prebakeChrome: scratch ctx null — skipping pre-bake',
        );
        return;
      }
      // Bake ONLY the static parts (bg + border + separator). Tab strip is dynamic.
      _drawStaticChrome(sCtx);
      this._chromeBitmap = await createImageBitmap(scratch);
    } catch {
      // createImageBitmap absent (happy-dom) — _chromeBitmap stays null, paint() falls back.
    }
  }

  /**
   * Dispatch `paint*Tab` for the currently active tab.
   *
   * Each method draws within the full compositor bounds. This plan (21-03) does
   * NOT include portrait rendering — Plan 21-04 adds the portrait layer.
   *
   * `this._locale` is threaded through to each `paint*Tab` call so locale-aware
   * rendering honours the device-locale override set at boot (WR-02 fix — removes
   * the `void this._locale` dead-code suppression).
   */
  private _paintActiveTab(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D): void {
    // Content sits INSIDE the D&D frame inset (Feature 001 D3): x/right padded
    // past the double-rule border so text no longer runs under the frame.
    const bounds: PaintBounds = { x: 8, y: 30, w: COMPOSITOR_W - 16, h: COMPOSITOR_H - 36 };
    const tab = TABS[this._activeTabIndex] ?? 'main';
    const font = this._fontFamily;
    const locale = this._locale as HudLocale;
    switch (tab) {
      case 'main':
        paintMainTab(ctx, this._snapshot, bounds, font);
        break;
      case 'skills':
        paintSkillsTab(ctx, this._snapshot, bounds, font, locale);
        break;
      case 'inventory':
        paintInventoryTab(ctx, this._snapshot, bounds, font, locale);
        break;
      case 'spells':
        paintSpellsTab(ctx, this._snapshot, bounds, font, locale);
        break;
      case 'feats':
        paintFeatsTab(ctx, this._snapshot, bounds, font, locale, this._scrollOffset);
        break;
      case 'bio':
        paintBioTab(ctx, this._snapshot, bounds, font, locale, this._scrollOffset);
        break;
    }
  }

  // ── Private — tab persistence ─────────────────────────────────────────────

  /**
   * Persist the current active tab to Even Hub storage.
   *
   * Non-fatal: storage failure does not affect in-memory tab state.
   */
  private async _persistLastTab(): Promise<void> {
    try {
      // _activeTabIndex is always in [0, TABS.length-1] via modulo — never undefined.
      // biome-ignore lint/style/noNonNullAssertion: invariant enforced by all mutation sites
      await this._bridge.setLocalStorage(PERSIST_KEY, TABS[this._activeTabIndex]!);
    } catch (err) {
      console.warn('[CanvasCharacterSheetPanel] setLocalStorage failed for', PERSIST_KEY, err);
    }
  }

  /**
   * Restore the last-viewed tab from Even Hub storage, honouring a one-shot
   * {@link setInitialTab} override.
   *
   * Order of precedence:
   *   1. `_initialTab` override (consumed + cleared here) — set by boot-engine-core
   *      when the Quick Action menu routes `[I]`/`[B]` to a specific tab. NOT
   *      persisted, so the user's default sheet tab is preserved.
   *   2. Persisted `view.sheet.lastTab` value from Even Hub storage.
   *   3. Tab 0 (Main) on invalid / absent / error.
   */
  private async _restoreLastTab(): Promise<void> {
    // One-shot initial-tab override takes precedence over the persisted tab.
    if (this._initialTab !== null) {
      const overrideIdx = TABS.indexOf(this._initialTab);
      this._initialTab = null; // single-use: consume the override.
      if (overrideIdx >= 0) {
        this._activeTabIndex = overrideIdx;
        return;
      }
    }
    try {
      const stored = await this._bridge.getLocalStorage(PERSIST_KEY);
      const idx = TABS.indexOf(stored as (typeof TABS)[number]);
      this._activeTabIndex = Math.max(0, idx);
    } catch {
      this._activeTabIndex = 0;
    }
  }

  // ── Private — portrait fetch / dither / slot pipeline ─────────────────────

  /**
   * Fetch the character portrait async-once, dither it to 4-bit greyscale,
   * encode as a 100×60 PNG, and push to MapBaseLayer slot 3.
   *
   * # Pipeline (T-21-03 mitigations applied)
   *
   * 1. Read `this._snapshot?.portrait?.url` — return early if undefined
   *    (RCSP-PORTRAIT-MISSING-URL).
   * 2. Async-once guard (`_portraitFetched`) — return early if already fetched
   *    this mount cycle (RCSP-PORTRAIT-ONCE).
   * 3. `fetch(url)` → bail silently on rejection or `!response.ok`
   *    (RCSP-PORTRAIT-FETCH-FAIL / T-21-03c mitigate).
   * 4. `response.blob()` → `createImageBitmap(blob, { resizeWidth:100, resizeHeight:60 })`
   *    → 100×60 OffscreenCanvas scratch → `getImageData` (T-21-03b: bitmap
   *    decode to pixels — content is never executed).
   * 5. `buildGreyscalePalette()` + `ditherTile(imageData.data, W, H, pal)` from
   *    `dither-utils.ts` (RSHEET-03 reuse requirement).
   * 6. `UPNG.encode([dithered.buffer], W, H, 16)` → `Uint8Array` PNG.
   * 7. `this._mapBaseLayer?.setPortraitOverride(3, pngBytes)` — slot 3 =
   *    bottom-right tile, same infra as glyph `CharacterSheetPanel`.
   *
   * # Error handling
   *
   * Entire body wrapped in `try/catch` — any error is silently discarded.
   * Portrait failure MUST NOT propagate or crash the panel (T-21-03c).
   *
   * # Non-blocking (Pitfall 3 from 21-PATTERNS.md)
   *
   * Called with `void this._fetchPortraitAsync()` from `onMount` — the returned
   * `Promise<void>` is intentionally fire-and-forget.
   *
   * @see packages/g2-app/src/raster/dither-utils.ts — `buildGreyscalePalette` + `ditherTile`
   * @see packages/g2-app/src/raster/map-base-layer.ts — `setPortraitOverride(slot, bytes | null)`
   */
  private async _fetchPortraitAsync(): Promise<void> {
    const url = this._snapshot?.portrait?.url;
    if (url === undefined) return;

    // Async-once guard: skip if already fetched this mount cycle.
    if (this._portraitFetched) return;
    this._portraitFetched = true;

    try {
      const response = await fetch(url);
      if (!response.ok) return;

      const blob = await response.blob();

      const W = 100;
      const H = 60;

      const imgBitmap = await createImageBitmap(blob, { resizeWidth: W, resizeHeight: H });
      const scratch = new OffscreenCanvas(W, H);
      const sCtx = scratch.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      if (sCtx === null) {
        imgBitmap.close(); // CR-02 fix: release GPU-backed memory before early return
        return;
      }

      sCtx.drawImage(imgBitmap, 0, 0, W, H);
      imgBitmap.close();

      const imageData = sCtx.getImageData(0, 0, W, H);

      const pal = buildGreyscalePalette();
      const dithered = ditherTile(imageData.data, W, H, pal);

      const pngBytes = new Uint8Array(UPNG.encode([dithered.buffer as ArrayBuffer], W, H, 16));

      this._mapBaseLayer?.setPortraitOverride(this._portraitSlot, pngBytes);
    } catch {
      // Non-fatal — portrait silently omitted on any error (T-21-03c mitigate).
    }
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

/**
 * Draw the static (non-tab-dependent) D&D-sheet chrome onto `ctx`.
 *
 * Feature 001 D3 restyle — a parchment-frame look on the 4-bit phosphor display:
 *   - black background fill
 *   - a DOUBLE-ruled outer frame (outer + inset border) — the classic character-
 *     sheet ledger border
 *   - corner brackets at the four corners (sheet "rivets")
 *   - a double header rule under the tab strip (y=27 + y=29)
 *
 * The content region below y=30 is UNCHANGED so the tab renderers' fixed 27px line
 * grid (and its INV-1 positions) are preserved. The tab strip text is intentionally
 * NOT drawn here so this output can be safely pre-baked into an `ImageBitmap` that
 * stays valid across tab changes (CR-01 fix).
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
  const W = COMPOSITOR_W;
  const H = COMPOSITOR_H;

  // Black background fill.
  ctx.fillStyle = CHROME_BG;
  ctx.fillRect(0, 0, W, H);

  // Double-ruled outer frame (D&D ledger border). Outer at the very edge, inner
  // inset by CHROME_INSET — the two parallel rules read as a character-sheet frame.
  ctx.strokeStyle = CHROME_FG;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.strokeRect(
    CHROME_INSET + 0.5,
    CHROME_INSET + 0.5,
    W - 1 - 2 * CHROME_INSET,
    H - 1 - 2 * CHROME_INSET,
  );

  // Corner brackets — short L-strokes just inside each corner ("sheet rivets").
  _drawCornerBrackets(ctx, W, H);

  // Double header rule under the tab strip (tab strip text sits above y=27).
  ctx.fillStyle = CHROME_FG;
  ctx.fillRect(CHROME_INSET, 27, W - 2 * CHROME_INSET, 1);
  ctx.fillRect(CHROME_INSET, 29, W - 2 * CHROME_INSET, 1);
}

/** Inset (px) of the inner frame rule from the outer edge — the double-border gap. */
const CHROME_INSET = 4;

/** Corner-bracket arm length (px). */
const CHROME_BRACKET = 10;

/**
 * Draw four corner brackets just inside the frame inset — the small L-shaped
 * strokes that give the sheet its "ledger corner" look.
 *
 * @param ctx 2D rendering context.
 * @param w   Canvas width.
 * @param h   Canvas height.
 */
function _drawCornerBrackets(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const m = CHROME_INSET + 3; // bracket origin, just inside the inner rule
  const a = CHROME_BRACKET;
  ctx.fillStyle = CHROME_FG;
  // Each corner = one horizontal + one vertical 1px arm.
  const arms: ReadonlyArray<readonly [number, number, number, number]> = [
    [m, m, a, 1], // top-left  horizontal
    [m, m, 1, a], // top-left  vertical
    [w - m - a, m, a, 1], // top-right horizontal
    [w - m - 1, m, 1, a], // top-right vertical
    [m, h - m - 1, a, 1], // bottom-left horizontal
    [m, h - m - a, 1, a], // bottom-left vertical
    [w - m - a, h - m - 1, a, 1], // bottom-right horizontal
    [w - m - 1, h - m - a, 1, a], // bottom-right vertical
  ];
  for (const [x, y, aw, ah] of arms) {
    ctx.fillRect(x, y, aw, ah);
  }
}

/**
 * Draw the tab strip text onto `ctx` based on the CURRENT active tab index.
 *
 * Called inline on every `paint()` — never pre-baked — so the active-tab
 * highlight always reflects the current gesture state (CR-01 fix).
 *
 * @param ctx           2D rendering context.
 * @param fontFamily    CSS font string.
 * @param activeTabIdx  Currently active tab index for the tab strip highlight.
 */
function _drawTabStrip(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  fontFamily: string,
  activeTabIdx: number,
): void {
  ctx.fillStyle = CHROME_FG;
  ctx.font = fontFamily;
  const tabStripRow = buildTabStrip(activeTabIdx);
  // Indent past the double-frame inset so the strip clears the inner rule.
  ctx.fillText(tabStripRow, 8, 24);
}
