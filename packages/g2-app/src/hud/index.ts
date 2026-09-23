/**
 * Glasses HUD entry point — the sheet HUD «Scheda da tavolo G2»
 * (docs/design/g2-sheet-ux.html).
 *
 * `startHud` builds the G2 page once (`createStartUpPageContainer`), then on every store
 * change / gesture / 1 s tick re-renders and pushes only what changed:
 * `textContainerUpgrade` (instant, flicker-free) for zone E, and the image tiles through
 * the paced, hash-skipping {@link ZoneSender}. Zones A + B + C are composed into one
 * 576 × 144 top band sent as the two top 288 × 144 tiles, zone D is the bottom-left tile
 * (the proven real-G2 grid — see `layout.ts`); the map inside the band is held to ≤ 1 fps
 * by {@link MapFrameGate}. `rebuildPageContainer` runs only when the layout mode changes
 * (sheet ⇄ full-screen S10/S11) or the menu labels change language — never during play.
 *
 * Page probe (real-G2 fact, remote d97b12e): a host that rejects the `sheet` page
 * (`createStartUpPageContainer` ≠ success / `rebuildPageContainer` ≠ true) is logged on
 * the debug channel and the HUD falls back to the full-screen 2 × 2 layout for the rest of
 * the session — the sheet is then drawn as four tiles, zone E as pixels — never a dead
 * screen.
 *
 * The HUD reads {@link AppState} and calls {@link AppActions}; the only store writes are
 * clearing a handled reaction prompt (`reaction`) and a handled GM roll request
 * (`rollRequest`), owned by the HUD per the store contract.
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md
 */

import {
  type EvenAppBridge,
  ImageRawDataUpdate,
  StartUpPageCreateResult,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';
import type { Pixmap } from '@evf/shared-render';
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
  containerId,
  type LayoutMode,
  type MenuEntry,
  TEXT,
  type TextContent,
  type TextRegion,
  TILE,
} from './layout.js';
import { ArtCache, type ArtDecoder, browserArtDecoder } from './map-art/image.js';
import { type ArtLayer, collectArt } from './map-art/layers.js';
import { screenOf } from './screen.js';
import { fullScreenOf, layoutModeFor, renderTexts, renderZones, type ViewInput } from './view.js';
import { renderFullScreen } from './zones/fullscreen.js';
import {
  browserDecoder,
  type DecodeDeps,
  type Luma,
  LumaCache,
  type LumaDecoder,
} from './zones/luma.js';
import { computeViewport, type Viewport } from './zones/map.js';
import { MapFrameGate } from './zones/map-gate.js';
import { PICTURE } from './zones/portrait.js';
import { contextTile, type SheetTile, sheetTiles, splitTiles } from './zones/tiles.js';
import { ZoneSender } from './zones/zone-sender.js';

/** UI clock period: reaction countdown, result auto-close, "min ago" labels. */
export const TICK_MS = 1000;
/** Minimum wait before retrying a page placement the host rejected. */
export const PLACE_RETRY_MS = 2000;
const SHEET_TILES: readonly SheetTile[] = ['tl', 'tr', 'bl'];
/** Foundry's default actor image: treated as "no portrait" (emblem instead). */
const PLACEHOLDER_IMAGE = /mystery-man/i;

/** Optional HUD dependencies. */
export interface HudOptions {
  /** Image decoder for portraits (default: browser decoder). */
  decoder?: LumaDecoder;
  /** Scene-art decoder for the map: background, tiles, token art (default: browser decoder). */
  artDecoder?: ArtDecoder;
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

/** Browser image APIs, or null when the WebView lacks them (→ documented fallbacks). */
function browserDeps(): DecodeDeps | null {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null;
  return {
    fetch: (url, init) => fetch(url, init),
    createImageBitmap: (b) => createImageBitmap(b),
    OffscreenCanvas,
  };
}

const unavailable = () =>
  Promise.reject(new Error('image decoding unavailable (no OffscreenCanvas)'));

function defaultDecoder(): LumaDecoder {
  const deps = browserDeps();
  return deps ? browserDecoder(deps) : unavailable;
}

function defaultArtDecoder(): ArtDecoder {
  const deps = browserDeps();
  return deps ? browserArtDecoder(deps) : unavailable;
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
  /** The host rejected the `sheet` page: the HUD runs in the `full` 2 × 2 layout. */
  let sheetRejected = false;
  /** Earliest time a rejected placement may be retried. */
  let placeRetryAt = 0;
  let placeTimer: ReturnType<typeof setTimeout> | null = null;
  let mapTimer: ReturnType<typeof setTimeout> | null = null;
  const mapGate = new MapFrameGate();
  const shown = new Map<TextRegion, TextContent>();
  let viewport: { key: string; vp: Viewport } | null = null;

  const locale = (): HudLocale => resolveLocale(store.get(), navigator.language);
  const decoder = options.decoder ?? defaultDecoder();
  const pictures = new LumaCache(decoder, () => render());
  const sceneArt = new ArtCache(options.artDecoder ?? defaultArtDecoder(), () => render());

  const sender = new ZoneSender((tile, png) => {
    const id = containerId(mode ?? 'full', tile);
    return queue.run(() =>
      bridge.updateImageRawData(
        new ImageRawDataUpdate({ containerID: id, containerName: TILE[tile].name, imageData: png }),
      ),
    );
  });

  /** Page layout for the state (the `full` fallback once the host rejected `sheet`). */
  function pageModeFor(app: AppState): LayoutMode {
    return sheetRejected ? 'full' : layoutModeFor(app);
  }

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

  /** Decoded scene art of the map, null → schematic map (loading, failed, none). */
  function mapArt(app: AppState): ArtLayer[] | null {
    return app.map ? collectArt(app.map, (req) => sceneArt.get(req)) : null;
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

  function upgrade(page: LayoutMode, region: TextRegion, content: TextContent): void {
    const spec = TEXT[region];
    shown.set(region, content);
    queue
      .run(() =>
        bridge.textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: containerId(page, region),
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
    mapGate.reset();
    const call = first
      ? queue.run(() => bridge.createStartUpPageContainer(buildStartupPage(next, texts, menu)))
      : queue.run(() => bridge.rebuildPageContainer(buildRebuildPage(next, texts, menu)));
    call.then(
      (res) => {
        creating = false;
        const ok = first ? res === StartUpPageCreateResult.success : res === true;
        if (!ok) {
          rejected(first, next, String(res));
          return;
        }
        mode = next;
        pageLocale = loc;
        for (const [r, c] of Object.entries(texts) as [TextRegion, TextContent][]) shown.set(r, c);
        render();
      },
      (err: unknown) => {
        creating = false;
        rejected(first, next, String(err));
      },
    );
  }

  /**
   * Page probe: a rejected/failed `sheet` placement switches to the `full` fallback at
   * once; a rejected `full` placement is retried after {@link PLACE_RETRY_MS}.
   */
  function rejected(first: boolean, next: LayoutMode, why: string): void {
    const call = first ? 'createStartUpPageContainer' : 'rebuildPageContainer';
    if (next === 'sheet') {
      sheetRejected = true;
      console.warn(`[hud] ${call} rejected the sheet page (${why}) — full-screen 2×2 fallback`);
      render();
      return;
    }
    console.warn(`[hud] ${call} rejected the ${next} page (${why}) — retrying`);
    placeRetryAt = Date.now() + PLACE_RETRY_MS;
    if (placeTimer === null) {
      placeTimer = setTimeout(() => {
        placeTimer = null;
        render();
      }, PLACE_RETRY_MS);
    }
  }

  /** Map frame through the ≤ 1 fps gate; re-renders when a withheld frame is due. */
  function gatedMap(fresh: Pixmap, key: string): Pixmap {
    const { pix, retryInMs } = mapGate.take(fresh, key);
    if (retryInMs > 0 && mapTimer === null) {
      mapTimer = setTimeout(() => {
        mapTimer = null;
        render();
      }, retryInMs);
    }
    return pix;
  }

  function pushImages(next: LayoutMode, v: ViewInput, loc: HudLocale): void {
    const app = v.app;
    if (layoutModeFor(app) === 'full') {
      for (const [tile, pix] of splitTiles(renderFullScreen(fullScreenOf(app), v.strings))) {
        sender.submit(tile, pix);
      }
      return;
    }
    const targetId = cursorTarget(app, ui, loc);
    const zones = renderZones(v, {
      portrait: portrait(app),
      art: mapArt(app),
      viewport: mapViewport(app),
      reach: ui.view === 'target' && ui.pending?.kind === 'weapon',
      ...(targetId === undefined ? {} : { targetId }),
    });
    zones.map = gatedMap(zones.map, `${next}|${screenOf(app)}|${app.map?.sceneId ?? ''}`);
    const tiles = sheetTiles(zones);
    for (const tile of SHEET_TILES) sender.submit(tile, tiles[tile]);
    // `full` fallback: zone E has no text containers — draw it into the fourth tile.
    if (next === 'full') sender.submit('br', contextTile(renderTexts('sheet', v)));
  }

  function render(): void {
    const app = store.get();
    const loc = locale();
    const next = pageModeFor(app);
    const v: ViewInput = { app, ui, strings: strings(loc), now: Date.now() };
    const texts = renderTexts(next, v);
    if (creating) return;
    if (mode !== next || pageLocale !== loc) {
      if (Date.now() >= placeRetryAt) placePage(next, loc, texts);
      return;
    }
    for (const [region, content] of Object.entries(texts) as [TextRegion, TextContent][]) {
      const prev = shown.get(region);
      if (prev?.content !== content.content || prev.color !== content.color)
        upgrade(next, region, content);
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
      mapGate.reset();
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
    if (placeTimer !== null) clearTimeout(placeTimer);
    if (mapTimer !== null) clearTimeout(mapTimer);
    sender.dispose();
  };
}
