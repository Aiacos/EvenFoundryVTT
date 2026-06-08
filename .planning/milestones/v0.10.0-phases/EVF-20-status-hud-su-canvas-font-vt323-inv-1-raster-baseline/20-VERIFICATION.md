---
phase: 20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline
verified: 2026-06-06T08:47:09Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "VT323 renders correctly on real G2 hardware / iOS 16 WKWebView Worker"
    expected: "HUD raster page loads (4 image tiles + 1 capture text = 5 containers); VT323 glyphs are legible at 27px on the G2 phosphor display; HP/AC/level render in the correct containers; monospace fallback NOT used (indicates font loaded successfully)"
    why_human: "self.fonts (FontFaceSet) + createImageBitmap in iOS 16 WKWebView Worker context cannot be exercised in CI happy-dom environment; ADR-0005 Branch A hardware-pending convention applies"
  - test: "Idle BLE bandwidth near-zero with canvas default boot"
    expected: "Boot canvas HUD, leave idle (no character.delta), confirm no tile re-push on the wire (paint() isDirty=false, no _compositeAndPush calls)"
    why_human: "Requires real BLE link instrumentation and a paired G2/phone pair; cannot be verified without live hardware"
---

# Phase 20: Status HUD su Canvas + Font VT323 + INV-1 Raster Baseline — Verification Report

**Phase Goal:** La status HUD (z=1) è renderizzata su canvas con font pixel VT323 e chrome statico pre-baked, il contratto INV-1 raster (hash PNG tile) è stabilito, e `inv:all` distingue la glyph suite dalla raster suite.
**Verified:** 2026-06-06T08:47:09Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `@fontsource/vt323` installed; `ensureVt323Loaded()` resolves VT323 (or `'16px monospace'` fallback) before first frame; fallback tested explicitly | VERIFIED | `packages/g2-app/package.json` line 19: `"@fontsource/vt323": "^5.2.7"`; `vt323-font-loader.ts` exports `ensureVt323Loaded(): Promise<string>` with try/catch; 3 tests in `vt323-font-loader.test.ts` all pass (including SC1 explicit fallback test via `globalThis.fonts = undefined`) |
| 2 | Static chrome pre-baked once into ImageBitmap cache at layer mount; subsequent renders reuse via GPU blit without re-drawing chrome | VERIFIED | `canvas-status-hud-layer.ts` `_prebakeChrome()` draws chrome onto scratch `OffscreenCanvas` and caches via `createImageBitmap`; `paint()` branches on `_chromeBitmap !== null` to GPU-blit vs inline fallback; 4 SC2 tests in `canvas-status-hud-layer.test.ts` pass |
| 3 | `CanvasStatusHudLayer.paint()` invoked only when `isDirty()` (after `character.delta`); idle frames trigger no re-paint/re-push | VERIFIED | `_dirty = true` at construction; `_dirty = false` as LAST line of `paint()`; `_onDelta` sets `_dirty = true` only on valid `CharacterSnapshotSchema.safeParse` pass; 5 SC3 tests verify the full dirty-gate lifecycle including spy-based call-count assertion |
| 4 | `inv:all` shows two distinct labelled suites — "glyph suite" (ASCII fixtures) and "raster suite" (SHA-256 PNG tile hashes from `buildHudTiles()`); both green required | VERIFIED | `inv-suite.ts` exports `checkInv1Glyph` + `checkInv1Raster` + `mergeInv1Results`; `inv:all:skip-inv2` output: `INV-1 | green | glyph suite: pass; raster suite: pass`; fixture `status-hud.raster-hash.json` committed with 4 64-char SHA-256 hashes; FALSE-PASS guard implemented and tested (IS-09d) |
| 5 | Canvas/HUD capture container correctly named and wired as `'hud-capture'`; `'map-capture'` preserved for glyph path; no regressions across all sites | VERIFIED (override: FALLBACK path taken; see note below) | `container-registry.ts` has both `'hud-capture'` (id=4, 576×288, canvas page) and `'map-capture'` (id=7, 576×234, glyph page) as geometrically distinct entries; `CanvasStatusHudLayer.getCaptureContainer()` returns `'hud-capture'`; `MapBaseLayer` retains `'map-capture'`; all 3179 workspace tests pass with no regressions |

**Score:** 5/5 truths verified (software)

**SC5 FALLBACK note:** The ROADMAP literal wording described a "rename" of `'map-capture'` → `'hud-capture'`. Plan 20-05 determined this was not a pure rename but a dual-container architecture: `'hud-capture'` (id=4, full-screen 576×288, canvas HUD page) and `'map-capture'` (id=7, content-area 576×234, glyph base page) are geometrically distinct with different page-namespace roles. PRIMARY merge was rejected; FALLBACK (keep both) was applied. The SPIRIT of SC5 — that the canvas capture container is correctly named and wired as `'hud-capture'` with no regressions — is fully met. The ~106 `'map-capture'` references in the glyph path are intentional and correct.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/g2-app/src/status-hud/vt323-font-loader.ts` | VT323 font loader with fallback | VERIFIED | Exists, substantive (70 lines), wired into `CanvasStatusHudLayer._initAsync()` |
| `packages/g2-app/src/status-hud/__tests__/vt323-font-loader.test.ts` | 3 SC1 tests | VERIFIED | Exists, 3 tests, all pass |
| `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` | CanvasLayer impl with pre-bake + dirty-gate | VERIFIED | Exists, substantive (436 lines), wired into `boot-engine-core.ts` |
| `packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts` | SC2/SC3 + contract tests | VERIFIED | Exists, 17 tests, all pass |
| `packages/g2-app/src/__tests__/20-raster-inv1.test.ts` | RINV-01 SHA-256 fixture test | VERIFIED | Exists, 1 RINV-01 test, passes |
| `packages/shared-render/src/fixtures/status-hud.raster-hash.json` | 4-tile golden fixture | VERIFIED | Exists, committed, 4 SHA-256 entries (64-char hex each) |
| `packages/validation-harness/src/inv-suite.ts` | Two labelled INV-1 sub-suites | VERIFIED | `checkInv1Glyph` + `checkInv1Raster` + `mergeInv1Results` all present and wired |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `CanvasStatusHudLayer` | `ensureVt323Loaded()` | `_initAsync()` call | WIRED | `import { ensureVt323Loaded } from './vt323-font-loader.js'`; called in `_initAsync` as `this._fontFamily = await ensureVt323Loaded()` |
| `boot-engine-core.ts` | `CanvasStatusHudLayer` | `new CanvasStatusHudLayer({wsEvents})` + `bundle()` | WIRED | Lines 61/96 imports; line 607 `new CanvasCompositor()`; line 629 `layerManager.setRenderMode('canvas')`; line 779 `new CanvasStatusHudLayer(...)` |
| `inv-suite.ts` `checkInv1Raster` | `20-raster-inv1.test.ts` | `--testNamePattern RINV-01` spawn | WIRED | `runSpawn('pnpm', ['--filter', '@evf/g2-app', 'test', '--', '--run', '--testNamePattern', 'RINV-01'])` |
| `20-raster-inv1.test.ts` | `status-hud.raster-hash.json` | `existsSync/readFileSync` at `FIXTURE_PATH` | WIRED | `path.resolve(import.meta.dirname, '../../../shared-render/src/fixtures/status-hud.raster-hash.json')` |
| `buildHudRasterPageSchema()` | `'hud-capture'` entry | `CONTAINER_REGISTRY['hud-capture']` lookup | WIRED | Lines 429-437 in `container-registry.ts`; throws if missing |
| `CanvasStatusHudLayer.getCaptureContainer()` | `'hud-capture'` | direct return | WIRED | Returns `'hud-capture'`; satisfies `_assertCaptureInvariant()` in canvas mode |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `canvas-status-hud-layer.ts` | `_snapshot: CharacterSnapshot` | `character.delta` WS event → `_onDelta()` → `CharacterSnapshotSchema.safeParse` | Yes — validated live WS payloads from bridge; `null` initial state renders idle placeholder | FLOWING |
| `20-raster-inv1.test.ts` | tile `bytes` | `buildHudTiles(makeSyntheticRgba())` deterministic gradient | Yes — real PNG bytes from `buildHudTiles()` pipeline; SHA-256 compared against committed fixture | FLOWING |
| `inv-suite.ts` `checkInv1Raster` | `exitCode, stdout, stderr` | `runSpawn(pnpm, ['--filter', '@evf/g2-app', 'test', ...])` | Yes — live test runner output; FALSE-PASS guard prevents silent empty-run | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SC1: vt323-font-loader fallback test passes | `pnpm --filter @evf/g2-app test -- --run --testPathPattern vt323-font-loader` | 1518 tests passed | PASS |
| SC2/SC3: canvas-status-hud-layer tests pass | `pnpm --filter @evf/g2-app test -- --run --testPathPattern canvas-status-hud-layer` | 1518 tests passed | PASS |
| SC4: RINV-01 raster hash test passes | `pnpm --filter @evf/g2-app test -- --run --testPathPattern 20-raster-inv1` | 1518 tests passed | PASS |
| SC4 suite: inv:all glyph+raster both green | `pnpm --filter @evf/validation-harness inv:all:skip-inv2` | `INV-1 | green | glyph suite: pass; raster suite: pass` | PASS |
| Full workspace: no regressions | `pnpm test -- --run` | 3179/3179 tests passed | PASS |

---

### Probe Execution

Step 7c: No explicit probe scripts declared in PLAN/SUMMARY for Phase 20. `inv:all:skip-inv2` serves as the integration probe and was run above (exit 0, ALL GREEN).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RFONT-01 | 20-01 | VT323 font loaded via FontFace + self.fonts.add with try/catch fallback; resolved before first frame | PARTIAL | Software implementation VERIFIED (vt323-font-loader.ts + test); hardware validation (iOS 16 WKWebView Worker) is `human_needed` per ADR-0005 Branch A. REQUIREMENTS.md marks as "Pending" for the same reason. |
| RFONT-02 | 20-03 | Static chrome pre-baked once into ImageBitmap cache | SATISFIED | `_prebakeChrome()` + `_chromeBitmap` blit path implemented and tested; REQUIREMENTS.md marks "Complete" |
| RFONT-03 | 20-03 | Dynamic data re-renders only its own layer on delta | SATISFIED | `isDirty()` dirty-gate + `_onDelta` → `_dirty=true` pattern; SC3 tests pass; REQUIREMENTS.md marks "Complete" |
| RINV-01 | 20-02, 20-04 | Raster INV-1 contract via SHA-256 PNG tile hashes; `inv:all` separates glyph vs raster | SATISFIED | `20-raster-inv1.test.ts` + fixture + `checkInv1Raster` in inv-suite; REQUIREMENTS.md marks "Resolved" |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `container-registry.ts` | 271 | `TODO(HUD-27PX): re-activate... (#issue)` | INFO | Pre-existing; references `(HUD-27PX)` tag and `(#issue)` — satisfies INV-4 convention; not a blocker |
| `container-registry.ts` | 283 | `TODO(HUD-27PX): re-evaluate z05... (#issue)` | INFO | Same as above |
| `inv-suite.ts` | 393 | `// TODO without issue/ADR ref` comment inside dead-code comment block | INFO | This is a meta-comment about the grep strategy, not an actual unresolved TODO in the implementation |
| `boot-engine-core.ts` | various | Multiple `TODO(ADR-NNNN)` and `TODO(SC-NNNN)` markers | INFO | All reference formal tracking IDs (ADR-0009, ADR-0010, ADR-0013, SC-10-01, SC-10-02); no bare unreferenced TODOs introduced by Phase 20 |

No BLOCKER anti-patterns. No unreferenced TBD/FIXME/XXX markers. No stub implementations in Phase 20 deliverables.

---

### Human Verification Required

#### 1. VT323 Renders on Real G2 Hardware

**Test:** Pair a real G2 + phone. Build and sideload the `@evf/g2-app` dist. Boot the Even App with this build. Observe the status HUD on the G2 phosphor display.
**Expected:**
- The HUD raster page schema loads successfully (4 image tile containers + 1 capture text = 5 containers)
- VT323 glyphs are legible at 27px on the G2 576×288 display
- HP/AC/Level values render in the correct containers
- Font is NOT monospace (confirms `ensureVt323Loaded()` succeeded in the WKWebView Worker context)
- R1 gesture capture routes through `hud-capture` (id=4)

**Why human:** `self.fonts` (FontFaceSet) and `createImageBitmap` in an iOS 16 WKWebView Worker cannot be exercised in the CI happy-dom environment. ADR-0005 Branch A hardware-pending convention applies — this is a legitimate hardware gate, not a code stub.

#### 2. Idle BLE Bandwidth Near-Zero with Canvas Default Boot

**Test:** With a live G2+phone+bridge pair, boot the canvas HUD, leave idle (no `character.delta` events) for 30+ seconds, and instrument BLE traffic (e.g., via Even App diagnostics or packet capture on the bridge WebSocket).
**Expected:** No tile re-push events on the wire during idle. `CanvasStatusHudLayer.isDirty()` stays `false`; `LayerManager._compositeAndPush` is never called.

**Why human:** Requires real BLE link instrumentation. The software contract is verified (dirty-gate + SC3 tests prove no paint when `isDirty() === false`), but end-to-end BLE silence requires the live hardware stack.

---

### Gaps Summary

No software gaps. All 5 success criteria are verified in the codebase:

- SC1 (RFONT-01 software part): `ensureVt323Loaded()` exists, is substantive, is wired, and 3 explicit fallback tests pass.
- SC2 (RFONT-02): `_prebakeChrome()` + `_chromeBitmap` GPU-blit path exists, is wired, and 4 SC2 tests pass.
- SC3 (RFONT-03): dirty-gate implemented and 5 SC3 tests pass including spy-based call-count assertions.
- SC4 (RINV-01): golden fixture committed, `checkInv1Raster` wired into `inv:all`, `inv:all:skip-inv2` exits 0 with `INV-1 | green | glyph suite: pass; raster suite: pass`.
- SC5 (map-capture/hud-capture): FALLBACK architecture (both containers kept, geometrically distinct) is correct and regression-free across all 3179 tests.

The only unverified items are hardware-render behaviors listed in the Human Verification section above, which are legitimately `human_needed` per ADR-0005 Branch A (same precedent as Phase 19 verification).

---

_Verified: 2026-06-06T08:47:09Z_
_Verifier: Claude (gsd-verifier)_
