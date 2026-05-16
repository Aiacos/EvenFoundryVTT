/**
 * action-economy-dispatcher — WS-receive trust boundary for COMB-02 (Plan 09-01).
 *
 * Mirrors `action-result-dispatcher.ts` structure exactly. Attaches a `message`
 * listener to the given WebSocket, applies a double trust boundary parse, and
 * writes validated `ActionEconomyPayload` into the `action-economy-state.ts` cache
 * for matching `r1.action.economy` envelopes.
 *
 * **Double trust boundary (T-09-01 mitigation):**
 *   1. Outer envelope shape — `EnvelopeSchema.safeParse(rawMsg)` enforces the
 *      canonical wire format (`proto/seq/ts/type/session_id/payload`).
 *   2. Inner payload shape — `ActionEconomyPayloadSchema.safeParse(envelope.payload)`
 *      enforces all 6 typed fields including the required `recipientUserId`.
 *   Failure of either parse → `console.warn` + ignore. Cache never written on
 *   malformed input.
 *
 * **Cross-player leak prevention (T-09-03 / T-08-02 pattern):**
 * After the inner parse succeeds, the dispatcher checks
 * `payload.recipientUserId === currentUserId`. On mismatch: SILENT return — no
 * `console.warn`, no `console.error`. Logging the drop would signal to an attacker
 * that their envelope was received and cross-player traffic exists.
 *
 * **Cache update:**
 * On success, calls `setActionEconomyState(payload)` which overwrites the
 * previous entry for `payload.actorId` in the module-scoped Map.
 *
 * **No boot wiring in this plan:**
 * Plan 09-02 wires this dispatcher into the boot bundle after the action economy
 * widget renderer is in place. This module only exports the attach function.
 *
 * @see packages/g2-app/src/panels/action-result-dispatcher.ts (pattern reference)
 * @see packages/g2-app/src/panels/action-economy-state.ts (cache writer)
 * @see packages/shared-protocol/src/payloads/action-economy.ts (schema)
 * @see .planning/phases/09-action-economy-edge-cases/09-01-PLAN.md Task 3
 */

import {
  ActionEconomyPayloadSchema,
  EnvelopeSchema,
  R1_ACTION_ECONOMY_TYPE,
} from '@evf/shared-protocol';
import { setActionEconomyState } from './action-economy-state.js';

/**
 * Minimal WebSocket shape the dispatcher consumes.
 *
 * Defined locally so the dispatcher is testable with the MockSocket used in tests
 * (no polyfill needed). Mirrors `ActionResultDispatcherSocket` from
 * action-result-dispatcher.ts.
 */
export interface ActionEconomyDispatcherSocket {
  addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  send(data: string): void;
}

/**
 * Unsubscribe handle returned by {@link attachActionEconomyHandler}.
 */
export type ActionEconomyDispatcherUnsubscribe = () => void;

/**
 * Attach the action-economy dispatcher to the given WebSocket.
 *
 * Subscribes a `message` handler that:
 *   1. Decodes the raw message (string or ArrayBuffer).
 *   2. JSON.parse — failure → console.warn + ignore.
 *   3. EnvelopeSchema.safeParse (outer trust boundary). Reject → warn + ignore.
 *   4. Narrow on `envelope.type === R1_ACTION_ECONOMY_TYPE`. Other types → silent return.
 *   5. ActionEconomyPayloadSchema.safeParse (inner trust boundary). Reject → warn + ignore.
 *   6. T-09-03: if `payload.recipientUserId !== currentUserId` → SILENT return (no warn).
 *   7. setActionEconomyState(payload) — write to module-scoped cache.
 *
 * Returns an unsubscribe closure that removes the message listener.
 *
 * @param ws            WebSocket-like message source
 * @param currentUserId Foundry user ID bound to this session (T-09-03 / T-08-02 recipient filter)
 * @returns Unsubscribe closure
 */
export function attachActionEconomyHandler(
  ws: ActionEconomyDispatcherSocket,
  currentUserId: string,
): ActionEconomyDispatcherUnsubscribe {
  const handler = (ev: MessageEvent): void => {
    try {
      // Step 1 — decode raw bytes / string
      const rawText =
        typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);

      // Step 2 — JSON.parse (throw caught by outer try/catch)
      const parsedJson = JSON.parse(rawText) as unknown;

      // Step 3 — outer envelope shape (canonical EnvelopeSchema)
      const envParse = EnvelopeSchema.safeParse(parsedJson);
      if (!envParse.success) {
        console.warn('[action-economy-dispatcher] envelope rejected', envParse.error.message);
        return;
      }

      // Step 4 — narrow on envelope.type. Silent return for other types.
      if (envParse.data.type !== R1_ACTION_ECONOMY_TYPE) {
        return;
      }

      // Step 5 — inner payload shape
      const payloadParse = ActionEconomyPayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn('[action-economy-dispatcher] payload rejected', payloadParse.error.message);
        return;
      }

      // Step 6 — T-09-03 (T-08-02 pattern): recipient filter (SILENT drop — no warn)
      if (payloadParse.data.recipientUserId !== currentUserId) {
        return;
      }

      // Step 7 — write to module-scoped cache
      setActionEconomyState(payloadParse.data);
    } catch (err) {
      // Defensive catch — JSON.parse, unexpected shape, etc.
      console.warn('[action-economy-dispatcher] handler threw', err);
    }
  };

  ws.addEventListener('message', handler);
  return () => {
    ws.removeEventListener('message', handler);
  };
}
