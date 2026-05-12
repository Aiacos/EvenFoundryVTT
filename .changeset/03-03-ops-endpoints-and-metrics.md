---
"@evf/bridge": patch
---

Add Prometheus metrics infrastructure and ops endpoints (Plan 03-03).

- `prom-client@15.1.3` installed (direct — no `fastify-metrics` fork)
- `createMetricsRegistry()` factory: fresh Registry per call (Pitfall 2 — T-03-10 verified)
- 7 EVF metrics: HTTP duration histogram, WS sessions gauge, replay buffer gauge,
  idempotency store gauge, dedup counter, token cache hit/miss counters
- GET /healthz liveness probe (always 200, no auth)
- GET /readyz readiness probe (503 if EVF_INTERNAL_SECRET missing, no auth)
- GET /metrics Prometheus scrape endpoint (no auth, plain text exposition)
- Label cardinality budget enforced (method/route/status_code only — T-03-09)
- TokenCache metricsHooks constructor arg for hit/miss instrumentation
- Idempotency onDedup callback wired to evf_idempotency_dedup_total counter
- WS session gauge increments on registerSession, decrements on close
- Existing GET /v1/health (bearer-auth wizard endpoint) unchanged
