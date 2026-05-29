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
 *  11c. new LocaleEventEmitter() + makeMenu factory + attachQuickActionLongPress(bus, router, lm, makeMenu)
 *  11d. attachConcConflictHandler(ws, bridge, gestureBus, lm, effectiveLocale) — closes Plan 04b-05 deferred wire
 *  11e. attachActionResultHandler(ws, toastQueue, effectiveLocale, currentUserId) — Plan 08-01 r1.action.result → toast
 *  11e+. attachActionEconomyHandler(ws, currentUserId) — Plan 09-02 r1.action.economy → StatusHudLayer + AOM preconditioner
 *  11f. makeActionOptions factory closure + setPanelInstanceHandler('spellbook'/'inventory') — Plan 08-03 long-press modal injection
 *  11g. quickActionHandler([A][S][I][M]) + setPanelInstanceHandler('combat-tracker') — Plan 08-05 quick-action dispatch
 *  12. await lm.bundle([mount z=0, mount z=0.5, mount z=1, mount z=1.5]) — atomic single-flush (includes ToastQueueLayer)
 *  13. await mapBase.draw() — first frame
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
import { performCapabilityHandshake, probeBleThroughput } from '../engine/capability-handshake.js';
import { DebugMirror } from '../engine/debug-mirror.js';
import { LayerManager } from '../engine/layer-manager.js';
import { ZIndex } from '../engine/layer-types.js';
import { loadPersistedMapMode } from '../engine/map-mode-toggle.js';
import { createBootPage } from '../engine/page-lifecycle.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { PanelRouter } from '../engine/panel-router.js';
import { PerfProbe } from '../engine/perf-probe.js';
import { attachR1EventSource } from '../engine/r1-event-source.js';
import { DEFAULT_R1_TIMINGS } from '../engine/r1-timings.js';
import { SeqTracker } from '../engine/seq-tracker.js';
import { WsReconnectController } from '../engine/ws-reconnect.js';
import { WsSender } from '../engine/ws-sender.js';
import { installHubPolyfill } from '../hub-polyfill.js';
import { LocaleEventEmitter } from '../locale/locale-events.js';
import { type LocaleOverride, loadLocaleOverride } from '../locale/locale-override.js';
import { attachActionEconomyHandler } from '../panels/action-economy-dispatcher.js';
import { clearActionEconomyState } from '../panels/action-economy-state.js';
import { attachActionResultHandler } from '../panels/action-result-dispatcher.js';
import { attachConcConflictHandler } from '../panels/conc-conflict-dispatcher.js';
import { clearRetryCache } from '../panels/conc-retry-cache.js';
import { attachPortraitHandler } from '../panels/portrait-dispatcher.js';
import { clearPortraitBytes } from '../panels/portrait-state.js';
import { attachQuickActionLongPress } from '../panels/quick-action-long-press-dispatcher.js';
import { QuickActionMenuPanel } from '../panels/quick-action-menu-panel.js';
import { attachReactionPromptHandler } from '../panels/reaction-prompt-dispatcher.js';
import { renderGlyphScene } from '../raster/glyph-renderer.js';
import { MapBaseLayer } from '../raster/map-base-layer.js';
import { RasterController } from '../raster/raster-controller.js';
import { attachSceneInputToWs } from '../scene-input.js';
import { IdleInfillLayer } from '../status-hud/idle-infill-layer.js';
import { StatusHudLayer } from '../status-hud/status-hud-layer.js';
import { StatusHudRenderer } from '../status-hud/status-hud-renderer.js';
import { ToastQueueLayer } from '../status-hud/toast-queue-layer.js';

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
 * Production boot-engine options.
 *
 * **NO DI fields here.** Test-only DI lives in {@link TestingDependencies}.
 * Single source of truth — re-exported as `BootEngineOpts` from `../index.ts`.
 */
export interface BootEngineOpts {
  /** Bridge WebSocket URL (Phase 3 bridge service). */
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
 * Minimal `wsEvents` adapter — bridges native WebSocket message events into the
 * `{subscribe(channel, fn): unsubscribe}` shape StatusHudLayer expects.
 *
 * Listens for `message` events; routes JSON envelopes whose `type` matches the
 * requested channel to the registered subscriber. Errors are swallowed and
 * logged — malformed payloads are the producer's bug, not the HUD's.
 *
 * **Phase 10 Plan 10-01 (D-Area1):** when a `SeqTracker` is provided, every
 * successfully-parsed envelope is passed to `seqTracker.observe()` BEFORE being
 * forwarded to channel subscribers. The observe call is a pure number compare
 * (hot path — no Zod parse here; WS parse already happened above). This ensures
 * `lastConfirmedSeq` is always current for `WsReconnectController.client_resume`.
 *
 * **Phase 10 Plan 10-02 (D-Area1 / T-10-02):** when a `PerfProbe` is provided,
 * inbound `r1.action.result` envelopes trigger a `result_envelope` station mark.
 * The idempotencyKey is extracted from the envelope payload (field `idempotencyKey`).
 * Station 3 (handler_invoke) is server-side — NOT measured here (TODO SC-10-02).
 *
 * @internal
 */
function createWsEventBus(
  ws: WebSocket,
  seqTracker?: SeqTracker,
  perfProbe?: PerfProbe,
): {
  subscribe: (channel: string, fn: (raw: unknown) => void) => () => void;
} {
  return {
    subscribe(channel, fn) {
      const handler = (ev: MessageEvent): void => {
        try {
          const rawText =
            typeof ev.data === 'string'
              ? ev.data
              : new TextDecoder().decode(ev.data as ArrayBuffer);
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
          // TODO(SC-10-02): Full gesture_emit wiring requires idempotencyKey
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
          // TODO(SC-10-02): handler_invoke (station 3) is server-side and NOT
          // measured by g2-app. The PerfProbe approximates it from bridge/result
          // timestamps during flush(). Full measurement requires bridge-log
          // instrumentation in the foundry-module socketlib handler.
          if (perfProbe !== undefined && typeof parsed.type === 'string') {
            if (
              parsed.type === 'r1.action.result' &&
              typeof parsed.payload === 'object' &&
              parsed.payload !== null
            ) {
              const payloadObj = parsed.payload as Record<string, unknown>;
              if (typeof payloadObj.idempotencyKey === 'string') {
                perfProbe.mark('result_envelope', payloadObj.idempotencyKey);
              }
            }
          }
          if (parsed.type === channel) {
            fn(parsed.payload);
          }
        } catch (err) {
          console.warn('[boot-engine-core] ws-event-bus parse failure', err);
        }
      };
      ws.addEventListener('message', handler as EventListener);
      return () => {
        ws.removeEventListener('message', handler as EventListener);
      };
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
  const ws = wsCtor(opts.bridgeUrl);
  await awaitWsOpen(ws);

  // 6. Perform the capability handshake — yields negotiated server caps.
  const handshake = await performCapabilityHandshake(ws, opts.token, opts.locale);

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
  const layerManager = new LayerManager(bridge, debugMirror);
  // The handshake server_caps wire shape is `string[]` (Zod schema); narrow to
  // the typed `ServerCap` literal union before handing to LayerManager. The
  // bridge's HandshakeServer producer only emits values from SERVER_CAPS_V1,
  // so the cast through `as ServerCap[]` is sound at runtime — and any future
  // schema drift surfaces immediately at the LayerManager mount gate.
  const negotiatedCaps = new Set<ServerCap>(handshake.server_caps as ServerCap[]);
  layerManager.setNegotiatedCaps(negotiatedCaps);

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
  // Phase 10 Plan 10-01 (D-Area1): SeqTracker is constructed once here and shared
  // with the WS event bus (for observe) and WsReconnectController (for getLastConfirmedSeq).
  // In-memory only — seq is lost on Even App reload (acceptable for single-tenant MVP).
  const seqTracker = new SeqTracker();

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

  const mapBase = new MapBaseLayer(bridge, rasterController, renderGlyphScene, layerManager);
  const idleInfill = new IdleInfillLayer(bridge, effectiveVerdict === 'glyph' ? 'glyph' : 'raster');
  const statusHud = new StatusHudLayer({
    bridge,
    renderer: new StatusHudRenderer({ locale: effectiveLocale }),
    // Phase 10 Plan 10-01: pass seqTracker so every parsed envelope is observed.
    // Phase 10 Plan 10-02: pass perfProbe so result_envelope station is marked.
    wsEvents: createWsEventBus(ws, seqTracker, perfProbe),
  });

  // 11. Wire Plan 06 — attach the WS frame_pixels receiver so Foundry-side
  //     canvas extractions route through controller.requestFrame.
  // quick-task 260529-khy — INBOUND unsubs are `let` so onReconnected can
  // dispose-before-reattach against newWs; the teardown reads the current value.
  let unsubSceneInput = attachSceneInputToWs(ws, rasterController);

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
  //      closure may adjust `longPressMs` in a future phase.
  const gestureBus = new PanelGestureBus();
  let unsubR1 = attachR1EventSource(ws, gestureBus, layerManager, DEFAULT_R1_TIMINGS);

  // 11c. LocaleEventEmitter singleton + QuickActionMenuPanel factory + long-press dispatcher.
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
  //      long-press produces a menu in the user's live locale, not the boot locale.
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

  const unsubMenuLocale = localeEvents.on('changed', (code) => {
    // 'auto' means revert to the boot-detected locale (opts.locale). Any specific
    // locale code takes effect directly as both the render locale and the stored override.
    currentMenuLocale = code === 'auto' ? opts.locale : (code as BootEngineLocale);
    currentMenuOverride = code;
  });

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
          void panelRouter.openPanel(target, {
            bridge,
            layerManager,
            gestureBus,
            negotiatedCaps: negotiatedCaps,
            locale: effectiveLocale,
          });
        },
        onMapModeToggle: () => {
          // Phase 4b map-mode-toggle stub — Phase 7 wires the full toggle logic
          // via `persistMapMode` + `layerManager.setMapMode`. For now a no-op.
          console.warn('[boot-engine-core] onMapModeToggle: Phase 7 stub — no-op');
        },
        onAction: () => {
          // Phase 7 stub — the [A] Action panel is not yet shipped.
          console.warn('[boot-engine-core] onAction: Phase 7 panel pending (Action panel)');
        },
      },
    );
  };

  const unsubLongPress = attachQuickActionLongPress(
    gestureBus,
    panelRouter,
    layerManager,
    makeMenu,
  );

  // 11d. Conc-conflict dispatcher — closes the Plan 04b-05 deferred wire.
  //      Subscribes to `conc.conflict` WS envelopes and mounts the concentration-drop
  //      modal at z=2 when a conflict is detected (CONC-01 flow, CCD-3 / ISM-10).
  //      The dispatcher uses the double trust boundary pattern (T-06-04-04 mitigation).
  //
  //      Plan 09-03: toastQueue is constructed before attaching the dispatcher so the
  //      modal's [N] cancel path can enqueue the concentration-cancelled error toast
  //      (CDM-CANCEL-01). toastQueue declaration moved here from step 11e.
  const toastQueue = new ToastQueueLayer({ bridge });

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
  // TODO(SC-10-02): gesture_emit (station 1) and bridge_post (station 2) require
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
    effectiveLocale,
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
    locale: effectiveLocale,
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
    effectiveLocale,
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
    url: opts.bridgeUrl,
    sessionId: handshake.session_id,
    seqTracker,
    wsFactory: deps?.wsFactory ?? ((u: string) => new WebSocket(u)),
    performHandshake: (newWs: WebSocket, sid: string) =>
      performCapabilityHandshake(newWs, opts.token, opts.locale, sid),
    onChipTick: ({ remainingMs }) => {
      statusHud.setSyncLost({ retryInMs: remainingMs });
    },
    onChipUnmount: () => {
      statusHud.setSyncLost(null);
    },
    onFullRefreshRequired: () => {
      // TODO(SC-10-01): wire to REST GET /v1/actor for full actor re-fetch.
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

      // (2) INBOUND — dispose-before-reattach all 7 listeners against newWs. reactionPrompt
      //     + portrait are included here (the two sources MISSED in v1 of the rewire).
      unsubSceneInput();
      unsubSceneInput = attachSceneInputToWs(newWs, rasterController);

      unsubR1();
      unsubR1 = attachR1EventSource(newWs, gestureBus, layerManager, DEFAULT_R1_TIMINGS);

      unsubConcConflict();
      unsubConcConflict = attachConcConflictHandler(
        newWs,
        bridge,
        gestureBus,
        layerManager,
        effectiveLocale,
        toastQueue,
      );

      detachReactionPrompt();
      detachReactionPrompt = attachReactionPromptHandler({
        ws: newWs as unknown as Parameters<typeof attachReactionPromptHandler>[0]['ws'],
        layerManager,
        bridge,
        gestureBus,
        locale: effectiveLocale,
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
        effectiveLocale,
        currentUserId,
      );

      unsubActionEconomy();
      unsubActionEconomy = attachActionEconomyHandler(
        newWs as unknown as Parameters<typeof attachActionEconomyHandler>[0],
        currentUserId,
      );

      // (3) HUD wsEvents bus — rebind the 3 status-hud channels onto newWs. seqProvider
      //     already reads the shared seqTracker (no rebind needed there).
      statusHud.rebindWsEvents(createWsEventBus(newWs, seqTracker, perfProbe));
    },
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
        const snapshot = statusHud.getCachedSnapshot();
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
              effectiveLocale,
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
          effectiveLocale,
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
          effectiveLocale,
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
          locale: effectiveLocale,
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
          locale: effectiveLocale,
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

  // 12. Atomic bundle — exactly one rebuildPageContainer flush per ADR-0001
  //     Amendment 1 / CONTEXT.md §Area 1.
  //     ToastQueueLayer is mounted at z=1.5 (between Status HUD and overlay slot — survives
  //     z=2 overlay open per ADR-0009 Amendment 1 carve-out rule).
  await layerManager.bundle([
    { type: 'mount', z: ZIndex.Z0_MAP, layer: mapBase },
    { type: 'mount', z: ZIndex.Z0_5_IDLE_INFILL, layer: idleInfill },
    { type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: statusHud },
    { type: 'mount', z: ZIndex.Z1_5_TOAST, layer: toastQueue },
  ]);

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

  // 13. Draw first frame (no scene yet — MapBaseLayer.draw is a no-op until
  //     Plan 06 pushes the first frame_pixels envelope).
  await mapBase.draw();

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
        unsubLongPress();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubLongPress failed', err);
      }
      // WR-03: tear down the localeEvents listener that keeps makeMenu locale refs live.
      try {
        unsubMenuLocale();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubMenuLocale failed', err);
      }
      try {
        unsubR1();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: unsubR1 failed', err);
      }
      // Phase 10 Plan 10-02 — dispose PerfProbe BEFORE WsReconnectController
      // (probe holds a sweep interval that should be cleared before WS closes).
      try {
        perfProbe.dispose();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: perfProbe.dispose failed', err);
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
      // provider (z=0 MapBaseLayer) would fail that assertion mid-teardown.
      // Direct destroy() on each Layer instance is correct for teardown
      // since we're not flushing a new page.
      try {
        toastQueue.destroy();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: toastQueue.destroy failed', err);
      }
      try {
        statusHud.destroy();
      } catch (err) {
        console.warn('[boot-engine-core] teardown: statusHud.destroy failed', err);
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
