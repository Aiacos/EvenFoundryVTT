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
import { phoneStrings } from '../phone/i18n.js';
import { mountPhonePage } from '../phone/phone-page.js';
import { lenientCamera } from '../phone/qr-scan.js';
import { type AppActions, type AppStore, createAppStore } from '../state/app-store.js';
import {
  type BootLink,
  CredentialStore,
  consumePairingLink,
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
  /**
   * Subscribes to `hashchange` (the host may reuse the open page and change only the
   * fragment when a new QR is scanned); returns the unsubscribe function. Omitted = none.
   */
  hashChanges?: (listener: () => void) => () => void;
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
 * Applies the pairing link read from the page URL at boot. Never rejects: a code that
 * cannot be applied (e.g. no crypto backend on a plain-http page) is recorded —
 * diagnostics, debug channel, phone page error line — and the session starts with the
 * stored pairing.
 *
 * @param session - the app session
 * @param boot - what {@link consumePairingLink} read from the page URL
 */
export async function applyLink(session: DirectSession, boot: BootLink): Promise<void> {
  if (boot.kind !== 'code') {
    await session.start();
    return;
  }
  try {
    await session.pairLink(boot.link);
  } catch (error) {
    session.reportPairingError(error);
    await session.start();
  }
}

/**
 * Applies a pairing link that arrived on the open page (`hashchange`: the host reused the
 * page for a new scan). Never rejects: a failure keeps the current connection and is
 * reported; a URL without a pairing key is ignored.
 *
 * @param session - the app session
 * @param next - what {@link consumePairingLink} read from the new URL
 */
export async function applyLaterLink(session: DirectSession, next: BootLink): Promise<void> {
  if (next.kind === 'none') return;
  session.noteLink(next.kind);
  if (next.kind !== 'code') return;
  try {
    await session.pairLink(next.link);
  } catch (error) {
    session.reportPairingError(error);
  }
}

/**
 * Boots the app: reads the pairing link (`#c=` / `?c=`), mounts the phone page, attaches
 * the HUD when the Even App bridge is present, connects, and pairs again whenever a new
 * link arrives on the open page (`hashchange`). The `hashchange` listener is on from the
 * start — a scan while the boot still connects (relay open up to 10 s) is not lost — and
 * links are applied one at a time, in order, after the boot link.
 */
export async function startApp(env: AppEnvironment): Promise<AppHandle> {
  const store = createAppStore();
  // Storage warnings raised before the session exists are routed to it once created.
  let session: DirectSession | null = null;
  const credentials = new CredentialStore(env.storage, (message, error) =>
    session?.reportWarning(message, error),
  );
  const link = consumePairingLink(env.location, env.history);
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
  active.noteLink(link.kind);

  // Link queue: the boot link runs once the page and the bridge are set up; later links
  // (`hashchange`) queue behind it. Tasks never reject (applyLink / applyLaterLink).
  let ready = (): void => {};
  let queue = new Promise<void>((resolve) => {
    ready = resolve;
  }).then(() => applyLink(active, link));
  const booted = queue;
  const stopHashChanges =
    env.hashChanges?.(() => {
      const next = consumePairingLink(env.location, env.history);
      queue = queue.then(() => applyLaterLink(active, next));
    }) ?? (() => {});

  let stopHud = (): void => {};
  let stopEvents = (): void => {};
  let unmountPhone = (): void => {};
  try {
    const bridge = await env.getBridge();
    // The camera goes through the lenient parser: the SDK's own drops partial host results.
    unmountPhone = mountPhonePage(
      env.root,
      store,
      active,
      bridge === null ? null : lenientCamera(bridge),
    );
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
  } catch (error) {
    stopHashChanges();
    stopEvents();
    unmountPhone();
    throw error;
  }
  ready();
  await booted;
  return {
    store,
    session: active,
    stop() {
      stopHashChanges();
      stopEvents();
      stopHud();
      unmountPhone();
      active.dispose();
    },
  };
}

/**
 * Last-resort boot failure — {@link startApp} rejected although it reports pairing-link
 * failures itself (e.g. the SDK bridge or the storage threw): logged as `[EVF]` (the debug
 * channel captures the console when it is on) and shown on the phone page in place of a
 * blank page.
 *
 * @param root - element hosting the phone page (its content is replaced)
 * @param error - the rejection reason
 * @param language - device language (`navigator.language`): Italian or English text
 */
export function showBootFailure(root: HTMLElement, error: unknown, language: string): void {
  console.error(`[EVF] boot failed: ${String(error)}`);
  const locale = language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const line = root.ownerDocument.createElement('p');
  line.className = 'evf-error';
  line.setAttribute('role', 'alert');
  // The message only, like «Collegamento non riuscito: <msg>» (no "Error:" prefix).
  const message = error instanceof Error ? error.message : String(error);
  line.textContent = phoneStrings(locale).bootFailed(message);
  root.replaceChildren(line);
}
