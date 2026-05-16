/**
 * Reaction available payload schema (Plan 07-05 — REACT-01).
 *
 * Emitted by the Foundry module's `reaction-watcher.ts` when `dnd5e.preUseActivity`
 * fires for an NPC activity that targets the player. The module emits this envelope
 * via `bridgeDeltaEmitter('r1.reaction.available', payload)` → bridge → g2-app.
 *
 * g2-app's `reaction-toast-dispatcher.ts` receives this envelope, validates it
 * with double trust boundary (outer EnvelopeSchema + inner this schema), then
 * enqueues a toast via Phase 4b `ToastQueueLayer` (3s dwell, display-only).
 *
 * ## Display-only (REACT-01 scope)
 *
 * This payload is DISPLAY-ONLY. No tap-to-fire wiring exists in Phase 7.
 * ACT-04 (V2) owns the reaction execution surface.
 *
 * ## Reaction kinds (Phase 7 heuristic)
 *
 * Phase 7 emits a broad heuristic match — any NPC attack → 'shield', any NPC
 * spell → 'counterspell'. Precise per-trigger matching is deferred to Phase 9
 * COMB-02. This approach is intentional (REACT-01 is display-only; false
 * positives are acceptable; false negatives would miss real reactions).
 *
 * @see packages/foundry-module/src/write-path/reaction-watcher.ts (emitter)
 * @see packages/g2-app/src/panels/reaction-toast-dispatcher.ts (consumer)
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 1
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q3 (dnd5e.preUseActivity)
 */

import { z } from 'zod';

/**
 * WS envelope `type` discriminant for reaction-available events.
 *
 * Used by the reaction-toast-dispatcher to narrow from the outer Envelope parse
 * before applying the inner `ReactionAvailablePayloadSchema`.
 */
export const R1_REACTION_AVAILABLE_TYPE = 'r1.reaction.available' as const;

/**
 * Reaction kind union — the three reactions detectable in Phase 7.
 *
 * - `shield`              — NPC uses an attack activity (Wizard/Sorcerer can cast Shield)
 * - `counterspell`        — NPC uses a spell activity (any caster can counterspell)
 * - `opportunity-attack`  — NPC moves away from player threat area (Phase 9 COMB-02 owns precise match)
 *
 * Phase 7 heuristic: attack → 'shield', spell → 'counterspell'.
 * The `opportunity-attack` kind is reserved for Phase 9 refinement.
 */
export const ReactionAvailablePayloadSchema = z
  .object({
    /** Reaction type the player may take in response to the triggering activity. */
    kind: z.enum(['shield', 'counterspell', 'opportunity-attack']),
    /** Display name of the NPC/creature performing the triggering activity. */
    sourceName: z.string().min(1),
    /**
     * Expiry timestamp in milliseconds (Date.now() + window).
     *
     * The reaction window closes when the triggering activity resolves.
     * Phase 7 uses a 6000 ms window (generous — no precise hook to close it).
     * `z.number().int()` — negative values are allowed (clock skew defence).
     */
    expiresAt: z.number().int(),
  })
  .strict();

/** TypeScript type inferred from {@link ReactionAvailablePayloadSchema}. */
export type ReactionAvailablePayload = z.infer<typeof ReactionAvailablePayloadSchema>;
