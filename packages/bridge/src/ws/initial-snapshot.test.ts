/**
 * Tests for pushInitialCharacterDelta (initial-snapshot.ts).
 *
 * IS-01: populated roster + valid snapshot → one 'character.delta' send with validated payload
 * IS-02: foundryFn called with roster[0].actorId + session token
 * IS-03: COLD roster (cache.get() === null) → no foundryFn call, no send
 * IS-04: EMPTY roster (characters.length === 0) → no foundryFn call, no send
 * IS-05: foundryFn returns null → no send
 * IS-06: foundryFn returns object failing CharacterSnapshotSchema → no send
 * IS-07: foundryFn throws → caught, no send, no rethrow
 *
 * @see packages/bridge/src/ws/initial-snapshot.ts
 */
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterListCache } from '../cache/character-list-cache.js';
import type { FoundrySnapshotFn } from '../routes/character.js';
import { DeltaEmitter } from './delta-emitter.js';
import { pushInitialCharacterDelta } from './initial-snapshot.js';
import { ReplayBuffer } from './replay-buffer.js';
import { SessionStore } from './session-store.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SILENT_LOGGER = pino({ level: 'silent' });

/** Full mock CharacterSnapshot — byte-identical to character.test.ts CHR-ROUTE-05. */
const MOCK_SNAPSHOT = {
  actorId: 'actor-thorin',
  name: 'Thorin',
  hp: 45,
  maxHp: 68,
  tempHp: 0,
  ac: 16,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: { slots: [], spells: [] },
  abilities: {
    str: { value: 16, mod: 3, save: 3, proficient: false, dc: 10 },
    dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    con: { value: 14, mod: 2, save: 2, proficient: false, dc: 10 },
    int: { value: 8, mod: -1, save: -1, proficient: false, dc: 10 },
    wis: { value: 12, mod: 1, save: 1, proficient: false, dc: 10 },
    cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
  },
  skills: {
    acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ani: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    arc: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    ath: { total: 3, ability: 'str' as const, proficient: 0 as const, passive: 13 },
    dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    his: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    ins: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    inv: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    med: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    nat: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    prc: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    rel: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    sur: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
  },
  class: 'Fighter',
  initiative: 2,
  speed: 25,
} as const;

function makeMockWs(shouldThrow = false) {
  return {
    send: vi.fn((_data: string) => {
      if (shouldThrow) throw new Error('connection closed');
    }),
    readyState: 1,
  };
}

interface SetupResult {
  emitter: DeltaEmitter;
  sessionId: string;
  token: string;
  ws: ReturnType<typeof makeMockWs>;
  replayBuffer: ReplayBuffer;
  sessionStore: SessionStore;
}

function setupSession(): SetupResult {
  const replayBuffer = new ReplayBuffer();
  const sessionStore = new SessionStore();
  const emitter = new DeltaEmitter(replayBuffer, sessionStore);
  const token = 'test-bearer-token';
  const session = sessionStore.createSession(token, 'it', ['read_char']);
  const ws = makeMockWs();
  // biome-ignore lint/suspicious/noExplicitAny: mock type
  emitter.registerSession(session.sessionId, ws as any);
  return { emitter, sessionId: session.sessionId, token, ws, replayBuffer, sessionStore };
}

function makePopulatedCache(actorId = 'actor-thorin'): CharacterListCache {
  const cache = new CharacterListCache();
  cache.set({
    characters: [{ actorId, name: 'Thorin', level: 5 }],
    source: 'foundry-world',
    count: 1,
    generatedAt: Date.now(),
  });
  return cache;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('pushInitialCharacterDelta', () => {
  let emitter: DeltaEmitter;
  let sessionId: string;
  let token: string;
  let ws: ReturnType<typeof makeMockWs>;

  beforeEach(() => {
    const s = setupSession();
    emitter = s.emitter;
    sessionId = s.sessionId;
    token = s.token;
    ws = s.ws;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('IS-01: populated roster + valid snapshot → sends exactly one character.delta with validated payload', async () => {
    const characterListCache = makePopulatedCache('actor-thorin');
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => MOCK_SNAPSHOT);

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache,
      foundryFn,
      logger: SILENT_LOGGER,
    });

    expect(ws.send).toHaveBeenCalledOnce();
    const envelope = JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}') as {
      type: string;
      payload: { actorId: string };
    };
    expect(envelope.type).toBe('character.delta');
    expect(envelope.payload.actorId).toBe('actor-thorin');
  });

  it('IS-02: foundryFn called with roster[0].actorId and the session token', async () => {
    const characterListCache = makePopulatedCache('actor-gandalf');
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => ({
      ...MOCK_SNAPSHOT,
      actorId: 'actor-gandalf',
    }));

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache,
      foundryFn,
      logger: SILENT_LOGGER,
    });

    expect(foundryFn).toHaveBeenCalledOnce();
    expect(foundryFn).toHaveBeenCalledWith('evf.getCharacterSnapshot', 'actor-gandalf', token);
  });

  it('IS-03: COLD roster (cache.get() === null) → no foundryFn call, no send', async () => {
    const characterListCache = new CharacterListCache(); // cold — never set()
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => MOCK_SNAPSHOT);

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache,
      foundryFn,
      logger: SILENT_LOGGER,
    });

    expect(foundryFn).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('IS-04: EMPTY roster (characters.length === 0) → no foundryFn call, no send', async () => {
    const characterListCache = new CharacterListCache();
    characterListCache.set({
      characters: [],
      source: 'foundry-world',
      count: 0,
      generatedAt: Date.now(),
    });
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => MOCK_SNAPSHOT);

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache,
      foundryFn,
      logger: SILENT_LOGGER,
    });

    expect(foundryFn).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('IS-05: foundryFn returns null → no send', async () => {
    const characterListCache = makePopulatedCache();
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => null);

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache,
      foundryFn,
      logger: SILENT_LOGGER,
    });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('IS-06: foundryFn returns schema-mismatch object → no send (schema-drift guard)', async () => {
    const characterListCache = makePopulatedCache();
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => ({ invalidField: 'only-this' }));

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache,
      foundryFn,
      logger: SILENT_LOGGER,
    });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('IS-07: foundryFn throws → caught, no send, no rethrow', async () => {
    const characterListCache = makePopulatedCache();
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => {
      throw new Error('foundry_unavailable');
    });

    await expect(
      pushInitialCharacterDelta({
        sessionId,
        token,
        deltaEmitter: emitter,
        characterListCache,
        foundryFn,
        logger: SILENT_LOGGER,
      }),
    ).resolves.toBeUndefined();

    expect(ws.send).not.toHaveBeenCalled();
  });
});
