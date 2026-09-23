/**
 * `end-turn` tool input schema — the paired actor ends its own combat turn.
 *
 * Executed GM-side by `packages/foundry-module/src/write-path/handlers/end-turn.ts`
 * through `dispatchTool` (ADR-0011 single-workflow-origin). The handler only
 * advances the encounter when the current combatant's actor is `actor_id`; the
 * direct projector forces `actor_id` to the device's paired actor (ADR-0012), so a
 * G2 device can never end somebody else's turn.
 *
 * Strict object: no extra fields (no combat id — always the active encounter).
 *
 * @see docs/design/g2-thirds-layout.md M03 («Fine turno»)
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.Combat.html#nextturn
 */
import { z } from 'zod';

/** Tool id (kebab-case, matches the foundry-module `ToolId` union). */
export const END_TURN_TOOL = 'end-turn' as const;

export const EndTurnInputSchema = z
  .object({
    /** Actor whose turn is ending; must own the current combatant. */
    actor_id: z.string().min(1),
  })
  .strict();

/** TypeScript type inferred from {@link EndTurnInputSchema}. */
export type EndTurnInput = z.infer<typeof EndTurnInputSchema>;
