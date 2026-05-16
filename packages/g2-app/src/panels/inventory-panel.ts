/**
 * InventoryPanel — z=2 overlay panel rendering the player's inventory
 * per UI-SPEC §5.10 (standalone condensed view) and §5.4 (sheet-tab view).
 *
 * Implements {@link ../engine/layer-types.js#OverlayPanel}:
 *   - `onMount()`   — subscribes to PanelGestureBus
 *   - `onUnmount()` — unsubscribes (T-4b-01-03 mitigation — prevents subscriber leaks)
 *   - `onEvent(g)`  — tap toggles item detail; scroll cycles item highlight;
 *                     double-tap → close (Phase 6 NAV-01 stub); long-press → stub.
 *
 * **Column layout (UI-SPEC §5.4 shared for both sheet-tab and standalone):**
 * ```
 * Cols 0-2:   Indent (3 spaces)
 * Col  3:     Type glyph (⚔ weapon / ⛨ armor / ▶ consumable / space other)
 * Col  4:     Space
 * Cols 5-22:  Item name (18 chars, left-aligned, truncate with …; 2014 variant)
 *             OR cols 5-21 (17 chars) + space + [M] (2024 weapons only)
 * Cols 23-24: 2 spaces gap
 * Cols 25-46: Damage/tags (22 chars, left-aligned, truncate with …)
 * Cols 47-65: Additional tags (19 chars, space-padded)
 * ```
 *
 * **Container strategy (Strategy A — exemplar pattern):**
 * Single text container (`overlay-block`), zero image containers.
 * `getContainerCount()` returns `{ image: 0, text: 1 }`.
 *
 * **Dual-edition branching (SHEET-03 / CONTEXT.md §Area 3):**
 * When `snapshot.world.modernRules === true`, weapon rows insert a `[M]` mastery
 * flag after the weapon name (col 22-24). Name column budget shrinks by 3 chars
 * (18 → 15) when the flag is present.
 *
 * **Threat model T-05-04-01:** `InventoryItemSchema` (z.object strict) gates the
 * wire payload — malformed item shapes are rejected by the reader before reaching here.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-04-PLAN.md
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §5.4 + §5.10
 * @see packages/g2-app/src/panels/concentration-drop-modal.ts (exemplar)
 * @see packages/g2-app/src/panels/character-sheet-panel.ts (exemplar)
 * @see packages/shared-protocol/src/payloads/character.ts (InventoryItemSchema)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { CharacterSnapshot, InventoryItem } from '@evf/shared-protocol';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { parseR1HintString } from '../status-hud/r1-hint-parser.js';
import { padRightUnicode, truncateUnicode } from './character-sheet-tab-renderers.js';

// ─── Width constants ───────────────────────────────────────────────────────────

/** Inner content width (66 code-points — UI-SPEC §4.1, 70-wide panel minus │ + space on each side). */
const INNER_WIDTH = 66;

/** Number of content rows per panel / tab (rows 4-21, below the tab strip). */
const ROW_COUNT = 18;

// ─── Column budget (UI-SPEC §5.4 column layout) ───────────────────────────────

/** Name column width for 2014 weapons (no mastery flag). */
const NAME_WIDTH_2014 = 18;

/** Name column width for 2024 weapons (with `[M]` mastery flag). */
const NAME_WIDTH_2024 = 14;

/** Width of the `[M]` mastery flag token (3 chars + leading space = 4 chars in row). */
const MASTERY_FLAG = '[M]';

/** Damage/effect column width (cols 25-46 relative to inner content). */
const DAMAGE_WIDTH = 22;

/** Tags suffix column width (cols 47-65). */
const TAGS_WIDTH = 19;

// ─── Item type glyphs (UI-SPEC §6.2 glyph dictionary) ────────────────────────

/** Map from dnd5e item type to a single display glyph. */
const ITEM_GLYPHS: Record<string, string> = {
  weapon: '⚔',
  armor: '⛨',
  equipment: '⛨',
  consumable: '▶',
  container: '▶',
  currency: ' ',
} as const;

/**
 * Retrieve the display glyph for an inventory item type.
 *
 * @internal
 */
function itemGlyph(type: string): string {
  return ITEM_GLYPHS[type] ?? ' ';
}

// ─── Overlay container name ───────────────────────────────────────────────────

/** Stable text-container name for the inventory panel payload (single-container strategy). */
export const INVENTORY_PANEL_CONTAINER_NAME = 'overlay-block' as const;

// ─── Row helpers ──────────────────────────────────────────────────────────────

/**
 * Render a single inventory item row — exactly `INNER_WIDTH` (66) code-points.
 *
 * Column layout (0-indexed):
 * ```
 * [0-2]  3-char indent (always spaces)
 * [3]    1-char type glyph (⚔ / ⛨ / ▶ / space)
 * [4]    1 space
 * [5-22] 18-char item name (2014) OR 14-char + " [M] " (2024 weapon)
 * [23-44] 22-char damage/effect (left-aligned, truncated)
 * [45-64] 19-char tags suffix (right-padded)
 * [65]   1 trailing space (INV-1 padding)
 * ```
 *
 * `[M]` flag: inserted after the weapon name when `modernRules === true` AND
 * `item.type === 'weapon'`. The name budget shrinks from 18 → 14 chars to
 * accommodate the 4-char `" [M]"` suffix.
 *
 * @param item        Validated InventoryItem from the character snapshot
 * @param locale      Active HUD locale (used for future localized tags)
 * @param modernRules PHB 2024 mode flag (drives `[M]` insertion)
 * @returns Exactly 66 code-points
 */
export function renderInventoryRow(
  item: InventoryItem,
  _locale: HudLocale,
  modernRules: boolean,
): string {
  const glyph = itemGlyph(item.type);
  const isWeapon = item.type === 'weapon';
  const showMastery = modernRules && isWeapon;

  // Name column — budget depends on mastery flag presence
  const nameBudget = showMastery ? NAME_WIDTH_2024 : NAME_WIDTH_2014;
  const nameCell = padRightUnicode(truncateUnicode(item.name, nameBudget), nameBudget);
  const masteryCell = showMastery ? ` ${MASTERY_FLAG} ` : ' ';

  // Damage / effect — use item.damage if present, else reconstruct from tags
  const damageStr = item.damage ?? '';
  const tagsArr = item.tags ?? [];
  const tagsStr = tagsArr.join('  ');

  // Compose the name+mastery+damage+tags block (must total INNER_WIDTH - 5 chars)
  // Row format: "   " [3] + glyph [1] + " " [1] + name [14-18] + masteryCell [1-5] + damage [22] + tags [19]
  // Total: 3 + 1 + 1 + nameWidth + masteryWidth + 22 + 19 = 46 + nameWidth + masteryWidth
  // For 2014: 3+1+1+18+1+22+19 = 65 → need 1 more char for 66 → trailing space
  // For 2024 weapon: 3+1+1+14+5+22+19 = 65 → need 1 more char → trailing space
  const damageCell = padRightUnicode(truncateUnicode(damageStr, DAMAGE_WIDTH), DAMAGE_WIDTH);
  const tagsCell = padRightUnicode(truncateUnicode(tagsStr, TAGS_WIDTH), TAGS_WIDTH);

  const row = `   ${glyph} ${nameCell}${masteryCell}${damageCell}${tagsCell}`;
  // Pad / trim to exactly INNER_WIDTH
  const cps = [...row];
  if (cps.length === INNER_WIDTH) return row;
  if (cps.length > INNER_WIDTH) return cps.slice(0, INNER_WIDTH).join('');
  return `${row}${' '.repeat(INNER_WIDTH - cps.length)}`;
}

/**
 * Produce a row of exactly `INNER_WIDTH` code-points from raw content.
 *
 * @internal
 */
function row66(content: string): string {
  const cps = [...content];
  if (cps.length === INNER_WIDTH) return content;
  if (cps.length > INNER_WIDTH) return cps.slice(0, INNER_WIDTH).join('');
  return `${content}${' '.repeat(INNER_WIDTH - cps.length)}`;
}

/**
 * Pad `rows` array with blank 66-char rows to fill `ROW_COUNT` entries.
 *
 * @internal
 */
function padToRowCount(rows: string[]): string[] {
  const result = rows.map((r) => row66(r));
  while (result.length < ROW_COUNT) {
    result.push(' '.repeat(INNER_WIDTH));
  }
  return result.slice(0, ROW_COUNT);
}

// ─── Section helpers ──────────────────────────────────────────────────────────

/**
 * Render the EQUIPPED section header + item rows for weapons + armor.
 *
 * Uses the `sheet.inv.equipped` i18n key for the header.
 *
 * @param items       Full inventory list (all types)
 * @param locale      Active HUD locale
 * @param modernRules PHB 2024 flag
 * @returns Array of content rows (header + item rows; no fixed length)
 */
export function renderEquippedSection(
  items: readonly InventoryItem[],
  locale: HudLocale,
  modernRules: boolean,
): string[] {
  const header = getLabel('sheet.inv.equipped', locale);
  const rows: string[] = [header];
  // Weapons + armor + equipment are all "equipped" (UI-SPEC §5.10: EQUIPAGGIAMENTO section)
  const equipped = items.filter(
    (i) => i.type === 'weapon' || i.type === 'armor' || i.type === 'equipment',
  );
  for (const item of equipped) {
    rows.push(renderInventoryRow(item, locale, modernRules));
  }
  return rows;
}

/**
 * Render the CONSUMABLES section header + item rows.
 *
 * Uses the `sheet.inv.consumables` i18n key for the header.
 *
 * @param items       Full inventory list (all types)
 * @param locale      Active HUD locale
 * @param modernRules PHB 2024 flag
 * @returns Array of content rows
 */
export function renderConsumablesSection(
  items: readonly InventoryItem[],
  locale: HudLocale,
  modernRules: boolean,
): string[] {
  const header = getLabel('sheet.inv.consumables', locale);
  const rows: string[] = [header];
  const consumables = items.filter((i) => i.type === 'consumable');
  for (const item of consumables) {
    rows.push(renderInventoryRow(item, locale, modernRules));
  }
  return rows;
}

/**
 * Render the CARRIED / PORTATO section header + item rows.
 *
 * For the sheet-tab: includes all carried items (containers + loot + tools).
 * For standalone: callers pass `condensed=true` which produces a single
 * summary line listing item names separated by `  ` (UI-SPEC §5.10 "PORTATO" line).
 *
 * @param items      Full inventory list (all types)
 * @param locale     Active HUD locale
 * @param condensed  `true` = standalone panel (single summary line); `false` = sheet-tab (full list)
 * @returns Array of content rows
 */
export function renderCarriedSection(
  items: readonly InventoryItem[],
  locale: HudLocale,
  condensed: boolean,
): string[] {
  const header = condensed
    ? getLabel('inv.section.carried', locale)
    : getLabel('sheet.inv.carried', locale);
  // Only 'container' and 'currency' items are "carried but not equipped or consumed".
  // dnd5e loot/tool types are filtered out by the reader (mapItemType returns null),
  // so they never appear in the snapshot inventory array.
  const carried = items.filter((i) => i.type === 'container' || i.type === 'currency');

  if (condensed) {
    // Standalone: one condensed summary line of item names
    const names = carried.map((i) => {
      const qty = (i.quantity ?? 1) > 1 ? ` ×${i.quantity}` : '';
      return `${truncateUnicode(i.name, 12)}${qty}`;
    });
    const summaryLine =
      names.length > 0
        ? truncateUnicode(names.join('  '), INNER_WIDTH - 3)
        : getLabel('inv.empty', locale);
    return [header, `   ${summaryLine}`];
  }

  // Sheet-tab: full list
  const rows: string[] = [header];
  for (const item of carried) {
    const qty = (item.quantity ?? 1) > 1 ? ` ×${item.quantity}` : '';
    rows.push(`   ${truncateUnicode(item.name, 20)}${qty}`);
  }
  return rows;
}

// ─── Sheet-tab renderer ───────────────────────────────────────────────────────

/**
 * Render the Inventory tab content (sheet-tab variant, UI-SPEC §5.4).
 *
 * Returns **18 rows** of exactly **66 code-points** each.
 *
 * Layout (rows 0-17):
 * - Row 0:       EQUIPPED section header
 * - Rows 1-N:    Weapon + armor rows
 * - Row N+1:     CONSUMABLES section header
 * - Rows N+2-M:  Consumable rows
 * - Row M+1:     CARRIED section header
 * - Rows M+2-P:  Carried item names
 * - Last row:    Scroll hint
 *
 * Scroll windowing: `scrollOffset` controls which visible rows appear in the
 * fixed 18-row window. Content beyond the window is hidden.
 *
 * When `snapshot === null`, all 18 rows are blank placeholders.
 *
 * @param snapshot     Character snapshot or null (pre-first-WS-delta state)
 * @param locale       Active HUD locale
 * @param scrollOffset First visible content row index
 * @returns 18 strings, each exactly 66 code-points wide
 */
export function renderInventoryTabContent(
  snapshot: CharacterSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
): string[] {
  if (snapshot === null) {
    return Array.from({ length: ROW_COUNT }, () => ' '.repeat(INNER_WIDTH));
  }

  const modernRules = snapshot.world.modernRules;
  const inventory = snapshot.inventory;
  const _scrollHint = getLabel('inv.scroll_hint', locale);

  // Build all content rows (unbounded)
  const allRows: string[] = [];
  allRows.push(...renderEquippedSection(inventory, locale, modernRules));
  allRows.push('');
  allRows.push(...renderConsumablesSection(inventory, locale, modernRules));
  allRows.push('');
  allRows.push(...renderCarriedSection(inventory, locale, false));

  // Apply scroll windowing (last row reserved for scroll hint)
  const clampedOffset = Math.max(
    0,
    Math.min(scrollOffset, Math.max(0, allRows.length - (ROW_COUNT - 1))),
  );
  const visibleRows = allRows.slice(clampedOffset, clampedOffset + ROW_COUNT - 1);

  const rows: string[] = [...visibleRows];

  // Last row: scroll hint
  rows.push(truncateUnicode(_scrollHint, INNER_WIDTH));

  return padToRowCount(rows);
}

// ─── Standalone renderer ──────────────────────────────────────────────────────

/**
 * Render the standalone InventoryPanel body (UI-SPEC §5.10).
 *
 * Returns **18 rows** of exactly **66 code-points** each.
 *
 * Differs from sheet-tab variant:
 * - CARRIED section is condensed to a single summary line
 * - No currency strip, no encumbrance bar (per UI-SPEC §5.10)
 *
 * @param snapshot     Character snapshot or null
 * @param locale       Active HUD locale
 * @param scrollOffset First visible content row index
 * @returns 18 strings, each exactly 66 code-points wide
 */
export function renderInventoryStandaloneContent(
  snapshot: CharacterSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
): string[] {
  if (snapshot === null) {
    return Array.from({ length: ROW_COUNT }, () => ' '.repeat(INNER_WIDTH));
  }

  const modernRules = snapshot.world.modernRules;
  const inventory = snapshot.inventory;
  const scrollHint = getLabel('inv.scroll_hint', locale);
  const equippedHeader = getLabel('inv.section.equipped', locale);
  const consumablesHeader = getLabel('inv.section.consumables', locale);

  // Build all content rows (unbounded)
  const allRows: string[] = [];

  // EQUIPPED section (using standalone i18n key)
  allRows.push(equippedHeader);
  const equipped = inventory.filter(
    (i) => i.type === 'weapon' || i.type === 'armor' || i.type === 'equipment',
  );
  for (const item of equipped) {
    allRows.push(renderInventoryRow(item, locale, modernRules));
  }
  allRows.push('');

  // CONSUMABLES section (using standalone i18n key)
  allRows.push(consumablesHeader);
  const consumables = inventory.filter((i) => i.type === 'consumable');
  for (const item of consumables) {
    allRows.push(renderInventoryRow(item, locale, modernRules));
  }
  allRows.push('');

  // CARRIED — condensed single summary line (UI-SPEC §5.10 distinguishing feature)
  allRows.push(...renderCarriedSection(inventory, locale, true));

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

// ─── InventoryPanel class ─────────────────────────────────────────────────────

/**
 * Standalone Inventory overlay panel (z=2).
 *
 * Auto-discovered by `PanelRouter.discoverPanels` via the `**\/*-panel.ts` glob.
 * The Quick Action `[I]` key wires this panel in Phase 6.
 *
 * Renders the condensed standalone view (UI-SPEC §5.10): EQUIPPED + CONSUMABLES +
 * condensed CARRIED summary. No currency strip; no encumbrance bar. Scroll reveals
 * further sections.
 *
 * **Lifecycle:**
 * - `onMount`   — subscribes to PanelGestureBus for R1 gesture fan-out.
 * - `onUnmount` — unsubscribes (T-4b-01-03 mitigation).
 * - `onEvent`   — tap toggles item detail sub-line (Phase 5 returns immediately);
 *                 scroll cycles item highlight; double-tap = close stub (Phase 6 NAV-01);
 *                 long-press = Quick Action stub (Phase 6).
 *
 * **Container strategy:** single text container `overlay-block`, zero image containers.
 * `getContainerCount()` returns `{ image: 0, text: 1 }` (Strategy A exemplar).
 */
export default class InventoryPanel implements OverlayPanel {
  /**
   * Static metadata validated by `PanelRouter.discoverPanels` at boot.
   *
   * `navKey: 'I'` — Quick Action `[I]` key (Phase 6 wires the gesture).
   * `requiredCaps: []` — read-only panel, no server capability required.
   */
  static meta: PanelMeta = {
    id: 'inventory',
    title: { it: 'Inventario', en: 'Inventory', de: 'Inventar' },
    navKey: 'I',
    requiredCaps: [],
  };

  /** Stable panel id matching `static meta.id` (LayerManager + telemetry). */
  public readonly id = 'inventory';

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
   * Dispatch table per UI-SPEC §7.1:
   * - `tap`         → toggle item detail sub-line (Phase 5 boundary: stub, returns immediately)
   * - `scroll-down` → advance scroll offset; re-draw
   * - `scroll-up`   → retreat scroll offset; re-draw
   * - `double-tap`  → close stub (Phase 6 NAV-01)
   * - `long-press`  → Quick Action stub (Phase 6)
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'tap':
        // Phase 5: toggle item detail stub — returns immediately (Phase 6 wires execution)
        void this.draw();
        break;
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
      case 'long-press':
        // Phase 6 Quick Action stub
        break;
    }
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
   * Render inventory content via a single `bridge.textContainerUpgrade` call.
   *
   * Renders the standalone condensed view (UI-SPEC §5.10) using
   * `renderInventoryStandaloneContent`. Resolves when the bridge promise settles.
   */
  async draw(): Promise<void> {
    const rows = renderInventoryStandaloneContent(this.snapshot, this.locale, this.scrollOffset);
    const payload = new TextContainerUpgrade({
      containerName: INVENTORY_PANEL_CONTAINER_NAME,
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
   * Returns the parsed hint object from the pre-composed `hud_r1_inv` i18n
   * string — e.g. IT: `{ tap: 'usa', scroll: 'oggetto', longPressLabel: 'q[inv]' }`.
   *
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (visible enforcement)
   * @see packages/g2-app/src/status-hud/i18n-budgets.ts hud_r1_inv key
   */
  getR1Hints(): { readonly tap: string; readonly scroll: string; readonly longPressLabel: string } {
    return parseR1HintString(getLabel('hud_r1_inv', this.locale));
  }
}
