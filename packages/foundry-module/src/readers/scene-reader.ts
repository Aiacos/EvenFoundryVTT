/**
 * Foundry-side scene viewport reader.
 *
 * Reads from `game.scenes.active` (active scene) and `canvas.stage` (viewport position).
 * Returns a safe default if the canvas is not yet initialised.
 *
 * Read-only contract (Phase 2). Canvas mutations deferred to Phase 7.
 *
 * @see Specs.md §4 (read pipeline), §7.2 (z=0 map layer)
 * @see packages/foundry-module/src/types/foundry-globals.d.ts (scene/canvas shape declarations)
 * @see 02-05-PLAN.md Task 1 (scene-reader.ts spec)
 */

import type { SceneViewport } from '@evf/shared-protocol';

/**
 * Returns the current scene viewport snapshot.
 *
 * If no active scene exists, returns a safe zero-state with empty sceneId.
 * If canvas is not yet initialised (e.g. before canvasReady), viewport position
 * defaults to (0, 0, scale 1.0).
 *
 * @returns SceneViewport (never null — always returns a valid shape)
 */
export function getSceneViewport(): SceneViewport {
  const activeScene = game.scenes.active;

  if (activeScene === null) {
    return {
      sceneId: '',
      sceneName: '',
      viewX: 0,
      viewY: 0,
      scale: 1.0,
      tokenIds: [],
    };
  }

  const tokenIds = activeScene.tokens.contents.map((t) => t.id);

  // Canvas may be null before canvasReady fires
  const stage = canvas?.stage;
  const viewX = stage?.pivot.x ?? 0;
  const viewY = stage?.pivot.y ?? 0;
  // Use absolute value of scale.x — PIXI scale can be negative for flip operations
  const scale = Math.abs(stage?.scale.x ?? 1.0);

  return {
    sceneId: activeScene.id,
    sceneName: activeScene.name,
    viewX,
    viewY,
    scale: scale > 0 ? scale : 1.0,
    tokenIds,
  };
}
