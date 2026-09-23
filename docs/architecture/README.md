# EVF Architecture Decision Records (ADRs)

This directory contains MADR-formatted Architecture Decision Records governing EVF's architectural choices. Each ADR is **immutable post-acceptance** — supersedence happens via a NEW ADR that references the old by number.

Format: [MADR 4.0](https://adr.github.io/madr/) (locked per ADR-0008 + CONTEXT.md D-1.08).

## 🏗️ Index

| ID | Title | Status | Phase Gate |
|----|-------|--------|------------|
| [ADR-0001](./0001-layered-ui-model.md) | Layered UI Model — z=0/1/2 + single capture container | superseded by 0014 | Phase 4a entry |
| [ADR-0002](./0002-protocol-versioning.md) | Protocol Versioning — WS envelope + idempotency + replay (bridge transport superseded by ADR-0012) | superseded by 0012 | Phase 2 entry |
| [ADR-0003](./0003-tool-registry-pattern.md) | Tool Registry — shared MVP gestures + V2 MCP | accepted (amended by 0012) | Phase 3 entry |
| [ADR-0004](./0004-voice-via-mcp-not-internal.md) | Voice via MCP (NOT internal LLM, NOT EvenAI hijack) — bridge Deepgram proxy + `foundry-mcp` removed by ADR-0012 | superseded by 0012 | Phase 11 entry |
| [ADR-0005](./0005-phase0-go-no-go.md) | Phase 0 GO/NO-GO — Branch A/B/C raster vs glyph default | proposed | Phase 0 closure (Plan 04 fills verdict) |
| [ADR-0006](./0006-raster-pipeline-library-stack.md) | Raster Pipeline Library Stack | superseded by 0014 | Phase 0 closure (Plan 04 fills branch path) |
| [ADR-0008](./0008-code-quality-configuration.md) | Code Quality Configuration — Biome+TS+Vitest+CI gates | accepted | Phase 1+ every commit |
| [ADR-0009](./0009-layer-manager-contract.md) | Layer Manager Contract — mount/destroy/bundle API + capture-container invariant | superseded by 0014 | Phase 4a Plan 05 — boot orchestrator wired the contract across 6 plans (606/606 tests) |
| [ADR-0010](./0010-panel-plugin-registry.md) | Panel Plugin Registry — discovery, metadata contract, capability gating | superseded by 0014 | Phase 5 entry |
| [ADR-0011](./0011-foundry-write-path-single-workflow-origin.md) | Foundry Write Path — Single-Workflow-Origin Discipline | accepted (amended by 0013) | Phase 7 entry |
| [ADR-0012](./0012-direct-foundry-streaming.md) | Direct Foundry → G2 Streaming (bridge + Docker removed) | accepted (amended by 0013, 0014) | v0.10 entry — supersedes §11.5.3 topology + ADR-0002 transport |
| [ADR-0013](./0013-player-owned-glasses-hybrid-projector.md) | Player-Owned Glasses — self-service pairing + hybrid projector | accepted | v0.10 — amends ADR-0012 pairing/custody + ADR-0011 origin |
| [ADR-0014](./0014-dnd-sheet-hud-pixel-renderer.md) | D&D-sheet HUD on a pure-TypeScript pixel renderer | accepted | v0.10 UX round 2 — supersedes 0001/0006/0009/0010 + ADR-0012 point 6 |

**Numbering:** ADR-0007 reserved for RTL languages (V2 stretch — not yet authored). v0.10 (2026-09-23) added ADR-0012 (direct streaming), ADR-0013 (player-owned glasses) and ADR-0014 (D&D-sheet HUD). Superseded ADRs stay in place, immutable, with a status note pointing to their successor.

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
- [.planning/ROADMAP.md](../../.planning/ROADMAP.md) — phase plan
