/**
 * TOOL_DISPATCH_TABLE — ADR-0003 tool dispatch stub layer.
 *
 * Each entry maps a `ToolName` to a `ToolHandler` that returns the
 * `phase-07-pending` envelope. Phase 07 replaces each handler with a real
 * socketlib `executeAsGM` roundtrip to the Foundry-module stub registered in
 * `socketlib-handlers.ts`.
 *
 * Phase 03 design (Option A — single-workflow-origin discipline, Phase 0 D-15):
 * stubs only; NO activity.use calls (ADR-0011 — all mutations via executeAsGM in foundry-module); NO MidiQOL contact.
 *
 * `TOOL_DISPATCH_TABLE` is a plain `Record` rather than a class so tests can
 * override individual entries via `BuildServerOptions.toolDispatchOverride`
 * without affecting other entries (partial override pattern).
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see packages/bridge/src/routes/tools.ts (consumer)
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts (Foundry side stubs)
 */

import type { ToolName } from '@evf/shared-protocol';

/**
 * The response envelope returned by every tool dispatch call.
 *
 * `status: 'phase-07-pending'` signals to callers that the action was
 * accepted but real execution is deferred to Phase 07. The `idempotency_key`
 * echoes the `Idempotency-Key` request header (or `null` when absent), so
 * clients can correlate replayed responses.
 */
export interface ToolDispatchResult {
  status: 'phase-07-pending';
  tool: ToolName;
  idempotency_key: string | null;
  accepted_at: number;
}

/**
 * Type for a single tool dispatch handler.
 *
 * @param input         - Pre-validated tool input (already parsed by Zod in the route handler).
 * @param idempotencyKey - `Idempotency-Key` header value, or `undefined` if absent.
 */
export type ToolHandler = (
  input: unknown,
  idempotencyKey: string | undefined,
) => Promise<ToolDispatchResult>;

/**
 * Build a stub handler for the given tool name.
 *
 * Returns the `phase-07-pending` envelope immediately without touching any
 * Foundry game state. Phase 07 will replace each stub with a real
 * `socketlib.executeAsGM(...)` call.
 */
function makeStub(tool: ToolName): ToolHandler {
  return async (_input: unknown, key: string | undefined): Promise<ToolDispatchResult> => ({
    status: 'phase-07-pending' as const,
    tool,
    idempotency_key: key ?? null,
    accepted_at: Date.now(),
  });
}

/**
 * The canonical dispatch table mapping each `ToolName` to its handler.
 *
 * Production wiring: each entry calls `makeStub(toolName)` which returns the
 * `phase-07-pending` envelope without touching game state (Phase 03 boundary).
 *
 * Test injection: pass `toolDispatchOverride` in `BuildServerOptions` to
 * replace individual entries with `vi.fn()` spies.
 *
 * @see BuildServerOptions.toolDispatchOverride in packages/bridge/src/server.ts
 */
export const TOOL_DISPATCH_TABLE: Record<ToolName, ToolHandler> = {
  cast_spell: makeStub('cast_spell'),
  weapon_attack: makeStub('weapon_attack'),
  use_item: makeStub('use_item'),
  skill_check: makeStub('skill_check'),
  move_token: makeStub('move_token'),
  place_template: makeStub('place_template'),
  set_targets: makeStub('set_targets'),
};
