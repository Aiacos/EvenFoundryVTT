/**
 * @evf/shared-protocol — TypeScript types + Zod schemas shared across all EVF packages.
 *
 * Single source of truth for protocol contracts per ADR-0002 (WS envelope + idempotency)
 * and ADR-0003 (Tool Registry tool input shapes).
 *
 * Phase 2: first real schemas — WS envelope + handshake messages.
 * Phase 5: fills delta payload union arms (CharacterDelta, CombatTurnDelta, etc.)
 *
 * @see docs/architecture/0002-protocol-versioning.md
 * @see docs/architecture/0003-tool-registry-pattern.md
 * @see Specs.md §4 (architecture) + §5.3 (Tool Registry)
 */
export {
  type DeltaEnvelope,
  DeltaEnvelopeSchema,
  type Envelope,
  EnvelopeSchema,
} from './envelope.js';

export {
  type HandshakeClient,
  HandshakeClientSchema,
  type HandshakeServer,
  HandshakeServerSchema,
  SERVER_CAPS_V1,
  type ServerCap,
} from './handshake.js';
