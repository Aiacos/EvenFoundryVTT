---
phase: 25-promozione-raster-a-default-boot-fallback-glyph
plan: 03
subsystem: ui
tags: [g2-app, hud, raster, canvas, cleanup, poc-removal, inv-4]

# Dependency graph
requires:
  - phase: 25-01
    provides: pushHudTiles extracted to hud/push-hud-tiles.ts (safe to delete hud-poc-page.ts)
  - phase: 25-02
    provides: setRenderMode glyph fallback wired + LMT-ATOMIC-01 test

provides:
  - PoC triad deleted (boot-hud-raster-poc.ts, hud-poc-page.ts, hud-live-render.ts)
  - PoC test files deleted (hud-poc-page.test.ts, hud-live-render.test.ts)
  - launch.ts Branch A now calls bootEngine unconditionally (no ?hud=raster gate)
  - INV-4 zero dead code: all 10 grep-zero guards pass repo-wide

affects:
  - phase-26-doc-coherence (INV-3 update Specs.md/README)
  - any future phase touching g2-app launch path or hud/ modules

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PoC dead-code removal: git rm + grep-zero guards before each commit"
    - "launch.ts Branch A: single unconditional bootEngine call (no URL-flag branching)"

key-files:
  created: []
  modified:
    - packages/g2-app/src/internal/launch.ts
    - packages/g2-app/src/hud/hud-raster-frame.ts
    - packages/g2-app/src/hud/push-hud-tiles.ts
  deleted:
    - packages/g2-app/src/hud/boot-hud-raster-poc.ts
    - packages/g2-app/src/hud/hud-poc-page.ts
    - packages/g2-app/src/hud/hud-live-render.ts
    - packages/g2-app/src/hud/hud-poc-page.test.ts
    - packages/g2-app/src/hud/hud-live-render.test.ts

key-decisions:
  - "PoC triad deleted unconditionally — pushHudTiles was already extracted in 25-01, all remaining PoC symbols confirmed grep-zero"
  - "Stale @see hud-poc-page.ts refs in hud-raster-frame.ts and push-hud-tiles.ts JSDoc fixed inline (INV-4)"
  - "Pre-existing biome lint errors in deploy/sync-app-whitelist.mjs and foundry-mcp/mcp-inspector-smoke.test.ts are OUT OF SCOPE (documented below)"

patterns-established:
  - "grep-zero guard pattern: before deleting PoC files, run repo-wide grep on every exported symbol; fix stale @see refs in survivors before committing"

requirements-completed: [RPROMO-02]

# Metrics
duration: 12min
completed: 2026-06-08
---

# Phase 25 Plan 03: PoC Triad Deletion + launch.ts Simplification Summary

**Deleted the 5-file ?hud=raster PoC scaffold (boot-hud-raster-poc.ts, hud-poc-page.ts, hud-live-render.ts + 2 test files) and collapsed launch.ts Branch A to a single unconditional bootEngine call — INV-4 zero dead code closure**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-08T10:26:00Z
- **Completed:** 2026-06-08T10:38:06Z
- **Tasks:** 3 (Task 1 launch.ts; Task 2 PoC deletion; Task 3 regression gate)
- **Files modified:** 3 (launch.ts + hud-raster-frame.ts + push-hud-tiles.ts)
- **Files deleted:** 5 (PoC triad + 2 test files)

## Accomplishments

- Stripped `bootHudRasterPoc` import, `LaunchDeps.bootHudRasterPoc` field, `params.get('hud')` read, and the `if(hudMode==='raster'){…}else{…}` block from `launch.ts`; Branch A is now a single `deps.bootEngine(…)` call
- Deleted all 5 PoC files via `git rm`; all 10 grep-zero guards pass repo-wide (packages/)
- Fixed stale `@see hud-poc-page.ts` references in `hud-raster-frame.ts` and `push-hud-tiles.ts` JSDoc (INV-4 cleanliness)
- Full regression gate: 3292/3292 tests pass; typecheck clean; socketlib==17; INV-1 glyph fixtures byte-identical (git porcelain 0)

## Task Commits

1. **Task 1: Remove ?hud=raster branch from launch.ts** — `96bd090` (refactor)
2. **Task 2: Delete PoC triad + fix stale refs** — `6bbdb25` (refactor)
3. **Task 3: Full regression gate** — no code changes; verified via Task 1+2 commits

## Files Created/Modified

- `packages/g2-app/src/internal/launch.ts` — PoC branch removed; Branch A: unconditional `bootEngine` call; module header JSDoc updated (no ADR-0013/Branch A-raster refs)
- `packages/g2-app/src/hud/hud-raster-frame.ts` — Updated `HudTile` JSDoc: `@see hud-poc-page.ts` → `push-hud-tiles.ts`
- `packages/g2-app/src/hud/push-hud-tiles.ts` — Removed stale "PoC boot path (`?hud=raster`)" sentence from function JSDoc

**Deleted:**
- `packages/g2-app/src/hud/boot-hud-raster-poc.ts` — PoC entry (all symbols PoC-only after 25-01)
- `packages/g2-app/src/hud/hud-poc-page.ts` — PoC page (pushHudTiles already extracted in 25-01; remaining symbols PoC-only)
- `packages/g2-app/src/hud/hud-live-render.ts` — PoC live-render (superseded by HudDeltaDriver in Phase 24)
- `packages/g2-app/src/hud/hud-poc-page.test.ts` — PoC-only tests (13 tests)
- `packages/g2-app/src/hud/hud-live-render.test.ts` — PoC-only tests (5 tests)

## Decisions Made

- Fixed stale `@see` refs and `?hud=raster` doc mentions in surviving files inline (Rule 1 — dead documentation is a form of dead code under INV-4)
- Did NOT add `@deprecated` annotations — D-25.1 mandates full removal, not soft deprecation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale `?hud=raster` reference in push-hud-tiles.ts JSDoc**
- **Found during:** Task 2 grep-zero scan
- **Issue:** `push-hud-tiles.ts` line 42 had `("?hud=raster")` in a JSDoc sentence describing the function as also being used by "the PoC boot path (`?hud=raster`)". After PoC deletion this is stale documentation (INV-4).
- **Fix:** Removed the PoC-path sentence from the `pushHudTiles` JSDoc
- **Files modified:** `packages/g2-app/src/hud/push-hud-tiles.ts`
- **Committed in:** `6bbdb25` (Task 2 commit)

**2. [Rule 1 - Bug] Stale `hud-poc-page.ts` reference in hud-raster-frame.ts JSDoc**
- **Found during:** Task 2 — detected via Pitfall 5 from RESEARCH
- **Issue:** `hud-raster-frame.ts` line 93 had `Used by hud-poc-page.ts to build the CreateStartUpPageContainer schema` — stale after deletion
- **Fix:** Updated to `Used by push-hud-tiles.ts (serialized tile push) and by tests`
- **Files modified:** `packages/g2-app/src/hud/hud-raster-frame.ts`
- **Committed in:** `6bbdb25` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — stale documentation under INV-4)
**Impact on plan:** Both fixes necessary for INV-4 zero dead code compliance. No scope creep.

## Pre-existing Lint Errors (OUT OF SCOPE — D-25.5)

`corepack pnpm lint:ci` produces lint errors in two files that are **pre-existing on main** and NOT introduced by Phase 25:
- `deploy/sync-app-whitelist.mjs:62` — `useTemplate` biome rule violation
- `packages/foundry-mcp/src/__tests__/mcp-inspector-smoke.test.ts:44` — `useTemplate` biome rule violation

Per D-25.5, the gate for this phase is "no NEW errors on changed files". Changed-file biome check (5 files) exits clean. These two pre-existing errors are documented here and deferred to a future cleanup task.

## Issues Encountered

None — plan executed without blocking issues. All acceptance criteria met on first attempt.

## Known Stubs

None — this plan only removes dead code; no new data flows introduced.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan is pure dead-code removal.

## Regression Gate Results

| Gate | Result |
|------|--------|
| `pnpm test` (workspace) | 3292/3292 PASS |
| `pnpm typecheck` | EXIT 0 |
| Biome check (5 changed files) | CLEAN (0 errors) |
| socketlib count == 17 (MOD-CAT-01) | PASS (`FM-ISM-W9-09` green) |
| INV-1 glyph fixtures byte-identical | PASS (`git status --porcelain packages/shared-render/src/fixtures/` = 0) |
| Canvas default boot intact | PASS (`grep -c "layerManager.setRenderMode('canvas')" boot-engine-core.ts` = 1) |
| All 10 grep-zero guards | PASS (0 matches) |

## Next Phase Readiness

- Phase 25 INV-4 closure complete: all PoC dead code removed, launch path simplified
- Phase 26 (INV-3 doc coherence): Specs.md §7 / README / showcase updates for the raster default boot promotion — now unblocked

## Self-Check: PASSED

Files verified:
- `packages/g2-app/src/internal/launch.ts` — EXISTS (modified)
- `packages/g2-app/src/hud/hud-raster-frame.ts` — EXISTS (modified)
- `packages/g2-app/src/hud/push-hud-tiles.ts` — EXISTS (modified)
- `packages/g2-app/src/hud/boot-hud-raster-poc.ts` — DELETED (confirmed)
- `packages/g2-app/src/hud/hud-poc-page.ts` — DELETED (confirmed)
- `packages/g2-app/src/hud/hud-live-render.ts` — DELETED (confirmed)
- `packages/g2-app/src/hud/hud-poc-page.test.ts` — DELETED (confirmed)
- `packages/g2-app/src/hud/hud-live-render.test.ts` — DELETED (confirmed)

Commits verified:
- `96bd090` — refactor(25-03): remove ?hud=raster branch + bootHudRasterPoc dep from launch.ts
- `6bbdb25` — refactor(25-03): delete PoC triad + update stale @see refs (INV-4 D-25.1)

---
*Phase: 25-promozione-raster-a-default-boot-fallback-glyph*
*Completed: 2026-06-08*
