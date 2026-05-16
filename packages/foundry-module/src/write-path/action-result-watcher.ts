/**
 * action-result-watcher — `createChatMessage` hook subscriber (Plan 08-01 — ACT-01).
 *
 * Subscribes to the Foundry `createChatMessage` hook. When a chat card is created
 * that contains `flags.evf.audit.idempotencyKey` (written by `writeAuditLog` after
 * every `dispatchTool` call), the handler extracts the action result fields and emits
 * an `r1.action.result` envelope via the injected `emit` callback.
 *
 * The callback is wired by `module.ts` to:
 *   `bridgeDeltaEmitter(R1_ACTION_RESULT_TYPE, payload)`
 *
 * ## RESEARCH §Q1 — createChatMessage hook timing
 *
 * `createChatMessage` fires AFTER the ChatMessage document has been created in
 * Foundry's database, so the chat card has its final state including any MidiQOL-
 * processed damage values. The Phase 7 `dispatchTool` flow calls `writeAuditLog`
 * AFTER `handler.handle()` resolves — meaning the audit ChatMessage is written after
 * the tool completes, and the `createChatMessage` hook fires after that write.
 * The watcher therefore sees the final chat-card content including roll totals.
 *
 * ## CRITICAL: NEVER return false
 *
 * The hook handler MUST NEVER return `false`. Returning `false` from a Foundry
 * `createChatMessage` hook would cancel the chat message creation entirely, which
 * would suppress GM audit log entries and break normal session communication.
 * TypeScript `void` return type on the handler enforces this contract.
 *
 * ## 14-socketlib-handler invariant
 *
 * This module registers NO new socketlib handlers. The total count remains 14.
 * Emission is via the existing `bridgeDeltaEmitter` channel (fire-and-forget
 * POST to bridge). Source: Phase 7 Plan 06 ADR-0011 invariant closure.
 *
 * ## Fault tolerance
 *
 * All errors in the handler are swallowed with `console.warn`. A result-watcher
 * failure must NEVER crash the Foundry session or interrupt the hook chain.
 * The audit log (written before this hook fires) records the action regardless.
 *
 * @see packages/foundry-module/src/write-path/audit-log.ts (flags.evf.audit shape)
 * @see packages/foundry-module/src/module.ts (wiring insertion point)
 * @see packages/foundry-module/src/write-path/reaction-watcher.ts (hook pattern reference)
 * @see .planning/phases/08-manual-action-ux/08-01-PLAN.md Task 2
 */

import type { ActionResultPayload } from '@evf/shared-protocol';

// Local type aliases — mirror ActionOutcome and ActionErrorKind from shared-protocol/action-result.ts.
// Defined here as string literal unions to avoid a circular barrel dependency when
// foundry-module imports from @evf/shared-protocol's barrel re-export chain.
type ActionOutcomeValue = 'hit' | 'miss' | 'save_success' | 'save_fail' | 'damage_dealt' | 'no_roll';
type ActionErrorKindValue = 'no-targets' | 'out-of-range' | 'out-of-resource' | 'wrong-turn' | 'gm-rejected';

// ─── Private type aliases ─────────────────────────────────────────────────────

/** Tool IDs from TOOL_ID_SCHEMA (matches actionResultPayloadSchema.toolId). */
type ToolId =
  | 'cast-spell'
  | 'weapon-attack'
  | 'use-item'
  | 'move-token'
  | 'drop-concentration'
  | 'place-template'
  | 'confirm-template-placement';

/** Minimal audit entry shape the watcher reads. */
interface AuditEntry {
  tool: string;
  idempotencyKey: string;
  actorId: string | null;
  result: { success: boolean; error?: string; data?: unknown };
  payload: unknown;
  timestamp: number;
  bearer_id: string;
}

// ─── Module-local helpers ─────────────────────────────────────────────────────

/**
 * Defensively extract the d20 result from the Foundry ChatMessage's rolls array.
 *
 * Path: `msg.rolls[0].dice[0].results[0].result` (dnd5e roll object shape).
 * Returns `null` (NOT undefined) on any missing path — `null` signals no_roll case.
 *
 * @param msg - Raw Foundry ChatMessage (untyped)
 * @returns d20 integer, or null if no roll / path missing
 */
function extractD20(msg: unknown): number | null {
  try {
    const m = msg as Record<string, unknown>;
    const rolls = m.rolls as Array<unknown> | undefined;
    if (!Array.isArray(rolls) || rolls.length === 0) return null;
    const roll0 = rolls[0] as Record<string, unknown>;
    const dice = roll0?.dice as Array<unknown> | undefined;
    if (!Array.isArray(dice) || dice.length === 0) return null;
    const die0 = dice[0] as Record<string, unknown>;
    const results = die0?.results as Array<unknown> | undefined;
    if (!Array.isArray(results) || results.length === 0) return null;
    const r0 = results[0] as Record<string, unknown>;
    const result = r0?.result;
    if (typeof result !== 'number' || !Number.isInteger(result)) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * Defensively extract a damage descriptor from the chat card's flavor text.
 *
 * Regex matches patterns like "8d6 fire = 28 sl", "1d8+3 = 7 sl", "28 hp", etc.
 * Truncates to 24 chars (toast row budget per CONTEXT.md §Area 2).
 *
 * @param msg - Raw Foundry ChatMessage (untyped)
 * @returns Damage string (max 24 chars) or undefined if no match
 */
function extractDamage(msg: unknown): string | undefined {
  try {
    const m = msg as Record<string, unknown>;
    const flavor = m.flavor;
    if (typeof flavor !== 'string') return undefined;
    // Match patterns with dice notation or direct HP/SL values
    const match = flavor.match(/\d+d\d+[^|]*?(sl|hp|fuoco|fire|dmg)/i);
    if (match?.[0]) {
      return [...match[0]].slice(0, 24).join('');
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Map an audit result error string to an ActionErrorKind discriminant.
 *
 * Deterministic substring-based mapping per PLAN spec:
 * - 'no_targets' → 'no-targets'
 * - 'out_of_range' → 'out-of-range'
 * - 'no_resource' | 'insufficient' → 'out-of-resource'
 * - 'wrong_turn' → 'wrong-turn'
 * - 'no_gm_connected' | default → 'gm-rejected' (catch-all)
 *
 * @param errorStr - The error string from `audit.result.error`
 * @returns Canonical ActionErrorKind value
 */
function mapErrorToKind(errorStr: string): ActionErrorKindValue {
  if (errorStr.includes('no_targets')) return 'no-targets';
  if (errorStr.includes('out_of_range')) return 'out-of-range';
  if (errorStr.includes('no_resource') || errorStr.includes('insufficient')) {
    return 'out-of-resource';
  }
  if (errorStr.includes('wrong_turn')) return 'wrong-turn';
  // 'no_gm_connected' and all other errors → gm-rejected (catch-all)
  return 'gm-rejected';
}

/**
 * Infer the canonical ActionOutcome from the tool ID, status, and extracted damage.
 *
 * Phase 8 broad heuristic:
 * - Weapons/spells with damage → 'damage_dealt' (success) or 'miss' (failure)
 * - All other tools → 'no_roll'
 *
 * NEVER returns 'critical' — critical hits are surface decoration on 'hit'.
 * The fine-grained hit/miss distinction (d20 vs AC) is Phase 9 COMB-02 territory.
 *
 * @param toolId - The tool ID from the audit entry
 * @param success - Whether the tool call succeeded
 * @param damage  - Extracted damage string (or undefined)
 * @returns Canonical ActionOutcome value
 */
function inferOutcome(
  toolId: string,
  success: boolean,
  damage: string | undefined,
): ActionOutcomeValue {
  if (toolId === 'cast-spell' || toolId === 'weapon-attack') {
    if (!success) return 'miss';
    if (damage !== undefined) return 'damage_dealt';
    return 'no_roll';
  }
  // use-item, move-token, drop-concentration, place-template, confirm-template-placement, default
  return 'no_roll';
}

/**
 * Resolve the Foundry user ID for the player who triggered the action.
 *
 * Primary: `(msg as any).user` — the user ID stored on the ChatMessage document.
 * Fallback: `game.users.contents.find(u => u.character?.id === audit.actorId)?.id`.
 * Final fallback: `'<unknown>'` (non-empty string, so ActionResultPayloadSchema validates).
 *
 * @param msg   - Raw Foundry ChatMessage (untyped)
 * @param audit - Parsed audit entry from msg.flags.evf.audit
 * @returns Non-empty user ID string
 */
function resolveRecipientUserId(msg: unknown, audit: AuditEntry): string {
  try {
    const m = msg as Record<string, unknown>;
    const userId = m.user;
    if (typeof userId === 'string' && userId.length > 0) {
      return userId;
    }
    // Fallback: find user by character actor ID
    const users = game.users?.contents as Array<{ id: string; character?: { id: string } | null }> | undefined;
    if (Array.isArray(users) && audit.actorId) {
      const match = users.find((u) => u.character?.id === audit.actorId);
      if (match?.id) return match.id;
    }
  } catch {
    // Defensive — never throws
  }
  return '<unknown>';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register the `createChatMessage` hook subscriber for action result telemetry.
 *
 * Called by `module.ts` in `Hooks.once('ready', ...)` AFTER `scheduleBearerRotation`
 * and BEFORE `registerCanvasExtractor` per the ready-hook assembly order.
 *
 * The handler inspects incoming ChatMessage documents for `flags.evf.audit` presence
 * (written by `writeAuditLog` after every `dispatchTool` call). When found, it
 * extracts the result fields and calls `emit(payload)` to dispatch the
 * `r1.action.result` envelope via `bridgeDeltaEmitter`.
 *
 * Regular chat messages (player whispers, GM narration, dnd5e cards without EVF
 * audit flags) are silently ignored — `emit` is never called.
 *
 * @param emit - Callback to emit the action result payload via bridgeDeltaEmitter.
 *               Wrapped in try/catch — if emit throws, the Foundry session continues.
 * @returns Unsubscribe closure — calls `Hooks.off(hookId)`. Discarded by module.ts
 *          for MVP (module lifecycle is for-the-session).
 */
export function registerActionResultWatcher(
  emit: (payload: ActionResultPayload) => void,
): () => void {
  // CRITICAL: NEVER return false — that would cancel chat message creation
  // TypeScript void return type enforces this contract
  const hookId = Hooks.on('createChatMessage', (...args: unknown[]): void => {
    try {
      const msg = args[0];
      if (msg === null || typeof msg !== 'object') return;

      const m = msg as Record<string, unknown>;

      // Early return if no evf.audit flag — regular chat messages are silently ignored
      const flags = m.flags as Record<string, unknown> | undefined;
      const evf = flags?.evf as Record<string, unknown> | undefined;
      const rawAudit = evf?.audit;
      if (rawAudit === undefined || rawAudit === null) return;

      // Duck-type narrow the audit entry — NEVER trust schema on a foreign Foundry doc
      const audit = rawAudit as Record<string, unknown>;
      if (
        typeof audit.idempotencyKey !== 'string' ||
        typeof audit.tool !== 'string' ||
        audit.result === null ||
        typeof audit.result !== 'object'
      ) {
        return;
      }

      // Cast to our local AuditEntry shape after duck-type checks
      const typedAudit: AuditEntry = {
        tool: audit.tool,
        idempotencyKey: audit.idempotencyKey,
        actorId:
          typeof audit.actorId === 'string' ? audit.actorId : null,
        result: audit.result as { success: boolean; error?: string; data?: unknown },
        payload: audit.payload,
        timestamp: typeof audit.timestamp === 'number' ? audit.timestamp : Date.now(),
        bearer_id: typeof audit.bearer_id === 'string' ? audit.bearer_id : '',
      };

      // Extract result fields from the chat card
      const d20 = extractD20(m);
      const damage = extractDamage(m);
      const success = typedAudit.result.success;
      const outcome = inferOutcome(typedAudit.tool, success, damage);
      const status: 'success' | 'failure' | 'error' = success ? 'success' : 'failure';

      // Map errorKind from audit.result.error when status=failure
      let errorKind: ActionErrorKindValue | undefined;
      if (!success) {
        const errStr = typedAudit.result.error ?? '';
        errorKind = mapErrorToKind(typeof errStr === 'string' ? errStr : '');
      }

      // Resolve recipient user ID (T-08-02 — required field on ActionResultPayloadSchema)
      const recipientUserId = resolveRecipientUserId(m, typedAudit);

      // Build and emit the ActionResultPayload
      const payload: ActionResultPayload = {
        idempotencyKey: typedAudit.idempotencyKey,
        toolId: typedAudit.tool as ToolId,
        d20,
        outcome,
        damage,
        status,
        errorKind,
        recipientUserId,
      };

      emit(payload);
    } catch (err) {
      // Defensive: swallow ALL throws — a result-watcher error must NEVER
      // interrupt the Foundry session or the hook chain.
      // console.warn is allowed per biome.jsonc noConsole allow:[error,warn]
      console.warn('[action-result-watcher] hook handler threw', err);
    }
    // NEVER return false — TypeScript void return type enforces this
  });

  // Return unsubscribe closure
  return (): void => {
    Hooks.off(hookId);
  };
}
