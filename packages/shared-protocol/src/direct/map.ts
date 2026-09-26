/**
 * MapSnapshot — compact scene description the G2 app turns into the square map of
 * zone C (docs/design/g2-sheet-ux.html `mapZone()`): the pixelated scene art
 * (Specs.md §7.4b.4/§7.4b.5 dither lineage) under crisp vector markers.
 *
 * Token and wall geometry is in **grid cells** (floats allowed) relative to the
 * scene rectangle's top-left, so the payload is resolution-independent and small.
 * Scene art (background, tiles) is positioned in **scene pixels** relative to the
 * same corner — the phone divides by {@link MapSnapshot.gridPx}. Image `src`s are
 * `evf-asset:<id>` references: the projector sends each picture once in an `asset`
 * message, because the phone never reaches Foundry (ADR-0019 §Decision Outcome 5).
 * Tokens are already filtered by the projector to what the paired actor may see.
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
  /** `evf-asset:<id>` reference of the token art, if any. */
  img: z.string().min(1).optional(),
  /**
   * Sight radius in cells — only on the viewer's own token, omitted when the token has
   * no limited sight (the phone then applies its documented default radius).
   */
  sight: z.number().nonnegative().optional(),
});
export type MapToken = z.infer<typeof MapTokenSchema>;

/**
 * Wall segment `[x1, y1, x2, y2]` in cells; `door` true when it is a door; `open` true
 * when it does not block sight (open door, or a wall without a sight restriction).
 */
export const MapWallSchema = z.strictObject({
  c: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  door: z.boolean().optional(),
  open: z.boolean().optional(),
});
export type MapWall = z.infer<typeof MapWallSchema>;

/** A scene image placed in scene pixels relative to the scene rectangle's top-left. */
export const MapImageSchema = z.strictObject({
  /** `evf-asset:<id>` reference (see `AssetSchema`). */
  src: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});
export type MapImage = z.infer<typeof MapImageSchema>;

/** A tile: a {@link MapImage} plus its draw order (`z`, ascending = further back). */
export const MapTileSchema = MapImageSchema.extend({ z: z.number() });
export type MapTile = z.infer<typeof MapTileSchema>;

/** Most tiles sent per snapshot (the lowest `z` first); keeps the payload bounded. */
export const MAX_MAP_TILES = 32;

export const MapSnapshotSchema = z.strictObject({
  sceneId: z.string(),
  name: z.string(),
  /** Scene size in cells. */
  cols: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  /** Grid size in scene pixels (maps the scene art to cells). */
  gridPx: z.number().positive(),
  /** Scene background image, if any. */
  background: MapImageSchema.optional(),
  /** Visible scene tiles drawn over the background, ascending `z`. */
  tiles: z.array(MapTileSchema).max(MAX_MAP_TILES).optional(),
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
