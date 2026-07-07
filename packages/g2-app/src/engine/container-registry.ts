/**
 * Shared container registry — the SINGLE source of truth mapping every base
 * container name to its numeric `containerID`, pixel geometry, and
 * `isEventCapture` flag.
 *
 * # Why this module exists
 *
 * The EvenHub host (`@evenrealities/even_hub_sdk`) addresses containers by a
 * numeric `containerID` (PB `Container_ID`). When a `textContainerUpgrade` /
 * `updateImageRawData` payload carries ONLY `containerName`, the host rejects it
 * with `container_id is required` and nothing draws → blank glasses. The probe
 * documented in `.planning/debug/glasses-render-blank-containerid.md` empirically
 * confirmed (2026-06-04):
 *
 *   - The host uses a SINGLE GLOBAL id namespace in declaration order: image
 *     containers FIRST (ids 0-3), then text containers (ids 4-10).
 *   - containerID 4 (first text = header) is ACCEPTED; containerID 0 → "container
 *     0 is not a text container" (it is image map-tile-0). The host respects the
 *     engine-assigned `containerID`.
 *   - SECOND GAP: text containers also need geometry (`xPosition/yPosition/
 *     width/height`); without it the host renders them at size 0 → still blank.
 *
 * ## HUD-27PX redesign (quick-260605-j0t)
 *
 * The `status-hud` (id 6) geometry has been updated from the old 168×252 narrow
 * column (col 68-95 at 6px/col, rows 1-21 at 12px/row) to the new FULL-WIDTH
 * 576×234 layout (y=27, 9 rows × 27px — the real G2 LVGL font grid).
 * The `header` and `footer` heights are updated to 27px (was 12/24).
 * `map-capture` and `z05-*` are preserved at their new 27px-grid positions for
 * the deferred map-mode gesture toggle (Specs §7.4, Phase 20).
 *
 * This module is the ONE place ids + geometry are declared. `page-lifecycle`
 * builds both the boot and main page schemas from it; `LayerManager._flushPage`
 * rebuilds the same canonical schema from it; and every render call site resolves
 * its numeric id via {@link resolveContainerId}. No other file hardcodes a
 * container id or text-container geometry — that keeps the page schema and the
 * upgrade sites in lockstep (no drift between the two).
 *
 * # Geometry derivation — HUD-27PX redesign (quick-260605-j0t)
 *
 * Image-tile geometry is preserved verbatim (200×100, tiled 2×2, ids 0-3).
 * Text-container pixel geometry is derived from the REAL G2 LVGL font grid:
 *   - Fixed 27px line height (no font control per SDK)
 *   - Screen: 576×288 px → ~10 rows max
 *
 * New text-container geometry (27px grid):
 *   - header     (id 4): y=0,   height=27  (1 row: boot splash)
 *   - footer     (id 5): y=261, height=27  (1 row: R1 hint / mode footer)
 *   - status-hud (id 6): x=0,   y=27, width=576, height=234 (9 rows × 27px)
 *                         FULL-WIDTH (was narrow 168px col) — replaces map as default base
 *   - map-capture (id 7): x=0, y=27, width=576, height=234 (isEventCapture=1)
 *                         Geometry matches status-hud; not the visible base in default view
 *                         (deferred map mode — RESERVED for gesture-opened map toggle)
 *   - z05-* (ids 8-10):  y=189/216/243, height=27 (rows at bottom of content area)
 *                         NOT painted in default status-sheet view (idle-infill skipped)
 *
 * DEFERRED: map-capture and z05-* are kept in the registry so overlay/map-mode code
 * paths continue to reference them by name. The deferred map-mode gesture toggle
 * (Phase 20 / Specs §7.4 "Map mode (gesture-opened, future)") will re-activate them.
 *
 * If a coordinate proves ambiguous on real hardware, the priority is VISIBLE
 * rendering (full-width strips); pixel-perfect alignment can follow.
 *
 * # Scope
 *
 * Only the 11 BASE containers live here. Overlay-only container names used by
 * z=2 panels (`overlay-block`, `overlay-capture`, `overlay-tile`, `toast-block`,
 * `boot-error-block`) are OUT OF SCOPE for this registry — {@link resolveContainerId}
 * returns `undefined` for them, and those call sites continue to be addressed by
 * name until the overlay-id rebuild path is given ids in a future cycle.
 *
 * @see .planning/debug/glasses-render-blank-containerid.md (root cause + probe)
 * @see .planning/milestones/v0.9.11-phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Container Budget Allocation
 * @see packages/g2-app/src/engine/page-lifecycle.ts (buildBootPageSchema consumer)
 * @see packages/g2-app/src/engine/layer-manager.ts (_flushPage consumer)
 */

import { ImageContainerProperty, TextContainerProperty } from '@evenrealities/even_hub_sdk';

/**
 * One row of the canonical registry — a base container's numeric id, pixel
 * geometry, and capture flag.
 */
export interface ContainerRegistryEntry {
  /** Numeric host id (global declaration-order namespace: images 0-3, text 4-10). */
  readonly id: number;
  /** Top-left x in pixels (0-575). */
  readonly xPosition: number;
  /** Top-left y in pixels (0-287). */
  readonly yPosition: number;
  /** Width in pixels (>0 for renderable containers). */
  readonly width: number;
  /** Height in pixels (>0 for renderable containers). */
  readonly height: number;
  /** Exactly one BASE text container sets 1 (map-capture); all others 0. */
  readonly isEventCapture: 0 | 1;
  /** `'image'` (ids 0-3) or `'text'` (ids 4-10) — selects the SDK property class. */
  readonly kind: 'image' | 'text';
}

/**
 * The single source of truth: container name → {@link ContainerRegistryEntry}.
 *
 * Frozen to prevent accidental mutation. Image containers come FIRST in the
 * global id namespace (0-3), then text containers (4-10), exactly matching the
 * host's declaration-order id assignment proven by the debug probe.
 *
 * ## HUD raster page containers (ADR-0013 Amendment 1)
 *
 * `hud-tile-0..3` and `hud-capture` are entries for the SEPARATE HUD raster page
 * declared via `rebuildPageContainer` in canvas mode (NOT the default base page).
 * Within that separate page, IDs are assigned in declaration order starting at 0:
 * image tiles 0-3, then the text capture container at id 4.
 *
 * `hud-capture` uses `isEventCapture:1` at full-screen dimensions (576×288) as the
 * gesture-capture container behind the 4 image tiles. This is the locked ADR-0013
 * Amendment 1 capture-invariant pattern (locked decision #2): **the G2 host renders
 * IMAGE containers visually ON TOP of TEXT containers** — a type-based z-order, NOT
 * declaration order (`imageObject` and `textObject` are SEPARATE payload arrays in
 * `createStartUpPageContainer`/`rebuildPageContainer`, so there is no single
 * cross-type declaration order). So a full-screen text container sitting under the
 * image tiles is invisible — exactly what `hud-capture` wants (gesture capture only,
 * never shows text). Empirically verified 2026-06-14 with the overlap probe: an
 * image and a text occupying the same rect → only the image is visible; a text NOT
 * under any image renders normally. (The generic Even design guideline says
 * "declaration order determines overlap" — that does not hold for image-vs-text on
 * this firmware; the image always wins.)
 *
 * The on-screen placement of the 400×200 raster region inside the 576×288 physical
 * screen is parameterized — default deferred to Phase 20.
 *
 * @see .planning/debug/glasses-render-blank-containerid.md §PROBE RESULTS
 */
export const CONTAINER_REGISTRY: Readonly<Record<string, ContainerRegistryEntry>> = Object.freeze({
  // ── Image containers (ids 0-3) — geometry preserved verbatim (200×100, 2×2) ──
  'map-tile-0': {
    id: 0,
    xPosition: 0,
    yPosition: 0,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  'map-tile-1': {
    id: 1,
    xPosition: 200,
    yPosition: 0,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  'map-tile-2': {
    id: 2,
    xPosition: 0,
    yPosition: 100,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  'map-tile-3': {
    id: 3,
    xPosition: 200,
    yPosition: 100,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },

  // ── HUD raster page containers (ADR-0013 Amendment 1 — SEPARATE page namespace) ──
  //
  // These 5 containers form the HUD raster page schema (canvas mode, _flushPage).
  // IDs 0-4 are assigned in declaration order WITHIN the HUD raster page (rebuildPageContainer).
  // They are DISTINCT from the map-tile-0..3 ids above — those are in the DEFAULT base page;
  // these are in the canvas-mode HUD raster page (different rebuildPageContainer call).
  //
  // hud-tile-0..3: 4 image tiles at 288×144 (SDK max 20-288×20-144, INV-2 re-verified 2026-06-10), tiled 2×2 = FULL SCREEN 576×288 (layout B).
  // hud-capture:   1 full-screen text container (576×288) with isEventCapture:1. The G2 host renders
  //                IMAGE containers on top of TEXT containers (type-based z-order, NOT declaration
  //                order — image/text are separate payload arrays; probe-verified 2026-06-14), so the
  //                image tiles cover this text container: it is invisible and routes R1 gestures only (INV-5).
  //
  // @see docs/architecture/0013-hud-raster-rendering.md (Amendment 1 — locked decisions #2, #3)
  // @see packages/g2-app/src/engine/layer-manager.ts (_flushPage canvas mode consumer)
  'hud-tile-0': {
    id: 0,
    xPosition: 0,
    yPosition: 0,
    width: 288,
    height: 144,
    isEventCapture: 0,
    kind: 'image',
  },
  'hud-tile-1': {
    id: 1,
    xPosition: 288,
    yPosition: 0,
    width: 288,
    height: 144,
    isEventCapture: 0,
    kind: 'image',
  },
  'hud-tile-2': {
    id: 2,
    xPosition: 0,
    yPosition: 144,
    width: 288,
    height: 144,
    isEventCapture: 0,
    kind: 'image',
  },
  'hud-tile-3': {
    id: 3,
    xPosition: 288,
    yPosition: 144,
    width: 288,
    height: 144,
    isEventCapture: 0,
    kind: 'image',
  },
  // hud-capture: full-screen text capture container (576×288), isEventCapture:1.
  // Sole text container of the HUD raster page (layout B): full-screen gesture capture.
  // MUST NOT appear in the default glyph schema — only in buildHudRasterPageSchema().
  'hud-capture': {
    id: 4,
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    isEventCapture: 1,
    kind: 'text',
  },

  // ── Text containers (ids 4-10) — geometry from REAL G2 LVGL font grid (27px/row) ──
  //
  // HUD-27PX redesign (quick-260605-j0t):
  //   - All text geometry now uses 27px row height (LVGL fixed line height)
  //   - status-hud is now FULL-WIDTH (576px) — the default always-on base
  //   - map-capture preserved but not painted as the default base (deferred map mode)
  //   - z05-* preserved but not painted in default view (idle-infill skipped)

  // header: y=0, height=27 (1 row, 27px grid).
  header: {
    id: 4,
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 27,
    isEventCapture: 0,
    kind: 'text',
  },
  // footer: y=261 (288-27), height=27 (1 row, bottom of screen, 27px grid).
  footer: {
    id: 5,
    xPosition: 0,
    yPosition: 261,
    width: 576,
    height: 27,
    isEventCapture: 0,
    kind: 'text',
  },
  // status-hud: FULL-WIDTH (x=0, width=576), y=27 (below header), height=234 (9 rows × 27px).
  // HUD-27PX: was narrow 168px col (col 68-95) — now full-width character status sheet.
  // This is the VISIBLE default base layer.
  'status-hud': {
    id: 6,
    xPosition: 0,
    yPosition: 27,
    width: 576,
    height: 234,
    isEventCapture: 0,
    kind: 'text',
  },
  // map-capture: full-width, same geometry as status-hud (isEventCapture=1).
  // PRESERVED for deferred gesture-opened map mode (Specs §7.4, Phase 20).
  // NOT the visible base in the default status-sheet view.
  // Deferred (HUD-27PX): re-activate as visible base when map mode toggle is implemented
  'map-capture': {
    id: 7,
    xPosition: 0,
    yPosition: 27,
    width: 576,
    height: 234,
    isEventCapture: 1,
    kind: 'text',
  },
  // z05-combat-log: y=189 (7 rows × 27px from top of content area), height=27.
  // PRESERVED for deferred idle-infill (not painted in default status-sheet view).
  // Deferred (HUD-27PX): re-evaluate z05 positions once map-mode is gesture-opened
  'z05-combat-log': {
    id: 8,
    xPosition: 0,
    yPosition: 189,
    width: 576,
    height: 27,
    isEventCapture: 0,
    kind: 'text',
  },
  // z05-label: y=216 (8 rows × 27px from top of content area), height=27.
  'z05-label': {
    id: 9,
    xPosition: 0,
    yPosition: 216,
    width: 576,
    height: 27,
    isEventCapture: 0,
    kind: 'text',
  },
  // z05-stats: y=243 (9 rows × 27px from top of content area), height=27.
  'z05-stats': {
    id: 10,
    xPosition: 0,
    yPosition: 243,
    width: 576,
    height: 27,
    isEventCapture: 0,
    kind: 'text',
  },

  // ── Hybrid page containers (Feature 002 — native chrome + raster map region) ──
  //
  // The hybrid page (renderMode='hybrid', the default from Feature 002) declares a
  // SEPARATE rebuildPageContainer schema combining a raster MAP REGION (4 image
  // tiles, max 400×200) with NATIVE text chrome (header/footer/status-hud) so the
  // status HUD + overlays update via cheap textContainerUpgrade while only the map
  // is rasterised. IDs are assigned in declaration order WITHIN this page: image
  // tiles 0-3, then text containers 4-7.
  //
  // CRITICAL z-order constraint (probe-verified 2026-06-14, see the hud-capture note
  // above): the G2 host paints IMAGE containers ON TOP of TEXT containers. So every
  // visible text container MUST occupy a rect that does NOT overlap any image tile.
  // Layout: header (full width, y<27, above the map); 4 map tiles fill the LEFT
  // 400×200 region (x∈{0,200}, y∈{27,127}); hybrid-status-hud is the RIGHT column
  // (x=400, never under a tile); footer (full width, y≥261, below the map);
  // hybrid-map-capture is the invisible full-map-region gesture-capture text
  // container (x<400, under the tiles — never shows text, routes R1 only, INV-5).
  //
  // Geometry is provisional and MUST be iterated in the simulator before lock
  // (the 176px right column ≈ 15 chars at the ~27px LVGL grid — compact by design).
  //
  // @see specs/002-hybrid-native-raster-render/spec.md (container schema table)
  'hybrid-map-tile-0': {
    id: 0,
    xPosition: 0,
    yPosition: 27,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  'hybrid-map-tile-1': {
    id: 1,
    xPosition: 200,
    yPosition: 27,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  'hybrid-map-tile-2': {
    id: 2,
    xPosition: 0,
    yPosition: 127,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  'hybrid-map-tile-3': {
    id: 3,
    xPosition: 200,
    yPosition: 127,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  // hybrid-status-hud: RIGHT column (x=400, width=176), full content height
  // (y=27..261, h=234). Never under a map tile (tiles end at x=400) → always visible.
  'hybrid-status-hud': {
    id: 6,
    xPosition: 400,
    yPosition: 27,
    width: 176,
    height: 234,
    isEventCapture: 0,
    kind: 'text',
  },
  // hybrid-map-capture: invisible gesture-capture text container covering the LEFT
  // map region (x=0..400, y=27..261). The image tiles paint over it (type-based
  // z-order), so it never shows text — it only routes R1 gestures (pan/ping).
  'hybrid-map-capture': {
    id: 7,
    xPosition: 0,
    yPosition: 27,
    width: 400,
    height: 234,
    isEventCapture: 1,
    kind: 'text',
  },

  // ── Showcase page containers (PRODUCTION raster HUD — the whole HUD is raster) ──
  //
  // The showcase page (renderMode='showcase', the DEFAULT boot substrate) rasterises
  // the ENTIRE glanceable HUD — double-ruled D&D frame + header + framed map region +
  // status card + footer (see `hud/showcase-hud-renderer.ts`) — onto a 400×200 canvas,
  // dithers it to 4-bit, and pushes it as 4 × 200×100 image tiles anchored TOP-LEFT
  // on the 576×288 screen. This is the hardware raster cap (4 image containers ×
  // 200×100; 576×288 cannot be fully rastered — INV-2, Specs §7.4).
  //
  // Origin offsets (0,0): tiles id0 (0,0) id1 (200,0) id2 (0,100) id3 (200,100) —
  // the proven map-tile-0..3 geometry that rendered live on real G2 in June.
  // NOTE: centred offsets (88,44) were REJECTED by the real host (see the tile
  // block below). A single full-region text container (showcase-capture, id 4,
  // isEventCapture:1) covers the 400×200 region so R1 gestures on the HUD are
  // captured; the image tiles paint over it (type-based host z-order).
  //
  // ids 0-4 are page-local: only one page schema is declared at a time, so reusing
  // ids 0-3 for the tiles (as the hybrid/canvas pages also do) is safe.
  //
  // @see packages/g2-app/src/hud/showcase-hud-renderer.ts (draws the 400×200 canvas)
  // @see packages/g2-app/src/hud/showcase-hud-layer.ts (owns the throttled push loop)
  // @see packages/g2-app/src/demo/showcase-preview.ts (dev visual test — same geometry)
  // ORIGIN-ANCHORED 2×2 grid (0,0)(200,0)(0,100)(200,100). The centred offsets
  // (88,44) were REJECTED by the real G2 host — `rebuildPageContainer` returned
  // false → 0 containers → every updateImageRawData `sendFailed` (white glasses;
  // live remote-debug 2026-07-07). The sim accepts any offset, so it never
  // caught it. This origin geometry matches the proven `map-tile-0..3` layout
  // that rendered live on real G2 in June. The showcase HUD is drawn full-bleed
  // into 400×200 already, so it just anchors top-left instead of centred.
  'showcase-tile-0': {
    id: 0,
    xPosition: 0,
    yPosition: 0,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  'showcase-tile-1': {
    id: 1,
    xPosition: 200,
    yPosition: 0,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  'showcase-tile-2': {
    id: 2,
    xPosition: 0,
    yPosition: 100,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  'showcase-tile-3': {
    id: 3,
    xPosition: 200,
    yPosition: 100,
    width: 200,
    height: 100,
    isEventCapture: 0,
    kind: 'image',
  },
  // showcase-capture: invisible gesture-capture text container covering the full
  // 400×200 region. The image tiles paint over it (type-based z-order), so it
  // never shows text — it only routes R1 gestures. Sole isEventCapture=1 on the page.
  'showcase-capture': {
    id: 4,
    xPosition: 0,
    yPosition: 0,
    width: 400,
    height: 200,
    isEventCapture: 1,
    kind: 'text',
  },
});

/**
 * The canonical set of 11 BASE container names (default / glyph-mode page).
 *
 * Used internally by `buildBaseImageContainers()` and `buildBaseTextContainers()`
 * to filter the shared `CONTAINER_REGISTRY` and exclude HUD raster page entries
 * (`hud-tile-0..3`, `hud-capture`) which also live in the registry for geometry
 * lookup purposes but belong to the separate canvas-mode HUD raster page.
 *
 * @internal
 */
const BASE_NAMES: ReadonlySet<string> = new Set([
  'map-tile-0',
  'map-tile-1',
  'map-tile-2',
  'map-tile-3',
  'header',
  'footer',
  'status-hud',
  'map-capture',
  'z05-combat-log',
  'z05-label',
  'z05-stats',
]);

/**
 * Total base-page container count (= 4 image + 7 text = 11), within the SDK's
 * 1-12 limit. This counts the 11 BASE containers only (excludes HUD raster
 * entries that also live in the registry). Used only for informational purposes
 * and by the map-mode page schema when it declares all containers.
 *
 * @see BOOT_CONTAINER_TOTAL for the default status-view boot schema count.
 */
export const BASE_CONTAINER_TOTAL = BASE_NAMES.size;

/**
 * The DEFAULT STATUS-VIEW boot page declares only 3 text containers:
 *   - header     (id 4): y=0,   height=27
 *   - footer     (id 5): y=261, height=27
 *   - status-hud (id 6): y=27,  height=234
 *
 * These three exactly fill 576×288 with no gaps and no overlaps (27+234+27=288).
 * map-capture (id 7), z05-* (ids 8-10), and the 4 image map-tiles are EXCLUDED
 * from the default boot schema — they are deferred to the gesture-opened map
 * mode (Phase 20 / Specs §7.4). The G2 host rejected the full 11-container
 * schema because map-capture and status-hud are identical full rects, and
 * including isEventCapture=1 on one of them caused a host-side conflict.
 *
 * Use this constant for `containerTotalNum` in the default-view boot schema.
 */
export const BOOT_CONTAINER_TOTAL = 3;

// ── HUD raster page schema (ADR-0013 Amendment 1 — canvas mode) ──────────────

/**
 * Total container count for the HUD raster page schema: 4 image tiles + 2 text
 * container (hud-capture) = 5. Fixed at page creation (canvas mode fixed-budget).
 * Back to 5 in layout B (2026-06-10): tiles are FULL SCREEN 576×288, so the
 * native hud-status container was removed (the host paints image containers
 * over text — any text under the tiles is invisible; status/fps live in the
 * raster corner card drawn by CanvasStatusHudLayer instead).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (Amendment 1 — locked decision #4)
 * @see buildHudRasterPageSchema (schema builder that uses this constant)
 */
export const HUD_RASTER_CONTAINER_TOTAL = 5;

/**
 * Build the production HUD raster page schema: 4 image tiles (hud-tile-0..3)
 * at 288×144 each (2×2 = full screen) + 1 text capture container (hud-capture).
 *
 * # Schema shape
 *
 * ```
 * containerTotalNum: 5   (HUD_RASTER_CONTAINER_TOTAL)
 * imageObject: [hud-tile-0, hud-tile-1, hud-tile-2, hud-tile-3]  — 288×144 each
 * textObject:  [hud-capture]  — 576×288, isEventCapture:1, content ' ' (gesture capture)
 * ```
 *
 * This schema is selected by `LayerManager._flushPage()` when `renderMode === 'canvas'`.
 * The 6-container budget is FIXED — panel changes (Phase 21+) are accomplished via
 * `updateImageRawData` on existing tiles, NOT `rebuildPageContainer` (schema is fixed
 * per ADR-0013 Amendment 1, locked decision #4 — rebuild would flicker).
 *
 */
export function buildHudRasterPageSchema(): {
  containerTotalNum: number;
  imageObject: ImageContainerProperty[];
  textObject: TextContainerProperty[];
} {
  const hudTileNames = ['hud-tile-0', 'hud-tile-1', 'hud-tile-2', 'hud-tile-3'];

  const imageObject = hudTileNames.map((name) => {
    const e = CONTAINER_REGISTRY[name];
    if (e === undefined) {
      throw new Error(`[EVF] buildHudRasterPageSchema: missing registry entry for '${name}'`);
    }
    return new ImageContainerProperty({
      containerID: e.id,
      containerName: name,
      xPosition: e.xPosition,
      yPosition: e.yPosition,
      width: e.width,
      height: e.height,
    });
  });

  const captureEntry = CONTAINER_REGISTRY['hud-capture'];
  if (captureEntry === undefined) {
    throw new Error("[EVF] buildHudRasterPageSchema: missing registry entry for 'hud-capture'");
  }

  const textObject = [
    // hud-capture: full-screen gesture-capture text container. The G2 host renders image
    // containers on top of text containers (type-based, probe-verified 2026-06-14 — NOT
    // declaration order), so the image tiles cover this; it stays invisible by design
    // and only routes R1 gestures (ADR-0013 Amendment 1 #2).
    new TextContainerProperty({
      containerID: captureEntry.id,
      containerName: 'hud-capture',
      xPosition: captureEntry.xPosition,
      yPosition: captureEntry.yPosition,
      width: captureEntry.width,
      height: captureEntry.height,
      isEventCapture: 1,
      // content: ' ' required — spec: event-capture container cannot have empty content (protobuf omits absent optional field)
      content: ' ',
    }),
  ];

  return { containerTotalNum: HUD_RASTER_CONTAINER_TOTAL, imageObject, textObject };
}

// ── Hybrid page schema (Feature 002 — native chrome + raster map region) ──────

/**
 * Total container count for the hybrid page schema: 4 map image tiles +
 * 4 text containers (header, footer, hybrid-status-hud, hybrid-map-capture) = 8.
 * Within the SDK budget (≤4 image, ≤8 text). Fixed at page creation — panel
 * changes update existing containers via `updateImageRawData` / `textContainerUpgrade`,
 * never `rebuildPageContainer` (avoids flicker, same discipline as the raster page).
 *
 * @see buildHybridPageSchema
 */
export const HYBRID_CONTAINER_TOTAL = 8;

/**
 * Build the hybrid page schema (Feature 002): a raster MAP REGION (4 image tiles,
 * left 400×200) composited beside NATIVE text chrome (header, footer, status-hud).
 *
 * # Schema shape
 *
 * ```
 * containerTotalNum: 8   (HYBRID_CONTAINER_TOTAL)
 * imageObject: [hybrid-map-tile-0..3]            — 200×100 each, 2×2 = 400×200 (left)
 * textObject:  [header(4), footer(5),            — full-width chrome, above/below the map
 *               hybrid-status-hud(6),            — right column (x=400), native status card
 *               hybrid-map-capture(7)]           — invisible gesture capture under the tiles
 * ```
 *
 * The status HUD + overlay panels render through the native text path
 * (`textContainerUpgrade`) so they update without rasterising the whole screen;
 * only the map tiles are rasterised, and only when the map content changes.
 *
 * INVARIANTS (asserted by tests):
 *  - Exactly one `isEventCapture=1` container (hybrid-map-capture), with content `' '`.
 *  - No image tile rect overlaps any visible text container rect (header y<27,
 *    footer y≥261, status-hud x≥400; tiles are x<400, 27≤y<227) — required because
 *    the host paints images over text.
 *  - 4 image + 4 text within the ≤4 image / ≤8 text budget.
 *
 * @see specs/002-hybrid-native-raster-render/spec.md
 */
export function buildHybridPageSchema(): {
  containerTotalNum: number;
  imageObject: ImageContainerProperty[];
  textObject: TextContainerProperty[];
} {
  const tileNames = [
    'hybrid-map-tile-0',
    'hybrid-map-tile-1',
    'hybrid-map-tile-2',
    'hybrid-map-tile-3',
  ];

  const imageObject = tileNames.map((name) => {
    const e = CONTAINER_REGISTRY[name];
    if (e === undefined) {
      throw new Error(`[EVF] buildHybridPageSchema: missing registry entry for '${name}'`);
    }
    return new ImageContainerProperty({
      containerID: e.id,
      containerName: name,
      xPosition: e.xPosition,
      yPosition: e.yPosition,
      width: e.width,
      height: e.height,
    });
  });

  // Text containers in id order: header(4), footer(5), status-hud(6), map-capture(7).
  const textNames = ['header', 'footer', 'hybrid-status-hud', 'hybrid-map-capture'];
  const textObject = textNames
    .map((name) => {
      const e = CONTAINER_REGISTRY[name];
      if (e === undefined) {
        throw new Error(`[EVF] buildHybridPageSchema: missing registry entry for '${name}'`);
      }
      return { name, e };
    })
    .sort((a, b) => a.e.id - b.e.id)
    .map(({ name, e }) => {
      // hybrid-map-capture is the SOLE capture target (G2: exactly one per page).
      // It needs content: ' ' — an event-capture container cannot have empty content
      // (protobuf omits an absent optional field).
      if (name === 'hybrid-map-capture') {
        return new TextContainerProperty({
          containerID: e.id,
          containerName: name,
          xPosition: e.xPosition,
          yPosition: e.yPosition,
          width: e.width,
          height: e.height,
          isEventCapture: 1,
          content: ' ',
        });
      }
      return new TextContainerProperty({
        containerID: e.id,
        containerName: name,
        xPosition: e.xPosition,
        yPosition: e.yPosition,
        width: e.width,
        height: e.height,
        isEventCapture: e.isEventCapture,
      });
    });

  return { containerTotalNum: HYBRID_CONTAINER_TOTAL, imageObject, textObject };
}

// ── Showcase page schema (PRODUCTION raster HUD — whole HUD is one raster image) ──

/**
 * Total container count for the showcase page schema: 4 map image tiles +
 * 1 text capture container = 5. Within the SDK budget (≤4 image, ≤8 text). Fixed at
 * page creation — the ShowcaseHudLayer updates the 4 tiles via `updateImageRawData`,
 * never `rebuildPageContainer` (avoids flicker, same discipline as the raster/hybrid
 * pages).
 *
 * @see buildShowcasePageSchema
 */
export const SHOWCASE_CONTAINER_TOTAL = 5;

/**
 * Build the showcase page schema (PRODUCTION default): the ENTIRE glanceable HUD as
 * one 400×200 raster, split into 4 × 200×100 image tiles CENTRED on the 576×288
 * screen, plus a single invisible full-region gesture-capture text container.
 *
 * # Schema shape
 *
 * ```
 * containerTotalNum: 5   (SHOWCASE_CONTAINER_TOTAL)
 * imageObject: [showcase-tile-0..3]   — 200×100 each, 2×2 = 400×200, centred at (88,44)
 * textObject:  [showcase-capture]     — 400×200 @ (88,44), isEventCapture:1, content ' '
 * ```
 *
 * The whole HUD (frame + header + framed map + status card + footer) is drawn by
 * `drawShowcaseHud` onto a 400×200 canvas, dithered, and pushed as the 4 tiles by
 * the `ShowcaseHudLayer`'s own throttled driver — the LayerManager compositor is NOT
 * used (mirrors the hybrid map-region path, but here the region IS the whole HUD).
 *
 * INVARIANTS (asserted by tests):
 *  - Exactly one `isEventCapture=1` container (showcase-capture), with content `' '`.
 *  - 4 image + 1 text within the ≤4 image / ≤8 text budget.
 *  - All rects fit within the 576×288 physical screen (400×200 centred at 88,44).
 *
 * @see packages/g2-app/src/hud/showcase-hud-layer.ts (the layer that pushes the tiles)
 * @see packages/g2-app/src/hud/showcase-hud-renderer.ts (draws the 400×200 canvas)
 */
export function buildShowcasePageSchema(): {
  containerTotalNum: number;
  imageObject: ImageContainerProperty[];
  textObject: TextContainerProperty[];
} {
  const tileNames = ['showcase-tile-0', 'showcase-tile-1', 'showcase-tile-2', 'showcase-tile-3'];

  const imageObject = tileNames.map((name) => {
    const e = CONTAINER_REGISTRY[name];
    if (e === undefined) {
      throw new Error(`[EVF] buildShowcasePageSchema: missing registry entry for '${name}'`);
    }
    return new ImageContainerProperty({
      containerID: e.id,
      containerName: name,
      xPosition: e.xPosition,
      yPosition: e.yPosition,
      width: e.width,
      height: e.height,
    });
  });

  const captureEntry = CONTAINER_REGISTRY['showcase-capture'];
  if (captureEntry === undefined) {
    throw new Error("[EVF] buildShowcasePageSchema: missing registry entry for 'showcase-capture'");
  }

  const textObject = [
    // showcase-capture: full-region gesture-capture text container. The image tiles
    // cover it (type-based host z-order), so it stays invisible and only routes R1
    // gestures. content: ' ' required — an event-capture container cannot have empty
    // content (protobuf omits an absent optional field).
    new TextContainerProperty({
      containerID: captureEntry.id,
      containerName: 'showcase-capture',
      xPosition: captureEntry.xPosition,
      yPosition: captureEntry.yPosition,
      width: captureEntry.width,
      height: captureEntry.height,
      isEventCapture: 1,
      content: ' ',
    }),
  ];

  return { containerTotalNum: SHOWCASE_CONTAINER_TOTAL, imageObject, textObject };
}

// ── Base image / text container builders ──────────────────────────────────────

/**
 * Build the 4 base image containers (ids 0-3) as SDK `ImageContainerProperty`
 * instances, in id order, each carrying `containerID` + `containerName` +
 * geometry.
 *
 * @returns The 4 `ImageContainerProperty` instances in declaration (id) order.
 */
export function buildBaseImageContainers(): ImageContainerProperty[] {
  return Object.entries(CONTAINER_REGISTRY)
    .filter(([name, e]) => e.kind === 'image' && BASE_NAMES.has(name))
    .sort(([, a], [, b]) => a.id - b.id)
    .map(
      ([name, e]) =>
        new ImageContainerProperty({
          containerID: e.id,
          containerName: name,
          xPosition: e.xPosition,
          yPosition: e.yPosition,
          width: e.width,
          height: e.height,
        }),
    );
}

/**
 * Build the 7 base text containers (ids 4-10) as SDK `TextContainerProperty`
 * instances, in id order, each carrying `containerID` + `containerName` +
 * geometry + `isEventCapture` (1 only for map-capture).
 *
 * @returns The 7 `TextContainerProperty` instances in declaration (id) order.
 */
export function buildBaseTextContainers(): TextContainerProperty[] {
  return Object.entries(CONTAINER_REGISTRY)
    .filter(([name, e]) => e.kind === 'text' && BASE_NAMES.has(name))
    .sort(([, a], [, b]) => a.id - b.id)
    .map(
      ([name, e]) =>
        new TextContainerProperty({
          containerID: e.id,
          containerName: name,
          xPosition: e.xPosition,
          yPosition: e.yPosition,
          width: e.width,
          height: e.height,
          isEventCapture: e.isEventCapture,
        }),
    );
}

/**
 * The three default status-view container names declared in the boot schema.
 * Exported as a frozen set so callers can filter against it without coupling to
 * the string literals.
 */
const STATUS_VIEW_NAMES: ReadonlySet<string> = new Set(['header', 'footer', 'status-hud']);

/**
 * Build the 3 default status-view text containers (header, footer, status-hud)
 * as SDK `TextContainerProperty` instances, in id order (4, 5, 6).
 *
 * These are the ONLY containers declared in the default boot page schema. They
 * tile perfectly: header(y=0,h=27) + status-hud(y=27,h=234) + footer(y=261,h=27)
 * = 288px total, no gaps, no overlaps, all within 576×288.
 *
 * map-capture (id 7), z05-* (ids 8-10), and the 4 image map-tiles are excluded.
 * They remain in the registry for the deferred map-mode page schema (Phase 20).
 *
 * @returns The 3 `TextContainerProperty` instances in id order (header, footer, status-hud).
 */
export function buildStatusViewTextContainers(): TextContainerProperty[] {
  return Object.entries(CONTAINER_REGISTRY)
    .filter(([name, e]) => e.kind === 'text' && STATUS_VIEW_NAMES.has(name))
    .sort(([, a], [, b]) => a.id - b.id)
    .map(([name, e]) => {
      // status-hud is the SINGLE capture target for the glyph fallback page
      // (G2 spec: exactly one isEventCapture=1 per page). The registry retains
      // isEventCapture:0 because including map-capture (also isEventCapture:1,
      // same geometry) in the same schema caused a G2 host capture-conflict in
      // quick-260605-j0t. The builder overrides per-schema; do NOT change the
      // registry value.
      if (name === 'status-hud') {
        return new TextContainerProperty({
          containerID: e.id,
          containerName: name,
          xPosition: e.xPosition,
          yPosition: e.yPosition,
          width: e.width,
          height: e.height,
          isEventCapture: 1,
          // content: ' ' required — spec: event-capture container cannot have empty content (protobuf omits absent optional field)
          content: ' ',
        });
      }
      return new TextContainerProperty({
        containerID: e.id,
        containerName: name,
        xPosition: e.xPosition,
        yPosition: e.yPosition,
        width: e.width,
        height: e.height,
        isEventCapture: e.isEventCapture,
      });
    });
}

/**
 * Resolve the numeric host `containerID` for a known base container name.
 *
 * Returns `undefined` for any unknown or overlay-only name (e.g. `overlay-block`,
 * `toast-block`, `boot-error-block`). Overlay call sites pass the result through
 * unchanged — `undefined` leaves the SDK field unset, so the host keeps
 * addressing those containers by name until the overlay-id path lands.
 *
 * @param name Container name as used at the call site.
 * @returns The numeric id (0-10) for a known base name, else `undefined`.
 */
export function resolveContainerId(name: string): number | undefined {
  return CONTAINER_REGISTRY[name]?.id;
}

/**
 * Resolve the numeric host `containerID` for a container name as a SPREADABLE
 * partial — `{ containerID: n }` for a known base name, or `{}` for an unknown /
 * overlay-only name.
 *
 * This is the call-site-friendly companion to {@link resolveContainerId}. The
 * SDK payload classes are compiled under `exactOptionalPropertyTypes: true`, so
 * assigning `containerID: undefined` to an optional `containerID?: number` field
 * is a type error. Spreading the result of this helper into the payload literal
 * sets the field ONLY when an id exists and omits it entirely otherwise — exactly
 * the host contract (numeric id for base containers; addressed by name for
 * overlay containers until the overlay-id path lands).
 *
 * @example
 *   new TextContainerUpgrade({
 *     ...resolveContainerIdField('status-hud'), // → { containerID: 6 }
 *     containerName: 'status-hud',
 *     content,
 *   });
 *
 * @param name Container name as used at the call site.
 * @returns `{ containerID }` for a known base name, else `{}` (field omitted).
 */
export function resolveContainerIdField(name: string): { containerID?: number } {
  const id = resolveContainerId(name);
  return id === undefined ? {} : { containerID: id };
}
