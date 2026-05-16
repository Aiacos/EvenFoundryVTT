/**
 * Perf-probe envelope schema — Phase 10 Plan 02.
 *
 * Defines the `r1.perf.sample` envelope emitted by `PerfProbe` in `g2-app`
 * at the end of each measured action flow. The envelope carries per-action
 * timestamps at 5 instrumentation stations (gesture_emit → bridge_post →
 * handler_invoke → result_envelope → toast_queued) for latency profiling.
 *
 * # T-10-02 Mitigation (Information Disclosure)
 *
 * The `idempotencyKey` used internally by the action-options flow is
 * **sensitive** (bearer-bound dedup key, per Phase 3 Plan 01 D-3.07). It
 * is NEVER transmitted on the wire. Instead, `PerfProbe.flush` hashes the
 * key via `sha256` truncated to the first 16 hex chars before envelope
 * construction. This schema enforces the result format via the regex
 * `^[0-9a-f]{16}$`, making it impossible for a clear-text key to slip
 * through accidentally.
 *
 * # Wire Format
 *
 * ```json
 * {
 *   "proto": "evf-v1",
 *   "seq": 42,
 *   "ts": 1731234567890,
 *   "type": "r1.perf.sample",
 *   "session_id": "<uuid>",
 *   "payload": {
 *     "idempotencyKeyHash": "<16-hex-chars>",
 *     "stations": [
 *       { "name": "gesture_emit",    "ts": 1731234567890 },
 *       { "name": "bridge_post",     "ts": 1731234567945 },
 *       { "name": "handler_invoke",  "ts": 1731234568012 },
 *       { "name": "result_envelope", "ts": 1731234568267 },
 *       { "name": "toast_queued",    "ts": 1731234568289 }
 *     ]
 *   }
 * }
 * ```
 *
 * @see packages/g2-app/src/engine/perf-probe.ts (PerfProbe emitter)
 * @see packages/g2-app/src/engine/perf-probe-hash.ts (hashIdempotencyKey helper)
 * @see docs/perf/phase-10-latency.md (hardware-pending latency template)
 * @see .planning/phases/10-polish-field-test-mvp/10-02-PLAN.md Task 1
 * @see .planning/phases/10-polish-field-test-mvp/10-CONTEXT.md §Area 5 (T-10-02)
 */
import { z } from 'zod';

/**
 * Wire-protocol discriminant for perf-sample envelopes.
 *
 * Routed on `envelope.type` by the bridge or telemetry consumer. Emitted by
 * `PerfProbe.flush()` after all 4 g2-app-side stations are recorded for a
 * given idempotency flow.
 */
export const R1_PERF_SAMPLE_TYPE = 'r1.perf.sample' as const;

/**
 * Instrumentation station names for the perf probe.
 *
 * 5 canonical stations per action flow:
 * - `gesture_emit`    — R1 gesture received by g2-app WS handler
 * - `bridge_post`     — `tool.invoke` envelope transmitted over WS to bridge
 * - `handler_invoke`  — Server-side: socketlib `executeAsGM` entry in foundry-module
 *                       (NOT measured by g2-app — bridge-side log anchor only)
 * - `result_envelope` — `r1.action.result` envelope received by g2-app
 * - `toast_queued`    — `ToastQueueLayer.enqueue()` call site in g2-app
 *
 * The g2-app probe records 4 of these stations (all except `handler_invoke`
 * which is server-side). The `handler_invoke` station timestamp is inferred
 * from bridge logs during post-hoc analysis (SC-10-02).
 */
export const PerfStation = z.enum([
  'gesture_emit',
  'bridge_post',
  'handler_invoke',
  'result_envelope',
  'toast_queued',
]);

/** Branded type for the station name enum. */
export type PerfStation = z.infer<typeof PerfStation>;

/**
 * Per-station timestamp entry.
 *
 * `name` is one of the 5 canonical station names; `ts` is the monotonic
 * timestamp in milliseconds (`performance.now()` or `Date.now()` depending
 * on which API is available at the station's emission site).
 */
const PerfStationEntrySchema = z.object({
  /** Station name — must be one of the 5 canonical values. */
  name: PerfStation,
  /** Emission timestamp in milliseconds. Must be a positive integer. */
  ts: z.number().int().positive(),
});

/**
 * Payload schema for `r1.perf.sample` envelopes.
 *
 * Strict validation:
 * - `idempotencyKeyHash` — MUST be exactly 16 lowercase hex chars (sha256-trunc-16
 *   as produced by `hashIdempotencyKey()`). This is the T-10-02 mitigation gate.
 * - `stations` — MUST contain exactly 5 entries, each with a valid station name.
 *   The `.length(5)` constraint ensures every expected station is present in the
 *   envelope (no partial flows are emitted — see `PerfProbe.flush` behavior).
 */
const PerfSamplePayloadSchema = z.object({
  /**
   * SHA-256 truncated to 16 hex chars of the original idempotencyKey.
   *
   * T-10-02 mitigation: the regex `^[0-9a-f]{16}$` enforces that only the
   * hashed form can appear in this field. Clear-text idempotency keys (which
   * are bearer-bound dedup tokens) MUST NEVER be placed here.
   *
   * @see packages/g2-app/src/engine/perf-probe-hash.ts
   */
  idempotencyKeyHash: z.string().regex(/^[0-9a-f]{16}$/, {
    message: 'idempotencyKeyHash must be exactly 16 lowercase hex chars (sha256-trunc-16)',
  }),
  /**
   * Station timestamp array — exactly 5 entries in the canonical order.
   *
   * The `.length(5)` constraint rejects partial flows. If `PerfProbe.flush`
   * is called before all 4 g2-app stations are recorded, the probe drops the
   * flow silently (see PP-04 test). The `handler_invoke` station timestamp
   * may be approximate (bridge log inferred) but MUST still be present.
   */
  stations: z.array(PerfStationEntrySchema).length(5),
});

/**
 * Full `r1.perf.sample` envelope schema.
 *
 * Extends the canonical EVF envelope base (`proto/seq/ts/type/session_id`)
 * with a typed `payload` containing the hashed idempotency key and 5 station
 * timestamps. Emitted by `PerfProbe.flush()` in `g2-app` at the end of each
 * measured action flow (opt-in via `?probe=true` URL param or `PERF_PROBE`
 * boot option — zero overhead when disabled).
 *
 * @see .planning/phases/10-polish-field-test-mvp/10-CONTEXT.md §Area 1 §Specifics
 * @see packages/g2-app/src/engine/perf-probe.ts (PerfProbe emitter)
 */
export const PerfSampleEnvelopeSchema = z.object({
  /** Protocol identifier. Always `"evf-v1"` per ADR-0002. */
  proto: z.literal('evf-v1'),
  /** Monotonic non-negative integer seq (incremented per envelope). */
  seq: z.number().int().nonnegative(),
  /** Emission timestamp (`Date.now()`) in milliseconds since epoch. */
  ts: z.number().int(),
  /** Envelope type discriminant — always `"r1.perf.sample"`. */
  type: z.literal('r1.perf.sample'),
  /** WS session UUID v4 from the capability handshake. */
  session_id: z.string().uuid(),
  /** Typed perf-sample payload. */
  payload: PerfSamplePayloadSchema,
});

/**
 * Inferred TypeScript type for the `r1.perf.sample` envelope.
 *
 * Use for typing function parameters or return values that produce or
 * consume perf-sample envelopes.
 */
export type PerfSampleEnvelope = z.infer<typeof PerfSampleEnvelopeSchema>;

/**
 * Inferred TypeScript type for the `r1.perf.sample` payload.
 *
 * Alias for the inner `payload` sub-type — use when narrowing on the
 * payload in isolation (e.g. in bridge telemetry consumers).
 */
export type PerfSampleEnvelopePayload = z.infer<typeof PerfSamplePayloadSchema>;
