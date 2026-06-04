/**
 * @evf/shared-protocol — TypeScript types + Zod schemas shared across all EVF packages.
 *
 * Single source of truth for protocol contracts per ADR-0002 (WS envelope + idempotency)
 * and ADR-0003 (Tool Registry tool input shapes).
 *
 * Phase 2: first real schemas — WS envelope + handshake messages + payload schemas.
 * Phase 5: fills delta payload union arms (CharacterDelta, CombatTurnDelta, etc.)
 *
 * @see docs/architecture/0002-protocol-versioning.md
 * @see docs/architecture/0003-tool-registry-pattern.md
 * @see Specs.md §4 (architecture) + §5.3 (Tool Registry)
 */
export {
  type ClientResume,
  ClientResumeSchema,
  type DeltaEnvelope,
  DeltaEnvelopeSchema,
  type Envelope,
  EnvelopeSchema,
  type ResumeFullSnapshot,
  ResumeFullSnapshotSchema,
  type ResumeReplay,
  ResumeReplaySchema,
} from './envelope.js';

export {
  type HandshakeClient,
  HandshakeClientSchema,
  type HandshakeServer,
  HandshakeServerSchema,
  SERVER_CAPS_V1,
  type ServerCap,
} from './handshake.js';

// ─── Payload schemas (Phase 2 Plan 05 — reader API) ───────────────────────────

export {
  ABILITY_KEYS,
  type Abilities,
  AbilitiesSchema,
  type AbilityKey,
  AbilityKeySchema,
  type AbilityScore,
  AbilityScoreSchema,
  CHARACTER_DELTA_TYPE,
  type CharacterSnapshot,
  CharacterSnapshotSchema,
  type DeathSaves,
  DeathSavesSchema,
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
// Concentration conflict + drop-confirmation envelope schemas + type constants.
// Plan 05 conc-conflict-dispatcher.ts consumes these at the WS-receive boundary.

export {
  CONC_CONFLICT_TYPE,
  CONC_DROP_CONFIRMED_TYPE,
  type ConcConflictPayload,
  ConcConflictPayloadSchema,
  type ConcDropConfirmedPayload,
  ConcDropConfirmedPayloadSchema,
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
export {
  decodeFramePixels,
  encodeFramePixels,
  type FramePixels,
  FramePixelsSchema,
} from './payloads/frame.js';
export {
  SCENE_VIEWPORT_DELTA_TYPE,
  type SceneViewport,
  SceneViewportSchema,
} from './payloads/scene.js';

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

// ─── Phase 6 additions (Plan 06-01) ───────────────────────────────────────────
// R1 gesture wire-payload schema + type constant.
// r1-event-source.ts consumes these at the WS-receive trust boundary.

export {
  R1_GESTURE_TYPE,
  type R1GesturePayload,
  R1GesturePayloadSchema,
} from './payloads/r1.js';

// ─── Phase 7 additions (Plan 07-01) ──────────────────────────────────────────
// Tool invocation envelope + bearer rotation payload schemas.
// dispatchTool in foundry-module consumes ToolInvocationEnvelopePayloadSchema at
// the WS-receive trust boundary. BearerRotatedPayloadSchema is used by the bearer
// rotation scheduler (Plan 07-06) and propagated to g2-app for token refresh.

export {
  type BearerRotatedPayload,
  BearerRotatedPayloadSchema,
  TOOL_ID_SCHEMA,
  type ToolInvocationEnvelopePayload,
  ToolInvocationEnvelopePayloadSchema,
} from './payloads/tool.js';

// ─── Phase 7 additions (Plan 07-03) ──────────────────────────────────────────
// AoE template placement payload schemas (ACT-02).
// template-placement-dispatcher.ts consumes TemplatePlacementRequestedPayloadSchema
// at the WS-receive trust boundary. TemplatePlacementConfirm/CancelPayloadSchema
// ride inside tool.invoke envelopes (g2-app → module).

export {
  TEMPLATE_PLACEMENT_CANCEL_TYPE,
  TEMPLATE_PLACEMENT_CONFIRMED_TYPE,
  TEMPLATE_PLACEMENT_REQUESTED_TYPE,
  type TemplatePlacementCancelPayload,
  TemplatePlacementCancelPayloadSchema,
  type TemplatePlacementConfirmPayload,
  TemplatePlacementConfirmPayloadSchema,
  type TemplatePlacementRequestedPayload,
  TemplatePlacementRequestedPayloadSchema,
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

// ─── Phase 10 additions (Plan 10-02) ─────────────────────────────────────────
// Perf-probe envelope schema for latency instrumentation (opt-in via ?probe=true).
// T-10-02 mitigation: idempotencyKeyHash is sha256-trunc-16 (schema enforces regex).
// Hardware-pending fill: docs/perf/phase-10-latency.md (SC-10-02).

export {
  type PerfSampleEnvelope,
  type PerfSampleEnvelopePayload,
  PerfSampleEnvelopeSchema,
  PerfStation,
  type PerfStation as PerfStationType,
  R1_PERF_SAMPLE_TYPE,
} from './perf-probe.js';

// ─── Phase 12 additions (Plan 12-02 Task 1) ──────────────────────────────────
// Voice transcript wire-payload schema + type constant.
// foundry-mcp deepgram-stt.ts (Plan 12-03) produces envelopes of this shape.
// The MCP server validates them at the WS-receive trust boundary (T-12-WIRE-01).

export {
  R1_VOICE_TRANSCRIPT_TYPE,
  type VoiceTranscriptPayload,
  VoiceTranscriptPayloadSchema,
} from './payloads/voice.js';

// ─── Quick Task 20260517 — spell-pack vocabulary push schema ─────────────────
// AvailableSpellsPayloadSchema pushed by foundry-module spell-pack-reader.ts.
// Bridge caches via spell-pack-cache.ts + serves GET /v1/spells/available.
// foundry-mcp spell-lookup-foundry.ts fetches with 5-min TTL + Levenshtein fuzzy.

export {
  type AvailableSpellsPayload,
  AvailableSpellsPayloadSchema,
  R1_SPELLS_AVAILABLE_TYPE,
  type SpellPackEntry,
  SpellPackEntrySchema,
} from './payloads/spell-pack.js';

// ─── Quick Task 260517-k2g — entity-pack vocabulary push schema ───────────────
// AvailableEntitiesPayloadSchema pushed by foundry-module entity-pack-reader.ts.
// Parallel additive pipeline to spell-pack: covers non-spell Items + Actors
// (npc/vehicle). Bridge caches via entity-pack-cache.ts + serves
// GET /v1/entities/available. foundry-mcp entity-lookup-foundry.ts fetches
// with 5-min TTL + Levenshtein fuzzy. NO offline fallback (returns null).

export {
  type AvailableEntitiesPayload,
  AvailableEntitiesPayloadSchema,
  type EntityPackEntry,
  EntityPackEntrySchema,
  R1_ENTITIES_AVAILABLE_TYPE,
} from './payloads/entity-pack.js';

// ─── Phase 13 additions (Plan 13-03 — portrait ready schema) ─────────────────
// Portrait ready payload schema for STRETCH-06 Bio tab portrait feature.
// Bridge emits r1.portrait.ready envelope on cache-miss render path.
// Plan 13-04 portrait-dispatcher consumes this at the WS-receive boundary.

export {
  type PortraitReadyPayload,
  PortraitReadyPayloadSchema,
  R1_PORTRAIT_READY_TYPE,
} from './payloads/portrait.js';

// ─── Phase 13 additions (Plan 13-01 — ACT-04 reaction schemas) ───────────────
// Three new ACT-04 reaction handler input schemas.
// Socketlib handler count flips from 14 → 17 with Plan 13-01.

export {
  type CastCounterspellInput,
  CastCounterspellInputSchema,
} from './tools/cast-counterspell.js';
export { type CastShieldInput, CastShieldInputSchema } from './tools/cast-shield.js';
export {
  type OpportunityAttackInput,
  OpportunityAttackInputSchema,
} from './tools/opportunity-attack.js';

// ─── Tool Registry (Phase 3 Plan 04 — ADR-0003) ───────────────────────────────

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

// ─── Voice (Phase 15 Plan 01 — Deepgram Keyterm Prompting) ───────────────────
// SPELL_KEYTERMS: 70-entry SRD spell vocabulary subset (it,en) consumed by the
// bridge `keyterm-merger.ts` to feed Deepgram Nova-3 Multilingual's `keyterm`
// param. Lives in shared-protocol so the bridge does NOT depend on foundry-mcp.
// Drift-proofed against foundry-mcp's SPELL_LOOKUP via the SKT-02 test gate.

export {
  SPELL_KEYTERMS,
  type SpellKeytermEntry,
} from './voice/spell-keyterms.js';

// ─── Quick Task 260529-h5e — Debug Console schemas (dev-only) ─────────────────
// Lean dev-tooling contracts for the bridge debug backend (Wave 2), CRT dashboard
// (Wave 3), and g2-app display-op mirror (Wave 4). Models the privileged dev
// backdoor described in the plan's <security_model>. DebugGestureBodySchema.kind
// reuses the canonical 5 R1 gesture kinds from R1GesturePayloadSchema.

export {
  type DebugDispatchBody,
  DebugDispatchBodySchema,
  type DebugEvent,
  DebugEventSchema,
  type DebugGestureBody,
  DebugGestureBodySchema,
  type DebugInjectBody,
  DebugInjectBodySchema,
  type DisplayOpPayload,
  DisplayOpPayloadSchema,
  R1_DEBUG_DISPLAYOP_TYPE,
} from './debug/debug-events.js';

// ─── Quick Task 260604-cwa — Agent control-channel schemas (dev-only) ──────────
// Wire-protocol contracts for the debug agent control channel: a WS endpoint
// where the g2-app connects AS a named agent, a relay (POST /debug/cmd) that
// routes commands and correlates results by id, /debug/agents roster, and
// aggregated /debug/logs reader with newest-id tracking.

export {
  type AgentClientFrame,
  AgentClientFrameSchema,
  type AgentCommand,
  AgentCommandSchema,
  type AgentLog,
  AgentLogSchema,
  type AgentRegister,
  AgentRegisterSchema,
  type AgentResult,
  AgentResultSchema,
  type AgentRole,
  AgentRoleSchema,
  DEBUG_AGENT_LOG_DIRECTION,
  DEBUG_AGENT_RESULT_DIRECTION,
  type DebugCmdBody,
  DebugCmdBodySchema,
} from './debug/agent-protocol.js';
