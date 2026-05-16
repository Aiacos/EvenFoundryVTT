/**
 * Action result payload schema (Plan 08-01 — ACT-01).
 *
 * Emitted by the Foundry module's `action-result-watcher.ts` when
 * `createChatMessage` fires for a chat card bearing `flags.evf.audit.idempotencyKey`.
 * The watcher extracts d20/outcome/damage from the card and emits an
 * `r1.action.result` envelope via `bridgeDeltaEmitter(R1_ACTION_RESULT_TYPE, payload)`.
 *
 * g2-app's `action-result-dispatcher.ts` receives this envelope, validates it
 * with a double trust boundary (outer `EnvelopeSchema` + inner this schema), then
 * enqueues a typed toast via Phase 4b `ToastQueueLayer`.
 *
 * ## Security
 *
 * - **T-08-01 (Spoofing/Tampering):** Schema uses `z.strictObject` — extra fields
 *   are rejected, preventing field-smuggling at the WS-receive trust boundary
 *   (same pattern as `ToolInvocationEnvelopePayloadSchema` from Plan 07-01).
 * - **T-08-02 (Cross-player leak):** `recipientUserId` is a REQUIRED field (not
 *   optional). The dispatcher silently drops envelopes where `recipientUserId`
 *   does not match the bound bearer's `user_id`. No default value is set to
 *   prevent silent cross-player leaks from schema version skew.
 *
 * ## Audit log linkage
 *
 * The `idempotencyKey` JOIN key links an action result back to the original
 * `dispatchTool` call recorded in the GM-whispered audit-log ChatMessage
 * (`flags.evf.audit.idempotencyKey` per audit-log.ts). The result envelope
 * does NOT include `bearer_id`, `actorId`, or raw `audit.payload` — those
 * stay GM-whispered per T-08-02-02.
 *
 * @see packages/foundry-module/src/write-path/action-result-watcher.ts (emitter)
 * @see packages/g2-app/src/panels/action-result-dispatcher.ts (consumer)
 * @see packages/shared-protocol/src/payloads/reaction.ts (pattern reference)
 * @see .planning/phases/08-manual-action-ux/08-01-PLAN.md Task 1
 * @see .planning/phases/08-manual-action-ux/08-CONTEXT.md §Area 2
 */

import { z } from 'zod';
import { TOOL_ID_SCHEMA } from './tool.js';

/**
 * WS envelope `type` discriminant for action-result events.
 *
 * Used by `action-result-dispatcher` to narrow from the outer Envelope parse
 * before applying the inner `ActionResultPayloadSchema`.
 */
export const R1_ACTION_RESULT_TYPE = 'r1.action.result' as const;

/**
 * Action outcome enum.
 *
 * Canonical set of 6 outcome values. NEVER add 'critical' — critical hits are
 * surface-decorations on an underlying 'hit' result. The Phase 8 broad heuristic
 * maps to these values from chat-card flavor text.
 *
 * - `hit`           — Attack roll succeeded (d20 + atk mod ≥ target AC)
 * - `miss`          — Attack roll failed
 * - `save_success`  — Saving throw succeeded (d20 + save mod ≥ DC)
 * - `save_fail`     — Saving throw failed
 * - `damage_dealt`  — Damage resolved without an attack roll (e.g. AoE save success already handled)
 * - `no_roll`       — No roll required (item use, move-token, drop-concentration)
 */
export const ActionOutcome = z.enum([
  'hit',
  'miss',
  'save_success',
  'save_fail',
  'damage_dealt',
  'no_roll',
]);

/**
 * Typed error kind enum.
 *
 * Maps to the 5 error.action.* i18n keys in `i18n-budgets.ts`. The watcher
 * derives this from `audit.result.error` string via substring matching.
 *
 * - `no-targets`       — No valid targets found (targeting phase filtered empty)
 * - `out-of-range`     — Target is outside weapon/spell range
 * - `out-of-resource`  — No spell slots / charges / uses remaining
 * - `wrong-turn`       — Action attempted outside player's turn
 * - `gm-rejected`      — GM blocked the action; also the catch-all default
 */
export const ActionErrorKind = z.enum([
  'no-targets',
  'out-of-range',
  'out-of-resource',
  'wrong-turn',
  'gm-rejected',
]);

/**
 * Action result payload schema.
 *
 * Strict object: extra fields are rejected (T-08-01 belt-and-suspenders —
 * same pattern as `ToolInvocationEnvelopePayloadSchema` from Plan 07-01).
 *
 * Fields:
 * - `idempotencyKey`  — UUID v4. JOIN key to the audit-log entry
 *                       (`flags.evf.audit.idempotencyKey`) for deduplication
 *                       and toast-id construction.
 * - `toolId`          — Tool that produced this result. One of TOOL_ID_SCHEMA values.
 * - `d20`             — Raw d20 result, or null when no roll was made (no_roll / error).
 *                       `z.number().int().nullable()` — null for no_roll + error cases.
 * - `outcome`         — Action outcome. One of ActionOutcome enum values.
 * - `damage`          — Optional damage string, e.g. "1d8+3 = 7 sl". Max 24 chars
 *                       (toast budget). Omitted when no damage was dealt.
 * - `status`          — High-level result: 'success' | 'failure' | 'error'.
 * - `errorKind`       — Optional error classification. Only present when status='error'.
 * - `recipientUserId` — REQUIRED. Foundry user ID of the player whose action produced
 *                       this result. Dispatcher silently drops on mismatch (T-08-02).
 *                       NOT optional — no default prevents silent cross-player leaks.
 *
 * @example
 * ```ts
 * const payload: ActionResultPayload = {
 *   idempotencyKey: '00000000-0000-4000-8000-000000000001',
 *   toolId: 'cast-spell',
 *   d20: 18,
 *   outcome: 'hit',
 *   damage: '1d8+3 = 7 sl',
 *   status: 'success',
 *   recipientUserId: 'user-player-abc',
 * };
 * ```
 */
export const ActionResultPayloadSchema = z
  .object({
    /** UUID v4 — JOIN key to the audit-log entry. Used as toast id prefix. */
    idempotencyKey: z.string().uuid(),
    /** Tool that produced this result. */
    toolId: TOOL_ID_SCHEMA,
    /** Raw d20 result, or null when no roll was made. */
    d20: z.number().int().nullable(),
    /** Action outcome. One of 6 canonical values — 'critical' is not allowed. */
    outcome: ActionOutcome,
    /** Optional damage string (max 24 chars, toast-budget truncated by watcher). */
    damage: z.string().optional(),
    /** High-level result status. */
    status: z.enum(['success', 'failure', 'error']),
    /**
     * Optional typed error kind. Present only when status='error'.
     * Drives the `error.action.<kind>` i18n key lookup in the dispatcher.
     */
    errorKind: ActionErrorKind.optional(),
    /**
     * REQUIRED. Foundry user ID of the action's player.
     * Dispatcher silently drops envelopes where this !== currentBearer.user_id.
     * Not optional — absence means schema version skew, not "broadcast to all".
     */
    recipientUserId: z.string().min(1),
  })
  .strict();

/** TypeScript type inferred from {@link ActionResultPayloadSchema}. */
export type ActionResultPayload = z.infer<typeof ActionResultPayloadSchema>;

/**
 * TypeScript type for the ActionOutcome enum values.
 * Convenience re-export for type-only consumers.
 */
export type ActionOutcomeValue = z.infer<typeof ActionOutcome>;

/**
 * TypeScript type for the ActionErrorKind enum values.
 * Convenience re-export for type-only consumers.
 */
export type ActionErrorKindValue = z.infer<typeof ActionErrorKind>;
