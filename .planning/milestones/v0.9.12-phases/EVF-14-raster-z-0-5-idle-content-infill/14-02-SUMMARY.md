---
phase: 14
plan: 02
subsystem: g2-app/engine
tags: [test, layer-manager, atomicity, race-coverage, INFILL-03, INV-1]
requires:
  - "Phase 4b Wave-0 LayerManager.bundle() differential demolish (already shipped)"
  - "UI-SPEC §6.4 State D + §8.1 Atomicity guarantee"
  - "Specs.md §11.5.8.6 failure-mode mitigation"
provides:
  - "LMT-DD-07 race-coverage unit test (atomicity lock for INFILL-03)"
affects:
  - "packages/g2-app/src/engine/__tests__/layer-manager.test.ts (+95 lines, +1 it block)"
tech-stack:
  added: []
  patterns:
    - "TDD lock-in pattern (test against existing implementation to prevent regression of contractual atomicity)"
    - "Reference-equality round-trip assertion for stash/restore lifecycle"
    - "Cumulative bridge-call counting across multiple bundles (atomicity invariant verification)"
key-files:
  created:
    - ".planning/phases/EVF-14-raster-z-0-5-idle-content-infill/deferred-items.md"
  modified:
    - "packages/g2-app/src/engine/__tests__/layer-manager.test.ts"
decisions:
  - "Plan 14-02 is TEST-ONLY: no production code touched. LMT-DD-07 verifies the existing Phase 4b implementation rather than driving new behavior."
  - "Pre-existing lint error in spell-pack-reader.ts logged as deferred item per executor scope-boundary rule (not auto-fixed)."
metrics:
  duration: "~6 minutes (test authoring + verification + commit)"
  completed: "2026-05-17T16:00:06Z"
  tasks_executed: 2
  files_modified: 1
  files_created: 1
  tests_added: 1
  test_count_delta: "+1 (1316 → 1317 in g2-app)"
  lmt_dd_count_delta: "+1 (6 → 7)"
---

# Phase 14 Plan 02: LMT-DD-07 Race-Coverage Unit Test Summary

**One-liner:** Locks the INFILL-03 atomicity contract by adding LMT-DD-07 race-coverage test asserting single bridge flush + no-transient-frame + suspended-z=0.5 reference round-trip + toast carve-out for the z=0.5 → z=2 differential demolish bundle.

## Outcome

LMT-DD-07 added to `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`. The test extends the existing LMT-DD-01..06 suite (Phase 4b differential demolish + container budget + OverlayPanel lifecycle describe block) with a 4-assertion behavioral lock around the most race-prone path in the LayerManager state machine: a single `bundle()` call that demolishes z=0 AND mounts z=2 while z=0.5 is currently mounted.

Total LMT-DD test count is now exactly 7 (verified via `grep -c "LMT-DD-0[1-9]: " layer-manager.test.ts`). Full g2-app test suite remains green at 1317/1317 (no regressions).

The test passes against the EXISTING `LayerManager.bundle()` implementation from Phase 4b Wave-0 (layer-manager.ts:191-272) — Plan 14-02 introduces NO production code changes. The test is a contract lock: any future refactor that breaks the single-flush or reference-equality guarantees will now fail this test before reaching hardware UAT (where it would manifest as visible flicker per Specs.md §11.5.8.6).

## Test Anatomy (LMT-DD-07)

Four explicit assertions in one `it(...)` block:

1. **Atomicity** — `bridge.rebuildPageContainer.mock.calls.length === 1` after a bundle that fires 3 op-effects (implicit destroy z=0.5 + explicit destroy z=0 + explicit mount z=2). UI-SPEC §6.4 State D + §8.1.
2. **No transient state** — post-condition exclusivity: `getLayer(z=0.5)` undefined AND `getLayer(z=2) === panel`; capture-invariant satisfied (panel carries `'overlay-capture'`).
3. **`_suspendedZ05` round-trip** — inverse bundle (`mount z=0 + destroy z=2`) restores the ORIGINAL idle instance via reference equality (`getLayer(z=0.5) === idle`). Cumulative flush count across both bundles = exactly 2 (no spurious flushes). Mitigates T-14-02-01 silent-instance-swap threat.
4. **Toast carve-out under race** — fresh LayerManager + bridge; mount map + idle + toast(z=1.5); bundle overlay-mount. Toast at z=1.5 survives (LMT-DD-04 carve-out holds), z=0.5 demolished, z=2 mounted as same panel ref, exactly ONE flush. Re-affirms UI-SPEC §6.4 row 1.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | LMT-DD-07 race-coverage test | `bf0d627` | `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` |
| 2 | CI quality gates + deferred items | `2dfbde3` | `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/deferred-items.md` |

## Verification Results

| Gate | Status | Notes |
|------|--------|-------|
| `pnpm --filter @evf/g2-app exec vitest run -t "LMT-DD-07"` | PASS | 1 passed, 32 skipped (test-name filter); 3ms duration |
| `pnpm --filter @evf/g2-app test` | PASS | 1317/1317 passed across 84 test files; 6.64s |
| `pnpm typecheck` | PASS | exit 0; root tsc + per-package tsc |
| `grep -c "LMT-DD-0[1-9]: " layer-manager.test.ts` | PASS | returns `7` (six existing + one new) |
| `pnpm lint:ci` | **FAIL (out of scope)** | Pre-existing format error in `packages/foundry-module/src/readers/spell-pack-reader.ts:168` introduced by commit `fbaac3c` (quick-spell-lookup), unrelated to Plan 14-02. See deferred-items.md. |

## Deviations from Plan

### Out-of-scope CI gate failure (deferred, NOT auto-fixed)

**1. [Scope boundary] Pre-existing Biome format error in `spell-pack-reader.ts`**

- **Found during:** Task 2 CI quality gates
- **Issue:** `pnpm lint:ci` exits 1 due to a `lineWidth` format violation on `packages/foundry-module/src/readers/spell-pack-reader.ts:168` — single-line function signature should be broken to multi-line. Pre-dates Plan 14-02 by several commits (introduced by `fbaac3c`).
- **Disposition:** NOT auto-fixed per executor scope-boundary rule. Plan 14-02 modifies only `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`; the spell-pack-reader file is in a different package and untouched by this plan.
- **Logged in:** `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/deferred-items.md`
- **Suggested resolution:** `pnpm format packages/foundry-module/src/readers/spell-pack-reader.ts` (Biome auto-fix, single-line diff). Recommended fold-in: Phase 14 Plan 03 (INV-3 atomic v0.9.11 → v0.9.12 commit) or a standalone `chore: format spell-pack-reader.ts` quick task.

### Auto-fixed issues

None. The LMT-DD-07 test passed at first run against the existing `LayerManager.bundle()` implementation — no production code adjustments needed. TDD RED step was degenerate (testing existing logic to prevent regression).

## Authentication Gates

None — Plan 14-02 is fully software/test execution with no hardware, network, or auth touchpoints.

## Threat Flags

None — Plan 14-02 introduces no new network endpoints, auth paths, file access patterns, or schema changes. Test code only.

## Known Stubs

None — `idle-infill-layer.ts` and `LayerManager.bundle()` are full production implementations (Phase 4a + 4b Wave-0). The LMT-DD-07 test asserts contractual behavior; no stub patterns.

## Self-Check: PASSED

**Files verified:**
- `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` → FOUND (modified, +95 lines)
- `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/deferred-items.md` → FOUND (created)

**Commits verified:**
- `bf0d627` → FOUND (`test(14-02): add LMT-DD-07 race-coverage for z=0.5→z=2 atomic demolish (INFILL-03)`)
- `2dfbde3` → FOUND (`docs(14-02): log pre-existing lint error as deferred item (scope boundary)`)

**Test count verified:**
- LMT-DD-0[1-9] grep → returns 7 (six existing + LMT-DD-07)
- g2-app full suite → 1317/1317 passed

**INFILL-03 traceability:**
- Commit message of `bf0d627` cites INFILL-03 directly
- Test JSDoc cites UI-SPEC §6.4 State D + §8.1 + Specs.md §11.5.8.6

**Plan 14-02 success criteria:**
- [x] LMT-DD-07 test green
- [x] 4 explicit assertions inside the test (atomicity, no-transient-state, suspend round-trip, toast carve-out)
- [x] `pnpm typecheck && pnpm --filter @evf/g2-app test` exit 0
- [ ] `pnpm lint:ci` exit 0 — **NOT met** due to pre-existing out-of-scope error (documented in deferred-items.md)
- [x] INFILL-03 explicitly cited in test JSDoc + commit message

4 of 5 success criteria met. The unmet lint:ci gate is blocked on a separate concern that scope-boundary rule prohibits the executor from fixing.
