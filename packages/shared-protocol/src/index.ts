/**
 * @evf/shared-protocol — TypeScript types + Zod schemas shared across all EVF packages.
 *
 * Single source of truth for protocol contracts: payload snapshots, tool input shapes
 * (ADR-0003) and the direct channel (ADR-0016).
 *
 * Phase 2: first real schemas — WS envelope + handshake messages + payload schemas.
 * Phase 5: fills delta payload union arms (CharacterDelta, CombatTurnDelta, etc.)
 *
 * @see docs/architecture/0002-protocol-versioning.md
 * @see docs/architecture/0003-tool-registry-pattern.md
 * @see Specs.md §4 (architecture) + §5.3 (Tool Registry)
 */

// ─── Payload schemas (Phase 2 Plan 05 — reader API) ───────────────────────────

export {
  ABILITY_KEYS,
  type Abilities,
  AbilitiesSchema,
  type AbilityKey,
  AbilityKeySchema,
  type AbilityScore,
  AbilityScoreSchema,
  type BiographySnapshot,
  BiographySnapshotSchema,
  CHARACTER_DELTA_TYPE,
  type CharacterSheetDetails,
  CharacterSheetDetailsSchema,
  type CharacterSnapshot,
  CharacterSnapshotSchema,
  type DeathSaves,
  DeathSavesSchema,
  type FeatEntry,
  FeatEntrySchema,
  INVENTORY_ITEM_TYPES,
  type InventoryItem,
  InventoryItemSchema,
  type InventoryItemType,
  SKILL_KEYS,
  type Skill,
  type SkillKey,
  SkillSchema,
  type Skills,
  SkillsSchema,
  SPELL_ACTIVATION_TYPES,
  type SpellActivation,
  type Spellbook,
  SpellbookSchema,
  type SpellEntry,
  SpellEntrySchema,
  type SpellSlot,
  SpellSlotSchema,
  type WorldState,
  WorldStateSchema,
} from './payloads/character.js';

export {
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TARGETS_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  type Combatant,
  CombatantSchema,
  type CombatSnapshot,
  CombatSnapshotSchema,
  type CombatTargetsPayload,
  CombatTargetsPayloadSchema,
} from './payloads/combat.js';

// ─── Phase 4b additions (Plan 06) ─────────────────────────────────────────────
// Concentration conflict payload schema + delta topic.

export {
  CONC_CONFLICT_TYPE,
  type ConcConflictPayload,
  ConcConflictPayloadSchema,
} from './payloads/concentration.js';
export {
  EVENT_LOG_DELTA_TYPE,
  type EventLogEntry,
  EventLogEntrySchema,
  type EventLogResponse,
  EventLogResponseSchema,
  type EventType,
  EventTypeSchema,
} from './payloads/event.js';
export { SCENE_VIEWPORT_DELTA_TYPE } from './payloads/scene.js';

// ─── Phase 5 Plan 05-05 — Log payload schema ─────────────────────────────────
// LogEvent + LogSnapshot + LogEventKind + LOG_DELTA_TYPE for chat log tail.

export {
  LOG_DELTA_TYPE,
  type LogEvent,
  type LogEventKind,
  LogEventKindSchema,
  type LogEventResult,
  LogEventResultSchema,
  LogEventSchema,
  type LogSnapshot,
  LogSnapshotSchema,
} from './payloads/log.js';

// ─── Tool ids carried by action results ──────────────────────────────────────

export { TOOL_ID_SCHEMA } from './payloads/tool.js';

// ─── AoE template confirmation (ACT-02) ──────────────────────────────────────

export {
  type TemplatePlacementConfirmPayload,
  TemplatePlacementConfirmPayloadSchema,
} from './payloads/template.js';

// ─── Phase 7 additions (Plan 07-04) ──────────────────────────────────────────
// Multi-attack progress payload schema (MULTI-01).
// multi-attack-progress-dispatcher.ts consumes MultiAttackProgressPayloadSchema
// at the WS-receive trust boundary. R1_MULTIATTACK_PROGRESS_TYPE narrows on
// envelope.type before applying inner payload parse.
// Separate file from template.ts (Plan 07-03) to minimise merge conflicts.

export {
  type MultiAttackProgressPayload,
  MultiAttackProgressPayloadSchema,
  R1_MULTIATTACK_PROGRESS_TYPE,
} from './payloads/multi-attack.js';

// ─── Phase 7 additions (Plan 07-05) ──────────────────────────────────────────
// Reaction available payload schema (REACT-01).
// reaction-toast-dispatcher.ts consumes ReactionAvailablePayloadSchema at the
// WS-receive trust boundary. R1_REACTION_AVAILABLE_TYPE narrows on envelope.type
// before applying inner payload parse.

export {
  R1_REACTION_AVAILABLE_TYPE,
  type ReactionAvailablePayload,
  ReactionAvailablePayloadSchema,
} from './payloads/reaction.js';

// ─── v0.12 sheet HUD — GM roll requests (docs/design/g2-sheet-ux.html S8) ──────
export {
  R1_ROLL_REQUEST_TYPE,
  type RollRequestPayload,
  RollRequestPayloadSchema,
} from './payloads/roll-request.js';

// ─── Phase 7 additions (Plan 07-05) — drop-concentration internal schema ─────
// Module-internal schema for the evf.dropConcentration socketlib handler.
// NOT part of the 7-entry TOOL_REGISTRY served by GET /v1/tools.

export {
  type DropConcentrationInput,
  DropConcentrationInputSchema,
} from './tools/drop-concentration.js';

// ─── Phase 9 additions (Plan 09-01) ──────────────────────────────────────────
// Action economy payload schema (COMB-02 telemetry).
// combat-action-tracker.ts in foundry-module emits envelopes of this shape.
// action-economy-dispatcher.ts in g2-app consumes them via double trust boundary.
// action-economy-state.ts in g2-app caches the latest per-actor state for Plan 09-02.

export {
  type ActionEconomyPayload,
  ActionEconomyPayloadSchema,
  R1_ACTION_ECONOMY_TYPE,
} from './payloads/action-economy.js';

// ─── Phase 8 additions (Plan 08-01) ──────────────────────────────────────────
// Action result payload schema (ACT-01).
// action-result-dispatcher.ts consumes this at the WS-receive trust boundary.
// action-result-watcher.ts in foundry-module emits envelopes of this shape.

export {
  ActionErrorKind,
  ActionOutcome,
  type ActionResultPayload,
  ActionResultPayloadSchema,
  R1_ACTION_RESULT_TYPE,
} from './payloads/action-result.js';

// ─── Phase 8 additions (Plan 08-04) ──────────────────────────────────────────
// Movement budget payload schema (ACT-01 move variant).
// combat-movement-tracker.ts in foundry-module emits envelopes of this shape.
// status-hud-layer.ts in g2-app consumes them via _onDelta narrowing on
// R1_MOVEMENT_BUDGET_TYPE. renderer.setMovementBudget toggles the Mov 25/30 chip.

export {
  type MovementBudgetPayload,
  MovementBudgetPayloadSchema,
  R1_MOVEMENT_BUDGET_TYPE,
} from './payloads/movement.js';

// ─── Phase 13 additions (Plan 13-01 — ACT-04 reaction schemas) ───────────────
// Three new ACT-04 reaction handler input schemas.
// Socketlib handler count flips from 14 → 17 with Plan 13-01.

export {
  type CastCounterspellInput,
  CastCounterspellInputSchema,
} from './tools/cast-counterspell.js';
export { type CastShieldInput, CastShieldInputSchema } from './tools/cast-shield.js';
// ADR-0016 direct channel — `end-turn` (paired actor ends its own combat turn).
export { END_TURN_TOOL, type EndTurnInput, EndTurnInputSchema } from './tools/end-turn.js';
export {
  type OpportunityAttackInput,
  OpportunityAttackInputSchema,
} from './tools/opportunity-attack.js';

// ─── Tool Registry (Phase 3 Plan 04 — ADR-0003) ───────────────────────────────

// ─── Direct channel (ADR-0016) ───────────────────────────────────────────────
export * from './direct/index.js';
export {
  type CastSpellInput,
  CastSpellInputSchema,
  type MoveTokenInput,
  MoveTokenInputSchema,
  type PlaceTemplateInput,
  PlaceTemplateInputSchema,
  type SetTargetsInput,
  SetTargetsInputSchema,
  type SkillCheckInput,
  SkillCheckInputSchema,
  TOOL_INPUT_SCHEMAS,
  TOOL_NAMES,
  TOOL_REGISTRY,
  type ToolEntry,
  type ToolName,
  type UseItemInput,
  UseItemInputSchema,
  type WeaponAttackInput,
  WeaponAttackInputSchema,
} from './tools/index.js';
