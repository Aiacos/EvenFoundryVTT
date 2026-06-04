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
 * This module is the ONE place ids + geometry are declared. `page-lifecycle`
 * builds both the boot and main page schemas from it; `LayerManager._flushPage`
 * rebuilds the same canonical schema from it; and every render call site resolves
 * its numeric id via {@link resolveContainerId}. No other file hardcodes a
 * container id or text-container geometry — that keeps the page schema and the
 * upgrade sites in lockstep (no drift between the two).
 *
 * # Geometry derivation (ASSUMPTION)
 *
 * Image-tile geometry is preserved verbatim from the pre-existing page schema
 * (200×100, tiled 2×2). Text-container pixel geometry is derived from the
 * UI-SPEC 96×24 character grid at 6 px/col × 12 px/row (576×288 total):
 *   - header     row 0, full width
 *   - footer     rows 22-23, full width
 *   - status-hud col 68-95, rows 1-21
 *   - map-capture map area col 0-67, rows 1-21 (isEventCapture=1)
 *   - z05-*      rows 17/18/19, col 0-67
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

  // ── Text containers (ids 4-10) — geometry from UI-SPEC 96×24 grid @ 6×12 px ──
  // header: row 0, full width.
  header: {
    id: 4,
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 12,
    isEventCapture: 0,
    kind: 'text',
  },
  // footer: rows 22-23, full width.
  footer: {
    id: 5,
    xPosition: 0,
    yPosition: 264,
    width: 576,
    height: 24,
    isEventCapture: 0,
    kind: 'text',
  },
  // status-hud: col 68-95 (68*6=408, 28*6=168), rows 1-21 (1*12=12, 21*12=252).
  'status-hud': {
    id: 6,
    xPosition: 408,
    yPosition: 12,
    width: 168,
    height: 252,
    isEventCapture: 0,
    kind: 'text',
  },
  // map-capture: map area col 0-67, rows 1-21 — the SOLE base capture container.
  'map-capture': {
    id: 7,
    xPosition: 0,
    yPosition: 12,
    width: 408,
    height: 252,
    isEventCapture: 1,
    kind: 'text',
  },
  // z05-combat-log: row 17 (17*12=204), col 0-67.
  'z05-combat-log': {
    id: 8,
    xPosition: 0,
    yPosition: 204,
    width: 408,
    height: 12,
    isEventCapture: 0,
    kind: 'text',
  },
  // z05-label: row 18 (18*12=216), col 0-67.
  'z05-label': {
    id: 9,
    xPosition: 0,
    yPosition: 216,
    width: 408,
    height: 12,
    isEventCapture: 0,
    kind: 'text',
  },
  // z05-stats: row 19 (19*12=228), col 0-67.
  'z05-stats': {
    id: 10,
    xPosition: 0,
    yPosition: 228,
    width: 408,
    height: 12,
    isEventCapture: 0,
    kind: 'text',
  },
});

/**
 * Total base-page container count (= 4 image + 7 text = 11), within the SDK's
 * 1-12 limit. Use this for `containerTotalNum` in every base-page schema so the
 * value is never hardcoded outside this module.
 */
export const BASE_CONTAINER_TOTAL = Object.keys(CONTAINER_REGISTRY).length;

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
