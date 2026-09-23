/**
 * App bootstrap for the sideloaded G2 app (ADR-0016): wires store → credentials →
 * session → phone page → HUD, and routes Even Hub foreground events to the session.
 *
 * Kept free of globals so it is testable; `src/main.ts` passes the browser environment.
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md
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
  deriveFoundryBase,
  type KeyValueStorage,
} from './credentials.js';
import { FoundryClient } from './foundry-client.js';
import { DirectSession, type FoundryClientLike } from './session.js';

/** HUD entry point signature (implemented in `src/hud/index.ts`). */
export type StartHud = (bridge: EvenAppBridge, store: AppStore, actions: AppActions) => () => void;

/** Browser environment injected by `main.ts` (or tests). */
export interface AppEnvironment {
  /** Element that hosts the phone page. */
  root: HTMLElement;
  location: Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>;
  history: Pick<History, 'replaceState'>;
  /** `localStorage`, or `null` when blocked. */
  storage: KeyValueStorage | null;
  deviceLanguage: () => string;
  appVersion: string;
  /** Resolves the Even App bridge, or `null` in a plain browser (desktop preview). */
  getBridge: () => Promise<EvenAppBridge | null>;
  startHud: StartHud;
  /** Foundry client factory override (tests). */
  createClient?: (base: string) => FoundryClientLike;
}

/** Handle returned by {@link startApp}. */
export interface AppHandle {
  store: AppStore;
  session: DirectSession;
  /** Unmounts page + HUD and closes the connection. */
  stop(): void;
}

/**
 * Maps an Even Hub event to a foreground transition.
 *
 * Per the SDK 0.0.15 `Sys_ItemEvent` model, lifecycle arrives on `event.sysEvent.eventType`
 * (`FOREGROUND_ENTER_EVENT` = 4, `FOREGROUND_EXIT_EVENT` = 5).
 *
 * @returns `'enter' | 'exit'`, or `null` for any other event
 */
export function foregroundTransition(event: EvenHubEvent): 'enter' | 'exit' | null {
  const type = event.sysEvent?.eventType;
  if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) return 'enter';
  if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) return 'exit';
  return null;
}

/**
 * Boots the app: reads the pairing fragment, mounts the phone page, attaches the HUD
 * when the Even App bridge is present, and connects.
 */
export async function startApp(env: AppEnvironment): Promise<AppHandle> {
  const store = createAppStore();
  const base = deriveFoundryBase(env.location);
  // Storage warnings raised before the session exists are routed to it once created.
  let session: DirectSession | null = null;
  const credentials = new CredentialStore(env.storage, (message, error) =>
    session?.reportWarning(message, error),
  );
  const fragment = consumePairingFragment(env.location, env.history);
  session = new DirectSession({
    store,
    credentials,
    base,
    createClient: env.createClient ?? ((b) => new FoundryClient(b)),
    appVersion: env.appVersion,
    settingsStorage: env.storage,
    deviceLanguage: env.deviceLanguage,
  });
  const active = session;
  const unmountPhone = mountPhonePage(env.root, store, active);

  const bridge = await env.getBridge();
  let stopHud = (): void => {};
  let stopEvents = (): void => {};
  if (bridge !== null) {
    credentials.attachMirror(bridge);
    stopEvents = bridge.onEvenHubEvent((event) => {
      const transition = foregroundTransition(event);
      if (transition !== null) active.onForeground(transition === 'enter');
    });
    stopHud = env.startHud(bridge, store, active);
  }
  await active.start(fragment);
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
