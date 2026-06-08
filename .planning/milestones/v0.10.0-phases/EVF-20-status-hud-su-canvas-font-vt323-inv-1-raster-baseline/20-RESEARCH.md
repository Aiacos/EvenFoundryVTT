# Phase 20: Status HUD su Canvas + Font VT323 + INV-1 Raster Baseline — Research

**Researched:** 2026-06-06
**Domain:** Canvas layer rendering, VT323 font loading, deterministic PNG hashing, INV-1 raster contract, `map-capture` → `hud-capture` rename
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Hash algorithm: SHA-256** via Node `crypto` — deterministic, zero wasm-init cost, consistent with the `perf-probe-hash.test.ts` sha256-truncated precedent. xxhash-wasm stays reserved for the Phase 24 runtime delta loop.
- **Golden tile hashes live in a committed fixture file** under `packages/shared-render/src/fixtures/` (e.g. `*.raster-hash.json`), not as inline test constants — data-driven and reviewable.
- **Canonical RGBA source** for `buildHudTiles()` is a deterministic synthetic generator: a fixed known Status-HUD state drawn in-test into the canvas, not a checked-in PNG asset. Reproducible byte-for-byte from code, no binary blobs.
- `inv:all` must expose two clearly-labelled suites — "glyph suite" (existing ASCII fixtures) and "raster suite" (PNG-tile SHA-256 hashes). Both green is the gate.
- **Canvas becomes the default boot path in this phase.** `renderMode` defaults to `'canvas'`; the glyph/text path becomes the BLE-degraded fallback.
- BLE-safe ahead of Phase 24 delta loop because SC3 mandates `CanvasStatusHudLayer.paint()` fires **only** when `isDirty()` (after a `character.delta`).
- `renderMode` flag retained; only the default value flips to `'canvas'`.
- VT323 via `@fontsource/vt323`, loaded in Worker/canvas context with `FontFace` + `self.fonts.add(face)`, explicit `try/catch` fallback to `'16px monospace'` resolved before first frame; fallback tested explicitly (SC1).
- Static chrome (frames, labels, tab strip, backgrounds) pre-baked once into `ImageBitmap` cache at layer mount; subsequent renders GPU-blit without re-drawing chrome (SC2).

### Claude's Discretion

- Exact fixture-file naming/shape, the synthetic RGBA state chosen as canonical, the tile-iteration order for hashing, and the `inv-all.ts` suite-labelling mechanics.

### Deferred Ideas (OUT OF SCOPE)

- ~5fps xxhash delta loop → Phase 24.
- Glyph fallback-switch formalization + `?hud=raster` guard removal → Phase 25.
- Character-sheet and combat-tracker raster panels → Phases 21/23.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RFONT-01 | VT323 (`@fontsource/vt323`, self-hosted ~10KB WOFF2) loaded in canvas/Worker with try/catch fallback chain to `monospace`; resolved before first frame | §FontFace + self.fonts in Worker — verified pattern; fallback chain documented below |
| RFONT-02 | Static chrome (frames, labels, tab strip, backgrounds) pre-baked once into `ImageBitmap` cache at layer mount; GPU-blitted under dynamic content on every frame without re-rendering | §ImageBitmap pre-bake pattern; `createImageBitmap` in OffscreenCanvas context documented |
| RFONT-03 | Dynamic data (HP, slots, turns, conditions) re-renders **only the own layer** on `character.delta` / `combat.delta` reusing `hud-live-render.ts`; only dirty layer composited | §dirty-gate wiring via `CanvasLayer.isDirty()` + `CanvasCompositor` dirty-skip |
| RINV-01 | INV-1 raster contract — deterministic hash of PNG tile bytes from synthetic RGBA; `inv:all` separates glyph vs raster suites | §SHA-256 via Node crypto; `buildHudTiles()` determinism; `inv-all.ts` extension pattern |
</phase_requirements>

---

## Summary

Phase 20 is a **pure in-repo engineering phase** building directly on the Phase 19 substrate. All critical architectural decisions are locked by CONTEXT.md; the research confirms they are technically sound and identifies the exact implementation shapes needed.

The core work is: (1) implement `CanvasStatusHudLayer` — a `CanvasLayer` at `ZIndex.Z1_STATUS_HUD` that holds pre-baked chrome in an `ImageBitmap` and re-paints only when `isDirty()`; (2) load VT323 via `FontFace` + `self.fonts.add()` before the first frame, with a safe fallback for environments where `self.fonts` is unavailable; (3) establish the raster INV-1 contract using Node `crypto` SHA-256 hashes of `buildHudTiles()` output driven by a deterministic synthetic RGBA; (4) extend `inv-all.ts` with a labelled raster suite; (5) flip `LayerManager.renderMode` default to `'canvas'` and wire `boot-engine-core.ts`; (6) rename `'map-capture'` → `'hud-capture'` across all 19 production + test sites.

The `hud-capture` name and container already exist in the registry and `buildHudRasterPageSchema()`. The rename is NOT about introducing a new container — it is about propagating the existing `'hud-capture'` name through `MapBaseLayer`, `glyph-renderer.ts`, integration tests, and `container-registry.test.ts` sites that still reference the old `'map-capture'` string for the capture role in the glyph/map-mode path.

**Primary recommendation:** Implement `CanvasStatusHudLayer` as a new file under `packages/g2-app/src/status-hud/`, wire it through `LayerManager` constructor in `boot-engine-core.ts`, establish the hash fixture under `packages/shared-render/src/fixtures/`, and add the raster check to `inv-suite.ts` (`checkInv1Raster`). Keep the rename as a dedicated sweep task to contain blast radius.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| VT323 font loading + fallback | Frontend (g2-app WebView / Worker) | — | Font is loaded in the canvas render context; no server involvement |
| Static chrome pre-bake (ImageBitmap) | Frontend (g2-app, `CanvasStatusHudLayer`) | — | Chrome is drawn once onto an OffscreenCanvas, cached as ImageBitmap |
| Dynamic HUD data re-render (HP, slots) | Frontend (g2-app, `CanvasStatusHudLayer`) | Bridge (character.delta source) | Layer subscribes via `hud-live-render.ts` pattern; data originates from bridge |
| dirty-gate / compositing | Frontend (CanvasCompositor, LayerManager) | — | Compositor already manages dirty-skip per Phase 19 |
| `renderMode` default flip | Frontend (LayerManager) | boot-engine-core.ts wiring | One-line change at line 97 + constructor pass-through |
| SHA-256 tile hash fixtures | Test infrastructure (shared-render/fixtures, Node crypto) | — | Determinism via `buildHudTiles()` + Node `crypto.createHash` |
| raster suite in `inv-all.ts` | validation-harness / inv-suite.ts | — | `checkInv1` already runs `pnpm --filter @evf/shared-render test`; raster suite adds a parallel labelled check |
| `map-capture` → `hud-capture` rename | g2-app src + tests (multi-file sweep) | — | Production rename in MapBaseLayer + glyph-renderer; test rename across 14 test files |

---

## Standard Stack

### Core (all already in repo — no new prod deps except @fontsource/vt323)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fontsource/vt323` | `5.2.7` [VERIFIED: npm registry] | Self-hosted WOFF2 pixel font | Locked by CONTEXT.md; slopcheck `[OK]`; official fontsource monorepo (github.com/fontsource/font-files); 5y+ publish history (created 2020-12-23) |
| `image-q` | `4.0.0` [VERIFIED: npm registry] | Floyd-Steinberg dither | Already in `packages/g2-app/package.json`; used by `buildHudTiles()` |
| `upng-js` | `2.1.0` [VERIFIED: npm registry] | 4-bit indexed PNG encode | Already in `packages/g2-app/package.json`; used by `buildHudTiles()` |
| Node `crypto` | built-in | SHA-256 hash for raster tile fixtures | Built-in; no install needed; precedent in `perf-probe-hash.ts` (uses `crypto.subtle.digest`). For test-time fixture generation, `crypto.createHash('sha256')` (Node sync API) is simpler than the async Web Crypto API |
| `CanvasCompositor` | Phase 19 | Master 400×200 compositor | Already implemented; `_testSetMasterContext()` escape hatch for tests |
| `CanvasLayer` interface | Phase 19 | `attachCanvas` / `paint` / `isDirty` contract | Already in `layer-types.ts` |
| `buildHudTiles()` | Phase 19 | RGBA → 4 dithered 4-bit PNG tiles | Already in `hud-raster-frame.ts`; accepts `Uint8ClampedArray(400*200*4)` |

### No New Prod Dependencies

The only new install is `@fontsource/vt323` as a prod dep in `packages/g2-app`. All other capabilities are built-in or already in the repo.

**Installation (g2-app only):**
```bash
pnpm --filter @evf/g2-app add @fontsource/vt323
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@fontsource/vt323` | npm | ~5.5 yrs (created 2020-12-23) | Significant (fontsource org has 100M+/wk total) | github.com/fontsource/font-files | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

No postinstall script detected (`npm view @fontsource/vt323 scripts.postinstall` returned empty).

---

## Architecture Patterns

### System Architecture Diagram

```
character.delta (WS)
        |
        v
CanvasStatusHudLayer.isDirty() = true
        |
        v (on next LayerManager._compositeAndPush())
CanvasCompositor.composite()
  |- for dirty layer: paint() -> draws onto own OffscreenCanvas
  |     |- blit chrome ImageBitmap (pre-baked, GPU-accelerated)
  |     |- draw dynamic content (HP bar, text, slots) with VT323
  |- drawImage(layerCanvas, 0, 0) onto master 400x200
  |
  v
buildHudTiles(rgba: Uint8ClampedArray[320000])
  -> 4 x 200x100 dithered 4-bit PNG tiles
        |
        v (serialized, no concurrent sends)
pushHudTiles(bridge, tiles)
  -> bridge.updateImageRawData x4 (sequential await)
```

INV-1 raster test path:
```
makeSyntheticHudRgba()   <- deterministic RGBA from known StatusHUD state
        |
buildHudTiles(rgba)
        |
SHA-256(tile[i].bytes) for i in 0..3
        |
compare vs committed .raster-hash.json fixture
```

### Recommended Project Structure

New files for Phase 20:

```
packages/g2-app/src/
├── status-hud/
│   ├── canvas-status-hud-layer.ts     # NEW: CanvasLayer impl at Z1_STATUS_HUD
│   └── canvas-status-hud-layer.test.ts # NEW: SC1 (font fallback), SC2 (pre-bake), SC3 (dirty-gate)
├── engine/
│   └── vt323-font-loader.ts           # NEW: FontFace + self.fonts.add() with try/catch fallback
packages/shared-render/src/fixtures/
├── status-hud.raster-hash.json        # NEW: 4 SHA-256 hex strings (canonical RGBA fixture)
packages/g2-app/src/__tests__/
│   └── 20-raster-inv1.test.ts         # NEW: SC4 raster suite test (or lives in shared-render)
packages/validation-harness/src/
│   └── inv-suite.ts                   # MODIFY: add checkInv1Raster() labelled suite
```

### Pattern 1: FontFace + self.fonts.add() in Worker/WebView

**What:** Load VT323 from the bundled WOFF2 before drawing any text.
**When to use:** In `CanvasStatusHudLayer.attachCanvas()` or a dedicated `ensureFontLoaded()` called once at layer mount.

```typescript
// Source: MDN FontFace API + fontsource README pattern [ASSUMED: exact API stable in iOS 16 WKWebView Worker]
export async function ensureVt323Loaded(): Promise<string> {
  // @fontsource/vt323 ships a WOFF2 file; import the path via Vite ?url suffix
  // so we get the hashed asset URL at bundle time.
  try {
    const fontUrl = new URL(
      '@fontsource/vt323/files/vt323-latin-400-normal.woff2',
      import.meta.url,
    ).href;
    const face = new FontFace('VT323', `url(${fontUrl})`);
    await face.load();
    // self.fonts is the FontFaceSet on both main thread and Worker
    self.fonts.add(face);
    return '16px VT323';
  } catch {
    // Fallback: self.fonts may not exist in happy-dom or iOS 16 WKWebView Worker
    return '16px monospace';
  }
}
```

Key notes:
- `@fontsource/vt323` at 5.2.7 ships `files/vt323-latin-400-normal.woff2` (~10KB) [VERIFIED: npm registry].
- `self.fonts` is available in Worker scope (Web Workers inherit `FontFaceSet` from the global scope) in Chrome/Chromium. On iOS 16 WKWebView workers the spec compliance is uncertain — the `try/catch` is the correct defensive pattern per CONTEXT.md [ASSUMED: exact iOS 16 WKWebView Worker `self.fonts` support].
- `FontFace.load()` returns a Promise. The returned font family string (`'16px VT323'` or `'16px monospace'`) is stored in the layer and used as `ctx.font = fontFamily`.
- Calling `ensureVt323Loaded()` from `attachCanvas()` (which is called by `LayerManager.bundle()` before first `composite()`) guarantees font resolution before the first frame.

### Pattern 2: ImageBitmap Chrome Pre-bake

**What:** Draw the static chrome once onto a scratch OffscreenCanvas, convert to ImageBitmap, cache. On every `paint()` call, `ctx.drawImage(this._chromeBitmap, 0, 0)` then draw dynamic content on top.
**When to use:** `CanvasStatusHudLayer.attachCanvas()` after font is ready.

```typescript
// Source: MDN createImageBitmap [ASSUMED: available in OffscreenCanvas Worker context]
private async _prebakeChrome(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
): Promise<void> {
  // Create scratch canvas same size as layer
  const scratch = new OffscreenCanvas(COMPOSITOR_W, COMPOSITOR_H);
  const sCtx = scratch.getContext('2d');
  if (sCtx === null) throw new Error('[EVF] pre-bake: no 2d context');

  // Draw frames, labels, tab strip, backgrounds — static only
  _drawChrome(sCtx, this._fontFamily);

  // Convert to ImageBitmap for GPU-accelerated blit
  this._chromeBitmap = await createImageBitmap(scratch);
}
```

On `paint()`:
```typescript
paint(): void {
  const ctx = this._ctx;
  if (ctx === null || this._chromeBitmap === null) return;
  ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
  ctx.drawImage(this._chromeBitmap, 0, 0); // GPU blit — no re-draw
  _drawDynamicContent(ctx, this._snapshot, this._fontFamily);
}
```

`createImageBitmap` is available in OffscreenCanvas Worker scope in Chrome/Chromium and iOS WKWebView [ASSUMED: iOS 16 WKWebView support for createImageBitmap in workers; fallback: skip pre-bake, redraw chrome every frame if createImageBitmap throws].

**Test approach for SC2 ("paint() invoked once per session"):** spy on `ctx.fillRect` / `ctx.strokeRect` calls in `paint()`. After attaching canvas and calling `paint()` N times: the chrome draw calls (`_drawChrome` equivalent — e.g., border strokes) should appear **only in the first paint** (during pre-bake), not in subsequent `paint()` calls (which only blit the bitmap + draw dynamic content).

### Pattern 3: CanvasLayer.isDirty() dirty-gate wiring (SC3)

**What:** `CanvasStatusHudLayer` implements `isDirty()` returning `true` after receiving a `character.delta` via `hud-live-render.ts`; `paint()` resets the flag.

```typescript
// CanvasStatusHudLayer internal state
private _dirty = true; // true at init so first composite paints it

isDirty(): boolean { return this._dirty; }

paint(): void {
  // ... render ...
  this._dirty = false; // clear after paint
}

// Called by delta subscription (via makeSnapshotRenderHandler pattern from hud-live-render.ts)
private _onSnapshot(snapshot: CharacterSnapshot): void {
  this._snapshot = snapshot;
  this._dirty = true;
  // CanvasCompositor.markDirty(ZIndex.Z1_STATUS_HUD) if needed, or let isDirty() be polled
}
```

The `CanvasCompositor` already calls `entry.layer.isDirty()` → `paint()` → `entry.isDirty = false` in its `composite()` loop. Phase 20's `CanvasStatusHudLayer` just needs to set `this._dirty = true` on snapshot arrival and return `false` on subsequent calls until the next delta.

**Test spy for SC3:** inject a `vi.spyOn(layer, 'paint')`. After construction: `composite()` once (paints). Then idle: `composite()` N more times → `paint` called 0 more times. Emit a snapshot: `composite()` once more → `paint` called exactly 1 more time.

### Pattern 4: Deterministic SHA-256 Raster Fixture (SC4 / RINV-01)

**What:** Generate a 400×200 synthetic RGBA from a fixed known state, run `buildHudTiles()`, SHA-256 hash each tile's bytes, commit as fixture.

```typescript
// In test file — synthetic RGBA (Claude's discretion: a solid-color fill is the simplest deterministic source)
// Note: buildHudTiles() is deterministic for a given RGBA input because:
//   Floyd-Steinberg dither is deterministic (same input → same output)
//   UPNG.encode() is deterministic (deflate with same seed)
function makeSyntheticStatusRgba(): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(400 * 200 * 4);
  // A simple gradient (same as hud-raster-frame.test.ts makeSyntheticRgba pattern)
  for (let i = 0; i < 400 * 200; i++) {
    const v = i % 256;
    buf[i * 4] = v;     // R
    buf[i * 4 + 1] = v; // G
    buf[i * 4 + 2] = v; // B
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

// Hash helper — Node crypto (test environment only)
import { createHash } from 'node:crypto';
function sha256hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// SC4 test
const rgba = makeSyntheticStatusRgba();
const tiles = buildHudTiles(rgba);
const hashes = tiles.map(t => sha256hex(t.bytes));
// First run: writes fixture. Subsequent runs: asserts fixture matches.
```

**Fixture format** (`packages/shared-render/src/fixtures/status-hud.raster-hash.json`):
```json
{
  "version": 1,
  "description": "SHA-256 hashes of 4 HUD tile PNGs from canonical synthetic RGBA (Phase 20)",
  "tiles": [
    { "index": 0, "containerName": "hud-tile-0", "sha256": "<hex>" },
    { "index": 1, "containerName": "hud-tile-1", "sha256": "<hex>" },
    { "index": 2, "containerName": "hud-tile-2", "sha256": "<hex>" },
    { "index": 3, "containerName": "hud-tile-3", "sha256": "<hex>" }
  ]
}
```

**Determinism notes:**
- `buildHudTiles()` calls `image-q`'s `applyPaletteSync` (Floyd-Steinberg) and `UPNG.encode()`. Both are deterministic for identical input across runs and environments (verified by existing `hud-raster-frame.test.ts` which asserts tile 0 ≠ tile 3, implying both are reproducible). [ASSUMED: UPNG.encode determinism across Node.js versions — the DEFLATE output is implementation-defined; testing on the same Node version guards this]
- For maximum determinism safety, the fixture should be generated on the first `pnpm test` run and committed. CI re-runs compare; a DEFLATE-non-determinism failure would require upgrading to a hash-of-uncompressed-tile instead.

### Pattern 5: inv-all.ts Raster Suite Extension

**What:** `inv-suite.ts`'s `checkInv1` currently runs `pnpm --filter @evf/shared-render test --run` which covers glyph `matchAsciiFixture` tests. The raster suite is a separate labelled check.

**Approach A (recommended — simpler):** Add `checkInv1Raster()` in `inv-suite.ts` that runs `pnpm --filter @evf/g2-app test -- --run --testNamePattern RINV-01`. Label it "raster suite" in the table. Both `checkInv1Glyph` (renamed from current `checkInv1`) and `checkInv1Raster` contribute to `allGreen`.

**Approach B:** Run both via a single `inv:all` invocation with a `--suites glyph,raster` flag. More complex; not needed for Phase 20.

Approach A requires renaming the current result entry from `INV-1` to `INV-1 (glyph)` and adding `INV-1 (raster)` — or keeping both under `INV-1` with a compound detail string. Claude's discretion per CONTEXT.md.

### Pattern 6: `map-capture` → `hud-capture` Rename (blast radius)

The rename is specific: `'map-capture'` is the container name used by the **glyph/map-mode path** (MapBaseLayer, glyph-renderer). `'hud-capture'` already exists in the registry for the **canvas-mode HUD page**. The rename task is about making the glyph/map-mode path consistently use `'hud-capture'` as its capture container name (aligning the two paths).

**Production sites to change (7):**
1. `packages/g2-app/src/raster/map-base-layer.ts` line 128: `return 'map-capture'` → `return 'hud-capture'`
2. `packages/g2-app/src/raster/map-base-layer.ts` line 223-224: `resolveContainerIdField('map-capture')` + `containerName: 'map-capture'`
3. `packages/g2-app/src/raster/glyph-renderer.ts` line 197 + 202: default param `'map-capture'` → `'hud-capture'`
4. `packages/g2-app/src/engine/container-registry.ts`: `'map-capture'` entry in CONTAINER_REGISTRY (id 7) rename to `'hud-capture'` (the existing `'hud-capture'` at id 4 in the HUD raster page namespace is separate) — **WAIT**: the `'hud-capture'` with id 4 is already in the REGISTRY as the canvas-mode capture; the `'map-capture'` with id 7 is the glyph-mode map capture. These are different containers in different page schemas. Renaming `'map-capture'` → `'hud-capture-map'` (or similar) avoids collision — but the CONTEXT.md says `'map-capture'` → `'hud-capture'`, implying the map-mode container gets the `'hud-capture'` name. **Clarification needed in plan:** can two entries in CONTAINER_REGISTRY share the name `'hud-capture'`? Currently no — they have different IDs (4 vs 7). If the rename is `'map-capture'` → `'hud-capture'` AND the canvas-mode container keeps the existing `'hud-capture'` key, that is a name collision in CONTAINER_REGISTRY.

**Recommended resolution (Claude's discretion):** Rename `'map-capture'` → `'hud-capture-map'` in CONTAINER_REGISTRY (preserving the existing `'hud-capture'` key for the canvas-mode capture at id 4), OR rename `'map-capture'` → `'map-capture-glyph'`. The test files that assert `getCaptureContainer() === 'map-capture'` should be updated to match whatever name is chosen. Check with existing test in `container-registry.test.ts` line 86: `expect(captures[0]?.containerName).toBe('map-capture')` — this test asserts the base-page capture container; if renamed, the test string changes.

**Alternative (simpler):** Keep `'map-capture'` in CONTAINER_REGISTRY as-is for the glyph base page (it is a different namespace from the HUD raster page). The CONTEXT.md's reference to `'map-capture'` → `'hud-capture'` may refer only to the **LayerManager assertion site** and test stubs — not the CONTAINER_REGISTRY entry itself. The `getCaptureContainer()` return value in integration tests (lines like `return 'map-capture'` in 04b/05/06/08/09/13 smoke tests) would then become `return 'hud-capture'` only for canvas-mode layers. Clarify this intent in the plan.

**Test sites to change (12 files, ~47 occurrences in tests):**
- `layer-manager.test.ts`: ~30 occurrences of `'map-capture'` in `makeMockLayer`/`makeCountedLayer` calls
- `04b-integration-smoke.test.ts`, `05-panel-integration-smoke.test.ts`, `06-cross-overlay-reachability.test.ts`, `08-integration-smoke.test.ts`, `09-integration-smoke.test.ts`, `13-integration-smoke.test.ts`: 1-2 occurrences each
- `container-registry.test.ts`: 5 occurrences
- `map-base-layer.test.ts`, `glyph-renderer.test.ts`: 2-3 occurrences each
- `conc-conflict-dispatcher.test.ts`: 1 occurrence

**Ordering concern:** the rename must be atomic within one commit so no test references a name that no longer exists in the registry.

### Anti-Patterns to Avoid

- **Calling `self.fonts.add()` without try/catch:** `self.fonts` is `undefined` in happy-dom test environment. The try/catch fallback is mandatory (not optional).
- **Using `Promise.all` for `updateImageRawData`:** ADR-0013 Amendment 1 CM-01 — serialized sends only (`for...of` + `await`). `pushHudTiles()` already handles this; do not bypass it.
- **Checking `isDirty()` in the layer's `paint()` body:** the compositor calls `isDirty()` externally and skips `paint()` for clean layers. The layer should not double-guard; reset `_dirty = false` AT THE END of `paint()`.
- **Building chrome inside `paint()` every call:** defeats the pre-bake. Chrome construction belongs in `attachCanvas()` (which is called once at mount).
- **Hashing canvas-rendered text output for RINV-01:** the locked decision explicitly forbids this because canvas text is non-deterministic across environments. Use the synthetic RGBA → `buildHudTiles()` pipeline.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PNG encoding | Custom encoder | `upng-js` (already in repo) | 4-bit indexed-palette PNG is complex; existing `buildHudTiles()` pipeline already handles it |
| Floyd-Steinberg dither | Custom FS implementation | `image-q` (already in `buildHudTiles()`) | Correct error propagation is subtle; existing code is tested |
| Font binary distribution | Check in .woff2 file | `@fontsource/vt323` npm package | Package bundles all variants; versioned; tree-shakable |
| Deterministic hash | Web Crypto `subtle.digest` (async) | Node `crypto.createHash('sha256')` (sync) | In test environment, the async Web Crypto adds unnecessary complexity; Node crypto is simpler and faster for fixture generation |
| INV-1 raster snapshot | `toMatchFileSnapshot` on raw PNG bytes | SHA-256 hash comparison + JSON fixture | PNG bytes include metadata that may vary; hashing the content is stable |

**Key insight:** the Phase 19 substrate (`buildHudTiles`, `CanvasCompositor`, `CanvasLayer`) already handles the hard parts. Phase 20 adds the canvas-drawing layer on top, not a new pipeline.

---

## Common Pitfalls

### Pitfall 1: `self.fonts` Not Available in happy-dom

**What goes wrong:** `self.fonts.add(face)` throws `TypeError: Cannot read properties of undefined (reading 'add')` in happy-dom test environment.
**Why it happens:** `happy-dom` does not implement `FontFaceSet` on the global `self`.
**How to avoid:** The `try/catch` fallback pattern in `ensureVt323Loaded()` catches this and returns `'16px monospace'`. Tests must explicitly test the fallback path (SC1): mock `self.fonts` as `undefined` and assert the returned font family is `'16px monospace'`.
**Warning signs:** Tests that call `ensureVt323Loaded()` without the try/catch will fail with TypeError in CI.

### Pitfall 2: `createImageBitmap` Not Available in happy-dom

**What goes wrong:** `createImageBitmap(scratch)` throws in happy-dom (no bitmap rendering support).
**Why it happens:** happy-dom does not implement `createImageBitmap`.
**How to avoid:** The `_prebakeChrome()` method should be called only in production (real canvas env). Tests inject a mock layer that skips pre-bake. The `_testSetMasterContext` pattern from `CanvasCompositor` applies here too — `CanvasStatusHudLayer` should accept an optional `_testBypassPrebake` flag or expose a test-override method. In the test, spy on `paint()` directly rather than testing bitmap creation.
**Warning signs:** Tests calling `attachCanvas()` on a real canvas context in happy-dom will fail.

### Pitfall 3: `renderMode` Default Flip Breaks Existing Tests

**What goes wrong:** Flipping `private renderMode: 'canvas' | 'glyph' = 'glyph'` to `'canvas'` in `layer-manager.ts` would break ~50 existing glyph-mode tests that expect the glyph schema.
**Why it happens:** The default flip in the LayerManager class affects all 2-arg constructor call sites.
**How to avoid:** The flip must happen in `boot-engine-core.ts` by calling `layerManager.setRenderMode('canvas')` explicitly, NOT by changing the default in the class. OR: the constructor signature gains a `renderMode?` parameter defaulting to `'glyph'`, and `boot-engine-core.ts` passes `'canvas'`. The default in the class stays `'glyph'` to preserve all existing test behavior.
**Warning signs:** All `LMT-RAST-*` tests that assert `_flushPage` uses the glyph schema would fail.

### Pitfall 4: UPNG.encode Non-Determinism Across Environments

**What goes wrong:** The SHA-256 of tile bytes differs between developer machine and CI (different zlib/deflate implementations).
**Why it happens:** DEFLATE is an algorithm with degrees of implementation freedom (compression level, huffman tables). `upng-js` uses a fixed-level encode, but Node.js version changes can affect `zlib` behavior.
**How to avoid:** Generate the fixture on CI (on first run, `toMatchFileSnapshot` semantics — Vitest creates the file if absent, then asserts on subsequent runs). If cross-environment non-determinism is detected, fall back to hashing the **raw dithered RGBA bytes** before PNG encoding (which is truly deterministic regardless of deflate implementation).
**Warning signs:** CI green but developer red (or vice versa) with a fixture mismatch on the SHA-256 value.

### Pitfall 5: `'map-capture'` / `'hud-capture'` Name Collision in CONTAINER_REGISTRY

**What goes wrong:** Both `'map-capture'` (id 7, glyph base page) and `'hud-capture'` (id 4, HUD raster page) exist in `CONTAINER_REGISTRY`. Renaming `'map-capture'` to `'hud-capture'` would create a duplicate key — JavaScript objects silently overwrite duplicate keys, keeping only the last value.
**Why it happens:** `CONTAINER_REGISTRY` is a plain `Record<string, ContainerRegistryEntry>`. Duplicate keys are legal JavaScript but semantically incorrect.
**How to avoid:** Use a different target name for the renamed container (e.g., `'map-capture-glyph'` or keep `'map-capture'` in the registry and only rename the `getCaptureContainer()` return value in `MapBaseLayer`). The plan must clarify this.
**Warning signs:** `resolveContainerId('map-capture')` returning the wrong ID after a naive rename.

### Pitfall 6: ImageBitmap Cache Lost on Re-attach

**What goes wrong:** If `LayerManager` calls `attachCanvas()` a second time (e.g., after a bundle reset), the `_chromeBitmap` is replaced by a new pre-bake. This is correct behavior but must be async-awaited.
**Why it happens:** `attachCanvas()` is synchronous in the `CanvasLayer` interface but pre-baking is async.
**How to avoid:** Make `attachCanvas` return a Promise (breaking the interface) OR do the async pre-bake lazily in `paint()` (first paint detects null bitmap → awaits pre-bake → paints). The lazy approach is simpler but requires `paint()` to be async, which conflicts with the synchronous `paint()` signature in `CanvasLayer`. Recommended: pre-bake as a fire-and-forget in `attachCanvas()`, store a `Promise<void>` flag, and have `paint()` check if the pre-bake is done (if not yet done, draw chrome inline as fallback on the first frame).

---

## Runtime State Inventory

> This is a rename/refactor phase for `'map-capture'` → `'hud-capture'`. The rename is string-literal only in TypeScript source; no external runtime state stores this string.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `'map-capture'` is a container name in in-memory SDK calls; not persisted to any database or datastore | None |
| Live service config | None — Even Hub SDK container names are ephemeral (re-sent on each `rebuildPageContainer` call) | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no env var references `'map-capture'` | None |
| Build artifacts | None — `packages/foundry-module/release/` artifacts don't reference g2-app container names | None |

The rename is a **pure source-code change**: update TypeScript string literals in 19 files, no data migration required.

---

## Code Examples

### CanvasStatusHudLayer — skeleton (synthesized from Phase 19 patterns)

```typescript
// Source: Phase 19 CanvasCompositor + CanvasLayer patterns [ASSUMED: exact signature]
import type { CanvasLayer, ZIndex } from '../engine/layer-types.js';
import { COMPOSITOR_W, COMPOSITOR_H } from '../engine/canvas-compositor.js';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { ensureVt323Loaded } from './vt323-font-loader.js';

export class CanvasStatusHudLayer implements CanvasLayer {
  public readonly id = 'canvas-status-hud';
  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  private _fontFamily = '16px monospace';
  private _chromeBitmap: ImageBitmap | null = null;
  private _snapshot: CharacterSnapshot | null = null;
  private _dirty = true; // dirty at init — first composite always paints

  async attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('[EVF] CanvasStatusHudLayer: no 2d context');
    this._ctx = ctx as OffscreenCanvasRenderingContext2D;
    this._fontFamily = await ensureVt323Loaded();
    await this._prebakeChrome();
    this._dirty = true; // mark dirty after attach so first paint runs
  }

  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) return;
    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
    if (this._chromeBitmap !== null) {
      ctx.drawImage(this._chromeBitmap, 0, 0); // GPU blit
    }
    _drawDynamic(ctx, this._snapshot, this._fontFamily);
    this._dirty = false; // MUST reset at end of paint
  }

  isDirty(): boolean { return this._dirty; }

  draw(): Promise<void> { return Promise.resolve(); } // CanvasLayer: LayerManager calls paint(), not draw()

  destroy(): void { /* unsubscribe from WS events */ }

  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 0 }; // canvas mode: zero-zero per ADR-0013 Amendment 1
  }

  // Called by delta subscription
  updateSnapshot(snapshot: CharacterSnapshot): void {
    this._snapshot = snapshot;
    this._dirty = true;
  }
}
```

Note: `attachCanvas()` as defined in `layer-types.ts` is synchronous (`attachCanvas(canvas: ...): void`). The async pre-bake must be handled carefully — see Pitfall 6 above. The plan should decide: (a) make `attachCanvas` async (breaking the interface — requires updating the type) OR (b) fire-and-forget the async pre-bake from within a sync `attachCanvas`.

### Node crypto SHA-256 for test fixtures

```typescript
// Source: Node.js built-in crypto, verified available in test environment
import { createHash } from 'node:crypto';

function sha256hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// Usage
const tiles = buildHudTiles(makeSyntheticStatusRgba());
const hashes = tiles.map(t => ({ index: t.containerID, sha256: sha256hex(t.bytes) }));
```

### INV-1 raster suite check (inv-suite.ts)

```typescript
// Source: based on checkInv1 pattern in inv-suite.ts [ASSUMED: exact flag syntax]
async function checkInv1Raster(repoRoot: string): Promise<InvResult> {
  const { exitCode, stderr } = await runSpawn(
    'pnpm',
    ['--filter', '@evf/g2-app', 'test', '--', '--run', '--testNamePattern', 'RINV-01'],
    { cwd: repoRoot, timeoutMs: 60_000 },
  );
  if (exitCode === 0) {
    return { id: 'INV-1', status: 'green', detail: 'raster suite: SHA-256 tile hashes match fixture' };
  }
  const hint = extractFirstError(stderr) ?? 'raster hash fixture mismatch';
  return { id: 'INV-1', status: 'red', detail: `raster suite: ${hint}` };
}
```

The `InvId` type currently only covers `'INV-1' | 'INV-2' | 'INV-3' | 'INV-4' | 'INV-5'`. To add a separate raster suite label, either extend `InvId` to include `'INV-1R'` or merge the two checks into a compound `checkInv1` that runs both and reports both statuses.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| glyph-only `status-hud` text container | canvas-composited 400×200 raster surface | Phase 19 substrate; Phase 20 activates | Full typography control, density, visual richness |
| INV-1 via `matchAsciiFixture` (ASCII text) | INV-1 via SHA-256 PNG tile hash (raster) | Phase 20 | New fixture type; glyph suite remains unchanged |
| `renderMode = 'glyph'` (default) | `renderMode = 'canvas'` (default, set in boot-engine-core) | Phase 20 | Canvas path becomes production default |
| `FontFace` + font loading (none — SDK font only) | `FontFace` + `self.fonts.add()` + VT323 | Phase 20 | Custom pixel font replaces SDK's fixed 27px font |

**Deprecated/outdated:**
- `hud-canvas-renderer.ts` `renderHudFrame()`: the PoC canvas renderer that used `document.createElement` / `OffscreenCanvas` and `14px monospace`. Phase 20 replaces its role with `CanvasStatusHudLayer.paint()`. The PoC file may be kept as reference or removed (Claude's discretion).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `self.fonts.add()` is not available in iOS 16 WKWebView Worker context (hence try/catch needed) | §Pattern 1 | Low: the fallback to `'16px monospace'` is the correct defensive pattern regardless |
| A2 | `createImageBitmap` is available in iOS 16 WKWebView Worker context for chrome pre-bake | §Pattern 2 | Medium: if unavailable, must redraw chrome every `paint()` call (no GPU pre-bake); visually correct but slightly more CPU per frame |
| A3 | `UPNG.encode()` output is byte-identical across Node.js versions (for the same input) | §Pattern 4 / Pitfall 4 | Medium: if DEFLATE output varies, SHA-256 fixture will fail on CI with different Node.js minor. Fallback: hash raw dithered RGBA before UPNG encoding |
| A4 | `attachCanvas()` can be made async in `CanvasLayer` interface without breaking Phase 19 substrate | §Pattern 6 (chrome pre-bake) | Low: if sync is required, use lazy-init pattern inside `paint()` |
| A5 | The `'map-capture'` → `'hud-capture'` rename in CONTEXT.md means the MapBaseLayer's `getCaptureContainer()` should return `'hud-capture'` (not that the CONTAINER_REGISTRY entry key is renamed to `'hud-capture'`, which would collide with the existing HUD raster page entry) | §Pattern 6 / Pitfall 5 | High: if the CONTAINER_REGISTRY key is naively renamed, duplicate key overwrites the HUD raster capture entry (id 4). The plan MUST clarify the exact rename scope. |

---

## Open Questions

1. **`attachCanvas()` sync vs async**
   - What we know: `CanvasLayer.attachCanvas()` is declared synchronous in `layer-types.ts`. Chrome pre-bake requires `createImageBitmap()` which is async.
   - What's unclear: should the interface change to `attachCanvas(): Promise<void>`, or should the async work be deferred inside `paint()`?
   - Recommendation: Change the interface to `attachCanvas(): Promise<void>` in `layer-types.ts` (no existing implementations yet in Phase 19) — clean, idiomatic. Update `LayerManager.bundle()` to `await layer.attachCanvas(canvas)`.

2. **`'map-capture'` rename scope in CONTAINER_REGISTRY**
   - What we know: `'hud-capture'` already exists in the registry at id 4 (HUD raster page capture). `'map-capture'` at id 7 is the glyph base page capture.
   - What's unclear: does CONTEXT.md intend to rename the CONTAINER_REGISTRY key too, or only the string passed to `getCaptureContainer()`?
   - Recommendation: Do NOT rename the CONTAINER_REGISTRY key (collision risk). Only update `MapBaseLayer.getCaptureContainer()` return value from `'map-capture'` to `'hud-capture'`. Update all test stubs accordingly. Document that the registry key `'map-capture'` (id 7) and `'hud-capture'` (id 4) are distinct containers in distinct page schemas.

3. **`inv-all.ts` raster suite label design**
   - What we know: `InvId` union currently has 5 values; adding a 6th requires extending the type.
   - What's unclear: single INV-1 with compound detail, or separate INV-1G / INV-1R entries?
   - Recommendation: extend `InvId` with `'INV-1G'` (glyph) and `'INV-1R'` (raster), keep `'INV-1'` as a compound summary, or use a compound detail string on a single `INV-1` entry. Simplest: keep `InvId = 'INV-1'` and return a compound detail `'glyph suite: green; raster suite: green'`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `crypto` | SHA-256 fixture generation | ✓ | Node 24.x LTS | — |
| `@fontsource/vt323` | VT323 font loading | not yet installed | 5.2.7 (latest) | `'16px monospace'` (tested fallback) |
| `image-q` | `buildHudTiles()` | ✓ (in g2-app deps) | 4.0.0 | — |
| `upng-js` | `buildHudTiles()` | ✓ (in g2-app deps) | 2.1.0 | — |
| happy-dom | Test environment | ✓ | 20.9.0 | — |
| Vitest 4 | Test runner | ✓ | 4.1.5 | — |

**Missing dependencies with no fallback:**
- None (VT323 font has a tested monospace fallback)

**Missing dependencies with fallback:**
- `@fontsource/vt323`: install via `pnpm --filter @evf/g2-app add @fontsource/vt323`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root workspace config) |
| Quick run command | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'SC[1-4]|RINV-01|CSH-'` |
| Full suite command | `pnpm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RFONT-01 | VT323 loaded; fallback to monospace if `self.fonts` unavailable | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'SC1'` | ❌ Wave 0 — `canvas-status-hud-layer.test.ts` |
| RFONT-02 | Chrome pre-baked once; `paint()` calls do not re-draw chrome | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'SC2'` | ❌ Wave 0 |
| RFONT-03 | `paint()` fires only when `isDirty()` true; idle composites skip `paint()` | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'SC3'` | ❌ Wave 0 |
| RINV-01 | SHA-256 tile hashes match committed fixture | unit (deterministic) | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'RINV-01'` | ❌ Wave 0 — `20-raster-inv1.test.ts` |

### Sampling Rate

- **Per task commit:** `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'SC[1-4]|RINV-01'`
- **Per wave merge:** `pnpm test -- --run` (workspace-wide)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` — `CanvasStatusHudLayer` implementation
- [ ] `packages/g2-app/src/status-hud/canvas-status-hud-layer.test.ts` — SC1 (font fallback), SC2 (pre-bake once), SC3 (dirty-gate)
- [ ] `packages/g2-app/src/status-hud/vt323-font-loader.ts` — `ensureVt323Loaded()` with try/catch
- [ ] `packages/g2-app/src/__tests__/20-raster-inv1.test.ts` — RINV-01: synthetic RGBA → `buildHudTiles` → SHA-256 hashes vs fixture
- [ ] `packages/shared-render/src/fixtures/status-hud.raster-hash.json` — committed hash fixture (auto-generated on first run)

---

## Security Domain

> `security_enforcement` not explicitly disabled — section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 20 is pure canvas rendering |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | No access control changes |
| V5 Input Validation | yes (low) | `CharacterSnapshot` validated via `CharacterSnapshotSchema.safeParse` before passing to renderer (existing pattern in `hud-live-render.ts`) |
| V6 Cryptography | no | SHA-256 for INV-1 fixture is not security-sensitive (no secrets hashed) |

### Known Threat Patterns for Canvas/Font Loading

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `character.delta` payload reaching canvas renderer | Tampering | `CharacterSnapshotSchema.safeParse` gate in `makeSnapshotRenderHandler` (already implemented in Phase 19 `hud-live-render.ts`) |
| Font URL injection (RFONT-01) | Tampering | VT323 URL is hardcoded at bundle time via Vite `import.meta.url` + `new URL(...)` — not user-controlled |

---

## Sources

### Primary (HIGH confidence)

- Phase 19 source code (`canvas-compositor.ts`, `layer-types.ts`, `layer-manager.ts`, `hud-raster-frame.ts`, `container-registry.ts`, `hud-canvas-renderer.ts`) — read directly from repo
- `packages/g2-app/package.json` — verified existing deps (image-q 4.0.0, upng-js 2.1.0, xxhash-wasm 1.1.0, zod 4.4.3)
- `packages/g2-app/src/engine/perf-probe-hash.ts` — SHA-256 precedent using `crypto.subtle.digest`
- `packages/validation-harness/src/inv-suite.ts` — `checkInv1` implementation pattern
- `packages/g2-app/src/hud/hud-raster-frame.test.ts` — `makeSyntheticRgba` pattern for deterministic test input
- `packages/g2-app/src/engine/__tests__/canvas-compositor.test.ts` — test mock pattern (`_testSetMasterContext`, `vi.fn()` for `paint()`)

### Secondary (MEDIUM confidence)

- `npm view @fontsource/vt323` — version 5.2.7, created 2020-12-23, official fontsource org, `[VERIFIED: npm registry]`
- slopcheck `[OK]` verdict for `@fontsource/vt323`
- `grep -rn "'map-capture'"` across repo — 53 occurrences in 19 files mapped

### Tertiary (LOW confidence)

- [ASSUMED] iOS 16 WKWebView Worker `self.fonts` support — unverifiable without hardware
- [ASSUMED] `createImageBitmap` in iOS 16 WKWebView Worker — unverifiable without hardware
- [ASSUMED] UPNG.encode byte-determinism across Node.js minor versions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in repo; only `@fontsource/vt323` new; verified via npm
- Architecture: HIGH — building directly on Phase 19 substrate; patterns are confirmed by reading source code
- Pitfalls: HIGH — derived from reading actual code (happy-dom lacks FontFaceSet and createImageBitmap; `renderMode` default must NOT change in class)
- Rename blast radius: HIGH — grepped actual occurrences; open question on CONTAINER_REGISTRY collision documented

**Research date:** 2026-06-06
**Valid until:** 2026-07-06 (stable; no external dependencies changing rapidly)

---

## RESEARCH COMPLETE
