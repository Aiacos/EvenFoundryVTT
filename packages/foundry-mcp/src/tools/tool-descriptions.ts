/**
 * Human-readable MCP tool descriptions for the 6 EVF tools.
 *
 * These descriptions are shown to LLM clients (Claude Desktop) in the
 * `tools/list` response. They describe the tool's purpose, parameters,
 * and any relevant constraints in English (MCP clients are English-centric;
 * G2 UI strings are IT+EN per Specs.md §7.16, but MCP tool descriptions
 * are EN-only for V2).
 *
 * @see packages/foundry-mcp/src/tools/register-tools.ts (consumer)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-02-PLAN.md Task 2
 */

/** Union of the 6 EVF MCP tool IDs (kebab-case). */
export type EvfMcpToolId =
  | 'cast-spell'
  | 'weapon-attack'
  | 'use-item'
  | 'move-token'
  | 'place-template'
  | 'drop-concentration';

/**
 * Per-tool title and description map.
 *
 * Descriptions are written for LLM consumption: clear, specific, and
 * including any important constraints (concentration, confirmation flow, etc.).
 */
export const TOOL_DESCRIPTIONS: Record<EvfMcpToolId, { title: string; description: string }> = {
  'cast-spell': {
    title: 'Cast Spell',
    description:
      "Cast a spell from an actor's spell list at zero or more token targets. " +
      'Per Phase 9 D-09-04, slot_level=0 indicates a cantrip; 1-9 selects the spell slot to expend. ' +
      'If the actor is already concentrating on another spell and this spell requires concentration, ' +
      'the call returns error="concentration-required" and a concentration-drop modal is presented on ' +
      "the player's G2 glasses — the user must confirm via R1 ring before recasting via this tool. " +
      'Idempotent within 60s by idempotencyKey.',
  },
  'weapon-attack': {
    title: 'Weapon Attack',
    description:
      "Perform a weapon attack from an actor's weapon item, optionally repeating count times for Extra Attack " +
      '(Path B per RESEARCH §Q1 — dnd5e 5.3.3 does not support count natively, the handler loops). ' +
      'Each iteration produces a separate chat card. ' +
      'Use advantage="advantage" or advantage="disadvantage" for situational modifiers.',
  },
  'use-item': {
    title: 'Use Item',
    description:
      'Use a consumable or activated item via the dnd5e Activity API. ' +
      "The item must be in the actor's inventory and must have an activatable use action.",
  },
  'move-token': {
    title: 'Move Token',
    description:
      'Move a token to (x, y) grid coordinates on the current scene. ' +
      'Phase 7 handler validates scene bounds. Coordinates are in Foundry canvas units. ' +
      'The token must be owned by the current user (bearer-bound ownership check).',
  },
  'place-template': {
    title: 'Place AoE Template',
    description:
      'Place an Area-of-Effect template for a spell or ability that requires positioning ' +
      '(Fireball, Burning Hands, etc.). The MCP-side call places the template; the player MUST ' +
      'confirm position on the G2 glasses via R1 ring — pending confirm-template-placement is an ' +
      'internal flow not exposed to MCP clients. The item_id identifies the spell or feature with an AoE; ' +
      'x and y set the template origin in canvas units.',
  },
  'drop-concentration': {
    title: 'Drop Concentration',
    description:
      'Drop the active concentration effect on a specific actor to free up concentration before ' +
      'recasting a spell that requires it. The effect_id must match an ActiveEffect on the actor ' +
      'with flags.dnd5e.concentrating === true. Use this before cast-spell when the LLM receives ' +
      'a concentration-required error from the bridge.',
  },
};
