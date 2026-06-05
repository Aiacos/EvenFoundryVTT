---
phase: quick-260605-m4e
plan: 01
subsystem: g2-app/hud-raster
tags: [hud, raster, live-render, websocket, tdd]
dependency_graph:
  requires:
    - quick-260605-ksd (PoC frame: renderHudFrame + buildHudTiles + pushHudTiles)
    - quick-260605-e9t (createWsEventBus with last-value replay)
  provides:
    - hud-live-render.ts: makeSnapshotRenderHandler + renderRasterHudFrame (pure, tested)
    - boot-hud-raster-poc.ts: live character.delta subscription loop (WS + event bus)
  affects:
    - packages/g2-app/src/hud/boot-hud-raster-poc.ts
tech_stack:
  added: []
  patterns:
    - TDD: RED (97ccbef) -> GREEN (da3405e) for hud-live-render.ts
    - fail-soft pipeline (T-m4e-02): try/catch -> onError, never rejects
    - CharacterSnapshotSchema.safeParse gate (T-m4e-01): mirrors StatusHudLayer._onDelta
    - last-value replay via createWsEventBus (pre-existing, from quick-260605-e9t)
    - local awaitWsOpen helper (mirrors private boot-engine-core#awaitWsOpen)
key_files:
  created:
    - packages/g2-app/src/hud/hud-live-render.ts
    - packages/g2-app/src/hud/hud-live-render.test.ts
  modified:
    - packages/g2-app/src/hud/boot-hud-raster-poc.ts
decisions:
  - "Kept REST first-frame before WS subscription so HUD draws immediately on connect"
  - "WS wiring in its own try/catch (T-m4e-03) so a WS failure leaves first-frame on screen"
  - "Local awaitWsOpen copy (not import of private symbol) to keep module boundary clean"
  - "makeSnapshotRenderHandler accepts optional onParseFailure for testability"
  - "createWsEventBus import pulls boot-engine-core graph — acceptable for dev-only hud=raster path"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-05T14:12:12Z"
  tasks_completed: 2
  files_changed: 3
---

# Quick Task 260605-m4e: Live Re-render Image-HUD on character.delta — Summary

One-liner: `character.delta` WS subscription added to raster HUD PoC via `createWsEventBus` + `makeSnapshotRenderHandler`, converting single-frame boot to a live re-render loop; backed by TDD-tested pure orchestrator.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Extract pure hud-live-render orchestrator (TDD) | RED: `97ccbef`, GREEN: `da3405e` | Complete |
| 2 | Wire boot-hud-raster-poc to live character.delta | `c4b19be` | Complete |
| 3 | Live-sim visual gate (checkpoint:human-verify) | pending | **Awaiting human** |

## What Was Built

### Task 1: hud-live-render.ts (TDD)

**RED commit `97ccbef`:** Failing test file `hud-live-render.test.ts` with 4 tests (5 assertions):
- Test 1: `render → assemble → push` call ordering
- Test 2: render-throw → `onError` called, push NOT called, resolves
- Test 3: push-reject → `onError` called, still resolves
- Tests 4a/4b: `makeSnapshotRenderHandler` parse gate (failure skips render; success invokes pipeline)

**GREEN commit `da3405e`:** `hud-live-render.ts` implementing:
- `RasterHudRenderDeps` interface (render/assemble/push/onError injected)
- `renderRasterHudFrame(snapshot, deps): Promise<void>` — full try/catch fail-soft pipeline
- `makeSnapshotRenderHandler(deps, onParseFailure?): (raw: unknown) => void` — CharacterSnapshotSchema.safeParse gate + fire-and-forget dispatch

### Task 2: boot-hud-raster-poc.ts live wiring (commit `c4b19be`)

Extended `bootHudRasterPoc` from single-frame to live loop:
1. Steps 1-7 unchanged (polyfill → bridge → page → REST fetch → render → tiles → push)
2. Step 8: builds `RasterHudRenderDeps` with real `renderHudFrame`/`buildHudTiles`/`pushHudTiles`
3. Step 9: `new WebSocket(toWsConnectUrl(opts.bridgeUrl))` + `await awaitWsOpen(ws)`
4. Step 10: `createWsEventBus(ws).subscribe('character.delta', makeSnapshotRenderHandler(deps))`

Last-value replay ensures the subscription fires immediately with any cached on-connect delta AND on every future `character.delta`. Each snapshot redraws all 4 tiles (naive scope, no xxhash delta diffing — TODO-hud-raster #2).

WS wiring block is wrapped in its own try/catch → `console.warn` (T-m4e-03): a WS failure leaves the REST first-frame on screen and never aborts boot.

## Test / Quality Gate Results

| Gate | Result |
|------|--------|
| `vitest run src/hud/` | 101 test files, 1464 tests — all PASS |
| `tsc --noEmit` (g2-app) | Clean (exit 0) |
| `biome ci .` (lint:ci) | Clean (exit 0, 0 errors, 313 pre-existing warnings unchanged) |
| New dependencies | None added |

## Deviations from Plan

None — plan executed exactly as written.

- The plan suggested checking for circular import issues if pulling `createWsEventBus`; no circular import was found (boot-engine-core exports the function cleanly).
- Biome auto-formatted the import order in `boot-hud-raster-poc.ts` during `pnpm format` — this is expected and correct (import ordering is a safe fix).

## Threat Mitigations Implemented

| Threat | Mitigation | Location |
|--------|-----------|----------|
| T-m4e-01 Tampering via malformed WS payload | `CharacterSnapshotSchema.safeParse` gate in `makeSnapshotRenderHandler` | `hud-live-render.ts` |
| T-m4e-02 DoS via render/encode/push error | Full try/catch → `onError` in `renderRasterHudFrame` | `hud-live-render.ts` |
| T-m4e-03 DoS via WS connect/subscribe failure | Separate try/catch → `console.warn` around WS block | `boot-hud-raster-poc.ts` |
| T-m4e-04 Info disclosure on normal path | WS + live-render code only executes inside the `?hud=raster` branch | `launch.ts` (unchanged) |
| T-m4e-SC Supply chain | No new npm dependencies | — |

## Known Stubs

None. The live-render loop is fully wired. The only intentional TODO is the xxhash sub-tile delta diffing (TODO-hud-raster #2), which is documented with `TODO(ADR-0013)` comments.

## Threat Flags

None. No new network endpoints, auth paths, or file access patterns introduced beyond the plan's documented threat model.

## Task 3 Status: PENDING HUMAN VERIFICATION

Task 3 (`checkpoint:human-verify`) requires running the EvenHub simulator and visually confirming the HUD re-renders when `pnpm sim seed` pushes a fresh `character.delta`. This cannot be automated (requires visual inspection of the glasses viewport). See PLAN.md Task 3 for the full verification procedure.

## Self-Check

- [x] `packages/g2-app/src/hud/hud-live-render.ts` exists at commit `da3405e`
- [x] `packages/g2-app/src/hud/hud-live-render.test.ts` exists at commit `97ccbef`
- [x] `packages/g2-app/src/hud/boot-hud-raster-poc.ts` modified at commit `c4b19be`
- [x] Commits `97ccbef`, `da3405e`, `c4b19be` exist in branch history

## Self-Check: PASSED
