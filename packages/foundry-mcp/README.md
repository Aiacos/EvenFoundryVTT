# @evf/foundry-mcp

**Phase 11 V2 optional** — MCP server that exposes the EVF Tool Registry and Phase 2 reader
pipeline over stdio (Claude Desktop local) and Streamable HTTP (remote homelab) to
MCP-compatible AI clients.

## Overview

`foundry-mcp` is a Node 24 MCP server that bridges Claude Desktop (and any MCP client) to a
running FoundryVTT D&D 5e session via the EVF bridge. It exposes:

- **6 MCP tools** — mirroring Phase 7 Tool Registry: cast spell, weapon attack, use item, move token, place AoE template, drop concentration.
- **4 MCP resources** — live snapshots of the current actor, combat, scene, and event log, updated via WebSocket deltas from the bridge.

The server is a thin proxy: tool calls forward to the bridge's `tool.invoke` WS path;
resource reads check an in-memory cache (primed by WS deltas) and fall back to the bridge's
REST endpoints on cold start.

**This module is V2 OPZIONALE** — the MVP works without it. It enables voice/LLM-driven
interaction as an enhancement layer. See ADR-0004.

## Transports

| Transport | Entry | Port | Use Case |
|-----------|-------|------|----------|
| stdio | `dist/index.js` | — | Claude Desktop local integration |
| Streamable HTTP | `dist/http.js` | 8911 | Remote homelab; other MCP clients |

**HTTP+SSE is EXPLICITLY FORBIDDEN** (deprecated 2025-03-26 per MCP spec rev 2025-06-18).
Only stdio and Streamable HTTP are supported. See CONTEXT D-11-01.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EVF_BEARER` | YES | — | Opaque non-expiring bearer token (from the self-service PairModal copy/paste) |
| `EVF_BRIDGE_URL` | YES | — | Bridge HTTP URL, e.g. `http://localhost:8910` |
| `EVF_ACTOR_ID` | no | (auto) | Foundry actor ID; blank = auto-detect first owned actor |
| `MCP_HTTP_PORT` | no | 8911 | HTTP transport listen port |
| `LOG_LEVEL` | no | info | pino log level (trace/debug/info/warn/error) |

The bearer token is NEVER logged (T-11-01). Use Docker secrets or systemd `EnvironmentFile`
in production — do NOT pass `EVF_BEARER` via CLI argument on shared machines (it would
appear in `ps aux` output).

## Build and Run

```bash
# Build
pnpm --filter @evf/foundry-mcp build

# stdio (Claude Desktop):
EVF_BEARER=<token> EVF_BRIDGE_URL=http://localhost:8910 node dist/index.js

# Streamable HTTP (homelab remote):
EVF_BEARER=<token> EVF_BRIDGE_URL=http://localhost:8910 node dist/http.js
```

## Bridge-Soft-Fail Behavior

The server boots and serves `tools/list` and `resources/list` even if the bridge is unreachable.
When the bridge is down, tool calls return `{ success: false, error: "bridge_unreachable" }` with
`isError: true`. This allows Claude Desktop to load the tool schema without requiring the bridge
to be running first.

## MCP Tools (6)

| Tool | Description |
|------|-------------|
| `cast-spell` | Cast a spell from an actor's spell list; handles concentration conflicts |
| `weapon-attack` | Weapon attack with advantage/disadvantage; supports multi-attack via `count` |
| `use-item` | Use a consumable or activated item via dnd5e Activity API |
| `move-token` | Move a token to grid coordinates on the current scene |
| `place-template` | Place an AoE template; player confirms position via R1 ring |
| `drop-concentration` | Drop an active concentration effect before recasting |

Tool input schemas are derived directly from Phase 7's Zod schemas (`.shape` extraction) —
single source of truth, no schema duplication.

## MCP Resources (4)

| Resource URI | Content | Update Mechanism |
|-------------|---------|-----------------|
| `actor://current` | `CharacterSnapshot` — HP, AC, conditions, level, inventory, spells | WS `character.delta` envelope → cache; REST fallback on miss |
| `combat://current` | `CombatSnapshot` — round, turn, initiative order, current combatant | WS `combat.turn` envelope → cache; REST fallback on miss |
| `scene://current` | `SceneViewport` — scene name, camera position, token IDs | WS `scene.viewport` envelope → cache; REST fallback on miss |
| `log://recent` | Last 50 `EventLogEntry[]` — chat, damage, heal, death events | WS `event.log.delta` envelope → ring buffer (cap 50) |

Resources send `sendResourceUpdated` notifications to subscribed MCP clients on each cache update.

## Usage with Claude Desktop

See `docs/claude-desktop-config.example.json` for a copy-pasteable configuration snippet.

Quick start: add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "evf-foundry-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/EvenFoundryVTT/packages/foundry-mcp/dist/index.js"],
      "env": {
        "EVF_BEARER": "REPLACE_WITH_BEARER_FROM_PAIRMODAL",
        "EVF_BRIDGE_URL": "http://localhost:8910",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Usage with Docker Compose (HTTP mode)

See `deploy/foundry-mcp.Dockerfile` and `deploy/docker-compose.yml`. Add Phase 11 env vars
to `deploy/.env` (see `deploy/.env.example` Phase 11 section), then:

```bash
cd deploy/
docker compose up -d --build foundry-mcp
curl http://localhost:8911/healthz  # → 200 ok
```

## Tests

```bash
pnpm --filter @evf/foundry-mcp test          # unit + no-sse-import gate + smoke test
pnpm --filter @evf/foundry-mcp test:smoke    # build + stdio smoke only
```

The `mcp-inspector-smoke.test.ts` test spawns `dist/index.js` as a child process and verifies
the MCP wire protocol: 6 tools + 4 resources returned over stdio, with the bridge unreachable
(port 9999) to exercise the soft-fail path.

## Verification

See `docs/mcp-verification.md` for the complete step-by-step verification procedure covering:
- stdio mode via `@modelcontextprotocol/inspector`
- HTTP mode via curl
- Automated CI verification
- HTTP+SSE deprecation invariant grep

## Voice (Phase 12)

The `src/voice/` subdirectory ships the deterministic resolver layer for the Phase 12 V2 voice path. It contains an IT↔EN spell-name lookup table (70 SRD entries), a Levenshtein fuzzy-match engine with accent-insensitive normalisation, a clarify-detector heuristic that prevents hallucinated spell IDs from reaching the bridge, and the GM-Agent system prompt with 3 worked examples. The Deepgram STT adapter and audio-capture module live in `packages/bridge/src/voice/` and `packages/g2-app/src/engine/` respectively (Phase 12 Plan 03).

## Architecture References

- [ADR-0004: Voice via MCP, not internal](../../docs/architecture/0004-voice-via-mcp-not-internal.md)
- [Specs.md §4.7](../../Specs.md) — MCP transport decisions
- [11-CONTEXT.md](../../.planning/phases/11-v2-foundry-mcp-server/11-CONTEXT.md) — Phase 11 design context + deferred items
