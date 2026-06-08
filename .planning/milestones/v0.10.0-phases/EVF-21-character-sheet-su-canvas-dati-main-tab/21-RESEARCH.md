# Phase 21: Character Sheet su Canvas + Dati Main-tab — Research

**Researched:** 2026-06-06
**Domain:** Canvas OverlayPanel z=2, CharacterSnapshotSchema extension (class/initiative/speed), dnd5e 5.x reader pattern, portrait dither pipeline reuse, INV-1 glyph fixture delta
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema Extension (RDATA-01, RDATA-02)**
- `class`, `initiative`, `speed` are REQUIRED fields on `CharacterSnapshotSchema` — same REQUIRED-extension precedent as Phase 16 (abilities) / Phase 17 (skills).
- `class: z.string()` — display form (e.g. `"Fighter"`; multiclass joined as `"Fighter / Wizard"`). `level` already exists separately.
- `initiative: z.number().int()` — the initiative modifier (e.g. `+2`, may be negative).
- `speed: z.number().int().nonnegative()` — walking speed in feet (e.g. `30`). Other movement modes deferred.
- Add readers in `foundry-module` mirroring the `extractAbilities`/`extractSkills` pattern; wire into `getCharacterSnapshot`.

**Canvas Sheet Panel (RSHEET-01, RSHEET-02)**
- New `CanvasCharacterSheetPanel` as a z=2 `CanvasLayer` overlay (mirror Phase 20 `CanvasStatusHudLayer` pattern: async attach, dirty-gate, paint, ImageBitmap chrome pre-bake).
- **Dual-output, ADDITIVE.** Existing `render*Tab(snapshot, locale) -> string[]` glyph renderers in `character-sheet-tab-renderers.ts` PRESERVED INTACT. New canvas `paint*Tab(ctx, bounds)` methods are ADDITIVE.
- **Gesture semantics byte-identical.** Canvas panel plugs into EXISTING `panel-router` + `panel-gesture-bus` — `panel-gesture-bus.ts` NOT modified. Open from any HUD state, scroll 6 tabs, close via double-press.
- Main tab shows real class/level + initiative + speed replacing `—` placeholders.

**Portrait (RSHEET-03)**
- Fetch portrait async ONCE from `CharacterSnapshotSchema.portrait.url`, dither to greyscale **reusing raster-worker Floyd-Steinberg pipeline** (`ditherTile`/`applyPaletteSync` in `raster-worker.ts`).
- Size: ~100×100 glanceable within G2 image-container hard limits.
- **Reuse `MapBaseLayer` portrait-override slot infra** (`setPortraitOverride(slot, bytes)`, slot 3) — NOT a new image container.
- On fetch failure: omit silently.

### Claude's Discretion

- Exact `paint*Tab` method signatures, per-tab canvas layout geometry, portrait fetch/decoding plumbing details, precise glanceable portrait dimensions within the hard limits, how the canvas panel registers with panel-router.

### Deferred Ideas (OUT OF SCOPE)

- `feats[]` + `biography` schema/readers and their tab DATA → Phase 22.
- Combat tracker on canvas → Phase 23.
- ~5fps xxhash sub-tile delta loop → Phase 24.
- Fly/swim/climb movement modes for `speed` → future.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSHEET-01 | Character sheet rendered as z=2 raster overlay panel, 6 tabs drawn on canvas | §Architecture Patterns: CanvasCharacterSheetPanel implements CanvasLayer + OverlayPanel |
| RSHEET-02 | Tab navigation + open/close via R1 gesture, preserving existing gesture semantics | §Pattern 3: panel-router + panel-gesture-bus unchanged; dual-interface class |
| RSHEET-03 | Portrait greyscale-dithered async-once, reusing MapBaseLayer portrait-override slot infra | §Pattern 4: ditherTile reuse + portrait-state cache + setPortraitOverride slot 3 |
| RDATA-01 | CharacterSnapshotSchema carries `class` field with foundry-module reader | §Pattern 1: class extracted from `actor.items` type=class items joined |
| RDATA-02 | CharacterSnapshotSchema carries `initiative` + `speed` with readers | §Pattern 1: `actor.system.attributes.init.total` + `actor.system.attributes.movement.walk` |
</phase_requirements>

---

## Summary

Phase 21 builds directly on the Phase 20 `CanvasStatusHudLayer` template to introduce the first canvas overlay panel at z=2. The work has two parallel tracks: (A) schema extension + foundry-module readers for `class`/`initiative`/`speed` (additive pattern proven by Phases 16/17), and (B) `CanvasCharacterSheetPanel` — a new class that simultaneously implements `CanvasLayer` (for the canvas path) and satisfies the `OverlayPanel` interface (for panel-router lifecycle and gesture bus integration).

The key architectural insight is the **dual-interface design**: `CanvasCharacterSheetPanel` must implement both `CanvasLayer` (`attachCanvas`/`paint`/`isDirty`) for the compositor path AND `OverlayPanel` (`onMount`/`onUnmount`/`onEvent`) for the panel-router path. The existing glyph `CharacterSheetPanel` only implements `OverlayPanel`; the new canvas panel must implement both. The gesture bus subscription (`panel-gesture-bus.ts`) remains byte-unchanged — the canvas panel calls `gestureBus.subscribe` in `onMount` exactly as the glyph panel does.

The portrait pipeline presents the most novel engineering: the canvas panel must fetch the portrait URL from the snapshot, decode it to RGBA in the WebView, dither it using the raster-worker's Floyd-Steinberg palette reused outside the worker (by calling `ditherTile` directly — it is an exported module-level function), and push the bytes through the existing `MapBaseLayer.setPortraitOverride` slot infra. No new image containers are needed.

The downstream blast radius for the schema extension follows the Phase 16/17 precedent exactly: approximately 27 test files with full `CharacterSnapshot` literal objects will need the 3 new REQUIRED fields (`class`, `initiative`, `speed`) added to every literal.

**Primary recommendation:** Structure the work as three waves: (1) schema + reader + downstream literals (RDATA-01/02), (2) `CanvasCharacterSheetPanel` — dual-interface class, tab/gesture wiring, chrome pre-bake (RSHEET-01/02), (3) portrait fetch/dither/slot integration (RSHEET-03) + INV-1 fixture updates for the Main tab glyph renders.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema extension (`class`/`initiative`/`speed`) | `packages/shared-protocol` | — | Single source of truth for wire types; Zod schema owns runtime validation |
| dnd5e readers (`extractClass`/`extractInitiative`/`extractSpeed`) | `packages/foundry-module` (foundry side) | — | Only foundry-module has access to `game.actors`; reader pattern established in Phases 16/17 |
| `CanvasCharacterSheetPanel` canvas rendering | Frontend (`packages/g2-app`, `CanvasCompositor`) | — | Canvas path; owns the 400×200 compositor surface |
| Gesture routing (tab cycle, open/close) | Frontend (`panel-gesture-bus.ts`, `panel-router.ts`) | — | Panel-router owns z=2 lifecycle; gesture-bus routes events; both unchanged |
| Portrait fetch + RGBA decode | Frontend (`packages/g2-app`, new portrait canvas helper) | — | Runs in WebView (no Node/bridge involvement for canvas path) |
| Portrait dither (Floyd-Steinberg 16-step) | Frontend (`raster-worker.ts` — reuse `ditherTile`) | — | `ditherTile` is an exported function callable outside the worker context |
| Portrait slot update | Frontend (`MapBaseLayer.setPortraitOverride`) | — | Existing infra at slot 3; no new containers |
| INV-1 glyph fixture updates (Main tab row 6) | Test infrastructure (`shared-render/src/fixtures/`) | — | `sheet.main.*.txt` fixtures must update to show real class/ini/speed |
| INV-1 raster fixture (canvas sheet panel) | Test infrastructure (`packages/g2-app/__tests__/`) | — | SHA-256 hash of synthetic RGBA via `buildHudTiles`; same Phase 20 pattern |
| Downstream literal blast radius | All packages with `CharacterSnapshot` test literals | — | 27 test files; ~60–70 individual literal objects |

---

## Standard Stack

### Core (all already in repo — no new prod deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | `4.4.3` [VERIFIED: npm registry per CLAUDE.md §10] | Schema extension (`class`/`initiative`/`speed` fields) | Single schema source; same pattern as Phase 16/17 |
| `image-q` | `4.0.0` [VERIFIED: npm registry] | Floyd-Steinberg dither of portrait RGBA | Already in `packages/g2-app/package.json`; `ditherTile` is exported and reusable |
| `upng-js` | `2.1.0` [VERIFIED: npm registry] | 4-bit indexed-palette PNG encode (portrait output bytes) | Already in `packages/g2-app`; `buildHudTiles` pipeline reuses it |
| `CanvasLayer` interface | Phase 19/20 | `attachCanvas`/`paint`/`isDirty` contract | Defined in `layer-types.ts`; `CanvasStatusHudLayer` is the direct template |
| `OverlayPanel` interface | Phase 4b | `onMount`/`onUnmount`/`onEvent` panel lifecycle | Defined in `layer-types.ts`; `CharacterSheetPanel` is the direct template |
| `PanelGestureBus` | Phase 5 | Gesture routing to the active panel | `panel-gesture-bus.ts` unchanged; subscribe/unsubscribe in mount/unmount |
| `PanelRouter` | Phase 5 | `openPanel`/`closePanel` orchestration | Router owns z=2 bundle calls; canvas panel registers via `discoverPanels` |
| `MapBaseLayer.setPortraitOverride` | Phase 13 | Portrait slot 3 update | Already implemented; slot 3 = bottom-right 200×100 tile |
| `buildTabStrip` | Phase 5 | Tab strip string (reused for canvas render) | Existing `character-sheet-panel.ts` export; no changes needed |
| `ensureVt323Loaded` | Phase 20 | VT323 font for canvas text | Existing `vt323-font-loader.ts` export |
| Node `crypto` | built-in | SHA-256 for raster fixture | Test-only; proven in Phase 20 |

### No New Prod Dependencies

Phase 21 requires zero new packages. All capabilities exist in the repo.

---

## Package Legitimacy Audit

> No new packages being installed in Phase 21 — all dependencies already in the repo. Audit not required for this phase.

**Packages removed due to slopcheck verdict:** none
**Packages flagged as suspicious:** none

---

## Architecture Patterns

### System Architecture Diagram

```
R1 gesture (press/scroll/double-tap)
        |
        v
PanelGestureBus.publish(gesture)
        |
        v (subscribed in onMount)
CanvasCharacterSheetPanel.onEvent(gesture)
  |- tap/scroll    → _cycleTab() → _dirty = true
  |- double-tap    → gestureBus.unsubscribe() → panelRouter.closeActivePanel()
        |
        v (on LayerManager._compositeAndPush())
CanvasCompositor.composite()
  |- if CanvasCharacterSheetPanel.isDirty():
  |    CanvasCharacterSheetPanel.paint()
  |       |- ctx.drawImage(chromeBitmap, 0, 0)  [GPU blit — tab strip + frame]
  |       |- paintMainTab(ctx, snapshot, fontFamily)  [or paint*Tab for active tab]
  |       |- if portraitReady: ctx.drawImage(portraitBitmap, portraitBounds)
  |       |- _dirty = false
  |- drawImage(sheetCanvas, 0, 0) onto master 400×200
        |
        v
buildHudTiles(rgba) → 4 × 200×100 PNG tiles
pushHudTiles() → bridge.updateImageRawData ×4 (serialized)

Portrait fetch path (async-once, on first onMount):
snapshot.portrait.url
        |
        v  fetch() → Response.arrayBuffer()
  createImageBitmap(blob) → ImageBitmap
        |
        v  canvas.drawImage(imgBitmap) → ctx.getImageData() → RGBA
  ditherTile(rgba, greyscalePalette) → dithered Uint8ClampedArray
  UPNG.encode([dithered.buffer], W, H, 16) → Uint8Array pngBytes
        |
        v
  mapBaseLayer.setPortraitOverride(3, pngBytes)
```

### Recommended Project Structure

New files for Phase 21:

```
packages/g2-app/src/
├── panels/
│   ├── canvas-character-sheet-panel.ts      # NEW: dual CanvasLayer+OverlayPanel
│   └── canvas-character-sheet-panel.test.ts # NEW: SC tests + RCSP-INV1 raster hash
├── panels/
│   └── character-sheet-tab-renderers.ts     # MODIFY: paint*Tab canvas methods (additive)
packages/shared-protocol/src/payloads/
│   └── character.ts                         # MODIFY: add class/initiative/speed fields
packages/foundry-module/src/readers/
│   └── character-reader.ts                  # MODIFY: extractClass/extractInitiativeModifier/
│                                            #          extractWalkSpeed + getCharacterSnapshot
│   └── readers.test.ts                      # MODIFY: makeActor + new CR-CLS/CR-INI/CR-SPD tests
packages/shared-render/src/fixtures/
│   ├── sheet.main.2014.it.txt               # UPDATE: row 6 vitals bar (INI/VEL now real data)
│   ├── sheet.main.2014.en.txt               # UPDATE
│   ├── sheet.main.2014.de.txt               # UPDATE
│   ├── sheet.main.2024.it.txt               # UPDATE
│   └── canvas-sheet-panel.raster-hash.json  # NEW: SHA-256 hash fixture
```

### Pattern 1: dnd5e 5.x Field Paths for class / initiative / speed

**dnd5e 5.x canonical paths (INV-2 class — [ASSUMED: verified against combat-movement-tracker.ts which documents `actor.system.attributes.movement.walk` and Phase 16 pattern for `actor.system.attributes`]):**

```typescript
// Walking speed in feet
// Source: combat-movement-tracker.ts JSDoc (line 67): "actor.system.attributes.movement.walk"
const walkFeet = actor.system.attributes.movement?.walk ?? 30;

// Initiative modifier (dnd5e 5.x prep-time computed total)
// Source: [ASSUMED: dnd5e 5.x actor.system.attributes.init.total — standard dnd5e path;
// the `total` field mirrors the pattern of `abilities.<k>.save.value` which is
// also a prep-time computed wrapper field]
const initiativeMod = actor.system.attributes.init?.total ?? 0;

// Class name(s) — multiclass joined
// Source: [ASSUMED: actor.items filtered to type==='class', then .map(i => i.name).join(' / ')]
// The foundry-globals.d.ts line 528 confirms item type includes 'class'.
// Alternative verified in the dnd5e 5.3.3 source is actor.classes (object keyed by identifier),
// but the simpler and more reliable path across fresh actors is items filtering.
function extractClass(actor: ReturnType<typeof game.actors.get>): string {
  if (actor === undefined) return '';
  const classItems = actor.items?.contents ?? [];
  const classNames = classItems
    .filter((item: unknown) => (item as Record<string, unknown>).type === 'class')
    .map((item: unknown) => (item as Record<string, unknown>).name as string)
    .filter((name: string) => name.length > 0);
  if (classNames.length === 0) return '';
  return classNames.join(' / ');
}
```

**Dnd5eAttributes interface extension needed** (add to `foundry-globals.d.ts`):

```typescript
interface Dnd5eAttributes {
  // existing fields: hp, ac, exhaustion, death
  /** Initiative modifier — dnd5e prep-time computed total (Phase 21). */
  init?: { total?: number };
  /** Movement speeds in feet (Phase 21). */
  movement?: { walk?: number; fly?: number; swim?: number; climb?: number };
}
```

**extractInitiativeModifier and extractWalkSpeed reader pattern:**

```typescript
// Pattern mirrors extractAbilities / extractSkills — defensive nullish-coalesce
function extractInitiativeModifier(actor: ReturnType<typeof game.actors.get>): number {
  if (actor === undefined) return 0;
  return actor.system?.attributes?.init?.total ?? 0;
}

function extractWalkSpeed(actor: ReturnType<typeof game.actors.get>): number {
  if (actor === undefined) return 30; // D&D 5e standard default
  const walk = actor.system?.attributes?.movement?.walk;
  return typeof walk === 'number' && walk >= 0 ? walk : 30;
}
```

**Wiring into `getCharacterSnapshot`:**

```typescript
return {
  // ... existing fields ...
  class: extractClass(actor),
  initiative: extractInitiativeModifier(actor),
  speed: extractWalkSpeed(actor),
  // ...
};
```

### Pattern 2: CanvasCharacterSheetPanel — Dual-Interface Class

The panel must simultaneously implement `CanvasLayer` AND satisfy `OverlayPanel` (via `isOverlayPanel()` duck-type check). `OverlayPanel` requires `onMount`/`onUnmount`/`onEvent`; `CanvasLayer` requires `attachCanvas`/`paint`/`isDirty`.

**The panel-router discovers panels via `discoverPanels()` glob matching `**/*-panel.ts`.** The canvas panel file is named `canvas-character-sheet-panel.ts` — it matches the glob. `discoverPanels` validates `static meta` via `PanelMetaSchema.safeParse`. The new panel must expose the same `static meta` as `CharacterSheetPanel` with `id: 'character-sheet'`. **The glyph `CharacterSheetPanel` must be excluded from discovery when canvas mode is active** — OR both panels may coexist with different IDs and the router switches which is opened.

**Recommended approach (Claude's discretion):** Give `CanvasCharacterSheetPanel` the same `id: 'character-sheet'` as the glyph panel. `discoverPanels()` processes files alphabetically; the glyph `character-sheet-panel.ts` and the new `canvas-character-sheet-panel.ts` both export a class with `id: 'character-sheet'`. The router's registry is keyed by `id` — the second registration silently overwrites the first. This means alphabetic discovery order determines which wins. **Alternative:** give the canvas panel `id: 'canvas-character-sheet'` and rename the boot-time invocation to open `'canvas-character-sheet'` when `renderMode === 'canvas'`. The planner must decide; research recommends the boot-time conditional dispatch approach (gate in `onNavigate`) since it avoids relying on glob sort order.

**Skeleton:**

```typescript
// Source: CanvasStatusHudLayer (Phase 20) + CharacterSheetPanel (Phase 5) patterns
// [ASSUMED: exact method signature details; dual-interface is inferred from layer-types.ts]
export default class CanvasCharacterSheetPanel implements CanvasLayer, OverlayPanel {
  static meta: PanelMeta = {
    id: 'canvas-character-sheet',  // distinct id from glyph panel
    title: { it: 'Scheda', en: 'Sheet' },
    navKey: 'S',
    requiredCaps: [],
    defaultTab: 'main',
  };

  public readonly id = 'canvas-character-sheet';
  public readonly z = ZIndex.Z2_OVERLAY;

  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  private _chromeBitmap: ImageBitmap | null = null;
  private _dirty = true;
  private _fontFamily = '16px monospace';
  private _snapshot: CharacterSnapshot | null = null;
  private _activeTabIndex = 0;
  private _scrollOffset = 0;
  private _unsubscribeGesture: (() => void) | null = null;
  private _portraitBitmap: ImageBitmap | null = null;

  // CanvasLayer
  async attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<void> { ... }
  paint(): void { ... }
  isDirty(): boolean { return this._dirty; }

  // OverlayPanel
  async onMount(): Promise<void> {
    this._unsubscribeGesture = this.gestureBus.subscribe((g) => this.onEvent(g));
    await this._fetchPortraitAsync();  // fire-and-forget or awaited
  }
  async onUnmount(): Promise<void> {
    this._unsubscribeGesture?.();
    this._unsubscribeGesture = null;
    this.mapBaseLayer?.setPortraitOverride(3, null);
  }
  onEvent(gesture: R1Gesture): void { /* tab cycle + dirty */ }

  // Layer
  draw(): Promise<void> { return Promise.resolve(); }
  getContainerCount(): { image: 0; text: 0 } { return { image: 0, text: 0 }; }
  destroy(): void { this._portraitBitmap?.close(); this._portraitBitmap = null; }
  getCaptureContainer(): string { return 'hud-capture'; }
}
```

### Pattern 3: Gesture Wiring — Byte-Identical Semantics

The canvas panel subscribes to `PanelGestureBus` in `onMount` exactly as `CharacterSheetPanel.onMount()` does. `panel-gesture-bus.ts` is NOT modified. The gesture dispatch in `onEvent` mirrors the glyph panel:

```typescript
onEvent(gesture: R1Gesture): void {
  switch (gesture.kind) {
    case 'tap':
    case 'scroll':
      if (gesture.kind === 'scroll' && gesture.direction === 'up') {
        this._activeTabIndex = (this._activeTabIndex - 1 + TABS.length) % TABS.length;
      } else {
        this._activeTabIndex = (this._activeTabIndex + 1) % TABS.length;
      }
      this._scrollOffset = 0;
      void this._persistLastTab();
      this._dirty = true;
      break;
    case 'double-tap':
      // Close the panel — delegates via panelRouter (how? see Open Question 1)
      break;
  }
}
```

**Key constraint:** `panel-gesture-bus.ts` has NO `unsubscribe-all` or `clear` method beyond what the closure returned by `subscribe` does — it is entirely unchanged.

### Pattern 4: Portrait Fetch / Dither / Slot

The portrait pipeline for the canvas panel differs from the glyph path (`portrait-dispatcher.ts` + `portrait-state.ts` which receive pre-dithered bytes from the bridge). In the canvas panel, the portrait is fetched **client-side** (in the WebView) and dithered using the same `image-q` palette that `raster-worker.ts` uses. This avoids adding a new bridge endpoint.

```typescript
// Source: raster-worker.ts exported ditherTile() + buildGreyscalePalette() pattern
// [ASSUMED: ditherTile is exported from raster-worker.ts module scope — verified by reading
//  raster-worker.ts lines 193-199: `export function ditherTile(...)`... actually NOT exported
//  (no `export` keyword visible in the snippet). See Open Question 2.]

// ALTERNATIVE if ditherTile is not exported:
// Re-implement the same 3-line dither call inline using ImageQ.applyPaletteSync
// (the palette construction is trivial — 16 greyscale steps)

private async _fetchPortraitAsync(): Promise<void> {
  const url = this._snapshot?.portrait?.url;
  if (url === undefined) return;
  try {
    // 1. Fetch portrait image
    const response = await fetch(url);
    if (!response.ok) return; // silently skip on fetch error
    const blob = await response.blob();

    // 2. Decode to ImageBitmap (available in WKWebView)
    const imgBitmap = await createImageBitmap(blob, { resizeWidth: 100, resizeHeight: 100 });

    // 3. Draw to scratch canvas → get RGBA bytes
    const scratch = new OffscreenCanvas(100, 100);
    const sCtx = scratch.getContext('2d');
    if (sCtx === null) return;
    sCtx.drawImage(imgBitmap, 0, 0, 100, 100);
    imgBitmap.close();
    const imageData = sCtx.getImageData(0, 0, 100, 100);

    // 4. Greyscale + Floyd-Steinberg dither (reuse image-q)
    const pal = _buildGreyscalePalette();  // same as raster-worker buildGreyscalePalette()
    const dithered = _ditherPortrait(imageData.data, 100, 100, pal);

    // 5. Encode to 4-bit PNG
    const pngBytes = new Uint8Array(
      UPNG.encode([dithered.buffer as ArrayBuffer], 100, 100, 16)
    );

    // 6. Push to MapBaseLayer portrait slot
    this._mapBaseLayer?.setPortraitOverride(3, pngBytes);

    // 7. Cache as ImageBitmap for canvas overlay (optional — can draw from pngBytes)
    this._portraitBitmap = await createImageBitmap(scratch);

  } catch {
    // Non-fatal — portrait silently omitted
  }
}
```

**G2 image-container hard limits (INV-2 verified 2026-06-05):** Each image container is max 200×100 px. Slot 3 is one 200×100 tile. A 100×100 portrait image fits within a 200×100 container. The portrait occupies the right half of tile 3 (or the top half — exact placement within the tile is Claude's discretion).

### Pattern 5: INV-1 Glyph Fixture Delta (Main Tab Row 6)

The existing glyph `renderMainTab` row 6 currently shows:

```
⛨ CA 18    ⚡ INI —    ⚔ VEL —    COMP +3
```

After Phase 21, `INI —` → `INI +3` (or whatever the snapshot value is for the fixture snapshot) and `VEL —` → `VEL 30`. The `renderMainTab` function currently uses a hardcoded `dash = '—'` for these two fields. Phase 21 replaces these with `formatAbilityMod(snapshot.initiative)` and `snapshot.speed` respectively.

**Fixture files that require content update (row 6 vitals bar only):**
- `sheet.main.2014.it.txt` — row 6 `⚡ INI —    ⚔ VEL —` changes
- `sheet.main.2014.en.txt` — row 6 same
- `sheet.main.2014.de.txt` — row 6 same
- `sheet.main.2024.it.txt` — row 6 same

The fixture snapshot (Thorin Oakenshield, Fighter Lv 8) will use the defensive default values until a full test actor is constructed. For fixture generation, Thorin's typical stats: `initiative: +2` (DEX +2), `speed: 25` (dwarf), `class: 'Fighter'`. These values must be consistent with the `VALID_SNAPSHOT` / `makeSnapshot` shared test factories.

**Row 1 also changes:** `Lv 8` → potentially `Fighter Lv 8` if `class` is surfaced on the race/class line. The planner decides whether to add class name to the canvas Main tab layout; the glyph renderer must also be updated to surface class on row 1 (or left as Lv-only for the glyph path). The CONTEXT.md says the canvas panel shows "real class/level + initiative + speed replacing `—` placeholders" — row 1 currently shows `Lv 8`. Surfacing class name there requires updating row 1 of the glyph renderer and 4 fixtures. This is likely an INV-1 fixture update for row 1 as well.

### Anti-Patterns to Avoid

- **Calling `panel-gesture-bus.ts` subscribe outside of `onMount`:** the unsubscribe closure must be stored and called in `onUnmount` or the panel leaks (T-4b-01-03).
- **Returning non-zero from `getContainerCount()`:** canvas layers must return `{image:0, text:0}` or `LayerManager._assertContainerBudget` throws.
- **Concurrent `updateImageRawData` calls:** portrait byte push via `setPortraitOverride` goes through `MapBaseLayer.draw()`; the serialization contract in `pushHudTiles` handles this. Never call `updateImageRawData` directly from the canvas panel.
- **Using `z.strictObject` on `CharacterSnapshotSchema` for forward-compat:** it already uses `z.strictObject`; adding the 3 new fields inside that strict object is correct — they become REQUIRED with no `.optional()` gap.
- **Hashing canvas-rendered text for RCSP-INV1:** non-deterministic in happy-dom. Use the synthetic RGBA → `buildHudTiles` pipeline (same Phase 20 RINV-01 pattern).
- **Blocking `onMount` on portrait fetch:** the portrait fetch must be fire-and-forget (or separated so `onMount` does not block on it). `LayerManager.bundle()` awaits `onMount` before the first flush; blocking on a network fetch here would delay the panel appearing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Floyd-Steinberg 16-step greyscale dither | Custom FS implementation | `image-q`'s `applyPaletteSync` (same 16-step palette as `raster-worker.ts`) | Error propagation is subtle; existing code is tested; same output = consistent visuals |
| 4-bit indexed-palette PNG encode | Custom encoder | `UPNG.encode([buf], W, H, 16)` (already in `g2-app/package.json`) | Same encoder as map tiles; 4-bit PNG is non-trivial |
| Font loading | Manual `fetch` + ArrayBuffer | `ensureVt323Loaded()` from `vt323-font-loader.ts` (Phase 20) | Try/catch `self.fonts` fallback already implemented; monospace fallback tested |
| Portrait slot management | New image container | `MapBaseLayer.setPortraitOverride(slot, bytes)` | Existing infra; slot 3 already reserved; no container budget impact |
| Schema type widening | `.optional()` interim state | REQUIRED field + atomic commit (Phase 16/17 precedent) | Prevents drift window where schema accepts but renderer expects |
| Tab strip rendering | Reimplemented tab row | `buildTabStrip(activeIdx)` (already exported from `character-sheet-panel.ts`) | Width-invariant (70 cp) already tested; reuse the string even in canvas text rendering |

**Key insight:** the entire raster pipeline (dither → encode → push) already works for the map tiles; the portrait is a smaller version of the same operation.

---

## Runtime State Inventory

> This is a greenfield canvas panel + additive schema extension. No rename/refactor involved. Category answered explicitly per protocol.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Even Hub `view.sheet.lastTab` kv key stores tab id string ('main'/'skills'/etc.) — no change to key semantics; canvas panel reads same key | None — tab id strings unchanged |
| Live service config | None — canvas panel is a client-side g2-app change; no bridge endpoints added | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | `packages/foundry-module/release/` — zip release artifact must be rebuilt after schema/reader changes in foundry-module. Build is manual (`tsup build` → stage → zip) per `foundry-module-build-release-recipe.md` memory | Rebuild release artifact after Phase 21 |

---

## Common Pitfalls

### Pitfall 1: `CanvasLayer` + `OverlayPanel` Dual-Interface Type Error

**What goes wrong:** TypeScript reports the class does not satisfy `OverlayPanel` because `CanvasLayer` and `Layer` overlap on `draw()`, `destroy()`, `getContainerCount()`. However, `CanvasLayer extends Layer` and `OverlayPanel extends Layer`, so implementing both is valid — no actual conflict.

**Why it happens:** TypeScript may infer the wrong return type if `getContainerCount()` declares `{image:0; text:0}` (literal) but `Layer` declares `{image: number; text: number}`. Use a type assertion or widen the return type to match the interface.

**How to avoid:** Declare the method as `getContainerCount(): { image: 0; text: 0 }` (narrow literal type, which satisfies `{image:number;text:number}` covariance) — same pattern as `CanvasStatusHudLayer`.

**Warning signs:** `TS2420: Class 'CanvasCharacterSheetPanel' incorrectly implements interface 'CanvasLayer'`.

### Pitfall 2: `discoverPanels()` Registers Both Glyph and Canvas Panel

**What goes wrong:** If both `character-sheet-panel.ts` and `canvas-character-sheet-panel.ts` export a class with `id: 'character-sheet'`, the router's Map deduplicates by id — the last one written wins (depends on glob traversal order, which is alphabetical by filename). `canvas-character-sheet-panel.ts` sorts before `character-sheet-panel.ts` alphabetically (`c` < `ch`... wait: 'c-a' < 'c-h' alphabetically → `canvas-character-sheet-panel.ts` comes first → glyph panel wins). Glob order is non-deterministic across bundlers.

**Why it happens:** `discoverPanels()` uses `import.meta.glob('../panels/**/*-panel.ts')`. The iteration order of the returned object is module-resolution-order, not alphabetical in Vite.

**How to avoid:** Use distinct IDs (`canvas-character-sheet` vs `character-sheet`) and gate which panel is opened in `boot-engine-core.ts` based on `renderMode`. The `openPanel` call in `onNavigate` checks `layerManager.getRenderMode()` and opens either `'canvas-character-sheet'` or `'character-sheet'`.

**Warning signs:** Glyph panel being opened in canvas mode (or vice versa) when pressing the Quick Action Sheet key.

### Pitfall 3: `attachCanvas()` Blocks on Portrait Fetch

**What goes wrong:** If the portrait fetch is `await`-ed inside `attachCanvas()`, the `LayerManager.bundle()` which awaits `attachCanvas` will block until the portrait HTTP response resolves. A slow or failing portrait URL stalls the panel mount.

**Why it happens:** `attachCanvas` is awaited by `LayerManager.bundle()` before the first composite.

**How to avoid:** Portrait fetch must be fire-and-forget from `onMount()` (not from `attachCanvas()`). The panel becomes visible immediately; portrait appears on the first composite after the async fetch resolves and sets `_dirty = true`.

**Warning signs:** Panel takes >100ms to open because portrait URL is slow or returns 404.

### Pitfall 4: `ditherTile` Not Exported from `raster-worker.ts`

**What goes wrong:** `ditherTile` is defined as a module-level function in `raster-worker.ts` but without an `export` keyword (verified in the source read: `function ditherTile(...)` at line 193, no `export`). Attempting to `import { ditherTile }` from `raster-worker.ts` fails.

**Why it happens:** Worker files often keep internal helpers non-exported to avoid polluting the module API.

**How to avoid:** Extract the dither helper into a shared utility file (e.g., `packages/g2-app/src/raster/dither-utils.ts`) that exports `ditherTile` and `buildGreyscalePalette`. Both `raster-worker.ts` and the new canvas panel import from `dither-utils.ts`. This is a refactor within g2-app (no new deps, no blast radius outside this package). See Open Question 3 for the alternative.

**Warning signs:** TypeScript `Module '..raster-worker.ts' has no exported member 'ditherTile'`.

### Pitfall 5: Portrait Size Exceeds G2 Image-Container Hard Limits

**What goes wrong:** A 100×100 portrait exceeds the G2 image-container maximum of 200×100 px per container. Wait — 100×100 is within the 200×100 limit (height 100 = max, width 100 ≤ max 200). However, `MapBaseLayer.setPortraitOverride` pushes raw bytes to slot 3 (`map-tile-3`) via `bridge.updateImageRawData`. The bytes must be a 4-bit indexed-palette PNG of exactly the slot size (200×100). A 100×100 portrait at slot 3 must be padded/embedded into a 200×100 frame.

**Why it happens:** `setPortraitOverride` accepts `Uint8Array | null` directly without size validation. If the bytes are for a 100×100 PNG but the container expects 200×100, the G2 may reject or crop.

**How to avoid:** Encode the portrait as a 200×100 PNG with the portrait image positioned (e.g., top-left or centered in one half). Build a 200×100 canvas, draw the 100×100 portrait onto it, encode the full 200×100 surface. Alternative: match the existing `portrait-state.ts` convention which validates `width/height: z.literal(100/60)` — the old glyph path used 100×60. For the canvas path, pick a consistent size that fits in a 200×100 tile and document it.

**Warning signs:** G2 device rejecting the `updateImageRawData` call silently (no error in the SDK, but portrait tile stays blank).

### Pitfall 6: `z.strictObject` + New REQUIRED Fields Breaks 27 Test Files

**What goes wrong:** `CharacterSnapshotSchema` uses `z.strictObject`. Adding `class`, `initiative`, `speed` as REQUIRED fields means every existing `CharacterSnapshot` literal in tests is immediately invalid (TypeScript compile error + Zod parse fail).

**Why it happens:** This is by design (Phase 16/17 precedent). The plan MUST include a dedicated wave/task to update all ~60–70 literal objects across 27 test files.

**How to avoid:** Follow the Phase 17 approach: complete the schema+reader commit first, then run `pnpm typecheck` to surface all literal errors, then fix them in one atomic "downstream literal update" task. The task is mechanical but large.

**Warning signs:** `pnpm typecheck` exits non-zero after the schema commit with ~200 errors (60–70 literals × 3 fields each).

### Pitfall 7: `CanvasCharacterSheetPanel.onEvent` Close Path

**What goes wrong:** The glyph `CharacterSheetPanel` handles `double-tap` as a no-op stub because "Phase 6 NAV-01 wires close behaviour". Phase 6 has since completed (ADR-0012 over-scroll + double-tap exit). The canvas panel must wire close correctly — calling `panelRouter.closeActivePanel()`. But `CanvasCharacterSheetPanel` needs a reference to `panelRouter` which is not in the standard `CharacterSheetPanel` constructor.

**Why it happens:** Panel-router owns z=2 bundle calls; panels are not supposed to call `closeActivePanel` themselves (CONTEXT.md §Area 1 anti-pattern). The ADR-0012 close gesture is routed at the router level for glyph panels.

**How to avoid:** Check how the glyph `CharacterSheetPanel` actually handles close today — the `panel-router.ts` listens for `double-tap` at the bus level and calls `closeActivePanel()` directly (panel-level `double-tap` is a no-op stub; the router intercepts it above). The canvas panel should preserve this by NOT intercepting `double-tap` in `onEvent` (let the no-op stand) and ensuring the router's `double-tap` handler fires correctly. The planner must verify how the glyph path closes — if the router intercepts at bus level before the panel sees it, no action needed in `onEvent`.

**Warning signs:** Double-press on the sheet panel does nothing (panel doesn't close).

---

## Code Examples

### Schema Extension (shared-protocol/src/payloads/character.ts)

```typescript
// Source: CharacterSnapshotSchema in packages/shared-protocol/src/payloads/character.ts
// Pattern: Phase 16 abilities + Phase 17 skills REQUIRED atomic extension
export const CharacterSnapshotSchema = z.strictObject({
  // ... existing fields (actorId, name, hp, maxHp, tempHp, ac, level, conditions,
  //     exhaustion, death, world, inventory, spells, abilities, skills, portrait) ...

  /**
   * Character class display name (Phase 21 Plan 21-01 atomic extension; RDATA-01).
   * REQUIRED — empty string for classless or fresh actors.
   * Multiclass: joined as "Fighter / Wizard" (reader extracts from actor.items).
   * `level` carries the numeric level separately — this field is class name(s) only.
   */
  class: z.string(),

  /**
   * Initiative modifier — dnd5e prep-time computed total (Phase 21; RDATA-02).
   * REQUIRED — integer, may be negative.
   * Reader: actor.system.attributes.init.total ?? 0.
   */
  initiative: z.number().int(),

  /**
   * Walking speed in feet (Phase 21; RDATA-02).
   * REQUIRED — non-negative integer (standard D&D 5e: 30 ft; dwarves 25 ft).
   * Reader: actor.system.attributes.movement.walk ?? 30.
   * Other movement modes (fly/swim/climb) deferred to future phase.
   */
  speed: z.number().int().nonnegative(),
});
```

### raster-worker.ts dither export extraction

```typescript
// packages/g2-app/src/raster/dither-utils.ts (NEW)
// Source: extracted from raster-worker.ts lines 112-119 + 193-199
import * as ImageQ from 'image-q';

/** Canonical 16-step phosphor-green greyscale palette (0,16,32,...,240). */
export function buildGreyscalePalette(): ImageQ.utils.Palette {
  const pal = new ImageQ.utils.Palette();
  for (let i = 0; i < 16; i++) {
    const v = i * 16;
    pal.add(ImageQ.utils.Point.createByRGBA(v, v, v, 255));
  }
  return pal;
}

/** Floyd-Steinberg dither one tile against the greyscale palette. */
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

Then `raster-worker.ts` imports `ditherTile` and `buildGreyscalePalette` from `./dither-utils.js` instead of defining them inline. Net change: zero new behavior, zero blast radius beyond g2-app.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `INI —` and `VEL —` placeholders in Main tab | Real `initiative` + `speed` from schema | Phase 21 | Requires 4 INV-1 glyph fixture updates (sheet.main.*.txt row 6) |
| Character sheet glyph-only (text containers) | Dual-output: glyph path preserved + canvas path added | Phase 21 | `CanvasCharacterSheetPanel` additive; glyph `CharacterSheetPanel` untouched |
| `ditherTile` internal to `raster-worker.ts` | Extracted to `dither-utils.ts` for shared use | Phase 21 | Enables portrait dither in canvas panel without duplicating the algorithm |
| Portrait via `portrait-dispatcher.ts` + bridge pre-dither | Portrait fetched and dithered client-side in canvas panel | Phase 21 | Avoids bridge endpoint for portrait; client-side ImageBitmap + image-q pipeline |

**Deprecated/outdated:**
- `ditherTile` as a private raster-worker function: superseded by the shared `dither-utils.ts` extract. The old raster-worker.ts still works; it just delegates to the shared module.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `actor.system.attributes.init.total` is the dnd5e 5.x prep-time computed initiative modifier | §Pattern 1 | MEDIUM — if the path is different (e.g. `init.mod`), the reader emits wrong values. Mitigation: the reader has a defensive `?? 0` default. INV-2 verification against github.com/foundryvtt/dnd5e/release-5.3.3 recommended before coding. |
| A2 | `actor.system.attributes.movement.walk` gives walking speed in feet | §Pattern 1 | LOW — corroborated by `combat-movement-tracker.ts` JSDoc line 67 in the repo |
| A3 | Class name(s) come from `actor.items.contents` filtered to `type === 'class'` | §Pattern 1 | MEDIUM — dnd5e 5.x also exposes `actor.classes` (object keyed by identifier); both paths exist. The items path is safer because it works even when `actor.classes` is sparsely populated. |
| A4 | `ditherTile` in `raster-worker.ts` is NOT currently exported (no `export` keyword) | §Pitfall 4 | HIGH — if it IS exported, the extraction to `dither-utils.ts` is optional (can `import { ditherTile }` directly). Plan should verify with `grep -n "export function ditherTile"` before deciding. |
| A5 | Portrait fetch via `fetch()` is available in the Even Realities WebView | §Pattern 4 | LOW — Even Hub network whitelist requires the portrait URL origin to be whitelisted in `app.json`. The bridge already serves portraits via a `/portrait` endpoint (Phase 13). The canvas panel fetches from the bridge, which is already whitelisted. |
| A6 | A 100×100 portrait PNG can be pushed to slot 3 (200×100 container) by embedding it in a 200×100 PNG | §Pitfall 5 | MEDIUM — the G2 may require the image to be exactly 200×100 (the container declared size). Mitigation: always encode at 200×100 regardless of source size. Portrait occupies left or right half. |
| A7 | `CanvasCharacterSheetPanel` can coexist with `CharacterSheetPanel` in the panel-router discovery if they use distinct IDs | §Pattern 2 / Pitfall 2 | LOW — `discoverPanels()` keyed by `static meta.id`; two distinct IDs cause two registry entries. Boot-time dispatch opens the correct one based on `renderMode`. |
| A8 | `double-tap` close is handled at the panel-router level (not the panel's `onEvent`) for the glyph path | §Pitfall 7 | MEDIUM — if the glyph panel's `double-tap` is handled in `onEvent` by calling a router method, the canvas panel must do the same. Research reads the glyph panel `onEvent` switch: `'double-tap': break;` (no-op stub). The actual close mechanism is not confirmed in this research. |
| A9 | Downstream blast radius is approximately 27 test files / ~60–70 individual `CharacterSnapshot` literal objects | §Pitfall 6 | LOW — count is based on `grep -l "skills:" + grep -l "abilities:"` across test files (29 files found) and `actorId:` occurrence count weighted by file. Actual number may be ±10 after spread-operator counting. |

---

## Open Questions

1. **Panel-router close gesture for canvas panel**
   - What we know: glyph `CharacterSheetPanel.onEvent` has `'double-tap': break;` (no-op stub). ADR-0012 over-scroll + double-tap exit is wired at the router level.
   - What's unclear: where exactly in `panel-router.ts` / `boot-engine-core.ts` is the double-tap close wired? Does the router subscribe to the bus independently and intercept `double-tap` before the panel sees it?
   - Recommendation: read `panel-router.ts` `openPanel` and `panel-gesture-bus` subscribe calls in `boot-engine-core.ts` before implementing the canvas panel. If the router handles close, the canvas panel's `onEvent` double-tap can stay a no-op.

2. **`ditherTile` export status in `raster-worker.ts`**
   - What we know: the function definition at line 193 starts with `function ditherTile(` — the research read was truncated at line 200 and may not have shown the `export` keyword definitively.
   - What's unclear: is `ditherTile` already exported?
   - Recommendation: `grep -n "^export function ditherTile"` in `raster-worker.ts` before the Wave 0 task. If exported: import directly. If not: create `dither-utils.ts` as described.

3. **Portrait PNG size for MapBaseLayer slot 3**
   - What we know: `portrait-state.ts` validates `width/height: z.literal(100/60)` (100×60 from the bridge's server-side dither). The `MapBaseLayer._portraitOverride` slot pushes raw bytes via `bridge.updateImageRawData` for the `map-tile-3` container (200×100 declared size).
   - What's unclear: does the G2 accept a 100×60 or 100×100 PNG into a 200×100 container, or does it require exactly 200×100? The existing `portrait-state` path uses 100×60.
   - Recommendation: for safety, use 100×60 consistent with the existing bridge path (Phase 13 validated this size on the sim). Encode portrait as 100×60 (not 100×100) within the 200×100 container.

4. **`paint*Tab` canvas method signatures — Claude's Discretion**
   - What we know: the CONTEXT.md leaves exact signatures at Claude's discretion.
   - Recommendation: use `paintMainTab(ctx: Context2D, snapshot: CharacterSnapshot, bounds: TabBounds, font: string): void` where `TabBounds = {x, y, w, h}`. The `TabBounds` object allows the panel to position each tab's content area within the 400×200 compositor surface. The chrome (tab strip + frame) is pre-baked separately.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `image-q` | Portrait dither | ✓ (in g2-app package.json) | 4.0.0 | — |
| `upng-js` | Portrait PNG encode | ✓ (in g2-app package.json) | 2.1.0 | — |
| `OffscreenCanvas` | Portrait decode scratch | ✓ (WebView) | platform | happy-dom graceful degrade (null ctx) |
| `createImageBitmap` | Portrait decode | ✓ (WebView) | platform | try/catch — skip portrait if unavailable |
| `fetch()` | Portrait URL fetch | ✓ (WebView) | platform | try/catch — omit silently |
| Node `crypto` | SHA-256 raster fixture | ✓ | Node 24.x | — |
| Vitest 4 | Test runner | ✓ | 4.1.5 | — |
| happy-dom | Test environment | ✓ | 20.9.0 | Canvas 2D degrades to null ctx |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** all canvas APIs degrade gracefully (null-ctx guards already established in Phase 20 pattern)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root workspace config) |
| Quick run command | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'SC[1-6]\|RCSP\|CSTR-CLS\|CSTR-INI\|CSTR-SPD'` |
| Full suite command | `pnpm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RDATA-01 | `class` field REQUIRED on CharacterSnapshotSchema; reader emits class name(s) from actor.items | unit | `pnpm --filter @evf/foundry-module test -- --run --testNamePattern 'CR-CLS'` | ❌ Wave 0 — `readers.test.ts` extension |
| RDATA-02 | `initiative` + `speed` REQUIRED; readers emit from actor.system.attributes.init.total + movement.walk | unit | `pnpm --filter @evf/foundry-module test -- --run --testNamePattern 'CR-INI\|CR-SPD'` | ❌ Wave 0 |
| RSHEET-01 | CanvasCharacterSheetPanel paints 6 tabs on canvas; chrome pre-baked; dirty-gate | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'RCSP-SC[1-3]'` | ❌ Wave 0 — `canvas-character-sheet-panel.test.ts` |
| RSHEET-02 | Gesture: tap/scroll cycles tabs (byte-identical to glyph path); double-tap no-op in onEvent | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'RCSP-SC4\|RCSP-GEST'` | ❌ Wave 0 |
| RSHEET-03 | Portrait fetch: async-once, dithered, pushed to slot 3; fetch-fail silently omitted | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'RCSP-PORTRAIT'` | ❌ Wave 0 |
| INV-1 (glyph sheet) | sheet.main.*.txt fixtures pass after row-6 vitals bar update (INI/VEL real values) | inv | `pnpm --filter @evf/shared-render test -- --run` | ✅ fixtures need UPDATE |
| INV-1 (raster sheet) | SHA-256 hash of canvas sheet panel synthetic RGBA matches fixture | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'RCSP-INV1'` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'RCSP'` + `pnpm --filter @evf/foundry-module test -- --run --testNamePattern 'CR-CLS\|CR-INI\|CR-SPD'`
- **Per wave merge:** `pnpm test -- --run` (workspace-wide, currently 3180 tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — `CanvasCharacterSheetPanel` class
- [ ] `packages/g2-app/src/panels/canvas-character-sheet-panel.test.ts` — RCSP-SC1..6 + RCSP-PORTRAIT + RCSP-INV1
- [ ] `packages/g2-app/src/raster/dither-utils.ts` — `ditherTile` + `buildGreyscalePalette` (if not already exported from raster-worker.ts)
- [ ] `packages/shared-render/src/fixtures/canvas-sheet-panel.raster-hash.json` — SHA-256 hash fixture
- [ ] `packages/foundry-module/src/types/foundry-globals.d.ts` — `init?: {total?:number}` + `movement?: {walk?:number}` additions to `Dnd5eAttributes`

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Canvas rendering only |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | No access control changes |
| V5 Input Validation | yes (low) | `CharacterSnapshotSchema.safeParse` gate in `_onDelta` (inherited from Phase 20 pattern); portrait URL validated via `try/catch` on fetch |
| V6 Cryptography | no | SHA-256 for INV-1 fixture is not security-sensitive |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `character.delta` payload reaching canvas renderer | Tampering | `CharacterSnapshotSchema.safeParse` gate (already implemented in `CanvasStatusHudLayer._onDelta`; same pattern for canvas sheet panel) |
| Portrait URL pointing to external domain not in `app.json` whitelist | Information Disclosure | Even Hub blocks fetches to non-whitelisted origins; bridge portrait endpoint is already whitelisted; no user-controlled URL injection path |
| Portrait PNG containing malicious payload | Tampering | `createImageBitmap` decodes the image to pixels; the PNG payload is consumed as pixel data, not executed |

---

## Project Constraints (from CLAUDE.md)

- **INV-1:** ASCII mockups and raster tile hashes are load-bearing. All 4 `sheet.main.*.txt` fixtures AND the new `canvas-sheet-panel.raster-hash.json` must be updated/created atomically with the renderers that produce them.
- **INV-2:** Technical claims must cite canonical upstream sources. The dnd5e `init.total` and `movement.walk` paths [ASSUMED] must be verified against `github.com/foundryvtt/dnd5e/release-5.3.3` before Phase 21 plan execution (or the reader uses the defensive `?? 0`/`?? 30` defaults which are safe even if the path is slightly wrong).
- **INV-3:** `Specs.md` + `README.md` + `docs/showcase/index.html` update in the same commit for any cross-cutting change. Phase 21 changes the canvas rendering of the character sheet — update Specs.md §7.5 (Main tab mockup) to show class/INI/speed in the vitals row when the phase closes.
- **INV-4:** Zero dead/unreachable code. Every `// TODO` needs `(#issue)` or `(ADR-NNNN)`. JSDoc on every public API. `paint*Tab` methods and `_fetchPortraitAsync` must have full JSDoc.
- **Tech stack:** `image-q` + `upng-js` (no alternatives). TypeScript strict + Biome + Vitest coverage gate. No React/VDOM.
- **G2 image-container hard limits:** max 4 containers, each 20–200×100 px. Portrait goes into existing slot 3 via `setPortraitOverride` — no new containers. `getContainerCount()` must return `{image:0, text:0}` for the canvas panel.
- **Gesture set:** only `press / double-press / swipe-up / swipe-down` — no long-press. `panel-gesture-bus.ts` unchanged.
- **`panel-gesture-bus.ts` NOT modified** (SC2 gesture-identity locked decision).

---

## Sources

### Primary (HIGH confidence)
- `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` — Phase 20 CanvasLayer template (read directly from repo)
- `packages/g2-app/src/panels/character-sheet-panel.ts` — existing glyph panel (read directly)
- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` — `renderMainTab`/`renderSkillsTab` etc. (read directly)
- `packages/foundry-module/src/readers/character-reader.ts` — `extractAbilities`/`extractSkills` reader pattern (read directly)
- `packages/foundry-module/src/types/foundry-globals.d.ts` — `Dnd5eActorSystem`/`Dnd5eAttributes` shape (read directly)
- `packages/shared-protocol/src/payloads/character.ts` — `CharacterSnapshotSchema` current state (read directly)
- `packages/g2-app/src/engine/layer-types.ts` — `CanvasLayer`/`OverlayPanel` interface definitions (read directly)
- `packages/g2-app/src/raster/map-base-layer.ts` — `setPortraitOverride` infra (read directly)
- `packages/g2-app/src/panels/portrait-state.ts` — portrait cache pattern (read directly)
- `packages/g2-app/src/raster/raster-worker.ts` — `ditherTile`/`buildGreyscalePalette` functions (read directly)
- `packages/foundry-module/src/write-path/combat-movement-tracker.ts` — confirms `actor.system.attributes.movement.walk` path (read directly)
- `packages/shared-render/src/fixtures/sheet.main.2014.it.txt` — current Main tab fixture (read directly)
- `.planning/phases/EVF-20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline/20-RESEARCH.md` — Phase 20 CanvasLayer patterns (read directly)
- Workspace test count: `pnpm test -- --run` → 3180 tests across 235 test files (verified via Bash)
- Downstream blast radius: `grep -l "skills:"+`grep -l "abilities:"` → 27 files with full CharacterSnapshot literals (verified via Bash)

### Secondary (MEDIUM confidence)
- `packages/foundry-module/src/readers/readers.test.ts` — `makeActor` mock shape; no `init` or `movement` fields currently present → confirms these are new additions to the foundry-globals type (read directly)
- Phase 20 RESEARCH.md `[VERIFIED]` + `[ASSUMED]` tags — baseline for canvas patterns

### Tertiary (LOW confidence)
- `actor.system.attributes.init.total` path [ASSUMED] — standard dnd5e 5.x attribute; not yet present in `Dnd5eAttributes` type; needs INV-2 verification against github.com/foundryvtt/dnd5e
- `ditherTile` export status in `raster-worker.ts` [ASSUMED not exported] — truncated read at line 200; verify with grep before planning

---

## Metadata

**Confidence breakdown:**
- Schema extension pattern (class/initiative/speed): HIGH — Phase 16/17 precedent exactly mirrors; blast radius count is precise
- Architecture (dual-interface CanvasLayer+OverlayPanel): HIGH — both interfaces read from source; `CanvasStatusHudLayer` is direct template
- dnd5e data paths (initiative/speed): MEDIUM — `movement.walk` confirmed in repo; `init.total` assumed from standard dnd5e knowledge
- Portrait pipeline: MEDIUM — `ditherTile` functionality confirmed but export status needs verification; `setPortraitOverride` slot infra confirmed
- INV-1 fixture delta: HIGH — fixture content read directly; rows requiring update identified

**Research date:** 2026-06-06
**Valid until:** 2026-07-06

---

## RESEARCH COMPLETE

**Phase:** 21 — Character Sheet su Canvas + Dati Main-tab
**Confidence:** HIGH (with two MEDIUM-confidence items in the dnd5e reader paths, both carrying defensive defaults)

### Key Findings

- **Dual-interface design is the core pattern**: `CanvasCharacterSheetPanel` implements both `CanvasLayer` (`attachCanvas`/`paint`/`isDirty`) and `OverlayPanel` (`onMount`/`onUnmount`/`onEvent`). `layer-types.ts` already names `CanvasCharacterSheetPanel` as an expected implementation of `CanvasLayer` (line 204: "CanvasStatusHudLayer, CanvasCharacterSheetPanel, etc.").
- **Downstream blast radius: ~27 test files / ~60–70 literals** — same mechanical pattern as Phase 16/17; these must be updated atomically in a dedicated wave.
- **`ditherTile` export status is the critical path-blocker**: if not already exported from `raster-worker.ts`, extraction to `dither-utils.ts` is needed before portrait pipeline can reuse it. Verify with `grep -n "^export function ditherTile"` before Wave 1.
- **Portrait size constraint**: must match the `setPortraitOverride` slot 3 expected size (200×100 tile frame; portrait embedded at 100×60 consistent with Phase 13 precedent) — NOT 100×100 as initially estimated.
- **INV-1 fixture delta is limited to 4 files, row 6 only** (vitals bar: INI and VEL go from `—` to real values). Row 1 (race/class line) also changes if class name is surfaced there — 4 additional fixture line updates.

### File Created

`.planning/phases/EVF-21-character-sheet-su-canvas-dati-main-tab/21-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Schema extension (class/initiative/speed) | HIGH | Phase 16/17 pattern proven; exact field shapes locked by CONTEXT.md |
| dnd5e reader paths | MEDIUM | `movement.walk` confirmed in repo; `init.total` assumed (standard dnd5e, has defensive default) |
| CanvasLayer architecture | HIGH | layer-types.ts names `CanvasCharacterSheetPanel` explicitly; template in Phase 20 CanvasStatusHudLayer |
| Portrait pipeline | MEDIUM | `setPortraitOverride` infra confirmed; `ditherTile` export status unconfirmed |
| INV-1 glyph fixture delta | HIGH | Fixture content read; row 6 vitals bar identified as the only change |
| Downstream blast radius | HIGH | grep across 27 test files; count consistent with Phase 16 (~11) + Phase 17 (~23) precedent |

### Open Questions

- `ditherTile` export status in `raster-worker.ts` (HIGH risk if wrong — determines whether `dither-utils.ts` extraction is needed)
- Exact `double-tap` close wiring in `panel-router.ts` vs `onEvent` (MEDIUM — affects whether canvas panel needs any close logic)
- Portrait PNG dimensions in the `setPortraitOverride` slot (MEDIUM — 100×60 vs 100×100 vs full 200×100)

### Ready for Planning

Research complete. Planner can create PLAN.md files for Phase 21.
