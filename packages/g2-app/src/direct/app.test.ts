import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { buildPairingUrl, generateDeviceKey } from '@evf/shared-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, settle, USER_ID } from './__fixtures__/direct-fixtures.js';
import { foregroundTransition, startApp } from './app.js';
import { CREDENTIALS_STORAGE_KEY } from './credentials.js';
import type { FoundryClientLike } from './session.js';

function failingClient(): FoundryClientLike {
  return {
    probeStatus: vi.fn(async () => null),
    fetchJoinPage: vi.fn(async () => {
      throw new Error('offline');
    }),
    login: vi.fn(),
    openSocket: vi.fn(),
    listG2Users: vi.fn(async () => []),
  };
}

function environment(url: string, bridge: EvenAppBridge | null) {
  const u = new URL(url);
  const root = document.createElement('main');
  return {
    root,
    location: { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash },
    history: { replaceState: vi.fn() },
    storage: new MemoryStorage(),
    deviceLanguage: () => 'en-US',
    appVersion: '0.2.0',
    getBridge: async () => bridge,
    startHud: vi.fn(() => vi.fn()),
    createClient: vi.fn(() => failingClient()),
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
    const env = environment('https://h.example/modules/evenfoundryvtt/g2/index.html', null);
    const app = await startApp(env);
    expect(env.startHud).not.toHaveBeenCalled();
    expect(app.store.get().connection.status).toBe('unpaired');
    expect(env.root.querySelector('[data-view="setup"]')).not.toBeNull();
    app.stop();
    expect(env.root.childElementCount).toBe(0);
  });

  it('inside the Even App: consumes the QR fragment, mirrors storage, starts the HUD, routes lifecycle', async () => {
    const payload = {
      v: 1 as const,
      u: USER_ID,
      p: 'correct-horse-battery',
      k: generateDeviceKey(),
    };
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
    const env = environment(buildPairingUrl('https://h.example/vtt', payload), bridge);
    const app = await startApp(env);
    await settle();
    expect(env.history.replaceState).toHaveBeenCalled();
    expect(JSON.parse(env.storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toMatchObject({
      base: 'https://h.example/vtt',
      userId: USER_ID,
    });
    expect(bridge.setLocalStorage).toHaveBeenCalled();
    expect(env.startHud).toHaveBeenCalledWith(bridge, app.store, app.session);
    expect(app.store.get().connection).toMatchObject({ status: 'offline', cause: 'network' });

    onEvent({
      sysEvent: { eventType: OsEventTypeList.FOREGROUND_EXIT_EVENT },
    } as unknown as EvenHubEvent);
    expect(app.store.get().connection).toMatchObject({ status: 'offline', cause: 'background' });
    const clientsBefore = env.createClient.mock.calls.length;
    onEvent({
      sysEvent: { eventType: OsEventTypeList.FOREGROUND_ENTER_EVENT },
    } as unknown as EvenHubEvent);
    onEvent({ sysEvent: { eventType: OsEventTypeList.CLICK_EVENT } } as unknown as EvenHubEvent);
    await settle();
    expect(env.createClient.mock.calls.length).toBe(clientsBefore + 1);
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
