/**
 * Tests for pushInitialCharacterDelta — selectedActorId support (FLV-CHAR-SELECT Task 2).
 *
 * IS-SEL-01: selectedActorId set + in roster → foundryFn called with selectedActorId (not roster[0])
 * IS-SEL-02: selectedActorId undefined → falls back to roster[0].actorId (existing behavior)
 * IS-SEL-03: selectedActorId set but NOT in roster → still fetches that id via foundryFn
 * IS-SEL-04: selectedActorId set, foundryFn returns null → graceful no-op (IS-05 path)
 *
 * @see packages/bridge/src/ws/initial-snapshot.ts
 */
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CharacterListCache } from '../cache/character-list-cache.js';
import type { FoundrySnapshotFn } from '../routes/character.js';
import { DeltaEmitter } from './delta-emitter.js';
import { pushInitialCharacterDelta } from './initial-snapshot.js';
import { ReplayBuffer } from './replay-buffer.js';
import { SessionStore } from './session-store.js';

const SILENT_LOGGER = pino({ level: 'silent' });

const MOCK_SNAPSHOT_BASE = {
  actorId: 'actor-X',
  name: 'CharX',
  hp: 30,
  maxHp: 40,
  tempHp: 0,
  ac: 14,
  level: 3,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: { slots: [], spells: [] },
  abilities: {
    str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
  },
  skills: {
    acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ani: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    arc: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    ath: { total: 0, ability: 'str' as const, proficient: 0 as const, passive: 10 },
    dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    his: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    ins: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    inv: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    med: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    nat: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    prc: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    rel: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    sur: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
  },
} as const;

function makeMockWs() {
  return {
    send: vi.fn((_data: string) => {}),
    readyState: 1,
  };
}

function setupSession(selectedActorId?: string) {
  const replayBuffer = new ReplayBuffer();
  const sessionStore = new SessionStore();
  const emitter = new DeltaEmitter(replayBuffer, sessionStore);
  const token = 'test-bearer-token';
  const session = sessionStore.createSession(token, 'it', ['read_char'], selectedActorId);
  const ws = makeMockWs();
  // biome-ignore lint/suspicious/noExplicitAny: mock ws
  emitter.registerSession(session.sessionId, ws as any);
  return { emitter, sessionId: session.sessionId, token, ws };
}

function makeRoster(primaryActorId = 'actor-roster-0', secondaryActorId = 'actor-roster-1') {
  const cache = new CharacterListCache();
  cache.set({
    characters: [
      { actorId: primaryActorId, name: 'Primary', level: 1 },
      { actorId: secondaryActorId, name: 'Secondary', level: 1 },
    ],
    source: 'foundry-world',
    count: 2,
    generatedAt: Date.now(),
  });
  return cache;
}

describe('pushInitialCharacterDelta — selectedActorId targeting (FLV-CHAR-SELECT)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('IS-SEL-01: selectedActorId set → foundryFn called with selectedActorId, not roster[0]', async () => {
    const { emitter, sessionId, token, ws } = setupSession('actor-X');
    const roster = makeRoster('actor-roster-0', 'actor-roster-1');
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => ({
      ...MOCK_SNAPSHOT_BASE,
      actorId: 'actor-X',
    }));

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache: roster,
      foundryFn,
      logger: SILENT_LOGGER,
      selectedActorId: 'actor-X',
    });

    expect(foundryFn).toHaveBeenCalledOnce();
    // Must call with selectedActorId, NOT roster[0]
    expect(foundryFn).toHaveBeenCalledWith('evf.getCharacterSnapshot', 'actor-X', token);
    expect(ws.send).toHaveBeenCalledOnce();
  });

  it('IS-SEL-02: selectedActorId undefined → falls back to roster[0].actorId (legacy behavior)', async () => {
    const { emitter, sessionId, token, ws } = setupSession(undefined);
    const roster = makeRoster('actor-roster-0');
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => ({
      ...MOCK_SNAPSHOT_BASE,
      actorId: 'actor-roster-0',
    }));

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache: roster,
      foundryFn,
      logger: SILENT_LOGGER,
      // selectedActorId omitted → undefined → legacy roster[0]
    });

    expect(foundryFn).toHaveBeenCalledWith('evf.getCharacterSnapshot', 'actor-roster-0', token);
    expect(ws.send).toHaveBeenCalledOnce();
  });

  it('IS-SEL-03: selectedActorId set but NOT in roster → still fetches the pinned id', async () => {
    const { emitter, sessionId, token } = setupSession('actor-pinned-not-in-roster');
    const roster = makeRoster('actor-roster-0');
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => ({
      ...MOCK_SNAPSHOT_BASE,
      actorId: 'actor-pinned-not-in-roster',
    }));

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache: roster,
      foundryFn,
      logger: SILENT_LOGGER,
      selectedActorId: 'actor-pinned-not-in-roster',
    });

    // The fetch MUST still happen with the pinned id
    expect(foundryFn).toHaveBeenCalledWith(
      'evf.getCharacterSnapshot',
      'actor-pinned-not-in-roster',
      token,
    );
  });

  it('IS-SEL-04: selectedActorId set, foundryFn returns null → graceful no-op (IS-05 path)', async () => {
    const { emitter, sessionId, token, ws } = setupSession('actor-X');
    const roster = makeRoster('actor-roster-0');
    const foundryFn = vi.fn<FoundrySnapshotFn>(async () => null);

    await pushInitialCharacterDelta({
      sessionId,
      token,
      deltaEmitter: emitter,
      characterListCache: roster,
      foundryFn,
      logger: SILENT_LOGGER,
      selectedActorId: 'actor-X',
    });

    expect(ws.send).not.toHaveBeenCalled();
  });
});
