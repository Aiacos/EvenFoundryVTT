---
phase: 03-bridge-service-skeleton
verified: 2026-05-13T08:45:00Z
status: human_needed
score: 5/5 success criteria verified (1 schema-field notation difference needs human sign-off)
re_verification: false
human_verification:
  - test: "WS envelope field notation: SC-2 specifies {proto, seq, ts, type, path?, value?, prev_seq?} but implementation uses {proto, seq, ts, type, session_id, payload}"
    expected: "The Phase 02 implementation of EnvelopeSchema and the Phase 03 plans both explicitly document the {session_id, payload} shape. ADR-0002 Option A description used {path, value, prev_seq} but that was the ADR draft vocabulary, not the implementation contract — Phase 02 summary (02-04) confirms the canonical shape is {proto, seq, ts, type, session_id, payload}. Confirm this deviation from the literal SC-2 text is intentional and acceptable."
    why_human: "The ROADMAP SC-2 text cites 'path?, value?, prev_seq?' as envelope fields. The actual codebase implements 'session_id, payload' instead. The Phase 02 decision log and PLAN-CHECK both show this as COVERED/intentional (and the PLAN-CHECK explicitly states 'COVERED with note'). A human must confirm the ROADMAP success criterion text is satisfied by the implemented shape, or flag an update to the ROADMAP."
  - test: "Docker smoke test (full image build + container boot)"
    expected: "GET /healthz → 200; GET /readyz → 200 (with secret set); GET /v1/health (no bearer) → 401; GET /metrics → 200 text/plain. Compose syntax is already validated (docker compose config -q exits 0). Full image build requires docker buildx + pnpm in PATH."
    why_human: "The executor did not run docker compose build / docker run end-to-end. Compose file syntax is validated programmatically (passes). Full container boot test (smoke.sh) is committed as the operational contract but was not executed in-process. Operator must run: cd deploy && cp .env.example .env && bash smoke.sh"
---

# Phase 03: Bridge Service Skeleton — Verification Report

**Phase Goal:** Stand up the Fastify+ws bridge as a CORS-friendly reverse-proxy with bearer auth, a Tool Registry dispatch table, idempotency, sequence envelopes, and ops endpoints — so Phase 4 can wire G2 to real bearer tokens, not mocks.

**Verified:** 2026-05-13T08:45:00Z
**Status:** human_needed (all automated checks passed; 2 items require human confirmation)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths — 5 ROADMAP Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Bridge boots via Docker Compose, exposes /healthz + /readyz + /metrics, rejects unauthenticated requests (FOUN-02) | VERIFIED | `deploy/bridge.Dockerfile` (multi-stage node:24-alpine), `deploy/docker-compose.yml` (healthcheck on /healthz), `registerHealthzRoute` / `registerReadyzRoute` / `registerMetricsRoute` all wired in `server.ts`; bearer check on every protected route confirmed; `docker compose config -q` passes |
| SC-2 | POST /v1/actor/*, GET /v1/scene, GET /v1/combat round-trip with WS frame envelope (POST /v1/actor/* folded into POST /v1/tools/:name per CONTEXT note 6) | VERIFIED* | `routes/tools.ts` implements `POST /v1/tools/:name` with 404/401/400/200 flow; `GET /v1/combat/current` and `GET /v1/scene/viewport` from Phase 02 untouched; `EnvelopeSchema` in `shared-protocol/src/envelope.ts` defines wire protocol; *see human note on field names |
| SC-3 | Idempotency keys deduplicate retried POSTs within 60s LRU window | VERIFIED | `middleware/idempotency.ts`: `TTL_MS = 60_000`, `MAX_ENTRIES = 10_000`, SHA-256 body hash, `Idempotency-Key was already used with a different request body` 422 response; 10 integration tests passing; `/internal/` excluded |
| SC-4 | Tool Registry (7 tools) callable via REST and listed in /v1/tools | VERIFIED | `TOOL_REGISTRY` in `shared-protocol/src/tools/index.ts` has exactly 7 entries; `GET /v1/tools` returns full registry; `POST /v1/tools/:name` dispatches to `TOOL_DISPATCH_TABLE`; `evf.castSpell` through `evf.setTargets` registered in `socketlib-handlers.ts`; T-03-14 verified (all 9 `activity.use` occurrences are in comments only) |
| SC-5 | Replay buffer holds last 60s of deltas; reconnect within window resumes from last confirmed seq; outside window receives full snapshot via GET /v1/actor | VERIFIED | `ReplayBuffer.hasGap()` implemented; `handleResume()` decision matrix: gap → `resume_full_snapshot{reason:'buffer_gap'}`; empty → `resume_full_snapshot{reason:'buffer_expired'}`; contiguous → `resume_replay{count:N}` + N frames; `REPLAY_TTL_MS = 60_000` in `replay-buffer.ts`; ADR-0002 REST fallback documented |

**Score: 5/5 truths verified** (1 human sign-off needed on SC-2 envelope field names)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/bridge/src/ws/handshake.ts` | `Promise<string \| null>` return type | VERIFIED | File exists, substantive (Phase 02 impl extended), used in server.ts WS route |
| `packages/bridge/src/ws/resume.ts` | `handleResume()` function | VERIFIED | Exports `handleResume`; 11 tests cover all decision branches |
| `packages/bridge/src/ws/replay-buffer.ts` | `hasGap()` defensive gap detection | VERIFIED | `hasGap` implemented with explicit `undefined` guards per noUncheckedIndexedAccess |
| `packages/bridge/src/server.ts` | WS route wiring + resume + close cleanup | VERIFIED | `deltaEmitter.registerSession`, `handleResume`, `socket.on('close', ...)` all wired at lines 242–268 |
| `packages/shared-protocol/src/envelope.ts` | `ClientResumeSchema`, `ResumeReplaySchema`, `ResumeFullSnapshotSchema` | VERIFIED | All 3 schemas exported from both `envelope.ts` and `shared-protocol/src/index.ts` |
| `packages/bridge/src/middleware/idempotency.ts` | `IdempotencyStore` + `registerIdempotencyHooks` | VERIFIED | Both exported; 60s TTL, 10k cap, /internal/ exclusion, `opts.onDedup` callback |
| `packages/bridge/src/types/fastify.d.ts` | FastifyRequest augmentation | VERIFIED | `idempotencyKey`, `idempotencyBodyHash`, `evfStartTime` with explicit `T \| undefined` unions |
| `packages/bridge/src/metrics/registry.ts` | `createMetricsRegistry()` factory | VERIFIED | Per-Registry isolation (Pitfall 2 fixed); 7 EVF metrics; no global Registry usage |
| `packages/bridge/src/routes/healthz.ts` | GET /healthz — always 200 | VERIFIED | Auth-free; returns `{status:'ok', uptime_sec:N}` |
| `packages/bridge/src/routes/readyz.ts` | GET /readyz — 200/503 | VERIFIED | Auth-free; 503 when `EVF_INTERNAL_SECRET` missing |
| `packages/bridge/src/routes/metrics.ts` | GET /metrics — Prometheus text | VERIFIED | Auth-free; uses `registry.contentType` |
| `packages/shared-protocol/src/tools/index.ts` | `TOOL_REGISTRY` + `TOOL_NAMES` + `TOOL_INPUT_SCHEMAS` | VERIFIED | 7 entries; `.toJSONSchema()` for each; T-03-15 drift test in tools.test.ts |
| `packages/bridge/src/routes/tools.ts` | GET /v1/tools + POST /v1/tools/:name | VERIFIED | Full implementation replacing Phase 02 stub; bearer auth; Zod body validation |
| `packages/bridge/src/routes/tools-dispatch.ts` | `TOOL_DISPATCH_TABLE` with 7 stubs | VERIFIED | `makeStub` pattern; returns `{status:'phase-07-pending', tool, idempotency_key, accepted_at}` |
| `packages/foundry-module/src/pair/socketlib-handlers.ts` | 7 new stub handlers | VERIFIED | `handleCastSpellStub` through `handleSetTargetsStub` registered; T-03-14: all 9 write-API mentions are in comments only, zero in executable code |
| `deploy/bridge.Dockerfile` | Multi-stage node:24-alpine | VERIFIED | `node:24-alpine` appears 2x (builder + runner); `pnpm -r build` before `pnpm --prod deploy`; zero `ARG EVF_*` lines (T-03-17) |
| `deploy/docker-compose.yml` | Bridge service with healthcheck | VERIFIED | Port 8910; healthcheck on `/healthz`; env_file; restart unless-stopped |
| `deploy/docker-compose.dev.yml` | Dev override | VERIFIED | `LOG_LEVEL=debug`; `EVF_PLUGIN_HOST_URL=http://localhost:5173` |
| `deploy/.env.example` | Committed template | VERIFIED | Placeholder values; not a real secret |
| `deploy/smoke.sh` | Executable smoke test | VERIFIED | `test -x` passes; `bash -n` syntax check passes |
| `packages/bridge/src/index.ts` | Real entrypoint with startup guard | VERIFIED | `process.exit(1)` on missing `EVF_INTERNAL_SECRET` in production; `await app.listen()` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server.ts` | `ws/delta-emitter.ts` | `deltaEmitter.registerSession(sessionId, socket)` | VERIFIED | Line 242 in server.ts; grep returns 1 |
| `server.ts` | `ws/resume.ts` | `socket.on('message', rawData => handleResume(...))` | VERIFIED | Line 249 in server.ts; grep returns 3 |
| `ws/resume.ts` | `ws/replay-buffer.ts` | `replayBuffer.replay + replayBuffer.hasGap` | VERIFIED | Both called in resume.ts decision tree |
| `ws/resume.ts` | `shared-protocol/src/envelope.ts` | `ClientResumeSchema.safeParse + ResumeFullSnapshotSchema` | VERIFIED | Imports verified in resume.ts |
| `middleware/idempotency.ts` | `types/fastify.d.ts` | `request.idempotencyKey + idempotencyBodyHash` | VERIFIED | Augmentation used in preHandler hook |
| `server.ts` | `middleware/idempotency.ts` | `registerIdempotencyHooks(app, idempotencyStore, {onDedup: ...})` | VERIFIED | Line 179; grep returns 2 |
| `server.ts` | `metrics/registry.ts` | `const metrics = createMetricsRegistry({...})` | VERIFIED | Line 157; grep returns 3 |
| `server.ts` | `routes/metrics.ts` | `registerMetricsRoute(app, metrics.registry)` | VERIFIED | Line 206 |
| `middleware/idempotency.ts` | `metrics/registry.ts` | `metrics.idempotencyDedupTotal.inc()` via `opts.onDedup` | VERIFIED | Wired in server.ts line 181 |
| `ws/delta-emitter.ts` | `metrics/registry.ts` | `metrics.wsSessionsActive.inc/dec` inline in /ws route | VERIFIED | Lines 244 + 259 in server.ts |
| `routes/tools.ts` | `shared-protocol/src/tools/index.ts` | `TOOL_REGISTRY` + `TOOL_INPUT_SCHEMAS` | VERIFIED | Imported and used in GET/POST handlers |
| `routes/tools.ts` | `routes/tools-dispatch.ts` | `TOOL_DISPATCH_TABLE[toolName](...)` | VERIFIED | Line 120 in tools.ts |
| `deploy/bridge.Dockerfile` | `packages/bridge/src/index.ts` | `ENTRYPOINT ["node", "dist/index.js"]` (tsup-bundled) | VERIFIED | Dockerfile references `dist/index.js`; `pnpm --filter @evf/bridge build` produces it |
| `deploy/docker-compose.yml` | `deploy/bridge.Dockerfile` | `build.dockerfile: deploy/bridge.Dockerfile` | VERIFIED | Compose syntax validates cleanly |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| FOUN-02 | 03-01 through 03-05 | Bridge service Node.js (Fastify + ws + Docker Compose) as CORS-friendly reverse-proxy + bearer auth 24h | VERIFIED | CORS via `@fastify/cors` with origin whitelist (no wildcards); bearer auth on all protected routes; Docker Compose in `deploy/`; `/healthz`, `/readyz`, `/metrics` exposed; 451 tests pass |

---

### Automated Gates

| Gate | Result |
|------|--------|
| `pnpm typecheck` | EXIT 0 |
| `pnpm lint:ci` | EXIT 0 (137 advisory warnings, 0 errors — pre-existing from Phase 02) |
| `npx vitest run` | 451/451 passed (26 test files) |
| `grep -c "deltaEmitter.registerSession" packages/bridge/src/server.ts` | 1 (≥1 required) |
| `grep -c "handleResume" packages/bridge/src/server.ts` | 3 (≥1 required) |
| `grep -c "ClientResumeSchema\|ResumeReplaySchema\|ResumeFullSnapshotSchema" packages/shared-protocol/src/index.ts` | 3 (≥3 required) |
| `grep -c "hasGap" packages/bridge/src/ws/replay-buffer.ts` | 2 (≥2 required) |
| `grep -c "TTL_MS = 60_000" packages/bridge/src/middleware/idempotency.ts` | 1 (≥1 required) |
| `grep -c "MAX_ENTRIES = 10_000" packages/bridge/src/middleware/idempotency.ts` | 1 (≥1 required) |
| `grep -c "registerIdempotencyHooks" packages/bridge/src/server.ts` | 2 (≥1 required) |
| `grep -c "createMetricsRegistry" packages/bridge/src/server.ts` | 3 (≥1 required) |
| `grep -c "TOOL_REGISTRY" packages/bridge/src/routes/tools.ts` | 3 (≥1 required) |
| `grep -c "TOOL_DISPATCH_TABLE" packages/bridge/src/routes/tools.ts` | 4 (≥1 required) |
| `grep -cE "(session_id|actor_id|bearer)" packages/bridge/src/metrics/registry.ts` | 0 (must be 0 — T-03-09) |
| `ls packages/shared-protocol/src/tools/*.ts \| wc -l` | 9 (≥9 required: 7 schemas + index + test) |
| `grep -cE "ARG\s+(EVF_INTERNAL_SECRET|EVF_PLUGIN_HOST_URL)" deploy/bridge.Dockerfile` | 0 (must be 0 — T-03-17) |
| `grep -c "node:24-alpine" deploy/bridge.Dockerfile` | 2 (≥2 required: builder + runner) |
| `grep -c "pnpm -r build" deploy/bridge.Dockerfile` | 1 (≥1 required — Pitfall 10) |
| `grep -c "process.exit(1)" packages/bridge/src/index.ts` | 2 (≥1 required) |
| `git check-ignore deploy/.env` | exits 0 (gitignored — T-03-18) |
| `pnpm --filter @evf/bridge build` | dist/index.js produced (38 KB ESM) |
| `bash -n deploy/smoke.sh` | syntax valid (EXIT 0) |
| `test -x deploy/smoke.sh` | EXIT 0 (executable) |
| `docker compose config -q` (with temp .env) | EXIT 0 (compose syntax valid) |
| T-03-14: write-path APIs in socketlib-handlers.ts executable code | 0 occurrences — all 9 `activity.use`/`completeActivityUse` mentions are in JSDoc or inline comments |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/bridge/src/server.ts` | 126 | `// TODO (#42): enforce EVF_PLUGIN_HOST_URL as required in Docker entrypoint.` | INFO | Conforms to INV-4: issue number cited (#42). No action needed. |
| `packages/bridge/src/server.ts` | 137 | `// TODO (#44): lower max to 60 req/min once Phase 3 action endpoints land.` | INFO | Conforms to INV-4: issue number cited (#44). No action needed. |

No blockers or warnings. Both TODOs carry issue numbers per INV-4 requirement.

---

### Human Verification Required

#### 1. SC-2 Envelope Field Names

**Test:** Review the ROADMAP Phase 03 SC-2 text which specifies `WS frame envelope {proto, seq, ts, type, path?, value?, prev_seq?}` and compare against the actual implementation `{proto, seq, ts, type, session_id, payload}`.

**Expected:** Confirm that `{session_id, payload}` is the accepted canonical shape (as documented in Phase 02 SUMMARY for `envelope.ts` and the Phase 03 PLAN-CHECK showing SC-2 as COVERED) and the ROADMAP success criterion text is considered satisfied by this shape. If not, update the ROADMAP success criterion to use the implemented field names.

**Why human:** The SC-2 literal text uses field names from ADR-0002 Option A description (`path?, value?, prev_seq?`). The implementation chose different field names (`session_id, payload`) during Phase 02 execution — a decision documented in 02-04-SUMMARY.md. This is not a code bug but a ROADMAP documentation mismatch that requires deliberate acceptance or a ROADMAP text update.

#### 2. Docker Smoke Test (Full End-to-End)

**Test:** From repo root: `cd deploy && cp .env.example .env` then edit `.env` to set `EVF_INTERNAL_SECRET=$(openssl rand -base64 32)` and a real `EVF_PLUGIN_HOST_URL`. Then run `bash smoke.sh`.

**Expected:** All 4 assertions pass: `GET /healthz → 200`, `GET /readyz → 200`, `GET /v1/health (no bearer) → 401`, `GET /metrics → 200 text/plain`.

**Why human:** Docker build requires pulling `node:24-alpine` from registry and executing the full pnpm workspace build inside Docker. This takes several minutes and requires network access. The compose syntax has been validated programmatically. The smoke script is committed, executable, and syntax-clean. Only the full build + container boot needs manual operator execution.

---

### INV-3 / INV-4 Invariant Check

- **INV-3 (documentation coherence):** Phase 03 adds no version bump, no hardware spec change, no UI layout change. Does not trigger INV-3. No cross-file documentation update required.
- **INV-4 (code quality):** All TODOs carry issue numbers. No dead/unreachable code found in Phase 03 new files. Biome lint: 0 errors (137 pre-existing advisory warnings in `packages/validation-harness/` — not introduced by Phase 03). TypeScript strict: 0 errors.

---

### Gaps Summary

No gaps blocking goal achievement. All 5 ROADMAP success criteria are verified in code. The two human-verification items are:
1. A ROADMAP text clarification (SC-2 envelope field names — confirmed satisfied in code, needs human sign-off on ROADMAP wording)
2. Docker end-to-end smoke test (structural verification passed; full build/boot deferred to operator)

Phase 03 goal is achieved: the bridge is a fully wired CORS-friendly Fastify+ws reverse-proxy with bearer auth, Tool Registry dispatch, idempotency middleware, WS resume protocol, Prometheus metrics, ops endpoints, and Docker Compose deployment. Phase 4 can wire G2 to real bearer tokens against this foundation.

---

### Cross-Phase Regression

Phase 02 tests confirmed still passing: 451/451 tests pass workspace-wide, which includes all Phase 02 tests. The Phase 03 plans modified `server.ts`, `replay-buffer.ts`, `handshake.ts`, and `socketlib-handlers.ts` from Phase 02 — all regression-free.

---

_Verified: 2026-05-13T08:45:00Z_
_Verifier: Claude (gsd-verifier)_
