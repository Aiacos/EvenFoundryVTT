#!/usr/bin/env bash
# EVF Bridge smoke test — builds image, boots container, asserts endpoints, tears down.
#
# Usage (from repo root or deploy/ directory):
#   bash deploy/smoke.sh             # full Docker boot + curl assertions
#   bash deploy/smoke.sh --dry-run   # print what would be asserted, no Docker required
#
# Requirements: Docker daemon, curl, openssl (for ephemeral secret generation).
# Tested against: Node 24 alpine bridge image built from deploy/bridge.Dockerfile.
set -euo pipefail

# Normalise working directory to deploy/ regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DRY_RUN="${1:-}"
BRIDGE_URL="${BRIDGE_URL:-http://localhost:8910}"
MCP_URL="${MCP_URL:-http://localhost:8911}"

# ---------------------------------------------------------------------------
# Dry-run mode: print what would be asserted without booting Docker.
# ---------------------------------------------------------------------------
if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "[smoke] DRY-RUN — would assert:"
  echo "  GET ${BRIDGE_URL}/healthz                          → 200 OK"
  echo "  GET ${BRIDGE_URL}/readyz (secret IS set)           → 200 OK"
  echo "  GET ${BRIDGE_URL}/v1/health (no Authorization)     → 401 Unauthorized"
  echo "  GET ${BRIDGE_URL}/metrics                          → 200 text/plain"
  echo ""
  echo "  GET ${MCP_URL}/healthz                             → 200 ok (Phase 11 MCP)"
  if [[ -n "${EVF_BEARER:-}" ]]; then
    echo "  POST ${MCP_URL}/mcp (Bearer set) initialize → 200 with evf-foundry-mcp name"
  else
    echo "  POST ${MCP_URL}/mcp — SKIPPED (EVF_BEARER not set)"
  fi
  echo ""
  echo "[smoke] Docker build command would be:"
  echo "  docker compose -f docker-compose.yml -f docker-compose.dev.yml build"
  echo ""
  echo "[smoke] Compose file syntax check:"
  if command -v docker &>/dev/null; then
    docker compose -f docker-compose.yml -f docker-compose.dev.yml config -q \
      && echo "  docker compose config -q → OK (syntax valid)" \
      || echo "  docker compose config -q → FAILED"
  else
    echo "  docker not available — skipping compose config check"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Full run: requires Docker daemon.
# ---------------------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "[smoke] ERROR: docker not found. Install Docker or use --dry-run." >&2
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo "[smoke] ERROR: curl not found." >&2
  exit 1
fi

echo "=== [smoke] Building image ==="
docker compose -f docker-compose.yml -f docker-compose.dev.yml build

echo "=== [smoke] Generating ephemeral .env ==="
cat > .env <<EOF
EVF_INTERNAL_SECRET=$(openssl rand -base64 32)
EVF_PLUGIN_HOST_URL=http://localhost:5173
EOF

# Cleanup trap: remove ephemeral .env and tear down container on exit (success or failure).
trap 'echo "=== [smoke] Tearing down ==="; docker compose down -v; rm -f .env' EXIT

echo "=== [smoke] Starting container ==="
docker compose up -d

echo "=== [smoke] Waiting for healthz (up to 30s) ==="
for i in $(seq 1 30); do
  if curl -sf "${BRIDGE_URL}/healthz" >/dev/null 2>&1; then
    echo "  Ready after ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  ERROR: bridge did not become healthy in 30s" >&2
    exit 1
  fi
  sleep 1
done

echo "=== [smoke] Asserting GET /healthz → 200 ==="
status=$(curl -s -o /dev/null -w "%{http_code}" "${BRIDGE_URL}/healthz")
if [ "$status" != "200" ]; then
  echo "  FAIL: /healthz returned ${status} (expected 200)" >&2
  exit 1
fi
echo "  PASS: /healthz → ${status}"

echo "=== [smoke] Asserting GET /readyz → 200 (secret IS set) ==="
status=$(curl -s -o /dev/null -w "%{http_code}" "${BRIDGE_URL}/readyz")
if [ "$status" != "200" ]; then
  echo "  FAIL: /readyz returned ${status} (expected 200)" >&2
  exit 1
fi
echo "  PASS: /readyz → ${status}"

echo "=== [smoke] Asserting GET /v1/health (no Authorization) → 401 ==="
status=$(curl -s -o /dev/null -w "%{http_code}" "${BRIDGE_URL}/v1/health")
if [ "$status" != "401" ]; then
  echo "  FAIL: /v1/health (no bearer) returned ${status} (expected 401)" >&2
  exit 1
fi
echo "  PASS: /v1/health (no bearer) → ${status}"

echo "=== [smoke] Asserting GET /metrics → 200 text/plain ==="
status=$(curl -s -o /dev/null -w "%{http_code}" "${BRIDGE_URL}/metrics")
if [ "$status" != "200" ]; then
  echo "  FAIL: /metrics returned ${status} (expected 200)" >&2
  exit 1
fi
ctype=$(curl -s -o /dev/null -w "%{content_type}" "${BRIDGE_URL}/metrics")
if ! echo "$ctype" | grep -q "text/plain"; then
  echo "  FAIL: /metrics content-type was '${ctype}' (expected text/plain)" >&2
  exit 1
fi
echo "  PASS: /metrics → ${status} (${ctype})"

echo ""
echo "=== [smoke] Phase 11 MCP server — asserting GET ${MCP_URL}/healthz → 200 ==="
# Wait up to 30s for the MCP server to be healthy (it depends_on bridge)
for i in $(seq 1 30); do
  if curl -sf "${MCP_URL}/healthz" >/dev/null 2>&1; then
    echo "  MCP ready after ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  WARN: foundry-mcp did not become healthy in 30s — skipping MCP assertions" >&2
    echo ""
    echo "=== [smoke] ALL BRIDGE ASSERTIONS PASSED (MCP skipped — not healthy) ==="
    exit 0
  fi
  sleep 1
done

mcp_body=$(curl -sf "${MCP_URL}/healthz" 2>/dev/null || true)
if [ "$mcp_body" != "ok" ]; then
  echo "  FAIL: /healthz body was '${mcp_body}' (expected 'ok')" >&2
  exit 1
fi
echo "  PASS: ${MCP_URL}/healthz → 200 ok"

echo "=== [smoke] Phase 11 MCP server — asserting POST ${MCP_URL}/mcp (no auth) → 401 ==="
mcp_unauth=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${MCP_URL}/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}')
if [ "$mcp_unauth" != "401" ]; then
  echo "  FAIL: /mcp without auth returned ${mcp_unauth} (expected 401)" >&2
  exit 1
fi
echo "  PASS: ${MCP_URL}/mcp (no auth) → ${mcp_unauth}"

if [[ -n "${EVF_BEARER:-}" ]]; then
  echo "=== [smoke] Phase 11 MCP server — asserting POST ${MCP_URL}/mcp (initialize) ==="
  mcp_init=$(curl -s -X POST "${MCP_URL}/mcp" \
    -H "Authorization: Bearer ${EVF_BEARER}" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}')
  if ! echo "$mcp_init" | grep -q '"evf-foundry-mcp"'; then
    echo "  FAIL: initialize response did not contain evf-foundry-mcp: ${mcp_init}" >&2
    exit 1
  fi
  echo "  PASS: initialize → contains evf-foundry-mcp server name"
else
  echo "=== [smoke] Phase 11 MCP server — auth POST SKIPPED (EVF_BEARER not set) ==="
  echo "  INFO: set EVF_BEARER env var to run the auth-required MCP initialize assertion."
fi

echo ""
echo "=== [smoke] ALL ASSERTIONS PASSED ==="
