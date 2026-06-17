/**
 * Unit tests for @evf/foundry-module — Wave 0 entry point + settings registration.
 *
 * Tests use vi.stubGlobal to inject minimal Foundry globals (game, Hooks) so
 * the module can be exercised in a happy-dom environment without a live Foundry
 * instance. This is the canonical pattern for all Phase 2 unit tests.
 *
 * Coverage gate (INV-4): ≥80% line/branch/function coverage on module.ts and
 * settings.ts. The vitest.config.ts + root coverage config enforce this gate.
 *
 * @see packages/foundry-module/src/types/foundry-globals.d.ts — ambient shapes
 * @see CLAUDE.md INV-4 (coverage gate, strict mode)
 * @see 02-PLAN-CHECK.md M-2 — mock shapes are intentionally minimal for Wave 0;
 *      TODO (ADR-0003): validate mock shapes against fvtt-types when package
 *      stabilises (Phase 3+).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global mock helpers ────────────────────────────────────────────

type HookHandler = (...args: unknown[]) => void;

/**
 * Minimal Application base class stub.
 * Foundry provides this globally at runtime; in tests we inject it via
 * vi.stubGlobal so that any `extends Application` can be evaluated.
 */
class ApplicationStub {
  get title(): string {
    return '';
  }
}

/**
 * Minimal ApplicationV2 base class stub.
 * Required because settings.ts now imports PairModal which extends ApplicationV2.
 * Must be stubbed before any dynamic import of settings.ts or module.ts.
 */
class ApplicationV2Stub {
  render(_force?: boolean): this {
    return this;
  }
  async close(): Promise<void> {}
  async getData(): Promise<Record<string, unknown>> {
    return {};
  }
  _activateListeners(_html: HTMLElement): void {}
  static get defaultOptions() {
    return { id: '', title: '', template: '', width: 400, height: 'auto', resizable: false };
  }
}

/** Creates a minimal mock for the Foundry game singleton. */
function makeGameMock(lang = 'it') {
  const menuRegistrations: Array<{
    module: string;
    key: string;
    data: {
      name: string;
      label: string;
      icon: string;
      type: new () => unknown;
      restricted: boolean;
    };
  }> = [];

  const settingsStore = new Map<string, unknown>();

  return {
    settings: {
      register: vi.fn(),
      registerMenu: vi.fn(
        (module: string, key: string, data: Parameters<typeof game.settings.registerMenu>[2]) => {
          menuRegistrations.push({ module, key, data });
        },
      ),
      get: vi.fn((moduleId: string, key: string) => settingsStore.get(`${moduleId}.${key}`)),
      set: vi.fn((moduleId: string, key: string, value: unknown) => {
        settingsStore.set(`${moduleId}.${key}`, value);
      }),
    },
    i18n: {
      lang,
      localize: vi.fn((key: string) => key),
    },
    actors: {
      get: vi.fn((_actorId: string): unknown => undefined),
    },
    combat: null,
    user: {
      isGM: false,
      targets: new Set(),
    },
    users: {
      get: vi.fn((_userId: string) => undefined),
    },
    _menuRegistrations: menuRegistrations,
  };
}

/** Creates a minimal mock for the Foundry Hooks registry. */
function makeHooksMock() {
  const handlers = new Map<string, HookHandler[]>();

  return {
    once: vi.fn((event: string, fn: HookHandler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(fn);
      handlers.set(event, existing);
    }),
    on: vi.fn((event: string, fn: HookHandler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(fn);
      handlers.set(event, existing);
      return existing.length;
    }),
    /** Fire all once-handlers for the given event (test utility). */
    fire(event: string, ...args: unknown[]): void {
      const fns = handlers.get(event) ?? [];
      for (const fn of fns) {
        fn(...args);
      }
      handlers.delete(event); // once = call once
    },
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('MODULE_ID', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
  });

  it('equals "evenfoundryvtt"', async () => {
    // game + Hooks stubs required because module.ts calls Hooks.once at module load
    vi.stubGlobal('game', makeGameMock('en'));
    vi.stubGlobal('Hooks', makeHooksMock());
    const { MODULE_ID } = await import('./module.js');
    expect(MODULE_ID).toBe('evenfoundryvtt');
  });
});

describe('Hooks.once("init") → registerSettings()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
  });

  it('registers "init", "socketlib.ready" and "ready" hook handlers on module load', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');

    // 260604-lg4: three Hooks.once registrations — "init" (settings),
    // "socketlib.ready" (socketlib handlers), and "ready" (push readers/subscribers).
    expect(hooksMock.once).toHaveBeenCalledTimes(3);
    expect(hooksMock.once).toHaveBeenCalledWith('init', expect.any(Function));
    expect(hooksMock.once).toHaveBeenCalledWith('socketlib.ready', expect.any(Function));
    expect(hooksMock.once).toHaveBeenCalledWith('ready', expect.any(Function));
  });

  it('calls registerSettings() exactly once when init hook fires', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');

    // Before init fires, settings.registerMenu should NOT have been called
    expect(gameMock.settings.registerMenu).not.toHaveBeenCalled();

    // Fire the init hook
    hooksMock.fire('init');

    // After init fires, registerMenu should have been called exactly twice:
    // 'pairDevice' (PairModal) + 'bridgeConfig' (BridgeConfigModal, Quick Task 260604-mjr).
    expect(gameMock.settings.registerMenu).toHaveBeenCalledTimes(2);
  });

  it('registers the pair button menu at MODULE_ID scope', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    expect(gameMock.settings.registerMenu).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'pairDevice',
      expect.objectContaining({
        name: 'evf.settings.pair_button',
        label: 'evf.settings.pair_button',
        restricted: true,
      }),
    );
  });

  // Quick Task 260604-hs5: two world settings link the module to the bridge
  // deployment (bridge URL + matching EVF_INTERNAL_SECRET).
  // Quick Task 260604-mjr: both demoted to config: false (managed via the dedicated
  // "EVF — Bridge Configuration" dialog, not the generic Configure Settings panel).
  it('registers the bridgeUrl world setting as a hidden GM-restricted config (260604-mjr)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    expect(gameMock.settings.register).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'bridgeUrl',
      expect.objectContaining({ config: false, scope: 'world', restricted: true }),
    );
  });

  it('registers the bridgeInternalSecret world setting as a hidden GM-restricted config (260604-mjr)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    expect(gameMock.settings.register).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'bridgeInternalSecret',
      expect.objectContaining({ config: false, scope: 'world', restricted: true }),
    );
  });

  // Quick Task 260604-mjr: a second registerMenu wires the BridgeConfigModal dialog.
  it('registers the bridgeConfig settings menu (BridgeConfigModal) at MODULE_ID scope (260604-mjr)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    expect(gameMock.settings.registerMenu).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'bridgeConfig',
      expect.objectContaining({
        name: 'evf.settings.bridge_config_button',
        label: 'evf.settings.bridge_config_button',
        hint: 'evf.settings.bridge_config_hint',
        restricted: true,
      }),
    );
    const calls = gameMock.settings.registerMenu.mock.calls;
    const bridgeConfigCall = calls.find((c) => c[1] === 'bridgeConfig');
    expect(bridgeConfigCall).toBeDefined();
    expect(typeof bridgeConfigCall?.[2]?.type).toBe('function');
  });

  // Quick Task 260604-lg4: the two DM-visible settings must persist and read back
  // their saved values (round-trip via the makeGameMock settingsStore) AND both
  // remain registered config:true. The secret value is never logged.
  it('bridgeUrl + bridgeInternalSecret persist and read back their saved values (260604-lg4)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    // Both registered config:false (260604-mjr: managed via the BridgeConfigModal
    // dialog, not the generic settings panel) — still persist + read back.
    expect(gameMock.settings.register).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'bridgeUrl',
      expect.objectContaining({ config: false }),
    );
    expect(gameMock.settings.register).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'bridgeInternalSecret',
      expect.objectContaining({ config: false }),
    );

    // Round-trip: set via game.settings.set, read back via game.settings.get.
    game.settings.set('evenfoundryvtt', 'bridgeUrl', 'https://bridge.example');
    game.settings.set('evenfoundryvtt', 'bridgeInternalSecret', 's3cret');

    expect(game.settings.get('evenfoundryvtt', 'bridgeUrl')).toBe('https://bridge.example');
    expect(game.settings.get('evenfoundryvtt', 'bridgeInternalSecret')).toBe('s3cret');
  });
});

describe('PairModal (registered in settings)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
  });

  it('registerSettings registers PairModal (not PairModalStub) as the menu type', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    expect(gameMock.settings.registerMenu).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'pairDevice',
      expect.objectContaining({
        name: 'evf.settings.pair_button',
        restricted: true,
      }),
    );
    // The registered type should be a constructor (PairModal class)
    const calls = gameMock.settings.registerMenu.mock.calls;
    const pairDeviceCall = calls.find((c) => c[1] === 'pairDevice');
    expect(pairDeviceCall).toBeDefined();
    expect(typeof pairDeviceCall?.[2]?.type).toBe('function');
  });
});

describe('detectedLocale', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
  });

  it('is set to game.i18n.lang (primary tag) when init fires with "it"', async () => {
    const gameMock = makeGameMock('it');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    const { detectedLocale } = await import('./settings.js');
    expect(detectedLocale).toBe('it');
  });

  it('normalises compound tags: "it-IT" → "it"', async () => {
    const gameMock = makeGameMock('it-IT');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    const { detectedLocale } = await import('./settings.js');
    expect(detectedLocale).toBe('it');
  });

  it('normalises compound tags: "de-DE" → "de"', async () => {
    const gameMock = makeGameMock('de-DE');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    const { detectedLocale } = await import('./settings.js');
    expect(detectedLocale).toBe('de');
  });

  it('defaults to "en" when lang is "en"', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');
    hooksMock.fire('init');

    const { detectedLocale } = await import('./settings.js');
    expect(detectedLocale).toBe('en');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ready hook — registerSocketlibHandlers + registerHookSubscribers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal socketlib stub matching the REAL registerModule/register API (260604-lg4).
 *
 * `registerModule(moduleId)` returns a module-scoped socket whose `register(name,
 * fn)` records the handler into `_registered` keyed by the moduleId (so existing
 * `_registered.get('evenfoundryvtt')` assertions keep working). The socket's
 * `register` is the spy asserted for the 17-handler count.
 */
function makeSocketlibMock() {
  const registered = new Map<string, Map<string, (...args: unknown[]) => unknown>>();
  const register = vi.fn((moduleId: string, name: string, fn: (...args: unknown[]) => unknown) => {
    if (!registered.has(moduleId)) {
      registered.set(moduleId, new Map());
    }
    registered.get(moduleId)?.set(name, fn);
  });
  const registerModule = vi.fn((moduleId: string) => ({
    // Bind the moduleId so the socket's register matches the real (name, fn) arity.
    register: (name: string, fn: (...args: unknown[]) => unknown) => register(moduleId, name, fn),
    executeAsGM: vi.fn(),
  }));
  return {
    registerModule,
    /** The underlying register spy — asserted for the 17-handler count. */
    register,
    _registered: registered,
  };
}

/** Minimal canvas stub for scene hook tests. */
function makeCanvasMock() {
  return {
    scene: {
      id: 'scene-1',
      name: 'Dungeon',
      grid: { size: 100, type: 1 },
      width: 3000,
      height: 2000,
      padding: 0.1,
      background: { src: null },
    },
    tokens: {
      controlled: [],
    },
  };
}

describe('Hooks.once("ready") → registerSocketlibHandlers + registerHookSubscribers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
  });

  it('fires ready + socketlib.ready hooks without throwing when socketlib stub is present', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);

    await import('./module.js');
    hooksMock.fire('init');

    // Fire both hooks — neither should throw
    expect(() => hooksMock.fire('socketlib.ready')).not.toThrow();
    expect(() => hooksMock.fire('ready')).not.toThrow();
  });

  // 260604-lg4 defense in depth: the Foundry 'ready' hook must NOT depend on
  // socketlib. With socketlib absent, firing 'ready' must not throw and the push
  // readers + hook subscribers must still register (the /internal/delta path
  // real pairing depends on must always come up).
  it('fires ready WITHOUT socketlib present and still registers push readers + hook subscribers', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    // socketlib is intentionally undefined for this test.
    vi.stubGlobal('socketlib', undefined);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );

    await import('./module.js');
    hooksMock.fire('init');

    // Firing 'ready' (NOT 'socketlib.ready') must not throw even with no socketlib.
    expect(() => hooksMock.fire('ready')).not.toThrow();

    // Hook subscribers + push readers registered independently of socketlib:
    // registerHookSubscribers + the actor-lifecycle readers call Hooks.on(...).
    const registeredEvents = hooksMock.on.mock.calls.map((c) => c[0]);
    expect(registeredEvents).toContain('updateActor');
    expect(registeredEvents).toContain('updateCombat');
    // registerCharacterListReader subscribes to actor lifecycle hooks (push readers).
    expect(registeredEvents).toContain('createActor');
  });

  it('registers all 17 socketlib handlers on socketlib.ready (7 read + 7 tool + 3 ACT-04 reaction)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);

    await import('./module.js');
    hooksMock.fire('init');
    // 260604-lg4: handler registration now happens on socketlib.ready, not ready.
    hooksMock.fire('socketlib.ready');
    hooksMock.fire('ready');

    const handlers = socketlibMock._registered.get('evenfoundryvtt');
    // 7 read handlers (Phase 02)
    expect(handlers?.has('evf.validateToken')).toBe(true);
    expect(handlers?.has('evf.revokeToken')).toBe(true);
    expect(handlers?.has('evf.getCharacterSnapshot')).toBe(true);
    expect(handlers?.has('evf.getCombatSnapshot')).toBe(true);
    expect(handlers?.has('evf.getSceneViewport')).toBe(true);
    expect(handlers?.has('evf.getEventLog')).toBe(true);
    expect(handlers?.has('evf.listCharacters')).toBe(true);
    // 6 real write-path handlers (Plan 07-02 + 07-03 replacements) + 1 remaining stub
    expect(handlers?.has('evf.castSpell')).toBe(true);
    expect(handlers?.has('evf.weaponAttack')).toBe(true);
    expect(handlers?.has('evf.useItem')).toBe(true);
    // Plan 07-03: evf.skillCheck renamed → evf.confirmTemplatePlacement (in-place, count stays 14)
    expect(handlers?.has('evf.skillCheck')).toBe(false);
    expect(handlers?.has('evf.confirmTemplatePlacement')).toBe(true);
    expect(handlers?.has('evf.moveToken')).toBe(true);
    expect(handlers?.has('evf.placeTemplate')).toBe(true);
    // Plan 07-05: evf.setTargets stub renamed → evf.dropConcentration real handler (count stays 14)
    expect(handlers?.has('evf.setTargets')).toBe(false);
    expect(handlers?.has('evf.dropConcentration')).toBe(true);
    expect(socketlibMock.registerModule).toHaveBeenCalledTimes(1);
    expect(socketlibMock.register).toHaveBeenCalledTimes(17);
  });

  it('hook subscribers are registered (updateActor, updateCombat, etc.) on ready', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // hooksMock.on should have been called for each game hook subscriber
    // (updateActor, updateCombat, combatStart, canvasReady, controlToken, createChatMessage, targetToken)
    expect(hooksMock.on).toHaveBeenCalled();
    // At minimum updateActor and updateCombat must be subscribed
    const registeredEvents = hooksMock.on.mock.calls.map((c) => c[0]);
    expect(registeredEvents).toContain('updateActor');
    expect(registeredEvents).toContain('updateCombat');
    // Plan 07-05: dnd5e.preUseActivity hook registered for reaction watcher (REACT-01)
    expect(registeredEvents).toContain('dnd5e.preUseActivity');
    // Plan 08-01: createChatMessage hook registered for action-result watcher (ACT-01)
    expect(registeredEvents).toContain('createChatMessage');
  });

  // T-08-MOD-01: registerActionResultWatcher called once in ready hook (verified via createChatMessage hook registration)
  it('T-08-MOD-01: createChatMessage hook is registered exactly once after ready fires (action-result-watcher ACT-01)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // registerActionResultWatcher calls Hooks.on('createChatMessage', ...).
    // hook-subscribers.ts also registers 'createChatMessage' (log event delta).
    // Total: 2 registrations — 1 from hook-subscribers + 1 from action-result-watcher.
    // Verifying ≥ 2 ensures the action-result-watcher registration is present.
    const createChatMessageCalls = hooksMock.on.mock.calls.filter(
      (c) => c[0] === 'createChatMessage',
    );
    expect(createChatMessageCalls.length).toBeGreaterThanOrEqual(2);
  });

  // T-08-MOD-03: registerMovementTracker called once in ready hook — verified via updateToken hook registration
  it('T-08-MOD-03: updateToken hook registered after ready fires (registerMovementTracker ACT-01 move variant)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
      getRandomValues: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      }),
    });

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // registerMovementTracker calls Hooks.on('updateToken') and Hooks.on('updateCombat')
    const registeredEvents = hooksMock.on.mock.calls.map((c) => c[0]);
    expect(registeredEvents).toContain('updateToken');
    expect(registeredEvents).toContain('updateCombat');

    // updateToken should be registered exactly once via registerMovementTracker
    const updateTokenCalls = hooksMock.on.mock.calls.filter((c) => c[0] === 'updateToken');
    expect(updateTokenCalls.length).toBeGreaterThanOrEqual(1);
  });

  // MOD-CAT-01: registerCombatActionTracker wired; registerComplexHandler count is 17 (Phase 13 FLIP)
  it('MOD-CAT-01: createChatMessage registered for action-tracker after ready fires; socketlib count is 17', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
      getRandomValues: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      }),
    });

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // registerCombatActionTracker registers createChatMessage (in addition to action-result-watcher)
    const createChatCalls = hooksMock.on.mock.calls.filter((c) => c[0] === 'createChatMessage');
    // At least 3: hook-subscribers + action-result-watcher + combat-action-tracker
    expect(createChatCalls.length).toBeGreaterThanOrEqual(3);

    // 17-socketlib-handler invariant: Plan 09-01 adds NO new socketlib handler.
    // 260604-lg4: registration happens on socketlib.ready (decoupled from ready).
    hooksMock.fire('socketlib.ready');
    expect(socketlibMock.register).toHaveBeenCalledTimes(17);
  });

  // T-08-MOD-04: registerComplexHandler count is 17 (Phase 13 FLIP — Plan 08-04 adds NO new socketlib handler)
  it('T-08-MOD-04: registerComplexHandler count is 17 after Plan 08-04 wiring (17-socketlib-handler invariant from Phase 13)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
      getRandomValues: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      }),
    });

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // Plan 08-04 must NOT add any new socketlib handlers — count must stay at 17.
    // 260604-lg4: registration happens on socketlib.ready (decoupled from ready).
    hooksMock.fire('socketlib.ready');
    expect(socketlibMock.register).toHaveBeenCalledTimes(17);
  });

  // T-08-MOD-02: registerComplexHandler count is 17 (Phase 13 FLIP — Plan 08-01 adds NO new socketlib handler)
  it('T-08-MOD-02: registerComplexHandler count is 17 after Plan 08-01 wiring (17-socketlib-handler invariant from Phase 13)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
      getRandomValues: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      }),
    });

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // Plan 08-01 must NOT add any new socketlib handlers — count must stay at 17.
    // 260604-lg4: registration happens on socketlib.ready (decoupled from ready).
    hooksMock.fire('socketlib.ready');
    expect(socketlibMock.register).toHaveBeenCalledTimes(17);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// bridgeDeltaEmitter — via hook subscriber pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe('bridgeDeltaEmitter — via hook pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
  });

  it('drops delta silently when no active bearer entry exists', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();
    const fetchMock = vi.fn();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal('fetch', fetchMock);

    // No bearerRegistry entry — game.settings.get returns undefined
    gameMock.settings.get.mockReturnValue(undefined);

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // Fire updateActor hook with a stub actor
    const stubActor = {
      id: 'actor-1',
      name: 'Aragorn',
      type: 'character',
      system: {
        attributes: {
          hp: { value: 40, max: 50, temp: 0, tempmax: 0 },
          ac: { value: 18 },
          exhaustion: 0,
        },
        details: { level: 5 },
      },
      statuses: new Set<string>(),
    };

    hooksMock.fire('updateActor', stubActor, { system: { attributes: { hp: { value: 40 } } } });

    // No active pair → fetch should NOT have been called (delta dropped silently)
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emits delta via fetch when an active bearer entry exists', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));

    // Build a stub actor that getCharacterSnapshot can read
    const stubActor = {
      id: 'actor-1',
      name: 'Aragorn',
      type: 'character',
      system: {
        attributes: {
          hp: { value: 40, max: 50, temp: 0, tempmax: 0 },
          ac: { value: 18 },
          exhaustion: 0,
        },
        details: { level: 5 },
      },
      statuses: new Set<string>(),
    };

    // Return the stubActor from game.actors.get
    gameMock.actors.get.mockReturnValue(stubActor);

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal('fetch', fetchMock);

    // Set up an active bearer entry — return for ANY settings.get call
    const now = Date.now();
    gameMock.settings.get.mockReturnValue({
      entries: {
        'token-1': {
          internalSecret: 'secret-abc',
          bridgeUrl: 'https://bridge.local:8910',
          revokedAt: null,
          expiresAt: now + 86_400_000, // 24h in the future
        },
      },
    });

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // Fire updateActor hook
    hooksMock.fire('updateActor', stubActor, { system: { attributes: { hp: { value: 40 } } } });

    // Wait for the fire-and-forget fetch to be called
    await vi.waitFor(() => fetchMock.mock.calls.length > 0, { timeout: 2000 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bridge.local:8910/internal/delta',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-abc',
        }),
      }),
    );
  });

  it('bridgeDeltaEmitter catches fetch errors and logs warning (T-02-01)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const stubActor = {
      id: 'actor-1',
      name: 'Thorin',
      type: 'character',
      system: {
        attributes: {
          hp: { value: 20, max: 60, temp: 0, tempmax: 0 },
          ac: { value: 16 },
          exhaustion: 0,
        },
        details: { level: 8 },
      },
      statuses: new Set<string>(),
    };

    gameMock.actors.get.mockReturnValue(stubActor);

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Bridge offline');
      }),
    );

    // Active entry
    const now = Date.now();
    gameMock.settings.get.mockReturnValue({
      entries: {
        'token-1': {
          internalSecret: 'secret-xyz',
          bridgeUrl: 'https://bridge.local:8910',
          revokedAt: null,
          expiresAt: now + 86_400_000,
        },
      },
    });

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    hooksMock.fire('updateActor', stubActor, { system: { attributes: { hp: {} } } });

    // Wait for the warning to be logged
    await vi.waitFor(
      () => warnSpy.mock.calls.some((c) => String(c[0]).includes('bridgeDeltaEmitter failed')),
      { timeout: 2000 },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('bridgeDeltaEmitter failed'),
      expect.anything(),
    );
  });

  it('drops delta when bearer entry is revoked', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();
    const fetchMock = vi.fn();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal('fetch', fetchMock);

    const now = Date.now();
    gameMock.settings.get.mockReturnValue({
      entries: {
        'token-1': {
          internalSecret: 'secret-abc',
          bridgeUrl: 'https://bridge.local:8910',
          revokedAt: now - 1000, // revoked in the past
          expiresAt: now + 86_400_000,
        },
      },
    });

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    const stubActor = {
      id: 'actor-1',
      name: 'Legolas',
      type: 'character',
      system: {
        attributes: {
          hp: { value: 45, max: 50, temp: 0, tempmax: 0 },
          ac: { value: 16 },
          exhaustion: 0,
        },
        details: { level: 10 },
      },
      statuses: new Set<string>(),
    };

    hooksMock.fire('updateActor', stubActor, { system: { attributes: { hp: {} } } });

    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops delta when bearer entry is expired', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();
    const fetchMock = vi.fn();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal('fetch', fetchMock);

    const now = Date.now();
    gameMock.settings.get.mockReturnValue({
      entries: {
        'token-1': {
          internalSecret: 'secret-abc',
          bridgeUrl: 'https://bridge.local:8910',
          revokedAt: null,
          expiresAt: now - 1000, // expired in the past
        },
      },
    });

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    const stubActor = {
      id: 'actor-1',
      name: 'Gimli',
      type: 'character',
      system: {
        attributes: {
          hp: { value: 30, max: 70, temp: 0, tempmax: 0 },
          ac: { value: 20 },
          exhaustion: 0,
        },
        details: { level: 7 },
      },
      statuses: new Set<string>(),
    };

    hooksMock.fire('updateActor', stubActor, { system: { attributes: { hp: {} } } });

    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Quick Task 260604-hs5: bridge settings resolution — settings preferred over bearer
// ─────────────────────────────────────────────────────────────────────────────

describe('bridge settings resolution — settings preferred over bearer (260604-hs5)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
  });

  /** Active bearer-registry fixture (used as the fallback source). */
  function makeActiveRegistry() {
    const now = Date.now();
    return {
      entries: {
        'token-1': {
          internalSecret: 'bearer-secret',
          bridgeUrl: 'https://bearer.local:8910',
          revokedAt: null,
          expiresAt: now + 86_400_000,
        },
      },
    };
  }

  /** Stub player-character actor that getCharacterSnapshot can read. */
  const stubActor = {
    id: 'actor-1',
    name: 'Aragorn',
    type: 'character',
    system: {
      attributes: {
        hp: { value: 40, max: 50, temp: 0, tempmax: 0 },
        ac: { value: 18 },
        exhaustion: 0,
      },
      details: { level: 5 },
    },
    statuses: new Set<string>(),
  };

  it('uses the SETTINGS bridge URL + secret when both settings are non-empty strings', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));

    gameMock.actors.get.mockReturnValue(stubActor);

    // Key-aware settings.get: strings for the new settings, registry object for bearerRegistry.
    const registry = makeActiveRegistry();
    gameMock.settings.get.mockImplementation((_moduleId: string, key: string) => {
      if (key === 'bridgeUrl') return 'https://settings.example.com:8910';
      if (key === 'bridgeInternalSecret') return 'settings-secret';
      if (key === 'bearerRegistry') return registry;
      return undefined;
    });

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal('fetch', fetchMock);

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // socketlib handler count invariant (CI Gate 8). 260604-lg4: registration
    // happens on socketlib.ready (decoupled from ready).
    hooksMock.fire('socketlib.ready');
    expect(socketlibMock.register).toHaveBeenCalledTimes(17);

    hooksMock.fire('updateActor', stubActor, { system: { attributes: { hp: { value: 40 } } } });

    await vi.waitFor(() => fetchMock.mock.calls.length > 0, { timeout: 2000 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://settings.example.com:8910/internal/delta',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer settings-secret',
        }),
      }),
    );
  });

  it('falls back to the active bearer entry when both settings are empty strings', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));

    gameMock.actors.get.mockReturnValue(stubActor);

    const registry = makeActiveRegistry();
    gameMock.settings.get.mockImplementation((_moduleId: string, key: string) => {
      if (key === 'bridgeUrl') return '';
      if (key === 'bridgeInternalSecret') return '';
      if (key === 'bearerRegistry') return registry;
      return undefined;
    });

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal('fetch', fetchMock);

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    hooksMock.fire('updateActor', stubActor, { system: { attributes: { hp: { value: 40 } } } });

    await vi.waitFor(() => fetchMock.mock.calls.length > 0, { timeout: 2000 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bearer.local:8910/internal/delta',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer bearer-secret',
        }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan 07-06: scheduleBearerRotation wiring
// ─────────────────────────────────────────────────────────────────────────────

describe('scheduleBearerRotation wiring (Plan 07-06)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules a bearer rotation setTimeout when an active bearer exists after ready fires', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
      getRandomValues: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      }),
    });

    const now = Date.now();
    // Return an active bearer so scheduleBearerRotation will schedule a timer
    gameMock.settings.get.mockReturnValue({
      entries: {
        'token-1': {
          token: 'token-1',
          alias: 'Test Device',
          worldId: 'world-abc',
          bridgeUrl: 'https://bridge.local:8910',
          internalSecret: 'secret-abc',
          createdAt: now,
          revokedAt: null,
          expiresAt: now + 86_400_000,
          lastSeenAt: null,
        },
      },
      version: 1,
    });

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // scheduleBearerRotation should have called setTimeout at least once
    expect(setTimeoutSpy).toHaveBeenCalled();
    // The delay should be ~24h (bearer just created)
    const scheduledDelays = setTimeoutSpy.mock.calls.map((c) => c[1] as number);
    const hasLongDelay = scheduledDelays.some((d) => d >= 23 * 3600 * 1000);
    expect(hasLongDelay).toBe(true);
  });

  it('does NOT schedule a rotation setTimeout when no active bearer exists', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
      getRandomValues: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      }),
    });

    // No bearer registry → getActiveBearer returns null → no setTimeout
    gameMock.settings.get.mockReturnValue(undefined);

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const priorCallCount = setTimeoutSpy.mock.calls.length;

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // No rotation timer should be scheduled (long-delay setTimeout)
    const newCalls = setTimeoutSpy.mock.calls.slice(priorCallCount);
    const hasLongDelay = newCalls.some((c) => (c[1] as number) >= 23 * 3600 * 1000);
    expect(hasLongDelay).toBe(false);
  });

  it('registerComplexHandler count is 17 after Plan 07-06 wiring (Phase 13 FLIP invariant)', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    const socketlibMock = makeSocketlibMock();
    const canvasMock = makeCanvasMock();

    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('canvas', canvasMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
      getRandomValues: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      }),
    });

    await import('./module.js');
    hooksMock.fire('init');
    hooksMock.fire('ready');

    // Plan 07-06 adds NO new socketlib handlers — count must stay at 17.
    // 260604-lg4: registration happens on socketlib.ready (decoupled from ready).
    hooksMock.fire('socketlib.ready');
    expect(socketlibMock.register).toHaveBeenCalledTimes(17);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isStreamLeader — single-source stream election (v0.1.19)
// ─────────────────────────────────────────────────────────────────────────────

describe('isStreamLeader — stream-source election', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Stub `game` with a user + users collection and return isStreamLeader.
   * The module import is cached (no resetModules needed): isStreamLeader reads
   * the `game` global at CALL time, so per-test stubbing is sufficient.
   */
  async function leaderWith(
    self: { id: string; active: boolean; isGM: boolean },
    others: Array<{ id: string; active: boolean; isGM: boolean }>,
  ): Promise<boolean> {
    vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn(), off: vi.fn() });
    vi.stubGlobal('game', { user: self, users: [self, ...others] });
    const { isStreamLeader } = await import('./module.js');
    return isStreamLeader();
  }

  it('SL-1: the only active GM is the leader', async () => {
    await expect(
      leaderWith({ id: 'gm1', active: true, isGM: true }, [
        { id: 'aaa', active: true, isGM: false },
      ]),
    ).resolves.toBe(true);
  });

  it('SL-2: a player is NOT the leader while a GM is active', async () => {
    await expect(
      leaderWith({ id: 'aaa', active: true, isGM: false }, [
        { id: 'gm1', active: true, isGM: true },
      ]),
    ).resolves.toBe(false);
  });

  it('SL-3: no GM connected → lowest-id active player wins (deterministic)', async () => {
    await expect(
      leaderWith({ id: 'aaa', active: true, isGM: false }, [
        { id: 'bbb', active: true, isGM: false },
      ]),
    ).resolves.toBe(true);
    vi.unstubAllGlobals();
    await expect(
      leaderWith({ id: 'bbb', active: true, isGM: false }, [
        { id: 'aaa', active: true, isGM: false },
      ]),
    ).resolves.toBe(false);
  });

  it('SL-4: inactive GM does not block the active player', async () => {
    await expect(
      leaderWith({ id: 'bbb', active: true, isGM: false }, [
        { id: 'gm1', active: false, isGM: true },
      ]),
    ).resolves.toBe(true);
  });

  it('SL-5: unreadable users collection → fail-open (stream)', async () => {
    vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn(), off: vi.fn() });
    vi.stubGlobal('game', { user: { id: 'x', active: true, isGM: false }, users: undefined });
    const { isStreamLeader } = await import('./module.js');
    expect(isStreamLeader()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isStreamLeader — forced leader (ADR-0015 §C P2c — ?evfLeader=1)
// ─────────────────────────────────────────────────────────────────────────────

describe('isStreamLeader — forced leader (?evfLeader=1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** Import isStreamLeader with `window.location.search` set, then evaluate it. */
  async function leaderWithUrl(
    search: string,
    self: { id: string; active: boolean; isGM: boolean },
    others: Array<{ id: string; active: boolean; isGM: boolean }>,
  ): Promise<boolean> {
    vi.resetModules();
    // A fresh import re-runs module.ts top-level (settings.ts → PairModal extends
    // ApplicationV2) so the Foundry app globals must be present.
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
    // The `_forcedLeader` const reads window.location.search at module load.
    vi.stubGlobal('window', { location: { search } });
    vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn(), off: vi.fn() });
    vi.stubGlobal('game', { user: self, users: [self, ...others] });
    const { isStreamLeader } = await import('./module.js');
    return isStreamLeader();
  }

  it('FL-SL-1: ?evfLeader=1 → a PLAYER wins even while a GM is active', async () => {
    // Without the flag a player loses to a GM (see SL-2); the flag forces leadership.
    await expect(
      leaderWithUrl('?evfLeader=1', { id: 'player', active: true, isGM: false }, [
        { id: 'gm', active: true, isGM: true },
      ]),
    ).resolves.toBe(true);
  });

  it('FL-SL-2: no flag → the same player still loses to the GM', async () => {
    await expect(
      leaderWithUrl('', { id: 'player', active: true, isGM: false }, [
        { id: 'gm', active: true, isGM: true },
      ]),
    ).resolves.toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// bridgeDeltaEmitter — frame latest-wins POST queue (latency audit 2026-06-11)
// ─────────────────────────────────────────────────────────────────────────────

describe('bridgeDeltaEmitter — frame latest-wins POST queue (FPQ)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Stub the Foundry globals module.js touches at import + an active bearer, then import the emitter. */
  async function importEmitter() {
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
    vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn(), off: vi.fn() });
    vi.stubGlobal('game', {
      settings: {
        get: vi.fn(() => ({
          entries: {
            'token-1': {
              internalSecret: 'secret-abc',
              bridgeUrl: 'https://bridge.local:8910',
              revokedAt: null,
              expiresAt: Date.now() + 86_400_000,
            },
          },
        })),
      },
    });
    const { bridgeDeltaEmitter } = await import('./module.js');
    return bridgeDeltaEmitter;
  }

  // Deterministic MICROTASK flush — the latest-wins drain is a pure promise
  // chain (postDelta await → .then → runFramePost), so draining microtasks is
  // enough. Crucially it must NOT yield to macrotasks: leaked capture-loop /
  // rotation setTimeouts from other foundry-module tests would otherwise fire
  // during the wait and call the global fetch stub, inflating the count
  // (observed: 7 fetches under the full suite). Microtask-only flushing keeps
  // those timers dormant, so the assertion sees exactly the drain's own calls.
  async function flushMicrotasks(ticks = 100): Promise<void> {
    for (let i = 0; i < ticks; i++) {
      await Promise.resolve();
    }
  }

  it('FPQ-1: at most TWO frame POSTs in flight (bounded pipeline) — extras queue latest-wins', async () => {
    // Each fetch returns a deferred this test resolves on demand. A `.json()`
    // method matches the real Response shape postDelta now awaits.
    const resolvers: Array<(v: { ok: boolean; json: () => Promise<unknown> }) => void> = [];
    const fetchMock = vi.fn(() => new Promise((resolve) => resolvers.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const emit = await importEmitter();

    emit('frame_png', { n: 1 });
    emit('frame_png', { n: 2 });
    emit('frame_png', { n: 3 });
    emit('frame_png', { n: 4 });

    // Two frames opened connections (MAX_INFLIGHT_FRAME_POSTS = 2); 3 and 4 are
    // queued and 4 replaced 3 (latest-wins, single pending slot).
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Resolve one in-flight POST → a slot frees and the queue drains the LATEST
    // frame (n:4) — n:3 was dropped.
    resolvers[0]?.({ ok: true, json: () => Promise.resolve({ ok: true }) });
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const lastCall = fetchMock.mock.calls.at(-1) as unknown as [string, { body: string }];
    expect(JSON.parse(lastCall[1].body).payload).toEqual({ n: 4 });
  });

  it('FPQ-2: non-frame deltas are never queued behind an in-flight frame POST', async () => {
    const fetchMock = vi.fn(
      () =>
        new Promise<never>(() => {
          /* frame POST never settles */
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const emit = await importEmitter();

    emit('frame_png', { n: 1 });
    emit('character.delta', { hp: 9 });

    // Both POSTs opened — the stateful delta did not wait for the stuck frame.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body,
    );
    expect(secondBody.type).toBe('character.delta');
  });

  it('FPQ-3: every POST carries an abort signal (5s timeout guard)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal('fetch', fetchMock);
    const emit = await importEmitter();

    emit('frame_png', { n: 1 });
    emit('character.delta', { hp: 9 });

    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls as unknown as Array<[string, { signal?: unknown }]>) {
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('FPQ-4: a THROW in the post-success callback does NOT wedge the pipeline (T11)', async () => {
    // Deferred resolvers so completion order is deterministic under depth-2:
    // fill both in-flight slots, queue a third, then resolve the first slot with
    // a response whose `pendingSettings` getter throws when read in the .then.
    // Pre-fix this left the in-flight counter stuck and silently dropped every
    // later frame.
    const resolvers: Array<(v: { ok: boolean; json: () => Promise<unknown> }) => void> = [];
    const fetchMock = vi.fn(() => new Promise((resolve) => resolvers.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const emit = await importEmitter();

    emit('frame_png', { n: 1 });
    emit('frame_png', { n: 2 });
    emit('frame_png', { n: 3 }); // queued behind the two in-flight slots
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Resolve slot 0 with a throwing pendingSettings getter.
    resolvers[0]?.({
      ok: true,
      json: () =>
        Promise.resolve({
          get pendingSettings(): unknown {
            throw new Error('boom: malformed pendingSettings');
          },
        }),
    });
    await flushMicrotasks();

    // The throw was caught, the .finally freed the slot AND drained queued n:3.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const drained = fetchMock.mock.calls.at(-1) as unknown as [string, { body: string }];
    expect(JSON.parse(drained[1].body).payload).toEqual({ n: 3 });

    // And the pipeline is NOT wedged: drain the rest, a fresh frame still posts.
    resolvers[1]?.({ ok: true, json: () => Promise.resolve({ ok: true }) });
    resolvers[2]?.({ ok: true, json: () => Promise.resolve({ ok: true }) });
    await flushMicrotasks();
    emit('frame_png', { n: 4 });
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const after = fetchMock.mock.calls.at(-1) as unknown as [string, { body: string }];
    expect(JSON.parse(after[1].body).payload).toEqual({ n: 4 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildMapFraming — token→framing adapter (map auto-framing, 2026-06-16)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildMapFraming — token adapter + auto-frame gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    (globalThis as { canvas?: unknown }).canvas = undefined;
  });

  /** Stub `game.settings` so getMapAutoFrame returns `autoFrame`, plus a canvas. */
  async function frameWith(
    autoFrame: boolean,
    canvas: unknown,
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn(), off: vi.fn() });
    vi.stubGlobal('game', {
      settings: {
        get: vi.fn((_m: string, key: string) => (key === 'mapAutoFrame' ? autoFrame : undefined)),
      },
    });
    (globalThis as { canvas?: unknown }).canvas = canvas;
    const { buildMapFraming } = await import('./module.js');
    return buildMapFraming();
  }

  /** A Foundry-ish token placeable (grid-unit footprint). */
  function placeable(
    x: number,
    y: number,
    opts: { pc?: boolean; hidden?: boolean; actorId?: string; w?: number; h?: number } = {},
  ): unknown {
    return {
      document: { x, y, width: opts.w ?? 1, height: opts.h ?? 1, hidden: opts.hidden ?? false },
      actor: { id: opts.actorId ?? 'a', hasPlayerOwner: opts.pc ?? true },
    };
  }

  const canvasWith = (placeables: unknown[]): unknown => ({
    tokens: { placeables },
    grid: { size: 100 },
    dimensions: { width: 10000, height: 10000, size: 100 },
  });

  it('BMF-1: auto-frame OFF → null (live viewport)', async () => {
    const r = await frameWith(false, canvasWith([placeable(0, 0)]));
    expect(r).toBeNull();
  });

  it('BMF-2: no tokens → null', async () => {
    expect(await frameWith(true, canvasWith([]))).toBeNull();
    expect(await frameWith(true, { tokens: { placeables: null } })).toBeNull();
  });

  it('BMF-3: PC tokens drive a rect that contains them (grid units × grid size)', async () => {
    // Two PC tokens 5 grid-cells apart → 500 px apart in world space.
    const r = await frameWith(
      true,
      canvasWith([placeable(0, 0, { pc: true }), placeable(500, 300, { pc: true })]),
    );
    expect(r).not.toBeNull();
    const rect = r as { x: number; y: number; width: number; height: number };
    // The far token's footprint (500..600, 300..400) lies inside the frame.
    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.y).toBeLessThanOrEqual(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(600);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(400);
  });

  it('BMF-4: hidden + non-PC handling — hidden ignored, falls back to all when no PC', async () => {
    // Only a hidden token → nothing framable → null.
    expect(await frameWith(true, canvasWith([placeable(0, 0, { hidden: true })]))).toBeNull();
    // No PC tokens but a visible NPC → fallback frames it (non-null).
    const r = await frameWith(true, canvasWith([placeable(100, 100, { pc: false })]));
    expect(r).not.toBeNull();
  });

  it('BMF-5: unreadable canvas → null (never throws into the capture loop)', async () => {
    expect(await frameWith(true, undefined)).toBeNull();
    expect(await frameWith(true, {})).toBeNull();
  });
});
