/**
 * TargetPickerPanel — z=2 OverlayPanel for player target selection.
 *
 * Presents a scrollable list of valid combat/scene targets. The player uses R1
 * to scroll through candidates (`▶` indicator) and tap to confirm, dispatching a
 * canonical `tool.invoke` envelope with the selected `target_token_id` appended
 * to the caller's existing `callerArgs`.
 *
 * ## CONTEXT.md §Area 1 — target picker decisions
 *
 * - Double-tap = cancel (close without emitting)
 * - Empty list = render 'Nessun bersaglio' hint + auto-close after 2s via setTimeout
 * - Quick Action = opened by the router-level over-scroll dispatcher (swipe-up at
 *   the top boundary, ADR-0012); the panel never opens it itself
 * - No `static meta` — panel is opened directly via pushOverlay, NOT via Quick
 *   Action menu registry (same as ConcentrationDropModalPanel pattern)
 *
 * ## Container strategy (Strategy A — ADR-0009 Amendment 1)
 *
 * Single text container `'overlay-block'`. `getContainerCount()` returns
 * `{ image: 0, text: 1 }`. No image containers.
 *
 * ## W-4 regression guard
 *
 * Outgoing `tool.invoke` envelope uses canonical `EnvelopeSchema` shape verbatim:
 * `proto/seq/ts/type/session_id/payload` — carrier field is `payload` (NOT `value`).
 * TPP-14 tests verify EnvelopeSchema + ToolInvocationEnvelopePayloadSchema round-trip.
 *
 * ## T-08-03-01 (timer leak mitigation)
 *
 * `autoCloseTimer` is saved on onMount and cleared in onUnmount (idempotent null guard).
 * Prevents a late-firing timer from calling onClose after the panel has been destroyed.
 *
 * ## T-08-03-02 (rapid tap+auto-close race)
 *
 * Timer is cleared immediately on tap (onUnmount is called before onClose within the tap
 * handler via the caller's destroy bundle). Even if the race occurs, LayerManager.bundle's
 * idempotent destroy sequence handles double-close gracefully.
 *
 * @see .planning/phases/08-manual-action-ux/08-02-PLAN.md Task 2
 * @see .planning/phases/08-manual-action-ux/08-CONTEXT.md §Area 1 (target picker decisions)
 * @see packages/g2-app/src/panels/template-placement-panel.ts (lifecycle exemplar)
 * @see packages/g2-app/src/panels/concentration-drop-modal.ts (modal exemplar)
 * @see docs/architecture/0009-layer-manager-contract.md §Amendment 1 (Strategy A)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { resolveContainerIdField } from '../engine/container-registry.js';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { parseR1HintString } from '../status-hud/r1-hint-parser.js';
import { describeTargetRow, type TargetCandidate } from './target-resolver.js';

// WR-03: crypto.randomUUID() is available in the Even Realities App WebView (WKWebView, iOS 15+)
// and in Node 24 test environments. The `declare const` ambient declaration satisfies TypeScript
// without importing from Node built-ins, matching the pattern in template-placement-panel.ts:54.
// Tests stub crypto.randomUUID via vi.stubGlobal('crypto', { randomUUID: () => '<uuid>' }).
declare const crypto: { randomUUID(): string };

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stable container name (Strategy A — single overlay-block container per ADR-0009 Amd 1). */
const TARGET_PICKER_CONTAINER_NAME = 'overlay-block' as const;

/**
 * Total frame width (inner content = 66 + 2 border chars each side = 70 total).
 * Matches Phase 5 CombatTrackerPanel + QuickActionMenuPanel width (70 visible chars).
 */
const FRAME_WIDTH = 70;

/** Inner content width (FRAME_WIDTH minus `│ ` + ` │` = 66 chars). */
const PANEL_INNER_WIDTH = FRAME_WIDTH - 4;

/** Number of target rows visible at once in the scroll window. */
const VISIBLE_ROWS = 5;

/** Total rows rendered per panel draw (including borders, spacers, hint row). */
const TOTAL_ROWS = 18;

/** Empty-state auto-close delay in milliseconds (per CONTEXT.md §Area 1 decisions). */
const AUTO_CLOSE_MS = 2000;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal WebSocket send shape consumed by the panel.
 *
 * Tests inject a `vi.fn()` mock; production passes the real WebSocket.
 * Avoids depending on the full `WebSocket` interface so the panel module is
 * testable in `happy-dom` without polyfills.
 */
export interface TargetPickerWebSocket {
  send(data: string): void;
}

/** Invoked when the user confirms (tap) or cancels (double-tap), or empty-auto-close fires. */
export type TargetPickerCloseHandler = () => void;

/**
 * Tool invocation context passed by the caller when mounting TargetPickerPanel.
 *
 * Phase 8 narrows to the 3 tool IDs that require target selection:
 * `cast-spell`, `weapon-attack`, `use-item`. Other tools (move-token,
 * drop-concentration, place-template, confirm-template-placement) use their
 * own panels and never open TargetPickerPanel.
 */
export interface TargetPickerToolInvocation {
  readonly toolId: 'cast-spell' | 'weapon-attack' | 'use-item';
  /**
   * Caller-supplied arguments already resolved (actor ID, spell/item ID, etc.).
   * TargetPickerPanel appends `targets: [selectedTokenId]` before emitting.
   */
  readonly callerArgs: Record<string, unknown>;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/**
 * z=2 OverlayPanel — scrollable target selection list for action flows.
 *
 * Mounted via `pushOverlay(panel, layerManager)` from Plan 08-03 (ActionOptionsModal
 * confirm-tap) or Plan 08-05 (quick-action [A]/[S]/[I] bar tap flows). Plan 08-02
 * does NOT wire boot — Plan 08-05 owns boot-engine-core.ts.
 */
export class TargetPickerPanel implements OverlayPanel {
  /** Stable id — used by LayerManager + telemetry. */
  public readonly id = 'target-picker';

  /** ZIndex — required by the LayerManager bundle API + tests. */
  public readonly z = ZIndex.Z2_OVERLAY;

  private readonly bridge: EvenAppBridge;
  private readonly ws: TargetPickerWebSocket;
  private readonly gestureBus: PanelGestureBus;
  private readonly candidates: ReadonlyArray<TargetCandidate>;
  private readonly locale: HudLocale;
  private readonly sessionId: string;
  private readonly toolInvocation: TargetPickerToolInvocation;
  private readonly onCloseCb: TargetPickerCloseHandler;

  /**
   * Current scroll selection index (0-based, within `candidates`).
   *
   * Defaults to 0 which corresponds to the active-turn combatant
   * (per TR-02 ordering: active-turn first in resolveValidTargets output).
   */
  private selectedIdx = 0;

  /** Unsubscribe closure from PanelGestureBus.subscribe — null until onMount. */
  private unsubscribe: (() => void) | null = null;

  /**
   * Handle for the empty-state auto-close timer.
   *
   * T-08-03-01: saved here and cleared in onUnmount to prevent late-fire leaks.
   */
  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    bridge: EvenAppBridge,
    ws: TargetPickerWebSocket,
    gestureBus: PanelGestureBus,
    candidates: ReadonlyArray<TargetCandidate>,
    locale: HudLocale,
    sessionId: string,
    toolInvocation: TargetPickerToolInvocation,
    onClose: TargetPickerCloseHandler,
  ) {
    this.bridge = bridge;
    this.ws = ws;
    this.gestureBus = gestureBus;
    this.candidates = candidates;
    this.locale = locale;
    this.sessionId = sessionId;
    this.toolInvocation = toolInvocation;
    this.onCloseCb = onClose;
  }

  // ─── OverlayPanel lifecycle ────────────────────────────────────────────────

  /**
   * Subscribe to the gesture bus. If `candidates` is empty, schedule the
   * 2-second auto-close timer (T-08-03-01 mitigation saves the handle).
   *
   * LayerManager.bundle() awaits this BEFORE the rebuildPageContainer flush.
   */
  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));

    if (this.candidates.length === 0) {
      // TPP-03: empty-state auto-close timer
      this.autoCloseTimer = setTimeout(() => {
        this.autoCloseTimer = null;
        this.onCloseCb();
      }, AUTO_CLOSE_MS);
    }
  }

  /**
   * Release the gesture bus subscription and clear any pending auto-close timer.
   *
   * Idempotent — null guards make a second invocation safe (T-4b-01-03 pattern).
   * T-08-03-01: clears autoCloseTimer so no late-fire after destroy.
   */
  async onUnmount(): Promise<void> {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.autoCloseTimer !== null) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
  }

  /**
   * Handle a published R1 gesture.
   *
   * Dispatch table per CONTEXT.md §Area 1:
   *   - `scroll-down`  → selectedIdx++ mod candidates.length; re-draw
   *   - `scroll-up`    → selectedIdx-- mod candidates.length; re-draw
   *   - `tap`          → emit tool.invoke envelope + onClose (no-op if empty)
   *   - `double-tap`   → onClose WITHOUT emitting (cancel)
   *
   * Quick Action opens via over-scroll at the router level (ADR-0012) — the panel
   * does not handle it.
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'scroll': {
        if (this.candidates.length === 0) break;
        if (gesture.direction === 'down') {
          this.selectedIdx = (this.selectedIdx + 1) % this.candidates.length;
        } else {
          this.selectedIdx =
            (this.selectedIdx - 1 + this.candidates.length) % this.candidates.length;
        }
        void this.draw();
        break;
      }

      case 'tap': {
        // No-op when empty (auto-close timer is already running)
        if (this.candidates.length === 0) break;

        const selected = this.candidates[this.selectedIdx];
        // Should always be defined because selectedIdx is bounded by candidates.length
        if (selected === undefined) break;

        const envelope = {
          proto: 'evf-v1' as const,
          seq: 0,
          ts: Date.now(),
          type: 'tool.invoke' as const,
          session_id: this.sessionId,
          payload: {
            toolId: this.toolInvocation.toolId,
            idempotencyKey: crypto.randomUUID(),
            args: {
              ...this.toolInvocation.callerArgs,
              targets: [selected.tokenId],
            },
          },
        };
        this.ws.send(JSON.stringify(envelope));
        this.onCloseCb();
        break;
      }

      case 'double-tap':
        // Cancel — close without emitting
        this.onCloseCb();
        break;
    }
  }

  /**
   * Whether the target list selection cursor is at its top boundary (ADR-0012 D-2).
   *
   * The router-level over-scroll dispatcher reads this on a `scroll-up` gesture:
   * `true` means a further swipe-up is an over-scroll that opens the Quick Action menu.
   */
  isAtTopBoundary(): boolean {
    return this.selectedIdx === 0;
  }

  // ─── Layer contract ────────────────────────────────────────────────────────

  /**
   * Render the panel content via a single `bridge.textContainerUpgrade` call.
   *
   * Builds 18 rows (TOTAL_ROWS) of FRAME_WIDTH (70) chars each. Called by
   * LayerManager on mount and after scroll events for position refresh.
   */
  async draw(): Promise<void> {
    const lines = this._buildLines();
    const payload = new TextContainerUpgrade({
      // Overlay-only name → resolveContainerId returns undefined (addressed by
      // name until the overlay-id rebuild path lands; see container-registry.ts).
      ...resolveContainerIdField(TARGET_PICKER_CONTAINER_NAME),
      containerName: TARGET_PICKER_CONTAINER_NAME,
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
   * Uses the composite `hud_r1_target_picker` key which stores a pre-composed
   * chip string in `tap=<tap>  scroll=<scroll>  qa=<quick-action>` format per
   * parseR1HintString convention.
   */
  getR1Hints(): {
    readonly tap: string;
    readonly scroll: string;
    readonly quickActionLabel: string;
  } {
    return parseR1HintString(getLabel('hud_r1_target_picker', this.locale));
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
   * Build the TOTAL_ROWS (18) rows of panel content.
   *
   * Layout:
   * ```
   * ┌─[ BERSAGLIO ]───────────────────────────────────────────────────┐  row 0
   * │                                                                  │  row 1 (blank)
   * │  <target rows — up to VISIBLE_ROWS>                              │  rows 2..N
   * │  (blank rows pad to VISIBLE_ROWS count)                          │
   * │                                                                  │  spacer
   * │  [tap] conferma  [×2] annulla                                   │  hint row (non-empty)
   * └──────────────────────────────────────────────────────────────────┘  row 17
   * ```
   *
   * Empty state replaces target rows + hint row with centered 'Nessun bersaglio'.
   */
  private _buildLines(): string[] {
    const title = getLabel('target_picker_title', this.locale);
    const titleBracket = `[ ${title} ]`;
    // Top border: ┌─[ BERSAGLIO ]─────...─┐ (FRAME_WIDTH total)
    const topInnerLen = FRAME_WIDTH - 2; // 68 chars between ┌ and ┐
    const topInner = `─${titleBracket}${'─'.repeat(topInnerLen - 1 - titleBracket.length)}`;
    const topBorder = `┌${topInner}┐`;
    const bottomBorder = `└${'─'.repeat(FRAME_WIDTH - 2)}┘`;

    if (this.candidates.length === 0) {
      return this._buildEmptyLines(topBorder, bottomBorder);
    }

    return this._buildFullLines(topBorder, bottomBorder);
  }

  /**
   * Build lines for the empty state (no valid targets).
   *
   * Centers 'Nessun bersaglio' in the panel body. No hint row (auto-close timer
   * handles the dismissal). Fills remaining rows with blank spacers to reach
   * TOTAL_ROWS.
   */
  private _buildEmptyLines(topBorder: string, bottomBorder: string): string[] {
    const emptyHint = getLabel('target_picker_empty_hint', this.locale);
    const lines: string[] = [topBorder];

    // Blank rows + centered empty hint + blank rows = TOTAL_ROWS - 2 (borders)
    const bodyRows = TOTAL_ROWS - 2;
    const emptyHintRow = Math.floor(bodyRows / 2) - 1; // place hint near vertical center

    for (let i = 0; i < bodyRows; i++) {
      if (i === emptyHintRow) {
        // Center the hint in the inner width
        const cps = [...emptyHint];
        const padTotal = PANEL_INNER_WIDTH - cps.length;
        const padLeft = Math.floor(padTotal / 2);
        const padRight = padTotal - padLeft;
        lines.push(`│ ${' '.repeat(padLeft)}${emptyHint}${' '.repeat(padRight)} │`);
      } else {
        lines.push(this._innerBlank());
      }
    }

    lines.push(bottomBorder);
    return lines;
  }

  /**
   * Build lines for the full (non-empty) state.
   *
   * Windowed scroll: shows VISIBLE_ROWS candidates centered around selectedIdx.
   * The `▶` indicator marks the selected row.
   */
  private _buildFullLines(topBorder: string, bottomBorder: string): string[] {
    const lines: string[] = [topBorder, this._innerBlank()];

    // ── Compute scroll window ─────────────────────────────────────────────
    const count = this.candidates.length;
    const windowSize = Math.min(VISIBLE_ROWS, count);
    // Center window around selectedIdx; clamp at edges.
    let windowStart = this.selectedIdx - Math.floor(windowSize / 2);
    if (windowStart < 0) windowStart = 0;
    if (windowStart + windowSize > count) windowStart = count - windowSize;
    const windowEnd = windowStart + windowSize;

    // ── Target rows ───────────────────────────────────────────────────────
    for (let i = windowStart; i < windowEnd; i++) {
      const candidate = this.candidates[i];
      if (candidate === undefined) continue;
      const isSelected = i === this.selectedIdx;
      const rowText = describeTargetRow(candidate, this.locale, i, isSelected, PANEL_INNER_WIDTH);
      lines.push(this._innerRow(rowText));
    }

    // ── Fill remaining rows up to (TOTAL_ROWS - 2 borders - 1 hint - 1 blank after title)
    const filledRows = 2 + windowSize; // title + blank + target rows
    const hintRowIdx = TOTAL_ROWS - 2; // second-to-last row (before bottom border)
    const blankFiller = hintRowIdx - filledRows;
    for (let i = 0; i < blankFiller; i++) {
      lines.push(this._innerBlank());
    }

    // ── Hint row ──────────────────────────────────────────────────────────
    // Cancel is double-tap (`[×2]`) since long-press was retired (ADR-0012).
    const tapLabel = '[tap]';
    const cancelGestureLabel = '[×2]';
    const confirmLabel =
      getLabel('target_picker_title', this.locale) === 'BERSAGLIO' ? 'conferma' : 'confirm';
    const cancelLabel =
      getLabel('target_picker_title', this.locale) === 'BERSAGLIO' ? 'annulla' : 'cancel';
    const hintText = `${tapLabel} ${confirmLabel}  ${cancelGestureLabel} ${cancelLabel}`;
    lines.push(this._innerRow(` ${hintText}`));

    lines.push(bottomBorder);
    return lines;
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
}
