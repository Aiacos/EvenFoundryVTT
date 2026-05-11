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
    vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
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
    vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
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
    vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
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
    vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
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
