/**
 * QuickActionMenuPanel — z=2 overlay panel for the 9-item Quick Action menu.
 *
 * Implements {@link ../engine/layer-types.js#OverlayPanel} verbatim (mirroring
 * the ConcentrationDropModalPanel exemplar from Phase 4b).
 *
 * **Purpose (NAV-02):** An over-scroll gesture (swipe-up at a layer's top
 * boundary) from any mounted panel opens this menu via the router-level
 * over-scroll dispatcher → `PanelRouter.pushOverlay(menu)` (ADR-0012 D-2). The
 * player can navigate to any of the 5 read-only panels, toggle map mode, or
 * change the display locale.
 *
 * **Two modes:**
 *   - `'main'`     — 9-item menu (`[S][C][L][B][I][A][M][N][X]`)
 *   - `'language'` — 7-item locale picker (from `LOCALE_MENU` Phase 5 constant)
 *
 * Mode switches without remounting the panel (state-based rendering, same
 * container). Double-tap in sub-menu returns to main mode (back-one-level);
 * double-tap in main mode calls `callbacks.onClose()` (popOverlay) — ADR-0012 D-3.
 *
 * **Container strategy (Strategy A — ADR-0009 Amendment 1):**
 * Glyph mode: single `'overlay-block'` text container.
 * Canvas mode: writes to the pre-allocated `'hud-capture'` container
 * (zero self-declared container count, satisfying ADR-0013 Amendment 1
 * locked decision #3). Reuses the same container name as
 * `ConcentrationDropModalPanel` (Phase 4b overlay slot design — only one
 * overlay is mounted at z=2 at any time, so no naming collision).
 *
 * **navKey: ''** — empty navKey marks this as a system overlay (Phase 6 Plan 02
 * relaxed `PanelMetaSchema.navKey` to `z.string().max(1)`). QuickActionMenuPanel
 * is filtered out of `discoverPanels()` registry so it never appears in the
 * user-navigable nav set. Constructed directly by the over-scroll dispatcher in
 * Plan 06-04.
 *
 * **INV-5 Gesture Determinism:** `onMount` acquires the gesture bus subscription;
 * `onUnmount` releases it. `PRT-BUS-01/02` asserts `bus.size() === 1` across
 * push/pop lifecycle. The `onUnmount → onMount` round-trip in `popOverlay` restores
 * the suspended panel's subscription (JS reference semantics keep state intact).
 *
 * **Locale persistence (I18N-02 closure):** Tapping a locale in the language
 * sub-menu calls `persistLocaleOverride(bridge, code)` then
 * `localeEvents.emit('changed', code)`. Suspended panels listening on
 * `localeEvents` will re-render with the new locale on restore (Plan 06-04 wires).
 *
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-UI-SPEC.md §1+§2
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q3 (suspension)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md Pitfall 7 (separate emitter)
 * @see docs/architecture/0009-layer-manager-contract.md Amendment 1
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import { resolveContainerIdField } from '../engine/container-registry.js';
import type { CanvasLayer, OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import type { LocaleEventEmitter } from '../locale/locale-events.js';
import { LOCALE_MENU } from '../locale/locale-menu.js';
import { type LocaleOverride, persistLocaleOverride } from '../locale/locale-override.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Stable text-container name for the Quick Action menu payload in glyph mode (Strategy A). */
const QUICK_MENU_CONTAINER_NAME = 'overlay-block' as const;

/** Canvas-mode background fill — black (dithered to darkest G2 palette step). */
const CANVAS_BG = '#000000';

/** Canvas-mode foreground — white (quantized to brightest G2 palette step). */
const CANVAS_FG = '#ffffff';

/** Canvas-mode first item-row baseline y (px) — below the title row. */
const CANVAS_ITEMS_TOP_Y = 40;

/** Canvas-mode item-row pitch (px) — 10 rows at 15px end at y=175+16 < 200. */
const CANVAS_ROW_PITCH = 15;

/** Outer width of the menu box in visible code-points (UI-SPEC §1). */
const MENU_WIDTH = 70;

/** Inner content width (MENU_WIDTH minus `│ ` + ` │` decoration = 66 chars). */
const INNER_WIDTH = 66;

/** Label cell budget (22 chars) — longest DE label 'Schließen' (9) fits with slack. */
const LABEL_BUDGET = 22;

/**
 * Sub-menu nav-keys — positionally map to `LOCALE_MENU` entries.
 * A=Auto, I=Italiano, E=English, D=Deutsch, S=Español, F=Français, P=Português.
 * Per UI-SPEC §2.1. These overlap with main-menu keys (A, S, I) because
 * modes are mutually exclusive — no routing collision.
 */
const SUB_MENU_KEYS = ['A', 'I', 'E', 'D', 'S', 'F', 'P'] as const;

/**
 * Main menu item definitions (9 items per UI-SPEC §1 + plan spec).
 *
 * `action` drives the `_activateCurrentItem` dispatch table:
 *   - `'navigate'`       — calls `callbacks.onNavigate(target)` + `callbacks.onClose()`
 *   - `'open-sub-menu'`  — switches `mode` to `'language'`
 *   - `'map-mode-toggle'`— calls `callbacks.onMapModeToggle()` + `callbacks.onClose()`
 *   - `'action-stub'`    — calls `callbacks.onAction()` + `callbacks.onClose()` (Phase 7 wires real [A])
 *   - `'close'`          — calls `callbacks.onClose()` only
 */
const MAIN_ITEMS = [
  { key: 'S', i18nKey: 'quick_item_sheet', action: 'navigate', target: 'character-sheet' },
  { key: 'C', i18nKey: 'quick_item_combat', action: 'navigate', target: 'combat-tracker' },
  { key: 'L', i18nKey: 'quick_item_log', action: 'navigate', target: 'log' },
  { key: 'B', i18nKey: 'quick_item_book', action: 'navigate', target: 'spellbook' },
  { key: 'I', i18nKey: 'quick_item_inventory', action: 'navigate', target: 'inventory' },
  { key: 'A', i18nKey: 'quick_item_action', action: 'action-stub', target: undefined },
  { key: 'M', i18nKey: 'quick_item_map', action: 'map-mode-toggle', target: undefined },
  { key: 'N', i18nKey: 'quick_item_language', action: 'open-sub-menu', target: undefined },
  { key: 'F', i18nKey: 'quick_item_fps', action: 'fps-toggle', target: undefined },
  { key: 'D', i18nKey: 'quick_item_dither', action: 'dither-toggle', target: undefined },
  { key: 'X', i18nKey: 'quick_item_close', action: 'close', target: undefined },
] as const;

// ─── Callbacks type ───────────────────────────────────────────────────────────

/**
 * Callbacks injected by the over-scroll dispatcher (Plan 06-04 wires these).
 *
 * These are plain function references — not re-exported from PanelRouter or
 * LayerManager to keep the panel module dependency-free from the router.
 *
 * **CR-01 contract:** `onNavigate` is responsible for clearing the overlay
 * suspension stack (via `panelRouter.clearOverlayStack()`) AND opening the
 * target panel (via `panelRouter.openPanel`). The `'navigate'` dispatch case
 * MUST NOT additionally call `onClose` — doing so would race `openPanel`'s
 * `_closeActiveInternal` and destroy the freshly mounted target panel.
 */
export interface QuickActionMenuCallbacks {
  /** Called to close the menu (typically `panelRouter.popOverlay(lm)`). */
  onClose: () => void;
  /**
   * Called with the target panel ID when a navigate item is selected.
   *
   * The implementation in `boot-engine-core.ts` clears the overlay stack
   * (so `popOverlay` won't erroneously restore a stale suspended panel)
   * and then calls `openPanel(target, deps)`. It does NOT call `popOverlay`
   * — `openPanel` closes the current z=2 occupant (the menu) itself via
   * `_closeActiveInternal`. This is the correct single-entry-point contract.
   */
  onNavigate: (panelId: string) => void;
  /** Called when the user selects [M] Map mode toggle. */
  onMapModeToggle: () => void;
  /** Called when the user selects [A] Action (Phase 7 stub). */
  onAction: () => void;
  /**
   * Called when the user selects [F] FPS — toggles the small fps indicator
   * on the hud-status row (default ON; persisted in the Even Hub kv store).
   * Optional so existing construction sites compile unchanged; the dispatch
   * case no-ops when absent.
   */
  onFpsToggle?: () => void;

  /**
   * Called when the user selects [D] Dither — toggles the HUD raster dither
   * mode between Bayer 4×4 ordered-dither (ON, default) and direct
   * nearest-of-16-level quantization (OFF). The boot engine persists the new
   * mode to the Even Hub kv store and triggers a render cycle.
   * Optional so existing construction sites compile unchanged; the dispatch
   * case no-ops when absent.
   */
  onDitherToggle?: () => void;
}

// ─── QuickActionMenuPanel ────────────────────────────────────────────────────

/**
 * z=2 system overlay — Quick Action main menu + `[N] Language` sub-menu.
 *
 * Constructed directly by the over-scroll dispatcher (Plan 06-04); never
 * discovered via `discoverPanels()` (empty `navKey` filters it out).
 *
 * Dual-interface in canvas mode (debug `canvas-sheet-overlay-wont-open`,
 * 2026-06-09): also implements `CanvasLayer` (`attachCanvas`/`paint`/`isDirty`)
 * so `LayerManager.bundle()` registers it with the `CanvasCompositor` at z=2 and
 * the menu is painted INTO the raster tiles. The previous canvas-mode approach
 * (textContainerUpgrade into `hud-capture`) could never be visible: the capture
 * container is declared LAST in the HUD raster page schema, so the G2 host
 * renders the 4 opaque image tiles ON TOP of it (container-registry.ts §hud-capture).
 */
export class QuickActionMenuPanel implements OverlayPanel, CanvasLayer {
  /**
   * Static meta — `navKey: ''` marks this as a system overlay (Phase 6 Plan 02).
   *
   * `PanelMetaSchema` relaxed to `z.string().max(1)` accepts the empty string.
   * `discoverPanels()` silently skips empty-navKey panels (expected exclusion).
   */
  static readonly meta: PanelMeta = {
    id: 'quick-action-menu',
    title: { it: 'Azione Rapida', en: 'Quick Action', de: 'Schnellaktion' },
    navKey: '',
    requiredCaps: [],
  };

  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'quick-action-menu';
  /** Opt-in: this panel handles double-tap internally (ADR-0012 D-3). */
  public readonly handlesDoubleTap = true as const;

  private readonly bridge: EvenAppBridge;
  private readonly gestureBus: PanelGestureBus;
  private readonly locale: HudLocale;
  private readonly currentLocaleOverride: LocaleOverride;
  private readonly localeEvents: LocaleEventEmitter;
  private readonly callbacks: QuickActionMenuCallbacks;

  /**
   * Render mode passed at construction — `'canvas'` or `'glyph'`.
   *
   * In canvas mode the menu writes to the pre-allocated `'hud-capture'`
   * container (ADR-0013 Amendment 1) and declares zero container count.
   * In glyph mode it allocates `'overlay-block'` and declares text:1.
   */
  private readonly renderMode: 'canvas' | 'glyph';

  /**
   * Unsubscribe closure returned by {@link PanelGestureBus.subscribe}.
   *
   * Set in `onMount`; called and nulled in `onUnmount`. Null guard makes
   * `onUnmount` idempotent (T-4b-01-03 mitigation from ConcentrationDropModalPanel exemplar).
   */
  private unsubscribe: (() => void) | null = null;

  /** Rendering mode — `'main'` (9 items) or `'language'` (7 LOCALE_MENU entries). */
  private mode: 'main' | 'language' = 'main';

  /** Currently highlighted row index within the active mode. */
  private activeIndex = 0;

  /** 2D context of the per-layer canvas — null until `attachCanvas` succeeds. */
  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

  /** Resolved font string (`'16px VT323'` or monospace fallback). */
  private _fontFamily = '16px monospace';

  /**
   * Dirty flag — `true` at construction so the first composite always paints.
   * Reset to `false` as the LAST statement of `paint()` (RFONT-03 pattern).
   */
  private _dirty = true;

  /**
   * Construct the Quick Action menu panel.
   *
   * @param bridge                Even Hub bridge handle for `textContainerUpgrade` render call.
   * @param gestureBus            In-process gesture pub/sub — subscribed in `onMount`.
   * @param locale                Active HUD locale — drives label lookup via `getLabel`.
   * @param currentLocaleOverride Currently stored locale override — determines initial
   *                              active row in language sub-menu (pre-selects saved locale).
   * @param localeEvents          Locale change emitter — called after locale is persisted.
   * @param callbacks             Dispatcher-injected callbacks for navigation + lifecycle.
   * @param renderMode            Render mode — `'canvas'` (uses `hud-capture`, zero container count)
   *                              or `'glyph'` (allocates `overlay-block`, text:1 count).
   *                              Defaults to `'glyph'` for backward compatibility.
   */
  constructor(
    bridge: EvenAppBridge,
    gestureBus: PanelGestureBus,
    locale: HudLocale,
    currentLocaleOverride: LocaleOverride,
    localeEvents: LocaleEventEmitter,
    callbacks: QuickActionMenuCallbacks,
    renderMode: 'canvas' | 'glyph' = 'glyph',
  ) {
    this.bridge = bridge;
    this.gestureBus = gestureBus;
    this.locale = locale;
    this.currentLocaleOverride = currentLocaleOverride;
    this.localeEvents = localeEvents;
    this.callbacks = callbacks;
    this.renderMode = renderMode;
  }

  // ─── OverlayPanel lifecycle ───────────────────────────────────────────────

  /**
   * Subscribe to the gesture bus.
   *
   * LayerManager.bundle awaits this AFTER the panel is registered in `layers`
   * and BEFORE the single `rebuildPageContainer` flush (ADR-0009 Amendment 1).
   * INV-5: the subscription makes this panel the sole R1 gesture receiver while
   * mounted (PRT-BUS-01/02 enforcement).
   */
  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
  }

  /**
   * Release the gesture bus subscription.
   *
   * Idempotent (null guard on `this.unsubscribe`). T-4b-01-03 mitigation:
   * failure to unsubscribe would leak a closure causing `bus.size()` drift.
   */
  async onUnmount(): Promise<void> {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Handle a published R1 gesture.
   *
   * Dispatch table per UI-SPEC §1 + §2 (ADR-0012 D-3 — double-tap = close/back):
   *   - `scroll` → cycle `activeIndex` within the current mode + re-draw
   *   - `tap`    → activate the current item (mode-dependent)
   *   - `double-tap` → in sub-menu: return to main mode; in main: `onClose()`
   */
  onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'scroll') {
      this._cycleIndex(gesture.direction === 'up' ? -1 : 1);
      void this.draw();
    } else if (gesture.kind === 'tap') {
      void this._activateCurrentItem();
    } else if (gesture.kind === 'double-tap') {
      if (this.mode === 'language') {
        // Back one level — return to main mode, keep [N] focused.
        this.mode = 'main';
        this.activeIndex = 7; // [N] Language row
        void this.draw();
      } else {
        // Close the menu (popOverlay restores the suspended panel).
        this.callbacks.onClose();
      }
    }
  }

  /**
   * INV-5 over-scroll boundary probe (ADR-0012 D-2).
   *
   * Returns `true` when the active selection is at index 0 (top of the list), so
   * a swipe-up at this point is an over-scroll. (The menu is itself an overlay,
   * so re-opening Quick Action over it is benign; the probe keeps the contract
   * uniform across layers.)
   */
  isAtTopBoundary(): boolean {
    return this.activeIndex === 0;
  }

  // ─── CanvasLayer interface (canvas mode) ──────────────────────────────────

  /**
   * Store the per-layer canvas and resolve the VT323 font.
   *
   * Called by `LayerManager.bundle()` STEP 2.5 before the first composite.
   * Awaiting the font load here guarantees the first `paint()` uses VT323
   * (Q1 resolution — same contract as `CanvasCharacterSheetPanel`).
   */
  async attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<void> {
    this._ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    this._fontFamily = await ensureVt323Loaded();
    this._dirty = true;
  }

  /**
   * Dirty-gate consumed by `CanvasCompositor` — paint only when state changed.
   */
  isDirty(): boolean {
    return this._dirty;
  }

  /**
   * Paint the compact menu box onto the layer canvas (400×200).
   *
   * Layout (VT323 16px — the 70-char glyph box from `_buildLines()` would be
   * ~560px wide and cannot fit the 400px raster region):
   *   - opaque background fill (modal — covers map/sheet below in z-order)
   *   - 1px border + title row `[ TITLE ]`
   *   - 9 (main) or 7 (language) item rows: `▶ [S] Label` / `  [S] Label`
   *
   * Resets `_dirty = false` as its LAST statement (RFONT-03 pattern).
   */
  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) {
      return;
    }

    // Background + border chrome.
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
    ctx.strokeStyle = CANVAS_FG;
    ctx.lineWidth = 1;
    ctx.strokeRect(1.5, 1.5, COMPOSITOR_W - 3, COMPOSITOR_H - 3);

    // Title row.
    const isMain = this.mode === 'main';
    const title = getLabel(isMain ? 'quick_menu_title' : 'quick_lang_submenu_title', this.locale);
    ctx.font = this._fontFamily;
    ctx.fillStyle = CANVAS_FG;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`[ ${title} ]`, 12, 22);

    // Item rows — reuse the same source-of-truth item arrays as glyph mode.
    const rows: Array<{ navKey: string; label: string }> = isMain
      ? MAIN_ITEMS.map((item) => ({ navKey: item.key, label: getLabel(item.i18nKey, this.locale) }))
      : LOCALE_MENU.map((entry, idx) => ({
          navKey: SUB_MENU_KEYS[idx] ?? '?',
          label: entry.nativeLabel,
        }));
    rows.forEach((row, idx) => {
      const marker = idx === this.activeIndex ? '▶ ' : '  ';
      const y = CANVAS_ITEMS_TOP_Y + idx * CANVAS_ROW_PITCH;
      ctx.fillText(`${marker}[${row.navKey}] ${row.label}`, 12, y);
    });

    this._dirty = false;
  }

  // ─── Render dispatch ───────────────────────────────────────────────────────

  /**
   * Render the menu.
   *
   * Glyph mode: single `bridge.textContainerUpgrade` call with the 70-char box
   * rows from `_buildLines()`.
   *
   * Canvas mode: set the dirty flag only — the `CanvasCompositor` calls
   * `paint()` on the next composite cycle (scheduled by `HudDeltaDriver` via
   * the `'r1.gesture'` channel or `requestCycle()`). No SDK text call is made:
   * writing into `hud-capture` is invisible behind the opaque image tiles.
   */
  async draw(): Promise<void> {
    if (this.renderMode === 'canvas') {
      this._dirty = true;
      return;
    }
    const lines = this._buildLines();
    const payload = new TextContainerUpgrade({
      // Overlay-only name → resolveContainerIdField returns {} (no containerId
      // field); the overlay-block container is addressed by name (Strategy A).
      ...resolveContainerIdField(QUICK_MENU_CONTAINER_NAME),
      containerName: QUICK_MENU_CONTAINER_NAME,
      content: lines.join('\n'),
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /**
   * Tear down the panel — no-op here.
   *
   * Bus unsubscribe lives in `onUnmount`. Strategy A single-container approach
   * needs no per-container cleanup (contrast with future multi-container panels).
   */
  destroy(): void {
    // Intentionally empty — subscription released in onUnmount.
  }

  /**
   * Container footprint per ADR-0009 Amendment 1 / ADR-0013 Amendment 1.
   *
   * Glyph mode: one text container (`overlay-block`), zero image containers.
   * Canvas mode: zero image, zero text — the pre-allocated `hud-capture`
   * container is not self-declared by the overlay (ADR-0013 Amendment 1,
   * locked decision #3).
   */
  getContainerCount(): { image: 0; text: 0 } | { image: 0; text: 1 } {
    return this.renderMode === 'canvas' ? { image: 0, text: 0 } : { image: 0, text: 1 };
  }

  /**
   * R1 hint metadata for the status-HUD context chip (Plan 06-03 consumer).
   *
   * Main mode: tap=open item, scroll=change selection, double-tap=cancel (close).
   * Language sub-menu: tap=apply locale, scroll=cycle locales, double-tap=back.
   *
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (visible enforcement)
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2
   */
  getR1Hints(): {
    readonly tap: string;
    readonly scroll: string;
    readonly quickActionLabel: string;
  } {
    if (this.mode === 'language') {
      return {
        tap: getLabel('quick_r1_lang_tap', this.locale),
        scroll: getLabel('quick_r1_lang_scroll', this.locale),
        quickActionLabel: getLabel('quick_r1_lang_long', this.locale),
      };
    }
    return {
      tap: getLabel('quick_r1_main_tap', this.locale),
      scroll: getLabel('quick_r1_main_scroll', this.locale),
      quickActionLabel: getLabel('quick_r1_main_long', this.locale),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Cycle `activeIndex` by `delta` with modulo wrap.
   *
   * Handles negative delta (scroll up wraps around correctly via the
   * `((x % len) + len) % len` idiom — no negative modulo issues in JS).
   */
  private _cycleIndex(delta: number): void {
    const len = this.mode === 'main' ? MAIN_ITEMS.length : LOCALE_MENU.length;
    this.activeIndex = (((this.activeIndex + delta) % len) + len) % len;
  }

  /**
   * Activate the currently highlighted item.
   *
   * Mode-dispatched:
   *   - `'main'`     — switch on `MAIN_ITEMS[activeIndex].action`
   *   - `'language'` — persist locale + emit changed + return to main
   *
   * `_activateCurrentItem` is `async` because `persistLocaleOverride` is
   * async (Even Hub kv write). The bus event handler calls it with `void`
   * (fire-and-forget) to stay synchronous at the `onEvent` boundary.
   */
  private async _activateCurrentItem(): Promise<void> {
    if (this.mode === 'language') {
      const entry = LOCALE_MENU[this.activeIndex];
      if (entry === undefined) return;
      const code = entry.code;
      await persistLocaleOverride(this.bridge, code);
      this.localeEvents.emit('changed', code);
      // Return to main mode, focus [N] Language row.
      this.mode = 'main';
      this.activeIndex = 7;
      void this.draw();
      return;
    }

    // Main mode dispatch table.
    const item = MAIN_ITEMS[this.activeIndex];
    if (item === undefined) return;

    switch (item.action) {
      case 'navigate':
        // CR-01: call ONLY onNavigate — do NOT call onClose.
        // onNavigate (in boot-engine-core.ts) calls clearOverlayStack() then
        // openPanel(), which internally destroys the menu via _closeActiveInternal.
        // Calling onClose concurrently would race openPanel and destroy the
        // freshly mounted target panel before it could be seen by the user.
        this.callbacks.onNavigate(item.target);
        break;
      case 'open-sub-menu': {
        this.mode = 'language';
        // Pre-select the currently saved locale override in the sub-menu.
        const savedIdx = LOCALE_MENU.findIndex((e) => e.code === this.currentLocaleOverride);
        this.activeIndex = savedIdx >= 0 ? savedIdx : 0;
        void this.draw();
        break;
      }
      case 'map-mode-toggle':
        this.callbacks.onMapModeToggle();
        this.callbacks.onClose();
        break;
      case 'fps-toggle':
        this.callbacks.onFpsToggle?.();
        this.callbacks.onClose();
        break;
      case 'dither-toggle':
        this.callbacks.onDitherToggle?.();
        this.callbacks.onClose();
        break;
      case 'action-stub':
        this.callbacks.onAction();
        this.callbacks.onClose();
        break;
      case 'close':
        this.callbacks.onClose();
        break;
    }
  }

  /**
   * Build the full row array for the current mode.
   *
   * Pure function over `this.mode + this.activeIndex + this.locale + this.currentLocaleOverride`.
   * Returns an array of strings where each string represents one row of the overlay box.
   *
   * Layout per UI-SPEC §1 (main mode) + §2 (language mode):
   * - 1 top border row (70 chars)
   * - 1 title row (70 chars)
   * - 1 spacer row (70 chars)
   * - 9 or 7 item rows (70 chars each)
   * - 1 bottom border row (70 chars)
   * - 3 footer hint rows (70 chars each)
   *
   * @returns Array of strings — joined with `\n` by `draw()` before the bridge call.
   */
  private _buildLines(): string[] {
    const isMain = this.mode === 'main';
    const title = getLabel(isMain ? 'quick_menu_title' : 'quick_lang_submenu_title', this.locale);

    // Top border: ┌─[ TITLE ]──────... ─┐
    // Total width = MENU_WIDTH (70). Structure: ┌ + (MENU_WIDTH-2) inner chars + ┐
    // Inner = ─ + [ TITLE ] + trailing ─ chars filling to (MENU_WIDTH - 2).
    const titleBracket = `[ ${title} ]`;
    // After the leading ┌─, we have used 1 (┌) + 1 (─) = 2 chars.
    // Remaining inner: (MENU_WIDTH - 2) - 1 (─ before bracket) - titleBracket.length = trailing dashes.
    const topInnerLen = MENU_WIDTH - 2; // 68 chars between ┌ and ┐
    const topDashes = '─'.repeat(topInnerLen - 1 - titleBracket.length);
    const topBorder = `┌─${titleBracket}${topDashes}┐`;

    // Bottom border: └──...──┘
    const bottomBorder = `└${'─'.repeat(MENU_WIDTH - 2)}┘`;

    // Spacer row: │ + 68 spaces + │ = 70 chars total (same border structure as item rows)
    const spacer = `│${' '.repeat(MENU_WIDTH - 2)}│`;

    // Item rows
    const itemRows: string[] = isMain ? this._buildMainItems() : this._buildLanguageItems();

    // Footer hint rows (3 lines) — below the bottom border
    const hintScroll = getLabel('quick_hint_scroll', this.locale);
    const hintTap = getLabel('quick_hint_tap', this.locale);
    // Close/back affordance (double-tap, ADR-0012 D-3); hint text owned by i18n slice.
    const hintClose = getLabel('quick_hint_long', this.locale);

    return [
      topBorder,
      spacer,
      ...itemRows,
      bottomBorder,
      _padRow(hintScroll, MENU_WIDTH),
      _padRow(hintTap, MENU_WIDTH),
      _padRow(hintClose, MENU_WIDTH),
    ];
  }

  /** Build the 9 main-mode item rows (UI-SPEC §1.2). */
  private _buildMainItems(): string[] {
    return MAIN_ITEMS.map((item, idx) => {
      const isActive = idx === this.activeIndex;
      const label = getLabel(item.i18nKey, this.locale);
      return _buildItemRow(isActive, item.key, label);
    });
  }

  /** Build the 7 language sub-menu item rows (UI-SPEC §2.1). */
  private _buildLanguageItems(): string[] {
    return LOCALE_MENU.map((entry, idx) => {
      const isActive = idx === this.activeIndex;
      const navKey = SUB_MENU_KEYS[idx] ?? '?';
      return _buildItemRow(isActive, navKey, entry.nativeLabel);
    });
  }
}

// ─── Module-level helpers (not exported) ─────────────────────────────────────

/**
 * Build a single item row for the Quick Action menu.
 *
 * Row format per UI-SPEC §1.2 (70 chars total, 66 inner):
 * `│ [active 2 chars][navKey 4 chars][label padded to 22] ...spaces... │`
 *
 * Breakdown:
 *   - `│ ` — left border + space (2 chars)
 *   - `▶ ` or `  ` — active marker (2 chars)
 *   - `[X] ` — nav-key cell (4 chars)
 *   - label padded/truncated to LABEL_BUDGET (22 chars)
 *   - trailing spaces to INNER_WIDTH (66 chars total inner)
 *   - ` │` — right border (2 chars)
 *
 * Total: 2 + 2 + 4 + 22 + ... = padded to 66 inner + 4 outer = 70 visible.
 */
function _buildItemRow(isActive: boolean, navKey: string, label: string): string {
  const prefix = isActive ? '▶ ' : '  ';
  const navCell = `[${navKey}] `;
  // Truncate label to LABEL_BUDGET code-points (INV-1 — never reflow)
  const labelCps = [...label];
  let paddedLabel: string;
  if (labelCps.length > LABEL_BUDGET) {
    paddedLabel = `${labelCps.slice(0, LABEL_BUDGET - 1).join('')}…`;
  } else {
    paddedLabel = `${label}${' '.repeat(LABEL_BUDGET - labelCps.length)}`;
  }

  // The content inside the │ │ borders:
  // prefix(2) + navCell(4) + paddedLabel(22) = 28 chars used
  // Remaining: INNER_WIDTH(66) - 2(prefix) - 4(navKey) - 22(label) = 38 trailing spaces
  const trailingSpaces = ' '.repeat(INNER_WIDTH - 2 - 4 - LABEL_BUDGET);
  const inner = `${prefix}${navCell}${paddedLabel}${trailingSpaces}`;

  return `│ ${inner} │`;
}

/**
 * Pad a short text row to exactly `width` visible code-points.
 *
 * Used for the 3 footer hint rows below the bottom border. If the text is
 * longer than `width - 2`, it is truncated with `…` (INV-1 — never reflow).
 * Left-padded with 2 spaces for visual breathing room from the left edge.
 */
function _padRow(text: string, width: number): string {
  const indented = `  ${text}`;
  const cps = [...indented];
  if (cps.length >= width) {
    return `${cps.slice(0, width - 1).join('')}…`;
  }
  return `${indented}${' '.repeat(width - cps.length)}`;
}
