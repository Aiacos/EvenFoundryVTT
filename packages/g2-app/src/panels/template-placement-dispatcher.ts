/**
 * template-placement-dispatcher — WS-receive trust boundary for the ACT-02 flow.
 *
 * Production code path that mounts the {@link ./template-placement-panel.js#TemplatePlacementPanel}
 * at z=2 when the bridge emits a `template.placement.requested` envelope.
 * Plan 07-03 §Task 2: AoE template placement panel + dispatcher.
 *
 * **Double trust boundary (T-4b-05-01 pattern — mirror of conc-conflict-dispatcher):**
 *   1. Outer envelope shape — `EnvelopeSchema.safeParse(rawMsg)` enforces
 *      the canonical wire format (`proto/seq/ts/type/session_id/payload`).
 *   2. Inner payload shape — `TemplatePlacementRequestedPayloadSchema.safeParse(envelope.payload)`
 *      enforces `placementId/spellName/templateIndex/total/type/distance` field presence.
 *   Failure of either parse → `console.warn` + ignore. Panel never mounts on
 *   malformed input. TPD-03..06 verify rejection paths.
 *
 * **Phase 7 wiring hook:** `attachTemplatePlacementHandler` will be invoked from
 * `boot-engine-core.ts` (alongside `attachConcConflictHandler`) after the WS is
 * established. Plan 07-03 ships the dispatcher + tests proving it works end-to-end
 * from a synthetic `ws.fireMessage` (TPD-02, TPD-08).
 *
 * **No virtual DOM** — the only side effects are `console.warn` (telemetry) +
 * `layerManager.bundle` (atomic op) + `ws.addEventListener` (subscriber lifecycle).
 *
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 2
 * @see packages/g2-app/src/panels/conc-conflict-dispatcher.ts (pattern exemplar)
 * @see packages/g2-app/src/panels/template-placement-panel.ts
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  EnvelopeSchema,
  TEMPLATE_PLACEMENT_REQUESTED_TYPE,
  TemplatePlacementRequestedPayloadSchema,
} from '@evf/shared-protocol';
import type { LayerManager } from '../engine/layer-manager.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import { TemplatePlacementPanel } from './template-placement-panel.js';

/**
 * Minimal WebSocket shape the dispatcher consumes.
 *
 * Mirrors {@link ConcDispatcherSocket} verbatim — defined locally so the
 * dispatcher is testable with the EventEmitter-backed MockSocket without
 * importing the lib.dom `WebSocket` type. The `send` property is required
 * because the same value is forwarded to {@link TemplatePlacementPanel}
 * (which uses it to emit `tool.invoke` and `template.placement.cancel`
 * envelopes back to the bridge).
 */
export interface TemplatePlacementDispatcherSocket {
  addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  send(data: string): void;
}

/**
 * Unsubscribe handle returned by {@link attachTemplatePlacementHandler}.
 *
 * Calling it removes the `message` listener from the WebSocket. Idempotent
 * via the underlying `removeEventListener` contract.
 */
export type TemplatePlacementUnsubscribe = () => void;

/**
 * Attach the template-placement dispatcher to the given WebSocket.
 *
 * Subscribes a `message` handler that:
 *
 *   1. Decodes the raw message (`string` directly, or `ArrayBuffer` via
 *      `TextDecoder`).
 *   2. `JSON.parse` — failure → `console.warn` + ignore.
 *   3. `EnvelopeSchema.safeParse` (outer trust boundary). Reject → warn + ignore.
 *   4. Narrow on `envelope.type === 'template.placement.requested'` — other
 *      types return silently (handled by other dispatchers, not an error here).
 *   5. `TemplatePlacementRequestedPayloadSchema.safeParse(envelope.payload)`
 *      (inner trust boundary). Reject → warn + ignore.
 *   6. Construct {@link TemplatePlacementPanel} with the validated payload +
 *      the inbound envelope's `session_id`.
 *   7. `layerManager.bundle([{ type: 'mount', z: Z2_OVERLAY, layer: panel }])`
 *      — Plan 01 differential demolish auto-removes z=0.5; z=1 status HUD survives.
 *
 * The panel's `onClose` callback issues a destroy bundle that reverses the mount.
 *
 * Returns an unsubscribe closure that removes the message listener — call it
 * during application teardown.
 *
 * @param ws            WS-like message source supporting add/removeEventListener + send
 * @param bridge        EvenAppBridge handle (forwarded to the panel for draw)
 * @param gestureBus    Shared in-process gesture bus (forwarded to the panel)
 * @param layerManager  LayerManager singleton (Plan 01)
 * @param locale        Active HUD locale — forwarded to the panel for label lookup
 * @returns Unsubscribe closure
 */
export function attachTemplatePlacementHandler(
  ws: TemplatePlacementDispatcherSocket,
  bridge: EvenAppBridge,
  gestureBus: PanelGestureBus,
  layerManager: LayerManager,
  locale: HudLocale,
): TemplatePlacementUnsubscribe {
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
        console.warn('[template-placement-dispatcher] envelope rejected', envParse.error.message);
        return;
      }

      // Step 4 — narrow on envelope.type. Silent return for other types
      // (e.g., 'character.delta', 'conc.conflict') — they belong to other
      // dispatchers and aren't an error condition here.
      if (envParse.data.type !== TEMPLATE_PLACEMENT_REQUESTED_TYPE) {
        return;
      }

      // Step 5 — inner payload shape.
      const payloadParse = TemplatePlacementRequestedPayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn(
          '[template-placement-dispatcher] payload rejected',
          payloadParse.error.message,
        );
        return;
      }

      // Step 6 — construct the panel with the inbound session_id threaded
      // verbatim. The onClose callback (Step 7) issues the destroy bundle
      // that reverses the differential demolish.
      const panel = new TemplatePlacementPanel(
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
      );

      // Step 7 — mount via bundle (single atomic flush). Fire-and-forget.
      void layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
    } catch (err) {
      // Any synchronous throw (JSON.parse, unexpected SDK shape, etc.) is
      // captured as telemetry; the WS subscription continues.
      console.warn('[template-placement-dispatcher] handler threw', err);
    }
  };

  ws.addEventListener('message', handler);
  return () => {
    ws.removeEventListener('message', handler);
  };
}
