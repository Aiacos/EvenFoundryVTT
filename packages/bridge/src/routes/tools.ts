/**
 * Tool Registry routes — ADR-0003.
 *
 * Registers two routes on the Fastify instance:
 *
 * GET /v1/tools
 *   Auth: Bearer token required.
 *   Returns `{ tools: TOOL_REGISTRY }` — the canonical 7-entry list with
 *   JSON Schema (Draft 2020-12) for each tool's input parameters.
 *   Used by Phase 11 `foundry-mcp` for MCP tool discovery, and by G2 app
 *   UI for dynamic action availability.
 *
 * POST /v1/tools/:name
 *   Auth: Bearer token required.
 *   Body: JSON matching the named tool's Zod input schema.
 *   Idempotency: `Idempotency-Key` header supported (Plan 03-02 middleware).
 *   Flow: 404 unknown tool → 401 bad auth → 400 invalid body → dispatch → 200.
 *   Returns `{ status:'phase-07-pending', tool, idempotency_key, accepted_at }`.
 *
 * T-03-13: unknown tool name returns 404 BEFORE auth check. The canonical list
 *   is already public via `GET /v1/tools` (bearer-gated) so this leaks nothing.
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see Specs.md §5.3 (Tool Registry)
 * @see packages/bridge/src/middleware/idempotency.ts (idempotency middleware)
 */

import { TOOL_INPUT_SCHEMAS, TOOL_REGISTRY, type ToolName } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';
import { TOOL_DISPATCH_TABLE, type ToolHandler } from './tools-dispatch.js';

/**
 * Register GET /v1/tools and POST /v1/tools/:name routes.
 *
 * @param app                  - Fastify instance.
 * @param tokenCache           - Shared token validation cache.
 * @param toolDispatchOverride - Optional per-tool handler overrides for test injection.
 *   Keys must be valid `ToolName` values; unmapped names fall back to `TOOL_DISPATCH_TABLE`.
 */
export async function registerToolsRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
  toolDispatchOverride?: Partial<Record<ToolName, ToolHandler>>,
): Promise<void> {
  /** Effective dispatch table: production defaults merged with test overrides. */
  const dispatchTable: Record<ToolName, ToolHandler> = {
    ...TOOL_DISPATCH_TABLE,
    ...(toolDispatchOverride ?? {}),
  };

  // ── GET /v1/tools ─────────────────────────────────────────────────────────────
  // ADR-0003: returns the full 7-entry registry including JSON Schema per tool.
  app.get('/v1/tools', async (request, reply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'invalid_token' });
    }

    const token = authHeader.slice('Bearer '.length);
    const result = await tokenCache.validate(token);

    if (!result.valid) {
      if (result.reason === 'foundry_unreachable') {
        return reply.status(503).send({ error: 'foundry_unreachable' });
      }
      return reply.status(401).send({ error: 'invalid_token' });
    }

    return reply.status(200).send({ tools: TOOL_REGISTRY });
  });

  // ── POST /v1/tools/:name ──────────────────────────────────────────────────────
  // Flow per ADR-0003 + T-03-13:
  //   1. Whitelist check (404) — BEFORE auth, acceptable per T-03-13 analysis.
  //   2. Bearer auth (401/503).
  //   3. Zod body validation (400).
  //   4. Dispatch to TOOL_DISPATCH_TABLE (plan 03-02 idempotency already cached by onSend).
  //   5. Return 200 + phase-07-pending envelope.
  app.post<{ Params: { name: string } }>('/v1/tools/:name', async (request, reply) => {
    const { name } = request.params;

    // Step 1: T-03-13 — reject unknown tool names before auth.
    if (!(name in dispatchTable)) {
      return reply.status(404).send({ error: 'unknown_tool', tool: name });
    }

    // Step 2: Bearer auth.
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'invalid_token' });
    }

    const token = authHeader.slice('Bearer '.length);
    const validation = await tokenCache.validate(token);

    if (!validation.valid) {
      if (validation.reason === 'foundry_unreachable') {
        return reply.status(503).send({ error: 'foundry_unreachable' });
      }
      return reply.status(401).send({ error: 'invalid_token' });
    }

    // Step 3: Zod body validation.
    const toolName = name as ToolName;
    const schema = TOOL_INPUT_SCHEMAS[toolName];
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.issues });
    }

    // Step 4: Dispatch.
    // The Idempotency-Key middleware (Plan 03-02) intercepts this request
    // BEFORE we reach here if the key+body hash is already cached — so the
    // handler below runs at most once per unique (key, body) pair within the TTL.
    const rawIdempotencyKey = request.headers['idempotency-key'];
    const idempotencyKey = typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey : undefined;

    const result = await dispatchTable[toolName](parsed.data, idempotencyKey);

    // Step 5: Return 200 (idempotency onSend hook caches this response).
    return reply.status(200).send(result);
  });
}
