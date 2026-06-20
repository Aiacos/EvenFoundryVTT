# Runbook — EvenFoundryVTT Bridge

Operational procedures for the EvenFoundryVTT Bridge service (Phase 3+). Day-to-day ops:
restart, audit log inspection, bearer revoke, metrics, and common error recovery.

**Canonical reference:** `Specs.md §5.2` (bridge stack), `Specs.md §11.5.4` (auth), Phase 7 Plan 01 (audit log).

---

## Restart the bridge

### Docker Compose (recommended)

```bash
# From the repo root
docker compose -f deploy/docker-compose.yml restart bridge

# Verify the bridge is alive and ready
curl http://bridge:8910/healthz
# Expected: 200 OK
# { "status": "ok", "version": "x.y.z", "ts": 1234567890 }

curl http://bridge:8910/readyz
# Expected: 200 OK when bearer registry is loaded and Foundry WS is connected
# { "ready": true }
```

### Without Docker (dev)

```bash
pnpm --filter @evf/bridge build
node packages/bridge/dist/index.js
```

Or with live reload:

```bash
pnpm --filter @evf/bridge dev
```

### Startup sequence

On startup the bridge:

1. Loads the bearer registry from `BEARER_REGISTRY_PATH` (creates file if missing).
2. Opens a WebSocket connection to Foundry at `FOUNDRY_WS_URL`.
3. Registers the Fastify plugin routes (REST + WS) and begins listening on `BRIDGE_PORT` (default `8910`).
4. Sets `ready = true` once the Foundry WS handshake completes.

The Even Realities App plugin should observe the boot splash advance to `[ ✓ ] Foundry sync`
within a few seconds of a successful restart.

---

## Inspect the audit log

Every `dispatchTool` call (weapon attack, cast spell, use item, etc.) writes a **GM-only hidden
`ChatMessage`** with `whisper: gmIds` and `flags.evf.audit` (Phase 7 Plan 01, INV-6).

### From the Foundry console (GM client)

```js
// List the last 20 audit entries
game.messages.contents
  .filter(m => m.flags?.evf?.audit)
  .slice(-20)
  .forEach(m => console.log(m.flags.evf.audit));
```

### Audit record shape

```json
{
  "ts": 1731234567890,
  "session_id": "uuid",
  "bearer_hash": "sha256(bearer).slice(0,16)",
  "tool_id": "cast_spell",
  "idempotency_key": "uuid",
  "result": "ok",
  "latency_ms": 215
}
```

### Bridge-side structured logs (pino)

```bash
# Tail the bridge container logs
docker compose -f deploy/docker-compose.yml logs -f bridge

# Filter for audit events
docker compose -f deploy/docker-compose.yml logs bridge | grep '"type":"audit"'

# Filter by player (bearer hash prefix)
docker compose -f deploy/docker-compose.yml logs bridge | grep '"bearer_hash":"abc123'
```

---

## Revoke a bearer token

Use when a G2 device is lost, a player leaves the group, or a token is compromised.

### Via the Foundry module (recommended)

GM: **Foundry Settings** → **Module Settings** → **EvenFoundryVTT** → **"Revoke G2 device"**
→ select the device by name → **Confirm revoke**.

The module calls `POST /admin/bearer/revoke` on the bridge with the DM's bearer token in the
`Authorization` header.

### Via curl (fallback)

```bash
curl -X POST \
  -H "Authorization: Bearer <dm-bearer-token>" \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "<device-uuid>", "reason": "player left"}' \
  http://bridge:8910/admin/bearer/revoke

# Expected: 200 OK { "revoked": true, "deviceId": "..." }
```

The revoked token is immediately invalidated in the in-memory registry and persisted to
`BEARER_REGISTRY_PATH`. Bearer tokens are otherwise **non-expiring (campaign-long)**, so this is
the only way a token stops working: the G2 device will see `TOKEN_EXPIRED` on the next request and
display a re-pair prompt.

---

## Metrics / Logs

### Prometheus metrics

```bash
curl http://bridge:8910/metrics
# Content-Type: text/plain; version=0.0.4; charset=utf-8
# Returns: standard Prometheus exposition format
```

Key metrics exported:

| Metric | Type | Description |
|--------|------|-------------|
| `evf_dispatch_total` | counter | `dispatchTool` calls by `tool_id` + `result` label |
| `evf_dispatch_duration_ms` | histogram | latency of each dispatch (p50 / p95 / p99) |
| `evf_ws_reconnect_total` | counter | Foundry WS reconnect events |
| `evf_bearer_revoke_total` | counter | bearer revoke events |
| `evf_replay_buffer_size` | gauge | current seq-buffer depth per session |
| `http_request_duration_ms` | histogram | Fastify route latency |

### Shipping to Loki / CloudWatch (Phase 13 stretch)

For MVP single-tenant homelab: **Docker container stdout is sufficient**. Pipe through
`pino-pretty` for human-readable dev output:

```bash
docker compose -f deploy/docker-compose.yml logs -f bridge | npx pino-pretty
```

Production log aggregation (Loki / CloudWatch / Datadog) is a Phase 13 cloud stretch — not
required for homelab MVP.

---

## Common errors with recovery

| Error / Symptom | Cause | Recovery |
|-----------------|-------|----------|
| `⚠ SYNC LOST` chip on G2 | WS connection to bridge dropped | WS auto-reconnects (exponential backoff 1s→30s, Plan 10-01). Check bridge health via `/healthz`. If bridge is down: `docker compose restart bridge`. |
| `BOOT_HANDSHAKE_FAIL` | Bridge not ready when plugin loaded | Wait for `/readyz` to return `{ "ready": true }`. Check `FOUNDRY_WS_URL` is reachable from inside the Docker container. |
| `TOKEN_EXPIRED` | Bearer was **revoked** (tokens are non-expiring now, so this no longer means a TTL expiry) | Re-pair: Foundry Settings → Pair a G2 device → copy the new token from the PairModal → paste it into the phone wizard. |
| `MIDIQOL_AUTO_FAST_FORWARD_OFF` | MidiQOL Workflow setting not configured | Foundry → Module Settings → MidiQOL → Workflow → enable "Auto fast-forward attack". Required for full weapon-attack flow. |
| `ERR_BRIDGE_WS_CLOSED` on Foundry side | Foundry restarted while bridge was connected | Bridge auto-reconnects to Foundry WS within a few seconds. If it persists, restart the bridge container. |
| `/healthz` returns 503 | Bridge crashed or unhealthy | `docker compose -f deploy/docker-compose.yml restart bridge` then watch logs for startup errors. |
| `/readyz` returns `{ "ready": false }` | Foundry WS handshake not yet complete | Bridge is starting. Wait 5-10 seconds. Check `FOUNDRY_WS_URL` env var is correct. |
| Replay buffer overflow log line | Client disconnected for >60 seconds (buffer TTL) | Client will rejoin from latest seq. No action needed — expected behaviour for long disconnects. |

---

## See also

- `docs/setup-guide.md` — initial install walkthrough (bridge env vars, Docker Compose).
- `docs/firmware-compatibility.md` — Even Hub SDK matrix.
- [Plan 10-01 SUMMARY](../​.planning/phases/10-polish-field-test-mvp/10-01-SUMMARY.md) — WS reconnect + `⚠ SYNC LOST` chip implementation.
- [Plan 10-02 SUMMARY](../​.planning/phases/10-polish-field-test-mvp/10-02-SUMMARY.md) — perf probe + `r1.perf.sample` envelope.
- `Specs.md §5.2` — Bridge technology stack (Fastify + ws + pino + prom-client).
- `Specs.md §11.5.4` — Auth + bearer lifecycle.
- `Specs.md §11.5.8.1` — WS reconnect resilience canonical.
