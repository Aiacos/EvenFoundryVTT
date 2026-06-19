/**
 * Unit tests for SceneViewportSchema.
 *
 * The load-bearing contract here is the **empty-sceneId zero-state**: unlike the
 * `sceneId` field in frame.ts / frame-png.ts (which is `.min(1)` because a frame
 * always belongs to a real scene), SceneViewportSchema.sceneId MUST accept `''`
 * — the canonical "no active scene" state that scene-reader.ts produces and the
 * bridge scene route both validates and emits as its fallback.
 */
import { describe, expect, it } from 'vitest';

import { SCENE_VIEWPORT_DELTA_TYPE, SceneViewportSchema } from './scene.js';

const ZERO_STATE = {
  sceneId: '',
  sceneName: '',
  viewX: 0,
  viewY: 0,
  scale: 1.0,
  tokenIds: [],
};

describe('SceneViewportSchema', () => {
  it('accepts the empty-sceneId zero-state (no active scene)', () => {
    expect(SceneViewportSchema.safeParse(ZERO_STATE).success).toBe(true);
  });

  it('accepts a populated viewport', () => {
    const result = SceneViewportSchema.safeParse({
      sceneId: 'scene-abc',
      sceneName: 'Dungeon',
      viewX: 1200,
      viewY: 800,
      scale: 1.5,
      tokenIds: ['t1', 't2'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive scale', () => {
    expect(SceneViewportSchema.safeParse({ ...ZERO_STATE, scale: 0 }).success).toBe(false);
  });

  it('rejects an unknown extra field (strictObject)', () => {
    expect(SceneViewportSchema.safeParse({ ...ZERO_STATE, extra: 'leaked' }).success).toBe(false);
  });

  it('SCENE_VIEWPORT_DELTA_TYPE is "scene.viewport"', () => {
    expect(SCENE_VIEWPORT_DELTA_TYPE).toBe('scene.viewport');
  });
});
