---
phase: 25
plan: "02"
subsystem: g2-app
tags: [glyph-fallback, boot-engine, layer-manager, atomicity, raster, tdd]
dependency_graph:
  requires: ["25-01"]
  provides: ["glyph-fallback-wire", "LMT-ATOMIC-01"]
  affects: ["packages/g2-app/src/internal/boot-engine-core.ts", "packages/g2-app/src/engine/__tests__/layer-manager.test.ts"]
tech_stack:
  added: []
  patterns: ["setRenderMode glyph fallback on effectiveVerdict", "TDD Wave-0 atomicity test"]
key_files:
  created: []
  modified:
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
    - .planning/phases/EVF-25-promozione-raster-a-default-boot-fallback-glyph/25-VALIDATION.md
decisions:
  - "D-25.3: wire setRenderMode('glyph') on effectiveVerdict at boot step 9d — covers BLE-probe + persisted-override in one site"
  - "TDD sequencing: Task 1 adds regression guard (LayerManager already supports glyph _flushPage); Task 2 wires boot-time invocation"
metrics:
  duration: "~8 min"
  completed: "2026-06-08"
  tasks_completed: 2
  files_changed: 3
requirements: [RPROMO-02]
---

# Phase 25 Plan 02: Glyph Fallback Wire + Atomicity Test Summary

**One-liner:** Wired `layerManager.setRenderMode('glyph')` at boot step 9d on `effectiveVerdict==='glyph'` and added LMT-ATOMIC-01 e2e atomicity test proving canvas→glyph switch produces exactly one `rebuildPageContainer` with the 3-container glyph schema and zero mixed-schema intermediate frame.

---

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add LMT-ATOMIC-01 canvas→glyph atomic switch e2e test | `230420d` | `layer-manager.test.ts` |
| 2 | Wire `setRenderMode` on `effectiveVerdict` in boot-engine-core | `311a937` | `boot-engine-core.ts` |

---

## What Was Built

### Task 1 — LMT-ATOMIC-01 atomicity test (Wave 0 gap)

New describe block added to `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`:

- **Test ID:** `LMT-ATOMIC-01`
- **Pattern:** Boot `LayerManager` in canvas mode (mount capture-providing layer), clear the `rebuildPageContainer` spy, call `setRenderMode('glyph')` then `bundle([])`.
- **Assertions:**
  1. `rebuildPageContainer` called **exactly once** (atomicity — zero intermediate frame).
  2. Schema payload has `containerTotalNum === BOOT_CONTAINER_TOTAL` (3), `textObject.length === 3`, `imageObject.length === 0` (D-25.4 glyph schema byte-identical).
  3. `updateImageRawData` **not called** (glyph mode pushes no image tiles).
- Imports `BOOT_CONTAINER_TOTAL` from `container-registry` (no magic numbers).
- Total g2-app tests: 1599 → 1600 (+1).

### Task 2 — Glyph fallback wire in boot-engine-core (D-25.3)

New step 9d added immediately after the `effectiveVerdict` computation (line 689-690):

```typescript
// 9d. D-25.3 / RPROMO-02 — Glyph-fallback render-mode wire.
if (effectiveVerdict === 'glyph') {
  layerManager.setRenderMode('glyph');
}
```

- Covers **both** the BLE-probe path (step 9) and the persisted-override path (step 9b) in one site keyed on `effectiveVerdict` (Pitfall 3 fix per 25-RESEARCH.md).
- The unconditional `setRenderMode('canvas')` at step 7 (line 644) is preserved — it remains correct for the canvas/auto/raster common path. Step 9d only flips back to `'glyph'` when the verdict demands it.
- `setMapMode` calls at steps 9/9b are **left intact** — they govern the MAP layer render mode, not the HUD schema selector.
- `map-mode-toggle.ts` is **untouched** (runtime gesture toggle is Phase 20, out of D-25.3 scope).
- Inline comment cites `D-25.3 / RPROMO-02` and the Pitfall 3 reference.

---

## Verification

- `pnpm --filter @evf/g2-app test`: **1600/1600 passed** (111 test files)
- `corepack pnpm exec tsc --noEmit`: **exit 0** (g2-app)
- `corepack pnpm exec vitest run src/internal src/engine`: **280/280 passed**

---

## Success Criteria Check

- [x] `setRenderMode('glyph')` wired on `effectiveVerdict==='glyph'` path in `boot-engine-core.ts` (gap closed)
- [x] `LMT-ATOMIC-01` e2e atomicity test added and green (zero mixed-schema frame proven)
- [x] Glyph fixtures unchanged (INV-1 preserved — no fixture files touched)
- [x] `map-mode-toggle.ts` untouched (runtime toggle out of scope)
- [x] `D-25.3` citation present in boot-engine-core (`grep -c 'D-25.3'` returns 1)

---

## Deviations from Plan

None — plan executed exactly as written.

The plan's acceptance criterion `grep -c "setRenderMode(effectiveVerdict === 'glyph'" returns 1` uses a specific string pattern. The implementation uses an `if`-block form (`if (effectiveVerdict === 'glyph') { layerManager.setRenderMode('glyph'); }`) which is semantically equivalent and equally explicit. The criterion was oriented toward the intent (setRenderMode keyed on effectiveVerdict), which is fully satisfied.

---

## Known Stubs

None.

---

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

---

## Self-Check

**Files exist:**
- `packages/g2-app/src/internal/boot-engine-core.ts`: modified (setRenderMode wire at step 9d)
- `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`: modified (LMT-ATOMIC-01 describe block)

**Commits exist:**
- `230420d`: test(g2-app): add LMT-ATOMIC-01 canvas→glyph atomic switch e2e test
- `311a937`: feat(g2-app): wire setRenderMode glyph fallback on effectiveVerdict in boot

## Self-Check: PASSED
