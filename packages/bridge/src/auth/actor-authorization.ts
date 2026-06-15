/**
 * actor-authorization — per-actor read-authorization predicate (ADR-0014).
 *
 * Single source of truth for "may this validated bearer read this actorId?".
 * Used by every read-path enforcement point so the rule is byte-identical:
 *
 * - REST `GET /v1/character/:actorId` + production `internalSnapshotFn` → 404 on deny
 * - WS handshake `client.actorId` pin → close 4400 on deny
 * - `characters-list` roster → filtered to the authorized set
 *
 * The authority is Foundry: the authorized set (`authorizedActorIds`) is computed
 * live from the bound user's ownership and cached alongside the token-validation
 * result (same 5-min TTL). This module only enforces set-membership; it never
 * derives ownership itself.
 *
 * ## Fail-closed (ADR-0014 §5)
 *
 * Absent or empty `authorizedActorIds` authorizes **nothing** — a legacy bearer
 * (no userId, pruned) or a user that owns no actors reads no actor. Never invert
 * this to "authorize all on empty".
 *
 * ## DEV-ONLY bypass
 *
 * When {@link isDevNoAuth} is active (EVF_DEV_NO_AUTH, gated to non-prod) the
 * bearer-auth model is bypassed entirely, so per-actor authorization is bypassed
 * too — otherwise the dev mock roster / HUD would be unreachable. Never true in
 * production (the env + NODE_ENV gate lives in is-dev-no-auth.ts).
 *
 * @see docs/architecture/0014-bearer-actor-authorization.md §4
 * @see ./token-cache.ts (ValidateTokenResult.authorizedActorIds)
 */

import { isDevNoAuth } from './is-dev-no-auth.js';

/**
 * Returns true when `actorId` is within the validated bearer's authorized set.
 *
 * Fail-closed: an `undefined`/empty `authorizedActorIds` denies every actor.
 * Returns true unconditionally under the DEV-ONLY {@link isDevNoAuth} bypass.
 *
 * @param authorizedActorIds - The validated bearer's owned-actor set (may be
 *   `undefined` on a legacy/fail-closed result → denies all).
 * @param actorId - The actor id the caller wants to read.
 */
export function isActorAuthorized(
  authorizedActorIds: readonly string[] | undefined,
  actorId: string,
): boolean {
  // DEV-ONLY: the whole bearer-auth model is bypassed in dev-no-auth mode.
  if (isDevNoAuth()) return true;
  if (authorizedActorIds === undefined) return false;
  return authorizedActorIds.includes(actorId);
}
