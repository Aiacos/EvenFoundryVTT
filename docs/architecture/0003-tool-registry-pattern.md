---
status: accepted
date: 2026-05-11
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Opus 4.7, planning/research agent)
informed: future contributors
---

# ADR-0003: Tool Registry Pattern — shared MVP gestures + V2 MCP

## Status

**ACCEPTED** — 2026-05-11. Binds Phase 3 (Bridge), Phase 7 (Write Path), Phase 8 (Manual Action UX), Phase 11 (V2 foundry-mcp).

## Context and Problem Statement

EVF action surface is large: cast spell, weapon attack, use item, skill check, move token, place AoE template, set targets — each with structured input (spell ID, slot level, target list, position, etc.). MVP exposes these via R1 gestures (Phase 8). V2 (Phase 11) exposes the same surface via MCP tools to Claude Desktop. Without a shared registry: MVP and V2 implementations drift; auth checks happen in two places; adding a new action requires touching gesture code AND MCP code.

## Decision Drivers

- INV-2 single source of truth (Specs §0.1) — action surface defined once
- V2 unblocking (Specs §5.7.2) — MCP tool list mirrors bridge registry 1:1, zero re-impl
- Single auth gate — bearer 24h validates tool calls regardless of source (gesture or MCP)
- Discoverability — `/v1/tools` endpoint enumerates the registry (Phase 3)
- Type safety — Zod schemas double as JSON Schema for MCP wire (research §5.7.2 — "developer scrive Zod, il client riceve JSON Schema standard")

## Considered Options

- **Option A**: Shared Zod-typed dispatch table in `@evf/shared-protocol` consumed by Bridge (gesture path) AND foundry-mcp (V2 MCP path). `/v1/tools` discovery endpoint serves canonical list.
- **Option B**: Two parallel registries — one in Bridge, one in foundry-mcp — kept in sync via tests
- **Option C**: Code generation from a YAML/JSON spec to TS + Zod + MCP descriptors

## Decision Outcome

**Chosen: Option A — Shared Zod-typed dispatch table.**

Justification: Single source of truth eliminates drift risk. Zod schemas serve both runtime validation (Bridge dedupe gate, MCP input check) AND static types (TS imports throughout). MCP TS SDK auto-converts Zod to JSON Schema for the wire (research §5.7.2 verified). `/v1/tools` discovery endpoint is the contract surface — V2 MCP server (Phase 11) literally fetches it on boot to populate its tool list.

Option B (parallel registries) introduces sync burden and tests-as-spec — fragile. Option C (codegen) adds a build step (yaml → ts → tests) for marginal benefit when the surface fits in a single TS file.

### Consequences

- Good: One file (`@evf/shared-protocol/src/tools.ts`) defines the action surface; both Bridge and foundry-mcp import it
- Good: Adding a new action = adding one Zod schema + one handler in Bridge; MCP exposure is automatic on next foundry-mcp boot (or hot-reload)
- Good: Single bearer auth check — no duplicated auth logic
- Neutral/Risk: `@evf/shared-protocol` becomes a load-bearing dep — schema changes ripple to multiple consumers. Mitigated by Changesets per-package versioning (D-1.12) — bumping `@evf/shared-protocol` triggers consumer re-installs explicitly.
- Neutral/Risk: V2 MCP server (Phase 11) inherits whatever the registry exposes — no separation of concerns. Acceptable: V2 IS "expose MVP via MCP" by design (ADR-0004).

### Confirmation

- Phase 3 contract test: `GET /v1/tools` returns array enumerating all registered handlers; each entry has `{name, inputSchema (JSON Schema), description}`
- Phase 11 contract test: foundry-mcp MCP Inspector lists tools matching `/v1/tools` 1:1
- Phase 7 + Phase 8 integration: each gesture path invokes the same dispatch handler as a hypothetical MCP call would

## Pros and Cons of the Options

### Option A — Shared dispatch table

- Good: Single source of truth; auto-MCP exposure; single auth gate
- Neutral: Coupling — schema change is a coordinated bump across packages

### Option B — Parallel registries

- Bad: Sync burden; drift risk; test-as-spec fragility

### Option C — Codegen

- Good: Decouples spec format from TS
- Bad: Build complexity for small surface; YAGNI per INV-4

## More Information

- Specs.md §5.3 (Tool Registry definition), §5.7.2 (MCP mirror), §5.7.4 (auth)
- Related ADRs: [ADR-0002](./0002-protocol-versioning.md) (envelope carries tool calls), [ADR-0004](./0004-voice-via-mcp-not-internal.md) (V2 consumes the registry)
- Phase entry-gate citations: Phase 3 (Bridge implements registry), Phase 7 (Write Path consumes), Phase 8 (Gesture UX maps to tools), Phase 11 (V2 MCP exposure)
- Sources: Specs.md §5.3, §5.7.2; research ARCHITECTURE.md Pattern 2
