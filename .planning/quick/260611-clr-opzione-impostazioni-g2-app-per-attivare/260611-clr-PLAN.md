---
phase: quick-260611-clr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/g2-app/src/hud/hud-raster-frame.ts
  - packages/g2-app/src/hud/hud-tile.worker.ts
  - packages/g2-app/src/hud/hud-tile-worker-client.ts
  - packages/g2-app/src/engine/hud-delta-driver.ts
  - packages/g2-app/src/panels/quick-action-menu-panel.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/hud/dither-mode.ts
autonomous: true
requirements: [QUICK-260611-CLR]
must_haves:
  truths:
    - "User can toggle dither ON/OFF from the on-glasses Quick Action menu"
    - "Dither ON (default) produces Bayer-4x4 ordered-dither tiles; OFF produces direct 16-level quantization with no dither pattern"
    - "The toggle is honored by BOTH the Worker tile-build path and the synchronous fallback path, byte-identical per mode"
    - "The choice persists across app reboots via the Even Hub kv store"
  artifacts:
    - path: "packages/g2-app/src/hud/dither-mode.ts"
      provides: "Shared DitherMode kv key + load/persist helpers (mirrors locale-override.ts)"
      contains: "DITHER_MODE_KV_KEY"
    - path: "packages/g2-app/src/hud/hud-raster-frame.ts"
      provides: "buildHudTiles dither param + quantizeTile branch"
  key_links:
    - from: "packages/g2-app/src/panels/quick-action-menu-panel.ts"
      to: "boot-engine-core onDitherToggle callback"
      via: "callbacks.onDitherToggle()"
      pattern: "onDitherToggle"
    - from: "packages/g2-app/src/engine/hud-delta-driver.ts"
      to: "buildHudTiles / buildTilesAsync"
      via: "dither flag threaded through _buildTiles"
      pattern: "dither"
---

<objective>
Add an on-glasses setting to the g2-app Quick Action menu that toggles the HUD raster
dither: ON (default) = Bayer 4×4 ordered dither as today; OFF = direct nearest-of-16-levels
greyscale quantization with no dither pattern. The flag must be honored by BOTH the Worker
tile-build path and the synchronous fallback, and persist across reboots via the Even Hub
kv store.

Purpose: Lets the user pick between dithered (smoother gradients, more BLE-costly per pixel
variance) and flat-quantized (crisper, blockier) rendering directly on the glasses without
a rebuild — useful for legibility tuning on the G2 phosphor.

Output: A `[D] Dither` menu item + a `dither-mode.ts` persistence helper, with the flag
threaded through `buildHudTiles` → worker client → worker, plus the sync twin.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Persistence exemplar (mirror this pattern for the new dither-mode helper):
@packages/g2-app/src/locale/locale-override.ts

# The two dither sites that must agree (sync twin + Worker twin):
@packages/g2-app/src/hud/hud-raster-frame.ts
@packages/g2-app/src/hud/hud-tile.worker.ts
@packages/g2-app/src/hud/hud-tile-worker-client.ts

# Driver that calls both builders + the menu panel + boot wiring:
@packages/g2-app/src/engine/hud-delta-driver.ts
@packages/g2-app/src/panels/quick-action-menu-panel.ts
@packages/g2-app/src/internal/boot-engine-core.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Thread a dither flag through both tile-build paths (sync + Worker)</name>
  <files>packages/g2-app/src/hud/hud-raster-frame.ts, packages/g2-app/src/hud/hud-tile.worker.ts, packages/g2-app/src/hud/hud-tile-worker-client.ts, packages/g2-app/src/engine/hud-delta-driver.ts</files>
  <behavior>
    - With dither=true, buildHudTiles output is byte-identical to today's output (Bayer path unchanged).
    - With dither=false, each pixel is quantized to the nearest of the 16 grey levels with NO Bayer threshold added: level = clamp(round((luma/255)*15)). A flat grey input region produces a single uniform grey value (no checkerboard pattern).
    - The Worker `buildTiles(rgba, dither)` and the sync `buildHudTiles(rgba, dither)` produce identical bytes for the same (rgba, dither) pair.
    - Both builders default dither=true when the flag is omitted (backward-compatible — existing tests/callers that pass only rgba still get the Bayer path).
  </behavior>
  <action>
    In `hud-raster-frame.ts`: refactor the private `ditherTile(rgba)` to accept a `dither: boolean` second arg. Keep the existing Bayer branch verbatim when dither=true; when dither=false skip the `+ (BAYER_4X4[...] ?? 0)` term so the level is `Math.round((luma/255)*15)` clamped to 0..15 (no ordered-dither pattern). Add a `dither = true` second parameter to the exported `buildHudTiles(rgba, dither = true)` and pass it into `ditherTile`. Update the TSDoc to document the new param and the two modes; do NOT rename `ditherTile` (the name still describes the quantize-with-optional-dither step). Replicate the EXACT same change in `hud-tile.worker.ts`'s twin `ditherTile` and have `self.onmessage` read `dither` from `ev.data` (`{ seq, rgba, dither }`), defaulting to `true` when absent. In `hud-tile-worker-client.ts`: add `dither: boolean` to the `HudTileWorkerClient.buildTiles` signature, post it in the worker message, and keep the response mapping unchanged; update the interface TSDoc. In `hud-delta-driver.ts`: add an optional `readonly getDitherMode?: () => boolean` to `HudDeltaDriverOpts` (read at cycle time so a live toggle takes effect with no reconstruction), widen `buildTilesAsync` to `(rgba, dither) => Promise<HudTile[]>`, and in `_buildTiles(rgba)` resolve `const dither = this._opts.getDitherMode?.() ?? true;` then pass it to both `async(copy, dither)` and the `buildHudTiles(rgba, dither)` fallback. Keep the dither==true output byte-identical to today (regression guard for the existing delta-driver and hud-raster-frame tests).
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app test -- --run hud-raster-frame && corepack pnpm --filter @evf/g2-app exec tsc --noEmit</automated>
  </verify>
  <done>buildHudTiles(rgba) and buildHudTiles(rgba, true) are byte-identical to the pre-change output; buildHudTiles(rgba, false) emits no Bayer pattern on a flat region; worker and sync paths agree for both modes; tsc clean; existing hud-raster-frame + hud-delta-driver tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Dither-mode persistence helper + on-glasses toggle wiring</name>
  <files>packages/g2-app/src/hud/dither-mode.ts, packages/g2-app/src/panels/quick-action-menu-panel.ts, packages/g2-app/src/internal/boot-engine-core.ts</files>
  <behavior>
    - loadDitherMode(bridge) returns true (dither ON) by default — on missing key (''), unknown value, or kv read error (fail-soft, mirrors locale-override). '0' → false, anything else → true.
    - persistDitherMode(bridge, on) writes '1'/'0' under the kv key, swallowing errors (best-effort).
    - Selecting the new [D] menu item flips the in-session dither flag, persists it, and the NEXT render cycle uses the new mode (driver reads via getDitherMode at cycle time).
    - The menu still renders/aligns correctly with the added item (INV-1: glyph box rows stay width-consistent; canvas rows fit).
  </behavior>
  <action>
    Create `packages/g2-app/src/hud/dither-mode.ts` mirroring `locale/locale-override.ts`: export `const DITHER_MODE_KV_KEY = 'view.hud.dither'`, `async loadDitherMode(bridge): Promise<boolean>` (read `getLocalStorage`, `return stored !== '0'` so default/missing/'' → true; catch → true with a `console.warn`), and `async persistDitherMode(bridge, on: boolean): Promise<void>` (`setLocalStorage(key, on ? '1' : '0')`, swallow errors). Full TSDoc per INV-4. In `quick-action-menu-panel.ts`: add an item to `MAIN_ITEMS` with `key: 'D'`, `i18nKey: 'quick_item_dither'`, `action: 'dither-toggle'`, modeled on the existing `[F] fps-toggle` entry (insert it adjacent to the `[F]` entry, BEFORE `[X] Close` which must stay last); add `onDitherToggle?: () => void` to `QuickActionMenuCallbacks` (optional, mirroring `onFpsToggle?`); add a `case 'dither-toggle':` to `_activateCurrentItem`'s switch calling `this.callbacks.onDitherToggle?.()` then `this.callbacks.onClose()` (same shape as `fps-toggle`). Add the `quick_item_dither` i18n key to the same i18n source the other `quick_item_*` keys live in (find via `getLabel('quick_item_fps', ...)` definition site) with IT + EN + DE strings (IT primary, e.g. IT "Dither", EN "Dither", DE "Dither" — short, well under LABEL_BUDGET 22). If a sub-menu language-picker `_activateCurrentItem` index assumption (`activeIndex = 7` for the `[N]` row) is now off because the item count shifted, leave the [N] index logic correct by re-checking the `MAIN_ITEMS` index of the `open-sub-menu` entry and updating the two `this.activeIndex = 7` literals to the new `[N]` index (search both occurrences). In `boot-engine-core.ts`: import `loadDitherMode`/`persistDitherMode`/`DITHER_MODE_KV_KEY` from `../hud/dither-mode.js`; add a `let ditherOn = true;` boot read-back block mirroring the `fpsIndicatorOn` block (~line 862) using `loadDitherMode(bridge)`; pass `getDitherMode: () => ditherOn` into the `new HudDeltaDriver({...})` options (~line 637); and add an `onDitherToggle` callback to the `makeMenu()` callbacks object (mirroring `onFpsToggle` ~line 1035) that flips `ditherOn`, calls `void persistDitherMode(bridge, ditherOn)`, then `hudDeltaDriver.requestCycle()` so the change is visible immediately. Do NOT use localStorage — Even Hub kv only (CLAUDE.md hard rule).
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app test -- --run "dither-mode|quick-action-menu" && corepack pnpm --filter @evf/g2-app exec tsc --noEmit && corepack pnpm --filter @evf/g2-app exec biome check src/hud/dither-mode.ts src/panels/quick-action-menu-panel.ts src/internal/boot-engine-core.ts</automated>
  </verify>
  <done>loadDitherMode defaults true and is fail-soft; persistDitherMode writes '1'/'0'; the [D] menu item dispatches onDitherToggle; boot read-back + driver getDitherMode wired; the [N] language sub-menu still focuses the correct row after the item-count shift; tsc + biome + targeted tests green.</done>
</task>

<task type="auto">
  <name>Task 3: Full g2-app gate — workspace test + typecheck + lint</name>
  <files>packages/g2-app</files>
  <action>
    Run the full g2-app suite to catch any cross-file fallout (the delta-driver, push-hud-tiles, quick-action-menu, and boot-engine snapshot tests all touch the changed surfaces). Fix any regressions: the most likely is a test that constructs `buildHudTiles`/`buildTiles` positionally or asserts a fixed `MAIN_ITEMS.length` / menu-row count — update those to the new count and the new (rgba, dither) signature, preserving byte-identical dither=true expectations. Do NOT weaken any INV-1 alignment assertion; if a menu fixture needs a new `[D]` row, add it width-consistent with the existing rows. Add a `.changeset` patch entry for `@evf/g2-app` describing the new on-glasses dither toggle.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app test -- --run && corepack pnpm --filter @evf/g2-app exec tsc --noEmit && corepack pnpm --filter @evf/g2-app exec biome ci src</automated>
  </verify>
  <done>Full @evf/g2-app vitest suite green, tsc --noEmit exits 0, biome ci src exits 0, changeset added.</done>
</task>

</tasks>

<verification>
- `corepack pnpm --filter @evf/g2-app test -- --run` green (all g2-app tests).
- `corepack pnpm --filter @evf/g2-app exec tsc --noEmit` exits 0.
- `corepack pnpm --filter @evf/g2-app exec biome ci src` exits 0.
- Manual reasoning check: dither=true output is byte-identical to pre-change (Bayer untouched); dither=false has no ordered-dither pattern; Worker twin and sync twin agree.
</verification>

<success_criteria>
- A `[D] Dither` item appears in the on-glasses Quick Action menu and toggles the HUD raster dither ON/OFF.
- Dither ON (default) = Bayer 4×4 as today; OFF = direct nearest-of-16-level quantization, no dither pattern.
- The flag is honored by BOTH the Worker tile-build path and the synchronous fallback (byte-identical per mode).
- The choice persists across reboots via the Even Hub kv store (key `view.hud.dither`), fail-soft to ON.
- INV-4 satisfied: TSDoc on new public APIs, zero dead code, tsc strict + Biome + Vitest all green.
</success_criteria>

<output>
Create `.planning/quick/260611-clr-opzione-impostazioni-g2-app-per-attivare/260611-clr-SUMMARY.md` when done.
</output>
