/**
 * CharacterSheetPanel — z=2 overlay panel presenting the 6-tab read-only character
 * sheet (SHEET-01, SHEET-04).
 *
 * ## Tab strip (SHEET-04)
 *
 * Six tabs rendered as a 70-char row on panel row 3:
 *
 * ```
 * ┌─[▶MAI ]─[ SKI ]─[ INV ]─[ SPL ]─[ FEA ]─[ BIO ]────────────────────┐
 * ```
 *
 * Each cell is exactly 7 code-points (`[` + space-or-▶ + 3-char label + space + `]`).
 * The pure helper {@link buildTabStrip} produces this row for any active index.
 * Width is always exactly 70 code-points (verified via `[...result].length === 70`).
 *
 * ## Tab cycle (SHEET-01)
 *
 * - `tap`         → cycle forward (Main → Skills → Inventory → Spells → Feats → Bio → Main)
 * - `scroll-up`   → cycle backward (Main → Bio wraps)
 * - `scroll-down` → cycle forward (same as tap)
 * - `double-tap`  → no-op stub (Phase 6 NAV-01 wires close)
 * - `long-press`  → no-op stub (Phase 6 Quick Action wires this)
 *
 * ## Persistence
 *
 * Last-viewed tab is stored in Even Hub key `view.sheet.lastTab` via
 * `bridge.setLocalStorage` / `bridge.getLocalStorage`. On first-ever mount the key
 * is absent → default is Main. Restored on subsequent mounts.
 *
 * ## Per-tab content
 *
 * Each tab's content area (rows 4–21, 18 content rows × 66 inner columns) is
 * produced by {@link renderTabContent} from `character-sheet-tab-renderers.ts`.
 * Main / Skills / Feats / Bio tabs are fully rendered; Inventory + Spells are
 * stubbed until Plan 05-04 lands.
 *
 * ## Container strategy (Strategy A — ADR-0009 Amendment 1)
 *
 * Single text container `'overlay-block'`. `getContainerCount()` returns
 * `{ image: 0, text: 1 }`. No image containers.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-02-PLAN.md
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §4.2 + §5.2
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-CONTEXT.md §Area 2
 * @see docs/architecture/0009-layer-manager-contract.md Amendment 1
 * @see docs/architecture/0010-panel-plugin-registry.md (ADR-0010)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { parseR1HintString } from '../status-hud/r1-hint-parser.js';
import { renderTabContent } from './character-sheet-tab-renderers.js';
import { getPortraitBytes } from './portrait-state.js';

/**
 * Minimal MapBaseLayer surface used by CharacterSheetPanel for portrait override (D-13-08).
 * Structural interface for testability — MapBaseLayer satisfies it at runtime.
 */
export interface MapBaseLayerLike {
  setPortraitOverride(slot: number, bytes: Uint8Array | null): void;
}

// ─── Tab constants ────────────────────────────────────────────────────────────

/**
 * Ordered tab identifiers — stable kebab-case strings used as storage values
 * in `view.sheet.lastTab` and as discriminants in `renderTabContent`.
 *
 * `as const` produces the narrowest literal-tuple type; downstream plans
 * (`05-03`, `05-04`) import this constant for exhaustive switch coverage.
 */
export const TABS = ['main', 'skills', 'inventory', 'spells', 'feats', 'bio'] as const;

/** Union of valid tab ID strings. */
export type TabId = (typeof TABS)[number];

/**
 * 3-char uppercase ASCII labels rendered in the tab strip (SHEET-04 / UI-SPEC §4.2).
 *
 * Locale-fixed: the 3-char tags are identical across IT/EN/DE/ES/FR/PT-BR to avoid
 * INV-1 layout breaks in narrower locales (CONTEXT.md §Area 2 rationale).
 *
 * Index matches {@link TABS}: `TAB_LABELS[0]` = `'MAI'` corresponds to `TABS[0]` = `'main'`.
 */
export const TAB_LABELS = ['MAI', 'SKI', 'INV', 'SPL', 'FEA', 'BIO'] as const;

// ─── Persistence ─────────────────────────────────────────────────────────────

/**
 * Even Hub key-value key for last-viewed tab persistence.
 *
 * Namespace pattern: `view.<feature>.<setting>` — same pattern as `view.map.mode`
 * from Phase 4b Plan 02. The value stored is the {@link TabId} string.
 */
export const PERSIST_KEY = 'view.sheet.lastTab' as const;

// ─── Tab strip helper ─────────────────────────────────────────────────────────

/**
 * Build the 70-code-point tab strip row for a given active tab index.
 *
 * Produces a single row like:
 *
 * ```
 * ┌─[▶MAI ]─[ SKI ]─[ INV ]─[ SPL ]─[ FEA ]─[ BIO ]────────────────────┐
 * ```
 *
 * Width is always exactly 70 code-points, verified by the internal assertion
 * and enforced by the CHSP-TABSTRIP-* + CHSP-FIX-* tests (INV-1 ck 13).
 *
 * Width accounting:
 * - Prefix `┌─`: 2 code-points
 * - 6 cells joined with `─` separators: 6 × 7 + 5 × 1 = 47 code-points
 * - Trailing `─` padding to col 69 + `┐` closing: variable + 1 code-point
 * - Total: 2 + 47 + trailing + 1 = 70  →  trailing = 20
 *
 * IMPORTANT: width is counted via `[...row].length` (code-point spread), NOT
 * `row.length` (UTF-16 code-unit), because `▶` (U+25B6) and `─` (U+2500) are
 * both BMP code-points (width 1 in code-points AND in JS string length), but
 * adopting the code-point spread is the defensive standard to guard against
 * future glyph additions in the label set (RESEARCH Pitfall 5).
 *
 * @param activeIdx - Index into {@link TABS} / {@link TAB_LABELS} (0 = Main … 5 = Bio)
 * @returns The 70-code-point tab strip row string
 */
export function buildTabStrip(activeIdx: number): string {
  const cells = TAB_LABELS.map((label, i) => (i === activeIdx ? `[▶${label} ]` : `[ ${label} ]`));

  // Join cells with `─` separators (5 separators between 6 cells).
  const joined = cells.join('─');

  // Prefix `┌─` (2 code-points) + joined cells (47 code-points) = 49 code-points.
  // Need 70 total → 70 - 49 - 1 (for `┐`) = 20 trailing dashes.
  const prefix = '┌─';
  const after = prefix + joined;
  const trailing = 70 - [...after].length - 1;
  const row = `${after}${'─'.repeat(trailing)}┐`;

  // Internal invariant assertion — catches mis-counted trailing dashes at dev time.
  // Production build tree-shakes the branch (never throws in tested path).
  if ([...row].length !== 70) {
    throw new Error(
      `[buildTabStrip] INV-1 violated: expected 70 code-points, got ${[...row].length}`,
    );
  }

  return row;
}

// ─── CharacterSheetPanel ──────────────────────────────────────────────────────

/**
 * 6-tab read-only character sheet overlay (z=2).
 *
 * Implements {@link OverlayPanel} verbatim following the ConcentrationDropModalPanel
 * exemplar pattern (constructor shape, `overlay-block` container name, Strategy A
 * single text container, gesture bus subscription lifecycle).
 *
 * Auto-discovered by {@link PanelRouter.discoverPanels} because this file matches
 * the `**\/*-panel.ts` glob and `static meta` passes {@link PanelMetaSchema}.
 */
export default class CharacterSheetPanel implements OverlayPanel {
  /**
   * Static metadata validated by {@link PanelRouter.discoverPanels} at boot.
   *
   * `navKey: 'S'` — Quick Action menu key (Phase 6 wires the gesture).
   * `requiredCaps: []` — Phase 5 panels are read-only and need no server caps.
   * `defaultTab: 'main'` — first-ever mount opens Main tab.
   */
  static meta: PanelMeta = {
    id: 'character-sheet',
    title: { it: 'Scheda', en: 'Sheet', de: 'Blatt' },
    navKey: 'S',
    requiredCaps: [],
    defaultTab: 'main',
  };

  /** Stable panel id matching `static meta.id` (LayerManager + telemetry). */
  public readonly id = 'character-sheet';

  /** Z-index slot — z=2 overlay per ADR-0009 Amendment 1. */
  public readonly z = ZIndex.Z2_OVERLAY;

  // ─── Private state ──────────────────────────────────────────────────────────

  /**
   * Zero-based index into {@link TABS} for the currently visible tab.
   *
   * Restored from Even Hub `view.sheet.lastTab` on {@link onMount}; persisted
   * to the same key on every tab change. Defaults to 0 (Main) when the key is
   * absent or invalid (T-05-02-01 mitigation — defensive `TABS.indexOf` + `Math.max`).
   */
  private activeTabIndex = 0;

  /**
   * Scroll offset within the active tab's content area.
   *
   * Reset to 0 on every tab change (T-05-02-02 mitigation). Plan 05-03's per-tab
   * renderer will clamp this within the content's actual row count.
   */
  private scrollOffset = 0;

  /**
   * Latest character snapshot delivered by the boot orchestrator's WS handler
   * via {@link onSnapshot}.
   *
   * `null` until the first snapshot arrives (race between mount and first WS event).
   * {@link draw} renders defensively when `null` — content area shows the stub
   * "loading" placeholder until a snapshot is available.
   */
  private snapshot: CharacterSnapshot | null = null;

  /**
   * Unsubscribe closure returned by {@link PanelGestureBus.subscribe}.
   *
   * Set in {@link onMount}; invoked and nulled in {@link onUnmount}. The null guard
   * makes `onUnmount` idempotent (T-4b-01-03 mitigation — Phase 4b idempotency
   * pattern proven by CDM-9 / ISM-07).
   */
  private unsubscribe: (() => void) | null = null;

  /**
   * Whether the portrait overlay is enabled (D-13-09 — view.features.portrait Hub key).
   *
   * Read from Even Hub `view.features.portrait` on {@link onMount}. Default `false`.
   * `'on'` → `true`; anything else (including absent key `''`) → `false`.
   */
  private portraitEnabled = false;

  /**
   * Portrait override slot index (D-13-08 — slot 3 = bottom-right raster tile by convention).
   *
   * Configurable here for future Quick Action override; MVP keeps it at 3.
   */
  private readonly portraitSlot = 3;

  // ─── Constructor ────────────────────────────────────────────────────────────

  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly gestureBus: PanelGestureBus,
    private readonly locale: HudLocale,
    /**
     * Optional MapBaseLayer instance for portrait slot override (Plan 13-04 — STRETCH-06).
     *
     * When non-null and `portraitEnabled` is true and portrait bytes are cached for the
     * current actor, `_applyPortraitOverride()` calls `mapBaseLayer.setPortraitOverride`
     * with the decoded portrait bytes. When null (default / test fixture), portrait wiring
     * is silently skipped — no crash.
     *
     * Typed as `MapBaseLayerLike` (structural) for testability (avoids importing the
     * concrete `MapBaseLayer` class here — prevents circular imports via raster/).
     */
    private mapBaseLayer: MapBaseLayerLike | null = null,
  ) {}

  /**
   * Inject the MapBaseLayer dependency post-construction.
   *
   * Called by boot-engine-core via `panelRouter.setPanelInstanceHandler('character-sheet', ...)`
   * BEFORE `onMount` runs — the same injection point used by spellbook/inventory panels for
   * their `setActionOptionsHandler` / `setQuickActionHandler` methods (Plan 08-05 pattern).
   *
   * Allows `PanelRouter.openPanel` to construct CharacterSheetPanel with its 3-arg public
   * constructor signature (bridge, gestureBus, locale) while still threading the boot-time
   * `mapBase` reference that arrives after `discoverPanels()`.
   *
   * @param mapBase - Boot-time MapBaseLayer singleton, or null to clear (tests only).
   */
  setMapBaseLayer(mapBase: MapBaseLayerLike | null): void {
    this.mapBaseLayer = mapBase;
  }

  // ─── OverlayPanel lifecycle ─────────────────────────────────────────────────

  /**
   * Acquire panel resources.
   *
   * 1. Subscribe to the gesture bus — the returned closure is stored for
   *    idempotent unsubscription in {@link onUnmount}.
   * 2. Restore last-viewed tab from Even Hub storage.
   * 3. Issue the initial draw (renders the tab strip + stub content area).
   *
   * LayerManager.bundle awaits this AFTER registering the panel in `layers`
   * and BEFORE the single `rebuildPageContainer` flush (ADR-0009 Amendment 1).
   */
  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
    await this._restoreLastTab();
    // D-13-09: read portrait feature flag from Even Hub kv store.
    await this._readPortraitFlag();
    // Apply portrait override if on Bio tab with portrait enabled + bytes cached.
    if (TABS[this.activeTabIndex] === 'bio') {
      this._applyPortraitOverride();
    }
    await this.draw();
  }

  /**
   * Release gesture bus subscription (T-4b-01-03 mitigation).
   *
   * Idempotent: calling `onUnmount` twice is safe (the null guard prevents a
   * double-free). LayerManager.bundle invokes this BEFORE `destroy()` and the
   * bridge flush.
   */
  async onUnmount(): Promise<void> {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    // Always clear portrait override on unmount (idempotent — null-safe).
    this.mapBaseLayer?.setPortraitOverride(this.portraitSlot, null);
  }

  /**
   * Handle a published R1 gesture (synchronous — schedules its own re-draw).
   *
   * Dispatch table per CONTEXT.md §Area 2 + RESEARCH §Pattern 2:
   * - `tap`          → cycle forward; reset scroll; persist; draw
   * - `scroll-up`    → cycle backward; reset scroll; persist; draw
   * - `scroll-down`  → cycle forward (identical to tap); persist; draw
   * - `double-tap`   → no-op stub (Phase 6 NAV-01)
   * - `long-press`   → no-op stub (Phase 6 Quick Action)
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'tap':
        this.activeTabIndex = (this.activeTabIndex + 1) % TABS.length;
        this.scrollOffset = 0;
        void this._persistLastTab();
        void this.draw();
        break;

      case 'scroll':
        if (gesture.direction === 'up') {
          this.activeTabIndex = (this.activeTabIndex - 1 + TABS.length) % TABS.length;
        } else {
          // scroll-down → forward (same as tap)
          this.activeTabIndex = (this.activeTabIndex + 1) % TABS.length;
        }
        this.scrollOffset = 0;
        void this._persistLastTab();
        void this.draw();
        break;

      case 'double-tap':
        // No-op stub — Phase 6 NAV-01 wires close behaviour.
        break;

      case 'long-press':
        // No-op stub — Phase 6 Quick Action wires this.
        break;
    }
  }

  /**
   * Update the panel with a fresh character snapshot without remounting.
   *
   * Called by the boot orchestrator's WS handler (`character.delta` envelope).
   * Sets `snapshot` in-place and triggers a re-draw — NO `LayerManager.bundle`
   * remount (RESEARCH §Pattern 2 anti-pattern guard: remounting on every snapshot
   * would race with the gesture bus lifecycle).
   *
   * @param newSnapshot - Parsed {@link CharacterSnapshot} from the WS envelope
   */
  onSnapshot(newSnapshot: CharacterSnapshot): void {
    this.snapshot = newSnapshot;
    void this.draw();
  }

  // ─── Layer interface ────────────────────────────────────────────────────────

  /**
   * Render the panel via a single `bridge.textContainerUpgrade` call.
   *
   * Content structure:
   * - Row 0: tab strip row from {@link buildTabStrip} (70 code-points)
   * - Rows 1–18: per-tab content from {@link renderTabContent} (18 rows × 66 code-points)
   *
   * Strategy A: single text container `'overlay-block'`, no image containers.
   * One `textContainerUpgrade` call per draw — no intermediate flushes.
   *
   * Hot-swap behavior (SHEET-02 / RESEARCH §Pattern 3): when `onSnapshot` delivers
   * a new snapshot (e.g., GM toggling `core.modernRules`), draw() is called in-place.
   * NO LayerManager.bundle remount — the panel re-renders its content atomically
   * without unmounting from the z=2 slot.
   */
  async draw(): Promise<void> {
    const tabStrip = buildTabStrip(this.activeTabIndex);
    const bodyRows = renderTabContent(
      TABS[this.activeTabIndex] ?? 'main',
      this.snapshot,
      this.locale,
      this.scrollOffset,
    );

    const content = [tabStrip, ...bodyRows].join('\n');
    const payload = new TextContainerUpgrade({
      containerName: 'overlay-block',
      content,
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /**
   * Tear down the panel — no-op here.
   *
   * Bus unsubscription lives in {@link onUnmount} (LayerManager.bundle calls
   * `onUnmount` BEFORE `destroy`). Strategy A single-container approach does not
   * require explicit container cleanup.
   */
  destroy(): void {
    // Intentionally empty — see method JSDoc.
  }

  /**
   * Container footprint declaration (Strategy A — ADR-0009 Amendment 1).
   *
   * One text container (`overlay-block`), zero image containers. Total page budget
   * at z=2 open: 4 image (map tiles) + 2 text (HUD + overlay-block) = 6 ≤ 8-text cap.
   */
  getContainerCount(): { image: 0; text: 1 } {
    return { image: 0, text: 1 };
  }

  /**
   * R1 hint metadata for the StatusHudRenderer context chip (Plan 06-03).
   *
   * Returns the parsed hint object from the pre-composed `hud_r1_sheet` i18n
   * string — e.g. IT: `{ tap: 'cambia-tab', scroll: 'cont', longPressLabel: 'q[sheet]' }`.
   *
   * The `longPressLabel` always contains `q[sheet]` across all locales — the
   * renderer strips this to verify INV-5 SC-4 (visible enforcement: chip names
   * the live long-press target per overlay-id bracket).
   *
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (visible enforcement)
   * @see packages/g2-app/src/status-hud/i18n-budgets.ts hud_r1_sheet key
   * @see packages/g2-app/src/status-hud/r1-hint-parser.ts parseR1HintString
   */
  getR1Hints(): { readonly tap: string; readonly scroll: string; readonly longPressLabel: string } {
    return parseR1HintString(getLabel('hud_r1_sheet', this.locale));
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Read the `view.features.portrait` Even Hub key and set {@link portraitEnabled}.
   *
   * `'on'` → enabled. Any other value (including absent `''`) → disabled (default off).
   * Non-fatal: a getLocalStorage failure leaves `portraitEnabled = false`.
   *
   * D-13-09: the flag is BOOLEAN-shaped (`'on' | 'off'`); other values fall back to off.
   */
  private async _readPortraitFlag(): Promise<void> {
    try {
      const stored = await this.bridge.getLocalStorage('view.features.portrait');
      this.portraitEnabled = stored === 'on';
    } catch {
      // Non-fatal — portrait stays disabled on storage error.
      this.portraitEnabled = false;
    }
  }

  /**
   * Apply portrait override to MapBaseLayer's reserved image slot (D-13-08 design).
   *
   * Only acts when:
   *   - `portraitEnabled === true` (flag 'on')
   *   - `mapBaseLayer !== null` (injected at construction)
   *   - Portrait bytes are in the `portrait-state` cache for `this.snapshot?.actorId`
   *
   * Decodes the base64 PNG bytes from the cache and calls
   * `mapBaseLayer.setPortraitOverride(portraitSlot, decodedBytes)`.
   *
   * When any condition fails, silently skips (graceful degradation — no portrait shown).
   */
  private _applyPortraitOverride(): void {
    if (!this.portraitEnabled || this.mapBaseLayer === null) {
      return;
    }
    const actorId = this.snapshot?.actorId;
    if (actorId === undefined || actorId.length === 0) {
      return;
    }
    const cached = getPortraitBytes(actorId);
    if (cached === null) {
      return;
    }
    // Decode base64 PNG bytes into a Uint8Array for updateImageRawData.
    // atob is available in browser (Even Realities App WebView) and Node ≥24 globalThis.
    try {
      const binaryString = atob(cached.pngBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      this.mapBaseLayer.setPortraitOverride(this.portraitSlot, bytes);
    } catch {
      // Non-fatal — base64 decode failure silently skips portrait.
    }
  }

  /**
   * Persist the current active tab to Even Hub storage.
   *
   * Non-fatal: a storage failure does not affect the in-memory tab state. The
   * error is logged but never propagated — cosmetic persistence (RESEARCH §Pattern 2
   * non-fatal persistence note).
   */
  private async _persistLastTab(): Promise<void> {
    try {
      await this.bridge.setLocalStorage(PERSIST_KEY, TABS[this.activeTabIndex] ?? 'main');
    } catch (err) {
      console.warn('[CharacterSheetPanel] setLocalStorage failed for', PERSIST_KEY, err);
    }
  }

  /**
   * Restore the last-viewed tab from Even Hub storage.
   *
   * - Valid stored value (`TABS.indexOf(value) >= 0`) → restore `activeTabIndex`.
   * - Invalid or absent value → leave `activeTabIndex` at 0 (Main).
   * - Storage error (getLocalStorage throws) → leave at 0 and warn.
   *
   * T-05-02-01 mitigation: `TABS.indexOf(stored as TabId)` returns -1 for any
   * tampered or unrecognised value; `Math.max(0, -1)` safely defaults to 0 (Main).
   */
  private async _restoreLastTab(): Promise<void> {
    try {
      const stored = await this.bridge.getLocalStorage(PERSIST_KEY);
      if (stored !== '') {
        const idx = TABS.indexOf(stored as TabId);
        this.activeTabIndex = Math.max(0, idx);
      }
      // Empty string → key absent → keep default 0 (first-ever mount path).
    } catch (err) {
      console.warn('[CharacterSheetPanel] getLocalStorage failed for', PERSIST_KEY, err);
      // Defensive: leave activeTabIndex at 0 (Main).
    }
  }
}
