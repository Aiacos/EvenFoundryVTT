# @evf/foundry-mcp

**Phase 11 V2** — MCP server that exposes the EVF Tool Registry over stdio (Claude Desktop)
and Streamable HTTP (remote homelab) to MCP-compatible AI clients.

## Purpose

Allows Claude Desktop and any MCP-compatible client to drive Foundry VTT D&D 5e actions
(cast spell, weapon attack, use item, move token, place template, drop concentration)
via natural language. The MCP server is a thin proxy that forwards tool calls to the EVF
bridge's existing WebSocket `tool.invoke` path.

## Transports

| Transport | Entry | Port | Use Case |
|-----------|-------|------|----------|
| stdio | `src/index.ts` (`dist/index.js`) | — | Claude Desktop local integration |
| Streamable HTTP | `src/http.ts` (`dist/http.js`) | 8911 | Remote homelab; other MCP clients |

HTTP+SSE is EXPLICITLY FORBIDDEN (deprecated 2025-03-26 per MCP spec rev 2025-06-18).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EVF_BEARER` | YES | — | Opaque 24h bearer token (obtain via Foundry module QR pairing flow) |
| `EVF_BRIDGE_URL` | YES | — | Bridge HTTP URL, e.g. `http://localhost:8910` |
| `MCP_HTTP_PORT` | no | 8911 | HTTP transport listen port |
| `LOG_LEVEL` | no | info | pino log level (trace/debug/info/warn/error) |

The bearer token is NEVER logged. Use Docker secrets or systemd `EnvironmentFile`
in production — do NOT pass `EVF_BEARER` via CLI argument on shared machines (it
would appear in `ps aux` output).

## Usage

```bash
# stdio (for Claude Desktop claude_desktop_config.json):
EVF_BEARER=<token> EVF_BRIDGE_URL=http://localhost:8910 node dist/index.js

# Streamable HTTP (homelab remote):
EVF_BEARER=<token> EVF_BRIDGE_URL=http://localhost:8910 node dist/http.js
```

## MCP Tools

6 tools mirroring Phase 7 Tool Registry:

- `cast-spell` — Cast a spell via actor Activity API
- `weapon-attack` — Make a weapon attack (multi-attack via `count`)
- `use-item` — Use a consumable or activated item
- `move-token` — Move a token to grid coordinates
- `place-template` — Place an AoE template (player confirms via R1 ring)
- `drop-concentration` — Drop active concentration on an actor

## References

- [ADR-0004: Voice via MCP, not internal](../../docs/architecture/0004-voice-via-mcp-not-internal.md)
- [Specs.md §4.7](../../Specs.md) — MCP transport decisions
- [docs/mcp-verification.md](../../docs/mcp-verification.md) — automated MCP Inspector verification (Plan 11-04)
