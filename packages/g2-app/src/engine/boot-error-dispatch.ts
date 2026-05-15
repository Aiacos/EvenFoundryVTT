/**
 * Boot-error dispatch — maps a thrown exception to one of the 5
 * `BootErrorState` enum values.
 *
 * Pure function module. Imports only the `HandshakeError` class +
 * `LayerManagerError` class (for `instanceof` discrimination) and the
 * `BootErrorState` type. No I/O, no side effects beyond a `console.warn`
 * on the unknown-shape catch-all branch (T-4b-04-01 telemetry).
 *
 * **Source map — verbatim from 04B-RESEARCH.md §Q3:**
 *
 * | Exception class                    | Dispatch state         |
 * |------------------------------------|------------------------|
 * | `HandshakeError('transport_error')`| `'bridge_unreachable'` |
 * | `HandshakeError('parse_failed')`   | `'handshake_failed'`   |
 * | `HandshakeError('schema_failed')`  | `'handshake_failed'`   |
 * | `HandshakeError('timeout')`        | `'handshake_failed'`   |
 * | `LayerManagerError(*)`             | `'handshake_failed'`   |
 * | msg includes `WebSocket` + `1006`  | `'bridge_unreachable'` |
 * | msg includes `WebSocket error before open` | `'bridge_unreachable'` |
 * | msg includes `proto_chosen`        | `'version_mismatch'`   |
 * | msg includes `bridgeFactory`       | `'bridge_unreachable'` |
 * | msg (lowercase) includes `no actor` or `no character` | `'no_character'` |
 * | msg includes `TokenExpired` or `401` or `403` | `'token_expired'` |
 * | (anything else)                    | `'handshake_failed'` (default, catch-all) |
 *
 * **T-4b-04-01 mitigation:** the catch-all default returns
 * `'handshake_failed'` — the least-informative-but-always-renderable state
 * (every locale has a complete title + hint payload). The unknown shape is
 * surfaced via `console.warn` for development telemetry; no throw.
 *
 * **Rationale for substring matching over instanceof:** several reachable
 * exception sources are plain `Error`s with no dedicated subclass:
 *   - The WS-open helper in `boot-engine-core.ts` throws
 *     `new Error('[boot-engine-core] WebSocket error before open: …')`
 *   - WS close 1006 surfaces through generic listeners as `Error('… 1006 …')`
 *   - Production bridge wrappers throw `Error('bridgeFactory rejected')`
 *   - Foundry-side reader throws `Error('no actor assigned')`
 *   - Bridge auth-gate returns surface as `Error('401 …')` / `Error('403 …')`
 *
 * Plan 04 prefers a single dispatch function that absorbs all these patterns
 * over introducing 5 new error subclasses across 3 packages.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q3
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-04-PLAN.md Task 2
 */

import type { BootErrorState } from './boot-error-types.js';
import { HandshakeError } from './capability-handshake.js';
import { LayerManagerError } from './layer-types.js';

/**
 * Map a thrown exception to the matching {@link BootErrorState}.
 *
 * **Discrimination order is significant:**
 *   1. `HandshakeError` — discriminate on `.code` (4 codes).
 *   2. `LayerManagerError` — coalesce all codes to `handshake_failed`
 *      (the LM cannot recover mid-bundle so the UX message is "boot
 *      negotiation broken" which is the handshake-class story).
 *   3. Substring patterns on `.message` for plain `Error`s.
 *   4. Catch-all default → `handshake_failed` + `console.warn`.
 *
 * Pure function: never throws, never mutates global state apart from a
 * single `console.warn` on the catch-all branch (T-4b-04-01 telemetry).
 *
 * @param err Any value thrown / rejected by the boot path.
 * @returns The matching {@link BootErrorState} enum member.
 */
export function bootErrorFromException(err: unknown): BootErrorState {
  // 1. HandshakeError — strongest discrimination signal (typed `.code`).
  if (err instanceof HandshakeError) {
    if (err.code === 'transport_error') {
      return 'bridge_unreachable';
    }
    // 'parse_failed' | 'schema_failed' | 'timeout' all map to handshake_failed.
    return 'handshake_failed';
  }

  // 2. LayerManagerError — every code variant coalesces to handshake_failed.
  if (err instanceof LayerManagerError) {
    return 'handshake_failed';
  }

  // 3. Plain Error / object with `.message` — substring matching per
  //    RESEARCH §Q3 source map.
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = String((err as { message: unknown }).message);

    // WS close code 1006 (abnormal) — bridge dropped TCP mid-handshake.
    if (msg.includes('WebSocket') && msg.includes('1006')) {
      return 'bridge_unreachable';
    }
    // Plain "WebSocket error before open" — bridge URL unreachable.
    if (msg.includes('WebSocket error before open')) {
      return 'bridge_unreachable';
    }
    // Bridge produced a `proto_chosen` value our client does not recognise.
    if (msg.includes('proto_chosen')) {
      return 'version_mismatch';
    }
    // bridgeFactory rejection — typically `Error('bridgeFactory rejected')`.
    if (msg.includes('bridgeFactory')) {
      return 'bridge_unreachable';
    }
    // Foundry-side reader: "no actor assigned" / "no character …".
    // Lower-case the message so the match is case-insensitive.
    const lower = msg.toLowerCase();
    if (lower.includes('no actor') || lower.includes('no character')) {
      return 'no_character';
    }
    // Auth gate: token expired (24h bearer) — bridge replies 401 / 403, or
    // throws a `TokenExpired`-tagged error.
    if (msg.includes('TokenExpired') || msg.includes('401') || msg.includes('403')) {
      return 'token_expired';
    }
  }

  // 4. Catch-all — unknown exception shape. Log telemetry for debugging;
  //    return the least-informative-but-always-renderable state.
  //    T-4b-04-01 mitigation.
  console.warn(
    '[boot-error-dispatch] unknown exception shape — defaulting to handshake_failed',
    err,
  );
  return 'handshake_failed';
}
