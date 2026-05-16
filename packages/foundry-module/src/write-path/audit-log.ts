/**
 * GM-side audit log writer for the EVF write path.
 *
 * Every `dispatchTool` call (successful or failed) writes a hidden Foundry
 * `ChatMessage` visible only to GM users (`whisper: gmIds`). This provides:
 * - **T-07-04 mitigation:** Players cannot read or edit GM-only audit entries.
 * - **T-07-06 mitigation (repudiation):** Every action is logged with
 *   `idempotencyKey + actorId + timestamp + bearer_id` for GM-side audit.
 * - **T-02-01 carry-forward:** `bearer_id` is `sha256(bearer).slice(0,8)` —
 *   NEVER the full bearer token.
 *
 * The audit message is queryable in Foundry's chat log via:
 * `flags.evf.audit` filter (GM-only Foundry chat search).
 *
 * # Fault tolerance
 *
 * `writeAuditLog` wraps `ChatMessage.create()` in a try/catch. If Foundry's
 * socket layer fails (network hiccup, GM disconnect), the audit write failure
 * is logged to `console.warn` but does NOT propagate — tool dispatch must not
 * fail because the audit log fails. The action has already been committed.
 *
 * @see foundry-globals.d.ts (ChatMessage.create + game.users declarations)
 * @see packages/foundry-module/src/write-path/tool-registry.ts (dispatchTool consumer)
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 2
 */
import type { ToolResult } from './tool-registry.js';

// ─── AuditEntry ───────────────────────────────────────────────────────────────

/**
 * Structured audit entry stored in `ChatMessage.flags.evf.audit`.
 *
 * Fields are designed for GM-side searchability in Foundry's chat filter.
 *
 * Security note: `bearer_id` MUST be `sha256(bearer).slice(0,8)` — the first
 * 8 hex chars of the bearer hash. The full token must never appear here (T-02-01).
 *
 * @see dispatchTool in tool-registry.ts (constructs this entry from bearerHash)
 */
export interface AuditEntry {
  /** Tool ID that was dispatched (e.g. 'cast-spell'). */
  tool: string;
  /** Raw args payload as received by dispatchTool (before argsSchema validation). */
  payload: unknown;
  /** UUID v4 idempotency key from the tool invocation envelope. */
  idempotencyKey: string;
  /**
   * Foundry actor document ID of the acting character, or null if not determinable.
   * Extracted defensively from `args.actor_id` (if present) by `extractActorId`.
   */
  actorId: string | null;
  /** Tool execution result (success or failure). */
  result: ToolResult;
  /** `Date.now()` ms timestamp at audit-write time. */
  timestamp: number;
  /**
   * First 8 hex characters of `sha256(bearer)` — identifies the session without
   * exposing the full token (T-02-01 carry-forward from Phase 3 threat model).
   */
  bearer_id: string;
  /**
   * Optional attack ID for multi-attack weapon-attack sequences (Plan 09-01).
   *
   * Present only when the handler result carries `data.attackId` (i.e., the
   * `weapon-attack` handler's Path B loop return value). Omitted (undefined, not
   * null) for all other tools — absence is intentional, not an error.
   *
   * Used by `combat-action-tracker.ts` (Plan 09-01 Task 2) to dedupe multi-attack
   * chat-cards: multiple cards with the same `attackId + actorId` composite count
   * as ONE Action consumption (T-09-02 mitigation, T-09-04 repudiation fix).
   *
   * @see T-09-04 — repudiation: audit entry must include attackId so tracker can dedup.
   * @see packages/foundry-module/src/write-path/handlers/weapon-attack.ts (attackId source)
   * @see packages/foundry-module/src/write-path/combat-action-tracker.ts (consumer)
   */
  attackId?: string;
}

// ─── writeAuditLog ────────────────────────────────────────────────────────────

/**
 * Writes an audit log entry as a GM-only Foundry ChatMessage.
 *
 * Implementation:
 * 1. Build `gmIds` by filtering `game.users.contents` for `u.isGM === true`.
 * 2. Call `ChatMessage.create({ whisper: gmIds, flags: { evf: { audit: entry } } })`.
 * 3. On rejection: `console.warn` + swallow (never throws — T-02-01 belt-and-suspenders).
 *
 * @param entry - The structured audit entry to store.
 * @returns Promise<void> — always resolves, never rejects.
 *
 * @example
 * ```ts
 * await writeAuditLog({
 *   tool: 'cast-spell',
 *   payload: { actorId: 'actor1', spellId: 'fireball' },
 *   idempotencyKey: '00000000-0000-4000-8000-000000000001',
 *   actorId: 'actor1',
 *   result: { success: true, data: { rolled: true } },
 *   timestamp: Date.now(),
 *   bearer_id: 'abcd1234',  // sha256(bearer).slice(0,8)
 * });
 * ```
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  // Build GM-only whisper list from the current user collection.
  // game.users.contents is iterable (FoundryCollection<FoundryUser> per foundry-globals.d.ts).
  const gmIds = game.users.contents.filter((u) => u.isGM).map((u) => u.id);

  // CR-02: If no GMs are online, skip the write entirely.
  // `ChatMessage.create({ whisper: [] })` is PUBLIC in Foundry — an empty whisper array
  // means "not whispered", i.e., every connected player can read it. This would expose
  // `idempotencyKey`, `actorId`, `bearer_id`, and the full `payload` to all players,
  // violating T-07-04 (players must not read audit entries).
  // Skipping is preferable to leaking sensitive data; the action has already committed.
  if (gmIds.length === 0) {
    console.warn(
      '[EVF] writeAuditLog: no GMs connected — skipping audit write to prevent public exposure',
      {
        tool: entry.tool,
        idempotencyKey: entry.idempotencyKey,
      },
    );
    return;
  }

  try {
    await ChatMessage.create({
      user: game.user?.id ?? '',
      whisper: gmIds,
      speaker: { alias: 'EVF Audit' },
      // Hidden HTML wrapper — the content is not meant for display; flags carry the structured data
      content: `<div class="evf-audit" style="display:none">${JSON.stringify(entry)}</div>`,
      flags: {
        evf: {
          audit: entry,
        },
      },
    });
  } catch (err) {
    // Audit failure must NEVER fail the tool dispatch (T-02-01 belt-and-suspenders).
    // Log at warn level so GMs can diagnose socket issues without breaking the action.
    console.warn('[EVF] writeAuditLog: ChatMessage.create failed — action was already committed', {
      tool: entry.tool,
      idempotencyKey: entry.idempotencyKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
