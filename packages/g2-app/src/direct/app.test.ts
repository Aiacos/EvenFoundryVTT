import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { buildPairingUrl, generateDeviceKey, generateRoomId } from '@evf/shared-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, settle } from './__fixtures__/direct-fixtures.js';
import { foregroundTransition, startApp } from './app.js';
import { CREDENTIALS_STORAGE_KEY } from './credentials.js';

const APP = 'https://aiacos.github.io/EvenFoundryVTT/app/index.html';

function environment(url: string, bridge: EvenAppBridge | null) {
  const u = new URL(url);
  const root = document.createElement('main');
  return {
    root,
    location: { pathname: u.pathname, search: u.search, hash: u.hash },
    history: { replaceState: vi.fn() },
    storage: new MemoryStorage(),
    deviceLanguage: () => 'en-US',
    appVersion: '0.4.0',
    relayUrl: 'wss://relay.example',
    getBridge: async () => bridge,
    startHud: vi.fn(() => vi.fn()),
    // The relay is unreachable: every open fails.
    openRelay: vi.fn(async () => {
      throw new Error('offline');
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('foregroundTransition', () => {
  it('maps sysEvent foreground events and ignores others', () => {
    const sys = (eventType: OsEventTypeList) =>
      ({ sysEvent: { eventType } }) as unknown as EvenHubEvent;
    expect(foregroundTransition(sys(OsEventTypeList.FOREGROUND_ENTER_EVENT))).toBe('enter');
    expect(foregroundTransition(sys(OsEventTypeList.FOREGROUND_EXIT_EVENT))).toBe('exit');
    expect(foregroundTransition(sys(OsEventTypeList.ABNORMAL_EXIT_EVENT))).toBe('abnormal');
    expect(foregroundTransition(sys(OsEventTypeList.CLICK_EVENT))).toBeNull();
    expect(foregroundTransition({} as EvenHubEvent)).toBeNull();
  });
});

describe('startApp', () => {
  it('desktop preview: mounts the phone page only, shows P03 without credentials', async () => {
    const env = environment(APP, null);
    const app = await startApp(env);
    expect(env.startHud).not.toHaveBeenCalled();
    expect(app.store.get().connection.status).toBe('unpaired');
    expect(env.root.querySelector('[data-view="setup"]')).not.toBeNull();
    app.stop();
    expect(env.root.childElementCount).toBe(0);
  });

  it('inside the Even App: consumes the QR fragment, mirrors storage, starts the HUD, routes lifecycle', async () => {
    const payload = { v: 2 as const, r: generateRoomId(), k: generateDeviceKey() };
    let onEvent: (e: EvenHubEvent) => void = () => {};
    const stopEvents = vi.fn();
    const bridge = {
      setLocalStorage: vi.fn(async () => true),
      getLocalStorage: vi.fn(async () => ''),
      onEvenHubEvent: vi.fn((cb: (e: EvenHubEvent) => void) => {
        onEvent = cb;
        return stopEvents;
      }),
    } as unknown as EvenAppBridge;
    const env = environment(buildPairingUrl(APP, payload), bridge);
    const app = await startApp(env);
    await settle();
    expect(env.history.replaceState).toHaveBeenCalled();
    expect(JSON.parse(env.storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual({
      room: payload.r,
      key: payload.k,
    });
    expect(env.openRelay).toHaveBeenCalledWith('wss://relay.example', payload.r);
    expect(bridge.setLocalStorage).toHaveBeenCalled();
    expect(env.startHud).toHaveBeenCalledWith(bridge, app.store, app.session);
    expect(app.store.get().connection).toMatchObject({ status: 'offline', cause: 'network' });

    onEvent({
      sysEvent: { eventType: OsEventTypeList.FOREGROUND_EXIT_EVENT },
    } as unknown as EvenHubEvent);
    expect(app.store.get().connection).toMatchObject({ status: 'offline', cause: 'background' });
    const opensBefore = env.openRelay.mock.calls.length;
    onEvent({
      sysEvent: { eventType: OsEventTypeList.FOREGROUND_ENTER_EVENT },
    } as unknown as EvenHubEvent);
    onEvent({ sysEvent: { eventType: OsEventTypeList.CLICK_EVENT } } as unknown as EvenHubEvent);
    await settle();
    expect(env.openRelay.mock.calls.length).toBe(opensBefore + 1);
    expect(app.store.get().connection).toMatchObject({ status: 'offline', cause: 'network' });
    // ABNORMAL_EXIT (app-submission QA): graceful close, like a background transition.
    onEvent({
      sysEvent: { eventType: OsEventTypeList.ABNORMAL_EXIT_EVENT },
    } as unknown as EvenHubEvent);
    expect(app.store.get().connection).toMatchObject({ status: 'offline', cause: 'background' });
    app.stop();
    expect(stopEvents).toHaveBeenCalled();
  });
});
