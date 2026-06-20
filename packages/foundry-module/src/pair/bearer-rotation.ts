/**
 * Bearer rotation scheduler — Plan 07-06 (Wave 4).
 *
 * Schedules a 24-hour bearer token rotation using the existing `generateBearer(refresh=true)`
 * infrastructure from Plan 02 (bearer-registry.ts). No changes to `validateBearer` or
 * the registry schema are required (RESEARCH §Q6 — refresh=true already shortens the old
 * token's expiresAt to now+60s grace).
 *
 * # Scheduling strategy
 *
 * At boot (`module.ts` ready hook), `scheduleBearerRotation` reads the active bearer's
 * `createdAt` timestamp and schedules a setTimeout for:
 *   `Math.max(0, TTL_24H_MS - (Date.now() - activeEntry.createdAt))`
 *
 * This handles tab-suspension scenarios correctly: if elapsed > TTL, remaining is clamped
 * to 0 → immediate rotation (T-07-06-05 accepted risk).
 *
 * # Rotation sequence
 *
 * 1. Call `generateBearer(alias, bridgeUrl, worldId, userId, refresh=true)` — silently
 *    shortens the old token's expiresAt to `now + GRACE_60S_MS` (D-2.11). The bound
 *    `userId` (ADR-0014) is read from the active entry and carried through.
 * 2. Emit `bearer.rotated` envelope via the injected `opts.emit` callback (wired to
 *    `bridgeDeltaEmitter` in module.ts).
 * 3. Write an audit-log entry (T-07-04 repudiation mitigation).
 * 4. Schedule the next rotation via recursive setTimeout (chain continues until cancel()).
 *
 * # Threat model
 *
 * - T-07-06-01: no active bearer at boot → no-op cancel returned immediately.
 * - T-07-06-02: cancel() sets `cancelled = true` + clears the pending timer.
 *   Idempotent — calling twice is safe.
 * - T-07-06-03: rotation envelope validated by BearerRotatedPayloadSchema at g2-app
 *   receive side (Phase 8 will add the receiver; Phase 7 ships the emission side only).
 * - T-07-06-04: audit log records alias + rotatedAt + graceUntil per rotation event.
 * - T-07-06-05: elapsed > TTL clamped to 0 → immediate rotation (correct behavior).
 *
 * @see packages/foundry-module/src/pair/bearer-registry.ts (generateBearer, getActiveBearer)
 * @see packages/foundry-module/src/write-path/audit-log.ts (writeAuditLog)
 * @see packages/foundry-module/src/module.ts (caller — wires bridgeDeltaEmitter)
 * @see .planning/phases/07-foundry-module-write-path/07-06-PLAN.md Task 1
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q6
 */

import { writeAuditLog } from '../write-path/audit-log.js';
import {
  GRACE_60S_MS,
  generateBearer,
  getActiveBearer,
  NO_EXPIRY_MS,
  TTL_24H_MS,
} from './bearer-registry.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * The `type` discriminant for the `bearer.rotated` envelope.
 * Used by module.ts to label the emission via `bridgeDeltaEmitter`.
 *
 * @example
 * ```ts
 * bridgeDeltaEmitter(BEARER_ROTATED_TYPE, { rotatedAt, graceUntil });
 * ```
 */
export const BEARER_ROTATED_TYPE = 'bearer.rotated' as const;

// ─── Options ──────────────────────────────────────────────────────────────────

/**
 * Options accepted by `scheduleBearerRotation`.
 *
 * The `emit` callback is injected by module.ts and wired to `bridgeDeltaEmitter`
 * so the scheduler has no direct dependency on the HTTP layer.
 *
 * The optional `clock` function allows tests to inject a stable time source.
 * In production, `Date.now` is used by default.
 */
export interface BearerRotationOptions {
  /** Emits the bearer.rotated payload to the bridge via bridgeDeltaEmitter. */
  emit: (payload: { rotatedAt: number; graceUntil: number }) => void;
  /**
   * Optional clock injection for tests (avoids real time dependency).
   * Defaults to `Date.now` in production.
   */
  clock?: () => number;
}

// ─── scheduleBearerRotation ───────────────────────────────────────────────────

/**
 * Schedules a 24-hour bearer rotation chain starting at module boot.
 *
 * Reads the active bearer at call time. If none exists (no pairing has occurred),
 * returns a no-op cancel closure immediately (T-07-06-01 mitigation).
 *
 * Returns a `cancel()` closure that stops the rotation chain:
 * - Sets an internal `cancelled` flag (prevents the in-flight rotate from chaining).
 * - Clears the pending `setTimeout` timer.
 * - Idempotent: calling `cancel()` twice is always safe.
 *
 * @param opts - Configuration: `emit` callback + optional clock injection.
 * @returns A `cancel()` closure for teardown (discarded by module.ts in MVP).
 *
 * @example
 * ```ts
 * // In module.ts ready hook:
 * scheduleBearerRotation({
 *   emit: (payload) => bridgeDeltaEmitter(BEARER_ROTATED_TYPE, payload),
 * });
 * ```
 */
export function scheduleBearerRotation(opts: BearerRotationOptions): () => void {
  const clock = opts.clock ?? Date.now.bind(Date);

  // Read the active bearer at boot — return no-op if none exists (T-07-06-01)
  const initialActive = getActiveBearer();
  if (initialActive === null) {
    return () => {
      // no-op: nothing to cancel
    };
  }

  // Rotation state — shared across the closure chain
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  // ── Inner helpers ───────────────────────────────────────────────────────

  /**
   * Schedules the next rotation setTimeout.
   *
   * Reads the currently active bearer at schedule time (may differ from boot
   * after a rotation has already occurred). If no active bearer is found,
   * the chain terminates gracefully.
   */
  function scheduleNext(): void {
    if (cancelled) return;

    // Re-read active bearer for accurate elapsed calculation
    const active = getActiveBearer();
    if (active === null) {
      // No active bearer → chain terminates (pairing was revoked)
      return;
    }

    // Campaign-long tokens (NO_EXPIRY_MS) never rotate — rotating would change the
    // bearer every 24h and invalidate the device the player already pasted. The chain
    // terminates; a non-expiring token stays valid for the whole campaign.
    if (active.expiresAt >= NO_EXPIRY_MS) {
      return;
    }

    const now = clock();
    const elapsed = now - active.createdAt;
    const remaining = Math.max(0, TTL_24H_MS - elapsed);

    timer = setTimeout(() => {
      void rotateNow(active);
    }, remaining);
  }

  /**
   * Performs the rotation: generateBearer(refresh=true) → emit → audit → chain.
   *
   * Catches all errors and logs via console.warn — a rotation failure must NEVER
   * crash the Foundry session (T-02-01 fault tolerance carry-forward).
   * Even on failure, the chain continues via `scheduleNext()` in the finally block.
   *
   * @param active - The bearer entry that triggered this rotation.
   */
  async function rotateNow(active: NonNullable<ReturnType<typeof getActiveBearer>>): Promise<void> {
    if (cancelled) return;

    try {
      // Step 1: generate new bearer with 60s grace on old token (RESEARCH §Q6).
      // ADR-0014: carry the bound userId from the active entry so the rotated
      // bearer stays bound to the same Foundry User (authorization is preserved
      // across rotation).
      await generateBearer(active.alias, active.bridgeUrl, active.worldId, active.userId, true);

      // Step 2: emit bearer.rotated envelope
      const now = clock();
      const payload = {
        rotatedAt: now,
        graceUntil: now + GRACE_60S_MS,
      };
      opts.emit(payload);

      // Step 3: audit log (T-07-04 repudiation mitigation)
      await writeAuditLog({
        tool: 'bearer.rotation',
        payload: { alias: active.alias },
        idempotencyKey: crypto.randomUUID(),
        actorId: null,
        result: { success: true, data: payload },
        timestamp: clock(),
        bearer_id: 'rotated',
      });
    } catch (err) {
      // Rotation failure: log warning but do NOT propagate (fault tolerance)
      // console.warn allowed per biome.jsonc noConsole allow:[error,warn]
      console.warn('[bearer-rotation] rotate failed', err);
    } finally {
      // Step 4: always chain next rotation (whether this one succeeded or failed)
      scheduleNext();
    }
  }

  // ── Kick off initial schedule ───────────────────────────────────────────
  scheduleNext();

  // ── Cancel closure ──────────────────────────────────────────────────────

  /**
   * Stops the rotation chain.
   *
   * Idempotent — safe to call multiple times.
   * Clears the pending timer and sets the cancelled flag to prevent
   * the in-flight rotate from scheduling a new one.
   */
  return (): void => {
    cancelled = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
