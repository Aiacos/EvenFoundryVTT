---
phase: 03-bridge-service-skeleton
plan: "02"
subsystem: bridge
tags: [bridge, idempotency, fastify-hooks, rfc-idempotency-key, adr-0002, security]

dependency-graph:
  requires:
    - handshake-returns-sessionid        # 03-01
    - deltaemitter-registersession-production-wiring  # 03-01
  provides:
    - idempotency-store-singleton
    - fastify-request-augmentation-idempotency
    - rfc-idempotency-dedup-post-routes
    - dedup-callback-hook-for-03-03-metrics
  affects: [03-03-ops-endpoints-metrics, 03-04-tool-registry]

tech-stack:
  added: []  # no new dependencies — uses node:crypto (built-in) + Fastify hooks (existing)
  patterns:
    - "IdempotencyStore: Map-based 60s TTL + LRU eviction via insertion-order deletion"
    - "Fastify preHandler+onSend hook pair for request-scoped idempotency"
    - "FastifyRequest augmentation with explicit T | undefined unions (exactOptionalPropertyTypes)"
    - "opts.onDedup callback reserved for Plan 03-03 metrics counter"
    - "vi.useFakeTimers() for unit TTL tests; real timers for integration tests (Fastify compat)"

key-files:
  created:
    - packages/bridge/src/middleware/idempotency.ts
    - packages/bridge/src/middleware/idempotency.test.ts
    - packages/bridge/src/types/fastify.d.ts
    - .changeset/03-02-idempotency-middleware.md
    - .planning/phases/03-bridge-service-skeleton/03-02-SUMMARY.md
  modified:
    - packages/bridge/src/server.ts    # IdempotencyStore singleton + registerIdempotencyHooks + redact

decisions:
  - "Used IDEMPOTENCY_EXCLUDED_PREFIXES array constant for excluded URL prefixes (extensible; /internal/ is the only current entry)"
  - "Integration tests use real Fastify inject() with real timers; vi.useFakeTimers() only in unit tests (test 3+4) to avoid Fastify async init race"
  - "Test 7 (TTL expiry) uses vi.useFakeTimers/advanceTimersByTime between injects rather than mid-Fastify-request to avoid timeout"
  - "SHA-256 hex string equality for body hash check (not timingSafeEqual) — hashes are not secrets, server computes both sides"
  - "opts.onDedup callback reserved as empty hook; Plan 03-03 wires the counter increment"

metrics:
  duration: ~45min
  completed: 2026-05-12
  tasks: 1   # plan has a single task covering all deliverables
  files: 5   # created/modified
---

# Phase 03 Plan 02: Idempotency-Key Middleware Summary

## Goal

Implement RFC `draft-ietf-httpapi-idempotency-key-header-04` deduplication semantics
as a Fastify-native preHandler + onSend hook pair backed by a per-server `IdempotencyStore`
with a 60-second LRU window (ADR-0002). The middleware prevents R1-tap-flutter from causing
double `activity.use()` fire when Plan 03-04's tool routes land.

## What was built

### FastifyRequest augmentation (`packages/bridge/src/types/fastify.d.ts`)

Single `.d.ts` module augmentation for the `fastify` module. Three fields added with
explicit `T | undefined` unions (NOT `?: T`) to satisfy `exactOptionalPropertyTypes`:

```ts
declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey: string | undefined;       // set in preHandler new-key path
    idempotencyBodyHash: string | undefined;  // SHA-256 hex, computed once in preHandler
    evfStartTime: number | undefined;         // reserved for Plan 03-03 HTTP histogram
  }
}
```

### IdempotencyStore (`packages/bridge/src/middleware/idempotency.ts`)

```ts
export class IdempotencyStore {
  get(key: string): IdempotencyEntry | undefined;  // lazy TTL eviction on read
  set(key: string, entry: Omit<IdempotencyEntry, 'cachedAt'>): void;
  get size(): number;   // exposed for Plan 03-03 gauge
  clear(): void;        // test-only reset
}
```

Constants:
- `TTL_MS = 60_000` (ADR-0002, 60s window)
- `MAX_ENTRIES = 10_000` (T-03-06 DoS mitigation)
- `IDEMPOTENCY_EXCLUDED_PREFIXES = ['/internal/']` (extensible array)

### RFC truth table

| Method | Has Key | Body hash match | Entry age | Result                        |
| ------ | ------- | --------------- | --------- | ----------------------------- |
| POST   | yes     | — (new)         | none      | Pass through; cache response  |
| POST   | yes     | match           | < 60s     | 422 `idempotency_key_conflict` |
| POST   | yes     | same            | < 60s     | Replay cached response        |
| POST   | yes     | any             | > 60s     | Pass through; cache response  |
| POST   | no / empty | —            | —         | Pass through; no caching      |
| POST   | yes     | —               | —         | `/internal/*` → pass through  |
| non-POST | any   | —               | —         | Pass through; no caching      |

### registerIdempotencyHooks (`packages/bridge/src/middleware/idempotency.ts`)

```ts
export async function registerIdempotencyHooks(
  app: FastifyInstance,
  store: IdempotencyStore,
  opts?: { onDedup?: () => void },
): Promise<void>
```

**preHandler hook logic:**
1. Method !== POST → return (non-POST passthrough)
2. URL starts with `/internal/` → return (excluded prefix)
3. `Idempotency-Key` header absent or empty → return (no-key passthrough)
4. Compute `SHA-256(JSON.stringify(body ?? null))` as `bodyHash`
5. `store.get(key)`:
   - exists + hash mismatch → `reply.status(422).send({ error: 'idempotency_key_conflict', ... })`
   - exists + hash match → call `opts?.onDedup?.()` + `reply.status(existing.responseStatus).send(existing.responseBody)` (replay; `request.idempotencyKey` NOT set)
   - not found → set `request.idempotencyKey = rawKey` + `request.idempotencyBodyHash = bodyHash`

**onSend hook logic:**
1. `request.idempotencyKey === undefined` → return payload unchanged (covers all non-caching paths AND replay path)
2. Parse payload string → JSON (fallback to raw string on parse failure)
3. `store.set(key, { requestBodyHash, responseStatus, responseBody: parsed })`
4. Return payload unchanged

### server.ts wiring

- `const idempotencyStore = opts.idempotencyStore ?? new IdempotencyStore()` — per-server singleton, injectable for tests
- `await registerIdempotencyHooks(app, idempotencyStore)` — registered at step 4a, BEFORE any route registration
- `'headers.idempotency-key'` added to pino `redact` list (T-03-07)
- `BuildServerOptions.idempotencyStore?: IdempotencyStore` for test injection

### Telemetry hooks reserved for Plan 03-03

- `opts.onDedup` callback: called once per replay hit → Plan 03-03 wires `evf_idempotency_dedup_total.inc()`
- `store.size` getter: Plan 03-03 polls this for `evf_idempotency_store_size` gauge
- `request.evfStartTime` field: Plan 03-03 sets this in an `onRequest` hook for HTTP duration histogram

## Tests

10 tests in `packages/bridge/src/middleware/idempotency.test.ts`:

**Unit (IdempotencyStore):**
1. `get()` returns undefined for unknown key
2. `set()` + `get()` within 60s returns entry
3. Entry evicted after 60s+1ms (vi.useFakeTimers + advanceTimersByTime)
4. Oldest entry evicted when store at MAX_ENTRIES (10,000)

**Integration (registerIdempotencyHooks — Approach A with `/test/echo` route):**
5. Same key + same body → 2nd call returns cached response; spy ran exactly once
6. Same key + different body → 422 `idempotency_key_conflict`
7. Same key + same body after TTL expiry (fake timers between injects) → handler runs again
8. Missing key → handler always runs; `store.size === 0`
9. `POST /internal/delta` with key → handler always runs; `store.size === 0`
10. GET with key → handler always runs; `store.size === 0`

**Gates (post-execution):**

| Gate | Result |
| --- | --- |
| `pnpm --filter @evf/bridge typecheck` | EXIT=0 |
| `pnpm --filter @evf/bridge exec vitest --run` | 113/113 passed (up from 103) |
| `biome ci packages/bridge/src/{middleware,types,server.ts}` | No errors |
| `grep -c "IdempotencyStore" packages/bridge/src/middleware/idempotency.ts` | 5 ≥ 1 |
| `grep -c "headers.idempotency-key" packages/bridge/src/server.ts` | 1 ≥ 1 |
| `grep -c "registerIdempotencyHooks" packages/bridge/src/server.ts` | 2 ≥ 1 |
| `grep -c "request.url.startsWith('/internal/')" ...idempotency.ts` | 1 ≥ 1 |
| `grep -c "Idempotency-Key was already used with a different request body" ...ts` | 1 ≥ 1 |
| `grep -c "TTL_MS = 60_000" ...idempotency.ts` | 1 ≥ 1 |
| `grep -c "MAX_ENTRIES = 10_000" ...idempotency.ts` | 1 ≥ 1 |
| `grep -c "createHash('sha256')" ...idempotency.ts` | 1 ≥ 1 |

## Deviations from plan

**[Rule 3 - Adaptation] Test 7 uses fake timers between injects, not around them.**

- **Found during:** Task 1 integration test implementation.
- **Issue:** `vi.useFakeTimers()` in Fastify's `beforeEach` caused all integration tests to
  time out (Fastify's internal async initialization relies on real timers/promises).
- **Fix:** Unit tests (1-4) use `vi.useFakeTimers()` in their own `beforeEach`/`afterEach`.
  Integration tests (5-10) use real timers. Test 7 enables fake timers AFTER the first
  inject completes (timer switch between two synchronous-to-Vitest inject calls), then
  restores real timers in `afterEach` before `app.close()`.
- **Behavioral correctness:** `vi.advanceTimersByTime(60_001)` advances `Date.now()` which
  the `IdempotencyStore.get()` TTL check (`Date.now() - entry.cachedAt > TTL_MS`) uses.
  The TTL behavior is correctly exercised; the timer switch approach is sound.
- **Files modified:** `packages/bridge/src/middleware/idempotency.test.ts`

**No other deviations — plan executed as written.**

## Risks closed

- **R-03-03 (T-03-05, T-03-06):** R1 tap-flutter → double-action. Closed by preHandler dedup.
  `store.size` cap and `@fastify/rate-limit` together bound the attack surface.
- **T-03-07:** Idempotency-Key header redacted from pino logs.
- **T-03-08:** Race window is harmless — onSend insertion resets the clock; stale-read
  extends the window by at most the handler duration.

## Open follow-ups (next plans)

1. **Plan 03-03** wires `opts.onDedup` → `evf_idempotency_dedup_total` counter.
2. **Plan 03-03** sets `request.evfStartTime` in `onRequest` hook for HTTP histogram.
3. **Plan 03-03** polls `store.size` for `evf_idempotency_store_size` gauge.
4. **Phase 07** will bind cache entries to bearer hash (`${key}:${bearerHash}`)
   to close T-03-05's remaining multi-bearer attack surface.
