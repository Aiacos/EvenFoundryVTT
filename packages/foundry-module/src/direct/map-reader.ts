/**
 * Map reader — builds the {@link MapSnapshot} the G2 app turns into the square,
 * pixelated scene map of zone C (docs/design/g2-sheet-ux.html `mapZone()`, ADR-0016 §6).
 *
 * Reads **document data only** (`scene.grid`, `scene.dimensions`, `scene.background`,
 * `scene.tiles`, `scene.walls`, `scene.tokens`) — never the PIXI canvas — so it is
 * cheap enough to run on every throttled token/wall change and works even when the GM
 * is viewing another scene. The projector then turns the referenced images into
 * `asset` messages (`map-assets.ts`): the phone never reaches Foundry (ADR-0019).
 *
 * Geometry is converted from canvas pixels (which include the scene padding) to grid
 * cells relative to the scene rectangle's top-left, rounded to 1/100 cell; scene art
 * (background, tiles) stays in scene pixels relative to the same corner.
 *
 * Privacy: hidden tokens and hidden tiles are dropped, secret doors are reported as
 * plain walls, HP fractions are only included for the viewer's own and allied tokens,
 * and only same-origin paths or http(s) URLs are referenced (loaded by the projector tab).
 *
 * @see https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.SceneData.html — `grid`, `background`, `environment`, `tiles`
 * @see https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.GridData.html — `size`, `distance` ("distance units … represented by a single grid space")
 * @see https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.TokenData.html — `x`, `y`, `width`, `height`, `disposition`, `hidden`, `texture`, `sight`
 * @see https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.TokenSightData.html — `range` "in distance units … If null, the sight range is unlimited"
 * @see https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.TileData.html — `x`, `y`, `width`, `height` (pixels), `texture`, `elevation`, `sort`, `hidden`, `alpha`
 * @see https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.WallData.html — `c`, `door`, `ds`, `sight`
 * @see https://foundryvtt.com/api/v14/classes/foundry.documents.BaseScene.html — v14 moves `background` into `levels` (`initialLevel`, `firstLevel`)
 * @see https://foundryvtt.com/api/v14/classes/foundry.documents.BaseLevel.html — `background` {`src`, `offsetX`, `offsetY`}
 */
import {
  MAX_MAP_TILES,
  type MapImage,
  type MapSnapshot,
  type MapTile,
  type MapToken,
  type MapWall,
  type TokenKind,
} from '@evf/shared-protocol';

/** Who is looking at the map. */
export interface MapViewer {
  /** Actor projected on the glasses. */
  actorId: string;
  /** User of the projecting tab: ally detection (actor ownership) and `targetId`. */
  userId: string;
}

/** Fallback grid size (Foundry default) when a scene has none. */
const DEFAULT_GRID_PX = 100;
/** Fallback grid distance (dnd5e: 5 ft per square) when a scene has none. */
const DEFAULT_GRID_DISTANCE = 5;
/** `CONST.WALL_DOOR_STATES.OPEN` (CLOSED 0 · OPEN 1 · LOCKED 2). */
const DOOR_STATE_OPEN = 1;
/** `CONST.WALL_SENSE_TYPES.NONE` — the wall does not restrict sight (e.g. a window-less rail). */
const SENSE_NONE = 0;

/** Texture fields read from scene backgrounds, tiles and tokens (`TextureData`). */
interface TextureRead {
  src?: string | null;
  offsetX?: number;
  offsetY?: number;
}

/**
 * Scene/tile/token/wall fields read here beyond the shared minimal Foundry globals
 * (all optional: absent on older data or other versions).
 */
interface SceneArtRead {
  grid?: { size: number; distance?: number };
  background?: TextureRead;
  /** v14: backgrounds live on levels. */
  initialLevel?: string | null;
  levels?: { get(id: string): { background?: TextureRead } | undefined };
  firstLevel?: { background?: TextureRead } | null;
  tiles?: {
    contents: Array<{
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      hidden?: boolean;
      alpha?: number;
      elevation?: number;
      sort?: number;
      texture?: TextureRead;
    }>;
  };
  walls?: { contents: Array<{ c: number[]; door?: number; ds?: number; sight?: number }> };
}
interface TokenArtRead {
  texture?: TextureRead;
  sight?: { enabled?: boolean; range?: number | null };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Classifies a token for `viewer`: `self` (the paired actor), `ally` (friendly
 * disposition or owned by the player), `enemy` (hostile), else `neutral`.
 */
export function classifyToken(token: FoundryTokenDoc, viewer: MapViewer): TokenKind {
  if (token.actorId === viewer.actorId) return 'self';
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const dispositions = CONST.TOKEN_DISPOSITIONS;
  if (
    token.disposition === dispositions.FRIENDLY ||
    token.actor?.ownership?.[viewer.userId] === owner
  ) {
    return 'ally';
  }
  if (token.disposition === dispositions.HOSTILE) return 'enemy';
  return 'neutral';
}

/** HP fraction 0–1 of a token's actor, or undefined when unknown. */
function hpFraction(token: FoundryTokenDoc): number | undefined {
  const hp = token.actor?.system?.attributes?.hp;
  if (hp === undefined || typeof hp.value !== 'number' || !(hp.max > 0)) return undefined;
  return round2(clamp01(hp.value / hp.max));
}

/**
 * Normalises an image path (scene background, tile or token texture) for the projector
 * tab to load: a same-origin path becomes relative (resolved against the Foundry page, so
 * a routePrefix is honoured); an absolute http(s) URL of another origin (e.g. The Forge
 * assets CDN) is kept and loaded with CORS; anything else is dropped.
 */
export function toArtSrc(src: string | null | undefined, origin: string): string | undefined {
  if (typeof src !== 'string' || src === '') return undefined;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(src)) return src.replace(/^\/+/, '');
  try {
    const url = new URL(src);
    if (url.origin === origin) return `${url.pathname.replace(/^\/+/, '')}${url.search}`;
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    // Not a parseable absolute URL → not loadable.
    return undefined;
  }
}

/**
 * Background texture of a scene: `scene.background` (v13), else the initial / first
 * level's background (v14 levels).
 */
function backgroundTexture(scene: SceneArtRead): TextureRead | undefined {
  if (typeof scene.background?.src === 'string' && scene.background.src !== '') {
    return scene.background;
  }
  const initial =
    typeof scene.initialLevel === 'string' ? scene.levels?.get(scene.initialLevel) : undefined;
  return initial?.background ?? scene.firstLevel?.background ?? undefined;
}

/**
 * Background image placement: the image fills the scene rectangle, shifted by the
 * texture offset (scene px).
 */
function readBackground(
  scene: SceneArtRead,
  width: number,
  height: number,
  origin: string,
): MapImage | undefined {
  const tex = backgroundTexture(scene);
  const src = toArtSrc(tex?.src, origin);
  if (src === undefined || !(width > 0) || !(height > 0)) return undefined;
  return {
    src,
    x: Math.round(tex?.offsetX ?? 0),
    y: Math.round(tex?.offsetY ?? 0),
    w: width,
    h: height,
  };
}

/**
 * Visible, loadable, non-transparent tiles relative to the scene rectangle, in draw
 * order (elevation, then sort), capped at {@link MAX_MAP_TILES}. Rotation is ignored
 * (tiles are drawn axis-aligned — a documented approximation).
 */
function readTiles(scene: SceneArtRead, sceneX: number, sceneY: number, origin: string): MapTile[] {
  const out: Array<MapTile & { order: [number, number] }> = [];
  for (const tile of scene.tiles?.contents ?? []) {
    if (tile.hidden === true || (tile.alpha ?? 1) <= 0) continue;
    const src = toArtSrc(tile.texture?.src, origin);
    const w = tile.width ?? 0;
    const h = tile.height ?? 0;
    if (src === undefined || !(w > 0) || !(h > 0)) continue;
    out.push({
      src,
      x: Math.round((tile.x ?? 0) - sceneX),
      y: Math.round((tile.y ?? 0) - sceneY),
      w: Math.round(w),
      h: Math.round(h),
      z: 0,
      order: [tile.elevation ?? 0, tile.sort ?? 0],
    });
  }
  out.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]);
  return out.slice(0, MAX_MAP_TILES).map(({ order: _order, ...t }, i) => ({ ...t, z: i }));
}

/**
 * Sight radius of a token in cells, or undefined when vision is disabled or unlimited
 * (`sight.range` null) — the phone then applies its default radius.
 */
function sightCells(token: TokenArtRead, gridDistance: number): number | undefined {
  const range = token.sight?.range;
  if (token.sight?.enabled !== true || typeof range !== 'number' || !(range > 0)) return undefined;
  return round2(range / gridDistance);
}

/** Scene projected on the glasses: the active scene, else the GM's viewed scene. */
function projectedScene(): FoundryScene | null {
  return game.scenes.active ?? canvas?.scene ?? null;
}

/** Tokens hidden from players are never projected (nor targetable). */
function isProjectedToken(token: FoundryTokenDoc): boolean {
  return token.hidden !== true;
}

/** Outcome of {@link resolveTargetUuids}. */
export type TargetResolution = { ok: true; uuids: string[] } | { ok: false; invalidId: string };

/**
 * Translates {@link MapToken.id}s chosen on the glasses into token document UUIDs
 * (`Scene.<sceneId>.Token.<tokenId>`, the form `midiOptions.targetUuids` expects).
 *
 * Only tokens the device can see in its {@link MapSnapshot} are accepted — same
 * scene and same visibility rule as {@link readMapSnapshot} — so a tampered or stale
 * id can never target a hidden token or one on another scene.
 *
 * @param ids - Token ids from the wire (untrusted).
 * @returns `{ ok: true, uuids }` in input order, or the first id that is not a
 *          visible token of the projected scene.
 * @see https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html#uuid
 */
export function resolveTargetUuids(ids: readonly string[]): TargetResolution {
  const scene = projectedScene();
  const visible = new Map<string, string>();
  for (const token of scene?.tokens.contents ?? []) {
    if (isProjectedToken(token) && typeof token.uuid === 'string')
      visible.set(token.id, token.uuid);
  }
  const uuids: string[] = [];
  for (const id of ids) {
    const uuid = visible.get(id);
    if (uuid === undefined) return { ok: false, invalidId: id };
    uuids.push(uuid);
  }
  return { ok: true, uuids };
}

/**
 * Builds the map snapshot of the active scene for `viewer`.
 *
 * @returns the snapshot, or null when no scene is active.
 */
export function readMapSnapshot(viewer: MapViewer): MapSnapshot | null {
  const scene = projectedScene();
  if (scene === null) return null;

  const art = scene as FoundryScene & SceneArtRead;
  const origin = window.location.origin;
  const gridPx =
    scene.grid !== undefined && scene.grid.size > 0 ? scene.grid.size : DEFAULT_GRID_PX;
  const distance = art.grid?.distance;
  const gridDistance =
    typeof distance === 'number' && distance > 0 ? distance : DEFAULT_GRID_DISTANCE;
  const dims = scene.dimensions ?? { sceneX: 0, sceneY: 0, sceneWidth: 0, sceneHeight: 0 };
  const cellX = (px: number): number => round2((px - dims.sceneX) / gridPx);
  const cellY = (px: number): number => round2((px - dims.sceneY) / gridPx);

  const walls: MapWall[] = [];
  for (const wall of art.walls?.contents ?? []) {
    const [x0, y0, x1, y1] = wall.c;
    if (x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined) continue;
    const c: MapWall['c'] = [cellX(x0), cellY(y0), cellX(x1), cellY(y1)];
    const open = wall.ds === DOOR_STATE_OPEN || wall.sight === SENSE_NONE;
    walls.push({
      c,
      ...(wall.door === CONST.WALL_DOOR_TYPES.DOOR ? { door: true } : {}),
      ...(open ? { open: true } : {}),
    });
  }

  const tokens: MapToken[] = [];
  let selfTokenId: string | undefined;
  for (const token of scene.tokens.contents) {
    if (!isProjectedToken(token)) continue;
    const kind = classifyToken(token, viewer);
    if (kind === 'self' && selfTokenId === undefined) selfTokenId = token.id;
    const hp = kind === 'self' || kind === 'ally' ? hpFraction(token) : undefined;
    const tokenArt = token as FoundryTokenDoc & TokenArtRead;
    const img = toArtSrc(tokenArt.texture?.src, origin);
    const sight = kind === 'self' ? sightCells(tokenArt, gridDistance) : undefined;
    tokens.push({
      id: token.id,
      name: token.name ?? '',
      kind,
      x: cellX(token.x ?? 0),
      y: cellY(token.y ?? 0),
      w: token.width !== undefined && token.width > 0 ? token.width : 1,
      h: token.height !== undefined && token.height > 0 ? token.height : 1,
      ...(hp !== undefined ? { hp } : {}),
      ...(img !== undefined ? { img } : {}),
      ...(sight !== undefined ? { sight } : {}),
    });
  }

  const visibleIds = new Set(tokens.map((t) => t.id));
  const targets = game.users.get(viewer.userId)?.targets ?? new Set<FoundryToken>();
  const targetId = [...targets].map((t) => t.id).find((id) => visibleIds.has(id));
  const background = readBackground(art, dims.sceneWidth, dims.sceneHeight, origin);
  const tiles = readTiles(art, dims.sceneX, dims.sceneY, origin);

  return {
    sceneId: scene.id,
    name: scene.name,
    cols: Math.ceil(dims.sceneWidth / gridPx),
    rows: Math.ceil(dims.sceneHeight / gridPx),
    gridPx,
    ...(background !== undefined ? { background } : {}),
    ...(tiles.length > 0 ? { tiles } : {}),
    darkness: clamp01(scene.environment?.darknessLevel ?? 0),
    walls,
    tokens,
    ...(selfTokenId !== undefined ? { selfTokenId } : {}),
    ...(targetId !== undefined ? { targetId } : {}),
  };
}
