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
  CHARACTER_DELTA_TYPE,
  type CharacterSnapshot,
  CharacterSnapshotSchema,
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
