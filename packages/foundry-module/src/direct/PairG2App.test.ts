import { DEFAULT_APP_URL, DEFAULT_RELAY_URL, PAIRING_TTL_MS } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FoundryMock,
  installFoundry,
  makeActor,
  makeUser,
} from '../__tests__/direct-fixtures.js';
import {
  createPairG2App,
  endpointNotice,
  formatLastSeen,
  formatRemaining,
  PAIR_APP_ID,
  PAIR_TEMPLATE,
  type PairContext,
  sessionView,
} from './PairG2App.js';
import type { PairingEndpoints, PairingSession } from './pairing-flow.js';
import { getPairing, listPairings, removePairing, updatePairing } from './pairing-store.js';
import type { ChannelDiagnostics, DeviceStatus, Projector } from './projector.js';

interface AppLike {
  session: PairingSession | null;
  expired: boolean;
  cancelled: boolean;
  connected: string | null;
  relayOk: boolean | null;
  selectedActor: string | null;
  confirmingRevoke: string | null;
  element: HTMLElement;
  render: ReturnType<typeof vi.fn>;
  _prepareContext(): Promise<PairContext>;
  _onRender(): Promise<void>;
  _onClose(): void;
  autoStart(): Promise<void>;
  tick(now?: number): Promise<void>;
  newQr(): Promise<void>;
  cancelQr(): Promise<void>;
  toggleQrSize(): Promise<void>;
  copyCode(): Promise<void>;
  recheck(): Promise<void>;
  askRevoke(id: string | undefined): Promise<void>;
  revoke(id: string | undefined): Promise<void>;
  resetEndpoint(which: string | undefined): Promise<void>;
  currentActor(): string | null;
}

interface AppClassLike {
  new (): AppLike;
  openFor(actorId?: string | null): Promise<AppLike>;
  DEFAULT_OPTIONS: { id: string; window: { title: string }; actions: Record<string, unknown> };
  PARTS: { main: { template: string } };
}

let f: FoundryMock;
let listeners: Array<() => void>;
const projector = {
  status: vi.fn((_id: string): DeviceStatus => 'offline'),
  subscribe: vi.fn((l: () => void) => {
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }),
  open: vi.fn(),
  revoke: vi.fn(async (id: string) => {
    await removePairing(id);
  }),
  diagnostics: vi.fn(
    (_id: string): ChannelDiagnostics => ({ relay: true, glasses: false, rejected: null }),
  ),
};
const DEFAULTS: PairingEndpoints = { appUrl: DEFAULT_APP_URL, relayUrl: DEFAULT_RELAY_URL };
let urls: PairingEndpoints;
const endpoints = () => urls;
const resetEndpoint = vi.fn(async (which: keyof PairingEndpoints) => {
  urls = { ...urls, [which]: DEFAULTS[which] };
});

function appClass(): AppClassLike {
  return createPairG2App(
    projector as unknown as Projector,
    endpoints,
    resetEndpoint,
  ) as unknown as AppClassLike;
}

beforeEach(() => {
  listeners = [];
  urls = { ...DEFAULTS };
  const luca = makeUser('p1', 'Luca', { character: { id: 'mira' } });
  f = installFoundry({
    users: [luca],
    localIsGM: false,
    actors: [
      makeActor('thorin', 'Thorin', { ownership: { p1: 3 } }),
      makeActor('mira', 'Mira', { ownership: { p1: 3 } }),
    ],
  });
  f.game.user = luca;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('ok', { status: 200 })),
  );
  projector.status.mockReturnValue('offline');
  projector.diagnostics.mockReturnValue({ relay: true, glasses: false, rejected: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('formatters', () => {
  it('PA-01 formatRemaining → mm:ss (never negative); sessionView splits the code', () => {
    expect(formatRemaining(292_000)).toBe('04:52');
    expect(formatRemaining(-5)).toBe('00:00');
    const view = sessionView(
      {
        deviceId: 'd',
        actorId: 'a',
        actorName: 'A',
        code: 'AAAA-BBBB-CCCC-DDDD',
        url: 'u',
        qrSvg: '<svg/>',
        expiresAt: 10_000,
      },
      4_000,
    );
    expect(view).toMatchObject({
      remaining: '00:06',
      secondsLeft: 6,
      secondsTotal: PAIRING_TTL_MS / 1000,
      codeGroups: ['AAAA', 'BBBB', 'CCCC', 'DDDD'],
    });
  });

  it('PA-02 formatLastSeen: now when online, never, minutes', () => {
    expect(formatLastSeen(0, 'online', 1)).toBe('evf.pair.devices.now');
    expect(formatLastSeen(null, 'waiting', 1)).toBe('evf.pair.devices.never');
    expect(formatLastSeen(0, 'offline', 600_000)).toBe(
      'evf.pair.devices.seen_minutes:{"minutes":10}',
    );
  });
});

describe('PairG2App (opening it is pairing)', () => {
  it('PA-03 declares ApplicationV2 options, actions and the Handlebars part', () => {
    const App = appClass();
    expect(App.DEFAULT_OPTIONS.id).toBe(PAIR_APP_ID);
    expect(App.DEFAULT_OPTIONS.window.title).toBe('evf.pair.title');
    expect(Object.keys(App.DEFAULT_OPTIONS.actions)).toEqual([
      'newQr',
      'cancelQr',
      'toggleQrSize',
      'copyCode',
      'recheck',
      'revoke',
      'confirmRevoke',
      'resetEndpoint',
    ]);
    expect(App.PARTS.main.template).toBe(PAIR_TEMPLATE);
  });

  it('PA-04 first render checks the relay and shows a QR for the assigned character', async () => {
    const app = new (appClass())();
    await app._onRender();
    expect(app.relayOk).toBe(true);
    expect(app.session?.actorName).toBe('Mira');
    expect(projector.open).toHaveBeenCalledWith(app.session?.deviceId);
    expect(getPairing(app.session?.deviceId ?? '')?.expiresAt).not.toBeNull();
    const ctx = await app._prepareContext();
    expect(ctx.actors.find((a) => a.selected)?.id).toBe('mira');
    expect(ctx.session?.codeGroups).toHaveLength(4);
    expect(ctx.devices).toEqual([]); // pending sessions are not listed as devices
    // A second render does not create another session.
    await app._onRender();
    expect(listPairings()).toHaveLength(1);
  });

  it('PA-05 relay down → error state; «Riprova» re-checks and pairs', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    const app = new (appClass())();
    await app.autoStart();
    expect(app.session).toBeNull();
    expect((await app._prepareContext()).relayDown).toBe(true);
    await app.autoStart(); // stays down without re-checking
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await app.recheck();
    expect(app.session).not.toBeNull();
  });

  it('PA-06 no owned character → notice, no QR', async () => {
    (f.actors.get('thorin') as { ownership: Record<string, number> }).ownership = {};
    (f.actors.get('mira') as { ownership: Record<string, number> }).ownership = {};
    const app = new (appClass())();
    await app.autoStart();
    expect(app.session).toBeNull();
    expect((await app._prepareContext()).noActor).toBe(true);
  });

  it('PA-07 the glasses connecting (secrets rotated) switches to success by itself', async () => {
    const app = new (appClass())();
    await app._onRender();
    const id = app.session?.deviceId ?? '';
    for (const l of listeners) l(); // still pending: no change
    expect(app.connected).toBeNull();
    await updatePairing(id, { expiresAt: null });
    projector.status.mockReturnValue('online');
    for (const l of listeners) l();
    await vi.waitFor(() => expect(app.connected).toBe('Mira'));
    expect(app.session).toBeNull();
    expect(f.notifications.info).toHaveBeenCalled();
    const ctx = await app._prepareContext();
    expect(ctx.devices).toMatchObject([{ deviceId: id, status: 'online', label: 'Mira' }]);
    // «Collega un altro» starts again.
    await app.newQr();
    expect(app.connected).toBeNull();
    expect(app.session).not.toBeNull();
  });

  it('PA-08 countdown ticks, then an unused QR expires and is forgotten', async () => {
    const app = new (appClass())();
    await app._onRender();
    const session = app.session as PairingSession;
    const countdown = document.createElement('strong');
    countdown.dataset.countdown = '';
    const bar = document.createElement('progress');
    bar.dataset.countdownBar = '';
    app.element.append(countdown, bar);
    await app.tick(session.expiresAt - 61_000);
    expect(countdown.textContent).toBe('01:01');
    expect(bar.value).toBe(61);
    await app.tick(session.expiresAt);
    expect(app.expired).toBe(true);
    expect(getPairing(session.deviceId)).toBeNull();
    expect(projector.revoke).toHaveBeenCalledWith(session.deviceId);
    await app.autoStart(); // expired waits for a click
    expect(app.session).toBeNull();
    await app.newQr();
    expect(app.session).not.toBeNull();
    await app.tick(0);
    const idle = new (appClass())();
    await idle.tick();
  });

  it('PA-09 copy code: success and clipboard failure', async () => {
    const app = new (appClass())();
    await app.copyCode(); // no session: no-op
    await app.autoStart();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await app.copyCode();
    expect(writeText).toHaveBeenCalledWith(app.session?.code);
    writeText.mockRejectedValueOnce(new Error('denied'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await app.copyCode();
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.clipboard');
  });

  it('PA-10 «Scollega» asks, then revokes; failures are reported', async () => {
    const app = new (appClass())();
    await app.askRevoke('dev9');
    expect(app.confirmingRevoke).toBe('dev9');
    await app.revoke('dev9');
    expect(projector.revoke).toHaveBeenCalledWith('dev9');
    expect(app.confirmingRevoke).toBeNull();
    await app.revoke(undefined);
    projector.revoke.mockRejectedValueOnce(new Error('x'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await app.revoke('dev9');
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.revoke');
  });

  it('PA-11 openFor reuses the open window and switching character regenerates the QR', async () => {
    const App = appClass();
    const first = await App.openFor();
    const registry = new Map<string, unknown>([[PAIR_APP_ID, first]]);
    Object.defineProperty(foundry.applications, 'instances', { value: registry });
    await first.autoStart();
    const old = first.session?.deviceId ?? '';
    const again = await App.openFor('thorin');
    expect(again).toBe(first);
    expect(first.selectedActor).toBe('thorin');
    expect(getPairing(old)).toBeNull();
    expect(first.currentActor()).toBe('thorin');
    await App.openFor('thorin'); // same actor: nothing discarded
  });

  it('PA-11b regression: the Players-list entry reopening a closed window keeps the QR of that character', async () => {
    const App = appClass();
    // Right-click own name › «Collega occhiali G2» = openFor(the user's character).
    const first = await App.openFor('mira');
    await first.autoStart();
    const shown = first.session as PairingSession;
    first._onClose(); // ✕ / ESC: the instance leaves the registry
    const again = await App.openFor('mira');
    await again.autoStart();
    expect(again).not.toBe(first);
    expect(again.session?.deviceId).toBe(shown.deviceId);
    expect(getPairing(shown.deviceId)).not.toBeNull();
    expect(projector.revoke).not.toHaveBeenCalled();
    // Another character still replaces it.
    await App.openFor('thorin');
    expect(getPairing(shown.deviceId)).toBeNull();
    again._onClose();
  });

  it('PA-12 the character picker regenerates; closing keeps the unused QR (the projector owns its expiry)', async () => {
    const app = new (appClass())();
    const select = document.createElement('select');
    select.dataset.field = 'actor';
    const option = document.createElement('option');
    option.value = 'thorin';
    select.append(option);
    app.element.append(select);
    await app._onRender();
    const first = app.session?.deviceId ?? '';
    select.value = 'thorin';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(app.session?.actorName).toBe('Thorin'));
    expect(getPairing(first)).toBeNull();
    const shown = app.session as PairingSession;
    vi.useFakeTimers();
    try {
      app._onClose();
      await vi.runAllTimersAsync(); // anything closing might have scheduled has run
    } finally {
      vi.useRealTimers();
    }
    expect(listeners).toHaveLength(0);
    // Regression (window closed with ✕/ESC right after the QR appeared): the pending
    // pairing and its projector channel survive, so a scan after closing still pairs.
    expect(listPairings().map((p) => p.deviceId)).toEqual([shown.deviceId]);
    expect(projector.revoke).not.toHaveBeenCalledWith(shown.deviceId);
  });

  it('PA-12b reopening while the QR is valid shows the same QR, code and countdown', async () => {
    const App = appClass();
    const first = new App();
    await first._onRender();
    const shown = first.session as PairingSession;
    first._onClose();
    const again = new App();
    const ctx = await again._prepareContext();
    expect(ctx.session?.code).toBe(shown.code);
    expect(ctx.session?.url).toBe(shown.url);
    expect(ctx.session?.expiresAt).toBe(shown.expiresAt);
    await again._onRender();
    expect(again.session?.deviceId).toBe(shown.deviceId);
    expect(listPairings()).toHaveLength(1);
    expect(projector.open).toHaveBeenCalledTimes(1);
    again._onClose();
  });

  it('PA-12f reopening shows the character of the QR on screen, not the assigned one', async () => {
    const App = appClass();
    const first = new App();
    first.selectedActor = 'thorin'; // picked in the window (Mira is the assigned character)
    await first._onRender();
    const shown = first.session as PairingSession;
    expect(shown.actorName).toBe('Thorin');
    first._onClose();
    const again = new App();
    const ctx = await again._prepareContext();
    expect(ctx.actors.find((a) => a.selected)?.id).toBe('thorin');
    expect(ctx.session?.deviceId).toBe(shown.deviceId);
  });

  it('PA-12c reopening after the QR expired (or was used) while closed starts a fresh one', async () => {
    const App = appClass();
    const first = new App();
    await first._onRender();
    const old = first.session as PairingSession;
    first._onClose();
    await removePairing(old.deviceId); // the projector's expiry timer fired meanwhile
    const again = new App();
    await again._onRender();
    expect(again.expired).toBe(false);
    expect(again.session?.deviceId).not.toBe(old.deviceId);
    const used = again.session as PairingSession;
    again._onClose();
    await updatePairing(used.deviceId, { expiresAt: null }); // scanned while closed
    const third = new App();
    await third._onRender();
    expect(third.session?.deviceId).not.toBe(used.deviceId);
    expect(third.connected).toBeNull();
    third._onClose();
  });

  it('PA-12d the projector expiring the QR while the window is open shows «scaduto», no new QR', async () => {
    const app = new (appClass())();
    await app._onRender();
    const shown = app.session as PairingSession;
    await removePairing(shown.deviceId);
    for (const l of listeners) l();
    await vi.waitFor(() => expect(app.expired).toBe(true));
    await app.autoStart();
    expect(app.session).toBeNull();
    expect(listPairings()).toHaveLength(0);
    app._onClose();
  });

  it('PA-12e regression: the window seeing 00:00 first (a render before the tick) still forgets the QR', async () => {
    const app = new (appClass())();
    await app._onRender();
    const shown = app.session as PairingSession;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(shown.expiresAt + 1_000);
      await app._prepareContext();
      expect(app.expired).toBe(true);
      await vi.waitFor(() => expect(projector.revoke).toHaveBeenCalledWith(shown.deviceId));
      expect(listPairings()).toHaveLength(0);
      await app.autoStart();
      expect(app.session).toBeNull();
    } finally {
      vi.useRealTimers();
      app._onClose();
    }
  });

  it('PA-RACE regression: at 00:00 the window shows «scaduto» and starts no new QR behind the player', async () => {
    // Emits like the real Projector.revoke: on channel close, then after forgetting.
    projector.revoke.mockImplementation(async (id: string) => {
      for (const l of [...listeners]) l();
      await removePairing(id);
      for (const l of [...listeners]) l();
    });
    const app = new (appClass())();
    // Foundry runs `_onRender` after every render (not awaited by the render).
    const renders: Promise<void>[] = [];
    app.render.mockImplementation(async () => {
      await app._prepareContext();
      renders.push(app._onRender());
      return app;
    });
    await app._onRender();
    const first = app.session as PairingSession;
    await app.tick(first.expiresAt);
    await vi.waitFor(() => expect(app.expired).toBe(true));
    // Drain: every render — and the autoStart it runs, and the renders those cause — settled.
    for (let seen = -1; seen !== renders.length; ) {
      seen = renders.length;
      await Promise.all(renders);
    }
    expect(app.session).toBeNull();
    expect(listPairings()).toHaveLength(0);
    app._onClose();
  });

  it('PA-13 a failing pairing start is reported, never thrown', async () => {
    const app = new (appClass())();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (f.game.settings as { set: ReturnType<typeof vi.fn> }).set.mockRejectedValueOnce(
      new Error('storage'),
    );
    await app.autoStart();
    expect(app.session).toBeNull();
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.pair');
  });

  it('PA-14 non-default endpoints are flagged: plain http on the LAN is insecure, anything else custom', async () => {
    const app = new (appClass())();
    let ctx = await app._prepareContext();
    expect(ctx.endpointNotices).toEqual([]);
    urls = { appUrl: 'http://192.168.1.67:5173/', relayUrl: 'ws://192.168.1.67:8787' };
    ctx = await app._prepareContext();
    expect(ctx.endpointNotices).toEqual([
      {
        kind: 'insecure',
        which: 'appUrl',
        url: 'http://192.168.1.67:5173/',
        tone: 'error',
        label: 'evf.pair.notice.app_insecure',
      },
      {
        kind: 'insecure',
        which: 'relayUrl',
        url: 'ws://192.168.1.67:8787',
        tone: 'error',
        label: 'evf.pair.notice.relay_insecure',
      },
    ]);
    urls = { appUrl: 'http://localhost:5173/', relayUrl: DEFAULT_RELAY_URL };
    ctx = await app._prepareContext();
    expect(ctx.endpointNotices).toEqual([
      expect.objectContaining({
        kind: 'custom',
        tone: 'warn',
        label: 'evf.pair.notice.app_custom',
      }),
    ]);
    urls = { appUrl: DEFAULT_APP_URL, relayUrl: 'ws://127.0.0.1:8787' };
    ctx = await app._prepareContext();
    expect(ctx.endpointNotices).toEqual([
      expect.objectContaining({ kind: 'custom', label: 'evf.pair.notice.relay_custom' }),
    ]);
  });

  it('PA-15 «Ripristina predefinito» resets the setting and shows a new QR for the default page', async () => {
    urls = { appUrl: 'http://192.168.1.67:5173/', relayUrl: 'ws://192.168.1.67:8787' };
    const app = new (appClass())();
    await app._onRender();
    const old = app.session as PairingSession;
    expect(old.url.startsWith('http://192.168.1.67:5173/')).toBe(true);
    await app.resetEndpoint('appUrl');
    expect(resetEndpoint).toHaveBeenCalledWith('appUrl');
    expect(getPairing(old.deviceId)).toBeNull();
    expect(app.session?.url.startsWith(DEFAULT_APP_URL)).toBe(true);
    expect((await app._prepareContext()).endpointNotices.map((n) => n.which)).toEqual(['relayUrl']);
    expect(f.notifications.info).toHaveBeenCalledWith('evf.pair.notice.reset_done');
    // The relay: re-checked before the new QR.
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    await app.resetEndpoint('relayUrl');
    expect(resetEndpoint).toHaveBeenCalledWith('relayUrl');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('evf-relay');
    expect((await app._prepareContext()).endpointNotices).toEqual([]);
    // Unknown target: no-op. A failing reset is reported, the QR kept.
    await app.resetEndpoint(undefined);
    const kept = app.session?.deviceId;
    resetEndpoint.mockRejectedValueOnce(new Error('settings'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await app.resetEndpoint('appUrl');
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.reset');
    expect(app.session?.deviceId).toBe(kept);
    expect(resetEndpoint).toHaveBeenCalledTimes(3);
  });

  it('PA-16 live status under the QR: relay, glasses in the room, last rejection', async () => {
    const app = new (appClass())();
    expect((await app._prepareContext()).live).toEqual([]);
    await app._onRender();
    let ctx = await app._prepareContext();
    expect(projector.diagnostics).toHaveBeenCalledWith(app.session?.deviceId);
    expect(ctx.live).toEqual([
      { state: 'ok', icon: 'fa-tower-broadcast', label: 'evf.pair.live.relay_up' },
      { state: 'wait', icon: 'fa-glasses', label: 'evf.pair.live.glasses_waiting' },
    ]);
    projector.diagnostics.mockReturnValue({ relay: false, glasses: true, rejected: 'stale' });
    ctx = await app._prepareContext();
    expect(ctx.live).toEqual([
      { state: 'error', icon: 'fa-tower-broadcast', label: 'evf.pair.live.relay_down' },
      { state: 'ok', icon: 'fa-glasses', label: 'evf.pair.live.glasses_in' },
      { state: 'error', icon: 'fa-clock', label: 'evf.pair.live.rejected_stale' },
    ]);
    for (const reason of ['auth', 'malformed'] as const) {
      projector.diagnostics.mockReturnValue({ relay: true, glasses: true, rejected: reason });
      ctx = await app._prepareContext();
      expect(ctx.live[2]).toMatchObject({ label: `evf.pair.live.rejected_${reason}` });
    }
    app._onClose();
  });
});

describe('«Annulla QR»', () => {
  it('PA-17 cancelling kills the shown QR at once and starts no new one until «Nuovo QR»', async () => {
    const App = appClass();
    const app = new App();
    await app._onRender();
    const shown = app.session as PairingSession;
    await app.cancelQr();
    expect(projector.revoke).toHaveBeenCalledWith(shown.deviceId);
    expect(getPairing(shown.deviceId)).toBeNull();
    expect(app.session).toBeNull();
    expect(f.notifications.info).toHaveBeenCalledWith('evf.pair.cancelled_toast');
    const ctx = await app._prepareContext();
    expect(ctx).toMatchObject({ cancelled: true, session: null, expired: false });
    await app.autoStart(); // a render after the cancel must not sneak a new QR in
    expect(app.session).toBeNull();
    expect(listPairings()).toHaveLength(0);
    // Reopening the closed window after a cancel does not bring the dead QR back.
    app._onClose();
    const again = new App();
    expect((await again._prepareContext()).session).toBeNull();
    await app.newQr();
    expect(app.cancelled).toBe(false);
    expect(app.session?.deviceId).not.toBe(shown.deviceId);
    app._onClose();
  });
});

describe('«Ingrandisci QR»', () => {
  it('PA-18 toggles a big QR (a phone photo needs it large) and keeps it across a new QR', async () => {
    const app = new (appClass())();
    await app._onRender();
    expect((await app._prepareContext()).bigQr).toBe(false);
    app.render.mockClear();
    await app.toggleQrSize();
    expect(app.render).toHaveBeenCalled();
    expect((await app._prepareContext()).bigQr).toBe(true);
    const first = app.session as PairingSession;
    await app.newQr();
    expect(app.session?.deviceId).not.toBe(first.deviceId);
    expect((await app._prepareContext()).bigQr).toBe(true);
    await app.toggleQrSize();
    expect((await app._prepareContext()).bigQr).toBe(false);
    app._onClose();
  });
});

describe('endpointNotice', () => {
  it('EN-01 default → null; http/ws off loopback → insecure; anything else non-default → custom', () => {
    expect(endpointNotice(DEFAULT_APP_URL, DEFAULT_APP_URL)).toBeNull();
    expect(endpointNotice(DEFAULT_APP_URL.replace(/\/$/, ''), DEFAULT_APP_URL)).toBeNull();
    expect(endpointNotice('http://192.168.1.67:5173/', DEFAULT_APP_URL)).toBe('insecure');
    expect(endpointNotice('http://my-pc.local:5173/', DEFAULT_APP_URL)).toBe('insecure');
    expect(endpointNotice('ws://10.0.0.2:8787', DEFAULT_RELAY_URL)).toBe('insecure');
    expect(endpointNotice('http://localhost:5173/', DEFAULT_APP_URL)).toBe('custom');
    expect(endpointNotice('http://127.0.0.1:5173/', DEFAULT_APP_URL)).toBe('custom');
    expect(endpointNotice('ws://[::1]:8787', DEFAULT_RELAY_URL)).toBe('custom');
    expect(endpointNotice('https://example.org/app/', DEFAULT_APP_URL)).toBe('custom');
    expect(endpointNotice(`${DEFAULT_APP_URL}?debug=1`, DEFAULT_APP_URL)).toBe('custom');
    expect(endpointNotice('not a url', DEFAULT_APP_URL)).toBe('custom');
  });
});
