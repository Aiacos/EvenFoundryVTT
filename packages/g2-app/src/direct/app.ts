/**
 * App bootstrap of the glasses app (ADR-0019): wires store → credentials → session →
 * phone page → HUD, and routes Even Hub foreground events to the session. The same code
 * runs as the Even Hub package, as the hosted page opened by the pairing QR, and on the
 * Vite dev server.
 *
 * Kept free of globals so it is testable; `src/main.ts` passes the browser environment.
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 * @see hub.evenrealities.com/docs/build/background-lifecycle (foreground/background, storage)
 */
import {
  type EvenAppBridge,
  type EvenHubEvent,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk';
import { mountPhonePage } from '../phone/phone-page.js';
import { type AppActions, type AppStore, createAppStore } from '../state/app-store.js';
import {
  CredentialStore,
  consumePairingFragment,
  credentialsFromLink,
  type KeyValueStorage,
} from './credentials.js';
import { createRelayOpener, type OpenRelay } from './relay-client.js';
import { DirectSession } from './session.js';

/** HUD entry point signature (implemented in `src/hud/index.ts`). */
export type StartHud = (bridge: EvenAppBridge, store: AppStore, actions: AppActions) => () => void;

/** Browser environment injected by `main.ts` (or tests). */
export interface AppEnvironment {
  /** Element that hosts the phone page. */
  root: HTMLElement;
  location: Pick<Location, 'pathname' | 'search' | 'hash'>;
  history: Pick<History, 'replaceState'>;
  /** `localStorage`, or `null` when blocked. */
  storage: KeyValueStorage | null;
  deviceLanguage: () => string;
  appVersion: string;
  /** Relay the app was built for (`VITE_RELAY_URL`); pairings may override it. */
  relayUrl: string;
  /** Resolves the Even App bridge, or `null` in a plain browser (desktop preview). */
  getBridge: () => Promise<EvenAppBridge | null>;
  startHud: StartHud;
  /** Relay opener override (tests). */
  openRelay?: OpenRelay;
}

/** Handle returned by {@link startApp}. */
export interface AppHandle {
  store: AppStore;
  session: DirectSession;
  /** Unmounts page + HUD and closes the connection. */
  stop(): void;
}

/**
 * Maps an Even Hub event to a lifecycle transition.
 *
 * Per the SDK 0.0.15 `Sys_ItemEvent` model, lifecycle arrives on `event.sysEvent.eventType`
 * (`FOREGROUND_ENTER_EVENT` = 4, `FOREGROUND_EXIT_EVENT` = 5, `ABNORMAL_EXIT_EVENT` = 6).
 * The app-submission QA requires handling the abnormal exit (remote ADR-0012 LIFE-01):
 * the host is tearing the plugin down, so the relay link is closed gracefully instead of
 * being dropped mid-frame (the projector then sees a clean `peer-down`).
 *
 * @returns `'enter' | 'exit' | 'abnormal'`, or `null` for any other event
 */
export function foregroundTransition(event: EvenHubEvent): 'enter' | 'exit' | 'abnormal' | null {
  const type = event.sysEvent?.eventType;
  if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) return 'enter';
  if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) return 'exit';
  if (type === OsEventTypeList.ABNORMAL_EXIT_EVENT) return 'abnormal';
  return null;
}

/**
 * Boots the app: reads the pairing fragment, mounts the phone page, attaches the HUD
 * when the Even App bridge is present, and connects.
 */
export async function startApp(env: AppEnvironment): Promise<AppHandle> {
  const store = createAppStore();
  // Storage warnings raised before the session exists are routed to it once created.
  let session: DirectSession | null = null;
  const credentials = new CredentialStore(env.storage, (message, error) =>
    session?.reportWarning(message, error),
  );
  const link = consumePairingFragment(env.location, env.history);
  session = new DirectSession({
    store,
    credentials,
    openRelay: env.openRelay ?? createRelayOpener(),
    relayUrl: env.relayUrl,
    appVersion: env.appVersion,
    settingsStorage: env.storage,
    deviceLanguage: env.deviceLanguage,
  });
  const active = session;
  const bridge = await env.getBridge();
  const unmountPhone = mountPhonePage(env.root, store, active, bridge);

  let stopHud = (): void => {};
  let stopEvents = (): void => {};
  if (bridge !== null) {
    credentials.attachMirror(bridge);
    stopEvents = bridge.onEvenHubEvent((event) => {
      const transition = foregroundTransition(event);
      // An abnormal exit closes like a background transition: graceful link close, and
      // a later FOREGROUND_ENTER (host restored the plugin) reconnects.
      if (transition !== null) active.onForeground(transition === 'enter');
    });
    stopHud = env.startHud(bridge, store, active);
  }
  await active.start(link === null ? null : await credentialsFromLink(link));
  return {
    store,
    session: active,
    stop() {
      stopEvents();
      stopHud();
      unmountPhone();
      active.dispose();
    },
  };
}
