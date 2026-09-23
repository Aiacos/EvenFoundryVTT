/**
 * Tool identifier schema shared by the action-result payload and the glasses.
 *
 * The bridge-era `tool.invoke` envelope and `bearer.rotated` payloads were removed with
 * the bridge (ADR-0016): the direct channel carries tool invocations in the sealed
 * envelope (`direct/messages.ts`).
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 * @see docs/architecture/0016-direct-foundry-streaming.md
 */
import { z } from 'zod';

/**
 * Tool IDs that produce an action result card (`ActionResultPayload.toolId`).
 *
 * Kebab-case, a subset of the `ToolId` union in
 * `packages/foundry-module/src/write-path/tool-registry.ts` (the reaction tools
 * `cast-shield` / `cast-counterspell` / `opportunity-attack` report through the
 * reaction flow instead). The set is intentionally closed (ADR-0011).
 */
export const TOOL_ID_SCHEMA = z.enum([
  'cast-spell',
  'weapon-attack',
  'use-item',
  'move-token',
  'drop-concentration',
  'place-template',
  'confirm-template-placement',
  'skill-check',
  'end-turn',
]);
