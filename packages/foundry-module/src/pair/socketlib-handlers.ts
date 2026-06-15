/**
 * @evf/foundry-module — socketlib GM-side handler registrations.
 *
 * Registers the two original handlers (Plan 02) PLUS five new snapshot-read handlers
 * (Plan 05 — M-1 gap fix) that bridge REST routes invoke via the socket's executeAsGM.
 * Also registers 7 write-path stub handlers (Plan 03-04 — ADR-0003 Tool Registry).
 * Phase 13 ACT-04 adds 3 reaction handlers (count = 17).
 *
 * Quick Task 260604-lg4: uses the REAL socketlib API —
 * `socketlib.registerModule(MODULE_ID)` returns a module-scoped socket, then each
 * handler is registered with `socket.register(name, fn)` (NO moduleId argument).
 * The previously-used `registerComplexHandler` global method did not exist in the
 * real library and threw at runtime. Registration happens on socketlib's
 * `socketlib.ready` hook (see module.ts), NOT inside Foundry's `ready` hook.
 *
 * All handlers (17 total — Phase 13 INVARIANT FLIP: 14 → 17):
 * - `evf.validateToken`      — validates a bearer token (Plan 02)
 * - `evf.revokeToken`        — revokes a bearer token (Plan 02)
 * - `evf.getCharacterSnapshot` — returns CharacterSnapshot | null (Plan 05)
 * - `evf.getCombatSnapshot`    — returns CombatSnapshot | null (Plan 05)
 * - `evf.getSceneViewport`     — returns SceneViewport (Plan 05)
 * - `evf.getEventLog`          — returns EventLogEntry[] paginated by since/limit (Plan 05)
 * - `evf.listCharacters`       — returns all PC actors (Plan 05, wizard Step 3)
 * - `evf.castSpell`                  — Plan 07-02 real handler (castSpellHandler)
 * - `evf.weaponAttack`               — Plan 07-02 real handler (weaponAttackHandler)
 * - `evf.useItem`                    — Plan 07-02 real handler (useItemHandler)
 * - `evf.confirmTemplatePlacement`   — Plan 07-03 real handler (confirmTemplatePlacementHandler)
 * - `evf.moveToken`                  — Plan 07-02 real handler (moveTokenHandler)
 * - `evf.placeTemplate`              — Plan 07-03 real handler (placeTemplateHandler)
 * - `evf.dropConcentration`          — Plan 07-05 real handler (dropConcentrationHandler) replacing evf.setTargets stub
 * - `evf.castShield`                 — Plan 13-01 ACT-04 reaction (castShieldHandler)
 * - `evf.castCounterspell`           — Plan 13-01 ACT-04 reaction (castCounterspellHandler)
 * - `evf.opportunityAttack`          — Plan 13-01 ACT-04 reaction (opportunityAttackHandler)
 *
 * The single-workflow-origin discipline (Phase 0 D-15 Option A) requires ALL reads
 * from Foundry game state via the bridge to go through the socket's `executeAsGM`.
 *
 * T-03-14 [HIGH] boundary: the 7 Plan 03-04 stub handlers MUST NOT call any write API.
 * They return a literal `{ status: 'phase-07-pending' }` object only.
 *
 * Security (T-02-04): all read handlers validate token before touching any game state.
 * Handler returns null / empty result for invalid tokens rather than throwing.
 *
 * @see 02-02-PLAN.md Task 2 (original handlers)
 * @see 02-05-PLAN.md Task 2 (M-1 fix — 5 snapshot handlers added here)
 * @see 03-04-PLAN.md Task 2 (7 ADR-0003 Tool Registry stub handlers)
 * @see 02-CONTEXT.md D-2.12 (socketlib executeAsGM bridge→Foundry communication)
 * @see packages/foundry-module/src/pair/bearer-registry.ts (validateBearer, revokeBearer)
 * @see packages/foundry-module/src/readers/ (snapshot reader functions)
 */

import { MODULE_ID } from '../module.js';
import { getCharacterSnapshot, listPlayerCharactersForUser } from '../readers/character-reader.js';
import { getCombatSnapshot } from '../readers/combat-reader.js';
import { getEventLog } from '../readers/event-log-reader.js';
import { getSceneViewport } from '../readers/scene-reader.js';
import { writeAuditLog } from '../write-path/audit-log.js';
import { hashBearer } from '../write-path/idempotency-cache.js';
import type { ToolId, ToolResult } from '../write-path/tool-registry.js';
import { dispatchTool } from '../write-path/tool-registry.js';
import { authorizedActorIdsForUser } from './actor-authorization.js';
import { revokeBearer, validateBearer } from './bearer-registry.js';

// ─── Module-scoped socket holder (Quick Task 260604-lg4) ──────────────────────

/**
 * The module-scoped socketlib socket, resolved by `registerSocketlibHandlers()`
 * via `socketlib.registerModule(MODULE_ID)`. Null until registration runs.
 *
 * @see getEvfSocket
 */
let evfSocket: SocketlibSocket | null = null;

/**
 * Returns the module-scoped socketlib socket, or null before registration.
 *
 * Exposed for correctness so any future module-side caller invokes a GM handler
 * via the REAL API (`getEvfSocket()?.executeAsGM(name, ...args)`) rather than a
 * fictional `socketlib.executeAsGM(moduleId, ...)` global. The module side does
 * NOT call `executeAsGM` today (dispatchTool runs in GM context); the bridge
 * package owns the real call sites.
 *
 * @returns The resolved {@link SocketlibSocket}, or null if registration has not run
 */
export function getEvfSocket(): SocketlibSocket | null {
  return evfSocket;
}

// ─── Handler implementations ─────────────────────────────────────────────────

/**
 * Result shape of the `evf.validateToken` handler.
 *
 * On success (`valid: true`) the result carries the bearer's bound Foundry user
 * identity and the live owned-actor set (ADR-0014). The bridge caches
 * `entry.userId` + `authorizedActorIds` (the {@link BearerAuthorization} contract)
 * and enforces set-membership on every read path. Bearer token values are NEVER
 * included in the result (T-02-01) — only the bound user id and authorized actors.
 *
 * @see packages/shared-protocol/src/payloads/bearer-registry.ts (BearerAuthorization)
 */
export interface ValidateTokenResult {
  valid: boolean;
  reason?: string;
  /**
   * Present only when `valid` is true. Carries the bound Foundry user id
   * (ADR-0014). The token value itself is never included.
   */
  entry?: { userId: string };
  /**
   * Present only when `valid` is true. Live set of actor ids the bound user
   * OWNs, computed by Foundry at validation time. May be empty (authorizes no
   * actors — e.g. a user that owns nothing, or a fail-closed legacy bearer).
   */
  authorizedActorIds?: string[];
}

/**
 * Validates a bearer token and returns the validation result.
 *
 * Input guard (T-02-04): non-string inputs return `{ valid: false, reason: "invalid_input" }`
 * without touching the registry.
 *
 * On success (ADR-0014): also returns `entry.userId` (the bound Foundry user) and
 * `authorizedActorIds` — the live set of actor ids that user OWNs, computed by
 * Foundry via `actor.testUserPermission(user, "OWNER")`. The bridge consumes these
 * to enforce per-actor read authorization. Fail-closed: an unknown/missing user
 * yields an empty `authorizedActorIds` (authorizes nothing).
 *
 * @param token - The raw bearer token string to validate
 * @returns Serializable validation result (see {@link ValidateTokenResult})
 */
function handleValidateToken(token: unknown): ValidateTokenResult {
  if (typeof token !== 'string') {
    return { valid: false, reason: 'invalid_input' };
  }

  const result = validateBearer(token);
  if (result.valid && result.entry !== undefined) {
    // ADR-0014: bind the bearer to its Foundry user + live owned-actor set.
    // Bearer token value is NEVER leaked — only the bound userId + authorized actors.
    const userId = result.entry.userId;
    return {
      valid: true,
      entry: { userId },
      authorizedActorIds: authorizedActorIdsForUser(userId),
    };
  }
  // exactOptionalPropertyTypes: only include 'reason' key when it has a defined value
  const reason = result.reason;
  return reason !== undefined ? { valid: false, reason } : { valid: false };
}

/**
 * Revokes a bearer token from the Foundry-authoritative registry.
 *
 * Input guard (T-02-04): non-string inputs return `{ success: false, reason: "invalid_input" }`
 * without touching the registry.
 *
 * @param tokenId - The raw bearer token string to revoke
 * @returns A promise resolving to `{ success: true }` on success (including the
 *          no-op for unknown tokens), once the revocation write has persisted.
 */
async function handleRevokeToken(tokenId: unknown): Promise<{ success: boolean; reason?: string }> {
  if (typeof tokenId !== 'string') {
    return { success: false, reason: 'invalid_input' };
  }

  // revokeBearer is async (awaits the Foundry settings write); await it so the
  // socketlib caller's promise resolves only after the revocation is persisted.
  await revokeBearer(tokenId);
  return { success: true };
}

// ─── Snapshot reader handlers (Plan 05 — M-1 gap fix) ────────────────────────

/**
 * Returns a CharacterSnapshot for the given actorId, or null.
 *
 * Token validation: handler validates token before touching game state (T-02-04).
 * Returns null for unknown tokens OR actors not found/not PC.
 *
 * ADR-0014 (defence in depth): after validating the token, re-checks that
 * `actorId` is in the bound user's live owned-actor set
 * (`actor.testUserPermission(user, "OWNER")`). The Foundry handler is the last
 * line of defence even if the bridge cache is stale — a token bound to a user
 * who does not OWN `actorId` is denied (returns null), preventing cross-player
 * character data disclosure (T8).
 *
 * @param actorId - Foundry actor document ID
 * @param token   - Bearer token for validation (passed by bridge route)
 */
function handleGetCharacterSnapshot(
  actorId: unknown,
  token: unknown,
): ReturnType<typeof getCharacterSnapshot> {
  if (typeof actorId !== 'string' || typeof token !== 'string') {
    return null;
  }
  const validation = validateBearer(token);
  if (!validation.valid || validation.entry === undefined) {
    return null;
  }
  // ADR-0014 defence in depth: deny unless the bound user OWNs this actor.
  const authorized = authorizedActorIdsForUser(validation.entry.userId);
  if (!authorized.includes(actorId)) {
    return null;
  }
  return getCharacterSnapshot(actorId);
}

/**
 * Returns the active CombatSnapshot, or null if no combat is active.
 *
 * @param token - Bearer token for validation
 */
function handleGetCombatSnapshot(token: unknown): ReturnType<typeof getCombatSnapshot> {
  if (typeof token !== 'string') {
    return null;
  }
  const validation = validateBearer(token);
  if (!validation.valid) {
    return null;
  }
  return getCombatSnapshot();
}

/**
 * Returns the current SceneViewport snapshot.
 *
 * @param token - Bearer token for validation
 */
function handleGetSceneViewport(token: unknown): ReturnType<typeof getSceneViewport> | null {
  if (typeof token !== 'string') {
    return null;
  }
  const validation = validateBearer(token);
  if (!validation.valid) {
    return null;
  }
  return getSceneViewport();
}

/**
 * Returns event log entries with seq > since, capped at limit.
 *
 * @param since - Exclusive lower bound on seq (use 0 for all)
 * @param limit - Maximum entries to return (capped at 200)
 * @param token - Bearer token for validation
 */
function handleGetEventLog(
  since: unknown,
  limit: unknown,
  token: unknown,
): ReturnType<typeof getEventLog> {
  if (typeof token !== 'string') {
    return [];
  }
  const validation = validateBearer(token);
  if (!validation.valid) {
    return [];
  }
  const sinceCursor = typeof since === 'number' ? since : 0;
  const limitVal = typeof limit === 'number' ? limit : 200;
  return getEventLog(sinceCursor, limitVal);
}

/**
 * Returns the player-character roster scoped to the bearer's bound user (ADR-0014).
 *
 * Used by bridge `GET /v1/characters?world=` for wizard Step 3 character picker.
 *
 * After validating the token, filters the roster to actors the bound user OWNs
 * (`actor.testUserPermission(user, "OWNER")`) via {@link listPlayerCharactersForUser}.
 * A device therefore only ever sees its own user's characters — selection UI can no
 * longer enumerate other players' actors (T8). Fail-closed: a bearer whose user owns
 * nothing yields an empty roster.
 *
 * @param _worldId - World ID (currently unused — single-world MVP)
 * @param token    - Bearer token for validation
 */
function handleListCharacters(
  _worldId: unknown,
  token: unknown,
): ReturnType<typeof listPlayerCharactersForUser> {
  if (typeof token !== 'string') {
    return [];
  }
  const validation = validateBearer(token);
  if (!validation.valid || validation.entry === undefined) {
    return [];
  }
  // ADR-0014: scope the roster to the bound user's owned actors.
  const authorized = authorizedActorIdsForUser(validation.entry.userId);
  return listPlayerCharactersForUser(authorized);
}

// ─── Plan 07-02: tool dispatch input shape guard ──────────────────────────────

/**
 * Validates that the handler input has the expected shape for a tool invocation.
 *
 * All 4 replaced tool handlers (castSpell, weaponAttack, useItem, moveToken) accept
 * a payload object with `{ args: unknown, idempotencyKey: string, bearer: string }`.
 * If the input does not match this shape, the handler returns `invalid_input` without
 * touching any game state (T-07-02-01: input shape guard before dispatchTool).
 *
 * @param input - Raw input from socketlib (untrusted)
 * @returns Typed payload on success, null on shape mismatch
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 2 (T-07-02-01)
 */
function validateToolPayload(
  input: unknown,
): { args: unknown; idempotencyKey: string; bearer: string } | null {
  if (input === null || typeof input !== 'object') {
    return null;
  }
  const obj = input as Record<string, unknown>;
  if (
    !('args' in obj) ||
    typeof obj.idempotencyKey !== 'string' ||
    typeof obj.bearer !== 'string'
  ) {
    return null;
  }
  return {
    args: obj.args,
    idempotencyKey: obj.idempotencyKey,
    bearer: obj.bearer,
  };
}

/**
 * Constant error code returned when the bearer's bound user does not OWN the
 * acting `args.actor_id` of a write tool (ADR-0014 Amendment 1).
 *
 * Constant-shape (T-07-02-03 discipline carried into the write-authz gate): the
 * value never leaks game-state info — a caller cannot distinguish "actor does not
 * exist" from "actor exists but you do not own it", preventing actor enumeration.
 */
const NOT_AUTHORIZED = 'not_authorized' as const;

/**
 * Extracts the ACTING actor id from raw write-tool args (ADR-0014 Amendment 1).
 *
 * The write-path convention (verified across every handler) is that `args.actor_id`
 * is the actor PERFORMING the action — the player's own PC. This is distinct from
 * `args.targets` (token ids the action is aimed at), which may legitimately be
 * NON-owned (e.g. attacking a monster). The write-authz gate therefore checks the
 * acting actor ONLY and never touches `args.targets`.
 *
 * Tools without an acting `args.actor_id` — `move-token` (`token_id`) and
 * `confirm-template-placement` (`placementId`; the acting actor was already
 * authorized at `place-template` time) — yield `null` here and are unaffected by
 * the gate (the caller treats `null` as "no acting actor to authorize").
 *
 * @param args - Raw, not-yet-validated tool args object.
 * @returns The acting `actor_id` string, or `null` when the field is absent / non-string.
 */
function extractActingActorId(args: unknown): string | null {
  if (args === null || typeof args !== 'object' || !('actor_id' in args)) {
    return null;
  }
  const value = (args as Record<string, unknown>).actor_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Authorizes a write tool's ACTING actor against the bearer's owned-actor set.
 *
 * ADR-0014 Amendment 1 (write-path authorization) — Foundry-side authoritative
 * enforcement. Write tools run in GM context via `socket.executeAsGM`, which
 * bypasses Foundry's per-actor ownership; without this gate a player could invoke
 * a write tool acting AS another player's PC by supplying a foreign `args.actor_id`.
 *
 * Behaviour:
 * - No acting `args.actor_id` (e.g. `move-token`, `confirm-template-placement`) →
 *   authorized (the gate does not apply; `null` acting actor).
 * - Invalid / unknown bearer → DENIED (fail-closed). A non-validatable token never
 *   reaches a write.
 * - Acting `args.actor_id` NOT in the bound user's live owned set
 *   (`actor.testUserPermission(user, "OWNER")` via {@link authorizedActorIdsForUser})
 *   → DENIED. TARGETS are intentionally NOT consulted.
 * - Otherwise → authorized.
 *
 * On denial an audit-log entry is written (best-effort, fault-tolerant) so denied
 * writes are observable; the bearer is hashed (never logged raw, T-02-01).
 *
 * @param toolId  - The ToolId being dispatched (recorded in the denied-write audit entry).
 * @param payload - Validated tool payload (`{ args, idempotencyKey, bearer }`).
 * @returns `true` when the acting actor is authorized (or there is none); `false` to deny.
 */
async function isActingActorAuthorized(
  toolId: ToolId,
  payload: { args: unknown; idempotencyKey: string; bearer: string },
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
 * Creates a thin dispatchTool adapter for a given ToolId.
 *
 * Each of the 4 replaced handlers uses this factory to:
 * 1. Validate the raw socketlib input shape (invalid_input guard)
 * 2. Authorize the ACTING `args.actor_id` against the bearer's owned set
 *    (ADR-0014 Amendment 1 — `not_authorized` on deny, BEFORE any write)
 * 3. Call dispatchTool with the correct ToolId and payload
 * 4. Return the ToolResult (passed through to socketlib caller)
 *
 * The adapter is `async` because dispatchTool is async (idempotency cache + audit log).
 *
 * @param toolId - The ToolId to dispatch (passed as literal by each handler below)
 * @returns Async socketlib handler function
 *
 * @see packages/foundry-module/src/pair/actor-authorization.ts (authorizedActorIdsForUser)
 * @see docs/architecture/0014-bearer-actor-authorization.md (Amendment 1)
 * @see packages/foundry-module/src/write-path/tool-registry.ts (dispatchTool)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 2
 */
function makeDispatchAdapter(
  toolId: ToolId,
): (
  input: unknown,
) => Promise<ToolResult | { success: false; error: 'invalid_input' | typeof NOT_AUTHORIZED }> {
  return async (
    input: unknown,
  ): Promise<ToolResult | { success: false; error: 'invalid_input' | typeof NOT_AUTHORIZED }> => {
    const payload = validateToolPayload(input);
    if (payload === null) {
      return { success: false, error: 'invalid_input' };
    }
    // ADR-0014 Amendment 1: authoritative per-actor write authorization. The
    // acting actor (`args.actor_id`) must be OWNED by the bearer's bound user;
    // TARGETS (`args.targets`) are intentionally excluded. Denied → no dispatch.
    if (!(await isActingActorAuthorized(toolId, payload))) {
      return { success: false, error: NOT_AUTHORIZED };
    }
    return dispatchTool(toolId, payload);
  };
}

// ─── Plan 07-02: 4 replaced socketlib handlers (in-place stub replacement) ────
//
// The 4 stubs from Plan 03-04 are REPLACED IN-PLACE here.
// Registration call sites below remain identical — ONLY the handler function
// bodies change. The total socket.register count stays 17 (Phase 13 invariant).
//
// ADR-0011 single-workflow-origin discipline: each handler calls dispatchTool
// which routes to the appropriate ToolHandler registered in TOOL_REGISTRY
// (populated by the side-effect import in module.ts).
//
// Pitfall 5 (no_gm_connected): dispatchTool catches errors and normalises
// them — the adapter propagates the ToolResult as-is.
// Pitfall 7 (handler count): no NEW registrations below — count stays 17.

/**
 * castSpell socketlib handler — Plan 07-02 replacement of Plan 03-04 stub.
 *
 * Validates payload shape, calls dispatchTool('cast-spell', payload).
 * Returns ToolResult from the castSpellHandler (registered in handlers/index.ts).
 *
 * ADR-0011: single-workflow-origin; CI Gate 8: no activity.use() in this file.
 *
 * @see packages/foundry-module/src/write-path/handlers/cast-spell.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 2
 */
const handleCastSpell = makeDispatchAdapter('cast-spell');

/**
 * weaponAttack socketlib handler — Plan 07-02 replacement of Plan 03-04 stub.
 *
 * Validates payload shape, calls dispatchTool('weapon-attack', payload).
 * Returns ToolResult from the weaponAttackHandler (single attack path; multi-attack in 07-04).
 *
 * ADR-0011: single-workflow-origin; CI Gate 8: no activity.use() in this file.
 *
 * @see packages/foundry-module/src/write-path/handlers/weapon-attack.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 2
 */
const handleWeaponAttack = makeDispatchAdapter('weapon-attack');

/**
 * useItem socketlib handler — Plan 07-02 replacement of Plan 03-04 stub.
 *
 * Validates payload shape, calls dispatchTool('use-item', payload).
 * Returns ToolResult from the useItemHandler.
 *
 * ADR-0011: single-workflow-origin; CI Gate 8: no activity.use() in this file.
 *
 * @see packages/foundry-module/src/write-path/handlers/use-item.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 2
 */
const handleUseItem = makeDispatchAdapter('use-item');

/**
 * confirmTemplatePlacement socketlib handler — Plan 07-03 replacement of Plan 03-04 evf.skillCheck stub.
 *
 * Validates payload shape, calls dispatchTool('confirm-template-placement', payload).
 * Returns ToolResult from the confirmTemplatePlacementHandler (canvas.scene.createEmbeddedDocuments,
 * NOT activity.use). Slot renamed from 'evf.skillCheck' → 'evf.confirmTemplatePlacement'
 * in-place (count stays 14).
 *
 * ADR-0011: single-workflow-origin; CI Gate 8: no activity.use() in this file.
 *
 * @see packages/foundry-module/src/write-path/handlers/place-template.ts
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
 */
const handleConfirmTemplatePlacement = makeDispatchAdapter('confirm-template-placement');

/**
 * moveToken socketlib handler — Plan 07-02 replacement of Plan 03-04 stub.
 *
 * Validates payload shape, calls dispatchTool('move-token', payload).
 * Returns ToolResult from the moveTokenHandler (tokenDoc.update, NOT activity.use).
 *
 * ADR-0011: single-workflow-origin; CI Gate 8: no activity.use() in this file.
 *
 * @see packages/foundry-module/src/write-path/handlers/move-token.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 2
 */
const handleMoveToken = makeDispatchAdapter('move-token');

/**
 * placeTemplate socketlib handler — Plan 07-03 replacement of Plan 03-04 stub.
 *
 * Validates payload shape, calls dispatchTool('place-template', payload).
 * Returns ToolResult from the placeTemplateHandler (AbilityTemplate.fromActivity +
 * PLACEMENT_CONTEXTS storage, NOT activity.use / drawPreview).
 *
 * ADR-0011: single-workflow-origin; CI Gate 8: no activity.use() in this file.
 *
 * @see packages/foundry-module/src/write-path/handlers/place-template.ts
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
 */
const handlePlaceTemplate = makeDispatchAdapter('place-template');

/**
 * dropConcentration socketlib handler — Plan 07-05 replacement of Plan 03-04 evf.setTargets stub.
 *
 * Validates payload shape, calls dispatchTool('drop-concentration', payload).
 * Returns ToolResult from the dropConcentrationHandler (effect.delete(), NOT activity.use).
 * Slot renamed from 'evf.setTargets' → 'evf.dropConcentration' in-place (count stays 14).
 *
 * ADR-0011: single-workflow-origin; CI Gate 8: no activity.use() in this file.
 *
 * @see packages/foundry-module/src/write-path/handlers/drop-concentration.ts
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 2
 */
const handleDropConcentration = makeDispatchAdapter('drop-concentration');

// ─── Phase 13 ACT-04: 3 new reaction handlers (count FLIPS 14 → 17) ──────────
//
// Plan 13-01 ADDS three new handlers. These are NOT replacements — they are
// genuinely new registrations that increase the total count from 14 to 17.
// Phase 13 INVARIANT: socket.register count = 17.
//
// ADR-0011 single-workflow-origin discipline; CI Gate 8: no activity.use() here.
// T-13-04 mitigation: all three route through dispatchTool (bearer + audit log).

/**
 * castShield socketlib handler — Plan 13-01 ACT-04 reaction (new, count 15 of 17).
 *
 * Validates payload shape, calls dispatchTool('cast-shield', payload).
 * Returns ToolResult from the castShieldHandler (Shield spell, D-13-01).
 *
 * @see packages/foundry-module/src/write-path/handlers/cast-shield.ts
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 3
 */
const handleCastShield = makeDispatchAdapter('cast-shield');

/**
 * castCounterspell socketlib handler — Plan 13-01 ACT-04 reaction (new, count 16 of 17).
 *
 * Validates payload shape, calls dispatchTool('cast-counterspell', payload).
 * Returns ToolResult from the castCounterspellHandler (Counterspell, D-13-02).
 *
 * @see packages/foundry-module/src/write-path/handlers/cast-counterspell.ts
 */
const handleCastCounterspell = makeDispatchAdapter('cast-counterspell');

/**
 * opportunityAttack socketlib handler — Plan 13-01 ACT-04 reaction (new, count 17 of 17).
 *
 * Validates payload shape, calls dispatchTool('opportunity-attack', payload).
 * Returns ToolResult from the opportunityAttackHandler (melee OA, D-13-03).
 *
 * @see packages/foundry-module/src/write-path/handlers/opportunity-attack.ts
 */
const handleOpportunityAttack = makeDispatchAdapter('opportunity-attack');

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Registers all socketlib GM-side handlers.
 *
 * Must be called inside the `Hooks.once('socketlib.ready', ...)` callback —
 * `socketlib.ready` is the canonical registration point for socketlib handlers
 * (verified: `farling42/foundryvtt-socketlib` README — a module obtains its
 * socket via `socketlib.registerModule(moduleId)` and registers each handler on
 * that socket; this is guaranteed safe once `socketlib.ready` has fired).
 *
 * Quick Task 260604-lg4: uses the REAL API. First resolves the module-scoped
 * socket via `socketlib.registerModule(MODULE_ID)` (exactly once), then registers
 * each of the 17 handlers via `socket.register(name, fn)` (NO moduleId argument).
 * The old `registerComplexHandler` global method did not exist in the real
 * library and threw at runtime.
 *
 * @example
 * ```ts
 * Hooks.once('socketlib.ready', () => {
 *   registerSocketlibHandlers();
 * });
 * ```
 *
 * @see https://github.com/farling42/foundryvtt-socketlib
 * @see packages/foundry-module/src/module.ts (registration call site)
 */
export function registerSocketlibHandlers(): void {
  // Resolve the module-scoped socket once (Quick Task 260604-lg4).
  evfSocket = socketlib.registerModule(MODULE_ID);

  // Plan 02 handlers — bearer token validation + revocation
  evfSocket.register('evf.validateToken', handleValidateToken);
  evfSocket.register('evf.revokeToken', handleRevokeToken);

  // Plan 05 handlers — snapshot reads (M-1 gap fix per 02-PLAN-CHECK.md)
  evfSocket.register('evf.getCharacterSnapshot', handleGetCharacterSnapshot);
  evfSocket.register('evf.getCombatSnapshot', handleGetCombatSnapshot);
  evfSocket.register('evf.getSceneViewport', handleGetSceneViewport);
  evfSocket.register('evf.getEventLog', handleGetEventLog);
  evfSocket.register('evf.listCharacters', handleListCharacters);

  // Plan 07-02 + 07-03: 6 real handlers (replaced in-place — no new registrations, count stays 17)
  // Each adapter validates input shape → calls dispatchTool → returns ToolResult.
  // ADR-0011 single-workflow-origin discipline; CI Gate 8: no activity.use() here.
  evfSocket.register('evf.castSpell', handleCastSpell);
  evfSocket.register('evf.weaponAttack', handleWeaponAttack);
  evfSocket.register('evf.useItem', handleUseItem);
  // Plan 07-03: 'evf.skillCheck' stub slot renamed → 'evf.confirmTemplatePlacement' (count stays 17)
  evfSocket.register('evf.confirmTemplatePlacement', handleConfirmTemplatePlacement);
  evfSocket.register('evf.moveToken', handleMoveToken);
  // Plan 07-03: placeTemplate stub replaced with real handler (placeTemplateHandler)
  evfSocket.register('evf.placeTemplate', handlePlaceTemplate);
  // Plan 07-05: 'evf.setTargets' stub renamed → 'evf.dropConcentration' real handler
  evfSocket.register('evf.dropConcentration', handleDropConcentration);

  // Phase 13 ACT-04: 3 new reaction handlers — count FLIPS to 17 (Plan 13-01 INVARIANT)
  evfSocket.register('evf.castShield', handleCastShield);
  evfSocket.register('evf.castCounterspell', handleCastCounterspell);
  evfSocket.register('evf.opportunityAttack', handleOpportunityAttack);
}
