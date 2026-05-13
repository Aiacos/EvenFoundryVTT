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
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      applications: { api: { ApplicationV2: ApplicationV2Stub } },
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
      applications: { api: { ApplicationV2: ApplicationV2Stub } },
    });
  });

  it('registers "init" and "ready" hook handlers on module load', async () => {
    const gameMock = makeGameMock('en');
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    await import('./module.js');

    // Wave 1: two Hooks.once registrations — "init" (settings) and "ready" (socketlib)
    expect(hooksMock.once).toHaveBeenCalledTimes(2);
    expect(hooksMock.once).toHaveBeenCalledWith('init', expect.any(Function));
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

    // After init fires, registerMenu should have been called exactly once
    expect(gameMock.settings.registerMenu).toHaveBeenCalledTimes(1);
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
});

describe('PairModal (registered in settings)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: { api: { ApplicationV2: ApplicationV2Stub } },
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
      applications: { api: { ApplicationV2: ApplicationV2Stub } },
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

/** Minimal socketlib stub that records handler registrations. */
function makeSocketlibMock() {
  const registered = new Map<string, Map<string, (...args: unknown[]) => unknown>>();
  return {
    registerComplexHandler: vi.fn(
      (moduleId: string, handlerName: string, fn: (...args: unknown[]) => unknown) => {
        if (!registered.has(moduleId)) {
          registered.set(moduleId, new Map());
        }
        registered.get(moduleId)?.set(handlerName, fn);
      },
    ),
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
      applications: { api: { ApplicationV2: ApplicationV2Stub } },
    });
  });

  it('fires ready hook without throwing when socketlib stub is present', async () => {
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

    // Fire ready — should not throw
    expect(() => hooksMock.fire('ready')).not.toThrow();
  });

  it('registers all 14 socketlib handlers on ready (7 read + 7 tool stubs)', async () => {
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

    const handlers = socketlibMock._registered.get('evenfoundryvtt');
    // 7 read handlers (Phase 02)
    expect(handlers?.has('evf.validateToken')).toBe(true);
    expect(handlers?.has('evf.revokeToken')).toBe(true);
    expect(handlers?.has('evf.getCharacterSnapshot')).toBe(true);
    expect(handlers?.has('evf.getCombatSnapshot')).toBe(true);
    expect(handlers?.has('evf.getSceneViewport')).toBe(true);
    expect(handlers?.has('evf.getEventLog')).toBe(true);
    expect(handlers?.has('evf.listCharacters')).toBe(true);
    // 7 tool stubs (Phase 03-04 — phase-07-pending placeholders)
    expect(handlers?.has('evf.castSpell')).toBe(true);
    expect(handlers?.has('evf.weaponAttack')).toBe(true);
    expect(handlers?.has('evf.useItem')).toBe(true);
    expect(handlers?.has('evf.skillCheck')).toBe(true);
    expect(handlers?.has('evf.moveToken')).toBe(true);
    expect(handlers?.has('evf.placeTemplate')).toBe(true);
    expect(handlers?.has('evf.setTargets')).toBe(true);
    expect(socketlibMock.registerComplexHandler).toHaveBeenCalledTimes(14);
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
      applications: { api: { ApplicationV2: ApplicationV2Stub } },
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
