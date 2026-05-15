/**
 * MapBaseLayer — z=0 Map Base implementation of the `Layer` interface.
 *
 * Mounted into the LayerManager at `ZIndex.Z0_MAP`. Owns the capture-container
 * provider role for the page (returns `'map-capture'`); per the
 * INV-5 / ADR-0001 invariant exactly one mounted layer must do so at every
 * mount/destroy boundary (LayerManager asserts this).
 *
 * Mode routing:
 *   - `'raster'` (Branch A)  → delegate to `RasterControllerLike.requestFrame`
 *                              (concrete `RasterController` lands in Plan 03
 *                              Task 3 and `implements RasterControllerLike`).
 *   - `'glyph'`  (Branch B/C) → delegate to `renderGlyphScene` (this file).
 *   - `'auto'`              → consult `controller.getBleVerdict()`; `'glyph'`
 *                              routes to glyph, anything else (including
 *                              `null` while the probe is pending) routes to
 *                              raster (UI default).
 *
 * The MapBaseLayer caches the latest `setScene()` payload — the
 * `LayerManager` calls `draw()` on its own cadence (bundle flush or
 * heartbeat) and the layer renders whichever scene is current. Plan 06's
 * `scene-input.ts` will push fresh scenes via `setScene()` when a Foundry
 * canvas update arrives; Plan 05's smoke test injects a synthetic scene to
 * exercise the layer end-to-end.
 *
 * **B-4 forward-import-cycle resolution:** This file imports
 * `RasterControllerLike` via `import type` from `../engine/layer-types.js`
 * (Plan 01 Task 2 contract) — NOT from `./raster-controller.js` (Plan 03 Task
 * 3 concrete class). At the Task 2 commit boundary `raster-controller.ts`
 * does not yet exist; the type-only import lets MapBaseLayer typecheck
 * standalone. The concrete class arrives in Task 3 and satisfies the same
 * structural contract via `class RasterController implements RasterControllerLike`.
 *
 * @see docs/architecture/0001-layered-ui-model.md (z=0 always rendered)
 * @see docs/architecture/0006-raster-pipeline-library-stack.md (raster pipeline)
 * @see docs/architecture/0009-layer-manager-contract.md (LayerManager API)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Screen 2 + §Screen 3
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 4
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-4 (import type rationale)
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { LayerManager } from '../engine/layer-manager.js';
import type { Layer, RasterControllerLike } from '../engine/layer-types.js';
import type { GlyphSceneInput, renderGlyphScene } from './glyph-renderer.js';

/** Concrete pixel-data input for the raster branch. */
export interface RasterFrameInput {
  readonly pixelData: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** Union of scene payloads MapBaseLayer can render in either mode. */
export type MapSceneInput = GlyphSceneInput | RasterFrameInput;

/** Type guard distinguishing a raster pixel-data payload from a glyph scene. */
function isRasterFrame(scene: MapSceneInput): scene is RasterFrameInput {
  return (scene as RasterFrameInput).pixelData instanceof Uint8ClampedArray;
}

/** Renderer signature accepted by the constructor — usually `renderGlyphScene`. */
export type GlyphRenderer = typeof renderGlyphScene;

/**
 * Resolve `'auto'` to the operative mode using the controller's BLE verdict.
 *
 * Pure helper; exported for tests that exercise the verdict resolution
 * matrix without driving the whole layer. (Not re-exported through the
 * package barrel — internal contract.)
 */
function resolveAutoMode(
  declared: 'auto' | 'raster' | 'glyph',
  verdict: 'raster' | 'glyph' | null,
): 'raster' | 'glyph' {
  if (declared !== 'auto') {
    return declared;
  }
  return verdict === 'glyph' ? 'glyph' : 'raster';
}

/**
 * Z=0 Map Base Layer.
 *
 * Constructed by the boot flow (Plan 05 smoke / Plan 06 scene-input wiring)
 * and mounted into the LayerManager at `ZIndex.Z0_MAP`. The constructor
 * accepts mocked or production instances for every collaborator — no
 * singleton lookup or global state.
 */
export class MapBaseLayer implements Layer {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'map-base';

  /** Latest scene pushed via `setScene()` — drained on every `draw()`. */
  private currentScene: MapSceneInput | null = null;

  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly controller: RasterControllerLike,
    private readonly renderer: GlyphRenderer,
    private readonly layerManager: LayerManager,
  ) {}

  /**
   * Capture-container provider — owns the only `isEventCapture=1` slot on
   * the page when this layer is mounted (INV-5 / ADR-0001).
   */
  getCaptureContainer(): string {
    return 'map-capture';
  }

  /**
   * Stash the latest scene payload for the next `draw()`.
   *
   * Plan 06 calls this when a Foundry canvas update + WS transfer arrives.
   * Plan 05's smoke test calls it with a synthetic payload to exercise the
   * end-to-end flow without spinning up Foundry. Idempotent — replacing the
   * scene before a `draw()` is called simply overwrites the buffer.
   */
  async setScene(scene: MapSceneInput): Promise<void> {
    this.currentScene = scene;
  }

  /**
   * Render the current scene to the G2 via the active mode's dispatcher.
   *
   * Mode resolution per CONTEXT.md §Area 4:
   *   - `getMapMode()` returns the manager-declared mode.
   *   - `'auto'` is folded to `'raster'` or `'glyph'` using the controller's
   *     BLE verdict (raster default while pending).
   *
   * On `currentScene === null` (no scene yet) the method resolves without
   * touching the bridge — a no-op draw is correct during the "loading"
   * window before Plan 06 pushes the first scene.
   */
  async draw(): Promise<void> {
    if (this.currentScene === null) {
      return;
    }
    const declared = this.layerManager.getMapMode();
    const mode = resolveAutoMode(declared, this.controller.getBleVerdict());
    if (mode === 'glyph') {
      // Caller is responsible for ensuring `currentScene` matches the mode
      // when forcing 'glyph'; in 'auto' the orchestrator (Plan 06) supplies
      // the appropriate shape based on the active mode.
      if (isRasterFrame(this.currentScene)) {
        // Pixel-data was queued but we're in glyph mode — skip (Plan 06
        // will re-queue a glyph scene on the next mode-change tick).
        return;
      }
      await this.renderer(this.bridge, this.currentScene);
      return;
    }
    // raster path — pixel data only
    if (!isRasterFrame(this.currentScene)) {
      return;
    }
    await this.controller.requestFrame(
      this.currentScene.pixelData,
      this.currentScene.width,
      this.currentScene.height,
    );
  }

  /**
   * Tear down the layer — terminates the underlying raster Worker and drops
   * the cached scene. Safe to call multiple times.
   */
  destroy(): void {
    this.controller.terminate();
    this.currentScene = null;
  }
}
