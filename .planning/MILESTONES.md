# Milestones

## v0.9.11 MVP (Shipped: 2026-05-17)

**Phases completed:** 15 phases, 71 plans, 95 tasks
**Timeline:** 7 calendar days (2026-05-10 → 2026-05-17), 442 commits, ~99,642 LOC TypeScript across workspace, 2,097 tests passing
**Branch:** `gsd/v0.9.11-milestone`
**Archives:**
- Roadmap: [`milestones/v0.9.11-ROADMAP.md`](milestones/v0.9.11-ROADMAP.md)
- Requirements: [`milestones/v0.9.11-REQUIREMENTS.md`](milestones/v0.9.11-REQUIREMENTS.md)
- Phases: [`milestones/v0.9.11-phases/`](milestones/v0.9.11-phases/) (15 directories)

### Delivered

**MVP software-complete (48/48 v1 REQ-IDs).** Player can pair G2 ↔ Foundry, navigate panels via R1 ring gestures, and execute cast/attack/use/move/AoE-template-placement end-to-end through `socketlib.executeAsGM` (single-workflow-origin per ADR-0011). V2 OPZIONALE (`foundry-mcp` server, voice UX tuning, ACT-04 reactions) included Phase 11-13. Hardware-pending verification carry: 35 SCs under ADR-0005 Branch A `human_needed`.

### Key accomplishments

1. **MVP software-complete (48/48 v1 REQ-IDs)** across MVP Phases 0–10 + V2 optional Phases 11–13. All software-side requirements landed; only hardware-validation gated SCs remain (carry per ADR-0005 Branch A).

2. **Layered raster pipeline operational** — z=0 raster (4-bit dithered 400×200, `image-q` + `upng-js` + `xxhash-wasm` hot path) + z=1 status HUD + z=1.5 toast queue (FIFO + `[+N]` squash) + z=2 overlay slot. INV-1 ASCII snapshot fixtures binding every state.

3. **R1 gesture model + Quick Action menu** — deterministic tap/scroll/long-press semantics; 9-action menu reachable from every overlay; **INV-5 Gesture Determinism** ratified as project invariant.

4. **Foundry write path closed** — `activity.use()` through `socketlib.executeAsGM` + MidiQOL workflow integration (ADR-0011 single-workflow-origin); multi-attack tracker (MULTI-01), reaction passive notification (REACT-01: Shield/Counterspell/OA), concentration-drop modal (CONC-01), AoE template placement (ACT-02), movement budget tracking.

5. **V2 MCP server shipped (OPZIONALE)** — `foundry-mcp` with Streamable HTTP transport (no HTTP+SSE), 4 MCP resources (actor/combat/scene/log) with live WS delta subscriptions, Docker image, Claude Desktop config, no-SSE grep gate. ACT-04 reaction execution + STRETCH-06 portrait flag-gated in Phase 13.

6. **Quality bar** — 2,097 tests, INV-1..5 verification suite + `inv:all` single-command orchestrator, ADRs ratified (0001 layered model, 0005 PROVISIONAL Branch A, 0006 raster lib stack, 0008 code quality, 0009 panel API + Amendment 1, 0011 single-workflow-origin), Biome+TypeScript-strict+Vitest CI gates green throughout.

### Known deferred items at close

16 items acknowledged and carried forward (see `.planning/STATE.md` → `## Deferred Items` → `### Items acknowledged at v0.9.11 milestone close`):

- **13 hardware-pending** — 10 verification gaps + 3 UAT gaps, all `human_needed`. Resolution path: `pnpm --filter @evf/validation-harness validate:all` once Even Hub access + G2 + R1 + consenting DM available (ADR-0005 Branch A).
- **2 SDK false positives** — `20260517-spell-lookup-foundry-derived`, `260513-l12-fix-applicationv2-referenceerror-in-foun`. Both have SUMMARY.md (task complete); SDK quick-task status field unreliable.
- **1 genuine carry → v0.9.12** — `20260514-raster-dynamic-infill`. PLAN already scoped as v0.9.11→v0.9.12 spec bump (z=0.5 idle infill layer). Will become a v0.9.12 requirement during `/gsd-new-milestone`.

### Notable decisions ratified during milestone

| Decision | Where | Outcome |
|----------|-------|---------|
| ADR-0005 PROVISIONAL Branch A — hardware-pending SCs as `human_needed` carry | Phase 0 §10.0.5 | ✓ Unblocked autonomous workflow; 35 SCs documented |
| ADR-0011 — single-workflow-origin (socketlib.executeAsGM ONLY, no parallel paths) | Phase 7 | ✓ Locked Foundry write architecture |
| ADR-0009 Amendment 1 — differential demolish rule on overlay mount | Phase 4b Plan 01 | ✓ Toast queue + overlay panel cohabit safely |
| Defer-hardware-tests carry pattern | Phases 4a → 13 close events | ✓ Established as project-wide convention |
| Raster lib stack `image-q@4.0.0` + `upng-js@2.1.0` + `xxhash-wasm@1.1.0` | ADR-0006 | ✓ Software-validated; hardware perf gating |
| MVP boot-splash bumped to v0.9.12 in Specs.md §7.12 | Phase 10 Plan 04 (commit bcb4e91) | ✓ INV-3 atomic doc coherence |

### Drift signals worth noting

- **REQUIREMENTS.md checkbox staleness**: 21 [x] / 21 [ ] vs traceability table showing 48/48 software-complete. Cause: autonomous Phase 5-10 batch closure prioritized execution over docs hygiene. **Fixed during this milestone close** (archived REQUIREMENTS marks all 48 as `[x]`).
- **PROJECT.md "Last updated: 2026-05-10"** footer never advanced during 7 days of execution. **Fixed during this milestone close.**

---
