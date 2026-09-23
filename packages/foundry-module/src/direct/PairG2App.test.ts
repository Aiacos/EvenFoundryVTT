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
  PAIR_TEMPLATE,
  type PairContext,
} from './PairG2App.js';
import { getDevice, upsertDevice } from './pairing-store.js';
import type { Projector } from './projector.js';

interface AppLike {
  session: { g2UserId: string; code: string; expiresAt: number } | null;
  expired: boolean;
  confirmingRevoke: string | null;
  selectedPlayer: string | null;
  selectedActor: string | null;
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
}

let f: FoundryMock;
const projector = { isOnline: vi.fn(() => false), revoke: vi.fn(async () => undefined) };

function makeApp(): AppLike {
  const App = createPairG2App(projector as unknown as Projector);
  return new (App as unknown as new () => AppLike)();
}

beforeEach(() => {
  f = installFoundry({
    users: [makeUser('p1', 'Luca', { character: { id: 'mira' } }), makeUser('p2', 'Bea')],
    actors: [makeActor('thorin', 'Thorin'), makeActor('mira', 'Mira')],
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
    expect(Object.keys(App.DEFAULT_OPTIONS.actions)).toEqual([
      'pair',
      'copyCode',
      'revoke',
      'confirmRevoke',
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
    expect(ctx.checks).toMatchObject({ served: true, socket: true });
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
    expect(ctx.baseUrlHint).toMatch(/\/modules\/evenfoundryvtt\/g2\/index\.html$/);

    app.element.innerHTML = '<strong data-countdown></strong>';
    await app.tick((session?.expiresAt ?? 0) - 61_000);
    expect(app.element.textContent).toBe('01:01');
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
    f.actors.set('thorin', makeActor('thorin', 'Thorin'));
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
    expect(calls).toEqual(['pair', 'copy', 'ask:u9', 'revoke:u9']);
  });
});
