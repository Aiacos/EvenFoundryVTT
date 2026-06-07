---
phase: EVF-21-character-sheet-su-canvas-dati-main-tab
reviewed: 2026-06-07T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - packages/foundry-module/src/readers/character-reader.ts
  - packages/foundry-module/src/types/foundry-globals.d.ts
  - packages/g2-app/src/hud/boot-hud-raster-poc.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/panels/canvas-character-sheet-panel.ts
  - packages/g2-app/src/panels/character-sheet-tab-renderers.ts
  - packages/g2-app/src/raster/dither-utils.ts
  - packages/g2-app/src/raster/raster-worker.ts
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-06-07
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 21 delivers three subsystems: (1) `extractClass`/`extractInitiativeModifier`/`extractWalkSpeed` readers in `character-reader.ts`, (2) `CanvasCharacterSheetPanel` — the new canvas-mode z=2 overlay panel, and (3) six `paint*Tab` methods added to `character-sheet-tab-renderers.ts`. The support files `dither-utils.ts` (extraction of Floyd-Steinberg pipeline) and `raster-worker.ts` (worker consumer of the extracted utils) are also in scope.

Two blockers are present. The more severe is a rendering-correctness defect in `CanvasCharacterSheetPanel`: the chrome `ImageBitmap` is baked with `_activeTabIndex = 0` during `attachCanvas`, which runs *before* `onMount` restores the persisted tab. Every subsequent paint blits the stale bitmap and the tab-strip highlight never moves off the Main tab. The second blocker is an `ImageBitmap` GPU resource leak in the portrait-fetch pipeline. Three warnings follow: a fallback damage-formula bug in `character-reader.ts`, dead-code locale handling in the canvas paint methods, and a dead `encodeRle4bit` call in `raster-worker.ts`.

---

## Critical Issues

### CR-01: Chrome pre-bake bakes tab strip at index 0 — tab navigation never highlights the correct tab

**File:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts:488-499`

**Issue:** `_initAsync()` → `_prebakeChrome()` is awaited inside `attachCanvas()` (LayerManager bundle STEP 2). At that moment `_activeTabIndex` is always `0` (constructor default) because `onMount()` → `_restoreLastTab()` is called later in STEP 5. The baked `ImageBitmap` permanently encodes the tab strip with tab 0 (Main) highlighted.

In `paint()` at lines 288–291:
```typescript
if (this._chromeBitmap !== null) {
  ctx.drawImage(this._chromeBitmap, 0, 0);   // always draws tab-0 chrome
} else {
  _drawChrome(ctx, this._fontFamily, this._activeTabIndex);  // only fallback redraws correctly
}
```
When `createImageBitmap` is available (production path), the tab strip never updates after a gesture changes `_activeTabIndex`. The user sees "Main" permanently highlighted regardless of which tab is active. The content area is correct (drawn by `_paintActiveTab`) but the chrome strip is stale.

**Fix:** Do not include the tab strip in the pre-baked chrome. Split `_drawChrome` into a static part (background fill + border + horizontal separator) that is baked once, and a dynamic part (tab strip text) drawn inline on every `paint()`:

```typescript
// In paint():
if (this._chromeBitmap !== null) {
  ctx.drawImage(this._chromeBitmap, 0, 0);   // static background + border + separator
} else {
  _drawStaticChrome(ctx);
}
// Always draw the tab strip inline (changes on every gesture):
_drawTabStrip(ctx, this._fontFamily, this._activeTabIndex);
this._paintActiveTab(ctx);
this._dirty = false;
```

Alternatively, invalidate `_chromeBitmap` on every tab change and re-bake asynchronously — but that introduces async complexity on the hot gesture path. The split approach is the minimal correct fix.

---

### CR-02: `ImageBitmap` GPU resource leak when `sCtx === null` in `_fetchPortraitAsync`

**File:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts:627-630`

**Issue:** The portrait fetch pipeline creates an `ImageBitmap` at line 627, then creates a scratch `OffscreenCanvas` and checks its context at line 629–630:

```typescript
const imgBitmap = await createImageBitmap(blob, { resizeWidth: W, resizeHeight: H });
const scratch = new OffscreenCanvas(W, H);
const sCtx = scratch.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
if (sCtx === null) return;           // ← imgBitmap never .close()d here
```

When `getContext('2d')` returns `null` (degraded environment), the `return` exits without calling `imgBitmap.close()`. `ImageBitmap` objects hold GPU-backed memory and must be explicitly released. In environments where `OffscreenCanvas.getContext` fails (possible on low-memory devices or certain WebView builds), the GPU memory is never freed.

**Fix:**
```typescript
const imgBitmap = await createImageBitmap(blob, { resizeWidth: W, resizeHeight: H });
const scratch = new OffscreenCanvas(W, H);
const sCtx = scratch.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
if (sCtx === null) {
  imgBitmap.close();   // ← release GPU resource before early return
  return;
}
```

---

## Warnings

### WR-01: `String(partsFirst)` on `[string, string]` tuple produces comma-joined damage formula

**File:** `packages/foundry-module/src/readers/character-reader.ts:126-132`

**Issue:** The fallback damage-formula path for legacy dnd5e items that lack `damage.base.formula` reads `damage.parts[0]` and converts it with `String()`:

```typescript
const partsFirst = ((damage as Record<string, unknown>).parts as unknown[] | undefined)?.[0];
const damageFormula: string | undefined =
  baseFormula !== undefined
    ? baseFormula
    : partsFirst !== undefined
      ? String(partsFirst)   // ← bug: String(["1d6", "bludgeoning"]) === "1d6,bludgeoning"
      : undefined;
```

In dnd5e 5.x (and earlier), `damage.parts` is `Array<[string, string]>` — each element is a `[formula, type]` tuple. `String(["1d6", "bludgeoning"])` produces `"1d6,bludgeoning"` (comma-joined, no space), not the expected display string `"1d6 bludgeoning"`. The primary `base.formula` path is correct; this bug only fires on legacy actors where `base.formula` is absent.

**Fix:**
```typescript
const partsFirst = (
  (damage as Record<string, unknown>).parts as [string, string][] | undefined
)?.[0];
const damageFormula: string | undefined =
  baseFormula !== undefined
    ? baseFormula
    : partsFirst !== undefined
      ? `${partsFirst[0]} ${partsFirst[1]}`   // space-separated formula + type
      : undefined;
```

---

### WR-02: `_locale` is effectively dead code in canvas paint methods — all five `paint*Tab` callsites hardcode `'en'`

**File:** `packages/g2-app/src/panels/character-sheet-tab-renderers.ts:1052, 1082, 1112, 1142, 1172`  
**Also:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts:519-520`

**Issue:** The five canvas `paint*Tab` methods delegate to the corresponding string renderers with the locale argument hardcoded to `'en'`:

```typescript
// paintSkillsTab
const rows = renderSkillsTab(snapshot, 'en', 0);   // locale ignored

// paintInventoryTab, paintSpellsTab, paintFeatsTab, paintBioTab — same pattern
const rows = renderTabContent('inventory', snapshot, 'en', 0);
```

The `font` parameter is forwarded correctly, but the locale is not. All canvas-mode users see English labels regardless of `opts.locale` or the device locale override (step 9c in `_bootEngineCore`). The `CanvasCharacterSheetPanel._locale` field is stored but then discarded via `void this._locale` at line 520, which is a suppression workaround rather than a use.

INV-4 states "zero dead/unreachable code tolerated." The `void this._locale` pattern is syntactically a read but semantically dead — it exists only to silence `TS6133 / noUnusedVariables`.

**Fix:** Pass `this._locale` through `_paintActiveTab` to all `paint*Tab` callsites. Until Plan 21-04 wires full locale-aware rendering, at minimum thread the locale parameter so it is structurally ready and not dead:

```typescript
// In _paintActiveTab:
private _paintActiveTab(ctx: ...): void {
  const bounds: PaintBounds = { x: 0, y: 30, w: COMPOSITOR_W, h: COMPOSITOR_H - 30 };
  const tab = TABS[this._activeTabIndex] ?? 'main';
  const font = this._fontFamily;
  const locale = this._locale as HudLocale;  // use live locale, not hardcoded 'en'
  switch (tab) {
    case 'skills':
      paintSkillsTab(ctx, this._snapshot, bounds, font, locale);
      break;
    // ...
  }
}
```

This requires adding a `locale` parameter to each `paint*Tab` function signature and threading it to the string renderer calls.

---

### WR-03: `encodeRle4bit` is called but its result is immediately voided — dead computation in the hot pipeline path

**File:** `packages/g2-app/src/raster/raster-worker.ts:268-271`

**Issue:** Stage 8 of the raster pipeline calls `encodeRle4bit` and immediately discards the result:

```typescript
const rleStats = encodeRle4bit(indexed);
// We don't ship `rleStats` over the wire — PNG is the payload — but we
// count its length in `subTileCount` for telemetry.
void rleStats;
```

The comment claims `rleStats.length` is used for `subTileCount` telemetry, but `subTileCount` is actually computed from `changedSubTiles.filter(...)` at lines 276–278 — it has no dependency on `rleStats` whatsoever:

```typescript
const subTileCount = changedSubTiles.filter(
  (i) => ((i / SUB_TILES_PER_TILE) | 0) === tileIdx,
).length;
```

`encodeRle4bit` runs for every changed tile on every frame. If `encodeRle4bit` has non-trivial cost (it iterates the full `TILE_W * TILE_H = 20 000` indexed pixel array), this is a dead computation in the 5fps hot path. INV-4 prohibits dead code.

**Fix:** Remove the `encodeRle4bit` call and `void rleStats` until telemetry is actually wired. If RLE stats are needed in the future, surface them through `WorkerResponse` and log them on the main thread.

```typescript
// Remove entirely until telemetry is wired:
// const rleStats = encodeRle4bit(indexed);
// void rleStats;
```

---

## Info

### IN-01: `TODO(HUD-27PX)` uses a literal placeholder `(#issue)` instead of a real issue reference

**File:** `packages/g2-app/src/internal/boot-engine-core.ts:1445`

**Issue:**
```typescript
// TODO(HUD-27PX): re-call finalizeIdleRender when map mode is gesture-opened (#issue)
```

INV-4 requires every `// TODO` to carry `(#issue)` (a real GitHub issue number) or `(ADR-NNNN)`. `HUD-27PX` is an ad-hoc identifier, and `(#issue)` is a literal placeholder string — neither satisfies the requirement. The CI `commitlint` TODO-gate will catch this if it scans source comments.

**Fix:** Open a GitHub issue for this TODO and replace `(#issue)` with the actual issue number, e.g.:
```typescript
// TODO(#42): re-call finalizeIdleRender when map mode is gesture-opened (ADR-0013)
```

---

_Reviewed: 2026-06-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
