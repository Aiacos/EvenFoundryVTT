---
phase: 04a
plan: 05
subsystem: g2-app
tags: [g2-app, boot-engine, integration, smoke-test, w-4, option-b, adr-0009, wave-3]
---

# Phase 4a Plan 05 — Boot Orchestrator + Threats + Integration

> Wave 3 — final integration wave. Wires Wave 0-2 deliverables into the
> production `bootEngine` entry point and locks ADR-0009 as ACCEPTED. Task 1 +
> Task 2 completed software-side; Task 3 (human-verify checkpoint) remains open.

## Tasks Executed

### Task 1 — Boot orchestrator + Option B test-only DI (W-4 / NF-2 closure)

Commit `e862d40`.

Delivered the production boot wiring as a two-file split per Option B (locked
in `04A-PLAN-CHECK.md` §NF-2):

- **`packages/g2-app/src/internal/boot-engine-core.ts`** (309 lines) — the
  14-step boot sequence body. Contains the only references to `wsFactory` /
  `bridgeFactory` substrings in the package. Steps in order:
  1. `installHubPolyfill()` — Phase 2 wizard backward-compat shim (idempotent).
  2. `await (deps?.bridgeFactory ?? waitForEvenAppBridge)()` — bridge handle.
  3. `await createBootPage(bridge)` — canonical 11-container schema.
  4. `await showBootSplash(bridge, …)` — 5-step splash + protocol line.
  5. `wsCtor(opts.bridgeUrl)` + `awaitWsOpen(ws)` — WS open.
  6. `await performCapabilityHandshake(ws, token, locale)` — negotiated caps.
  7. `new LayerManager(bridge)` + `setNegotiatedCaps(...)`.
  8. `new RasterController(bridge)`.
  9. BLE probe → `controller.setBleVerdict` + `lm.setMapMode` per CONTEXT.md §Area 4.
  10. Three layers: `MapBaseLayer` (z=0) + `IdleInfillLayer` (z=0.5) + `StatusHudLayer` (z=1).
  11. `attachSceneInputToWs(ws, rasterController)` — Plan 06 WS receiver wiring.
  12. `await lm.bundle([mount z=0, mount z=0.5, mount z=1])` — atomic single-flush
      per ADR-0001 Amendment 1 / CONTEXT.md §Area 1.
  13. `await mapBase.draw()` — first frame.
  14. Return `{ layerManager, rasterController, teardown }` handle.

- **`packages/g2-app/src/index.test-support.ts`** (70 lines) — `@internal`-tagged
  `TestingDependencies` re-export + `bootEngineForTest(opts, deps?)` wrapper.
  NOT re-exported from the package main entry (no `exports` subpath in
  `package.json`). The only legal access route is relative import from inside
  this package's own test tree.

- **`packages/g2-app/src/index.ts`** (83 lines) — thin production wrapper.
  `bootEngine(opts)` calls `_bootEngineCore(opts, undefined)` and has zero
  `wsFactory` / `bridgeFactory` substring matches. The W-4 grep gate
  (`! grep -E "wsFactory|bridgeFactory" packages/g2-app/src/index.ts`) is
  structurally satisfied by construction.

- **`packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts`** (427 lines,
  11 tests) — SR-1..SR-10 end-to-end smoke tests + a capture-invariant
  expansion test. Boots the full engine against happy-dom + mock
  `EvenAppBridge` + `MockSocket` + `MockWorker` (Plan 01 helper). SR-9 verifies
  Plan 06 wiring: a `frame_pixels` envelope received by the WS dispatches to
  `RasterController.requestFrame()` (asserted via the mocked worker's
  recorded `postMessage` calls).

#### Recovery note (atypical authoring path)

The initial executor agent for this task hit the org monthly usage limit
mid-run, leaving 5 files uncommitted in a locked worktree. The work was
recovered by copying the files to the main tree and inline-fixing a single
timing bug in the test helper before commit:

**The bug.** `bootWithMocks` issued 2 `await Promise.resolve()` microtask
yields before firing the synthetic `open` event. The pre-open boot path
contains roughly eight sequential `await` points (bridgeFactory +
createBootPage + 6 textContainerUpgrade calls inside `showBootSplash`), so the
boot coroutine had not yet reached `awaitWsOpen` when the event fired — the
event was lost and the await hung. Replaced the 2-yield pattern with a
`flushMicrotasks` loop of 32 yields, applied symmetrically around `fireOpen`
and `fireMessage`. Result: 11/11 smoke tests pass, 606/606 workspace tests
pass, typecheck + lint clean.

### Task 2 — ADR-0009 ACCEPTED + README index + ROADMAP reconciliation

Commit `54577c6`.

- **`docs/architecture/0009-layer-manager-contract.md`** — frontmatter
  `status: accepted` + `last_amended: 2026-05-15`. Status section transitioned
  `PROPOSED` → `ACCEPTED — 2026-05-15. Binds Phase 4a (G2 Engine + Raster + Status HUD), Phase 4b (Overlay Slot + Map Mode Toggle), and Phase 5 (Panel Plugin System).`
  Confirmation section cites the four artifact-bearing test files (Plan 02
  `layer-manager.test.ts`, Plan 05 `scene-renderer-smoke.test.ts`, Plan 04 9
  INV-1 fixtures, Plan 06 `canvas-extractor.test.ts` + `scene-input.test.ts`).
  New PROVISIONAL Hardware Gates section lists the 5 SC inheriting
  `human_needed` from ADR-0005 Branch A. Amendment 1 placeholder reserved.
- **`docs/architecture/README.md`** — ADR-0009 row updated `proposed` →
  `accepted` with provenance pointer to the 6-plan delivery (606/606 tests).
- **`.planning/ROADMAP.md`** — Phase 4a plan count 5 → 6 (Plan 06 added at
  Wave 2); Plans 01..04 + 06 marked `[x]`; Plan 05 listed with Task 1 + Task 2
  complete + Task 3 pending. Progress table row updated `0/5 Not started` →
  `5/6 In Progress (Plan 05 Task 3 human-verify pending)`.

### Task 3 — Human-verify checkpoint (BLOCKED on operator action)

Task 3 is a `checkpoint:human-verify` gate. The 5 hardware-pending SC remain
on `human_needed` per ADR-0005 PROVISIONAL Branch A:

1. Capability handshake on real G2 firmware (DISP-01, DISP-02, NAV-04).
2. Raster ≥5 fps standard / 15 fps stretch with measured BLE p50 latency
   (MAP-02, MAP-04).
3. Branch B/C glyph fallback auto-degrades below the 100 kbps PROVISIONAL
   threshold (MAP-04).
4. INV-1 layout holds character-perfect on the real G2 phosphor display under
   IT / EN / DE (DISP-03, I18N-04).
5. PIXI canvas extract via OffscreenCanvas does NOT block Foundry desktop UI
   (Specs §11.5.7 pitfall 11).

These close only when real-G2 grants land via
`pnpm --filter @evf/validation-harness validate:all`. Phase 4a moves to
`COMPLETE` once the operator either runs that harness or explicitly defers
hardware tests with the `defer-hardware-tests` resume signal.

## Files Created / Modified

| File | Status | Lines |
|------|--------|-------|
| `packages/g2-app/src/index.ts` | modified | +83/-29 (thin wrapper) |
| `packages/g2-app/src/index.test-support.ts` | created | 70 |
| `packages/g2-app/src/internal/boot-engine-core.ts` | created | 309 |
| `packages/g2-app/src/__tests__/example-status-hud.test.ts` | modified | +101/-29 |
| `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` | created | 427 |
| `docs/architecture/0009-layer-manager-contract.md` | modified | +50/-2 (frontmatter + Status section) |
| `docs/architecture/README.md` | modified | +1/-1 (ADR index row) |
| `.planning/ROADMAP.md` | modified | +5/-9 (Phase 4a plans + progress row) |

## Verification

| Gate | Result |
|------|--------|
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm lint:ci` | exit 0 (137 pre-existing warnings unchanged) |
| `pnpm test` | **606 / 606 passed** across 45 test files |
| W-4 grep gate | `! grep -E "wsFactory\|bridgeFactory" packages/g2-app/src/index.ts` exits 0 |
| Task 2 verify (9 greps in PLAN.md) | all positive |

## Requirements Coverage

Plan 05's role is integration, not net-new REQ coverage. Final REQ tally for
the phase (with the contributing plans):

| REQ-ID | Software-side closure | Plans |
|--------|------------------------|-------|
| DISP-01 | machinery + capability gate + smoke (SR-1..SR-6) | 02, 04, 05 |
| DISP-02 | type contract + runtime invariant + multi-layer smoke | 01, 02, 04, 05 |
| DISP-03 | INV-1 ck 11-15 per-ck named tests | 04, 05 |
| MAP-01 | Foundry PIXI extract → WS → controller.requestFrame chain | 06, 05 (SR-9) |
| MAP-02 | raster pipeline (delta + RLE + worker) | 03, 05 |
| MAP-03 | dither + 4-bit PNG encode | 03, 05 |
| MAP-04 | glyph fallback + adaptive frame rate machinery | 03, 05 |
| NAV-04 | boot transition path (page-lifecycle) | 02, 05 |
| I18N-04 | width-budget `satisfies` gate + adversarial typecheck test | 04, 05 |

Hardware-dependent sub-criteria for every row inherit `human_needed` per
ADR-0005 PROVISIONAL Branch A — see ADR-0009 PROVISIONAL Hardware Gates
section for the explicit 5-item list.

## Deviations from Plan

1. **Authoring path** — Task 1 was authored by a subagent that hit the org
   monthly usage limit before its commit step. Files were recovered from the
   locked worktree to the main tree. A single inline timing bug in the test
   helper was fixed before commit (see "Recovery note" above). Net effect:
   identical artifacts to the planned ones, but the planner's atomic
   per-task commit count drops to 1 instead of the planned 4. The commit
   message carries the full bug-fix narrative for traceability.
2. **No worktree merge for Task 1** — because the recovery flow operated
   directly on the main tree, no `chore: merge executor worktree` commit
   exists for Plan 05 (unlike Plans 01-04 + 06). The leftover locked
   worktree was force-removed cleanly (`git worktree remove -f -f`); its
   `biome.jsonc` shadow had to be removed first to clear a `Found a nested
   root configuration` lint failure.
3. **Task 3 deferred** — Task 3 is a `checkpoint:human-verify` gate, not an
   automatable executor task. Listed as `[ ]` in the ROADMAP plan list with
   the explicit gate context.

## Hardware-Pending Items (carry forward)

Five SCs inherit `human_needed` from ADR-0005 PROVISIONAL Branch A. They are
enumerated in `04A-VALIDATION.md` §Manual-Only Verifications and now also in
ADR-0009 §PROVISIONAL Hardware Gates. The validation-harness command that
closes them is `pnpm --filter @evf/validation-harness validate:all`.

## Phase 4a — Wave / Plan Summary

| Wave | Plan | Files | Tests | Status |
|------|------|-------|-------|--------|
| 0 | 01 (scaffold + types) | 8 | n/a | merged 9f0d5ae |
| 1 | 02 (engine modules) | 9 | +27 | merged 1dfc128 |
| 2 | 03 (raster pipeline) | 13 | +34 | merged a84bc7b |
| 2 | 04 (status HUD + fixtures) | 24 | +50 | merged c46d9c8 |
| 2 | 06 (PIXI extractor + scene-input) | 9 | +31 | merged 311dc53 |
| 3 | 05 (boot orchestrator + ADR-0009 + ROADMAP) | 8 | +11 (smoke) | commits e862d40, 54577c6 |

Test count across the phase: **606 / 606 passing** (was 451 at Phase 4a entry;
+155 new tests added across the 6 plans).

## Next Steps

1. **Operator action — Task 3 human-verify checkpoint.** Run
   `pnpm --filter @evf/validation-harness validate:all` against real G2
   hardware OR explicitly accept the 5 hardware-pending SC as `human_needed`
   with the `defer-hardware-tests` resume signal. Phase 4a closes on either
   signal.
2. **Phase 4b unblock.** Once Phase 4a closes, the overlay layer-manager
   contract (ADR-0009) is the entry-point for Phase 4b adversarial UI
   primitives (toast queue, boot error states, death-saves HUD,
   concentration-drop modal).
