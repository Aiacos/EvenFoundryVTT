# Phase 11: V2 foundry-mcp Server — Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Source:** smart-discuss (autonomous batch — 1 area accepted)

<domain>
## Phase Boundary

V2 enabler — expose the same Tool Registry over MCP so Claude Desktop / any MCP client can drive Foundry actions via natural language. MVP unaffected; plug-and-play.

**Ships:**
- New `packages/foundry-mcp/` package (alongside g2-app, bridge, foundry-module).
- 6 MCP tools mirroring Phase 7's TOOL_REGISTRY: `cast-spell, weapon-attack, use-item, move-token, place-template, drop-concentration`.
- 4 MCP resources: `actor://current, scene://current, combat://current, log://recent`.
- Two transports: stdio (local Claude Desktop) + Streamable HTTP (remote homelab). HTTP+SSE explicitly forbidden (deprecated 2025-03-26).
- Env-var bearer auth (`EVF_BEARER`) — reuses MVP bearer infrastructure.
- Automated verification via `@modelcontextprotocol/inspector` CLI in `docs/mcp-verification.md`.
- Docker image (`node:24-alpine`) for remote Streamable HTTP deployment.

**NOT in scope:** OAuth (V3+), pairing-flow MCP bearer (V3+), new auth surface.

</domain>

<decisions>
## Implementation Decisions

### Package Structure

- **Location:** `packages/foundry-mcp/`
- **Entry:** `src/index.ts` (stdio default)
- **HTTP entry:** `src/http.ts` (Streamable HTTP transport)
- **Build:** `tsup` (matching bridge); single-file ESM dist.
- **Deps:**
  - `@modelcontextprotocol/sdk@1.29.0` (latest stable, verified npm).
  - `zod@4.4.3` (reuse Phase 7 schemas via workspace dep).
  - `@evf/shared-protocol@workspace:*` (Tool Registry schemas).
  - `pino@10.3.1` (logging, match bridge).
  - `node:24` runtime.

### Tools (mirror Phase 7 TOOL_REGISTRY)

| MCP Tool ID | Mirrors | Args Schema | Notes |
|-------------|---------|-------------|-------|
| `cast-spell` | cast-spell | CastSpellInputSchema (Phase 7 + Plan 09-04 slot_level) | concentration drop handled server-side per Phase 9 |
| `weapon-attack` | weapon-attack | WeaponAttackInputSchema (Phase 7 + Plan 07-04 count) | Path B multi-attack loop |
| `use-item` | use-item | UseItemInputSchema (Phase 7) | |
| `move-token` | move-token | MoveTokenInputSchema (Phase 7) | scene bounds validation |
| `place-template` | place-template | PlaceTemplateInputSchema (Phase 7) | confirm-template-placement is internal flow |
| `drop-concentration` | drop-concentration | DropConcentrationInputSchema (Phase 7 + 09-03) | requires concentrationEffectId |

### Resources

| Resource URI | Source | Update mechanism |
|---|---|---|
| `actor://current` | Phase 2 CharacterSnapshotSchema | WS subscription via bridge `subscribe` |
| `scene://current` | Phase 2 SceneSnapshotSchema | same |
| `combat://current` | Phase 2 CombatSnapshotSchema | same |
| `log://recent` | Phase 5 LogEventSchema (last 50 entries) | same |

### Authentication

- **Env-var bearer:** `EVF_BEARER` env var supplies the bearer at MCP server startup.
- **Validation:** every tool invocation forwards the bearer to the bridge's `tool.invoke` endpoint (existing Phase 7 path). Bridge validates per existing CONN-05 + Phase 7 bearer-validator.
- **Rotation:** if bearer expires (24h per Phase 7 rotation), MCP server logs warn + exits with non-zero. User restarts with refreshed bearer. No silent retries.
- **Streamable HTTP:** binds to `0.0.0.0:8911` (8910 is bridge); same bearer in `Authorization: Bearer <token>` header.

### Verification

- **`docs/mcp-verification.md`** — automated procedure:
  1. Start `foundry-mcp` in stdio mode (`pnpm --filter @evf/foundry-mcp start:stdio`).
  2. Run `npx @modelcontextprotocol/inspector ./dist/index.js` (or `npx mcp-cli ...`).
  3. Send `tools/list` — expect 6 tools.
  4. Send `tools/call cast-spell {...}` against mocked Foundry world (test harness).
  5. Assert chat-card appears (audit log entry).
- **MCP Inspector smoke test** — automated via Vitest in `packages/foundry-mcp/src/__tests__/mcp-inspector-smoke.test.ts`.

### Plan Decomposition (anticipated)

| Wave | Plan | Title |
|------|------|-------|
| 0 | 11-01 | Package scaffold + tsup config + @modelcontextprotocol/sdk install + MCP server skeleton (stdio + HTTP transport + bearer env) |
| 1 | 11-02 | 6 tools registered with Zod schemas + bridge HTTP proxy + verification tests |
| 2 | 11-03 | 4 resources + WS subscription + cache + verification tests |
| 3 | 11-04 | Docker image + `docs/mcp-verification.md` + Claude Desktop integration snippet + Phase 11 closure |

4 plans, sequential.

### Threat Model

- **T-11-01:** Bearer leak via env var (process listing). Mitigated: warn in docs to use Docker secrets / systemd EnvironmentFile in production.
- **T-11-02:** MCP client impersonation. Mitigated: same bearer auth as MVP; no new attack surface.
- **T-11-03:** Streamable HTTP CORS. Mitigated: same origin-whitelist policy as bridge (Specs §3.3).

### Hardware-pending SCs

None — Phase 11 is pure software / Node-side. No G2 hardware involvement. All 4 SCs are automated.

</decisions>

<canonical_refs>
- Specs.md §4.7 (MCP transport — Streamable HTTP only, HTTP+SSE deprecated)
- Specs.md §5.6 (MCP tool registry + verification)
- packages/foundry-module/src/write-path/tool-registry.ts (Phase 7 — mirror source)
- packages/shared-protocol/src/payloads/tool.ts (Phase 7 — Zod schemas)
- packages/bridge/src/server.ts (Phase 7 — handleToolInvoke pattern)
- modelcontextprotocol.io/specification/2025-06-18/basic/transports

</canonical_refs>

<deferred>
- OAuth flow + per-client bearer (V3+).
- Multi-tenant MCP server (Phase 13 stretch).
- HTTP+SSE legacy transport (deprecated).

</deferred>

---

*Phase 11 context — 2026-05-17 via smart-discuss (1 area)*
