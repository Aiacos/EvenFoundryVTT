/**
 * @evf/foundry-module — EvenFoundryVTT module entry point.
 *
 * Loaded by Foundry VTT via the `esmodules` field in module.json. Registers the
 * `init` hook listener to bootstrap the settings panel. All further Wave 1+ logic
 * (pair modal, bearer registry, reader hooks) is added to this file in subsequent
 * plans as imports from their respective submodules.
 *
 * Wave 0 scope (Plan 01):
 * - Export MODULE_ID constant
 * - Register `Hooks.once("init")` → `registerSettings()`
 *
 * Wave 1 scope (Plan 02; corrected in Quick Task 260604-lg4):
 * - Register `Hooks.once("socketlib.ready")` → `registerSocketlibHandlers()`.
 *   `socketlib.ready` is socketlib's canonical registration point (the module
 *   obtains its socket via `socketlib.registerModule` and registers handlers on
 *   it). Registration is DECOUPLED from Foundry's `ready` hook so that a
 *   socketlib failure can never abort the `ready` body — the HTTP push readers
 *   (`/internal/delta`) registered there must always run (defense in depth).
 *
 * Wave 3 scope (Plan 05):
 * - `Hooks.once("ready")` also calls `registerHookSubscribers(bridgeDeltaEmitter)`
 *   — wires the 5 Foundry hooks → delta push pipeline (D-2.14).
 * - `bridgeDeltaEmitter` POSTs to bridge `/internal/delta` authenticated with
 *   `EVF_INTERNAL_SECRET` stored in Foundry module settings at pair time.
 *   Fire-and-forget: logs warning on failure but never throws (T-02-01).
 *
 * @see packages/foundry-module/module.json — `esmodules: ["dist/module.js"]`
 * @see Specs.md §3.4 (Foundry compatibility minimum 13.347, verified 14)
 * @see 02-CONTEXT.md D-2.01, D-2.12, D-2.18 (pair button, socketlib, locale)
 */

import {
  CHARACTER_DELTA_TYPE,
  FRAME_PNG_TYPE,
  R1_ACTION_ECONOMY_TYPE,
  R1_ACTION_RESULT_TYPE,
  R1_CHARACTERS_AVAILABLE_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
  SETTINGS_DISPLAY_TYPE,
  SettingsDisplayEditSchema,
} from '@evf/shared-protocol';
import { registerCanvasExtractor } from './canvas-extractor.js';
import { computePartyFraming, type FramingTokenLike, type WorldRect } from './map-framing.js';
// Plan 07-06 — bearer rotation scheduler (24h TTL + 60s grace reuse of generateBearer(refresh=true))
import { BEARER_ROTATED_TYPE, scheduleBearerRotation } from './pair/bearer-rotation.js';
// Self-service pairing (secure): GM-side ingestion of per-user pending-pair flags.
// Each user mints their own bearer bound to their authenticated identity; a GM
// client materialises it into the world-scope registry. NO new socketlib handler
// (count stays 17) — identity is authenticated by user-flag document ownership.
import { registerSelfPairIngestion } from './pair/self-pair-ingestion.js';
import { registerSocketlibHandlers } from './pair/socketlib-handlers.js';
// Quick Task 260604-eyf — bearer-registry + character-list push (push-based, no new socketlib handler).
// Emits r1.bearers.available envelopes when bearers are generated/revoked/rotated.
// Emits r1.characters.available on ready + actor lifecycle hooks (createActor/updateActor/deleteActor).
// Both registered in Hooks.once('ready') so settings + actors are loaded. Count stays 17.
import { registerBearerRegistryReader } from './readers/bearer-registry-reader.js';
import { readCharacterList, registerCharacterListReader } from './readers/character-list-reader.js';
import { getCharacterSnapshot } from './readers/character-reader.js';
// Quick Task 260517-k2g — entity-pack vocabulary push (parallel additive pipeline, NO new socketlib handler).
// Emits r1.entities.available envelopes via bridgeDeltaEmitter for non-spell Items + Actors (npc/vehicle).
// Registered alongside spell-pack so weapon/armor/monster recognition is available at init time too.
// socketlib count stays 17 (Phase 13 invariant preserved).
import { registerEntityPackReader } from './readers/entity-pack-reader.js';
import { registerHookSubscribers } from './readers/hook-subscribers.js';
// Quick Task 20260517 — spell-pack vocabulary push (push-based, no new socketlib handler).
// Emits r1.spells.available envelopes via bridgeDeltaEmitter on init + updateCompendium.
// Registered in Hooks.once('init') so the vocabulary is available at the earliest point.
// socketlib count stays 17 (Phase 13 invariant preserved).
import { registerSpellPackReader } from './readers/spell-pack-reader.js';
import {
  applyDisplaySettings,
  buildDisplaySettingsSnapshot,
  getBrightness,
  getCaptureIntervalMs,
  getDither,
  getMapAutoFrame,
  getNormalize,
  getWebpQuality,
  registerSettings,
} from './settings.js';
// Phase 8 write channel — GM-side poller for the reverse channel. Polls the bridge
// for g2-app tool.invoke writes, runs them through the authoritative write path
// (dispatchToolAuthorized — ADR-0014), and POSTs the result back. GM-gated; NO new
// socketlib handler (count stays 17).
import { registerToolInvocationPoller } from './write-path/tool-invocation-poller.js';
// Plan 07-02 — side-effect import: registers all 4 Wave 1 ToolHandlers into TOOL_REGISTRY
// before the Hooks.once('ready') fires. This ensures dispatchTool can route to real handlers
// when the socketlib handlers are invoked.
// ADR-0011: single-workflow-origin discipline — all write mutations go through dispatchTool.
import './write-path/handlers/index.js';
// Plan 07-05 — register the dnd5e.preUseActivity reaction watcher (REACT-01).
// Emits r1.reaction.available envelopes via bridgeDeltaEmitter when an NPC uses
// an action that can trigger a player character reaction (shield, counterspell).
// Display-only in Phase 7; handler NEVER returns false (must not cancel NPC action).
import { registerActionResultWatcher } from './write-path/action-result-watcher.js';
// Plan 09-01 — combat action tracker (COMB-02 Wave 0 telemetry).
// Subscribes to createChatMessage + updateCombat; derives per-combatant
// action/bonus/reaction counters from flags.evf.audit entries; emits
// r1.action.economy envelopes via bridgeDeltaEmitter on each state change.
// NO new socketlib handler — count stays 14 (14-socketlib-handler invariant / ADR-0011).
import { registerCombatActionTracker } from './write-path/combat-action-tracker.js';
// Plan 08-04 — combat movement tracker (ACT-01 move variant).
// Subscribes to updateToken + updateCombat; accumulates per-turn movement and emits
// r1.movement.budget envelopes via bridgeDeltaEmitter.
// NO new socketlib handler — count stays 14 (Phase 7 invariant).
import { registerMovementTracker } from './write-path/combat-movement-tracker.js';
// Plan 09-03 — inject the concentration conflict emitter so castSpellHandler can
// emit conc.conflict envelopes via bridgeDeltaEmitter when concentration is blocked.
// NO new socketlib handler registered — count stays 14 (ADR-0011 invariant).
import { setConcConflictEmitter } from './write-path/handlers/cast-spell.js';
// Plan 07-04 — inject the multi-attack progress emitter so weaponAttackHandler can
// emit r1.multiattack.progress envelopes via bridgeDeltaEmitter on each iteration.
// NO new socketlib handler registered — emitter count stays 14.
import { setMultiAttackProgressEmitter } from './write-path/handlers/weapon-attack.js';
import { registerReactionWatcher } from './write-path/reaction-watcher.js';

/**
 * Canonical Foundry module identifier.
 * Used as the first argument to `game.settings.register*` calls throughout
 * the module. Must match the `id` field in module.json exactly.
 */
export const MODULE_ID = 'evenfoundryvtt' as const;

/**
 * Module-level bearer registry re-emit handle.
 *
 * Populated once the `ready` hook fires (via `registerBearerRegistryReader`).
 * Null before ready — callers guard with optional chaining.
 *
 * Quick Task 260604-eyf: `reEmit()` is called by the `scheduleBearerRotation`
 * callback to push a fresh bearer snapshot after rotation, so the bridge cache
 * stays current without a new socketlib handler. The handle is available to
 * future PairModal generate/revoke paths as well.
 */
let bearerRegistryHandle:
  | import('./readers/bearer-registry-reader.js').BearerRegistryReaderHandle
  | null = null;

/**
 * Teardown for the Phase 8 tool-invocation poller (clearInterval). Retained at module
 * scope so a re-fired `ready` hook stops the prior interval before starting a new one,
 * and so the page lifecycle can stop it. Null until the first `ready`.
 */
let _toolInvocationPollerTeardown: (() => void) | null = null;

/**
 * Resolves the internal secret used to authenticate POSTs to /internal/delta.
 *
 * Precedence (Quick Task 260604-hs5):
 * 1. The DM-visible `bridgeInternalSecret` world setting, when it is a non-empty
 *    string. This is the bridge deployment's static `EVF_INTERNAL_SECRET`, the
 *    only value that can match the bridge's auth check for a real Forge world.
 * 2. Otherwise, the first active (non-revoked, non-expired) bearer-registry
 *    entry's `internalSecret` (legacy per-pair value, kept for backward compat).
 * 3. Otherwise null.
 *
 * The secret value is NEVER logged.
 */
function getInternalSecret(): string | null {
  // 260604-hs5: settings-preferred. Treat the setting value as unknown; only a
  // non-empty string wins, so existing tests that return a registry object for
  // every key fall through to the bearer scan below.
  const fromSetting: unknown = game.settings.get(MODULE_ID, 'bridgeInternalSecret');
  if (typeof fromSetting === 'string' && fromSetting !== '') {
    return fromSetting;
  }

  const stored = game.settings.get(MODULE_ID, 'bearerRegistry') as
    | {
        entries: Record<
          string,
          { internalSecret: string; revokedAt: number | null; expiresAt: number }
        >;
      }
    | undefined;

  if (stored === undefined || stored === null) {
    return null;
  }

  const now = Date.now();
  // Use the first active (non-revoked, non-expired) entry's internal secret
  for (const entry of Object.values(stored.entries)) {
    if (entry.revokedAt === null && entry.expiresAt > now) {
      return entry.internalSecret;
    }
  }

  return null;
}

/**
 * Resolves the bridge URL for outbound delta POSTs.
 *
 * Precedence (Quick Task 260604-hs5):
 * 1. The DM-visible `bridgeUrl` world setting, when it is a non-empty string.
 *    This points the world at the actual bridge deployment.
 * 2. Otherwise, the first active (non-revoked, non-expired) bearer-registry
 *    entry's `bridgeUrl` (legacy per-pair value, kept for backward compat).
 * 3. Otherwise null.
 */
function getBridgeUrl(): string | null {
  // 260604-hs5: settings-preferred. Only a non-empty string wins; a registry
  // object (returned by existing tests for every key) falls through.
  const fromSetting: unknown = game.settings.get(MODULE_ID, 'bridgeUrl');
  if (typeof fromSetting === 'string' && fromSetting !== '') {
    return fromSetting;
  }

  const stored = game.settings.get(MODULE_ID, 'bearerRegistry') as
    | {
        entries: Record<string, { bridgeUrl: string; revokedAt: number | null; expiresAt: number }>;
      }
    | undefined;

  if (stored === undefined || stored === null) {
    return null;
  }

  const now = Date.now();
  for (const entry of Object.values(stored.entries)) {
    if (entry.revokedAt === null && entry.expiresAt > now) {
      return entry.bridgeUrl;
    }
  }

  return null;
}

/**
 * Per-POST timeout — a hung bridge connection must release its slot instead
 * of accumulating in the browser's connection pool (latency audit 2026-06-11).
 */
const DELTA_POST_TIMEOUT_MS = 5_000;

/**
 * Max concurrent in-flight frame POSTs (bounded pipeline depth).
 *
 * Perf audit 2026-06-16 (15 fps stretch): the previous single-flight queue
 * capped upstream throughput at `1000 / (RTT + upload)` fps — on a remote
 * Foundry host (e.g. The Forge, ~100 ms RTT) that is ~9-10 fps regardless of
 * `captureFps`, the measured real-chain ceiling. Allowing TWO concurrent POSTs
 * lets the second overlap the first's round-trip (HTTP/2 multiplexes them on
 * one connection), ~2× the WAN frame rate. It stays BOUNDED (max one extra
 * in-flight) so it does not regress to the old unbounded fire-and-forget that
 * accumulated stale frames. Frames are full-snapshot + latest-wins, so a rare
 * completion-order swap shows a ≤1-cycle-old frame that the next frame corrects
 * — invisible at ≥15 fps. On LAN (RTT ≈ upload time) the POST finishes before
 * the next capture, so depth-2 is a no-op (no downside).
 */
const MAX_INFLIGHT_FRAME_POSTS = 2;

/** Number of frame POSTs currently in flight (bounded by {@link MAX_INFLIGHT_FRAME_POSTS}). */
let _inflightFramePosts = 0;

/** Latest frame delta queued behind the in-flight POST (latest-wins). */
let _pendingFramePost: { readonly type: string; readonly payload: unknown } | null = null;

/**
 * Actor id the glasses currently have selected (the map-framing focus), learned
 * from the `focusActorId` the bridge piggybacks on each frame-POST response
 * (see {@link runFramePost}). `null` until the first response arrives — framing
 * then uses the party centroid with no focus bias.
 */
let _focusActorId: string | null = null;

/** Delta types carrying full map frames — large + ephemeral, so latest-wins applies. */
const FRAME_DELTA_TYPES: ReadonlySet<string> = new Set(['frame_png', 'frame_pixels']);

/**
 * Forced stream-leader (ADR-0015 §C P2c): true when THIS client was launched by
 * the bridge's headless player-view orchestrator with `?evfLeader=1` in the URL.
 * A forced leader ALWAYS wins {@link isStreamLeader} (so it captures even while a
 * GM is connected) and tags its frame POSTs with the `X-EVF-Forced-Leader` header
 * so the bridge broadcasts ITS frames and drops the GM's while it streams.
 * Read once at module load; guarded for the (window-less) test environment.
 */
const _forcedLeader: boolean = (() => {
  try {
    if (typeof window === 'undefined') {
      return false;
    }
    const w = window as unknown as {
      __evfForcedLeader?: boolean;
      location?: { search?: string };
    };
    // Primary: a `window.__evfForcedLeader` flag injected by the orchestrator's
    // Playwright addInitScript — it survives The Forge redirect to `/game` that
    // STRIPS the URL query (verified 2026-06-17). The `?evfLeader=1` URL param is
    // kept only as a fallback for non-Forge / direct-launch hosts.
    if (w.__evfForcedLeader === true) {
      return true;
    }
    return /[?&]evfLeader=1(?:&|$)/.test(w.location?.search ?? '');
  } catch {
    return false;
  }
})();

/**
 * One POST to bridge /internal/delta with timeout; never throws (T-02-01).
 *
 * Returns the parsed JSON response body (or null on any failure). The frame
 * path reads `pendingSettings` off it for the upstream display-settings sync;
 * other callers ignore the return.
 */
async function postDelta(
  bridgeUrl: string,
  internalSecret: string,
  type: string,
  payload: unknown,
): Promise<{ pendingSettings?: unknown; focusActorId?: unknown } | null> {
  try {
    const res = await fetch(`${bridgeUrl}/internal/delta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalSecret}`,
        // Forced-leader tag (ADR-0015 §C P2c): the bridge prefers these frames and
        // drops the GM's while a headless player-view session streams.
        ...(_forcedLeader ? { 'X-EVF-Forced-Leader': '1' } : {}),
      },
      body: JSON.stringify({ type, payload }),
      signal: AbortSignal.timeout(DELTA_POST_TIMEOUT_MS),
    });
    return (await res.json()) as { pendingSettings?: unknown; focusActorId?: unknown };
  } catch (err) {
    // Warning only — bridge unavailability must not crash Foundry session
    // console.warn allowed per biome.jsonc noConsole allow:[error,warn]
    console.warn('[EVF] bridgeDeltaEmitter failed:', (err as Error).message ?? err);
    return null;
  }
}

/**
 * Run one frame POST; apply any glasses-originated settings the bridge
 * piggybacked on the response, then drain the latest queued frame delta.
 *
 * The frame POST is the upstream carrier for the display-settings sync: only
 * the stream-leader emits frames, so applying `pendingSettings` here writes the
 * leader's own Foundry settings (whose frames everyone sees). `game.settings.set`
 * re-fires `onChange` → re-pushes the downstream snapshot, confirming the change.
 */
function runFramePost(
  bridgeUrl: string,
  internalSecret: string,
  type: string,
  payload: unknown,
): void {
  _inflightFramePosts++;
  void postDelta(bridgeUrl, internalSecret, type, payload)
    .then((res) => {
      // Learn the glasses-selected focus actor (map-framing center bias). The
      // bridge piggybacks it on the frame response; an empty/absent value
      // clears the bias back to the party centroid.
      const focus = res?.focusActorId;
      _focusActorId = typeof focus === 'string' && focus.length > 0 ? focus : null;
      const pending = res?.pendingSettings;
      if (pending !== undefined && pending !== null) {
        // Upstream apply path: the drained pending edit must carry ≥1 key (an
        // empty edit is a no-op the bridge already filters; reject it here too
        // so a malformed/empty pendingSettings never drives a live settings.set).
        const edit = SettingsDisplayEditSchema.safeParse(pending);
        if (edit.success) {
          void applyDisplaySettings(edit.data);
        }
      }
    })
    // A thrown callback (e.g. a malformed pendingSettings getter) or a rejected
    // postDelta must NOT wedge the bounded pipeline: log and recover.
    // Consistent with the file's "never throw" discipline (T-02-01).
    .catch((err) => {
      console.warn('[EVF] runFramePost callback failed:', (err as Error).message ?? err);
    })
    // ALWAYS clear the busy flag and drain exactly one queued frame, regardless
    // of success, network rejection, or a thrown success callback — otherwise a
    // single throw would silently drop every subsequent frame forever.
    .finally(() => {
      _inflightFramePosts--;
      const next = _pendingFramePost;
      if (next !== null && _inflightFramePosts < MAX_INFLIGHT_FRAME_POSTS) {
        _pendingFramePost = null;
        runFramePost(bridgeUrl, internalSecret, next.type, next.payload);
      }
    });
}

/**
 * Fire-and-forget delta emitter — posts to bridge /internal/delta.
 *
 * Logs a warning on failure but NEVER throws (T-02-01).
 * A failed network call must not interrupt the Foundry session.
 *
 * Frame deltas ({@link FRAME_DELTA_TYPES}) go through a BOUNDED-pipeline
 * latest-wins queue: up to {@link MAX_INFLIGHT_FRAME_POSTS} frame POSTs may be
 * in flight at once (WAN throughput, perf audit 2026-06-16); a frame arriving
 * while the pipeline is full replaces any queued frame instead of opening more
 * connections. Rationale (latency audit 2026-06-11 → 2026-06-16): the old
 * unbounded fire-and-forget accumulated in-flight requests without limit; the
 * single-flight fix capped WAN throughput at 1000/RTT fps; the bounded depth-2
 * pipeline keeps the no-unbounded-accumulation guarantee while ~2×-ing the WAN
 * frame rate. Small stateful deltas (character/combat/…) are NOT queued: they
 * all must arrive, so each posts independently (with the same timeout).
 *
 * Exported for direct unit testing of the latest-wins queue (@internal —
 * production callers are all within this module).
 *
 * @param type    - Delta type discriminant (e.g. "character.delta")
 * @param payload - Delta payload (typed by caller; serialised as JSON)
 */
export function bridgeDeltaEmitter(type: string, payload: unknown): void {
  const internalSecret = getInternalSecret();
  const bridgeUrl = getBridgeUrl();

  if (internalSecret === null || bridgeUrl === null) {
    // No active pair — delta silently dropped (not a warning; normal before pairing)
    return;
  }

  if (FRAME_DELTA_TYPES.has(type)) {
    // Bounded pipeline: up to MAX_INFLIGHT_FRAME_POSTS concurrent POSTs (WAN
    // throughput); beyond that, the newest frame replaces any queued one
    // (latest-wins) and drains when a slot frees. See MAX_INFLIGHT_FRAME_POSTS.
    if (_inflightFramePosts >= MAX_INFLIGHT_FRAME_POSTS) {
      _pendingFramePost = { type, payload };
      return;
    }
    runFramePost(bridgeUrl, internalSecret, type, payload);
    return;
  }

  // Non-frame deltas: fire-and-forget (every one must reach the bridge).
  void postDelta(bridgeUrl, internalSecret, type, payload);
}

/**
 * Push the full display-settings snapshot DOWNSTREAM (latency audit 2026-06-14).
 *
 * Gated on {@link isStreamLeader} so exactly ONE client publishes the canonical
 * snapshot — the same client whose frames everyone sees. (Client-scope settings
 * like dither/brightness differ per client, so the leader's values are the
 * authoritative ones to mirror on the glasses.) Called on `ready` and from each
 * display setting's `onChange`, so the bridge cache + every connected glasses
 * menu stay in sync with Foundry. Fail-open via isStreamLeader on read errors.
 */
function emitDisplaySettings(): void {
  // Safety: no-op when the Foundry client is gone (the heartbeat firing during a
  // page teardown / test global-unstub) — `buildDisplaySettingsSnapshot` reads
  // `game.settings` and would otherwise throw an unhandled rejection from the
  // interval callback.
  if (typeof game === 'undefined' || game === null) {
    return;
  }
  // Doubled fail-open, intentional: isStreamLeader already catches its own read
  // errors and returns true (a duplicate publish beats a never-published
  // snapshot). This outer try/catch is belt-and-braces — if a future change to
  // isStreamLeader ever lets a throw escape, we still publish rather than go
  // silent. The only way the catch suppresses the early-return is on a throw,
  // and a throw means "could not determine non-leadership" → publish anyway.
  try {
    if (!isStreamLeader()) {
      return;
    }
  } catch {
    // Fall through to publish (see above).
  }
  bridgeDeltaEmitter(SETTINGS_DISPLAY_TYPE, buildDisplaySettingsSnapshot());
}

/**
 * Heartbeat interval for re-publishing the display-settings snapshot.
 *
 * The on-`ready`/on-change pushes warm the bridge cache, but if the BRIDGE
 * (re)starts AFTER this client's `ready`, the cache predates the last push and a
 * glasses session connecting to that long-running bridge gets no settings. A
 * low-frequency re-publish keeps the cache warm so `server.ts`'s on-connect
 * serve always has a snapshot to send (closes the #32 sync-warmth gap). The
 * publish is gated on `isStreamLeader` (so only the capture leader emits), the
 * snapshot is tiny, and the g2-app re-applies it idempotently. 10 s bounds the
 * post-bridge-restart staleness window without meaningful overhead.
 */
const SETTINGS_HEARTBEAT_MS = 10_000;

// Bootstrap: register settings + spell-pack vocabulary reader when Foundry's init hook fires.
// `init` is the earliest safe point to call game.settings.registerMenu.
// The spell-pack reader is registered here (not in 'ready') so the vocabulary push reaches
// the bridge cache before any MCP tool call could need it.
// NO new socketlib handler — count stays 17 (Phase 13 invariant).
Hooks.once('init', () => {
  // onDisplaySettingChange: push a fresh settings.display snapshot downstream
  // whenever a DM/player changes a display setting in Foundry (latency audit
  // 2026-06-14) so the glasses menu reflects it live.
  registerSettings({ onDisplaySettingChange: emitDisplaySettings });
  // Quick Task 20260517: emit initial spell vocabulary + subscribe to updateCompendium.
  // Wired to bridgeDeltaEmitter so envelopes reach the bridge cache via /internal/delta.
  registerSpellPackReader((type, payload) => bridgeDeltaEmitter(type, payload));
  // Quick Task 260517-k2g: emit initial entity vocabulary (non-spell Items + Actors)
  // via the same bridgeDeltaEmitter channel. Parallel additive pipeline; NO refactor
  // of registerSpellPackReader above. Bridge multiplexes both r1.spells.available and
  // r1.entities.available envelopes in its /internal/delta onDelta callback.
  registerEntityPackReader((type, payload) => bridgeDeltaEmitter(type, payload));
});

// Register socketlib GM-side handlers on socketlib's canonical 'socketlib.ready' hook
// (Quick Task 260604-lg4). The module obtains its socket via socketlib.registerModule
// and registers handlers on it (real farling42/foundryvtt-socketlib API). This is
// DECOUPLED from Foundry's 'ready' hook below so a socketlib failure can never abort
// the push-reader registration that real /internal/delta pairing depends on.
// All bridge→Foundry bearer registry writes go through socketlib handlers (D-2.12).
Hooks.once('socketlib.ready', () => {
  registerSocketlibHandlers();
});

// Register hook subscribers + HTTP push readers on Foundry's "ready" hook.
// These are socketlib-INDEPENDENT: this hook body contains NO direct socketlib
// call (Quick Task 260604-lg4 defense in depth), so even if socketlib is absent
// or broken the push readers (bearer-registry + character-list) STILL register
// and emit /internal/delta — the path real pairing depends on.
// Hook subscribers (Plan 05) push deltas to bridge via bridgeDeltaEmitter (D-2.14).
Hooks.once('ready', () => {
  registerHookSubscribers(bridgeDeltaEmitter);
  // Plan 07-04 — wire multi-attack progress emitter via bridgeDeltaEmitter.
  // Called AFTER registerHookSubscribers (matching pattern from plan spec).
  // No new socketlib handler; emitter uses the existing bridgeDeltaEmitter channel.
  setMultiAttackProgressEmitter((payload) =>
    bridgeDeltaEmitter('r1.multiattack.progress', payload),
  );
  // Plan 07-05 — register the reaction watcher (REACT-01).
  // Must be called AFTER registerHookSubscribers + setMultiAttackProgressEmitter
  // to stay consistent with the module.ts ready-hook assembly order.
  registerReactionWatcher((payload) => bridgeDeltaEmitter('r1.reaction.available', payload));
  // Plan 07-06 — bearer rotation scheduler (24h TTL + 60s grace, reusing generateBearer(refresh=true)).
  // Called AFTER registerReactionWatcher per the ready-hook assembly order.
  // No new socketlib handler registered — count stays at 14.
  // Quick Task 260604-eyf: after rotation, also push a fresh bearer registry snapshot so the bridge
  // cache stays current. bearerRegistryEmit is populated later in this same ready handler — the
  // callback is only invoked asynchronously (after the TTL), so it sees the populated closure.
  scheduleBearerRotation({
    emit: (payload) => {
      bridgeDeltaEmitter(BEARER_ROTATED_TYPE, payload);
      // Quick Task 260604-eyf: re-push the bearer registry after rotation so the bridge
      // cache reflects the new (rotated) token. bearerRegistryHandle.reEmit() is set
      // below in this same ready handler — the rotation callback fires ≥24h later, so
      // bearerRegistryHandle is guaranteed populated.
      bearerRegistryHandle?.reEmit();
    },
  });
  // Plan 08-01 — register the action-result watcher (ACT-01 telemetry).
  // Listens on createChatMessage; filters for flags.evf.audit.idempotencyKey;
  // emits r1.action.result envelopes via bridgeDeltaEmitter for typed toast rendering.
  // NO new socketlib handler — count stays 14 (Phase 7 invariant).
  registerActionResultWatcher((payload) => bridgeDeltaEmitter(R1_ACTION_RESULT_TYPE, payload));
  // Plan 08-04 — register the movement tracker (ACT-01 move variant).
  // Subscribes to updateToken + updateCombat; emits r1.movement.budget on accumulation/reset.
  // Called AFTER registerActionResultWatcher per the ready-hook assembly order.
  // NO new socketlib handler — count stays 14 (Phase 7 invariant).
  registerMovementTracker((payload) => bridgeDeltaEmitter(R1_MOVEMENT_BUDGET_TYPE, payload));
  // Plan 09-01 — register the combat action tracker (COMB-02 Wave 0 telemetry).
  // Listens on createChatMessage (flags.evf.audit toolId filter) + updateCombat
  // (turn/round reset); emits r1.action.economy envelopes via bridgeDeltaEmitter.
  // Called AFTER registerMovementTracker per the ready-hook assembly order.
  // NO new socketlib handler — count stays 14 (ADR-0011 invariant).
  registerCombatActionTracker((payload) => bridgeDeltaEmitter(R1_ACTION_ECONOMY_TYPE, payload));
  // Plan 09-03 — wire the concentration conflict emitter into castSpellHandler.
  // Called AFTER registerCombatActionTracker per the ready-hook assembly order.
  // NO new socketlib handler — count stays 14 (ADR-0011 invariant).
  setConcConflictEmitter((type, payload) => bridgeDeltaEmitter(type, payload));
  // Quick Task 260604-eyf — bearer-registry + character-list push readers.
  // Registered in ready hook so both Foundry settings (world scope) and game.actors are loaded.
  // registerBearerRegistryReader: pushes non-revoked, non-expired bearer registry snapshot.
  // registerCharacterListReader: pushes player-character roster on ready + actor lifecycle hooks.
  // NO new socketlib handler registered for either — count stays 17 (Phase 13 invariant).
  //
  // Quick Task 260604-eyf: register bearer-registry reader, store the handle for
  // rotation re-emit. bearerRegistryHandle.reEmit() is called by scheduleBearerRotation
  // above (the rotation fires ≥24h later, so the handle is always populated).
  bearerRegistryHandle = registerBearerRegistryReader((type, payload) =>
    bridgeDeltaEmitter(type, payload),
  );
  // Re-emit the bearer registry to the bridge whenever the world-scope `bearerRegistry`
  // setting CHANGES — from any cause, on the client that wrote it: a GM generating a
  // device pairing (PairModal direct path), a GM ingesting a player's pending pair, a
  // revoke, or a TTL rotation. This is the single, uniform warm-up trigger: the bridge
  // cache reflects the live registry within one round-trip instead of waiting up to a
  // full heartbeat (≈10 s) — which is what made a freshly-generated token appear "dead"
  // (boundUserId null → tool.invoke foundry_timeout) until the next heartbeat. The
  // emit is idempotent at the bridge, so it composes harmlessly with the existing
  // self-pair / rotation re-emits.
  Hooks.on('updateSetting', (...args: unknown[]) => {
    const setting = args[0] as { key?: string } | null;
    if (setting?.key === `${MODULE_ID}.bearerRegistry`) {
      bearerRegistryHandle?.reEmit();
    }
  });
  // Self-service pairing (secure): ingest per-user `pendingPair` flags GM-side and
  // re-emit the registry to the bridge so a player-minted (or GM-minted) bearer
  // validates the moment a GM is online. Registered AFTER the registry reader so
  // `bearerRegistryHandle` exists for the re-emit callback. NO new socketlib handler
  // (count stays 17); identity is authenticated by user-flag document ownership.
  registerSelfPairIngestion(() => bearerRegistryHandle?.reEmit());
  // Phase 8 write channel: start the GM-side tool-invocation poller. It reads
  // bridgeUrl + internalSecret exactly as bridgeDeltaEmitter does (injected getters)
  // and is GM-gated internally (non-GM clients no-op). The teardown is retained for
  // the page lifecycle; Foundry reload tears down the whole client.
  _toolInvocationPollerTeardown?.();
  _toolInvocationPollerTeardown = registerToolInvocationPoller({
    getBridgeUrl,
    getInternalSecret,
  });
  registerCharacterListReader((type, payload) => bridgeDeltaEmitter(type, payload));
  // Player-view streaming consent (ADR-0015 §C): if THIS client enabled the
  // opt-in (client-scope setting), re-assert it as a User flag (world data) so the
  // stream leader's roster reader can read the consent across clients. We only
  // SET (never clear) here so loading a different browser without the setting does
  // not silently revoke an existing opt-in. Best-effort; never throws.
  try {
    if (game.settings.get(MODULE_ID, 'streamConsent') === true) {
      void game.user.setFlag(MODULE_ID, 'streamConsent', true).catch(() => {
        // flag write best-effort — a failure must not affect ready
      });
    }
  } catch {
    // settings/flag access defensive guard — never block ready
  }
  // Quick Task 260611-e71 (v0.1.15) — raster pipeline data-source ingress.
  // Emits ONLY `frame_png` envelopes (greyscale lossless PNG ~1-5 KB via upng-js).
  // The bridge wraps the payload in `EnvelopeSchema` server-side with type='frame_png'.
  // No new auth surface (T-4a-06-04 carry-forward).
  //
  // getNormalize: mapContrastNormalize client setting — evaluated per-capture so
  //   live toggle applies without re-registering (Quick Task 260610-evs carry-forward).
  // getCaptureIntervalMs: `captureFps` world setting converted to ms (1000/fps) —
  //   evaluated before every capture-loop wait so the DM can change the rate
  //   (1–60 fps) without module reload and with no scheduler cap (FRAME-PNG-02).
  // SINGLE-SOURCE election: module code runs on EVERY connected Foundry client —
  // without a gate a DM + a player with the world open would BOTH stream their
  // own viewport (alternating views, double bandwidth). The extractor registers
  // on every client but `isEnabled` (evaluated live per capture) elects exactly
  // ONE source: the GM when connected (canonical view), otherwise the active
  // user with the lowest id (deterministic on every client — no coordination
  // needed). Fail-open: any election error streams rather than blanking the map.
  registerCanvasExtractor({
    emit: (payload) => bridgeDeltaEmitter(FRAME_PNG_TYPE, payload),
    isEnabled: () => isStreamLeader(),
    // Map auto-framing (party-fit, focus-weighted). Evaluated live per capture
    // so the frame follows token movement / a changed focus actor. Returns null
    // when disabled or unframable → the extractor captures the live viewport.
    getFraming: () => buildMapFraming(),
    // mapContrastNormalize client setting — evaluated per capture (live toggle).
    getNormalize: (): 'off' | 'auto' => (getNormalize() ? 'auto' : 'off'),
    // mapDither client setting — Bayer 4×4 during the 16-level quantize.
    // Evaluated per capture so the toggle applies live (like getNormalize).
    getDither: () => getDither(),
    getCaptureIntervalMs: () => getCaptureIntervalMs(),
    // mapBrightness client setting — luma gain −100..+100 (0 = neutral).
    // Evaluated per capture so the slider applies live (like getDither).
    getBrightness: () => getBrightness(),
    // mapWebpQuality world setting — 0 = lossless PNG, 1-100 = lossy WebP.
    // Evaluated per capture so the DM slider applies live (like captureFps).
    getWebpQuality: () => getWebpQuality(),
    // frame_stats telemetry (≤1 every 5s): capture-phase timings observable
    // from the bridge WS without access to this client's console. Unknown
    // envelope types are dropped silently by the g2-app (scene-input 2c).
    emitStats: (stats) => bridgeDeltaEmitter('frame_stats', stats),
  });

  // Display-settings sync (latency audit 2026-06-14): publish the initial
  // snapshot so the bridge cache is warm and any glasses connecting later get
  // the live Foundry values on connect. Gated on isStreamLeader inside.
  emitDisplaySettings();
  // Heartbeat re-publish: keeps the bridge cache warm even when the bridge
  // (re)starts after this `ready` or when stream leadership migrates — so the
  // glasses settings panel always reflects Foundry on connect (#32). Page
  // lifecycle owns this timer (Foundry reload tears down the whole client).
  setInterval(emitDisplaySettings, SETTINGS_HEARTBEAT_MS);

  // Roster heartbeat (ADR-0015 §C, BUG-4): the character-list reader only emits on
  // ready + actor CRUD hooks, so after a bridge (re)start (or leadership migration)
  // the bridge CharacterListCache goes COLD until an actor changes — breaking the
  // g2-app PC selector (GET /v1/characters) AND the actor player-view
  // (actorId→userName resolution → `unavailable`). Mirror the settings heartbeat:
  // the stream leader re-publishes the roster on the same cadence so the cache
  // stays warm. Leader-gated to avoid N× redundant POSTs (the roster is identical
  // world data on every client). Best-effort; never throws into the timer.
  setInterval(() => {
    try {
      if (!isStreamLeader()) return;
      bridgeDeltaEmitter(R1_CHARACTERS_AVAILABLE_TYPE, readCharacterList());
    } catch {
      // roster heartbeat is best-effort — a read/emit failure must not break the page
    }
  }, SETTINGS_HEARTBEAT_MS);

  // Write-path + sheet re-warm heartbeat (v0.1.42, BUG: bridge restart strands a
  // non-GM player). Two bridge caches go COLD when the bridge (re)starts after this
  // client's `ready` and only repopulate on a discrete event:
  //   1. bearer-registry — only (re)pushed on ready / bearer generate-revoke-rotate /
  //      self-pair. A cold bearer cache means the bridge resolves `tool.invoke`
  //      `boundUserId` to null, so a non-GM player's owner-scoped poll never drains
  //      their own skill check / attack / spell (no GM-fallback for a non-GM) — the
  //      write silently times out. Re-emitting keeps routing alive.
  //   2. character snapshots — only pushed on `updateActor` (HP/AC/status change).
  //      A cold snapshot cache leaves the glasses sheet / skills panel EMPTY, so a
  //      tap on a skill no-ops (`_snapshot === null`) and nothing is ever sent.
  // Mirror the settings/roster heartbeats: the stream leader re-publishes both on the
  // same cadence so a bridge restart self-heals within SETTINGS_HEARTBEAT_MS — no
  // Foundry reload and no actor "nudge" required. Leader-gated (the bearer registry is
  // world data; snapshots are identical world reads) to avoid N× redundant POSTs.
  // Best-effort; never throws into the timer.
  setInterval(() => {
    try {
      if (!isStreamLeader()) return;
      // 1. Re-push the bearer registry so tool.invoke routing survives a bridge restart.
      bearerRegistryHandle?.reEmit();
      // 2. Re-push each player character's full snapshot so the glasses sheet/skills
      //    panel can populate (and interactive taps can resolve an actor) after a
      //    cold start, without waiting for an actor change.
      for (const entry of readCharacterList().characters) {
        const snapshot = getCharacterSnapshot(entry.actorId);
        if (snapshot !== null) {
          bridgeDeltaEmitter(CHARACTER_DELTA_TYPE, snapshot);
        }
      }
    } catch {
      // re-warm heartbeat is best-effort — a read/emit failure must not break the page
    }
  }, SETTINGS_HEARTBEAT_MS);

  // Stream-request poll (ADR-0015 §C, browser-capture): learn which actor's owner
  // the glasses want as the map source, so the owning client self-elects as the
  // capture leader (see isStreamLeader / ownerElection). Poll on EVERY client (not
  // leader-gated) — a NON-leader owner must discover the request to take over.
  void pollStreamRequest();
  setInterval(() => void pollStreamRequest(), STREAM_REQUEST_POLL_MS);
});

/** Minimal user shape read by {@link isStreamLeader}. */
interface UserLike {
  readonly id?: string | null;
  readonly active?: boolean;
  readonly isGM?: boolean;
}

// ─── Owner-elected stream leader (ADR-0015 §C, browser-capture) ────────────────

/** Per-user opt-in flag scope/key (mirrors readers/character-reader.ts). */
const STREAM_CONSENT_FLAG = 'streamConsent';
/** How often THIS client asks the bridge which actor's owner should be the stream source (ms). */
const STREAM_REQUEST_POLL_MS = 2_500;
/**
 * The actor the glasses currently want the OWNER's view of (actor mode, or
 * streaming with a selected PC), learned by polling the bridge's
 * `/internal/stream-request`. `null` → no specific request → default election.
 */
let _requestedStreamActorId: string | null = null;

/** Minimal user shape for the consent + ownership check. */
interface ConsentUserLike {
  readonly id?: string | null;
  readonly active?: boolean;
  readonly isGM?: boolean;
  getFlag?(scope: string, key: string): unknown;
}
/** Minimal actor shape for the permission check. */
interface ActorPermLike {
  testUserPermission(user: ConsentUserLike, perm: string): boolean;
}

/**
 * Poll the bridge for the requested stream actor (browser-capture leader signal).
 * Best-effort: a missing pairing, an unreachable bridge, or a non-200 leaves the
 * last known value. Updates {@link _requestedStreamActorId} for {@link isStreamLeader}.
 */
async function pollStreamRequest(): Promise<void> {
  try {
    const bridgeUrl = getBridgeUrl();
    const secret = getInternalSecret();
    if (bridgeUrl === null || secret === null) return;
    const res = await fetch(`${bridgeUrl}/internal/stream-request`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(DELTA_POST_TIMEOUT_MS),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { actorId?: unknown };
    _requestedStreamActorId =
      typeof body.actorId === 'string' && body.actorId.length > 0 ? body.actorId : null;
  } catch {
    // best-effort — keep the last known requested actor
  }
}

/**
 * Decide this client's role for an owner-requested actor:
 * - `lead`     — I am an ACTIVE, CONSENTING, NON-GM owner of the actor → I capture.
 * - `standdown`— another active consenting owner exists (not me) → I must NOT capture.
 * - `defer`    — no active consenting owner anywhere → fall through to default election.
 */
export function ownerElection(actorId: string): 'lead' | 'standdown' | 'defer' {
  try {
    const g = game as unknown as {
      actors?: { get(id: string): ActorPermLike | undefined };
      users?: { contents?: ConsentUserLike[] };
      user?: { id?: string | null };
    };
    const actor = g.actors?.get(actorId);
    if (actor === undefined) return 'defer';
    const selfId = g.user?.id ?? null;
    let anyOwner = false;
    let selfIsOwner = false;
    for (const u of g.users?.contents ?? []) {
      if (u.isGM === true || u.active !== true) continue;
      if (u.getFlag?.(MODULE_ID, STREAM_CONSENT_FLAG) !== true) continue;
      try {
        if (actor.testUserPermission(u, 'OWNER')) {
          anyOwner = true;
          if (u.id != null && u.id === selfId) selfIsOwner = true;
        }
      } catch {
        // permission probe failed for this user — skip
      }
    }
    if (selfIsOwner) return 'lead';
    if (anyOwner) return 'standdown';
    return 'defer';
  } catch {
    return 'defer';
  }
}

/**
 * Deterministic stream-source election — `true` when THIS client should
 * capture and stream map frames.
 *
 * All clients evaluate the same synced `game.users` data, so they agree
 * without coordination: among the active users, GMs win over players, ties
 * break on lowest id. Evaluated live per capture (see
 * `CanvasExtractorOpts.isEnabled`) so leadership migrates when the GM joins or
 * leaves. Fail-open: if the users collection cannot be read, this client
 * streams — a duplicate stream beats a permanently blank map.
 */
export function isStreamLeader(): boolean {
  // Forced leader (ADR-0015 §C P2c): a headless player-view client (?evfLeader=1)
  // ALWAYS streams, overriding the GM-wins election — its view is the chosen map
  // source. The bridge drops the GM's frames while these arrive.
  if (_forcedLeader) {
    return true;
  }
  // Owner-elected leader (ADR-0015 §C, browser-capture): when the glasses request a
  // specific actor, the active CONSENTING NON-GM owner captures THEIR OWN real view
  // (vision + fog) directly from their open browser — no headless. If such an owner
  // is active, only they lead (everyone else stands down); if none is active, fall
  // through to the default GM-wins election so the map is not blank.
  const reqActor = _requestedStreamActorId;
  if (reqActor !== null && reqActor !== '') {
    const verdict = ownerElection(reqActor);
    if (verdict === 'lead') return true;
    if (verdict === 'standdown') return false;
    // 'defer' → default election below
  }
  try {
    const g = game as unknown as { user?: UserLike | null; users?: Iterable<UserLike> | null };
    const self = g.user;
    if (self?.id === undefined || self.id === null) {
      return true;
    }
    const users = g.users;
    if (users === undefined || users === null) {
      return true;
    }
    const active = [...users].filter((u) => u.active === true && u.id != null);
    if (active.length === 0) {
      return true;
    }
    const gms = active.filter((u) => u.isGM === true);
    const pool = gms.length > 0 ? gms : active;
    pool.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return pool[0]?.id === self.id;
  } catch {
    return true;
  }
}

/** Minimal Foundry token shapes read by {@link buildMapFraming}. */
interface TokenDocLike {
  readonly x?: number;
  readonly y?: number;
  /** Footprint in GRID UNITS (multiplied by the grid pixel size). */
  readonly width?: number;
  readonly height?: number;
  readonly hidden?: boolean;
}
interface TokenPlaceableLike {
  readonly document?: TokenDocLike | null;
  readonly actor?: { readonly id?: string | null; readonly hasPlayerOwner?: boolean } | null;
}
interface CanvasGlobalLike {
  readonly tokens?: { readonly placeables?: readonly TokenPlaceableLike[] | null } | null;
  readonly grid?: { readonly size?: number } | null;
  readonly dimensions?: {
    readonly width?: number;
    readonly height?: number;
    readonly size?: number;
  } | null;
}

/**
 * Build the map-framing world rectangle from the live scene tokens (party-fit,
 * focus-weighted toward {@link _focusActorId}). Returns `null` when auto-framing
 * is disabled, no tokens are present, or anything is unreadable — the extractor
 * then captures the GM's live viewport instead. Fully defensive: never throws
 * into the capture loop.
 *
 * @see computePartyFraming (the pure geometry)
 */
export function buildMapFraming(): WorldRect | null {
  try {
    if (!getMapAutoFrame()) {
      return null;
    }
    const c = (globalThis as { canvas?: CanvasGlobalLike | null }).canvas;
    const placeables = c?.tokens?.placeables;
    if (placeables === undefined || placeables === null) {
      return null;
    }
    const gridSize = c?.grid?.size ?? c?.dimensions?.size ?? 100;
    const safeGrid = typeof gridSize === 'number' && gridSize > 0 ? gridSize : 100;

    const tokens: FramingTokenLike[] = [];
    for (const t of placeables) {
      const d = t?.document;
      if (d === undefined || d === null) {
        continue;
      }
      if (typeof d.x !== 'number' || typeof d.y !== 'number') {
        continue;
      }
      const wUnits = typeof d.width === 'number' ? d.width : 1;
      const hUnits = typeof d.height === 'number' ? d.height : 1;
      const actor = t?.actor ?? null;
      tokens.push({
        x: d.x,
        y: d.y,
        width: wUnits * safeGrid,
        height: hUnits * safeGrid,
        isPlayerCharacter: actor?.hasPlayerOwner === true,
        isFocus: _focusActorId !== null && actor?.id === _focusActorId,
        hidden: d.hidden === true,
      });
    }
    if (tokens.length === 0) {
      return null;
    }
    const sceneWidth = typeof c?.dimensions?.width === 'number' ? c.dimensions.width : undefined;
    const sceneHeight = typeof c?.dimensions?.height === 'number' ? c.dimensions.height : undefined;
    return computePartyFraming(tokens, {
      ...(sceneWidth !== undefined ? { sceneWidth } : {}),
      ...(sceneHeight !== undefined ? { sceneHeight } : {}),
    });
  } catch (err) {
    console.warn('[EVF] buildMapFraming failed:', (err as Error).message ?? err);
    return null;
  }
}
