/**
 * G2 container layout of the sheet HUD (docs/design/g2-sheet-ux.html §Architettura
 * della schermata): five design zones drawn into the proven real-G2 image grid.
 *
 * | Zone | Area (x, y, w × h) | Drawn into |
 * |---|---|---|
 * | A · portrait | 0, 0, 144 × 144 | top band → tile `tl` |
 * | B · header | 144, 0, 288 × 144 | top band → tiles `tl` + `tr` |
 * | C · map | 432, 0, 144 × 144 | top band → tile `tr` |
 * | D · sheet | 0, 144, 288 × 144 | tile `bl` |
 * | E · context | 288, 144, 288 × 144 | text × 3 (head, body, foot) |
 * | background | 0, 0, 576 × 288 | text `' '`, `isEventCapture: 1`, lowest z |
 *
 * ## Real-G2 geometry (hardware fact, remote d97b12e, 2026-07-07)
 *
 * The real host REJECTS a page whose image containers are not on the proven grid (the
 * simulator accepts any offset, so only hardware caught it): a rejected
 * `rebuildPageContainer` leaves 0 containers and the glasses stay blank. The only
 * geometries streamed live on a real G2 are 2×2 grids anchored at (0, 0); this layout
 * uses the 288 × 144 one. Image containers therefore sit ONLY at the grid origins
 * (0,0) · (288,0) · (0,144) · (288,144) with size 288 × 144 — the zones A+B+C are
 * rendered into one 576 × 144 framebuffer (the top band) and sent as the two top tiles.
 * The visual design is unchanged: the tiles are pixel crops of the same zones.
 *
 * The fourth grid slot (`br`, 288,144) is RESERVED and unused in `sheet` mode: an image
 * container there would cover zone E, because the host draws image containers above
 * text containers regardless of z-order (probe 2026-06-14, remote 0c6f515).
 *
 * ## Container ids (hardware fact, remote 054eea3d / 3327b77)
 *
 * The host uses one global id namespace per page in declaration order: image containers
 * first, then text containers. Ids here are exactly that order (images `0..n-1`, then
 * text `n..`), so they are correct whether the host honours our `containerID` or assigns
 * its own: `full` → images 0–3, text 4; `sheet` → images 0–2, text 3–6. Every
 * `textContainerUpgrade` / `updateImageRawData` passes the id ({@link containerId}).
 * Exactly one container captures events: `bg`, content `' '` (protobuf drops absent
 * optional fields → an empty capture container loses gestures on hardware).
 *
 * Budget: 3 / 4 images and 4 / 8 text containers, so play never needs
 * `rebuildPageContainer` (no flicker). Full-screen states (S10 unpaired, S11
 * connecting) — and the sheet HUD itself when the host rejects the `sheet` page — use the
 * `full` mode: the four 288 × 144 tiles plus the background capture container.
 *
 * Zone E text geometry: the firmware line is 27 px (pretext / LVGL), so 144 px hold 5
 * lines: head 1 line (title + right info), body 3 lines (framed list, ▶ cursor), foot 1
 * line (gesture hint).
 *
 * @see https://hub.evenrealities.com/docs/build/display (fetched 2026-09-23)
 */
import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  MenuContainerProperty,
  MenuItemProperty,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk';

export const SCREEN_W = 576;
export const SCREEN_H = 288;
const LINE_H = 27;

const BORDER_WIDTH = 1;
/** Border of the context body (design: frames at level 3–5). */
const BORDER_COLOR = 5;
const BORDER_RADIUS = 4;
const SAFETY_PX = 2;

export type LayoutMode = 'sheet' | 'full';

export type TextRegion = 'bg' | 'ctxHead' | 'ctxBody' | 'ctxFoot';

/** Design zones of the sheet (pixel composition only — not containers). */
export type Zone = 'header' | 'map' | 'sheet' | 'portrait';
/** Image containers: the 2 × 2 grid of 288 × 144 tiles anchored at (0, 0). */
export type Tile = 'tl' | 'tr' | 'bl' | 'br';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Box extends Rect {
  name: string;
  z: number;
}

export interface TextRegionSpec extends Box {
  framed: boolean;
  padding: number;
  /** Lines that fit without scrollbar. */
  lines: number;
  /** Pixel budget per line. */
  budgetPx: number;
}

function text(box: Box, framed: boolean, padding: number): TextRegionSpec {
  const inset = padding + (framed ? BORDER_WIDTH : 0);
  return {
    ...box,
    framed,
    padding,
    lines: Math.floor((box.h - 2 * inset) / LINE_H),
    budgetPx: box.w - 2 * inset - SAFETY_PX,
  };
}

/** Text regions (names are stable; ids come from {@link containerId}). */
export const TEXT: Readonly<Record<TextRegion, TextRegionSpec>> = {
  bg: text({ name: 'evf-bg', x: 0, y: 0, w: SCREEN_W, h: SCREEN_H, z: 0 }, false, 0),
  ctxHead: text({ name: 'ctx-head', x: 288, y: 144, w: 288, h: 29, z: 5 }, false, 1),
  ctxBody: text({ name: 'ctx-body', x: 288, y: 173, w: 288, h: 86, z: 6 }, true, 1),
  ctxFoot: text({ name: 'ctx-foot', x: 288, y: 259, w: 288, h: 29, z: 7 }, false, 1),
};

export const TILE_W = 288;
export const TILE_H = 144;

/** Image containers — only on the proven real-G2 grid (see file header). */
export const TILE: Readonly<Record<Tile, Box>> = {
  tl: { name: 'img-tl', x: 0, y: 0, w: TILE_W, h: TILE_H, z: 1 },
  tr: { name: 'img-tr', x: TILE_W, y: 0, w: TILE_W, h: TILE_H, z: 2 },
  bl: { name: 'img-bl', x: 0, y: TILE_H, w: TILE_W, h: TILE_H, z: 3 },
  br: { name: 'img-br', x: TILE_W, y: TILE_H, w: TILE_W, h: TILE_H, z: 4 },
};

/** Screen area of each design zone (A–D; zone E is text). */
export const ZONE: Readonly<Record<Zone, Rect>> = {
  portrait: { x: 0, y: 0, w: 144, h: 144 },
  header: { x: 144, y: 0, w: 288, h: 144 },
  map: { x: 432, y: 0, w: 144, h: 144 },
  sheet: { x: 0, y: 144, w: 288, h: 144 },
};

/** The design zones (render order). */
export const ZONES: readonly Zone[] = ['header', 'map', 'sheet', 'portrait'];
/** All tiles, in send priority (reading order: HP digits + AC live in `tl`). */
export const TILES: readonly Tile[] = ['tl', 'tr', 'bl', 'br'];

/** Regions present in each layout mode (declaration order = SDK payload / id order). */
export const MODE_REGIONS: Readonly<
  Record<LayoutMode, { text: readonly TextRegion[]; image: readonly Tile[] }>
> = {
  sheet: { text: ['bg', 'ctxHead', 'ctxBody', 'ctxFoot'], image: ['tl', 'tr', 'bl'] },
  full: { text: ['bg'], image: TILES },
};

/**
 * Host container id of `region` in `mode`: its index in the page declaration order
 * (images first, then text).
 *
 * @throws Error when `region` is not declared in `mode`.
 */
export function containerId(mode: LayoutMode, region: Tile | TextRegion): number {
  const { image, text: texts } = MODE_REGIONS[mode];
  const i = (image as readonly string[]).indexOf(region);
  if (i >= 0) return i;
  const t = (texts as readonly string[]).indexOf(region);
  if (t >= 0) return image.length + t;
  throw new Error(`container ${region} is not declared in the ${mode} layout`);
}

/** One contextual-menu entry (`menuObject`, ≤10 items, label ≤32 UTF-8 bytes, id ≠ 0). */
export interface MenuEntry {
  id: number;
  label: string;
}

/** Text content + brightness for one region. */
export interface TextContent {
  content: string;
  /** Brightness 0–4 (firmware range). */
  color: number;
}

type PagePayload = {
  containerTotalNum: number;
  textObject: TextContainerProperty[];
  imageObject: ImageContainerProperty[];
  menuObject: MenuContainerProperty;
};

function pagePayload(
  mode: LayoutMode,
  contents: Partial<Record<TextRegion, TextContent>>,
  menu: readonly MenuEntry[],
): PagePayload {
  const regions = MODE_REGIONS[mode];
  const textObject = regions.text.map((r) => {
    const spec = TEXT[r];
    const c = contents[r];
    return new TextContainerProperty({
      xPosition: spec.x,
      yPosition: spec.y,
      width: spec.w,
      height: spec.h,
      containerID: containerId(mode, r),
      containerName: spec.name,
      zOrderIndex: spec.z,
      isEventCapture: r === 'bg' ? 1 : 0,
      borderWidth: spec.framed ? BORDER_WIDTH : 0,
      borderColor: spec.framed ? BORDER_COLOR : 0,
      borderRadius: spec.framed ? BORDER_RADIUS : 0,
      paddingLength: spec.padding,
      // The SDK rejects empty content; a single space renders nothing. The capture
      // container is always exactly ' ' (hardware: it must never show text).
      content: r === 'bg' ? ' ' : c?.content || ' ',
      textColor: c?.color ?? 4,
    });
  });
  const imageObject = regions.image.map((r) => {
    const b = TILE[r];
    return new ImageContainerProperty({
      xPosition: b.x,
      yPosition: b.y,
      width: b.w,
      height: b.h,
      containerID: containerId(mode, r),
      containerName: b.name,
      zOrderIndex: b.z,
    });
  });
  return {
    containerTotalNum: textObject.length + imageObject.length,
    textObject,
    imageObject,
    menuObject: new MenuContainerProperty({
      menuItems: menu.map((m) => new MenuItemProperty({ itemID: m.id, itemName: m.label })),
    }),
  };
}

/** Builds the payload for the one-time `createStartUpPageContainer` call. */
export function buildStartupPage(
  mode: LayoutMode,
  contents: Partial<Record<TextRegion, TextContent>>,
  menu: readonly MenuEntry[],
): CreateStartUpPageContainer {
  return new CreateStartUpPageContainer(pagePayload(mode, contents, menu));
}

/** Builds the payload for `rebuildPageContainer` (mode / menu-label change). */
export function buildRebuildPage(
  mode: LayoutMode,
  contents: Partial<Record<TextRegion, TextContent>>,
  menu: readonly MenuEntry[],
): RebuildPageContainer {
  return new RebuildPageContainer(pagePayload(mode, contents, menu));
}
