/**
 * conc-conflict dispatcher — WS-receive trust boundary for the CONC-01 flow.
 *
 * Production code path that mounts the {@link ./concentration-drop-modal.js#ConcentrationDropModalPanel}
 * at z=2 when the bridge emits a `conc.conflict` envelope. Plan 04B-PLAN-CHECK
 * §B-4 closure: previously the panel constructor's `sessionId` was a TODO
 * — Plan 05 ships the dispatcher that threads the inbound envelope's
 * `session_id` through to the modal.
 *
 * **Double trust boundary (T-4b-05-01 mitigation):**
 *   1. Outer envelope shape — `EnvelopeSchema.safeParse(rawMsg)` enforces
 *      the canonical wire format (`proto/seq/ts/type/session_id/payload`).
 *   2. Inner payload shape — `ConcConflictPayloadSchema.safeParse(envelope.payload)`
 *      enforces `effectId/currentConcentrationName/newSpellName` non-empty.
 *   Failure of either parse → `console.warn` + ignore. Modal never mounts on
 *   malformed input. CCD-5..7 + ISM-10 (negative) verify rejection paths.
 *
 * **Phase 6 wiring hook (not Plan 05's scope):** the `attachConcConflictHandler`
 * function will be invoked from `boot-engine-core.ts` step 11 area (after
 * `attachSceneInputToWs`) so the dispatcher activates as part of the boot
 * sequence. Plan 05 ships the dispatcher + tests proving it works end-to-end
 * from a synthetic `ws.fireMessage` (CCD-3, ISM-10).
 *
 * **No virtual DOM** — the dispatcher's only side effects are
 * `console.warn` (telemetry) + `layerManager.bundle` (Plan 01 atomic op) +
 * `ws.addEventListener` (subscriber lifecycle).
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 8
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 6
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-PLAN-CHECK.md §B-4
 * @see docs/architecture/0009-layer-manager-contract.md §Amendment 1 (differential demolish)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  CONC_CONFLICT_TYPE,
  ConcConflictPayloadSchema,
  EnvelopeSchema,
} from '@evf/shared-protocol';
import type { LayerManager } from '../engine/layer-manager.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import type { Toast } from '../status-hud/toast-types.js';
import {
  ConcentrationDropModalPanel,
  type ConcModalWebSocket,
} from './concentration-drop-modal.js';

/**
 * Minimal WebSocket shape the dispatcher consumes.
 *
 * Defined locally (rather than importing the lib.dom `WebSocket` type) so the
 * dispatcher is testable with the EventEmitter-backed `MockSocket` used by
 * Phase 4a's scene-renderer-smoke harness — that mock implements
 * `addEventListener` / `removeEventListener` + a `fireMessage` helper but is
 * NOT a full WHATWG WebSocket. The interface includes `send` so the same
 * value can be passed to `ConcentrationDropModalPanel`'s constructor.
 */
export interface ConcDispatcherSocket extends ConcModalWebSocket {
  addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
}

/**
 * Unsubscribe handle returned by {@link attachConcConflictHandler}.
 *
 * Calling it removes the `message` listener from the WebSocket. Idempotent
 * via the underlying `removeEventListener` contract (subsequent calls are
 * no-ops once the listener is already removed).
 */
export type ConcDispatcherUnsubscribe = () => void;

/**
 * Attach the conc-conflict dispatcher to the given WebSocket.
 *
 * Subscribes a `message` handler that:
 *
 *   1. Decodes the raw message (`string` directly, or `ArrayBuffer` via
 *      `TextDecoder`).
 *   2. `JSON.parse` — failure → `console.warn` + ignore.
 *   3. `EnvelopeSchema.safeParse` (outer trust boundary). Reject → warn + ignore.
 *   4. Narrow on `envelope.type === 'conc.conflict'` — other types return
 *      silently (other dispatchers handle them, not for us).
 *   5. `ConcConflictPayloadSchema.safeParse(envelope.payload)` (inner trust
 *      boundary). Reject → warn + ignore.
 *   6. Construct {@link ConcentrationDropModalPanel} with the validated
 *      payload + the inbound envelope's `session_id` (B-4 closure — sessionId
 *      flows through verbatim).
 *   7. `layerManager.bundle([{ type: 'mount', z: Z2_OVERLAY, layer: modal }])`
 *      — Plan 01 differential demolish auto-removes z=0.5; z=1.5 toast survives.
 *
 * The modal's `onClose` callback issues a destroy bundle that reverses the
 * mount (z=0.5 re-mounts via the suspended-instance round-trip).
 *
 * Returns an unsubscribe closure that removes the message listener — call it
 * during application teardown / dispatcher rotation.
 *
 * @param ws            WS-like message source supporting add/removeEventListener + send
 * @param bridge        EvenAppBridge handle (forwarded to the modal for draw)
 * @param gestureBus    Shared in-process gesture bus (forwarded to the modal)
 * @param layerManager  LayerManager singleton (Plan 02)
 * @param locale        Active HUD locale — forwarded to the modal for label lookup
 * @param toastQueue    Optional toast queue for the [N] cancel-toast path (Plan 09-03).
 *                      Forwarded verbatim to ConcentrationDropModalPanel constructor.
 * @returns Unsubscribe closure
 */
export function attachConcConflictHandler(
  ws: ConcDispatcherSocket,
  bridge: EvenAppBridge,
  gestureBus: PanelGestureBus,
  layerManager: LayerManager,
  locale: HudLocale,
  toastQueue?: { enqueue: (toast: Toast) => void } | null,
): ConcDispatcherUnsubscribe {
  const handler = (ev: MessageEvent): void => {
    try {
      // Step 1 — decode raw bytes / string.
      const rawText =
        typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);

      // Step 2 — JSON.parse. A throw here is caught by the outer try/catch.
      const parsedJson = JSON.parse(rawText) as unknown;

      // Step 3 — outer envelope shape (canonical EnvelopeSchema).
      const envParse = EnvelopeSchema.safeParse(parsedJson);
      if (!envParse.success) {
        console.warn('[conc-conflict-dispatcher] envelope rejected', envParse.error.message);
        return;
      }

      // Step 4 — narrow on envelope.type. Silent return for other types
      // (e.g., 'character.delta' / 'frame_pixels') — they belong to
      // other dispatchers and aren't an error condition here.
      if (envParse.data.type !== CONC_CONFLICT_TYPE) {
        return;
      }

      // Step 5 — inner payload shape.
      const payloadParse = ConcConflictPayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn('[conc-conflict-dispatcher] payload rejected', payloadParse.error.message);
        return;
      }

      // Step 6 — construct the modal with the inbound session_id threaded
      // verbatim (B-4 closure). The onClose callback (Step 7) issues the
      // destroy bundle that reverses the differential demolish.
      const modal = new ConcentrationDropModalPanel(
        bridge,
        ws,
        gestureBus,
        payloadParse.data,
        locale,
        envParse.data.session_id,
        () => {
          // Destroy bundle reverses the differential demolish — z=0.5 idle
          // infill re-mounts via LayerManager._suspendedZ05 (Plan 01).
          void layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
        },
        toastQueue, // Plan 09-03: forward optional toastQueue for [N] cancel toast
      );

      // Step 7 — mount via bundle (single atomic flush). Fire-and-forget;
      // the bundle's promise rejection is handled by the bundle's own
      // logging path (LayerManager surfaces capability_gate_denied / etc).
      void layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: modal }]);
    } catch (err) {
      // Any synchronous throw (JSON.parse, unexpected SDK shape, etc.) is
      // captured as telemetry; the WS subscription continues. T-4b-05-01
      // belt-and-suspenders — the Zod safeParse calls above are the
      // primary defence; this catch is the last-ditch barrier.
      console.warn('[conc-conflict-dispatcher] handler threw', err);
    }
  };

  ws.addEventListener('message', handler);
  return () => {
    ws.removeEventListener('message', handler);
  };
}
