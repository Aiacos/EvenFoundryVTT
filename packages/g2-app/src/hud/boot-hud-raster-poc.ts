/**
 * PoC boot entry — isolated raster HUD PoC boot path.
 *
 * Runs INSTEAD of `bootEngine` when the `?hud=raster` URL flag is present
 * in the no-auth dev branch. The normal text-HUD boot (`bootEngine` via
 * `boot-engine-core.ts`) is BYTE-IDENTICAL when the flag is absent.
 *
 * # Sequence (isolated — does NOT touch boot-engine-core)
 *
 * 1. `installHubPolyfill()` — idempotent backward-compat shim (same as
 *    boot-engine-core step 1).
 * 2. `await waitForEvenAppBridge()` — acquire the EvenAppBridge singleton
 *    (same as boot-engine-core step 2).
 * 3. `await createHudPocPage(bridge)` — create the 4-tile PoC page (throws
 *    on non-success; the outer try/catch absorbs and logs).
 * 4. Fetch the character snapshot via `GET /v1/character/:id` with bearer
 *    auth. When `characterId` is undefined OR the fetch/parse fails, fall
 *    back to a minimal em-dash placeholder snapshot so the PoC ALWAYS draws
 *    something (surfaces the data gap, does not silently abort — T-ksd-01
 *    mitigation: `CharacterSnapshotSchema.safeParse` gates the JSON).
 * 5. `const rgba = renderHudFrame(snapshot, {width: 576, height: 288})`.
 * 6. `const tiles = buildHudTiles(rgba)`.
 * 7. `await pushHudTiles(bridge, tiles)`.
 *
 * # LIVE RE-RENDER
 *
 * After the REST first-frame (steps 4-7), the PoC opens a WebSocket to the
 * bridge and subscribes to `character.delta` via `createWsEventBus`. Because
 * of last-value replay, the subscription fires immediately with any cached
 * on-connect delta AND on every future snapshot update. Each fired snapshot
 * re-draws all 4 tiles (naive scope — no xxhash delta diffing, see TODO below).
 *
 * The WS wiring is fail-soft: a connection or subscribe failure is logged via
 * `console.warn` and NEVER rejects boot. The REST first-frame stays on screen
 * even if the WS path fails entirely (T-m4e-03 mitigation).
 *
 * TODO(ADR-0013): ~5fps debounced RasterController loop + xxhash sub-tile delta
 * diffing (re-push only CHANGED tiles) is TODO-hud-raster #2 and is intentionally
 * NOT implemented here.
 *
 * # Normal path isolation
 *
 * The normal text-HUD boot (`bootEngine`) is BYTE-IDENTICAL when the flag is
 * absent — no new runtime code runs on that path.
 *
 * # Fail-soft
 *
 * The entire body is wrapped in try/catch → `console.error('[EVF] hud-raster-poc: …')`.
 * A render error logs rather than white-screens (INV-4 fail-soft requirement).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 §Scope — PoC)
 * @see packages/g2-app/src/internal/launch.ts (?hud=raster trigger)
 * @see packages/g2-app/src/hud/hud-poc-page.ts (createHudPocPage + pushHudTiles)
 * @see packages/g2-app/src/hud/hud-canvas-renderer.ts (renderHudFrame)
 * @see packages/g2-app/src/hud/hud-raster-frame.ts (buildHudTiles)
 * @see packages/g2-app/src/hud/hud-live-render.ts (makeSnapshotRenderHandler)
 */

import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import { toWsConnectUrl } from '../engine/ws-url.js';
import { installHubPolyfill } from '../hub-polyfill.js';
import { createWsEventBus } from '../internal/boot-engine-core.js';
import { renderHudFrame } from './hud-canvas-renderer.js';
import { makeSnapshotRenderHandler } from './hud-live-render.js';
import { createHudPocPage, pushHudTiles } from './hud-poc-page.js';
import { buildHudTiles } from './hud-raster-frame.js';

// ── Fallback snapshot (em-dash placeholders) ──────────────────────────────────

/**
 * Minimal em-dash fallback snapshot used when `characterId` is absent or the
 * fetch / parse fails. Ensures the PoC ALWAYS draws something to the screen,
 * surfacing the data gap rather than silently aborting.
 *
 * T-ksd-01 mitigation: the schema parse gates real data; this fallback is
 * only used when the gate fails, so no untrusted data reaches the renderer.
 */
const FALLBACK_SNAPSHOT: CharacterSnapshot = {
  class: '',
  initiative: 0,
  speed: 30,
  actorId: 'fallback',
  name: '—',
  hp: 0,
  maxHp: 0,
  tempHp: 0,
  ac: 0,
  level: 1,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: { slots: [], spells: [] },
  abilities: {
    str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
  },
  skills: {
    acr: { total: 0, ability: 'dex', proficient: 0, passive: 10 },
    ani: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
    arc: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    ath: { total: 0, ability: 'str', proficient: 0, passive: 10 },
    dec: { total: 0, ability: 'cha', proficient: 0, passive: 10 },
    his: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    ins: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
    itm: { total: 0, ability: 'cha', proficient: 0, passive: 10 },
    inv: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    med: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
    nat: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    prc: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
    prf: { total: 0, ability: 'cha', proficient: 0, passive: 10 },
    per: { total: 0, ability: 'cha', proficient: 0, passive: 10 },
    rel: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    slt: { total: 0, ability: 'dex', proficient: 0, passive: 10 },
    ste: { total: 0, ability: 'dex', proficient: 0, passive: 10 },
    sur: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
  },
};

// ── Options type ──────────────────────────────────────────────────────────────

/**
 * Options for the PoC boot path (mirrors `BootEngineOpts` shape — no DI fields).
 *
 * @see packages/g2-app/src/internal/boot-engine-core.ts#BootEngineOpts
 */
export interface BootHudRasterPocOpts {
  /** Bridge REST base URL (scheme http/https). */
  readonly bridgeUrl: string;
  /** Bearer token (use `'dev-no-auth'` for the no-auth dev branch). */
  readonly token: string;
  /** Boot locale (passed through for future use; not consumed by the PoC). */
  readonly locale: string;
  /**
   * Selected character actor ID from `?actor=` URL param.
   *
   * When absent, the snapshot fetch is skipped and the em-dash fallback is used.
   * This surfaces the gap (no character pinned) rather than silently aborting.
   */
  readonly characterId?: string;
}

// ── Private fetch helper ──────────────────────────────────────────────────────

/**
 * Fetch and parse the character snapshot from the bridge REST API.
 *
 * Uses `GET {bridgeUrl}/v1/character/{characterId}` with bearer auth.
 * `CharacterSnapshotSchema.safeParse` gates the JSON (T-ksd-01 mitigation).
 *
 * Returns the fallback snapshot on:
 * - `characterId` undefined (no character pinned)
 * - Network error
 * - Non-2xx response
 * - Parse failure (malformed / unexpected shape)
 *
 * T-ksd-02: no retry storm on bridge unreachable — single attempt, fail-soft.
 *
 * @param bridgeUrl Bridge REST base URL.
 * @param token     Bearer token.
 * @param characterId Actor ID, or `undefined` for the fallback path.
 * @returns Parsed `CharacterSnapshot` or the em-dash fallback.
 */
async function fetchSnapshot(
  bridgeUrl: string,
  token: string,
  characterId: string | undefined,
): Promise<CharacterSnapshot> {
  if (characterId === undefined) {
    console.warn('[EVF] hud-raster-poc: no characterId — using fallback snapshot');
    return FALLBACK_SNAPSHOT;
  }

  const base = bridgeUrl.replace(/\/+$/, '');
  const url = `${base}/v1/character/${characterId}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.warn(`[EVF] hud-raster-poc: snapshot fetch failed (${res.status}) — using fallback`);
      return FALLBACK_SNAPSHOT;
    }

    const json: unknown = await res.json();
    const parsed = CharacterSnapshotSchema.safeParse(json);

    if (!parsed.success) {
      console.warn(
        '[EVF] hud-raster-poc: snapshot parse failed (T-ksd-01) — using fallback',
        parsed.error.issues,
      );
      return FALLBACK_SNAPSHOT;
    }

    return parsed.data;
  } catch (err) {
    console.warn('[EVF] hud-raster-poc: snapshot fetch error — using fallback', err);
    return FALLBACK_SNAPSHOT;
  }
}

// ── Private WS open helper ────────────────────────────────────────────────────

/**
 * Wait for a WebSocket to reach the `OPEN` state.
 *
 * Resolves immediately if the socket is already open (`readyState === 1`).
 * Rejects if an `error` event fires before `open`.
 *
 * Mirrors `boot-engine-core#awaitWsOpen` (which is private to that module).
 * A local copy is used here so the PoC does NOT import a private symbol.
 *
 * @param ws WebSocket to await.
 * @returns Promise that resolves when the socket is open.
 */
function awaitWsOpen(ws: WebSocket): Promise<void> {
  // WebSocket.OPEN === 1 in browsers + Even Realities App WKWebView.
  if (ws.readyState === 1) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const onOpen = (): void => {
      ws.removeEventListener('open', onOpen as EventListener);
      ws.removeEventListener('error', onError as EventListener);
      resolve();
    };
    const onError = (ev: Event): void => {
      ws.removeEventListener('open', onOpen as EventListener);
      ws.removeEventListener('error', onError as EventListener);
      reject(new Error(`[EVF] hud-raster-poc: WS error before open: ${String(ev.type)}`));
    };
    ws.addEventListener('open', onOpen as EventListener);
    ws.addEventListener('error', onError as EventListener);
  });
}

// ── Public boot function ──────────────────────────────────────────────────────

/**
 * Isolated PoC boot: bridge → page → REST first-frame → live character.delta loop.
 *
 * **LIVE RE-RENDER.** After the REST first-frame, a WebSocket is opened to the
 * bridge and `createWsEventBus(ws).subscribe('character.delta', handler)` is
 * registered. Because of last-value replay, the subscription fires immediately
 * with any cached on-connect delta AND on every future snapshot update. Each
 * fired snapshot re-draws ALL 4 tiles (naive scope — no xxhash delta diffing).
 *
 * TODO(ADR-0013): ~5fps debounced loop + xxhash sub-tile delta diffing is
 * TODO-hud-raster #2 and is intentionally NOT implemented here.
 *
 * Triggered ONLY when `?hud=raster` is present in the no-auth dev branch of
 * `launchApp`. The normal text-HUD boot (`bootEngine`) is BYTE-IDENTICAL when
 * the flag is absent — no new code runs on the normal path.
 *
 * **Fail-soft:** the outer try/catch logs errors via `console.error` and the
 * function returns normally (never rejects). The WS wiring block has its own
 * inner try/catch → `console.warn` so a WS failure leaves the REST first-frame
 * on screen and never aborts boot (T-m4e-03 mitigation).
 *
 * @param opts Boot options (bridgeUrl, token, locale, optional characterId).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 §Scope)
 * @see packages/g2-app/src/internal/launch.ts (?hud=raster trigger)
 */
export async function bootHudRasterPoc(opts: BootHudRasterPocOpts): Promise<void> {
  try {
    // Step 1: Install the Phase 2 hub.* polyfill (idempotent).
    installHubPolyfill();

    // Step 2: Acquire the EvenAppBridge singleton.
    const bridge = await waitForEvenAppBridge();

    // Step 3: Create the 4-tile PoC page (throws on non-success).
    await createHudPocPage(bridge);

    // Step 4: Fetch the character snapshot (fail-soft — never throws).
    const snapshot = await fetchSnapshot(opts.bridgeUrl, opts.token, opts.characterId);

    // Step 5: Render the HUD frame onto a 576×288 canvas.
    const rgba = renderHudFrame(snapshot, { width: 576, height: 288 });

    // Step 6: Slice + dither + encode the RGBA into 4 PNG tiles.
    const tiles = buildHudTiles(rgba);

    // Step 7: Push the 4 tiles to the G2 framebuffer (fail-soft per tile).
    await pushHudTiles(bridge, tiles);

    // ── Steps 8-10: Live character.delta subscription ─────────────────────
    //
    // Fail-soft around the entire WS wiring block (T-m4e-03). A WS failure
    // MUST leave the REST first-frame on screen and NEVER reject boot.
    //
    // Note: importing createWsEventBus pulls the boot-engine-core module graph
    // into the PoC chunk; acceptable for the dev-only ?hud=raster path (it is
    // already a dev-no-auth branch). If a circular import surfaces, fall back
    // to a local inline of the 1-persistent-listener + last-value-replay
    // pattern (≤40 lines) — but PREFER the import for a single source of truth.
    try {
      // Step 8: Build the render deps for the live re-render loop.
      const renderDeps = {
        render: (s: CharacterSnapshot) => renderHudFrame(s, { width: 576, height: 288 }),
        assemble: buildHudTiles,
        push: (t: ReturnType<typeof buildHudTiles>) => pushHudTiles(bridge, t),
        onError: (err: unknown) => {
          console.warn('[EVF] hud-raster-poc: live re-render failed (last good frame kept) —', err);
        },
      };

      // Step 9: Open WS + await OPEN.
      const wsUrl = toWsConnectUrl(opts.bridgeUrl);
      const ws = new WebSocket(wsUrl);
      await awaitWsOpen(ws);

      // Step 10: Build event bus and subscribe to character.delta.
      //
      // createWsEventBus(ws) — no seqTracker / perfProbe needed for the PoC.
      // subscribe('character.delta', handler) invokes the handler synchronously
      // with any cached last value (last-value replay) AND on every future delta.
      // Each call redraws + re-pushes ALL 4 tiles (naive scope, TODO-hud-raster #1).
      //
      // TODO(ADR-0013): xxhash sub-tile delta diffing (re-push only CHANGED tiles)
      // is TODO-hud-raster #2 and is intentionally NOT implemented here.
      const bus = createWsEventBus(ws);
      bus.subscribe('character.delta', makeSnapshotRenderHandler(renderDeps));
    } catch (wsErr) {
      console.warn(
        '[EVF] hud-raster-poc: WS live-render setup failed (REST first-frame kept) —',
        wsErr,
      );
    }
  } catch (err) {
    const detail =
      err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err);
    console.error(`[EVF] hud-raster-poc: boot failed — ${detail}`);
  }
}
