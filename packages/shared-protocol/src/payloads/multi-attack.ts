/**
 * Multi-attack progress payload schema (Plan 07-04 — MULTI-01).
 *
 * Emitted by the Foundry module on each iteration of the Path B client-side
 * loop inside `weaponAttackHandler`. The bridge propagates this envelope to
 * g2-app's `multi-attack-progress-dispatcher`, which updates the
 * `CombatTrackerPanel.multiAttackState` field and triggers a re-render of
 * the `[Atk N/M]` chip.
 *
 * ## Trust boundary
 *
 * The dispatcher (g2-app-side) applies double trust boundary validation:
 *   1. Outer: `EnvelopeSchema.safeParse` for the canonical wire format.
 *   2. Inner: `MultiAttackProgressPayloadSchema.safeParse` for this payload.
 *
 * ## Threat mitigations
 *
 * - **T-07-04-01 (DoS: count: 1000)**: `total` max(10) — argsSchema rejects at
 *   the handler entry point; this payload schema mirrors the constraint.
 * - **T-07-04-02 (Tampering: current > total)**: `current` and `total` are both
 *   validated >= 1; the dispatcher treats any `current === total` as "clear state"
 *   which is safe regardless of ordering.
 *
 * @see packages/foundry-module/src/write-path/handlers/weapon-attack.ts (emitter)
 * @see packages/g2-app/src/panels/multi-attack-progress-dispatcher.ts (consumer)
 * @see .planning/phases/07-foundry-module-write-path/07-04-PLAN.md Task 1
 */

import { z } from 'zod';

/**
 * WS envelope `type` discriminant for multi-attack progress events.
 *
 * Matches `EnvelopeSchema.type` field — used by the dispatcher to narrow
 * from the outer Envelope parse before applying the inner payload schema.
 */
export const R1_MULTIATTACK_PROGRESS_TYPE = 'r1.multiattack.progress' as const;

/**
 * Payload schema for a single multi-attack iteration progress event.
 *
 * Fields:
 * - `attackId`   — UUID stable across all iterations of one multi-attack invocation.
 * - `current`    — 1-based iteration index (1 = first attack, N = last).
 * - `total`      — Total attacks planned (max 10 per T-07-04-01 DoS limit).
 * - `chatCardId` — Foundry chat card ID for this iteration, or null if no card produced.
 * - `actorId`    — Foundry actor ID for the attacking combatant (used to match combatant row).
 */
export const MultiAttackProgressPayloadSchema = z
  .object({
    attackId: z.string().uuid(),
    current: z.number().int().min(1),
    total: z.number().int().min(1).max(10),
    chatCardId: z.string().nullable(),
    actorId: z.string().min(1),
  })
  .strict();

/** TypeScript type inferred from {@link MultiAttackProgressPayloadSchema}. */
export type MultiAttackProgressPayload = z.infer<typeof MultiAttackProgressPayloadSchema>;
