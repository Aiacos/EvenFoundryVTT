/**
 * Tool invocation wire-protocol payload schemas — Phase 7 Plan 01.
 *
 * Defines the canonical envelope payload shape for `tool.invoke` messages
 * emitted by the Bridge when a tool action is requested from g2-app.
 * The Foundry module validates incoming envelopes at the WS-receive trust
 * boundary using these schemas before passing to `dispatchTool`.
 *
 * # Wire format
 *
 * `ToolInvocationEnvelopePayloadSchema` validates the `payload` field inside
 * a `tool.invoke` {@link EnvelopeSchema} envelope. The `args` field is
 * `z.unknown()` at this layer — downstream handlers validate `args` using
 * their own `argsSchema` (ADR-0003 + ADR-0011 pattern).
 *
 * # BearerRotatedPayloadSchema
 *
 * Validates the `bearer.rotated` envelope payload emitted by the module when
 * the 24h bearer rotation occurs. Bridge propagates this to g2-app for token
 * refresh. Implemented in Plan 07-06 (bearer rotation scheduler); schema
 * ships here for forward-compatibility.
 *
 * # Security
 *
 * - T-07-01: `toolId` validation ensures only registered tool IDs are accepted.
 * - T-07-02: `idempotencyKey` UUID validation prevents format-confusion attacks.
 * - Full arg validation is deferred to handler.argsSchema (per ADR-0011).
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 * @see docs/architecture/0003-tool-registry-pattern.md
 * @see ../envelope.ts (EnvelopeSchema — canonical wire carrier)
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 1
 */
import { z } from 'zod';

/**
 * Union of all Phase 7 tool IDs.
 *
 * Kebab-case matches the `ToolId` type in
 * `packages/foundry-module/src/write-path/tool-registry.ts`.
 * The TOOL_HANDLER_IDS mapping in that file translates these to the
 * corresponding socketlib handler IDs (e.g. 'cast-spell' → 'evf.castSpell').
 *
 * The set is intentionally closed — new tools require a Plan update (ADR-0011).
 */
export const TOOL_ID_SCHEMA = z.enum([
  'cast-spell',
  'weapon-attack',
  'use-item',
  'move-token',
  'drop-concentration',
  'place-template',
]);

/**
 * Tool invocation envelope payload schema.
 *
 * Strict-object: extra fields are rejected to prevent silent field smuggling
 * (T-07-01 belt-and-suspenders at the wire boundary).
 *
 * Fields:
 * - `toolId`          — Identifies which registered tool handler to invoke.
 *                       Must be one of the 6 Phase 7 tool IDs.
 * - `idempotencyKey`  — UUID v4 supplied by the caller. Used by `IdempotencyStore`
 *                       to deduplicate requests within the 60s TTL window.
 *                       Bearer-bound key construction (T-07-02) happens in
 *                       `dispatchTool` (`hashBearer + ':' + idempotencyKey`).
 * - `args`            — Tool-specific argument payload. Validated downstream by
 *                       `handler.argsSchema.safeParse(args)` before execution.
 *                       `z.unknown()` here so the envelope layer does not need
 *                       to know about individual handler schemas.
 *
 * @example
 * ```ts
 * const envelope: ToolInvocationEnvelopePayload = {
 *   toolId: 'cast-spell',
 *   idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
 *   args: { actorId: 'abc123', spellId: 'fireball' },
 * };
 * ```
 */
export const ToolInvocationEnvelopePayloadSchema = z
  .object({
    /** Tool to invoke (one of the 6 Phase 7 registered tool IDs). */
    toolId: TOOL_ID_SCHEMA,
    /** UUID v4 for idempotency deduplication. */
    idempotencyKey: z.string().uuid(),
    /** Tool-specific arguments — validated downstream by handler.argsSchema. */
    args: z.unknown(),
  })
  .strict();

/** Inferred TypeScript type for a validated tool invocation payload. */
export type ToolInvocationEnvelopePayload = z.infer<typeof ToolInvocationEnvelopePayloadSchema>;

/**
 * Bearer rotation event payload schema.
 *
 * Validates the `bearer.rotated` envelope payload emitted by the module when
 * the 24h bearer rotation cycle fires. The Bridge propagates this downstream
 * to g2-app so the phone WebView can refresh its stored token.
 *
 * Strict-object: extra fields are rejected.
 *
 * Fields:
 * - `rotatedAt`   — `Date.now()` ms epoch at rotation time. Integer required.
 * - `graceUntil`  — `Date.now()` ms epoch when the old token expires (60s grace).
 *                   Integer required.
 *
 * @see .planning/phases/07-foundry-module-write-path/07-CONTEXT.md §Area 3
 * @see packages/foundry-module/src/pair/bearer-registry.ts (generateBearer refresh=true)
 */
export const BearerRotatedPayloadSchema = z
  .object({
    /** `Date.now()` ms at rotation time. */
    rotatedAt: z.number().int(),
    /** `Date.now()` ms when the old token's grace window expires (rotatedAt + 60_000). */
    graceUntil: z.number().int(),
  })
  .strict();

/** Inferred TypeScript type for a validated bearer rotation payload. */
export type BearerRotatedPayload = z.infer<typeof BearerRotatedPayloadSchema>;
