/**
 * SpellbookPanel — z=2 overlay panel rendering the character's spell list
 * per UI-SPEC §5.11 (standalone quick-cast view) and §5.5 (sheet-tab view).
 *
 * Implements {@link ../engine/layer-types.js#OverlayPanel}:
 *   - `onMount()`   — subscribes to PanelGestureBus
 *   - `onUnmount()` — unsubscribes (T-4b-01-03 mitigation — prevents subscriber leaks)
 *   - `onEvent(g)`  — tap opens Action Options for the cursor spell; scroll cycles
 *                     spell highlight; double-tap → close (Phase 6 NAV-01 stub).
 *
 * **Column layout (UI-SPEC §5.11 — shared between sheet-tab §5.5 and standalone):**
 * ```
 * Cols 0-2:   Indent (3 spaces)
 * Col  3:     Prepared/cursor marker (1 char: ◉ / ▶ / space)
 * Col  4:     Space
 * Cols 5-24:  Spell name (20 chars, left-aligned, truncate with …)
 * Cols 25-30: Activation abbreviation (6 chars: azione/reaziN/bonusA/ritual)
 * Cols 31-32: Gap (2 spaces)
 * Cols 33-39: Range (7 chars, left-aligned, space-padded)
 * Cols 40-65: Effect/damage summary (26 chars, left-aligned, truncate with …)
 * ```
 *
 * **Container strategy (Strategy A — exemplar pattern):**
 * Single text container (`overlay-block`), zero image containers.
 * `getContainerCount()` returns `{ image: 0, text: 1 }`.
 *
 * **Dual-edition branching (SHEET-03 / CONTEXT.md §Area 3):**
 * - `modernRules === false` (PHB 2014): prepared spells show `◉`; cantrips always `◉`.
 * - `modernRules === true` (PHB 2024): always-prepared spells show `≡` instead of `◉`.
 * - Concentration spells always show `≀` marker in the name column (col 4, overrides space).
 *
 * **Threat model T-05-04-02:** `SpellEntrySchema` clamps `level` to 0-9; reader validates
 * `actor.system.spells.spell{N}` before inclusion.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-04-PLAN.md
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §5.5 + §5.11
 * @see packages/g2-app/src/panels/inventory-panel.ts (column layout sibling)
 * @see packages/g2-app/src/panels/concentration-drop-modal.ts (exemplar)
 * @see packages/shared-protocol/src/payloads/character.ts (SpellEntrySchema)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { CharacterSnapshot, SpellEntry, SpellSlot } from '@evf/shared-protocol';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { parseR1HintString } from '../status-hud/r1-hint-parser.js';
import type { ActionOptionsRequest } from './action-options-modal.js';
import { padRightUnicode, truncateUnicode } from './character-sheet-tab-renderers.js';

// ─── Width constants ───────────────────────────────────────────────────────────

/** Inner content width (66 code-points — UI-SPEC §4.1). */
const INNER_WIDTH = 66;

/** Number of content rows per panel / tab (rows 4-21, below the tab strip). */
const ROW_COUNT = 18;

// ─── Column budget (UI-SPEC §5.11 spell row layout) ──────────────────────────

/** Spell name column width (cols 5-24). */
const NAME_WIDTH = 20;

/** Range column width (cols 33-39). */
const RANGE_WIDTH = 7;

/** Effect/damage summary column width (cols 40-65). */
const EFFECT_WIDTH = 26;

// ─── Slot bar constants ────────────────────────────────────────────────────────

/** Filled (spent) slot glyph. */
const SLOT_FILLED = '▓';

/** Empty (available) slot glyph. */
const SLOT_EMPTY = '░';

/** Maximum bar length in glyphs before we clip (keeps bar readable on G2). */
const MAX_BAR_LENGTH = 4;

// ─── Overlay container name ───────────────────────────────────────────────────

/** Stable text-container name for the spellbook panel payload (single-container strategy). */
export const SPELLBOOK_PANEL_CONTAINER_NAME = 'overlay-block' as const;

// ─── Slot bar helper ──────────────────────────────────────────────────────────

/**
 * Render a spell slot bar — `▓▓░░ 2/4` style (UI-SPEC §5.11 slot section header).
 *
 * The bar is at most `MAX_BAR_LENGTH` glyphs wide; both filled and empty segments
 * are proportionally capped at `MAX_BAR_LENGTH`. The counter `N/M` follows a space.
 *
 * Examples:
 * - `renderSlotBar(0, 4)` → `░░░░ 0/4`
 * - `renderSlotBar(2, 4)` → `▓▓░░ 2/4`
 * - `renderSlotBar(4, 4)` → `▓▓▓▓ 4/4`
 * - `renderSlotBar(1, 3)` → `▓░░  1/3`
 *
 * @param spent Number of spent (used) slots
 * @param max   Maximum slots at this level
 * @returns Slot bar string (bar glyphs + space + counter)
 */
export function renderSlotBar(spent: number, max: number): string {
  if (max === 0) return '';
  // Clamp bar length proportionally to MAX_BAR_LENGTH
  const barLen = Math.min(max, MAX_BAR_LENGTH);
  const filledRatio = max > 0 ? spent / max : 0;
  const filledBars = Math.round(filledRatio * barLen);
  const emptyBars = barLen - filledBars;
  const bar = `${SLOT_FILLED.repeat(filledBars)}${SLOT_EMPTY.repeat(emptyBars)}`;
  // Pad bar to MAX_BAR_LENGTH if barLen < MAX_BAR_LENGTH
  const paddedBar = barLen < MAX_BAR_LENGTH ? bar + ' '.repeat(MAX_BAR_LENGTH - barLen) : bar;
  return `${paddedBar} ${spent}/${max}`;
}

// ─── Row helper ───────────────────────────────────────────────────────────────

/**
 * Resolve the activation abbreviation for a spell's cast time.
 *
 * All abbreviations are exactly 6 code-points per UI-SPEC §5.11.
 *
 * @internal
 */
function activationAbbr(activation: SpellEntry['activation'], locale: HudLocale): string {
  const key =
    activation === 'action'
      ? 'spell.activation.action'
      : activation === 'reaction'
        ? 'spell.activation.reaction'
        : activation === 'bonus'
          ? 'spell.activation.bonus'
          : 'spell.activation.ritual';
  return getLabel(key, locale);
}

/**
 * Render a single spell row — exactly 66 code-points.
 *
 * Column layout (UI-SPEC §5.11, 0-indexed):
 * ```
 * [0-2]   3-char indent
 * [3]     1-char prepared/cursor marker:
 *           ◉ = prepared (2014 or 2024 non-always-prepared)
 *           ≡ = always-prepared (2024 + spell.alwaysPrepared)
 *           " " = unprepared or cantrip with no special marker
 * [4]     1 char: ≀ = concentration, else space
 * [5-24]  20-char spell name (truncated with …)
 * [25-30] 6-char activation abbreviation
 * [31-32] 2-char gap (always spaces)
 * [33-39] 7-char range (left-aligned, space-padded)
 * [40-65] 26-char effect summary (left-aligned, truncated with …)
 * ```
 *
 * @param spell       Validated SpellEntry from the character snapshot
 * @param locale      Active HUD locale
 * @param modernRules PHB 2024 flag (drives `≡` always-prepared glyph)
 * @param isCursor    `true` when this spell is the scroll-selected cursor row (shows `▶`)
 * @returns Exactly 66 code-points
 */
export function renderSpellRow(
  spell: SpellEntry,
  locale: HudLocale,
  modernRules: boolean,
  isCursor = false,
): string {
  // Prepared/cursor marker (col 3)
  let prepMarker: string;
  if (isCursor) {
    prepMarker = getLabel('spell.cursor_marker', locale); // '▶'
  } else if (modernRules && spell.alwaysPrepared) {
    prepMarker = '≡';
  } else if (spell.prepared || spell.level === 0) {
    prepMarker = '◉';
  } else {
    prepMarker = ' ';
  }

  // Concentration marker (col 4)
  const concMarker = spell.concentration ? '≀' : ' ';

  // Spell name cell (cols 5-24, 20 chars)
  const nameCell = padRightUnicode(truncateUnicode(spell.name, NAME_WIDTH), NAME_WIDTH);

  // Activation abbreviation (cols 25-30, exactly 6 chars)
  const activCell = activationAbbr(spell.activation, locale);

  // Range cell (cols 33-39, 7 chars)
  const rangeCell = padRightUnicode(truncateUnicode(spell.range, RANGE_WIDTH), RANGE_WIDTH);

  // Effect cell (cols 40-65, 26 chars)
  const effectCell = padRightUnicode(truncateUnicode(spell.effect, EFFECT_WIDTH), EFFECT_WIDTH);

  // Assemble: 3+1+1+20+6+2+7+26 = 66
  const row = `   ${prepMarker}${concMarker}${nameCell}${activCell}  ${rangeCell}${effectCell}`;

  // Safety pad/trim to exactly INNER_WIDTH
  const cps = [...row];
  if (cps.length === INNER_WIDTH) return row;
  if (cps.length > INNER_WIDTH) return cps.slice(0, INNER_WIDTH).join('');
  return `${row}${' '.repeat(INNER_WIDTH - cps.length)}`;
}

// ─── Level section helper ─────────────────────────────────────────────────────

/**
 * Render a standalone-mode spell level section header + spell rows.
 *
 * Header format (UI-SPEC §5.11): `L{N}   slot ▓▓░░ N/M` or
 * `L{N}   slot ░░░░ 0/M  ← disponibili` when all slots are available.
 *
 * @param level      Spell level (1-9; 0 = cantrip handled separately)
 * @param spells     Spells at this level
 * @param slot       Spell slot data for this level (undefined if no slot)
 * @param locale     Active HUD locale
 * @param modernRules PHB 2024 flag
 * @returns Array of content rows (header + spell rows)
 */
export function renderLevelSection(
  level: number,
  spells: readonly SpellEntry[],
  slot: SpellSlot | undefined,
  locale: HudLocale,
  modernRules: boolean,
): string[] {
  const rows: string[] = [];

  // Build level header: "L{N}   slot ▓▓░░ N/M [← disponibili]"
  // The i18n key literal uses 'N' as the level placeholder (pattern: 'L{N}   slot')
  // The actual key value is e.g. 'L{N}   slot' so we replace '{N}' with the level number.
  const levelLabel = getLabel('spell.level_section', locale).replace('{N}', String(level));
  // CR-01 fix: slot.value is *remaining* slots; renderSlotBar takes *spent* slots as first arg.
  // spent = max - value (e.g. value=2 remaining out of max=4 → 2 spent → ▓▓░░ 2/4)
  const slotBar =
    slot !== undefined && slot.max > 0 ? renderSlotBar(slot.max - slot.value, slot.max) : '';
  // Show the "← disponibili" marker when all slots are free (value === max → 0 spent)
  const allFree = slot !== undefined && slot.max > 0 && slot.value === slot.max;
  const availableMarker = allFree ? `   ${getLabel('spell.available_marker', locale)}` : '';
  const headerContent = `${levelLabel} ${slotBar}${availableMarker}`.trimEnd();
  rows.push(truncateUnicode(headerContent, INNER_WIDTH));

  // Spell rows
  for (const spell of spells) {
    rows.push(renderSpellRow(spell, locale, modernRules));
  }

  return rows;
}

// ─── Produce a row of exactly INNER_WIDTH code-points ─────────────────────────

function row66(content: string): string {
  const cps = [...content];
  if (cps.length === INNER_WIDTH) return content;
  if (cps.length > INNER_WIDTH) return cps.slice(0, INNER_WIDTH).join('');
  return `${content}${' '.repeat(INNER_WIDTH - cps.length)}`;
}

function padToRowCount(rows: string[]): string[] {
  const result = rows.map((r) => row66(r));
  while (result.length < ROW_COUNT) {
    result.push(' '.repeat(INNER_WIDTH));
  }
  return result.slice(0, ROW_COUNT);
}

// ─── Sheet-tab renderer ───────────────────────────────────────────────────────

/**
 * Render the Spells tab content (sheet-tab variant, UI-SPEC §5.5).
 *
 * Returns **18 rows** of exactly **66 code-points** each.
 *
 * Layout:
 * - Row 0:       Filter bar (`getLabel('sheet.spell.filter_bar', locale)`)
 * - Row 1:       Cantrips section header
 * - Rows 2-N:    Cantrip rows
 * - Row N+1:     Level 1 section header (`◇ LIVELLO 1`)
 * - Rows N+2-M:  Level 1 spell rows
 * - ...continues for each non-empty spell level...
 * - Last row:    Scroll hint
 *
 * When `snapshot === null`, all 18 rows are blank placeholders.
 *
 * @param snapshot     Character snapshot or null (pre-first-WS-delta state)
 * @param locale       Active HUD locale
 * @param scrollOffset First visible content row index
 * @returns 18 strings, each exactly 66 code-points wide
 */
export function renderSpellsTabContent(
  snapshot: CharacterSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
): string[] {
  if (snapshot === null) {
    return Array.from({ length: ROW_COUNT }, () => ' '.repeat(INNER_WIDTH));
  }

  const modernRules = snapshot.world.modernRules;
  const { spells: spellList, slots } = snapshot.spells;
  const scrollHint = getLabel('sheet.spell.scroll_hint', locale);
  const filterBar = getLabel('sheet.spell.filter_bar', locale);
  const cantripsHeader = getLabel('sheet.spell.cantrips_section', locale);

  // Build all content rows (unbounded)
  const allRows: string[] = [];
  allRows.push(truncateUnicode(filterBar, INNER_WIDTH));

  // Cantrips section
  const cantrips = spellList.filter((s) => s.level === 0);
  if (cantrips.length > 0) {
    allRows.push(truncateUnicode(cantripsHeader, INNER_WIDTH));
    for (const spell of cantrips) {
      allRows.push(renderSpellRow(spell, locale, modernRules));
    }
    allRows.push('');
  }

  // Spell levels 1-9
  for (let lvl = 1; lvl <= 9; lvl++) {
    const lvlSpells = spellList.filter((s) => s.level === lvl);
    if (lvlSpells.length === 0) continue;
    // The i18n key literal ends with 'N' as the level placeholder (not '{N}')
    const lvlLabel = getLabel('sheet.spell.level_section', locale).replace(/N$/, String(lvl));
    allRows.push(truncateUnicode(lvlLabel, INNER_WIDTH));
    for (const spell of lvlSpells) {
      allRows.push(renderSpellRow(spell, locale, modernRules));
    }
    allRows.push('');
  }

  // Handle empty state
  if (allRows.length <= 1) {
    allRows.push(getLabel('spell.empty', locale));
  }

  // Apply scroll windowing (last row reserved for scroll hint)
  const clampedOffset = Math.max(
    0,
    Math.min(scrollOffset, Math.max(0, allRows.length - (ROW_COUNT - 1))),
  );
  const visibleRows = allRows.slice(clampedOffset, clampedOffset + ROW_COUNT - 1);

  const rows: string[] = [...visibleRows];
  rows.push(truncateUnicode(scrollHint, INNER_WIDTH));

  // Suppress unused variable
  void slots;

  return padToRowCount(rows);
}

// ─── Standalone renderer ──────────────────────────────────────────────────────

/**
 * Render the standalone SpellbookPanel body (UI-SPEC §5.11).
 *
 * Returns **18 rows** of exactly **66 code-points** each.
 *
 * Differs from sheet-tab variant:
 * - Row 0: panel title + prepared counter (`LIBRO INCANTESIMI · preparati N/M`)
 * - Level section headers use `L{N}   slot ▓▓░░ N/M` with slot bars
 * - `← disponibili` marker when all slots are free
 * - Cantrips section uses standalone i18n key (`CANTRIP`)
 *
 * @param snapshot     Character snapshot or null
 * @param locale       Active HUD locale
 * @param scrollOffset First visible content row index
 * @returns 18 strings, each exactly 66 code-points wide
 */
export function renderSpellbookStandaloneContent(
  snapshot: CharacterSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
): string[] {
  if (snapshot === null) {
    return Array.from({ length: ROW_COUNT }, () => ' '.repeat(INNER_WIDTH));
  }

  const modernRules = snapshot.world.modernRules;
  const { spells: spellList, slots } = snapshot.spells;
  const scrollHint = getLabel('spell.scroll_hint', locale);
  const panelTitle = getLabel('spell.panel_title', locale);
  const preparedLabel = getLabel('spell.prepared_count', locale);
  const cantripsHeader = getLabel('spell.cantrips_section', locale);

  // Prepared count: spells at level > 0 with prepared === true or alwaysPrepared === true
  const preparedSpells = spellList.filter((s) => s.level > 0 && (s.prepared || s.alwaysPrepared));
  const totalNonCantrip = spellList.filter((s) => s.level > 0).length;

  // Build title row: "LIBRO INCANTESIMI · preparati N/M"
  const titleRow = `${panelTitle} · ${preparedLabel} ${preparedSpells.length}/${totalNonCantrip}`;

  // Build all content rows (unbounded)
  const allRows: string[] = [];
  allRows.push(truncateUnicode(titleRow, INNER_WIDTH));

  // Cantrips section
  const cantrips = spellList.filter((s) => s.level === 0);
  if (cantrips.length > 0) {
    allRows.push(truncateUnicode(cantripsHeader, INNER_WIDTH));
    for (const spell of cantrips) {
      allRows.push(renderSpellRow(spell, locale, modernRules));
    }
    allRows.push('');
  }

  // Spell levels 1-9 with slot bars
  for (let lvl = 1; lvl <= 9; lvl++) {
    const lvlSpells = spellList.filter((s) => s.level === lvl);
    const slot = slots.find((sl) => sl.level === lvl);
    // Only render levels that have spells OR have non-zero max slots
    if (lvlSpells.length === 0 && (slot === undefined || slot.max === 0)) continue;
    const rows = renderLevelSection(lvl, lvlSpells, slot, locale, modernRules);
    allRows.push(...rows);
    allRows.push('');
  }

  // Handle empty state
  if (allRows.length <= 1) {
    allRows.push(getLabel('spell.empty', locale));
  }

  // Apply scroll windowing (last row reserved for scroll hint)
  const clampedOffset = Math.max(
    0,
    Math.min(scrollOffset, Math.max(0, allRows.length - (ROW_COUNT - 1))),
  );
  const visibleRows = allRows.slice(clampedOffset, clampedOffset + ROW_COUNT - 1);

  const rows: string[] = [...visibleRows];
  rows.push(truncateUnicode(scrollHint, INNER_WIDTH));

  return padToRowCount(rows);
}

// ─── Header-aware row → spell mapping (cursor-row resolution) ─────────────────

/**
 * Build the row → spell map that runs parallel to the `allRows` array produced by
 * {@link renderSpellbookStandaloneContent}.
 *
 * Cursor-row mapping: the standalone renderer interleaves a title row, section
 * headers, spell rows and blank separators into `allRows` and scrolls by
 * content-ROW index. The context-action handler must not index the FLAT `spells`
 * array with `scrollOffset`, since any section header above the cursor would shift
 * the mapping → the WRONG spell would be dispatched after scrolling. This map returns the
 * spell reference for item rows and `null` for title / header / blank rows, in
 * the exact same order the renderer emits them, so the cursor row resolves to
 * the spell visually under it.
 *
 * Must stay structurally in lock-step with `renderSpellbookStandaloneContent`'s
 * row construction (title → cantrips → levels 1-9, each header + spell rows +
 * blank). The shared `cantrips`/`lvlSpells` filtering keeps the two in sync.
 *
 * @param snapshot Character snapshot (null → empty map).
 * @returns Array aligned 1:1 with the renderer's `allRows`; `null` at non-item rows.
 */
export function buildSpellbookRowItemMap(
  snapshot: CharacterSnapshot | null,
): (SpellEntry | null)[] {
  if (snapshot === null) return [];
  const { spells: spellList, slots } = snapshot.spells;
  const map: (SpellEntry | null)[] = [];

  // Row 0: title (never an item).
  map.push(null);

  // Cantrips section (header + spell rows + blank) — mirrors renderer.
  const cantrips = spellList.filter((s) => s.level === 0);
  if (cantrips.length > 0) {
    map.push(null); // cantrips header
    for (const spell of cantrips) map.push(spell);
    map.push(null); // blank separator
  }

  // Spell levels 1-9 (header + spell rows + blank) — mirrors renderer's gating.
  for (let lvl = 1; lvl <= 9; lvl++) {
    const lvlSpells = spellList.filter((s) => s.level === lvl);
    const slot = slots.find((sl) => sl.level === lvl);
    if (lvlSpells.length === 0 && (slot === undefined || slot.max === 0)) continue;
    map.push(null); // renderLevelSection header
    for (const spell of lvlSpells) map.push(spell);
    map.push(null); // blank separator
  }

  return map;
}

/**
 * Resolve the spell under the cursor row from a row → spell map.
 *
 * The cursor row is the clamped scroll offset (first visible content row). If it
 * lands on a header / blank / title (`null`), fall through to the nearest
 * FOLLOWING item row so the established offset-0 behavior (where row 0 is the
 * title) still dispatches the first spell. Returns `null` when no item follows.
 *
 * @param rowItemMap Output of {@link buildSpellbookRowItemMap}.
 * @param cursorRow  Clamped scroll offset (the first visible content row index).
 */
export function resolveSpellAtRow(
  rowItemMap: readonly (SpellEntry | null)[],
  cursorRow: number,
): SpellEntry | null {
  if (rowItemMap.length === 0) return null;
  const start = Math.max(0, Math.min(cursorRow, rowItemMap.length - 1));
  for (let i = start; i < rowItemMap.length; i++) {
    const item = rowItemMap[i];
    if (item != null) return item;
  }
  return null;
}

// ─── SpellbookPanel class ─────────────────────────────────────────────────────

/**
 * Standalone Spellbook overlay panel (z=2).
 *
 * Auto-discovered by `PanelRouter.discoverPanels` via the `**\/*-panel.ts` glob.
 * The Quick Action `[B]` key (Book) wires this panel in Phase 6.
 *
 * Renders the standalone view (UI-SPEC §5.11): panel title + prepared counter +
 * cantrips + level sections with slot bars + scroll hint. Non-casters see the
 * empty-state message (`spell.empty` i18n key).
 *
 * **Lifecycle:**
 * - `onMount`   — subscribes to PanelGestureBus for R1 gesture fan-out.
 * - `onUnmount` — unsubscribes (T-4b-01-03 mitigation).
 * - `onEvent`   — tap opens Action Options for the cursor spell (Phase 8);
 *                 scroll cycles spell highlight; double-tap = close stub (Phase 6 NAV-01).
 *
 * **Container strategy:** single text container `overlay-block`, zero image containers.
 * `getContainerCount()` returns `{ image: 0, text: 1 }` (Strategy A exemplar).
 */
export default class SpellbookPanel implements OverlayPanel {
  /**
   * Static metadata validated by `PanelRouter.discoverPanels` at boot.
   *
   * `navKey: 'B'` — Quick Action `[B]` key (Phase 6 wires the gesture).
   * `requiredCaps: []` — read-only panel, no server capability required.
   */
  static meta: PanelMeta = {
    id: 'spellbook',
    title: { it: 'Libro Incantesimi', en: 'Spellbook', de: 'Zauberbuch' },
    navKey: 'B',
    requiredCaps: [],
  };

  /** Stable panel id matching `static meta.id` (LayerManager + telemetry). */
  public readonly id = 'spellbook';

  /** Z-index slot — z=2 overlay per ADR-0009 Amendment 1. */
  public readonly z = 2;

  // ─── Private state ─────────────────────────────────────────────────────────

  /**
   * Scroll offset within the content area.
   *
   * Reset to 0 on panel mount. Incremented/decremented by scroll gestures.
   */
  private scrollOffset = 0;

  /**
   * Latest character snapshot delivered by the boot orchestrator's WS handler.
   *
   * `null` until the first snapshot arrives (pre-first-delta race condition).
   * `draw()` renders defensively when `null`.
   */
  private snapshot: CharacterSnapshot | null = null;

  /**
   * Unsubscribe closure returned by PanelGestureBus.subscribe.
   *
   * Set in `onMount`; invoked and nulled in `onUnmount` (T-4b-01-03 mitigation).
   */
  private unsubscribe: (() => void) | null = null;

  /**
   * Optional Action Options handler injected by the boot orchestrator (Plan 08-05).
   *
   * When set, `onEvent('tap')` calls this handler with the currently highlighted
   * spell's ActionOptionsRequest. When null, tap falls back to a re-draw no-op
   * (the Quick Action menu now opens via the router-level over-scroll dispatcher,
   * ADR-0012 D-2 — not from this panel).
   *
   * Plan 08-05 wires this via `panel.setActionOptionsHandler(handler)` after
   * boot mounts the panel. The setter is preferred over a constructor arg to
   * avoid breaking the 3-arg PanelConstructor signature used by PanelRouter.
   */
  private actionOptionsHandler: ((req: ActionOptionsRequest) => void) | null = null;

  // ─── Constructor ───────────────────────────────────────────────────────────

  /**
   * @param bridge     Even Hub bridge handle for `textContainerUpgrade` render calls.
   * @param gestureBus In-process PanelGestureBus — subscribed in `onMount`.
   * @param locale     Active HUD locale.
   */
  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly gestureBus: PanelGestureBus,
    private readonly locale: HudLocale,
  ) {}

  // ─── OverlayPanel lifecycle ────────────────────────────────────────────────

  /**
   * Acquire panel resources.
   *
   * Subscribes to the gesture bus and issues the initial draw.
   * LayerManager.bundle awaits this BEFORE `rebuildPageContainer` (ADR-0009).
   */
  async onMount(): Promise<void> {
    this.scrollOffset = 0;
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
    await this.draw();
  }

  /**
   * Release gesture bus subscription (T-4b-01-03 mitigation).
   *
   * Idempotent: double-call is safe (null guard prevents double-free).
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
   * Dispatch table per UI-SPEC §7.1 (ADR-0012 D-3 — context action on tap):
   * - `tap`         → open Action Options for the cursor spell (Phase 8)
   * - `scroll-down` → advance scroll offset; re-draw
   * - `scroll-up`   → retreat scroll offset; re-draw (clamps at 0 — over-scroll opens Quick Action)
   * - `double-tap`  → close stub (Phase 6 NAV-01)
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'tap': {
        // ADR-0012 D-3: tap opens Action Options for the cursor spell.
        // Phase 8 Plan 08-03: if setActionOptionsHandler was called, dispatch to it.
        // Otherwise, remain a re-draw no-op (Quick Action now opens via the
        // router-level over-scroll dispatcher, ADR-0012 D-2 — not from this panel).
        if (this.actionOptionsHandler === null) {
          void this.draw();
          break;
        }
        // Resolve the spell under the cursor ROW via the header-aware row → spell map
        // (NOT spells[scrollOffset], which mis-maps after a section header). The cursor
        // row is the clamped scroll offset = first visible row.
        const rowItemMap = buildSpellbookRowItemMap(this.snapshot);
        const clampedOffset = Math.max(
          0,
          Math.min(this.scrollOffset, Math.max(0, rowItemMap.length - (ROW_COUNT - 1))),
        );
        const spell = resolveSpellAtRow(rowItemMap, clampedOffset);
        if (this.snapshot === null || spell == null) {
          console.warn('[spellbook-panel] tap with no spell under cursor row — no-op');
          break;
        }
        // requiresTarget heuristic: spells with a real range that are not reactions typically
        // need a target. Phase 9 refines this with actual server-side range data.
        const requiresTarget =
          spell.range !== 'self' && spell.range !== '' && spell.activation !== 'reaction';
        this.actionOptionsHandler({
          kind: 'spell',
          name: spell.name,
          actorId: this.snapshot.actorId,
          itemId: spell.id,
          requiresTarget,
        });
        break;
      }
      case 'scroll':
        if (gesture.direction === 'down') {
          this.scrollOffset += 1;
        } else {
          this.scrollOffset = Math.max(0, this.scrollOffset - 1);
        }
        void this.draw();
        break;
      case 'double-tap':
        // Phase 6 NAV-01 stub: close → MAIN_MAP
        break;
    }
  }

  /**
   * INV-5 over-scroll boundary probe (ADR-0012 D-2).
   *
   * Returns `true` when the panel is scrolled to the top, so a swipe-up at this
   * point is an over-scroll that the router-level dispatcher routes to the Quick
   * Action menu (the panel's own swipe-up is a clamped no-op at offset 0).
   */
  isAtTopBoundary(): boolean {
    return this.scrollOffset === 0;
  }

  /**
   * Inject the action options handler for tap dispatch (Plan 08-03 wire point).
   *
   * Called by the boot orchestrator (Plan 08-05) after the panel is mounted.
   * When non-null, `onEvent('tap')` calls this handler with the currently
   * highlighted spell's `ActionOptionsRequest`. When null, tap reverts to a
   * re-draw no-op (Quick Action opens via the over-scroll dispatcher, ADR-0012 D-2).
   *
   * Pass `null` to remove the handler (useful in tests that verify the no-op path).
   *
   * @param handler Callback receiving the request for the highlighted spell,
   *                or null to disable Phase 8 tap wiring.
   */
  setActionOptionsHandler(handler: ((req: ActionOptionsRequest) => void) | null): void {
    this.actionOptionsHandler = handler;
  }

  /**
   * Deliver a new character snapshot to the panel.
   *
   * Called by the boot orchestrator's WS `character.delta` handler.
   * Schedules a re-draw so the content reflects the latest snapshot.
   *
   * @param snapshot The validated CharacterSnapshot from the WS delta
   */
  onSnapshot(snapshot: CharacterSnapshot): void {
    this.snapshot = snapshot;
    void this.draw();
  }

  /**
   * Render spellbook content via a single `bridge.textContainerUpgrade` call.
   *
   * Renders the standalone view (UI-SPEC §5.11) using
   * `renderSpellbookStandaloneContent`. Resolves when the bridge promise settles.
   */
  async draw(): Promise<void> {
    const rows = renderSpellbookStandaloneContent(this.snapshot, this.locale, this.scrollOffset);
    const payload = new TextContainerUpgrade({
      containerName: SPELLBOOK_PANEL_CONTAINER_NAME,
      content: rows.join('\n'),
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /**
   * Tear down the panel — no-op (bus unsubscribe lives in `onUnmount`).
   */
  destroy(): void {
    // Intentionally empty: LayerManager calls onUnmount before destroy.
  }

  /**
   * Container count declaration (Strategy A — single text container, zero image).
   *
   * @returns `{ image: 0, text: 1 }`
   */
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 1 };
  }

  /**
   * R1 hint metadata for the StatusHudRenderer context chip (Plan 06-03).
   *
   * Returns the parsed hint object from the pre-composed `hud_r1_spell` i18n
   * string — e.g. IT: `{ tap: 'lancia', scroll: 'incant', quickActionLabel: 'q[spell]' }`.
   *
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (visible enforcement)
   * @see packages/g2-app/src/status-hud/i18n-budgets.ts hud_r1_spell key
   */
  getR1Hints(): {
    readonly tap: string;
    readonly scroll: string;
    readonly quickActionLabel: string;
  } {
    return parseR1HintString(getLabel('hud_r1_spell', this.locale));
  }
}
