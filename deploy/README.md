# EvenFoundryVTT Bridge — Deployment Guide

Single-tenant homelab Docker Compose deployment per Specs.md §11.5.3.

## Prerequisites

- Docker + Docker Compose v2 (ships with Docker Desktop / Docker Engine 20.10+)
- `openssl` (for secret generation)

## Quick start

### 1. Generate environment file

```bash
cd deploy/
cp .env.example .env
# Edit .env and fill in real values:
#   EVF_INTERNAL_SECRET=$(openssl rand -base64 32)
#   EVF_PLUGIN_HOST_URL=https://your-g2app-host.example.com
```

### 2. Production boot

```bash
cd deploy/
docker compose up -d --build
```

Verify the bridge is healthy:

```bash
curl http://localhost:8910/healthz
# → 200 OK: {"status":"ok"}
```

### 3. Development boot (debug logs)

```bash
cd deploy/
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Development override adds `LOG_LEVEL=debug` and `EVF_PLUGIN_HOST_URL=http://localhost:5173`.

### 4. Stop

```bash
cd deploy/
docker compose down
```

## Generate EVF_INTERNAL_SECRET

```bash
openssl rand -base64 32
```

The resulting string (≥32 chars) is what to set in `deploy/.env` as `EVF_INTERNAL_SECRET`.
The bridge refuses to start in production if this value is missing or empty (fail-fast guard).

## Security: single-host LAN binding (T-03-19)

By default `docker-compose.yml` binds port 8910 to all interfaces (`0.0.0.0`).
For a single-host setup where only local processes need access, change:

```yaml
ports:
  - "127.0.0.1:8910:8910"
```

## Ops endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /healthz` | None | Liveness probe — always 200 if process is up |
| `GET /readyz` | None | Readiness probe — 200 if `EVF_INTERNAL_SECRET` is set, 503 otherwise |
| `GET /metrics` | None | Prometheus metrics (see T-03-19 for LAN exposure note) |
| `GET /v1/health` | Bearer | Authenticated health — tests token validity |
| `GET /v1/tools` | Bearer | Returns registered tool list (7 entries) |

## Smoke test (requires Docker daemon)

```bash
cd deploy/
bash smoke.sh
```

The script builds, boots, runs curl assertions against all 4 endpoints, then tears down.

### CI smoke test

`smoke.sh` is committed as the operational contract for manual/CD use.
It is NOT wired to GitHub Actions CI (which would require Docker-in-Docker setup).

## Phase 11 MCP server (V2 optional)

The `foundry-mcp` service is the Phase 11 V2 MCP server. It exposes EVF's Tool Registry
and reader pipeline over the MCP protocol (stdio + Streamable HTTP), enabling Claude Desktop
and other MCP clients to cast spells, move tokens, and read the current combat/actor state.

### When to use stdio mode (Claude Desktop, local)

For Claude Desktop integration, run the stdio entrypoint directly — no Docker needed:

```bash
# Build the package first
pnpm --filter @evf/foundry-mcp build

# Point Claude Desktop at the built entrypoint:
# In ~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or equivalent:
# See docs/claude-desktop-config.example.json for the full config snippet.
node /absolute/path/to/EvenFoundryVTT/packages/foundry-mcp/dist/index.js
```

Environment variables are supplied via Claude Desktop's `"env"` field in the config —
see `docs/claude-desktop-config.example.json`.

### When to use HTTP mode (remote homelab, Docker)

For remote homelab access, bring up the `foundry-mcp` service alongside the bridge:

```bash
cd deploy/
# Add EVF_BEARER + EVF_BRIDGE_URL to your .env (see .env.example Phase 11 section)
docker compose up -d --build foundry-mcp
```

The `foundry-mcp` service depends on `bridge` with `condition: service_healthy` — the bridge
must be healthy before the MCP server starts.

Verify the MCP server is running:

```bash
curl http://localhost:8911/healthz
# → 200 ok
```

### Env-var contract (foundry-mcp)

See `deploy/.env.example` (Phase 11 section) for the 4 MCP-specific variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `EVF_BEARER` | Yes | non-expiring bearer from the self-service PairModal (copy/paste) |
| `EVF_BRIDGE_URL` | Yes | Bridge HTTP URL (default: `http://bridge:8910` in Compose) |
| `EVF_ACTOR_ID` | No | Specific Foundry actor ID; blank = auto-detect |
| `MCP_HTTP_PORT` | No | HTTP port for Streamable HTTP transport (default 8911) |

### Verification

See `docs/mcp-verification.md` for the complete step-by-step verification procedure
covering stdio (MCP Inspector) and HTTP (curl) modes.

**HTTP+SSE is NOT supported** (deprecated 2025-03-26, MCP spec rev 2025-06-18). Only
Streamable HTTP (port 8911) and stdio are available.

## Troubleshooting

**Bridge exits immediately at startup:**
Check that `deploy/.env` contains `EVF_INTERNAL_SECRET` (non-empty, ≥32 chars).

**`/readyz` returns 503:**
`EVF_INTERNAL_SECRET` env var is missing from the running container.
Confirm `env_file: .env` in `docker-compose.yml` points to an existing `deploy/.env`.

**Port 8910 already in use:**
Change `ports` in `docker-compose.yml` to `"8911:8910"` and update `BRIDGE_URL` in your
`g2-app` config accordingly.
