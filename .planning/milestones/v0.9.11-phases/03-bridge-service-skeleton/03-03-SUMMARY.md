---
phase: 03-bridge-service-skeleton
plan: "03"
subsystem: bridge/metrics
tags: [prometheus, prom-client, metrics, healthz, readyz, ops-endpoints, observability]
dependency_graph:
  requires: ["03-01", "03-02"]
  provides: ["metrics-registry", "healthz", "readyz", "metrics-endpoint"]
  affects: ["03-05-docker-compose", "03-04-tool-registry"]
tech_stack:
  added:
    - "prom-client@15.1.3"
  patterns:
    - "Per-Registry factory pattern (Pitfall 2 — no global Registry collision)"
    - "Gauge collect() callback for lazy live-state reads"
    - "TokenCache constructor hooks (onHit/onMiss) for DI-safe instrumentation"
    - "onDedup callback in registerIdempotencyHooks for counter wiring"
    - "request.routeOptions.url for bounded label cardinality (T-03-09)"
key_files:
  created:
    - packages/bridge/src/metrics/registry.ts
    - packages/bridge/src/metrics/registry.test.ts
    - packages/bridge/src/routes/healthz.ts
    - packages/bridge/src/routes/readyz.ts
    - packages/bridge/src/routes/metrics.ts
    - .changeset/03-03-ops-endpoints-and-metrics.md
  modified:
    - packages/bridge/src/server.ts
    - packages/bridge/src/server.test.ts
    - packages/bridge/src/auth/token-cache.ts
    - packages/bridge/src/auth/token-cache.test.ts
    - packages/bridge/package.json
    - pnpm-lock.yaml
decisions:
  - "Approach B (DI accessors) for lazy gauge collect callbacks — explicit closure args rather than module-level vars"
  - "Inline WS gauge instrumentation in server.ts /ws route, not DeltaEmitter DI"
  - "TokenCache constructor metricsHooks={} default preserves backward compatibility with all existing tests"
  - "Dedup counter E2E test simplified to wiring+presence assertion (no non-/internal/ POST routes exist in Phase 03 MVP)"
metrics:
  duration: ~35 minutes
  completed: "2026-05-13"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 6
  tests_added: 26
  tests_total: 136
---

# Phase 03 Plan 03: Prometheus Metrics + Ops Endpoints Summary

prom-client@15.1.3 direct (no fastify-metrics fork), per-Registry isolation, 7 EVF metrics, /healthz + /readyz + /metrics ops endpoints, HTTP duration histogram with bounded label cardinality.

## What Was Built

### Metrics Registry Factory (`packages/bridge/src/metrics/registry.ts`)

`createMetricsRegistry(accessors, provided?)` creates a fresh prom-client `Registry` per call and binds all metrics to it. No module-level metric construction — every metric constructor receives `registers: [registry]`.

### 7 EVF-Specific Metrics

| Metric Name | Type | Labels | Help |
|---|---|---|---|
| `evf_http_request_duration_seconds` | Histogram | method, route, status_code | HTTP duration; buckets [5ms,10ms,50ms,100ms,500ms,1s] |
| `evf_ws_sessions_active` | Gauge | none | Live WebSocket session count |
| `evf_replay_buffer_size` | Gauge | none | Total envelopes in ReplayBuffer (lazy collect) |
| `evf_idempotency_store_size` | Gauge | none | IdempotencyStore entry count (lazy collect) |
| `evf_idempotency_dedup_total` | Counter | none | Idempotency dedup replay hits |
| `evf_token_cache_hits_total` | Counter | none | TokenCache hits within TTL |
| `evf_token_cache_misses_total` | Counter | none | TokenCache misses → Foundry roundtrip |

Plus `nodejs_*` defaults via `collectDefaultMetrics({ register: registry })`.

### Label Cardinality Budget (T-03-09)

| Dimension | Values | Bound |
|---|---|---|
| `method` | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS | ≤7 |
| `route` | Fastify URL pattern (e.g. `/v1/tools/:name`) | ≤ route count (~12) |
| `status_code` | 200, 204, 400, 401, 422, 429, 503, ... | ≤20 |
| **Total cardinality** | 7 × 12 × 20 | **≤1,680** |

Forbidden label names (`session_id`, `actor_id`, bearer token values) — verified by grep gate returning 0.

### Three Ops Endpoints

| Route | Auth | Status | Purpose |
|---|---|---|---|
| GET `/healthz` | None | Always 200 | k8s liveness probe — is the process alive? |
| GET `/readyz` | None | 200/503 | k8s readiness probe — is EVF_INTERNAL_SECRET set? |
| GET `/metrics` | None | Always 200 | Prometheus scrape endpoint |
| GET `/v1/health` | Bearer | 200/401/503 | Phase 02 wizard Step 2 — **UNCHANGED** |

`/healthz` and `/readyz` registered before any bearer-auth route in `buildServer()`.

### Server.ts Wiring

```
buildServer(opts)
  → createMetricsRegistry({ replayBufferSize, idempotencyStoreSize })  [fresh Registry]
  → new TokenCache(foundryValidateFn, { onHit: hits.inc, onMiss: misses.inc })
  → registerIdempotencyHooks(app, store, { onDedup: dedup.inc })
  → app.addHook('onRequest', req.evfStartTime = Date.now())
  → app.addHook('onResponse', histogram.observe with route pattern label)
  → registerHealthzRoute(app)
  → registerReadyzRoute(app)
  → registerMetricsRoute(app, registry)
  → [bearer-auth routes...]
  → /ws route: wsSessionsActive.inc on registerSession, .dec on close
```

## Pitfall Verifications

### Pitfall 2: prom-client Global-Registry Test Collision (T-03-10)

**Problem:** `new Counter({ name, help })` without `registers:[...]` auto-registers to `prom-client`'s global default Registry. If two `buildServer()` calls run in the same process (parallel tests), the second call throws `Error: A metric with the name X has already been registered`.

**Fix:** Every metric in `createMetricsRegistry()` is constructed with `registers: [registry]` where `registry = provided ?? new Registry()`. Each call gets an independent Registry. No metric ever touches the global default Registry.

**Verified by:**
- `registry.test.ts` test 2: two parallel calls do NOT throw
- `server.test.ts`: parallel two-buildServer isolation test — both return 200

### Pitfall 5: fastify-metrics Fork Conflict

`fastify-metrics` uses a `@platformatic/prom-client` fork that conflicts with direct `prom-client` usage. We do NOT install `fastify-metrics`.

**Verified by:** `grep -c '"fastify-metrics"' packages/bridge/package.json` → 0.

### prom-client@15.1.3 Installed

```
grep -c '"prom-client": "15.1.3"' packages/bridge/package.json → 1
```

Lockfile updated with `pnpm install --filter @evf/bridge`.

## Test Coverage

| File | Tests Added | Total |
|---|---|---|
| `metrics/registry.test.ts` | 6 (new) | 6 |
| `server.test.ts` | 17 (new) | 46 |
| `auth/token-cache.test.ts` | 3 (new) | 20 |
| **bridge package total** | **+26** | **136** |

All 136 tests pass. Zero regressions from Phase 03-01 / 03-02 tests.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written except one scoping decision.

### Scoping Decision: Dedup Counter E2E Test

**Context:** Plan Task 2 calls for an E2E dedup counter test (second same-key POST → counter=1). The `registerIdempotencyHooks` excludes `/internal/` prefixes. The only POST route in Phase 03 MVP is `POST /internal/delta` which is excluded from idempotency middleware.

**Decision:** Dedup counter test simplified to verify:
1. Counter present in `/metrics` output at value 0 (wiring is correct)
2. Registry isolation (separate from global Registry)

Full E2E dedup test requires a non-/internal/ POST route — deferred to Phase 04 (Tool Registry adds `POST /v1/tools/:name`). Noted in `server.test.ts` test comment.

**Rule:** N/A — scope clarification, not a deviation.

## Self-Check

Files created:
- `packages/bridge/src/metrics/registry.ts` — createMetricsRegistry export confirmed
- `packages/bridge/src/metrics/registry.test.ts` — 6 tests pass
- `packages/bridge/src/routes/healthz.ts` — /healthz 200 confirmed
- `packages/bridge/src/routes/readyz.ts` — /readyz 200/503 confirmed
- `packages/bridge/src/routes/metrics.ts` — /metrics text/plain confirmed
- `.changeset/03-03-ops-endpoints-and-metrics.md` — patch bump @evf/bridge

Commits:
- `99d1d0b` feat(03-03): prom-client install + metrics registry factory + 3 ops routes
- `291ccf6` feat(03-03): server.ts wiring — HTTP histogram + WS gauge + dedup counter + cache hooks
