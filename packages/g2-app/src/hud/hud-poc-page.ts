/**
 * PoC page — 4 full-screen 288×144 image containers for the raster HUD PoC.
 *
 * This module defines the EvenHub page schema for the raster HUD PoC: 4 image
 * containers tiling the full 576×288 G2 screen, plus the helpers to build and
 * create the PoC page. The `pushHudTiles` function has been extracted to
 * `push-hud-tiles.ts` (Plan 25-01 — D-25.1 extraction).
 *
 * # Container ID contract (qm0 / ADR-0013)
 *
 * This PoC page is LOCAL to the PoC boot path — it does NOT share the id
 * namespace with the default status-text boot page. The 4 HUD image containers
 * use ids 0-3, declared first in the page schema (`containerTotalNum: 4`). They
 * are DISTINCT from the default map-tile-0..3 containers (container-registry.ts)
 * because the PoC page has no text containers at all.
 *
 * Every `ImageContainerProperty` carries a numeric `containerID` (required by
 * the EvenHub host per the 2026-06-04 debug probe —
 * see `.planning/debug/glasses-render-blank-containerid.md`).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013)
 * @see packages/g2-app/src/hud/push-hud-tiles.ts (pushHudTiles — extracted)
 * @see packages/g2-app/src/engine/container-registry.ts (default container registry, NOT imported)
 * @see packages/g2-app/src/engine/page-lifecycle.ts (createBootPage pattern)
 * @see .planning/debug/glasses-render-blank-containerid.md (qm0 numeric-id requirement)
 */

import {
  CreateStartUpPageContainer,
  type EvenAppBridge,
  ImageContainerProperty,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk';
import { HUD_TILE_GEOMETRY } from './hud-raster-frame.js';

// ── HUD_POC_CONTAINERS ────────────────────────────────────────────────────────

/**
 * Convenience descriptor for a HUD PoC container — mirrors the constructor
 * arguments for `ImageContainerProperty` plus the string name.
 *
 * Used by `buildHudPocPageSchema` and exported for tests to assert geometry
 * without constructing SDK classes.
 */
export interface HudPocContainerDef {
  /** Container name (e.g. `"hud-tile-0"`). */
  readonly containerName: string;
  /** Numeric host container ID (0-3). */
  readonly containerID: number;
  /** Top-left X position (pixels). */
  readonly xPosition: number;
  /** Top-left Y position (pixels). */
  readonly yPosition: number;
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
}

/**
 * The 4 full-screen HUD image container definitions in id order (0..3).
 *
 * Tiling layout:
 * ```
 *   ┌─────────────┬─────────────┐
 *   │  hud-tile-0 │  hud-tile-1 │  288×144 each
 *   ├─────────────┼─────────────┤
 *   │  hud-tile-2 │  hud-tile-3 │
 *   └─────────────┴─────────────┘
 * ```
 *
 * This PoC page is DISTINCT from the default status-text boot page. The 4 image
 * containers fill the full 576×288 G2 screen, leaving no room for text containers.
 * The PoC declares `containerTotalNum: 4` with only image containers.
 *
 * Geometry is derived from `HUD_TILE_GEOMETRY` in `hud-raster-frame.ts`.
 *
 * @see packages/g2-app/src/hud/hud-raster-frame.ts#HUD_TILE_GEOMETRY
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013)
 */
export const HUD_POC_CONTAINERS: ReadonlyArray<HudPocContainerDef> = Object.freeze(
  HUD_TILE_GEOMETRY.map((tile) => ({
    containerName: tile.containerName,
    containerID: tile.containerID,
    xPosition: tile.x,
    yPosition: tile.y,
    width: tile.width,
    height: tile.height,
  })),
);

// ── buildHudPocPageSchema ─────────────────────────────────────────────────────

/**
 * Build the PoC page container schema: 4 image containers, no text containers.
 *
 * Returns the shape expected by `CreateStartUpPageContainer`:
 * ```ts
 * { containerTotalNum: 4, imageObject: ImageContainerProperty[], textObject: [] }
 * ```
 *
 * Each `ImageContainerProperty` carries `containerID + containerName + geometry`
 * per the qm0 requirement (all fields required by the EvenHub host).
 *
 * This is a PoC-LOCAL page schema — DISTINCT from the default boot page schema
 * built by `page-lifecycle.ts#buildBootPageSchema` (which has 3 text containers
 * and NO image containers). Do NOT use this schema outside the PoC boot path.
 *
 * @returns Page schema object ready to pass to `new CreateStartUpPageContainer({...})`.
 *
 * @see packages/g2-app/src/engine/page-lifecycle.ts#buildBootPageSchema (contrast)
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013)
 */
export function buildHudPocPageSchema(): {
  readonly containerTotalNum: number;
  readonly imageObject: ImageContainerProperty[];
  readonly textObject: never[];
} {
  const imageObject = HUD_POC_CONTAINERS.map(
    (c) =>
      new ImageContainerProperty({
        containerID: c.containerID,
        containerName: c.containerName,
        xPosition: c.xPosition,
        yPosition: c.yPosition,
        width: c.width,
        height: c.height,
      }),
  );

  return {
    containerTotalNum: 4,
    imageObject,
    textObject: [],
  };
}

// ── createHudPocPage ──────────────────────────────────────────────────────────

/**
 * Create the G2 PoC page via `bridge.createStartUpPageContainer`.
 *
 * The schema is built by `buildHudPocPageSchema()`: 4 full-screen image
 * containers, no text containers. On non-success result, the function throws
 * an `Error` whose message includes the result value (mirrors
 * `page-lifecycle.ts#createBootPage`).
 *
 * Callers (boot-hud-raster-poc.ts) invoke this AT MOST ONCE per PoC boot.
 *
 * @param bridge The resolved `EvenAppBridge` singleton.
 * @throws Error when `createStartUpPageContainer` returns non-success.
 *
 * @see packages/g2-app/src/engine/page-lifecycle.ts#createBootPage (pattern source)
 */
export async function createHudPocPage(bridge: EvenAppBridge): Promise<void> {
  const schema = buildHudPocPageSchema();
  const payload = new CreateStartUpPageContainer({
    containerTotalNum: schema.containerTotalNum,
    imageObject: schema.imageObject,
    textObject: schema.textObject,
  });
  const result = await bridge.createStartUpPageContainer(payload);
  if (result !== StartUpPageCreateResult.success) {
    throw new Error(
      `createHudPocPage: createStartUpPageContainer returned non-success (${String(result)})`,
    );
  }
}
