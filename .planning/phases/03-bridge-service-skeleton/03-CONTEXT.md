# Phase 03: Bridge Service Skeleton - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** Smart-discuss infrastructure path (auto-derived from ROADMAP, ADRs, and Phase 02 conventions)

<domain>
## Phase Boundary

Phase 03 hardens the Fastify+ws bridge service that Phase 02 sketched into a full
production-grade reverse-proxy. The deliverable is a bridge that:

- Boots reproducibly via Docker Compose (single-tenant homelab MVP per Specs.md §11.5.3)
- Exposes ops endpoints `/healthz`, `/readyz`, `/metrics` (Prometheus via `prom-client@15.1.3`)
- Rejects unauthenticated requests with the 24h bearer token issued in Phase 02
- Provides a complete **Tool Registry** dispatch table — `cast_spell`, `weapon_attack`,
  `use_item`, `skill_check`, `move_token`, `place_template`, `set_targets` —
  callable via REST and discoverable via `GET /v1/tools` (full entries, not stubs)
- Adds idempotency-key middleware (60s LRU window) to deduplicate retried POSTs,
  preventing R1-tap → POST → WS-replay double-`activity.use()` (Phase 0 research recommendation)
- Implements WS replay/resume protocol: client reconnects within 60s window receives
  missed deltas from last confirmed `seq`; otherwise gets a full snapshot via
  `GET /v1/actor` (no new full-state-dump message invented per ADR-0002)
- Adds `POST /v1/actor/*` and the corresponding bridge→Foundry dispatch plumbing.
  **Writes themselves are stubs** in Phase 03 — actual `activity.use()` lands in Phase 07
  per single-workflow-origin discipline option A (Phase 0 D-15). The Tool Registry
  REST routes call into a dispatcher that returns "not implemented" placeholders.

**Boundary on the write side:** Phase 03 is the *dispatch frame*, not the *write path*.
The bridge exposes the REST API surface and routes requests via socketlib.executeAsGM,
but the Foundry-side handlers are stubs that return `{ status: 'phase-07-pending' }`.
This satisfies Tool Registry callability (success criterion 4) without violating
Phase 02's read-only contract or pre-empting Phase 07's write architecture.

**Boundary on the bridge side:** Phase 02 already built the Fastify server, WS handshake,
60s LRU replay buffer, bearer validation, `/v1/health`, `/v1/i18n/{lang}`,
`/v1/tools` stub, the four read-only snapshot routes (character/combat/scene/events),
`/v1/characters` list, `POST /internal/delta`, and the WS delta-emitter.
Phase 03 *extends* — it does not rebuild.

</domain>

<decisions>
## Implementation Decisions

### Locked by Prior Artifacts (do not re-litigate)

- **ADR-0002 (Protocol Versioning):** WS envelope `{ proto: "evf-v1", seq, ts, type, path?, value?, prev_seq? }`. 60s LRU replay buffer keyed per session. Idempotency key = client-supplied `Idempotency-Key` header, 60s LRU dedup with response replay.
- **ADR-0003 (Tool Registry Pattern):** Shared Zod schemas in `@evf/shared-protocol` define each tool input. REST routes auto-derive validators. `GET /v1/tools` returns the JSON Schema for each entry. Same dispatch table is consumed by Phase 11 `foundry-mcp` MCP server.
- **ADR-0008 (Code Quality):** Biome 2.4.15, TypeScript 5.8.3 strict, Vitest 4 ≥80% coverage, Conventional Commits (scope `03` or `03-NN`), 7-gate CI.
- **Phase 02 Bridge Conventions:** Fastify 5.8.5, `@fastify/websocket@11.2.0`, `@fastify/cors@11.2.0`, `@fastify/rate-limit@10.3.0`, `pino@10.3.1`, `zod@4.4.3`. Server is built via `buildServer()` factory pattern (test isolation via `.inject()`).
- **Phase 02 Auth Plumbing:** Bearer validation via socketlib roundtrip + 5-minute token cache (TokenValidator); per-pair `internal_secret` for module→bridge auth on `/internal/delta` (timing-safe-equal already applied per CR-02 fix). Single-tenant homelab — in-memory Map (no Redis until Phase 13 stretch per Specs.md §11.5.5).
- **Single-workflow-origin discipline option A (Phase 0 D-15):** Player client NEVER invokes `activity.use()` directly. All writes go via `socketlib.executeAsGM`. Phase 03 only exposes the REST/WS dispatch surface; the GM-side handlers are stubs.
- **MidiQOL declared *required* (Phase 0 D-15 decision):** `relationships.requires.midi-qol` already in `module.json`. Phase 03 does not exercise MidiQOL but the dispatch table must be designed so Phase 07 can inject `completeActivityUse` cleanly.
- **CORS whitelist (Specs.md §3.3):** Origin-complete only (no wildcards). Phase 02 already wired `EVF_PLUGIN_HOST_URL` with `http://localhost:5173` dev fallback.
- **D&D edition (Specs.md §11.5.1):** Dual-support PHB 2014 + PHB 2024 via `core.modernRules`. Tool Registry schemas must accommodate both (e.g., `spellLevel` semantics differ slightly).

### Claude's Discretion

All Phase 03-specific implementation choices are at Claude's discretion within the
above constraints. Notable areas:

- **Idempotency middleware shape:** key derivation, response replay vs. 409 retry policy,
  LRU eviction strategy. Use whatever idiom feels Fastify-native (likely a custom plugin).
- **Tool Registry route shape:** flat (`/v1/tools/cast_spell`) vs. nested (`/v1/tools/:name`).
  Recommend the latter — fewer route definitions, single Zod-dispatched validator.
- **Stub response shape for write-path tools:** consistent envelope, e.g.
  `{ status: 'phase-07-pending', tool, idempotency_key, accepted_at }`. Tests can assert
  the stub round-trips without exercising real Foundry state.
- **Docker Compose layout:** single `docker-compose.yml` for MVP, `bridge` + optional
  `plugin-host` (nginx static) + dev-only `foundry` reference in
  `docker-compose.dev.yml`. Multi-stage Dockerfile based on `node:24-alpine`
  (matches Specs.md §11.5.3).
- **`/healthz` vs `/readyz` semantics:** `/healthz` = process is alive (always 200 if reachable);
  `/readyz` = bridge has reached steady state (e.g., socketlib roundtrip succeeded at
  least once, replay buffer initialized). Standard k8s convention.
- **Prometheus metrics:** at minimum HTTP request counter/duration (per route + status),
  WS session count, replay buffer occupancy, token cache hit rate, idempotency dedup rate.
  Use `prom-client` defaults plus 4-6 EVF-specific gauges/counters.
- **WS resume protocol:** client sends `client_resume` envelope with `last_seq`;
  bridge replays from `last_seq+1` if within 60s window, else responds `resume_full_snapshot`
  pointing the client to refetch state via REST.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 02)
- `packages/bridge/src/server.ts` — `buildServer()` factory; CORS + rate-limit + WS plugins.
- `packages/bridge/src/ws/replay-buffer.ts` — `ReplayBuffer.push/replay` keyed per session.
- `packages/bridge/src/ws/delta-emitter.ts` — fan-out + replay-buffer push (consumed by `/internal/delta`).
- `packages/bridge/src/ws/handshake.ts` — capability negotiation; `SERVER_CAPS_V1`.
- `packages/bridge/src/ws/session-store.ts` — per-session state.
- `packages/bridge/src/auth/token-validator.ts` + `token-cache.ts` — bearer validation w/ 5min cache.
- `packages/bridge/src/routes/health.ts` — simple `/v1/health` (Phase 03 extends to `/healthz` + `/readyz`).
- `packages/bridge/src/routes/tools.ts` — stub `/v1/tools` (Phase 03 fills the registry).
- `packages/bridge/src/routes/internal-delta.ts` — module push w/ timing-safe-equal.
- `packages/shared-protocol/src/envelope.ts` + `handshake.ts` — Zod envelope + handshake schemas.
- `packages/shared-protocol/src/payloads/{character,combat,scene,event}.ts` — payload schemas.

### Established Patterns
- Server factory + `.inject()` for tests (no real socket binding in unit tests).
- `pino-pretty` in dev, structured JSON in prod (Phase 03 should add log redaction for token fields).
- Per-route Zod-typed Fastify schemas via `fastify-type-provider-zod` (or manual `setValidatorCompiler` — confirm which Phase 02 chose).
- Test files colocated next to source as `*.test.ts`, run via Vitest 4 `test.projects` workspace API.
- Per-package coverage threshold 80% enforced by root `vitest.config.ts`.

### Integration Points
- Phase 02 Foundry module exports socketlib handlers `evf.validateToken`, `evf.getCharacterSnapshot`,
  `evf.getCombatSnapshot`, `evf.getSceneViewport`, `evf.getEventLog`, `evf.listCharacters`.
  Phase 03 adds **stub** handler entries for the 7 Tool Registry tools — they live in the
  Foundry module but return `phase-07-pending` placeholder responses.
- Phase 03 wires `POST /v1/actor/:actorId/:tool` (and similar `/v1/tools/:tool`) routes
  in the bridge that dispatch via the existing `socketlib.executeAsGM` infrastructure.

</code_context>

<specifics>
## Specific Ideas

No user-supplied specific requirements — pure infrastructure phase, decisions
flow from prior artifacts (ADR-0002, ADR-0003, ADR-0008, Phase 02 conventions,
Specs.md §3.3 / §5.2 / §11.5.3 / §11.5.5).

The 5 ROADMAP success criteria are the contract.

</specifics>

<deferred>
## Deferred Ideas

- **Redis-backed idempotency / replay storage** — Phase 13 stretch per Specs.md §11.5.5.
  Phase 03 uses in-memory `Map` (LRU eviction; single-tenant homelab is sufficient).
- **mTLS bridge auth** — only required if bridge is exposed beyond LAN per Specs.md §11.5.3.
  MVP is LAN-only; defer to Phase 13.
- **HTTP+SSE MCP transport fallback** — deprecated 2025-03-26 per ADR-0004.
  Streamable HTTP only; not a Phase 03 concern.
- **Real write-path implementation (`activity.use()`, MidiQOL `completeActivityUse`)** —
  Phase 07 per Phase 0 D-15. Phase 03 only exposes the dispatch surface with stubs.
- **Tool Registry expansion beyond 7 MVP tools** — Phase 13 stretch (reaction execution,
  advanced macros). MVP is the 7 declared in success criterion 4.

</deferred>
