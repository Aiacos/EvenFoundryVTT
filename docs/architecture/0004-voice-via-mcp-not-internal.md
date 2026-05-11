---
status: accepted
date: 2026-05-11
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Opus 4.7, planning/research agent)
informed: future contributors
---

# ADR-0004: Voice via MCP — NOT internal LLM, NOT EvenAI hijack

## Status

**ACCEPTED** — 2026-05-11. Binds V2 OPZIONALE Phase 11 (foundry-mcp server), Phase 12 (Voice UX Tuning); locks the architecture so that no MVP code path takes voice as an internal dependency.

## Context and Problem Statement

V2 voice support is a stretch goal but architecturally critical to scope NOW because: (a) Even Realities native EvenAI is **non-API for developers** per `hub.evenrealities.com` (verbatim Specs §3.6) — we cannot intercept or extend it; (b) embedding an LLM directly in `@evf/bridge` would bind us to one vendor and add operational complexity to MVP; (c) GM authority MUST remain unchallenged — voice cannot become a back-door to bypass DM oversight.

## Decision Drivers

- EvenAI native is "non-API per dev" (verbatim Specs §3.6 — proprietary, no transcript subscription, ChatGPT G1-only)
- GM authority preservation (Specs §1.4 + ACT-03 — all writes via `socketlib.executeAsGM`)
- LLM choice belongs to the user (Claude Desktop / any MCP client) — not pre-decided by EVF
- MVP independence — voice MUST NOT be a hard dep of any MVP phase (0-10)
- Standard MCP transport — Streamable HTTP (HTTP+SSE deprecated 2025-03-26 per spec rev 2025-06-18)

## Considered Options

- **Option A**: V2 voice = external MCP server (`packages/foundry-mcp`, Phase 11) consuming the existing Tool Registry (ADR-0003). User runs Claude Desktop / any MCP client; MCP client speaks to `foundry-mcp` over stdio (local) or Streamable HTTP (remote). Bridge bearer auth unchanged.
- **Option B**: Internal LLM in `@evf/bridge` (e.g., embed `langchain` or call OpenAI directly). Bridge handles voice → tool dispatch.
- **Option C**: Hijack EvenAI — reverse-engineer the proprietary stream. Hard violation of vendor terms.

## Decision Outcome

**Chosen: Option A — External MCP server consuming Tool Registry.**

Justification: Option A is the ONLY one that satisfies all three constraints: vendor compliance (no EvenAI hijack), GM authority (MCP tools route through `socketlib.executeAsGM` like every other write — single-workflow-origin option A locked at Phase 7), and MVP independence (Phase 11 is OPZIONALE, MVP 0-10 ships without it). Streamable HTTP transport (replaces deprecated HTTP+SSE) is the canonical MCP wire as of 2026.

Option B (internal LLM) couples bridge to one vendor, adds operational dep (API key, rate limits, billing), and risks GM authority bypass via prompt injection. Option C (EvenAI hijack) is non-starter — vendor terms violation + would break with any G2 firmware OTA.

### Consequences

- Good: MVP ships voice-free (no V2 dep blocks Phase 0-10)
- Good: Voice is plug-and-play: user adds `foundry-mcp` Docker container + Claude Desktop config; bridge unchanged
- Good: GM authority preserved — MCP tools call same Bridge endpoints as gestures (ADR-0003 single registry)
- Good: Streamable HTTP only — HTTP+SSE explicitly excluded (deprecated; no backwards-compat code path in MVP/V2)
- Neutral/Risk: Voice quality is bounded by chosen MCP client (Claude Desktop UX, any-MCP-client UX) — outside our control. Acceptable: better than embedding one vendor.
- Neutral/Risk: For users without Claude Desktop / MCP knowledge, voice is genuinely OPZIONALE — they get a complete MVP without it. Documentation in Phase 11 must make this clear.

### Confirmation

- Phase 11 entry gate: bridge bearer auth UNCHANGED — no new auth surface for MCP path
- Phase 11 contract test: `foundry-mcp` Inspector lists tools matching `/v1/tools` 1:1 (ADR-0003 confirmation)
- Phase 12 end-to-end: example A (Fireball gruppo), B (dual-wield Action+Bonus), C (clarify ambiguity) each pass through Claude Desktop → foundry-mcp → bridge → Foundry
- MVP code search (Phase 10 polish gate): `grep -r 'mcp\|llm\|openai\|anthropic' packages/g2-app packages/bridge packages/foundry-module` returns ZERO matches in MVP packages

## Pros and Cons of the Options

### Option A — External MCP server

- Good: Vendor-neutral; GM authority preserved; clean MVP/V2 separation; standard transport
- Neutral: User-side dep (MCP client) — deliberate cost; documented as OPZIONALE

### Option B — Internal LLM

- Bad: Vendor lock-in; adds operational dep to MVP; prompt-injection risk to GM authority

### Option C — EvenAI hijack

- Bad: Vendor terms violation; brittle to firmware OTA; no developer access (Specs §3.6 verbatim)

## More Information

- Specs.md §3.6 (EvenAI non-API verbatim), §5.7 (V2 architecture), §11.5 (deployment)
- MCP spec: `modelcontextprotocol.io/specification/2025-06-18/basic/transports` (Streamable HTTP canonical, HTTP+SSE deprecated)
- Related ADRs: [ADR-0003](./0003-tool-registry-pattern.md) (registry consumed by V2 path)
- Phase entry-gate citations: Phase 11 (foundry-mcp server build), Phase 12 (Voice UX Tuning)
- Sources: Specs.md §3.6, §5.7, §11.5; modelcontextprotocol.io/specification (verified 2026-05-11)
