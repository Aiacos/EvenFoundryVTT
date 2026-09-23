import { generateIdentityKeyPair } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  becomeClient,
  type FoundryMock,
  installFoundry,
  makeActor,
  makeUser,
} from '../__tests__/direct-fixtures.js';
import { enableGlasses, getAccess } from './glasses-access.js';
import {
  codeGroups,
  createPairG2App,
  formatLastSeen,
  formatRemaining,
  glassesStatus,
  PAIR_APP_ID,
  PAIR_SELF_APP_ID,
  PAIR_TEMPLATE,
  type PairContext,
  sessionView,
  toCheckRows,
} from './PairG2App.js';
import { PAIRING_TTL_MS } from './pairing-flow.js';
import { getDevice, updateDeviceMeta, upsertDevice } from './pairing-store.js';
import type { PairTarget } from './players-menu.js';
import type { Projector } from './projector.js';

interface AppLike {
  session: { g2UserId: string; code: string; expiresAt: number } | null;
  expired: boolean;
  confirmingRevoke: string | null;
  selectedPlayer: string | null;
  selectedActor: string | null;
  connected: { label: string; actorName: string } | null;
  checks: unknown;
  element: HTMLElement;
  render: ReturnType<typeof vi.fn>;
  _prepareContext(): Promise<PairContext>;
  _onRender(): Promise<void>;
  _onClose(): void;
  tick(now?: number): Promise<void>;
  pair(): Promise<void>;
  copyCode(): Promise<void>;
  askRevoke(id: string | undefined): Promise<void>;
  revoke(id: string | undefined): Promise<void>;
  recheck(): Promise<void>;
  pairAnother(): Promise<void>;
  preselect(target: PairTarget): void;
  enable(ids: readonly string[]): Promise<void>;
  regenerate(id: string | undefined): Promise<void>;
}

interface AppClassLike {
  new (): AppLike;
  openFor(target: PairTarget | null): Promise<AppLike>;
}

let f: FoundryMock;
const projector = {
  isOnline: vi.fn((_id: string, _now?: number) => false),
  revoke: vi.fn(async () => undefined),
};

function makeApp(): AppLike {
  const App = createPairG2App(projector as unknown as Projector);
  return new (App as unknown as new () => AppLike)();
}

beforeEach(() => {
  f = installFoundry({
    users: [makeUser('p1', 'Luca', { character: { id: 'mira' } }), makeUser('p2', 'Bea')],
    actors: [
      makeActor('thorin', 'Thorin', { ownership: { p1: 3, p2: 3 } }),
      makeActor('mira', 'Mira', { ownership: { p1: 3, p2: 3 } }),
    ],
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  projector.isOnline.mockReturnValue(false);
  projector.revoke.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('formatters', () => {
  it('formatRemaining → mm:ss, never negative', () => {
    expect(formatRemaining(292_000)).toBe('04:52');
    expect(formatRemaining(-5)).toBe('00:00');
  });
  it('formatLastSeen: online seconds, never, minutes', () => {
    expect(formatLastSeen(88_000, true, 100_000)).toBe(
      'evf.pair.devices.seen_seconds:{"seconds":12}',
    );
    expect(formatLastSeen(null, true, 100_000)).toBe('evf.pair.devices.seen_seconds:{"seconds":0}');
    expect(formatLastSeen(null, false, 100_000)).toBe('evf.pair.devices.never');
    expect(formatLastSeen(0, false, 600_000)).toBe('evf.pair.devices.seen_minutes:{"minutes":10}');
  });
});

describe('PairG2App', () => {
  it('PA-01 declares ApplicationV2 options, actions and the Handlebars part', () => {
    const App = createPairG2App(projector as unknown as Projector) as unknown as {
      DEFAULT_OPTIONS: { id: string; window: { title: string }; actions: Record<string, unknown> };
      PARTS: { main: { template: string } };
    };
    expect(App.DEFAULT_OPTIONS.id).toBe('evf-pair-g2');
    expect(App.DEFAULT_OPTIONS.window.title).toBe('evf.pair.title');
    expect(App.DEFAULT_OPTIONS.id).toBe(PAIR_APP_ID);
    expect(Object.keys(App.DEFAULT_OPTIONS.actions)).toEqual([
      'pair',
      'copyCode',
      'revoke',
      'confirmRevoke',
      'recheck',
      'pairAnother',
      'enable',
      'enableAll',
      'regenerate',
    ]);
    expect(App.PARTS.main.template).toBe(PAIR_TEMPLATE);
  });

  it('PA-02 context: players exclude GM and G2 users, character preselected from the player', async () => {
    f.users.push(makeUser('g2x', 'Luca (G2)', { flags: { evenfoundryvtt: { g2For: 'p1' } } }));
    await upsertDevice(
      {
        g2UserId: 'g2x',
        playerUserId: 'p1',
        actorId: 'gone',
        label: 'Luca (G2)',
        createdAt: 1,
        lastSeenAt: null,
        pendingRotation: false,
      },
      'k'.repeat(43),
    );
    const app = makeApp();
    app.confirmingRevoke = 'g2x';
    const ctx = await app._prepareContext();
    expect(ctx.players.map((p) => [p.id, p.selected])).toEqual([
      ['p1', true],
      ['p2', false],
    ]);
    expect(ctx.actors.find((a) => a.selected)?.id).toBe('mira');
    expect(ctx.session).toBeNull();
    expect(ctx.connected).toBeNull();
    expect(ctx.checks.find((c) => c.key === 'served')?.state).toBe('ok');
    expect(ctx.checks.find((c) => c.key === 'socket')?.state).toBe('ok');
    expect(ctx.devices).toEqual([
      {
        g2UserId: 'g2x',
        label: 'Luca (G2)',
        actorName: '—',
        online: false,
        lastSeen: 'evf.pair.devices.never',
        confirming: true,
      },
    ]);
  });

  it('PA-03 pair → session with countdown; tick expires it and rotates credentials', async () => {
    const app = makeApp();
    app.selectedPlayer = 'p2';
    app.selectedActor = 'thorin';
    await app.pair();
    expect(app.render).toHaveBeenCalled();
    const session = app.session;
    expect(session).not.toBeNull();
    const ctx = await app._prepareContext();
    expect(ctx.session?.remaining).toBe('05:00');
    expect(ctx.session?.codeGroups).toHaveLength(4);
    expect(ctx.session?.secondsTotal).toBe(300);
    expect(ctx.baseUrlHint).toMatch(/\/modules\/evenfoundryvtt\/g2\/index\.html$/);

    app.element.innerHTML =
      '<strong data-countdown></strong><progress data-countdown-bar max="300" value="300"></progress>';
    await app.tick((session?.expiresAt ?? 0) - 61_000);
    expect(app.element.querySelector('[data-countdown]')?.textContent).toBe('01:01');
    expect(app.element.querySelector('progress')?.value).toBe(61);
    const keyBefore = getDevice(session?.g2UserId ?? '')?.key;
    await app.tick((session?.expiresAt ?? 0) + 1);
    expect(app.session).toBeNull();
    expect(app.expired).toBe(true);
    expect(getDevice(session?.g2UserId ?? '')?.key).not.toBe(keyBefore);
    await app.tick(); // no session: no-op
  });

  it('PA-04 pair errors: nothing selectable, startPairing failure', async () => {
    const app = makeApp();
    f.actors.clear();
    await app.pair();
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.select');
    f.actors.set('thorin', makeActor('thorin', 'Thorin', { ownership: { p2: 3 } }));
    f.createUser.mockRejectedValueOnce(new Error('denied'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    app.selectedPlayer = 'p2';
    await app.pair();
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.pair');
    expect(app.session).toBeNull();
  });

  it('PA-05 expiry rotation failure is reported', async () => {
    const app = makeApp();
    app.session = { g2UserId: 'ghost-with-pending', code: 'x', expiresAt: 0 };
    await upsertDevice(
      {
        g2UserId: 'ghost-with-pending',
        playerUserId: 'p1',
        actorId: 'thorin',
        label: 'x',
        createdAt: 1,
        lastSeenAt: null,
        pendingRotation: true,
      },
      'k'.repeat(43),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await app.tick(1);
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.expire');
  });

  it('PA-06 copyCode uses the clipboard and reports failures', async () => {
    const app = makeApp();
    await app.copyCode(); // no session
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    app.session = { g2UserId: 'u', code: 'AAAA-BBBB-CCCC-DDDD', expiresAt: 1 };
    await app.copyCode();
    expect(writeText).toHaveBeenCalledWith('AAAA-BBBB-CCCC-DDDD');
    expect(f.notifications.info).toHaveBeenCalledWith('evf.pair.code_copied');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await app.copyCode();
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.clipboard');
  });

  it('PA-07 revoke: confirm step, projector notified, device removed, errors reported', async () => {
    const app = makeApp();
    app.selectedPlayer = 'p1';
    app.selectedActor = 'thorin';
    await app.pair();
    const id = app.session?.g2UserId ?? '';
    await app.askRevoke(id);
    expect(app.confirmingRevoke).toBe(id);
    await app.revoke(id);
    expect(projector.revoke).toHaveBeenCalledWith(id);
    expect(getDevice(id)).toBeNull();
    expect(app.session).toBeNull();
    expect(f.notifications.info).toHaveBeenCalledWith('evf.pair.revoked');

    await app.revoke(undefined);
    await app.askRevoke(undefined);
    expect(app.confirmingRevoke).toBeNull();

    f.users.push(makeUser('human', 'Not G2'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await app.revoke('human');
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.revoke');
  });

  it('PA-08 render hooks: selects update the selection, ticker runs only with a session, close stops it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const app = makeApp();
    app.element.innerHTML =
      '<select data-field="player"><option value="p2">B</option></select><select data-field="actor"><option value="mira">M</option></select>';
    await app._onRender();
    for (const select of Array.from(app.element.querySelectorAll('select'))) {
      select.dispatchEvent(new Event('change'));
    }
    expect(app.selectedPlayer).toBe('p2');
    expect(app.selectedActor).toBe('mira');
    expect(app.render).toHaveBeenCalledTimes(1); // player change redraws

    // Picking a player with an assigned character preselects that character.
    app.element.innerHTML = '<select data-field="player"><option value="p1">L</option></select>';
    app.selectedActor = 'thorin';
    await app._onRender();
    app.element.querySelector('select')?.dispatchEvent(new Event('change'));
    expect(app.selectedPlayer).toBe('p1');
    expect(app.selectedActor).toBe('mira');

    app.session = { g2UserId: 'u', code: 'c', expiresAt: Date.now() + 100_000 };
    const tick = vi.spyOn(app, 'tick').mockResolvedValue(undefined);
    await app._onRender();
    vi.advanceTimersByTime(1_000);
    expect(tick).toHaveBeenCalledTimes(1);
    app._onClose();
    vi.advanceTimersByTime(5_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('PA-09 action handlers delegate to the instance', async () => {
    const App = createPairG2App(projector as unknown as Projector) as unknown as {
      DEFAULT_OPTIONS: {
        actions: Record<
          string,
          (this: AppLike, e: Event, t: { dataset: DOMStringMap }) => Promise<void>
        >;
      };
    };
    const app = makeApp();
    const calls: string[] = [];
    app.pair = async () => void calls.push('pair');
    app.copyCode = async () => void calls.push('copy');
    app.askRevoke = async (id) => void calls.push(`ask:${id}`);
    app.revoke = async (id) => void calls.push(`revoke:${id}`);
    const { actions } = App.DEFAULT_OPTIONS;
    const target = { dataset: { userId: 'u9' } };
    const ev = new Event('click');
    await actions.pair?.call(app, ev, target);
    await actions.copyCode?.call(app, ev, target);
    await actions.revoke?.call(app, ev, target);
    await actions.confirmRevoke?.call(app, ev, target);
    app.recheck = async () => void calls.push('recheck');
    app.pairAnother = async () => void calls.push('another');
    await actions.recheck?.call(app, ev, target);
    await actions.pairAnother?.call(app, ev, target);
    expect(calls).toEqual(['pair', 'copy', 'ask:u9', 'revoke:u9', 'recheck', 'another']);
  });

  it('PA-10 success state: the tick switches to «connected» once the device said hello', async () => {
    const app = makeApp();
    app.selectedPlayer = 'p1';
    app.selectedActor = 'thorin';
    await app.pair();
    const session = app.session;
    const id = session?.g2UserId ?? '';
    await app.tick((session?.expiresAt ?? 0) - 10_000);
    expect(app.connected).toBeNull(); // still pending

    // The projector consumes the one-time credentials on `hello`.
    await updateDeviceMeta(id, { pendingRotation: false });
    app.render.mockClear();
    await app.tick((session?.expiresAt ?? 0) - 9_000);
    expect(app.session).toBeNull();
    expect(app.expired).toBe(false);
    expect(app.connected).toEqual({ label: 'Luca (G2)', actorName: 'Thorin' });
    expect(f.notifications.info).toHaveBeenCalledWith(
      'evf.pair.connected.toast:{"actor":"Thorin"}',
    );
    expect(app.render).toHaveBeenCalledTimes(1);
    const ctx = await app._prepareContext();
    expect(ctx.connected).toEqual({ label: 'Luca (G2)', actorName: 'Thorin' });

    await app.pairAnother();
    expect(app.connected).toBeNull();
  });

  it('PA-11 success state also when the projector sees the device online (rotation failed)', async () => {
    const app = makeApp();
    app.selectedPlayer = 'p2';
    app.selectedActor = 'mira';
    await app.pair();
    const session = app.session;
    projector.isOnline.mockImplementation((id: string) => id === session?.g2UserId);
    await app.tick((session?.expiresAt ?? 0) - 1_000);
    expect(app.connected).toEqual({ label: 'Bea (G2)', actorName: 'Mira' });
    // A new QR leaves the success state.
    projector.isOnline.mockReturnValue(false);
    await app.pair();
    expect(app.connected).toBeNull();
  });

  it('PA-12b roster: only the characters the chosen player owns; a stale selection falls back', async () => {
    const app = makeApp();
    (f.actors.get('mira') as { ownership: Record<string, number> }).ownership = { p1: 3 };
    app.selectedPlayer = 'p2';
    app.selectedActor = 'mira'; // not owned by p2 → ignored
    const ctx = await app._prepareContext();
    expect(ctx.actors).toEqual([{ id: 'thorin', name: 'Thorin', selected: true }]);
    (f.actors.get('thorin') as { ownership: Record<string, number> }).ownership = {};
    expect((await app._prepareContext()).actors).toEqual([]);
  });

  it('PA-12 preselect + openFor: player and character preselected, open instance reused', async () => {
    const App = createPairG2App(projector as unknown as Projector) as unknown as AppClassLike;
    const opened = await App.openFor({ playerUserId: 'p2', actorId: 'thorin' });
    expect(opened.selectedPlayer).toBe('p2');
    expect(opened.selectedActor).toBe('thorin');
    expect(opened.render).toHaveBeenCalledWith({ force: true });
    const ctx = await opened._prepareContext();
    expect(ctx.players.find((p) => p.selected)?.id).toBe('p2');
    expect(ctx.actors.find((a) => a.selected)?.id).toBe('thorin');

    // Already open (registered under PAIR_APP_ID) → same instance, new selection.
    opened.connected = { label: 'x', actorName: 'y' };
    (foundry.applications as { instances?: Map<string, unknown> }).instances = new Map([
      [PAIR_APP_ID, opened],
    ]);
    const again = await App.openFor({ playerUserId: 'p1', actorId: null });
    expect(again).toBe(opened);
    expect(again.selectedPlayer).toBe('p1');
    expect(again.connected).toBeNull();
    // No actor given → the player's assigned character.
    expect((await again._prepareContext()).actors.find((a) => a.selected)?.id).toBe('mira');
  });

  it('PA-13 recheck re-runs the environment checks', async () => {
    const app = makeApp();
    await app._prepareContext();
    expect(app.checks).not.toBeNull();
    await app.recheck();
    expect(app.checks).toBeNull();
    expect(app.render).toHaveBeenCalled();
  });
});

describe('view helpers', () => {
  it('toCheckRows: pills ok / error / warn with a fix + guide only on failure', () => {
    const rows = toCheckRows({ https: false, publicHost: true, served: false, socket: false });
    expect(rows.map((r) => [r.key, r.state])).toEqual([
      ['https', 'error'],
      ['publicHost', 'ok'],
      ['served', 'error'],
      ['socket', 'warn'],
    ]);
    const [https, publicHost, served, socket] = rows;
    expect(https).toMatchObject({
      icon: 'fas fa-circle-xmark',
      label: 'evf.pair.check.https',
      fix: 'evf.pair.check.https_fix',
    });
    expect(https?.guide).toMatch(/setup-guide\.md#-https-reachable-from-the-phone$/);
    expect(publicHost).toMatchObject({ icon: 'fas fa-circle-check', fix: null, guide: null });
    expect(served?.guide).toMatch(/#-install-the-module$/);
    expect(socket).toMatchObject({
      icon: 'fas fa-triangle-exclamation',
      fix: 'evf.pair.check.socket_fix',
    });
  });

  it('codeGroups + sessionView', () => {
    expect(codeGroups('ABCD-EFGH-JKMN-PQRS')).toEqual(['ABCD', 'EFGH', 'JKMN', 'PQRS']);
    const view = sessionView(
      {
        g2UserId: 'u',
        label: 'L (G2)',
        actorId: 'a',
        actorName: 'A',
        code: 'ABCD-EFGH-JKMN-PQRS',
        url: 'https://x/#evf=1',
        qrSvg: '<svg/>',
        expiresAt: 100_000,
      },
      100_000 - 90_500,
    );
    expect(view).toMatchObject({ remaining: '01:31', secondsLeft: 91 });
    expect(view.secondsTotal).toBe(PAIRING_TTL_MS / 1000);
    expect(sessionView({ ...view, expiresAt: 0 }, 5).secondsLeft).toBe(0);
  });

  it('PA-14 GM enablement: statuses, enable one / all, regenerate, failures reported', async () => {
    const app = makeApp();
    let ctx = await app._prepareContext();
    expect(ctx).toMatchObject({ mode: 'gm', isGm: true, selfBlock: null, selfBlockLabel: null });
    expect(ctx.enablement.map((r) => [r.playerUserId, r.status, r.enabled])).toEqual([
      ['p1', 'disabled', false],
      ['p2', 'disabled', false],
    ]);
    await app.enable(['p1']);
    expect(f.notifications.info).toHaveBeenCalledWith('evf.pair.enable.done:{"count":1}');
    ctx = await app._prepareContext();
    expect(ctx.enablement[0]).toMatchObject({
      status: 'enabled',
      statusLabel: 'evf.pair.enable.status.enabled',
      enabled: true,
      waiting: true, // p1 never published a key
    });
    const App = createPairG2App(projector as unknown as Projector) as unknown as {
      DEFAULT_OPTIONS: {
        actions: Record<
          string,
          (this: AppLike, e: Event, t: { dataset: DOMStringMap }) => Promise<void>
        >;
      };
    };
    const ev = new Event('click');
    await App.DEFAULT_OPTIONS.actions.enableAll?.call(app, ev, { dataset: {} });
    expect(getAccess('p2')).not.toBeNull();
    await App.DEFAULT_OPTIONS.actions.enable?.call(app, ev, { dataset: {} }); // nothing to do
    await App.DEFAULT_OPTIONS.actions.regenerate?.call(app, ev, { dataset: { userId: 'p1' } });
    expect(f.notifications.info).toHaveBeenCalledWith('evf.pair.enable.regenerated');
    await app.regenerate(undefined);

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await app.enable(['gm1']);
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.enable');
    await app.regenerate('ghost');
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.error.regenerate');
    expect(error).toHaveBeenCalled();
  });

  it('PA-15 glassesStatus: online > paired (self or on behalf) > enabled > disabled', async () => {
    const p1 = f.users.find((u) => u.id === 'p1');
    if (p1 === undefined) throw new Error('p1');
    const off = (): boolean => false;
    expect(glassesStatus(p1, off).status).toBe('disabled');
    const g2Id = await enableGlasses('p1');
    expect(glassesStatus(p1, off).status).toBe('enabled');
    p1.flags = {
      ...p1.flags,
      evenfoundryvtt: {
        ...p1.flags.evenfoundryvtt,
        device: {
          g2UserId: g2Id,
          actorId: 'mira',
          pendingRotation: false,
          playerHasKey: true,
          updatedAt: 1,
        },
      },
    };
    expect(glassesStatus(p1, off).status).toBe('paired');
    expect(glassesStatus(p1, (id) => id === g2Id).status).toBe('online');
    const g2 = f.users.find((u) => u.id === g2Id);
    if (g2 === undefined) throw new Error('g2');
    g2.active = true;
    expect(glassesStatus(p1, off).status).toBe('online');
    // Paired on behalf of p2 (GM-held key), not enabled.
    const p2 = f.users.find((u) => u.id === 'p2');
    if (p2 === undefined) throw new Error('p2');
    await upsertDevice(
      {
        g2UserId: 'g2b',
        playerUserId: 'p2',
        actorId: 'thorin',
        label: 'Bea (G2)',
        createdAt: 1,
        lastSeenAt: null,
        pendingRotation: false,
        keyHolder: 'gm1',
      },
      'k'.repeat(43),
    );
    expect(glassesStatus(p2, off)).toEqual({ status: 'paired', waiting: false });
  });

  it('PA-16 player mode: self-service QR, blocks explained, expiry and connection from own flags', async () => {
    const browsers = new Map<string, Map<string, unknown>>();
    const gmId = await generateIdentityKeyPair();
    const pId = await generateIdentityKeyPair();
    becomeClient(f, 'gm1', browsers, gmId);
    const Self = createPairG2App(
      projector as unknown as Projector,
      'player',
    ) as unknown as AppClassLike & {
      DEFAULT_OPTIONS: { id: string; window: { title: string } };
    };
    expect(Self.DEFAULT_OPTIONS.id).toBe(PAIR_SELF_APP_ID);
    expect(Self.DEFAULT_OPTIONS.window.title).toBe('evf.pair.self.title');

    becomeClient(f, 'p1', browsers, pId);
    let app = new (Self as unknown as new () => AppLike)();
    let ctx = await app._prepareContext();
    expect(ctx).toMatchObject({
      mode: 'player',
      isGm: false,
      selfBlock: 'not_enabled',
      players: [],
      devices: [],
    });
    expect(ctx.selfBlockLabel).toBe('evf.pair.self.not_enabled');

    becomeClient(f, 'gm1', browsers, null);
    const mira = f.actors.get('mira') as { ownership: Record<string, number> };
    mira.ownership = { p1: 3 };
    (f.actors.get('thorin') as { ownership: Record<string, number> }).ownership = {};
    const g2Id = await enableGlasses('p1');
    becomeClient(f, 'p1', browsers, null);
    app = await Self.openFor(null);
    ctx = await app._prepareContext();
    expect(ctx.selfBlock).toBeNull();
    expect(ctx.actors).toEqual([{ id: 'mira', name: 'Mira', selected: true }]);

    await app.pair();
    const session = app.session;
    expect(session?.g2UserId).toBe(g2Id);
    // Expiry rotates the self key.
    const before = getDevice(g2Id)?.key;
    await app.tick((session?.expiresAt ?? 0) + 1);
    expect(app.expired).toBe(true);
    expect(getDevice(g2Id)?.key).not.toBe(before);

    // New QR; the player's projector consumes it (pendingRotation false on the own flag).
    await app.pair();
    const p1 = f.users.find((u) => u.id === 'p1');
    const device = p1?.flags.evenfoundryvtt?.device as { pendingRotation: boolean };
    device.pendingRotation = false;
    await app.tick((app.session?.expiresAt ?? 0) - 1_000);
    expect(app.connected).toEqual({ label: 'Luca (G2)', actorName: 'Mira' });

    // Owning nothing → no_actor; not-owned selection refused with its reason.
    mira.ownership = {};
    ctx = await app._prepareContext();
    expect(ctx.selfBlock).toBe('no_actor');
    app.selectedActor = 'mira';
    ctx.actors.push({ id: 'mira', name: 'Mira', selected: true });
    app._prepareContext = async () => ctx;
    await app.pair();
    expect(f.notifications.error).toHaveBeenCalledWith('evf.pair.self.no_actor');
  });

  it('PA-17 codeGroups handles a missing manual code; copy is a no-op without code', async () => {
    expect(codeGroups(null)).toEqual([]);
    const app = makeApp();
    app.session = { g2UserId: 'x', code: null as unknown as string, expiresAt: 0 };
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await app.copyCode();
    expect(writeText).not.toHaveBeenCalled();
  });
});
