/**
 * Status HUD renderer — produces the full-width ~9-row 27px-grid character status
 * sheet from a `CharacterSnapshot`.
 *
 * ## HUD-27PX redesign (quick-260605-j0t)
 *
 * The G2 LVGL font has a **fixed 27px line height** (no font control per SDK).
 * Screen dimensions: 576×288 px → ~10 rows max; full-width line ≈ ~50 chars
 * (variable-width font measured by @evenrealities/pretext).
 *
 * The original 28×21 corner card was designed for a ~12px/24-row grid — text
 * appeared ~2.25× too big on real glasses ("scritte troppo grandi", 2026-06-05).
 * This renderer replaces the default always-on view with an 8-row full-width sheet:
 *
 * ```
 *   Dante Lanzulli            Lv10 —
 *   ——————————————————————————————————————————
 *   PF ████░░░░ 41/63   CA 16   VEL —
 *   Turno —   Round —   [—]
 *   Cond: concentrato, benedetto
 *   ——————————————————————————————————————————
 *   Slot 1●○○○  2●●○  3●○
 *   TS morte  ○○○ / ○○○
 * ```
 *
 * **8-row layout (not 9):** 8×27=216px ≤ h=234 (status-hud id6). The 9th row
 * (R1 gesture hints) was removed from the body because: (a) it overflows the
 * 234px container (9×27=243px > 234px), pushing content into the footer strip;
 * and (b) the footer container (id5) already renders the R1 hint chip via
 * `renderContextChip` / hud-chrome — duplicating it in the body sheet is
 * redundant. (Quick Task 260605-j0t-05)
 *
 * ## API contract
 *
 * Three public render entry-points:
 *   - `renderLoading()` — first boot; HP as `…`, everything else as `—`.
 *   - `renderMissing()` — bridge up, no character; everything as `—`.
 *   - `render(snapshot)` — full populated sheet from a CharacterSnapshot.
 *
 * All methods return a **multi-line `string`** (lines joined with `\n`, no trailing
 * newline). The caller (StatusHudLayer) passes the result directly to
 * `bridge.textContainerUpgrade({ content })`. The old AsciiGrid output is gone —
 * the new container is full-width and multi-line, not a 28-char narrow card.
 *
 * ## Width budget (INV-1)
 *
 * Every line is measured with `getTextWidth()` from `@evenrealities/pretext` and
 * truncated with `…` if it would exceed 576px. The WIDTH-ASSERTION test in
 * `status-hud-renderer.test.ts` enforces this programmatically (build breaks if
 * any line ever exceeds the budget).
 *
 * ## Data-gap placeholders (HUD-27PX)
 *
 * `CharacterSnapshot` does NOT carry class label, speed/velocity, or
 * turn/round/your-turn. Per the "never simplify, surface the gap" rule these
 * fields render as `—` (em-dash) with explicit TODO markers. The width-assertion
 * test still budgets placeholder-bearing lines against 576px.
 *
 * ## Preserved public API
 *
 * Methods still called by overlay panels or StatusHudLayer are preserved:
 *   - `setMode(mode)` — still supported (death-saves → same sheet with ds overlay).
 *   - `setMovementBudget(budget)` — preserved (no-op in default view; overlays use it).
 *   - `setActionEconomy(state)` — preserved (no-op in default view; overlays use it).
 *   - `renderContextChip(lm, locale, opts)` — preserved for StatusHudLayer footer wiring.
 *   - `locale` — preserved as a public readonly field.
 *
 * @see .planning/quick/260605-j0t-redesign-the-g2-hud-for-the-real-27px-fo/260605-j0t-PLAN.md
 * @see /home/aiacos/.claude/projects/-home-aiacos-workspace-EvenFoundryVTT/memory/hud-27px-layout-redesign.md
 * @see packages/g2-app/src/status-hud/i18n-budgets.ts (HUD_WIDTH_BUDGETS)
 * @see docs/architecture/0001-layered-ui-model.md (ADR-0001 — amended by HUD-27PX)
 */

import { getTextWidth, pxTruncate } from '@evenrealities/pretext';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { buildSyncLostChip } from '../engine/sync-lost-chip.js';
import { getLabel, type HudLocale } from './i18n-budgets.js';
import { parseR1HintString } from './r1-hint-parser.js';

// ──────────────────────────────────────────────────────────────────────────────
// Public types preserved for compatibility with overlay callers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Map mode determines whether the `[GLY]` badge is visible.
 *
 * In the HUD-27PX redesign the default view is the character status sheet,
 * NOT the raster map. The mapMode is preserved for future map-mode toggle
 * (DEFERRED — see Specs §7.4 "Map mode (gesture-opened, future)").
 */
export type StatusHudMapMode = 'raster' | 'glyph';

/**
 * Rendering mode — `'standard'` is the character status sheet; `'death-saves'`
 * shows the 3-strike tracker. Switched via {@link StatusHudRenderer.setMode}.
 *
 * In the HUD-27PX renderer the death-saves state is incorporated into the
 * same 9-line full-width sheet layout.
 */
export type StatusHudMode = 'standard' | 'death-saves';

/** Constructor options for the renderer. */
export interface StatusHudRendererOpts {
  /** Active locale — drives label substitution via i18n-budgets table. */
  readonly locale: HudLocale;
  /**
   * Map mode — preserved for future gesture-opened map mode.
   * DEFERRED per Specs §7.4 deferred-map-mode note.
   */
  readonly mapMode?: StatusHudMapMode;
  /**
   * Initial rendering mode (default `'standard'`). Callers use
   * {@link StatusHudRenderer.setMode} to flip into `'death-saves'`.
   */
  readonly mode?: StatusHudMode;
}

/**
 * Action economy widget state (preserved for overlay callers — Phase 9).
 *
 * @see packages/shared-protocol/src/payloads/action-economy.ts ActionEconomyPayload
 */
export interface ActionEconomyWidgetState {
  readonly actionsUsed: 0 | 1;
  readonly bonusActionsUsed: 0 | 1;
  readonly reactionsUsed: 0 | 1;
  readonly multiAttackInProgress: boolean;
  readonly multiAttack?: { readonly current: number; readonly total: number };
}

/**
 * Minimal layer shape consumed by {@link StatusHudRenderer.renderContextChip}.
 */
export interface R1HintProvider {
  getR1Hints?(): {
    readonly tap: string;
    readonly scroll: string;
    readonly quickActionLabel: string;
  };
}

/**
 * Narrow LayerManager interface for StatusHudRenderer dependency injection.
 */
export interface LayerManagerLike {
  getTopLayer(): R1HintProvider | null;
}

/**
 * Default R1 hint values used when no overlay layer provides `getR1Hints()`.
 *
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q3
 */
export const DEFAULT_R1_HINTS = Object.freeze({
  tap: 'cycle',
  scroll: 'nav',
  quickActionLabel: 'quick',
} as const);

// ──────────────────────────────────────────────────────────────────────────────
// Layout constants (27px grid)
// ──────────────────────────────────────────────────────────────────────────────

/** G2 display full-width pixel budget. */
const G2_MAX_PX = 576;

/**
 * Row count for the full-width 27px status sheet.
 * 8 rows: name/level | divider | HP/CA/VEL | Turn row | Conditions |
 *         divider | Slots | Death saves
 *
 * WHY 8 NOT 9: status-hud (id6) has h=234px → 8×27=216px ≤ 234px (fits).
 * A 9th row (R1 hints) would need 9×27=243px > 234px → overflows into footer.
 * R1 hints are already in the footer (id5) via renderContextChip / hud-chrome.
 * (j0t-05)
 */
const SHEET_ROWS = 8;

/** Em-dash missing-scalar placeholder (project-wide convention). */
const EM_DASH = '—';
/** Loading-state HP placeholder. */
const ELLIPSIS = '…';

/** HP bar glyph count (~10 glyphs fills roughly half the HP row in the new layout). */
const HP_BAR_GLYPHS = 10;

/** Divider character repeated across the full visible width. */
const DIVIDER_CHAR = '─';
/** Approximate divider length for the full-width sheet (pixel-safe, trimmed if needed). */
const DIVIDER_LEN = 44;

// ──────────────────────────────────────────────────────────────────────────────
// Full-width renderer
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Stateless renderer for the always-visible z=1 full-width character status sheet.
 *
 * Construct once per layer instance; `locale` and `mapMode` are fixed at
 * construction time. Subsequent `render`/`renderLoading`/`renderMissing` calls
 * produce fresh string values on every invocation (no caching).
 *
 * @see packages/g2-app/src/status-hud/status-hud-layer.ts (consumer)
 */
export class StatusHudRenderer {
  /**
   * Active locale — exposed for StatusHudLayer to pass as the `locale`
   * argument to {@link renderContextChip} without re-storing it separately.
   */
  public readonly locale: HudLocale;

  /**
   * Map mode stored for the deferred gesture-opened map mode (Specs §7.4).
   *
   * Exposed via {@link getMapMode} so callers (e.g., boot-engine-core) can read
   * the current mode without storing it separately.
   *
   * @see docs/architecture/0001-layered-ui-model.md (Amendment — map-mode deferred)
   */
  // TODO(HUD-27PX): wire into glyph-badge rendering once map mode is gesture-opened (#issue)
  private readonly _mapMode: StatusHudMapMode;

  /** Current rendering mode (mutable via {@link setMode}). */
  private mode: StatusHudMode;

  /**
   * Per-turn movement budget chip state (preserved for overlay callers — Phase 8).
   *
   * In the HUD-27PX default view, the movement budget is shown in the VEL field
   * only when supplied. Overlays may still call setMovementBudget.
   */
  private _movementBudget: { remaining: number; total: number } | null = null;

  /**
   * Action economy widget state (preserved for overlay callers — Phase 9).
   *
   * The default status-sheet view does not render the economy widget inline;
   * overlay panels that set this state use it for their own rendering context.
   */
  private _actionEconomy: ActionEconomyWidgetState | null = null;

  constructor(opts: StatusHudRendererOpts) {
    this.locale = opts.locale;
    this._mapMode = opts.mapMode ?? 'raster';
    this.mode = opts.mode ?? 'standard';
  }

  /**
   * Switch the renderer's mode.
   *
   * Called by StatusHudLayer when the `hp === 0 && death.failure < 3` pivot
   * trigger fires (DEATH-01). Idempotent.
   *
   * @param mode `'standard'` or `'death-saves'`.
   */
  setMode(mode: StatusHudMode): void {
    this.mode = mode;
  }

  /**
   * Movement budget chip state setter (preserved for overlay callers — Phase 8).
   *
   * Transition-guarded: no-op if the new value is structurally identical.
   *
   * @param budget `{ remaining; total }` or `null` to clear.
   */
  setMovementBudget(budget: { remaining: number; total: number } | null): void {
    const same =
      (budget === null && this._movementBudget === null) ||
      (budget !== null &&
        this._movementBudget !== null &&
        budget.remaining === this._movementBudget.remaining &&
        budget.total === this._movementBudget.total);
    if (same) return;
    this._movementBudget = budget;
  }

  /**
   * Test-only: expose the current `_movementBudget` field.
   *
   * @internal DO NOT use in production code.
   */
  _getMovementBudgetForTest(): { remaining: number; total: number } | null {
    return this._movementBudget;
  }

  /**
   * Action economy widget state setter (preserved for overlay callers — Phase 9).
   *
   * Transition-guarded: no-op if the new value is structurally identical.
   *
   * @param state Economy widget data or `null` to clear.
   */
  setActionEconomy(state: ActionEconomyWidgetState | null): void {
    if (state === null && this._actionEconomy === null) return;
    if (state !== null && this._actionEconomy !== null) {
      const a = this._actionEconomy;
      const structurallyEqual =
        a.actionsUsed === state.actionsUsed &&
        a.bonusActionsUsed === state.bonusActionsUsed &&
        a.reactionsUsed === state.reactionsUsed &&
        a.multiAttackInProgress === state.multiAttackInProgress &&
        a.multiAttack?.current === state.multiAttack?.current &&
        a.multiAttack?.total === state.multiAttack?.total;
      if (structurallyEqual) return;
    }
    this._actionEconomy = state;
  }

  /**
   * Test-only: expose the current `_actionEconomy` field.
   *
   * @internal DO NOT use in production code.
   */
  _getActionEconomyForTest(): ActionEconomyWidgetState | null {
    return this._actionEconomy;
  }

  /**
   * Read the current render mode (test-only accessor).
   *
   * @internal Production code MUST NOT gate behaviour on this getter.
   */
  getMode(): StatusHudMode {
    return this.mode;
  }

  /**
   * Read the current map mode.
   *
   * Used by boot-engine-core and hud-chrome to query the map mode without
   * storing it separately. Also prevents the TS noUnusedLocals error on
   * `_mapMode` while keeping the field available for the deferred map-mode
   * feature (Specs §7.4 — gesture-opened map mode, DEFERRED per HUD-27PX).
   *
   * @see docs/architecture/0001-layered-ui-model.md (Amendment — map-mode deferred)
   */
  getMapMode(): StatusHudMapMode {
    return this._mapMode;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public render entry-points
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Render the first-boot loading state.
   *
   * HP value shows `…` (loading marker); every scalar shows `—`.
   * Returns a 9-line `\n`-separated string, every line ≤576px (pretext-budgeted).
   */
  renderLoading(): string {
    return this._buildSheet({
      nameDisplay: EM_DASH,
      levelDisplay: EM_DASH,
      hpBar: ELLIPSIS.repeat(HP_BAR_GLYPHS),
      hpCurMax: `${ELLIPSIS}/${EM_DASH}`,
      acValue: EM_DASH,
      spdValue: EM_DASH,
      turnDisplay: EM_DASH,
      roundDisplay: EM_DASH,
      yourTurnDisplay: EM_DASH,
      conditionsText: EM_DASH,
      slotsText: EM_DASH,
      deathSavesText: EM_DASH,
      isLoading: true,
    });
  }

  /**
   * Render the empty/missing state (bridge up, no character assigned).
   *
   * Everything renders as `—` em-dash.
   * Returns a 9-line `\n`-separated string, every line ≤576px.
   */
  renderMissing(): string {
    return this._buildSheet({
      nameDisplay: EM_DASH,
      levelDisplay: EM_DASH,
      hpBar: EM_DASH,
      hpCurMax: `${EM_DASH}/${EM_DASH}`,
      acValue: EM_DASH,
      spdValue: EM_DASH,
      turnDisplay: EM_DASH,
      roundDisplay: EM_DASH,
      yourTurnDisplay: EM_DASH,
      conditionsText: EM_DASH,
      slotsText: EM_DASH,
      deathSavesText: EM_DASH,
      isLoading: false,
    });
  }

  /**
   * Render a populated CharacterSnapshot into the full-width 27px status sheet.
   *
   * Real fields (name, level, hp/maxHp, ac, conditions, spells.slots, death)
   * render from the snapshot. Missing fields (class, speed, turn/round/your-turn)
   * render as `—` with TODO markers.
   *
   * **Mode dispatch:** when {@link mode} is `'death-saves'` delegates to
   * {@link _buildDeathSavesSheet} which emphasises the death-save trackers.
   */
  render(snapshot: CharacterSnapshot): string {
    if (this.mode === 'death-saves') {
      return this._buildDeathSavesSheet(snapshot);
    }
    return this._buildStandardSheet(snapshot);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal — standard mode
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build the populated standard-mode sheet from a CharacterSnapshot.
   */
  private _buildStandardSheet(snapshot: CharacterSnapshot): string {
    const locale = this.locale;

    // Row 0: Name + "Lv{N}" + class label (— placeholder — no class in snapshot)
    // TODO(HUD-27PX): wire class into CharacterSnapshot (#issue)
    const nameRaw = snapshot.name;
    const levelStr = `Lv${snapshot.level}`;
    const classLabel = EM_DASH; // TODO(HUD-27PX): wire class into CharacterSnapshot (#issue)

    // HP bar (10-glyph fill)
    const hpBar = buildHpBar(snapshot.hp, snapshot.maxHp);
    const hpCurMax = `${snapshot.hp}/${snapshot.maxHp}`;

    // AC value
    const acValue = String(snapshot.ac);

    // VEL/speed — not in CharacterSnapshot
    // TODO(HUD-27PX): wire speed/VEL into CharacterSnapshot (#issue)
    const spdValue = EM_DASH;

    // Turn/Round/YourTurn — not in CharacterSnapshot
    // TODO(HUD-27PX): wire turn/round/your-turn into CharacterSnapshot (#issue)
    const turnDisplay = EM_DASH;
    const roundDisplay = EM_DASH;
    const yourTurnDisplay = EM_DASH;

    // Conditions
    const conditionsText = buildConditionsText(snapshot.conditions, locale);

    // Spell slots
    const slotsText = buildSlotsText(snapshot.spells?.slots ?? [], locale);

    // Death saves
    const deathSavesText = buildDeathSavesText(snapshot.death, locale);

    return this._buildSheet({
      nameDisplay: nameRaw,
      levelDisplay: levelStr,
      hpBar,
      hpCurMax,
      acValue,
      spdValue,
      turnDisplay,
      roundDisplay,
      yourTurnDisplay,
      conditionsText,
      slotsText,
      deathSavesText,
      classLabel,
      isLoading: false,
    });
  }

  /**
   * Build the death-saves emphasis sheet.
   *
   * Same 9-row layout as standard, but the HP row shows HP=0 prominently
   * and the death-saves row is emphasised with filled/empty glyphs.
   */
  private _buildDeathSavesSheet(snapshot: CharacterSnapshot): string {
    const locale = this.locale;

    const nameRaw = snapshot.name;
    const levelStr = `Lv${snapshot.level}`;
    // TODO(HUD-27PX): wire class into CharacterSnapshot (#issue)
    const classLabel = EM_DASH;

    // HP=0 display in death-saves
    const hpBar = '░'.repeat(HP_BAR_GLYPHS); // empty bar
    const hpCurMax = `0/${snapshot.maxHp}`;

    const acValue = String(snapshot.ac);
    // TODO(HUD-27PX): wire speed/VEL into CharacterSnapshot (#issue)
    const spdValue = EM_DASH;
    // TODO(HUD-27PX): wire turn/round/your-turn into CharacterSnapshot (#issue)
    const turnDisplay = EM_DASH;
    const roundDisplay = EM_DASH;
    const yourTurnDisplay = EM_DASH;

    const conditionsText = buildConditionsText(snapshot.conditions, locale);
    const slotsText = buildSlotsText(snapshot.spells?.slots ?? [], locale);
    const deathSavesText = buildDeathSavesText(snapshot.death, locale);

    return this._buildSheet({
      nameDisplay: nameRaw,
      levelDisplay: levelStr,
      hpBar,
      hpCurMax,
      acValue,
      spdValue,
      turnDisplay,
      roundDisplay,
      yourTurnDisplay,
      conditionsText,
      slotsText,
      deathSavesText,
      classLabel,
      isLoading: false,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal — sheet assembly
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Assemble the 8-row full-width sheet from pre-formatted scalars.
   *
   * Layout (rows 0-7):
   *   0: `{name}   Lv{N} {class}`
   *   1: divider
   *   2: `{hpLabel} {bar} {cur}/{max}   {acLabel} {ac}   {spdLabel} {spd}`
   *   3: `{turnLabel} —   Round —   [—]`
   *   4: `Cond: {conditions}`
   *   5: divider
   *   6: `Slot {slot rows}`
   *   7: `TS morte  ○○○ / ○○○`
   *
   * NOTE: the R1 gesture hint line has been REMOVED from the body sheet (j0t-05).
   * It was row 8 (9th row) in the previous design, but 9×27=243px > h=234px
   * (status-hud container), causing overflow into the footer strip. The footer
   * container (id5) already renders the R1 hint chip via renderContextChip /
   * hud-chrome — the body duplicate was redundant and overflowed.
   *
   * Every row is measured by pretext and truncated with `…` if > 576px.
   * The returned string has exactly SHEET_ROWS (8) lines joined with `\n`.
   */
  private _buildSheet(fields: SheetFields): string {
    const { locale } = this;
    const lines: string[] = [];

    // Row 0: name + level + class (–)
    const levelAndClass = `${fields.levelDisplay} ${fields.classLabel ?? EM_DASH}`;
    const nameWithPad = fields.nameDisplay;
    const row0 = fitLine(`${nameWithPad}   ${levelAndClass}`, locale);
    lines.push(row0);

    // Row 1: divider
    const divider = DIVIDER_CHAR.repeat(DIVIDER_LEN);
    lines.push(fitLine(divider, locale));

    // Row 2: HP bar + cur/max + CA + VEL
    const hpLabel = getLabel('hp_label', locale);
    const acLabel = getLabel('ac_label', locale);
    const spdLabel = getLabel('speed_label', locale);
    let hpBar = fields.hpBar;
    if (fields.isLoading) {
      // Loading: show ellipsis in bar position
      hpBar = ELLIPSIS;
    }
    const row2 = fitLine(
      `${hpLabel} ${hpBar} ${fields.hpCurMax}   ${acLabel} ${fields.acValue}   ${spdLabel} ${fields.spdValue}`,
      locale,
    );
    lines.push(row2);

    // Row 3: Turn / Round / [YOUR TURN] — all — placeholders
    // TODO(HUD-27PX): replace '—' with real turn/round/your-turn from CharacterSnapshot (#issue)
    // yourTurnLabel is not interpolated when turnDisplay/roundDisplay/yourTurnDisplay are '—';
    // the label IS included in the brackets when data is present: `[${yourTurnLabel}]`.
    const turnLabel = getLabel('hud27_turn_label', locale);
    const roundLabel = getLabel('hud27_round_label', locale);
    const row3 = fitLine(
      `${turnLabel} ${fields.turnDisplay}   ${roundLabel} ${fields.roundDisplay}   [${fields.yourTurnDisplay}]`,
      locale,
    );
    lines.push(row3);

    // Row 4: Conditions
    const condPrefix = getLabel('hud27_cond_prefix', locale);
    const row4 = fitLine(`${condPrefix} ${fields.conditionsText}`, locale);
    lines.push(row4);

    // Row 5: divider
    lines.push(fitLine(divider, locale));

    // Row 6: Spell slots
    const slotLabel = getLabel('slots_section', locale);
    const row6 = fitLine(`${slotLabel} ${fields.slotsText}`, locale);
    lines.push(row6);

    // Row 7: Death saves (last row — no R1 hint, see SHEET_ROWS comment above)
    lines.push(fitLine(fields.deathSavesText, locale));

    if (lines.length !== SHEET_ROWS) {
      throw new Error(`StatusHudRenderer: produced ${lines.length} rows, expected ${SHEET_ROWS}`);
    }

    return lines.join('\n');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 6 Plan 03 — R1 context chip (preserved for overlay callers)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Produce the R1 context chip string for the status-HUD footer row.
   *
   * Preserved verbatim from the pre-HUD-27PX renderer (Phase 6 Plan 03 contract).
   * StatusHudLayer still calls this to append a footer chip below the main
   * sheet content when no overlay is active.
   *
   * **Phase 10 Plan 10-01 — SYNC LOST override:**
   * When `opts.syncLost` is non-null, returns the SYNC LOST chip string
   * from `buildSyncLostChip(opts.syncLost.retryInMs, locale)` in place of
   * the normal R1 hint chip.
   *
   * @param layerManager The LayerManager to query, or `null` during early boot.
   * @param locale Active HUD locale.
   * @param opts Optional overrides: `syncLost` mounts the SYNC LOST chip.
   * @returns `"R1: <chip>"` string or `"⚠ SYNC LOST …"` string.
   *
   * @see packages/g2-app/src/engine/sync-lost-chip.ts (buildSyncLostChip)
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2
   */
  renderContextChip(
    layerManager: LayerManagerLike | null,
    locale: HudLocale,
    opts?: { syncLost?: { retryInMs: number } | null },
  ): string {
    // Phase 10 Plan 10-01 — SYNC LOST override.
    if (opts?.syncLost != null) {
      return buildSyncLostChip(opts.syncLost.retryInMs, locale);
    }

    const top: R1HintProvider | null = layerManager?.getTopLayer() ?? null;
    const hints = top?.getR1Hints?.() ?? null;

    let chipContent: string;
    if (hints !== null) {
      chipContent = `tap=${hints.tap} scroll=${hints.scroll} qa=${hints.quickActionLabel}`;
    } else if (top === null) {
      const raw = getLabel('hud_r1_main', locale);
      const parsed = parseR1HintString(raw);
      chipContent = `tap=${parsed.tap} scroll=${parsed.scroll} qa=${parsed.quickActionLabel}`;
    } else {
      chipContent = `tap=${DEFAULT_R1_HINTS.tap} scroll=${DEFAULT_R1_HINTS.scroll} qa=${DEFAULT_R1_HINTS.quickActionLabel}`;
    }

    const cps = [...chipContent];
    const truncated = cps.length > 38 ? `${cps.slice(0, 37).join('')}…` : chipContent;
    return `R1: ${truncated}`;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Internal struct passed to `_buildSheet` — pre-formatted display scalars.
 */
interface SheetFields {
  readonly nameDisplay: string;
  readonly levelDisplay: string;
  readonly hpBar: string;
  readonly hpCurMax: string;
  readonly acValue: string;
  readonly spdValue: string;
  readonly turnDisplay: string;
  readonly roundDisplay: string;
  readonly yourTurnDisplay: string;
  readonly conditionsText: string;
  readonly slotsText: string;
  readonly deathSavesText: string;
  readonly classLabel?: string;
  readonly isLoading: boolean;
}

/**
 * Truncate a line to fit within 576px using pretext, appending `…` if cut.
 *
 * Uses `pxTruncate` from `@evenrealities/pretext` which appends `'...'` (3 ASCII dots);
 * we replace that with `'…'` (U+2026) to match project conventions.
 *
 * This is the single-source width gate: all rows pass through here before being
 * added to the sheet. The WIDTH-ASSERTION test in the test file independently
 * verifies every line ≤576px.
 *
 * @param line Raw line string.
 * @param _locale Reserved for future locale-specific truncation strategy.
 * @returns The line, truncated with `…` if it exceeded 576px.
 */
function fitLine(line: string, _locale: HudLocale): string {
  const px = getTextWidth(line);
  if (px <= G2_MAX_PX) {
    return line;
  }
  // pxTruncate appends '...'; replace with '…' for consistency
  const truncated = pxTruncate(line, G2_MAX_PX - getTextWidth('…'));
  // Remove trailing '...' if pxTruncate added it, then append '…'
  const clean = truncated.endsWith('...') ? truncated.slice(0, -3) : truncated;
  return `${clean}…`;
}

/**
 * Build the 10-glyph HP bar from current/max HP.
 *
 * Each glyph represents 1/10 of max HP:
 *   - `█` full
 *   - `▓` partial (≥0.5 of a glyph)
 *   - `░` empty
 */
function buildHpBar(cur: number, max: number): string {
  if (max <= 0) {
    return '░'.repeat(HP_BAR_GLYPHS);
  }
  const ratio = Math.max(0, Math.min(1, cur / max));
  const fullGlyphs = Math.floor(ratio * HP_BAR_GLYPHS);
  const partial = ratio * HP_BAR_GLYPHS - fullGlyphs;
  const partialGlyph = partial >= 0.5 ? '▓' : '';
  const partialCount = partialGlyph === '' ? 0 : 1;
  const emptyCount = HP_BAR_GLYPHS - fullGlyphs - partialCount;
  return `${'█'.repeat(fullGlyphs)}${partialGlyph}${'░'.repeat(Math.max(0, emptyCount))}`;
}

/**
 * Build the conditions display text from the snapshot's condition array.
 *
 * Joins conditions with `, `. If the resulting string would be too wide,
 * truncates to fit within ~400px (leaving room for the `Cond:` prefix and
 * an overflow marker), then appends ` …+N` to indicate how many were omitted.
 *
 * The full row (including prefix) is still clamped by `fitLine` — this function
 * just does a content-level truncation for readability.
 */
function buildConditionsText(conditions: ReadonlyArray<string>, _locale: HudLocale): string {
  if (conditions.length === 0) {
    return EM_DASH;
  }

  // Try showing all conditions
  const allText = conditions.join(', ');
  const condPrefixPx = getTextWidth('Cond: ');
  const available = G2_MAX_PX - condPrefixPx;

  if (getTextWidth(allText) <= available) {
    return allText;
  }

  // Binary search for how many conditions fit with a "+N more" suffix
  for (let visible = conditions.length - 1; visible >= 1; visible--) {
    const overflow = conditions.length - visible;
    const text = `${conditions.slice(0, visible).join(', ')} …+${overflow}`;
    if (getTextWidth(text) <= available) {
      return text;
    }
  }

  // Last resort: just the first condition truncated
  const first = conditions[0] ?? EM_DASH;
  const overflow = conditions.length - 1;
  const suffix = ` …+${overflow}`;
  const maxFirstPx = available - getTextWidth(suffix);
  return `${pxTruncate(first, maxFirstPx)}${suffix}`;
}

/**
 * Build the spell-slots display text.
 *
 * Format: `1●●○○  2●○○  3○`
 * Each slot group: `{level}{filled}○{empty}` using `●` (used), `○` (available).
 * (Note: value=remaining slots, max=total; empty=value, filled=max-value)
 *
 * Only shows levels 1-5 (most common use range). Truncated by fitLine if needed.
 */
function buildSlotsText(
  slots: ReadonlyArray<{ level: number; value: number; max: number }>,
  _locale: HudLocale,
): string {
  if (slots.length === 0) {
    return EM_DASH;
  }

  const parts: string[] = [];
  for (const slot of slots) {
    if (slot.level > 5) continue; // truncate to common levels
    const remaining = Math.max(0, Math.min(slot.max, slot.value));
    const used = slot.max - remaining;
    const filledGlyphs = '●'.repeat(Math.max(0, remaining));
    const emptyGlyphs = '○'.repeat(Math.max(0, used));
    parts.push(`${slot.level}${filledGlyphs}${emptyGlyphs}`);
  }

  return parts.length > 0 ? parts.join('  ') : EM_DASH;
}

/**
 * Build the death-saves display text.
 *
 * IT: `TS morte  ●●○ / ○○○`
 * EN: `Death saves  ●●○ / ○○○`
 *
 * Filled `●` = ticked (success or failure); empty `○` = unticked.
 * Success track on the left, failure track on the right.
 *
 * @param death `{ success: number; failure: number }` from CharacterSnapshot.
 * @param locale Active locale for label.
 */
function buildDeathSavesText(
  death: { readonly success: number; readonly failure: number },
  locale: HudLocale,
): string {
  const label = getLabel('hud27_death_saves_label', locale);
  const successTrack = buildTrackGlyphs(death.success);
  const failureTrack = buildTrackGlyphs(death.failure);
  return `${label}  ${successTrack} / ${failureTrack}`;
}

/**
 * Build a 3-slot death-save track: `●●○` for `count=2`.
 *
 * `●` for ticked positions (up to `count`), `○` for unticked.
 */
function buildTrackGlyphs(count: number): string {
  const ticked = Math.max(0, Math.min(3, count));
  return `${'●'.repeat(ticked)}${'○'.repeat(3 - ticked)}`;
}
