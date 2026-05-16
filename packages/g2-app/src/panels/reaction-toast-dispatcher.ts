/**
 * reaction-toast-dispatcher — WS-receive trust boundary for REACT-01.
 *
 * Mirrors `conc-conflict-dispatcher.ts` exactly. Attaches a `message` listener
 * to the given WebSocket, applies a double trust boundary parse, and enqueues
 * a toast on the Phase 4b `ToastQueueLayer` for matching `r1.reaction.available`
 * envelopes.
 *
 * **Double trust boundary (T-07-05-01 mitigation):**
 *   1. Outer envelope shape — `EnvelopeSchema.safeParse(rawMsg)` enforces the
 *      canonical wire format (`proto/seq/ts/type/session_id/payload`).
 *   2. Inner payload shape — `ReactionAvailablePayloadSchema.safeParse(envelope.payload)`
 *      enforces `kind/sourceName/expiresAt` types.
 *   Failure of either parse → `console.warn` + ignore. Toast never enqueued on
 *   malformed input.
 *
 * **Display-only (REACT-01 scope):**
 * The toast is NOT clickable — no tap-to-fire wiring. dwellMs = 3000 ms.
 * ACT-04 (V2) owns the reaction execution surface.
 *
 * **Toast message format (IT/EN):**
 * - IT: `REAZ: ${kind} (${sourceName})`
 * - EN: `REACT: ${kind} (${sourceName})`
 *
 * Max 38 chars per ToastSchema.message.max(38). sourceName truncated if needed.
 *
 * @see packages/g2-app/src/panels/conc-conflict-dispatcher.ts (pattern reference)
 * @see packages/g2-app/src/status-hud/toast-queue-layer.ts (ToastQueueLayer.enqueue)
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 1
 */

import {
  EnvelopeSchema,
  R1_REACTION_AVAILABLE_TYPE,
  ReactionAvailablePayloadSchema,
} from '@evf/shared-protocol';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import type { Toast } from '../status-hud/toast-types.js';

/**
 * Minimal WebSocket shape the dispatcher consumes.
 *
 * Defined locally so the dispatcher is testable with the MockSocket used in tests
 * (no polyfill needed).
 */
export interface ReactionDispatcherSocket {
  addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  send(data: string): void;
}

/**
 * Minimal toast queue interface — accepts the same payload as `ToastQueueLayer.enqueue`.
 */
export interface ReactionToastQueue {
  enqueue(toast: Toast): void;
}

/**
 * Unsubscribe handle returned by {@link attachReactionToastHandler}.
 */
export type ReactionDispatcherUnsubscribe = () => void;

/**
 * Format the reaction toast message for the given locale.
 *
 * Max 38 chars per ToastSchema budget (42 row - 3 prefix - 1 margin).
 * sourceName is truncated if needed to fit the budget.
 *
 * @param kind       - Reaction kind (shield | counterspell | opportunity-attack)
 * @param sourceName - NPC name that triggered the reaction
 * @param locale     - Active HUD locale
 * @returns Formatted message string (max 38 chars)
 */
function formatReactionText(kind: string, sourceName: string, locale: HudLocale): string {
  // Label prefix (locale-specific)
  const prefix = locale === 'it' ? 'REAZ' : 'REACT';
  // Truncate sourceName to keep total ≤ 38 chars
  // Budget: prefix + ': ' + kind + ' (' + sourceName + ')' = prefix.len + 2 + kind.len + 2 + name + 1
  const staticPart = `${prefix}: ${kind} ()`;
  const budget = 38 - staticPart.length;
  const name = budget > 0 ? [...sourceName].slice(0, budget).join('') : '';
  return `${prefix}: ${kind} (${name})`.slice(0, 38);
}

/**
 * Attach the reaction-toast dispatcher to the given WebSocket.
 *
 * Subscribes a `message` handler that:
 *   1. Decodes the raw message (string or ArrayBuffer).
 *   2. JSON.parse — failure → console.warn + ignore.
 *   3. EnvelopeSchema.safeParse (outer trust boundary). Reject → warn + ignore.
 *   4. Narrow on `envelope.type === R1_REACTION_AVAILABLE_TYPE`. Other types → silent return.
 *   5. ReactionAvailablePayloadSchema.safeParse (inner trust boundary). Reject → warn + ignore.
 *   6. Enqueue toast via toastQueue.enqueue({ kind: 'reaction', text, dwellMs: 3000 }).
 *
 * Returns an unsubscribe closure that removes the message listener.
 *
 * @param ws          WebSocket-like message source
 * @param toastQueue  ToastQueueLayer instance (or compatible mock)
 * @param locale      Active HUD locale — drives toast text formatting
 * @returns Unsubscribe closure
 */
export function attachReactionToastHandler(
  ws: ReactionDispatcherSocket,
  toastQueue: ReactionToastQueue,
  locale: HudLocale,
): ReactionDispatcherUnsubscribe {
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
        console.warn('[reaction-toast-dispatcher] envelope rejected', envParse.error.message);
        return;
      }

      // Step 4 — narrow on envelope.type. Silent return for other types.
      if (envParse.data.type !== R1_REACTION_AVAILABLE_TYPE) {
        return;
      }

      // Step 5 — inner payload shape
      const payloadParse = ReactionAvailablePayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn('[reaction-toast-dispatcher] payload rejected', payloadParse.error.message);
        return;
      }

      const { kind, sourceName } = payloadParse.data;

      // Step 6 — enqueue toast via ToastQueueLayer
      const message = formatReactionText(kind, sourceName, locale);
      toastQueue.enqueue({
        id: `reaction-${Date.now()}-${kind}`,
        severity: 'warn',
        message,
        emittedAt: Date.now(),
      });
    } catch (err) {
      // Defensive catch — JSON.parse, unexpected shape, etc.
      console.warn('[reaction-toast-dispatcher] handler threw', err);
    }
  };

  ws.addEventListener('message', handler);
  return () => {
    ws.removeEventListener('message', handler);
  };
}
