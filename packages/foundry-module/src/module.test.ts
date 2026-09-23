/**
 * Entry-point tests: `init` registers settings + pairing menus, `ready` starts the
 * direct projector on every client (ADR-0012, ADR-0013) and syncs key custody.
 */
import { DIRECT_SOCKET_EVENT } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FoundryMock, installFoundry, makeUser } from './__tests__/direct-fixtures.js';

let f: FoundryMock;

beforeEach(() => {
  vi.resetModules();
  f = installFoundry();
});
afterEach(() => vi.unstubAllGlobals());

async function load() {
  return import('./module.js');
}

describe('module entry', () => {
  it('MOD-01 exports MODULE_ID and registers init + ready once', async () => {
    const mod = await load();
    expect(mod.MODULE_ID).toBe('evenfoundryvtt');
    expect(f.hooks.once).toHaveBeenCalledWith('init', expect.any(Function));
    expect(f.hooks.once).toHaveBeenCalledWith('ready', expect.any(Function));
  });

  it('MOD-02 init registers the hidden pairing settings and the restricted pairing menu', async () => {
    await load();
    f.fire('init');
    const settings = f.game.settings as {
      register: ReturnType<typeof vi.fn>;
      registerMenu: ReturnType<typeof vi.fn>;
    };
    expect(
      settings.register.mock.calls.map((c) => [c[1], (c[2] as { scope: string }).scope]),
    ).toEqual([
      ['g2Devices', 'world'],
      ['g2DeviceKeys', 'client'],
      ['identityKey', 'client'],
      ['g2Access', 'world'],
    ]);
    expect(settings.registerMenu).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'pairMyG2',
      expect.objectContaining({ name: 'evf.settings.pair_self_button', restricted: false }),
    );
    expect(settings.registerMenu).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'pairG2',
      expect.objectContaining({
        name: 'evf.settings.pair_button',
        restricted: true,
        type: expect.any(Function),
      }),
    );
  });

  it('MOD-02b init adds «Pair G2 glasses» to the Players list context menu', async () => {
    await load();
    f.fire('init');
    expect(f.hooks.on).toHaveBeenCalledWith('getUserContextOptions', expect.any(Function));

    // Clicking the entry opens the pairing window preselected on that player.
    f.users.push(makeUser('p1', 'Luca', { character: { id: 'mira' } }));
    const items: Array<{ callback: (li: HTMLElement) => void }> = [];
    f.fire('getUserContextOptions', {}, items);
    const li = document.createElement('li');
    li.dataset.userId = 'p1';
    items[0]?.callback(li);
    await vi.waitFor(() => expect(f.notifications.error).not.toHaveBeenCalled());

    // A failure while opening is logged, never thrown into Foundry's menu code.
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(foundry.applications, 'instances', {
      get() {
        throw new Error('boom');
      },
    });
    items[0]?.callback(li);
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        '[EVF] could not open the pairing window',
        expect.any(Error),
      ),
    );
    error.mockRestore();
  });

  it('MOD-03 detectedLocale normalises the Foundry language tag', async () => {
    (f.game.i18n as { lang: string }).lang = 'it-IT';
    await load();
    f.fire('init');
    const { detectedLocale } = await import('./settings.js');
    expect(detectedLocale).toBe('it');
  });

  it('MOD-04 detectedLocale falls back to en without game.i18n', async () => {
    (f.game as { i18n?: unknown }).i18n = undefined;
    await load();
    f.fire('init');
    const { detectedLocale } = await import('./settings.js');
    expect(detectedLocale).toBe('en');
  });

  it('MOD-05 ready on a GM client starts the projector and wires delta sources', async () => {
    await load();
    f.fire('ready');
    expect((f.game.socket as { on: ReturnType<typeof vi.fn> }).on).toHaveBeenCalledWith(
      DIRECT_SOCKET_EVENT,
      expect.any(Function),
    );
    const hooks = f.hooks.on.mock.calls.map((c) => c[0]);
    for (const h of [
      'updateToken',
      'createChatMessage',
      'updateActor',
      'updateCombat',
      'dnd5e.preUseActivity',
    ]) {
      expect(hooks).toContain(h);
    }
  });

  it('MOD-07 combat trackers follow the paired actors (not the GM character) on turn change', async () => {
    const mod = await load();
    f.fire('init');
    const store = await import('./direct/pairing-store.js');
    await store.upsertDevice(
      {
        g2UserId: 'g2a',
        playerUserId: 'p1',
        actorId: 'thorin',
        label: 'Luca (G2)',
        createdAt: 0,
        lastSeenAt: null,
        pendingRotation: false,
      },
      'k',
    );
    const push = vi.spyOn(mod.projector, 'pushDelta');
    f.fire('ready');
    f.fire('updateCombat', {}, { turn: 1 }, {}, 'gm1');
    const topics = push.mock.calls.map((c) => [c[0], (c[1] as { actorId?: string }).actorId]);
    expect(topics).toContainEqual(['r1.action.economy', 'thorin']);
    expect(topics).toContainEqual(['r1.movement.budget', 'thorin']);
  });

  it('MOD-06 ready on a player client also runs a projector and publishes its identity key', async () => {
    f.game.user.isGM = false;
    await load();
    f.fire('ready');
    expect((f.game.socket as { on: ReturnType<typeof vi.fn> }).on).toHaveBeenCalledWith(
      DIRECT_SOCKET_EVENT,
      expect.any(Function),
    );
    await vi.waitFor(() => expect(f.game.user.flags.evenfoundryvtt?.pub).toBeDefined(), {
      timeout: 5_000,
    });
    const hooks = f.hooks.on.mock.calls.map((c) => c[0]);
    expect(hooks).toContain('updateUser');
    expect(hooks).not.toContain('createActor'); // ownership mirror is GM-only
  });

  it('MOD-08 ready on a GM client starts the ownership mirror; custody failures are logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (f.game.settings as { set: ReturnType<typeof vi.fn> }).set.mockRejectedValue(new Error('db'));
    await load();
    f.fire('ready');
    await vi.waitFor(
      () => expect(f.hooks.on.mock.calls.map((c) => c[0])).toContain('createActor'),
      { timeout: 5_000 },
    );
    expect(error).toHaveBeenCalledWith(
      '[EVF] custody sync: publishing the identity key failed',
      expect.any(Error),
    );
    error.mockRestore();
  });
});
