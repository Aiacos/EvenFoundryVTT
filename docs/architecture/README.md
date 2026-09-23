# EVF Architecture Decision Records (ADRs)

This directory contains MADR-formatted Architecture Decision Records governing EVF's architectural choices. Each ADR is **immutable post-acceptance** — supersedence happens via a NEW ADR that references the old by number.

Format: [MADR 4.0](https://adr.github.io/madr/) (locked per ADR-0008 + CONTEXT.md D-1.08).

## 🏗️ Index

| ID | Title | Status | Phase Gate |
|----|-------|--------|------------|
| [ADR-0001](./0001-layered-ui-model.md) | Layered UI Model — z=0/1/2 + single capture container | superseded by 0018 | Phase 4a entry |
| [ADR-0002](./0002-protocol-versioning.md) | Protocol Versioning — WS envelope + idempotency + replay (bridge transport superseded by ADR-0016) | partially superseded by 0016 (semver + idempotency kept) | Phase 2 entry |
| [ADR-0003](./0003-tool-registry-pattern.md) | Tool Registry — shared MVP gestures + V2 MCP | accepted (amended by 0016; bridge/MCP half removed) | Phase 3 entry |
| [ADR-0004](./0004-voice-via-mcp-not-internal.md) | Voice via MCP (NOT internal LLM, NOT EvenAI hijack) — bridge Deepgram proxy + `foundry-mcp` removed by ADR-0016 | superseded by 0016 — voice/MCP needs a new ADR | Phase 11 entry |
| [ADR-0005](./0005-phase0-go-no-go.md) | Phase 0 GO/NO-GO — Branch A/B/C raster vs glyph default | proposed (provisional Branch A; + direct-sideload and 2×2 tile GO/NO-GO, v0.12) | Phase 0 closure (Plan 04 fills verdict) |
| [ADR-0006](./0006-raster-pipeline-library-stack.md) | Raster Pipeline Library Stack | superseded by 0018 | Phase 0 closure (Plan 04 fills branch path) |
| ADR-0007 | *(reserved — RTL languages, V2 stretch)* | reserved | — |
| [ADR-0008](./0008-code-quality-configuration.md) | Code Quality Configuration — Biome+TS+Vitest+CI gates | accepted | Phase 1+ every commit |
| [ADR-0009](./0009-layer-manager-contract.md) | Layer Manager Contract — mount/destroy/bundle API + capture-container invariant | superseded by 0018 | Phase 4a Plan 05 — boot orchestrator wired the contract across 6 plans (606/606 tests) |
| [ADR-0010](./0010-panel-plugin-registry.md) | Panel Plugin Registry — discovery, metadata contract, capability gating | superseded by 0018 | Phase 5 entry |
| [ADR-0011](./0011-foundry-write-path-single-workflow-origin.md) | Foundry Write Path — Single-Workflow-Origin Discipline | accepted (amended by 0017; Amendment 2 superseded by 0017) | Phase 7 entry |
| [ADR-0012](./0012-r1-gesture-model-overscroll-exit-lifecycle.md) | R1 Gesture Model — Retire Long-Press, Over-Scroll Quick Action, Root Exit, Lifecycle Handlers | accepted — **canonical** gesture model (Amd 2: tap opens menu), implemented by 0018 | Phase 20 gesture redesign (GEST-01) |
| [ADR-0013](./0013-hud-raster-rendering.md) | HUD raster rendering (image-based HUD) | superseded by 0018 (renderer; hardware facts retained) | HUD raster milestone |
| [ADR-0014](./0014-bearer-actor-authorization.md) | Bearer ↔ Foundry-User binding & per-actor read authorization (T8) | superseded by 0017 (live `userOwnsActor` carried forward) | Security — actor read authz |
| [ADR-0015](./0015-player-view-map-capture.md) | Player-view map capture & live character/role selection | superseded by 0016 (document-data map; party-fit framing kept as option) | Map follows selected PG |
| [ADR-0016](./0016-direct-foundry-streaming.md) | Direct Foundry → G2 Streaming (bridge + Docker removed) | accepted (amended by 0017, 0018) | v0.12 entry — supersedes §11.5.3 topology, ADR-0002 transport, ADR-0015 |
| [ADR-0017](./0017-player-owned-glasses-hybrid-projector.md) | Player-Owned Glasses — self-service pairing + hybrid projector | accepted | v0.12 — amends ADR-0016 pairing/custody + ADR-0011 origin; supersedes ADR-0014 + ADR-0011 Amd 2 |
| [ADR-0018](./0018-dnd-sheet-hud-pixel-renderer.md) | D&D-sheet HUD on a pure-TypeScript pixel renderer | accepted (Amd 1: 2×2 288×144 tile geometry) | v0.12 UX round 2 — supersedes 0001/0006/0009/0010/0013 + ADR-0016 point 6; implements 0012 |

**Numbering:** ADR-0007 reserved for RTL languages (V2 stretch — not yet authored). ADR-0012–0015 were authored on the bridge-era develop line (R1 gesture model, HUD raster, bearer authz, player-view capture); v0.12 (2026-09-23) added ADR-0016 (direct streaming), ADR-0017 (player-owned glasses) and ADR-0018 (D&D-sheet HUD) — renumbered from 0012–0014 of the direct-streaming branch when it was ported onto `develop`. Superseded ADRs stay in place, immutable, with a status note pointing to their successor.

## 🧹 Authoring Process

1. New architectural decision identified during planning or implementation
2. Author MADR file: `docs/architecture/NNNN-kebab-title.md` with frontmatter `status: proposed`
3. Discussion via PR (or solo-dev: changeset entry + commit)
4. On acceptance: update frontmatter `status: accepted` + add to this index
5. **Never edit body of accepted ADR** — supersede via NEW ADR if circumstances change

## 🏷️ Conventions

- Frontmatter: `status`, `date` (YYYY-MM-DD), `deciders`, `consulted`, `informed`
- Sections: Status, Context, Decision Drivers, Considered Options, Decision Outcome, Pros/Cons, More Information
- Cross-refs: `[ADR-NNNN](./NNNN-title.md)` markdown links
- Phase entry-gate citations explicit (per Phase 0 D-16 pattern — downstream phases cite ADRs as preconditions)

## 📚 See also

- [Specs.md §0.1](../../Specs.md) — INV-1/2/3/4 binding rules
- [INVARIANTS.md](./INVARIANTS.md) — consolidated INV-1..6 (INV-5 Gesture Determinism, INV-6 GM Authority)
- [specs/](../../specs/) — Spec Kit feature folders (`003-direct-streaming` = the v0.12 port)
