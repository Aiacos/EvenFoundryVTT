/**
 * ConcentrationDropModalPanel — z=2 overlay panel asking the player to confirm
 * dropping the active concentration spell when a new concentration spell is
 * cast (CONC-01).
 *
 * Implements {@link ../engine/layer-types.js#OverlayPanel} verbatim:
 *
 *   - `onMount()`   — subscribes to {@link ../engine/panel-gesture-bus.js#PanelGestureBus}
 *                     for R1 gesture fan-out
 *   - `onUnmount()` — unsubscribes the bus handler (T-4b-01-03 mitigation —
 *                     prevents subscriber leaks across modal lifecycles)
 *   - `onEvent(g)`  — `tap` → emit `conc.drop.confirmed` envelope via
 *                     `ws.send` (canonical {@link @evf/shared-protocol#EnvelopeSchema}
 *                     shape with `payload` field and threaded session_id) +
 *                     close. `double-tap` → cancel + close. Other gestures
 *                     ignored.
 *
 * **Container strategy (Strategy A from Plan 01 — ADR-0009 Amendment 1):**
 * single text container with newline-joined content. The page schema's
 * reserved overlay slot (Phase 6 wires the production schema; Plan 05 uses
 * the same `'overlay-block'` placeholder name and Plan 06 wiring will declare
 * the container at build time). One text container, zero image containers
 * keeps the SDK 4-image / 8-text cap audit deterministic.
 *
 * **CONC-01 boundary (Phase 4b vs Phase 7):** Plan 05 EMITS the
 * `conc.drop.confirmed` envelope; the Phase 7 write path (bridge +
 * `socketlib.executeAsGM`) consumes it and calls `effect.delete()` on the
 * GM side. Plan 05 does NOT call `effect.delete()` directly — see
 * 04b-CONTEXT.md §Area 8 emission policy.
 *
 * **W-4 regression guard:** the constructed envelope uses the canonical
 * {@link @evf/shared-protocol#EnvelopeSchema} shape verbatim — the carrier
 * field is `payload` (NOT `value`), the type discriminator is
 * `'conc.drop.confirmed'`, and `session_id` is a UUID v4 threaded from the
 * inbound `conc.conflict` envelope via the constructor. CDM-10 + ISM-05
 * round-trip tests assert `EnvelopeSchema.safeParse(emitted).success === true`.
 *
 * No virtual DOM — render output is a single `bridge.textContainerUpgrade`
 * call per draw (D-2.04, CLAUDE.md). The bridge handle is held private and
 * never re-exposed.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 8
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.5 (modal layout) + §5.16/§5.17 (fixtures)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 6
 * @see docs/architecture/0009-layer-manager-contract.md §Amendment 1 (panel mounts at z=2)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { CONC_DROP_CONFIRMED_TYPE, type ConcConflictPayload } from '@evf/shared-protocol';
import { resolveContainerIdField } from '../engine/container-registry.js';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import type { Toast } from '../status-hud/toast-types.js';
import { consumeLatestConfirmed } from './conc-retry-cache.js';

// Plan 07-05 (CONC-01 write closure): `crypto.randomUUID()` is available in
// the Even Realities App WebView (Safari WKWebView on iOS — Baseline 2021).
// The mock in tests stubs `crypto.randomUUID` via `vi.stubGlobal`.
declare const crypto: { randomUUID(): string };

/** Stable text-container name for the conc-modal payload (single-container strategy). */
export const CONC_MODAL_CONTAINER_NAME = 'overlay-block' as const;

/** Modal frame outer width per UI-SPEC §3.5 (cols 6..65 inclusive = 60 chars). */
const MODAL_WIDTH = 60;
/** Inner content width (modal width minus the `│ ` + ` │` decoration = 56 chars). */
const MODAL_INNER_WIDTH = MODAL_WIDTH - 4;

/**
 * Y-button width budget — 24 chars per UI-SPEC §3.5 (`[Y] Drop & cast {NAME}`
 * + truncation pad). Caps the button cell so the right `│` border stays
 * column-aligned across IT/EN/DE locales.
 */
const Y_BUTTON_BUDGET = 24;

/**
 * onClose callback signature.
 *
 * Invoked when the user resolves the modal (tap → confirmed; double-tap →
 * cancel). The dispatcher's callback typically tears down the panel via
 * `LayerManager.bundle([{ type:'destroy', z:Z2_OVERLAY }])`.
 */
export type ConcModalCloseHandler = () => void;

/**
 * Minimal `WebSocket.send` shape consumed by the panel.
 *
 * The panel needs only `send(data: string)`; tests inject a `vi.fn()` mock.
 * Avoids depending on the full `WebSocket` interface so the panel module is
 * testable in `happy-dom` without polyfills.
 */
export interface ConcModalWebSocket {
  send(data: string): void;
}

/**
 * z=2 overlay panel — "concentration drop" confirmation modal.
 *
 * Constructed by the conc-conflict dispatcher when a `conc.conflict` envelope
 * arrives. After construction the dispatcher calls
 * `layerManager.bundle([{ type:'mount', z:Z2_OVERLAY, layer:modal }])` —
 * the bundle's `onMount` hook subscribes to the gesture bus and the bundle's
 * single `rebuildPageContainer` flush composes the new layer set (Plan 01
 * differential demolish auto-removes z=0.5; z=1.5 toast survives per Rule 2).
 */
export class ConcentrationDropModalPanel implements OverlayPanel {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'conc-drop-modal';
  /** Opt-in: this panel handles double-tap internally (ADR-0012 D-3). */
  public readonly handlesDoubleTap = true as const;

  private readonly bridge: EvenAppBridge;
  private readonly ws: ConcModalWebSocket;
  private readonly gestureBus: PanelGestureBus;
  private readonly conflict: ConcConflictPayload;
  private readonly locale: HudLocale;
  /**
   * Session UUID threaded from the inbound `conc.conflict` envelope by the
   * dispatcher. Used verbatim in the outgoing `conc.drop.confirmed` envelope
   * `session_id` field — guarantees the bridge can correlate the confirmation
   * to the original conflict context (B-4 closure).
   */
  private readonly sessionId: string;
  private readonly onCloseCb: ConcModalCloseHandler;

  /**
   * Unsubscribe closure returned by {@link PanelGestureBus.subscribe}.
   *
   * Set in `onMount`; called and nulled in `onUnmount`. The null guard makes
   * `onUnmount` idempotent (defensive — Phase 4b LayerManager.bundle does
   * not currently re-invoke unmount, but T-4b-01-03 mitigation is the
   * panel's responsibility regardless).
   */
  private unsubscribe: (() => void) | null = null;

  /**
   * Optional toast queue injected by the conc-conflict dispatcher (Plan 09-03).
   *
   * When the user presses [N] (double-tap), an
   * `error.action.concentration-cancelled` error toast is enqueued here so
   * the player sees feedback that the cast was aborted. Nullable: if the
   * dispatcher is not yet wired (Phase 4b integration smoke tests) or in
   * legacy environments, the double-tap still closes cleanly without a toast.
   */
  private readonly toastQueue: { enqueue: (toast: Toast) => void } | null | undefined;

  /**
   * Construct the modal.
   *
   * @param bridge      Even Hub bridge handle for the single
   *                    {@link EvenAppBridge.textContainerUpgrade} render call.
   * @param ws          WebSocket-like sink for the outgoing
   *                    `conc.drop.confirmed` envelope.
   * @param gestureBus  In-process {@link PanelGestureBus} — subscribed in
   *                    `onMount`, unsubscribed in `onUnmount`.
   * @param conflict    Parsed payload of the inbound `conc.conflict` envelope
   *                    (effectId + spell names).
   * @param locale      Active HUD locale — drives label / template lookup via
   *                    {@link getLabel}.
   * @param sessionId   UUID v4 of the active WS session (threaded from the
   *                    inbound envelope's `session_id`).
   * @param onClose     Invoked after the user confirms (tap) or cancels
   *                    (double-tap). The caller is expected to tear down the
   *                    panel via `LayerManager.bundle`.
   * @param toastQueue  Optional toast queue for the [N] cancel-toast path
   *                    (Plan 09-03 CDM-CANCEL-01).
   */
  constructor(
    bridge: EvenAppBridge,
    ws: ConcModalWebSocket,
    gestureBus: PanelGestureBus,
    conflict: ConcConflictPayload,
    locale: HudLocale,
    sessionId: string,
    onClose: ConcModalCloseHandler,
    toastQueue?: { enqueue: (toast: Toast) => void } | null,
  ) {
    this.bridge = bridge;
    this.ws = ws;
    this.gestureBus = gestureBus;
    this.conflict = conflict;
    this.locale = locale;
    this.sessionId = sessionId;
    this.onCloseCb = onClose;
    this.toastQueue = toastQueue ?? null;
  }

  /**
   * Render the modal content via a single `bridge.textContainerUpgrade` call.
   *
   * Builds the 12-row panel layout per UI-SPEC §3.5:
   *
   * ```
   * ┌─[ <TITLE> ]───────────────────────┐
   * │                                    │
   * │  <active_label>                    │
   * │    <currentConcentrationName>      │
   * │                                    │
   * │  <casting_template with {name}>    │
   * │                                    │
   * │  <confirm_question>                │
   * │                                    │
   * │   [Y] Drop & cast <name>  [N] Cancel│
   * │                                    │
   * └────────────────────────────────────┘
   * ```
   *
   * Width-budget truncation applies to long IT spell names — see
   * {@link _truncate}. Resolves once the bridge promise settles.
   */
  async draw(): Promise<void> {
    const lines = this._buildLines();
    const payload = new TextContainerUpgrade({
      // Overlay-only name → resolveContainerId returns undefined (addressed by
      // name until the overlay-id rebuild path lands; see container-registry.ts).
      ...resolveContainerIdField(CONC_MODAL_CONTAINER_NAME),
      containerName: CONC_MODAL_CONTAINER_NAME,
      content: lines.join('\n'),
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /**
   * Tear down the panel — no-op here.
   *
   * The bus unsubscribe lives in {@link onUnmount} (LayerManager.bundle
   * calls `onUnmount` BEFORE `destroy`). `destroy` is reserved for any
   * future per-container cleanup (e.g., page-schema mutation roll-back)
   * but Plan 05's Strategy A single-container approach does not require
   * one.
   */
  destroy(): void {
    // Intentionally empty — see method JSDoc.
  }

  /**
   * Lifecycle hook — subscribe to the gesture bus.
   *
   * LayerManager.bundle awaits this hook AFTER the panel is registered in
   * the layers map and BEFORE the single `rebuildPageContainer` flush. The
   * subscription handler is the panel's own {@link onEvent} method.
   */
  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
  }

  /**
   * Lifecycle hook — release the gesture bus subscription.
   *
   * Idempotent (the null guard makes a second invocation safe). T-4b-01-03
   * mitigation: failure to unsubscribe would leak a closure into the bus's
   * subscriber set, eventually showing up as `bus.size()` drift in
   * CDM-9 / ISM-07.
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
   * Dispatch table per UI-SPEC §3.5 + 04b-CONTEXT.md §Area 8:
   *   - `tap`        → dual-emit (Plan 07-05) + close (Y button):
   *                      1. `tool.invoke` with toolId='drop-concentration' (when actorId present)
   *                      2. `conc.drop.confirmed` (always — backward-compat W-4 regression guard)
   *   - `double-tap` → close without emission (N button)
   *   - any other    → no-op (panel stays mounted; other panels may handle)
   *
   * **Plan 07-05 dual-emit (CONC-01 write closure):**
   * The `tool.invoke` envelope is emitted FIRST so the bridge can dispatch
   * the write path (socketlib.executeAsGM → dropConcentrationHandler →
   * effect.delete()) before the legacy `conc.drop.confirmed` arrives.
   * When `conflict.actorId` is undefined, only the legacy envelope is emitted
   * (graceful fallback for Phase 4b payloads that pre-date this field).
   *
   * **W-4 regression guard:** the `conc.drop.confirmed` envelope is ALWAYS
   * emitted (second send), preserving backward-compat with any bridge listener
   * that subscribed to this event before Plan 07-05.
   *
   * **Envelope construction:** uses the canonical
   * {@link @evf/shared-protocol#EnvelopeSchema} shape verbatim:
   * `proto/seq/ts/type/session_id/payload`. The carrier field is `payload`
   * (NOT `value`), and `session_id` is threaded from the inbound
   * `conc.conflict` envelope via the constructor.
   */
  onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'tap') {
      // Plan 07-05: dual-emit tap path (CONC-01 write closure).
      const conflictWithActor = this.conflict as ConcConflictPayload & { actorId?: string };
      const actorId = conflictWithActor.actorId;

      // 1. tool.invoke (only when actorId is present — graceful fallback per 07-05 spec)
      if (actorId !== undefined && actorId.length > 0) {
        const toolInvokeEnvelope = {
          proto: 'evf-v1' as const,
          seq: 0, // Bridge assigns the monotonic seq on its side.
          ts: Date.now(),
          type: 'tool.invoke' as const,
          session_id: this.sessionId,
          payload: {
            toolId: 'drop-concentration' as const,
            idempotencyKey: crypto.randomUUID(),
            args: {
              actor_id: actorId,
              effect_id: this.conflict.effectId,
            },
          },
        };
        this.ws.send(JSON.stringify(toolInvokeEnvelope));
      }

      // 2. Legacy conc.drop.confirmed (always — W-4 backward-compat regression guard)
      const legacyEnvelope = {
        proto: 'evf-v1' as const,
        seq: 0, // Bridge assigns the monotonic seq on its side.
        ts: Date.now(),
        type: CONC_DROP_CONFIRMED_TYPE,
        session_id: this.sessionId,
        payload: { effectId: this.conflict.effectId },
      };
      this.ws.send(JSON.stringify(legacyEnvelope));

      // Plan 09-03 Step 7b — T-09-03: single-attempt retry of the blocked cast.
      // After concentration is confirmed dropped, re-dispatch the original
      // cast-spell envelope that was blocked by the concentration check. Only
      // fires if the dispatcher previously called markRetryConfirmed() (i.e., the
      // server returned errorKind='concentration-required' for that envelope).
      // consumeLatestConfirmed() deletes the entry on access (race prevention).
      const retry = consumeLatestConfirmed();
      if (retry !== null) {
        this.ws.send(JSON.stringify(retry));
      }

      this.onCloseCb();
    } else if (gesture.kind === 'double-tap') {
      // [N] Cancel — enqueue error toast (Plan 09-03 CDM-CANCEL-01), then close.
      if (this.toastQueue !== null && this.toastQueue !== undefined) {
        const cancelMsg = `❌ ${getLabel('error.action.concentration-cancelled', this.locale)}`;
        this.toastQueue.enqueue({
          id: `conc-cancelled-${this.sessionId}-${Date.now()}`,
          severity: 'error',
          message: cancelMsg.slice(0, 38),
          emittedAt: Date.now(),
        });
      }
      this.onCloseCb();
    }
    // Other gestures (scroll) ignored — modal stays mounted.
  }

  /**
   * Strategy A container footprint per ADR-0009 Amendment 1 / Plan 01.
   *
   * Returns `{ image: 0, text: 1 }`: one text container
   * ({@link CONC_MODAL_CONTAINER_NAME}) holding the 12-row newline-joined
   * panel content. No image containers — the modal is a pure text overlay
   * that sits on top of the (still-rendered) z=0 raster tiles.
   */
  getContainerCount(): { image: 0; text: 1 } {
    return { image: 0, text: 1 };
  }

  /**
   * Test-only accessor — returns the threaded session UUID.
   *
   * Used by CCD-4 to verify the dispatcher passes the inbound envelope's
   * `session_id` to the modal verbatim. Production code MUST NOT depend on
   * this getter — the session id is internal trust-boundary state and is
   * only authoritative inside the dispatched envelope.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Build the 12-row modal panel content.
   *
   * Pure function over `this.conflict` + `this.locale` — no side effects.
   * Each row is exactly {@link MODAL_WIDTH} chars wide. Row composition:
   *   - row 0:  top border `┌─[ <TITLE> ]───…─┐` (title centered within bracket)
   *   - rows 1, 4, 6, 8, 10: blank `│ ………… │`
   *   - row 2: `│  <active_label>……… │`
   *   - row 3: `│    <currentName>……… │` (4-char indent)
   *   - row 5: `│  <casting_template with {name}>……… │`
   *   - row 7: `│  <confirm_question>……… │`
   *   - row 9: `│   <[Y] button (24-char budget)>  <[N] button (10 chars)>…… │`
   *   - row 11: bottom border `└───…───┘`
   *
   * Helper for both `draw()` and tests (CDM-13 composes the full 96×24 page
   * using these rows).
   */
  private _buildLines(): string[] {
    const title = getLabel('conc_modal_title', this.locale);
    const activeLabel = getLabel('conc_modal_active_label', this.locale);
    const castingTemplate = getLabel('conc_modal_casting_template', this.locale);
    const confirmQuestion = getLabel('conc_modal_confirm_question', this.locale);
    const yTemplate = getLabel('conc_modal_y_button_template', this.locale);
    const nButton = getLabel('conc_modal_n_button', this.locale);

    // Title bracket: `─[ <TITLE> ]─` consumes `2 + 2 + title.length + 2 + 2 = title.length + 8` chars
    // of the 58-char inner top-border (MODAL_WIDTH - 2). Pad the trailing dashes
    // to fill to MODAL_WIDTH.
    const titleBracket = `[ ${title} ]`;
    const topInner = `─${titleBracket}${'─'.repeat(MODAL_WIDTH - 2 - 1 - titleBracket.length)}`;
    const topBorder = `┌${topInner}┐`;

    // Bottom border — solid horizontal rule.
    const bottomBorder = `└${'─'.repeat(MODAL_WIDTH - 2)}┘`;

    // currentConcentrationName truncated to 30-char active-line budget
    // (UI-SPEC §3.5 spell name budget).
    const currentName = this._truncate(this.conflict.currentConcentrationName, 30);

    // Casting template — substitute {name} with the truncated newSpellName
    // (38-char body budget per UI-SPEC §3.5).
    const newName = this._truncate(this.conflict.newSpellName, 38);
    const castingLine = castingTemplate.replace('{name}', newName);

    // Y-button text — substitute {name} with the budgeted newSpellName so the
    // full template fits the 24-char Y_BUTTON_BUDGET. We truncate the
    // INTERPOLATED template (not just the name) to enforce the per-button cap.
    const yRaw = yTemplate.replace('{name}', this.conflict.newSpellName);
    const yButton = this._truncate(yRaw, Y_BUTTON_BUDGET);

    const lines: string[] = [
      topBorder,
      this._innerRow(''),
      this._innerRow(`  ${activeLabel}`),
      this._innerRow(`    ${currentName}`),
      this._innerRow(''),
      this._innerRow(`  ${castingLine}`),
      this._innerRow(''),
      this._innerRow(`  ${confirmQuestion}`),
      this._innerRow(''),
      // Button row: 3-space indent + Y button (padded to budget) + 2-space gap
      // + N button (10 chars per i18n budget). Total = 3 + 24 + 2 + 10 = 39 ≤ 56.
      this._innerRow(`   ${padRightUnicode(yButton, Y_BUTTON_BUDGET)}  ${nButton}`),
      this._innerRow(''),
      bottomBorder,
    ];
    return lines;
  }

  /**
   * Wrap inner content with the `│ ` ... ` │` panel side borders.
   *
   * Content shorter than {@link MODAL_INNER_WIDTH} (= 56) is right-padded
   * with spaces; longer content is truncated with `…`. Returns a row of
   * exactly {@link MODAL_WIDTH} (= 60) visible characters.
   *
   * @param text Inner-row content (no border characters included).
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
   * Pattern mirrors {@link ../status-hud/status-hud-renderer.ts | StatusHudRenderer}'s
   * `truncateField` (INV-1 width-budget rule — never wrap, never reflow).
   */
  private _truncate(value: string, max: number): string {
    const cps = [...value];
    if (cps.length <= max) {
      return value;
    }
    return `${cps.slice(0, max - 1).join('')}…`;
  }
}

/**
 * Right-pad a string with spaces using code-point counting.
 *
 * Avoids JS string `.length` ambiguity over astral plane / combined glyphs
 * (the modal renders inside a fixed-width G2 monospace font where every
 * code-point is one column-cell, including the IT diacritics like `à`).
 *
 * Local helper — not exported from the module.
 */
function padRightUnicode(value: string, width: number): string {
  const len = [...value].length;
  if (len >= width) {
    return value;
  }
  return `${value}${' '.repeat(width - len)}`;
}
