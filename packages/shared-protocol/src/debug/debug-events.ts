/**
 * Debug-console event + command wire-protocol schemas — Quick Task 260529-h5e Wave 1.
 *
 * These are the LEAN, dev-tooling-only contracts shared by:
 *   - the bridge debug backend (Wave 2: ring-buffer events + 7 gated endpoints),
 *   - the single-file CRT dashboard (Wave 3),
 *   - the g2-app display-op mirror (Wave 4 — "what the glasses show" feed).
 *
 * They model the privileged dev backdoor described in the plan's `<security_model>`.
 * Intentionally minimal: dev observability/command surface, not production wire types.
 *
 * # Source-of-truth reuse
 *
 * `DebugGestureBodySchema.kind` deliberately reuses the SAME 4 R1 gesture kinds as
 * {@link R1GesturePayloadSchema} (`tap | double-tap | scroll-up | scroll-down`)
 * — do NOT diverge from the canonical gesture enum.
 *
 * @see ../payloads/r1.ts (R1GesturePayloadSchema — gesture kind enum source of truth)
 * @see ../payloads/tool.ts (ToolInvocationEnvelopePayloadSchema — dispatch payload shape)
 * @see .planning/quick/260529-h5e-debug-console-bridge-observability-comma/260529-h5e-PLAN.md Wave 1
 */
import { z } from 'zod';

/**
 * A single ring-buffer debug event.
 *
 * Captured by the bridge `DebugEventBus` on inbound WS frames, outbound deltas,
 * tool dispatches, log lines, and g2-app display-op mirrors.
 *
 * Fields:
 * - `id`        — monotonically increasing buffer id (assigned on push, starts at 1).
 * - `ts`        — `Date.now()` ms epoch at capture time.
 * - `direction` — which leg of the chain produced the event.
 * - `sessionId` — owning session, or `null` for broadcast / session-less events.
 * - `type`      — envelope/event type discriminant (free-form string).
 * - `seq`       — delta seq when applicable, else `null`.
 * - `summary`   — short human-readable, token-redacted line for the dashboard.
 * - `payload`   — arbitrary (token-redacted) detail blob; `z.unknown()` by design.
 */
export const DebugEventSchema = z.object({
  /** Monotonic buffer id (assigned on push, starts at 1). */
  id: z.number().int().min(1),
  /** `Date.now()` ms epoch at capture time. */
  ts: z.number().int(),
  /**
   * Which leg of the chain produced the event.
   *
   * Extended in Quick Task 260604-cwa with `'agent-log'` and `'agent-result'`
   * directions for the dev-only agent control channel.
   */
  direction: z.enum(['inbound', 'outbound', 'tool', 'log', 'display', 'agent-log', 'agent-result']),
  /** Owning session, or `null` for broadcast / session-less events. */
  sessionId: z.string().nullable(),
  /** Envelope/event type discriminant (free-form string). */
  type: z.string(),
  /** Delta seq when applicable, else `null`. */
  seq: z.number().int().nullable(),
  /** Short human-readable, token-redacted line for the dashboard. */
  summary: z.string(),
  /** Arbitrary (token-redacted) detail blob. */
  payload: z.unknown(),
});

/** A single ring-buffer debug event (inferred). */
export type DebugEvent = z.infer<typeof DebugEventSchema>;

/**
 * Wire type for the g2-app → bridge display-op mirror feed.
 *
 * The g2-app posts {@link DisplayOpPayload} values to `POST /debug/displayop`;
 * the bridge records them as `direction: 'display'` debug events.
 */
export const R1_DEBUG_DISPLAYOP_TYPE = 'r1.debug.displayop' as const;

/**
 * A display operation mirrored from the g2-app render engine.
 *
 * Models "what the glasses would render": page rebuilds, container mounts/destroys,
 * and optional per-station perf samples.
 *
 * Fields:
 * - `op`             — the render op kind.
 * - `z`              — optional layer index (z=0 map, z=1 status HUD, z=2 overlay).
 * - `containerCount` — optional total container count after the op.
 * - `detail`         — optional free-form detail string.
 * - `perf`           — optional PerfProbe-style station samples.
 * - `ts`             — `Date.now()` ms epoch at the op.
 */
export const DisplayOpPayloadSchema = z.object({
  /** The render op kind. */
  op: z.enum(['mount', 'destroy', 'rebuild', 'perf']),
  /** Optional layer index (z=0 map, z=1 status HUD, z=2 overlay). */
  z: z.number().int().optional(),
  /** Optional total container count after the op. */
  containerCount: z.number().int().optional(),
  /** Optional free-form detail string. */
  detail: z.string().optional(),
  /** Optional PerfProbe-style station samples. */
  perf: z
    .array(
      z.object({
        /** Pipeline station name. */
        station: z.string(),
        /** Sample key within the station. */
        key: z.string(),
        /** `Date.now()` ms epoch of the sample. */
        ts: z.number().int(),
      }),
    )
    .optional(),
  /** `Date.now()` ms epoch at the op. */
  ts: z.number().int(),
});

/** A display operation mirrored from the g2-app render engine (inferred). */
export type DisplayOpPayload = z.infer<typeof DisplayOpPayloadSchema>;

/**
 * Request body for `POST /debug/inject` — push any envelope type to one or all sessions
 * (bridge → client direction only).
 *
 * Fields:
 * - `type`            — envelope type discriminant (non-empty).
 * - `payload`         — arbitrary payload to fan out (`z.unknown()` by design).
 * - `targetSessionId` — optional single-session target; omit/`null` to target all sessions.
 */
export const DebugInjectBodySchema = z.object({
  /** Envelope type discriminant (non-empty). */
  type: z.string().min(1),
  /** Arbitrary payload to fan out. */
  payload: z.unknown(),
  /** Optional single-session target; omit/`null` to target all sessions. */
  targetSessionId: z.string().nullable().optional(),
});

/** Request body for `POST /debug/inject` (inferred). */
export type DebugInjectBody = z.infer<typeof DebugInjectBodySchema>;

/**
 * Request body for `POST /debug/dispatch-tool` — drive any real tool through the
 * SAME injected `dispatchToolFn` (routes to foundry-module per ADR-0011).
 *
 * Fields:
 * - `sessionId`      — session whose bearer token authorises the dispatch (non-empty).
 * - `toolId`         — tool to invoke (non-empty; validated downstream by the tool registry).
 * - `idempotencyKey` — OPTIONAL UUID v4. When omitted, the handler generates a FRESH
 *                      `crypto.randomUUID()` per call so debug dispatches never collide
 *                      with the real foundry-module idempotency cache. When supplied it
 *                      MUST be a UUID (non-UUID → 400).
 * - `args`           — tool-specific arguments (`z.unknown()` by design).
 */
export const DebugDispatchBodySchema = z.object({
  /** Session whose bearer token authorises the dispatch (non-empty). */
  sessionId: z.string().min(1),
  /** Tool to invoke (non-empty; validated downstream by the tool registry). */
  toolId: z.string().min(1),
  /** Optional UUID v4; omitted → handler generates a fresh uuid per call. */
  idempotencyKey: z.string().uuid().optional(),
  /** Tool-specific arguments. */
  args: z.unknown(),
});

/** Request body for `POST /debug/dispatch-tool` (inferred). */
export type DebugDispatchBody = z.infer<typeof DebugDispatchBodySchema>;

/**
 * Request body for `POST /debug/simulate-gesture` — simulate an R1 ring gesture.
 *
 * `kind` reuses the canonical 5 R1 gesture kinds from {@link R1GesturePayloadSchema}.
 *
 * Fields:
 * - `sessionId` — target session (non-empty).
 * - `kind`      — one of the 5 R1 gesture kinds.
 */
export const DebugGestureBodySchema = z.object({
  /** Target session (non-empty). */
  sessionId: z.string().min(1),
  /** One of the 4 canonical R1 gesture kinds (long-press retired — ADR-0012). */
  kind: z.enum(['tap', 'double-tap', 'scroll-up', 'scroll-down']),
});

/** Request body for `POST /debug/simulate-gesture` (inferred). */
export type DebugGestureBody = z.infer<typeof DebugGestureBodySchema>;
