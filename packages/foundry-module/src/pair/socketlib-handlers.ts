/**
 * @evf/foundry-module — socketlib GM-side handler registrations.
 *
 * Registers the two socketlib handlers that bridge-side code calls via
 * `socketlib.executeAsGM("evenfoundryvtt", "evf.*", ...)`:
 *
 * - `evf.validateToken` — validates a bearer token against the Foundry-authoritative registry
 * - `evf.revokeToken` — revokes a bearer token (removes it from active registry)
 *
 * The single-workflow-origin discipline (Phase 0 D-15 Option A) requires ALL writes
 * to Foundry game state to go through `socketlib.executeAsGM`. These handlers are
 * the ONLY path for the bridge to interact with the bearer registry — direct socket
 * calls from player clients are not permitted.
 *
 * Security:
 * - Both handlers validate input types before touching any registry state (T-02-04).
 *   An unrecognised token returns `{ valid: false, reason: "unknown_token" }` rather
 *   than throwing — prevents information leakage about registry internal errors.
 * - Bearer token values are NEVER logged (T-02-01 mitigation).
 *
 * @see 02-02-PLAN.md Task 2 (socketlib-handlers.ts)
 * @see 02-CONTEXT.md D-2.12 (socketlib executeAsGM bridge→Foundry communication)
 * @see packages/foundry-module/src/pair/bearer-registry.ts (validateBearer, revokeBearer)
 */

import { MODULE_ID } from '../module.js';
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

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Registers socketlib GM-side handlers for token validation and revocation.
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
  socketlib.registerComplexHandler(MODULE_ID, 'evf.validateToken', handleValidateToken);
  socketlib.registerComplexHandler(MODULE_ID, 'evf.revokeToken', handleRevokeToken);
}
