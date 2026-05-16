/**
 * Tool Registry — Phase 7 Wave 0 scaffold.
 *
 * Exports the ToolId union, ToolHandler<TArgs> interface, ToolResult discriminated
 * union, TOOL_REGISTRY Record (initially empty — Waves 1-3 fill it via
 * `registerToolHandler`), TOOL_HANDLER_IDS kebab→camelCase socketlib handler
 * name mapping, and `registerToolHandler` helper.
 *
 * `dispatchTool` is added in Task 2 once IdempotencyStore + writeAuditLog are
 * available (Plan 07-01, Task 2 GREEN phase).
 *
 * # Architecture
 *
 * Per ADR-0011 single-workflow-origin discipline, ALL write-path mutations go
 * through `dispatchTool(toolId, payload)` → socketlib.executeAsGM → handler.handle().
 * Handlers live in `packages/foundry-module/src/write-path/handlers/*.ts`.
 *
 * # Handler ID mapping note (Plan 07-05 forward reference)
 *
 * The `evf.dropConcentration` handler ID (ToolId: 'drop-concentration') is a NEW
 * handler that Plan 07-05 will register by REPLACING the existing `evf.setTargets`
 * stub registration call site in `socketlib-handlers.ts`. The total handler count
 * remains 14. This is not adding a new handler — it is renaming the placeholder
 * stub to the real target name. Plan 07-05 documents the rename explicitly.
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 * @see docs/architecture/0003-tool-registry-pattern.md
 * @see packages/foundry-module/src/write-path/idempotency-cache.ts
 * @see packages/foundry-module/src/write-path/audit-log.ts
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md
 */
// No external imports needed — ToolHandler uses a structural type for argsSchema
// to avoid requiring zod as a direct dependency of foundry-module.
// Handlers import their specific ZodSchema types from @evf/shared-protocol.


// ─── ToolId union ─────────────────────────────────────────────────────────────

/**
 * Union of all Phase 7 tool IDs (kebab-case, matching wire-protocol).
 *
 * Matches the `TOOL_ID_SCHEMA` enum in `@evf/shared-protocol/payloads/tool`.
 * Intentionally closed — new tools require an ADR-0011 amendment and a Plan update.
 *
 * Mapping to socketlib handler IDs: {@link TOOL_HANDLER_IDS}.
 */
export type ToolId =
  | 'cast-spell'
  | 'weapon-attack'
  | 'use-item'
  | 'move-token'
  | 'drop-concentration'
  | 'place-template';

// ─── ToolResult ───────────────────────────────────────────────────────────────

/**
 * Discriminated result type returned by every tool handler.
 *
 * Success branch carries `data: unknown` (handler-specific payload).
 * Failure branch carries `error: string` (human-readable error message, safe for logging).
 *
 * @example
 * ```ts
 * const result: ToolResult = await handler.handle(args);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export type ToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

// ─── ToolHandler interface ────────────────────────────────────────────────────

/**
 * Interface that every registered tool handler must implement.
 *
 * `TArgs` is the handler-specific argument type, validated at runtime by
 * `argsSchema.safeParse(rawArgs)` inside `dispatchTool` before calling `handle`.
 *
 * @template TArgs - The argument shape this handler expects.
 *
 * @example
 * ```ts
 * const castSpellHandler: ToolHandler<CastSpellArgs> = {
 *   argsSchema: CastSpellArgsSchema,
 *   handle: async (args) => {
 *     // args is typed as CastSpellArgs (validated by argsSchema)
 *     await executeAsGM(...);
 *     return { success: true, data: { rolled: true } };
 *   },
 * };
 * ```
 */
/**
 * Minimal structural type for a Zod schema-like validator.
 *
 * Using a structural type (not `import type { ZodSchema }`) avoids requiring
 * zod as a direct dependency of foundry-module. Zod is a dep of shared-protocol,
 * not foundry-module. Any object that implements `safeParse` + `parse` satisfies
 * this contract — which all Zod schemas do.
 */
export interface ArgsValidator<T> {
  safeParse(data: unknown):
    | { success: true; data: T }
    | { success: false; error: { message: string } };
  parse(data: unknown): T;
}

export interface ToolHandler<TArgs = unknown> {
  /** Validator used by dispatchTool to parse raw args before calling handle(). */
  argsSchema: ArgsValidator<TArgs>;
  /** GM-side handler implementation. Must return a ToolResult. */
  handle(args: TArgs): Promise<ToolResult>;
}

// ─── TOOL_REGISTRY ────────────────────────────────────────────────────────────

/**
 * Module-level tool handler registry.
 *
 * Initially empty — Waves 1-3 populate it via `registerToolHandler`.
 * `dispatchTool` looks up the handler for a given `ToolId` at call time.
 *
 * Using `Partial<Record<ToolId, ToolHandler<unknown>>>` rather than a full
 * `Record` avoids false-safety: an absent handler returns `undefined` (handled
 * by dispatchTool's "unknown_tool" error branch).
 */
export const TOOL_REGISTRY: Partial<Record<ToolId, ToolHandler<unknown>>> = {};

// ─── registerToolHandler ──────────────────────────────────────────────────────

/**
 * Registers (or replaces) a handler for the given ToolId.
 *
 * Idempotent: calling with the same `id` twice replaces the previous handler.
 * This is intentional — test harnesses and future plan amendments can replace
 * handlers without needing a de-registration step.
 *
 * @param id - The ToolId to register (kebab-case).
 * @param handler - The handler implementation with typed `argsSchema` + `handle`.
 *
 * @example
 * ```ts
 * registerToolHandler('cast-spell', {
 *   argsSchema: CastSpellArgsSchema,
 *   handle: async (args) => { ... },
 * });
 * ```
 */
export function registerToolHandler<T>(id: ToolId, handler: ToolHandler<T>): void {
  TOOL_REGISTRY[id] = handler as ToolHandler<unknown>;
}

// ─── TOOL_HANDLER_IDS ─────────────────────────────────────────────────────────

/**
 * Mapping from kebab-case ToolId to the socketlib handler ID (camelCase prefixed by `evf.`).
 *
 * Used by `dispatchTool` (Task 2) to call `socketlib.executeAsGM(MODULE_ID, handlerId, ...)`.
 * The socketlib handler registrations in `socketlib-handlers.ts` use the same IDs.
 *
 * # Forward reference: `evf.dropConcentration` (Plan 07-05)
 *
 * `drop-concentration` maps to `evf.dropConcentration`. Plan 07-05 will replace
 * the existing `evf.setTargets` stub registration in `socketlib-handlers.ts`
 * with `evf.dropConcentration`. The total handler count stays at 14 — this is
 * a rename, not a new registration. See Plan 07-05 for the rename commit.
 *
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts
 */
export const TOOL_HANDLER_IDS: Record<ToolId, string> = {
  'cast-spell': 'evf.castSpell',
  'weapon-attack': 'evf.weaponAttack',
  'use-item': 'evf.useItem',
  'move-token': 'evf.moveToken',
  'drop-concentration': 'evf.dropConcentration',
  'place-template': 'evf.placeTemplate',
};
