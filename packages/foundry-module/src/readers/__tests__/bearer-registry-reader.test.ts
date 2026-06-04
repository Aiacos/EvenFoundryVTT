/**
 * Unit tests for bearer-registry-reader.ts.
 *
 * Quick Task 260604-eyf — push-based bearer-registry path for real pairing.
 *
 * Uses vi.stubGlobal to mock Foundry globals (`game`, `Hooks`, `foundry`).
 * No real Foundry runtime.
 *
 * Note: bearer-registry-reader.ts → pair/bearer-registry.ts → module.ts
 * creates a transitive dependency on Foundry globals. We stub them here
 * following the same pattern as bearer-registry.test.ts.
 *
 * Test coverage:
 * - readBearerRegistry: maps non-revoked, non-expired entries to snapshot shape
 * - readBearerRegistry: drops expired entries (expiresAt <= Date.now())
 * - readBearerRegistry: drops revoked entries (via listBearers filter)
 * - readBearerRegistry: returns empty snapshot on throw (defensive)
 * - registerBearerRegistryReader: emits immediately on call
 *
 * @see packages/foundry-module/src/readers/bearer-registry-reader.ts
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 2
 */

import { R1_BEARERS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global stubs (required for transitive module.ts import) ──────────

class ApplicationStub {
  get title(): string {
    return '';
  }
}

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
    return { id: '', title: '', template: '', width: 400 };
  }
}

function stubFoundryGlobals(settingsStore: Map<string, unknown>) {
  vi.stubGlobal('Application', ApplicationStub);
  vi.stubGlobal('foundry', {
    applications: {
      api: {
        ApplicationV2: ApplicationV2Stub,
        HandlebarsApplicationMixin: (Base: unknown) => Base,
      },
    },
  });
  vi.stubGlobal('Hooks', {
    once: vi.fn(),
    on: vi.fn().mockReturnValue(100),
    off: vi.fn(),
  });
  vi.stubGlobal('game', {
    settings: {
      get: vi.fn((moduleId: string, key: string) => settingsStore.get(`${moduleId}.${key}`)),
      set: vi.fn((moduleId: string, key: string, value: unknown) => {
        settingsStore.set(`${moduleId}.${key}`, value);
      }),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    i18n: { localize: (k: string) => k },
  });
  vi.stubGlobal('crypto', {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 7) % 256;
      return arr;
    },
  });
}

// ─── Mock factories ────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeEntry(
  token: string,
  alias: string,
  worldId: string,
  expiresAt: number,
  revokedAt: number | null = null,
) {
  return {
    token,
    alias,
    worldId,
    bridgeUrl: 'https://bridge.local:8910',
    internalSecret: 'internal-secret-abc',
    createdAt: NOW - 100,
    expiresAt,
    lastSeenAt: null,
    revokedAt,
  };
}

function makeRegistry(entries: Record<string, ReturnType<typeof makeEntry>>) {
  return { entries, version: 1 as const };
}

// ─── Hooks mock infrastructure ────────────────────────────────────────────────

const hookHandlers: Map<string, Array<(...args: unknown[]) => unknown>> = new Map();
let hookIdCounter = 100;

function makeFullHooksMock() {
  return {
    once: vi.fn(),
    on: vi.fn().mockImplementation((event: string, fn: (...args: unknown[]) => unknown) => {
      if (!hookHandlers.has(event)) hookHandlers.set(event, []);
      const handlers = hookHandlers.get(event);
      if (handlers !== undefined) handlers.push(fn);
      return hookIdCounter++;
    }),
    off: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('readBearerRegistry', () => {
  let settingsStore: Map<string, unknown>;

  beforeEach(() => {
    settingsStore = new Map();
    stubFoundryGlobals(settingsStore);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('maps non-revoked, non-expired entries to snapshot shape', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const futureExpiry = NOW + 86_400_000;
    settingsStore.set(
      'evenfoundryvtt.bearerRegistry',
      makeRegistry({
        'token-1': makeEntry('token-1', 'G2 Alice', 'world-xyz', futureExpiry),
        'token-2': makeEntry('token-2', 'G2 Bob', 'world-xyz', futureExpiry + 1000),
      }),
    );

    const { readBearerRegistry } = await import('../bearer-registry-reader.js');
    const result = readBearerRegistry();

    expect(result.source).toBe('foundry-registry');
    expect(result.count).toBe(2);
    expect(result.bearers).toHaveLength(2);

    const alice = result.bearers.find((b) => b.alias === 'G2 Alice');
    expect(alice).toBeDefined();
    expect(alice?.token).toBe('token-1');
    expect(alice?.expiresAt).toBe(futureExpiry);
    expect(alice?.worldId).toBe('world-xyz');
  });

  it('drops expired entries (expiresAt <= Date.now())', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    settingsStore.set(
      'evenfoundryvtt.bearerRegistry',
      makeRegistry({
        'token-expired': makeEntry('token-expired', 'Old G2', 'world-xyz', NOW - 1),
        'token-valid': makeEntry('token-valid', 'New G2', 'world-xyz', NOW + 86_400_000),
      }),
    );

    const { readBearerRegistry } = await import('../bearer-registry-reader.js');
    const result = readBearerRegistry();

    expect(result.count).toBe(1);
    expect(result.bearers).toHaveLength(1);
    expect(result.bearers[0]?.alias).toBe('New G2');
  });

  it('drops revoked entries (revokedAt !== null excluded by listBearers)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    settingsStore.set(
      'evenfoundryvtt.bearerRegistry',
      makeRegistry({
        'token-revoked': makeEntry(
          'token-revoked',
          'Revoked G2',
          'world-xyz',
          NOW + 86_400_000,
          NOW - 500,
        ),
        'token-valid': makeEntry('token-valid', 'Valid G2', 'world-xyz', NOW + 86_400_000),
      }),
    );

    const { readBearerRegistry } = await import('../bearer-registry-reader.js');
    const result = readBearerRegistry();

    expect(result.count).toBe(1);
    expect(result.bearers[0]?.alias).toBe('Valid G2');
  });

  it('returns empty snapshot with source=foundry-registry on throw (defensive)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Corrupt the settings to cause a throw
    (game.settings.get as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('settings unavailable');
    });

    const { readBearerRegistry } = await import('../bearer-registry-reader.js');
    const result = readBearerRegistry();

    expect(result.source).toBe('foundry-registry');
    expect(result.count).toBe(0);
    expect(result.bearers).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('includes generatedAt as a recent timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    settingsStore.set('evenfoundryvtt.bearerRegistry', makeRegistry({}));

    const { readBearerRegistry } = await import('../bearer-registry-reader.js');
    const result = readBearerRegistry();

    expect(result.generatedAt).toBe(NOW);
  });
});

describe('registerBearerRegistryReader', () => {
  let settingsStore: Map<string, unknown>;

  beforeEach(() => {
    settingsStore = new Map();
    hookHandlers.clear();
    hookIdCounter = 100;
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
    vi.stubGlobal('Hooks', makeFullHooksMock());
    vi.stubGlobal('game', {
      settings: {
        get: vi.fn((moduleId: string, key: string) => settingsStore.get(`${moduleId}.${key}`)),
        set: vi.fn(),
        register: vi.fn(),
        registerMenu: vi.fn(),
      },
      i18n: { localize: (k: string) => k },
    });
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 7) % 256;
        return arr;
      },
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('emits immediately when called', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    settingsStore.set(
      'evenfoundryvtt.bearerRegistry',
      makeRegistry({
        'token-1': makeEntry('token-1', 'G2', 'world-xyz', NOW + 86_400_000),
      }),
    );

    const { registerBearerRegistryReader } = await import('../bearer-registry-reader.js');
    const emit = vi.fn();
    const handle = registerBearerRegistryReader(emit);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      R1_BEARERS_AVAILABLE_TYPE,
      expect.objectContaining({ source: 'foundry-registry', count: 1 }),
    );
    // Verify handle shape
    expect(typeof handle.unsubscribe).toBe('function');
    expect(typeof handle.reEmit).toBe('function');
  });

  it('reEmit pushes a fresh snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    settingsStore.set(
      'evenfoundryvtt.bearerRegistry',
      makeRegistry({
        'token-1': makeEntry('token-1', 'G2', 'world-xyz', NOW + 86_400_000),
      }),
    );

    const { registerBearerRegistryReader } = await import('../bearer-registry-reader.js');
    const emit = vi.fn();
    const handle = registerBearerRegistryReader(emit);

    expect(emit).toHaveBeenCalledTimes(1);

    // Call reEmit directly (simulates post-rotation push)
    handle.reEmit();

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(
      R1_BEARERS_AVAILABLE_TYPE,
      expect.objectContaining({ source: 'foundry-registry' }),
    );
  });
});
