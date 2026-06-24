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
// Import the idempotency cache + audit log (both in the same write-path subdir).
// tool-registry.ts is the assembly point for Task 2: dispatchTool wires these together.

import { type AuditEntry, writeAuditLog } from './audit-log.js';
import { beginTrace, traceCurrent } from './debug-trace.js';
import { buildCacheKey, hashBearer, IdempotencyStore } from './idempotency-cache.js';

// ─── ToolId union ─────────────────────────────────────────────────────────────

/**
 * Union of all Phase 7 tool IDs (kebab-case, matching wire-protocol).
 *
 * Matches the `TOOL_ID_SCHEMA` enum in `@evf/shared-protocol/payloads/tool`.
 * Intentionally closed — new tools require an ADR-0011 amendment and a Plan update.
 *
 * Mapping to socketlib handler IDs: {@link TOOL_HANDLER_IDS}.
 *
 * # Plan 07-03 extension: `'confirm-template-placement'`
 *
 * Added in Plan 07-03 (Wave 2) — the confirm handler takes the socketlib slot
 * previously occupied by `evf.skillCheck` (stub renamed in-place; skill-check
 * moves to Phase 8/9 when ACT-01 ships). Total handler count stays 14.
 *
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts (evf.confirmTemplatePlacement)
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 2
 */
export type ToolId =
  | 'cast-spell'
  | 'weapon-attack'
  | 'use-item'
  | 'move-token'
  | 'drop-concentration'
  | 'place-template'
  | 'confirm-template-placement'
  // Phase 13 ACT-04 reaction handlers (Plan 13-01 — count FLIPS 14 → 17)
  | 'cast-shield'
  | 'cast-counterspell'
  | 'opportunity-attack'
  // Phase 8 write channel — direct skill/ability check roll (ACT-01).
  // No NEW socketlib handler is registered (the poll-based poller calls
  // dispatchToolAuthorized directly); TOOL_HANDLER_IDS keeps a mapping entry for
  // type-completeness only. The socketlib `socket.register` count stays 17.
  | 'skill-check';

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
export type ToolResult = { success: true; data: unknown } | { success: false; error: string };

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
 *     // args is typed as CastSpellArgs (validated by argsSchema). The handler
 *     // already runs in GM context; the bridge reaches it via
 *     // socket.executeAsGM(handlerId, ...args) using the socketlib socket.
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
  safeParse(
    data: unknown,
  ): { success: true; data: T } | { success: false; error: { message: string } };
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
 * The bridge invokes a GM handler via the socketlib socket's
 * `socket.executeAsGM(handlerId, ...args)` (real farling42/foundryvtt-socketlib
 * API — name first, NO moduleId argument). The module side dispatches via
 * `dispatchTool` directly (it already runs in GM context). The socketlib handler
 * registrations in `socketlib-handlers.ts` use these same IDs.
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
  /**
   * Plan 07-03: confirm-template-placement maps to `evf.confirmTemplatePlacement`.
   *
   * This handler REPLACES the `evf.skillCheck` stub registration in-place
   * in `socketlib-handlers.ts`. The total `socket.register(name, fn)` count
   * (via the socket from `socketlib.registerModule(MODULE_ID)`) stays 14.
   * Skill-check will be re-registered in Phase 8/9 when ACT-01 ships.
   *
   * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 2
   */
  'confirm-template-placement': 'evf.confirmTemplatePlacement',
  // Phase 13 ACT-04 reaction handlers (Plan 13-01 — count FLIPPED 14 → 17)
  'cast-shield': 'evf.castShield',
  'cast-counterspell': 'evf.castCounterspell',
  'opportunity-attack': 'evf.opportunityAttack',
  /**
   * Phase 8 write channel — `skill-check` maps to `evf.rollSkill` for type-completeness.
   *
   * NOTE: NO socketlib handler is registered for this id (the socketlib `socket.register`
   * count stays 17). The Phase 8 reverse-channel poller calls `dispatchToolAuthorized`
   * directly in GM context, so the socketlib path is not used for skill-check. This
   * mapping exists only so `TOOL_HANDLER_IDS` remains a total `Record<ToolId, string>`.
   *
   * @see packages/foundry-module/src/write-path/tool-invocation-poller.ts
   */
  'skill-check': 'evf.rollSkill',
};

// ─── Module-level singleton IdempotencyStore ─────────────────────────────────

/**
 * Shared IdempotencyStore instance for all `dispatchTool` calls in this module.
 *
 * Exported for test isolation (tests call `moduleIdempotencyStore.clear()` between
 * test cases). Production code does not call `clear()` directly.
 *
 * @see IdempotencyStore in ./idempotency-cache.ts
 */
export const moduleIdempotencyStore = new IdempotencyStore();

// ─── In-flight dispatch registry (FIX D) ──────────────────────────────────────

/**
 * Module-scoped in-flight registry for `dispatchTool` (FIX D).
 *
 * Keyed by the same bearer-bound `cacheKey` used by {@link moduleIdempotencyStore},
 * it holds the live `Promise<ToolResult>` for a dispatch that is currently executing
 * (handler.handle + cache set + audit write). Truly-concurrent duplicate calls — two
 * overlapping invocations with the same (bearer, idempotencyKey) that BOTH miss the
 * idempotency cache — collapse onto this single promise: exactly one `handler.handle`,
 * one `moduleIdempotencyStore.set`, and one `writeAuditLog`. The second caller awaits
 * and receives the identical ToolResult.
 *
 * The entry is deleted in a `finally` once the dispatch settles, so the map only ever
 * holds OVERLAPPING calls. A later, non-overlapping retry (after the first settled)
 * re-runs normally — which is required for WR-01 (failures are not cached and stay
 * retryable).
 *
 * Not exported: this is an internal concurrency detail with no test-visible surface
 * beyond the observable single-dispatch guarantee.
 */
const inFlight = new Map<string, Promise<ToolResult>>();

// ─── extractActorId helper ────────────────────────────────────────────────────

/**
 * Defensively extracts an actor ID from raw tool args.
 *
 * Many tools accept `args.actor_id: string` as a convention. If the shape does not
 * match (unknown args type, missing field, non-string value), returns `null`.
 * The audit log entry uses `null` to indicate "actor could not be determined".
 *
 * @param args - Raw args object (type unknown until handler.argsSchema validates it)
 * @returns The actor_id string or null
 */
export function extractActorId(args: unknown): string | null {
  if (
    args !== null &&
    typeof args === 'object' &&
    'actor_id' in args &&
    typeof (args as Record<string, unknown>).actor_id === 'string'
  ) {
    return (args as Record<string, string>).actor_id ?? null;
  }
  return null;
}

// ─── dispatchTool ─────────────────────────────────────────────────────────────

/**
 * Central dispatch function for all write-path tool invocations.
 *
 * Implements the 7-step pipeline per ADR-0011:
 * 1. Compute bearer-bound cache key (`hashBearer(bearer) + ':' + idempotencyKey`)
 * 2. Check idempotency cache — return cached result on hit (no re-execution)
 * 2.5. In-flight dedup (FIX D) — if an overlapping dispatch for the same cacheKey is
 *      already running, return its shared `Promise<ToolResult>` instead of re-executing.
 *      This collapses truly-concurrent duplicates (both cache-misses) to ONE
 *      `handler.handle`, ONE cache set, and ONE audit write; both callers receive the
 *      identical result. The in-flight entry is cleared in a `finally`, so it only ever
 *      holds OVERLAPPING calls — a later sequential retry re-runs (required for WR-01).
 * 3. Look up handler in TOOL_REGISTRY — return `unknown_tool` error on miss
 * 4. Validate args via `handler.argsSchema.safeParse` — return parse error on failure
 * 5. Call `handler.handle(parsedArgs)` wrapped in try/catch — normalise throw to ToolResult
 * 6. Cache the result (bearer-bound key, 60s TTL)
 * 7. Write audit log (fault-tolerant — failure does not propagate)
 *
 * @param toolId - The ToolId to dispatch
 * @param payload - Tool invocation payload
 * @param payload.args - Raw tool arguments (validated by handler.argsSchema)
 * @param payload.idempotencyKey - UUID v4 for cache deduplication
 * @param payload.bearer - Raw bearer token (hashed to build the cache key)
 * @returns Promise<ToolResult> — always resolves, never rejects
 *
 * @see dispatchTool pipeline spec in 07-01-PLAN.md Task 2 <behavior>
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 */
export async function dispatchTool(
  toolId: ToolId,
  payload: { args: unknown; idempotencyKey: string; bearer: string },
): Promise<ToolResult> {
  // Step 1: compute bearer-bound cache key
  const bearerHash = await hashBearer(payload.bearer);
  const cacheKey = buildCacheKey(bearerHash, payload.idempotencyKey);

  // Step 2: idempotency cache lookup — return immediately on hit.
  // A cache hit short-circuits BEFORE touching the in-flight machinery.
  const cached = moduleIdempotencyStore.get(cacheKey);
  if (cached !== undefined) {
    return cached.result;
  }

  // Step 2.5: in-flight dedup (FIX D) — collapse truly-concurrent duplicates.
  // If an overlapping dispatch for this exact cacheKey is already running, return its
  // shared promise so both callers receive the SAME ToolResult from ONE handler.handle.
  const existing = inFlight.get(cacheKey);
  if (existing !== undefined) {
    return existing;
  }

  // Steps 3-7 run inside a single shared promise registered in `inFlight`. `run()`
  // itself never rejects (step 5 catches handler throws, step 7 catches audit throws),
  // so `await p` below cannot reject — preserving "always resolves, never rejects".
  const run = async (): Promise<ToolResult> => {
    beginTrace(`${toolId}:start`);
    // Step 3: handler lookup — return error on unknown tool
    const handler = TOOL_REGISTRY[toolId];
    if (handler === undefined) {
      return { success: false, error: 'unknown_tool' };
    }

    // Step 4: args validation
    const parseResult = handler.argsSchema.safeParse(payload.args);
    if (!parseResult.success) {
      return { success: false, error: parseResult.error.message };
    }

    // Step 5: handler invocation (error isolation). Trace the handler boundary so a
    // remote (browserless) operator can tell a HUNG handler (`…:handler:pending` frozen
    // in the bridge log) from a slow audit write or a clean failure — see debug-trace.ts.
    let result: ToolResult;
    traceCurrent(`${toolId}:handler:pending`);
    try {
      result = await handler.handle(parseResult.data);
      traceCurrent(`${toolId}:handler:done:${result.success}`);
    } catch (err) {
      traceCurrent(`${toolId}:handler:throw`);
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    // Step 6: cache ONLY successful results (WR-01).
    // Failure results are intentionally not cached — failures are retryable (e.g.,
    // `no_gm_connected` when the GM momentarily disconnects). Caching a failure would
    // lock the idempotencyKey for 60s, preventing legitimate retries after transient
    // errors. The spec's idempotency intent is "don't re-execute successful writes",
    // not "don't retry failures".
    if (result.success) {
      moduleIdempotencyStore.set(cacheKey, { result, cachedAt: Date.now() });
    }

    // Step 7: audit log (fault-tolerant — failure must NOT propagate)
    // Plan 09-01 T-09-04: propagate attackId from handler result when present.
    // weapon-attack handler returns { success: true, data: { attackId, attacks } }.
    // Extracting attackId here (at the dispatchTool boundary) avoids changing the
    // weapon-attack handler and keeps the audit-log as the single authoritative
    // source for chat-card deduplication (combat-action-tracker reads it via
    // flags.evf.audit.attackId).
    const resultAttackId: string | undefined =
      result.success &&
      result.data !== null &&
      result.data !== undefined &&
      typeof result.data === 'object' &&
      'attackId' in result.data &&
      typeof (result.data as Record<string, unknown>).attackId === 'string' &&
      ((result.data as Record<string, unknown>).attackId as string).length > 0
        ? ((result.data as Record<string, unknown>).attackId as string)
        : undefined;

    const auditEntry: AuditEntry = {
      tool: toolId,
      payload: payload.args,
      idempotencyKey: payload.idempotencyKey,
      actorId: extractActorId(payload.args),
      result,
      timestamp: Date.now(),
      bearer_id: bearerHash.slice(0, 8), // T-02-01: never the full token
      ...(resultAttackId !== undefined ? { attackId: resultAttackId } : {}),
    };
    try {
      await writeAuditLog(auditEntry);
    } catch {
      // writeAuditLog already catches internally — this outer catch is a safety net
      // in case of unexpected synchronous throws from writeAuditLog itself.
    }
    traceCurrent(`${toolId}:audit:done`);

    return result;
  };

  const p = run();
  inFlight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    // Always clear so the map only holds OVERLAPPING calls; a later non-overlapping
    // retry re-runs (WR-01: failures are not cached and must stay retryable).
    inFlight.delete(cacheKey);
  }
}
