---
phase: quick-260610-fff
plan: "01"
subsystem: bridge
tags: [rate-limit, internal-delta, tdd, fix]
dependency_graph:
  requires: []
  provides: [FFF-RL-01]
  affects: [packages/bridge/src/routes/internal-delta.ts, packages/bridge/src/server.ts]
tech_stack:
  added: []
  patterns: ["@fastify/rate-limit per-route opt-out via config.rateLimit: false"]
key_files:
  created:
    - packages/bridge/src/routes/internal-delta.rate-limit.test.ts
    - .changeset/exempt-internal-delta-rate-limit.md
  modified:
    - packages/bridge/src/routes/internal-delta.ts
    - packages/bridge/src/server.ts
decisions:
  - "Used Fastify config.rateLimit:false per-route opt-out (not a global disable) — preserves 100 req/min budget on all other routes"
  - "FFF-RL-02 uses real inject() flood — confirmed @fastify/rate-limit 10.3.0 DOES apply to inject() requests, so real-429 assertion is used (not the fallback scope assertion)"
metrics:
  duration: "~3 min"
  completed_date: "2026-06-10"
  tasks: 2
  files: 4
---

# Phase quick-260610-fff Plan 01: Exempt POST /internal/delta from bridge rate limiter

**One-liner:** `{ config: { rateLimit: false } }` per-route opt-out on POST /internal/delta, with regression test and patch changeset — unblocks v0.1.9 continuous map stream from 1102 prod 429s.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing test for rate-limit exemption | `2ec0d2b` | `internal-delta.rate-limit.test.ts` |
| 1 (GREEN) | Implement route exemption + server.ts comment | `ad77a94` | `internal-delta.ts`, `server.ts` |
| 2 | Quality gates + patch changeset | `1cd96ec` | `.changeset/exempt-internal-delta-rate-limit.md` |

## What Was Built

### internal-delta.ts — per-route rate-limit opt-out

Changed the `app.post('/internal/delta', handler)` registration to:

```ts
app.post('/internal/delta', { config: { rateLimit: false } }, handler)
```

Per `@fastify/rate-limit` 10.x contract, `config.rateLimit = false` disables the globally-registered limiter for this route only. The in-handler `EVF_INTERNAL_SECRET` auth check, body validation, `onDelta` interception, and WS fan-out are untouched.

Updated the route's top-of-file JSDoc to document the rate-limit exemption with the production rationale (1102 prod 429s, 1Hz stream, shared key).

### server.ts — rate-limit comment block updated

The `// --- 2. Rate limit ---` comment block (around lines 308-320) now records the `/internal/delta` opt-out and its rationale. The `max`, `timeWindow`, and `keyGenerator` values are unchanged.

### internal-delta.rate-limit.test.ts — regression test

Three tests following TDD RED→GREEN:

- **FFF-RL-01**: Flood 150 sequential POSTs to `/internal/delta` with the correct secret — asserts ZERO 429s and all responses are 2xx. Confirmed: rate-limit was active before the fix (50/150 requests got 429).
- **FFF-RL-02**: Flood 150 GETs to `/GET /v1/i18n/en` (no auth, keyed on inject() IP) — asserts ≥1 response is 429, proving the global limiter remains active on non-exempt routes. Verified: `@fastify/rate-limit@10.3.0` DOES apply to Fastify `inject()` requests; real-429 path triggered.
- **FFF-RL-03/b**: Wrong/missing secret on `/internal/delta` still returns 401 — exemption does not bypass the in-handler auth check.

## Quality Gates

| Gate | Result |
|------|--------|
| `corepack pnpm typecheck` | exit 0 |
| `corepack pnpm lint:ci` | exit 0 (329 warnings, 0 errors — pre-existing) |
| `corepack pnpm --filter @evf/bridge test` | 480/480 pass |
| `corepack pnpm changeset:status` | @evf/bridge patch changeset present |

## Deviations from Plan

None — plan executed exactly as written.

The plan noted a fallback for FFF-RL-02 (assert scope rather than real 429) "if inject() genuinely cannot trip it." The fallback was NOT needed: `@fastify/rate-limit@10.3.0` applies to inject() requests, so the real-429 assertion was used as the preferred path.

## Self-Check: PASSED

Files created:
- packages/bridge/src/routes/internal-delta.rate-limit.test.ts — exists
- .changeset/exempt-internal-delta-rate-limit.md — exists

Files modified:
- packages/bridge/src/routes/internal-delta.ts — `config: { rateLimit: false }` present
- packages/bridge/src/server.ts — rate-limit comment updated

Commits:
- `2ec0d2b` — test RED phase
- `ad77a94` — implementation GREEN phase
- `1cd96ec` — changeset
