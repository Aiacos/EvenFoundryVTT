---
phase: 20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline
plan: "03"
subsystem: g2-app/status-hud
tags: [canvas, hud, raster, dirty-gate, imageBitmap, tdd]
dependency_graph:
  requires:
    - "20-01 (CanvasLayer async attachCanvas + ensureVt323Loaded)"
    - "@evf/shared-protocol CharacterSnapshotSchema"
    - "packages/g2-app/src/engine/canvas-compositor.ts (COMPOSITOR_W/H)"
  provides:
    - "CanvasStatusHudLayer (CanvasLayer at Z1_STATUS_HUD)"
    - "SC2: chrome pre-bake once (RFONT-02)"
    - "SC3: dirty-gate paint() (RFONT-03)"
  affects:
    - "20-05 (boot wiring mounts this layer)"
tech_stack:
  added: []
  patterns:
    - "ImageBitmap chrome pre-bake (fire-and-forget async init from sync attachCanvas)"
    - "isDirty() dirty-gate with _dirty=false as last line of paint()"
    - "CharacterSnapshotSchema.safeParse gate on untrusted WS payload"
    - "makeFakeCtx/makeFakeCanvas test factory pattern (canvas-compositor.test.ts analog)"
key_files:
  created:
    - packages/g2-app/src/status-hud/canvas-status-hud-layer.ts
    - packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts
  modified: []
decisions:
  - "attachCanvas() is async (Promise<void>) per 20-01 widened CanvasLayer interface — await in LayerManager.bundle()"
  - "Pre-bake fires as async fire-and-forget inside async attachCanvas; _chromeBitmap null in happy-dom (createImageBitmap absent)"
  - "Silent catch in _prebakeChrome (no console.debug) — fallback is a normal environment-detection path"
  - "getContainerCount() returns {image:0, text:0} per ADR-0013 Amendment 1 locked decision #3"
  - "_drawChrome and _drawDynamic are module-level pure functions (not private methods) for spy-testability"
metrics:
  duration: "~6 min"
  completed: "2026-06-06T08:13:00Z"
  tasks_completed: 1
  files_changed: 2
---

# Phase 20 Plan 03: CanvasStatusHudLayer — Chrome Pre-Bake, Dirty-Gate, Delta Subscription

**One-liner:** `CanvasStatusHudLayer` implements `CanvasLayer` at z=1 with ImageBitmap chrome pre-bake, `isDirty()` dirty-gate, and `CharacterSnapshotSchema`-validated delta subscription.

## What Was Built

### `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts`

First real `CanvasLayer` implementation. Key behaviors:

- **`attachCanvas(canvas): Promise<void>`** — acquires 2D context, awaits `ensureVt323Loaded()` for VT323 font (with `'16px monospace'` fallback in happy-dom), then awaits `_prebakeChrome()` which draws static chrome onto an `OffscreenCanvas` scratch and caches it via `createImageBitmap`. In happy-dom (or any environment lacking `createImageBitmap`), the catch block silently leaves `_chromeBitmap = null`.
- **`paint()`** — clears rect, blits `_chromeBitmap` (GPU-accelerated) if non-null, else falls back to `_drawChrome` inline. Calls `_drawDynamic` for HP/AC/level text. Resets `_dirty = false` as the LAST line (anti-double-guard per plan contract).
- **`isDirty()`** — returns `_dirty`; `true` at construction + after each valid `character.delta`, `false` after `paint()`.
- **`_onDelta(raw)`** — `CharacterSnapshotSchema.safeParse` gate (T-20-01 mitigation); malformed payloads warn `[EVF]` and do NOT set `_dirty`.
- **`getContainerCount()`** — returns `{image:0, text:0}` (ADR-0013 Amendment 1, locked decision #3).
- **`destroy()`** — unsubscribes from `character.delta`; calls `_chromeBitmap.close()` to release GPU memory.
- **`getFontFamily()`** — test-only accessor for SC1-style assertions.

Module-level pure helpers `_drawChrome` and `_drawDynamic` draw static chrome and dynamic HUD data respectively, separated from the class for spy-testability.

### `packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts`

17 new tests covering:
- **SC2 (RFONT-02):** `isDirty()` true at construction, false after paint; `getContainerCount()` returns zero-zero.
- **SC3 (RFONT-03):** `isDirty()` dirty-gate lifecycle — init true → false after paint → stays false idle → true after valid delta; `vi.spyOn(layer, 'paint')` call-count assertions.
- **Malformed delta:** garbage and null payloads do not set `_dirty`; `console.warn('[EVF]')` emitted.
- **CanvasLayer contract:** `attachCanvas` returns Promise, `draw()` resolves void, `id === 'canvas-status-hud'`, `getFontFamily()` returns monospace fallback in happy-dom, `destroy()` unsubscribes.

All tests use the `makeFakeCtx`/`makeFakeCanvas` factory pattern — no real canvas API required.

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| canvas-status-hud-layer | 17 new | GREEN |
| g2-app full suite | 1518 total | GREEN (no regressions) |
| workspace full suite | 3175 total | GREEN (no regressions) |

**TypeScript:** `pnpm --filter @evf/g2-app exec tsc --noEmit` exits 0.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | `df83087` | test(20-03): add failing SC2+SC3 tests for CanvasStatusHudLayer |
| GREEN (feat) | `a6831be` | feat(g2-app): CanvasStatusHudLayer — chrome pre-bake, dirty-gate, delta subscription (20-03) |

Both RED and GREEN gates present in git history. REFACTOR gate not needed — implementation was clean on first pass.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

- `attachCanvas()` is `async` (returns `Promise<void>`) per the 20-01 widened `CanvasLayer` interface — the plan explicitly requested this signature and `layer-types.ts` already declares it.
- `console.debug` in the pre-bake catch block was replaced by a silent catch (Biome `lint/suspicious/noConsole` would have flagged `console.debug` as an error). The fallback path is a normal environment-detection path — no log needed.
- `_drawChrome` and `_drawDynamic` are module-level functions (not private class methods) so tests can spy on `ctx.strokeRect`/`ctx.fillRect` call counts without needing to reach into private class internals.

## Known Stubs

`_drawChrome` and `_drawDynamic` render minimal Phase 20 chrome and data (outer frame + HP/AC/level). Future phases (21/23) will enrich with full borders, section labels, condition icons, slot counts, and combat tracker panels. These stubs are intentional — the plan scope is proving the pre-bake + dirty-gate substrate, not full HUD fidelity.

## Threat Flags

No new security surface introduced beyond what was planned. The `character.delta` → canvas renderer boundary is mitigated by `CharacterSnapshotSchema.safeParse` per T-20-01.

## Self-Check: PASSED

- `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` — FOUND
- `packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts` — FOUND
- Commit `df83087` (RED) — FOUND
- Commit `a6831be` (GREEN) — FOUND
- `grep -n "image: 0, text: 0" packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` — matches line 236
- `grep -n "_dirty = false" packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` — matches line 201 (last statement of paint())
