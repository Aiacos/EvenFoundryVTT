---
phase: quick-260610-fff
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/bridge/src/routes/internal-delta.ts
  - packages/bridge/src/server.ts
  - packages/bridge/src/routes/internal-delta.rate-limit.test.ts
  - .changeset/exempt-internal-delta-rate-limit.md
autonomous: true
requirements: [FFF-RL-01]
must_haves:
  truths:
    - "POST /internal/delta never returns 429, even past 100 requests in one rate-limit window"
    - "Every other bridge route still returns 429 after exceeding 100 req/min on the same key"
    - "The server.ts rate-limit doc comment records the /internal/delta exemption with the 1102-prod-429s + 1Hz-stream rationale"
  artifacts:
    - path: "packages/bridge/src/routes/internal-delta.ts"
      provides: "Per-route rateLimit:false opt-out on POST /internal/delta"
      contains: "rateLimit: false"
    - path: "packages/bridge/src/routes/internal-delta.rate-limit.test.ts"
      provides: "Regression test: flood /internal/delta with no 429 + a non-exempt route still 429s"
    - path: ".changeset/exempt-internal-delta-rate-limit.md"
      provides: "patch changeset for @evf/bridge"
      contains: "@evf/bridge"
  key_links:
    - from: "packages/bridge/src/routes/internal-delta.ts"
      to: "@fastify/rate-limit global limiter in server.ts"
      via: "Fastify route config { config: { rateLimit: false } }"
      pattern: "config:\\s*\\{\\s*rateLimit:\\s*false"
---

<objective>
Exempt POST /internal/delta from the bridge's global `@fastify/rate-limit` limiter, scoped to that route ONLY. All other routes keep the 100 req/min budget.

Purpose: Blocker for the v0.1.9 continuous map stream. The homelab bridge logged 1102 production 429s during the 2026-06-09 game session — BEFORE the ~1Hz frame stream even existed. With v0.1.9, frame pushes alone (~60/min) would consume the majority of the 100-req/min budget keyed on the single shared internal-secret bearer, indiscriminately throttling critical `character.delta` / `combat.*` deltas that share that same key. `/internal/delta` is a server-to-server internal channel guarded by the `EVF_INTERNAL_SECRET` bearer check (TODO #43: future Docker-network restriction), so rate-limiting it provides no abuse protection — only collateral damage.

Output: per-route opt-out on POST /internal/delta, an updated server.ts doc comment citing the rationale, a regression test, and a patch changeset for @evf/bridge.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@packages/bridge/src/routes/internal-delta.ts
@packages/bridge/src/server.ts
@packages/bridge/src/server.character-snapshot.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Exempt /internal/delta from the global rate limiter + document the rationale</name>
  <files>packages/bridge/src/routes/internal-delta.ts, packages/bridge/src/server.ts, packages/bridge/src/routes/internal-delta.rate-limit.test.ts</files>
  <behavior>
    - Flooding POST /internal/delta with >100 valid-secret requests in a single rate-limit window: every response is a success status (200; treat any 2xx/207 as pass), ZERO 429s.
    - A non-exempt route (e.g. an unauthenticated GET that falls through to the IP-keyed limiter, such as repeated GET /v1/i18n/en or another already-tested route) STILL returns 429 once it exceeds 100 requests in the window — proving the limiter is still globally active and the exemption is route-scoped, not a global disable.
    - The exemption must not weaken the existing EVF_INTERNAL_SECRET auth: a wrong/missing secret still returns 401 (rate-limit:false does not bypass the in-handler auth check).
  </behavior>
  <action>
In `packages/bridge/src/routes/internal-delta.ts`, change the `app.post('/internal/delta', ...)` registration to pass a Fastify route-options object as the second argument with `config: { rateLimit: false }`, keeping the existing async handler as the third argument. Per @fastify/rate-limit's per-route opt-out contract, `config.rateLimit = false` disables the globally-registered limiter for THIS route only. Do NOT touch the in-handler EVF_INTERNAL_SECRET auth, body validation, onDelta interception, or fan-out — only add the route config. Update the route's top-of-file JSDoc to note the rate-limit exemption and why (1Hz stream + shared internal-secret key).

In `packages/bridge/src/server.ts`, update the rate-limit doc comment block (around lines 308-317, the `// --- 2. Rate limit ---` section) to record the exemption: state that POST /internal/delta opts out via `{ config: { rateLimit: false } }`, with the rationale — 1102 production 429s observed on the homelab bridge during the 2026-06-09 session (before the ~1Hz map stream existed), and that v0.1.9 frame pushes (~60/min) plus critical character/combat deltas all share the single internal-secret bearer key, so leaving the limiter on would throttle gameplay-critical deltas. Do NOT change the `max`, `timeWindow`, or `keyGenerator` values. Leave TODO (#44) intact.

Create `packages/bridge/src/routes/internal-delta.rate-limit.test.ts`. Reuse the existing idioms from `server.character-snapshot.test.ts`: import `buildServer` from `../server.js`, the `LANG_DIR` resolution pattern, a `makeValidFn()` token validator, set/restore `process.env.EVF_INTERNAL_SECRET` in beforeEach/afterEach, and POST to `/internal/delta` with `authorization: 'Bearer <INTERNAL_SECRET>'` and a minimal `{ type: 'character.delta', payload: {} }` body via `app.inject()`. Tests:
  (a) Loop ~150 sequential `app.inject()` POSTs to /internal/delta with the correct secret; assert NONE return 429 and all return a success status (expect 200; accept 2xx).
  (b) Prove the limiter is still active globally on another route: loop ~150 `app.inject()` GETs against an already-rate-limit-able route (use the same approach existing tests use; if no convenient authed route exists, GET /v1/i18n/en repeatedly which is IP-keyed) and assert at least one response is 429.
  (c) Auth still enforced under exemption: POST /internal/delta with a wrong/missing secret returns 401.
Do NOT place fenced code blocks in this action; write the test file directly. If `app.inject()` synthetic requests do not trip the limiter for case (b) within the existing test harness, inspect how (if at all) any current test exercises 429 and adapt; if no path makes a real route 429 under inject, narrow case (b) to assert the route's config does NOT carry `rateLimit:false` (i.e. assert the exemption is scoped) rather than fabricating a 429 — document the reason inline. Prefer the real-429 assertion; fall back only if inject genuinely cannot trip it.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/bridge test -- internal-delta.rate-limit</automated>
  </verify>
  <done>internal-delta.rate-limit.test.ts passes: flood of >100 POSTs to /internal/delta yields zero 429s, the limiter remains active on a non-exempt route (or the exemption-scope assertion holds with documented justification), and wrong-secret still 401s. server.ts rate-limit comment documents the exemption + rationale. No change to max/timeWindow/keyGenerator.</done>
</task>

<task type="auto">
  <name>Task 2: Run quality gates + add patch changeset</name>
  <files>.changeset/exempt-internal-delta-rate-limit.md</files>
  <action>
Create `.changeset/exempt-internal-delta-rate-limit.md` with frontmatter `"@evf/bridge": patch` and a one-line summary: "Exempt POST /internal/delta from the bridge global rate limiter (v0.1.9 continuous map stream blocker; 1102 prod 429s on 2026-06-09)." Then run the full gate sequence and fix any failures: `corepack pnpm typecheck`, `corepack pnpm lint:ci`, `corepack pnpm --filter @evf/bridge test`. If the wizard-commands teardown flake surfaces (pnpm test exits 1 with 0 failures), re-run per MEMORY.md guidance — it is a known flake, not a regression from this change.
  </action>
  <verify>
    <automated>corepack pnpm typecheck && corepack pnpm lint:ci && corepack pnpm --filter @evf/bridge test && corepack pnpm changeset:status</automated>
  </verify>
  <done>typecheck exit 0, lint:ci exit 0, full @evf/bridge suite green (re-run on known flake), changeset declares a patch bump for @evf/bridge.</done>
</task>

</tasks>

<verification>
- POST /internal/delta survives >100 requests/window with no 429.
- Global limiter still trips 429 on a non-exempt route (or scope assertion documented).
- EVF_INTERNAL_SECRET auth unchanged (401 on wrong/missing secret).
- server.ts rate-limit doc comment cites the 1102-prod-429s + 1Hz-stream rationale.
- typecheck · lint:ci · @evf/bridge test all green; patch changeset present.
</verification>

<success_criteria>
- `{ config: { rateLimit: false } }` applied to POST /internal/delta ONLY.
- `max:100` / `timeWindow:'1 minute'` / bearer-or-IP keyGenerator unchanged for all other routes.
- Regression test asserts the flood-no-429 and limiter-still-active behaviors.
- Patch changeset for @evf/bridge committed.
- All four gates pass.
</success_criteria>

<output>
Create `.planning/quick/260610-fff-exempt-internal-delta-route-from-bridge-/260610-fff-SUMMARY.md` when done.
</output>
