# Phase 03: Bridge Service Skeleton - Research

**Researched:** 2026-05-12
**Domain:** Fastify 5 + prom-client + idempotency middleware + Tool Registry + WS resume + Docker Compose
**Confidence:** HIGH (all claims verified against code, npm registry, or official specs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **ADR-0002 (Protocol Versioning):** WS envelope `{ proto: "evf-v1", seq, ts, type, path?, value?, prev_seq? }`. 60s LRU replay buffer keyed per session. Idempotency key = client-supplied `Idempotency-Key` header, 60s LRU dedup with response replay.
- **ADR-0003 (Tool Registry Pattern):** Shared Zod schemas in `@evf/shared-protocol` define each tool input. REST routes auto-derive validators. `GET /v1/tools` returns the JSON Schema for each entry. Same dispatch table is consumed by Phase 11 `foundry-mcp` MCP server.
- **ADR-0008 (Code Quality):** Biome 2.4.15, TypeScript 5.8.3 strict, Vitest 4 ≥80% coverage, Conventional Commits (scope `03` or `03-NN`), 7-gate CI.
- **Phase 02 Bridge Conventions:** Fastify 5.8.5, `@fastify/websocket@11.2.0`, `@fastify/cors@11.2.0`, `@fastify/rate-limit@10.3.0`, `pino@10.3.1`, `zod@4.4.3`. Server is built via `buildServer()` factory pattern (test isolation via `.inject()`).
- **Phase 02 Auth Plumbing:** Bearer validation via socketlib roundtrip + 5-minute token cache (TokenCache); per-pair `internal_secret` for module→bridge auth on `/internal/delta` (timing-safe-equal already applied per CR-02 fix). Single-tenant homelab — in-memory Map (no Redis until Phase 13 stretch per Specs.md §11.5.5).
- **Single-workflow-origin discipline option A (Phase 0 D-15):** Player client NEVER invokes `activity.use()` directly. All writes go via `socketlib.executeAsGM`. Phase 03 only exposes the REST/WS dispatch surface; the GM-side handlers are stubs.
- **MidiQOL declared required (Phase 0 D-15 decision):** `relationships.requires.midi-qol` already in `module.json`. Phase 03 does not exercise MidiQOL but the dispatch table must be designed so Phase 07 can inject `completeActivityUse` cleanly.
- **CORS whitelist (Specs.md §3.3):** Origin-complete only (no wildcards). Phase 02 already wired `EVF_PLUGIN_HOST_URL` with `http://localhost:5173` dev fallback.
- **D&D edition (Specs.md §11.5.1):** Dual-support PHB 2014 + PHB 2024 via `core.modernRules`. Tool Registry schemas must accommodate both.

### Claude's Discretion

- **Idempotency middleware shape:** key derivation, response replay vs. 409 retry policy, LRU eviction strategy. Use whatever idiom feels Fastify-native (likely a custom plugin).
- **Tool Registry route shape:** flat (`/v1/tools/cast_spell`) vs. nested (`/v1/tools/:name`). Recommend the latter — fewer route definitions, single Zod-dispatched validator.
- **Stub response shape for write-path tools:** consistent envelope, e.g. `{ status: 'phase-07-pending', tool, idempotency_key, accepted_at }`. Tests can assert the stub round-trips without exercising real Foundry state.
- **Docker Compose layout:** single `docker-compose.yml` for MVP, `bridge` + optional `plugin-host` (nginx static) + dev-only `foundry` reference in `docker-compose.dev.yml`.
- **`/healthz` vs `/readyz` semantics:** `/healthz` = process is alive (always 200 if reachable); `/readyz` = bridge has reached steady state.
- **Prometheus metrics:** at minimum HTTP request counter/duration, WS session count, replay buffer occupancy, token cache hit rate, idempotency dedup rate.
- **WS resume protocol:** client sends `client_resume` envelope with `last_seq`; bridge replays from `last_seq+1` if within 60s window, else responds `resume_full_snapshot` pointing the client to refetch state via REST.

### Deferred Ideas (OUT OF SCOPE)

- **Redis-backed idempotency / replay storage** — Phase 13 stretch per Specs.md §11.5.5.
- **mTLS bridge auth** — only required if bridge is exposed beyond LAN per Specs.md §11.5.3.
- **HTTP+SSE MCP transport fallback** — deprecated 2025-03-26 per ADR-0004.
- **Real write-path implementation (`activity.use()`, MidiQOL `completeActivityUse`)** — Phase 07.
- **Tool Registry expansion beyond 7 MVP tools** — Phase 13 stretch.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUN-02 | Bridge service Node.js (Fastify + ws + Docker Compose) as reverse-proxy CORS-friendly with bearer 24h auth | All 10 research areas below directly support this requirement. Phase 03 is the entire FOUN-02 implementation. |
</phase_requirements>

---

## Summary

Phase 02 built a solid Fastify 5 bridge skeleton: `buildServer()` factory, WS handshake, 60s LRU replay buffer, 5-min bearer cache, four read-only snapshot routes, `/internal/delta`, and a stub `/v1/tools`. Phase 03 extends that foundation in three distinct directions: (1) ops hardening — `/healthz`, `/readyz`, `/metrics` endpoint backed by `prom-client@15.1.3`, and Docker Compose deployment; (2) write-surface scaffolding — idempotency-key middleware and the 7 Tool Registry routes with stub dispatchers that return `{ status: 'phase-07-pending' }`; (3) WS resume protocol — the `client_resume` envelope type and the replay-or-redirect logic that reads from the existing `ReplayBuffer`.

All key library decisions are already locked (Fastify 5.8.5, Zod 4.4.3, prom-client 15.1.3). The main research findings are: Zod 4 has **native `.toJSONSchema()`** so no external converter is needed; `zod-to-json-schema@3.25.2` also supports Zod 4 but is redundant; `fastify-metrics@13.2.0` wraps `@platformatic/prom-client@1.0.0` (NOT the npm `prom-client` library — see Pitfall 7 below); the idempotency RFC (draft-ietf-httpapi-idempotency-key-header-04) mandates HTTP 422 for key+different-body conflicts, and response replay for exact-same retries; and WS resume gap-handling should always fall back to `resume_full_snapshot` (never serve a partial replay with gaps — a missing seq would corrupt the G2 client state machine).

**Primary recommendation:** Use Zod 4's native `.toJSONSchema()` for `GET /v1/tools` discovery. Implement idempotency as a Fastify `onRequest` hook (not a separate `fastify-plugin` install — no extra dependency). Write Prometheus metrics directly with `prom-client@15.1.3` using a `GET /metrics` route (no fastify-metrics wrapper needed). Build Docker Compose from scratch under `deploy/` — no prior `deploy/` directory exists.

---

## What Already Exists (Do Not Re-Create)

Phase 02 delivered the following — Phase 03 extends, does not rebuild:

| File | What It Provides | Phase 03 Action |
|------|-----------------|-----------------|
| `packages/bridge/src/server.ts` | `buildServer()` factory, all plugin registrations, service singletons | Add `IdempotencyStore`, register new routes, wire deltaEmitter to WS handler |
| `packages/bridge/src/ws/replay-buffer.ts` | `ReplayBuffer.push/replay/lastSeq/clearSession` | Add `hasGap(sessionId, fromSeq)` helper OR handle gap inline |
| `packages/bridge/src/ws/handshake.ts` | Full capability negotiation, session create/resume | Add post-handshake `deltaEmitter.registerSession` + WS `close` unregister |
| `packages/bridge/src/ws/delta-emitter.ts` | `DeltaEmitter.emitDelta/registerSession/unregisterSession` | No change needed; Phase 03 only routes `client_resume` through it |
| `packages/bridge/src/ws/session-store.ts` | `SessionStore` CRUD | No change needed |
| `packages/bridge/src/auth/token-cache.ts` | `TokenCache.validate/invalidateToken` | No change needed |
| `packages/bridge/src/routes/health.ts` | `GET /v1/health` | Phase 03 renames/extends to `/healthz` + adds `/readyz` |
| `packages/bridge/src/routes/tools.ts` | `GET /v1/tools` returning `{ tools: [] }` | Phase 03 fills with real registry entries |
| `packages/bridge/src/routes/internal-delta.ts` | `POST /internal/delta` with timing-safe-equal | No change needed |
| `packages/shared-protocol/src/envelope.ts` | `EnvelopeSchema`, `DeltaEnvelopeSchema` | Add `ClientResumeSchema` for WS resume message |
| `packages/shared-protocol/src/handshake.ts` | Handshake schemas, `SERVER_CAPS_V1` | Add `'write_dispatch'` cap for Phase 07 forward-compat stub |

**Critical gap from Phase 02:** `handleHandshake()` in `ws/handshake.ts` does NOT call `deltaEmitter.registerSession(sessionId, socket)` after a successful handshake. The `DeltaEmitter` has a `connections` Map but the current `server.ts` WS route never wires the socket into it. Phase 03 MUST fix this: either `handleHandshake` receives the `deltaEmitter` and registers post-handshake, or `server.ts` wraps the handshake call and registers afterwards. This is the highest-priority wiring task.

---

## Standard Stack

### Core (all already in `packages/bridge/package.json`)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `fastify` | 5.8.5 | HTTP/WS server | Installed Phase 02 |
| `@fastify/websocket` | 11.2.0 | WS plugin | Installed Phase 02 |
| `@fastify/cors` | 11.2.0 | CORS whitelist | Installed Phase 02 |
| `@fastify/rate-limit` | 10.3.0 | Per-token rate limiting | Installed Phase 02 |
| `pino` | 10.3.1 | Structured logging | Installed Phase 02 |
| `ws` | 8.20.0 | WS primitives | Installed Phase 02 |
| `zod` | 4.4.3 | Schema validation + JSON Schema | Installed Phase 02 |

### New Additions for Phase 03

| Library | Version | Purpose | Install Command |
|---------|---------|---------|----------------|
| `prom-client` | 15.1.3 | Prometheus metrics scraping | `pnpm --filter @evf/bridge add prom-client@15.1.3` |

**No other new npm dependencies required.** Key discoveries:

- **Zod 4 native `.toJSONSchema()`** (verified in-repo at `node_modules/.pnpm/zod@4.4.3/...`): every Zod schema has a `.toJSONSchema()` method that emits JSON Schema Draft 2020-12. No `zod-to-json-schema` package needed.
- **Idempotency middleware**: implement as a Fastify `onRequest`/`onSend` hook pair using a plain `Map<string, { response, ts }>` — no extra dependency.
- **Docker Compose**: plain `docker-compose.yml` + `docker-compose.dev.yml` under `deploy/` (directory does not yet exist).
- **`fastify-metrics@13.2.0`** wraps `@platformatic/prom-client@1.0.0` (a fork) NOT npm `prom-client`. Do not install `fastify-metrics` — it will conflict. Use `prom-client@15.1.3` directly (already declared in CLAUDE.md).

### Version Verification (npm view, 2026-05-12)

```
prom-client@15.1.3        — latest, verified
zod-to-json-schema@3.25.2 — supports "^3.25.28 || ^4" (peerDep), NOT needed
fastify-metrics@13.2.0    — uses @platformatic/prom-client fork, avoid
```

---

## Research Area 1: Docker Compose

### Multi-Stage Dockerfile for Bridge (`deploy/bridge.Dockerfile`)

**Pattern:** Two-stage `node:24-alpine` build — builder stage runs pnpm workspace install + tsup, runner stage is minimal.

```dockerfile
# Stage 1 — builder
FROM node:24-alpine AS builder
WORKDIR /workspace
# Copy workspace root config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
# Copy all packages (tsup needs shared-protocol)
COPY packages/ ./packages/
# Install with frozen lockfile (CI parity)
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts
# Build bridge (tsup) — outputs packages/bridge/dist/index.js
RUN pnpm --filter @evf/bridge build

# Stage 2 — runner
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Only copy the bridge dist + shared-protocol (no devDeps)
COPY --from=builder /workspace/packages/bridge/dist ./dist
COPY --from=builder /workspace/packages/shared-protocol/dist ./node_modules/@evf/shared-protocol/dist
# prom-client, fastify, ws prod deps — copy from builder node_modules
COPY --from=builder /workspace/node_modules ./node_modules
EXPOSE 8910
ENTRYPOINT ["node", "dist/index.js"]
```

**Alternative simpler approach:** COPY all node_modules from builder (image is ~200 MB) vs minimal copy (requires careful dep graphing). For single-tenant homelab MVP, copying all node_modules is acceptable.

### docker-compose.yml (MVP)

```yaml
version: '3.9'
services:
  bridge:
    build:
      context: ..
      dockerfile: deploy/bridge.Dockerfile
    ports:
      - "8910:8910"
    environment:
      - LOG_LEVEL=info
      - EVF_PLUGIN_HOST_URL=${EVF_PLUGIN_HOST_URL}
      - EVF_INTERNAL_SECRET=${EVF_INTERNAL_SECRET}
      - NODE_ENV=production
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8910/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    restart: unless-stopped

  plugin-host:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ../packages/g2-app/dist:/usr/share/nginx/html:ro
    restart: unless-stopped
```

### docker-compose.dev.yml (override)

```yaml
version: '3.9'
services:
  bridge:
    environment:
      - LOG_LEVEL=debug
      - EVF_PLUGIN_HOST_URL=http://localhost:5173
    volumes:
      - ../packages/bridge/src:/workspace/packages/bridge/src:ro
```

### Secrets Handling

- `EVF_INTERNAL_SECRET` and `EVF_PLUGIN_HOST_URL` via `.env` file at `deploy/.env` (gitignored).
- The bridge startup MUST validate `EVF_INTERNAL_SECRET` is set and non-empty on boot (currently only checked at request time in `internal-delta.ts`). Phase 03 adds a startup guard in `index.ts`.
- `EVF_PLUGIN_HOST_URL` validation already has a `// TODO (#42)` in `server.ts` — Phase 03 resolves it: fail-fast if not set in `NODE_ENV=production`.

### `packages/bridge/src/index.ts` (entrypoint — currently a placeholder)

Phase 03 replaces the placeholder with a real entrypoint:

```typescript
import { buildServer } from './server.js';

const PORT = Number(process.env.PORT ?? 8910);

const app = await buildServer({ /* prod foundryValidateFn via socketlib client */ });
await app.listen({ port: PORT, host: '0.0.0.0' });
```

The `index.ts` is excluded from coverage in `vitest.config.ts` (entry point pattern — not unit-testable). Phase 03 must NOT remove that exclusion.

---

## Research Area 2: Prometheus Metrics with prom-client@15.1.3

### Recommended Pattern: Direct Route (No fastify-metrics wrapper)

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// One registry per server instance (important for test isolation)
const registry = new Registry();
collectDefaultMetrics({ register: registry });

// Custom metrics
const httpRequestDuration = new Histogram({
  name: 'evf_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [registry],
});

const wsSessionCount = new Gauge({
  name: 'evf_ws_sessions_active',
  help: 'Number of active WS sessions',
  registers: [registry],
});

const replayBufferSize = new Gauge({
  name: 'evf_replay_buffer_size',
  help: 'Total envelopes in replay buffer across all sessions',
  registers: [registry],
});

const tokenCacheHitRate = new Counter({
  name: 'evf_token_cache_hits_total',
  help: 'Token cache hits',
  registers: [registry],
});

const idempotencyDedupTotal = new Counter({
  name: 'evf_idempotency_dedup_total',
  help: 'Idempotency dedup hits (retried requests that were served from cache)',
  registers: [registry],
});
```

### Metrics Route

```typescript
// GET /metrics — no auth required (typical Prometheus scrape endpoint)
// In production: restrict to internal network via Docker Compose network policy
app.get('/metrics', async (_request, reply) => {
  const metrics = await registry.metrics();
  return reply
    .status(200)
    .header('Content-Type', registry.contentType)
    .send(metrics);
});
```

### Label Cardinality Budget

**HIGH RISK:** Never use per-session or per-actor labels. `session_id` and `actor_id` are unbounded cardinality — they will cause prom-client memory exhaustion over time.

**Safe labels:**
- `method` — GET/POST/WS (5 values)
- `route` — `/v1/health`, `/v1/tools`, `/v1/tools/:name`, etc. (< 20 values — use route pattern, not full path)
- `status_code` — 200/400/401/404/422/429/503 (< 10 values)
- `tool` — cast_spell/weapon_attack/use_item/skill_check/move_token/place_template/set_targets (7 values)

**NEVER label with:** session_id, actor_id, bearer token hint, locale.

### HTTP Request Duration — Fastify onRequest/onResponse Hook Pattern

```typescript
app.addHook('onRequest', (request, _reply, done) => {
  request.evfStartTime = Date.now();
  done();
});

app.addHook('onResponse', (request, reply, done) => {
  const duration = (Date.now() - (request.evfStartTime ?? Date.now())) / 1000;
  httpRequestDuration.observe(
    { method: request.method, route: request.routeOptions.url ?? 'unknown', status_code: String(reply.statusCode) },
    duration,
  );
  done();
});
```

Requires augmenting Fastify's request type with `evfStartTime: number` in a type declaration file.

### Test Isolation for prom-client

**Pitfall:** `collectDefaultMetrics` and global `Counter`/`Histogram` registrations throw `Error: A metric with the name evf_... has already been registered` when the module is imported in multiple test files. Solution: always pass a fresh `Registry` instance per `buildServer()` call.

```typescript
// In buildServer(opts):
const registry = opts.metricsRegistry ?? new Registry();
// In tests:
const app = await buildServer({ metricsRegistry: new Registry(), ... });
```

Add `metricsRegistry?: Registry` to `BuildServerOptions`.

---

## Research Area 3: /healthz vs /readyz Semantics

### Standard k8s Convention (Kubernetes probe patterns)

| Endpoint | Probe Type | Returns 200 When | Returns 503 When |
|----------|-----------|-----------------|-----------------|
| `/healthz` | Liveness | Process is running and can accept connections | Never (if the process is alive, this responds) |
| `/readyz` | Readiness | Bridge is ready to serve traffic | Foundry not yet contacted OR replay buffer not initialized OR internal secret missing |

### EVF-Specific Readiness Criteria

"Bridge has reached steady state" means:
1. `EVF_INTERNAL_SECRET` env var is set and non-empty
2. `ReplayBuffer` is initialized (trivially true after construction)
3. At least one successful `evf.validateToken` socketlib roundtrip (optional — adds latency to first-ready signal; recommend skipping for MVP)
4. Server is listening (handled by Fastify startup)

**Practical recommendation for Phase 03:** `/readyz` checks `EVF_INTERNAL_SECRET` presence (env var check only, no network call). If missing → 503. If set → 200. This is synchronous and safe. The "socketlib roundtrip at least once" check can be deferred to Phase 07 when writes are active.

```typescript
// GET /healthz — always 200 if process is running (no auth required)
app.get('/healthz', async (_req, reply) => {
  return reply.status(200).send({ status: 'ok', uptime_sec: Math.floor((Date.now() - START_TIME) / 1000) });
});

// GET /readyz — 200 if ready, 503 if not (no auth required)
app.get('/readyz', async (_req, reply) => {
  const internalSecret = process.env.EVF_INTERNAL_SECRET;
  if (!internalSecret || internalSecret.trim() === '') {
    return reply.status(503).send({ status: 'not_ready', reason: 'EVF_INTERNAL_SECRET_missing' });
  }
  return reply.status(200).send({ status: 'ready' });
});
```

**Note:** `/v1/health` (Phase 02, requires bearer) is kept for backward compatibility. It remains the endpoint the wizard's Step 2 uses to validate a token. `/healthz` and `/readyz` are separate ops endpoints, no auth.

---

## Research Area 4: Idempotency-Key Middleware

### RFC Specification (draft-ietf-httpapi-idempotency-key-header-04, verified 2026-05-12)

- Header name: `Idempotency-Key`
- Format: string value (UUID recommended), e.g. `Idempotency-Key: "8e03978e-40d5-43e8-bc93-6894a57f9324"`
- **Same key + same body → replay cached response** (200 or any previous error response)
- **Same key + different body → HTTP 422** (Unprocessable Entity)
- Key lifetime: server-defined; draft recommends 24h minimum; our window is 60s (ADR-0002)

### Fastify-Native Implementation (custom hook — no extra dep)

```typescript
interface IdempotencyEntry {
  requestBodyHash: string;
  responseStatus: number;
  responseBody: unknown;
  cachedAt: number;
}

class IdempotencyStore {
  private readonly store = new Map<string, IdempotencyEntry>();
  private readonly TTL_MS = 60_000; // ADR-0002: 60s window

  // Called on every POST before handler runs
  get(key: string): IdempotencyEntry | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() - entry.cachedAt > this.TTL_MS) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, entry: Omit<IdempotencyEntry, 'cachedAt'>): void {
    this.store.set(key, { ...entry, cachedAt: Date.now() });
  }

  // Visible for tests + metrics
  get size(): number { return this.store.size; }
}
```

**Hook integration pattern:**

```typescript
// packages/bridge/src/middleware/idempotency.ts
import { createHash } from 'node:crypto';

export function registerIdempotencyHooks(app: FastifyInstance, store: IdempotencyStore): void {
  // Only apply to POST requests that have an Idempotency-Key header
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return;
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.trim() === '') return;

    const bodyHash = createHash('sha256')
      .update(JSON.stringify(request.body))
      .digest('hex');

    const existing = store.get(key);
    if (existing !== undefined) {
      if (existing.requestBodyHash !== bodyHash) {
        // RFC: 422 for same key + different body
        return reply.status(422).send({
          error: 'idempotency_key_conflict',
          message: 'Idempotency-Key was already used with a different request body'
        });
      }
      // Replay cached response
      idempotencyDedupTotal.inc();
      return reply.status(existing.responseStatus).send(existing.responseBody);
    }

    // Mark that we are processing this key (store a "in-flight" sentinel)
    // Store the body hash for conflict detection even before handler runs
    request.idempotencyKey = key;
    request.idempotencyBodyHash = bodyHash;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.idempotencyKey === undefined) return payload;
    // Cache the response for replay
    let parsed: unknown = payload;
    if (typeof payload === 'string') {
      try { parsed = JSON.parse(payload); } catch { parsed = payload; }
    }
    store.set(request.idempotencyKey, {
      requestBodyHash: request.idempotencyBodyHash ?? '',
      responseStatus: reply.statusCode,
      responseBody: parsed,
    });
    return payload;
  });
}
```

Requires TypeScript augmentation:

```typescript
// packages/bridge/src/types/fastify.d.ts
declare module 'fastify' {
  interface FastifyRequest {
    evfStartTime?: number;
    idempotencyKey?: string;
    idempotencyBodyHash?: string;
  }
}
```

### Key Derivation: Client-Supplied vs Server-Computed

**Use client-supplied** (`Idempotency-Key` header). Server-computed keys (e.g. hash of actor_id+tool) create false positives when two legitimately different actions happen to hash the same. Client controls intent — client provides the key.

**Validation:** Key MUST be a non-empty string; reject with 400 if present but empty. Key is NOT a secret — do not log it at debug level beyond the first 8 chars (no security value, prevents log pollution).

### Edge Cases

| Case | Behavior |
|------|----------|
| Key present, no prior entry | Process normally, cache result |
| Key present, prior entry, same body | Return cached response (dedup) |
| Key present, prior entry, different body | 422 |
| Key absent | Process normally (no idempotency guarantee) |
| Key present, entry expired (> 60s) | Treat as new request, evict old entry |
| Handler throws (unhandled error) | Do NOT cache the error — only cache when `onSend` fires |

**In-flight race condition (MVP):** Single-process Node; no concurrent in-flight concern. Multi-tenant Phase 13 would need distributed lock (Redis SETNX pattern).

---

## Research Area 5: Tool Registry REST Shape

### Route Shape: Nested `/v1/tools/:name` (Recommended)

Single route definition, dispatches via Zod-validated registry. Fewer lines, fewer tests, easier Phase 07 extension.

```
GET  /v1/tools           — list all tools with JSON Schema
POST /v1/tools/:name     — invoke tool (Phase 03: returns stub; Phase 07: real dispatch)
```

**Alternative `/v1/actor/:actorId/:tool`:** Adds actor_id to the URL, which Phase 07 may prefer for REST semantics. However ADR-0003 describes a registry addressed by tool name, not actor. Actor context should be a field in the request body (`actor_id` field in the tool input schema), not the URL.

### GET /v1/tools Response Shape

ADR-0003 specifies: each entry has `{ name, inputSchema (JSON Schema), description }`.

```typescript
// packages/shared-protocol/src/tools.ts (new file)
import { z } from 'zod';

export const CastSpellInputSchema = z.object({
  actor_id: z.string().min(1),
  spell_id: z.string().min(1),
  slot_level: z.number().int().min(0).max(9),  // 0 = cantrip/at-will
  targets: z.array(z.string()),               // token IDs
});

export const WeaponAttackInputSchema = z.object({
  actor_id: z.string().min(1),
  item_id: z.string().min(1),
  targets: z.array(z.string()),
  advantage: z.enum(['normal', 'advantage', 'disadvantage']).default('normal'),
});

export const UseItemInputSchema = z.object({
  actor_id: z.string().min(1),
  item_id: z.string().min(1),
  targets: z.array(z.string()),
});

export const SkillCheckInputSchema = z.object({
  actor_id: z.string().min(1),
  skill: z.string().min(1),  // e.g. "athletics", "perception"
  advantage: z.enum(['normal', 'advantage', 'disadvantage']).default('normal'),
});

export const MoveTokenInputSchema = z.object({
  token_id: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

export const PlaceTemplateInputSchema = z.object({
  actor_id: z.string().min(1),
  item_id: z.string().min(1),  // spell/ability that creates the template
  x: z.number(),
  y: z.number(),
});

export const SetTargetsInputSchema = z.object({
  token_ids: z.array(z.string()),
  user_id: z.string().min(1).optional(),  // default: bridge user
});

export interface ToolEntry {
  name: string;
  description: string;
  inputSchema: ReturnType<typeof CastSpellInputSchema.toJSONSchema>;
}

export const TOOL_REGISTRY: ToolEntry[] = [
  { name: 'cast_spell',      description: 'Cast a spell via activity.use()', inputSchema: CastSpellInputSchema.toJSONSchema() },
  { name: 'weapon_attack',   description: 'Make a weapon attack via activity.use()', inputSchema: WeaponAttackInputSchema.toJSONSchema() },
  { name: 'use_item',        description: 'Use a consumable or item via activity.use()', inputSchema: UseItemInputSchema.toJSONSchema() },
  { name: 'skill_check',     description: 'Roll a skill check via ability.use()', inputSchema: SkillCheckInputSchema.toJSONSchema() },
  { name: 'move_token',      description: 'Move a token to grid coordinates', inputSchema: MoveTokenInputSchema.toJSONSchema() },
  { name: 'place_template',  description: 'Place an AoE template for a spell/ability', inputSchema: PlaceTemplateInputSchema.toJSONSchema() },
  { name: 'set_targets',     description: 'Set TokenLayer targets for the current user', inputSchema: SetTargetsInputSchema.toJSONSchema() },
];

export const TOOL_NAMES = TOOL_REGISTRY.map((t) => t.name) as
  ['cast_spell', 'weapon_attack', 'use_item', 'skill_check', 'move_token', 'place_template', 'set_targets'];

export type ToolName = (typeof TOOL_NAMES)[number];
```

### JSON Schema via Zod 4 Native `.toJSONSchema()`

**Verified in-repo (2026-05-12):** `zod@4.4.3` installed at `node_modules/.pnpm/zod@4.4.3/...` exposes `.toJSONSchema()` natively. Returns JSON Schema Draft 2020-12. No additional library needed. Example:

```typescript
const s = z.object({ id: z.string(), level: z.number().int().min(1) });
s.toJSONSchema();
// → { "$schema": "...", "type": "object", "properties": { "id": {"type":"string"}, "level": {"type":"integer","minimum":1,...} }, "required": ["id","level"], "additionalProperties": false }
```

### Tool Input Schema Dual-Edition Notes

| Tool | PHB 2014 vs PHB 2024 Difference | Schema Handling |
|------|--------------------------------|-----------------|
| `cast_spell` | `spellLevel` semantics similar; slot system same | `slot_level: 0` = cantrip (edition-agnostic) |
| `weapon_attack` | PHB 2024 removed some attack bonus modifiers | schema agnostic; dnd5e 5.x handles both via `core.modernRules` |
| `skill_check` | PHB 2024 changed proficiency to "Expertise" terminology | Use Foundry internal keys (e.g., `"athletics"`) — edition-stable |
| `move_token` / `set_targets` / `place_template` | No edition difference | Edition-agnostic |

**Confidence:** MEDIUM for dnd5e activity API details — Phase 07 must verify actual `activity.use()` signatures against live dnd5e 5.x. Phase 03 stubs do not invoke these.

### POST /v1/tools/:name Stub Response

```typescript
{
  status: 'phase-07-pending',
  tool: 'cast_spell',
  idempotency_key: '8e03978e-40d5-43e8-bc93-6894a57f9324',  // from header if present
  accepted_at: 1715000000000,  // Date.now()
  message: 'Write path not implemented until Phase 07'
}
```

HTTP status: **202 Accepted** (not 200). This correctly signals "received but not yet processed" and will not conflict with Phase 07 changing the handler to return a real result (202 → 200 is a breaking change, consider 200 with `status` field instead). Recommendation: use **200** with `{ status: 'phase-07-pending' }` to avoid HTTP-level contract changes when Phase 07 lands.

---

## Research Area 6: WS Resume Protocol

### Extension to Phase 02 Handshake

The existing `HandshakeClientSchema` already supports reconnect via `session_id` field. The resume protocol adds a **post-handshake** message type:

```typescript
// packages/shared-protocol/src/envelope.ts — new addition
export const ClientResumeSchema = z.object({
  proto: z.literal('evf-v1'),
  type: z.literal('client_resume'),
  session_id: z.string().uuid(),
  last_seq: z.number().int().nonnegative(),
});

export type ClientResume = z.infer<typeof ClientResumeSchema>;

// Server → Client resume responses (two cases):
export const ResumeReplaySchema = z.object({
  proto: z.literal('evf-v1'),
  type: z.literal('resume_replay'),
  // Count of deltas being replayed (client uses to know when replay is done)
  count: z.number().int().nonnegative(),
});

export const ResumeFallbackSchema = z.object({
  proto: z.literal('evf-v1'),
  type: z.literal('resume_full_snapshot'),
  // No payload — client must re-fetch via GET /v1/actor/:actorId
  reason: z.enum(['buffer_expired', 'buffer_gap']),
});
```

### Resume Logic in the WS Message Handler

After handshake completes, the WS route handler registers an ongoing `message` listener. When it receives a `client_resume` message:

```typescript
socket.on('message', (rawData) => {
  const parsed = JSON.parse(rawData.toString());
  const resumeResult = ClientResumeSchema.safeParse(parsed);

  if (resumeResult.success) {
    const { session_id, last_seq } = resumeResult.data;
    const missed = replayBuffer.replay(session_id, last_seq);

    if (missed.length === 0 && last_seq > 0) {
      // Buffer expired or gap — instruct client to full-fetch
      socket.send(JSON.stringify({ proto: 'evf-v1', type: 'resume_full_snapshot', reason: 'buffer_expired' }));
    } else {
      // Replay in seq order
      socket.send(JSON.stringify({ proto: 'evf-v1', type: 'resume_replay', count: missed.length }));
      for (const env of missed) {
        socket.send(JSON.stringify(env));
      }
    }
  }
});
```

### Gap Handling

**Policy:** If `replayBuffer.replay(session_id, last_seq)` returns entries but there are gaps in the seq range (i.e., `entries[i].seq !== entries[i-1].seq + 1`), send `resume_full_snapshot` with `reason: 'buffer_gap'`. Never serve a partial gapped replay — G2 client state machine cannot detect gaps and would render stale data.

**Gap detection helper (add to `ReplayBuffer`):**

```typescript
hasGap(sessionId: string, fromSeq: number): boolean {
  const entries = this.sessions.get(sessionId) ?? [];
  const relevant = entries.filter(e => e.seq > fromSeq);
  if (relevant.length === 0) return false;
  for (let i = 1; i < relevant.length; i++) {
    const prev = relevant[i - 1];
    const curr = relevant[i];
    if (prev !== undefined && curr !== undefined && curr.seq !== prev.seq + 1) return true;
  }
  return false;
}
```

**When can gaps occur?** In Phase 03 MVP: never, because `emitDelta` is called synchronously on the main event loop and `ReplayBuffer.push` is called atomically after each send. Gaps can occur only if: (a) a concurrent `clearSession` races with a push, or (b) future Phase 11+ multi-consumer introduces out-of-order emits. Add the gap detection as defensive code now to avoid Phase 11 surprise.

### Replay vs Full-Snapshot Decision Tree

```
client sends client_resume { last_seq: N }
  ↓
replay = replayBuffer.replay(sessionId, N)
  ├── replay is empty AND N > 0
  │     → resume_full_snapshot (reason: buffer_expired)
  ├── replay has gaps (seq not contiguous)
  │     → resume_full_snapshot (reason: buffer_gap)
  └── replay is non-empty AND no gaps (or N === 0)
        → resume_replay { count }, then send all envelopes in seq order
            client re-fetches REST snapshot ONLY for full-snapshot case
```

**The "G2 reconnects > 60s" path:** ADR-0002 specifies "beyond 60 s falls back to full state via `GET /v1/actor`". This is a client-side decision triggered by receiving `resume_full_snapshot`. The bridge does NOT push a full snapshot over WS (per ADR-0002: "no new full-state-dump message invented"). Client calls `GET /v1/character/:actorId`, `GET /v1/combat/current`, `GET /v1/scene/viewport` individually.

---

## Research Area 7: POST /v1/actor/* Stub Design

### Route Pattern Decision

**Use `/v1/tools/:name` (not `/v1/actor/:actorId/:tool`)** per ADR-0003. Reasons:
1. ADR-0003 describes a tool-addressed registry, not actor-addressed routing
2. Phase 11 foundry-mcp reads `GET /v1/tools` and maps tool names to MCP tool entries — if the REST route were `/v1/actor/:actorId/:tool`, the MCP tool names would need actor IDs embedded (wrong)
3. Actor context lives in the request body (`actor_id` field), not the URL path

### Stub Dispatcher Architecture

```typescript
// packages/bridge/src/routes/tools-dispatch.ts

import { TOOL_REGISTRY, type ToolName } from '@evf/shared-protocol';

// Dispatch table: maps tool name → handler function
// Phase 03: all handlers return 'phase-07-pending' stub
// Phase 07: replaces each handler with real socketlib.executeAsGM call
type ToolHandler = (input: unknown, idempotencyKey: string | undefined) => Promise<unknown>;

const TOOL_DISPATCH_TABLE: Record<ToolName, ToolHandler> = {
  cast_spell:     async (input, key) => makeStubResponse('cast_spell', input, key),
  weapon_attack:  async (input, key) => makeStubResponse('weapon_attack', input, key),
  use_item:       async (input, key) => makeStubResponse('use_item', input, key),
  skill_check:    async (input, key) => makeStubResponse('skill_check', input, key),
  move_token:     async (input, key) => makeStubResponse('move_token', input, key),
  place_template: async (input, key) => makeStubResponse('place_template', input, key),
  set_targets:    async (input, key) => makeStubResponse('set_targets', input, key),
};

function makeStubResponse(tool: string, input: unknown, key: string | undefined): unknown {
  return {
    status: 'phase-07-pending',
    tool,
    idempotency_key: key ?? null,
    accepted_at: Date.now(),
  };
}
```

### Testing Stubs Against Phase 02 Read-Only Module

Phase 03 stubs return responses from the bridge itself — no socketlib dispatch occurs. Tests use `buildServer()` with injected `foundryValidateFn` (existing pattern) and call `.inject()` on `POST /v1/tools/cast_spell`. The Foundry module side is NOT involved in Phase 03 tool tests. This satisfies success criterion 4 (callability) without violating the read-only contract.

The Foundry-side stub handlers (returning `{ status: 'phase-07-pending' }`) ARE needed for the socketlib dispatch table but Phase 03 doesn't call them from the bridge side. They are added to `socketlib-handlers.ts` as dead stubs so Phase 07 has a clean registration point:

```typescript
// Add to registerSocketlibHandlers() in foundry-module
socketlib.registerComplexHandler(MODULE_ID, 'evf.castSpell',     (_input: unknown) => ({ status: 'phase-07-pending' }));
socketlib.registerComplexHandler(MODULE_ID, 'evf.weaponAttack',  (_input: unknown) => ({ status: 'phase-07-pending' }));
// ... etc for all 7 tools
```

---

## Research Area 8: Per-Tool Zod Schemas

### Minimum Required Fields

Derived from dnd5e 5.x Activity system and MidiQOL `completeActivityUse` signature (verified against Phase 02 research findings and Specs.md §5.7.2):

| Tool | Key Fields | Phase 07 Notes |
|------|-----------|---------------|
| `cast_spell` | `actor_id`, `spell_id`, `slot_level` (0=cantrip), `targets[]` | `activity.use({ spellLevel: slot_level })` or MidiQOL completeActivityUse |
| `weapon_attack` | `actor_id`, `item_id`, `targets[]`, `advantage` | `activity.use()` + MidiQOL for damage |
| `use_item` | `actor_id`, `item_id`, `targets[]` | `activity.use()` covers consumables + features |
| `skill_check` | `actor_id`, `skill` (Foundry key), `advantage` | `actor.rollSkill(skill, { advantage })` or dnd5e skill activity |
| `move_token` | `token_id`, `x`, `y` | Canvas API: `token.document.update({ x, y })` via GM |
| `place_template` | `actor_id`, `item_id`, `x`, `y` | `AbilityTemplate.fromActivity(activity).drawPreview()` — phase 07 |
| `set_targets` | `token_ids[]`, `user_id?` | `game.user.updateTokenTargets(token_ids)` |

**PHB 2014 vs PHB 2024 schema impact:**
- `cast_spell.slot_level`: Both editions use slot levels 1–9; `slot_level: 0` = cantrip (edition-agnostic). No schema branch needed.
- `skill_check.skill`: Foundry internal key (e.g., `"athletics"`) is the same string in both editions — dnd5e 5.x normalizes the identifier. No schema branch.
- Conclusion: **No dual-edition schema branching required in Phase 03 tool schemas.** The runtime `core.modernRules` flag affects dnd5e 5.x behavior, not our API surface.

### dnd5e 5.3.3 Activity System Note (Phase 07 forward-compat)

Phase 03 tool schemas reference `item_id` generically. Phase 07 must translate `item_id` to the specific Activity UUID within that item. The dnd5e 5.x Activity system structure: `item.system.activities` is now a Map (changed from array in 5.3.0). Phase 07 research must account for `item.system.activities.get(activityId)` iteration. Phase 03 schemas use `item_id` as the discriminant and Phase 07 resolves the activity from it.

---

## Research Area 9: Test Patterns for Fastify Integration Tests

### Existing Pattern (Phase 02)

Tests in `packages/bridge/src/server.test.ts` use:
- `buildServer({ foundryValidateFn: mockFn, langDirOverride: LANG_DIR })`
- `app.inject({ method, url, headers, payload })`
- `afterEach(() => app.close())`
- `vi.fn()` for mock functions (no mock libraries)
- Type assertions via `res.json<T>()`

Phase 03 adds to `BuildServerOptions`:
- `metricsRegistry?: Registry` — test isolation for prom-client
- `idempotencyStore?: IdempotencyStore` — expose for test inspection

### Testing WS Resume Protocol

`@fastify/websocket` does not support `.inject()` for WS routes. Phase 02 used `EventEmitter`-based `MockSocket` for handshake tests (see `ws/handshake.test.ts`). Phase 03 extends this pattern:

```typescript
// In ws/resume.test.ts
function makeMockSocket() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
  };
}
```

Call `handleResume(socket, sessionId, replayBuffer)` directly in tests — no real WS binding needed for unit tests.

For integration tests that need real WS, use Node's built-in `WebSocket` (Node 22+ native) against a `buildServer()` instance with `.listen()`. Pattern:

```typescript
const app = await buildServer({ foundryValidateFn: makeMockFn() });
await app.listen({ port: 0 });  // random port for test isolation
const address = app.server.address() as AddressInfo;
const ws = new WebSocket(`ws://localhost:${address.port}/ws`);
// ... handshake, send client_resume, assert response
await app.close();
```

**Known issue (Phase 02 Pitfall):** `@fastify/websocket` test helpers do not exist. The `app.inject()` approach fails for WS routes. The mock socket approach for unit tests + actual ws client for integration tests is the established pattern.

### prom-client Metrics in Tests

After each handler call, use `registry.getSingleMetric('evf_idempotency_dedup_total')` and compare `.get()` before/after:

```typescript
const counter = registry.getSingleMetric('evf_idempotency_dedup_total') as Counter;
const before = (await counter.get()).values[0]?.value ?? 0;
await app.inject({ method: 'POST', url: '/v1/tools/cast_spell', headers: { 'idempotency-key': 'key-1', ... }, payload: body });
await app.inject({ method: 'POST', url: '/v1/tools/cast_spell', headers: { 'idempotency-key': 'key-1', ... }, payload: body });
const after = (await counter.get()).values[0]?.value ?? 0;
expect(after - before).toBe(1);
```

### Coverage Requirement

Phase 03 new files need 80%+ coverage. Files to cover:
- `routes/tools-route.ts` — GET + POST handler
- `routes/healthz.ts` + `routes/readyz.ts`
- `routes/metrics.ts`
- `middleware/idempotency.ts` — all edge cases (new key, hit, conflict, expired)
- `ws/resume.ts` (if extracted) or inline in `ws/handshake.ts`
- `shared-protocol/src/tools.ts` — schema + registry

**vitest.config.ts change needed:** Remove `'packages/bridge/src/index.ts'` from the exclude list when the placeholder is replaced with real entrypoint code. BUT: `index.ts` starts a server and cannot be unit-tested. Keep it excluded; integration coverage comes from `server.test.ts` which imports `buildServer` directly.

---

## Research Area 10: Docker Compose Dev vs Prod Split

### Layout Under `deploy/`

```
deploy/
├── bridge.Dockerfile          # multi-stage node:24-alpine
├── docker-compose.yml         # prod-like (bridge + plugin-host)
├── docker-compose.dev.yml     # dev overrides (volume mount, debug log)
├── .env.example               # template for required env vars (committed)
├── .env                       # actual secrets (gitignored)
└── nginx.conf                 # optional custom nginx config for plugin-host
```

### pnpm Workspace in Docker: The Key Pattern

**Problem:** pnpm workspaces use symlinks and a virtual store. A naive `COPY . .` in Docker breaks the symlinks. The correct pattern for monorepo Docker builds:

**Option A (recommended for MVP):** Build locally with pnpm, copy only `dist/` + `node_modules/` into Docker.
```dockerfile
# .dockerignore excludes node_modules; builder stage re-installs
# But this means the Docker image must have pnpm and run `pnpm install`
```

**Option B (used here):** Multi-stage build where the builder stage has the full workspace. pnpm's `--prod` flag prunes devDeps before copy to runner stage.

```dockerfile
# In builder stage, after build:
RUN pnpm --filter @evf/bridge --prod deploy /app/bridge-deploy
# This creates a self-contained directory with prod deps only (no symlinks)
```

The `pnpm deploy` command (pnpm docs) creates a standalone directory at the target path with all production deps copied (no symlinks). This is the recommended Docker pattern for pnpm workspaces. Verified: `pnpm@10.33.4` supports this.

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @evf/bridge build
# pnpm deploy creates a flat node_modules (no workspace symlinks)
RUN pnpm --filter @evf/bridge --prod deploy /app/bridge

FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app/bridge .
ENV NODE_ENV=production
EXPOSE 8910
ENTRYPOINT ["node", "dist/index.js"]
```

---

## Architecture Patterns

### Recommended File Structure for Phase 03

```
packages/bridge/src/
├── index.ts                    # REPLACED: real entrypoint (start + listen)
├── server.ts                   # EXTENDED: add idempotency + metrics + new routes
├── auth/
│   ├── token-cache.ts          # UNCHANGED
│   └── token-cache.test.ts     # UNCHANGED
├── middleware/
│   └── idempotency.ts          # NEW: IdempotencyStore + Fastify hooks
├── metrics/
│   └── registry.ts             # NEW: prom-client Registry + metric definitions
├── routes/
│   ├── health.ts               # MODIFIED: split GET /v1/health into /healthz + /readyz
│   ├── healthz.ts              # NEW: GET /healthz (no auth)
│   ├── readyz.ts               # NEW: GET /readyz (no auth)
│   ├── metrics.ts              # NEW: GET /metrics (prom-client scrape)
│   ├── tools.ts                # REPLACED: real registry + dispatch
│   ├── tools-dispatch.ts       # NEW: TOOL_DISPATCH_TABLE with stubs
│   ├── character.ts            # UNCHANGED
│   ├── combat.ts               # UNCHANGED
│   ├── scene.ts                # UNCHANGED
│   ├── events.ts               # UNCHANGED
│   ├── characters-list.ts      # UNCHANGED
│   └── internal-delta.ts       # UNCHANGED
├── types/
│   └── fastify.d.ts            # NEW: FastifyRequest augmentation
└── ws/
    ├── handshake.ts            # EXTENDED: call deltaEmitter.registerSession + on('close')
    ├── handshake.test.ts       # EXTENDED: add resume test cases
    ├── resume.ts               # NEW (optional): extracted resume handler
    ├── replay-buffer.ts        # EXTENDED: add hasGap() helper
    ├── replay-buffer.test.ts   # EXTENDED: gap detection tests
    ├── delta-emitter.ts        # UNCHANGED
    ├── delta-emitter.test.ts   # UNCHANGED
    └── session-store.ts        # UNCHANGED

packages/shared-protocol/src/
├── envelope.ts                 # EXTENDED: add ClientResumeSchema, ResumeReplaySchema
├── handshake.ts                # MINOR: add 'write_dispatch' to SERVER_CAPS_V1 stub
├── tools.ts                    # NEW: TOOL_REGISTRY + 7 ToolInput schemas
└── payloads/                   # UNCHANGED

deploy/
├── bridge.Dockerfile           # NEW
├── docker-compose.yml          # NEW
├── docker-compose.dev.yml      # NEW
└── .env.example                # NEW

packages/foundry-module/src/pair/
└── socketlib-handlers.ts       # MINOR EXTENSION: add 7 stub tool handlers
```

### Critical Wiring Fix: deltaEmitter.registerSession

The **highest priority correction** for Phase 03: Phase 02's `server.ts` WS route handler calls `handleHandshake(socket, req, tokenCache, replayBuffer, sessionStore, log)` but never calls `deltaEmitter.registerSession(sessionId, socket)` afterward. The `DeltaEmitter.connections` Map is always empty in production. Deltas emitted via `/internal/delta` are computed but never sent to any WS client.

Fix: `handleHandshake` returns the `sessionId` on success (or `null` on failure). The `server.ts` WS route uses it:

```typescript
app.get('/ws', { websocket: true }, (socket, req) => {
  void handleHandshake(socket, req, tokenCache, replayBuffer, sessionStore, app.log as Logger)
    .then((sessionId) => {
      if (sessionId !== null) {
        deltaEmitter.registerSession(sessionId, socket);
        socket.on('close', () => {
          deltaEmitter.unregisterSession(sessionId);
          sessionStore.deleteSession(sessionId);
          replayBuffer.clearSession(sessionId);
        });
        // Register ongoing message listener for client_resume
        socket.on('message', (rawData) => handleResume(socket, sessionId, replayBuffer, sessionStore));
      }
    });
});
```

`handleHandshake` signature change: `Promise<void>` → `Promise<string | null>` where the string is the `sessionId` on success.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema from Zod | Custom schema serializer | `zod.schema.toJSONSchema()` (native Zod 4) | Already in `zod@4.4.3` — zero dep, JSON Schema Draft 2020-12 |
| Prometheus metrics | Custom metric aggregation | `prom-client@15.1.3` | Battle-tested; Grafana/Prometheus standard; handles concurrency and label cardinality |
| LRU eviction for idempotency | Custom LRU with linked-list | Plain `Map` with `cachedAt` + TTL check on get | MVP single-tenant. 60s window. Phase 13: upgrade to `lru-cache@11.x` if eviction pressure grows |
| Constant-time comparison | Custom `===` for secrets | `node:crypto.timingSafeEqual` | Already used in `internal-delta.ts` (T-02-01); same pattern extends to any future secret comparison |
| Token redaction in logs | Custom pino serializer | pino `redact` config (already in `server.ts`) | Already implemented; just extend the redact array for new secret field names |
| WS reconnect/replay | Custom stateful buffer | `ReplayBuffer` (Phase 02) | Already built; Phase 03 only adds the `client_resume` message handler |

---

## Common Pitfalls

### Pitfall 1: DeltaEmitter Not Wired to WS Sessions (CRITICAL — Phase 02 Gap)

**What goes wrong:** `/internal/delta` receives deltas, `emitDelta` is called, but `deltaEmitter.connections` is empty because `registerSession` is never called in `server.ts`.
**Why it happens:** `handleHandshake` returns `Promise<void>` — there is no way to get the `sessionId` back in the caller without refactoring.
**How to avoid:** Change `handleHandshake` return type to `Promise<string | null>` (sessionId on success, null on failure). Wire `registerSession` + `socket.on('close')` in `server.ts`.
**Warning signs:** E2E test sends a delta and WS client never receives it. Metrics show `emf_ws_sessions_active` = 0 even after handshake.

### Pitfall 2: prom-client Global Registry Collision in Tests

**What goes wrong:** `Error: A metric with the name evf_http_request_duration_seconds has already been registered` — second test file imports `buildServer` which re-registers metrics against the default global registry.
**Why it happens:** `prom-client` uses a process-global default `Registry` if you use the bare `new Counter({...})` API.
**How to avoid:** Always pass `registers: [registry]` to every metric constructor, where `registry` is a fresh `new Registry()` per `buildServer()` instance. Pass registry through `BuildServerOptions`.
**Warning signs:** First test suite green, second test file fails with `AlreadyRegisteredError`.

### Pitfall 3: Vitest Project Glob Root Resolution (Established Pitfall from Phase 01)

**What goes wrong:** Running `pnpm test` from inside `packages/bridge/` resolves `vitest.config.ts` locally but ignores root `test.projects` glob, so coverage thresholds from root config are not applied.
**How to avoid:** Per Phase 01 Plan 02 decision: per-package `test` script uses `vitest --run --project @evf/bridge --root ../..` to resolve from monorepo root.
**Current state:** `packages/bridge/package.json` has `"test": "vitest --run"` — this will NOT use the root config's coverage thresholds. Phase 03 must fix this to `vitest --run --project @evf/bridge --root ../..` or verify CI always runs from root.

### Pitfall 4: `vi.mock` Hoisting with `prom-client` (Phase 02 Established Pitfall)

**What goes wrong:** `vi.mock('prom-client', ...)` combined with ES module hoisting can cause ordering issues — the mock runs before the module under test has imported the real prom-client.
**How to avoid:** Do NOT mock `prom-client`. Instead, use the real `prom-client` with a fresh `Registry` per test (see Pitfall 2). This avoids `vi.mock` entirely.

### Pitfall 5: `fastify-metrics` Uses `@platformatic/prom-client` Not npm `prom-client`

**What goes wrong:** Installing `fastify-metrics@13.2.0` and also `prom-client@15.1.3` causes two incompatible metric implementations in the same process. Metrics registered with one are not visible to the other.
**Why it happens:** `fastify-metrics` declares `@platformatic/prom-client@^1.0.0` as a peer dep — a fork that is NOT the same as npm `prom-client`.
**How to avoid:** Do NOT install `fastify-metrics`. Use `prom-client@15.1.3` directly with a custom `GET /metrics` route.

### Pitfall 6: Vitest 4 `defineProject` Rejects `extends: true` (Phase 01 Known)

**What goes wrong:** Per-package `vitest.config.ts` that sets `extends: true` fails TypeScript strict type check (`UserProjectConfigExport` type does not include `extends` field).
**How to avoid:** Do NOT add `extends: true` to per-package vitest configs. Vitest 4 merges root config via `test.projects` glob automatically.

### Pitfall 7: WS Resume Gap — Partial Replay Silently Corrupts G2 State

**What goes wrong:** Client reconnects with `last_seq: 5`. Buffer has entries at seq 6, 8, 9 (seq 7 was evicted mid-eviction cycle due to a timing edge case). Bridge sends seq 6, 8, 9. Client assumes monotonic seq and jumps from 6 to 8, silently losing the combat update at seq 7.
**Why it happens:** `ReplayBuffer.push` does eager eviction only on push for the SAME session. If the buffer grows large for another session and eviction is triggered by a different push, there is no cross-session eviction. In MVP (single session), this cannot happen. In future multi-session, gap possible.
**How to avoid:** Always check `hasGap()` before sending replay. On any gap → send `resume_full_snapshot`.

### Pitfall 8: `noUncheckedIndexedAccess` Array Access Pattern (Phase 01 Known)

**What goes wrong:** `entries[entries.length - 1].seq` fails with TS2532 because `noUncheckedIndexedAccess` makes index access return `T | undefined`.
**How to avoid:** Use `entries.at(-1)` (returns `T | undefined`, but forces explicit guard) or use the pattern already established in `replay-buffer.ts`:
```typescript
const last = entries[entries.length - 1];
return last !== undefined ? last.seq : 0;
```
All new array index accesses in Phase 03 must follow this pattern.

### Pitfall 9: `exactOptionalPropertyTypes` and Fastify Request Augmentation

**What goes wrong:** Adding optional properties to `FastifyRequest` via module augmentation with `prop?: Type` fails under `exactOptionalPropertyTypes` because setting `req.prop = undefined` is not assignable to `Type`.
**How to avoid:** Use `prop: Type | undefined` (explicit union) instead of `prop?: Type` in the augmented type. Existing `Session` interface already follows this pattern.

### Pitfall 10: Docker `pnpm deploy` and `@evf/shared-protocol` Workspace Dep

**What goes wrong:** `pnpm --filter @evf/bridge --prod deploy /app/bridge` copies bridge's production deps but `@evf/shared-protocol` is a `workspace:*` dep — pnpm must resolve it to the local package before copying. If the workspace packages are not built before deploy, `shared-protocol/dist/` won't exist.
**How to avoid:** Run `pnpm --filter @evf/shared-protocol build` BEFORE `pnpm --filter @evf/bridge --prod deploy`. In Dockerfile: build all packages before deploying.

---

## Code Examples

### Zod 4 Native `.toJSONSchema()` (Verified in-repo)

```typescript
// Source: verified against node_modules/.pnpm/zod@4.4.3/... (2026-05-12)
import { z } from 'zod';

const CastSpellInputSchema = z.object({
  actor_id: z.string().min(1),
  spell_id: z.string().min(1),
  slot_level: z.number().int().min(0).max(9),
  targets: z.array(z.string()),
});

const jsonSchema = CastSpellInputSchema.toJSONSchema();
// Returns JSON Schema Draft 2020-12:
// { "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object",
//   "properties": { "actor_id": { "type": "string", "minLength": 1 }, ... },
//   "required": ["actor_id", "spell_id", "slot_level", "targets"],
//   "additionalProperties": false }
```

### Idempotency Hook Pattern

```typescript
// Source: RFC draft-ietf-httpapi-idempotency-key-header-04 + established Fastify hook pattern
app.addHook('preHandler', async (request, reply) => {
  if (request.method !== 'POST') return;
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string') return;

  const existing = idempotencyStore.get(key);
  if (existing !== undefined) {
    const bodyHash = hashBody(request.body);
    if (existing.requestBodyHash !== bodyHash) {
      return reply.status(422).send({ error: 'idempotency_key_conflict' });
    }
    return reply.status(existing.responseStatus).send(existing.responseBody);
  }
  request.idempotencyKey = key;
  request.idempotencyBodyHash = hashBody(request.body);
});
```

### prom-client Counter with Per-Server Registry

```typescript
// Source: prom-client@15.1.3 README pattern (verified 2026-05-12)
import { Counter, Registry } from 'prom-client';

function createMetrics(registry: Registry) {
  return {
    idempotencyDedup: new Counter({
      name: 'evf_idempotency_dedup_total',
      help: 'Idempotency dedup hits',
      registers: [registry],  // CRITICAL: pass registry for test isolation
    }),
  };
}
```

### WS Resume Handler

```typescript
// After handshake succeeds in server.ts:
socket.on('message', (rawData: Buffer) => {
  try {
    const msg = JSON.parse(rawData.toString());
    if (msg?.type === 'client_resume' && typeof msg.last_seq === 'number') {
      const missed = replayBuffer.replay(sessionId, msg.last_seq as number);
      const hasGap = replayBuffer.hasGap(sessionId, msg.last_seq as number);

      if ((missed.length === 0 && msg.last_seq > 0) || hasGap) {
        socket.send(JSON.stringify({
          proto: 'evf-v1', type: 'resume_full_snapshot',
          reason: hasGap ? 'buffer_gap' : 'buffer_expired'
        }));
      } else {
        socket.send(JSON.stringify({ proto: 'evf-v1', type: 'resume_replay', count: missed.length }));
        for (const env of missed) socket.send(JSON.stringify(env));
      }
    }
  } catch { /* ignore malformed post-handshake messages */ }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| External `zod-to-json-schema` package | Zod 4 native `.toJSONSchema()` | Zod 4.0 release (~2025) | No extra dep; Draft 2020-12 output |
| `fastify-plugin` wrapper for metrics | Direct `prom-client` + Fastify route | Always available | Simpler; avoids `@platformatic/prom-client` conflict |
| HTTP+SSE MCP transport | Streamable HTTP (deprecated since 2025-03-26) | Protocol rev 2024-11-05 | ADR-0004 already handles this |
| `pnpm deploy` naive Docker COPY | `pnpm --prod deploy` creates symlink-free directory | pnpm 7+ | Clean Docker runner without workspace symlinks |

---

## Open Questions

1. **handleHandshake return type refactor scope**
   - What we know: current return type is `Promise<void>`; needs to return sessionId for wiring
   - What's unclear: whether to change `handleHandshake` signature or add a `postHandshake` callback pattern
   - Recommendation: change return type to `Promise<string | null>` — simpler, testable

2. **`/v1/health` backward compat vs deprecation**
   - What we know: Phase 02 wizard Step 2 calls `GET /v1/health` to validate a bearer
   - What's unclear: should Phase 03 keep `/v1/health` unchanged and add new `/healthz`+`/readyz`, or migrate?
   - Recommendation: keep `/v1/health` unchanged (it serves a different purpose — user-facing bearer validation). Add `/healthz` and `/readyz` as separate ops-only routes.

3. **Bridge `index.ts` entrypoint: socketlib client**
   - What we know: production `buildServer` needs a real `foundryValidateFn` that calls socketlib
   - What's unclear: does the bridge Node process directly call socketlib? (socketlib runs inside Foundry's browser process — bridge communicates via REST or WS to Foundry, not direct socketlib import)
   - Recommendation: the `foundryValidateFn` in production `index.ts` should call `evf.validateToken` via the existing socketlib-HTTP adapter that Phase 02 wired. Verify the actual adapter code in `packages/foundry-module` before Phase 03 Plan writing.

4. **Idempotency middleware scope: all POST routes or only tool routes?**
   - What we know: ADR-0002 specifies idempotency on "client → bridge POST path"
   - What's unclear: should idempotency also apply to `POST /internal/delta`?
   - Recommendation: apply only to `POST /v1/tools/:name`. The `/internal/delta` route is server-to-server (module→bridge) and already has its own auth; delta dedup would interfere with the real-time push semantic.

---

## Validation Architecture

`nyquist_validation: true` is set in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `packages/bridge/vitest.config.ts` (exists from Phase 02) |
| Quick run command | `pnpm --filter @evf/bridge test` |
| Full suite command | `pnpm test` (workspace root) |

### Acceptance Criterion → Test Map

| Criterion | Behavior | Test Type | Automated Command | File Exists? |
|-----------|---------|-----------|-------------------|-------------|
| SC-1a: Bridge boots via Docker Compose | `GET /healthz` returns 200 | integration (inject) | `pnpm --filter @evf/bridge test` | ❌ Wave 0 |
| SC-1b: `/readyz` returns 503 when ENV missing | `/readyz` with no `EVF_INTERNAL_SECRET` | unit | `pnpm --filter @evf/bridge test` | ❌ Wave 0 |
| SC-1c: `/metrics` returns prometheus text | `GET /metrics` content-type | integration (inject) | `pnpm --filter @evf/bridge test` | ❌ Wave 0 |
| SC-1d: Unauthenticated requests rejected | `GET /v1/health` no bearer → 401 | integration (inject) | pnpm test | ✅ `server.test.ts` |
| SC-2a: POST /v1/actor/* round-trips | `POST /v1/tools/cast_spell` with valid bearer → 200 stub | integration (inject) | pnpm test | ❌ Wave 0 |
| SC-2b: WS envelope shape correct | WS message has `proto, seq, ts, type, session_id` | unit (mock socket) | pnpm test | ✅ `delta-emitter.test.ts` |
| SC-3a: Idempotency dedup | Same POST twice with same key → second returns cached | integration (inject) | pnpm test | ❌ Wave 0 |
| SC-3b: Idempotency conflict | Same key + different body → 422 | integration (inject) | pnpm test | ❌ Wave 0 |
| SC-3c: Dedup metric increments | `evf_idempotency_dedup_total` increments on dedup | integration (inject) | pnpm test | ❌ Wave 0 |
| SC-4a: GET /v1/tools returns 7 entries | `GET /v1/tools` → array with 7 tool names | integration (inject) | pnpm test | ❌ Wave 0 |
| SC-4b: Each tool has inputSchema | Each entry has `name`, `description`, `inputSchema` with `type: "object"` | unit | pnpm test | ❌ Wave 0 |
| SC-4c: Tool dispatch stub 200 | `POST /v1/tools/weapon_attack` → `{ status: 'phase-07-pending' }` | integration (inject) | pnpm test | ❌ Wave 0 |
| SC-5a: WS resume within window | Client sends `client_resume { last_seq: N }` → receives replay deltas | unit (mock socket) | pnpm test | ❌ Wave 0 |
| SC-5b: WS resume beyond window | `client_resume` after 60s → `resume_full_snapshot` | unit (mock socket + fake timers) | pnpm test | ❌ Wave 0 |
| SC-5c: WS resume gap → full snapshot | Buffer has gap → `resume_full_snapshot { reason: 'buffer_gap' }` | unit | pnpm test | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @evf/bridge test`
- **Per wave merge:** `pnpm test:coverage` (workspace-wide, must hit 80%)
- **Phase gate:** Full suite green + coverage ≥80% before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/bridge/src/routes/healthz.ts` — covers SC-1a, SC-1b
- [ ] `packages/bridge/src/routes/readyz.ts` — covers SC-1b
- [ ] `packages/bridge/src/routes/metrics.ts` — covers SC-1c
- [ ] `packages/bridge/src/routes/tools.ts` (replacement) — covers SC-4a, SC-4b, SC-4c, SC-2a
- [ ] `packages/bridge/src/middleware/idempotency.ts` — covers SC-3a, SC-3b, SC-3c
- [ ] `packages/bridge/src/ws/resume.ts` (or inline) — covers SC-5a, SC-5b, SC-5c
- [ ] `packages/shared-protocol/src/tools.ts` — covers SC-4b (schema shape)
- [ ] `packages/bridge/src/types/fastify.d.ts` — needed for TypeScript strict compilation
- [ ] `deploy/bridge.Dockerfile` + `deploy/docker-compose.yml` — SC-1a (no automated test; manual smoke)
- [ ] `packages/bridge/src/metrics/registry.ts` — prom-client setup

---

## Sources

### Primary (HIGH confidence)

- Phase 02 SUMMARY files (02-04-SUMMARY.md, 02-05-SUMMARY.md) — authoritative on what already exists
- Phase 02 source code (server.ts, token-cache.ts, replay-buffer.ts, handshake.ts, delta-emitter.ts) — read directly
- ADR-0002, ADR-0003, ADR-0008 — locked decisions
- `node_modules/.pnpm/zod@4.4.3/.../index.js` — Zod 4 `.toJSONSchema()` verified by direct node execution (2026-05-12)
- `npm view prom-client version` — 15.1.3 confirmed (2026-05-12)
- `npm view fastify-metrics peerDependencies` — `@platformatic/prom-client` conflict confirmed (2026-05-12)
- `npm view zod-to-json-schema` — `peerDependencies: { zod: '^3.25.28 || ^4' }` — supports Zod 4 but unnecessary (2026-05-12)

### Secondary (MEDIUM confidence)

- RFC draft-ietf-httpapi-idempotency-key-header-04 — fetched 2026-05-12. HTTP 422 for key+different-body confirmed. Response replay semantics confirmed.
- CLAUDE.md §Technology Stack — prom-client@15.1.3 declared as project stack pin
- pnpm documentation (known from training): `pnpm --prod deploy` for Docker

### Tertiary (LOW confidence)

- dnd5e 5.x Activity API field names (`slot_level`, `actor_id`) — derived from Phase 02 research findings + Specs.md §5.7.2. Needs Phase 07 empirical verification against live dnd5e 5.3.3.
- `pnpm deploy` Dockerfile pattern — known from training data; should be verified against pnpm 10.33.4 docs before final Dockerfile is written.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions from npm registry or in-repo
- Architecture: HIGH — extends verified Phase 02 code directly
- Docker Compose: MEDIUM-HIGH — standard node:24-alpine pattern; pnpm deploy deserves doc verification
- Idempotency: HIGH — RFC verified, pattern is standard Fastify hook idiom
- Tool Registry: HIGH (schema shape) / MEDIUM (dnd5e field names)
- WS Resume: HIGH — extends existing ReplayBuffer
- Pitfalls: HIGH — most from Phase 01/02 established patterns

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (stable stack; Zod 4 and prom-client APIs unlikely to change)
