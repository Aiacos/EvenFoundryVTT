/**
 * Glasses HUD entry point — the sheet HUD «Scheda da tavolo G2»
 * (docs/design/g2-sheet-ux.html).
 *
 * `startHud` builds the G2 page once (`createStartUpPageContainer`), then on every store
 * change / gesture / 1 s tick re-renders and pushes only what changed:
 * `textContainerUpgrade` (instant, flicker-free) for zone E, and the image zones through
 * the paced, hash-skipping {@link ZoneSender} (header > map > sheet > portrait).
 * `rebuildPageContainer` runs only when the layout mode changes (sheet ⇄ full-screen
 * S10/S11) or the menu labels change language — never during play.
 *
 * The HUD reads {@link AppState} and calls {@link AppActions}; the only store writes are
 * clearing a handled reaction prompt (`reaction`) and a handled GM roll request
 * (`rollRequest`), owned by the HUD per the store contract.
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
  IMAGE,
  type LayoutMode,
  type MenuEntry,
  TEXT,
  type TextContent,
  type TextRegion,
  ZONES,
} from './layout.js';
import { fullScreenOf, layoutModeFor, renderTexts, renderZones, type ViewInput } from './view.js';
import { renderFullScreen, splitTiles } from './zones/fullscreen.js';
import { browserDecoder, type Luma, LumaCache, type LumaDecoder } from './zones/luma.js';
import { computeViewport, type Viewport } from './zones/map.js';
import { PICTURE } from './zones/portrait.js';
import { ZoneSender } from './zones/zone-sender.js';

/** UI clock period: reaction countdown, result auto-close, "min ago" labels. */
export const TICK_MS = 1000;
/** Largest side of a decoded scene background (pixels). */
const MAX_BACKGROUND_SIDE = 2048;
/** Background pixels kept per scene cell (= the largest zoom level). */
const BACKGROUND_PX_PER_CELL = 12;
/** Foundry's default actor image: treated as "no portrait" (emblem instead). */
const PLACEHOLDER_IMAGE = /mystery-man/i;

/** Optional HUD dependencies. */
export interface HudOptions {
  /** Image decoder for portraits and scene backgrounds (default: browser decoder). */
  decoder?: LumaDecoder;
}

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

function defaultDecoder(): LumaDecoder {
  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    return browserDecoder({
      fetch: (url, init) => fetch(url, init),
      createImageBitmap: (b) => createImageBitmap(b),
      OffscreenCanvas,
    });
  }
  return () => Promise.reject(new Error('image decoding unavailable (no OffscreenCanvas)'));
}

/**
 * Starts the glasses HUD.
 *
 * @param bridge - Even Hub bridge (ready).
 * @param store - App store (read; `reaction` / `rollRequest` cleared after handling).
 * @param actions - Transport actions (invoke tools, settings, reconnect).
 * @param options - Optional dependencies (image decoder).
 * @returns Dispose function: unsubscribes and stops timers (does not close the page).
 */
export function startHud(
  bridge: EvenAppBridge,
  store: AppStore,
  actions: AppActions,
  options: HudOptions = {},
): () => void {
  const queue = createBridgeQueue();
  let ui = initialUi();
  /** Layout currently on the glasses; null until the start-up page succeeded. */
  let mode: LayoutMode | null = null;
  let pageLocale: HudLocale | null = null;
  let creating = false;
  const shown = new Map<TextRegion, TextContent>();
  let viewport: { key: string; vp: Viewport } | null = null;

  const locale = (): HudLocale => resolveLocale(store.get(), navigator.language);
  const decoder = options.decoder ?? defaultDecoder();
  const pictures = new LumaCache(decoder, () => render());

  const sender = new ZoneSender((region, png) => {
    const box = IMAGE[region];
    return queue.run(() =>
      bridge.updateImageRawData(
        new ImageRawDataUpdate({ containerID: box.id, containerName: box.name, imageData: png }),
      ),
    );
  });

  /** Portrait picture: actor image, else token image, else null (class emblem). */
  function portrait(app: AppState): Luma | null {
    const ch = app.character;
    const candidates = [ch?.portrait?.url, ch?.token?.url].filter(
      (u): u is string => u !== undefined && !PLACEHOLDER_IMAGE.test(u),
    );
    for (const url of candidates) {
      const st = pictures.get({ url, width: PICTURE.w, height: PICTURE.h, fit: 'cover' });
      if (st.state === 'ready') return st.luma;
      if (st.state === 'loading') return null;
    }
    return null;
  }

  function background(app: AppState): Luma | null {
    const map = app.map;
    if (!map?.background) return null;
    const cell = BACKGROUND_PX_PER_CELL;
    const st = pictures.get({
      url: map.background,
      width: Math.max(1, Math.min(MAX_BACKGROUND_SIDE, map.cols * cell)),
      height: Math.max(1, Math.min(MAX_BACKGROUND_SIDE, map.rows * cell)),
      fit: 'stretch',
    });
    return st.state === 'ready' ? st.luma : null;
  }

  function mapViewport(app: AppState): Viewport | null {
    const map = app.map;
    if (!map) return null;
    const { mapCellPx, followToken } = app.settings;
    const key = `${map.sceneId}|${mapCellPx}`;
    const prev = viewport?.key === key ? viewport.vp : undefined;
    const vp = computeViewport(map, mapCellPx, followToken, prev);
    viewport = { key, vp };
    return vp;
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
    sender.reset();
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
        render();
      },
      (err: unknown) => {
        creating = false;
        console.warn(`[hud] ${first ? 'create' : 'rebuild'} page (${next}) failed`, err);
      },
    );
  }

  function pushImages(next: LayoutMode, v: ViewInput, loc: HudLocale): void {
    const app = v.app;
    if (next === 'full') {
      for (const [tile, pix] of splitTiles(renderFullScreen(fullScreenOf(app), v.strings))) {
        sender.submit(tile, pix);
      }
      return;
    }
    const targetId = cursorTarget(app, ui, loc);
    const zones = renderZones(v, {
      portrait: portrait(app),
      background: background(app),
      viewport: mapViewport(app),
      reach: ui.view === 'target' && ui.pending?.kind === 'weapon',
      ...(targetId === undefined ? {} : { targetId }),
    });
    for (const zone of ZONES) sender.submit(zone, zones[zone]);
  }

  function render(): void {
    const app = store.get();
    const loc = locale();
    const next = layoutModeFor(app);
    const v: ViewInput = { app, ui, strings: strings(loc), now: Date.now() };
    const texts = renderTexts(next, v);
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
    pushImages(next, v, loc);
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
      case 'clearRequest':
        store.update({ rollRequest: null });
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
      sender.reset();
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
    sender.dispose();
  };
}
