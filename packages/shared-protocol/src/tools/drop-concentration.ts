/**
 * DropConcentrationInputSchema — internal tool input schema for the
 * `drop-concentration` socketlib handler (Plan 07-05 — CONC-01).
 *
 * This schema is module-internal: it is NOT part of the 7-entry TOOL_REGISTRY
 * served by `GET /v1/tools`. The `drop-concentration` action is dispatched via
 * the `tool.invoke` envelope path (Phase 7 write path) but routed through
 * socketlib's `registerComplexHandler` as `evf.dropConcentration`, NOT exposed
 * as a REST-discoverable tool (see Plan 07-05 CONC-01 rationale + ADR-0003).
 *
 * Fields:
 * - `actor_id`  — Foundry Actor document ID of the concentrating player character.
 * - `effect_id` — Foundry ActiveEffect document ID of the concentration effect to delete.
 *
 * Strict-object: extra fields are rejected. Empty strings are rejected (min(1)).
 *
 * @see packages/foundry-module/src/write-path/handlers/drop-concentration.ts
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 2
 */
import { z } from 'zod';

/**
 * Zod schema for the `drop-concentration` handler arguments.
 *
 * Both IDs are non-empty strings. Strict-object rejects extra properties.
 */
export const DropConcentrationInputSchema = z
  .object({
    actor_id: z.string().min(1),
    effect_id: z.string().min(1),
  })
  .strict();

/** TypeScript type inferred from {@link DropConcentrationInputSchema}. */
export type DropConcentrationInput = z.infer<typeof DropConcentrationInputSchema>;
