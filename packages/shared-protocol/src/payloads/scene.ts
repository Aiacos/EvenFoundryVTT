/**
 * `scene.viewport` delta topic: a scene/camera change. The glasses treat it as a map
 * refresh trigger (`get map`); the map itself travels as the direct-channel `map`
 * snapshot (`direct/map.ts`, ADR-0016).
 */
export const SCENE_VIEWPORT_DELTA_TYPE = 'scene.viewport' as const;
