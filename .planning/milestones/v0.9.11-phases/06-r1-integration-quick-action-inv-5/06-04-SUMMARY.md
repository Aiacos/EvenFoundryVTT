---
phase: 06-r1-integration-quick-action-inv-5
plan: "04"
subsystem: g2-app/boot-engine + gesture-bus + overlay-reachability
tags: [nav-03-closure, inv-5, quick-action, phase6-closure, boot-engine, r1-wiring, locale-events]
dependency_graph:
  requires:
    - 06-01 (r1-event-source + r1-timings)
    - 06-02 (quick-action-menu-panel + panel-gesture-bus)
    - 06-03 (renderContextChip + getR1Hints)
    - 04b-05 (conc-conflict-dispatcher)
  provides:
    - NAV-03 closed (15-case cross-overlay reachability harness COR-01..COR-15)
    - INV-5 architectural verification (PGB-SR-01..05 single-receiver invariant)
    - Phase 6 boot integration (R1 wiring + long-press dispatcher + conc-conflict)
  affects:
    - packages/g2-app/src/internal/boot-engine-core.ts (extended with 3 new dispatchers)
    - packages/g2-app/src/__tests__/ (3 new test files)
tech_stack:
  added: []
  patterns:
    - vi.mock hoisting for dispatcher spy interception (BERW tests)
    - Factory closure pattern (makeMenu captures boot-time bridge/bus/locale references)
    - LocaleEventEmitter singleton per boot cycle (size() = 0 at boot, rises with panel mount)
key_files:
  created:
    - packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts
    - packages/g2-app/src/__tests__/boot-engine-r1-wiring.test.ts
    - packages/g2-app/src/panels/quick-action-long-press-dispatcher.ts
    - packages/g2-app/src/panels/__tests__/quick-action-long-press-dispatcher.test.ts
  modified:
    - packages/g2-app/src/engine/__tests__/panel-gesture-bus.test.ts (PGB-SR-01..05 added)
    - packages/g2-app/src/internal/boot-engine-core.ts (steps 11b/11c/11d + localeEvents)
decisions:
  - "Dispatcher (attachQuickActionLongPress) is router-level, not a panel — persistent bus subscription; panels subscribe on onMount only (INV-5 semantic distinction documented in JSDoc)"
  - "makeMenu factory pattern: closes over boot-time bridge/bus/locale so QuickActionMenuPanel gets fresh state on every pushOverlay without the dispatcher owning construction"
  - "Behavioral BERW tests preferred over vi.mock-only: BERW-01/02/05 use vi.mock for call-count precision; BERW-04/07/08 use behavioral assertions (same lm reference, localeEvents.emit fan-out)"
  - "LocaleEventEmitter exposed on BootEngineHandle — enables external test/consumer assertions on locale fan-out without internal closure introspection"
  - "PanelRouter instantiated inside boot-engine-core.ts (new PanelRouter() + discoverPanels()) — closes Phase 5 panel-router boot wiring gap"
metrics:
  duration: "~76 minutes (continued from prior session + context compaction)"
  completed: "2026-05-16"
  tasks_completed: 3
  files_changed: 6
---

# Phase 6 Plan 04: Wave 3 — Overlay Reachability + Bus Invariants + Boot Wiring Summary

**One-liner:** COR-01..15 reachability harness (NAV-03), PGB-SR single-receiver invariant, and boot-engine wired with R1 event source + long-press dispatcher + conc-conflict handler (Phase 6 software closure).

## What Was Built

### Task 1: PGB-SR invariant tests + Quick Action long-press dispatcher

Extended `panel-gesture-bus.test.ts` with 5 `PGB-SR-*` tests verifying:
- PGB-SR-01: zero-handler silent drop at bus level (INV-5 no-op is r1-event-source's responsibility)
- PGB-SR-02: 100 gestures in order with exactly 1 subscriber, `bus.size() === 1` throughout
- PGB-SR-03: subscribe/unsubscribe round-trip, size cycles 0→1→0, idempotent
- PGB-SR-04: rapid re-entrancy (subscribe/unsub/subscribe) — no lost or duplicated subscriptions
- PGB-SR-05: transient `size() === 0` window between panel unmount and next mount (PRT-BUS-01/02)

Created `quick-action-long-press-dispatcher.ts` — router-level persistent bus subscriber:
- Fires `pushOverlay(makeMenu(), lm)` on `long-press` from any non-menu top layer
- Short-circuits when `top.id === 'quick-action-menu'` (avoids nested menu recursion)
- Emits `console.warn` telemetry when `top.id === 'conc-drop-modal'` (ck-13 edge, T-06-04-04)
- Returns idempotent unsubscribe closure for `BootEngineHandle.teardown()`

Created 6 `QALPD-*` unit tests verifying all dispatcher behaviors.

**Commit:** `8a9c16f` — `feat(06-04): panel-gesture-bus single-receiver invariant tests + Quick Action long-press dispatcher`

### Task 2: 15-case cross-overlay reachability harness (COR-01..COR-15)

Created `06-cross-overlay-reachability.test.ts` — 15 integration tests mapping 1:1 to Specs §7.14.4 ck 1-15:

| COR | ck | Description |
|-----|----|-------------|
| COR-01 | ck 1 | main HUD → CharacterSheet (long-press → [S]) |
| COR-02 | ck 2 | main HUD → CombatTracker (long-press → [C]) |
| COR-03 | ck 3 | main HUD → Log (long-press → [L]) |
| COR-04 | ck 4 | main HUD → Spellbook (long-press → [B]) |
| COR-05 | ck 5 | main HUD → Inventory (long-press → [I]) |
| COR-06 | ck 6 | CharacterSheet → CombatTracker (2-gesture transitive) |
| COR-07 | ck 7 | CharacterSheet → Quick Action menu (long-press) |
| COR-08 | ck 8 | Quick Action menu → CharacterSheet via [S] |
| COR-09 | ck 9 | menu → [X] Close → main HUD restored (no z=2) |
| COR-10 | ck 10 | CharSheet suspended → [X] Close → CharSheet restored |
| COR-11 | ck 11 | Toast z=1.5 survives menu open (ADR-0009 Amendment 1 Rule 2) |
| COR-12 | ck 12 | Toast survives panel-to-panel via menu |
| COR-13 | ck 13 | conc-modal → long-press → console.warn + menu replaces modal |
| COR-14 | ck 14 | INV-1 ASCII fixture round-trip: Quick Action menu (it locale) |
| COR-15 | ck 15 | renderContextChip updates on every layer-mount/unmount transition |

Harness uses real LayerManager, PanelGestureBus, LocaleEventEmitter, StatusHudRenderer, ToastQueueLayer, and TestablePanelRouter with 5 production panels.

**Commit:** `c3114b9` — `test(06-04): 06-cross-overlay-reachability COR-01..COR-15 harness`

### Task 3: Boot-engine R1 + Quick Action long-press wiring + Phase 6 closure

Extended `boot-engine-core.ts` with steps 11b/11c/11d:
- **Step 11b:** `PanelGestureBus` singleton + `attachR1EventSource(ws, bus, lm, DEFAULT_R1_TIMINGS)`
- **Step 11c:** `LocaleEventEmitter` singleton + `PanelRouter` + `makeMenu` factory + `attachQuickActionLongPress(bus, router, lm, makeMenu)`
- **Step 11d:** `attachConcConflictHandler(ws, bridge, bus, lm, effectiveLocale)` — closes Plan 04b-05 deferred wire
- Expose `localeEvents: LocaleEventEmitter` on `BootEngineHandle`
- Extend `teardown()` with 3 new unsubscribe closures (reverse attach order)

Created `boot-engine-r1-wiring.test.ts` with 8 `BERW-*` tests:
- BERW-01/02: `attachR1EventSource` and `attachQuickActionLongPress` called once (vi.mock spy)
- BERW-03: `handle.localeEvents` is `LocaleEventEmitter` with `size() === 0` after boot
- BERW-04: `attachConcConflictHandler` wired; locale arg matches `effectiveLocale` (override)
- BERW-05: teardown calls all 3 unsubscribe closures exactly once
- BERW-06: locale override "de" → `makeMenu` factory produces panel with `locale: "de"`
- BERW-07: `localeEvents.emit('changed', 'fr')` fans out to subscribed listener
- BERW-08: `attachR1EventSource` receives same `LayerManager` reference as `handle.layerManager` (post-caps ordering)

**Commit:** `e8c80a1` — `feat(06-04): boot-engine wires R1 event source + Quick Action long-press + conc-conflict dispatcher`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `flushMicrotasks` infinite recursion in COR test file**
- **Found during:** Task 2 — running COR tests after file creation
- **Issue:** A `replace_all` operation in the previous session replaced ALL occurrences of `await Promise.resolve()` in the file with `await flushMicrotasks()`, including the one inside the function body itself, causing a `RangeError: Maximum call stack size exceeded`
- **Fix:** Edit to restore `await Promise.resolve()` inside the loop body
- **Files modified:** `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts`
- **Commit:** Part of c3114b9

**2. [Rule 2 - Missing critical functionality] TypeScript errors in COR test file**
- **Found during:** Task 3 typecheck run
- **Issue:** `Parameters<typeof ConcentrationDropModalPanel>[1]` used as a constraint in `as unknown as X` cast — TypeScript rejected it (TS2344 + TS7006 implicit any)
- **Fix:** Changed cast to `as never` and added explicit type annotations on `.map` callbacks
- **Files modified:** `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts`
- **Commit:** Part of e8c80a1

**3. [Rule 2 - Missing critical functionality] `CharacterSnapshot` unused import removed**
- **Found during:** Task 2 lint run after removing `BASE_CHARACTER_SNAPSHOT`
- **Issue:** `BASE_CHARACTER_SNAPSHOT` constant was declared but never used in any test body (all tests use the harness's inline snapshot); `CharacterSnapshot` import was therefore unused
- **Fix:** Removed `BASE_CHARACTER_SNAPSHOT` and the `type CharacterSnapshot` import
- **Files modified:** `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts`
- **Commit:** Part of c3114b9

## Hardware-Pending SC Carry-Forward

These hardware-bound success criteria remain open — software implementation is complete:

| SC ID | Description | Phase(s) |
|-------|-------------|----------|
| SC-06-01 | R1 timing constants validated against real R1 ring (longPressMs = 500ms) | Plan 06-01 |
| SC-06-02 | Long-press feels right (no false-triggers) on real R1 hardware | Plans 06-01, 06-04 |
| SC-06-03 | Menu-open latency p50 ≤ 200 ms on real G2 + R1 | Plans 06-02, 06-04 |

**Total project hardware-pending after Phase 6: 18**
(4a: 5 + 4b: 5 + 5: 5 + 6: 3 — matches CONTEXT.md §Area 3)

## Phase 6 Closure Signal

All 3 REQ-IDs software-closed:
- **NAV-01** — Panel navigation via Quick Action menu: Specs §7.14 panels reachable in ≤2 R1 gestures ✅ (Plan 06-02 + COR-01..05)
- **NAV-02** — INV-5 Gesture Determinism enforced: every R1 gesture maps to exactly one panel handler call ✅ (Plan 06-01 ratified, Plan 06-03 INV-5 chip, Plan 06-04 PGB-SR invariant)
- **NAV-03** — Cross-overlay reachability: all 15 Specs §7.14.4 ck items verified ✅ (COR-01..15 this plan)

## Self-Check

- [x] `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts` FOUND (850 lines, 15 COR-* tests)
- [x] COR-01..COR-15 (15 tests) confirmed via test run: `Tests 15 passed (15)`
- [x] `packages/g2-app/src/panels/quick-action-long-press-dispatcher.ts` FOUND
- [x] `packages/g2-app/src/internal/boot-engine-core.ts` contains:
  - `attachR1EventSource` (3 occurrences)
  - `attachQuickActionLongPress` (3 occurrences)
  - `attachConcConflictHandler` (3 occurrences)
  - `LocaleEventEmitter` (5 occurrences)
- [x] 3 task commits in git log: `8a9c16f`, `c3114b9`, `e8c80a1`
- [x] Hardware-pending carry-forward: SC-06-01/02/03 documented above
- [x] Phase 6 closure: NAV-01/02/03 all software-closed
- [x] `pnpm test` workspace-wide: **1309 passed** (82 test files)
- [x] `pnpm typecheck`: exit 0
- [x] `biome ci`: no errors (137 pre-existing warnings, unchanged)

## Self-Check: PASSED
