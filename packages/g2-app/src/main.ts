/**
 * Single entry of the sideloaded G2 app (ADR-0016): binds the browser environment to
 * {@link startApp}. All logic lives in `direct/app.ts` (testable); this file only reads
 * globals.
 *
 * Debug surfaces (P5) are wired here and fail closed — without `?debug=1` / `?demo=…`
 * none of them exists:
 * - `?demo=<scenario>|tour` boots `demo/demo-app.ts` instead of the Foundry session;
 * - both modes create the debug channel (console.warn/error + uncaught errors + session
 *   diagnostics), tap the bridge (display mirror, `EVF_READY` marker) and expose
 *   `window.__evf`.
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md
 */
import { type EvenAppBridge, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { type BridgeTap, tapBridge } from './debug/bridge-tap.js';
import { captureConsole, captureGlobalErrors, emitMarker } from './debug/capture.js';
import { createDebugLog, type DebugLog, setActiveDebugLog } from './debug/debug-log.js';
import { type DevtoolsHost, installDevtools } from './debug/devtools.js';
import { parseDebugFlags } from './debug/flags.js';
import { startDemo } from './demo/demo-app.js';
import { startApp } from './direct/app.js';
import type { DiagnosticEntry } from './direct/session.js';
import { startHud } from './hud/index.js';
import type { AppStore } from './state/app-store.js';

/** How long to wait for the Even App bridge before assuming a plain browser preview. */
const BRIDGE_WAIT_MS = 1_500;

/** Resolves the SDK bridge, or `null` when not running inside the Even Realities App. */
function getBridge(): Promise<EvenAppBridge | null> {
  return Promise.race([
    waitForEvenAppBridge(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), BRIDGE_WAIT_MS)),
  ]);
}

/** `localStorage` may throw on access in locked-down WebViews; degrade to in-memory. */
function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

const timers = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
};

const root = document.getElementById('evf-phone');
if (root === null) throw new Error('index.html is missing #evf-phone');

const flags = parseDebugFlags(window.location.search);

/** Real app (Foundry session); `log` is non-null in `?debug=1` mode only. */
async function bootApp(mount: HTMLElement, log: DebugLog | null): Promise<void> {
  let tap: BridgeTap | null = null;
  let store: AppStore | null = null;
  if (log !== null) {
    installDevtools(window as DevtoolsHost, {
      state: () => ({ app: store?.get() ?? null, display: tap?.mirror() ?? {} }),
      events: (limit) => (limit === undefined ? log.entries() : log.tail(limit)),
      injector: () => tap?.inject ?? null,
    });
  }
  const handle = await startApp({
    root: mount,
    location: window.location,
    history: window.history,
    storage: browserStorage(),
    deviceLanguage: () => navigator.language,
    appVersion: __EVF_APP_VERSION__,
    moduleVersion: __EVF_MODULE_VERSION__,
    getBridge: async () => {
      const bridge = await getBridge();
      if (bridge === null || log === null) return bridge;
      tap = tapBridge(bridge, { timers });
      const lease = tap.lease();
      void lease.placed.then((ok) => {
        if (ok) emitMarker(log, 'EVF_READY');
      });
      return lease.bridge;
    },
    startHud: (bridge, s, actions) => {
      store = s;
      return startHud(bridge, s, actions);
    },
  });
  store = handle.store;
  if (log === null) return;
  // Mirror session diagnostics (ring of 20, entries shared by reference) into the channel.
  const seen = new WeakSet<DiagnosticEntry>();
  const sync = (entries: readonly DiagnosticEntry[]): void => {
    for (const d of entries) {
      if (seen.has(d)) continue;
      seen.add(d);
      log.push(d.level, 'session', d.message);
    }
  };
  sync(handle.session.info().diagnostics);
  handle.session.subscribeInfo((info) => sync(info.diagnostics));
}

if (flags.debug) {
  const log = createDebugLog();
  setActiveDebugLog(log);
  captureConsole(log);
  captureGlobalErrors(log, window);
  log.push('info', 'debug', `debug channel on (${flags.demo === null ? 'debug=1' : 'demo'})`);
  if (flags.demo === null) {
    void bootApp(root, log);
  } else {
    let tapRef: BridgeTap | null = null;
    let scenario = (): string | undefined => undefined;
    let store: AppStore | null = null;
    installDevtools(window as DevtoolsHost, {
      state: () => {
        const name = scenario();
        return {
          app: store?.get() ?? null,
          display: tapRef?.mirror() ?? {},
          ...(name === undefined ? {} : { scenario: name }),
        };
      },
      events: (limit) => (limit === undefined ? log.entries() : log.tail(limit)),
      injector: () => tapRef?.inject ?? null,
    });
    void startDemo({
      root,
      request: flags.demo,
      dwellMs: flags.dwellMs,
      log,
      deviceLanguage: () => navigator.language,
      getBridge,
      startHud,
      timers,
    }).then(
      (demo) => {
        tapRef = demo.tap;
        store = demo.store;
        scenario = demo.current;
      },
      (error: unknown) => console.error('[demo] boot failed', error),
    );
  }
} else {
  void bootApp(root, null);
}
