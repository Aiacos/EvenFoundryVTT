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
 * # SINGLE FRAME
 *
 * This PoC renders exactly ONE frame on connect — no Web Worker loop, no live
 * `character.delta` re-render. Follow-up per ADR-0013 §Scope.
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
 */

import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import { installHubPolyfill } from '../hub-polyfill.js';
import { renderHudFrame } from './hud-canvas-renderer.js';
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

// ── Public boot function ──────────────────────────────────────────────────────

/**
 * Isolated PoC boot: bridge → page → fetch snapshot → render → push 1 frame.
 *
 * **SINGLE FRAME.** No Web Worker. No live `character.delta` re-render.
 * (Follow-up per ADR-0013 §Scope.)
 *
 * Triggered ONLY when `?hud=raster` is present in the no-auth dev branch of
 * `launchApp`. The normal text-HUD boot (`bootEngine`) is byte-identical when
 * the flag is absent.
 *
 * The entire body is wrapped in try/catch — any error is logged via
 * `console.error` and the function returns normally (fail-soft, never rejects).
 * This prevents a PoC render error from white-screening the app.
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
  } catch (err) {
    const detail =
      err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err);
    console.error(`[EVF] hud-raster-poc: boot failed — ${detail}`);
  }
}
