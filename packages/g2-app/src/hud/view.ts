/**
 * View composer: maps (app state, UI state) to the layout mode and the fitted
 * content of every text region. Pure — the INV-1 tests and `startHud` share it.
 *
 * @see docs/design/g2-thirds-layout.md M01–M11
 */
import type { AppState } from '../state/app-store.js';
import type { HudStrings } from './i18n.js';
import type { UiState } from './input/ui-state.js';
import { type LayoutMode, TEXT, type TextContent, type TextRegion } from './layout.js';
import { screenOf } from './screen.js';
import { contextView, offlineView } from './text/context.js';
import { connectingScreen, unpairedScreen } from './text/fullscreen.js';
import { block } from './text/measure.js';
import { sheetBody, sheetHeader, turnBudget } from './text/sheet.js';

/** Full brightness (firmware default). */
const BRIGHT = 4;
/** Dimmed brightness for frozen data (M11). */
const DIM = 2;

/** Layout mode for the current state (`mapFallback` = glyph map after image failures). */
export function layoutModeFor(app: AppState, mapFallback: boolean): LayoutMode {
  const screen = screenOf(app);
  if (screen === 'unpaired' || screen === 'connecting') return 'full';
  return mapFallback ? 'thirds-glyph' : 'thirds';
}

function fitted(region: TextRegion, lines: readonly string[], color = BRIGHT): TextContent {
  const spec = TEXT[region];
  return { content: block(lines, spec.budgetPx, spec.lines), color };
}

export interface ViewInput {
  app: AppState;
  ui: UiState;
  strings: HudStrings;
  now: number;
  /** Glyph-map lines for column B (only used in `thirds-glyph` mode). */
  glyphMap: readonly string[];
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
  const { app, ui, strings: s, now } = v;
  const screen = screenOf(app);
  if (mode === 'full') {
    const lines =
      screen === 'connecting'
        ? connectingScreen(app.connection, s)
        : unpairedScreen(app.connection.status === 'revoked', s);
    return { bg: { content: ' ', color: BRIGHT }, full: fitted('full', lines) };
  }
  const offline = screen === 'offline';
  const sheetColor = offline ? DIM : BRIGHT;
  const ctx = offline ? offlineView(app, s, now) : contextView(app, ui, s, now);
  const out: Partial<Record<TextRegion, TextContent>> = {
    bg: { content: ' ', color: BRIGHT },
    aHead: fitted('aHead', sheetHeader(app.character, app.combat, s), sheetColor),
    aBody: fitted('aBody', sheetBody(app.character, ui.sheetPage, s, turnBudget(app)), sheetColor),
    cHead: fitted('cHead', ctx.head),
    cBody: fitted('cBody', ctx.body),
    cFoot: fitted('cFoot', [ctx.foot]),
  };
  if (mode === 'thirds-glyph') out.mapGlyph = fitted('mapGlyph', v.glyphMap, sheetColor);
  return out;
}
