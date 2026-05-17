# Phase 15: Deepgram Keyterm Prompting + Entity-Pack Integration - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — research pre-locked via Option C (voice-intent-research RESEARCH.md, 6-source INV-2 re-verified 2026-05-17)

<domain>
## Phase Boundary

Voice STT correctly recognizes esoteric D&D 5e entity names (spells, weapons, monsters) in both IT and EN — including code-switch within a single phrase — by feeding the Deepgram Nova-3 Multilingual `keyterm` parameter with the **union** of the static 70-spell SRD subset (`spell-lookup.ts`) and the dynamic Foundry-derived entity vocabulary (`entity-lookup-foundry.ts`), refreshed live on `/internal/delta` WS events.

This phase integrates Keyterm Prompting into the existing `deepgram-stt.ts` (Phase 12 baseline). It does NOT change the overall voice architecture (still Deepgram Nova-3 cloud STT + Claude Desktop MCP intent identifier), nor introduce on-glass AI (blocked by EvenAI API constraint per Specs.md §3.6, re-verified ✓ 2026-05-17 on 6 canonical sources).

Requirements: VOICE-06..09.

Out of scope: hardware UAT (35 SC `human_needed` carry forward unchanged under ADR-0005 Branch A), Picovoice Rhino edge classifier (conditional on SC-12-01 p50 > 800ms — not yet measurable without hardware), STT accuracy benchmarking (would require hardware + real audio), Phase 14 carry-forwards (Phase-14.1 standalone quick task or future fold-in).

</domain>

<decisions>
## Implementation Decisions

### Vocabulary Composition & Refresh
- **Union strategy**: deduplicate by lowercased IT-or-EN form. On conflict, **static spell-lookup wins** over dynamic entity-pack. Deterministic, protects SRD spell-name authoritative casing/spelling.
- **Locale feed**: feed BOTH IT + EN keyterms to a single Deepgram session (Nova-3 Multilingual handles intra-phrase code-switch like `"casta fireball"`). Matches REQ VOICE-08.
- **Refresh trigger**: re-emit keyterm list to Deepgram on `/internal/delta` WS event for entity-pack-relevant deltas. Static spell-lookup is build-time-constant (no runtime refresh). Matches REQ VOICE-09.
- **Size cap**: cap at Deepgram's documented keyterm limit (consult their API ref during planning — assume ~1000 unless docs say otherwise). On overflow, **truncate dynamic entity-pack first**, never truncate static spells (protects +625% recall lift on SRD).

### Failure Modes & Test Strategy
- **Empty entity-pack cache (Foundry unpaired)**: fall back to static spell-lookup only — voice still works on SRD spells. Log warning ONCE (not per request).
- **Deepgram keyterm rejection** (e.g., malformed term, oversized list): log + retry ONCE with sanitized list (strip special chars, normalize whitespace, re-apply cap). On second failure, fall back to no-keyterm Nova-3 session — preserves Phase 12 baseline STT functionality. Never fail-closed.
- **Hot-update race semantics**: debounce 250ms on `/internal/delta` keyterm-relevant events; serialize re-emit via mutex; ignore overlapping requests during in-flight emit. Prevents Deepgram session-config thrashing during multi-delta bursts.
- **Test strategy**: mock Deepgram SDK + assert keyterm parameter content on session create + assert WS delta event triggers re-emit. Unit + integration in `packages/bridge/src/voice/`. No live Deepgram calls in CI (no API key, no cost, no flakiness).

### Claude's Discretion
All other integration details — exact function names for the merger, debounce timer implementation (setTimeout vs RxJS), mutex implementation (Promise queue vs flag), test-mock structure — at Claude's discretion within the boundaries above and CI quality gates.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/bridge/src/voice/deepgram-stt.ts` — Phase 12 baseline; current Deepgram Nova-3 session creator. Keyterm parameter NOT currently passed. Insertion point for VOICE-06.
- `packages/bridge/src/voice/audio-stream-route.ts` — Phase 12 audio routing; downstream of STT.
- `packages/bridge/src/voice/deepgram-stt.test.ts` — existing test scaffold; mock pattern to extend.
- `packages/foundry-mcp/src/voice/spell-lookup.ts` — static 70-entry SRD subset (shipped quick-task `20260517-spell-lookup-foundry-derived`). Build-time constant. IT + EN catalogs.
- `packages/foundry-mcp/src/voice/spell-lookup-foundry.ts` — Foundry-derived spell vocab (live from world data).
- `packages/foundry-mcp/src/voice/entity-lookup-foundry.ts` — entity-pack pipeline (items/weapons/armor/NPCs/monsters from Foundry — shipped quick-task `260517-k2g`).
- `packages/bridge/src/cache/entity-pack-cache.ts` — bridge-side entity-pack cache; subscribes to WS delta.
- `packages/bridge/src/ws/entity-pack-handler.ts` — `/internal/delta` multiplex handler for entity-pack events.
- `packages/shared-protocol/src/payloads/entity-pack.ts` — Zod schema for entity-pack payload.

### Established Patterns
- **Bridge service pattern**: Fastify route handlers + Zod schemas + Pino logging + Prometheus metrics (Specs.md §5.2).
- **WS delta multiplex**: `/internal/delta` channel pushes incremental updates; subscribers register interest types (entity-pack vs others) — pattern established in quick-task `260517-k2g`.
- **Mock SDK in tests**: `vitest` + spy on the Deepgram client constructor; assert config parameters on `connect()` / `start()` call.
- **Locale-aware vocabularies**: spell-lookup already carries IT + EN parallel arrays — the merge function can take both locales.
- **Graceful degradation**: voice pipeline already has fall-back paths (mock STT, no-audio-mode) from Phase 12 — extend the same pattern.

### Integration Points
- `deepgram-stt.ts` session constructor — add `keyterm` parameter (Nova-3 Multilingual model).
- `entity-pack-cache.ts` — emits change events that the keyterm refresher subscribes to.
- `spell-lookup.ts` — exports static vocab; consumed by the merger.
- `entity-lookup-foundry.ts` — exports dynamic vocab; consumed by the merger.
- `/internal/delta` WS channel — already multiplexes entity-pack deltas (quick-task `260517-k2g`); no new socketlib handler needed (preserves CI Gate 8: 14-socketlib-handler count invariant — Phase 13 increased to 17, see memory `project_invariants`).

</code_context>

<specifics>
## Specific Ideas

- Research basis: `.planning/quick/20260517-voice-intent-research/RESEARCH.md` Option C — Deepgram Keyterm Prompting documented +625% entity-recall lift on esoteric terms like Bigby's Hand, Counterspell. INV-2 cross-checked on Deepgram docs 2026-05-17.
- The pipeline currently uses an AI for intent identification (Claude Desktop MCP) — that addresses the user's `"forse serve usare una AI per identificare le azioni"` premise. Phase 15 boosts the STT layer's accuracy; intent identification remains downstream/unchanged.
- Spell-lookup IT translations example: `"fireball"` ↔ `"palla di fuoco"`, `"counterspell"` ↔ `"controincantesimo"`, `"shield"` ↔ `"scudo"`. Code-switch test cases must cover `"casta fireball"` (IT verb + EN spell name) and `"counterspell quel mago"` (EN spell + IT object).
- Entity-pack examples: Foundry world has DM-defined items (`"Spada di Vittorina"`), NPCs (`"Lord Brankor"`), monsters (`"goblin sciamano"`). Dynamic vocab must include these so STT doesn't transcribe `"Brankor"` → `"branca" or "bracco"`.

</specifics>

<deferred>
## Deferred Ideas

- Picovoice Rhino edge classifier (intent classification on iOS WebView) — conditional on SC-12-01 hardware test measuring Claude Desktop latency p50 > 800ms. Not measurable without hardware. Carries forward under ADR-0005 Branch A.
- STT accuracy benchmarking (with/without keyterm) — requires hardware + curated audio dataset. Software-only Phase 15 verifies wiring; accuracy measurement is a future hardware-UAT task.
- Deepgram dashboard / monitoring — out of MVP; future ops task.
- Multi-session / per-DM keyterm catalogs — currently one keyterm list per Foundry world; multi-tenancy is Phase 13 stretch (cloud rewrite).

</deferred>
