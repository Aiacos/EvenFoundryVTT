/**
 * LogPanel — z=2 overlay panel presenting the Foundry chat log tail (read-only).
 *
 * ## Layout (UI-SPEC §5.9)
 *
 * The panel renders 18 content rows × 66 code-points (inner content, Strategy A
 * single `'overlay-block'` text container). Row structure:
 *
 * ```
 * ┌─── REGISTRO EVENTI ─── [TUTTI] Tiri Danni Stato Chat ─────────────┐
 * │  T+00:01  THORIN     ⚔ Spada lunga  vs Goblin Arciere             │
 * │             → 23 vs CA 13   COLPITO     12 taglio                 │
 * │  T-00:12  GOB ARC    ⚔ Arco corto    vs Thorin                   │
 * │  ...                                                               │
 * │  ▼ scroll per i più vecchi                                        │
 * └───────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Event row format (UI-SPEC §5.9)
 *
 * Main row: `  T±MM:SS  <ACTOR-10>  <icon> <description-40>`
 * Optional result sub-row: `             → <result-line-53>`
 *
 * Icon mapping: `⚔` attack, `✦` feature, `✧` spell, `—` other.
 * Timestamp: relative to caller-provided `nowEpoch`; format `T-MM:SS` or `T+MM:SS`.
 *
 * ## Container strategy (Strategy A — ADR-0009 Amendment 1)
 *
 * Single text container `'overlay-block'`. `getContainerCount()` returns
 * `{ image: 0, text: 1 }`. No image containers.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-05-PLAN.md
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §5.9
 * @see docs/architecture/0009-layer-manager-contract.md Amendment 1
 * @see docs/architecture/0010-panel-plugin-registry.md (ADR-0010)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { LogEvent, LogSnapshot } from '@evf/shared-protocol';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';

// ─── Layout constants ─────────────────────────────────────────────────────────

/** Inner content width (66 code-points per UI-SPEC §5.9). */
const INNER_WIDTH = 66;

/** Total content rows rendered into the overlay-block container. */
const CONTENT_ROWS = 18;

/** Active log filter type. */
type LogFilter = 'all' | 'rolls' | 'damage' | 'status' | 'chat';

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Truncate `value` to `max` code-points, appending `…` if cut.
 *
 * Mirror of CombatTrackerPanel._truncate (INV-1 width-budget rule).
 */
function _truncate(value: string, max: number): string {
  const cps = [...value];
  if (cps.length <= max) return value;
  return `${cps.slice(0, max - 1).join('')}…`;
}

/**
 * Right-pad or truncate `value` to exactly `width` code-points.
 */
function _pad(value: string, width: number): string {
  const cps = [...value];
  if (cps.length === width) return value;
  if (cps.length < width) return `${value}${' '.repeat(width - cps.length)}`;
  return `${cps.slice(0, width - 1).join('')}…`;
}

/**
 * Format a relative timestamp from `deltaSeconds` (positive = past, negative = future).
 *
 * Format: `T-MM:SS` for past events, `T+MM:SS` for future (rare).
 * Total: 7 code-points.
 */
function _formatTimestamp(deltaSeconds: number): string {
  const sign = deltaSeconds >= 0 ? '-' : '+';
  const abs = Math.abs(deltaSeconds);
  const mins = Math.floor(abs / 60);
  const secs = abs % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return `T${sign}${mm}:${ss}`;
}

/**
 * Map a {@link LogEventKind} to its icon glyph (1 code-point).
 *
 * Per UI-SPEC §5.9: `⚔` attack, `✦` feature, `✧` spell, `—` other.
 */
function _kindIcon(kind: LogEvent['kind']): string {
  switch (kind) {
    case 'attack':
      return '⚔';
    case 'feature':
      return '✦';
    case 'spell':
      return '✧';
    default:
      return '—';
  }
}

/**
 * Render a single log event as 1 or 2 strings of exactly INNER_WIDTH code-points.
 *
 * Main row format (66 chars):
 * ```
 *   T±MM:SS  <ACTOR-10>  <icon> <description-40>
 * ```
 * - 2 leading spaces
 * - Timestamp: 7 chars
 * - 2 spaces
 * - Actor name: 10 chars (truncate with `…`)
 * - 2 spaces
 * - Icon: 1 char
 * - Space
 * - Description: 40 chars (truncate with `…`)
 * Total so far: 2+7+2+10+2+1+1+40 = 65. Plus 1 trailing space = 66.
 *
 * Optional result sub-row (66 chars):
 * ```
 *              → <result-53>
 * ```
 * - 13 spaces + `→ ` (2) + result (53) = 68... use 13-space indent + `→ ` + 51-char result = 66.
 *
 * @param event    The log event to render.
 * @param locale   Active HUD locale.
 * @param nowEpoch Reference epoch for relative timestamp (ms).
 */
export function renderLogEvent(event: LogEvent, locale: HudLocale, nowEpoch: number): string[] {
  const deltaSeconds = Math.floor((nowEpoch - event.timestamp) / 1000);
  const ts = _formatTimestamp(deltaSeconds); // 7 chars

  const actor = _pad(_truncate(event.actorName, 10), 10); // 10 chars
  const icon = _kindIcon(event.kind); // 1 char
  const desc = _pad(_truncate(event.description, 40), 40); // 40 chars

  // 2 + 7 + 2 + 10 + 2 + 1 + 1 + 40 + trailing = 65 + 1 trailing = 66
  const mainRow = _pad(`  ${ts}  ${actor}  ${icon} ${desc}`, INNER_WIDTH);

  if (event.result === undefined) {
    return [mainRow];
  }

  // Result sub-line: 13-space indent + '→ ' (2) + result content (up to 51 chars)
  const indent = ' '.repeat(13);
  const arrow = '→ ';
  const resultBudget = INNER_WIDTH - indent.length - arrow.length; // 66 - 13 - 2 = 51

  let resultContent: string;
  switch (event.result.kind) {
    case 'hit': {
      const label = getLabel('log.result.hit', locale);
      const dmg = event.result.damage !== undefined ? `  ${event.result.damage}` : '';
      const val = event.result.value !== undefined ? `  ${String(event.result.value)} vs` : '';
      resultContent = `${val}  ${label}${dmg}`;
      break;
    }
    case 'miss': {
      const label = getLabel('log.result.miss', locale);
      const val = event.result.value !== undefined ? `  ${String(event.result.value)} vs` : '';
      resultContent = `${val}  ${label}`;
      break;
    }
    case 'pass': {
      const label = getLabel('log.result.pass', locale);
      const val = event.result.value !== undefined ? `  ${String(event.result.value)} →` : '';
      resultContent = `${val}  ${label}`;
      break;
    }
    case 'fail': {
      const label = getLabel('log.result.fail', locale);
      const val = event.result.value !== undefined ? `  ${String(event.result.value)} →` : '';
      resultContent = `${val}  ${label}`;
      break;
    }
    case 'concentrating': {
      resultContent = getLabel('log.concentrating', locale);
      break;
    }
  }

  const resultLine = _pad(
    `${indent}${arrow}${_truncate(resultContent, resultBudget)}`,
    INNER_WIDTH,
  );

  return [mainRow, resultLine];
}

/**
 * Render the log filter bar row (66 code-points).
 *
 * Format per UI-SPEC §5.9:
 * ```
 * ─── REGISTRO EVENTI ─── [TUTTI] Tiri Danni Stato Chat ─────────────
 * ```
 * Active filter uses `[▶TUTTI]` style.
 *
 * @param activeFilter The currently active log filter.
 * @param locale       Active HUD locale.
 */
export function renderLogFilterBar(activeFilter: LogFilter, locale: HudLocale): string {
  const title = getLabel('log.panel_title', locale);
  const allLabel = getLabel('log.filter.all', locale);
  const rollsLabel = getLabel('log.filter.rolls', locale);
  const damageLabel = getLabel('log.filter.damage', locale);
  const statusLabel = getLabel('log.filter.status', locale);
  const chatLabel = getLabel('log.filter.chat', locale);

  // Active filter uses `▶` prefix within the bracket cell
  const allCell = activeFilter === 'all' ? `[▶${allLabel.slice(1)}` : allLabel;
  const filterRow = `─── ${title} ─── ${allCell} ${rollsLabel} ${damageLabel} ${statusLabel} ${chatLabel}`;
  return _pad(filterRow, INNER_WIDTH);
}

/**
 * Render the full 18-row content area for the LogPanel.
 *
 * Row structure:
 * 1. Title + filter bar (combined first row)
 * 2. Log event rows (1-2 rows each; scrollOffset shifts the visible window)
 * 3. Scroll hint row
 * 4. Bottom border
 * 5. Remaining rows padded with spaces
 *
 * Empty state: 18 rows with centered `log.empty` message.
 *
 * @param snapshot     Log snapshot (events array), or null → empty state.
 * @param locale       Active HUD locale.
 * @param scrollOffset Scroll offset applied to the event window.
 * @param nowEpoch     Reference epoch for relative timestamps (ms).
 */
export function renderLogContent(
  snapshot: LogSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
  nowEpoch: number,
): string[] {
  const topBorder = `${_pad(`┌─── ${getLabel('log.panel_title', locale)} `, INNER_WIDTH - 1)}┐`;
  const bottomBorder = `└${'─'.repeat(INNER_WIDTH - 2)}┘`;
  const blankRow = ' '.repeat(INNER_WIDTH);

  if (snapshot === null || snapshot.events.length === 0) {
    // Empty state — centered `log.empty` message
    const emptyMsg = getLabel('log.empty', locale);
    const paddingLeft = Math.floor((INNER_WIDTH - [...emptyMsg].length) / 2);
    const centeredRow = _pad(' '.repeat(paddingLeft) + emptyMsg, INNER_WIDTH);

    const rows: string[] = [topBorder];
    for (let i = 0; i < 7; i++) rows.push(blankRow);
    rows.push(centeredRow);
    for (let i = 0; i < 8; i++) rows.push(blankRow);
    rows.push(bottomBorder);
    return rows.slice(0, CONTENT_ROWS);
  }

  // Build event rows (newest-to-oldest for display; scrollOffset applied)
  const events = snapshot.events.slice().reverse(); // newest first
  const startIdx = Math.max(0, scrollOffset);
  const visibleEvents = events.slice(startIdx);

  const assembled: string[] = [topBorder];

  // Budget: 18 total - 1 title - 1 scroll hint - 1 bottom border = 15 content rows max
  const contentBudget = CONTENT_ROWS - 3;
  let usedRows = 0;

  for (const event of visibleEvents) {
    if (usedRows >= contentBudget) break;
    const rows = renderLogEvent(event, locale, nowEpoch);
    for (const row of rows) {
      if (usedRows >= contentBudget) break;
      assembled.push(row);
      usedRows++;
    }
  }

  // Scroll hint row
  const scrollHintRow = _pad(`  ${getLabel('log.scroll_hint', locale)}`, INNER_WIDTH);

  // Fill remaining space between events and scroll hint
  while (assembled.length < CONTENT_ROWS - 2) assembled.push(blankRow);

  assembled.push(scrollHintRow);
  assembled.push(bottomBorder);

  // Clamp to CONTENT_ROWS
  while (assembled.length < CONTENT_ROWS) assembled.push(blankRow);
  return assembled.slice(0, CONTENT_ROWS);
}

// ─── LogPanel ─────────────────────────────────────────────────────────────────

/**
 * Read-only Foundry chat log tail overlay (z=2).
 *
 * Implements {@link OverlayPanel} following the ConcentrationDropModalPanel
 * + CharacterSheetPanel exemplar patterns (constructor shape, `overlay-block`
 * container name, Strategy A single text container, gesture bus subscription lifecycle).
 *
 * Auto-discovered by {@link PanelRouter.discoverPanels} because this file matches
 * the `**\/*-panel.ts` glob and `static meta` passes {@link PanelMetaSchema}.
 */
export default class LogPanel implements OverlayPanel {
  /**
   * Static metadata validated by {@link PanelRouter.discoverPanels} at boot.
   *
   * `navKey: 'L'` — Quick Action menu key (Phase 6 wires the gesture).
   * `requiredCaps: []` — Phase 5 panels are read-only and need no server caps.
   */
  static meta: PanelMeta = {
    id: 'log',
    title: { it: 'Registro', en: 'Log', de: 'Protokoll' },
    navKey: 'L',
    requiredCaps: [],
  };

  /** Stable panel id matching `static meta.id` (LayerManager + telemetry). */
  public readonly id = 'log';

  /** Z-index slot — z=2 overlay per ADR-0009 Amendment 1. */
  public readonly z = ZIndex.Z2_OVERLAY;

  // ─── Private state ──────────────────────────────────────────────────────────

  /**
   * Latest log snapshot delivered via {@link onSnapshot}.
   *
   * `null` until the first snapshot arrives. draw() renders the empty state when null.
   */
  private snapshot: LogSnapshot | null = null;

  /**
   * Scroll offset into the event list (oldest entries revealed by scrolling down).
   *
   * Incremented by `scroll-down` (reveal older events), decremented by `scroll-up`.
   * Clamped to [0, events.length - 1] at render time.
   */
  private scrollOffset = 0;

  /**
   * Active log filter (currently unused in Phase 5 render — all events shown).
   *
   * Phase 6 wires filter cycling to the tap gesture.
   */
  private activeFilter: LogFilter = 'all';

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
  ) {}

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
   * Dispatch table per UI-SPEC §5.9 gesture row:
   * - `tap`          → toggle result sub-line visibility (Phase 5 stub — no-op)
   * - `scroll-up`    → reveal newer events (scrollOffset -= 1, min 0); re-draw
   * - `scroll-down`  → reveal older events (scrollOffset += 1); re-draw
   * - `double-tap`   → no-op stub (Phase 6 NAV-01 wires close)
   * - `long-press`   → no-op stub (Phase 6 Quick Action)
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'tap':
        // Phase 5 no-op — Phase 6 wires result sub-line toggle / filter cycle.
        break;

      case 'scroll':
        if (gesture.direction === 'down') {
          // WR-02 fix: clamp scrollOffset to [0, events.length - 1] so the panel
          // cannot scroll past all content and get permanently "stuck".
          const maxOffset = Math.max(0, (this.snapshot?.events.length ?? 0) - 1);
          this.scrollOffset = Math.min(this.scrollOffset + 1, maxOffset);
        } else {
          this.scrollOffset = Math.max(0, this.scrollOffset - 1);
        }
        void this.draw();
        break;

      case 'double-tap':
        // Phase 6 NAV-01 wires close.
        break;

      case 'long-press':
        // Phase 6 Quick Action.
        break;
    }
  }

  /**
   * Update the panel with a fresh log snapshot without remounting.
   *
   * Called by the boot orchestrator's WS handler on `log.delta` envelope.
   * Resets `scrollOffset` to 0 on new snapshot (show newest events first).
   *
   * @param newSnapshot - Parsed {@link LogSnapshot} from the WS envelope.
   */
  onSnapshot(newSnapshot: LogSnapshot): void {
    this.scrollOffset = 0;
    this.snapshot = newSnapshot;
    void this.draw();
  }

  // ─── Layer interface ────────────────────────────────────────────────────────

  /**
   * Render the panel via a single `bridge.textContainerUpgrade` call.
   *
   * Delegates to {@link renderLogContent} for the 18-row body.
   * Strategy A: single text container `'overlay-block'`, no image containers.
   */
  async draw(): Promise<void> {
    const rows = renderLogContent(this.snapshot, this.locale, this.scrollOffset, Date.now());

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
   * Test-only accessor: currently active filter.
   *
   * Used by LP-FILTER-BAR-ACTIVE to verify the active filter state.
   * Production code MUST NOT depend on this — it is test scaffolding only.
   */
  getActiveFilter(): LogFilter {
    return this.activeFilter;
  }
}
