/**
 * @evf/foundry-module — socketlib GM-side handler registrations.
 *
 * Registers the two original handlers (Plan 02) PLUS five new snapshot-read handlers
 * (Plan 05 — M-1 gap fix) that bridge REST routes call via socketlib.executeAsGM.
 * Also registers 7 write-path stub handlers (Plan 03-04 — ADR-0003 Tool Registry).
 * Phase 13 ACT-04 adds 3 reaction handlers (count = 17).
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
 * from Foundry game state via the bridge to go through `socketlib.executeAsGM`.
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
import { getCharacterSnapshot, listPlayerCharacters } from '../readers/character-reader.js';
import { getCombatSnapshot } from '../readers/combat-reader.js';
import { getEventLog } from '../readers/event-log-reader.js';
import { getSceneViewport } from '../readers/scene-reader.js';
import type { ToolId, ToolResult } from '../write-path/tool-registry.js';
import { dispatchTool } from '../write-path/tool-registry.js';
import { revokeBearer, validateBearer } from './bearer-registry.js';

// ─── Handler implementations ─────────────────────────────────────────────────

/**
 * Validates a bearer token and returns the validation result.
 *
 * Input guard (T-02-04): non-string inputs return `{ valid: false, reason: "invalid_input" }`
 * without touching the registry.
 *
 * @param token - The raw bearer token string to validate
 * @returns Serializable validation result
 */
function handleValidateToken(token: unknown): { valid: boolean; reason?: string } {
  if (typeof token !== 'string') {
    return { valid: false, reason: 'invalid_input' };
  }

  const result = validateBearer(token);
  // Return a plain serializable object (no BearerEntry reference — bearer values never leak)
  if (result.valid) {
    return { valid: true };
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
 * @returns `{ success: true }` on success (including no-op for unknown tokens)
 */
function handleRevokeToken(tokenId: unknown): { success: boolean; reason?: string } {
  if (typeof tokenId !== 'string') {
    return { success: false, reason: 'invalid_input' };
  }

  revokeBearer(tokenId);
  return { success: true };
}

// ─── Snapshot reader handlers (Plan 05 — M-1 gap fix) ────────────────────────

/**
 * Returns a CharacterSnapshot for the given actorId, or null.
 *
 * Token validation: handler validates token before touching game state (T-02-04).
 * Returns null for unknown tokens OR actors not found/not PC.
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
  if (!validation.valid) {
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
 * Returns a list of all player characters in the world.
 *
 * Used by bridge `GET /v1/characters?world=` for wizard Step 3 character picker.
 *
 * @param _worldId - World ID (currently unused — single-world MVP)
 * @param token    - Bearer token for validation
 */
function handleListCharacters(
  _worldId: unknown,
  token: unknown,
): ReturnType<typeof listPlayerCharacters> {
  if (typeof token !== 'string') {
    return [];
  }
  const validation = validateBearer(token);
  if (!validation.valid) {
    return [];
  }
  return listPlayerCharacters();
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
 * Creates a thin dispatchTool adapter for a given ToolId.
 *
 * Each of the 4 replaced handlers uses this factory to:
 * 1. Validate the raw socketlib input shape (invalid_input guard)
 * 2. Call dispatchTool with the correct ToolId and payload
 * 3. Return the ToolResult (passed through to socketlib caller)
 *
 * The adapter is `async` because dispatchTool is async (idempotency cache + audit log).
 *
 * @param toolId - The ToolId to dispatch (passed as literal by each handler below)
 * @returns Async socketlib handler function
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts (dispatchTool)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 2
 */
function makeDispatchAdapter(
  toolId: ToolId,
): (input: unknown) => Promise<ToolResult | { success: false; error: 'invalid_input' }> {
  return async (
    input: unknown,
  ): Promise<ToolResult | { success: false; error: 'invalid_input' }> => {
    const payload = validateToolPayload(input);
    if (payload === null) {
      return { success: false, error: 'invalid_input' };
    }
    return dispatchTool(toolId, payload);
  };
}

// ─── Plan 07-02: 4 replaced socketlib handlers (in-place stub replacement) ────
//
// The 4 stubs from Plan 03-04 are REPLACED IN-PLACE here.
// Registration call sites below remain identical — ONLY the handler function
// bodies change. The total registerComplexHandler count stays 14.
//
// ADR-0011 single-workflow-origin discipline: each handler calls dispatchTool
// which routes to the appropriate ToolHandler registered in TOOL_REGISTRY
// (populated by the side-effect import in module.ts).
//
// Pitfall 5 (no_gm_connected): dispatchTool catches errors and normalises
// them — the adapter propagates the ToolResult as-is.
// Pitfall 7 (handler count): no NEW registrations below — count stays 14.

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
// Phase 13 INVARIANT: registerComplexHandler count = 17.
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
 * Must be called inside the `Hooks.once("ready")` callback — AFTER socketlib
 * has loaded and initialised its global. Calling before "ready" will throw
 * because `socketlib` is not yet available.
 *
 * The "ready" hook is the canonical registration point for socketlib handlers
 * (verified: `farling42/foundryvtt-socketlib` README — handlers must be registered
 * before any `executeAsGM` call, and socketlib is guaranteed available on "ready").
 *
 * @example
 * ```ts
 * Hooks.once('ready', () => {
 *   registerSocketlibHandlers();
 * });
 * ```
 *
 * @see https://github.com/farling42/foundryvtt-socketlib
 * @see packages/foundry-module/src/module.ts (registration call site)
 */
export function registerSocketlibHandlers(): void {
  // Plan 02 handlers — bearer token validation + revocation
  socketlib.registerComplexHandler(MODULE_ID, 'evf.validateToken', handleValidateToken);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.revokeToken', handleRevokeToken);

  // Plan 05 handlers — snapshot reads (M-1 gap fix per 02-PLAN-CHECK.md)
  socketlib.registerComplexHandler(
    MODULE_ID,
    'evf.getCharacterSnapshot',
    handleGetCharacterSnapshot,
  );
  socketlib.registerComplexHandler(MODULE_ID, 'evf.getCombatSnapshot', handleGetCombatSnapshot);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.getSceneViewport', handleGetSceneViewport);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.getEventLog', handleGetEventLog);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.listCharacters', handleListCharacters);

  // Plan 07-02 + 07-03: 6 real handlers (replaced in-place — no new registrations, count stays 14)
  // Each adapter validates input shape → calls dispatchTool → returns ToolResult.
  // ADR-0011 single-workflow-origin discipline; CI Gate 8: no activity.use() here.
  socketlib.registerComplexHandler(MODULE_ID, 'evf.castSpell', handleCastSpell);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.weaponAttack', handleWeaponAttack);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.useItem', handleUseItem);
  // Plan 07-03: 'evf.skillCheck' stub slot renamed → 'evf.confirmTemplatePlacement' (count stays 14)
  socketlib.registerComplexHandler(
    MODULE_ID,
    'evf.confirmTemplatePlacement',
    handleConfirmTemplatePlacement,
  );
  socketlib.registerComplexHandler(MODULE_ID, 'evf.moveToken', handleMoveToken);
  // Plan 07-03: placeTemplate stub replaced with real handler (placeTemplateHandler)
  socketlib.registerComplexHandler(MODULE_ID, 'evf.placeTemplate', handlePlaceTemplate);
  // Plan 07-05: 'evf.setTargets' stub renamed → 'evf.dropConcentration' real handler (count was 14)
  socketlib.registerComplexHandler(MODULE_ID, 'evf.dropConcentration', handleDropConcentration);

  // Phase 13 ACT-04: 3 new reaction handlers — count FLIPS to 17 (Plan 13-01 INVARIANT)
  socketlib.registerComplexHandler(MODULE_ID, 'evf.castShield', handleCastShield);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.castCounterspell', handleCastCounterspell);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.opportunityAttack', handleOpportunityAttack);
}
