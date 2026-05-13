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

## Troubleshooting

**Bridge exits immediately at startup:**
Check that `deploy/.env` contains `EVF_INTERNAL_SECRET` (non-empty, ≥32 chars).

**`/readyz` returns 503:**
`EVF_INTERNAL_SECRET` env var is missing from the running container.
Confirm `env_file: .env` in `docker-compose.yml` points to an existing `deploy/.env`.

**Port 8910 already in use:**
Change `ports` in `docker-compose.yml` to `"8911:8910"` and update `BRIDGE_URL` in your
`g2-app` config accordingly.
