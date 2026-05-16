/**
 * action-result-dispatcher — WS-receive trust boundary for ACT-01 (Plan 08-01).
 *
 * Mirrors `reaction-toast-dispatcher.ts` structure exactly. Attaches a `message`
 * listener to the given WebSocket, applies a double trust boundary parse, and
 * enqueues a typed toast on the Phase 4b `ToastQueueLayer` for matching
 * `r1.action.result` envelopes.
 *
 * **Double trust boundary (T-08-01 mitigation):**
 *   1. Outer envelope shape — `EnvelopeSchema.safeParse(rawMsg)` enforces the
 *      canonical wire format (`proto/seq/ts/type/session_id/payload`).
 *   2. Inner payload shape — `ActionResultPayloadSchema.safeParse(envelope.payload)`
 *      enforces all 8 typed fields including the required `recipientUserId`.
 *   Failure of either parse → `console.warn` + ignore. Toast never enqueued on
 *   malformed input.
 *
 * **Cross-player leak prevention (T-08-02 mitigation):**
 * After the inner parse succeeds, the dispatcher checks
 * `payload.recipientUserId === currentUserId`. On mismatch: SILENT return — no
 * `console.warn`, no `console.error`. Logging the drop would signal to an attacker
 * that their envelope was received and cross-player traffic exists.
 *
 * **Toast format:**
 * - success/failure: `[d20=N] <outcome-label> <damage?>` (≤ 38 chars)
 * - error: `❌ <localized error.action.<kind>>` (≤ 38 chars)
 *
 * **Toast id:** `"action-result-<idempotencyKey>"` — deterministic, idempotent.
 *
 * @see packages/g2-app/src/panels/reaction-toast-dispatcher.ts (pattern reference)
 * @see packages/shared-protocol/src/payloads/action-result.ts (schema)
 * @see .planning/phases/08-manual-action-ux/08-01-PLAN.md Task 3
 */

import type { ActionResultPayload } from '@evf/shared-protocol';
import {
  ActionResultPayloadSchema,
  EnvelopeSchema,
  R1_ACTION_RESULT_TYPE,
} from '@evf/shared-protocol';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import { getLabel } from '../status-hud/i18n-budgets.js';
import type { Toast } from '../status-hud/toast-types.js';

/**
 * Minimal WebSocket shape the dispatcher consumes.
 *
 * Defined locally so the dispatcher is testable with the MockSocket used in tests
 * (no polyfill needed).
 */
export interface ActionResultDispatcherSocket {
  addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  send(data: string): void;
}

/**
 * Minimal toast queue interface — accepts the same payload as `ToastQueueLayer.enqueue`.
 */
export interface ActionResultToastQueue {
  enqueue(toast: Toast): void;
}

/**
 * Unsubscribe handle returned by {@link attachActionResultHandler}.
 */
export type ActionResultDispatcherUnsubscribe = () => void;

/** Outcome display row — IT/EN/DE + best-effort locales */
interface OutcomeLabelRow {
  readonly it: string;
  readonly en: string;
  readonly de: string;
  readonly es: string;
  readonly fr: string;
  readonly 'pt-br': string;
}

/**
 * Outcome display labels per locale.
 * Maps each ActionOutcome value to an IT/EN/DE display string.
 */
const OUTCOME_LABELS: Readonly<Record<string, OutcomeLabelRow>> = {
  hit: { it: 'Colpito!', en: 'Hit!', de: 'Treffer!', es: 'Hit!', fr: 'Hit!', 'pt-br': 'Hit!' },
  miss: { it: 'Mancato', en: 'Miss', de: 'Daneben', es: 'Miss', fr: 'Miss', 'pt-br': 'Miss' },
  save_success: {
    it: 'TS riuscito',
    en: 'Save ✓',
    de: 'Rettung ✓',
    es: 'Save ✓',
    fr: 'Save ✓',
    'pt-br': 'Save ✓',
  },
  save_fail: {
    it: 'TS fallito',
    en: 'Save fail',
    de: 'Rettung ✗',
    es: 'Save fail',
    fr: 'Save fail',
    'pt-br': 'Save fail',
  },
  damage_dealt: {
    it: 'Danno',
    en: 'Damage',
    de: 'Schaden',
    es: 'Damage',
    fr: 'Damage',
    'pt-br': 'Damage',
  },
  no_roll: {
    it: 'Eseguito',
    en: 'Done',
    de: 'Fertig',
    es: 'Done',
    fr: 'Done',
    'pt-br': 'Done',
  },
} as const;

/** Fallback label row used when outcome is not in the OUTCOME_LABELS map. */
const OUTCOME_FALLBACK: OutcomeLabelRow = {
  it: 'Eseguito',
  en: 'Done',
  de: 'Fertig',
  es: 'Done',
  fr: 'Done',
  'pt-br': 'Done',
};

/**
 * Determine toast severity from payload status and outcome.
 *
 * - 'error' → severity 'error' (system error, wrong-turn, no-targets, etc.)
 * - All other statuses → severity 'info' (informational hit, miss, save result)
 *
 * @param status  - High-level result status from the payload
 * @returns Toast severity string
 */
export function formatSeverity(status: ActionResultPayload['status']): Toast['severity'] {
  if (status === 'error') return 'error';
  return 'info';
}

/**
 * Format the action-result toast message for the given locale.
 *
 * Max 38 chars per ToastSchema.message.max(38).
 *
 * Format rules:
 * - status='error': `❌ <localized error.action.<errorKind>>` (or `❌ Errore` fallback)
 * - d20 present: `[d20=N] <outcome-label>` + optional ` <damage>` (truncated to fit)
 * - d20 null: `<outcome-label>` + optional ` <damage>` (truncated to fit)
 *
 * @param payload - Validated ActionResultPayload
 * @param locale  - Active HUD locale
 * @returns Formatted message string (max 38 chars)
 */
export function formatActionMessage(payload: ActionResultPayload, locale: HudLocale): string {
  // Error case: show localized error kind
  if (payload.status === 'error') {
    const errorKey = `error.action.${payload.errorKind ?? 'gm-rejected'}` as Parameters<
      typeof getLabel
    >[0];
    const errorText = getLabel(errorKey, locale);
    return `❌ ${errorText}`.slice(0, 38);
  }

  // Non-error case: outcome label + optional d20 + optional damage
  const outcomeLabelMap: OutcomeLabelRow = OUTCOME_LABELS[payload.outcome] ?? OUTCOME_FALLBACK;
  const outcomeLabel: string = outcomeLabelMap[locale] ?? outcomeLabelMap.en;

  let message: string;
  if (payload.d20 !== null && payload.d20 !== undefined) {
    message = `[d20=${payload.d20}] ${outcomeLabel}`;
  } else {
    message = outcomeLabel;
  }

  // Append damage if present and there is budget remaining
  if (payload.damage) {
    const candidate = `${message} ${payload.damage}`;
    if ([...candidate].length <= 38) {
      message = candidate;
    }
  }

  return message.slice(0, 38);
}

/**
 * Attach the action-result dispatcher to the given WebSocket.
 *
 * Subscribes a `message` handler that:
 *   1. Decodes the raw message (string or ArrayBuffer).
 *   2. JSON.parse — failure → console.warn + ignore.
 *   3. EnvelopeSchema.safeParse (outer trust boundary). Reject → warn + ignore.
 *   4. Narrow on `envelope.type === R1_ACTION_RESULT_TYPE`. Other types → silent return.
 *   5. ActionResultPayloadSchema.safeParse (inner trust boundary). Reject → warn + ignore.
 *   6. T-08-02: if `payload.recipientUserId !== currentUserId` → SILENT return (no warn).
 *   7. Enqueue toast via toastQueue.enqueue with deterministic id.
 *
 * Returns an unsubscribe closure that removes the message listener.
 *
 * @param ws            WebSocket-like message source
 * @param toastQueue    ToastQueueLayer instance (or compatible mock)
 * @param locale        Active HUD locale — drives toast text formatting
 * @param currentUserId Foundry user ID bound to this session (T-08-02 recipient filter)
 * @returns Unsubscribe closure
 */
export function attachActionResultHandler(
  ws: ActionResultDispatcherSocket,
  toastQueue: ActionResultToastQueue,
  locale: HudLocale,
  currentUserId: string,
): ActionResultDispatcherUnsubscribe {
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
        console.warn('[action-result-dispatcher] envelope rejected', envParse.error.message);
        return;
      }

      // Step 4 — narrow on envelope.type. Silent return for other types.
      if (envParse.data.type !== R1_ACTION_RESULT_TYPE) {
        return;
      }

      // Step 5 — inner payload shape
      const payloadParse = ActionResultPayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn('[action-result-dispatcher] payload rejected', payloadParse.error.message);
        return;
      }

      // Step 6 — T-08-02: recipient filter (SILENT drop — no warn)
      if (payloadParse.data.recipientUserId !== currentUserId) {
        return;
      }

      const payload = payloadParse.data;

      // Step 7 — enqueue typed toast
      const message = formatActionMessage(payload, locale);
      const severity = formatSeverity(payload.status);
      toastQueue.enqueue({
        id: `action-result-${payload.idempotencyKey}`,
        severity,
        message,
        emittedAt: Date.now(),
      });
    } catch (err) {
      // Defensive catch — JSON.parse, unexpected shape, etc.
      console.warn('[action-result-dispatcher] handler threw', err);
    }
  };

  ws.addEventListener('message', handler);
  return () => {
    ws.removeEventListener('message', handler);
  };
}
