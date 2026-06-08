# Phase 21: Character Sheet su Canvas + Dati Main-tab — Pattern Map

**Mapped:** 2026-06-06
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/shared-protocol/src/payloads/character.ts` | model/schema | CRUD | same file — Phase 17 `skills` REQUIRED extension | exact |
| `packages/foundry-module/src/readers/character-reader.ts` | service/reader | CRUD | same file — `extractAbilities` / `extractSkills` + `getCharacterSnapshot` (Phase 16/17) | exact |
| `packages/foundry-module/src/types/foundry-globals.d.ts` | config/types | — | same file — `Dnd5eAttributes` shape (Phase 16) | exact |
| `packages/g2-app/src/raster/dither-utils.ts` | utility | transform | `packages/g2-app/src/raster/raster-worker.ts` lines 112–200 (`buildGreyscalePalette` + `ditherTile`) | exact extract |
| `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` | component/panel | event-driven | `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` (CanvasLayer template) + `packages/g2-app/src/panels/character-sheet-panel.ts` (OverlayPanel + gesture lifecycle) | role-match |
| `packages/g2-app/src/panels/canvas-character-sheet-panel.test.ts` | test | — | `packages/g2-app/src/__tests__/20-raster-inv1.test.ts` (raster hash fixture pattern) + `packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts` | role-match |
| `packages/shared-render/src/fixtures/canvas-sheet-panel.raster-hash.json` | config/fixture | — | `packages/shared-render/src/fixtures/status-hud.raster-hash.json` | exact |
| `packages/shared-render/src/fixtures/sheet.main.*.txt` (4 files) | config/fixture | — | existing `sheet.main.2014.it.txt` etc. — row 6 vitals bar update | exact |

---

## Pattern Assignments

---

### `packages/shared-protocol/src/payloads/character.ts` (model, CRUD)

**Analog:** Same file — Phase 16 (`abilities`) + Phase 17 (`skills`) REQUIRED atomic extension.

**Imports pattern** (lines 1–30 of file):
```typescript
import { z } from 'zod';
// All sub-schemas use z.strictObject for closed enumerations,
// z.object for forward-compat sub-objects.
```

**Core schema extension pattern** — append after the `SkillsSchema` block, before the final `CharacterSnapshotSchema` definition. Mirrors the exact TSDoc + field-placement conventions of Phase 16/17:
```typescript
/**
 * Character class display name (Phase 21 Plan 21-01 atomic extension; RDATA-01).
 * REQUIRED — empty string for classless or fresh actors.
 * Multiclass: joined as "Fighter / Wizard" (reader extracts from actor.items).
 * `level` carries the numeric level separately — this field is class name(s) only.
 */
// class: z.string()

/**
 * Initiative modifier — dnd5e prep-time computed total (Phase 21; RDATA-02).
 * REQUIRED — integer, may be negative.
 * Reader: actor.system.attributes.init.total ?? 0.
 */
// initiative: z.number().int()

/**
 * Walking speed in feet (Phase 21; RDATA-02).
 * REQUIRED — non-negative integer (standard D&D 5e: 30 ft; dwarves 25 ft).
 * Reader: actor.system.attributes.movement.walk ?? 30.
 */
// speed: z.number().int().nonnegative()
```

**CharacterSnapshotSchema location:** The schema starts approximately at line 480 of `character.ts`. The 3 new fields are appended INSIDE the `z.strictObject({...})` call (after `skills:`), before the closing `})`. This is the SAME position and pattern as:
- Phase 16 added `abilities: AbilitiesSchema` after `spells:`
- Phase 17 added `skills: SkillsSchema` after `abilities:`

**Blast-radius note:** Adding REQUIRED fields to `z.strictObject` immediately breaks ~27 test files with full `CharacterSnapshot` literals. Follow the Phase 17 playbook: commit schema+reader first, then run `pnpm typecheck` to surface all literal errors, then fix them atomically in a second wave commit.

---

### `packages/foundry-module/src/readers/character-reader.ts` (service/reader, CRUD)

**Analog:** Same file — `extractAbilities` (lines 348–359) + `extractSkills` (line 494+) + `getCharacterSnapshot` (lines 533–590).

**Reader function pattern** (copy `extractAbilities` lines 348–359 as template):
```typescript
// Phase 16 extractAbilities — canonical reader pattern
function extractAbilities(actor: ReturnType<typeof game.actors.get>): Abilities {
  if (actor === undefined) return zeroAbilities();   // ← guard: undefined actor

  const abilitiesRaw = actor.system?.abilities;
  if (abilitiesRaw === undefined) return zeroAbilities(); // ← guard: missing field

  const out = zeroAbilities();
  for (const key of ABILITY_KEYS) {
    out[key as AbilityKey] = readAbility(abilitiesRaw[key]);  // ← nullish-coalesce leaf
  }
  return out;
}
```

**New reader function shapes for Phase 21** (mirror the guard+default pattern above):
```typescript
/** @internal */
function extractClass(actor: ReturnType<typeof game.actors.get>): string {
  if (actor === undefined) return '';
  const classItems = (actor.items?.contents ?? []) as Array<Record<string, unknown>>;
  const names = classItems
    .filter((item) => item.type === 'class')
    .map((item) => item.name as string)
    .filter((n) => typeof n === 'string' && n.length > 0);
  return names.join(' / ');
}

/** @internal */
function extractInitiativeModifier(actor: ReturnType<typeof game.actors.get>): number {
  if (actor === undefined) return 0;
  return (actor.system?.attributes?.init as Record<string, unknown> | undefined)?.total as number ?? 0;
}

/** @internal */
function extractWalkSpeed(actor: ReturnType<typeof game.actors.get>): number {
  if (actor === undefined) return 30;
  const walk = (actor.system?.attributes?.movement as Record<string, unknown> | undefined)?.walk;
  return typeof walk === 'number' && walk >= 0 ? walk : 30;
}
```

**`getCharacterSnapshot` wiring** (lines 572–589 show the return object; append 3 fields after `skills:`):
```typescript
// Existing tail of the return object (lines 582–589):
    abilities: extractAbilities(actor),
    skills: extractSkills(actor),
    ...portraitField,
  };
// Phase 21: insert between skills and ...portraitField:
    class: extractClass(actor),
    initiative: extractInitiativeModifier(actor),
    speed: extractWalkSpeed(actor),
```

---

### `packages/foundry-module/src/types/foundry-globals.d.ts` (config/types)

**Analog:** Same file — existing `Dnd5eAttributes` interface (search for `interface Dnd5eAttributes`).

**Extension pattern** — add to `Dnd5eAttributes` interface:
```typescript
// Append to the existing Dnd5eAttributes interface — same optional-field pattern
// as existing `hp`, `ac`, `exhaustion`, `death` entries.
interface Dnd5eAttributes {
  // ...existing fields...
  /** Initiative modifier — dnd5e prep-time computed total (Phase 21). */
  init?: { total?: number };
  /** Movement speeds in feet (Phase 21). */
  movement?: { walk?: number; fly?: number; swim?: number; climb?: number };
}
```

---

### `packages/g2-app/src/raster/dither-utils.ts` (utility, transform)

**Analog:** `packages/g2-app/src/raster/raster-worker.ts` lines 112–200.

**Confirmed:** `buildGreyscalePalette` is at line 112, `ditherTile` is at line 193, both are **NOT exported** (no `export` keyword — confirmed by grep). Extraction is required.

**Imports pattern** (copy from raster-worker.ts lines 61–90):
```typescript
import * as ImageQ from 'image-q';
// No upng-js here — encoding stays in the call site
```

**Core extract — `buildGreyscalePalette`** (raster-worker.ts lines 112–119):
```typescript
/** Build the canonical 16-step phosphor-green greyscale palette (0..240). */
export function buildGreyscalePalette(): ImageQ.utils.Palette {
  const pal = new ImageQ.utils.Palette();
  for (let i = 0; i < 16; i++) {
    const v = i * 16; // 0, 16, 32, ..., 240
    pal.add(ImageQ.utils.Point.createByRGBA(v, v, v, 255));
  }
  return pal;
}
```

**Core extract — `ditherTile`** (raster-worker.ts lines 193–200):
```typescript
/**
 * Quantize an RGBA tile against the greyscale palette using Floyd-Steinberg dithering.
 *
 * @param rgba - Source RGBA pixel data (Uint8ClampedArray, width×height×4)
 * @param w    - Tile width in pixels
 * @param h    - Tile height in pixels
 * @param pal  - 16-step greyscale palette from {@link buildGreyscalePalette}
 */
export function ditherTile(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  pal: ImageQ.utils.Palette,
): Uint8ClampedArray {
  const inContainer = ImageQ.utils.PointContainer.fromUint8Array(rgba, w, h);
  const outContainer = ImageQ.applyPaletteSync(inContainer, pal, {
    imageQuantization: 'floyd-steinberg',
    colorDistanceFormula: 'euclidean-bt709',
  });
  return new Uint8ClampedArray(outContainer.toUint8Array());
}
```

**raster-worker.ts update:** Replace the two private function bodies with imports from `./dither-utils.js`. Zero behavior change. Zero blast-radius beyond g2-app.

---

### `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` (component, event-driven)

**Primary analog:** `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` (CanvasLayer template — entire file).
**Secondary analog:** `packages/g2-app/src/panels/character-sheet-panel.ts` (OverlayPanel + gesture lifecycle — entire file).

**Imports pattern** — combine both analogs:
```typescript
import * as UPNG from 'upng-js';
import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer, OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';
import { buildGreyscalePalette, ditherTile } from '../raster/dither-utils.js';
import { TABS, buildTabStrip } from './character-sheet-panel.js';
import type { MapBaseLayerLike } from './character-sheet-panel.js';
```

**Class skeleton** — `CanvasStatusHudLayer` (canvas-status-hud-layer.ts lines 78–369) is the direct template. Key differences from the glyph `CharacterSheetPanel`:
- implements `CanvasLayer` AND `OverlayPanel` (dual interface)
- `attachCanvas()` provides the 2D context (from CanvasStatusHudLayer lines 166–188)
- `paint()` uses dirty-gate with `_dirty = false` as LAST line (CanvasStatusHudLayer lines 200–216)
- `isDirty()` returns `_dirty` field (CanvasStatusHudLayer lines 225–227)
- `getContainerCount()` returns `{image:0, text:0}` (CanvasStatusHudLayer lines 249–251)
- `getCaptureContainer()` returns `'hud-capture'` (CanvasStatusHudLayer lines 269–271)
- `draw()` returns `Promise.resolve()` no-op (CanvasStatusHudLayer lines 238–240)

**Static meta pattern** (from CharacterSheetPanel lines 179–185):
```typescript
static meta: PanelMeta = {
  id: 'canvas-character-sheet',  // DISTINCT from glyph panel 'character-sheet'
  title: { it: 'Scheda', en: 'Sheet', de: 'Blatt' },
  navKey: 'S',
  requiredCaps: [],
  defaultTab: 'main',
};
public readonly id = 'canvas-character-sheet';
public readonly z = ZIndex.Z2_OVERLAY;
```

**CanvasLayer attach + async-init pattern** (canvas-status-hud-layer.ts lines 166–188 + 317–347):
```typescript
async attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<void> {
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (ctx === null) {
    console.warn('[EVF] CanvasCharacterSheetPanel.attachCanvas: getContext("2d") returned null — degraded mode.');
    return;
  }
  this._ctx = ctx;
  this._chromePrebakePromise = this._initAsync();
  await this._chromePrebakePromise;
  this._dirty = true;
}

private async _initAsync(): Promise<void> {
  this._fontFamily = await ensureVt323Loaded();
  await this._prebakeChrome();  // same _prebakeChrome pattern
}
```

**Paint dirty-gate pattern** (canvas-status-hud-layer.ts lines 200–216):
```typescript
paint(): void {
  const ctx = this._ctx;
  if (ctx === null) return;
  ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
  if (this._chromeBitmap !== null) {
    ctx.drawImage(this._chromeBitmap, 0, 0);
  } else {
    _drawChrome(ctx, this._fontFamily);
  }
  // Draw dynamic tab content here (paintMainTab / paint*Tab)
  this._paintActiveTab(ctx);
  this._dirty = false;  // MUST be last line
}
```

**OverlayPanel gesture lifecycle pattern** (character-sheet-panel.ts lines 296–361):
```typescript
async onMount(): Promise<void> {
  this._unsubscribeGesture = this._gestureBus.subscribe((gesture) => this.onEvent(gesture));
  await this._restoreLastTab();        // Even Hub kv store read
  void this._fetchPortraitAsync();     // fire-and-forget — must NOT block onMount
  this._dirty = true;
}

async onUnmount(): Promise<void> {
  if (this._unsubscribeGesture !== null) {
    this._unsubscribeGesture();        // T-4b-01-03 idempotent unsubscribe
    this._unsubscribeGesture = null;
  }
  this._mapBaseLayer?.setPortraitOverride(3, null);  // clear portrait slot
}

onEvent(gesture: R1Gesture): void {
  switch (gesture.kind) {
    case 'tap':
      this._activeTabIndex = (this._activeTabIndex + 1) % TABS.length;
      this._scrollOffset = 0;
      void this._persistLastTab();
      this._dirty = true;
      break;
    case 'scroll':
      if (gesture.direction === 'up') {
        this._activeTabIndex = (this._activeTabIndex - 1 + TABS.length) % TABS.length;
      } else {
        this._activeTabIndex = (this._activeTabIndex + 1) % TABS.length;
      }
      this._scrollOffset = 0;
      void this._persistLastTab();
      this._dirty = true;
      break;
    case 'double-tap':
      break;  // No-op stub — router handles close at bus level (ADR-0012)
  }
}
```

**Portrait fetch / dither / slot pattern** (novel — no direct analog; combines raster-worker.ts pipeline with character-sheet-panel.ts `_applyPortraitOverride` lines 502–526):
```typescript
private async _fetchPortraitAsync(): Promise<void> {
  const url = this._snapshot?.portrait?.url;
  if (url === undefined) return;
  try {
    const response = await fetch(url);
    if (!response.ok) return;                          // silent on fetch error
    const blob = await response.blob();
    const W = 100; const H = 60;                       // match Phase 13 portrait-state size
    const imgBitmap = await createImageBitmap(blob, { resizeWidth: W, resizeHeight: H });
    const scratch = new OffscreenCanvas(W, H);
    const sCtx = scratch.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    if (sCtx === null) return;
    sCtx.drawImage(imgBitmap, 0, 0, W, H);
    imgBitmap.close();
    const imageData = sCtx.getImageData(0, 0, W, H);
    const pal = buildGreyscalePalette();               // from dither-utils.ts
    const dithered = ditherTile(imageData.data, W, H, pal);
    const pngBytes = new Uint8Array(UPNG.encode([dithered.buffer as ArrayBuffer], W, H, 16));
    this._mapBaseLayer?.setPortraitOverride(3, pngBytes);  // slot 3 = existing infra
  } catch {
    // Non-fatal — portrait silently omitted on any error
  }
}
```

**`_onDelta` / `onSnapshot` pattern** (CanvasStatusHudLayer lines 360–368 + CharacterSheetPanel lines 383–386):
```typescript
// If fed via WS events (CanvasLayer path):
private _onDelta(raw: unknown): void {
  const parsed = CharacterSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[EVF] canvas-character-sheet-panel: malformed character.delta — ignoring.');
    return;
  }
  this._snapshot = parsed.data;
  this._dirty = true;
}

// Or if fed via explicit onSnapshot call (OverlayPanel path, matches CharacterSheetPanel):
onSnapshot(newSnapshot: CharacterSnapshot): void {
  this._snapshot = newSnapshot;
  this._dirty = true;
}
```

---

### `packages/g2-app/src/panels/canvas-character-sheet-panel.test.ts` (test)

**Primary analog:** `packages/g2-app/src/__tests__/20-raster-inv1.test.ts` (raster INV-1 SHA-256 hash test — entire file).
**Secondary analog:** `packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts` (SC-series CanvasLayer tests).

**Raster hash fixture test pattern** (20-raster-inv1.test.ts lines 38–168 — full pattern):
```typescript
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildHudTiles } from '../hud/hud-raster-frame.js';

const FIXTURE_PATH = path.resolve(
  import.meta.dirname,
  '../../../shared-render/src/fixtures/canvas-sheet-panel.raster-hash.json',
  // ↑ Phase 21 fixture name (different from status-hud.raster-hash.json)
);

function sha256hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// First-run: write fixture; subsequent runs: compare (lines 126–166 pattern)
// The synthetic RGBA generator is the SAME as 20-raster-inv1.test.ts (RINV-01 canonical)
// to avoid introducing a new non-deterministic source.
```

**SC test naming convention** — test IDs follow `RCSP-SC1`, `RCSP-SC2`, ... `RCSP-PORTRAIT`, `RCSP-INV1` per the RESEARCH.md Validation Architecture table. Mirror the `RFONT-01`, `RFONT-02`, `RFONT-03`, `SC1`–`SC3` naming from canvas-status-hud-layer.test.ts.

---

### `packages/shared-render/src/fixtures/canvas-sheet-panel.raster-hash.json` (config/fixture)

**Analog:** `packages/shared-render/src/fixtures/status-hud.raster-hash.json` (entire file).

**Exact file shape to copy** (status-hud.raster-hash.json lines 1–27):
```json
{
  "version": 1,
  "description": "SHA-256 hashes of 4 HUD tile PNGs from canonical synthetic RGBA (Phase 21)",
  "tiles": [
    { "index": 0, "containerName": "hud-tile-0", "sha256": "<computed-on-first-run>" },
    { "index": 1, "containerName": "hud-tile-1", "sha256": "<computed-on-first-run>" },
    { "index": 2, "containerName": "hud-tile-2", "sha256": "<computed-on-first-run>" },
    { "index": 3, "containerName": "hud-tile-3", "sha256": "<computed-on-first-run>" }
  ]
}
```

The file is generated on the first test run (the `existsSync` branch in the test); commit the generated content as the baseline.

---

### `packages/shared-render/src/fixtures/sheet.main.*.txt` (4 files, config/fixture)

**Analog:** Existing `sheet.main.2014.it.txt` (and `.en.txt`, `.de.txt`, `sheet.main.2024.it.txt`) — only row 6 changes.

**Change pattern:** Row 6 vitals bar currently reads:
```
⛨ CA 18    ⚡ INI —    ⚔ VEL —    COMP +3
```

After Phase 21, `—` placeholders are replaced with real values from the test snapshot (Thorin Oakenshield, Fighter Lv 8: `initiative: +2`, `speed: 25`):
```
⛨ CA 18    ⚡ INI +2    ⚔ VEL 25    COMP +3
```

Row 1 may also change if the class name is surfaced there (locked decision: canvas Main tab shows class/level; planner must decide whether the glyph fixture row 1 also updates).

---

## Shared Patterns

### CanvasLayer interface contract
**Source:** `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` lines 78–288
**Apply to:** `canvas-character-sheet-panel.ts`

Key invariants that MUST be copied exactly:
- `getContainerCount()` returns `{image:0, text:0}` (line 249–251) — failing this throws at `_assertContainerBudget`
- `getCaptureContainer()` returns `'hud-capture'` (line 269–271)
- `draw()` returns `Promise.resolve()` (line 238–240)
- `_dirty = false` is the LAST LINE of `paint()` (line 215) — NEVER double-guard `isDirty()` inside `paint()`
- `_chromeBitmap?.close()` in `destroy()` (lines 281–287)

### Null-context degradation (happy-dom guard)
**Source:** `canvas-status-hud-layer.ts` lines 171–179
**Apply to:** `canvas-character-sheet-panel.ts attachCanvas()`

```typescript
if (ctx === null) {
  console.warn('[EVF] CanvasCharacterSheetPanel.attachCanvas: getContext("2d") returned null — degraded mode.');
  return;
}
```

### Gesture bus subscribe/unsubscribe lifecycle (T-4b-01-03)
**Source:** `character-sheet-panel.ts` lines 297 + 315–321
**Apply to:** `canvas-character-sheet-panel.ts onMount() / onUnmount()`

```typescript
// onMount:
this._unsubscribeGesture = this._gestureBus.subscribe((gesture) => this.onEvent(gesture));

// onUnmount (idempotent — null guard):
if (this._unsubscribeGesture !== null) {
  this._unsubscribeGesture();
  this._unsubscribeGesture = null;
}
```

### `CharacterSnapshotSchema.safeParse` gate (T-20-01)
**Source:** `canvas-status-hud-layer.ts` lines 360–368
**Apply to:** Any `character.delta` handler in the canvas panel

```typescript
const parsed = CharacterSnapshotSchema.safeParse(raw);
if (!parsed.success) {
  console.warn('[EVF] canvas-character-sheet-panel: malformed character.delta — ignoring.');
  return;
}
```

### Tab persistence (Even Hub kv store)
**Source:** `character-sheet-panel.ts` lines 535–565 (`_persistLastTab`, `_restoreLastTab`)
**Apply to:** `canvas-character-sheet-panel.ts` — same `PERSIST_KEY = 'view.sheet.lastTab'`, same `TABS.indexOf` safe-guard

### portrait slot clear on unmount
**Source:** `character-sheet-panel.ts` line 321
**Apply to:** `canvas-character-sheet-panel.ts onUnmount()`

```typescript
this._mapBaseLayer?.setPortraitOverride(this._portraitSlot, null);
```

---

## No Analog Found

None — all files have strong analogs in the codebase. The portrait fetch/dither pipeline
inside `canvas-character-sheet-panel.ts` is the most novel path, but it composes
existing primitives (`ditherTile` from dither-utils, `UPNG.encode` from raster-worker,
`setPortraitOverride` from map-base-layer) — no net-new algorithm required.

---

## Critical Implementation Notes (for planner)

1. **`ditherTile` is NOT exported** from `raster-worker.ts` (confirmed: line 193 has no `export` keyword). The `dither-utils.ts` extraction is a prerequisite for the portrait pipeline. `raster-worker.ts` must import from `./dither-utils.js` after the extraction.

2. **Portrait PNG dimensions must match slot 3 expectation.** The existing `portrait-state.ts` uses 100×60 (validated by the bridge). Use `W=100, H=60` in `_fetchPortraitAsync` for consistency with Phase 13 precedent. The 200×100 container accepts a sub-size image per `setPortraitOverride`'s existing behavior.

3. **Downstream blast-radius is ~27 test files / ~60–70 literals.** Planner must allocate a dedicated wave for the downstream literal update after the schema commit. `pnpm typecheck` surfaces all failures atomically — run it after the schema+reader commit to get the full error list.

4. **`panel-gesture-bus.ts` must not be modified** (SC2 gesture-identity locked decision). The canvas panel subscribes/unsubscribes via the existing `subscribe()` closure API only.

5. **Distinct panel IDs.** Use `id: 'canvas-character-sheet'` (not `'character-sheet'`). Gate which panel is opened in `boot-engine-core.ts` based on `renderMode` (same boot-time dispatch pattern as Phase 20's canvas vs glyph HUD layer selection).

6. **`onMount` must not block on portrait fetch.** Portrait fetch is fire-and-forget (`void this._fetchPortraitAsync()`). `LayerManager.bundle` awaits `onMount` — blocking here on a network fetch would delay panel appearance.

---

## Metadata

**Analog search scope:** `packages/g2-app/src/`, `packages/foundry-module/src/`, `packages/shared-protocol/src/`, `packages/shared-render/src/fixtures/`
**Files scanned:** 8 source files read in full + 3 targeted grep/bash queries
**Pattern extraction date:** 2026-06-06
