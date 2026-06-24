/**
 * Authoritative write-path entry point — ADR-0014 Amendment 1 per-actor authz + dispatch.
 *
 * This is the SINGLE place the write path enforces per-actor authorization before a
 * tool executes. Both write callers route through {@link dispatchToolAuthorized}:
 *
 *   - the socketlib `makeDispatchAdapter` (legacy bridge→Foundry channel), and
 *   - the Phase 8 poll-based `tool-invocation-poller` (the new reverse channel).
 *
 * Keeping the gate here (rather than inside one caller) guarantees the two paths
 * enforce IDENTICAL authorization: the acting `args.actor_id` must be OWNED by the
 * bearer's bound Foundry user; denial returns `{ success: false, error: 'not_authorized' }`
 * and writes a best-effort audit entry. TARGETS (`args.targets`) are intentionally
 * NEVER consulted — attacking a non-owned monster stays legal.
 *
 * # Why extracted from socketlib-handlers.ts
 *
 * `isActingActorAuthorized` was a private function inside `makeDispatchAdapter`. The
 * poll-based poller (which the bridge cannot route through socketlib) MUST run the
 * exact same gate. Extracting it here lets both callers share one implementation —
 * no duplication, no bypass.
 *
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts (makeDispatchAdapter — socketlib path)
 * @see packages/foundry-module/src/write-path/tool-invocation-poller.ts (poll path)
 * @see docs/architecture/0014-bearer-actor-authorization.md (Amendment 1)
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 */

import { authorizedActorIdsForUser } from '../pair/actor-authorization.js';
import { validateBearer } from '../pair/bearer-registry.js';
import { writeAuditLog } from './audit-log.js';
import { hashBearer } from './idempotency-cache.js';
import { dispatchTool, type ToolId, type ToolResult } from './tool-registry.js';

/**
 * Constant error code returned when the bearer's bound user does not OWN the acting
 * `args.actor_id` of a write tool (ADR-0014 Amendment 1).
 *
 * Constant-shape: the value never leaks game-state info — a caller cannot distinguish
 * "actor does not exist" from "actor exists but you do not own it" (no enumeration).
 */
export const NOT_AUTHORIZED = 'not_authorized' as const;

/**
 * Validated write-tool payload shape (`{ args, idempotencyKey, bearer }`).
 *
 * Identical to the `dispatchTool` payload, plus the bearer used for the authz gate.
 */
export interface AuthorizedToolPayload {
  /** Raw, not-yet-handler-validated tool args (`z.unknown()` at the wire layer). */
  args: unknown;
  /** UUID v4 idempotency key (bearer-bound key construction happens in dispatchTool). */
  idempotencyKey: string;
  /** Raw bearer token (hashed for the audit entry; resolved to the bound user for authz). */
  bearer: string;
}

/**
 * Extract the ACTING actor id from raw write-tool args (ADR-0014 Amendment 1).
 *
 * The write-path convention is that `args.actor_id` is the actor PERFORMING the
 * action (the player's own PC), distinct from `args.targets` (may be non-owned).
 * Tools without an acting actor — `move-token` (`token_id`) and
 * `confirm-template-placement` (`placementId`) — yield `null` and are unaffected.
 *
 * @param args - Raw, not-yet-validated tool args object.
 * @returns The acting `actor_id` string, or `null` when absent / non-string / empty.
 */
function extractActingActorId(args: unknown): string | null {
  if (args === null || typeof args !== 'object' || !('actor_id' in args)) {
    return null;
  }
  const value = (args as Record<string, unknown>).actor_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Authorize a write tool's ACTING actor against the bearer's owned-actor set.
 *
 * ADR-0014 Amendment 1 (write-path authorization) — Foundry-side authoritative
 * enforcement. Write tools run in GM context, which bypasses Foundry's per-actor
 * ownership; without this gate a player could invoke a write tool acting AS another
 * player's PC by supplying a foreign `args.actor_id`.
 *
 * Behaviour:
 * - No acting `args.actor_id` (e.g. `move-token`, `confirm-template-placement`) →
 *   authorized (the gate does not apply; `null` acting actor).
 * - Invalid / unknown bearer → DENIED (fail-closed).
 * - Acting `args.actor_id` NOT in the bound user's live owned set → DENIED.
 *   TARGETS are intentionally NOT consulted.
 * - Otherwise → authorized.
 *
 * On denial a best-effort, fault-tolerant audit-log entry is written (bearer hashed,
 * never logged raw — T-02-01).
 *
 * @param toolId  - The ToolId being dispatched (recorded in the denied-write audit entry).
 * @param payload - Validated tool payload (`{ args, idempotencyKey, bearer }`).
 * @returns `true` when the acting actor is authorized (or there is none); `false` to deny.
 */
export async function isActingActorAuthorized(
  toolId: ToolId,
  payload: AuthorizedToolPayload,
): Promise<boolean> {
  const actingActorId = extractActingActorId(payload.args);
  // Tools with no acting actor (move-token / confirm-template-placement) are unaffected.
  if (actingActorId === null) {
    return true;
  }

  // Resolve bearer → bound user → live owned-actor set (Foundry is authority).
  const validation = validateBearer(payload.bearer);
  const owned =
    validation.valid && validation.entry !== undefined
      ? authorizedActorIdsForUser(validation.entry.userId)
      : [];

  if (owned.includes(actingActorId)) {
    return true;
  }

  // Denied: write a best-effort audit entry so cross-actor write attempts are
  // observable. Fault-tolerant — an audit failure must never block the denial.
  try {
    const bearerHash = await hashBearer(payload.bearer);
    await writeAuditLog({
      tool: toolId,
      payload: payload.args,
      idempotencyKey: payload.idempotencyKey,
      actorId: actingActorId,
      result: { success: false, error: NOT_AUTHORIZED },
      timestamp: Date.now(),
      bearer_id: bearerHash.slice(0, 8), // T-02-01: never the full token
    });
  } catch {
    // writeAuditLog is internally fault-tolerant; this outer catch is a safety net.
  }
  return false;
}

/**
 * Authorize then dispatch a write tool — the single authoritative write entry point.
 *
 * Runs {@link isActingActorAuthorized} (ADR-0014 Amendment 1) and, only when it
 * passes, calls {@link dispatchTool}. Denied → `{ success: false, error: 'not_authorized' }`
 * WITHOUT dispatching (no write occurs). Both the socketlib adapter and the poll-based
 * poller call this, so the two paths enforce identical authorization.
 *
 * @param toolId  - The ToolId to dispatch (kebab-case).
 * @param payload - Validated tool payload (`{ args, idempotencyKey, bearer }`).
 * @returns The ToolResult from dispatchTool, or the `not_authorized` failure on deny.
 */
export async function dispatchToolAuthorized(
  toolId: ToolId,
  payload: AuthorizedToolPayload,
): Promise<ToolResult> {
  if (!(await isActingActorAuthorized(toolId, payload))) {
    return { success: false, error: NOT_AUTHORIZED };
  }
  return dispatchTool(toolId, payload);
}
