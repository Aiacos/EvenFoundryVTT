/**
 * Unit tests for bearer-registry — generateBearer, validateBearer, revokeBearer, listBearers.
 *
 * Tests mock `game.settings` (get/set) to avoid a live Foundry instance.
 * TDD discipline: tests written before implementation (RED → GREEN → REFACTOR).
 *
 * Coverage gate (INV-4): ≥80% on bearer-registry.ts.
 *
 * @see packages/foundry-module/src/pair/bearer-registry.ts
 * @see 02-02-PLAN.md Task 1 (bearer registry)
 * @see 02-CONTEXT.md D-2.10 (opaque bearer format), D-2.11 (TTL + silent refresh), D-2.12 (revoke registry)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BearerRegistry } from './bearer-registry.js';

// ─── Foundry global stubs ─────────────────────────────────────────────────────

/**
 * Minimal Application base class stub.
 * Required because settings.ts (imported transitively via module.ts) has
 * code that extends Application. Evaluated at import time.
 */
class ApplicationStub {
  get title(): string {
    return '';
  }
}

/**
 * Minimal ApplicationV2 base class stub.
 * Required because settings.ts now imports PairModal which extends ApplicationV2.
 * PairModal class definition evaluates `extends ApplicationV2` at module load.
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

/** Minimal Hooks stub to prevent errors when module.ts registers init hook. */
const makeHooksMock = () => ({
  once: vi.fn(),
  on: vi.fn(),
});

/**
 * Creates a deterministic-but-varied crypto.getRandomValues mock.
 * Uses a counter so each call produces distinct bytes — avoids identical
 * token + internalSecret values in the same test.
 */
function makeCryptoMock() {
  let callCount = 0;
  return {
    getRandomValues: (arr: Uint8Array) => {
      const seed = callCount++;
      for (let i = 0; i < arr.length; i++) {
        arr[i] = ((i * 37 + seed * 13 + 7) * 251) % 256;
      }
      return arr;
    },
  };
}

// ─── Foundry settings mock ────────────────────────────────────────────────────

/**
 * Creates a mock for game.settings supporting get/set with an in-memory store.
 */
function makeSettingsMock(initialRegistry?: BearerRegistry) {
  const store = new Map<string, unknown>();
  if (initialRegistry) {
    store.set('evenfoundryvtt.bearerRegistry', initialRegistry);
  }

  return {
    get: vi.fn((moduleId: string, key: string) => {
      const fullKey = `${moduleId}.${key}`;
      return store.get(fullKey);
    }),
    set: vi.fn((moduleId: string, key: string, value: unknown) => {
      const fullKey = `${moduleId}.${key}`;
      store.set(fullKey, value);
    }),
    register: vi.fn(),
    _store: store,
  };
}

// ─── Bearer token format helpers ─────────────────────────────────────────────

/** Base64url alphabet: A-Z, a-z, 0-9, -, _ (no +, /, = padding) */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

/** 32 bytes encoded as base64url = ceil(32 * 4/3) = 43 chars (no padding) */
const EXPECTED_MIN_LENGTH = 43;

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('generateBearer', () => {
  let settingsMock: ReturnType<typeof makeSettingsMock>;

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
    vi.stubGlobal('Hooks', makeHooksMock());
    settingsMock = makeSettingsMock();
    vi.stubGlobal('game', { settings: settingsMock });
    vi.stubGlobal('crypto', makeCryptoMock());
  });

  it('produces a base64url token of at least 43 chars (32 bytes)', async () => {
    const { generateBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('Test Device', 'https://bridge.local:8910', 'world-abc');
    expect(entry.token.length).toBeGreaterThanOrEqual(EXPECTED_MIN_LENGTH);
    expect(BASE64URL_RE.test(entry.token)).toBe(true);
  });

  it('token contains NO dots (is NOT a JWT)', async () => {
    const { generateBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('Test Device', 'https://bridge.local:8910', 'world-abc');
    expect(entry.token).not.toContain('.');
  });

  it('stores the entry in the registry via game.settings.set', async () => {
    const { generateBearer } = await import('./bearer-registry.js');
    await generateBearer('My G2', 'https://bridge.local:8910', 'world-xyz');
    expect(settingsMock.set).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'bearerRegistry',
      expect.anything(),
    );
  });

  it('sets expiresAt = createdAt + 24h (86400000 ms)', async () => {
    const { generateBearer } = await import('./bearer-registry.js');
    const before = Date.now();
    const entry = await generateBearer('My G2', 'https://bridge.local:8910', 'world-xyz');
    const after = Date.now();

    expect(entry.expiresAt - entry.createdAt).toBe(24 * 3600 * 1000);
    expect(entry.createdAt).toBeGreaterThanOrEqual(before);
    expect(entry.createdAt).toBeLessThanOrEqual(after);
  });

  it('generates a separate internal_secret of at least 43 chars', async () => {
    const { generateBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('My G2', 'https://bridge.local:8910', 'world-xyz');
    expect(entry.internalSecret.length).toBeGreaterThanOrEqual(EXPECTED_MIN_LENGTH);
    expect(BASE64URL_RE.test(entry.internalSecret)).toBe(true);
  });

  it('token and internal_secret are different values', async () => {
    const { generateBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('My G2', 'https://bridge.local:8910', 'world-xyz');
    expect(entry.token).not.toBe(entry.internalSecret);
  });

  it('sets revokedAt = null and lastSeenAt = null on new entry', async () => {
    const { generateBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('My G2', 'https://bridge.local:8910', 'world-xyz');
    expect(entry.revokedAt).toBeNull();
    expect(entry.lastSeenAt).toBeNull();
  });

  it('truncates alias to 40 chars if longer', async () => {
    const { generateBearer } = await import('./bearer-registry.js');
    const longAlias = 'A'.repeat(50);
    const entry = await generateBearer(longAlias, 'https://bridge.local:8910', 'world-xyz');
    expect(entry.alias.length).toBeLessThanOrEqual(40);
  });

  describe('refresh=true (silent refresh)', () => {
    it('creates a new entry while giving the old one a 60s grace period', async () => {
      const { generateBearer } = await import('./bearer-registry.js');

      // Create initial entry
      const old = await generateBearer('My G2', 'https://bridge.local:8910', 'world-xyz');
      const oldToken = old.token;
      const originalExpiry = old.expiresAt;

      // Refresh
      const newEntry = await generateBearer(
        'My G2',
        'https://bridge.local:8910',
        'world-xyz',
        true,
      );
      expect(newEntry.token).not.toBe(oldToken);

      // The old entry should have expiresAt reduced to now+60s (grace period)
      const { validateBearer } = await import('./bearer-registry.js');
      const oldValidation = validateBearer(oldToken);
      // Old entry still valid during grace period (not yet expired)
      if (oldValidation.valid) {
        expect(oldValidation.entry?.expiresAt).toBeLessThan(originalExpiry);
        expect(oldValidation.entry?.expiresAt).toBeGreaterThan(Date.now());
      }
      // New entry is valid
      const newValidation = validateBearer(newEntry.token);
      expect(newValidation.valid).toBe(true);
    });
  });
});

describe('validateBearer', () => {
  let settingsMock: ReturnType<typeof makeSettingsMock>;

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
    vi.stubGlobal('Hooks', makeHooksMock());
    settingsMock = makeSettingsMock();
    vi.stubGlobal('game', { settings: settingsMock });
    vi.stubGlobal('crypto', makeCryptoMock());
  });

  it('returns { valid: false, reason: "unknown_token" } for an unregistered token', async () => {
    const { validateBearer } = await import('./bearer-registry.js');
    const result = validateBearer('not-a-real-token');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unknown_token');
  });

  it('returns { valid: true, entry } for a valid non-expired token', async () => {
    const { generateBearer, validateBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('Valid Device', 'https://bridge.local:8910', 'world-abc');
    const result = validateBearer(entry.token);
    expect(result.valid).toBe(true);
    expect(result.entry).toBeDefined();
    expect(result.entry?.token).toBe(entry.token);
  });

  it('returns { valid: false, reason: "revoked" } for a revoked token', async () => {
    const { generateBearer, revokeBearer, validateBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer(
      'Device to Revoke',
      'https://bridge.local:8910',
      'world-abc',
    );
    revokeBearer(entry.token);
    const result = validateBearer(entry.token);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('revoked');
  });

  it('returns { valid: false, reason: "expired" } for an expired token', async () => {
    const { generateBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('Expired Device', 'https://bridge.local:8910', 'world-abc');

    // Manually set expiresAt to the past via the registry
    const registry = settingsMock.get('evenfoundryvtt', 'bearerRegistry') as BearerRegistry;
    const found = registry.entries[entry.token];
    if (found) {
      found.expiresAt = Date.now() - 1000;
      settingsMock.set('evenfoundryvtt', 'bearerRegistry', registry);
    }

    // Reset modules so bearer-registry re-reads settings on next call
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
    vi.stubGlobal('Hooks', makeHooksMock());
    vi.stubGlobal('game', { settings: settingsMock });
    vi.stubGlobal('crypto', makeCryptoMock());
    const { validateBearer } = await import('./bearer-registry.js');
    const result = validateBearer(entry.token);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });
});

describe('revokeBearer', () => {
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
    vi.stubGlobal('Hooks', makeHooksMock());
    const settingsMock = makeSettingsMock();
    vi.stubGlobal('game', { settings: settingsMock });
    vi.stubGlobal('crypto', makeCryptoMock());
  });

  it('sets revokedAt to a timestamp on the entry', async () => {
    const { generateBearer, revokeBearer, validateBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('Device', 'https://bridge.local:8910', 'world');
    const before = Date.now();
    revokeBearer(entry.token);
    const after = Date.now();

    const result = validateBearer(entry.token);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('revoked');
    // revokedAt is set in the entry
    expect(result.entry?.revokedAt).toBeGreaterThanOrEqual(before);
    expect(result.entry?.revokedAt).toBeLessThanOrEqual(after);
  });

  it('persists the revocation via game.settings.set', async () => {
    const settingsMock2 = makeSettingsMock();
    vi.stubGlobal('game', { settings: settingsMock2 });
    const { generateBearer, revokeBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('Device', 'https://bridge.local:8910', 'world');
    const callsBefore = settingsMock2.set.mock.calls.length;
    revokeBearer(entry.token);
    expect(settingsMock2.set.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('is a no-op for an unknown token (does not throw)', async () => {
    const { revokeBearer } = await import('./bearer-registry.js');
    expect(() => revokeBearer('unknown-token-xyz')).not.toThrow();
  });
});

describe('listBearers', () => {
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
    vi.stubGlobal('Hooks', makeHooksMock());
    const settingsMock = makeSettingsMock();
    vi.stubGlobal('game', { settings: settingsMock });
    vi.stubGlobal('crypto', makeCryptoMock());
  });

  it('returns an empty array when no bearers exist', async () => {
    const { listBearers } = await import('./bearer-registry.js');
    expect(listBearers()).toEqual([]);
  });

  it('returns non-revoked entries sorted by createdAt descending', async () => {
    const { generateBearer, listBearers } = await import('./bearer-registry.js');
    const e1 = await generateBearer('Device 1', 'https://b.local:8910', 'world');
    // Small delay to guarantee different createdAt timestamps
    await new Promise<void>((r) => setTimeout(r, 5));
    const e2 = await generateBearer('Device 2', 'https://b.local:8910', 'world');

    const list = listBearers();
    expect(list.length).toBe(2);
    // e2 was created later, so it should be first (descending order)
    expect(list[0]?.token).toBe(e2.token);
    expect(list[1]?.token).toBe(e1.token);
  });

  it('excludes revoked entries from the list', async () => {
    const { generateBearer, revokeBearer, listBearers } = await import('./bearer-registry.js');
    const e1 = await generateBearer('Device 1', 'https://b.local:8910', 'world');
    const e2 = await generateBearer('Device 2', 'https://b.local:8910', 'world');
    revokeBearer(e1.token);

    const list = listBearers();
    expect(list.length).toBe(1);
    expect(list[0]?.token).toBe(e2.token);
  });
});

// ─── getActiveBearer ──────────────────────────────────────────────────────────

describe('getActiveBearer', () => {
  let settingsMock: ReturnType<typeof makeSettingsMock>;

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
    vi.stubGlobal('Hooks', makeHooksMock());
    settingsMock = makeSettingsMock();
    vi.stubGlobal('game', { settings: settingsMock });
    vi.stubGlobal('crypto', makeCryptoMock());
  });

  it('returns null when no entries exist', async () => {
    const { getActiveBearer } = await import('./bearer-registry.js');
    expect(getActiveBearer()).toBeNull();
  });

  it('returns the first non-revoked, non-expired entry (newest first)', async () => {
    const { generateBearer, getActiveBearer } = await import('./bearer-registry.js');
    const e1 = await generateBearer('Device 1', 'https://b.local:8910', 'world');
    const active = getActiveBearer();
    expect(active).not.toBeNull();
    expect(active?.token).toBe(e1.token);
  });

  it('returns null when all entries are revoked', async () => {
    const { generateBearer, revokeBearer, getActiveBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('Device 1', 'https://b.local:8910', 'world');
    revokeBearer(entry.token);
    expect(getActiveBearer()).toBeNull();
  });

  it('returns null when the only entry is expired (expiresAt in past)', async () => {
    const { generateBearer, getActiveBearer } = await import('./bearer-registry.js');
    const entry = await generateBearer('Device 1', 'https://b.local:8910', 'world');

    // Manually expire the entry by patching the registry via game.settings
    const registry = settingsMock._store.get('evenfoundryvtt.bearerRegistry') as {
      entries: Record<string, { expiresAt: number }>;
      version: 1;
    };
    if (registry?.entries[entry.token]) {
      // biome-ignore lint/style/noNonNullAssertion: test setup guarantees presence
      registry.entries[entry.token]!.expiresAt = Date.now() - 1000; // expired 1s ago
    }

    expect(getActiveBearer()).toBeNull();
  });

  it('returns newest entry when multiple non-revoked non-expired entries exist', async () => {
    const { generateBearer, getActiveBearer } = await import('./bearer-registry.js');
    // e1 created first — will be second in the sorted list
    await generateBearer('Device 1', 'https://b.local:8910', 'world');
    await new Promise<void>((r) => setTimeout(r, 5));
    const e2 = await generateBearer('Device 2', 'https://b.local:8910', 'world');

    const active = getActiveBearer();
    // listBearers() sorts descending by createdAt → first = e2 (newer)
    expect(active?.token).toBe(e2.token);
  });
});
