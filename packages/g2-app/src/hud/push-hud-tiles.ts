/**
 * push-hud-tiles.ts — production serialized tile-push module (CM-01 contract).
 *
 * Extracted from the PoC page module per D-25.1 (Plan 25-01). This is the
 * canonical production home for `pushHudTiles` — the PoC source file
 * is scheduled for deletion in Plan 03.
 *
 * # CM-01 Serialization Contract
 *
 * The Even Hub SDK does NOT accept concurrent `updateImageRawData` calls on the
 * same container. `pushHudTiles` uses `for...of` + `await` per tile — do NOT
 * replace this loop with `Promise.all`.
 *
 * # Fail-soft semantics
 *
 * On a non-success `updateImageRawData` result, `pushHudTiles` emits a
 * `console.warn` and continues to the next tile — it NEVER throws. This mirrors
 * the pattern in `raster-controller.ts#_dispatchChangedTiles`.
 *
 * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (CM-01, RAST-01)
 * @see .planning/debug/glasses-render-blank-containerid.md (qm0 numeric-id requirement)
 * @see packages/g2-app/src/engine/layer-manager.ts (_compositeAndPush caller)
 * @see packages/g2-app/src/engine/hud-delta-driver.ts (HudDeltaDriver callers)
 * @see packages/g2-app/src/raster/raster-controller.ts (_dispatchChangedTiles pattern)
 */

import {
  type EvenAppBridge,
  ImageRawDataUpdate,
  ImageRawDataUpdateResult,
} from '@evenrealities/even_hub_sdk';
import type { HudTile } from './hud-raster-frame.js';

// ── pushHudTiles ──────────────────────────────────────────────────────────────

/**
 * Push dithered PNG tiles to the G2 framebuffer via `updateImageRawData`.
 *
 * This is the **production serialized-push path** called from
 * `LayerManager._compositeAndPush()` and `HudDeltaDriver._runCycle()` in canvas
 * mode (ADR-0013 Amendment 1, RAST-01). It is also used by the PoC boot path
 * (`?hud=raster`).
 *
 * For each tile, builds an `ImageRawDataUpdate` carrying:
 * - `containerID` — numeric id (required by the host, qm0 requirement)
 * - `containerName` — string name
 * - `imageData` — 4-bit indexed-palette PNG bytes from `buildHudTiles`
 *
 * **Serialization contract (CM-01):** uses `for...of` + `await` per tile — the
 * Even Hub SDK does NOT accept concurrent `updateImageRawData` calls on the same
 * container. Do NOT replace this loop with `Promise.all`.
 *
 * On `!ImageRawDataUpdateResult.isSuccess(result)`: logs a `console.warn` and
 * continues to the next tile (fail-soft best-effort, never throws). Mirrors
 * `raster-controller.ts#_dispatchChangedTiles`.
 *
 * @param bridge The resolved `EvenAppBridge` singleton (only `updateImageRawData` is used).
 * @param tiles  `HudTile` objects from `buildHudTiles` — pushed in array order.
 *
 * @see packages/g2-app/src/engine/layer-manager.ts#_compositeAndPush (production caller)
 * @see packages/g2-app/src/engine/hud-delta-driver.ts (HudDeltaDriver callers)
 * @see packages/g2-app/src/raster/raster-controller.ts#_dispatchChangedTiles (pattern source)
 * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (RAST-01)
 * @see .planning/debug/glasses-render-blank-containerid.md (qm0 numeric-id requirement)
 */
export async function pushHudTiles(
  bridge: Pick<EvenAppBridge, 'updateImageRawData'>,
  tiles: ReadonlyArray<HudTile>,
): Promise<void> {
  for (const tile of tiles) {
    const payload = new ImageRawDataUpdate({
      containerID: tile.containerID,
      containerName: tile.containerName,
      imageData: tile.bytes,
    });
    const result = await bridge.updateImageRawData(payload);
    if (!ImageRawDataUpdateResult.isSuccess(result)) {
      console.warn(
        `[EVF] push-hud-tiles: updateImageRawData non-success for ${tile.containerName} (id=${tile.containerID}):`,
        result,
      );
    }
  }
}
