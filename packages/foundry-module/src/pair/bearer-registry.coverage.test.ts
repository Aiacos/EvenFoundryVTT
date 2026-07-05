/**
 * Branch-coverage tests for bearer-registry.ts self-service / defensive arms:
 * the `listPendingFlagBearers` flag scan (invalid uid, missing flag/token,
 * per-field fallbacks), the `validateBearer` flag-bearer standalone path, the
 * silent-refresh no-match arm, and the `writeRegistry` settings-absent guard.
 *
 * @see packages/foundry-module/src/pair/bearer-registry.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

class ApplicationStub {
  get title(): string {
    return '';
  }
}
class ApplicationV2Stub {
  render(): this {
    return this;
  }
  async close(): Promise<void> {}
  static get defaultOptions() {
    return { id: '', title: '', template: '', width: 400, height: 'auto', resizable: false };
  }
}

function makeCryptoMock() {
  let n = 0;
  return {
    getRandomValues: (arr: Uint8Array) => {
      const seed = n++;
      for (let i = 0; i < arr.length; i++) arr[i] = ((i * 37 + seed * 13 + 7) * 251) % 256;
      return arr;
    },
  };
}

function makeSettingsMock() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((m: string, k: string) => store.get(`${m}.${k}`)),
    set: vi.fn((m: string, k: string, v: unknown) => store.set(`${m}.${k}`, v)),
    register: vi.fn(),
    _store: store,
  };
}

/** A Foundry user document exposing a pendingPair flag via getFlag. */
function flagUser(id: unknown, pending: unknown) {
  return {
    id,
    getFlag: (_scope: string, key: string) => (key === 'pendingPair' ? pending : undefined),
  };
}

function stubCommon() {
  vi.stubGlobal('Application', ApplicationStub);
  vi.stubGlobal('foundry', {
    applications: {
      api: { ApplicationV2: ApplicationV2Stub, HandlebarsApplicationMixin: (B: unknown) => B },
    },
  });
  vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn() });
  vi.stubGlobal('crypto', makeCryptoMock());
}

beforeEach(() => {
  vi.resetModules();
  stubCommon();
});

describe('listPendingFlagBearers', () => {
  it('maps a complete pendingPair flag to a non-expiring synthetic bearer', async () => {
    const pending = {
      token: 'tok-abc',
      alias: 'MyG2',
      bridgeUrl: 'https://bridge.local:8910',
      worldId: 'world-1',
      createdAt: 1234,
    };
    vi.stubGlobal('game', {
      settings: makeSettingsMock(),
      users: { contents: [flagUser('user-1', pending)] },
    });
    const { listPendingFlagBearers, NO_EXPIRY_MS } = await import('./bearer-registry.js');
    const out = listPendingFlagBearers();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      token: 'tok-abc',
      alias: 'MyG2',
      bridgeUrl: 'https://bridge.local:8910',
      worldId: 'world-1',
      userId: 'user-1',
      createdAt: 1234,
      expiresAt: NO_EXPIRY_MS,
    });
  });

  it('applies field fallbacks when alias/worldId/bridgeUrl/createdAt are absent', async () => {
    const before = Date.now();
    vi.stubGlobal('game', {
      settings: makeSettingsMock(),
      users: { contents: [flagUser('user-2', { token: 'tok-min' })] },
    });
    const { listPendingFlagBearers } = await import('./bearer-registry.js');
    const entry = listPendingFlagBearers()[0];
    expect(entry?.alias).toBe('G2'); // default alias
    expect(entry?.worldId).toBe('');
    expect(entry?.bridgeUrl).toBe('');
    expect(entry?.createdAt).toBeGreaterThanOrEqual(before); // Date.now() fallback
  });

  it('skips users with a non-string / empty id', async () => {
    vi.stubGlobal('game', {
      settings: makeSettingsMock(),
      users: {
        contents: [flagUser(undefined, { token: 't1' }), flagUser('', { token: 't2' })],
      },
    });
    const { listPendingFlagBearers } = await import('./bearer-registry.js');
    expect(listPendingFlagBearers()).toEqual([]);
  });

  it('skips users whose flag is missing or lacks a token', async () => {
    vi.stubGlobal('game', {
      settings: makeSettingsMock(),
      users: {
        contents: [flagUser('u-a', null), flagUser('u-b', { alias: 'no token here' })],
      },
    });
    const { listPendingFlagBearers } = await import('./bearer-registry.js');
    expect(listPendingFlagBearers()).toEqual([]);
  });

  it('returns [] and never throws when game.users is absent', async () => {
    vi.stubGlobal('game', { settings: makeSettingsMock() });
    const { listPendingFlagBearers } = await import('./bearer-registry.js');
    expect(listPendingFlagBearers()).toEqual([]);
  });
});

describe('validateBearer flag-bearer standalone path', () => {
  it('validates a token present only as a pendingPair flag (no registry entry)', async () => {
    vi.stubGlobal('game', {
      settings: makeSettingsMock(),
      users: { contents: [flagUser('u-flag', { token: 'flag-token' })] },
    });
    const { validateBearer } = await import('./bearer-registry.js');
    const res = validateBearer('flag-token');
    expect(res.valid).toBe(true);
    expect(res.entry?.userId).toBe('u-flag');
  });

  it('returns unknown_token when the token is in neither registry nor flags', async () => {
    vi.stubGlobal('game', {
      settings: makeSettingsMock(),
      users: { contents: [] },
    });
    const { validateBearer } = await import('./bearer-registry.js');
    expect(validateBearer('nope')).toEqual({ valid: false, reason: 'unknown_token' });
  });
});

describe('silent-refresh no-match arm', () => {
  it('leaves a revoked same-alias bearer untouched during refresh', async () => {
    vi.stubGlobal('game', { settings: makeSettingsMock(), users: { contents: [] } });
    const { generateBearer, revokeBearer, validateBearer, NO_EXPIRY_MS } = await import(
      './bearer-registry.js'
    );
    const first = await generateBearer('SameAlias', 'https://b:1', 'w', 'u');
    await revokeBearer(first.token);
    // refresh=true: the revoked entry fails the (revokedAt === null) arm and is skipped.
    const second = await generateBearer('SameAlias', 'https://b:1', 'w', 'u', true);
    // revoked entry stays revoked (grace was NOT applied to it)
    expect(validateBearer(first.token).reason).toBe('revoked');
    // the new entry is minted non-expiring
    expect(second.expiresAt).toBe(NO_EXPIRY_MS);
  });
});

describe('writeRegistry settings-absent guard', () => {
  it('generateBearer still returns an entry when game.settings is undefined (no-op write)', async () => {
    // Teardown/reload resilience: a mint that races a missing settings store must
    // not throw — the write silently no-ops.
    vi.stubGlobal('game', {});
    const { generateBearer, NO_EXPIRY_MS } = await import('./bearer-registry.js');
    const entry = await generateBearer('Ghost', 'https://b:1', 'w', 'u');
    expect(entry.token.length).toBeGreaterThan(0);
    expect(entry.expiresAt).toBe(NO_EXPIRY_MS);
  });
});
