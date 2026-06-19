/**
 * ActionOptionsModal — z=2 OverlayPanel for spell / item action confirmation.
 *
 * Opened by Plan 08-03 SpellbookPanel / InventoryPanel via the injected
 * `openActionOptions` callback (Plan 08-05 wires boot-side). Presents the
 * player with three gesture bindings:
 *
 * ```
 * ┌──────────────────────────────────────────────┐
 * │ AZIONE: Palla di Fuoco                       │
 * │                                              │
 * │  [tap]   Lancia incantesimo                  │
 * │                                              │
 * │  [×2]    Annulla                             │
 * └──────────────────────────────────────────────┘
 * ```
 *
 * (The old `[long]  Mostra dettagli` detail-viewer row was a long-press affordance,
 * never implemented; the gesture is retired per ADR-0012, so the row is now blank
 * — kept to preserve the modal's fixed height/width (INV-1).)
 *
 * ## AOM-05 — requiresTarget branching
 *
 * When `request.requiresTarget === false`: tap emits a canonical `tool.invoke`
 * envelope (cast-spell or use-item) immediately + calls `onClose()`.
 *
 * When `request.requiresTarget === true`: tap calls `onClose()` WITHOUT emitting
 * (returning to the caller). The caller (Plan 08-05 boot-engine-core.ts) detects
 * the `requiresTarget` flag and immediately opens a TargetPickerPanel via
 * `pushOverlay` to collect the target before dispatching the tool.
 *
 * ## AOM-07 — Quick Action via over-scroll (ADR-0012 D-2)
 *
 * The modal no longer has a long-press handler (long-press retired per ADR-0012 — doc note).
 * The Quick Action menu opens via the router-level over-scroll dispatcher
 * (swipe-up at a layer's top boundary). This modal is non-scrolling, so
 * `isAtTopBoundary()` returns `true` and a swipe-up over-scrolls into the menu,
 * mounting QuickActionMenu on top via pushOverlay. The user can dismiss the menu
 * and the ActionOptionsModal is still underneath. This is documented accepted
 * behaviour per CONTEXT.md §Specifics.
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
 * AOM-13 tests verify EnvelopeSchema + ToolInvocationEnvelopePayloadSchema round-trip.
 *
 * ## T-08-01-01 mitigation
 *
 * `idempotencyKey` is fresh `crypto.randomUUID()` per tap — prevents replay attacks.
 *
 * @see .planning/phases/08-manual-action-ux/08-03-PLAN.md Task 1
 * @see .planning/phases/08-manual-action-ux/08-CONTEXT.md §Specifics (mockup)
 * @see .planning/phases/08-manual-action-ux/08-CONTEXT.md §Area 1 (launch surface decisions)
 * @see packages/g2-app/src/panels/concentration-drop-modal.ts (modal exemplar)
 * @see docs/architecture/0009-layer-manager-contract.md §Amendment 1 (Strategy A)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { resolveContainerIdField } from '../engine/container-registry.js';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { parseR1HintString } from '../status-hud/r1-hint-parser.js';
import type { Toast } from '../status-hud/toast-types.js';
import { getActionEconomyState } from './action-economy-state.js';
import { cacheRetryEnvelope } from './conc-retry-cache.js';

// WR-03: crypto.randomUUID() is available in the Even Realities App WebView
// (Safari WKWebView on iOS 15+ / Baseline 2021). The `declare const` ambient
// declaration satisfies TypeScript without importing from Node built-ins,
// matching the pattern in concentration-drop-modal.ts:57.
// Tests stub crypto.randomUUID via vi.stubGlobal('crypto', { randomUUID: () => '<uuid>' }).
declare const crypto: { randomUUID(): string };

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stable container name (Strategy A — single overlay-block container per ADR-0009 Amd 1). */
const ACTION_OPTIONS_CONTAINER_NAME = 'overlay-block' as const;

/**
 * Modal frame outer width (60 chars — matches ConcentrationDropModalPanel per
 * Plan 04b-05 exemplar. Inner content = 56 chars).
 */
const MODAL_WIDTH = 60;

/** Inner content width (MODAL_WIDTH minus `│ ` + ` │` = 56 chars). */
const MODAL_INNER_WIDTH = MODAL_WIDTH - 4;

/** Name display budget — spell/item name truncated to this many code-points. */
const NAME_BUDGET = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Request payload passed to ActionOptionsModal at construction.
 *
 * Carries the action context from SpellbookPanel or InventoryPanel's
 * tap handler (via the injected openActionOptions callback).
 *
 * @see AOM-03 — shape verified in tests
 */
export interface ActionOptionsRequest {
  /** Whether this is a spell or an item action. */
  readonly kind: 'spell' | 'item';
  /** Display name of the spell or item (truncated to NAME_BUDGET in draw). */
  readonly name: string;
  /** Foundry actor ID (threaded into the tool.invoke args payload). */
  readonly actorId: string;
  /** Foundry spell or item ID (threaded into the tool.invoke args payload). */
  readonly itemId: string;
  /**
   * When true: tap closes the modal WITHOUT emitting (the boot caller in
   * Plan 08-05 detects this and opens TargetPickerPanel instead).
   * When false: tap emits a tool.invoke envelope with `targets: []`.
   */
  readonly requiresTarget: boolean;
  /**
   * Plan 09-04: when true AND `availableSlots.length > 1`, tap closes WITHOUT
   * emitting. Boot caller intercepts and opens SlotPickerPanel to collect the
   * slot level before dispatch.
   * When false (cantrip path OR only 1 slot available): tap emits directly with
   * `slot_level: defaultSlotLevel`.
   *
   * Only meaningful when `kind === 'spell'`. Ignored for `kind === 'item'`.
   * Defaults to false for backwards-compat (legacy callers that don't pass this field).
   */
  readonly requiresSlotPicker?: boolean;
  /**
   * Plan 09-04: slot level to use when `requiresSlotPicker === false` or the
   * slot picker is skipped. 0 = cantrip (no slot consumed). 1-9 = standard slot.
   *
   * Only meaningful when `kind === 'spell'`. Ignored for `kind === 'item'`.
   * Defaults to 0 when not provided (cantrip-safe fallback).
   */
  readonly defaultSlotLevel?: number;
}

/**
 * Minimal WebSocket send shape consumed by the modal.
 *
 * Tests inject a `vi.fn()` mock; production passes the real WebSocket.
 * Avoids depending on the full `WebSocket` interface so the panel module is
 * testable in `happy-dom` without polyfills.
 */
export interface ActionOptionsWebSocket {
  send(data: string): void;
}

/**
 * Reason passed to `ActionOptionsCloseHandler` so the boot caller can
 * distinguish between close paths without inspecting modal internals.
 *
 * - `'emit'`                — tap emitted a tool.invoke envelope (normal cast path).
 * - `'slot-picker-needed'`  — tap was intercepted by `requiresSlotPicker`; caller
 *                             should open SlotPickerPanel.
 * - `'preconditioner-blocked'` — tap was blocked by the action-economy preconditioner.
 * - `'cancel'`              — double-tap cancel (no emission).
 *
 * @see ActionOptionsCloseHandler
 */
export type ActionOptionsCloseReason =
  | 'emit'
  | 'slot-picker-needed'
  | 'preconditioner-blocked'
  | 'cancel';

/**
 * Invoked when the user confirms (tap) or cancels (double-tap).
 *
 * `reason` distinguishes between close paths so the boot caller can take
 * appropriate action (e.g. push SlotPickerPanel after `'slot-picker-needed'`).
 */
export type ActionOptionsCloseHandler = (reason: ActionOptionsCloseReason) => void;

/**
 * Minimal toast queue interface for the preconditioner error feedback.
 *
 * Accepts the same `Toast` payload as `ToastQueueLayer.enqueue`.
 * Tests inject a `{ enqueue: vi.fn() }` mock; production passes the real
 * `ToastQueueLayer` instance threaded from boot-engine-core step 11e.
 *
 * @see packages/g2-app/src/status-hud/toast-queue-layer.ts ToastQueueLayer.enqueue
 * @see packages/g2-app/src/panels/action-result-dispatcher.ts ActionResultToastQueue (pattern ref)
 */
export interface ActionOptionsToastQueue {
  enqueue(toast: Toast): void;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/**
 * z=2 OverlayPanel — action options confirmation modal.
 *
 * Mounted by SpellbookPanel / InventoryPanel's `openActionOptions` callback
 * (Plan 08-05 wires the boot-side handler that calls PanelRouter.pushOverlay).
 * The modal has no `static meta` — it is opened programmatically, not via the
 * Quick Action menu registry (same pattern as ConcentrationDropModalPanel).
 */
export class ActionOptionsModal implements OverlayPanel {
  /** Stable id — used by LayerManager + telemetry. Typed `string` so the canvas
   *  subclass ({@link CanvasActionOptionsModal}) can override it with its own id. */
  public readonly id: string = 'action-options-modal';
  /** Opt-in: this panel handles double-tap internally (ADR-0012 D-3). */
  public readonly handlesDoubleTap = true as const;

  private readonly bridge: EvenAppBridge;
  private readonly ws: ActionOptionsWebSocket;
  private readonly gestureBus: PanelGestureBus;
  /** Action context — `protected` so the canvas subclass can read it when painting. */
  protected readonly request: ActionOptionsRequest;
  /** Active HUD locale — `protected` so the canvas subclass can resolve labels when painting. */
  protected readonly locale: HudLocale;
  private readonly sessionId: string;
  private readonly onCloseCb: ActionOptionsCloseHandler;
  /**
   * Phase 9 Plan 09-02 — toast queue for preconditioner error feedback.
   *
   * Enqueues an error toast (`error.action.already-used-action` / `...bonus`)
   * when the client-side preconditioner blocks a tap (slot already used).
   * Fail-open: when `null` (legacy callers not yet updated to pass toastQueue),
   * the modal skips toast emission and proceeds to the normal emit path.
   *
   * @see onEvent case 'tap' (preconditioner branch)
   * @see .planning/phases/09-action-economy-edge-cases/09-02-PLAN.md Task 2
   */
  private readonly toastQueue: ActionOptionsToastQueue | null;

  /**
   * Unsubscribe closure returned by PanelGestureBus.subscribe.
   *
   * Set in onMount; called and nulled in onUnmount. The null guard makes
   * onUnmount idempotent (T-4b-01-03 mitigation).
   */
  private unsubscribe: (() => void) | null = null;

  /**
   * Construct the modal.
   *
   * @param bridge      Even Hub bridge handle for the single textContainerUpgrade call.
   * @param ws          WebSocket-like sink for the outgoing tool.invoke envelope.
   * @param gestureBus  In-process PanelGestureBus — subscribed in onMount.
   * @param request     Action context (kind, name, actorId, itemId, requiresTarget).
   * @param locale      Active HUD locale — drives label lookup via getLabel.
   * @param sessionId   UUID v4 of the active WS session (threaded into envelopes).
   * @param onClose     Invoked after the user confirms (tap) or cancels (double-tap).
   *                    Receives a `reason` discriminant so the boot caller can
   *                    push SlotPickerPanel on `'slot-picker-needed'` or
   *                    TargetPickerPanel on `'cancel'` (requiresTarget path).
   * @param toastQueue  Phase 9 Plan 09-02 — toast queue for preconditioner error feedback.
   *                    Pass the `ToastQueueLayer` instance from boot-engine-core step 11e.
   *                    When `null` (legacy path), the modal skips preconditioner error toasts.
   */
  constructor(
    bridge: EvenAppBridge,
    ws: ActionOptionsWebSocket,
    gestureBus: PanelGestureBus,
    request: ActionOptionsRequest,
    locale: HudLocale,
    sessionId: string,
    onClose: ActionOptionsCloseHandler,
    toastQueue: ActionOptionsToastQueue | null = null,
  ) {
    this.bridge = bridge;
    this.ws = ws;
    this.gestureBus = gestureBus;
    this.request = request;
    this.locale = locale;
    this.sessionId = sessionId;
    this.onCloseCb = onClose;
    this.toastQueue = toastQueue;
  }

  // ─── OverlayPanel lifecycle ────────────────────────────────────────────────

  /**
   * Subscribe to the gesture bus (T-4b-01-03 mitigation).
   *
   * LayerManager.bundle awaits this BEFORE the rebuildPageContainer flush.
   */
  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
  }

  /**
   * Release the gesture bus subscription (T-4b-01-03 mitigation).
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
   * Dispatch table per CONTEXT.md §Specifics mockup:
   *
   *   - `tap`: IF requiresTarget=false → emit canonical tool.invoke envelope + onClose.
   *            IF requiresTarget=true  → onClose WITHOUT emitting (Plan 08-05 caller
   *            detects this and opens TargetPickerPanel). See AOM-05 + AOM-16.
   *   - `double-tap`: onClose() without emitting (cancel). See AOM-06.
   *   - `scroll`: ignored — modal is non-scrolling, so a swipe-up over-scrolls
   *               into the router-level Quick Action menu (ADR-0012 D-2). See AOM-08.
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'tap': {
        if (this.request.requiresTarget) {
          // AOM-05 + AOM-16: requiresTarget=true → close WITHOUT emitting.
          // Plan 08-05 boot caller detects this case and immediately opens TargetPickerPanel.
          // Preconditioner does NOT apply here — no slot is consumed (no emission).
          this.onCloseCb('cancel');
        } else {
          // Phase 9 Plan 09-02 — client-side preconditioner (T-09-01 mitigation).
          // Reads the in-process action economy cache to fast-path obviously blocked actions.
          // Fail-open: null cache (no envelope seen yet) → allow (server validates).
          // Only fires when !multiAttackInProgress (multi-attack iterations are always allowed).
          if (this.toastQueue !== null) {
            const econ = getActionEconomyState(this.request.actorId);
            if (econ !== null && !econ.multiAttackInProgress) {
              // spell → Action slot;  item → Bonus Action slot  (D-CONTEXT §Area 1)
              const slotKey: 'action' | 'bonus' =
                this.request.kind === 'spell' ? 'action' : 'bonus';
              const used = slotKey === 'action' ? econ.actionsUsed : econ.bonusActionsUsed;
              if (used >= 1) {
                const errKey =
                  slotKey === 'action'
                    ? 'error.action.already-used-action'
                    : 'error.action.already-used-bonus';
                this.toastQueue.enqueue({
                  id: `action-precond-${this.request.actorId}-${slotKey}-${Date.now()}`,
                  severity: 'error',
                  message: `❌ ${getLabel(errKey, this.locale)}`,
                  emittedAt: Date.now(),
                });
                this.onCloseCb('preconditioner-blocked');
                return;
              }
            }
          }

          // Plan 09-04: requiresSlotPicker branch — intercept BEFORE emit when spell
          // needs a slot level selection (multiple slot levels available).
          // Only fires for kind === 'spell' with requiresSlotPicker === true.
          // The boot caller detects this pattern and opens SlotPickerPanel after close.
          if (this.request.kind === 'spell' && this.request.requiresSlotPicker === true) {
            // AOM-SLOT-01: close with 'slot-picker-needed' — caller opens SlotPickerPanel.
            this.onCloseCb('slot-picker-needed');
            return;
          }

          // AOM-05: requiresTarget=false + no preconditioner block + no slot picker → emit.
          const toolId = this.request.kind === 'spell' ? 'cast-spell' : 'use-item';
          const argKey = this.request.kind === 'spell' ? 'spell_id' : 'item_id';
          const idempotencyKey = crypto.randomUUID();

          // Build args payload. For spells, include slot_level (Plan 09-04).
          // For items, no slot_level field (use-item schema has no such field).
          const baseArgs: Record<string, unknown> = {
            actor_id: this.request.actorId,
            [argKey]: this.request.itemId,
            targets: [] as string[],
          };
          if (this.request.kind === 'spell') {
            baseArgs.slot_level = this.request.defaultSlotLevel ?? 0;
          }

          const envelope = {
            proto: 'evf-v1' as const,
            seq: 0,
            ts: Date.now(),
            type: 'tool.invoke' as const,
            session_id: this.sessionId,
            payload: {
              toolId,
              idempotencyKey,
              args: baseArgs,
            },
          };
          // Plan 09-03: cache the outgoing envelope BEFORE sending (AOM-RETRY-01).
          // The entry is 'unconfirmed' until action-result-dispatcher sees the
          // concentration-required errorKind (marks confirmed). This ordering ensures
          // the cache entry exists before the ws response arrives (even in fast tests).
          cacheRetryEnvelope(idempotencyKey, envelope, 'unconfirmed');
          this.ws.send(JSON.stringify(envelope));
          this.onCloseCb('emit');
        }
        break;
      }

      case 'double-tap': {
        // AOM-06: cancel — close without emitting.
        this.onCloseCb('cancel');
        break;
      }

      case 'scroll': {
        // AOM-08: scroll ignored — modal has no scrollable content. A swipe-up
        // over-scrolls into the router-level Quick Action menu (ADR-0012 D-2).
        break;
      }
    }
  }

  /**
   * INV-5 over-scroll boundary probe (ADR-0012 D-2).
   *
   * The modal is non-scrolling, so it is always at its top boundary — a swipe-up
   * is an over-scroll that the router-level dispatcher routes to the Quick Action menu.
   */
  isAtTopBoundary(): boolean {
    return true;
  }

  /**
   * Render the modal content via a single bridge.textContainerUpgrade call.
   *
   * Builds the MODAL_ROWS (12) row panel layout per CONTEXT.md §Specifics mockup.
   * Resolves when the bridge promise settles.
   */
  async draw(): Promise<void> {
    const lines = this._buildLines();
    const payload = new TextContainerUpgrade({
      // Overlay-only name → resolveContainerId returns undefined (addressed by
      // name until the overlay-id rebuild path lands; see container-registry.ts).
      ...resolveContainerIdField(ACTION_OPTIONS_CONTAINER_NAME),
      containerName: ACTION_OPTIONS_CONTAINER_NAME,
      content: lines.join('\n'),
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /** Tear down the panel — no-op (bus unsubscribe lives in onUnmount). */
  destroy(): void {
    // Intentionally empty: LayerManager calls onUnmount before destroy.
  }

  /**
   * Container footprint — Strategy A: one text container, zero image.
   *
   * @returns `{ image: 0, text: 1 }` for the glyph (text-container) modal.
   *
   * Return type is widened to `{ image: number; text: number }` so the canvas
   * subclass ({@link CanvasActionOptionsModal}) can override it with the
   * canvas-mode contract `{ image: 0, text: 0 }` (ADR-0013 Amendment 1, locked
   * decision #3) — a narrower literal `{ text: 1 }` would be an illegal override.
   */
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 1 };
  }

  /**
   * R1 context chip hints for the status HUD (Phase 6 NAV-01 pattern).
   *
   * Uses the composite `hud_r1_action_options` key which stores a pre-composed
   * chip string in the `tap=<tap> scroll=<scroll> qa=<qa>` format per
   * parseR1HintString convention. The scroll segment is `—` (em dash) because
   * ActionOptionsModal ignores scroll events (AOM-08).
   */
  getR1Hints(): {
    readonly tap: string;
    readonly scroll: string;
    readonly quickActionLabel: string;
  } {
    return parseR1HintString(getLabel('hud_r1_action_options', this.locale));
  }

  // ─── Private rendering ────────────────────────────────────────────────────

  /**
   * Build the MODAL_ROWS (12) rows of modal content.
   *
   * Layout (per CONTEXT.md §Specifics mockup):
   * ```
   * ┌─[ AZIONE ]────────────────────────────────────────────┐  row 0
   * │                                                        │  row 1 (blank)
   * │  AZIONE: Palla di Fuoco                               │  row 2
   * │                                                        │  row 3 (blank)
   * │  [tap]   Lancia incantesimo                            │  row 4
   * │                                                        │  row 5 (blank — ex-[long], ADR-0012)
   * │  [×2]    Annulla                                       │  row 6
   * │                                                        │  row 7 (blank)
   * │                                                        │  row 8 (blank)
   * │                                                        │  row 9 (blank)
   * │                                                        │  row 10 (blank)
   * └────────────────────────────────────────────────────────┘  row 11
   * ```
   *
   * Pure function over `this.request` + `this.locale` — no side effects.
   */
  private _buildLines(): string[] {
    const title = getLabel('action_options_title', this.locale);
    const tapLabel =
      this.request.kind === 'spell'
        ? getLabel('action_options_tap_label_spell', this.locale)
        : getLabel('action_options_tap_label_item', this.locale);
    const cancelLabel = getLabel('action_options_cancel_label', this.locale);

    // Top border: ┌─[ AZIONE ]───...─┐
    const titleBracket = `[ ${title} ]`;
    const topInner = `─${titleBracket}${'─'.repeat(MODAL_WIDTH - 2 - 1 - titleBracket.length)}`;
    const topBorder = `┌${topInner}┐`;
    const bottomBorder = `└${'─'.repeat(MODAL_WIDTH - 2)}┘`;

    // Truncated name (30-char budget per NAME_BUDGET)
    const displayName = this._truncate(this.request.name, NAME_BUDGET);
    // Name row: "  AZIONE: <name>"
    const actionLabel = getLabel('action_options_title', this.locale);
    const nameLine = `  ${actionLabel}: ${displayName}`;

    return [
      topBorder,
      this._innerRow(''),
      this._innerRow(nameLine),
      this._innerRow(''),
      this._innerRow(`  [tap]   ${tapLabel}`),
      // Row vacated by ADR-0012: the old `[long] Mostra dettagli` detail-viewer was a
      // long-press affordance (gesture retired) and was never implemented — kept blank
      // to preserve the modal's fixed height/width (INV-1).
      this._innerRow(''),
      this._innerRow(`  [×2]    ${cancelLabel}`),
      this._innerRow(''),
      this._innerRow(''),
      this._innerRow(''),
      this._innerRow(''),
      bottomBorder,
    ];
  }

  /**
   * Wrap inner content with `│ ` ... ` │` panel side borders.
   *
   * Content shorter than MODAL_INNER_WIDTH (= 56) is right-padded with spaces.
   * Longer content is truncated with `…`. Returns a row of exactly MODAL_WIDTH
   * (= 60) visible characters.
   */
  private _innerRow(text: string): string {
    const cps = [...text];
    let inner: string;
    if (cps.length >= MODAL_INNER_WIDTH) {
      inner = `${cps.slice(0, MODAL_INNER_WIDTH - 1).join('')}…`;
    } else {
      inner = `${text}${' '.repeat(MODAL_INNER_WIDTH - cps.length)}`;
    }
    return `│ ${inner} │`;
  }

  /**
   * Truncate `value` to `max` code-points, appending `…` if cut.
   *
   * Pattern mirrors ConcentrationDropModalPanel._truncate (INV-1 width-budget
   * rule — never wrap, never reflow).
   */
  private _truncate(value: string, max: number): string {
    const cps = [...value];
    if (cps.length <= max) {
      return value;
    }
    return `${cps.slice(0, max - 1).join('')}…`;
  }
}
