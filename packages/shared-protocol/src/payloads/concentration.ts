/**
 * Concentration envelope payload schemas — Phase 4b conc-drop modal wire protocol.
 *
 * Defines the two envelope payloads exchanged when a player attempts to cast a
 * second concentration spell while already concentrating on one:
 *
 * - {@link ConcConflictPayloadSchema} — Bridge → g2-app (Phase 7 server-side
 *   detection emits this envelope when the active spell collides with the
 *   newly-cast spell). Plan 05 `conc-conflict-dispatcher.ts` performs the
 *   `safeParse` at the WS-receive boundary and pops the
 *   `ConcDropModalPanel` on the overlay slot.
 *
 * - {@link ConcDropConfirmedPayloadSchema} — g2-app → Bridge (Phase 4b emits
 *   this envelope when the player confirms dropping the active concentration;
 *   Phase 7 consumes it for the write path via `socketlib.executeAsGM`).
 *
 * Carrier shape: both payloads ride inside the canonical {@link EnvelopeSchema}
 * (`proto: 'evf-v1'` / `seq` / `ts` / `type` / `session_id` (UUID) / `payload`).
 * The {@link CONC_CONFLICT_TYPE} and {@link CONC_DROP_CONFIRMED_TYPE} constants
 * are the discriminant strings on `envelope.type`.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 6 (envelope shapes)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 8 (modal trigger + bridge emission policy)
 * @see ../envelope.ts (EnvelopeSchema — canonical wire carrier)
 */
import { z } from 'zod';

/**
 * Bridge → g2-app concentration-conflict envelope payload.
 *
 * Emitted by Phase 7 bridge logic when the GM-side `preCreateActiveEffect` /
 * `preUpdateActor` detection identifies that the player has cast a second
 * concentration spell. The g2-app pops a {@link ConcDropModalPanel} that
 * asks the player to drop the active spell (continue concentration) or
 * cancel the new cast.
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
});

export type ConcConflictPayload = z.infer<typeof ConcConflictPayloadSchema>;

/**
 * Wire-protocol discriminant for {@link ConcConflictPayloadSchema}.
 *
 * Routed on `envelope.type` by the g2-app boot-engine WS event bus →
 * Plan 05 `conc-conflict-dispatcher.ts`.
 */
export const CONC_CONFLICT_TYPE = 'conc.conflict' as const;

/**
 * g2-app → Bridge confirmation envelope payload.
 *
 * Emitted by the g2-app `ConcDropModalPanel` when the player confirms dropping
 * the active concentration effect. The bridge consumes this envelope (Phase 7
 * write path) and calls `socketlib.executeAsGM` to delete the ActiveEffect on
 * the GM side.
 *
 * Fields:
 * - `effectId` — Foundry ActiveEffect document ID to delete (echoed from the
 *                preceding {@link ConcConflictPayloadSchema} envelope)
 *
 * Strict-object: extra fields are rejected. Empty string is rejected.
 */
export const ConcDropConfirmedPayloadSchema = z.strictObject({
  effectId: z.string().min(1),
});

export type ConcDropConfirmedPayload = z.infer<typeof ConcDropConfirmedPayloadSchema>;

/**
 * Wire-protocol discriminant for {@link ConcDropConfirmedPayloadSchema}.
 *
 * Used by the g2-app modal `Drop active` button handler when constructing the
 * outgoing envelope (`envelope.type = CONC_DROP_CONFIRMED_TYPE`).
 */
export const CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed' as const;
