---
status: accepted
date: 2026-05-11
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Opus 4.7, planning/research agent)
informed: future contributors
---

# ADR-0002: Protocol Versioning — WS envelope, semver, idempotency, replay buffer

## Status

**ACCEPTED** — 2026-05-11. Binds Phase 2 (Foundry Module Core), Phase 3 (Bridge), Phase 7 (Write Path), and indirectly all V2 phases (foundry-mcp consumes same envelope).

## Context and Problem Statement

EVF runs a long-lived WebSocket between G2 plugin (browser) ↔ Bridge (Node) ↔ Foundry module. Connection survives across game sessions, code deploys (bridge restart), and intermittent network blips. Without an explicit protocol envelope and versioning policy: G2 client and Bridge can drift independently (one upgraded, one not — Specs §11.5.8 cross-cutting); retried POSTs from R1-tap timing flutter could double-fire `activity.use()`; reconnects after a 30 s blip can't resume mid-stream without losing state.

## Decision Drivers

- Long-lived G2 client (no atomic upgrade alongside server)
- Multi-session continuity (Specs §11.5.8.1 — reconnect with replay buffer; §11.5.8.4 — failure modes)
- Single-workflow-origin discipline (Phase 7 ADR locked to socketlib.executeAsGM only) — but client → bridge POST path still needs idempotency
- INV-2 — every protocol claim cited from Specs.md, not invented
- V2 unblocking: foundry-mcp (Phase 11) must be able to consume the same envelope without re-implementation

## Considered Options

- **Option A**: Versioned WS envelope `{ proto: "1.0", seq, ts, type, path?, value?, prev_seq? }` + UUID idempotency keys (60 s LRU dedupe at Bridge) + 60 s replay-buffer ring at Bridge for resume on reconnect
- **Option B**: Plain JSON-RPC 2.0 over WS — versioning via method-name suffix (e.g., `actor.update.v1`)
- **Option C**: gRPC-Web — strict schema, code-gen — but heavyweight for our scale

## Decision Outcome

**Chosen: Option A — Versioned envelope + idempotency + replay buffer.**

Justification: Option A matches Specs §4 / §5.3 / §11.5.8.1 verbatim — no new invention. Idempotency keys (research §2.4 cross-cutting concerns) directly address the R1-tap-flutter → double-`activity.use()` failure mode (research Pitfall 1). Replay buffer 60 s LRU on Bridge satisfies §11.5.8.1 reconnect-without-state-loss. Option B adds JSON-RPC machinery without solving versioning rigor. Option C adds proto schema compilation overhead for what is fundamentally an asymmetric event stream (Foundry → Bridge: many small deltas; Bridge → Foundry: occasional commands).

### Consequences

- Good: Single envelope shape consumed by Bridge (Phase 3), Foundry module (Phase 2), G2 client (Phase 4a), foundry-mcp (Phase 11) — defined once in `@evf/shared-protocol` Zod schemas
- Good: Retried POSTs deduped at Bridge — R1 tap-flutter no longer doubles actions
- Good: G2 reconnect within 60 s replays buffered deltas; beyond 60 s falls back to full state via `GET /v1/actor` (no new "full-state-dump" message invented)
- Neutral/Risk: `proto: "1.0"` forces a discipline: protocol semver is independent of package versions (Changesets bump `@evf/shared-protocol` doesn't bump `proto`). Documented in `@evf/shared-protocol/README.md`.
- Neutral/Risk: Replay buffer adds memory cost on Bridge (~60 s × delta rate). Acceptable for single-tenant MVP; revisit at multi-tenant Phase 13.

### Confirmation

- Phase 3 contract test: retry the same POST with same idempotency key within 60 s → second call returns cached result, no second `activity.use()` invoked
- Phase 3 integration test: kill G2 client mid-stream, reconnect within 60 s → replay buffer delivers gap; reconnect beyond 60 s → full state fetched
- Phase 7 stress test: rapid R1 double-tap → dedupe verified via Foundry chat-card single emission
- `@evf/shared-protocol/src/envelope.ts` Zod schema defines the canonical shape; all consumers `import` from there

## Pros and Cons of the Options

### Option A — Versioned envelope + idempotency + replay

- Good: Matches Specs verbatim; no new invention; clean separation between protocol semver and package semver
- Good: Idempotency + replay together close two distinct failure modes (retry-storms + reconnect-gaps)
- Neutral: Bridge memory for replay buffer (60 s × delta rate) — bounded and observable

### Option B — JSON-RPC 2.0

- Good: Standard library support
- Bad: Method-name suffix versioning is fragile; doesn't solve idempotency or replay; would require additional layer for both

### Option C — gRPC-Web

- Good: Strict schema, generated code
- Bad: Heavyweight for asymmetric event stream; G2 WebView (Safari WKWebView) gRPC-Web tooling immature in 2026; learning-curve cost for solo developer

## More Information

- Specs.md §4 (architecture), §5.3 (Tool Registry endpoints), §5.6 (auth), §11.5.8.1 (replay buffer)
- Related ADRs: [ADR-0001](./0001-layered-ui-model.md), [ADR-0003](./0003-tool-registry-pattern.md), [ADR-0008](./0008-code-quality-configuration.md)
- Phase entry-gate citations: Phase 2 (Foundry Module readers — emit envelope), Phase 3 (Bridge — dedupe + replay), Phase 4a (G2 client — consume envelope), Phase 11 (foundry-mcp — same envelope)
- Sources: Specs.md §4, §5.3, §11.5.8.1; research ARCHITECTURE.md §2.4 cross-cutting concerns
