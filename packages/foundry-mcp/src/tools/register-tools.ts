/**
 * registerEvfTools — registers 6 MCP tools on an McpServer instance.
 *
 * Uses Phase 7 Zod schemas (.shape extraction) as the single source of truth
 * for inputSchema — ZERO schema duplication. The SDK uses zod-to-json-schema
 * internally to convert the raw shape to JSON Schema for the wire.
 *
 * Tool name mapping (kebab-case MCP ↔ snake_case bridge):
 * - 'cast-spell'         → invokeTool('cast_spell', args)
 * - 'weapon-attack'      → invokeTool('weapon_attack', args)
 * - 'use-item'           → invokeTool('use_item', args)
 * - 'move-token'         → invokeTool('move_token', args)
 * - 'place-template'     → invokeTool('place_template', args)
 * - 'drop-concentration' → invokeTool('drop_concentration', args)
 *
 * All 6 tools route through the bridge WS `tool.invoke` envelope path via
 * BridgeClient.invokeTool. The snake→kebab conversion happens INSIDE BridgeClient
 * (snakeToKebab utility), not here.
 *
 * Security:
 * - T-11-06: SDK validates args against Phase 7 Zod schemas BEFORE callback.
 *   Bridge re-validates via ToolInvocationEnvelopePayloadSchema at WS-receive boundary.
 *   foundry-module handler.argsSchema validates a 3rd time. Three layers total.
 * - T-11-08: tool error strings from bridge are forwarded verbatim (constant-shape error codes).
 *   LLM never sees Foundry internals beyond these codes.
 *
 * @see packages/shared-protocol/src/tools/ (Phase 7 Zod schemas — single source of truth)
 * @see packages/foundry-mcp/src/tools/bridge-client.ts (WS tool.invoke proxy)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-02-PLAN.md Task 2
 */

import {
  CastSpellInputSchema,
  DropConcentrationInputSchema,
  MoveTokenInputSchema,
  PlaceTemplateInputSchema,
  UseItemInputSchema,
  WeaponAttackInputSchema,
} from '@evf/shared-protocol';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import type { BridgeClient } from './bridge-client.js';
import { type EvfMcpToolId, TOOL_DESCRIPTIONS } from './tool-descriptions.js';

/**
 * Read-only tuple of the 6 MCP tool IDs exposed by foundry-mcp.
 *
 * Excludes Phase 7 TOOL_REGISTRY tools that are not exposed via MCP:
 * - 'confirm-template-placement' — internal flow (not user-facing)
 * - 'skill_check', 'set_targets' — not in Phase 7 TOOL_REGISTRY (Phase 3 REST only)
 *
 * Used by Plan 11-04 verification grep and any future tooling that needs
 * to enumerate MCP-exposed tools.
 */
export const EVF_MCP_TOOL_IDS = [
  'cast-spell',
  'weapon-attack',
  'use-item',
  'move-token',
  'place-template',
  'drop-concentration',
] as const;

/**
 * Snake_case → snake_case pass-through for bridge invokeTool.
 * BridgeClient.invokeTool accepts snake_case names and converts to kebab internally.
 */
const TO_SNAKE: Record<EvfMcpToolId, string> = {
  'cast-spell': 'cast_spell',
  'weapon-attack': 'weapon_attack',
  'use-item': 'use_item',
  'move-token': 'move_token',
  'place-template': 'place_template',
  'drop-concentration': 'drop_concentration',
};

/**
 * Phase 7 Zod schema `.shape` records for each MCP tool.
 *
 * `.shape` extracts the raw shape record from a `z.ZodObject`, which is
 * what `McpServer.registerTool` expects as `inputSchema`. The SDK uses
 * zod-to-json-schema internally to serialize the shape for the wire.
 *
 * CRITICAL: all schemas imported from `@evf/shared-protocol` — zero duplication.
 */
const TOOL_SHAPES = {
  'cast-spell': CastSpellInputSchema.shape,
  'weapon-attack': WeaponAttackInputSchema.shape,
  'use-item': UseItemInputSchema.shape,
  'move-token': MoveTokenInputSchema.shape,
  'place-template': PlaceTemplateInputSchema.shape,
  'drop-concentration': DropConcentrationInputSchema.shape,
} as const;

/**
 * Register all 6 EVF MCP tools on the provided McpServer.
 *
 * Called from `buildMcpServer` after the server is constructed.
 * Each tool callback:
 * 1. Receives args typed by the Phase 7 Zod schema (SDK validates before callback).
 * 2. Calls `bridgeClient.invokeTool(snakeName, args)`.
 * 3. Maps the result to a `CallToolResult` (success → text content; failure → isError).
 *
 * @param server       - The McpServer instance to register tools on.
 * @param bridgeClient - Injected BridgeClient (real or stub for testing).
 * @param logger       - pino logger with bearer-redact config.
 */
export function registerEvfTools(
  server: McpServer,
  bridgeClient: BridgeClient,
  logger: Logger,
): void {
  for (const toolId of EVF_MCP_TOOL_IDS) {
    const { title, description } = TOOL_DESCRIPTIONS[toolId];
    const snakeName = TO_SNAKE[toolId];

    server.registerTool(
      toolId,
      {
        title,
        description,
        // .shape gives McpServer the raw ZodRawShape (not the ZodObject itself).
        // SDK converts internally via zod-to-json-schema for the wire.
        // biome-ignore lint/suspicious/noExplicitAny: ZodRawShape type varies per tool; cast required for union
        inputSchema: TOOL_SHAPES[toolId] as Record<string, any>,
      },
      async (args) => {
        // Bridge is the single source of result — all 6 tools route through WS tool.invoke.
        const result = await bridgeClient.invokeTool(snakeName, args as object);

        if (result.success) {
          return {
            content: [{ type: 'text', text: JSON.stringify(result.data ?? {}) }],
          };
        }

        logger.warn({ toolId, error: result.error }, 'MCP tool.invoke returned failure');
        return {
          content: [{ type: 'text', text: result.error ?? 'unknown_error' }],
          isError: true,
        };
      },
    );
  }

  logger.info({ count: EVF_MCP_TOOL_IDS.length }, 'MCP tools registered');
}
