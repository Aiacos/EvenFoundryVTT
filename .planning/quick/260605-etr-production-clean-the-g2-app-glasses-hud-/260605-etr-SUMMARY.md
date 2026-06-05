---
phase: quick-260605-etr
plan: 01
subsystem: g2-app/engine
tags: [hud-chrome, boot-engine, header, footer, INV-1, INV-3, TDD]
dependency_graph:
  requires: [container-registry, boot-engine-core, boot-splash]
  provides: [hud-chrome (writeHeaderChrome, writeFooterChrome)]
  affects: [boot-engine-core step-12a, g2-app HUD display]
tech_stack:
  added: []
  patterns:
    - resolveContainerIdField spread (mirrors boot-splash.ts / status-hud-layer.ts)
    - post-bundle fire-safe writer (try/catch per T-etr-03, mirrors step-12b audio-capture)
key_files:
  created:
    - packages/g2-app/src/engine/hud-chrome.ts
    - packages/g2-app/src/engine/__tests__/hud-chrome.test.ts
  modified:
    - packages/g2-app/src/internal/boot-engine-core.ts
decisions:
  - "D-1: header content = MAP · — · <mode>  <TURNO|TURN> —/—  ⌁ R1 — (implements-existing-mockup, no spec change)"
  - "D-2: footer keeps long=quick verbatim; qa= sweep is Phase 20 (GEST-01/ADR-0012)"
  - "D-4: INV-3 implements-existing-mockup case; no Specs.md/README/showcase change"
  - "D-5: INV-1 composite fixtures untouched; new content asserted by dedicated unit tests only"
metrics:
  duration: "5 minutes"
  completed: "2026-06-05T08:52:00Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase quick-260605-etr Plan 01: HUD Chrome Writers Summary

Production-clean g2-app HUD by adding `writeHeaderChrome` + `writeFooterChrome` — two async boot-time writers that paint the canonical Specs §7.4 frame-top (id4) and gesture-hint footer (id5) content AFTER the step-12 `lm.bundle()` flush, replacing the stale boot-splash line / SDK "Text" placeholder with intentional HUD chrome.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing hud-chrome tests (HC-1..HC-7) | `8dc078d` | `src/engine/__tests__/hud-chrome.test.ts` |
| 1 (GREEN) | writeHeaderChrome + writeFooterChrome | `aeb50a7` | `src/engine/hud-chrome.ts` |
| 2 | Wire chrome into boot step 12a | `b867327` | `src/internal/boot-engine-core.ts` |

## What Was Built

### Task 1 — `hud-chrome.ts`

New module exporting two async functions:

- **`writeHeaderChrome(bridge, { mode, locale })`** — writes the canonical §7.4 frame-top into `header` (id4, 576×12). Content: `MAP · — · <mode>        <TURNO|TURN> —/—                  ⌁ R1 —`. The `—` em-dash slots (scene, round/turn, battery) follow the project-wide missing-scalar convention; they will be overwritten by future layer updates when real data arrives. Center label is `TURNO` for `locale='it'`, `TURN` for all others.

- **`writeFooterChrome(bridge, { mode, locale })`** — writes the canonical §7.4 gesture-hint + mode + nav-chip footer into `footer` (id5, 576×24). IT: `R1: scroll=pan  tap=ping  long=quick   modo: ▶RASTER (toggle GLYPH)   [scheda] [combat]`. EN: `mode:` + `[sheet]`. Mode token pair (RASTER/GLYPH) derived from `opts.mode`.

Both functions use `resolveContainerIdField()` from `container-registry.ts` to spread the numeric `containerID` (4 / 5) into the `TextContainerUpgrade` payload — exactly mirroring the pattern in `boot-splash.ts` and `status-hud-layer.ts`. Both propagate rejections (no swallow, per HC-7).

Full TSDoc on both exported functions + the module: boot-chrome role, §7.4 citation, D-1/D-2/D-3 rationale, GEST-01/Phase-20 `long=quick` deferral, `—` missing-scalar policy.

**Test file (`__tests__/hud-chrome.test.ts`):** 13 assertions covering HC-1..HC-7:
- containerName + numeric containerID asserted on each payload
- header tokens: `MAP · `, mode, `⌁ R1`, `—`, locale-sensitive `TURNO`/`TURN`
- footer: `long=quick`, locale-sensitive `modo:`/`mode:`, `[scheda]`/`[sheet]`, mode toggle
- glyph mode: header carries `glyph`, footer shows `▶GLYPH (toggle RASTER)`
- rejection propagation from both writers

### Task 2 — `boot-engine-core.ts`

Added step 12a immediately after `await layerManager.bundle([...])` (the single rebuildPageContainer flush), before step 12b (audio capture):

```typescript
const chromeMode = effectiveVerdict === 'glyph' ? 'glyph' : 'raster';
try { await writeHeaderChrome(bridge, { mode: chromeMode, locale: effectiveLocale }); }
catch (err) { console.warn('[boot-engine-core] header chrome write failed:', err); }
try { await writeFooterChrome(bridge, { mode: chromeMode, locale: effectiveLocale }); }
catch (err) { console.warn('[boot-engine-core] footer chrome write failed:', err); }
```

The `effectiveVerdict` and `effectiveLocale` variables are already in scope (no recompute). Each writer is independently rejection-guarded (T-etr-03: a chrome write failure must NOT abort an already-booted engine — mirrors the step-12b audio-capture try/catch pattern).

Import sorted alphabetically among the `../engine/` imports (`hud-chrome.js` after `debug-mirror.js`). Doc-comment step list updated with the `12a` entry.

## Quality Gates

| Gate | Result |
|------|--------|
| `hud-chrome.test.ts` (13 tests) | PASS |
| Full g2-app vitest suite | 1442/1442 PASS (was 1429 — +13 new) |
| `@evf/g2-app typecheck` | Exit 0 |
| `lint:ci` (Biome) | Exit 0 |
| INV-1 fixture drift (D-5 / T-etr-01) | NONE — composite fixtures byte-identical |

## Deviations from Plan

None. Plan executed exactly as written.

The only Rule 3 micro-fix applied automatically: the `writeFooterChrome, writeHeaderChrome` import in `boot-engine-core.ts` needed to be placed in alphabetical order among the `../engine/` imports (`hud-chrome` after `debug-mirror`, not immediately after `boot-splash`) — Biome `organizeImports` reported an error. Fixed inline before the Task 2 commit.

## INV-1 Disposition

Composite INV-1 fixtures (`glyph-scene.raster-idle-it.txt`, `glyph-scene.glyph-idle-z05*.txt`, `raster-overlay-open*.txt`) are produced by the snapshot-test harness from layer output and do NOT include the boot-time chrome writers. No composite fixture was regenerated or modified. The full g2-app vitest run (1442 tests) proves zero fixture drift (T-etr-01 / D-5).

## INV-3 Disposition

**implements-existing-mockup case — NO Specs.md / README / showcase change.**

Both `writeHeaderChrome` (D-1) and `writeFooterChrome` (D-2) implement content that the canonical Specs §7.4 mockup AND the frozen INV-1 fixture (`glyph-scene.raster-idle-it.txt`) already show. The `—` fallbacks are the spec's own missing-scalar convention. The `long=quick` token in the footer matches the frozen fixture (GEST-01/ADR-0012 Phase 20 sweep deferred). No rendered content diverges from existing mockups. The INV-3 atomic-doc-coherence gate does NOT trigger for this plan.

## Known Stubs

None. Both writers render intentional content. The `—` em-dash slots in the header (scene, round/turn, battery) are the spec's designed missing-data state at boot time, not stubs — they match the existing mockup exactly.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes. The two new surface areas (header chrome content, footer chrome content) are within the existing trust class already established by `IdleInfillLayer` and `StatusHudLayer` (T-etr-02: accepted).

## Self-Check: PASSED

- `packages/g2-app/src/engine/hud-chrome.ts` — FOUND
- `packages/g2-app/src/engine/__tests__/hud-chrome.test.ts` — FOUND
- Commit `8dc078d` (RED) — FOUND
- Commit `aeb50a7` (GREEN) — FOUND
- Commit `b867327` (wire) — FOUND
- 1442/1442 g2-app tests — PASS
