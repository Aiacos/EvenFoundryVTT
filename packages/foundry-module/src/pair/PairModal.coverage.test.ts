/**
 * Branch-coverage tests for PairModal helper arms not exercised by PairModal.test.ts:
 * finite-TTL formatTtl hour/minute variants, formatLastSeen relative strings, the
 * pending-pair flag validation + alias fallback, and the missing-self-id guard.
 * Each asserts an observable field of the prepared template context.
 *
 * @see packages/foundry-module/src/pair/PairModal.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

class ApplicationV2Stub {
  element: HTMLElement = { querySelector: () => null } as unknown as HTMLElement;
  render(): this {
    return this;
  }
  async close(): Promise<void> {}
  async _prepareContext(): Promise<Record<string, unknown>> {
    return {};
  }
  _onRender(): void {}
  static DEFAULT_OPTIONS = { id: '', window: { title: '' }, position: { width: 400 } };
  static PARTS = {};
}
class ApplicationStub {
  get title(): string {
    return '';
  }
}

interface Reg {
  entries: Record<string, Record<string, unknown>>;
}

/** A registry BearerEntry bound to the current user (user-1). */
function bearer(over: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now();
  return {
    token: 'tok-1',
    alias: 'MyG2',
    worldId: 'world-abc',
    userId: 'user-1',
    bridgeUrl: 'https://bridge.local:8910',
    internalSecret: 's',
    createdAt: now,
    expiresAt: now + 3 * 3600 * 1000,
    lastSeenAt: null,
    revokedAt: null,
    ...over,
  };
}

function makeGame(opts: { registry?: Reg; selfId?: string | undefined; pending?: unknown } = {}) {
  const store = new Map<string, unknown>();
  store.set('evenfoundryvtt.bridgeUrl', 'https://bridge.local:8910');
  if (opts.registry) store.set('evenfoundryvtt.bearerRegistry', opts.registry);
  const flagStore = new Map<string, unknown>();
  if (opts.pending !== undefined) flagStore.set('evenfoundryvtt.pendingPair', opts.pending);
  return {
    settings: {
      get: vi.fn((m: string, k: string) => store.get(`${m}.${k}`)),
      set: vi.fn((m: string, k: string, v: unknown) => store.set(`${m}.${k}`, v)),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    world: { id: 'world-abc' },
    user:
      'selfId' in opts && opts.selfId === undefined
        ? { id: undefined, getFlag: (s: string, k: string) => flagStore.get(`${s}.${k}`) }
        : {
            id: opts.selfId ?? 'user-1',
            name: 'Aiacos',
            isGM: true,
            getFlag: (s: string, k: string) => flagStore.get(`${s}.${k}`),
          },
    users: { contents: [] },
    i18n: { lang: 'en', localize: (k: string) => k },
  };
}

async function prepare(game: ReturnType<typeof makeGame>) {
  vi.stubGlobal('Application', ApplicationStub);
  vi.stubGlobal('foundry', {
    applications: {
      api: { ApplicationV2: ApplicationV2Stub, HandlebarsApplicationMixin: (B: unknown) => B },
    },
  });
  vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn(() => 1), off: vi.fn() });
  vi.stubGlobal('game', game);
  vi.stubGlobal('crypto', {
    getRandomValues: (a: Uint8Array) => {
      for (let i = 0; i < a.length; i++) a[i] = (i * 7 + 3) % 256;
      return a;
    },
  });
  const { PairModal } = await import('./PairModal.js');
  return (await new PairModal()._prepareContext({})) as Record<string, unknown>;
}

beforeEach(() => {
  vi.resetModules();
});

describe('formatTtl finite-TTL hour/minute variants (active state)', () => {
  it('renders "Xh Ym" when hours and minutes both remain', async () => {
    // +20s sub-minute buffer so Date.now() drift inside _prepareContext still floors to 150 min.
    const now = Date.now();
    const data = await prepare(
      makeGame({
        registry: {
          entries: { t: bearer({ expiresAt: now + 2 * 3600_000 + 30 * 60_000 + 20_000 }) },
        },
      }),
    );
    expect(data.state).toBe('active');
    expect(data.ttlDisplay).toBe('2h 30m');
  });

  it('renders "Xh" when a whole number of hours remains', async () => {
    // +20s (< 1 min) buffer keeps the floor at exactly 180 min → no trailing minutes.
    const now = Date.now();
    const data = await prepare(
      makeGame({
        registry: { entries: { t: bearer({ expiresAt: now + 3 * 3600_000 + 20_000 }) } },
      }),
    );
    expect(data.state).toBe('active');
    expect(data.ttlDisplay).toBe('3h');
  });
});

describe('formatLastSeen relative string', () => {
  it('formats a recent lastSeenAt into a non-placeholder relative string', async () => {
    const now = Date.now();
    const data = await prepare(
      makeGame({
        registry: { entries: { t: bearer({ lastSeenAt: now - 2 * 60_000 }) } },
      }),
    );
    const devices = data.devices as Array<{ lastSeenRelative: string }>;
    expect(devices).toHaveLength(1);
    expect(devices[0]?.lastSeenRelative).not.toBe('—');
  });
});

describe('pending-pair flag validation + alias fallback', () => {
  it('valid pending flag with empty alias → device listed with the "G2" default alias', async () => {
    const data = await prepare(
      makeGame({
        pending: {
          token: 'flag-tok',
          bridgeUrl: 'https://bridge.local:8910',
          alias: '',
          worldId: 'world-abc',
          createdAt: Date.now(),
        },
      }),
    );
    expect(data.state).toBe('active');
    const devices = data.devices as Array<{ alias: string }>;
    expect(devices.some((d) => d.alias === 'G2')).toBe(true);
  });

  it('malformed pending flag (missing bridgeUrl) is rejected → empty state', async () => {
    const data = await prepare(
      makeGame({ pending: { token: 'x', alias: 'A' } }), // no bridgeUrl → readPendingPair null
    );
    expect(data.state).toBe('empty');
  });

  it('pending flag with empty token is rejected → empty state', async () => {
    const data = await prepare(
      makeGame({ pending: { token: '', bridgeUrl: 'https://b:1', alias: 'A' } }),
    );
    expect(data.state).toBe('empty');
  });
});

describe('currentUserBearers missing-self guard', () => {
  it('no game.user.id → registry bearer is not surfaced (empty state)', async () => {
    const data = await prepare(
      makeGame({ registry: { entries: { t: bearer() } }, selfId: undefined }),
    );
    // Without a self id the registry cannot be scoped → the user sees no devices.
    expect(data.state).toBe('empty');
  });
});
