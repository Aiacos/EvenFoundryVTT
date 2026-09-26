/**
 * Shared Foundry global mocks for the direct-channel tests (projector, pairing,
 * map-reader, PairG2App, players menu). Installs `game`, `Hooks`, `CONST`, `foundry`,
 * `ui` and `canvas` via `vi.stubGlobal`.
 */
import { type Mock, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

export interface MockUser {
  id: string;
  name: string;
  isGM: boolean;
  active: boolean;
  role: number;
  targets: Set<{ id: string }>;
  flags: Record<string, Record<string, unknown> | undefined>;
  character?: { id: string } | null;
  update: Mock<(changes: Record<string, unknown>) => Promise<unknown>>;
  delete: Mock<() => Promise<unknown>>;
}

export interface FoundryMock {
  settings: Map<string, unknown>;
  users: MockUser[];
  actors: Map<string, Record<string, unknown>>;
  keybindings: Map<string, { onDown?: () => unknown }>;
  fire(event: string, ...args: unknown[]): void;
  hooks: {
    on: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  notifications: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  game: Record<string, unknown> & { user: MockUser };
}

/**
 * Foundry-style update merge: nested objects merge, `-=key: null` deletes `key`
 * (foundryvtt.com/api/v13 `foundry.utils.mergeObject` semantics used by `Document#update`).
 */
export function mergeUpdate(
  target: Record<string, unknown>,
  changes: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith('-=')) {
      delete target[key.slice(2)];
      continue;
    }
    const current = target[key];
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof current === 'object' &&
      current !== null
    ) {
      mergeUpdate(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = structuredClone(value);
    }
  }
}

/** Builds a mock user; `update` merges changes into the object (Foundry semantics). */
export function makeUser(id: string, name: string, extra: Partial<MockUser> = {}): MockUser {
  const user: MockUser = {
    id,
    name,
    isGM: false,
    active: true,
    role: 1,
    targets: new Set(),
    flags: {},
    update: vi.fn(async (changes: Record<string, unknown>) => {
      mergeUpdate(user as unknown as Record<string, unknown>, changes);
      return user;
    }),
    delete: vi.fn(async () => user),
    ...extra,
  };
  return user;
}

/** Builds a mock actor with `ownership` and an `update` that merges ownership. */
export function makeActor(id: string, name: string, extra: Record<string, unknown> = {}) {
  const actor: Record<string, unknown> = {
    id,
    name,
    type: 'character',
    ownership: {} as Record<string, number>,
    system: {
      attributes: {
        hp: { value: 10, max: 20, temp: 0, tempmax: 0 },
        ac: { value: 15 },
        exhaustion: 0,
      },
      details: { level: 3 },
    },
    statuses: new Set<string>(),
    effects: { contents: [] },
    items: { contents: [] },
    ...extra,
  };
  actor.update = vi.fn(async (changes: { ownership?: Record<string, number> }) => {
    if (changes.ownership !== undefined) {
      actor.ownership = { ...(actor.ownership as Record<string, number>), ...changes.ownership };
    }
    return actor;
  });
  return actor;
}

/**
 * Installs the Foundry globals. `gm` is the local user (GM by default).
 */
export function installFoundry(
  opts: {
    users?: MockUser[];
    actors?: Array<Record<string, unknown>>;
    scene?: Record<string, unknown> | null;
    localIsGM?: boolean;
    activeGMId?: string | null;
    messages?: unknown[];
  } = {},
): FoundryMock {
  const gm = makeUser('gm1', 'Anna', { isGM: true, role: 4 });
  gm.isGM = opts.localIsGM ?? true;
  const users = [gm, ...(opts.users ?? [])];
  const actors = new Map((opts.actors ?? []).map((a) => [a.id as string, a]));
  const settings = new Map<string, unknown>();
  const keybindings = new Map<string, { onDown?: () => unknown }>();
  const hookHandlers = new Map<string, Array<{ id: number; fn: Handler }>>();
  let hookId = 0;

  const hooks = {
    on: vi.fn((event: string, fn: Handler) => {
      const list = hookHandlers.get(event) ?? [];
      const id = ++hookId;
      list.push({ id, fn });
      hookHandlers.set(event, list);
      return id;
    }),
    once: vi.fn((event: string, fn: Handler) => {
      const list = hookHandlers.get(event) ?? [];
      list.push({ id: ++hookId, fn });
      hookHandlers.set(event, list);
    }),
    off: vi.fn((id: number) => {
      for (const [event, list] of hookHandlers) {
        hookHandlers.set(
          event,
          list.filter((h) => h.id !== id),
        );
      }
    }),
  };

  const notifications = { info: vi.fn(), error: vi.fn() };
  const activeGM =
    opts.activeGMId === undefined
      ? gm
      : opts.activeGMId === null
        ? null
        : (users.find((u) => u.id === opts.activeGMId) ?? null);

  const game = {
    user: gm,
    i18n: {
      lang: 'it',
      localize: (k: string) => k,
      format: (k: string, data: Record<string, unknown>) => `${k}:${JSON.stringify(data)}`,
    },
    settings: {
      register: vi.fn(),
      registerMenu: vi.fn(),
      get: vi.fn((m: string, k: string) => settings.get(`${m}.${k}`)),
      set: vi.fn(async (m: string, k: string, v: unknown) => {
        settings.set(`${m}.${k}`, structuredClone(v));
        return v;
      }),
    },
    users: {
      get: (id: string) => users.find((u) => u.id === id),
      get contents() {
        return users;
      },
      activeGM,
    },
    actors: {
      get: (id: string) => actors.get(id),
      get contents() {
        return [...actors.values()];
      },
    },
    scenes: { active: opts.scene ?? null, get: () => undefined, contents: [] },
    combat: null,
    messages: { contents: opts.messages ?? [], get: () => undefined },
    world: { title: 'Cripta' },
    modules: { get: () => undefined },
    keybindings: {
      register: vi.fn((m: string, action: string, data: { onDown?: () => unknown }) =>
        keybindings.set(`${m}.${action}`, data),
      ),
    },
  };

  vi.stubGlobal('game', game);
  vi.stubGlobal('Hooks', hooks);
  vi.stubGlobal('canvas', null);
  vi.stubGlobal('ui', { notifications });
  vi.stubGlobal('CONST', {
    DOCUMENT_OWNERSHIP_LEVELS: { INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
    TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 },
    WALL_DOOR_TYPES: { NONE: 0, DOOR: 1, SECRET: 2 },
  });
  vi.stubGlobal('foundry', {
    utils: { getRoute: (p: string) => `/vtt${p}` },
    applications: {
      api: {
        ApplicationV2: class {
          element = document.createElement('div');
          render = vi.fn(async () => this);
          close = vi.fn(async () => this);
        },
        HandlebarsApplicationMixin: <T>(base: T) => base,
      },
    },
  });

  return {
    settings,
    users,
    actors,
    keybindings,
    hooks,
    notifications,
    game,
    fire(event: string, ...args: unknown[]) {
      for (const h of hookHandlers.get(event) ?? []) h.fn(...args);
    },
  };
}
