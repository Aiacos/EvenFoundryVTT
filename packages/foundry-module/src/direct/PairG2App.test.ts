import { DEFAULT_APP_URL, DEFAULT_RELAY_URL } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FoundryMock,
  installFoundry,
  makeActor,
  makeUser,
} from '../__tests__/direct-fixtures.js';
import {
  createPairG2App,
  formatLastSeen,
  formatRemaining,
  PAIR_APP_ID,
  PAIR_TEMPLATE,
  type PairContext,
  sessionView,
} from './PairG2App.js';
import { PAIRING_TTL_MS, type PairingSession } from './pairing-flow.js';
import { getPairing, listPairings, updatePairing } from './pairing-store.js';
import type { DeviceStatus, Projector } from './projector.js';

interface AppLike {
  session: PairingSession | null;
  expired: boolean;
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
  copyCode(): Promise<void>;
  recheck(): Promise<void>;
  askRevoke(id: string | undefined): Promise<void>;
  revoke(id: string | undefined): Promise<void>;
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
    const { removePairing } = await import('./pairing-store.js');
    await removePairing(id);
  }),
};
const endpoints = () => ({ appUrl: DEFAULT_APP_URL, relayUrl: DEFAULT_RELAY_URL });

function appClass(): AppClassLike {
  return createPairG2App(projector as unknown as Projector, endpoints) as unknown as AppClassLike;
}

beforeEach(() => {
  listeners = [];
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
      'copyCode',
      'recheck',
      'revoke',
      'confirmRevoke',
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

  it('PA-12 the character picker regenerates; closing discards an unused QR', async () => {
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
    app._onClose();
    await vi.waitFor(() => expect(listPairings()).toHaveLength(0));
    expect(listeners).toHaveLength(0);
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
});
