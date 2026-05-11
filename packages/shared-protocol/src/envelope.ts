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
