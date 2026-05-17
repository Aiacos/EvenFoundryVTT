# EVF MCP Server Verification Procedure

Step-by-step verification of the Phase 11 `foundry-mcp` MCP server.
Target audience: EVF maintainers or a Claude Code session performing verification.
Expected time: < 10 minutes per mode.

## Prerequisites

- Node 24 installed (`node --version` → `v24.x.x`)
- pnpm installed (`pnpm --version` → `10.x.x`)
- All workspace packages built: `pnpm -r build` from repo root
- EVF bridge and FoundryVTT running (or use `EVF_BRIDGE_URL=http://localhost:9999` for software-only smoke)
- `EVF_BEARER` env var set to the 24h bearer from the Phase 2 QR-pairing flow (or any string for software-only)

## 1. Stdio Verification via MCP Inspector

The `@modelcontextprotocol/inspector` CLI opens a local web UI for interactive MCP testing.

```bash
# From repo root
export EVF_BEARER=<your-24h-bearer>
export EVF_BRIDGE_URL=http://localhost:8910   # or http://localhost:9999 for software-only

npx @modelcontextprotocol/inspector node packages/foundry-mcp/dist/index.js
```

Expected:
1. Inspector web UI opens at `http://localhost:6274` (or similar local port).
2. Click **Connect** — status shows green.
3. Server info panel shows: `evf-foundry-mcp v0.1.0-alpha.0`, protocol `2025-06-18`.
4. Click **Tools** tab → 6 tools listed:
   - `cast-spell`, `weapon-attack`, `use-item`, `move-token`, `place-template`, `drop-concentration`
5. Click **Resources** tab → 4 resources listed:
   - `actor://current`, `combat://current`, `scene://current`, `log://recent`
6. (With real bridge) Click a tool (e.g. `cast-spell`) → fill in `actor_id`, `spell_id`, `slot_level`, `targets` → click **Run** → response shows tool result.
7. (With bridge unreachable) Tool calls return `bridge_unreachable` error — this is expected soft-fail behavior.

## 2. HTTP Verification via curl

### 2a. Start the MCP HTTP server

**Option A — Docker Compose (recommended for production):**

```bash
cd deploy/
# Add EVF_BEARER + EVF_BRIDGE_URL to .env (see .env.example Phase 11 section)
docker compose up -d --build foundry-mcp
```

**Option B — Direct Node (development):**

```bash
export EVF_BEARER=<your-bearer>
export EVF_BRIDGE_URL=http://localhost:8910
node packages/foundry-mcp/dist/http.js
```

### 2b. Health check (no auth required)

```bash
curl -sf http://localhost:8911/healthz
# Expected: 200 OK, body: ok
```

### 2c. MCP initialize (auth required)

```bash
curl -s -X POST http://localhost:8911/mcp \
  -H "Authorization: Bearer $EVF_BEARER" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl-smoke","version":"0.0.0"}}}'
```

Expected response contains:
```json
{
  "result": {
    "serverInfo": { "name": "evf-foundry-mcp", "version": "0.1.0-alpha.0" },
    "protocolVersion": "2025-06-18"
  }
}
```

### 2d. Auth gate (401 without bearer)

```bash
curl -s -X POST http://localhost:8911/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
# Expected: 401 {"error":"invalid_token"}
```

## 3. Automated CI Verification

The Vitest test suite covers all verification assertions automatically:

```bash
# Run all tests (unit + no-sse-import gate + stdio smoke)
pnpm --filter @evf/foundry-mcp test

# Run only the Inspector smoke test
pnpm --filter @evf/foundry-mcp test:smoke
```

**Test coverage:**

| Test | File | Asserts |
|------|------|---------|
| no-sse-import gate | `src/__tests__/no-sse-import.test.ts` | 0 matches of `server/sse` or `SSEServerTransport` in all source files |
| MCP Inspector smoke | `src/__tests__/mcp-inspector-smoke.test.ts` | Spawns `dist/index.js`, exchanges 4 JSON-RPC frames, asserts 6 tools + 4 resources + server info + clean SIGTERM exit |

The existing `.github/workflows/ci.yml` (Phase 1) already runs `pnpm test` on every PR —
no new CI gate file needed.

## 4. HTTP+SSE Deprecation Invariant

Per MCP spec rev 2025-06-18, HTTP+SSE is deprecated since 2025-03-26. This project enforces the
deprecation as a hard invariant:

```bash
# Must return 0 matches
grep -r "from '@modelcontextprotocol/sdk/server/sse'" packages/foundry-mcp/src/
grep -r "SSEServerTransport" packages/foundry-mcp/src/
```

Both commands must return no output. The `no-sse-import.test.ts` test enforces this
automatically in CI (excludes comment lines and the test file itself from the scan).

## 5. Known Limitations (V2 OPZIONALE)

These are explicitly deferred from Phase 11:

- **No OAuth** — bearer is a single opaque 24h token from the Phase 2 QR-pairing flow.
  OAuth / token rotation is V3+ scope (see 11-CONTEXT.md deferred items).
- **No multi-tenant** — single actor, single session per bearer. Multi-player isolation
  is Phase 13 stretch.
- **No legacy HTTP+SSE transport** — deprecated; Streamable HTTP only.
- **No npm publish** — `@evf/foundry-mcp` is a private workspace package. Publishing to
  npm is out of MVP scope.
- **Real hardware end-to-end** (Foundry world + Claude Desktop + real bridge) is not
  covered by CI — operators verify this manually using the stdio procedure in §1.

## 6. Claude Desktop Configuration

See `docs/claude-desktop-config.example.json` for a copy-pasteable configuration snippet.
Place it in:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

After adding the config, restart Claude Desktop. The `evf-foundry-mcp` server will appear
in Claude Desktop's tool palette.
