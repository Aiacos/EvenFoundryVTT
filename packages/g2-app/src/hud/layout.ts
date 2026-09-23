/**
 * G2 container layout of the sheet HUD (docs/design/g2-sheet-ux.html §Architettura
 * della schermata): five zones, four images, one input point.
 *
 * | Zone | Area (x, y, w × h) | Container |
 * |---|---|---|
 * | A · portrait | 0, 0, 144 × 144 | image |
 * | B · header | 144, 0, 288 × 144 | image |
 * | C · map | 432, 0, 144 × 144 | image |
 * | D · sheet | 0, 144, 288 × 144 | image |
 * | E · context | 288, 144, 288 × 144 | text × 3 (head, body, foot) |
 * | background | 0, 0, 576 × 288 | text `' '`, `isEventCapture: 1`, lowest z |
 *
 * Budget: 4 / 4 images and 4 / 8 text containers, so play never needs
 * `rebuildPageContainer` (no flicker). Full-screen states (S10 unpaired, S11
 * connecting) use the `full` mode: four 288 × 144 image tiles covering the screen plus
 * the background capture container — placed with one rebuild when entering/leaving.
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

/** Image zones of the sheet layout, in send-priority order (design: HP/turn first). */
export type Zone = 'header' | 'map' | 'sheet' | 'portrait';
/** Image tiles of the full-screen layout. */
export type Tile = 'fullTL' | 'fullTR' | 'fullBL' | 'fullBR';
export type ImageRegion = Zone | Tile;

export interface Box {
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
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

/** Text regions (ids/names are stable: `textContainerUpgrade` must match them exactly). */
export const TEXT: Readonly<Record<TextRegion, TextRegionSpec>> = {
  bg: text({ id: 1, name: 'evf-bg', x: 0, y: 0, w: SCREEN_W, h: SCREEN_H, z: 0 }, false, 0),
  ctxHead: text({ id: 2, name: 'ctx-head', x: 288, y: 144, w: 288, h: 29, z: 5 }, false, 1),
  ctxBody: text({ id: 3, name: 'ctx-body', x: 288, y: 173, w: 288, h: 86, z: 6 }, true, 1),
  ctxFoot: text({ id: 4, name: 'ctx-foot', x: 288, y: 259, w: 288, h: 29, z: 7 }, false, 1),
};

/** Image regions. Zones: 144 × 144 or 288 × 144 (SDK max 288 × 144); tiles: 288 × 144. */
export const IMAGE: Readonly<Record<ImageRegion, Box>> = {
  portrait: { id: 5, name: 'z-portrait', x: 0, y: 0, w: 144, h: 144, z: 1 },
  header: { id: 6, name: 'z-header', x: 144, y: 0, w: 288, h: 144, z: 2 },
  map: { id: 7, name: 'z-map', x: 432, y: 0, w: 144, h: 144, z: 3 },
  sheet: { id: 8, name: 'z-sheet', x: 0, y: 144, w: 288, h: 144, z: 4 },
  fullTL: { id: 9, name: 'full-tl', x: 0, y: 0, w: 288, h: 144, z: 1 },
  fullTR: { id: 10, name: 'full-tr', x: 288, y: 0, w: 288, h: 144, z: 2 },
  fullBL: { id: 11, name: 'full-bl', x: 0, y: 144, w: 288, h: 144, z: 3 },
  fullBR: { id: 12, name: 'full-br', x: 288, y: 144, w: 288, h: 144, z: 4 },
};

/** Sheet-zone send priority (header HP/turn > map > sheet > portrait). */
export const ZONES: readonly Zone[] = ['header', 'map', 'sheet', 'portrait'];
/** Full-screen tiles, reading order. */
export const TILES: readonly Tile[] = ['fullTL', 'fullTR', 'fullBL', 'fullBR'];

/** Regions present in each layout mode (declaration order = SDK payload order). */
export const MODE_REGIONS: Readonly<
  Record<LayoutMode, { text: readonly TextRegion[]; image: readonly ImageRegion[] }>
> = {
  sheet: { text: ['bg', 'ctxHead', 'ctxBody', 'ctxFoot'], image: ZONES },
  full: { text: ['bg'], image: TILES },
};

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
      containerID: spec.id,
      containerName: spec.name,
      zOrderIndex: spec.z,
      isEventCapture: r === 'bg' ? 1 : 0,
      borderWidth: spec.framed ? BORDER_WIDTH : 0,
      borderColor: spec.framed ? BORDER_COLOR : 0,
      borderRadius: spec.framed ? BORDER_RADIUS : 0,
      paddingLength: spec.padding,
      // The SDK rejects empty content; a single space renders nothing.
      content: c?.content || ' ',
      textColor: c?.color ?? 4,
    });
  });
  const imageObject = regions.image.map((r) => {
    const b = IMAGE[r];
    return new ImageContainerProperty({
      xPosition: b.x,
      yPosition: b.y,
      width: b.w,
      height: b.h,
      containerID: b.id,
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
