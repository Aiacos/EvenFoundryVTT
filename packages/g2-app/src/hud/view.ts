/**
 * View composer: maps (app state, UI state) to the layout mode, the fitted content of
 * every text region and the pixels of every image zone. Pure — the INV-1 tests, the
 * golden fixtures and `startHud` share it.
 *
 * @see docs/design/g2-sheet-ux.html S1–S12
 */
import type { Pixmap } from '@evf/shared-render';
import { type AppState, DEFAULT_MAP_PIXEL_SIZE } from '../state/app-store.js';
import type { HudStrings } from './i18n.js';
import type { UiState } from './input/ui-state.js';
import { type LayoutMode, TEXT, type TextContent, type TextRegion, type Zone } from './layout.js';
import type { ArtLayer } from './map-art/layers.js';
import { effectivePage, isMyTurn, sheetModel } from './model.js';
import { screenOf } from './screen.js';
import { contextView, offlineView } from './text/context.js';
import { block, fit, spread } from './text/measure.js';
import type { FullScreen } from './zones/fullscreen.js';
import { renderHeader } from './zones/header.js';
import type { Luma } from './zones/luma.js';
import { renderMap, type Viewport } from './zones/map.js';
import { renderPortrait } from './zones/portrait.js';
import { renderSheet } from './zones/sheet.js';

/** Full firmware brightness. */
const BRIGHT = 4;
/** S12: frozen zones dimmed to ~45 % (design `dim`). */
const OFFLINE_DIM = 0.45;

/** Layout mode for the current state. */
export function layoutModeFor(app: AppState): LayoutMode {
  const screen = screenOf(app);
  return screen === 'unpaired' || screen === 'connecting' ? 'full' : 'sheet';
}

/** Full screen to draw in `full` mode. */
export function fullScreenOf(app: AppState): FullScreen {
  return screenOf(app) === 'connecting'
    ? { kind: 'connect', connection: app.connection }
    : { kind: 'pair', revoked: app.connection.status === 'revoked' };
}

export interface ViewInput {
  app: AppState;
  ui: UiState;
  strings: HudStrings;
  now: number;
}

/**
 * Renders every text region of `mode`.
 *
 * @returns Fitted content per region (lines ≤ region capacity, width ≤ budget).
 */
export function renderTexts(
  mode: LayoutMode,
  v: ViewInput,
): Partial<Record<TextRegion, TextContent>> {
  const bg = { content: ' ', color: BRIGHT };
  if (mode === 'full') return { bg };
  const { app, ui, strings: s, now } = v;
  const body = TEXT.ctxBody;
  const ctx =
    screenOf(app) === 'offline'
      ? offlineView(app, s, now)
      : contextView(app, ui, s, now, body.budgetPx);
  return {
    bg,
    ctxHead: { content: spread(ctx.title, ctx.right, TEXT.ctxHead.budgetPx), color: BRIGHT },
    ctxBody: { content: block(ctx.body, body.budgetPx, body.lines), color: BRIGHT },
    ctxFoot: { content: fit(ctx.hint, TEXT.ctxFoot.budgetPx), color: BRIGHT },
  };
}

/** Inputs of the image zones that live outside the store (decoded pictures, viewport). */
export interface ZoneExtras {
  /** Decoded portrait (actor image → token image), null → class emblem. */
  portrait: Luma | null;
  /** Decoded scene art layers, null → schematic map (grid dots, walls). */
  art: readonly ArtLayer[] | null;
  /** Map viewport (cells), null when there is no scene. */
  viewport: Viewport | null;
  /** Reticle override (target picker cursor). */
  targetId?: string;
  /** Reach dots around the own token (weapon target picker). */
  reach: boolean;
}

/**
 * Renders the four image zones of the sheet layout (dimmed while offline).
 *
 * @returns One pixmap per zone, sized to its container.
 */
export function renderZones(v: ViewInput, extras: ZoneExtras): Record<Zone, Pixmap> {
  const { app, ui, strings: s } = v;
  const model = sheetModel(app, s);
  const ch = app.character;
  const zones: Record<Zone, Pixmap> = {
    header: renderHeader(model, s),
    map: renderMap(
      extras.viewport ? app.map : null,
      {
        cellPx: app.settings.mapCellPx,
        viewport: extras.viewport ?? { x: 0, y: 0 },
        art: extras.art,
        pixelSize: app.settings.mapPixelSize ?? DEFAULT_MAP_PIXEL_SIZE,
        reach: extras.reach,
        ...(extras.targetId === undefined ? {} : { targetId: extras.targetId }),
      },
      s,
    ),
    sheet: renderSheet(model, effectivePage(ch, ui.sheetPage), s),
    portrait: renderPortrait(
      {
        picture: extras.portrait,
        emblem: model?.emblem ?? 'star',
        level: ch?.level ?? 1,
        hot: isMyTurn(ch, app.combat),
        down: ch !== null && ch.hp <= 0,
      },
      s,
    ),
  };
  if (screenOf(app) === 'offline') for (const p of Object.values(zones)) p.scale(OFFLINE_DIM);
  return zones;
}
