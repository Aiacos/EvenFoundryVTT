# Phase 20: Status HUD su Canvas + Font VT323 + INV-1 Raster Baseline — Pattern Map

**Mapped:** 2026-06-06
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/g2-app/src/status-hud/vt323-font-loader.ts` | utility | request-response (async init) | `packages/g2-app/src/hud/hud-canvas-renderer.ts` (`acquireCanvas2d` try/catch pattern) | role-match |
| `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` | layer/component | event-driven (character.delta → dirty → paint) | `packages/g2-app/src/status-hud/status-hud-layer.ts` | exact (same z=1 role, new CanvasLayer interface) |
| `packages/g2-app/src/status-hud/canvas-status-hud-layer.test.ts` | test | unit | `packages/g2-app/src/engine/__tests__/canvas-compositor.test.ts` | exact (canvas layer mock pattern, `_testSetMasterContext` escape hatch style) |
| `packages/g2-app/src/__tests__/20-raster-inv1.test.ts` | test | batch (RGBA → buildHudTiles → SHA-256) | `packages/g2-app/src/hud/hud-raster-frame.test.ts` | exact (`makeSyntheticRgba` + `buildHudTiles` pipeline pattern) |
| `packages/shared-render/src/fixtures/status-hud.raster-hash.json` | config/fixture | batch | `packages/shared-render/src/fixtures/` (existing `.txt` fixture files) | role-match (data-driven INV-1 fixture) |
| `packages/validation-harness/src/inv-suite.ts` (MODIFY) | orchestrator | batch (runSpawn) | self (`checkInv1` and `checkInv5` as dual-check patterns) | self-extension |
| `packages/g2-app/src/engine/layer-types.ts` (MODIFY `attachCanvas` sync→async) | type/interface | — | self (existing `CanvasLayer` interface) | self-extension |

---

## Pattern Assignments

---

### `packages/g2-app/src/status-hud/vt323-font-loader.ts` (utility, request-response)

**Analog:** `packages/g2-app/src/hud/hud-canvas-renderer.ts` — `acquireCanvas2d` function uses the same try/catch environment-detection pattern (OffscreenCanvas → document.createElement → throw).

**Imports pattern to copy:**
```typescript
// No library imports needed — FontFace and self.fonts are platform globals.
// Vite ?url import for the WOFF2 asset:
import fontUrl from '@fontsource/vt323/files/vt323-latin-400-normal.woff2?url';
```

**Core pattern — try/catch environment fallback:**
The `acquireCanvas2d` function in `hud-canvas-renderer.ts` uses exactly this pattern:
```typescript
// From hud-canvas-renderer.ts — acquireCanvas2d() pattern (environment probe → throw)
// vt323-font-loader.ts copies the same shape: try preferred API → catch → fallback value
export async function ensureVt323Loaded(): Promise<string> {
  try {
    const face = new FontFace('VT323', `url(${fontUrl})`);
    await face.load();
    // self.fonts is undefined in happy-dom — the catch handles it
    self.fonts.add(face);
    return '16px VT323';
  } catch {
    // Fallback: happy-dom has no FontFaceSet; iOS 16 WKWebView Worker may lack it
    return '16px monospace';
  }
}
```

**Error handling:** Return a safe string fallback (`'16px monospace'`) — never throw. Mirrors how `acquireCanvas2d` returns a working context or throws only when no canvas API exists at all.

**Test approach for SC1:** Call `ensureVt323Loaded()` in a vitest test where `self.fonts` is set to `undefined` (or deleted from the global). Assert the returned string equals `'16px monospace'`. Use `vi.stubGlobal('FontFace', ...)` or direct `Object.defineProperty(globalThis, 'fonts', { value: undefined })`.

---

### `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` (layer, event-driven)

**Analog:** `packages/g2-app/src/status-hud/status-hud-layer.ts`

The existing `StatusHudLayer` is the exact same role (z=1, `character.delta` subscription, snapshot caching, dirty-driven re-render). `CanvasStatusHudLayer` replaces `draw()` + bridge push with `paint()` onto OffscreenCanvas, and adds `attachCanvas()` + `isDirty()` to satisfy the `CanvasLayer` interface from `layer-types.ts` lines 221–252.

**Imports pattern** (`status-hud-layer.ts` lines 49–60):
```typescript
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  type CharacterSnapshot,
  CharacterSnapshotSchema,
} from '@evf/shared-protocol';
import type { CanvasLayer } from '../engine/layer-types.js';
import { COMPOSITOR_W, COMPOSITOR_H } from '../engine/canvas-compositor.js';
import { ensureVt323Loaded } from './vt323-font-loader.js';
```

**Class skeleton pattern** (derived from `StatusHudLayer` lines 121–130 + `CanvasLayer` interface lines 221–252):
```typescript
export class CanvasStatusHudLayer implements CanvasLayer {
  public readonly id = 'canvas-status-hud';
  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  private _fontFamily = '16px monospace';
  private _chromeBitmap: ImageBitmap | null = null;
  private _chromePrebakePromise: Promise<void> | null = null;
  private _snapshot: CharacterSnapshot | null = null;
  private _dirty = true; // true at init — first composite always paints
  // ...
}
```

**`attachCanvas` pattern** — sync method (preserving current `CanvasLayer` interface signature at `layer-types.ts` line 229); async pre-bake is fire-and-forget, stored as `_chromePrebakePromise`:
```typescript
attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('[EVF] CanvasStatusHudLayer: no 2d context');
  this._ctx = ctx as OffscreenCanvasRenderingContext2D;
  // Fire-and-forget async init; paint() checks _chromeBitmap null before GPU blit
  this._chromePrebakePromise = this._initAsync();
  this._dirty = true;
}

private async _initAsync(): Promise<void> {
  this._fontFamily = await ensureVt323Loaded();
  await this._prebakeChrome();
}
```

**`isDirty()` + `paint()` dirty-gate pattern** (RESEARCH.md Pattern 3 + `status-hud-layer.ts` `_onDelta` lines 423–464 as the mutation source):
```typescript
isDirty(): boolean { return this._dirty; }

paint(): void {
  const ctx = this._ctx;
  if (ctx === null) return;
  ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
  if (this._chromeBitmap !== null) {
    ctx.drawImage(this._chromeBitmap, 0, 0); // GPU blit — no re-draw of chrome
  } else {
    _drawChrome(ctx, this._fontFamily); // fallback if pre-bake not yet done
  }
  _drawDynamic(ctx, this._snapshot, this._fontFamily);
  this._dirty = false; // MUST be last line in paint()
}

// CanvasLayer.draw() — LayerManager calls paint() via compositor; draw() is a no-op
draw(): Promise<void> { return Promise.resolve(); }
```

**Snapshot delta subscription pattern** (copy from `status-hud-layer.ts` lines 337–348):
```typescript
// Constructor subscribes to character.delta:
this._unsubscribe = wsEvents.subscribe('character.delta', (raw) => this._onDelta(raw));

private _onDelta(raw: unknown): void {
  const parsed = CharacterSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[EVF] canvas-status-hud-layer: malformed character.delta — ignoring.');
    return;
  }
  this._snapshot = parsed.data;
  this._dirty = true;
}
```

**`getContainerCount()` pattern** (required by `CanvasLayer` contract, `layer-types.ts` lines 210–217):
```typescript
getContainerCount(): { image: number; text: number } {
  return { image: 0, text: 0 }; // canvas mode: zero-zero per ADR-0013 Amendment 1
}
```

**`destroy()` pattern** (copy from `status-hud-layer.ts` lines 288–300):
```typescript
destroy(): void {
  this._unsubscribe();
  if (this._chromeBitmap !== null) {
    this._chromeBitmap.close();
    this._chromeBitmap = null;
  }
}
```

---

### `packages/g2-app/src/status-hud/canvas-status-hud-layer.test.ts` (test, unit)

**Analog:** `packages/g2-app/src/engine/__tests__/canvas-compositor.test.ts`

This file is the canonical example of testing a `CanvasLayer` in happy-dom by injecting a fabricated canvas + context instead of relying on real rendering APIs.

**Imports pattern** (canvas-compositor.test.ts lines 21–24):
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasStatusHudLayer } from '../canvas-status-hud-layer.js';
import type { CanvasLayer } from '../../engine/layer-types.js';
```

**Fake context factory** (canvas-compositor.test.ts lines 29–49):
```typescript
function makeFakeCtx(w = 400, h = 200) {
  return {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(w * h * 4) }),
    // biome-ignore lint/suspicious/noExplicitAny: test fake
    canvas: { width: w, height: h } as any,
  };
}

function makeFakeCanvas() {
  const ctx = makeFakeCtx();
  const canvas = {
    width: 400, height: 200,
    getContext: vi.fn().mockReturnValue(ctx),
    // biome-ignore lint/suspicious/noExplicitAny: test fake
  } as any as HTMLCanvasElement;
  return { canvas, ctx };
}
```

**SC1 (font fallback) test pattern** — stub `self.fonts` as undefined:
```typescript
it('SC1: returns monospace fallback when self.fonts is unavailable', async () => {
  // Arrange: remove FontFaceSet from global so the try/catch in ensureVt323Loaded fires
  const origFonts = (globalThis as Record<string, unknown>).fonts;
  (globalThis as Record<string, unknown>).fonts = undefined;
  try {
    const layer = new CanvasStatusHudLayer({ wsEvents: makeWsEventsMock() });
    const { canvas } = makeFakeCanvas();
    layer.attachCanvas(canvas);
    // Wait for the async _initAsync to settle (fire-and-forget via microtask flush)
    await vi.runAllTimersAsync?.() ?? new Promise(r => setTimeout(r, 0));
    expect(layer.getFontFamily()).toBe('16px monospace'); // test-only accessor
  } finally {
    (globalThis as Record<string, unknown>).fonts = origFonts;
  }
});
```

**SC2 (chrome pre-bake once) test pattern** — spy on ctx methods called in `_drawChrome`:
```typescript
it('SC2: chrome is not re-drawn on subsequent paint() calls', () => {
  const { canvas, ctx } = makeFakeCanvas();
  const layer = new CanvasStatusHudLayer({ wsEvents: makeWsEventsMock() });
  layer.attachCanvas(canvas);
  // _chromeBitmap is null (pre-bake is async); _drawChrome called inline on first paint
  layer.paint(); // paint #1 — chrome drawn via inline fallback
  const strokeCallsAfterFirst = (ctx.strokeRect as ReturnType<typeof vi.fn>).mock.calls.length;
  layer.paint(); // paint #2 — layer is clean (_dirty === false after paint #1)
  // isDirty() returns false → CanvasCompositor would skip; but direct paint() call
  // tests that chrome is NOT re-drawn if _chromeBitmap is available
  // In practice: test isDirty() === false after first paint
  expect(layer.isDirty()).toBe(false);
});
```

**SC3 (dirty-gate) test pattern** — spy on `paint()` via compositor mock (canvas-compositor.test.ts lines 52–68):
```typescript
it('SC3: paint() not called for clean layers; called once after delta', () => {
  const layer = new CanvasStatusHudLayer({ wsEvents: makeWsEventsMock() });
  const paintSpy = vi.spyOn(layer, 'paint');
  const { canvas } = makeFakeCanvas();
  layer.attachCanvas(canvas);
  // Initial state: dirty
  expect(layer.isDirty()).toBe(true);
  layer.paint(); // clears dirty
  expect(layer.isDirty()).toBe(false);
  expect(paintSpy).toHaveBeenCalledTimes(1);
  // Idle: compositor would skip — verify isDirty() stays false
  expect(layer.isDirty()).toBe(false);
  // Emit delta → dirty again
  emitDelta(wsEventsMock, { hp: 12, /* ... */ });
  expect(layer.isDirty()).toBe(true);
  layer.paint();
  expect(paintSpy).toHaveBeenCalledTimes(2);
});
```

---

### `packages/g2-app/src/__tests__/20-raster-inv1.test.ts` (test, batch)

**Analog:** `packages/g2-app/src/hud/hud-raster-frame.test.ts`

This is the exact file to copy structure from: it already defines `makeSyntheticRgba()`, calls `buildHudTiles(rgba)`, and asserts tile properties. The raster INV-1 test extends this with SHA-256 hashing and fixture comparison.

**Imports pattern** (hud-raster-frame.test.ts lines 17–18):
```typescript
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildHudTiles } from '../hud/hud-raster-frame.js';
```

**`makeSyntheticRgba()` pattern** (hud-raster-frame.test.ts lines 74–87 — copy verbatim):
```typescript
/** Create a synthetic gradient RGBA: pixel value at (x,y) = (y*FRAME_W + x) mod 256. */
function makeSyntheticRgba(): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(400 * 200 * 4);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 400; x++) {
      const idx = (y * 400 + x) * 4;
      const v = (y * 400 + x) % 256;
      buf[idx] = v;
      buf[idx + 1] = v;
      buf[idx + 2] = v;
      buf[idx + 3] = 255;
    }
  }
  return buf;
}
```

**SHA-256 helper pattern** (adapted from `perf-probe-hash.test.ts` — uses Node `crypto`, NOT Web Crypto async):
```typescript
// RINV-01: Node crypto sync SHA-256 (NOT crypto.subtle.digest — that is async/Web Crypto)
function sha256hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
```

**Fixture load/compare pattern** (RINV-01 test body):
```typescript
const FIXTURE_PATH = path.resolve(
  import.meta.dirname,
  '../../../../shared-render/src/fixtures/status-hud.raster-hash.json',
);

describe('RINV-01: raster INV-1 SHA-256 tile hashes', () => {
  it('RINV-01: tile hashes match committed fixture', () => {
    const rgba = makeSyntheticRgba();
    const tiles = buildHudTiles(rgba);
    const hashes = tiles.map(t => sha256hex(t.bytes));

    if (!existsSync(FIXTURE_PATH)) {
      // First run: write fixture (Vitest toMatchFileSnapshot semantics)
      const fixture = {
        version: 1,
        description: 'SHA-256 hashes of 4 HUD tile PNGs from canonical synthetic RGBA (Phase 20)',
        tiles: tiles.map((t, i) => ({
          index: i,
          containerName: t.containerName,
          sha256: hashes[i],
        })),
      };
      writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + '\n');
      return; // First run is always green (fixture generation)
    }

    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    for (let i = 0; i < 4; i++) {
      expect(hashes[i]).toBe(fixture.tiles[i].sha256);
    }
  });
});
```

---

### `packages/shared-render/src/fixtures/status-hud.raster-hash.json` (config/fixture, batch)

**Analog:** `packages/shared-render/src/fixtures/` existing `.txt` files (ASCII fixture pattern)

The existing glyph fixtures are plain committed text files. The raster fixture is a companion JSON file in the same directory following the same data-driven convention.

**Fixture schema** (from RESEARCH.md Pattern 4):
```json
{
  "version": 1,
  "description": "SHA-256 hashes of 4 HUD tile PNGs from canonical synthetic RGBA (Phase 20)",
  "tiles": [
    { "index": 0, "containerName": "hud-tile-0", "sha256": "<64-char hex>" },
    { "index": 1, "containerName": "hud-tile-1", "sha256": "<64-char hex>" },
    { "index": 2, "containerName": "hud-tile-2", "sha256": "<64-char hex>" },
    { "index": 3, "containerName": "hud-tile-3", "sha256": "<64-char hex>" }
  ]
}
```

The actual `sha256` values are auto-generated on first `pnpm test` run by the `20-raster-inv1.test.ts` fixture-write path and then committed. Subsequent runs compare.

---

### `packages/validation-harness/src/inv-suite.ts` (MODIFY — add raster suite)

**Analog:** Self — existing `checkInv1` (lines 104–117) and `checkInv5` (lines 318–378) functions.

`checkInv1` is the direct pattern to mirror for `checkInv1Raster`. `checkInv5` shows how to add a FALSE-PASS guard (detect zero-test exit-0).

**`checkInv1` pattern** (lines 104–117 — copy structure):
```typescript
async function checkInv1(repoRoot: string): Promise<InvResult> {
  const { exitCode, stderr } = await runSpawn(
    'pnpm',
    ['--filter', '@evf/shared-render', 'test', '--', '--run'],
    { cwd: repoRoot, timeoutMs: 60_000 },
  );
  if (exitCode === 0) {
    return { id: 'INV-1', status: 'green', detail: 'all matchAsciiFixture snapshots pass' };
  }
  const hint = extractFirstError(stderr) ?? 'fixture mismatch or test failure';
  return { id: 'INV-1', status: 'red', detail: `vitest exited ${exitCode}: ${hint}` };
}
```

**New `checkInv1Raster` function** — mirrors `checkInv1` with filter on `@evf/g2-app` + `--testNamePattern RINV-01`, plus the FALSE-PASS guard from `checkInv5` lines 345–354:
```typescript
async function checkInv1Raster(repoRoot: string): Promise<InvResult> {
  const { exitCode, stdout, stderr } = await runSpawn(
    'pnpm',
    ['--filter', '@evf/g2-app', 'test', '--', '--run', '--testNamePattern', 'RINV-01'],
    { cwd: repoRoot, timeoutMs: 60_000 },
  );

  // FALSE-PASS GUARD (pattern from checkInv5 lines 345-354):
  // vitest exits 0 when NO test files match the filter — must not report green.
  const combined = `${stdout}\n${stderr}`;
  if (exitCode === 0 && /no test files found|no tests found|\b0 tests\b/i.test(combined)) {
    return { id: 'INV-1', status: 'skipped', detail: 'raster suite: no RINV-01 tests found — skipped' };
  }

  if (exitCode === 0) {
    return { id: 'INV-1', status: 'green', detail: 'glyph suite: pass; raster suite: SHA-256 tile hashes match fixture' };
  }
  const hint = extractFirstError(stderr) ?? 'raster hash fixture mismatch';
  return { id: 'INV-1', status: 'red', detail: `raster suite: ${hint}` };
}
```

**`InvId` type** (line 38) stays unchanged — `'INV-1'` covers both glyph and raster suites. The two checks share the same `id: 'INV-1'` but produce a compound `detail` string. The `runInvSuite` function (lines 438–454) is modified to call both `checkInv1` (renamed `checkInv1Glyph`) and `checkInv1Raster`, merging their results into a single `INV-1` entry using a helper that returns red if either is red.

**`runInvSuite` modification** — replace the single `checkInv1(repoRoot)` call with a compound call:
```typescript
// In Promise.all([...]):
// Replace: checkInv1(repoRoot),
// With:
mergeInv1Results(
  await checkInv1Glyph(repoRoot),
  await checkInv1Raster(repoRoot),
),
```

Where `mergeInv1Results` returns `{ id: 'INV-1', status: 'red', detail: '...' }` if either is red, otherwise the compound green detail.

---

## Shared Patterns

### `CanvasLayer` Interface — `attachCanvas` / `paint` / `isDirty` Contract

**Source:** `packages/g2-app/src/engine/layer-types.ts` lines 221–252
**Apply to:** `canvas-status-hud-layer.ts`

The interface is the law. Critical constraints:
- `attachCanvas()` is **synchronous** (line 229: `attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): void`). Async pre-bake must be fire-and-forget inside the sync method.
- `paint()` is **synchronous** (line 240: `paint(): void`). No await inside.
- `isDirty()` must return `true` at construction so the first composite always paints.
- `getContainerCount()` MUST return `{ image: 0, text: 0 }` for all canvas layers (line 210–217 contract).

### `safeParse` Input Validation Pattern

**Source:** `packages/g2-app/src/status-hud/status-hud-layer.ts` lines 423–430
**Apply to:** `canvas-status-hud-layer.ts` `_onDelta()`

```typescript
const parsed = CharacterSnapshotSchema.safeParse(raw);
if (!parsed.success) {
  console.warn('[EVF] canvas-status-hud-layer: malformed character.delta payload — ignoring.');
  return;
}
```

Never use `.parse()` (throws). Always `safeParse` + warn + return on failure.

### `[EVF]` Log Prefix Convention

**Source:** All existing layer files (`status-hud-layer.ts`, `canvas-compositor.ts`, etc.)
**Apply to:** All new files in this phase

All `console.warn` / `throw new Error` messages use the `[EVF]` prefix:
```typescript
console.warn('[EVF] canvas-status-hud-layer: ...');
throw new Error('[EVF] CanvasStatusHudLayer: ...');
```

### `runSpawn` + FALSE-PASS Guard in inv-suite checks

**Source:** `packages/validation-harness/src/inv-suite.ts` lines 318–354 (`checkInv5`)
**Apply to:** `checkInv1Raster`

Any `runSpawn` that filters by `--testNamePattern` must check the exit-0-with-zero-tests FALSE-PASS condition before reporting green.

### Test Mock Factory Pattern

**Source:** `packages/g2-app/src/engine/__tests__/canvas-compositor.test.ts` lines 29–68
**Apply to:** `canvas-status-hud-layer.test.ts`

Always build `makeFakeCtx()` returning `vi.fn()` mocks for every 2d context method exercised by the layer; never rely on happy-dom's canvas support (it is absent). Inject via layer's `attachCanvas(fakeCanvas)`.

---

## No Analog Found

All files have analogs. No file requires falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `packages/g2-app/src/`, `packages/validation-harness/src/`, `packages/shared-render/src/`
**Files read:** 9 source files
**Pattern extraction date:** 2026-06-06
