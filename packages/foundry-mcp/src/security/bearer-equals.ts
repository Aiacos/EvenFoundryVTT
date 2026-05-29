/**
 * Constant-time bearer token comparison (T-11-02).
 *
 * Extracted from `http.ts` so the security primitive can be unit-tested even
 * though the HTTP boot entry is excluded from coverage (it self-executes on
 * import and is un-instrumentable as a unit).
 *
 * @see packages/foundry-mcp/src/http.ts (consumer)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-01-PLAN.md Task 2
 */

import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of two bearer token strings (T-11-02).
 *
 * Length mismatch returns `false` immediately (before compare) to avoid leaking
 * timing information on length difference. Both buffers are compared with
 * `crypto.timingSafeEqual` when lengths match, ensuring no early-return on the
 * first differing byte.
 *
 * Implementation detail: `crypto.timingSafeEqual` requires equal-length Buffers.
 * We fast-reject on length mismatch as a first guard, then safe-compare on
 * same-length inputs.
 *
 * @param provided - The bearer token from the incoming request Authorization header.
 * @param expected - The configured bearer token from environment (EVF_BEARER).
 * @returns `true` if both strings are byte-for-byte identical; `false` otherwise.
 */
export function bearerEquals(provided: string, expected: string): boolean {
  // Fast-reject on length mismatch (no timing info beyond the mismatch fact).
  if (provided.length !== expected.length) {
    return false;
  }
  // Same-length: use constant-time compare.
  const a = Buffer.from(provided, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  return timingSafeEqual(a, b);
}
