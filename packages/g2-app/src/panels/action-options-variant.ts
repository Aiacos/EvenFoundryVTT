/**
 * Runtime selection of the {@link ActionOptionsModal} variant for the live HUD render mode.
 *
 * Canvas + showcase compose every z=2 overlay onto the shared `CanvasCompositor` (the
 * showcase layer downscales that 576×288 composite into its 400×200 raster region —
 * Feature 002 z=2 overlays), so the item-use follow-on modal MUST be the
 * {@link CanvasActionOptionsModal} — a `CanvasLayer` that declares `{ image:0, text:0 }`
 * and paints to the canvas. The glyph {@link ActionOptionsModal} renders into a native
 * **text** container (`{ image:0, text:1 }`), which is illegal on the canvas/showcase
 * image-tile page (it throws `canvas mode: layer … declared non-zero container count`).
 * Glyph + hybrid render overlays via the native text path, so they use the glyph modal.
 *
 * The modules are loaded lazily (dynamic import) to preserve the boot-time
 * no-circular-dependency guarantee the two boot dispatch sites already relied on.
 *
 * @see packages/g2-app/src/panels/canvas-action-options-modal.ts (canvas variant)
 * @see packages/g2-app/src/panels/action-options-modal.ts (glyph variant / parent)
 * @see packages/g2-app/src/hud/showcase-hud-layer.ts (overlay-source downscale path)
 */

import type { HudRenderMode } from '../engine/layer-manager.js';
import type { ActionOptionsModal } from './action-options-modal.js';

/**
 * Load the {@link ActionOptionsModal} constructor appropriate for `mode`.
 *
 * `CanvasActionOptionsModal extends ActionOptionsModal` with an identical constructor,
 * so the returned constructor is a drop-in for the glyph one — the boot dispatch passes
 * the same argument list either way.
 *
 * @param mode The live `LayerManager.getRenderMode()` value.
 * @returns `CanvasActionOptionsModal` for `canvas`/`showcase`, else the glyph `ActionOptionsModal`.
 */
export async function loadActionOptionsModalCtor(
  mode: HudRenderMode,
): Promise<typeof ActionOptionsModal> {
  if (mode === 'canvas' || mode === 'showcase') {
    return (await import('./canvas-action-options-modal.js')).CanvasActionOptionsModal;
  }
  return (await import('./action-options-modal.js')).ActionOptionsModal;
}
