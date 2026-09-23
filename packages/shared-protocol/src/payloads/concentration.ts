/**
 * Concentration-conflict payload schema: the module (cast-spell handler) reports that
 * a new concentration spell collides with the active one; the glasses offer to drop
 * it (the drop itself is the `drop-concentration` tool).
 *
 * The type constant {@link CONC_CONFLICT_TYPE} is the delta topic.
 */
import { z } from 'zod';

/**
 * Module → g2-app concentration-conflict payload.
 *
 * Emitted by the cast-spell handler when the player casts a second concentration
 * spell; the glasses ask the player to drop the active spell or cancel the new cast.
 *
 * Fields:
 * - `effectId`                  — Foundry ActiveEffect document ID of the
 *                                 active-concentration effect (used by the
 *                                 confirmation envelope to address the drop)
 * - `currentConcentrationName`  — Display name of the active spell (e.g. `"Hold Person"`)
 * - `newSpellName`              — Display name of the newly cast spell (e.g. `"Bless"`)
 *
 * Strict-object: extra fields are rejected. Empty strings are rejected.
 */
export const ConcConflictPayloadSchema = z.strictObject({
  effectId: z.string().min(1),
  currentConcentrationName: z.string().min(1),
  newSpellName: z.string().min(1),
  /**
   * Foundry Actor document ID of the concentrating player character.
   *
   * Added in Plan 07-05 (CONC-01 write closure) to carry the actor context
   * needed by the `drop-concentration` socketlib handler. Optional for
   * backward-compat with Phase 4b envelopes that pre-date this field.
   * The g2-app `ConcentrationDropModalPanel` dual-emit path uses this value
   * in the `tool.invoke` args; when absent, only the legacy
   * `conc.drop.confirmed` envelope is emitted (graceful fallback).
   */
  actorId: z.string().min(1).optional(),
});

export type ConcConflictPayload = z.infer<typeof ConcConflictPayloadSchema>;

/**
 * Wire-protocol discriminant for {@link ConcConflictPayloadSchema}.
 *
 * Routed on `envelope.type` by the g2-app boot-engine WS event bus →
 * Plan 05 `conc-conflict-dispatcher.ts`.
 */
export const CONC_CONFLICT_TYPE = 'conc.conflict' as const;
