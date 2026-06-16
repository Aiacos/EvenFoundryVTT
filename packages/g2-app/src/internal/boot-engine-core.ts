/**
 * @internal Boot-sequence body shared by production wrapper (../index.ts)
 * and test-support wrapper (../index.test-support.ts).
 *
 * Contains the only references to `deps.wsFactory` / `deps.bridgeFactory`
 * in the package, behind the `internal/` directory boundary.
 *
 * MUST NOT be imported from outside the @evf/g2-app package.
 * MUST NOT be re-exported from the package main entry (./index.ts).
 *
 * Architecture lock (Option B per 04A-PLAN-CHECK.md §NF-2):
 * the boot-sequence body would otherwise need to live inside `index.ts`,
 * which would force `wsFactory` / `bridgeFactory` substrings into the
 * production entry — failing the W-4 grep gate. Option B moves the body
 * here so `index.ts` stays literally free of those identifiers while still
 * exposing a thin production `bootEngine(opts)` wrapper.
 *
 * Boot sequence (in order):
 *   1. installHubPolyfill() — idempotent Phase 2 wizard backward-compat shim
 *   2. await (deps?.bridgeFactory ?? waitForEvenAppBridge)()
 *   3. await createBootPage(bridge) — 11-container schema
 *   4. await showBootSplash(bridge, ...) — 5-step UI-SPEC §Screen 1 checklist
 *   5. open WS via (deps?.wsFactory ?? (url => new WebSocket(url))) — await 'open'
 *   6. await performCapabilityHandshake(ws, token, locale)
 *   7. new LayerManager(bridge) + setNegotiatedCaps(handshake.server_caps)
 *   8. new RasterController(bridge)
 *   9. BLE probe → controller.setBleVerdict + lm.setMapMode (CONTEXT.md §Area 4)
 *   9b. Phase 4b: persisted map mode override read-back (MAP-05) — reads
 *       `view.map.mode` from Even Hub kv via `loadPersistedMapMode(bridge)`;
 *       'raster' | 'glyph' overrides the BLE verdict; 'auto' (or missing /
 *       invalid / read-failure) lets the BLE verdict win.
 *   9c. Phase 5 (I18N-02): device-local locale override read-back — reads
 *       `view.locale.override` from Even Hub kv via `loadLocaleOverride(bridge)`;
 *       any valid `HudLocale` code overrides `opts.locale`; 'auto' (or missing /
 *       invalid / read-failure) lets the boot-time auto-detected locale win.
 *       ES/FR/PT-BR codes are best-effort per I18N-05.
 *  10. Construct 3 layers: MapBaseLayer (z=0), IdleInfillLayer (z=0.5), StatusHudLayer (z=1)
 *  11. attachSceneInputToWs(ws, controller) — Plan 06 WS frame_pixels receiver
 *  11b. attachR1EventSource(ws, gestureBus, lm, DEFAULT_R1_TIMINGS) — R1 gesture bridge (Phase 6)
 *  11c. new LocaleEventEmitter() + makeMenu factory + attachQuickActionOverscroll(bus, router, lm, makeMenu)
 *  11d. attachConcConflictHandler(ws, bridge, gestureBus, lm, effectiveLocale) — closes Plan 04b-05 deferred wire
 *  11e. attachActionResultHandler(ws, toastQueue, effectiveLocale, currentUserId) — Plan 08-01 r1.action.result → toast
 *  11e+. attachActionEconomyHandler(ws, currentUserId) — Plan 09-02 r1.action.economy → StatusHudLayer + AOM preconditioner
 *  11f. makeActionOptions factory closure + setPanelInstanceHandler('spellbook'/'inventory') — Plan 08-03 tap → Action Options modal injection (ADR-0012)
 *  11g. quickActionHandler([A][S][I][M]) + setPanelInstanceHandler('combat-tracker') — Plan 08-05 quick-action dispatch
 *  12. await lm.bundle([mount z=1 CanvasStatusHudLayer]) — canvas mode: single layer flush
 *  12a. paint header (id4) + footer (id5) frame chrome — never leaves SDK 'Text' default
 *  13. await finalizeIdleRender(idleInfill, mapBase) — draw idle infill strips +
 *       first map frame post-bundle (both rejection-guarded, ordered: idleInfill first)
 *  14. return { layerManager, rasterController, localeEvents, teardown }
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §W-4 + §NF-2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-05-PLAN.md Task 1
 * @see ../index.ts (production wrapper)
 * @see ../index.test-support.ts (test-only DI wrapper)
 */
import { type EvenAppBridge, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { ServerCap } from '@evf/shared-protocol';
import { startAudioCapture } from '../engine/audio-capture.js';
import { type BootStep, showBootSplash } from '../engine/boot-splash.js';
import { CanvasCompositor } from '../engine/canvas-compositor.js';
import { performCapabilityHandshake, probeBleThroughput } from '../engine/capability-handshake.js';
import { DebugMirror } from '../engine/debug-mirror.js';
import { createDisplaySettingsSync } from '../engine/display-settings-sync.js';
import { attachGlassesEventSource } from '../engine/glasses-event-source.js';
import { writeFooterChrome, writeHeaderChrome } from '../engine/hud-chrome.js';
import { HudDeltaDriver } from '../engine/hud-delta-driver.js';
import { LayerManager } from '../engine/layer-manager.js';
import { ZIndex } from '../engine/layer-types.js';
import { loadPersistedMapMode } from '../engine/map-mode-toggle.js';
import { createBootPage } from '../engine/page-lifecycle.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { PanelRouter } from '../engine/panel-router.js';
import { PerfProbe } from '../engine/perf-probe.js';
import {
  buildActionPendingToast,
  buildMapAlreadyFullscreenToast,
} from '../engine/quick-action-feedback.js';
import { attachR1EventSource } from '../engine/r1-event-source.js';
import { DEFAULT_R1_TIMINGS } from '../engine/r1-timings.js';
import { SeqTracker } from '../engine/seq-tracker.js';
import { WsReconnectController } from '../engine/ws-reconnect.js';
import { WsSender } from '../engine/ws-sender.js';
import { toWsConnectUrl } from '../engine/ws-url.js';
import { installHubPolyfill } from '../hub-polyfill.js';
import { createHudTileWorkerClient } from '../hud/hud-tile-worker-client.js';
import { MapCanvasLayer } from '../hud/map-canvas-layer.js';
import { LocaleEventEmitter } from '../locale/locale-events.js';
import { type LocaleOverride, loadLocaleOverride } from '../locale/locale-override.js';
import { attachActionEconomyHandler } from '../panels/action-economy-dispatcher.js';
import { clearActionEconomyState } from '../panels/action-economy-state.js';
import { attachActionResultHandler } from '../panels/action-result-dispatcher.js';
import { attachConcConflictHandler } from '../panels/conc-conflict-dispatcher.js';
import { clearRetryCache } from '../panels/conc-retry-cache.js';
import { attachNavPanelClose } from '../panels/nav-panel-close-dispatcher.js';
import { attachPortraitHandler } from '../panels/portrait-dispatcher.js';
import { clearPortraitBytes } from '../panels/portrait-state.js';
import { QuickActionMenuPanel } from '../panels/quick-action-menu-panel.js';
import { attachQuickActionOverscroll } from '../panels/quick-action-overscroll-dispatcher.js';
import { attachReactionPromptHandler } from '../panels/reaction-prompt-dispatcher.js';
import { attachRootExit } from '../panels/root-exit-dispatcher.js';
import { createPhoneSettingsPanel, type PhoneSettingsPanel } from '../phone/settings-panel.js';
import { renderGlyphScene } from '../raster/glyph-renderer.js';
import { MapBaseLayer } from '../raster/map-base-layer.js';
import { RasterController } from '../raster/raster-controller.js';
import { attachSceneInputToWs } from '../scene-input.js';
import { CanvasStatusHudLayer } from '../status-hud/canvas-status-hud-layer.js';
import { CanvasToastLayer } from '../status-hud/canvas-toast-layer.js';
import { IdleInfillLayer } from '../status-hud/idle-infill-layer.js';
import { StatusHudLayer } from '../status-hud/status-hud-layer.js';
import { StatusHudRenderer } from '../status-hud/status-hud-renderer.js';
import { ToastQueueLayer } from '../status-hud/toast-queue-layer.js';
import type { ToastSink } from '../status-hud/toast-types.js';

/**
 * Locale tag for the boot engine. Mirrors the full `HudLocale` union from
 * `i18n-budgets.ts` (Phase 5 Plan 06 widening — I18N-02):
 *   - Canonical locales: `it` / `en` / `de` — full IT/EN/DE strings in HUD_WIDTH_BUDGETS.
 *   - Best-effort locales: `es` / `fr` / `pt-br` — per-key EN fallback at render
 *     time via `getLabel()` (I18N-05). TODO(ADR-0010): curate ES/FR/PT-BR translations
 *     in a future phase if locale-specific width budgets are established.
 */
export type BootEngineLocale = 'it' | 'en' | 'de' | 'es' | 'fr' | 'pt-br';

/**
 * Even Hub kv-store key for the FPS indicator toggle (`'0'` = off, anything
 * else = on; default ON). Device-local — never a Foundry world setting, and
 * never browser localStorage (sandboxed WebView, CLAUDE.md hard rule).
 */
const FPS_INDICATOR_KV_KEY = 'evf.fps.indicator';

/**
 * Production boot-engine options.
 *
 * **NO DI fields here.** Test-only DI lives in {@link TestingDependencies}.
 * Single source of truth — re-exported as `BootEngineOpts` from `../index.ts`.
 */
export interface BootEngineOpts {
  /**
   * Bridge **REST base URL** (scheme `http`/`https`, e.g. `https://host:443`) —
   * the Phase 3 bridge service. NOT the WebSocket connect URL: the engine derives
   * the `ws(s)://…/ws` connect URL internally via {@link toWsConnectUrl} (the
   * bridge serves its socket at the `/ws` route, and WebSocket requires a
   * `ws`/`wss` scheme). The displayop + audio consumers use this value as the
   * HTTP(S) REST base directly.
   */
  readonly bridgeUrl: string;
  /** 24h bearer token paired via QR (Specs §11.5.4). */
  readonly token: string;
  /**
   * Boot-time locale auto-detected from `game.i18n.lang` (or the caller's
   * environment). Canonical: `it` (MVP) / `en` (fallback) / `de` (INV-1).
   * Best-effort: `es` / `fr` / `pt-br` — per-key EN fallback at render time.
   *
   * Step 9c (I18N-02) may override this value when `view.locale.override` is
   * set in Even Hub kv store. The override is device-local and never modifies
   * Foundry world settings.
   */
  readonly locale: BootEngineLocale;

  /**
   * Enable the opt-in perf probe (Phase 10 Plan 02 — SC-10-02).
   *
   * When `true`, constructs a `PerfProbe` that records per-action timestamps
   * at 4 g2-app-side stations (gesture_emit, bridge_post, result_envelope,
   * toast_queued) and emits `r1.perf.sample` envelopes over the bridge WS.
   *
   * When `false` (default), the probe is disabled and incurs zero overhead.
   *
   * Also activated via `?probe=true` URL param in the Even Realities App WebView
   * (browser entry path). This flag takes precedence over the URL param when
   * both are present.
   *
   * @see packages/g2-app/src/engine/perf-probe.ts
   * @see docs/perf/phase-10-latency.md
   */
  readonly perfProbe?: boolean;

  /**
   * Selected PC actor id (FLV-CHAR-SELECT).
   *
   * Forwarded to the bridge as the handshake `actorId` field so the session's
   * `character.delta` stream is pinned to this actor — the HUD renders THIS
   * character instead of always `characters[0]`.
   *
   * Resolved by `launchApp` with precedence:
   *   1. `?actor=<id>` URL param (dev / simulator override)
   *   2. Tier3 `Session.characterId` (wizard-persisted choice)
   *   3. `undefined` (no pin — legacy last-write-wins roster[0] behavior)
   */
  readonly characterId?: string;

  /**
   * Minimum HUD recompose interval in ms (the HudDeltaDriver throttle).
   *
   * Defaults to 33 ms (≈30 fps cap — bench ladder 2026-06-10 sweet spot for
   * the full-screen 576×288 composite). Lab/sim runs may lower it (e.g. 20 ms
   * ≈ 50 fps potential) once the rest of the chain sustains the rate; real
   * hardware is BLE-governed and ignores faster cycles anyway.
   *
   * Also settable via the `?hudms=<ms>` URL param in the browser entry path
   * (same pattern as `?probe=true`); this boot flag takes precedence over the
   * URL param when both are present. Values are clamped to [8, 1000].
   */
  readonly hudMinIntervalMs?: number;
}

/**
 * @internal Test-only DI surface for `bootEngineForTest`.
 *
 * Defined here so the literal substrings `wsFactory` / `bridgeFactory`
 * stay out of `../index.ts` (W-4 grep gate enforcement). The
 * `../index.test-support.ts` module re-exports this type for test consumers.
 *
 * Production code paths NEVER pass `deps` — `bootEngine(opts)` calls
 * `_bootEngineCore(opts, undefined)` with no test injection point.
 */
export interface TestingDependencies {
  /** Replace `new WebSocket(url)` with a test-compatible mock. */
  readonly wsFactory?: (url: string) => WebSocket;
  /** Replace `waitForEvenAppBridge()` with a test-compatible mock. */
  readonly bridgeFactory?: () => Promise<EvenAppBridge>;
}

/** Default HudDeltaDriver throttle (ms) — ≈30 fps cap, bench ladder 2026-06-10. */
const DEFAULT_HUD_MIN_INTERVAL_MS = 33;

/** Clamp bounds for {@link resolveHudMinIntervalMs} — 8 ms (125 fps) to 1 s. */
const HUD_MIN_INTERVAL_CLAMP: readonly [number, number] = [8, 1000];

/**
 * Resolve the HudDeltaDriver throttle interval for this boot.
 *
 * Priority (same scheme as the perf probe):
 *   1. `opts.hudMinIntervalMs` — explicit boot flag
 *   2. `?hudms=<ms>` URL param — browser entry path (sim / lab tuning)
 *   3. Default 33 ms
 *
 * Non-numeric or out-of-range values clamp to [8, 1000] ms; an unparsable
 * URL param falls through to the default.
 *
 * @internal Exported for direct unit testing only.
 */
export function resolveHudMinIntervalMs(optValue: number | undefined): number {
  let raw = optValue;
  if (raw === undefined && typeof window !== 'undefined') {
    const param = new URL(window.location.href).searchParams.get('hudms');
    if (param !== null) {
      const parsed = Number(param);
      if (Number.isFinite(parsed)) {
        raw = parsed;
      }
    }
  }
  if (raw === undefined || !Number.isFinite(raw)) {
    return DEFAULT_HUD_MIN_INTERVAL_MS;
  }
  const [lo, hi] = HUD_MIN_INTERVAL_CLAMP;
  return Math.max(lo, Math.min(hi, Math.round(raw)));
}

/**
 * Boot-engine handle returned by `_bootEngineCore`.
 *
 * `teardown` releases every resource the boot acquired (WS, raster Worker,
 * Plan 06 unsubscribe, all three Layer instances) so tests can run multiple
 * boot cycles without leaking timers or sockets.
 *
 * `effectiveLocale` is the locale actually used for StatusHudRenderer
 * construction after step 9c locale override read-back (I18N-02). Test
 * assertions use this to verify that the override path works end-to-end
 * without inspecting internal `StatusHudRenderer` state.
 */
export interface BootEngineHandle {
  readonly layerManager: LayerManager;
  readonly rasterController: RasterController;
  readonly teardown: () => void;
  /** Step 9c result — opts.locale unless a stored override was applied. */
  readonly effectiveLocale: BootEngineLocale;
  /**
   * Shared in-process locale event bus (Phase 6 — step 11c).
   *
   * Created once per boot and shared between the `makeMenu` factory closure
   * (which threads it into every `QuickActionMenuPanel` instance) and external
   * consumers (tests, future hot-reload). Panels subscribe to this emitter on
   * `onMount` and unsubscribe on `onUnmount`, so `size()` is 0 at boot time
   * and rises/falls with the panel mount lifecycle.
   *
   * Exposed here so tests can verify locale-change fan-out end-to-end (BERW-07)
   * without needing to reach into internal closure state.
   */
  readonly localeEvents: LocaleEventEmitter;
}

/** UI-SPEC §Screen 1 — the 5 canonical boot-splash labels (locale-resolved by caller). */
function buildBootSteps(): BootStep[] {
  // Steps render in order; all start `in_progress` and flip to `done` as the
  // sequence advances. Phase 4a boots through the whole list synchronously
  // from this function's perspective (each await is a single bridge call).
  return [
    { label: 'Connect Bridge', state: 'in_progress' },
    { label: 'Capability Handshake', state: 'pending' },
    { label: 'Probe BLE Throughput', state: 'pending' },
    { label: 'Mount Status HUD', state: 'pending' },
    { label: 'Mount Map Base', state: 'pending' },
  ];
}

/**
 * Post-bundle idle render finalizer — step 13 of the boot sequence.
 *
 * Awaits `idleInfill.draw()` then `mapBase.draw()` in sequence, each under
 * its own `try/catch` rejection guard. This ordering is CRITICAL:
 *
 * - Both calls must happen AFTER `layerManager.bundle()` (step 12) has issued
 *   its single `rebuildPageContainer` flush. That flush resets every text
 *   container — including z05-combat-log / z05-label / z05-stats (ids 8-10) —
 *   back to the EvenHub SDK default literal "Text". Calling `idleInfill.draw()`
 *   post-flush ensures the z05 strips always show their real idle content
 *   instead of the SDK default.
 *
 * - `idleInfill.draw()` runs before `mapBase.draw()` so that a slow BLE write
 *   for z05 does not race a parallel `map-capture` blank write. Sequential
 *   execution keeps the ordering deterministic and simplifies reasoning about
 *   the boot render timeline.
 *
 * Rejection guards: a failure from either draw call MUST NOT abort an
 * already-booted engine. Each call is independently guarded (T-etr-03 pattern,
 * matching the step-12a chrome-writer try/catch). Warnings are logged so
 * on-device debugging remains actionable; execution continues regardless.
 *
 * Extracted as a standalone exported helper to make this sequencing
 * unit-testable without mocking the full WS / bridge / boot infrastructure.
 *
 * @param idleInfill - Layer with a `draw()` method (IdleInfillLayer or mock).
 * @param mapBase    - Layer with a `draw()` method (MapBaseLayer or mock).
 */
export async function finalizeIdleRender(
  idleInfill: { draw(): Promise<void> },
  mapBase: { draw(): Promise<void> },
): Promise<void> {
  try {
    await idleInfill.draw();
  } catch (err) {
    console.warn('[boot-engine-core] idle-infill draw failed:', err);
  }
  try {
    await mapBase.draw();
  } catch (err) {
    console.warn('[boot-engine-core] map-base draw failed in finalizeIdleRender:', err);
  }
}

/**
 * WS event bus — persistent single listener + last-value-replay per channel.
 *
 * ## Why this design (quick-task 260605-e9t)
 *
 * The prior implementation attached a fresh `ws.addEventListener('message', …)` on
 * EVERY `subscribe()` call and kept NO per-channel cache. This meant the bridge's
 * on-connect `character.delta` — sent immediately after the handshake response
 * (quick 260605-d0v/dog) — arrived during boot steps 7-11, **before**
 * `StatusHudLayer` subscribed at step 12, and was permanently dropped. The HUD
 * therefore booted showing placeholders (PF …, CA —).
 *
 * Fix: ONE persistent `message` listener is attached at **bus creation** (right after
 * WS open, before `performCapabilityHandshake` — see `_bootEngineCore` step 5).
 * Every inbound envelope is cached as the last value per channel
 * (`lastByChannel: Map<string, unknown>`, keyed by `envelope.type`). When
 * `subscribe(channel, fn)` is called, if a cached value exists the fn is invoked
 * **synchronously** before being registered for future envelopes. This closes the
 * timing gap: a `character.delta` pushed during boot steps 6-11 is replayed to
 * `StatusHudLayer` the moment it subscribes at step 12.
 *
 * ## Phase 10 D-Area1 hot-path preservation
 *
 * The `seqTracker.observe()` call (Plan 10-01) and the `perfProbe.mark('result_envelope', …)`
 * call (Plan 10-02) are preserved VERBATIM in the single `globalHandler`. They fire on
 * every inbound envelope, independent of whether any subscriber is registered.
 *
 * ## Late-binding PerfProbe
 *
 * `perfProbe` is not available at bus-creation time (step 5) because it depends on
 * `handshake.session_id` which is only known after step 6. The returned object therefore
 * exposes a `setPerfProbe(p)` method that swaps the probe reference into the shared
 * closure. Call it at step 10 (after perfProbe is constructed). The reconnect path
 * (`rebindWsEvents(createWsEventBus(newWs, seqTracker, perfProbe))` ~line 861) uses the
 * 3-arg form where both are already available — no `setPerfProbe` call needed there.
 *
 * @internal
 */
export function createWsEventBus(
  ws: WebSocket,
  seqTracker?: SeqTracker,
  perfProbeArg?: PerfProbe,
): {
  subscribe: (channel: string, fn: (raw: unknown) => void) => () => void;
  setPerfProbe: (p: PerfProbe) => void;
  rebind: (newWs: WebSocket) => void;
} {
  /** The socket the persistent `globalHandler` is currently attached to. */
  let boundWs: WebSocket = ws;
  /** Last payload per channel — keyed by envelope `type`. */
  const lastByChannel = new Map<string, unknown>();
  /** Per-channel subscriber sets. */
  const subscribers = new Map<string, Set<(raw: unknown) => void>>();
  /** Late-bound perfProbe reference (set via setPerfProbe after handshake). */
  let perfProbeRef: PerfProbe | undefined = perfProbeArg;

  /**
   * ONE persistent listener for the lifetime of this bus.
   *
   * Parses each inbound envelope once, runs the Phase 10 hot-path hooks verbatim,
   * caches the last payload per channel, then fans out to per-channel subscriber Sets.
   * NEVER removed — the bus lives for the WS lifetime; subscribe/unsubscribe only
   * mutate per-channel subscriber Sets.
   */
  const globalHandler = (ev: MessageEvent): void => {
    try {
      const rawText =
        typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
      const parsed = JSON.parse(rawText) as {
        type?: unknown;
        payload?: unknown;
        seq?: unknown;
      };
      // Phase 10 Plan 10-01 — observe seq BEFORE forwarding (D-Area1 hot-path).
      // Duck-typed: if the envelope has a numeric seq field, track it.
      if (seqTracker !== undefined && typeof parsed.seq === 'number') {
        seqTracker.observe({ seq: parsed.seq });
      }
      // Phase 10 Plan 10-02 — perf probe stations 1 + 4 (WS-receive side).
      //
      // Station 1: gesture_emit — mark when r1.gesture envelope is received.
      // The r1.gesture envelope does not carry an idempotencyKey (the key is
      // generated by ActionOptionsModal when the user confirms the action).
      // We use the gesture timestamp as a proxy key for pre-idempotency-key
      // correlation. This is a best-effort measurement — the real correlation
      // happens in flush() which pairs gesture_emit with subsequent stations
      // via idempotencyKey threading.
      //
      // Deferred (SC-10-02): Full gesture_emit wiring requires idempotencyKey
      // threading from the gesture source (ActionOptionsModal) back to the
      // R1EventSource level. For Phase 10 Plan 02, gesture_emit is marked
      // at the r1.gesture receive site with a placeholder key derived from
      // the gesture payload timestamp. The bridge_post station carries the
      // real key when action-options-modal sends the tool.invoke envelope.
      //
      // Station 4: result_envelope — mark when r1.action.result envelope received.
      // idempotencyKey from the payload. T-10-02: the key is hashed inside
      // PerfProbe.flush() before transmission — never logged or leaked here.
      //
      // Deferred (SC-10-02): handler_invoke (station 3) is server-side and NOT
      // measured by g2-app. The PerfProbe approximates it from bridge/result
      // timestamps during flush(). Full measurement requires bridge-log
      // instrumentation in the foundry-module socketlib handler.
      if (perfProbeRef !== undefined && typeof parsed.type === 'string') {
        if (
          parsed.type === 'r1.action.result' &&
          typeof parsed.payload === 'object' &&
          parsed.payload !== null
        ) {
          const payloadObj = parsed.payload as Record<string, unknown>;
          if (typeof payloadObj.idempotencyKey === 'string') {
            perfProbeRef.mark('result_envelope', payloadObj.idempotencyKey);
          }
        }
      }
      // Cache last value per channel + fan out to subscribers.
      if (typeof parsed.type === 'string') {
        lastByChannel.set(parsed.type, parsed.payload);
        const set = subscribers.get(parsed.type);
        if (set !== undefined) {
          for (const fn of set) {
            fn(parsed.payload);
          }
        }
      }
    } catch (err) {
      console.warn('[boot-engine-core] ws-event-bus parse failure', err);
    }
  };

  // Attach the ONE persistent listener at bus creation (before any subscribe calls).
  ws.addEventListener('message', globalHandler as EventListener);

  return {
    /**
     * Subscribe to a channel.
     *
     * If the bus has already seen an envelope on `channel` (e.g. the on-connect
     * `character.delta` that arrived during boot before this subscribe call),
     * `fn` is invoked **synchronously** with the cached last value before being
     * registered for future envelopes. This is the last-value-replay guarantee.
     *
     * @param channel Envelope `type` string to filter on.
     * @param fn Callback receiving the envelope `payload`.
     * @returns Unsubscribe function — removes only this `fn`; the global listener
     *   is never removed by calling unsubscribe.
     */
    subscribe(channel, fn) {
      // Replay the cached last value synchronously if one exists.
      if (lastByChannel.has(channel)) {
        fn(lastByChannel.get(channel));
      }
      // Register for future envelopes on this channel.
      let set = subscribers.get(channel);
      if (set === undefined) {
        set = new Set();
        subscribers.set(channel, set);
      }
      set.add(fn);
      // Unsubscribe removes only this fn from the per-channel Set.
      // NEVER calls ws.removeEventListener — globalHandler lives for bus lifetime.
      return () => {
        subscribers.get(channel)?.delete(fn);
      };
    },

    /**
     * Late-bind the `PerfProbe` instance.
     *
     * Called at boot step 10 (after `handshake.session_id` is available and
     * `PerfProbe` is constructed) to enable the `result_envelope` station mark.
     * The `globalHandler` closure reads `perfProbeRef` on each inbound envelope,
     * so marks fire from the moment this setter is called — even for envelopes
     * that arrived before the probe was bound will NOT be retroactively marked
     * (by design: they predate the probe's session_id context).
     *
     * @param p Constructed, enabled-or-disabled `PerfProbe` instance.
     */
    setPerfProbe(p: PerfProbe): void {
      perfProbeRef = p;
    },

    /**
     * Re-attach the persistent `globalHandler` from the dead socket to `newWs`.
     *
     * ## Why (T9 — reconnect bus rebind)
     *
     * In canvas mode (the DEFAULT boot, CR-03) `statusHud` is null, so the
     * reconnect handler's `statusHud?.rebindWsEvents(createWsEventBus(newWs, …))`
     * call is a no-op and a fresh throwaway bus was created instead of touching
     * the SHARED `wsEventBus`. The shared bus's canvas-mode consumers —
     * `hudDeltaDriver` (character.delta / combat.turn / combat.state),
     * `canvasStatusHud` (character.delta) and `displaySettingsSync`
     * (settings.display) — keep their subscriptions on THIS bus instance, but the
     * bus's single `globalHandler` was still listening on the dead original
     * socket. After any WS drop+resume the HUD silently stopped receiving deltas.
     *
     * `rebind(newWs)` detaches `globalHandler` from the old socket and attaches it
     * to `newWs`, preserving every existing subscriber, the per-channel
     * last-value cache, the `seqTracker` observe hook and the late-bound
     * `perfProbeRef`. Consumers keep their unchanged subscription handles — only
     * the underlying socket the single listener reads from is swapped.
     *
     * Idempotent against rebinding to the same socket; a no-op in that case.
     *
     * @param newWs The freshly-reconnected WebSocket to source envelopes from.
     */
    rebind(newWs: WebSocket): void {
      if (newWs === boundWs) {
        return;
      }
      boundWs.removeEventListener('message', globalHandler as EventListener);
      boundWs = newWs;
      newWs.addEventListener('message', globalHandler as EventListener);
    },
  };
}

/** Wait for a WebSocket to reach `OPEN` state (resolves immediately if already open). */
async function awaitWsOpen(ws: WebSocket): Promise<void> {
  // WebSocket.OPEN === 1 in browsers + Node ws polyfill.
  if (ws.readyState === 1) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onOpen = (): void => {
      ws.removeEventListener('open', onOpen as EventListener);
      ws.removeEventListener('error', onError as EventListener);
      resolve();
    };
    const onError = (ev: Event): void => {
      ws.removeEventListener('open', onOpen as EventListener);
      ws.removeEventListener('error', onError as EventListener);
      reject(new Error(`[boot-engine-core] WebSocket error before open: ${String(ev.type)}`));
    };
    ws.addEventListener('open', onOpen as EventListener);
    ws.addEventListener('error', onError as EventListener);
  });
}

/**
 * @internal Boot the G2 engine end-to-end.
 *
 * Production callers invoke this through the thin `bootEngine(opts)` wrapper
 * in `../index.ts` (which passes `deps=undefined`). Test callers invoke it
 * through `bootEngineForTest(opts, deps)` in `../index.test-support.ts`
 * (which threads `TestingDependencies` for mock injection).
 *
 * Fails closed: any reject (HandshakeError, LayerManagerError, bridge
 * rejection) propagates up and no teardown is returned. The caller's `await`
 * site rejects with the original error.
 */
export async function _bootEngineCore(
  opts: BootEngineOpts,
  deps?: TestingDependencies,
): Promise<BootEngineHandle> {
  // 1. Install the Phase 2 hub.* polyfill (idempotent — re-entrant safe).
  installHubPolyfill();

  // 2. Acquire the EvenAppBridge instance (real SDK in prod, mock in tests).
  const bridgeFactory = deps?.bridgeFactory ?? waitForEvenAppBridge;
  const bridge = await bridgeFactory();

  // 3. Create the canonical 11-container boot page.
  await createBootPage(bridge);

  // 4. Render the 5-step splash checklist (UI-SPEC §Screen 1 fixture).
  await showBootSplash(bridge, {
    steps: buildBootSteps(),
    protocolVersion: '1.0',
    panelsAvailable: 5,
  });

  // 5. Open the bridge WebSocket and wait for it to be ready.
  const wsCtor = deps?.wsFactory ?? ((url: string) => new WebSocket(url));
  const ws = wsCtor(toWsConnectUrl(opts.bridgeUrl));
  await awaitWsOpen(ws);

  // 5a. Construct SeqTracker early (no dependencies) and create the WS event bus
  //     immediately after WS open, BEFORE performCapabilityHandshake.
  //
  //     CRITICAL ORDERING (quick-task 260605-e9t): the bus must be created HERE so its
  //     persistent globalHandler listener is live when the bridge's on-connect
  //     `character.delta` arrives (sent immediately after the handshake response in
  //     quick 260605-d0v/dog). If the bus were created later (at step 10, as before),
  //     that envelope would be permanently dropped because no listener was attached.
  //
  //     SeqTracker: previously created at step 10. Moved here because it has no
  //     dependencies (pure in-memory counter) and is needed to construct the bus.
  //
  //     PerfProbe: still constructed at step 10 (after handshake.session_id is
  //     available). Wired into the bus via `wsEventBus.setPerfProbe(perfProbe)` at
  //     that point. The globalHandler reads `perfProbeRef` per-envelope, so the
  //     result_envelope station mark fires correctly for every envelope arriving after
  //     the probe is bound — envelopes arriving before binding are handled without
  //     probe marks (they predate the session_id context, by design).
  const seqTracker = new SeqTracker();
  const wsEventBus = createWsEventBus(ws, seqTracker);

  // 6. Perform the capability handshake — yields negotiated server caps.
  // FLV-CHAR-SELECT: thread opts.characterId as the actorId so the bridge
  // pins this session's character.delta stream to the player's chosen PC.
  const handshake = await performCapabilityHandshake(
    ws,
    opts.token,
    opts.locale,
    undefined,
    10_000,
    opts.characterId,
  );

  // 7. Bind the LayerManager + propagate the negotiated capability set.
  //
  // Quick Task 260529-h5e Wave 4 — opt-in display-op debug mirror (parallel to the
  // perf-probe `?probe=true` opt-in below). Constructed ENABLED only under the
  // `?debug=true` URL param; default OFF ⇒ DebugMirror.record() is a hard no-op and
  // the LayerManager mirror DI is undefined (byte-identical to pre-Wave-4 behavior).
  //
  // The mirror POSTs a DisplayOpPayload to the bridge `/debug/displayop` endpoint
  // (HTTP base derived from bridgeUrl ws→http). It does NOT call activity.use or add
  // any socketlib handler (ADR-0011 — debug HTTP sink only). The debug secret is read
  // from `?debugSecret=` (dev-only; the endpoint is itself gated by EVF_DEBUG +
  // EVF_INTERNAL_SECRET on the bridge — a missing/wrong secret is silently dropped).
  const debugMirrorEnabled =
    typeof window !== 'undefined' &&
    new URL(window.location.href).searchParams.get('debug') === 'true';
  let debugMirror: DebugMirror | undefined;
  if (debugMirrorEnabled) {
    const displayOpUrl = `${opts.bridgeUrl.replace(/^ws/, 'http').replace(/\/+$/, '')}/debug/displayop`;
    const debugSecret =
      typeof window !== 'undefined'
        ? (new URL(window.location.href).searchParams.get('debugSecret') ?? '')
        : '';
    debugMirror = new DebugMirror({
      enabled: true,
      send: (payload) => {
        // Fire-and-forget POST; failures are swallowed (dev-only observability sink).
        void fetch(displayOpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${debugSecret}` },
          body: JSON.stringify(payload),
        }).catch(() => {
          /* dev mirror — never surface POST failures to the render path */
        });
      },
    });
  }
  // Phase 20 Plan 05 — canvas compositor injected into LayerManager at boot.
  //
  // The compositor is constructed here (step 7, before LayerManager) so it is
  // available when LayerManager.bundle() creates OffscreenCanvas instances for
  // CanvasLayer mounts and registers them via compositor.registerLayer().
  // The compositor's eager _acquireMasterCtx() will succeed on a real Even App
  // WebView (OffscreenCanvas or document.createElement fallback) and silently
  // degrade to _masterCtx=null in unit-test environments (happy-dom returns null
  // from getContext('2d')). The composite() null-guard in canvas-compositor.ts
  // returns an all-zero RGBA buffer in that case (Rule 2 fix, plan 20-05) so
  // the integration-test boot path continues cleanly.
  //
  // @see packages/g2-app/src/engine/canvas-compositor.ts
  // @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1)
  const compositor = new CanvasCompositor();
  // Phase 24 Plan 02 — construct HudDeltaDriver and inject into LayerManager.
  //
  // HudDeltaDriver owns the per-tile xxhash delta loop (D-24.1..D-24.5).
  // It receives compositor + bridge + wsEventBus; LayerManager forwards the
  // canvas-mode flush to driver.runFirstFrame() + driver.start() (ADR-0013 Amendment 1).
  //
  // wsEventBus was created at step 5a and is available here. The driver subscribes
  // to character.delta, combat.turn, and combat.state channels in its start() call
  // (triggered by LayerManager._flushPage on bundle). Teardown via
  // layerManager.disposeSubscriptions() calls driver.stop() — no extra teardown needed.
  //
  // @see packages/g2-app/src/engine/hud-delta-driver.ts
  // @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1)
  // Layout B perf lever (2026-06-10): Worker-backed tile building — dither +
  // PNG encode run off the WebView main thread. Falls back to the synchronous
  // path automatically when Workers are unavailable.
  const hudTileWorker = createHudTileWorkerClient();
  const hudDeltaDriver = new HudDeltaDriver({
    compositor,
    bridge,
    wsEvents: wsEventBus,
    ...(hudTileWorker !== null
      ? {
          buildTilesAsync: (rgba: Uint8ClampedArray, dither: boolean) =>
            hudTileWorker.buildTiles(rgba, dither),
        }
      : {}),
    // Live-read dither mode — reads `ditherOn` at cycle time so a menu toggle
    // takes immediate effect without reconstructing the driver (quick-task 260611-CLR).
    getDitherMode: () => ditherOn,
    // Throttle default 33ms (bench ladder 2026-06-10, full-screen 576×288):
    // FS+100ms = 6.75 fps → 50ms = 9.5 → Bayer = 14.4 → Worker = 15.2 →
    // 33ms = 20.8 fps. With dither+encode in the Worker the main-thread cycle
    // cost is ~15ms (composite+hash+push), so 33ms is the sweet spot.
    // On hardware BLE (0.5–2s/image) the adaptive-rate stack governs instead.
    // Overridable per boot (opts.hudMinIntervalMs / ?hudms= — latency audit
    // 2026-06-11): 33ms is a hard ≈30.3 fps delivery cap; lab runs can lower it.
    minRedrawIntervalMs: resolveHudMinIntervalMs(opts.hudMinIntervalMs),
  });
  const layerManager = new LayerManager(bridge, debugMirror, compositor, hudDeltaDriver);
  // The handshake server_caps wire shape is `string[]` (Zod schema); narrow to
  // the typed `ServerCap` literal union before handing to LayerManager. The
  // bridge's HandshakeServer producer only emits values from SERVER_CAPS_V1,
  // so the cast through `as ServerCap[]` is sound at runtime — and any future
  // schema drift surfaces immediately at the LayerManager mount gate.
  const negotiatedCaps = new Set<ServerCap>(handshake.server_caps as ServerCap[]);
  layerManager.setNegotiatedCaps(negotiatedCaps);

  // Phase 20 Plan 05 — flip the effective boot render mode to canvas.
  //
  // The `LayerManager.renderMode` class field defaults to `'glyph'` (line 99,
  // layer-manager.ts) — kept so all ~50 existing tests constructed without a
  // compositor continue to pass unchanged. We flip to `'canvas'` HERE, after
  // setNegotiatedCaps, so the boot-time page rebuild uses buildHudRasterPageSchema()
  // (4 image tiles + 1 text capture = 5 containers) instead of the glyph
  // status-view schema (3 text containers). This is the ONLY place where the
  // render mode is changed at boot — no class-field edit in layer-manager.ts.
  //
  // Research lock (20-RESEARCH.md Q2): flip via setRenderMode here, never via
  // the private class field — changing the field default breaks ~50 tests.
  layerManager.setRenderMode('canvas');

  // 8. Construct the raster controller (singleton Worker + debounce).
  const rasterController = new RasterController(bridge);

  // 9. BLE-probe → mode verdict. Phase 4a software path: synthetic no-op
  //    probe returns 'auto' (probeBleThroughput returns 'auto' for windows
  //    <500 ms). Real-hardware probe lives behind the ADR-0005 human_needed
  //    gate (SC #3 + SC #3b in Plan 05 checkpoint).
  const verdict = probeBleThroughput(0, 0);
  if (verdict !== 'auto') {
    rasterController.setBleVerdict(verdict);
  }
  layerManager.setMapMode(verdict === 'auto' ? 'auto' : verdict);

  // 9b. Phase 4b — persisted map mode override (MAP-05 boot read-back).
  //     The persisted value (set by Phase 4b `toggleMapMode` + Phase 6 Quick
  //     Action [M]) OVERRIDES the BLE verdict when 'raster' or 'glyph'.
  //     'auto' (or missing key, or invalid stored value, or read failure —
  //     all coerce to 'auto' via `loadPersistedMapMode`'s defensive fallback)
  //     lets the BLE verdict win.
  //
  //     The original BLE verdict is captured below so a future
  //     `toggleMapMode('auto')` (Phase 6) can restore it instead of re-running
  //     the BLE probe. For Phase 4b the captured value is intentionally not
  //     consumed at runtime (see TODO below); Phase 6 wires the consumer.
  //
  //     04b-CONTEXT.md §Area 3 + 04B-RESEARCH.md §Approach 2.
  const persistedMode = await loadPersistedMapMode(bridge);
  // TODO(ADR-0009): Phase 6 Quick Action [M] — surface `originalBleVerdict`
  // through BootEngineHandle so `toggleMapMode('auto')` can restore the BLE
  // verdict without re-probing (Pitfall 7). For Phase 4b the variable is
  // intentionally retained but unused at runtime — the `void` discard suppresses
  // the strict `noUnusedLocals` flag while preserving the captured value for the
  // Phase 6 wiring boundary.
  const originalBleVerdict = verdict;
  void originalBleVerdict;
  if (persistedMode === 'raster' || persistedMode === 'glyph') {
    rasterController.setBleVerdict(persistedMode);
    layerManager.setMapMode(persistedMode);
  }
  // Effective verdict for downstream layer construction — honours the override
  // when present, falls back to the BLE verdict otherwise. `IdleInfillLayer`'s
  // 'raster' vs 'glyph' render branch reads from this so the override propagates
  // into the initial layer composition, not just the in-memory state.
  const effectiveVerdict: 'auto' | 'raster' | 'glyph' =
    persistedMode === 'raster' || persistedMode === 'glyph' ? persistedMode : verdict;

  // 9d. D-25.3 / RPROMO-02 — Glyph-fallback render-mode wire.
  //     Step 7 unconditionally flipped renderMode to 'canvas' (the raster default).
  //     Here, when the effective verdict is 'glyph' (either from the BLE probe at step 9
  //     or the persisted override at step 9b), we ALSO flip the LayerManager HUD schema
  //     selector back to 'glyph' so the next bundle([]) emits the 3-container text schema
  //     (header id4 + footer id5 + status-hud id6) instead of buildHudRasterPageSchema().
  //     This covers BOTH the BLE-degraded path and the persisted-glyph override in one
  //     single wire site keyed on effectiveVerdict (Pitfall 3 in 25-RESEARCH.md).
  //     setMapMode calls at steps 9/9b are LEFT INTACT — they govern the MAP layer render
  //     mode (raster/glyph map rendering), NOT the HUD schema selector.
  if (effectiveVerdict === 'glyph') {
    layerManager.setRenderMode('glyph');
  }

  // 9c. (Phase 5 / I18N-02) Locale override read-back — device-local override from
  //     Even Hub `view.locale.override`. 'auto' (or missing/invalid/read-failure —
  //     all coerce to 'auto' via `loadLocaleOverride`'s defensive fallback) lets the
  //     boot-time auto-detected locale win; otherwise the stored value overrides.
  //
  //     ES/FR/PT-BR are best-effort per I18N-05: `getLabel(field, 'es')` falls back
  //     to the EN string for each i18n key. Device-local — never modifies Foundry
  //     world settings (I18N-02 constraint verified by no-`game.settings.set` audit).
  //
  //     Phase 5 CONTEXT.md §Area 4 + 05-RESEARCH.md §Pattern 5.
  const localeOverride = await loadLocaleOverride(bridge);
  const effectiveLocale: BootEngineLocale =
    localeOverride === 'auto' ? opts.locale : localeOverride;

  // 10. Construct the 3 layers.
  //
  // Phase 10 Plan 10-01 (D-Area1): SeqTracker was moved to step 5a (pre-handshake)
  // and is already constructed above. It is shared with the WS event bus (for observe)
  // and WsReconnectController (for getLastConfirmedSeq). In-memory only — seq is lost
  // on Even App reload (acceptable for single-tenant MVP).
  // (seqTracker declared at step 5a above)

  // Phase 10 Plan 10-02 (D-Area1 / T-10-02) — opt-in perf probe construction.
  //
  // Activation priority:
  //   1. `opts.perfProbe === true` — explicit boot flag (highest priority)
  //   2. `?probe=true` URL param — browser entry path (Even Realities App WebView)
  //   3. Default: disabled (zero overhead)
  //
  // The probe records timestamps at 4 g2-app stations per action flow
  // (gesture_emit, bridge_post, result_envelope, toast_queued). The 5th station
  // (handler_invoke) is server-side and approximated in PerfProbe.flush().
  //
  // T-10-02: idempotencyKey is NEVER stored or transmitted in clear-text;
  // hashIdempotencyKey() reduces it to sha256-trunc-16 before envelope construction.
  // The PerfSampleEnvelopeSchema enforces ^[0-9a-f]{16}$ as the schema gate.
  const perfProbeEnabled =
    opts.perfProbe === true ||
    (typeof window !== 'undefined' &&
      new URL(window.location.href).searchParams.get('probe') === 'true');

  // quick-task 260529-khy Wave 1 (BLOCKER 2 outbound) — stable outbound holder.
  //
  // Construct the WsSender ONCE here, BEFORE perfProbe + the outbound panels, so every
  // outbound sender (perfProbe.wsSend, SlotPickerPanel, both ActionOptionsModal sites)
  // routes through this single indirection. On WS reconnect the onReconnected handler
  // calls `wsSender.swap(newWs)` and every sender targets the new live socket with no
  // re-wiring — the holder satisfies the narrow panel `{ send(data:string):void }`
  // shape, so it is passed in place of the raw ws with no constructor churn.
  // INBOUND listeners cannot be redirected this way (addEventListener binds to a socket
  // instance) — they are disposed-and-re-attached against newWs in onReconnected below.
  const wsSender = new WsSender(ws);

  const perfProbe = new PerfProbe({
    enabled: perfProbeEnabled,
    sessionId: handshake.session_id,
    wsSend: (env) => {
      wsSender.send(JSON.stringify(env));
    },
    seqProvider: () => seqTracker.getLastConfirmedSeq() + 1,
  });

  // quick-task 260605-e9t — late-bind perfProbe into the bus created at step 5a.
  // Now that handshake.session_id is available and perfProbe is constructed, wire
  // it into wsEventBus so subsequent inbound envelopes trigger the result_envelope
  // station mark (Phase 10 Plan 10-02 / D-Area1). Envelopes that arrived before
  // this call (during handshake) are already cached in lastByChannel but will NOT
  // retroactively trigger a mark — they predate the session context, by design.
  wsEventBus.setPerfProbe(perfProbe);

  const mapBase = new MapBaseLayer(bridge, rasterController, renderGlyphScene, layerManager);
  const idleInfill = new IdleInfillLayer(bridge, effectiveVerdict === 'glyph' ? 'glyph' : 'raster');

  // CR-03 fix: only construct StatusHudLayer in glyph mode. In canvas mode the
  // glyph StatusHudLayer's 30s heartbeat would fire bridge.textContainerUpgrade
  // calls targeting container id=6 ('status-hud'), which does NOT exist in the
  // HUD raster page schema (buildHudRasterPageSchema creates only 4 image tiles +
  // 1 text capture = 5 containers; no id=6). Those calls are silently swallowed by
  // the `void` operator but produce a background error storm every 30s. Deferring
  // construction to glyph mode eliminates the spurious write loop entirely.
  // CanvasStatusHudLayer (constructed below) is the sole HUD renderer in canvas mode.
  const statusHud =
    layerManager.getRenderMode() === 'glyph'
      ? new StatusHudLayer({
          bridge,
          renderer: new StatusHudRenderer({ locale: effectiveLocale }),
          // Phase 10 Plan 10-01: seqTracker is shared with the bus created at step 5a
          // (no additional observe wiring needed here — globalHandler already calls it).
          // Phase 10 Plan 10-02: perfProbe late-bound via wsEventBus.setPerfProbe above.
          // Pass the SAME wsEventBus instance (created at step 5a, persistent listener
          // already attached) — the StatusHudLayer.subscribeWsEvents call will replay
          // any character.delta cached during boot steps 6-9c.
          wsEvents: wsEventBus,
        })
      : null;

  // Phase 20 Plan 05 — CanvasStatusHudLayer for the canvas boot path.
  //
  // Constructed here (step 10, after wsEventBus is available at step 5a) so it
  // can subscribe to `character.delta` with last-value-replay. It is the SOLE
  // layer mounted in canvas mode (bundle step 12 below) because
  // `_assertContainerBudget()` in canvas mode requires ALL mounted layers to
  // return `{image:0, text:0}`, and the glyph layers (MapBaseLayer: {4,1} or
  // {0,1}; StatusHudLayer/IdleInfillLayer/ToastQueueLayer: {0,1}) all fail that
  // check. CanvasStatusHudLayer returns `{image:0, text:0}` and satisfies the
  // canvas budget (isCanvasLayer predicate passes for it in layer-manager.ts).
  //
  // The glyph layers (mapBase, idleInfill, statusHud, toastQueue) are still
  // constructed and destroyed in teardown — they hold subscriptions and are
  // preserved for the future gesture-opened map-mode path (Phase 20+).
  //
  // `getCaptureContainer()` returns `'hud-capture'` (id=4, 576×288,
  // isEventCapture=1) — satisfies `_assertCaptureInvariant()` which requires
  // exactly 1 capture provider when no glyph MapBaseLayer is mounted.
  const canvasStatusHud = new CanvasStatusHudLayer({
    wsEvents: wsEventBus,
    // FPS indicator (user request 2026-06-10): displayed-frame rate from the
    // delta driver, rendered in the top-right corner card (layout B).
    getFps: () => hudDeltaDriver.getFps(),
    // Card-content changes outside WS deltas (fps ticker, [F] toggle) kick the
    // debounced delta loop so the changed tiles reach the glasses.
    onDirty: () => hudDeltaDriver.requestCycle(),
  });

  // FPS indicator enable flag — default ON, persisted in the Even Hub kv store
  // (NEVER localStorage — sandboxed WebView, CLAUDE.md hard rule). '0' = off,
  // anything else (including missing/'' on first run) = on. Fail-soft: a kv
  // read error keeps the default ON.
  let fpsIndicatorOn = true;
  // Boot-race guard: the kv read below is async, but the [F] toggle handler can
  // fire during the boot window (R1 source attaches before the read resolves).
  // Without this flag the late kv apply unconditionally clobbers an early toggle
  // (stored !== '0' always wins), silently reverting the user's [F] press. Once
  // the user has toggled, the persisted value is already in sync (the toggle
  // writes it) so the boot-time read must NOT re-apply.
  let fpsUserToggled = false;
  void Promise.resolve(bridge.getLocalStorage(FPS_INDICATOR_KV_KEY))
    .then((stored: string) => {
      if (fpsUserToggled) {
        // User toggled during the boot window — their choice (and its persisted
        // value) wins; do not overwrite with the pre-toggle stored value.
        return;
      }
      fpsIndicatorOn = stored !== '0';
      canvasStatusHud.setFpsIndicatorEnabled(fpsIndicatorOn);
    })
    .catch(() => {
      /* default ON */
    });

  // Dither mode flag — driven SOLELY by the synced Foundry `mapDither` setting
  // (display-settings sync below), default OFF. 2026-06-14: the old independent
  // Even Hub kv toggle (`view.hud.dither`) was removed — it could latch dither ON
  // across reboots regardless of the setting ("always dithering" bug). Now dither
  // is a single source of truth: the Foundry setting. getDitherMode reads this
  // live each render cycle, so a settings change (local [D] toggle → upstream →
  // echo, or a DM change) takes effect on the next cycle without reconstruction.
  let ditherOn = false;

  // Bidirectional display-settings sync (latency audit 2026-06-14). Subscribes
  // to the `settings.display` channel (the bridge replays the cached snapshot on
  // connect + fans out changes) so the glasses mirror the live Foundry values,
  // and exposes `sendEdit()` for the menu to push glasses-originated changes
  // upstream. onUpdate realigns the local dither mirror to Foundry's canonical
  // value (Foundry wins) and repaints. `wsSender` + `hudDeltaDriver` are both in
  // scope here (constructed above).
  // Phone-side settings panel (2026-06-14): the five display settings are
  // adjusted on the PHONE (DOM control surface), not via on-glasses gestures.
  // Late-bound so the sync's onUpdate can refresh it; assigned just below.
  let phoneSettings: PhoneSettingsPanel | null = null;
  const displaySettingsSync = createDisplaySettingsSync(wsEventBus, wsSender, (settings) => {
    if (typeof settings.dither === 'boolean' && settings.dither !== ditherOn) {
      ditherOn = settings.dither;
      hudDeltaDriver.requestCycle();
    }
    // Reflect downstream Foundry changes into the phone controls.
    phoneSettings?.update(settings);
  });
  phoneSettings = createPhoneSettingsPanel({
    sendEdit: (edit) => displaySettingsSync.sendEdit(edit),
    initial: displaySettingsSync.get(),
    locale: opts.locale,
  });

  // Phase 27 (quick-task 260610-d42) — MapCanvasLayer at z=0 for canvas mode.
  //
  // Constructed alongside CanvasStatusHudLayer so both are available for the
  // canvas-mode bundle step below. The onFrame callback triggers
  // hudDeltaDriver.requestCycle() — each new Foundry frame kicks the debounced
  // delta loop so only changed sub-tiles are pushed to the glasses.
  //
  // canvas mode routes scene frames to this compositor MapCanvasLayer (z=0);
  // the RasterController map-tile path is reserved for the glyph fallback only
  // — see debug map-frame-pipeline-dims, no dual map-tile/HUD contention.
  const mapCanvas = new MapCanvasLayer({
    onFrame: () => {
      hudDeltaDriver.requestCycle();
    },
  });

  // 11. Wire Plan 06 — attach the WS frame_pixels receiver so Foundry-side
  //     canvas extractions route to the appropriate sink:
  //       - canvas mode: MapCanvasLayer.setFrame (no Worker round-trip)
  //       - glyph mode:  RasterController.requestFrame (Worker + dither pipeline)
  // quick-task 260529-khy — INBOUND unsubs are `let` so onReconnected can
  // dispose-before-reattach against newWs; the teardown reads the current value.
  let unsubSceneInput = attachSceneInputToWs(
    ws,
    layerManager.getRenderMode() === 'canvas' ? mapCanvas : rasterController,
  );

  // 11a. Phase 10 Plan 10-01 — WS reconnect controller (D-Area1 / SC-1 / T-10-01).
  //
  //     Attaches a 'close' listener to `ws`. On close:
  //       1. StatusHudLayer.setSyncLost() mounts the ⚠ SYNC LOST chip (D-Area1).
  //       2. Exponential backoff [1s,2s,4s,8s,15s,30s] until handshake succeeds.
  //       3. On success: sends client_resume {last_seq: seqTracker.getLastConfirmedSeq()}.
  //       4. bridge returns resume_replay → chip unmounts (onChipUnmount).
  //       5. bridge returns resume_full_snapshot → seqTracker.reset() + onFullRefreshRequired
  //          (T-10-01 mitigation — stale-seq forced full refresh via REST GET /v1/actor).
  //
  //     SYNC LOST chip persistence is in-memory only — DO NOT persist to Even Hub kv store.
  //     Per D-Area5 T-10-01: full_refresh_required fires BEFORE any further envelope forwarding.
  //
  //     quick-task 260529-khy — the controller is CONSTRUCTED LATER (after all INBOUND
  //     dispatchers are declared) because its `onReconnected` handler must dispose +
  //     re-attach every inbound `let` unsub against newWs. Forward-declared here so the
  //     surrounding wiring + teardown ordering comments stay anchored to step 11a.
  let wsReconnect: WsReconnectController;

  // 11b. R1 gesture bridge — WS `r1.gesture` envelopes → PanelGestureBus publish.
  //      Must run AFTER step 7 `setNegotiatedCaps` so LayerManager's negotiated
  //      caps are consistent before gestures can flow (RESEARCH §Q2 / BERW-08).
  //      `DEFAULT_R1_TIMINGS` is the Phase 6 default; SC-06-01 hardware-tuning
  //      closure may adjust the tap/double-tap windows in a future phase.
  const gestureBus = new PanelGestureBus();
  let unsubR1 = attachR1EventSource(ws, gestureBus, layerManager, DEFAULT_R1_TIMINGS);

  // 11b+. SDK touch-event gesture source — the PRODUCTION input path.
  //       Touchpad/ring gestures arrive via `bridge.onEvenHubEvent` textEvent
  //       (eventType 0-3 on the capture container), NOT as WS `r1.gesture`
  //       envelopes (those exist only via the bridge /debug/simulate-gesture
  //       route). Without this producer, real-hardware and simulator touch
  //       input never reached the PanelGestureBus (debug
  //       canvas-sheet-overlay-wont-open, 2026-06-09). `onPublish` schedules a
  //       debounced recomposite so gesture-driven canvas-layer state changes
  //       (menu selection, sheet tab nav) repaint without waiting for the next
  //       Foundry delta. Survives WS reconnects (SDK stream, not WS-bound).
  const unsubGlassesEvents = attachGlassesEventSource(bridge, gestureBus, layerManager, {
    onPublish: () => {
      hudDeltaDriver.requestCycle();
    },
  });

  // 11c. LocaleEventEmitter singleton + QuickActionMenuPanel factory + over-scroll dispatcher.
  //      The `makeMenu` factory is a closure that captures boot-time references (bridge,
  //      bus, locale, localeEvents) and constructs a fresh `QuickActionMenuPanel` on
  //      each `pushOverlay` call (factory pattern — panel state is ephemeral, not cached).
  //
  //      `currentLocaleOverride` threads the step 9c read-back so the menu's language
  //      sub-menu starts with the correct current override rather than 'auto' (I18N-02).
  //
  //      WR-03 fix: `makeMenu` must read the CURRENT effective locale at call time, not
  //      the boot-time value captured by the outer closure. Two mutable refs are
  //      maintained here and updated by a localeEvents listener so every subsequent
  //      over-scroll produces a menu in the user's live locale, not the boot locale.
  //
  //      The `makeMenu` callbacks:
  //        onClose    → `popOverlay(lm)` — suspends/restores the panel below the menu.
  //        onNavigate → `openPanel(target, deps)` — navigates to a Phase 5 panel.
  //        onMapModeToggle → Phase 4b map-mode-toggle stub; TODO(ADR-0009): Phase 7.
  //        onAction   → Phase 7 stub — no-op with console.warn telemetry.
  const localeEvents = new LocaleEventEmitter();

  const panelRouter = new PanelRouter();
  await panelRouter.discoverPanels();

  // WR-03: mutable refs updated by localeEvents so makeMenu always uses the live locale.
  // Initialised from step 9c values (post-override read-back).
  let currentMenuLocale: BootEngineLocale = effectiveLocale;
  let currentMenuOverride: LocaleOverride = localeOverride === 'auto' ? 'auto' : localeOverride;

  // T10: live locale holder for the NAVIGATION construction sites (openPanel,
  // quick-action [S]/[I], the action-overlay factories). `effectiveLocale` is a
  // boot-time `const` captured by those closures, so without this mutable holder an
  // on-glasses [N] Language change only updated the menu chrome — every panel/modal
  // opened afterwards stayed in the boot locale until reboot. The closures below read
  // `currentLocale` at OPEN time instead of capturing the const, so the live locale
  // reaches them. Device-local override only — never writes world settings (§7.16).
  let currentLocale: BootEngineLocale = effectiveLocale;

  // T10: the live WS socket. Starts as the boot socket `ws`; `onReconnected`
  // updates it to `newWs`. The locale-change re-attach listener (after the
  // WsReconnectController) re-binds the locale-dependent message dispatchers
  // against THIS socket so they pick up a new [N] Language choice without reboot.
  let liveWs: WebSocket = ws;

  const unsubMenuLocale = localeEvents.on('changed', (code) => {
    // 'auto' means revert to the boot-detected locale (opts.locale). Any specific
    // locale code takes effect directly as both the render locale and the stored override.
    const nextLocale: BootEngineLocale = code === 'auto' ? opts.locale : (code as BootEngineLocale);
    currentMenuLocale = nextLocale;
    currentMenuOverride = code;
    // T10: keep the navigation-site locale live alongside the menu chrome.
    currentLocale = nextLocale;
  });

  // Quick-task (canvas Log/Inventario/Libro fix) — one-shot tab override for the
  // canvas character sheet. Set by `onNavigate` when the Quick Action menu routes
  // `[I] Inventario`/`[B] Libro` to the sheet on a specific tab; read by the
  // `canvas-character-sheet` instance handler (step 11d-iv) which calls
  // `setInitialTab` BEFORE onMount, then reset to null. Typed as the literal tab
  // ids the sheet's `setInitialTab` accepts (structurally a `TabId`).
  let pendingCanvasSheetTab: 'inventory' | 'spells' | null = null;

  const makeMenu = (): QuickActionMenuPanel => {
    return new QuickActionMenuPanel(
      bridge,
      gestureBus,
      currentMenuLocale, // WR-03: live locale, not boot-time capture
      currentMenuOverride, // WR-03: live override, not boot-time capture
      localeEvents,
      {
        onClose: () => {
          void panelRouter.popOverlay(layerManager);
        },
        onNavigate: (target) => {
          // CR-01 fix: clear the overlay stack BEFORE calling openPanel.
          // The menu was mounted via pushOverlay, which may have suspended a
          // primary panel onto overlayStack. openPanel calls _closeActiveInternal
          // (destroys the menu at z=2) but does NOT touch overlayStack. Without
          // clearOverlayStack(), a subsequent popOverlay call would erroneously
          // restore the pre-menu panel on top of the freshly navigated target.
          // clearOverlayStack() is safe here: suspended panels had onUnmount
          // called when they were pushed, so no additional cleanup is needed.
          panelRouter.clearOverlayStack();

          // Plan 21-03 — renderMode-gated character sheet dispatch (RCSP-BOOT-CANVAS/GLYPH).
          // When the quick-action menu emits target='character-sheet' and the render mode
          // is 'canvas', open the canvas-mode panel instead of the glyph panel.
          // The two panels share the same PERSIST_KEY (view.sheet.lastTab) so tab state
          // is preserved across mode switches.
          // Pitfall 2 from 21-RESEARCH.md: do NOT sort panels by id — gate at dispatch time.
          //
          // Plan 23-03 — renderMode-gated combat tracker dispatch (RCOMB-01 / D-23.5).
          // When target='combat-tracker' and renderMode='canvas', open the canvas overlay panel
          // instead of the glyph panel. panel-router.ts + panel-gesture-bus.ts are NOT modified
          // (D-23.5 — routing is achieved via this boot-time gate + setPanelInstanceHandler only).
          // Pitfall 2 (23-RESEARCH.md): gate here at dispatch, never rely on glob/sort order.
          // Quick-task (canvas Log/Inventario/Libro fix) — in canvas mode the glyph
          // Log/Inventory/Spellbook panels declare {image:0,text:1} and trip
          // LayerManager._assertContainerBudget (canvas layers MUST be {0,0}). Remap them
          // to canvas-mode panels here, mirroring the 'character-sheet'/'combat-tracker'
          // gates above (Pitfall 2: gate at dispatch, never rely on glob/sort order):
          //   - 'inventory' → canvas-character-sheet on the INV tab (reuses the sheet's
          //     existing renderInventoryTabContent — the canvas inventory render exists).
          //   - 'spellbook' → canvas-character-sheet on the SPL tab (reuses renderSpellsTabContent).
          //   - 'log'       → canvas-log (thin CanvasLayer reusing renderLogContent rows).
          // The pre-selected tab is recorded so the 'canvas-character-sheet' instance
          // handler (step 11d-iv) can call setInitialTab BEFORE onMount. This override is
          // single-use and NOT persisted, so the user's default sheet tab is preserved.
          const isCanvas = layerManager.getRenderMode() === 'canvas';
          pendingCanvasSheetTab =
            isCanvas && target === 'inventory'
              ? 'inventory'
              : isCanvas && target === 'spellbook'
                ? 'spells'
                : null;
          const resolvedTarget =
            target === 'character-sheet' && isCanvas
              ? 'canvas-character-sheet'
              : target === 'combat-tracker' && isCanvas
                ? 'canvas-combat-tracker'
                : isCanvas && target === 'inventory'
                  ? 'canvas-character-sheet'
                  : isCanvas && target === 'spellbook'
                    ? 'canvas-character-sheet'
                    : isCanvas && target === 'log'
                      ? 'canvas-log'
                      : target;

          void panelRouter.openPanel(resolvedTarget, {
            bridge,
            layerManager,
            gestureBus,
            negotiatedCaps: negotiatedCaps,
            // T10: read the live locale at open time so a navigated panel renders
            // in the user's current [N] Language choice, not the boot-time const.
            locale: currentLocale,
          });
        },
        onMapModeToggle: () => {
          // [M] Map control. In canvas mode the map is ALREADY the z=0 full-screen
          // background (MapCanvasLayer) — there is no separate "map mode" to toggle.
          // Surface a brief toast as feedback for the intentional no-op. The toast
          // is now safe: `toastQueue` is the canvas `CanvasToastLayer` in canvas mode
          // (drawn ON the canvas), so it no longer corrupts the image-tile page.
          if (layerManager.getRenderMode() === 'canvas') {
            toastQueue.enqueue(buildMapAlreadyFullscreenToast(currentLocale));
            return;
          }
          // Glyph mode: the real toggle (toggleMapMode) is a Phase 7 stub — no glyph
          // toggle has shipped yet, so surface the same feedback via the text toast.
          toastQueue.enqueue(buildMapAlreadyFullscreenToast(currentLocale));
        },
        onAction: () => {
          // [A] Azione. The Action panel is not yet shipped (Phase 7). Surface a
          // brief, non-blocking toast so the gesture has feedback instead of a
          // silent dead-end. Renders on the canvas (CanvasToastLayer) in canvas
          // mode / via the text container in glyph mode — both safe.
          toastQueue.enqueue(buildActionPendingToast(currentLocale));
        },
        onFpsToggle: () => {
          // [F] FPS — flip the indicator, persist to the Even Hub kv store
          // (fire-and-forget; a failed write only loses persistence, not the
          // in-session toggle).
          // Mark that the user has expressed an explicit preference so a still
          // in-flight boot-time kv read does not clobber this toggle.
          fpsUserToggled = true;
          fpsIndicatorOn = !fpsIndicatorOn;
          canvasStatusHud.setFpsIndicatorEnabled(fpsIndicatorOn);
          void Promise.resolve(
            bridge.setLocalStorage(FPS_INDICATOR_KV_KEY, fpsIndicatorOn ? '1' : '0'),
          ).catch((err: unknown) => {
            console.warn('[boot-engine-core] onFpsToggle: kv persist failed', String(err));
          });
        },
        // Dither + brightness are no longer on the glasses menu — they (and the
        // other display settings) are adjusted on the phone settings panel
        // (2026-06-14). displaySettingsSync still drives the live dither value.
      },
      // Pass the live render mode so the menu uses the correct container strategy:
      // canvas → 'hud-capture' (zero self-declared count, ADR-0013 Amendment 1);
      // glyph  → 'overlay-block' (one text slot, ADR-0009 Amendment 1).
      layerManager.getRenderMode(),
    );
  };

  const unsubOverscroll = attachQuickActionOverscroll(
    gestureBus,
    panelRouter,
    layerManager,
    makeMenu,
  );

  // 11c-exit. EXIT-01 / LIFE-03 — root-page exit. A double-tap while the bare map
  //           (id 'map-base', no overlay) is the top layer calls
  //           `bridge.shutDownPageContainer(1)` (Mode 1 graceful exit dialog). On
  //           overlay panels double-tap is close/back (handled by the panel), so the
  //           dispatcher only fires at the root. See ADR-0012 D-4.
  const unsubRootExit = attachRootExit(gestureBus, layerManager, bridge);

  // 11c-nav. NAV-CLOSE-01 — nav-panel close dispatcher (ADR-0012 D-3).
  //          A double-tap while a nav panel (character-sheet, combat-tracker, etc.) is
  //          the top z=2 layer calls panelRouter.popOverlay(lm). Panels that self-manage
  //          double-tap (modals, pickers, the Quick Action menu) declare
  //          handlesDoubleTap=true and are skipped by the dispatcher.
  const unsubNavPanelClose = attachNavPanelClose(gestureBus, panelRouter, layerManager);

  // 11d. Conc-conflict dispatcher — closes the Plan 04b-05 deferred wire.
  //      Subscribes to `conc.conflict` WS envelopes and mounts the concentration-drop
  //      modal at z=2 when a conflict is detected (CONC-01 flow, CCD-3 / ISM-10).
  //      The dispatcher uses the double trust boundary pattern (T-06-04-04 mitigation).
  //
  //      Plan 09-03: toastQueue is constructed before attaching the dispatcher so the
  //      modal's [N] cancel path can enqueue the concentration-cancelled error toast
  //      (CDM-CANCEL-01). toastQueue declaration moved here from step 11e.
  // Toast sink — canvas mode draws toasts ON the canvas (CanvasToastLayer mounted
  // at z=1.5, composited with the map/status image tiles); glyph mode uses the
  // text-container ToastQueueLayer. The glyph layer's `textContainerUpgrade` is
  // INCOMPATIBLE with the canvas image-tile page (it blanks the display until
  // restart — the canvas-toast-overlay TODO this resolves), so canvas mode MUST
  // use the canvas layer. Both expose the same `enqueue(toast)` sink, so every
  // dispatcher below is wired identically via `toastQueue`. `canvasToast` is the
  // typed CanvasLayer ref mounted in the canvas bundle (step 12).
  const canvasToast =
    layerManager.getRenderMode() === 'canvas'
      ? new CanvasToastLayer({ onDirty: () => hudDeltaDriver.requestCycle() })
      : null;
  const toastQueue: ToastSink & { destroy(): void } =
    canvasToast ?? new ToastQueueLayer({ bridge });

  // Phase 10 Plan 10-02 — perf probe station 5: toast_queued.
  //
  // Wrap `toastQueue.enqueue` to mark the toast_queued station for action-result
  // flows. The idempotencyKey is extracted from the toast id when the id follows
  // the pattern `"action-result-<idempotencyKey>"` (set by action-result-dispatcher
  // per ACT-01 plan — "Toast id: action-result-<idempotencyKey>").
  //
  // The wrapped enqueue delegates to the original implementation without any
  // observable difference in production. When the probe is disabled, the
  // original.enqueue is invoked directly (zero overhead wrapper is effectively
  // transparent). The binding ensures `this` context is preserved.
  //
  // Deferred (SC-10-02): gesture_emit (station 1) and bridge_post (station 2) require
  // idempotencyKey threading from the ActionOptionsModal → R1EventSource path.
  // Full wiring deferred to Phase 10 Plan 03 or SC-10-02 hardware field test.
  // For Plan 10-02, gesture_emit and bridge_post are omitted from auto-flush;
  // the flush is triggered externally by the caller (not auto-flush on toast_queued).
  if (perfProbeEnabled) {
    const originalEnqueue = toastQueue.enqueue.bind(toastQueue);
    toastQueue.enqueue = (toast) => {
      if (typeof toast.id === 'string' && toast.id.startsWith('action-result-')) {
        const idempotencyKey = toast.id.slice('action-result-'.length);
        perfProbe.mark('toast_queued', idempotencyKey);
        void perfProbe.flush(idempotencyKey);
      }
      originalEnqueue(toast);
    };
  }

  let unsubConcConflict = attachConcConflictHandler(
    ws,
    bridge,
    gestureBus,
    layerManager,
    // T10: currentLocale === effectiveLocale at boot; the locale-change listener
    // below re-attaches with the live value after an [N] Language change.
    currentLocale,
    toastQueue, // Plan 09-03: forward for [N] cancel-toast path (CDM-CANCEL-01)
  );

  // 11d-i. Phase 13 Plan 13-04 — reaction-prompt dispatcher (ACT-04).
  //        Listens for `r1.reaction.available` envelopes; mounts ReactionPromptPanel
  //        at z=2 after a 500ms debounce; 5s auto-timeout on inactivity.
  //        `getPlayerActorId` + `getPlayerWeaponId` stub null for MVP — Phase 9
  //        TODO(ADR-0005): resolve actor + weapon IDs from StatusHudLayer snapshot cache.
  let detachReactionPrompt = attachReactionPromptHandler({
    ws: ws as unknown as Parameters<typeof attachReactionPromptHandler>[0]['ws'],
    layerManager,
    bridge,
    gestureBus,
    locale: currentLocale, // T10: live locale (re-attached on [N] change below).
    sessionId: handshake.session_id,
    getPlayerActorId: () => null,
    getPlayerWeaponId: () => null,
  });

  // 11d-ii. Phase 13 Plan 13-04 — portrait-state dispatcher (STRETCH-06).
  //         Listens for `r1.portrait.ready` envelopes; populates portrait-state cache
  //         used by CharacterSheetPanel Bio tab override (D-13-09).
  let detachPortrait = attachPortraitHandler(
    ws as unknown as Parameters<typeof attachPortraitHandler>[0],
  );

  // 11d-iii. Phase 13 Plan 13-04 — character-sheet mapBase injection.
  //          Injects the boot-time MapBaseLayer singleton into CharacterSheetPanel
  //          post-construction via setPanelInstanceHandler (Plan 08-05 pattern).
  //          This allows CharacterSheetPanel.onMount to call setPortraitOverride
  //          when the Bio tab is opened with portrait enabled (D-13-08 slot override).
  panelRouter.setPanelInstanceHandler('character-sheet', (panel) => {
    const sheet = panel as unknown as { setMapBaseLayer: (m: typeof mapBase) => void };
    sheet.setMapBaseLayer(mapBase);
  });

  // 11d-iv. Plan 21-03 — canvas-character-sheet mapBase injection.
  //         Mirror of the 'character-sheet' handler above for the canvas-mode panel.
  //         CanvasCharacterSheetPanel.setMapBaseLayer wires the portrait-slot override
  //         (slot 3) on onMount/onUnmount (Plan 21-04 adds portrait fetch — this handler
  //         ensures the mapBase ref is available at panel construction time).
  //
  //         BLOCKER-01 fix: also inject wsEventBus so onMount can subscribe to
  //         character.delta. Without this call all 6 tabs render null/empty at runtime
  //         because onSnapshot has zero callers. Pattern mirrors the
  //         'canvas-combat-tracker' handler at step 11j below.
  //
  //         Pitfall 5 (21-PATTERNS.md): do NOT subscribe here — injection only.
  panelRouter.setPanelInstanceHandler('canvas-character-sheet', (panel) => {
    const sheet = panel as unknown as {
      setMapBaseLayer: (m: typeof mapBase) => void;
      setWsEventBus: (bus: typeof wsEventBus) => void;
      setInitialTab: (tab: 'inventory' | 'spells' | null) => void;
    };
    sheet.setMapBaseLayer(mapBase);
    sheet.setWsEventBus(wsEventBus);
    // Quick-task (canvas Inventario/Libro fix) — apply + consume the one-shot tab
    // override recorded by onNavigate so `[I]` opens the INV tab and `[B]` the SPL
    // tab. Reset immediately so a later plain `[S] Scheda` open restores the
    // persisted tab (the override is single-use, never persisted).
    sheet.setInitialTab(pendingCanvasSheetTab);
    pendingCanvasSheetTab = null;
  });

  // 11d-v. Quick-task (canvas Log fix) — canvas-log wsEventBus injection.
  //         The canvas-mode log panel (opened when target='log' && renderMode='canvas')
  //         subscribes to LOG_DELTA_TYPE in onMount to receive live chat-log snapshots.
  //         Without this injection the panel still mounts (no container-budget throw)
  //         and renders the empty state, but shows no log entries. Mirrors the
  //         canvas-character-sheet / canvas-combat-tracker wsEventBus injection.
  //         Pitfall 5 (21-PATTERNS.md): inject only — do NOT subscribe here.
  panelRouter.setPanelInstanceHandler('canvas-log', (panel) => {
    const logPanel = panel as unknown as { setWsEventBus: (bus: typeof wsEventBus) => void };
    logPanel.setWsEventBus(wsEventBus);
  });

  // 11e. Action result dispatcher (Plan 08-01) — listens on `r1.action.result` envelopes
  //      and enqueues typed toasts via ToastQueueLayer (T-08-01-01 + T-08-02-01 mitigations).
  //
  //      `currentUserId` filters cross-player leaks (T-08-02): the bearer user_id is not
  //      yet surfaced through the handshake schema in Plan 08-05. Plan 09+ will wire the
  //      real user_id from the bearer registry; for now a '<unknown>' stub ensures the
  //      dispatcher is correctly wired while ISM-W8-07 verifies the filter with synthetic
  //      userIds. TODO(ADR-0005): resolve bearer user_id through handshake in Phase 9.
  // NOTE: toastQueue is now declared above in step 11d (Plan 09-03 move).
  const currentUserId = '<unknown>';
  let unsubActionResult = attachActionResultHandler(
    ws as unknown as Parameters<typeof attachActionResultHandler>[0],
    toastQueue,
    currentLocale, // T10: live locale (re-attached on [N] change below).
    currentUserId,
  );
  // Phase 9 Plan 09-02 — wire action economy dispatcher (BERW-13..16).
  // Attached AFTER attachActionResultHandler so teardown reverse-order is:
  //   unsubActionEconomy → unsubActionResult → unsubConcConflict → ...
  let unsubActionEconomy = attachActionEconomyHandler(
    ws as unknown as Parameters<typeof attachActionEconomyHandler>[0],
    currentUserId,
  );

  // 11e-recon. quick-task 260529-khy — construct the WsReconnectController now that all
  //   INBOUND `let` unsubs exist. The onReconnected handler performs the FULL R1 rewire:
  //     (1) wsSender.swap(newWs)            → OUTBOUND senders (perfProbe + panels) hit newWs.
  //     (2) dispose + re-attach all 7 INBOUND listeners against newWs (a holder cannot
  //         redirect an addEventListener binding — these are disposed-then-re-attached).
  //     (3) statusHud.rebindWsEvents(createWsEventBus(newWs, …)) → the 3 HUD channels.
  //   Senders use a holder (no re-wire); listeners re-attach (binding is socket-specific).
  //   Dispatcher-spawned senders (conc-conflict / reaction-prompt / template-placement)
  //   need no holder — they are re-attached here as inbound listeners with newWs, so every
  //   panel they spawn post-reconnect sends to newWs automatically.
  wsReconnect = new WsReconnectController({
    ws,
    url: toWsConnectUrl(opts.bridgeUrl),
    sessionId: handshake.session_id,
    seqTracker,
    wsFactory: deps?.wsFactory ?? ((u: string) => new WebSocket(u)),
    performHandshake: (newWs: WebSocket, sid: string) =>
      // FLV-CHAR-SELECT: re-send characterId on reconnect so the bridge restores the pin.
      performCapabilityHandshake(newWs, opts.token, opts.locale, sid, 10_000, opts.characterId),
    onChipTick: ({ remainingMs }) => {
      // CR-03: statusHud is null in canvas mode — no chip display in canvas path yet.
      statusHud?.setSyncLost({ retryInMs: remainingMs });
    },
    onChipUnmount: () => {
      // CR-03: statusHud is null in canvas mode — no-op.
      statusHud?.setSyncLost(null);
    },
    onFullRefreshRequired: () => {
      // Deferred (SC-10-01): wire to REST GET /v1/actor for full actor re-fetch.
      // Out of scope for Plan 10-01 (bridge resume protocol is client-side only).
      // T-10-01 mitigation is in place: seqTracker.reset() was already called in
      // WsReconnectController._attachResumeListener before this callback fires.
      console.warn(
        '[boot-engine-core] onFullRefreshRequired: T-10-01 full refresh needed — ' +
          'REST GET /v1/actor wiring deferred to Plan 10-04 (D-Area5 SC-10-01).',
      );
    },
    onReconnected: (newWs: WebSocket) => {
      // (1) OUTBOUND — redirect every sender (perfProbe + SlotPicker + both
      //     ActionOptionsModal) to the new live socket via the stable holder.
      wsSender.swap(newWs);

      // T10: track the live socket so the locale-change re-attach listener (below)
      // re-binds the locale-dependent dispatchers against the CURRENT socket, not
      // the dead original `ws`.
      liveWs = newWs;

      // (2) INBOUND — dispose-before-reattach all 7 listeners against newWs. reactionPrompt
      //     + portrait are included here (the two sources MISSED in v1 of the rewire).
      unsubSceneInput();
      unsubSceneInput = attachSceneInputToWs(
        newWs,
        layerManager.getRenderMode() === 'canvas' ? mapCanvas : rasterController,
      );

      unsubR1();
      unsubR1 = attachR1EventSource(newWs, gestureBus, layerManager, DEFAULT_R1_TIMINGS);

      unsubConcConflict();
      unsubConcConflict = attachConcConflictHandler(
        newWs,
        bridge,
        gestureBus,
        layerManager,
        // T10: re-attach with the live locale (a locale change may have happened
        // while the socket was down).
        currentLocale,
        toastQueue,
      );

      detachReactionPrompt();
      detachReactionPrompt = attachReactionPromptHandler({
        ws: newWs as unknown as Parameters<typeof attachReactionPromptHandler>[0]['ws'],
        layerManager,
        bridge,
        gestureBus,
        locale: currentLocale, // T10: live locale on reconnect re-attach.
        sessionId: handshake.session_id,
        getPlayerActorId: () => null,
        getPlayerWeaponId: () => null,
      });

      detachPortrait();
      detachPortrait = attachPortraitHandler(
        newWs as unknown as Parameters<typeof attachPortraitHandler>[0],
      );

      unsubActionResult();
      unsubActionResult = attachActionResultHandler(
        newWs as unknown as Parameters<typeof attachActionResultHandler>[0],
        toastQueue,
        currentLocale, // T10: live locale on reconnect re-attach.
        currentUserId,
      );

      unsubActionEconomy();
      unsubActionEconomy = attachActionEconomyHandler(
        newWs as unknown as Parameters<typeof attachActionEconomyHandler>[0],
        currentUserId,
      );

      // (3) HUD wsEvents bus — rebind the SHARED wsEventBus's persistent listener
      //     onto newWs. seqProvider already reads the shared seqTracker (no rebind
      //     needed there).
      //
      //     T9 fix: the canvas-mode consumers (hudDeltaDriver, canvasStatusHud,
      //     displaySettingsSync) all subscribed to the SHARED `wsEventBus` created at
      //     step 5a. Re-pointing that bus's single globalHandler at newWs keeps all
      //     three resumed on the live socket while preserving their subscriptions.
      //     The previous code built a throwaway bus and handed it ONLY to statusHud,
      //     which is null in canvas mode (CR-03) — so the shared bus stayed bound to
      //     the dead socket and the HUD silently stopped receiving deltas/settings.
      wsEventBus.rebind(newWs);

      // Non-canvas (glyph) path: statusHud owns its OWN bus instance (constructed at
      // step 10 with `wsEvents: wsEventBus`, but it re-subscribes via rebindWsEvents).
      // CR-03: statusHud is null in canvas mode — this call is a no-op there.
      statusHud?.rebindWsEvents(createWsEventBus(newWs, seqTracker, perfProbe));

      // Repaint the canvas against the now-live socket so any replayed
      // last-value (character.delta) lands on the glasses immediately.
      hudDeltaDriver.requestCycle();
    },
  });

  // 11e-locale. T10 — live-locale re-attach for the message dispatchers.
  //
  // The conc-conflict / reaction-prompt / action-result dispatchers consume the
  // locale at MESSAGE-RECEIVE time inside their persistent listener (they build a
  // modal/panel/toast on each inbound envelope). Their attach closures captured the
  // locale VALUE, so they cannot see an [N] Language change after boot the way the
  // navigation-site closures can (those read `currentLocale` at open time).
  //
  // This listener — registered AFTER `unsubMenuLocale` so `currentLocale` is already
  // updated when it fires — dispose-then-re-attaches the three dispatchers against the
  // LIVE socket with the LIVE locale, mirroring the exact re-attach pattern used in
  // `onReconnected`. This keeps the dispatcher source files untouched (T10 is a
  // boot-engine-core-only change) while making toasts/modals render in the new locale
  // without a reboot. Device-local override only — never writes world settings (§7.16).
  const unsubLocaleReattach = localeEvents.on('changed', () => {
    unsubConcConflict();
    unsubConcConflict = attachConcConflictHandler(
      liveWs,
      bridge,
      gestureBus,
      layerManager,
      currentLocale,
      toastQueue,
    );

    detachReactionPrompt();
    detachReactionPrompt = attachReactionPromptHandler({
      ws: liveWs as unknown as Parameters<typeof attachReactionPromptHandler>[0]['ws'],
      layerManager,
      bridge,
      gestureBus,
      locale: currentLocale,
      sessionId: handshake.session_id,
      getPlayerActorId: () => null,
      getPlayerWeaponId: () => null,
    });

    unsubActionResult();
    unsubActionResult = attachActionResultHandler(
      liveWs as unknown as Parameters<typeof attachActionResultHandler>[0],
      toastQueue,
      currentLocale,
      currentUserId,
    );
  });

  // 11f. Factory closures for Phase 8 action overlays (Plan 08-03 + Plan 08-04).
  //      These closures are registered via setPanelInstanceHandler so they are injected
  //      into the freshly-constructed panel on each openPanel call (post-construction-pre-mount).
  //
  //      makeActionOptions: pushes an ActionOptionsModal for the given request.
  //      makeMovePicker: pushes a MoveDirectionPicker for the given move request.
  //      Both use popOverlay as the onClose callback so the primary panel is restored.
  //
  //      Phase 8 minimal: the `[A]` key dispatches a console.warn stub (Plan 08-05 §NOTE).
  //      The `[M]` key dispatches a console.warn stub (no snapshot-derived token yet).
  //      ISM-W8-04/05 verifies the basic dispatch shape; full wiring is Phase 9.
  //
  //      The handlers are injected as closures capturing boot-time refs (panelRouter,
  //      layerManager, gestureBus, bridge, effectiveLocale) — no global state.

  panelRouter.setPanelInstanceHandler('spellbook', (panel) => {
    const spellbook = panel as unknown as {
      setActionOptionsHandler: (h: ((req: unknown) => void) | null) => void;
    };
    spellbook.setActionOptionsHandler((req) => {
      // Push ActionOptionsModal for the highlighted spell.
      // Dynamically import to avoid circular boot-time dependency.
      void import('../panels/action-options-modal.js').then(({ ActionOptionsModal }) => {
        // Phase 9 Plan 09-04: enrich the request with slot picker data.
        // Reads the cached CharacterSnapshot from StatusHudLayer so the modal
        // and (if needed) SlotPickerPanel have the correct slot availability.
        //
        // Enrichment logic:
        //   1. Look up the spell entry from the cached snapshot's spellbook.
        //   2. Compute availableSlots = slots where level >= spell.level AND value > 0.
        //   3. Cantrip (spell.level === 0): requiresSlotPicker=false, defaultSlotLevel=0.
        //   4. Non-cantrip, single slot: requiresSlotPicker=false (skip picker, cast directly).
        //   5. Non-cantrip, multiple slots: requiresSlotPicker=true (mount SlotPickerPanel).
        //
        // Fail-open: if snapshot is null (no delta received yet), fall back to
        // requiresSlotPicker=false + defaultSlotLevel=0 (cantrip-safe path).
        const baseReq = req as ConstructorParameters<typeof ActionOptionsModal>[3];
        // CR-03: statusHud is null in canvas mode; fall back to null snapshot
        // (same fail-open path as "no delta received yet" below).
        const snapshot = statusHud?.getCachedSnapshot() ?? null;
        const spellEntry = snapshot?.spells.spells.find((s) => s.id === baseReq.itemId);
        const spellLevel = spellEntry?.level ?? 0;
        const availableSlots =
          spellLevel === 0
            ? []
            : (snapshot?.spells.slots.filter((s) => s.level >= spellLevel && s.value > 0) ?? []);
        const requiresSlotPicker = spellLevel > 0 && availableSlots.length > 1;
        const defaultSlotLevel = spellLevel === 0 ? 0 : (availableSlots[0]?.level ?? spellLevel);

        const enrichedReq: ConstructorParameters<typeof ActionOptionsModal>[3] = {
          ...baseReq,
          requiresSlotPicker,
          defaultSlotLevel,
        };

        const openSlotPicker = (): void => {
          // Plan 09-04 BERW-19: after ActionOptionsModal closes with
          // 'slot-picker-needed', push SlotPickerPanel at z=2.
          void import('../panels/slot-picker-panel.js').then(({ SlotPickerPanel }) => {
            const slotPicker = new SlotPickerPanel(
              bridge,
              // quick-task 260529-khy — pass the WsSender holder (structurally satisfies
              // SlotPickerWebSocket `{send}`) so a reconnect's holder.swap redirects this
              // panel's sends to newWs with no re-construction.
              wsSender,
              gestureBus,
              {
                actorId: enrichedReq.actorId,
                spellId: enrichedReq.itemId,
                spellName: enrichedReq.name,
                baseLevel: spellLevel,
                availableSlots,
              },
              // T10: live locale at construction time (factory closure runs on open).
              currentLocale,
              handshake.session_id,
              () => {
                void panelRouter.popOverlay(layerManager);
              },
            );
            void panelRouter.pushOverlay(slotPicker, layerManager);
          });
        };

        const modal = new ActionOptionsModal(
          bridge,
          // quick-task 260529-khy — WsSender holder (satisfies ActionOptionsWebSocket
          // `{send}`); reconnect holder.swap redirects this modal's sends to newWs.
          wsSender,
          gestureBus,
          enrichedReq,
          // T10: live locale at modal-construction time (closure runs on open).
          currentLocale,
          handshake.session_id,
          (reason) => {
            if (reason === 'slot-picker-needed') {
              openSlotPicker();
            } else {
              void panelRouter.popOverlay(layerManager);
            }
          },
          // Phase 9 Plan 09-02: toastQueue passed so preconditioner can emit error toasts.
          toastQueue,
        );
        void panelRouter.pushOverlay(modal, layerManager);
      });
    });
  });

  panelRouter.setPanelInstanceHandler('inventory', (panel) => {
    const inventory = panel as unknown as {
      setActionOptionsHandler: (h: ((req: unknown) => void) | null) => void;
    };
    inventory.setActionOptionsHandler((req) => {
      void import('../panels/action-options-modal.js').then(({ ActionOptionsModal }) => {
        const modal = new ActionOptionsModal(
          bridge,
          // quick-task 260529-khy — WsSender holder (satisfies ActionOptionsWebSocket
          // `{send}`); reconnect holder.swap redirects this modal's sends to newWs.
          wsSender,
          gestureBus,
          req as ConstructorParameters<typeof ActionOptionsModal>[3],
          // T10: live locale at modal-construction time (closure runs on open).
          currentLocale,
          handshake.session_id,
          (_reason) => {
            // Inventory items never require slot picker — always pop the overlay.
            void panelRouter.popOverlay(layerManager);
          },
          // Phase 9 Plan 09-02: toastQueue passed so preconditioner can emit error toasts.
          toastQueue,
        );
        void panelRouter.pushOverlay(modal, layerManager);
      });
    });
  });

  // 11g. Quick-action handler for combat-tracker panel (Plan 08-05 step 11i).
  //      Dispatches [A][S][I][M] key presses to the appropriate panel or action.
  //      The handler is injected via setPanelInstanceHandler so it fires at openPanel time.
  //
  //      [A] — Phase 8 minimal stub: console.warn (full weapon-attack wiring is Phase 9).
  //      [S] — opens SpellbookPanel via openPanel.
  //      [I] — opens InventoryPanel via openPanel.
  //      [M] — Phase 8 minimal stub: console.warn (snapshot-derived token wiring is Phase 9).
  const quickActionHandler = (key: 'A' | 'S' | 'I' | 'M'): void => {
    switch (key) {
      case 'A':
        // Phase 8 stub — Phase 9 wires real weapon-attack dispatch from snapshot.
        // TODO(ADR-0005): resolve default weapon from CombatTrackerPanel snapshot in Phase 9.
        console.warn(
          '[boot-engine-core] quickAction [A] — Phase 8 stub; Phase 9 wires weapon-attack',
        );
        break;
      case 'S':
        panelRouter.clearOverlayStack();
        void panelRouter.openPanel('spellbook', {
          bridge,
          layerManager,
          gestureBus,
          negotiatedCaps,
          // T10: live locale at open time (quick-action handler runs on [S] press).
          locale: currentLocale,
          toastQueue,
        });
        break;
      case 'I':
        panelRouter.clearOverlayStack();
        void panelRouter.openPanel('inventory', {
          bridge,
          layerManager,
          gestureBus,
          negotiatedCaps,
          // T10: live locale at open time (quick-action handler runs on [I] press).
          locale: currentLocale,
          toastQueue,
        });
        break;
      case 'M':
        // Phase 8 stub — Phase 9 wires MoveDirectionPicker with snapshot-derived token.
        // TODO(ADR-0005): resolve player token + remainingFeet from StatusHudLayer cache in Phase 9.
        console.warn(
          '[boot-engine-core] quickAction [M] — Phase 8 stub; Phase 9 wires MoveDirectionPicker',
        );
        break;
    }
  };

  panelRouter.setPanelInstanceHandler('combat-tracker', (panel) => {
    const tracker = panel as unknown as {
      setQuickActionHandler: (h: ((key: 'A' | 'S' | 'I' | 'M') => void) | null) => void;
    };
    tracker.setQuickActionHandler(quickActionHandler);
  });

  // Plan 23-03 — canvas-combat-tracker handler injection (RCOMB-01 / D-23.5).
  //
  // Injects wsEventBus + quickActionHandler into CanvasCombatTrackerPanel instances
  // at openPanel time (before onMount). This mirrors the 'combat-tracker' block above.
  //
  // Pitfall 5 (23-RESEARCH.md): do NOT subscribe to wsEventBus here — the panel
  // subscribes in its own onMount (lifecycle-tied). This handler only injects deps
  // so that onMount has everything it needs when it fires.
  //
  // Pitfall 4 (23-RESEARCH.md): no-subscription-in-handler rule — see above.
  // D-23.5: panel-router.ts and panel-gesture-bus.ts are NOT modified.
  panelRouter.setPanelInstanceHandler('canvas-combat-tracker', (panel) => {
    const tracker = panel as unknown as {
      setWsEventBus: (bus: typeof wsEventBus) => void;
      setQuickActionHandler: (h: ((key: 'A' | 'S' | 'I' | 'M') => void) | null) => void;
    };
    tracker.setWsEventBus(wsEventBus);
    tracker.setQuickActionHandler(quickActionHandler);
  });

  // 12. Atomic bundle — exactly one rebuildPageContainer flush per ADR-0001
  //     Amendment 1 / CONTEXT.md §Area 1.
  //
  //     Phase 20 Plan 05 — canvas mode boot: mount ONLY CanvasStatusHudLayer.
  //
  //     In canvas mode `_assertContainerBudget()` requires ALL mounted layers
  //     to return `{image:0, text:0}` (the container budget is zero — the fixed
  //     5-container HUD raster page schema is declared once at page creation via
  //     `buildHudRasterPageSchema()`; layers do not contribute containers
  //     individually). The glyph layers (mapBase, idleInfill, statusHud,
  //     toastQueue) return non-zero counts and CANNOT be mounted in canvas mode
  //     without triggering `panel_mount_budget_exceeded`.
  //
  //     CanvasStatusHudLayer.getContainerCount() returns `{image:0, text:0}` ✓
  //     CanvasStatusHudLayer.getCaptureContainer() returns `'hud-capture'` ✓
  //     (satisfies the single-capture-provider invariant)
  //
  //     ToastQueueLayer is intentionally EXCLUDED in canvas mode: it returns
  //     `{image:0, text:1}` which fails the canvas budget check. Toast display
  //     in canvas mode will be composited via CanvasStatusHudLayer in a future
  //     phase (Phase 20+, TODO(ADR-0013): canvas toast overlay layer).
  //
  //     The glyph layers (mapBase, idleInfill, statusHud, toastQueue) are still
  //     constructed above and destroyed in teardown. They are preserved for the
  //     gesture-opened map-mode path (Phase 20, §7.4) and the glyph fallback
  //     (Phase 25, `renderMode='glyph'` path). Their subscription wiring
  //     (WS channels, WsReconnectController, R1 event source, etc.) is intact.
  //
  //     CR-01 fix (Phase 25 review): the step-12 mount MUST be gated on
  //     `getRenderMode()`. When the effective verdict flipped renderMode to
  //     'glyph' at step 9d, mounting `canvasStatusHud` is WRONG:
  //       - `canvasStatusHud.getCaptureContainer()` returns 'hud-capture', which
  //         does NOT exist in the glyph status-view schema (header/footer/status-hud)
  //         emitted by `_flushPage()` — a phantom capture provider.
  //       - `canvasStatusHud` is a CanvasLayer, not the glyph HUD renderer; the
  //         glyph `StatusHudLayer` (constructed at step 10 under the same
  //         `getRenderMode() === 'glyph'` guard) is the correct id=6 renderer.
  //     The glyph branch restores the pre-v0.10.0 mounted layer set (D-25.3
  //     "glyph fallback byte-identica pre-v0.10.0"): mapBase (z=0, provides the
  //     `map-capture` capture provider — the sole capture-invariant satisfier in
  //     glyph mode), statusHud (z=1, the id=6 text HUD renderer), idleInfill
  //     (z=0.5). In glyph mode `_assertContainerBudget` uses the per-layer SUM
  //     (mapBase {0,1} + statusHud {0,1} + idleInfill {0,1} = 0 image / 3 text,
  //     within the 4/8 cap) and `_assertCaptureInvariant` passes because only
  //     mapBase reports a capture container. The canvas-mode assertion is NOT
  //     weakened — the canvas branch is unchanged.
  if (layerManager.getRenderMode() === 'canvas') {
    // canvas mode bundle: mount both z=0 MapCanvasLayer and z=1 CanvasStatusHudLayer.
    // MapCanvasLayer at Z0_MAP is the full-screen map base; CanvasStatusHudLayer at
    // Z1_STATUS_HUD provides hud-capture (isEventCapture:1) — sole capture provider.
    await layerManager.bundle([
      { type: 'mount', z: ZIndex.Z0_MAP, layer: mapCanvas },
      { type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: canvasStatusHud },
      // z=1.5 toast overlay — draws transient toasts ON the canvas so they
      // composite with the image tiles (the glyph text-container toast blanks
      // the canvas; see the toastQueue construction comment). canvasToast is
      // non-null here (constructed under the same canvas-mode guard).
      ...(canvasToast !== null
        ? [{ type: 'mount' as const, z: ZIndex.Z1_5_TOAST, layer: canvasToast }]
        : []),
    ]);
  } else {
    // Glyph fallback: statusHud is guaranteed non-null here — it is constructed
    // at step 10 under the identical `getRenderMode() === 'glyph'` guard.
    if (statusHud === null) {
      throw new Error(
        '[boot-engine-core] glyph fallback invariant violated: statusHud is null while ' +
          'renderMode is glyph (step-10 construction guard out of sync with step-12 mount gate)',
      );
    }
    await layerManager.bundle([
      { type: 'mount', z: ZIndex.Z0_MAP, layer: mapBase },
      { type: 'mount', z: ZIndex.Z0_5_IDLE_INFILL, layer: idleInfill },
      { type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: statusHud },
    ]);
  }

  // 12a. Paint persistent frame chrome — header (id4) + footer (id5).
  //
  //      WHY AFTER the bundle flush: `lm.bundle([...])` above triggers a single
  //      `rebuildPageContainer` flush (_flushPage) that re-emits the canonical page
  //      schema from the registry. Any `textContainerUpgrade` written BEFORE the flush
  //      would be overwritten (the host resets container content on rebuild). Writing
  //      chrome AFTER the flush guarantees id4/id5 carry final content and are never
  //      reset back to the SDK "Text" default by a later rebuild.
  //
  //      StatusHudLayer self-redraws via its WS subscription path post-bundle.
  //      IdleInfillLayer is explicitly drawn at step 13 via `finalizeIdleRender` —
  //      it does NOT self-redraw (see step-13 comment for rationale).
  //      The header and footer have NO owning layer, so this explicit post-flush
  //      write is their sole draw call.
  //
  //      Rejection-guarded per T-etr-03: a chrome write failure MUST NOT abort an
  //      already-booted engine. Each writer is awaited inside its own try/catch so
  //      a rejection is logged and execution continues to step 13. This mirrors the
  //      step-12b audio-capture try/catch pattern.
  //
  //      Canvas-mode guard (CHROME-01 fix): `writeHeaderChrome` and
  //      `writeFooterChrome` write to the GLYPH text containers `header` (id=4)
  //      and `footer` (id=5) via `textContainerUpgrade`. In canvas mode,
  //      `_flushPage()` issued `rebuildPageContainer` with the HUD raster schema
  //      (4 image tiles ids 0-3 + 1 text capture id=4). In that schema id=4 is
  //      `hud-capture` (the gesture-capture text container), NOT the glyph header.
  //      Calling `writeHeaderChrome` in canvas mode therefore writes the
  //      "MAP · raster · TURNO" chrome line into `hud-capture`, which renders it
  //      as a floating text overlay on top of the canvas tiles — producing the
  //      doubled-header artifact seen in the simulator smoke test (2026-06-08).
  //      The glyph `header`/`footer` containers simply do NOT exist in the raster
  //      page schema; skip both writes in canvas mode entirely.
  const chromeMode = effectiveVerdict === 'glyph' ? 'glyph' : 'raster';
  if (layerManager.getRenderMode() !== 'canvas') {
    try {
      await writeHeaderChrome(bridge, { mode: chromeMode, locale: effectiveLocale });
    } catch (err) {
      console.warn('[boot-engine-core] header chrome write failed:', err);
    }
    try {
      await writeFooterChrome(bridge, { mode: chromeMode, locale: effectiveLocale });
    } catch (err) {
      console.warn('[boot-engine-core] footer chrome write failed:', err);
    }
  }

  // 12b. Phase 12 Plan 12-03 — voice audio capture (zero-cost when voice cap absent).
  //
  //      When the capability handshake returns `'voice'` in server_caps, the bridge
  //      advertises that /v1/audio/stream is available and DEEPGRAM_API_KEY is set.
  //      We create an AudioCaptureHandle and attach its stop() to the teardown chain.
  //
  //      When 'voice' is absent (standard MVP), no AudioCaptureHandle is created
  //      and no bridge.audioControl call is ever made — zero overhead.
  //
  //      NOTE: 'voice' is not yet in SERVER_CAPS_V1 (Phase 12 V2 optional). The cast
  //      through `as ServerCap` is intentional — the wire shape is `string[]`, and the
  //      bridge emits 'voice' when configured. This follows the same pattern used
  //      for negotiatedCaps in step 7.
  let audioCaptureHandle: ReturnType<typeof startAudioCapture> | null = null;

  if (negotiatedCaps.has('voice' as ServerCap)) {
    audioCaptureHandle = startAudioCapture({
      bridgeUrl: opts.bridgeUrl,
      bearer: opts.token,
    });
    try {
      await audioCaptureHandle.start();
    } catch (err) {
      // Non-fatal: voice path start failure should not prevent the engine from
      // booting. Log and continue — the visual HUD still works without voice.
      console.warn('[boot-engine-core] audio capture start failed (voice path disabled):', err);
      audioCaptureHandle = null;
    }
  }

  // 13. Post-bundle render: draw idle infill strips + first map frame.
  //
  // HUD-27PX (quick-260605-j0t): the default always-on view is now the character
  // STATUS SHEET (status-hud, id 6, full-width 576px), NOT the raster map.
  // In the default view:
  //   - The raster MAP is NOT painted as the base (MapBaseLayer.draw() is skipped).
  //     This avoids overwriting the status-hud container with a blank map frame.
  //   - IDLE INFILL (z05 strips, ids 8-10) is NOT painted (idle-infill only makes
  //     sense when the map is the base, filling empty map rows — not needed here).
  //   - The StatusHudLayer self-redraws via its WS subscription / heartbeat.
  //
  // This change is MINIMAL and REVERSIBLE: both `idleInfill` and `mapBase` are
  // still constructed at step 10 and mounted at step 12 so the deferred map-mode
  // gesture toggle (Phase 20, Specs §7.4 "Map mode (gesture-opened, future)") can
  // re-activate them by calling `finalizeIdleRender` again when the user opens the
  // map view. The `finalizeIdleRender` helper is preserved and still exported for
  // that future use path.
  //
  // TODO(ADR-0013): re-call finalizeIdleRender when map mode is gesture-opened
  // DEFERRED per Specs §7.4 "Map mode (gesture-opened, future)" + ADR-0001 Amendment.
  //
  // The old call was:
  //   await finalizeIdleRender(idleInfill, mapBase);
  // In the default status-sheet view this is intentionally a no-op.
  // mapBase and glyph layers are constructed but NOT mounted in canvas mode; destroyed in teardown.
  // Their draw() is not called at boot for the default view.
  // The deferred map-mode will call finalizeIdleRender() when the user opens
  // map mode via gesture (Phase 20).

  // 14. Return the handle with teardown closure + step 9c effective locale + localeEvents.
  return {
    layerManager,
    rasterController,
    effectiveLocale,
    localeEvents,
    teardown: (): void => {
      // Phase 12 — stop audio capture first (before WS teardown, so mic-off is issued).
      if (audioCaptureHandle !== null) {
        void audioCaptureHandle.stop().catch((err) => {
          console.warn('[boot-engine-core] teardown: audioCaptureHandle.stop failed', err);
        });
      }

      // Tear down Phase 9 dispatcher subscriptions first (reverse of attach order).
      // action-economy was attached LAST (after action-result), so tear down FIRST.
      try {
        unsubActionEconomy();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubActionEconomy failed', err);
      }
      try {
        clearActionEconomyState();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: clearActionEconomyState failed', err);
      }
      // Plan 09-03: clear the conc-retry-cache so stale entries don't survive reboot.
      try {
        clearRetryCache();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: clearRetryCache failed', err);
      }
      // Tear down Phase 8 dispatcher subscriptions (reverse of attach order).
      try {
        unsubActionResult();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubActionResult failed', err);
      }
      // Tear down Phase 6 dispatcher subscriptions (reverse of attach order).
      try {
        unsubConcConflict();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubConcConflict failed', err);
      }
      // Tear down Phase 13 dispatcher subscriptions (reverse of attach order).
      // detachPortrait attached last (11d-ii), so tear down before detachReactionPrompt.
      try {
        detachPortrait();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: detachPortrait failed', err);
      }
      try {
        clearPortraitBytes();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: clearPortraitBytes failed', err);
      }
      try {
        detachReactionPrompt();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: detachReactionPrompt failed', err);
      }
      try {
        unsubOverscroll();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubOverscroll failed', err);
      }
      try {
        displaySettingsSync.dispose();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: displaySettingsSync.dispose failed', err);
      }
      try {
        phoneSettings?.dispose();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: phoneSettings.dispose failed', err);
      }
      try {
        unsubRootExit();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubRootExit failed', err);
      }
      try {
        unsubNavPanelClose();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubNavPanelClose failed', err);
      }
      // WR-03: tear down the localeEvents listener that keeps makeMenu locale refs live.
      try {
        unsubMenuLocale();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubMenuLocale failed', err);
      }
      // T10: tear down the locale-change dispatcher re-attach listener.
      try {
        unsubLocaleReattach();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubLocaleReattach failed', err);
      }
      try {
        unsubR1();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubR1 failed', err);
      }
      // 11b+ counterpart — release the SDK touch-event gesture subscription.
      try {
        unsubGlassesEvents();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubGlassesEvents failed', err);
      }
      // Phase 10 Plan 10-02 — dispose PerfProbe BEFORE WsReconnectController
      // (probe holds a sweep interval that should be cleared before WS closes).
      try {
        perfProbe.dispose();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: perfProbe.dispose failed', err);
      }
      // Phase 24 WR-03: stop HudDeltaDriver IMMEDIATELY after perfProbe, BEFORE
      // any layer destroy(). A pending debounce timer can fire compositor.composite()
      // while layers are being destroyed, racing their async cleanup. Stopping the
      // driver here guarantees no render cycles run during teardown.
      try {
        layerManager.disposeSubscriptions();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: layerManager.disposeSubscriptions failed', err);
      }
      // Phase 10 Plan 10-01 — dispose WsReconnectController BEFORE unsubSceneInput
      // (reverse-mount order: wsReconnect attached at step 11a, after scene input step 11).
      // dispose() cancels pending backoff timers and removes the 'close' listener from ws.
      try {
        wsReconnect.dispose();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: wsReconnect.dispose failed', err);
      }
      try {
        unsubSceneInput();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubSceneInput failed', err);
      }
      try {
        rasterController.terminate();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: rasterController.terminate failed', err);
      }
      // Tear down layers in reverse-mount order. We do NOT use bundle() here
      // because bundle() asserts the capture-invariant; tearing the capture
      // provider would fail that assertion mid-teardown. Direct destroy() on
      // each Layer instance is correct for teardown since we're not flushing.
      //
      // Phase 20 Plan 05 — canvas mode adds CanvasStatusHudLayer.
      // Destroy in reverse bundle order: canvasStatusHud was mounted at z=1
      // (the only canvas-mode mount), then glyph layers (not mounted but still
      // constructed — they hold subscriptions and must be cleaned up).
      try {
        canvasStatusHud.destroy();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: canvasStatusHud.destroy failed', err);
      }
      // Layout B: terminate the HUD tile Worker (no-op when null).
      hudTileWorker?.destroy();
      // quick-task 260610-d42: destroy MapCanvasLayer (canvas-mode z=0 layer).
      try {
        mapCanvas.destroy();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: mapCanvas.destroy failed', err);
      }
      try {
        toastQueue.destroy();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: toastQueue.destroy failed', err);
      }
      // CR-03: statusHud is null in canvas mode — only destroy when constructed.
      if (statusHud !== null) {
        try {
          statusHud.destroy();
        } catch (err) {
          console.warn('[boot-engine-core] teardown: statusHud.destroy failed', err);
        }
      }
      try {
        idleInfill.destroy();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: idleInfill.destroy failed', err);
      }
      try {
        mapBase.destroy();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: mapBase.destroy failed', err);
      }
      try {
        ws.close();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: ws.close failed', err);
      }
    },
  };
}
