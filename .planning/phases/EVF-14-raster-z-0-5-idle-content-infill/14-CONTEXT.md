# Phase 14: Raster z=0.5 Idle Content Infill - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — carry-forward PLAN pre-locks architecture (CORRECTED-B, user-approved 2026-05-14)

<domain>
## Phase Boundary

In raster mode with no z=2 overlay mounted, the player sees the previously-empty ~5 idle rows of the map area populated with glanceable status content (combat log mini · z=0.5 label · stats strip). When an overlay opens, the infill disappears atomically — no flicker, no layout shift on z=0 raster or z=1 HUD.

This phase introduces a new layered-model layer at z=0.5 (additive to ADR-0001 z=0/1/2), formalizes it in Specs.md §7.2/§7.3/§7.4/§7.4c/§7.5/§11.5.7/§11.5.8, amends ADR-0001 in place, locks the state machine via 3 INV-1 snapshots (idle · overlay-open · mid-mount transition), and commits the atomic v0.9.11 → v0.9.12 spec bump (INV-3 atomic — Specs.md + README.md + docs/showcase/index.html + ADR-0001 in one commit).

Requirements: INFILL-01..05.

Out of scope: hardware validation (35 SC `human_needed` carry forward under ADR-0005 Branch A unchanged), z=2 overlay panel content changes, raster pipeline modifications, voice features (Phase 15).

</domain>

<decisions>
## Implementation Decisions

### Infill Content & Cadence
- **3 z=0.5 text containers**: combat-log mini · z=0.5 label · stats strip (combat-log delivers in-session value, label aids debug, stats strip surfaces fps/BLE health). Matches carry-forward PLAN scope exactly.
- **Update cadence**: 1 Hz refresh (decoupled from 5 fps raster). Text is glanceable; matching raster fps wastes BLE bandwidth.
- **Glyph-mode behavior**: z=0.5 still applies — glyph mode has the same idle rows; consistency reduces snapshot variants and validates the layer in both rendering modes.
- **Locale**: Foundry `game.i18n.lang` with INV-1 width-budget per §7.16. Reuses existing IT + EN catalogs.

### Demolish Strategy & Snapshot Coverage
- **z=2 mount path**: differential bundle via existing `LayerManager.bundle()` — Phase 4b Wave-0 pattern, atomic op, no flicker risk.
- **INV-1 fixtures**: 3 snapshots required — (1) raster idle z=0+0.5+1, (2) overlay-open z=0+1+2 (z=0.5 demolished), (3) mid-mount transition (race-coverage). Captures full state machine.
- **ADR-0001 path**: amend in place — z=0.5 is additive, no semantic change to z=0/1/2 (per carry-forward PLAN). No new ADR-0009.
- **Specs.md version bump**: Phase 14 commits the full v0.9.11 → v0.9.12 atomic bump (Specs.md + README.md + showcase + ADR-0001 in one INV-3 commit). Phase 15 reuses the bumped version.

### Claude's Discretion
All other implementation details (file naming, internal API names, test fixture file structure) at Claude's discretion within phase boundary and INV-1..5 + CI Gate 8 constraints.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/g2-app/src/render/layer-manager.ts` — `LayerManager.bundle()` provides atomic multi-op bundle pattern (Phase 4b Wave-0).
- `packages/g2-app/src/render/raster-pipeline.ts` — current z=0 raster orchestration; z=0.5 must coexist without mutating its container budget.
- `packages/g2-app/src/render/status-hud.ts` — z=1 persistent HUD; precedent for non-raster text container patterns.
- `packages/shared-render/src/ascii-grid.ts` — INV-1 snapshot matcher (Phase 1 Plan 03).
- `packages/g2-app/src/i18n/` — locale catalogs (IT + EN) + width-budget helpers from Phase 5.

### Established Patterns
- **Layer demolish**: `LayerManager.bundle({ destroy: [...], create: [...] })` for atomic transitions (Phase 4b precedent).
- **State machine snapshots**: INV-1 fixtures live under `packages/shared-render/__snapshots__/` and `packages/g2-app/test/snapshots/`; one fixture per layered state.
- **Locale-aware text**: i18n catalog lookup via `t(key, locale)` with width-budget validation at build time (§7.16, §7.1a).
- **Container budget tracking**: `packages/g2-app/src/render/container-budget.ts` enforces 4 image + 8 text/list + 1 capture cap.
- **INV-3 atomic commits**: spec changes (Specs.md + README.md + showcase + ADR) ship in a single commit per CLAUDE.md INV-3.

### Integration Points
- `LayerManager.bundle()` — entry point for z=0.5 mount/demolish.
- `RasterPipeline.onIdleStateChange()` — emits idle-vs-overlay state transitions.
- `StatusHud.tick()` — 1 Hz cadence pattern reusable for z=0.5 stats strip.
- `Specs.md §7.4c` — new subsection scaffold per carry-forward PLAN.
- `docs/architecture/0001-layered-ui-model.md` — amend ACCEPTED ADR (additive z=0.5 note).

</code_context>

<specifics>
## Specific Ideas

- Carry-forward PLAN at `.planning/quick/20260514-raster-dynamic-infill/PLAN.md` is the authoritative scope contract. EVIDENCE.md captures the INV-2 cross-check (4 parallel WebFetch, 2026-05-14).
- User wording from 2026-05-14: *"vorrei aumentare l'area della mappa rasterizzata in modo che non ci siano spazi vuoti"* — the z=0.5 layer is the resolved answer; CORRECTED-B (vs original Option B 5th-raster-tile which violated container budget) was approved verbatim.
- INV-1 snapshot discipline: idle-state mockup + overlay-open mockup must be character-precision aligned across both states. Frame corners, dividers, column boundaries: identical column positions.
- Container budget post-change: MAIN_MAP raster idle = 4 image + 5-8 text (3 z=0.5 infill + Header + Status HUD + Footer) + 1 capture. At budget cap; safe. MAIN_MAP raster + overlay-open = 4 image + 4-5 text + 1 capture (z=0.5 demolished). Well below cap.

</specifics>

<deferred>
## Deferred Ideas

- INV-2 follow-up: specific 200×100 image dimension number not directly visible on `hub.evenrealities.com/docs/guides/device-apis` at 2026-05-14 fetch. Broad "no arbitrary pixel drawing" constraint holds; precise dimension may live in JS-rendered SDK reference. Non-blocking for Phase 14.
- Picovoice Rhino edge classifier — conditional on SC-12-01 hardware test (p50 > 800ms threshold), unmeasurable until hardware UAT.
- Hardware validation of z=0.5 flicker behavior on real G2 BLE — deferred under ADR-0005 Branch A (35 SC carry-forward unchanged).

</deferred>
