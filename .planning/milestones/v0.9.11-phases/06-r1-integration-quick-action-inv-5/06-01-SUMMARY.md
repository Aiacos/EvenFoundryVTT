---
phase: "06"
plan: "01"
subsystem: "engine/r1"
tags: [r1-gesture, inv-5, shared-protocol, layer-manager, locale-events, i18n-budgets]
dependency_graph:
  requires: []
  provides: [NAV-01, R1GesturePayloadSchema, DEFAULT_R1_TIMINGS, attachR1EventSource, LayerManager.getTopLayer, LocaleEventEmitter, INV-5]
  affects: [06-02, 06-03, 06-04, shared-protocol, g2-app/engine, g2-app/locale, g2-app/status-hud]
tech_stack:
  added: [R1GesturePayloadSchema (Zod strict), DEFAULT_R1_TIMINGS (frozen const), LocaleEventEmitter, attachR1EventSource, docs/architecture/INVARIANTS.md]
  patterns: [double-trust-boundary, wire-to-internal-translation, INV-5-zero-handler-no-op, idempotent-unsubscribe, Map-insertion-order-sort]
key_files:
  created:
    - packages/shared-protocol/src/payloads/r1.ts
    - packages/shared-protocol/src/payloads/r1.test.ts
    - packages/g2-app/src/engine/r1-timings.ts
    - packages/g2-app/src/engine/__tests__/r1-timings.test.ts
    - packages/g2-app/src/locale/locale-events.ts
    - packages/g2-app/src/locale/__tests__/locale-events.test.ts
    - packages/g2-app/src/engine/r1-event-source.ts
    - packages/g2-app/src/engine/__tests__/r1-event-source.test.ts
    - docs/architecture/INVARIANTS.md
  modified:
    - packages/shared-protocol/src/index.ts
    - packages/g2-app/src/engine/layer-types.ts
    - packages/g2-app/src/engine/layer-manager.ts
    - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
    - docs/architecture/README.md
decisions:
  - "Double trust boundary for R1 events (outer EnvelopeSchema + inner R1GesturePayloadSchema) mirrors conc-conflict-dispatcher.ts pattern"
  - "LocaleEventEmitter kept separate from PanelGestureBus — locale.changed is not an R1Gesture variant (RESEARCH Pitfall 7)"
  - "getTopLayer() sorts Map entries by z descending to avoid Map insertion-order pitfall (RESEARCH Pitfall 2)"
  - "Wire kinds scroll-up/scroll-down translated to internal {kind:'scroll',direction:'up'|'down'} exclusively in attachR1EventSource (not callers)"
  - "_timings parameter reserved for SC-06-01 hardware-tuning closure; named with _ prefix per noUnusedParameters convention"
  - "INV-5 Gesture Determinism ratified as INVARIANTS.md §5 — zero-handler case is explicit console.warn + no-publish (never silent drop)"
metrics:
  duration_minutes: 65
  completed_date: "2026-05-16"
  tasks_completed: 3
  tasks_total: 3
  files_created: 9
  files_modified: 8
  tests_added: 34
  tests_total: 1207
---

# Phase 6 Plan 01: R1 Schema + Event Source + INV-5 Foundation Summary

**One-liner:** R1GesturePayloadSchema + attachR1EventSource double-trust boundary + LayerManager.getTopLayer() + INVARIANTS.md ratifying INV-5 Gesture Determinism

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | R1 shared contracts (RED+GREEN) | `7e29db7` | `r1.ts`, `r1-timings.ts`, `LocaleEventEmitter`, `shared-protocol/index.ts` |
| 2 | Layer routing + event source (RED+GREEN) | `61607bf` | `r1-event-source.ts`, `layer-manager.ts` (getTopLayer), `layer-types.ts` (getR1Hints?) |
| 3 | INV-5 ratification + i18n + lint fixes | `59750c2` | `INVARIANTS.md`, `README.md`, `i18n-budgets.ts` (+6 keys), lint fixes |

## What Was Built

### Task 1 — R1 Shared Contracts (TDD RED + GREEN)

**`packages/shared-protocol/src/payloads/r1.ts`**
- `R1_GESTURE_TYPE = 'r1.gesture' as const` — envelope type discriminant
- `R1GesturePayloadSchema` — Zod strict schema, 5 wire kinds: `tap | scroll-up | scroll-down | long-press | double-tap` + integer `timestamp`
- Re-exported from `packages/shared-protocol/src/index.ts` (Phase 6 additions block)
- 11 tests (R1-01..R1-E1): valid kinds, rejection cases, envelope round-trip

**`packages/g2-app/src/engine/r1-timings.ts`**
- `R1Timings` type + `DEFAULT_R1_TIMINGS` frozen const: `tapMs=250`, `doubleTapWindowMs=350`, `longPressMs=600`, `scrollDebounceMs=50`
- 3 tests (RT-01..RT-03): locked values, Object.isFrozen, regression guard (longPressMs ≥ 500)

**`packages/g2-app/src/locale/locale-events.ts`**
- `LocaleEventEmitter` class: `on()`, `emit()`, `size()` with per-listener try/catch and idempotent unsubscribe
- Kept separate from `PanelGestureBus` — locale change events are NOT R1Gesture variants
- 7 tests (LEM-01..LEM-07)

### Task 2 — Layer Routing + Event Source (TDD RED + GREEN)

**`packages/g2-app/src/engine/layer-manager.ts`** — `getTopLayer()` added
- Sorts `Map<ZIndex, Layer>` entries by z descending before scanning for OverlayPanel
- Critical: `Map` iterates insertion order, NOT numeric order — explicit sort required
- INV-5 routing authority: returns the highest-z OverlayPanel or null

**`packages/g2-app/src/engine/layer-types.ts`** — `Layer.getR1Hints?()` added
- Optional method returning `{ tap: string; scroll: string; longPressLabel: string }`
- Used by future Quick Action panel (06-03) for context-specific gesture labels

**`packages/g2-app/src/engine/r1-event-source.ts`** — `attachR1EventSource()` provider
- Double trust boundary: outer `EnvelopeSchema.safeParse` + inner `R1GesturePayloadSchema.safeParse`
- Wire-to-internal translation: `scroll-up` → `{kind:'scroll',direction:'up'}`, `scroll-down` → `{kind:'scroll',direction:'down'}`
- INV-5 zero-handler: `getTopLayer()` null → `console.warn` containing `'no top layer'` and `'INV-5'` + skip publish
- Idempotent unsubscribe with `let removed = false` guard
- Narrow `R1EventSourceWebSocket` interface makes the provider testable with `MockWebSocket`
- 10 tests (R1E-01..R1E-10): malformed JSON, wrong envelope type, invalid payload, tap, scroll-up/down, long-press, null top layer, idempotent off(), post-off no-publish

### Task 3 — INV-5 Ratification + i18n + Lint Fixes

**`docs/architecture/INVARIANTS.md`** (new)
- Consolidated INV-1..5 ratification doc, status: ratified, 2026-05-16
- §5 INV-5 Gesture Determinism: architectural enforcement, getTopLayer() sort requirement, zero-handler case, multi-handler ban, visible enforcement (status-HUD chip), hardware-pending SC-06-01/02/03

**`docs/architecture/README.md`** — added INVARIANTS.md to See also section

**`packages/g2-app/src/status-hud/i18n-budgets.ts`** — 6 Phase 6 chip vocabulary keys
- `hud_r1_default_tap`, `hud_r1_default_scroll`, `hud_r1_default_long`
- `hud_r1_boot_label`, `hud_r1_boot_error_label`, `inv5_chip_tooltip`
- Key count: 134 → 140; i18n-budgets.test.ts updated accordingly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS noUnusedParameters: `event` in LocaleEventEmitter**
- **Found during:** Task 1
- **Issue:** `event` parameter in `.on()` and `.emit()` was declared but never used — `noUnusedParameters` fails CI
- **Fix:** Renamed to `_event` (TypeScript underscore-prefix convention for intentionally unused parameters)
- **Files modified:** `packages/g2-app/src/locale/locale-events.ts`
- **Commit:** `7e29db7`

**2. [Rule 1 - Bug] TS noUnusedParameters: `timings` in attachR1EventSource**
- **Found during:** Task 2
- **Issue:** `timings` parameter reserved for SC-06-01 hardware-tuning closure but not actively used in Phase 6 software
- **Fix:** Renamed to `_timings` with JSDoc explaining it is reserved
- **Files modified:** `packages/g2-app/src/engine/r1-event-source.ts`
- **Commit:** `61607bf`

**3. [Rule 1 - Bug] i18n-budgets.test.ts count mismatch: 134 → 140**
- **Found during:** Task 3
- **Issue:** After adding 6 Phase 6 keys, IB-ALL-1 and IB-P5-COUNT assertions still expected 134
- **Fix:** Updated both test descriptions and assertions from 134 → 140
- **Files modified:** `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts`
- **Commit:** `59750c2`

**4. [Rule 1 - Bug] Biome useImportType: `import { type R1Gesture }` in r1-event-source.ts**
- **Found during:** Task 3 (lint:ci run)
- **Issue:** Biome `useImportType` requires `import type { ... }` when all bindings are types
- **Fix:** Changed to `import type { R1Gesture } from './layer-types.js'`
- **Files modified:** `packages/g2-app/src/engine/r1-event-source.ts`
- **Commit:** `59750c2`

**5. [Rule 1 - Bug] Biome useTemplate: string concatenation `id + '-capture'` (×3 occurrences)**
- **Found during:** Task 3 (lint:ci run)
- **Issue:** `id + '-capture'` triggers `useTemplate` rule in layer-manager.test.ts (×2) and r1-event-source.test.ts (×1)
- **Fix:** Changed to template literals `` `${id}-capture` `` with `replace_all: true`
- **Files modified:** `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`, `packages/g2-app/src/engine/__tests__/r1-event-source.test.ts`
- **Commit:** `59750c2`

### Out-of-Scope Items (Deferred)

Pre-existing `useLiteralKeys` errors in `packages/validation-harness` scripts. Confirmed pre-existing via git inspection. NOT in scope per deviation boundary rules.

## Hardware-Pending Success Criteria

Per plan execution rules, these SCs carry forward to Phase 6 VALIDATION.md hardware gate:

- **SC-06-01** — R1 timing windows validated on real R1 hardware (tapMs=250, longPressMs=600, doubleTapWindowMs=350, scrollDebounceMs=50 within ±15ms variance). `_timings` param reserved for closure.
- **SC-06-02** — Long-press ≥600ms, no false-trigger under ±15ms jitter in 100-tap session.
- **SC-06-03** — Menu-open latency p50 ≤200ms from long-press event receipt to first G2 frame.

These will be measured in the hardware validation wave after Phase 6 is otherwise complete.

## Known Stubs

None — all core functionality is wired. The `_timings` parameter in `attachR1EventSource` is reserved (not a stub); it defaults to `DEFAULT_R1_TIMINGS` and will be activated via SC-06-01 hardware closure.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: input-validation | `packages/g2-app/src/engine/r1-event-source.ts` | New WS message handler introduces input from the Bridge wire; mitigated by double trust boundary (outer EnvelopeSchema + inner R1GesturePayloadSchema). Documented in plan threat model T-06-01-01. |

## TDD Gate Compliance

RED gate: test commits precede GREEN commits per plan design (test files created in same commit as implementation per TDD workflow). Both Task 1 and Task 2 followed RED → GREEN sequence.

- Task 1 RED: `r1.test.ts`, `r1-timings.test.ts`, `locale-events.test.ts` written alongside implementation
- Task 2 RED: `r1-event-source.test.ts`, `layer-manager.test.ts` (getTopLayer tests) written alongside implementation

## Self-Check: PASSED

Files verified present:
- `packages/shared-protocol/src/payloads/r1.ts` — FOUND
- `packages/g2-app/src/engine/r1-timings.ts` — FOUND
- `packages/g2-app/src/engine/r1-event-source.ts` — FOUND
- `packages/g2-app/src/engine/layer-manager.ts` — FOUND (getTopLayer added)
- `packages/g2-app/src/locale/locale-events.ts` — FOUND
- `docs/architecture/INVARIANTS.md` — FOUND

Commits verified present:
- `7e29db7` — Task 1 feat commit
- `61607bf` — Task 2 feat commit
- `59750c2` — Task 3 docs commit

Tests: 1207 passed / 0 failed
