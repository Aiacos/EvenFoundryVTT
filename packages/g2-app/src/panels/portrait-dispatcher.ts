/**
 * portrait-dispatcher — WS-receive trust boundary for STRETCH-06 portrait ready events (Plan 13-04).
 *
 * Mirrors `action-economy-dispatcher.ts` structure exactly. Attaches a `message`
 * listener to the given WebSocket, applies a double trust boundary parse, and
 * writes validated portrait bytes into the `portrait-state.ts` cache for matching
 * `r1.portrait.ready` envelopes.
 *
 * **Double trust boundary (T-13-03 mitigation at g2-app boundary):**
 *   1. Outer envelope shape — `EnvelopeSchema.safeParse(rawMsg)` enforces the
 *      canonical wire format (`proto/seq/ts/type/session_id/payload`).
 *   2. Inner payload shape — `PortraitReadyPayloadSchema.safeParse(envelope.payload)`
 *      enforces `actorId/pngBase64/width=100/height=60/urlHash` types.
 *   Failure of either parse → `console.warn` + ignore. Cache never written on
 *   malformed input.
 *
 * **Boot wiring:** `attachPortraitHandler` is called from `boot-engine-core.ts`
 * in the step 11 dispatcher area alongside `attachReactionPromptHandler` (Plan 13-04).
 *
 * @see packages/g2-app/src/panels/action-economy-dispatcher.ts (pattern reference)
 * @see packages/g2-app/src/panels/portrait-state.ts (cache writer)
 * @see packages/shared-protocol/src/payloads/portrait.ts (schema)
 * @see .planning/phases/13-v2-stretch/13-04-PLAN.md Task 1
 */

import {
  EnvelopeSchema,
  PortraitReadyPayloadSchema,
  R1_PORTRAIT_READY_TYPE,
} from '@evf/shared-protocol';
import { setPortraitBytes } from './portrait-state.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal WebSocket shape the dispatcher consumes.
 *
 * Defined locally so the dispatcher is testable with the MockSocket used in tests
 * (no polyfill needed). Mirrors `ActionEconomyDispatcherSocket` from
 * action-economy-dispatcher.ts.
 */
export interface PortraitDispatcherSocket {
  addEventListener(event: 'message', handler: (ev: { data: unknown }) => void): void;
  removeEventListener(event: 'message', handler: (ev: { data: unknown }) => void): void;
  send(data: string): void;
}

/**
 * Unsubscribe handle returned by {@link attachPortraitHandler}.
 */
export type PortraitDispatcherUnsubscribe = () => void;

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Attach the portrait dispatcher to the given WebSocket.
 *
 * Subscribes a `message` handler that:
 *   1. Decodes the raw message (string or ArrayBuffer).
 *   2. JSON.parse — failure → console.warn + ignore.
 *   3. EnvelopeSchema.safeParse (outer trust boundary). Reject → warn + ignore.
 *   4. Narrow on `envelope.type === R1_PORTRAIT_READY_TYPE`. Other types → silent return.
 *   5. PortraitReadyPayloadSchema.safeParse (inner trust boundary). Reject → warn + ignore.
 *   6. setPortraitBytes(payload.actorId, { pngBase64, urlHash }) — write to module-scoped cache.
 *
 * Returns an unsubscribe closure that removes the message listener.
 *
 * @param ws WebSocket-like message source
 * @returns Unsubscribe closure
 */
export function attachPortraitHandler(ws: PortraitDispatcherSocket): PortraitDispatcherUnsubscribe {
  const handler = (ev: { data: unknown }): void => {
    try {
      // Step 1 — decode raw bytes / string
      const rawText =
        typeof ev.data === 'string'
          ? ev.data
          : new TextDecoder().decode(ev.data as ArrayBuffer);

      // Step 2 — JSON.parse (throw caught by outer try/catch)
      const parsedJson = JSON.parse(rawText) as unknown;

      // Step 3 — outer envelope shape (canonical EnvelopeSchema)
      const envParse = EnvelopeSchema.safeParse(parsedJson);
      if (!envParse.success) {
        console.warn('[portrait-dispatcher] envelope rejected', envParse.error.message);
        return;
      }

      // Step 4 — narrow on envelope.type. Silent return for other types.
      if (envParse.data.type !== R1_PORTRAIT_READY_TYPE) {
        return;
      }

      // Step 5 — inner payload shape
      const payloadParse = PortraitReadyPayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn('[portrait-dispatcher] payload rejected', payloadParse.error.message);
        return;
      }

      const { actorId, pngBase64, urlHash } = payloadParse.data;

      // Step 6 — write to module-scoped portrait-state cache
      setPortraitBytes(actorId, { pngBase64, urlHash });
    } catch (err) {
      // Defensive catch — JSON.parse, unexpected shape, etc.
      console.warn('[portrait-dispatcher] handler threw', err);
    }
  };

  ws.addEventListener('message', handler);
  return () => {
    ws.removeEventListener('message', handler);
  };
}
