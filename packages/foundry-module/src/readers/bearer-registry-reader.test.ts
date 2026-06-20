/**
 * Unit tests for readBearerRegistry — ADR-0014 authorizedActorIds population.
 *
 * Verifies the pushed bearer-registry snapshot carries each bearer's live
 * owned-actor set (`authorizedActorIds`), computed Foundry-side via
 * `authorizedActorIdsForUser`. This is the source the bridge's CACHED
 * (no-socketlib) validate path consumes to enforce per-actor read
 * authorization (closes the T8 leak on the cached path).
 *
 * `listBearers` is mocked at the module boundary; `game.users` /
 * `game.actors` are stubbed so `authorizedActorIdsForUser` runs for real
 * against `testUserPermission`.
 *
 * @see ./bearer-registry-reader.ts
 * @see ../pair/actor-authorization.ts
 * @see docs/architecture/0014-bearer-actor-authorization.md §3
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the bearer source so the reader builds its snapshot from fixtures.
vi.mock('../pair/bearer-registry.js', () => ({
  listBearers: vi.fn(),
}));

import type { BearerEntry } from '../pair/bearer-registry.js';
import { listBearers } from '../pair/bearer-registry.js';
import { readBearerRegistry } from './bearer-registry-reader.js';

const listBearersMock = vi.mocked(listBearers);

/** Build a full BearerEntry with defaults; override the fields under test. */
function makeBearer(
  overrides: Partial<BearerEntry> & { token: string; userId: string },
): BearerEntry {
  return {
    alias: 'G2 Device',
    worldId: 'w',
    bridgeUrl: 'https://bridge.local:8910',
    internalSecret: 'secret',
    createdAt: 1,
    expiresAt: Date.now() + 86_400_000,
    lastSeenAt: null,
    revokedAt: null,
    ...overrides,
  };
}

/** Build a Foundry-actor mock whose ownership is keyed by user id. */
function makeActor(id: string, owners: string[]) {
  return {
    id,
    testUserPermission: (user: { id: string }, _perm: string) => owners.includes(user.id),
  };
}

/** Stub `game` so authorizedActorIdsForUser resolves users + ownership. */
function stubGame(userIds: string[], actors: ReturnType<typeof makeActor>[]) {
  const userMap = new Map(userIds.map((id) => [id, { id }]));
  vi.stubGlobal('game', {
    users: { get: (id: string) => userMap.get(id) },
    actors: { contents: actors },
  });
}

describe('readBearerRegistry — authorizedActorIds (ADR-0014)', () => {
  const FUTURE = Date.now() + 86_400_000;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('populates authorizedActorIds with the bearer user’s owned actors', () => {
    stubGame(
      ['user-alice'],
      [makeActor('actor-alice', ['user-alice']), makeActor('actor-bob', ['user-bob'])],
    );
    listBearersMock.mockReturnValue([
      makeBearer({ token: 'tok-alice', userId: 'user-alice', expiresAt: FUTURE }),
    ]);

    const snapshot = readBearerRegistry();
    expect(snapshot.bearers).toHaveLength(1);
    expect(snapshot.bearers[0]?.userId).toBe('user-alice');
    expect(snapshot.bearers[0]?.authorizedActorIds).toEqual(['actor-alice']);
  });

  it('coerces an empty alias to a non-empty placeholder (bridge schema requires min(1))', () => {
    // A self-minted bearer MAY carry alias:'' — but the bridge's BearerRegistryEntrySchema
    // requires alias min(1), and ONE empty-alias entry fails the whole snapshot's safeParse,
    // silently dropping the entire registry push (tool.invoke routing then breaks for every
    // non-GM player). The reader must never emit an empty alias.
    stubGame(['user-alice'], [makeActor('actor-alice', ['user-alice'])]);
    listBearersMock.mockReturnValue([
      makeBearer({ token: 'tok-alice', userId: 'user-alice', alias: '', expiresAt: FUTURE }),
    ]);

    const snapshot = readBearerRegistry();
    expect(snapshot.bearers[0]?.alias).toBe('G2');
    expect(snapshot.bearers[0]?.alias.length).toBeGreaterThan(0);
  });

  it('preserves a non-empty alias unchanged', () => {
    stubGame(['user-alice'], [makeActor('actor-alice', ['user-alice'])]);
    listBearersMock.mockReturnValue([
      makeBearer({
        token: 'tok-alice',
        userId: 'user-alice',
        alias: "Aiacos's G2",
        expiresAt: FUTURE,
      }),
    ]);

    expect(readBearerRegistry().bearers[0]?.alias).toBe("Aiacos's G2");
  });

  it('fail-closed: unknown user yields an empty authorizedActorIds set', () => {
    stubGame([], [makeActor('actor-x', ['user-ghost'])]);
    listBearersMock.mockReturnValue([
      makeBearer({ token: 'tok-ghost', userId: 'user-ghost', expiresAt: FUTURE }),
    ]);

    const snapshot = readBearerRegistry();
    expect(snapshot.bearers[0]?.authorizedActorIds).toEqual([]);
  });

  it('computes authorizedActorIds independently per bearer', () => {
    stubGame(
      ['user-alice', 'user-bob'],
      [
        makeActor('actor-alice', ['user-alice']),
        makeActor('actor-bob', ['user-bob']),
        makeActor('actor-shared', ['user-alice', 'user-bob']),
      ],
    );
    listBearersMock.mockReturnValue([
      makeBearer({ token: 'tok-alice', userId: 'user-alice', expiresAt: FUTURE }),
      makeBearer({ token: 'tok-bob', userId: 'user-bob', expiresAt: FUTURE }),
    ]);

    const snapshot = readBearerRegistry();
    const byToken = Object.fromEntries(
      snapshot.bearers.map((b) => [b.token, b.authorizedActorIds]),
    );
    expect(byToken['tok-alice']?.sort()).toEqual(['actor-alice', 'actor-shared']);
    expect(byToken['tok-bob']?.sort()).toEqual(['actor-bob', 'actor-shared']);
  });
});
