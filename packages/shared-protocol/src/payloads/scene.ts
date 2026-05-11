/**
 * SceneViewport Zod schema — Foundry canvas read shape.
 *
 * Provides current scene identity and camera viewport for Phase 4a map rendering.
 * Emitted by canvasReady + controlToken hooks.
 *
 * @see Specs.md §4 (read pipeline), §7.2 (layered rendering z=0 map)
 * @see packages/foundry-module/src/readers/scene-reader.ts (producer)
 * @see 02-05-PLAN.md Task 1 (SceneViewportSchema spec)
 */
import { z } from 'zod';

/**
 * Snapshot of the active scene and canvas camera position.
 *
 * Returned by `GET /v1/scene/viewport`.
 * Phase 4a consumes this to determine which map tile to raster-render for G2 display.
 */
export const SceneViewportSchema = z.strictObject({
  /** Foundry scene document ID of the currently active scene. */
  sceneId: z.string().min(1),
  /** Display name of the active scene. */
  sceneName: z.string(),
  /** Canvas X offset of the current viewport centre (canvas pixels). */
  viewX: z.number(),
  /** Canvas Y offset of the current viewport centre (canvas pixels). */
  viewY: z.number(),
  /** Current zoom scale (1.0 = 100%). */
  scale: z.number().positive(),
  /** IDs of all tokens visible on the active scene. */
  tokenIds: z.array(z.string()),
});

export type SceneViewport = z.infer<typeof SceneViewportSchema>;

/**
 * scene.viewport delta envelope type (emitted by canvasReady + controlToken hooks).
 */
export const SCENE_VIEWPORT_DELTA_TYPE = 'scene.viewport' as const;
