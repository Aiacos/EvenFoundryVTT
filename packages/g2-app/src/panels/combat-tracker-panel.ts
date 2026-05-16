/**
 * CombatTrackerPanel — z=2 overlay panel presenting the 5-row sliding combat
 * initiative window with concentration sub-lines and quick-action bar (COMB-01, COMB-03).
 *
 * ## Layout (UI-SPEC §5.8)
 *
 * The panel renders 18 content rows × 66 code-points (inner content, Strategy A
 * single `'overlay-block'` text container). Row structure:
 *
 * ```
 * ┌─── COMBAT TRACKER ──────────────────────────────────────────────────┐
 * │  <init>  <marker> <name>  <hp_label> <bar>  <hp>  <ac_label> <ac>  │
 * │                   conc:<spell-12>  <duration-6>                    │
 * │  ...                                                               │
 * │  Effetti attivi:                                                   │
 * │   · <effect-line>                                                  │
 * │                                                                    │
 * │  Rapida:  [ A ]ttacco  [ S ]pell  [ I ]tem  [ M ]ovi             │
 * └────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Windowing (COMB-01)
 *
 * Five combatants shown at a time, centered on current turn where possible.
 * Scroll events shift the window. Turn advance resets `scrollOffset` to 0.
 * Pure helper {@link computeWindow} owns the edge-case logic per RESEARCH §Pattern 4.
 *
 * ## Concentration sub-line (COMB-01)
 *
 * When `combatant.concentration` is defined, a second row is emitted below the
 * main row: `<22 spaces>conc:<spell-12> <duration-6>` (66 code-points total).
 *
 * ## Quick-action bar (COMB-03 — render-only Phase 5)
 *
 * The footer row renders the `[A][S][I][M]` bar as static glyphs.
 * Phase 6 wires the tap-cycle gesture highlight.
 *
 * ## Container strategy (Strategy A — ADR-0009 Amendment 1)
 *
 * Single text container `'overlay-block'`. `getContainerCount()` returns
 * `{ image: 0, text: 1 }`. No image containers.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-05-PLAN.md
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §5.8
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 4
 * @see docs/architecture/0009-layer-manager-contract.md Amendment 1
 * @see docs/architecture/0010-panel-plugin-registry.md (ADR-0010)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { Combatant, CombatSnapshot } from '@evf/shared-protocol';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { parseR1HintString } from '../status-hud/r1-hint-parser.js';

// ─── Layout constants ─────────────────────────────────────────────────────────

/** Inner content width for a combatant row (66 code-points per UI-SPEC §5.8). */
const INNER_WIDTH = 66;

/** Total content rows rendered into the overlay-block container. */
const CONTENT_ROWS = 18;

/** HP bar width (8 fill chars per UI-SPEC §5.8 col 29-36). */
const HP_BAR_WIDTH = 8;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the 5-row visible window from the full combatant list.
 *
 * Per RESEARCH §Pattern 4 verbatim:
 * - N === 0 → []
 * - N ≤ 5   → all turns (no windowing needed)
 * - else    → target center = clamp(currentTurnIndex + scrollOffset, 2, N-3),
 *             start = max(0, center-2), end = min(N, start+5),
 *             adjustedStart = max(0, end-5).
 *
 * Edge cases verified:
 * - 1 combatant: show that 1.
 * - 2–4 combatants: show all.
 * - 5 combatants: show all.
 * - current turn = 0 (first): top-anchored [0..4].
 * - current turn = last: bottom-anchored [N-5..N-1].
 * - mid: centered.
 *
 * @param turns            Full initiative list (ordered).
 * @param currentTurnIndex Index of the combatant whose turn it is (0-indexed).
 * @param scrollOffset     Signed scroll delta applied to the center (resets on turn advance).
 */
export function computeWindow(
  turns: Combatant[],
  currentTurnIndex: number,
  scrollOffset: number,
): Combatant[] {
  const N = turns.length;
  if (N === 0) return [];
  if (N <= 5) return turns.slice();

  const targetCenter = Math.max(2, Math.min(N - 3, currentTurnIndex + scrollOffset));
  const start = Math.max(0, targetCenter - 2);
  const end = Math.min(N, start + 5);
  const adjustedStart = Math.max(0, end - 5);
  return turns.slice(adjustedStart, end);
}

/**
 * Truncate `value` to `max` code-points, appending `…` if cut.
 *
 * Mirror of ConcentrationDropModalPanel._truncate (INV-1 width-budget rule).
 */
function _truncate(value: string, max: number): string {
  const cps = [...value];
  if (cps.length <= max) return value;
  return `${cps.slice(0, max - 1).join('')}…`;
}

/**
 * Right-pad or truncate `value` to exactly `width` code-points.
 *
 * Pads with spaces if shorter; truncates with `…` if longer.
 */
function _pad(value: string, width: number): string {
  const cps = [...value];
  if (cps.length === width) return value;
  if (cps.length < width) return `${value}${' '.repeat(width - cps.length)}`;
  return `${cps.slice(0, width - 1).join('')}…`;
}

/**
 * Right-justify `value` (no spaces) inside a field of `width` code-points.
 *
 * Pads with leading spaces; truncates if wider than `width`.
 */
function _rjust(value: string, width: number): string {
  const cps = [...value];
  if (cps.length >= width) return cps.slice(-width).join('');
  return `${' '.repeat(width - cps.length)}${value}`;
}

/**
 * Format HP as `"hp/maxHp"` right-padded into a field of `width` code-points.
 *
 * CR-03 fix: When the full string exceeds `width`, apply ellipsis truncation
 * (UI-SPEC §5.8) rather than left-slicing with `_rjust`. Left-slicing produced
 * wrong current-HP values (e.g. "210/220" → "0/220" via `cps.slice(-5)`).
 *
 * Truncation strategy: `_pad` truncates to `width-1` chars + `…` when the
 * string is too long, producing `"210/…"` for a 5-char budget — spec-compliant.
 *
 * @param hp    Current HP value
 * @param maxHp Maximum HP value
 * @param width Column width in code-points
 */
function _formatHpField(hp: number, maxHp: number, width: number): string {
  const full = `${hp}/${maxHp}`;
  const cps = [...full];
  if (cps.length <= width) {
    // Fits: right-align with leading spaces
    return `${' '.repeat(width - cps.length)}${full}`;
  }
  // Exceeds budget: truncate with ellipsis (not left-slice which drops current-HP digits)
  return _pad(full, width);
}

/**
 * Produce an 8-character HP bar using `█` (filled) and `░` (empty).
 *
 * @param hp    Current HP (null → all empty)
 * @param maxHp Maximum HP (null or 0 → all empty)
 */
function _hpBar(hp: number | null, maxHp: number | null): string {
  if (hp === null || maxHp === null || maxHp === 0) return '░'.repeat(HP_BAR_WIDTH);
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const filled = Math.round(ratio * HP_BAR_WIDTH);
  return `${'█'.repeat(filled)}${'░'.repeat(HP_BAR_WIDTH - filled)}`;
}

/**
 * Render a single combatant's main row + optional concentration sub-line.
 *
 * Returns 1 string (no concentration) or 2 strings (with concentration).
 * Each string is exactly `INNER_WIDTH` (66) code-points.
 *
 * Column layout per UI-SPEC §5.8 (0-indexed from start of inner content):
 * ```
 * Cols 0-3:   Initiative (4 chars, right-aligned)
 * Cols 4-5:   Separator (2 spaces)
 * Cols 6-7:   Current-turn marker `▶ ` or `  `
 * Cols 8-25:  Name + YOU-marker field (18 chars total)
 * Cols 26-27: HP label (2 chars)
 * Col  28:    Space
 * Cols 29-36: HP bar (8 chars)
 * Col  37:    Space
 * Cols 38-42: HP value (5 chars, right-justified)
 * Cols 43-44: Gap (2 spaces)
 * Cols 45-46: AC label (2 chars)
 * Col  47:    Space
 * Cols 48-50: AC value (3 chars, right-justified)
 * Cols 51-52: Gap (2 spaces)
 * Cols 53-58: Distance + direction (6 chars)
 * Cols 59-61: Gap (3 spaces)
 * Col  62:    Faction glyph
 * Cols 63-65: 3-space trailing pad
 * ```
 *
 * @param c              Combatant data.
 * @param locale         Active HUD locale for label resolution.
 * @param ownActorId     Actor ID for "YOU" marker detection.
 * @param isParty        True when the combatant is in the player party (renders `★`).
 */
export function renderCombatantRow(
  c: Combatant,
  locale: HudLocale,
  ownActorId: string,
  isParty: boolean = false,
): string[] {
  // Cols 0-3: initiative (4 chars, right-aligned)
  const initiativeStr =
    c.initiative !== null ? _rjust(String(Math.round(c.initiative)), 4) : '   -';

  // Cols 4-5: separator
  const sep = '  ';

  // Cols 6-7: current-turn marker
  const marker = c.isCurrentTurn ? '▶ ' : '  ';

  // Cols 8-25: name + YOU-marker (18 chars total: name-12 + gap-2 + marker-4)
  const isYou = ownActorId !== '' && c.actorId === ownActorId;
  let nameField: string;
  if (isYou) {
    const youMarkerRaw = getLabel('combat.tracker.you_marker', locale); // e.g. '◀ TU' (IT=4, EN=5)
    // WR-01 fix: truncate/pad youMarker to exactly 4 code-points so nameField = 12+2+4 = 18.
    // EN locale '◀ YOU' (5 cp) would otherwise produce a 19-cp nameField (INV-1 violation).
    const youMarker = _pad(youMarkerRaw, 4);
    const name = _pad(_truncate(c.name, 12), 12);
    nameField = `${name}  ${youMarker}`;
  } else {
    nameField = _pad(_truncate(c.name, 18), 18);
  }

  // Cols 26-27: HP label
  const hpLabel = getLabel('combat.hp_label', locale);

  // Col 28: space (between label and bar)
  // Cols 29-36: HP bar
  const bar = _hpBar(c.hp, c.maxHp);

  // Col 37: space (between bar and HP value)
  // Cols 38-42: HP value (5 chars, right-justified; ellipsis truncation for HP ≥ 100)
  const hpValue = c.hp !== null && c.maxHp !== null ? _formatHpField(c.hp, c.maxHp, 5) : '  ---';

  // Cols 43-44: gap
  const gap2 = '  ';

  // Cols 45-46: AC label
  const acLabel = getLabel('combat.ac_label', locale);

  // Col 47: space
  // Cols 48-50: AC value (3 chars, right-justified)
  // NOTE: AC is not in the CombatantSchema (Phase 5 scope). Use placeholder '--'.
  const acValue = ' --';

  // Cols 51-52: gap
  const gap2b = '  ';

  // Cols 53-58: distance + direction (6 chars, left-aligned)
  const distDir = _pad('--', 6);

  // Cols 59-61: gap (3 spaces)
  const gap3 = '   ';

  // Col 62: faction glyph
  const faction = isParty ? '★' : '✕';

  // Cols 63-65: trailing pad (3 spaces)
  const trail = '   ';

  const mainRow =
    initiativeStr +
    sep +
    marker +
    nameField +
    hpLabel +
    ' ' +
    bar +
    ' ' +
    hpValue +
    gap2 +
    acLabel +
    ' ' +
    acValue +
    gap2b +
    distDir +
    gap3 +
    faction +
    trail;

  // Defensive width check (dev-time invariant)
  const mainCps = [...mainRow].length;
  if (mainCps !== INNER_WIDTH) {
    console.warn(
      `[CombatTrackerPanel] renderCombatantRow width=${mainCps} expected=${INNER_WIDTH}`,
    );
  }

  if (c.concentration === undefined) {
    return [mainRow];
  }

  // Concentration sub-line:
  //   22 spaces + 'conc:' (5) + spell-12 (12) + ' ' (1) + duration-6 (6) = 46 chars
  //   Padded to INNER_WIDTH (66) with trailing spaces.
  const indent22 = ' '.repeat(22);
  const spellTrunc = _pad(_truncate(c.concentration.spellName, 12), 12);
  const durTrunc = _pad(_truncate(c.concentration.duration, 6), 6);
  const concLine = _pad(`${indent22}conc:${spellTrunc} ${durTrunc}`, INNER_WIDTH);

  return [mainRow, concLine];
}

/**
 * Render the quick-action bar footer row (COMB-03 — render-only Phase 5).
 *
 * Format per UI-SPEC §5.8:
 * ```
 *   Rapida:  [ A ]ttacco  [ S ]pell  [ I ]tem  [ M ]ovi
 * ```
 * Row is exactly 66 code-points.
 *
 * Phase 6 wires the tap-cycle highlight (active button `[▶A ]` style).
 *
 * @param locale Active HUD locale.
 */
export function renderQuickActionBar(locale: HudLocale): string {
  const label = getLabel('combat.tracker.quick_label', locale);
  const atk = getLabel('combat.tracker.quick_attack', locale);
  const spell = getLabel('combat.tracker.quick_spell', locale);
  const item = getLabel('combat.tracker.quick_item', locale);
  const move = getLabel('combat.tracker.quick_move', locale);

  const row = `  ${label}  [ A ]${atk}  [ S ]${spell}  [ I ]${item}  [ M ]${move}`;
  // Pad/truncate to INNER_WIDTH
  return _pad(row, INNER_WIDTH);
}

/**
 * Render the full 18-row content area for the CombatTrackerPanel.
 *
 * Row structure:
 * 1. Title row: `┌─── COMBAT TRACKER ... ─┐` (66 chars)
 * 2. Up to 5 combatant blocks (1-2 rows each) from the windowed slice
 * 3. Empty divider rows between combatants and effects section
 * 4. Effects section header + placeholder
 * 5. Quick-action bar footer
 * 6. Bottom border `└── ... ──┘`
 * 7. Remaining rows padded with spaces
 *
 * Total: exactly CONTENT_ROWS (18) rows.
 *
 * @param snapshot     Active combat snapshot, or null (renders empty state).
 * @param locale       Active HUD locale.
 * @param scrollOffset Signed scroll offset applied to windowing.
 * @param ownActorId   Actor ID for YOU-marker detection.
 */
export function renderCombatTrackerContent(
  snapshot: CombatSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
  ownActorId: string,
): string[] {
  const title = getLabel('combat.tracker.panel_title', locale);
  const topBorder = `${_pad(`┌─── ${title} `, INNER_WIDTH - 1)}┐`;
  const bottomBorder = `└${'─'.repeat(INNER_WIDTH - 2)}┘`;
  const blankRow = ' '.repeat(INNER_WIDTH);

  if (snapshot === null) {
    // Empty state — center the `combat.empty` message.
    const emptyMsg = getLabel('combat.empty', locale);
    const paddingLeft = Math.floor((INNER_WIDTH - [...emptyMsg].length) / 2);
    const centeredRow = _pad(' '.repeat(paddingLeft) + emptyMsg, INNER_WIDTH);

    const rows: string[] = [topBorder];
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(centeredRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(blankRow);
    rows.push(bottomBorder);
    // Clamp to CONTENT_ROWS
    return rows.slice(0, CONTENT_ROWS);
  }

  // Build combatant rows
  const currentIdx = snapshot.combatants.findIndex((c) => c.isCurrentTurn);
  const safeCurrentIdx = Math.max(0, currentIdx);
  const windowSlice = computeWindow(snapshot.combatants, safeCurrentIdx, scrollOffset);

  const combatantRows: string[] = [];
  for (const c of windowSlice) {
    const rows = renderCombatantRow(c, locale, ownActorId, false);
    combatantRows.push(...rows);
  }

  // Effects section
  const effectsHeader = `  ${getLabel('combat.tracker.effects_section', locale)}`;
  const effectsHeaderRow = _pad(effectsHeader, INNER_WIDTH);

  // Quick-action bar
  const quickBar = renderQuickActionBar(locale);

  // Assemble: title + combatant rows + blank + effects header + blank + quick bar + bottom
  const assembled: string[] = [topBorder, ...combatantRows];

  // Fill remaining rows before effects section
  const combatantSectionRows = 1 + combatantRows.length; // title + combatant rows
  const spaceAfterCombatants = Math.max(0, 13 - combatantSectionRows); // reserve rows 1-13

  for (let i = 0; i < spaceAfterCombatants; i++) {
    assembled.push(blankRow);
  }

  assembled.push(effectsHeaderRow);
  assembled.push(blankRow);
  assembled.push(quickBar);
  assembled.push(bottomBorder);

  // Pad or trim to exactly CONTENT_ROWS
  while (assembled.length < CONTENT_ROWS) assembled.push(blankRow);
  return assembled.slice(0, CONTENT_ROWS);
}

// ─── CombatTrackerPanel ───────────────────────────────────────────────────────

/**
 * 5-row sliding combat tracker overlay (z=2).
 *
 * Implements {@link OverlayPanel} following the ConcentrationDropModalPanel
 * + CharacterSheetPanel exemplar patterns (constructor shape, `overlay-block`
 * container name, Strategy A single text container, gesture bus subscription lifecycle).
 *
 * Auto-discovered by {@link PanelRouter.discoverPanels} because this file matches
 * the `**\/*-panel.ts` glob and `static meta` passes {@link PanelMetaSchema}.
 */
export default class CombatTrackerPanel implements OverlayPanel {
  /**
   * Static metadata validated by {@link PanelRouter.discoverPanels} at boot.
   *
   * `navKey: 'C'` — Quick Action menu key (Phase 6 wires the gesture).
   * `requiredCaps: []` — Phase 5 panels are read-only and need no server caps.
   */
  static meta: PanelMeta = {
    id: 'combat-tracker',
    title: { it: 'Combat', en: 'Combat', de: 'Kampf' },
    navKey: 'C',
    requiredCaps: [],
  };

  /** Stable panel id matching `static meta.id` (LayerManager + telemetry). */
  public readonly id = 'combat-tracker';

  /** Z-index slot — z=2 overlay per ADR-0009 Amendment 1. */
  public readonly z = ZIndex.Z2_OVERLAY;

  // ─── Private state ──────────────────────────────────────────────────────────

  /**
   * Latest combat snapshot delivered via {@link onSnapshot}.
   *
   * `null` until the first snapshot arrives. draw() renders the empty state when null.
   */
  private snapshot: CombatSnapshot | null = null;

  /**
   * Signed scroll offset applied to the windowing center.
   *
   * Reset to 0 on every {@link onSnapshot} when the `currentCombatantId` changes
   * (turn advance). Shifted by ±1 on `scroll` gesture.
   */
  private scrollOffset = 0;

  /**
   * The last seen `currentCombatantId` — used to detect turn advances.
   *
   * When the snapshot arrives with a different value, `scrollOffset` is reset to 0
   * so the new active combatant is centered. RESEARCH Open Question 4 resolution.
   */
  private lastCurrentCombatantId: string | null = null;

  /**
   * Actor ID of the local player character — used for the YOU-marker.
   *
   * Injected at construction time (typically from `game.user.character.id`).
   */
  private readonly ownActorId: string;

  /**
   * Unsubscribe closure returned by {@link PanelGestureBus.subscribe}.
   *
   * Set in `onMount`; invoked and nulled in `onUnmount`. Null guard makes `onUnmount`
   * idempotent (T-4b-01-03 mitigation).
   */
  private unsubscribe: (() => void) | null = null;

  // ─── Constructor ────────────────────────────────────────────────────────────

  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly gestureBus: PanelGestureBus,
    private readonly locale: HudLocale,
    ownActorId = '',
  ) {
    this.ownActorId = ownActorId;
  }

  // ─── OverlayPanel lifecycle ─────────────────────────────────────────────────

  /**
   * Acquire panel resources.
   *
   * Subscribes to the gesture bus and issues the initial draw (empty state
   * until first snapshot arrives via {@link onSnapshot}).
   */
  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
    await this.draw();
  }

  /**
   * Release gesture bus subscription (T-4b-01-03 mitigation).
   *
   * Idempotent: calling `onUnmount` twice is safe (null guard prevents double-free).
   */
  async onUnmount(): Promise<void> {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Handle a published R1 gesture (synchronous — schedules its own re-draw).
   *
   * Dispatch table per CONTEXT.md §Area 4 + UI-SPEC §5.8 gesture row:
   * - `tap`          → cycle quick-action highlight (Phase 6 stub — no-op Phase 5)
   * - `scroll-up`    → shift window up (scrollOffset -= 1); re-draw
   * - `scroll-down`  → shift window down (scrollOffset += 1); re-draw
   * - `double-tap`   → no-op stub (Phase 6 NAV-01 wires close)
   * - `long-press`   → no-op stub (Phase 6 Quick Action)
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'tap':
        // Phase 5 no-op — Phase 6 wires the quick-action cycle (COMB-03).
        break;

      case 'scroll': {
        // WR-02 fix: clamp scrollOffset to [-maxOff, +maxOff] where maxOff is
        // derived from combatants.length so the window cannot scroll infinitely
        // past the content and leave the panel permanently stuck.
        const maxOff = Math.max(0, (this.snapshot?.combatants.length ?? 0) - 3);
        this.scrollOffset = Math.max(
          -maxOff,
          Math.min(this.scrollOffset + (gesture.direction === 'down' ? 1 : -1), maxOff),
        );
        void this.draw();
        break;
      }

      case 'double-tap':
        // Phase 6 NAV-01 wires close.
        break;

      case 'long-press':
        // Phase 6 Quick Action.
        break;
    }
  }

  /**
   * Update the panel with a fresh combat snapshot without remounting.
   *
   * Called by the boot orchestrator's WS handler on `combat.turn` delta.
   * When `currentCombatantId` changes (new turn), resets `scrollOffset` to 0
   * so the new active combatant is re-centered (RESEARCH Open Question 4 resolution).
   *
   * @param newSnapshot - Parsed {@link CombatSnapshot} from the WS envelope.
   */
  onSnapshot(newSnapshot: CombatSnapshot): void {
    if (newSnapshot.currentCombatantId !== this.lastCurrentCombatantId) {
      this.scrollOffset = 0;
      this.lastCurrentCombatantId = newSnapshot.currentCombatantId;
    }
    this.snapshot = newSnapshot;
    void this.draw();
  }

  // ─── Layer interface ────────────────────────────────────────────────────────

  /**
   * Render the panel via a single `bridge.textContainerUpgrade` call.
   *
   * Delegates to {@link renderCombatTrackerContent} for the 18-row body.
   * Strategy A: single text container `'overlay-block'`, no image containers.
   */
  async draw(): Promise<void> {
    const rows = renderCombatTrackerContent(
      this.snapshot,
      this.locale,
      this.scrollOffset,
      this.ownActorId,
    );

    const content = rows.join('\n');
    const payload = new TextContainerUpgrade({
      containerName: 'overlay-block',
      content,
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /**
   * Tear down the panel — no-op here (bus unsubscription lives in `onUnmount`).
   */
  destroy(): void {
    // Intentionally empty — see JSDoc.
  }

  /**
   * Container footprint declaration (Strategy A — ADR-0009 Amendment 1).
   *
   * One text container (`overlay-block`), zero image containers.
   */
  getContainerCount(): { image: 0; text: 1 } {
    return { image: 0, text: 1 };
  }

  /**
   * R1 hint metadata for the StatusHudRenderer context chip (Plan 06-03).
   *
   * Returns the parsed hint object from the pre-composed `hud_r1_combat` i18n
   * string — e.g. IT: `{ tap: 'rapida', scroll: 'iniz', longPressLabel: 'q[combat]' }`.
   *
   * The `longPressLabel` always contains `q[combat]` across all locales — INV-5 SC-4
   * visible enforcement (chip names the live long-press target per overlay-id bracket).
   *
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (visible enforcement)
   * @see packages/g2-app/src/status-hud/i18n-budgets.ts hud_r1_combat key
   */
  getR1Hints(): { readonly tap: string; readonly scroll: string; readonly longPressLabel: string } {
    return parseR1HintString(getLabel('hud_r1_combat', this.locale));
  }
}
