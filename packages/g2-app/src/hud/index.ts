/**
 * Glasses HUD entry point — the thirds layout (docs/design/g2-thirds-layout.md).
 *
 * `startHud` builds the G2 page once (`createStartUpPageContainer`), then on every
 * store change / gesture / 1 s tick re-renders and pushes only what changed:
 * `textContainerUpgrade` (flicker-free) per text region, paced image tiles for the
 * map. `rebuildPageContainer` (flickers) runs only when the layout mode changes
 * (thirds ⇄ full-screen M09/M10 ⇄ glyph-map fallback) or the menu labels change
 * language.
 *
 * The HUD reads {@link AppState} and calls {@link AppActions}; the only store write
 * is clearing a handled reaction prompt (`reaction`, owned by the HUD per the store
 * contract).
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md
 */
import {
  type EvenAppBridge,
  ImageRawDataUpdate,
  StartUpPageCreateResult,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';
import {
  type AppActions,
  type AppState,
  type AppStore,
  resolveLocale,
} from '../state/app-store.js';
import { createBridgeQueue } from './bridge-queue.js';
import { type HudLocale, strings } from './i18n.js';
import { buildEntries, MENU_OPS } from './input/entries.js';
import { toGestureEvent } from './input/events.js';
import { type HudEffect, type HudInput, menuIdOf, reduce } from './input/state-machine.js';
import { initialUi, type UiState } from './input/ui-state.js';
import {
  buildRebuildPage,
  buildStartupPage,
  type LayoutMode,
  type MenuEntry,
  TEXT,
  type TextContent,
  type TextRegion,
} from './layout.js';
import { BackgroundLoader } from './map/background.js';
import { MapController, type MapInput } from './map/map-controller.js';
import { screenOf } from './screen.js';
import { layoutModeFor, renderTexts } from './view.js';

/** UI clock period: reaction countdown, result auto-close, "min ago" labels. */
export const TICK_MS = 1000;

function menuEntries(locale: HudLocale): MenuEntry[] {
  const s = strings(locale);
  return MENU_OPS.map((op) => ({ id: menuIdOf(op), label: s.menu[op] }));
}

/** Token under the target-picker cursor (drives the map reticle). */
function cursorTarget(app: AppState, ui: UiState, locale: HudLocale): string | undefined {
  if (ui.view !== 'target') return undefined;
  const intent = buildEntries(app, ui, strings(locale))[ui.cursor]?.intent;
  return intent?.k === 'target' && intent.tokenId ? intent.tokenId : undefined;
}

/**
 * Starts the glasses HUD.
 *
 * @param bridge - Even Hub bridge (ready).
 * @param store - App store (read; `reaction` cleared after handling).
 * @param actions - Transport actions (invoke tools, settings, reconnect).
 * @returns Dispose function: unsubscribes and stops timers (does not close the page).
 */
export function startHud(bridge: EvenAppBridge, store: AppStore, actions: AppActions): () => void {
  const queue = createBridgeQueue();
  let ui = initialUi();
  let mapFallback = false;
  /** Layout currently on the glasses; null until the start-up page succeeded. */
  let mode: LayoutMode | null = null;
  let pageLocale: HudLocale | null = null;
  let creating = false;
  const shown = new Map<TextRegion, TextContent>();

  const locale = (): HudLocale => resolveLocale(store.get(), navigator.language);

  const map = new MapController({
    send: (t) =>
      queue.run(() =>
        bridge.updateImageRawData(
          new ImageRawDataUpdate({ containerID: t.id, containerName: t.name, imageData: t.data }),
        ),
      ),
    background: new BackgroundLoader(() => render(), {
      fetch: (url, init) => fetch(url, init),
      ...(typeof createImageBitmap === 'function'
        ? { createImageBitmap: (b: Blob) => createImageBitmap(b) }
        : {}),
      ...(typeof OffscreenCanvas === 'function' ? { OffscreenCanvas } : {}),
    }),
    onFallbackChange: (glyph) => {
      mapFallback = glyph;
      render();
    },
  });

  function mapInput(app: AppState, loc: HudLocale, active: boolean): MapInput {
    const targetId = cursorTarget(app, ui, loc);
    return { map: app.map, settings: app.settings, active, ...(targetId ? { targetId } : {}) };
  }

  function upgrade(region: TextRegion, content: TextContent): void {
    const spec = TEXT[region];
    shown.set(region, content);
    queue
      .run(() =>
        bridge.textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: spec.id,
            containerName: spec.name,
            contentOffset: 0,
            contentLength: 0,
            content: content.content || ' ',
            textColor: content.color,
          }),
        ),
      )
      .then(
        (ok) => {
          if (!ok) shown.delete(region);
        },
        (err: unknown) => {
          // Forget the region so the next render retries it.
          shown.delete(region);
          console.warn(`[hud] textContainerUpgrade ${spec.name} failed`, err);
        },
      );
  }

  function placePage(
    next: LayoutMode,
    loc: HudLocale,
    texts: Partial<Record<TextRegion, TextContent>>,
  ): void {
    const menu = menuEntries(loc);
    const first = mode === null;
    creating = true;
    shown.clear();
    const call = first
      ? queue.run(() => bridge.createStartUpPageContainer(buildStartupPage(next, texts, menu)))
      : queue.run(() => bridge.rebuildPageContainer(buildRebuildPage(next, texts, menu)));
    call.then(
      (res) => {
        creating = false;
        const ok = first ? res === StartUpPageCreateResult.success : res === true;
        if (!ok) {
          console.warn(`[hud] ${first ? 'create' : 'rebuild'} page (${next}) rejected`, res);
          return;
        }
        mode = next;
        pageLocale = loc;
        for (const [r, c] of Object.entries(texts) as [TextRegion, TextContent][]) shown.set(r, c);
        map.resetImages();
        render();
      },
      (err: unknown) => {
        creating = false;
        console.warn(`[hud] ${first ? 'create' : 'rebuild'} page (${next}) failed`, err);
      },
    );
  }

  function render(): void {
    const app = store.get();
    const loc = locale();
    const next = layoutModeFor(app, mapFallback);
    const glyphMap = next === 'thirds-glyph' ? map.glyphLines(mapInput(app, loc, false)) : [];
    const texts = renderTexts(next, { app, ui, strings: strings(loc), now: Date.now(), glyphMap });
    if (creating) return;
    if (mode !== next || pageLocale !== loc) {
      placePage(next, loc, texts);
      return;
    }
    for (const [region, content] of Object.entries(texts) as [TextRegion, TextContent][]) {
      const prev = shown.get(region);
      if (prev?.content !== content.content || prev.color !== content.color)
        upgrade(region, content);
    }
    map.update(mapInput(app, loc, next === 'thirds' && screenOf(app) === 'hud'));
  }

  function run(effect: HudEffect): void {
    switch (effect.t) {
      case 'invoke':
        actions.invoke(effect.tool, effect.input).then(
          (res) =>
            dispatch(
              res.ok
                ? { t: 'invoked', ok: true }
                : { t: 'invoked', ok: false, error: res.error.message },
            ),
          (err: unknown) =>
            dispatch({
              t: 'invoked',
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
        );
        return;
      case 'exit':
        // Even Hub: double-press at root must open the system exit dialog.
        queue
          .run(() => bridge.shutDownPageContainer(1))
          .catch((err: unknown) => {
            console.warn('[hud] shutDownPageContainer failed', err);
          });
        return;
      case 'settings':
        actions.updateSettings(effect.patch);
        return;
      case 'reconnect':
        actions.reconnect();
        return;
      case 'clearReaction':
        store.update({ reaction: null });
        return;
    }
  }

  function dispatch(input: HudInput): void {
    const r = reduce(ui, input, { app: store.get(), now: Date.now(), strings: strings(locale()) });
    ui = r.ui;
    for (const e of r.effects) run(e);
    render();
  }

  const offEvents = bridge.onEvenHubEvent((ev) => {
    const g = toGestureEvent(ev);
    if (!g) return;
    if (g.t === 'foreground') {
      // The glasses may have dropped image content while we were in background.
      map.resetImages();
      render();
      return;
    }
    dispatch(g);
  });
  const offStore = store.subscribe((_state, prev) => dispatch({ t: 'state', prev }));
  const tick = setInterval(() => dispatch({ t: 'tick' }), TICK_MS);
  render();

  return () => {
    offEvents();
    offStore();
    clearInterval(tick);
    map.dispose();
  };
}
