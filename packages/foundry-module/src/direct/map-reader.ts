/**
 * Map reader — builds the {@link MapSnapshot} the G2 app turns into the 192×288
 * pixelated map (docs/design/g2-thirds-layout.md §Mappa pixelata, ADR-0012 §6).
 *
 * Reads **document data only** (`scene.grid`, `scene.dimensions`, `scene.walls`,
 * `scene.tokens`) — never the PIXI canvas — so it is cheap enough to run on every
 * throttled token/wall change and works even when the GM is viewing another scene.
 *
 * Geometry is converted from canvas pixels (which include the scene padding) to grid
 * cells relative to the scene rectangle's top-left, rounded to 1/100 cell.
 *
 * Privacy: tokens flagged `hidden` are dropped, secret doors are reported as plain
 * walls, and HP fractions are only included for the viewer's own and allied tokens.
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.BaseScene.html — `grid`, `background`, `environment`
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.BaseToken.html — `x`, `y`, `width`, `height`, `disposition`, `hidden`
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.BaseWall.html — `c`, `door`
 */
import type { MapSnapshot, MapToken, MapWall, TokenKind } from '@evf/shared-protocol';

/** Who is looking at the map. */
export interface MapViewer {
  /** Actor projected on the glasses. */
  actorId: string;
  /** Human player owning the device (ally detection via actor ownership). */
  playerUserId: string;
  /** The device's "(G2)" user (its targets drive `targetId`). */
  g2UserId: string;
}

/** Fallback grid size (Foundry default) when a scene has none. */
const DEFAULT_GRID_PX = 100;

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
    token.actor?.ownership?.[viewer.playerUserId] === owner
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
 * Converts a scene background path to a same-origin relative URL, or undefined when
 * it points at another origin (the phone could not fetch it without CORS).
 */
export function toRelativeBackground(
  src: string | null | undefined,
  origin: string,
): string | undefined {
  if (typeof src !== 'string' || src === '') return undefined;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(src)) return src.replace(/^\/+/, '');
  try {
    const url = new URL(src);
    if (url.origin !== origin) return undefined;
    return `${url.pathname.replace(/^\/+/, '')}${url.search}`;
  } catch {
    // Not a parseable absolute URL → not usable as a same-origin background.
    return undefined;
  }
}

/**
 * Builds the map snapshot of the active scene for `viewer`.
 *
 * @returns the snapshot, or null when no scene is active.
 */
export function readMapSnapshot(viewer: MapViewer): MapSnapshot | null {
  const scene = game.scenes.active ?? canvas?.scene ?? null;
  if (scene === null) return null;

  const gridPx =
    scene.grid !== undefined && scene.grid.size > 0 ? scene.grid.size : DEFAULT_GRID_PX;
  const dims = scene.dimensions ?? { sceneX: 0, sceneY: 0, sceneWidth: 0, sceneHeight: 0 };
  const cellX = (px: number): number => round2((px - dims.sceneX) / gridPx);
  const cellY = (px: number): number => round2((px - dims.sceneY) / gridPx);

  const walls: MapWall[] = [];
  for (const wall of scene.walls?.contents ?? []) {
    const [x0, y0, x1, y1] = wall.c;
    if (x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined) continue;
    const c: MapWall['c'] = [cellX(x0), cellY(y0), cellX(x1), cellY(y1)];
    walls.push(wall.door === CONST.WALL_DOOR_TYPES.DOOR ? { c, door: true } : { c });
  }

  const tokens: MapToken[] = [];
  let selfTokenId: string | undefined;
  for (const token of scene.tokens.contents) {
    if (token.hidden === true) continue;
    const kind = classifyToken(token, viewer);
    if (kind === 'self' && selfTokenId === undefined) selfTokenId = token.id;
    const hp = kind === 'self' || kind === 'ally' ? hpFraction(token) : undefined;
    tokens.push({
      id: token.id,
      name: token.name ?? '',
      kind,
      x: cellX(token.x ?? 0),
      y: cellY(token.y ?? 0),
      w: token.width !== undefined && token.width > 0 ? token.width : 1,
      h: token.height !== undefined && token.height > 0 ? token.height : 1,
      ...(hp !== undefined ? { hp } : {}),
    });
  }

  const visibleIds = new Set(tokens.map((t) => t.id));
  const targets = game.users.get(viewer.g2UserId)?.targets ?? new Set<FoundryToken>();
  const targetId = [...targets].map((t) => t.id).find((id) => visibleIds.has(id));
  const background = toRelativeBackground(scene.background?.src, window.location.origin);

  return {
    sceneId: scene.id,
    name: scene.name,
    cols: Math.ceil(dims.sceneWidth / gridPx),
    rows: Math.ceil(dims.sceneHeight / gridPx),
    gridPx,
    ...(background !== undefined ? { background } : {}),
    darkness: clamp01(scene.environment?.darknessLevel ?? 0),
    walls,
    tokens,
    ...(selfTokenId !== undefined ? { selfTokenId } : {}),
    ...(targetId !== undefined ? { targetId } : {}),
  };
}
