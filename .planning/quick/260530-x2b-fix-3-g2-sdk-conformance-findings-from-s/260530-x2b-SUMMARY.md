---
phase: quick-260530-x2b
plan: "01"
subsystem: g2-app + bridge
tags: [sdk-conformance, auth, bug-fix, inv-2, inv-4]
dependency_graph:
  requires: []
  provides: [correct-portrait-image-tile, wkwebview-audio-auth, r1-provenance-comment]
  affects: [packages/g2-app, packages/bridge]
tech_stack:
  added: []
  patterns:
    - ImageRawDataUpdate typed SDK call (mirrors raster-controller.ts pattern)
    - "?token= query-param WS auth fallback (mirrors debug-routes.ts ?secret= pattern)"
key_files:
  created: []
  modified:
    - packages/g2-app/src/raster/map-base-layer.ts
    - packages/g2-app/src/engine/audio-capture.ts
    - packages/bridge/src/voice/audio-stream-route.ts
    - packages/bridge/src/voice/audio-stream-route.test.ts
    - packages/g2-app/src/engine/r1-event-source.ts
    - .changeset/260530-x2b-g2-sdk-conformance.md
decisions:
  - "B1: ImageRawDataUpdate constructs with containerName+imageData only (no index field); targets map-tile-slot not map-capture"
  - "B2: Bearer travels as ?token= query param (WKWebView) AND Authorization header (Node-ws test path); token never logged"
  - "B3: Comment-only fix; no logic change in r1-event-source.ts"
metrics:
  duration: "~15 min"
  completed: "2026-05-30"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 6
  tests_baseline: 2858
  tests_final: 2859
---

# Phase quick-260530-x2b Plan 01: G2 SDK-Conformance Fixes Summary

**One-liner:** Three G2 SDK-conformance fixes: portrait targets correct image tile via typed ImageRawDataUpdate, audio-stream WS bearer falls back to ?token= for WKWebView production auth, R1 wire-kind provenance comment corrected (INV-2).

## Tasks Completed

| Task | Fix | Severity | Commit | Files |
|------|-----|----------|--------|-------|
| 1 | B1: Portrait override targets map-tile-slot via typed SDK ImageRawDataUpdate | CRITICAL | c7665b0 | map-base-layer.ts |
| 2 | B2: Audio WS bearer via ?token= query param for WKWebView (both sides + test) | IMPORTANT | ee93b22 | audio-capture.ts, audio-stream-route.ts, .test.ts |
| 3 | B3: R1 wire-kind provenance comment corrected (INV-2) | INV-2 doc | fcdbd7b | r1-event-source.ts |

Changeset commit: 4d49f90

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

- B1: Added value import of ImageRawDataUpdate + ImageRawDataUpdateResult alongside existing type-only import. console.warn on isSuccess failure (no _recordFailure in MapBaseLayer). Cast + phantom index field removed (INV-4).
- B2: buildAudioStreamUrl now exported (test file imports it). Added _buildAudioStreamBaseUrl helper for safe log line. Bridge req type widened with url?: string inline. headerBearer ?? queryToken priority order: header first, query param fallback.
- B3: Both module-level JSDoc and inline Step 7 comment updated for full consistency.

## Verification Gates

- pnpm typecheck: exit 0 (workspace-wide)
- pnpm test --run: 2859/2859 pass (+1 ASR-09, baseline was 2858)
- map-tile-slot present in map-base-layer.ts; no as-unknown-as cast; isSuccess check present
- searchParams.get('token') in audio-stream-route.ts; encodeURIComponent in audio-capture.ts
- OsEventTypeList + TOUCH_EVENT_FROM_RING in r1-event-source.ts; old wrong phrase gone
- pnpm lint:ci: exit 0
- Changeset has @evf/g2-app + @evf/bridge at patch

## ADR-0011 / CI Gate 8

No socketlib handlers added or removed. CI Gate 8 count stays at 17.

## Known Stubs

None.

## Self-Check: PASSED

- Commits c7665b0, ee93b22, fcdbd7b, 4d49f90 all exist in git log
- All 5 plan artifact files present in worktree
- pnpm typecheck + pnpm test both exit 0
