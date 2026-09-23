/**
 * G2 container layout for the thirds HUD (docs/design/g2-thirds-layout.md §Griglia).
 *
 * Three 192 px columns: A = sheet (header + body text), B = pixel map (two stacked
 * 192×144 image containers — SDK max 288×144 each), C = context (header, body,
 * footer text). A full-screen `' '` text container sits behind everything with
 * `isEventCapture: 1` and the lowest `zOrderIndex`; every container declares a unique
 * `zOrderIndex` (mandatory once any container uses it, SDK ≥ 0.0.12).
 *
 * Modes:
 * - `thirds` — M01–M08, M11 (2 image + 6 text containers).
 * - `thirds-glyph` — map fallback after repeated image failures: column B becomes
 *   one text container (0 image + 7 text).
 * - `full` — M09 / M10 full-screen message (0 image + 2 text).
 *
 * Text geometry: padding 1 + border 1 → inset 2 px per side; line height 27 px
 * (pretext / LVGL). Each region declares the number of lines it can hold without a
 * scrollbar and the pixel budget per line (inner width − 2 px safety margin).
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
export const COLUMN_W = 192;
export const LINE_H = 27;
export const MAP_TILE_W = 192;
export const MAP_TILE_H = 144;

const PADDING = 1;
const BORDER_WIDTH = 1;
/** Border colour of every framed container (design: `borderWidth` 1, colour 6). */
const BORDER_COLOR = 6;
const INSET = PADDING + BORDER_WIDTH;
const SAFETY_PX = 2;

export type LayoutMode = 'thirds' | 'thirds-glyph' | 'full';

export type TextRegion =
  | 'bg'
  | 'aHead'
  | 'aBody'
  | 'cHead'
  | 'cBody'
  | 'cFoot'
  | 'mapGlyph'
  | 'full';

export type ImageRegion = 'mapTop' | 'mapBottom';

interface Box {
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export interface TextRegionSpec extends Box {
  /** Lines that fit without scrollbar. */
  lines: number;
  /** Pixel budget per line. */
  budgetPx: number;
  framed: boolean;
}

function text(box: Box, framed = true): TextRegionSpec {
  const inset = framed ? INSET : 0;
  return {
    ...box,
    framed,
    lines: Math.floor((box.h - 2 * inset) / LINE_H),
    budgetPx: box.w - 2 * inset - SAFETY_PX,
  };
}

/** Text regions (ids/names are stable: `textContainerUpgrade` must match them exactly). */
export const TEXT: Readonly<Record<TextRegion, TextRegionSpec>> = {
  bg: text({ id: 1, name: 'evf-bg', x: 0, y: 0, w: SCREEN_W, h: SCREEN_H, z: 0 }, false),
  aHead: text({ id: 2, name: 'a-head', x: 0, y: 0, w: COLUMN_W, h: 60, z: 1 }),
  aBody: text({ id: 3, name: 'a-body', x: 0, y: 60, w: COLUMN_W, h: 228, z: 2 }),
  cHead: text({ id: 4, name: 'c-head', x: 384, y: 0, w: COLUMN_W, h: 60, z: 3 }),
  cBody: text({ id: 5, name: 'c-body', x: 384, y: 60, w: COLUMN_W, h: 195, z: 4 }),
  cFoot: text({ id: 6, name: 'c-foot', x: 384, y: 255, w: COLUMN_W, h: 33, z: 5 }),
  mapGlyph: text({ id: 9, name: 'map-glyph', x: 192, y: 0, w: COLUMN_W, h: SCREEN_H, z: 6 }),
  full: text({ id: 10, name: 'full', x: 0, y: 0, w: SCREEN_W, h: SCREEN_H, z: 1 }),
};

/** Image regions: two stacked 192×144 tiles forming the 192×288 map. */
export const IMAGE: Readonly<Record<ImageRegion, Box>> = {
  mapTop: { id: 7, name: 'map-top', x: 192, y: 0, w: MAP_TILE_W, h: MAP_TILE_H, z: 7 },
  mapBottom: { id: 8, name: 'map-bottom', x: 192, y: 144, w: MAP_TILE_W, h: MAP_TILE_H, z: 8 },
};

/** Regions present in each layout mode (declaration order = SDK payload order). */
export const MODE_REGIONS: Readonly<
  Record<LayoutMode, { text: readonly TextRegion[]; image: readonly ImageRegion[] }>
> = {
  thirds: {
    text: ['bg', 'aHead', 'aBody', 'cHead', 'cBody', 'cFoot'],
    image: ['mapTop', 'mapBottom'],
  },
  'thirds-glyph': {
    text: ['bg', 'aHead', 'aBody', 'cHead', 'cBody', 'cFoot', 'mapGlyph'],
    image: [],
  },
  full: { text: ['bg', 'full'], image: [] },
};

/** One contextual-menu entry (`menuObject`, ≤10 items, label ≤32 UTF-8 bytes, id ≠ 0). */
export interface MenuEntry {
  id: number;
  label: string;
}

/** Text content + brightness for one region. */
export interface TextContent {
  content: string;
  /** Brightness 0–4 (firmware range); M11 dims the frozen sheet. */
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
      paddingLength: spec.framed ? PADDING : 0,
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
