/**
 * Unit tests for self-pair-ingestion — GM-side ingestion of per-user pending-pair flags.
 *
 * Verifies the SECURE self-service pairing contract:
 *   - SPI-01: GM ingests a valid pending flag → ingestBearer(userDoc.id, …) → reEmit → unsetFlag
 *   - SPI-02: the bound userId is the DOCUMENT's id, never any userId field in the payload (authz)
 *   - SPI-03: a non-GM client does nothing (only a GM may write the world-scope registry)
 *   - SPI-04: absent / malformed flag → no ingest
 *   - SPI-05: sweepPendingPairs ingests across all users (offline-queued + the GM's own)
 *   - SPI-06: registerSelfPairIngestion wires the updateUser hook + runs an initial sweep
 *
 * ingestBearer is mocked so each test asserts the call shape without touching the registry.
 *
 * @see packages/foundry-module/src/pair/self-pair-ingestion.ts
 * @see packages/foundry-module/src/pair/bearer-registry.ts (ingestBearer)
 * @see ADR-0014 (bearer↔Foundry-user binding)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the registry write half — assert the call without a live settings store.
vi.mock('./bearer-registry.js', () => ({
  ingestBearer: vi.fn(async () => ({ token: 'x' })),
}));

// module.ts re-export of MODULE_ID is imported by the SUT; stub the module so the
// heavy module.ts side effects do not run at import time.
vi.mock('../module.js', () => ({ MODULE_ID: 'evenfoundryvtt' }));

import { ingestBearer } from './bearer-registry.js';

const VALID_PENDING = {
  alias: 'My G2',
  token: 'client-token-abc',
  bridgeUrl: 'https://bridge.local:8910',
  worldId: 'world-abc',
  createdAt: 1_700_000_000_000,
};

/** Build a mock User document with a flag store. */
function makeUserDoc(id: string, pending: unknown) {
  const flags = new Map<string, unknown>();
  if (pending !== undefined) {
    flags.set('evenfoundryvtt.pendingPair', pending);
  }
  return {
    id,
    getFlag: vi.fn((scope: string, key: string) => flags.get(`${scope}.${key}`)),
    unsetFlag: vi.fn(async (scope: string, key: string) => {
      flags.delete(`${scope}.${key}`);
    }),
    _flags: flags,
  };
}

const makeHooksMock = () => ({ once: vi.fn(), on: vi.fn() });

function stubGame(isGM: boolean, users: unknown[] = []) {
  vi.stubGlobal('game', {
    user: { id: 'user-gm', isGM },
    users: { contents: users },
  });
}

describe('self-pair-ingestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Hooks', makeHooksMock());
  });

  it('SPI-01/02: GM ingests a valid flag → ingestBearer(userDoc.id, payload) → reEmit → unsetFlag', async () => {
    stubGame(true);
    const reEmit = vi.fn();
    const userDoc = makeUserDoc('user-42', VALID_PENDING);

    const { registerSelfPairIngestion } = await import('./self-pair-ingestion.js');
    registerSelfPairIngestion(reEmit);
    // Grab the updateUser hook handler the SUT registered and invoke it.
    const onMock = (globalThis as unknown as { Hooks: { on: ReturnType<typeof vi.fn> } }).Hooks.on;
    const [hookName, handler] = onMock.mock.calls[0] as [string, (...a: unknown[]) => void];
    expect(hookName).toBe('updateUser');

    handler(userDoc, {}, {}, 'user-42');
    await Promise.resolve();
    await Promise.resolve();

    // SECURITY: bound to userDoc.id, NOT to any userId inside the payload.
    expect(ingestBearer).toHaveBeenCalledWith('user-42', {
      alias: VALID_PENDING.alias,
      token: VALID_PENDING.token,
      bridgeUrl: VALID_PENDING.bridgeUrl,
      worldId: VALID_PENDING.worldId,
    });
    expect(reEmit).toHaveBeenCalled();
    expect(userDoc.unsetFlag).toHaveBeenCalledWith('evenfoundryvtt', 'pendingPair');
  });

  it('SPI-03: a non-GM client does nothing', async () => {
    stubGame(false);
    const reEmit = vi.fn();
    const userDoc = makeUserDoc('user-42', VALID_PENDING);

    const { registerSelfPairIngestion } = await import('./self-pair-ingestion.js');
    registerSelfPairIngestion(reEmit);
    const onMock = (globalThis as unknown as { Hooks: { on: ReturnType<typeof vi.fn> } }).Hooks.on;
    const [, handler] = onMock.mock.calls[0] as [string, (...a: unknown[]) => void];
    handler(userDoc, {}, {}, 'user-42');
    await Promise.resolve();

    expect(ingestBearer).not.toHaveBeenCalled();
    expect(reEmit).not.toHaveBeenCalled();
  });

  it('SPI-04: an absent or malformed flag does not ingest', async () => {
    stubGame(true);
    const reEmit = vi.fn();
    const { registerSelfPairIngestion } = await import('./self-pair-ingestion.js');
    registerSelfPairIngestion(reEmit);
    const onMock = (globalThis as unknown as { Hooks: { on: ReturnType<typeof vi.fn> } }).Hooks.on;
    const [, handler] = onMock.mock.calls[0] as [string, (...a: unknown[]) => void];

    handler(makeUserDoc('u1', undefined), {}, {}, 'u1'); // no flag
    handler(makeUserDoc('u2', { alias: 'x' }), {}, {}, 'u2'); // missing token/bridgeUrl/worldId
    await Promise.resolve();

    expect(ingestBearer).not.toHaveBeenCalled();
  });

  it('SPI-05: sweepPendingPairs ingests across all users', async () => {
    const users = [
      makeUserDoc('user-1', VALID_PENDING),
      makeUserDoc('user-2', undefined),
      makeUserDoc('user-3', { ...VALID_PENDING, token: 'tok-3' }),
    ];
    stubGame(true, users);
    const reEmit = vi.fn();

    const { sweepPendingPairs } = await import('./self-pair-ingestion.js');
    sweepPendingPairs(reEmit);
    await Promise.resolve();
    await Promise.resolve();

    expect(ingestBearer).toHaveBeenCalledTimes(2);
    expect(ingestBearer).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ token: 'client-token-abc' }),
    );
    expect(ingestBearer).toHaveBeenCalledWith(
      'user-3',
      expect.objectContaining({ token: 'tok-3' }),
    );
  });

  it('SPI-06: registerSelfPairIngestion registers the updateUser hook + runs an initial sweep', async () => {
    const users = [makeUserDoc('user-9', VALID_PENDING)];
    stubGame(true, users);
    const reEmit = vi.fn();

    const { registerSelfPairIngestion } = await import('./self-pair-ingestion.js');
    registerSelfPairIngestion(reEmit);
    await Promise.resolve();
    await Promise.resolve();

    const onMock = (globalThis as unknown as { Hooks: { on: ReturnType<typeof vi.fn> } }).Hooks.on;
    expect(onMock).toHaveBeenCalledWith('updateUser', expect.any(Function));
    // The initial sweep ingested the queued request.
    expect(ingestBearer).toHaveBeenCalledWith(
      'user-9',
      expect.objectContaining({ token: 'client-token-abc' }),
    );
  });
});
