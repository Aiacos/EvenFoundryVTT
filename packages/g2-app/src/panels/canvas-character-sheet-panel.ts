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
 *   2. Pre-bakes the static chrome (tab strip + frame) into an `ImageBitmap`.
 *
 * In happy-dom (no createImageBitmap), `_chromeBitmap` stays `null` and `paint()`
 * falls back to drawing chrome inline (SC2 fallback path).
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
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';
import {
  buildTabStrip,
  type MapBaseLayerLike,
  PERSIST_KEY,
  TABS,
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
   * Active HUD locale forwarded to paint*Tab renderers (Plan 21-04 wires locale-aware rendering).
   *
   * Stored as an instance field (assigned in constructor) to allow runtime locale updates in
   * future phases. Using `_locale` as a parameter name in the constructor avoids
   * TypeScript TS6133 "declared but never read" on the `private readonly` shorthand.
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
   * 1. Blits pre-baked chrome bitmap (GPU-accelerated) or draws chrome inline.
   * 2. Dispatches to the active tab's `paint*Tab` method.
   * 3. Sets `_dirty = false` as the LAST line.
   *
   * Called by `CanvasCompositor` ONLY when `isDirty()` returns `true`.
   */
  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) return;

    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);

    // Chrome layer — GPU-blit pre-baked bitmap or inline fallback.
    if (this._chromeBitmap !== null) {
      ctx.drawImage(this._chromeBitmap, 0, 0);
    } else {
      _drawChrome(ctx, this._fontFamily, this._activeTabIndex);
    }

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
   * 2. Restore last-viewed tab from Even Hub storage.
   * 3. Fire-and-forget the portrait pipeline (`_fetchPortraitAsync`) — must NOT
   *    be awaited here; `LayerManager.bundle` awaits `onMount` and blocking on
   *    a network fetch would delay panel appearance (Pitfall 3 from 21-PATTERNS.md).
   * 4. Set `_dirty = true` so the first composite paints.
   */
  async onMount(): Promise<void> {
    this._unsubscribeGesture = this._gestureBus.subscribe((gesture) => this.onEvent(gesture));
    await this._restoreLastTab();
    void this._fetchPortraitAsync();
    this._dirty = true;
  }

  /**
   * Release gesture bus subscription (T-21-LEAK / T-4b-01-03 mitigation).
   *
   * Idempotent: calling `onUnmount` twice is safe (null guard prevents double-free).
   * Resets `_portraitFetched` so re-opening the panel re-fetches the portrait.
   */
  async onUnmount(): Promise<void> {
    if (this._unsubscribeGesture !== null) {
      this._unsubscribeGesture();
      this._unsubscribeGesture = null;
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
   * Dispatch table (byte-identical to glyph `CharacterSheetPanel`):
   *   - `tap`         → advance tab mod 6; reset scroll; persist; dirty
   *   - `scroll-up`   → decrement tab mod 6; reset scroll; persist; dirty
   *   - `scroll-down` → advance tab mod 6; reset scroll; persist; dirty
   *   - `double-tap`  → no-op; router handles close at bus level (ADR-0012)
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

      case 'scroll':
        if (gesture.direction === 'up') {
          this._activeTabIndex = (this._activeTabIndex - 1 + TABS.length) % TABS.length;
        } else {
          // scroll-down → forward (same as tap)
          this._activeTabIndex = (this._activeTabIndex + 1) % TABS.length;
        }
        this._scrollOffset = 0;
        void this._persistLastTab();
        this._dirty = true;
        break;

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
   * On success: `_chromeBitmap` is set.
   * On failure (happy-dom / no `createImageBitmap`): `_chromeBitmap` stays `null`;
   * `paint()` falls back to `_drawChrome` inline.
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
      _drawChrome(sCtx, this._fontFamily, this._activeTabIndex);
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
   * Note: `_locale` is forwarded here so it's read at runtime; locale-aware
   * rendering in paint*Tab methods is wired in Plan 21-04.
   */
  private _paintActiveTab(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D): void {
    const bounds: PaintBounds = { x: 0, y: 30, w: COMPOSITOR_W, h: COMPOSITOR_H - 30 };
    const tab = TABS[this._activeTabIndex] ?? 'main';
    const font = this._fontFamily;
    // locale forwarded to renderers in Plan 21-04 locale-aware wiring; retained here so
    // the field is read (satisfies TS6133) — remove this line when Plan 21-04 wires it.
    void this._locale;
    switch (tab) {
      case 'main':
        paintMainTab(ctx, this._snapshot, bounds, font);
        break;
      case 'skills':
        paintSkillsTab(ctx, this._snapshot, bounds, font);
        break;
      case 'inventory':
        paintInventoryTab(ctx, this._snapshot, bounds, font);
        break;
      case 'spells':
        paintSpellsTab(ctx, this._snapshot, bounds, font);
        break;
      case 'feats':
        paintFeatsTab(ctx, this._snapshot, bounds, font);
        break;
      case 'bio':
        paintBioTab(ctx, this._snapshot, bounds, font);
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
      await this._bridge.setLocalStorage(PERSIST_KEY, TABS[this._activeTabIndex] ?? 'main');
    } catch (err) {
      console.warn('[CanvasCharacterSheetPanel] setLocalStorage failed for', PERSIST_KEY, err);
    }
  }

  /**
   * Restore the last-viewed tab from Even Hub storage.
   *
   * Valid stored value → restore `_activeTabIndex`.
   * Invalid / absent / error → leave at 0 (Main).
   */
  private async _restoreLastTab(): Promise<void> {
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
      if (sCtx === null) return;

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
 * Draw static chrome (frame + tab strip) onto `ctx`.
 *
 * "Chrome" = everything that does NOT change with character state: outer border,
 * background fill, and the tab strip row. Called:
 *   - During `_prebakeChrome()` onto a scratch OffscreenCanvas (production path).
 *   - Inline from `paint()` when `_chromeBitmap` is null (happy-dom fallback).
 *
 * @param ctx           2D rendering context.
 * @param fontFamily    CSS font string.
 * @param activeTabIdx  Currently active tab index for the tab strip highlight.
 */
function _drawChrome(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  fontFamily: string,
  activeTabIdx: number,
): void {
  // Black background fill.
  ctx.fillStyle = CHROME_BG;
  ctx.fillRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);

  // Outer border — white (brightest palette step → phosphor green on G2).
  ctx.strokeStyle = CHROME_FG;
  ctx.strokeRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);

  // Tab strip separator line at y=27 (first line = tab strip).
  ctx.fillStyle = CHROME_FG;
  ctx.fillRect(0, 27, COMPOSITOR_W, 1);

  // Tab strip text (uses buildTabStrip from character-sheet-panel.ts).
  ctx.fillStyle = CHROME_FG;
  ctx.font = fontFamily;
  const tabStripRow = buildTabStrip(activeTabIdx);
  ctx.fillText(tabStripRow, 2, 24);
}
