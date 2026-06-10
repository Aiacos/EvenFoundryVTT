/**
 * SlotPickerPanel — z=2 OverlayPanel for spell-slot level selection (upcast/downcast).
 *
 * Presented when a player selects a spell with more than one available slot level
 * (i.e. `availableSlots.length > 1`). The player uses R1 scroll to cycle through
 * available levels and R1 tap to confirm, dispatching a canonical `tool.invoke`
 * envelope with `slot_level: <selected>`.
 *
 * ## CONTEXT.md §Area 2 — SlotPickerPanel decisions
 *
 * - Default selection = spell's base level (lowest sufficient slot, index 0 after
 *   caller pre-sorts ascending by level).
 * - Auto-skip: if only one slot level available, panel NOT shown (caller must not
 *   construct — construction throws on `availableSlots.length === 0`).
 * - Scroll = next slot level (any direction MVP-simple). Direction scroll-up/down
 *   both advance to next; Phase 10 may refine.
 * - Tap = confirm selection; emit tool.invoke + onCloseCb.
 * - Double-tap = cancel (close without emitting).
 * - Quick Action = opened by the router-level over-scroll dispatcher (swipe-up at
 *   the top boundary, ADR-0012); the panel never opens it itself.
 *
 * ## Container strategy (Strategy A — ADR-0009 Amendment 1)
 *
 * Single text container `'overlay-block'`. `getContainerCount()` returns
 * `{ image: 0, text: 1 }`. No image containers.
 *
 * ## dnd5e 5.3.3 slot API (verified via Phase 7 RESEARCH §Q1)
 *
 * `activity.use({ configure: false, spell: { slot: 'spell<N>' } })` where N is
 * the numeric slot level (1..9). Cantrips (level 0) omit the spell.slot override.
 * The cast-spell handler converts the numeric `slot_level` to the `spellN` data key.
 *
 * ## W-4 regression guard
 *
 * Outgoing `tool.invoke` envelope uses canonical `EnvelopeSchema` shape verbatim:
 * `proto/seq/ts/type/session_id/payload` — carrier field is `payload` (NOT `value`).
 * SPP-11 verifies EnvelopeSchema + ToolInvocationEnvelopePayloadSchema + CastSpellInputSchema
 * round-trip.
 *
 * ## T-09-06 mitigation
 *
 * Constructor THROWS if `availableSlots` is empty. Boot caller must auto-skip when
 * only zero or one slot level is available.
 *
 * @see .planning/phases/09-action-economy-edge-cases/09-04-PLAN.md Task 1
 * @see .planning/phases/09-action-economy-edge-cases/09-CONTEXT.md §Area 2 (SlotPickerPanel mockup)
 * @see packages/g2-app/src/panels/target-picker-panel.ts (OverlayPanel exemplar)
 * @see docs/architecture/0009-layer-manager-contract.md §Amendment 1 (Strategy A)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { SpellSlot } from '@evf/shared-protocol';
import { resolveContainerIdField } from '../engine/container-registry.js';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { parseR1HintString } from '../status-hud/r1-hint-parser.js';

// WR-03: crypto.randomUUID() is available in the Even Realities App WebView (WKWebView, iOS 15+)
// and in Node 24 test environments. The `declare const` ambient declaration satisfies TypeScript
// without importing from Node built-ins, matching the pattern in target-picker-panel.ts:59.
// Tests stub crypto.randomUUID via vi.stubGlobal('crypto', { randomUUID: () => '<uuid>' }).
declare const crypto: { randomUUID(): string };

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stable container name (Strategy A — single overlay-block container per ADR-0009 Amd 1). */
const SLOT_PICKER_CONTAINER_NAME = 'overlay-block' as const;

/**
 * Total frame width (inner content = 66 + 2 border chars each side = 70 total).
 * Matches Phase 5 CombatTrackerPanel + TargetPickerPanel width (70 visible chars).
 */
const FRAME_WIDTH = 70;

/** Inner content width (FRAME_WIDTH minus `│ ` + ` │` = 66 chars). */
const PANEL_INNER_WIDTH = FRAME_WIDTH - 4;

/** Total rows rendered per panel draw (including borders, spacers, hint row). */
const TOTAL_ROWS = 14;

/** Maximum display chars for spell name in title row. */
const SPELL_NAME_BUDGET = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal WebSocket send shape consumed by the panel.
 *
 * Tests inject a `vi.fn()` mock; production passes the real WebSocket.
 * Avoids depending on the full `WebSocket` interface so the panel module is
 * testable in `happy-dom` without polyfills.
 */
export interface SlotPickerWebSocket {
  send(data: string): void;
}

/** Invoked when the user confirms (tap) or cancels (double-tap). */
export type SlotPickerCloseHandler = () => void;

/**
 * Request context passed to SlotPickerPanel at construction.
 *
 * `availableSlots` MUST be pre-filtered to entries where `value > 0` and sorted
 * ascending by level. Length must be >= 1 (zero triggers constructor throw,
 * SPP-08 / T-09-06 mitigation). Boot caller auto-skips when length === 1.
 */
export interface SlotPickerRequest {
  /** Foundry actor document ID threaded into the outgoing tool.invoke args. */
  readonly actorId: string;
  /** Foundry spell item document ID threaded into the outgoing tool.invoke args. */
  readonly spellId: string;
  /** Display name for the spell (shown in panel title row, truncated to 30 chars). */
  readonly spellName: string;
  /** Base level of the spell (0 = cantrip; 1-9 = standard). Shown in row 2. */
  readonly baseLevel: number;
  /**
   * Available slot levels pre-filtered to `value > 0` and sorted ascending by level.
   * Index 0 is the default selection (base level if available, else lowest upcast).
   *
   * T-09-06: must be non-empty. Construction throws on empty array.
   */
  readonly availableSlots: ReadonlyArray<SpellSlot>;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/**
 * z=2 OverlayPanel — spell-slot level selection for spell casting flows.
 *
 * Mounted via `pushOverlay(panel, layerManager)` from boot-engine-core step 11f
 * when ActionOptionsModal closes with `requiresSlotPicker: true` (Plan 09-04).
 */
export class SlotPickerPanel implements OverlayPanel {
  /** Stable id — used by LayerManager + telemetry. */
  public readonly id = 'slot-picker';
  /** Opt-in: this panel handles double-tap internally (ADR-0012 D-3). */
  public readonly handlesDoubleTap = true as const;

  /** ZIndex — required by the LayerManager bundle API + tests. */
  public readonly z = ZIndex.Z2_OVERLAY;

  private readonly bridge: EvenAppBridge;
  private readonly ws: SlotPickerWebSocket;
  private readonly gestureBus: PanelGestureBus;
  private readonly request: SlotPickerRequest;
  private readonly locale: HudLocale;
  private readonly sessionId: string;
  private readonly onCloseCb: SlotPickerCloseHandler;

  /**
   * Current scroll selection index (0-based, within `request.availableSlots`).
   *
   * Defaults to 0 (spell's base level per caller pre-sort ordering —
   * base level is at index 0 if available, else lowest upcast slot).
   */
  private selectedIdx = 0;

  /** Unsubscribe closure from PanelGestureBus.subscribe — null until onMount. */
  private unsubscribe: (() => void) | null = null;

  /**
   * Construct the slot picker.
   *
   * @param bridge          Even Hub bridge handle for the single textContainerUpgrade call.
   * @param ws              WebSocket-like sink for the outgoing tool.invoke envelope.
   * @param gestureBus      In-process PanelGestureBus — subscribed in onMount.
   * @param request         Spell context (actorId, spellId, spellName, baseLevel, availableSlots).
   * @param locale          Active HUD locale — drives label lookup via getLabel.
   * @param sessionId       UUID v4 of the active WS session (threaded into envelopes).
   * @param onClose         Invoked after the user confirms (tap) or cancels (double-tap).
   * @throws Error          If `request.availableSlots` is empty (T-09-06 precondition violation).
   */
  constructor(
    bridge: EvenAppBridge,
    ws: SlotPickerWebSocket,
    gestureBus: PanelGestureBus,
    request: SlotPickerRequest,
    locale: HudLocale,
    sessionId: string,
    onClose: SlotPickerCloseHandler,
  ) {
    if (request.availableSlots.length === 0) {
      throw new Error(
        '[SlotPickerPanel] availableSlots must not be empty (SPP-08 / T-09-06). ' +
          'Boot caller must auto-skip the picker when no slots are available.',
      );
    }
    this.bridge = bridge;
    this.ws = ws;
    this.gestureBus = gestureBus;
    this.request = request;
    this.locale = locale;
    this.sessionId = sessionId;
    this.onCloseCb = onClose;
  }

  // ─── OverlayPanel lifecycle ────────────────────────────────────────────────

  /**
   * Subscribe to the gesture bus.
   *
   * LayerManager.bundle() awaits this BEFORE the rebuildPageContainer flush.
   */
  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
  }

  /**
   * Release the gesture bus subscription.
   *
   * Idempotent — null guard makes a second invocation safe (T-4b-01-03 pattern).
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
   * Dispatch table per CONTEXT.md §Area 2:
   *   - `scroll`       → advance selectedIdx cyclically (any direction = next — MVP simple);
   *                      re-draw panel.
   *   - `tap`          → emit canonical `tool.invoke` envelope with selected `slot_level` + onClose.
   *   - `double-tap`   → onClose WITHOUT emitting (cancel).
   *
   * Quick Action opens via over-scroll at the router level (ADR-0012) — the panel
   * does not handle it.
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'scroll': {
        // MVP: any scroll direction = advance to next (cycle).
        // Phase 10 may refine with directional scroll (scroll-down = next level, scroll-up = prev).
        this.selectedIdx = (this.selectedIdx + 1) % this.request.availableSlots.length;
        void this.draw();
        break;
      }

      case 'tap': {
        const selected = this.request.availableSlots[this.selectedIdx];
        // Should always be defined because selectedIdx is bounded by availableSlots.length
        if (selected === undefined) break;

        const envelope = {
          proto: 'evf-v1' as const,
          seq: 0,
          ts: Date.now(),
          type: 'tool.invoke' as const,
          session_id: this.sessionId,
          payload: {
            toolId: 'cast-spell' as const,
            idempotencyKey: crypto.randomUUID(),
            args: {
              actor_id: this.request.actorId,
              spell_id: this.request.spellId,
              slot_level: selected.level,
              targets: [] as string[],
            },
          },
        };
        this.ws.send(JSON.stringify(envelope));
        this.onCloseCb();
        break;
      }

      case 'double-tap': {
        // Cancel — close without emitting (SPP-07).
        this.onCloseCb();
        break;
      }
    }
  }

  /**
   * Whether the panel is at its top boundary (ADR-0012 D-2).
   *
   * The slot picker renders all available levels on one screen with no vertical
   * scroll cursor, so it is always at the top — any swipe-up is an over-scroll the
   * router-level dispatcher routes to the Quick Action menu.
   */
  isAtTopBoundary(): boolean {
    return true;
  }

  // ─── Layer contract ────────────────────────────────────────────────────────

  /**
   * Render the panel content via a single `bridge.textContainerUpgrade` call.
   *
   * Builds TOTAL_ROWS (14) rows of FRAME_WIDTH (70) chars each. Called by
   * LayerManager on mount and after scroll events for position refresh.
   */
  async draw(): Promise<void> {
    const lines = this._buildLines();
    const payload = new TextContainerUpgrade({
      // Overlay-only name → resolveContainerId returns undefined (addressed by
      // name until the overlay-id rebuild path lands; see container-registry.ts).
      ...resolveContainerIdField(SLOT_PICKER_CONTAINER_NAME),
      containerName: SLOT_PICKER_CONTAINER_NAME,
      content: lines.join('\n'),
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /** Tear down — no-op (cleanup is in onUnmount). */
  destroy(): void {
    // Intentionally empty — see onUnmount for lifecycle cleanup.
  }

  /**
   * Container footprint — Strategy A: one text container, zero image.
   *
   * @returns `{ image: 0, text: 1 }`
   */
  getContainerCount(): { image: 0; text: 1 } {
    return { image: 0, text: 1 };
  }

  /**
   * R1 context chip hints for the status HUD chip (Phase 6 NAV-01 pattern).
   *
   * Uses the composite `hud_r1_slot_picker` key which stores a pre-composed
   * chip string in `tap=<tap>  scroll=<scroll>  qa=<quick-action>` format per
   * parseR1HintString convention.
   */
  getR1Hints(): {
    readonly tap: string;
    readonly scroll: string;
    readonly quickActionLabel: string;
  } {
    return parseR1HintString(getLabel('hud_r1_slot_picker', this.locale));
  }

  // ─── Test-only accessor ────────────────────────────────────────────────────

  /**
   * Test-only: expose current selectedIdx.
   *
   * Allows unit tests to assert that scroll events correctly adjust the
   * selection without inspecting rendered content. Production code MUST NOT
   * depend on this method.
   */
  _getSelectedIdxForTest(): number {
    return this.selectedIdx;
  }

  // ─── Private rendering ────────────────────────────────────────────────────

  /**
   * Build the TOTAL_ROWS (14) rows of panel content.
   *
   * Layout per CONTEXT.md §Area 2 mockup:
   * ```
   * ┌──────────────────────────────────────────────────────────────────┐  row 0
   * │ INCANTESIMO: Palla di Fuoco                                      │  row 1
   * │ Livello base 3°                                                  │  row 2
   * │                                                                  │  row 3 (blank)
   * │   3°  (2/4 disponibili)                                          │  row 4+N (slot rows)
   * │ ▶ 4°  (3/3 disponibili)  ← upcast +1d6                          │
   * │   5°  (1/2 disponibili)  ← upcast +2d6                          │
   * │                                                                  │  (blank padding)
   * │  [tap] conferma  [×2] annulla                                   │  row 12 (hint row)
   * └──────────────────────────────────────────────────────────────────┘  row 13
   * ```
   */
  private _buildLines(): string[] {
    const titleKey = getLabel('slot_picker.title', this.locale);
    const baseLevelKey = getLabel('slot_picker.base_level', this.locale);
    const confirmHint = getLabel('slot_picker.confirm_hint', this.locale);
    const cancelHint = getLabel('slot_picker.cancel_hint', this.locale);

    // Top border: ┌──...──┐
    const topBorder = `┌${'─'.repeat(FRAME_WIDTH - 2)}┐`;
    const bottomBorder = `└${'─'.repeat(FRAME_WIDTH - 2)}┘`;

    // Row 1: title line with truncated spell name
    const truncatedName = this._truncate(this.request.spellName, SPELL_NAME_BUDGET);
    const titleLine = `${titleKey}: ${truncatedName}`;
    // Row 2: base level line
    const baseLevelLine = `${baseLevelKey} ${this.request.baseLevel}°`;

    const lines: string[] = [
      topBorder,
      this._innerRow(` ${titleLine}`),
      this._innerRow(` ${baseLevelLine}`),
      this._innerBlank(),
    ];

    // Slot rows (one per available slot)
    for (let i = 0; i < this.request.availableSlots.length; i++) {
      const slot = this.request.availableSlots[i];
      if (slot === undefined) continue;
      const isSelected = i === this.selectedIdx;
      const rowText = this._buildSlotRow(slot, isSelected);
      lines.push(this._innerRow(rowText));
    }

    // Fill rows up to (TOTAL_ROWS - 2): hint row is at row 12, bottom border at row 13
    // Current lines: 4 (header) + availableSlots.length (slot rows)
    const hintRowIdx = TOTAL_ROWS - 2; // row 12
    const currentBodyRows = lines.length; // all rows so far (including top border)
    const blankFill = hintRowIdx - currentBodyRows;
    for (let i = 0; i < blankFill; i++) {
      lines.push(this._innerBlank());
    }

    // Hint row (row 12)
    const hintText = `${confirmHint}  ${cancelHint}`;
    lines.push(this._innerRow(` ${hintText}`));

    // Bottom border (row 13)
    lines.push(bottomBorder);

    return lines;
  }

  /**
   * Build a single slot row for the given SpellSlot.
   *
   * Format: `<indicator><level>°  (<value>/<max> disponibili)  ← upcast +{N}d6`
   * where indicator is `▶` for selected and ` ` otherwise.
   */
  private _buildSlotRow(slot: SpellSlot, isSelected: boolean): string {
    const indicator = isSelected ? '▶' : ' ';
    const availTemplate = getLabel('slot_picker.available_template', this.locale);
    const availStr = availTemplate
      .replace('{N}', String(slot.value))
      .replace('{M}', String(slot.max));

    const levelStr = `${indicator} ${slot.level}°  ${availStr}`;

    // Add upcast annotation if this slot is above the spell's base level
    if (slot.level > this.request.baseLevel && this.request.baseLevel > 0) {
      const upcastTemplate = getLabel('slot_picker.upcast_template', this.locale);
      const levelDiff = slot.level - this.request.baseLevel;
      const upcastStr = upcastTemplate.replace('{N}', String(levelDiff));
      return `${levelStr}  ${upcastStr}`;
    }

    return levelStr;
  }

  /**
   * Wrap inner content with `│ ` ... ` │` panel side borders.
   *
   * Content shorter than PANEL_INNER_WIDTH is right-padded.
   * Longer content is truncated with `…`.
   * Returns a row of exactly FRAME_WIDTH (70) visible characters.
   */
  private _innerRow(text: string): string {
    const cps = [...text];
    let inner: string;
    if (cps.length >= PANEL_INNER_WIDTH) {
      inner = `${cps.slice(0, PANEL_INNER_WIDTH - 1).join('')}…`;
    } else {
      inner = `${text}${' '.repeat(PANEL_INNER_WIDTH - cps.length)}`;
    }
    return `│ ${inner} │`;
  }

  /**
   * Produce a blank inner row padded to PANEL_INNER_WIDTH.
   *
   * @returns A row of exactly FRAME_WIDTH (70) spaces inside the frame borders.
   */
  private _innerBlank(): string {
    return `│ ${' '.repeat(PANEL_INNER_WIDTH)} │`;
  }

  /**
   * Truncate `value` to `max` code-points, appending `…` if cut.
   *
   * Pattern mirrors TargetPickerPanel + ConcentrationDropModalPanel (INV-1 width-budget rule).
   */
  private _truncate(value: string, max: number): string {
    const cps = [...value];
    if (cps.length <= max) {
      return value;
    }
    return `${cps.slice(0, max - 1).join('')}…`;
  }
}
