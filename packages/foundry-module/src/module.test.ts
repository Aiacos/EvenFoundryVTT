/**
 * Entry-point tests: `init` registers settings + «Collega occhiali G2» (menu, Players
 * list, keybinding); `ready` starts the projector on every client (ADR-0019).
 */
import {
  DEFAULT_APP_URL,
  DEFAULT_RELAY_URL,
  generateDeviceKey,
  generateRoomId,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FoundryMock, installFoundry, makeUser } from './__tests__/direct-fixtures.js';

let f: FoundryMock;

beforeEach(() => {
  vi.resetModules();
  f = installFoundry();
  // No real sockets in tests: the projector's relay links never connect.
  vi.stubGlobal(
    'WebSocket',
    class {
      readyState = 0;
      onopen = null;
      onmessage = null;
      onclose = null;
      onerror = null;
      send(): void {}
      close(): void {}
    },
  );
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

  it('MOD-02 init registers the client settings and an unrestricted pairing menu', async () => {
    await load();
    f.fire('init');
    const settings = f.game.settings as {
      register: ReturnType<typeof vi.fn>;
      registerMenu: ReturnType<typeof vi.fn>;
    };
    expect(
      settings.register.mock.calls.map((c) => [c[1], (c[2] as { scope: string }).scope]),
    ).toEqual([
      ['g2Pairings', 'client'],
      ['appUrl', 'client'],
      ['relayUrl', 'client'],
    ]);
    expect(settings.registerMenu).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'pairG2',
      expect.objectContaining({ name: 'evf.settings.pair_button', restricted: false }),
    );
    expect(f.keybindings.has('evenfoundryvtt.pairGlasses')).toBe(true);
  });

  it('MOD-02b pairing endpoints default to production and honour overrides', async () => {
    await load();
    f.fire('init');
    const { pairingEndpoints } = await import('./settings.js');
    expect(pairingEndpoints()).toEqual({ appUrl: DEFAULT_APP_URL, relayUrl: DEFAULT_RELAY_URL });
    f.settings.set('evenfoundryvtt.relayUrl', ' ws://10.0.0.2:8787 ');
    f.settings.set('evenfoundryvtt.appUrl', '');
    expect(pairingEndpoints()).toEqual({
      appUrl: DEFAULT_APP_URL,
      relayUrl: 'ws://10.0.0.2:8787',
    });
  });

  it('MOD-02c the Players list entry and the keybinding open the window; failures are logged', async () => {
    await load();
    f.fire('init');
    f.users.push(makeUser('p1', 'Luca'));
    const items: Array<{ callback: (li: HTMLElement) => void }> = [];
    f.fire('getUserContextOptions', {}, items);
    const li = document.createElement('li');
    li.dataset.userId = 'p1';
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(foundry.applications, 'instances', {
      get() {
        throw new Error('boom');
      },
    });
    items[0]?.callback(li);
    f.keybindings.get('evenfoundryvtt.pairGlasses')?.onDown?.();
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

  it('MOD-05 ready starts the projector and wires every delta source', async () => {
    await load();
    f.fire('init');
    f.fire('ready');
    await vi.waitFor(() => {
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
  });

  it('MOD-06 combat trackers follow the paired actors on turn change', async () => {
    const mod = await load();
    f.fire('init');
    const store = await import('./direct/pairing-store.js');
    await store.savePairing({
      deviceId: 'dev1',
      room: generateRoomId(),
      key: generateDeviceKey(),
      actorId: 'thorin',
      label: 'Thorin',
      createdAt: 0,
      lastSeenAt: null,
      expiresAt: null,
    });
    const push = vi.spyOn(mod.projector, 'pushDelta');
    f.fire('ready');
    await vi.waitFor(() =>
      expect(f.hooks.on.mock.calls.map((c) => c[0])).toContain('updateCombat'),
    );
    f.fire('updateCombat', {}, { turn: 1 }, {}, 'gm1');
    const topics = push.mock.calls.map((c) => [c[0], (c[1] as { actorId?: string }).actorId]);
    expect(topics).toContainEqual(['r1.action.economy', 'thorin']);
    expect(topics).toContainEqual(['r1.movement.budget', 'thorin']);
    mod.projector.stop();
  });

  it('MOD-07 a failing projector start is logged, never thrown into Foundry', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (f.game.settings as { get: ReturnType<typeof vi.fn> }).get.mockImplementation(() => {
      throw new Error('storage');
    });
    await load();
    f.fire('ready');
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith('[EVF] projector failed to start', expect.any(Error)),
    );
    error.mockRestore();
  });
});
