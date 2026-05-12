/**
 * @evf/foundry-module — socketlib GM-side handler registrations.
 *
 * Registers the two original handlers (Plan 02) PLUS five new snapshot-read handlers
 * (Plan 05 — M-1 gap fix) that bridge REST routes call via socketlib.executeAsGM.
 * Also registers 7 write-path stub handlers (Plan 03-04 — ADR-0003 Tool Registry).
 *
 * All handlers:
 * - `evf.validateToken`      — validates a bearer token (Plan 02)
 * - `evf.revokeToken`        — revokes a bearer token (Plan 02)
 * - `evf.getCharacterSnapshot` — returns CharacterSnapshot | null (Plan 05)
 * - `evf.getCombatSnapshot`    — returns CombatSnapshot | null (Plan 05)
 * - `evf.getSceneViewport`     — returns SceneViewport (Plan 05)
 * - `evf.getEventLog`          — returns EventLogEntry[] paginated by since/limit (Plan 05)
 * - `evf.listCharacters`       — returns all PC actors (Plan 05, wizard Step 3)
 * - `evf.castSpell`            — Phase 07 stub returning phase-07-pending (Plan 03-04)
 * - `evf.weaponAttack`         — Phase 07 stub returning phase-07-pending (Plan 03-04)
 * - `evf.useItem`              — Phase 07 stub returning phase-07-pending (Plan 03-04)
 * - `evf.skillCheck`           — Phase 07 stub returning phase-07-pending (Plan 03-04)
 * - `evf.moveToken`            — Phase 07 stub returning phase-07-pending (Plan 03-04)
 * - `evf.placeTemplate`        — Phase 07 stub returning phase-07-pending (Plan 03-04)
 * - `evf.setTargets`           — Phase 07 stub returning phase-07-pending (Plan 03-04)
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

// ─── Plan 03-04: 7 ADR-0003 Tool Registry stub handlers ──────────────────────
//
// T-03-14 boundary: these stubs MUST NOT call any write API.
// They return { status: 'phase-07-pending' } only.
// Phase 07 will replace each stub with a real activity.use() call
// (or MidiQOL.completeActivityUse when present).
//
// NB: Phase 03 bridge does NOT call these handlers via executeAsGM —
// the bridge's TOOL_DISPATCH_TABLE stubs return phase-07-pending directly.
// These registrations exist so Phase 07 wiring is trivial (registration scaffolding only).

/** T-03-14: no game state write; Phase 07 dispatches real activity.use() via MidiQOL.completeActivityUse. */
function handleCastSpellStub(_input: unknown): { status: 'phase-07-pending' } {
  // Phase 07 will dispatch the real activity.use() via MidiQOL.completeActivityUse — this stub returns immediately.
  return { status: 'phase-07-pending' };
}

/** T-03-14: no game state write; Phase 07 dispatches real activity.use() via MidiQOL.completeActivityUse. */
function handleWeaponAttackStub(_input: unknown): { status: 'phase-07-pending' } {
  // Phase 07 will dispatch the real activity.use() via MidiQOL.completeActivityUse — this stub returns immediately.
  return { status: 'phase-07-pending' };
}

/** T-03-14: no game state write; Phase 07 dispatches real activity.use() via MidiQOL.completeActivityUse. */
function handleUseItemStub(_input: unknown): { status: 'phase-07-pending' } {
  // Phase 07 will dispatch the real activity.use() via MidiQOL.completeActivityUse — this stub returns immediately.
  return { status: 'phase-07-pending' };
}

/** T-03-14: no game state write; Phase 07 dispatches real actor.rollSkill() — this stub returns immediately. */
function handleSkillCheckStub(_input: unknown): { status: 'phase-07-pending' } {
  // Phase 07 will dispatch the real actor.rollSkill() call — this stub returns immediately.
  return { status: 'phase-07-pending' };
}

/** T-03-14: no game state write; Phase 07 dispatches real Token.update() — this stub returns immediately. */
function handleMoveTokenStub(_input: unknown): { status: 'phase-07-pending' } {
  // Phase 07 will dispatch the real Token.update() call — this stub returns immediately.
  return { status: 'phase-07-pending' };
}

/** T-03-14: no game state write; Phase 07 dispatches real MeasuredTemplate.create() — this stub returns immediately. */
function handlePlaceTemplateStub(_input: unknown): { status: 'phase-07-pending' } {
  // Phase 07 will dispatch the real MeasuredTemplate.create() call — this stub returns immediately.
  return { status: 'phase-07-pending' };
}

/** T-03-14: no game state write; Phase 07 dispatches real TokenLayer target update — this stub returns immediately. */
function handleSetTargetsStub(_input: unknown): { status: 'phase-07-pending' } {
  // Phase 07 will dispatch the real TokenLayer target update — this stub returns immediately.
  return { status: 'phase-07-pending' };
}

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

  // Plan 03-04: 7 Tool Registry stub handlers (Phase 07 replaces with real activity.use())
  // T-03-14: each handler returns { status: 'phase-07-pending' } ONLY — no write API calls.
  socketlib.registerComplexHandler(MODULE_ID, 'evf.castSpell', handleCastSpellStub);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.weaponAttack', handleWeaponAttackStub);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.useItem', handleUseItemStub);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.skillCheck', handleSkillCheckStub);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.moveToken', handleMoveTokenStub);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.placeTemplate', handlePlaceTemplateStub);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.setTargets', handleSetTargetsStub);
}
