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
import { type BootStep, showBootSplash } from '../engine/boot-splash.js';
import { performCapabilityHandshake, probeBleThroughput } from '../engine/capability-handshake.js';
import { LayerManager } from '../engine/layer-manager.js';
import { ZIndex } from '../engine/layer-types.js';
import { loadPersistedMapMode } from '../engine/map-mode-toggle.js';
import { createBootPage } from '../engine/page-lifecycle.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { PanelRouter } from '../engine/panel-router.js';
import { attachR1EventSource } from '../engine/r1-event-source.js';
import { DEFAULT_R1_TIMINGS } from '../engine/r1-timings.js';
import { installHubPolyfill } from '../hub-polyfill.js';
import { LocaleEventEmitter } from '../locale/locale-events.js';
import { type LocaleOverride, loadLocaleOverride } from '../locale/locale-override.js';
import { attachActionEconomyHandler } from '../panels/action-economy-dispatcher.js';
import { clearActionEconomyState } from '../panels/action-economy-state.js';
import { attachActionResultHandler } from '../panels/action-result-dispatcher.js';
import { attachConcConflictHandler } from '../panels/conc-conflict-dispatcher.js';
import { clearRetryCache } from '../panels/conc-retry-cache.js';
import { attachQuickActionLongPress } from '../panels/quick-action-long-press-dispatcher.js';
import { QuickActionMenuPanel } from '../panels/quick-action-menu-panel.js';
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
 * @internal
 */
function createWsEventBus(ws: WebSocket): {
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
          const parsed = JSON.parse(rawText) as { type?: unknown; payload?: unknown };
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
  const layerManager = new LayerManager(bridge);
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
  const mapBase = new MapBaseLayer(bridge, rasterController, renderGlyphScene, layerManager);
  const idleInfill = new IdleInfillLayer(bridge, effectiveVerdict === 'glyph' ? 'glyph' : 'raster');
  const statusHud = new StatusHudLayer({
    bridge,
    renderer: new StatusHudRenderer({ locale: effectiveLocale }),
    wsEvents: createWsEventBus(ws),
  });

  // 11. Wire Plan 06 — attach the WS frame_pixels receiver so Foundry-side
  //     canvas extractions route through controller.requestFrame.
  const unsubSceneInput = attachSceneInputToWs(ws, rasterController);

  // 11b. R1 gesture bridge — WS `r1.gesture` envelopes → PanelGestureBus publish.
  //      Must run AFTER step 7 `setNegotiatedCaps` so LayerManager's negotiated
  //      caps are consistent before gestures can flow (RESEARCH §Q2 / BERW-08).
  //      `DEFAULT_R1_TIMINGS` is the Phase 6 default; SC-06-01 hardware-tuning
  //      closure may adjust `longPressMs` in a future phase.
  const gestureBus = new PanelGestureBus();
  const unsubR1 = attachR1EventSource(ws, gestureBus, layerManager, DEFAULT_R1_TIMINGS);

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

  const unsubConcConflict = attachConcConflictHandler(
    ws,
    bridge,
    gestureBus,
    layerManager,
    effectiveLocale,
    toastQueue, // Plan 09-03: forward for [N] cancel-toast path (CDM-CANCEL-01)
  );

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
  const unsubActionResult = attachActionResultHandler(
    ws as unknown as Parameters<typeof attachActionResultHandler>[0],
    toastQueue,
    effectiveLocale,
    currentUserId,
  );
  // Phase 9 Plan 09-02 — wire action economy dispatcher (BERW-13..16).
  // Attached AFTER attachActionResultHandler so teardown reverse-order is:
  //   unsubActionEconomy → unsubActionResult → unsubConcConflict → ...
  const unsubActionEconomy = attachActionEconomyHandler(
    ws as unknown as Parameters<typeof attachActionEconomyHandler>[0],
    currentUserId,
  );

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
        const modal = new ActionOptionsModal(
          bridge,
          ws as unknown as ConstructorParameters<typeof ActionOptionsModal>[1],
          gestureBus,
          req as ConstructorParameters<typeof ActionOptionsModal>[3],
          effectiveLocale,
          handshake.session_id,
          () => {
            void panelRouter.popOverlay(layerManager);
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
          ws as unknown as ConstructorParameters<typeof ActionOptionsModal>[1],
          gestureBus,
          req as ConstructorParameters<typeof ActionOptionsModal>[3],
          effectiveLocale,
          handshake.session_id,
          () => {
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
