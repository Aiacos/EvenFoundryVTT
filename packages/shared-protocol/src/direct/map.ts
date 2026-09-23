/**
 * MapSnapshot — compact scene description the G2 app turns into the 192×288
 * pixelated map (docs/design/g2-thirds-layout.md §Mappa pixelata).
 *
 * All geometry is in **grid cells** (floats allowed) relative to the scene's
 * top-left, so the payload is resolution-independent and small. Tokens are already
 * filtered by the projector to what the paired actor can see.
 */
import { z } from 'zod';

export const TOKEN_KINDS = ['self', 'ally', 'enemy', 'neutral'] as const;
export const TokenKindSchema = z.enum(TOKEN_KINDS);
export type TokenKind = z.infer<typeof TokenKindSchema>;

export const MapTokenSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  kind: TokenKindSchema,
  /** Top-left cell. */
  x: z.number(),
  y: z.number(),
  /** Size in cells (1 = medium). */
  w: z.number().positive(),
  h: z.number().positive(),
  /** 0–1 health fraction when the viewer may see it; omitted otherwise. */
  hp: z.number().min(0).max(1).optional(),
});
export type MapToken = z.infer<typeof MapTokenSchema>;

/** Wall segment `[x1, y1, x2, y2]` in cells; `door` true when it is a door. */
export const MapWallSchema = z.strictObject({
  c: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  door: z.boolean().optional(),
});
export type MapWall = z.infer<typeof MapWallSchema>;

export const MapSnapshotSchema = z.strictObject({
  sceneId: z.string(),
  name: z.string(),
  /** Scene size in cells. */
  cols: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  /** Grid size in scene pixels (to map the background image to cells). */
  gridPx: z.number().positive(),
  /** Same-origin relative URL of the background image, if any. */
  background: z.string().optional(),
  /** Scene darkness 0 (day) – 1 (night). */
  darkness: z.number().min(0).max(1),
  walls: z.array(MapWallSchema),
  tokens: z.array(MapTokenSchema),
  /** Token id of the paired actor on this scene, if placed. */
  selfTokenId: z.string().optional(),
  /** Id of the currently targeted token, if any. */
  targetId: z.string().optional(),
});
export type MapSnapshot = z.infer<typeof MapSnapshotSchema>;
