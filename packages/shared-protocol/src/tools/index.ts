/**
 * ADR-0003 Tool Registry — canonical 7-tool dispatch surface for EVF MVP.
 *
 * Exports:
 * - Per-tool Zod input schemas + TypeScript types (one file per tool).
 * - `TOOL_REGISTRY` — read-only array of `ToolEntry` objects consumed by
 *   `GET /v1/tools` and Phase 11 `foundry-mcp` tool discovery. Each entry
 *   precomputes its `inputSchema` JSON Schema (Draft 2020-12) at module-load
 *   time via Zod 4 native `.toJSONSchema()` — no `zod-to-json-schema` dep.
 * - `TOOL_NAMES` — const tuple of the 7 tool name strings.
 * - `ToolName` — union type derived from `TOOL_NAMES`.
 * - `TOOL_INPUT_SCHEMAS` — `Record<ToolName, z.ZodTypeAny>` for `POST /v1/tools/:name`
 *   runtime body validation.
 *
 * T-03-15 (drift protection): `TOOL_REGISTRY[i].inputSchema` is recomputed
 * every server boot from the live Zod schema. The `tools.test.ts` drift test
 * asserts `registryEntry.inputSchema === schema.toJSONSchema()` for all 7 tools.
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see Specs.md §5.3 (Tool Registry)
 */

import type { z } from 'zod';
import { type CastSpellInput, CastSpellInputSchema } from './cast-spell.js';
import { type MoveTokenInput, MoveTokenInputSchema } from './move-token.js';
import { type PlaceTemplateInput, PlaceTemplateInputSchema } from './place-template.js';
import { type SetTargetsInput, SetTargetsInputSchema } from './set-targets.js';
import { type SkillCheckInput, SkillCheckInputSchema } from './skill-check.js';
import { type UseItemInput, UseItemInputSchema } from './use-item.js';
import { type WeaponAttackInput, WeaponAttackInputSchema } from './weapon-attack.js';

export { type CastSpellInput, CastSpellInputSchema } from './cast-spell.js';
export { type MoveTokenInput, MoveTokenInputSchema } from './move-token.js';
export { type PlaceTemplateInput, PlaceTemplateInputSchema } from './place-template.js';
export { type SetTargetsInput, SetTargetsInputSchema } from './set-targets.js';
export { type SkillCheckInput, SkillCheckInputSchema } from './skill-check.js';
export { type UseItemInput, UseItemInputSchema } from './use-item.js';
export { type WeaponAttackInput, WeaponAttackInputSchema } from './weapon-attack.js';

/** Suppress unused import warnings — types are re-exported above. */
type _SuppressUnused =
  | CastSpellInput
  | WeaponAttackInput
  | UseItemInput
  | SkillCheckInput
  | MoveTokenInput
  | PlaceTemplateInput
  | SetTargetsInput;

/**
 * A single entry in the Tool Registry as served by `GET /v1/tools`.
 *
 * `inputSchema` is a JSON Schema Draft 2020-12 object precomputed at
 * module-load time from the corresponding Zod schema.
 */
export interface ToolEntry {
  /** Canonical tool name (snake_case). */
  name: string;
  /** Human-readable description shown in MCP tool listings. */
  description: string;
  /** JSON Schema Draft 2020-12 object for the tool's input parameters. */
  inputSchema: unknown;
}

/**
 * Canonical 7-entry Tool Registry.
 *
 * Each entry's `inputSchema` is computed once at module initialisation via
 * `.toJSONSchema()` so every server boot derives it from the live Zod definition
 * (T-03-15 drift protection).
 *
 * @see ADR-0003
 */
export const TOOL_REGISTRY: readonly ToolEntry[] = [
  {
    name: 'cast_spell',
    description: 'Cast a spell via activity.use()',
    inputSchema: CastSpellInputSchema.toJSONSchema(),
  },
  {
    name: 'weapon_attack',
    description: 'Make a weapon attack via activity.use()',
    inputSchema: WeaponAttackInputSchema.toJSONSchema(),
  },
  {
    name: 'use_item',
    description: 'Use a consumable or item via activity.use()',
    inputSchema: UseItemInputSchema.toJSONSchema(),
  },
  {
    name: 'skill_check',
    description: 'Roll a skill check via actor.rollSkill()',
    inputSchema: SkillCheckInputSchema.toJSONSchema(),
  },
  {
    name: 'move_token',
    description: 'Move a token to grid coordinates',
    inputSchema: MoveTokenInputSchema.toJSONSchema(),
  },
  {
    name: 'place_template',
    description: 'Place an AoE template for a spell/ability',
    inputSchema: PlaceTemplateInputSchema.toJSONSchema(),
  },
  {
    name: 'set_targets',
    description: 'Set TokenLayer targets for the current user',
    inputSchema: SetTargetsInputSchema.toJSONSchema(),
  },
] as const;

/**
 * Const tuple of all 7 canonical tool names.
 *
 * Used to derive `ToolName` union type and to construct `TOOL_INPUT_SCHEMAS`.
 */
export const TOOL_NAMES = [
  'cast_spell',
  'weapon_attack',
  'use_item',
  'skill_check',
  'move_token',
  'place_template',
  'set_targets',
] as const;

/** Union type of all valid tool names. */
export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * Runtime schema lookup for `POST /v1/tools/:name` body validation.
 *
 * Each value is the Zod schema that should be used with `.safeParse(body)`
 * before dispatching to the Foundry-side stub handler.
 */
export const TOOL_INPUT_SCHEMAS: Record<ToolName, z.ZodTypeAny> = {
  cast_spell: CastSpellInputSchema,
  weapon_attack: WeaponAttackInputSchema,
  use_item: UseItemInputSchema,
  skill_check: SkillCheckInputSchema,
  move_token: MoveTokenInputSchema,
  place_template: PlaceTemplateInputSchema,
  set_targets: SetTargetsInputSchema,
};
