/**
 * ADR-0002: WS envelope schema — single source of truth for the EVF wire protocol.
 *
 * All consumers (bridge, foundry-module, g2-app, foundry-mcp) import from here.
 * Protocol semver (`proto: "evf-v1"`) is independent of package semver.
 *
 * @see docs/architecture/0002-protocol-versioning.md
 * @see Specs.md §4 (architecture), §5.3 (Tool Registry), §11.5.8.1 (replay buffer)
 */
import { z } from 'zod';

/**
 * Base WS envelope for all EVF protocol messages.
 *
 * Fields:
 * - `proto`      — Protocol identifier. Always `"evf-v1"` in Phase 2.
 * - `seq`        — Monotonic, non-negative integer. Incremented per delta emitted by bridge.
 *                  Used for replay-buffer gap detection (ADR-0002).
 * - `ts`         — Emission timestamp (`Date.now()` on the emitter side), ms since epoch.
 * - `type`       — Event type discriminant (e.g. `"character.delta"`, `"combat.turn"`).
 * - `session_id` — UUID v4 identifying the WS session. Populated after handshake.
 * - `payload`    — Event-specific payload. Typed by phase; `unknown` until Phase 5 fills unions.
 */
export const EnvelopeSchema = z.object({
  proto: z.literal('evf-v1'),
  seq: z.number().int().nonnegative(),
  ts: z.number().int(),
  type: z.string(),
  session_id: z.string().uuid(),
  payload: z.unknown(),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;

/**
 * Delta envelope — forward-compatible extension point.
 *
 * Identical to `EnvelopeSchema` in Phase 2 (`payload: z.unknown()`).
 * Phase 5 fills the `payload` union arms with typed delta schemas
 * (CharacterDelta, CombatTurnDelta, SceneViewportDelta, EventLogDelta).
 *
 * Separate export allows Phase 5 to narrow the type without breaking
 * existing consumers that reference `EnvelopeSchema`.
 */
export const DeltaEnvelopeSchema = EnvelopeSchema;

export type DeltaEnvelope = z.infer<typeof DeltaEnvelopeSchema>;

// ─── ADR-0002 Resume Protocol schemas ─────────────────────────────────────────
//
// These three schemas cover the full WS resume handshake introduced in Phase 03.
// They use `z.object` (NOT `z.strictObject`) to allow additive forward-compatible
// fields — downstream phases may add fields without breaking existing parsers.
//
// @see docs/architecture/0002-protocol-versioning.md
// @see .planning/phases/03-bridge-service-skeleton/03-RESEARCH.md §6
// @see .planning/phases/03-bridge-service-skeleton/03-01-PLAN.md

/**
 * Client → Bridge: sent after a successful handshake to resume from a known seq.
 *
 * `last_seq` is the last envelope seq the client successfully received.
 * Bridge responds with either `resume_replay` or `resume_full_snapshot`.
 *
 * @example `{ proto: "evf-v1", type: "client_resume", session_id: "...", last_seq: 7 }`
 */
export const ClientResumeSchema = z.object({
  proto: z.literal('evf-v1'),
  type: z.literal('client_resume'),
  session_id: z.string().uuid(),
  last_seq: z.number().int().nonnegative(),
});

export type ClientResume = z.infer<typeof ClientResumeSchema>;

/**
 * Bridge → Client: sent when the replay buffer has contiguous envelopes for the
 * requested range. The `count` field tells the client how many envelope frames
 * to expect after this header message.
 *
 * @example `{ proto: "evf-v1", type: "resume_replay", count: 3 }`
 */
export const ResumeReplaySchema = z.object({
  proto: z.literal('evf-v1'),
  type: z.literal('resume_replay'),
  count: z.number().int().nonnegative(),
});

export type ResumeReplay = z.infer<typeof ResumeReplaySchema>;

/**
 * Bridge → Client: sent when the replay buffer cannot serve a clean replay.
 *
 * `reason` distinguishes two failure modes:
 * - `"buffer_expired"` — all envelopes with seq > last_seq were evicted (>60s ago).
 * - `"buffer_gap"` — the buffered entries with seq > last_seq are non-contiguous
 *   (gap-injection attack or legitimate high-loss window). See T-03-01.
 *
 * The client MUST re-fetch state via REST endpoints (no payload in this message).
 *
 * @example `{ proto: "evf-v1", type: "resume_full_snapshot", reason: "buffer_gap" }`
 */
export const ResumeFullSnapshotSchema = z.object({
  proto: z.literal('evf-v1'),
  type: z.literal('resume_full_snapshot'),
  reason: z.enum(['buffer_expired', 'buffer_gap']),
});

export type ResumeFullSnapshot = z.infer<typeof ResumeFullSnapshotSchema>;
