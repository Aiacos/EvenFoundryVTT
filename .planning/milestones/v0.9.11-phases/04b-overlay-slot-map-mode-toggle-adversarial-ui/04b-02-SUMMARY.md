---
phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui
plan: 02
subsystem: g2-app
tags: [g2-app, engine, map-mode, persistence, even-hub, wave-1, boot-engine, map-05-toggle]

# Dependency graph
requires:
  - phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui
    plan: 01
    provides: LayerManager.setMapMode + MapMode type + RasterControllerLike.setBleVerdict (carried through from Phase 4a + extended by Plan 01 Wave 0) + ADR-0009 Amendment 1 differential demolish rule.
provides:
  - STORAGE_KEY = 'view.map.mode' — Even Hub kv key constant
  - loadPersistedMapMode(bridge) — boot-time read-back with whitelist validation + defensive 'auto' fallback (Q8 missing-key, invalid-value, read-rejection)
  - toggleMapMode(bridge, lm, rc, newMode) — runtime toggle primitive (in-memory FIRST, persistence SECOND best-effort)
  - bootEngine step 9b — persisted map mode override branch (overrides BLE verdict when 'raster' | 'glyph')
  - SR-11/12/13 smoke test cases covering the boot override path end-to-end
affects:
  - 06-quick-action-menu — Phase 6 Quick Action [M] tap handler wires directly to toggleMapMode; no new module required
  - future toggleMapMode('auto') re-probe restoration (Pitfall 7) — originalBleVerdict captured in boot-engine-core as closure variable, BootEngineHandle extension deferred to Phase 6 (TODO(ADR-0009) comment in boot-engine-core.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Best-effort persistence policy (04B-RESEARCH §Q8) — in-memory mutation FIRST (always succeeds); bridge.setLocalStorage SECOND wrapped in try/catch; rejection or false-resolution logs a single console.warn and the in-memory state is NEVER rolled back. The live session always honours the toggle; only the next-session boot fallback is affected by persistence failure."
    - "Defensive whitelist validation of untrusted Even Hub kv reads — strict `raw === 'raster' || raw === 'glyph' || raw === 'auto'` check before applying; empty string (SDK missing-key signal), invalid value, and getLocalStorage rejection all coerce to 'auto' (safe default that lets BLE verdict win)."
    - "Engine direct bridge access (Pitfall 1) — engine modules (map-mode-toggle.ts + boot-engine-core.ts) import EvenAppBridge from @evenrealities/even_hub_sdk directly and call bridge.setLocalStorage / bridge.getLocalStorage verbatim. The Phase 2 hub-polyfill.ts is a wizard-only backward-compat shim; engine code MUST NOT route through it."
    - "Closure-variable carry-forward for Pitfall 7 — originalBleVerdict captured in boot-engine-core.ts step 9b and suppressed via `void originalBleVerdict` to satisfy strict noUnusedLocals. The value is intentionally retained (not deleted) so Phase 6 can surface it through BootEngineHandle for toggleMapMode('auto') re-probe restoration."

key-files:
  created:
    - packages/g2-app/src/engine/map-mode-toggle.ts
    - packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-02-SUMMARY.md
  modified:
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts

key-decisions:
  - "Q8 best-effort persistence is the locked policy — in-memory state mutation FIRST, persistence SECOND, never rolls back on failure. The live session always succeeds; only next-boot fallback is affected. Verified by MMT-TG-04 (call ordering) + MMT-TG-05 (false resolution) + MMT-TG-06 (rejection)."
  - "STORAGE_KEY = 'view.map.mode' as const — dot-separated ASCII alphanumeric matches Phase 2 hub-polyfill key convention; module-level constant, no interpolation (T-4b-02-03 mitigation)."
  - "toggleMapMode('auto') intentionally does NOT call setBleVerdict — the RasterControllerLike contract refuses 'auto'. Pitfall 7: a future Phase 6 enhancement may re-run probeBleThroughput on 'auto' toggles; for Phase 4b the previous verdict stays in the controller. Documented in JSDoc + this summary."
  - "originalBleVerdict retained via `void originalBleVerdict` (Plan 02 implementer's choice, both options were acceptable per plan action block). Rationale: preserves the captured value for Phase 6 wiring without introducing dead code that linters would flag. The accompanying TODO(ADR-0009) ties the retained variable to the Phase 6 consumer; deleting it now would force Phase 6 to re-add the same capture, fragmenting the historical record of the Pitfall 7 lifecycle."
  - "boot-engine effectiveVerdict derived AFTER the override read — IdleInfillLayer's 'raster' vs 'glyph' render-mode branch reads from effectiveVerdict (not the bare BLE verdict), so the persisted override propagates into the initial layer composition. Without this, a persisted 'glyph' override would correctly flip the in-memory state but the IdleInfillLayer would still render in raster mode on the first frame."
  - "TODO(ADR-0009) comment lives in boot-engine-core.ts (NOT in map-mode-toggle.ts) — boot-engine is the only call site that has access to the original BLE verdict; the toggleMapMode module sees only the public RasterControllerLike contract which does not expose the pre-override verdict. The TODO is anchored where the future consumer will land."

patterns-established:
  - "Engine module test colocation in `packages/g2-app/src/engine/__tests__/` — Plan 02 follows the precedent set by Plan 01 (overlay-panel.test.ts, panel-gesture-bus.test.ts, layer-manager.test.ts). The smoke test in `packages/g2-app/src/__tests__/` is the package-level integration suite and stays there."
  - "Test discriminator markers MMT-LP-NN / MMT-TG-NN / SR-NN in `it()` titles — grep + plan-checker can correlate test coverage with plan behaviour bullets. Plan 02 adds 14 markers (7 LP + 7 TG) in map-mode-toggle.test.ts and 3 markers (SR-11/12/13) in scene-renderer-smoke.test.ts."

requirements-completed: []  # MAP-05 toggle-portion software-side advances; full requirement closure gated on Phase 6 Quick Action wiring + hardware verification gate per CONTEXT §Phase 0/4a human_needed

# Metrics
duration: 27 min
completed: 2026-05-15
---

# Phase 4b Plan 02: Map Mode Toggle + Even Hub Persistence + Boot Read-Back Summary

**`toggleMapMode(bridge, lm, rc, newMode)` runtime primitive + `loadPersistedMapMode(bridge)` boot read-back + `bootEngine` step 9b override branch — Phase 4b Wave-1 closes the MAP-05 toggle-portion software-side. Phase 6 Quick Action `[M] Map ctrl` will wire its tap handler to `toggleMapMode` without touching this plan's outputs.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-05-15T17:00:30Z (post-base-reset to 41d4741)
- **Completed:** 2026-05-15T17:07:30Z
- **Tasks:** 2
- **Files modified:** 2 created + 2 modified (+ 1 SUMMARY)
- **Tests added:** 14 (map-mode-toggle.test.ts) + 3 (scene-renderer-smoke.test.ts SR-11/12/13) = 17

## Accomplishments

- Shipped `packages/g2-app/src/engine/map-mode-toggle.ts` — the runtime `toggleMapMode` primitive + `loadPersistedMapMode` boot reader + `STORAGE_KEY = 'view.map.mode'` constant. Best-effort persistence policy locked: in-memory mutation FIRST, `bridge.setLocalStorage` SECOND wrapped in try/catch, failures log warn but NEVER roll back the in-memory toggle (Q8 policy verified by MMT-TG-04/05/06).
- Shipped `packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts` — 14 unit tests (7 LP + 7 TG) covering whitelist validation, defensive fallbacks, call ordering, failure-mode persistence paths, idempotent double-call.
- Extended `bootEngine` step 9 in `packages/g2-app/src/internal/boot-engine-core.ts` with the new **step 9b persisted-mode override branch**: after the BLE-probe verdict applies, `await loadPersistedMapMode(bridge)` reads `view.map.mode`; if persisted is `'raster' | 'glyph'`, the BLE verdict is overridden via `rasterController.setBleVerdict` + `layerManager.setMapMode`; `'auto'` lets the BLE verdict win.
- Captured `originalBleVerdict` as a closure variable inside `_bootEngineCore` (suppressed via `void` no-op) so Phase 6 can wire `toggleMapMode('auto')` BLE-verdict restoration (Pitfall 7) without re-introducing the capture. Anchored with a `TODO(ADR-0009)` comment.
- Derived `effectiveVerdict` for downstream `IdleInfillLayer` construction so the override propagates into the initial layer composition (not just the in-memory state). Without this, a persisted `'glyph'` override would correctly flip the layer-manager mode but the `IdleInfillLayer` would still render in raster on the first frame.
- Extended `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` with **SR-11 / SR-12 / SR-13** — three end-to-end smoke tests exercising the boot override path: glyph override, auto fallback, read-rejection defensive fallback.

## bootEngine Step 9b — Insertion Details (line numbers, before → after)

| Region | Before (41d4741 base) | After (0264b6a) |
| ------ | --------------------- | --------------- |
| Imports block | `layer-manager.js` → `layer-types.js` → `page-lifecycle.js` (3 contiguous lines) | + 1 line: `import { loadPersistedMapMode } from '../engine/map-mode-toggle.js';` between `layer-types.js` and `page-lifecycle.js` |
| Boot-sequence JSDoc | step 9 then step 10 (no 9b) | step 9b documented between 9 and 10 (4 lines of documentation) |
| Step 9 body | lines 236-240 (5 lines: `verdict` capture + `setBleVerdict` + `setMapMode`) | UNCHANGED — preserved verbatim per plan instruction |
| Step 9b override | absent | inserted as a 23-line block after step 9 and BEFORE step 10's `mapBase` construction — reads persisted mode, captures `originalBleVerdict`, applies override for `'raster' | 'glyph'`, computes `effectiveVerdict` |
| Step 10 `IdleInfillLayer` constructor | `verdict === 'glyph' ? 'glyph' : 'raster'` | `effectiveVerdict === 'glyph' ? 'glyph' : 'raster'` — so the override actually propagates into the initial render |

## Test Counts (per file, after Plan 02)

| File | Tests before (Plan 01) | Tests after (Plan 02) | Δ |
|---|---|---|---|
| `packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts` | (new) | 14 | +14 (MMT-LP-01..07 + MMT-TG-01..07) |
| `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` | 11 (Plan 01 left at SR-1..SR-10 + 1 expansion) | 14 | +3 (SR-11/12/13) |
| **g2-app suite total** | **320** | **337** | **+17** |
| **Workspace total** | **652** | **669** | **+17** |

All 669 workspace tests pass; `pnpm typecheck` + `pnpm lint:ci` exit 0.

## Files Created/Modified

**Created (2 source + 1 doc):**
- `packages/g2-app/src/engine/map-mode-toggle.ts` — `toggleMapMode` + `loadPersistedMapMode` + `STORAGE_KEY` exports; best-effort persistence + defensive read.
- `packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts` — 14 unit tests (7 MMT-LP + 7 MMT-TG).
- `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-02-SUMMARY.md` — this file.

**Modified (2):**
- `packages/g2-app/src/internal/boot-engine-core.ts` — import of `loadPersistedMapMode`; step 9b override branch; `effectiveVerdict` derivation; `IdleInfillLayer` constructor reads `effectiveVerdict`; boot-sequence JSDoc updated.
- `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` — `MockBridgeOptions.getLocalStorageImpl` injection point added; `bootWithMocks` threads it; SR-11/SR-12/SR-13 appended; SR-1..SR-10 preserved verbatim.

## Final JSDoc Summaries

### `loadPersistedMapMode(bridge)`

> Read the persisted map mode from Even Hub kv store. Defensive: empty string (SDK missing-key signal) → `'auto'`; any value outside the `'raster' | 'glyph' | 'auto'` whitelist → `'auto'` (T-4b-02-01 mitigation); `getLocalStorage` rejection → `'auto'` + a single `console.warn`. Never throws. Called from `boot-engine-core.ts` step 9b to override the BLE-probe verdict when the user has explicitly toggled.

### `toggleMapMode(bridge, layerManager, rasterController, newMode)`

> Apply a new map mode + persist best-effort to Even Hub kv store. STEP 1 (in-memory FIRST) — `layerManager.setMapMode(newMode)` plus (for `'raster' | 'glyph'` only) `rasterController.setBleVerdict(newMode)`. `'auto'` skips `setBleVerdict` (RasterControllerLike contract refuses `'auto'`; Pitfall 7 limitation). STEP 2 (persistence SECOND) — `bridge.setLocalStorage(STORAGE_KEY, newMode)` wrapped in try/catch; `false` resolution OR rejection emits a single `console.warn` and the function returns normally. The in-memory toggle is NEVER rolled back (T-4b-02-02 mitigation).

## Decisions Made

Captured in frontmatter `key-decisions` above. The most architecturally load-bearing:

1. **Q8 best-effort persistence policy is the locked failure-mode contract** — the live session always succeeds; only next-boot fallback is affected by persistence failure. Verified by MMT-TG-04 (call-order assertion) + MMT-TG-05 (`false` resolution path) + MMT-TG-06 (rejection path).
2. **`effectiveVerdict` derivation in `bootEngine`** — IdleInfillLayer's `'raster'` vs `'glyph'` render branch reads from `effectiveVerdict`, so the persisted override propagates into the initial layer composition. This was NOT explicitly called out in the plan's action block but is required to fulfil the plan's purpose ("Phase 6 Quick Action [M] hot-swaps raster ↔ glyph at runtime without re-handshake" — for a fresh boot with a saved override, the swap must happen at boot, not at first toggle).
3. **`originalBleVerdict` retained via `void` no-op** (not omitted entirely). The captured value is dead code today but the TODO ties it to the Phase 6 consumer; deleting now would force Phase 6 to re-introduce the same capture, fragmenting Pitfall 7's lifecycle in git history.
4. **`TODO(ADR-0009)` comment lands in `boot-engine-core.ts`** (NOT `map-mode-toggle.ts`) — boot-engine is the only call site with access to the pre-override BLE verdict; the toggle module sees only the `RasterControllerLike` public contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan's vitest invocation syntax fails on `pnpm --filter`**
- **Found during:** Task 1 (initial RED run)
- **Issue:** The plan's `<verify>` block uses `pnpm --filter @evf/g2-app test --run -- src/...`. The package script already includes `--run` (`vitest --run --project g2-app --root ../..`); pnpm passes `--run` twice and vitest's CAC parser throws `Error: Expected a single value for option "--run", received [true, true]`.
- **Fix:** Switched to direct `pnpm vitest --run --project g2-app <file>` invocation locally for the RED → GREEN cycles. The full-suite verification (`pnpm test`) — which is the load-bearing CI gate — works fine and is what the plan's `<verification>` block ultimately requires.
- **Files modified:** None (workflow-only adjustment; package scripts untouched).
- **Impact:** Plan text inconsistency, not a code bug. Documented for future executors.

**2. [Rule 2 — Missing critical functionality] IdleInfillLayer would not honour the boot-time override**
- **Found during:** Task 2 (implementing step 9b)
- **Issue:** The plan's action block specifies "APPEND immediately after (preserving the existing 5 lines verbatim)" — but the existing line 244 constructs IdleInfillLayer with `verdict === 'glyph' ? 'glyph' : 'raster'`. Appending the override BELOW does mutate `layerManager.mapMode` and `rasterController.bleVerdict`, but the IdleInfillLayer's `mode` constructor arg is still the BARE BLE verdict — so a persisted `'glyph'` override correctly flips the in-memory state but the IdleInfillLayer still renders in raster on the first frame. The plan's SR-11 assertion checks `getMapMode()` and `getBleVerdict()` but NOT the actual rendered layer composition, so this would have passed tests while shipping a real-world bug.
- **Fix:** Introduced `effectiveVerdict` after step 9b — a local computed from `persistedMode ?? verdict`. The IdleInfillLayer constructor at step 10 now reads `effectiveVerdict === 'glyph' ? 'glyph' : 'raster'`. No new abstraction; just one new local that captures the override semantics correctly.
- **Files modified:** `packages/g2-app/src/internal/boot-engine-core.ts` (one extra block + one constructor-arg substitution).
- **Verification:** All 14 SR tests + 14 MMT tests + full workspace 669 tests pass.
- **Committed in:** `0264b6a` (Task 2 commit).
- **Impact:** Plan's behavioural intent is fulfilled correctly. Rule 2 applies because the override propagating into the initial layer composition IS a correctness requirement of the MAP-05 software-side success criterion ("hot-swaps raster ↔ glyph at runtime without re-handshake" implicitly requires the boot read-back to propagate to actual rendering, not just in-memory state).

**Total deviations:** 1 doc inconsistency (workflow-only) + 1 Rule 2 correctness gap (fixed inline).
**Impact on plan:** Plan behaviour spec honoured 1:1; the IdleInfillLayer correctness gap was caught at execution time before any visible-bug commit.

## Pitfall 7 Disposition

**Documented as known limitation; Phase 6 will revisit.**

`toggleMapMode('auto')` clears the persisted override but does NOT re-run `probeBleThroughput`. The `RasterController.bleVerdict` retains whatever value the prior `'raster'` / `'glyph'` toggle left it in. Phase 6 Quick Action `[M] Map ctrl` MAY add a synchronous re-probe at toggle time if user feedback demands it; the `originalBleVerdict` closure variable in `boot-engine-core.ts` step 9b is retained specifically to enable this future wiring without a fresh BLE probe (a fresh probe at toggle time could yield a different verdict on noisy BLE conditions — using the boot-time captured verdict is a deterministic restore).

This limitation is documented:
- In `map-mode-toggle.ts` JSDoc (module header + `toggleMapMode` body comment near the `'auto'` branch).
- In `boot-engine-core.ts` step 9b comment block + `TODO(ADR-0009)` line.
- In this SUMMARY.

## SR-1..SR-10 Regression Check

The smoke test extension (SR-11/12/13) was additive — SR-1..SR-10 + the SR-4 capture-invariant expansion test (in the second `describe` block) are preserved verbatim. Full run: 14/14 pass in `scene-renderer-smoke.test.ts`. The `makeMockBridge` signature change is backward-compatible (new options parameter defaults to `{}`); existing `bootWithMocks()` callsites without bridge-options work unchanged.

## Phase 6 Follow-up Note (Pitfall 7 / TODO carry-forward)

```
// TODO(ADR-0009): Phase 6 Quick Action [M] — surface `originalBleVerdict`
// through BootEngineHandle so `toggleMapMode('auto')` can restore the BLE
// verdict without re-probing (Pitfall 7).
```

Exactly 1 TODO ref in `boot-engine-core.ts` (Phase 4b Plan 02 addition); other TODOs in the file are pre-existing.

## Hardware-Pending Items

MAP-05's full success criterion includes "setting `view.map.mode` persists device-local across reboots". Phase 4b Plan 02 verifies this software-side via:

- `MMT-TG-01..03` (persistence write path: `setLocalStorage` called with `'view.map.mode'` and the correct value).
- `MMT-LP-01..03` (boot read path: `getLocalStorage('view.map.mode')` returns whitelist values that drive the override).
- `SR-11..13` (end-to-end boot-engine integration: persisted value drives the initial render branch).

**Hardware-side persistence round-trip across real device reboots is gated by the existing Phase 0/4a `human_needed` checkpoint** (ADR-0005 GO/NO-GO + Phase 4a Plan 05 hardware checkpoint). Plan 02 introduces NO new hardware SC. Phase 6 Quick Action [M] integration test will run the same hardware checkpoint with the additional dimension of the user-triggered toggle path.

## MAP-05 Status After Plan 02

| Sub-requirement | Software-side status (Plan 02) | Hardware-side status |
| --------------- | ------------------------------ | -------------------- |
| Overlay portion (z=2 mount + composition rules) | ✅ Plan 01 (Wave 0) closes | n/a (composition is software contract) |
| Toggle primitive (`toggleMapMode(newMode)`) | ✅ Plan 02 closes — 14 unit tests green | n/a |
| Persistence (`view.map.mode` kv write) | ✅ Plan 02 closes — best-effort + failure-mode tested | ⏳ hardware reboot round-trip gated on Phase 4a `human_needed` |
| Boot read-back override | ✅ Plan 02 closes — step 9b + SR-11/12/13 green | ⏳ same gate as above |
| Quick Action `[M]` gesture wiring | n/a (Phase 6 scope) | n/a |
| Re-probe on `toggleMapMode('auto')` (Pitfall 7) | 🔶 deferred (TODO + closure carry-forward); Phase 6 may extend | n/a |

## Next Phase Readiness

Phase 6 Quick Action `[M] Map ctrl` can now:
- Import `toggleMapMode` directly from `@evf/g2-app/engine/map-mode-toggle.js` (or equivalent internal path).
- Call `toggleMapMode(bridge, handle.layerManager, handle.rasterController, newMode)` from the tap handler — no additional wiring.
- Optionally implement the Pitfall 7 re-probe restoration by extending `BootEngineHandle` to surface `originalBleVerdict` (the `TODO(ADR-0009)` anchor is already in place).

Plan 04b-03 (toast queue Wave 2): no dependency on Plan 02 deliverables — different layer slot (z=1.5), different surface area. Plan 02 can ship independently into the Wave 1 commit boundary.

## Self-Check: PASSED

Files claimed:
- `[FOUND]` packages/g2-app/src/engine/map-mode-toggle.ts
- `[FOUND]` packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts
- `[FOUND]` packages/g2-app/src/internal/boot-engine-core.ts (modified)
- `[FOUND]` packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts (modified)

Commits claimed:
- `[FOUND]` 18a9d8b (Task 1)
- `[FOUND]` 0264b6a (Task 2)

Verification commands run:
- `pnpm typecheck` — exit 0 (workspace-wide)
- `pnpm lint:ci` — exit 0 (no errors; 137 pre-existing warnings unchanged)
- `pnpm test` — 669/669 pass (workspace +17 from Plan 01 baseline 652)
- Grep gates:
  - `STORAGE_KEY = 'view.map.mode'` in map-mode-toggle.ts: 1 (expected)
  - `export async function loadPersistedMapMode` in map-mode-toggle.ts: 1 (expected)
  - `export async function toggleMapMode` in map-mode-toggle.ts: 1 (expected)
  - `console.warn` in map-mode-toggle.ts: 6 (≥1 expected for failure-mode paths)
  - `MMT-(LP|TG)-0[0-9]` markers in map-mode-toggle.test.ts: 23 (14 markers + comment refs — ≥14 expected)
  - `loadPersistedMapMode` in boot-engine-core.ts: 4 (≥1 expected — import + comment refs + call site)
  - `view.map.mode` in boot-engine-core.ts: 1 (JSDoc reference)
  - `persistedMode === 'raster' || persistedMode === 'glyph'` in boot-engine-core.ts: 2 (the override branch + the effectiveVerdict ternary)
  - `SR-1[123]` markers in scene-renderer-smoke.test.ts: 9 (`it()` titles + section comments — ≥3 expected)

---
*Phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui*
*Plan: 02*
*Completed: 2026-05-15*
