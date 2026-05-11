# @evf/bridge

EVF Bridge service — Node 24 Fastify + ws CORS-friendly reverse-proxy with bearer auth + Tool Registry.

**Status:** Phase 3 placeholder. Real implementation lands in Phase 3 (Bridge Service Skeleton).

## Stack (Phase 3 install)

- Fastify 5.8.5 + @fastify/websocket 11.2.0 + @fastify/cors 11.2.0 + @fastify/rate-limit 10.3.0
- `ws@8.20.0` for outbound Foundry socket
- `zod@4.4.3` (via @evf/shared-protocol workspace:*)
- `pino@10.3.1` structured logging
- `prom-client@15.1.3` Prometheus metrics
- `qrcode@1.5.4` pairing QR generation

## Endpoints (Phase 3)

- `POST /v1/actor/*` — Tool Registry dispatch
- `GET /v1/scene`, `GET /v1/combat` — read API
- `GET /v1/tools` — Tool Registry discovery
- `/healthz`, `/readyz`, `/metrics` — ops

## Deployment

Docker Compose homelab single-tenant — `Dockerfile` under `deploy/` (Phase 3).
