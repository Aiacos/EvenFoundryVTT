---
phase: 260610-nzl
plan: "01"
subsystem: g2-app/engine
tags: [g2-spec, capture, glyph, container-registry, tdd]
dependency_graph:
  requires: []
  provides: [G2-SPEC-CAPTURE-CONTENT, G2-SPEC-EXACTLY-ONE-CAPTURE]
  affects: [container-registry, buildHudRasterPageSchema, buildStatusViewTextContainers, layer-manager]
tech_stack:
  added: []
  patterns: [per-schema-override, registry-geometry-only]
key_files:
  created: []
  modified:
    - packages/g2-app/src/engine/container-registry.ts
    - packages/g2-app/src/engine/__tests__/container-registry.test.ts
    - packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts
    - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
    - .changeset/fix-g2-spec-capture-content-nzl.md
decisions:
  - "Per-schema override (not registry mutation): buildStatusViewTextContainers sets isEventCapture:1 + content:' ' on status-hud at build time; CONTAINER_REGISTRY stays geometry-only with isEventCapture:0 for status-hud"
  - "layer-manager.test.ts updated as Rule 1 auto-fix: Test 8b + LMT-CF-04 asserted zero captures (old wrong behavior); updated to assert exactly-one (status-hud) matching the new correct spec"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-10"
  tasks_completed: 3
  files_changed: 5
---

# Phase 260610-nzl Plan 01: G2 Spec Compliance — Capture Content Summary

Two G2 hardware-spec compliance fixes in `container-registry.ts`: capture containers now carry `content: ' '` (FIX 1) and the glyph fallback page has exactly one `isEventCapture=1` container (FIX 2: status-hud per-schema override).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing tests for SPEC-CAPTURE-1, SPEC-GLYPH-CAPTURE-1, PL-2 | b42cf24 | container-registry.test.ts, page-lifecycle.test.ts |
| 2 (GREEN) | Implement fixes + fix layer-manager assertions | 007c301 | container-registry.ts, layer-manager.test.ts |
| 3 | Typecheck, lint gate, changeset | 7164293 | .changeset/fix-g2-spec-capture-content-nzl.md |

## What Was Built

**FIX 1 — hud-capture content field (`buildHudRasterPageSchema`):**
Added `content: ' '` to the `TextContainerProperty` constructor for `hud-capture`. The EvenHub SDK serialises to protobuf; absent optional string fields are dropped at wire level, so the host received an empty-content capture container that hardware silently ignored for gesture routing.

**FIX 2 — glyph page single capture target (`buildStatusViewTextContainers`):**
Changed the map to use a per-container conditional: when `name === 'status-hud'`, constructs the `TextContainerProperty` with `isEventCapture: 1` and `content: ' '` overriding the registry value. All other containers retain their registry `isEventCapture` value. The `CONTAINER_REGISTRY['status-hud'].isEventCapture` stays `0` (registry is geometry-only; the builder overrides per-schema with a documented reason comment).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] layer-manager.test.ts Test 8b + LMT-CF-04 asserted zero captures**
- **Found during:** Task 2 GREEN phase
- **Issue:** Both tests had `expect(captures).toHaveLength(0)` — the old (pre-fix) assertion. After `buildStatusViewTextContainers` was fixed to emit one capture (status-hud), these tests failed with "expected 0 but got 1".
- **Fix:** Updated both test descriptions and assertions to expect `toHaveLength(1)` with `containerName === 'status-hud'`. Added `FIX-NZL` comments explaining the behavioral change.
- **Files modified:** `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`
- **Commit:** 007c301

## Verification Results

- `corepack pnpm typecheck` → exit 0
- `corepack pnpm --filter @evf/g2-app test` → 3 failed (pre-existing TEMP-DIAG in map-canvas-layer.test.ts, not mine), 1657 passed
- `corepack pnpm exec biome ci <touched files>` → no errors
- `corepack pnpm changeset:status` → @evf/g2-app pending patch bump

## Success Criteria Status

1. `buildHudRasterPageSchema().textObject[0].content === ' '` — SPEC-CAPTURE-1 GREEN
2. `buildStatusViewTextContainers()` returns exactly one `isEventCapture=1` entry; it is `status-hud` (id 6) with `content === ' '` — SPEC-GLYPH-CAPTURE-1 GREEN
3. `CONTAINER_REGISTRY['status-hud'].isEventCapture === 0` — SPEC-REGISTRY-UNCHANGED GREEN
4. `buildBaseTextContainers()` REG-4 still passes: exactly one registry-level capture = `map-capture` (id 7) — GREEN (unchanged)
5. PL-2 asserts exactly one capture (status-hud) in boot schema — GREEN
6. All plan-specific tests pass; no new lint or typecheck errors; patch changeset committed — GREEN

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced.

## Self-Check: PASSED

Files verified present:
- `packages/g2-app/src/engine/container-registry.ts` — FOUND (modified)
- `packages/g2-app/src/engine/__tests__/container-registry.test.ts` — FOUND (modified)
- `packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts` — FOUND (modified)
- `.changeset/fix-g2-spec-capture-content-nzl.md` — FOUND (created)

Commits verified:
- `b42cf24` — test(g2-app): RED — SPEC-CAPTURE-1/SPEC-GLYPH-CAPTURE-1/PL-2 failing tests
- `007c301` — feat(g2-app): G2 spec compliance — capture content single-space + glyph page capture target
- `7164293` — fix(g2-app): G2 spec compliance — capture content single-space + glyph page capture target
