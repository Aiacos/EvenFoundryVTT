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
  // TODO(HUD-27PX): re-activate as visible base when map mode toggle is implemented (#issue)
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
  // TODO(HUD-27PX): re-evaluate z05 positions once map-mode is gesture-opened (#issue)
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
});

/**
 * Total base-page container count (= 4 image + 7 text = 11), within the SDK's
 * 1-12 limit. This counts ALL entries in the registry (including deferred
 * map-mode containers). Used only for informational purposes and by the map-mode
 * page schema when it declares all containers.
 *
 * @see BOOT_CONTAINER_TOTAL for the default status-view boot schema count.
 */
export const BASE_CONTAINER_TOTAL = Object.keys(CONTAINER_REGISTRY).length;

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

/**
 * Build the 4 base image containers (ids 0-3) as SDK `ImageContainerProperty`
 * instances, in id order, each carrying `containerID` + `containerName` +
 * geometry.
 *
 * @returns The 4 `ImageContainerProperty` instances in declaration (id) order.
 */
export function buildBaseImageContainers(): ImageContainerProperty[] {
  return Object.entries(CONTAINER_REGISTRY)
    .filter(([, e]) => e.kind === 'image')
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
    .filter(([, e]) => e.kind === 'text')
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
