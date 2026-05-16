/**
 * Idempotency key hash helper — Phase 10 Plan 02.
 *
 * Reduces an idempotency key to a 16-char lowercase hex string via SHA-256
 * truncated to the first 16 hex chars. Used by `PerfProbe.flush()` before
 * constructing the `r1.perf.sample` envelope.
 *
 * # T-10-02 Mitigation (Information Disclosure — D-Area5)
 *
 * Idempotency keys are bearer-bound dedup tokens (Phase 3 Plan 01 D-3.07).
 * Transmitting them in clear-text inside perf-sample envelopes would expose
 * session-linked data across the g2-app → bridge trust boundary. SHA-256
 * truncated to 16 hex chars provides:
 *
 *  - **Correlation**: same action → same hash → operator can group latency
 *    measurements per action without decoding the original key.
 *  - **Irreversibility**: 16 chars = 64 bits of entropy from a 256-bit digest.
 *    Pre-image resistance is more than sufficient for an MVP telemetry key.
 *  - **Wire safety**: `PerfSampleEnvelopeSchema` enforces `^[0-9a-f]{16}$`,
 *    making it structurally impossible for a clear-text key to pass validation.
 *
 * # Platform Availability
 *
 * `crypto.subtle.digest` is available in iOS Safari WKWebView (the Even
 * Realities App runtime). No polyfill required — verified via Even Hub SDK
 * polyfill chain per CLAUDE.md §Working in this repo.
 *
 * @see packages/shared-protocol/src/perf-probe.ts (PerfSampleEnvelopeSchema)
 * @see packages/g2-app/src/engine/perf-probe.ts (PerfProbe consumer)
 * @see .planning/phases/10-polish-field-test-mvp/10-02-PLAN.md Task 1 (Step C)
 * @see .planning/phases/10-polish-field-test-mvp/10-CONTEXT.md §Area 5 (T-10-02)
 */

/**
 * Hash an idempotency key to a 16-char lowercase hex string (SHA-256-trunc-16).
 *
 * T-10-02 mitigation: hashes the bearer-bound dedup key before emission so
 * no clear-text idempotency key ever appears in a `r1.perf.sample` envelope.
 *
 * # Algorithm
 *
 *   1. UTF-8 encode `key` via `TextEncoder`.
 *   2. `crypto.subtle.digest('SHA-256', ...)` → 32-byte `ArrayBuffer`.
 *   3. Convert to hex string: `Array.from(Uint8Array) → .map(b => b.toString(16).padStart(2,'0')).join('')`.
 *   4. Slice first 16 chars → lowercase hex string matching `^[0-9a-f]{16}$`.
 *
 * # Determinism
 *
 * SHA-256 is a deterministic function. Same `key` → same output every call.
 * This allows post-hoc correlation of latency samples by action without
 * decoding the original key.
 *
 * @param key - The idempotency key to hash (any string, including empty string).
 *              Empty string input returns the sha256-trunc-16 of the empty string
 *              (no special-casing — PSH-04).
 * @returns A Promise resolving to a 16-char lowercase hex string.
 *
 * @example
 * ```ts
 * const hash = await hashIdempotencyKey('bearer-abc123-action-xyz');
 * // e.g. → 'c3d4e5f60a1b2c3d'
 * ```
 */
export async function hashIdempotencyKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexString = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hexString.slice(0, 16);
}
