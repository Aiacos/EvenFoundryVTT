# Phase 25: Promozione Raster a Default Boot + Fallback Glyph - Research

**Researched:** 2026-06-08
**Domain:** g2-app — PoC removal, boot-path promotion, glyph BLE-degraded fallback formalization
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-25.1 — Rimuovere il PoC raster isolato [USER-DECIDED]**
Eliminare il trigger `?hud=raster` e il PoC entry path: `hud/boot-hud-raster-poc.ts` + il Branch A-raster trigger in `internal/launch.ts` (e i file PoC-only `hud/hud-poc-page.ts`, `hud/hud-live-render.ts` SE non riusati dal path canvas reale). Preservare SOLO gli helper genuinamente riusati dal path canvas di produzione. INV-4 zero dead code pieno. Aggiornare/rimuovere i test che coprono SOLO il PoC; i test che coprono helper riusati restano (adattati al path reale).

**D-25.2 — Canvas default boot senza guard (success criterion #1)**
`boot-engine-core.ts` monta `CanvasStatusHudLayer` (canvas mode) come default; `_flushPage()` emette `buildHudRasterPageSchema()` alla prima startup SENZA `?hud=raster`. La status-page text-container 3-container NON è più lo schema di boot di default.

**D-25.3 — Glyph come fallback BLE-degraded, switch atomico (success criterion #3)**
`RasterController.setBleVerdict('glyph')` attiva `LayerManager.setRenderMode('glyph')`, che esegue un `bundle([])` atomico portando al 3-container text-schema. La sequenza canvas→glyph è testata end-to-end con ZERO frame intermedio a schema misto.

**D-25.4 — Glyph fallback byte-identica pre-v0.10.0 (success criterion #4)**
Le ~60 ASCII fixture INV-1 esistenti passano INVARIATE. NON modificare le glyph fixture.

**D-25.5 — No new handlers, gates green (success criterion #5)**
`pnpm test` + `pnpm typecheck` + `pnpm lint:ci` tutti verdi; socketlib count resta 17.

**D-25.6 — Docs out of scope (INV-3 → Phase 26)**
Specs.md §7 / README / showcase NON sono toccati.

### Claude's Discretion
None declared.

### Deferred Ideas (OUT OF SCOPE)
- INV-3 doc coherence (Specs §7 / README / showcase) → Phase 26.
- Pre-existing deploy/sync-app-whitelist.mjs lint error → decide separately.
- `@deprecated`-instead-of-remove alternative for the PoC → not chosen (D-25.1 = remove).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RPROMO-02 | La regione raster 400×200 (4 tile + 1 capture/background text container) è il substrato di boot di default (sostituisce la status-page text-container); la HUD glyph/text resta il fallback BLE-degraded (degrade automatico sotto soglia banda per ADR-0005 Branch A). | Fully supported — see Architectural Responsibility Map and Symbol Classification below. |
</phase_requirements>

---

## Summary

Phase 25 is a **code-only cleanup and formalization** phase. The canvas path has been the actual boot default since Phase 20 (`boot-engine-core.ts` line 644: `layerManager.setRenderMode('canvas')`); this phase removes the isolated `?hud=raster` PoC scaffolding that was added as a parallel dev path before the real canvas engine was wired. No functional behavior changes are required for the canvas path — only dead PoC code is excised.

The critical finding from dependency graph analysis is that `pushHudTiles` (exported from `hud-poc-page.ts`) is **imported by two production canvas-path files** (`engine/layer-manager.ts` line 39 and `engine/hud-delta-driver.ts` line 34). This function is the production serialized tile-push used by `_compositeAndPush()` and `HudDeltaDriver._pushFrame()`. It must be **extracted to a new production module** before `hud-poc-page.ts` can be deleted; it cannot be removed along with the PoC.

The glyph fallback switch (`RasterController.setBleVerdict('glyph')` → `LayerManager.setRenderMode('glyph')` → `bundle([])`) has its component parts already implemented in `map-mode-toggle.ts` and `layer-manager.ts`, but the end-to-end atomicity test (canvas→glyph with zero mixed-schema intermediate frame) does not yet exist and must be added in this phase.

**Primary recommendation:** Extract `pushHudTiles` to `engine/push-hud-tiles.ts` (or inline into `layer-manager.ts` / `hud-delta-driver.ts`), then remove the PoC triad (`boot-hud-raster-poc.ts`, `hud-poc-page.ts`, `hud-live-render.ts`), prune `LaunchDeps.bootHudRasterPoc` and the `?hud=raster` branch from `launch.ts`, and add the canvas→glyph atomic-switch e2e test.

---

## Project Constraints (from CLAUDE.md)

- **INV-1:** ~96 ASCII `.txt` fixture files in `packages/shared-render/src/fixtures/` — all must remain byte-identical. Glyph fixtures are a strict subset. The planner MUST NOT add any task that modifies these files.
- **INV-4:** Zero dead/unreachable code. Every PoC symbol must be fully removed or migrated, not commented out or marked `@deprecated`. `grep` verification required before deletion.
- **Tooling gates:** Biome 2.4.15 `lint:ci` + TypeScript strict + Vitest 4 coverage gate — all must be green at phase exit.
- **Socketlib count = 17:** No new socketlib handlers. CI Gate 8 enforced in `module.test.ts`.
- **Pre-existing lint errors (out of scope):** `deploy/sync-app-whitelist.mjs:62` (useTemplate) and `packages/foundry-mcp/src/__tests__/mcp-inspector-smoke.test.ts:44` (useTemplate) — present before this phase, do NOT introduce or fix silently.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PoC entry removal | Browser / Client (g2-app) | — | launch.ts + boot-hud-raster-poc.ts are g2-app-only |
| Canvas default boot assertion | Browser / Client (g2-app) | — | boot-engine-core.ts owns the boot sequence |
| `pushHudTiles` extraction | Browser / Client (g2-app) | — | Function bridges hud/ → engine/ consumers |
| Glyph fallback switch | Browser / Client (g2-app) | — | setBleVerdict + setRenderMode + bundle are g2-app engine |
| INV-1 fixture integrity | shared-render | g2-app (test consumers) | Fixtures live in shared-render; tests in g2-app |

---

## PoC Dependency Graph — Symbol Classification [VERIFIED: codebase grep]

This is the load-bearing analysis for D-25.1. Every exported symbol from the three PoC files was traced repo-wide.

### `hud/boot-hud-raster-poc.ts`

| Symbol | Consumers (non-test) | Classification |
|--------|----------------------|----------------|
| `bootHudRasterPoc` | `internal/launch.ts` (PoC trigger only) | **POC-ONLY — REMOVE** |
| `BootHudRasterPocOpts` | `internal/launch.ts` (type for PoC branch) | **POC-ONLY — REMOVE** |
| `FALLBACK_SNAPSHOT` (unexported const) | none | **POC-ONLY — REMOVE** |
| `fetchSnapshot` (unexported fn) | none | **POC-ONLY — REMOVE** |
| `awaitWsOpen` (unexported fn) | none — boot-engine-core has its own private copy | **POC-ONLY — REMOVE** |

**Entire file is PoC-only. Safe to delete after removing the `launch.ts` trigger.**

### `hud/hud-poc-page.ts`

| Symbol | Consumers (non-test) | Classification |
|--------|----------------------|----------------|
| `pushHudTiles` | `engine/layer-manager.ts:39` (canvas path `_compositeAndPush`) · `engine/hud-delta-driver.ts:34` (canvas delta loop) · `boot-hud-raster-poc.ts` (PoC) | **REUSED BY CANVAS PATH — MUST EXTRACT** |
| `createHudPocPage` | `boot-hud-raster-poc.ts` only | **POC-ONLY — REMOVE** |
| `buildHudPocPageSchema` | `boot-hud-raster-poc.ts` only | **POC-ONLY — REMOVE** |
| `HUD_POC_CONTAINERS` | `boot-hud-raster-poc.ts` only (via `buildHudPocPageSchema`) | **POC-ONLY — REMOVE** |
| `HudPocContainerDef` (interface) | `boot-hud-raster-poc.ts` only | **POC-ONLY — REMOVE** |

**`pushHudTiles` MUST be extracted before deleting this file.** The PoC-only symbols (`createHudPocPage`, `buildHudPocPageSchema`, `HUD_POC_CONTAINERS`, `HudPocContainerDef`) are safe to remove.

**Extraction strategy:** Move `pushHudTiles` (+ its `HudTile` type import dependency) into a new file `hud/push-hud-tiles.ts` (or `engine/push-hud-tiles.ts`), update the two import sites in `layer-manager.ts` and `hud-delta-driver.ts`, then delete `hud-poc-page.ts`. Alternatively, `pushHudTiles` can be inlined directly into `layer-manager.ts` and `hud-delta-driver.ts` since both already have full access to `bridge` and `tiles` types — this avoids introducing a new file but creates duplication. **Preferred approach: new `hud/push-hud-tiles.ts`** to keep the serialized-push concern co-located with `hud-raster-frame.ts`.

### `hud/hud-live-render.ts`

| Symbol | Consumers (non-test) | Classification |
|--------|----------------------|----------------|
| `renderRasterHudFrame` | `boot-hud-raster-poc.ts` only | **POC-ONLY — REMOVE** |
| `makeSnapshotRenderHandler` | `boot-hud-raster-poc.ts` only | **POC-ONLY — REMOVE** |
| `RasterHudRenderDeps` (interface) | `boot-hud-raster-poc.ts` only | **POC-ONLY — REMOVE** |

**Entire file is PoC-only after removing the PoC entry.** The `hud-live-render.ts` orchestration logic was superseded by `HudDeltaDriver` in Phase 24 — no production canvas path calls these functions. Safe to delete.

### Summary table

| File | Disposition | Blocker |
|------|-------------|---------|
| `hud/boot-hud-raster-poc.ts` | **DELETE** | None (all consumers are PoC-path) |
| `hud/hud-live-render.ts` | **DELETE** | None (all consumers are PoC-path) |
| `hud/hud-poc-page.ts` | **DELETE** (after extraction) | Extract `pushHudTiles` first |
| `internal/launch.ts` | **MODIFY** — remove Branch A-raster block + `bootHudRasterPoc` import + `LaunchDeps.bootHudRasterPoc` field | None |

---

## Current Boot Path Analysis [VERIFIED: codebase grep]

### Canvas is ALREADY the default — confirmed

`boot-engine-core.ts` line 644:
```typescript
layerManager.setRenderMode('canvas');
```
This call happens unconditionally at boot step 7 (after `setNegotiatedCaps`), with no `?hud=raster` guard. The `LayerManager.renderMode` field defaults to `'glyph'` (layer-manager.ts line 100) but is flipped to `'canvas'` here on every production boot.

**Consequence for Phase 25:** There is NO `?hud=raster` gate in `boot-engine-core.ts`. The canvas default was already wired in Phase 20 (per memory `phase20-canvas-default-boot-decision`). D-25.2 is already satisfied at the `boot-engine-core` level — the only work is removing the PoC path in `launch.ts` that offered an alternative to the real engine.

### `_flushPage()` schema selection [VERIFIED: codebase grep]

`layer-manager.ts` `_flushPage()` (lines 655-683):
- `renderMode === 'canvas'` → `buildHudRasterPageSchema()` (4 image tiles hud-tile-0..3 at 200×100 + 1 text capture hud-capture at 576×288, containerTotalNum=5) + HudDeltaDriver first-frame push
- `renderMode === 'glyph'` → 3 text containers (header id4 + footer id5 + status-hud id6, containerTotalNum=3) — the BLE-degraded fallback schema

The canvas schema is already `buildHudRasterPageSchema()` from `container-registry.ts`, NOT the old PoC `buildHudPocPageSchema()`. These are DISTINCT schemas: the production schema uses `hud-tile-*` / `hud-capture` ids; the PoC used `HUD_POC_CONTAINERS` derived from `HUD_TILE_GEOMETRY`.

### `LaunchDeps.bootHudRasterPoc` field [VERIFIED: codebase grep]

`internal/launch.ts` defines `LaunchDeps.bootHudRasterPoc` and the `if (hudMode === 'raster')` branch at lines 149-163. This is the ONLY non-test consumer of `bootHudRasterPoc`. After removal, `LaunchDeps` becomes simpler and the `?hud=` param read block can be removed entirely (the `?actor=` param read can be kept as-is).

---

## Glyph Fallback Switch — Implementation Trace [VERIFIED: codebase grep]

### Current infrastructure (all already implemented)

**`RasterController.setBleVerdict('glyph')` (raster-controller.ts:220):**
Sets the internal BLE verdict. Currently called from `boot-engine-core.ts` at step 9 (BLE probe result) and step 9b (persisted map mode override). NOT automatically coupled to `LayerManager.setRenderMode`.

**`LayerManager.setRenderMode('glyph')` (layer-manager.ts:449):**
Mutates `this.renderMode`. Takes effect on the next `bundle()` call.

**`LayerManager.bundle([])` (layer-manager.ts:289):**
Empty ops array = no mount/destroy changes, but still runs `_flushPage()` which rebuilds the page with the current `renderMode` schema. This is the atomic switch mechanism: calling `setRenderMode('glyph')` then `bundle([])` atomically rebuilds to the 3-container text schema in a single `rebuildPageContainer` call.

**`map-mode-toggle.ts#toggleMapMode` (lines 117-147):**
Already calls `layerManager.setMapMode(newMode)` + `rasterController.setBleVerdict(newMode)` (for non-auto). Does NOT call `layerManager.setRenderMode()` or `bundle()` — the map mode is the raster/glyph distinction for the MAP layer, not the HUD render substrate.

### Gap: glyph fallback not wired to LayerManager schema switch

The current `setBleVerdict('glyph')` sets the RasterController verdict but does NOT trigger `layerManager.setRenderMode('glyph')` + `bundle([])`. The RasterController and LayerManager are decoupled: `setBleVerdict` only affects the RasterController's internal state (which gates `requestFrame` calls); the LayerManager's `renderMode` is a separate field.

**For D-25.3:** The connection must be explicit. The recommended wire site is wherever `setBleVerdict('glyph')` is called in response to a BLE degradation signal. In `boot-engine-core.ts` step 9 (the BLE probe) the verdict is already set; if the verdict is `'glyph'`, the `setRenderMode` flip should happen atomically (i.e., the `if (verdict !== 'auto') rasterController.setBleVerdict(verdict)` block should also call `layerManager.setRenderMode(verdict)` and then `bundle([])` only happens later at step 12 when layers are mounted). However, since `bundle([])` at step 12 already picks up the `renderMode`, the switch IS atomic at the first `bundle` call after `setRenderMode`.

**The e2e atomicity test gap:** No existing test verifies that a canvas-booted engine, when `setRenderMode('glyph')` is called followed by `bundle([])`, produces exactly a 3-container `rebuildPageContainer` call with ZERO intermediate mixed-schema frame. This test must be added.

### BLE degradation path in production

Currently `probeBleThroughput(0, 0)` returns `'auto'` in all software tests (no real hardware). The real `'glyph'` verdict comes from either:
1. Boot step 9: `probeBleThroughput(windowMs, bytesReceived)` returning `'glyph'`
2. Boot step 9b: persisted map mode = `'glyph'`
3. Runtime: `toggleMapMode(bridge, lm, rc, 'glyph')` (Phase 6 Quick Action [M])

In all three cases, `setRenderMode('glyph')` must be called AND the next `bundle` must use the glyph schema. The current code at step 9b does call `rasterController.setBleVerdict('glyph')` + `layerManager.setMapMode('glyph')` but NOT `layerManager.setRenderMode('glyph')`. This is the gap to wire.

---

## Standard Stack

No new packages. This phase is purely code-reorganization within `@evf/g2-app`. All libraries in use are already installed.

## Package Legitimacy Audit

No new packages — section skipped.

---

## Architecture Patterns

### System Architecture Diagram

```
[launchApp (launch.ts)]
    |
    +-- isNoAuth()=true
    |       |
    |       +-- CURRENT: ?hud=raster → bootHudRasterPoc() [PoC, DEAD AFTER PHASE 25]
    |       +-- CURRENT/POST-PHASE-25: bootEngine() → _bootEngineCore()
    |                                         |
    |                        step 7: layerManager.setRenderMode('canvas')
    |                        step 9: setBleVerdict (if verdict != 'auto')
    |                        step 9b: persistedMode='glyph' → setBleVerdict('glyph')
    |                                   + setMapMode('glyph')
    |                                   + [GAP: setRenderMode('glyph') needed for D-25.3]
    |                        step 12: lm.bundle([mount CanvasStatusHudLayer])
    |                                   → _flushPage() → buildHudRasterPageSchema() (canvas)
    |                                   OR (if glyph mode) → 3-container text schema
    |
    +-- isNoAuth()=false → wizard path (unchanged)
```

### Key Files and Roles

| File | Role in Phase 25 |
|------|-----------------|
| `hud/boot-hud-raster-poc.ts` | **DELETE** — PoC-only |
| `hud/hud-live-render.ts` | **DELETE** — PoC-only (superseded by HudDeltaDriver) |
| `hud/hud-poc-page.ts` | **DELETE** (after extracting `pushHudTiles`) |
| `hud/push-hud-tiles.ts` | **CREATE** — extracted `pushHudTiles` function (or inline into layer-manager + delta-driver) |
| `internal/launch.ts` | **MODIFY** — remove PoC branch + `LaunchDeps.bootHudRasterPoc` |
| `internal/boot-engine-core.ts` | **MODIFY** — wire `setRenderMode('glyph')` at step 9b when persistedMode='glyph' |
| `engine/layer-manager.ts` | **MODIFY** — update `pushHudTiles` import path (if extracted) |
| `engine/hud-delta-driver.ts` | **MODIFY** — update `pushHudTiles` import path (if extracted) |
| `__tests__/launch.test.ts` | **MODIFY** — remove `bootHudRasterPoc` stub + PoC branch tests |
| `hud/hud-poc-page.test.ts` | **DELETE** — tests only PoC-local symbols |
| `hud/hud-live-render.test.ts` | **DELETE** — tests only PoC-local symbols |
| `__tests__/scene-renderer-smoke.test.ts` | **ADD** — canvas→glyph atomic switch e2e test |

### Recommended Project Structure (hud/ after phase)

```
packages/g2-app/src/hud/
├── hud-canvas-renderer.ts   # KEEP — renderHudFrame (canvas path)
├── hud-raster-frame.ts      # KEEP — buildHudTiles + HudTile + HUD_TILE_GEOMETRY
├── push-hud-tiles.ts        # CREATE — extracted pushHudTiles (moved from hud-poc-page.ts)
│   [or: inline pushHudTiles into layer-manager.ts + hud-delta-driver.ts]
```

Deleted files:
```
packages/g2-app/src/hud/boot-hud-raster-poc.ts   # DELETED
packages/g2-app/src/hud/hud-poc-page.ts           # DELETED
packages/g2-app/src/hud/hud-live-render.ts         # DELETED
packages/g2-app/src/hud/hud-poc-page.test.ts       # DELETED
packages/g2-app/src/hud/hud-live-render.test.ts    # DELETED
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serialized tile push | custom `updateImageRawData` loop | `pushHudTiles` (extracted) | CM-01 contract: SDK rejects concurrent `updateImageRawData` calls; `for...of` + `await` is load-bearing |
| Atomic page switch | manual schema rebuild | `layerManager.bundle([])` | bundle() guarantees single `rebuildPageContainer` call — INV-1 no mixed frame |
| Tile dither + encode | custom PNG encoder | `buildHudTiles` from `hud-raster-frame.ts` | 4-bit indexed palette PNG via upng-js already wired + tested |

---

## Common Pitfalls

### Pitfall 1: Deleting `hud-poc-page.ts` before extracting `pushHudTiles`
**What goes wrong:** `layer-manager.ts` and `hud-delta-driver.ts` both import `pushHudTiles` from `'../hud/hud-poc-page.js'`. Deleting the file without updating imports breaks the build silently (TypeScript compile error).
**How to avoid:** Create `hud/push-hud-tiles.ts` first, update both import sites, then delete `hud-poc-page.ts`. Verify `pnpm typecheck` green before proceeding.
**Warning signs:** `Cannot find module '../hud/hud-poc-page.js'` TypeScript errors.

### Pitfall 2: `LaunchDeps.bootHudRasterPoc` left as optional field
**What goes wrong:** If the field is left in `LaunchDeps` but optional, existing tests that use `makeDeps()` without the field may or may not call the PoC function depending on spread ordering. Leaves dead interface surface.
**How to avoid:** Remove the entire `bootHudRasterPoc` field from `LaunchDeps` and all references.

### Pitfall 3: Glyph switch only sets `setMapMode` not `setRenderMode`
**What goes wrong:** `boot-engine-core.ts` step 9b already calls `rasterController.setBleVerdict('glyph')` + `layerManager.setMapMode('glyph')` for the persisted glyph case. But `setMapMode` is the MAP mode (raster/glyph map rendering) — `setRenderMode` is the HUD schema selector. If `setRenderMode('glyph')` is not called, the next `bundle()` still emits `buildHudRasterPageSchema()` (canvas schema) even when the system is supposedly in glyph mode.
**How to avoid:** Add `layerManager.setRenderMode(persistedMode)` when `persistedMode === 'glyph'` in step 9b. Same for step 9 (BLE probe verdict).

### Pitfall 4: `hud-live-render.test.ts` deletion breaks test-count CI gate
**What goes wrong:** Test count drops by however many tests are in `hud-live-render.test.ts` and `hud-poc-page.test.ts`. This is expected and acceptable — the planner must note the expected delta.
**How to avoid:** Count tests before deletion (`hud-poc-page.test.ts` has ~10 tests, `hud-live-render.test.ts` has ~6 tests). Verify `pnpm test --run` still passes all remaining tests.

### Pitfall 5: `hud-raster-frame.ts` doc comment still references `hud-poc-page.ts`
**What goes wrong:** `hud-raster-frame.ts` line 93 has `@see packages/g2-app/src/hud/hud-poc-page.ts (consumer — pushHudTiles)`. After deletion, this is a stale reference (INV-4 signal).
**How to avoid:** Update the `@see` tag to reference the new `push-hud-tiles.ts` location.

### Pitfall 6: `hud-delta-driver.ts` comment references `hud-poc-page.ts`
**What goes wrong:** `hud-delta-driver.ts` line 27 has `@see packages/g2-app/src/hud/hud-poc-page.ts (pushHudTiles CM-01 serialization)`. Stale after deletion.
**How to avoid:** Update the `@see` tag to reference the new `push-hud-tiles.ts` location.

### Pitfall 7: Pre-existing `lint:ci` failures
**What goes wrong:** `pnpm lint:ci` already fails on `deploy/sync-app-whitelist.mjs:62` (useTemplate) and `packages/foundry-mcp/...` (useTemplate) — these are pre-existing and NOT introduced by this phase. If the executor tries to fix them here, scope creep ensues.
**How to avoid:** Flag these as pre-existing on first `lint:ci` run; do NOT silently fix them. Per D-25.5 the gate is "no NEW errors introduced."

---

## Code Examples

### Current `pushHudTiles` (source: `hud/hud-poc-page.ts:207-225`) — to be extracted

```typescript
// Source: packages/g2-app/src/hud/hud-poc-page.ts (to be moved to hud/push-hud-tiles.ts)
export async function pushHudTiles(
  bridge: Pick<EvenAppBridge, 'updateImageRawData'>,
  tiles: ReadonlyArray<HudTile>,
): Promise<void> {
  for (const tile of tiles) {
    const payload = new ImageRawDataUpdate({
      containerID: tile.containerID,
      containerName: tile.containerName,
      imageData: tile.bytes,
    });
    const result = await bridge.updateImageRawData(payload);
    if (!ImageRawDataUpdateResult.isSuccess(result)) {
      console.warn(
        `[EVF] hud-poc: updateImageRawData non-success for ${tile.containerName} (id=${tile.containerID}):`,
        result,
      );
    }
  }
}
```

When extracted, update the `console.warn` prefix from `[EVF] hud-poc:` to `[EVF] push-hud-tiles:` for INV-4 cleanliness (PoC label removed).

### Current `launch.ts` Branch A-raster block to REMOVE (lines 149-163)

```typescript
// REMOVE this entire block from launch.ts
const hudMode = params.get('hud');
// ...
if (hudMode === 'raster') {
  await deps.bootHudRasterPoc({
    bridgeUrl: deps.devBridgeUrl(),
    token: 'dev-no-auth',
    locale,
    ...(characterId !== undefined ? { characterId } : {}),
  });
} else {
  await deps.bootEngine({ ... });
}
// AFTER removal: only the bootEngine() call remains (no if/else needed)
```

### Glyph fallback wire (boot-engine-core.ts step 9b, lines 681-684) — to ADD `setRenderMode`

```typescript
// Current (step 9b):
if (persistedMode === 'raster' || persistedMode === 'glyph') {
  rasterController.setBleVerdict(persistedMode);
  layerManager.setMapMode(persistedMode);
}

// Phase 25 addition — also set render mode:
if (persistedMode === 'raster' || persistedMode === 'glyph') {
  rasterController.setBleVerdict(persistedMode);
  layerManager.setMapMode(persistedMode);
  layerManager.setRenderMode(persistedMode === 'glyph' ? 'glyph' : 'canvas');
}
// Same pattern for step 9 (BLE probe verdict line 654-656)
```

### canvas→glyph atomic switch pattern (for new e2e test)

```typescript
// Test: canvas boot → setRenderMode('glyph') → bundle([]) → rebuildPageContainer with 3-container glyph schema
// Assert: rebuildPageContainer called ONCE (no intermediate canvas call before glyph call)
// Assert: the final rebuildPageContainer payload has containerTotalNum=3 and textObject.length=3
// Assert: no mixed-schema intermediate frame (spy.callCount === 1)
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root workspace) |
| Quick run command | `pnpm --filter @evf/g2-app test --run` |
| Full suite command | `pnpm test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RPROMO-02 | Canvas is default boot substrate | unit | `pnpm --filter @evf/g2-app test --run --reporter=verbose` | ✅ `scene-renderer-smoke.test.ts` has `SR-*` canvas mode tests |
| RPROMO-02 | `?hud=raster` trigger removed from launch | unit | existing `launch.test.ts` LAUNCH-A (bootEngine called, no bootHudRasterPoc) | ✅ after adaptation |
| RPROMO-02 | PoC symbols absent from build | unit (grep gate) | `grep -r "bootHudRasterPoc\|createHudPocPage" packages/g2-app/src/` returns empty | ❌ Wave 0: add grep assertion in LAUNCH-W4 style test or PLAN notes |
| RPROMO-02 | canvas→glyph atomic switch (zero mixed frame) | unit | `pnpm --filter @evf/g2-app test --run src/__tests__/scene-renderer-smoke.test.ts` | ❌ Wave 0: new test needed |
| RPROMO-02 | glyph schema on `bundle([])` when `renderMode='glyph'` | unit | `pnpm --filter @evf/g2-app test --run src/engine/__tests__/layer-manager.test.ts` | ✅ `setRenderMode('glyph')` already tested (line 1026) but atomicity e2e missing |
| RPROMO-02 | 96 glyph fixtures byte-identical | snapshot | `pnpm test --run --reporter=verbose` (INV-1 suite) | ✅ existing fixture tests |
| RPROMO-02 | socketlib count = 17 | unit | `pnpm --filter @evf/foundry-module test --run` | ✅ `module.test.ts` MOD-CAT-01 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @evf/g2-app test --run`
- **Per wave merge:** `pnpm test --run`
- **Phase gate:** Full suite green (`pnpm test --run` + `pnpm typecheck` + `pnpm lint:ci`) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] New test in `src/__tests__/scene-renderer-smoke.test.ts` or `src/engine/__tests__/layer-manager.test.ts`: canvas→glyph atomic switch — verifies `rebuildPageContainer` called exactly once with 3-container glyph schema after `setRenderMode('glyph')` + `bundle([])`.
- [ ] New `push-hud-tiles.ts` module: no existing tests for the extracted function (tests in `hud-poc-page.test.ts` cover it but will be deleted). Minimal new tests needed for `pushHudTiles` in isolation, OR accept coverage via `_compositeAndPush` / `HudDeltaDriver` integration paths.

---

## Security Domain

This phase makes no changes to auth, session management, input validation, cryptography, or access control. ASVS categories V2/V3/V4/V6 are not applicable. V5 (input validation) is unaffected — no new data paths introduced. Security domain: **not applicable**.

---

## Runtime State Inventory

> Rename/refactor phase? No — this phase removes code, not renames symbols. Skip.

No stored data, live service config, OS-registered state, secrets/env vars, or build artifacts are affected by removing the `?hud=raster` PoC dead code. The PoC path was never executed in production (it required an explicit URL flag in the no-auth dev branch).

---

## Environment Availability

This phase is purely code/config changes with no external dependencies beyond the project's own toolchain (already confirmed working in Phase 24). Step 2.6: **SKIPPED** (no external dependencies identified).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `?hud=raster` PoC parallel boot path | Real canvas boot via `setRenderMode('canvas')` in boot-engine-core | Phase 20 | PoC is now dead code — Phase 25 removes it |
| `pushHudTiles` lived in PoC file | `pushHudTiles` must move to a production location | Phase 25 | Breaking import — extraction required |
| Glyph mode = implicit (LayerManager default) | Glyph mode = explicit BLE-degraded fallback with atomic `bundle([])` switch | Phase 25 formalizes | New e2e test required |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `hud-live-render.ts` exports (`renderRasterHudFrame`, `makeSnapshotRenderHandler`) are consumed only by `boot-hud-raster-poc.ts` in production — confirmed by grep but test files also import them | Symbol Classification | If any production file imports them, deletion breaks the build |
| A2 | The pre-existing lint errors in `deploy/sync-app-whitelist.mjs` and `foundry-mcp` test file are the ONLY pre-existing `lint:ci` failures not introduced by this phase | Pitfall 7 | If there are additional pre-existing failures, they might be attributed to this phase |

**Note on A1:** The grep confirmed that non-test consumers of `hud-live-render.ts` exports are ONLY `boot-hud-raster-poc.ts`. The test file `hud-live-render.test.ts` imports them but that test file will also be deleted.

---

## Open Questions

1. **`pushHudTiles` extraction vs inline**
   - What we know: `pushHudTiles` is used by `layer-manager.ts` and `hud-delta-driver.ts`; the function body is ~20 lines; its dependencies are `EvenAppBridge`, `ImageRawDataUpdate`, `ImageRawDataUpdateResult`, and `HudTile`.
   - What's unclear: Whether a new `hud/push-hud-tiles.ts` file is cleaner than inlining the identical function into each consumer.
   - Recommendation: Extract to `hud/push-hud-tiles.ts` to keep a single source of truth for the CM-01 serialization contract. Update `@see` tags in both consumers and `hud-raster-frame.ts`.

2. **`setRenderMode` placement for glyph fallback**
   - What we know: `boot-engine-core.ts` step 9b already wires `setBleVerdict('glyph')` + `setMapMode('glyph')` for persisted glyph; step 9 handles BLE probe verdict.
   - What's unclear: Whether the glyph `setRenderMode` should live in `boot-engine-core.ts` (boot-time only) or be generalized into `toggleMapMode` (runtime toggle too).
   - Recommendation: Add `setRenderMode` in `boot-engine-core.ts` step 9/9b for boot-time correctness (D-25.3 scope). Runtime toggle via `toggleMapMode` in Phase 20 quick-action [M] is a separate concern.

---

## Sources

### Primary (HIGH confidence)
- `packages/g2-app/src/hud/boot-hud-raster-poc.ts` — PoC entry file, full read
- `packages/g2-app/src/hud/hud-poc-page.ts` — PoC page file, full read (pushHudTiles export confirmed)
- `packages/g2-app/src/hud/hud-live-render.ts` — PoC live-render file, full read
- `packages/g2-app/src/internal/launch.ts` — PoC trigger branch confirmed at lines 47, 79, 117, 149-163
- `packages/g2-app/src/internal/boot-engine-core.ts` — canvas default at line 644 confirmed; step 9/9b glyph gap at lines 653-690
- `packages/g2-app/src/engine/layer-manager.ts` — `pushHudTiles` import at line 39; `_flushPage` schema logic at lines 655-683; `setRenderMode` at line 449
- `packages/g2-app/src/engine/hud-delta-driver.ts` — `pushHudTiles` import at line 34 confirmed
- `packages/g2-app/src/engine/container-registry.ts` — `buildHudRasterPageSchema` and `buildStatusViewTextContainers` confirmed
- `packages/g2-app/src/engine/layer-types.ts` — `setBleVerdict` interface at line 460 confirmed
- `packages/g2-app/src/engine/map-mode-toggle.ts` — glyph switch infrastructure confirmed (toggleMapMode does NOT call setRenderMode)
- `packages/shared-render/src/fixtures/` — 96 `.txt` fixture files confirmed via `find`
- `packages/g2-app/src/__tests__/launch.test.ts` — no `bootHudRasterPoc` tests found (only LAUNCH-A/B/C/W4)
- Repo-wide grep for all PoC symbols — no non-test production consumers of `hud-live-render` exports

### Secondary (MEDIUM confidence)
- `.planning/phases/EVF-25-promozione-raster-a-default-boot-fallback-glyph/25-CONTEXT.md` — decisions D-25.1..D-25.6
- `.planning/REQUIREMENTS.md` — RPROMO-02 requirement

---

## Metadata

**Confidence breakdown:**
- Symbol classification (PoC-only vs reused): HIGH — confirmed by exhaustive grep
- Canvas default boot status: HIGH — confirmed by direct code read at line 644
- Glyph fallback gap: HIGH — confirmed by reading map-mode-toggle.ts and boot-engine-core.ts step 9b
- `pushHudTiles` extraction requirement: HIGH — two confirmed non-PoC import sites
- INV-1 fixture count: HIGH — 96 files confirmed by `find`

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 (stable domain — 30 day validity)
