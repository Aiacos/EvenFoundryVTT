import {
  buildPairingUrl,
  CHARACTER_DELTA_TYPE,
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  DEFAULT_RELAY_URL,
  deriveCodePairing,
  EVENT_LOG_DELTA_TYPE,
  formatManualCode,
  generateDeviceKey,
  generateRoomId,
  importDeviceKey,
  LOG_DELTA_TYPE,
  R1_ACTION_ECONOMY_TYPE,
  R1_ACTION_RESULT_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
  R1_MULTIATTACK_PROGRESS_TYPE,
  R1_REACTION_AVAILABLE_TYPE,
  SCENE_VIEWPORT_DELTA_TYPE,
  seal,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore, DEFAULT_SETTINGS } from '../state/app-store.js';
import {
  type Decoded,
  FakeProjector,
  FakeRelay,
  MemoryStorage,
  makeActionResult,
  makeCharacter,
  makeCombat,
  makeCredentials,
  makeMap,
  settle,
} from './__fixtures__/direct-fixtures.js';
import { CREDENTIALS_STORAGE_KEY, CredentialStore } from './credentials.js';
import {
  ASSETS_MAX,
  backoffDelay,
  DIAGNOSTICS_MAX,
  DirectSession,
  hydrateMap,
  LOG_TAIL_MAX,
  mergeLog,
  SESSION_TIMING,
} from './session.js';
import { SETTINGS_STORAGE_KEY } from './settings.js';

function logEvent(id: string, timestamp: number) {
  return { id, timestamp, actorName: 'Mira', kind: 'chat' as const, description: id };
}

function setup(relayUrl?: string) {
  const store = createAppStore();
  const storage = new MemoryStorage();
  const credentials = new CredentialStore(storage, () => {});
  const relay = new FakeRelay();
  let n = 0;
  const session = new DirectSession({
    store,
    credentials,
    openRelay: relay.open,
    ...(relayUrl !== undefined ? { relayUrl } : {}),
    appVersion: '0.4.0',
    settingsStorage: storage,
    deviceLanguage: () => 'it-IT',
    random: () => 0,
    uuid: () => `rid-${++n}`,
  });
  const creds = makeCredentials();
  return {
    store,
    storage,
    credentials,
    relay,
    session,
    creds,
    gm: () => new FakeProjector(relay.last, creds.key),
  };
}

type Harness = ReturnType<typeof setup>;

const WELCOME = {
  t: 'welcome',
  actorId: 'actor1',
  actorName: 'Thorin',
  userName: 'Luca',
  gmName: 'Anna',
  worldTitle: 'Cripta',
};

/** Drives start → hello → welcome → snapshots → online. Returns the projector double. */
async function goOnline(h: Harness, welcomeExtra: object = {}): Promise<FakeProjector> {
  await h.session.start(h.creds);
  await settle();
  const gm = h.gm();
  const [hello] = await gm.drain();
  await gm.reply({ ...WELCOME, rid: hello?.rid, ...welcomeExtra });
  await settle();
  await gm.drain();
  await gm.reply({ t: 'snapshot', what: 'character', data: makeCharacter() });
  await gm.reply({ t: 'snapshot', what: 'map', data: makeMap() });
  await settle();
  return gm;
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    now: 1_000_000,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pure helpers', () => {
  it('backoffDelay doubles from 1 s, caps at 30 s, adds ≤20 % jitter', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((a) => backoffDelay(a, 0))).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ]);
    expect(backoffDelay(1, 1)).toBe(1_200);
    expect(backoffDelay(9, 1)).toBe(30_000);
  });

  it('mergeLog de-duplicates by id, orders by time and caps the tail', () => {
    const merged = mergeLog(
      { events: [logEvent('b', 2), logEvent('a', 1)] },
      { events: [logEvent('b', 2), logEvent('c', 3)] },
    );
    expect(merged.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    const many = {
      events: Array.from({ length: LOG_TAIL_MAX + 5 }, (_, i) => logEvent(`e${i}`, i)),
    };
    const capped = mergeLog(null, many);
    expect(capped.events).toHaveLength(LOG_TAIL_MAX);
    expect(capped.events[0]?.id).toBe('e5');
  });
});

describe('connect flow (relay, ADR-0019)', () => {
  it('shows unpaired without credentials', async () => {
    const h = setup();
    await h.session.start(null);
    expect(h.store.get().connection).toEqual({ status: 'unpaired' });
    expect(h.relay.links).toHaveLength(0);
  });

  it('walks relay → projector → paired → character → scene to online', async () => {
    const h = setup();
    await h.session.start(h.creds);
    await settle();
    expect(h.relay.last.relay).toBe(DEFAULT_RELAY_URL);
    expect(h.relay.last.room).toBe(h.creds.room);
    expect(h.store.get().connection).toMatchObject({
      status: 'connecting',
      server: 'evf-relay.evf-relay.workers.dev',
      steps: { relay: true, projector: false, paired: false },
    });
    const gm = h.gm();
    const [hello] = await gm.drain();
    expect(hello).toMatchObject({ t: 'hello', proto: 2, app: '0.4.0', locale: 'it' });
    h.relay.last.setPeer(true);
    expect(h.store.get().connection.steps?.projector).toBe(true);
    await settle();
    const [again] = await gm.drain();
    await gm.reply({ ...WELCOME, rid: again?.rid, locale: 'en', moduleVersion: '0.3.0' });
    await settle();
    expect(h.store.get().connection).toMatchObject({
      status: 'connecting',
      userName: 'Luca',
      actorName: 'Thorin',
      foundryLocale: 'en',
      steps: { paired: true },
    });
    expect(h.session.info().moduleVersion).toBe('0.3.0');
    expect((await gm.drain()).map((m) => m.what).sort()).toEqual([
      'character',
      'combat',
      'log',
      'map',
    ]);
    await gm.reply({ t: 'snapshot', what: 'character', data: makeCharacter() });
    await gm.reply({ t: 'snapshot', what: 'map', data: makeMap() });
    await settle();
    expect(h.store.get().connection.status).toBe('online');
    expect(h.store.get().character?.name).toBe('Thorin');
  });

  it('uses the build relay, and a pairing override before it', async () => {
    const h = setup('ws://10.0.0.2:8787');
    await h.session.start(h.creds);
    await settle();
    expect(h.relay.last.relay).toBe('ws://10.0.0.2:8787');
    await h.session.start(makeCredentials({ relay: 'wss://self.example' }));
    await settle();
    expect(h.relay.last.relay).toBe('wss://self.example');
  });

  it('persists fragment credentials before connecting', async () => {
    const h = setup();
    await h.session.start(h.creds);
    expect(JSON.parse(h.storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toMatchObject({
      room: h.creds.room,
    });
  });

  it('rotation: persists the new room + key and reconnects there (single-use QR)', async () => {
    const h = setup();
    await h.session.start(h.creds);
    await settle();
    const gm = h.gm();
    const [hello] = await gm.drain();
    const rotate = { room: generateRoomId(), key: generateDeviceKey() };
    await gm.reply({ ...WELCOME, rid: hello?.rid, rotate });
    await settle();
    expect(h.relay.links).toHaveLength(2);
    expect(h.relay.links[0]?.closed).toBe(true);
    expect(h.relay.last.room).toBe(rotate.room);
    expect(JSON.parse(h.storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toMatchObject(rotate);
    const next = new FakeProjector(h.relay.last, rotate.key);
    expect((await next.drain())[0]?.t).toBe('hello');
  });

  it('regression (real relay): peer-up racing the first hello — a welcome to either hello counts', async () => {
    const h = setup();
    await h.session.start(h.creds);
    h.relay.last.setPeer(true); // the relay's peer-up for a newcomer arrives right after open
    await settle();
    const gm = h.gm();
    const hellos = await gm.drain();
    expect(hellos.map((m) => m.t)).toEqual(['hello', 'hello']);
    // The projector answered the FIRST one (it rotates, then leaves the room).
    const rotate = { room: generateRoomId(), key: generateDeviceKey() };
    await gm.reply({ ...WELCOME, rid: hellos[0]?.rid, rotate });
    await settle();
    expect(h.relay.last.room).toBe(rotate.room);
  });

  it('keeps saying hello every welcomeTimeout while the projector is away (no lost hello)', async () => {
    const h = setup();
    await h.session.start(h.creds);
    await settle();
    const gm = h.gm();
    await gm.drain();
    vi.advanceTimersByTime(SESSION_TIMING.welcomeTimeout);
    await settle();
    vi.advanceTimersByTime(SESSION_TIMING.welcomeTimeout);
    await settle();
    expect((await gm.drain()).map((m) => m.t)).toEqual(['hello', 'hello']);
    expect(
      h.session.info().diagnostics.filter((d) => d.message.startsWith('no-projector')),
    ).toHaveLength(1);
  });

  it('ignores a welcome that does not answer our hello', async () => {
    const h = setup();
    await h.session.start(h.creds);
    await settle();
    await h.gm().reply({ ...WELCOME, rid: 'other' });
    await settle();
    expect(h.store.get().connection.status).toBe('connecting');
  });

  it('no projector: offline without retry, link kept; peer-up says hello again', async () => {
    const h = setup();
    await h.session.start(h.creds);
    await settle();
    vi.advanceTimersByTime(SESSION_TIMING.welcomeTimeout);
    expect(h.store.get().connection).toMatchObject({ status: 'offline', cause: 'no-projector' });
    expect(h.store.get().connection.retryInMs).toBeUndefined();
    expect(h.relay.last.closed).toBe(false);
    const gm = h.gm();
    await gm.drain();
    h.relay.last.setPeer(true);
    expect(h.store.get().connection).toMatchObject({
      status: 'connecting',
      steps: { relay: true, projector: true },
    });
    await settle();
    const [hello] = await gm.drain();
    expect(hello?.t).toBe('hello');
  });

  it('projector leaves while online: offline no-projector, data kept; returns: online again', async () => {
    const h = setup();
    const gm = await goOnline(h);
    h.relay.last.setPeer(false);
    expect(h.store.get().connection).toMatchObject({ status: 'offline', cause: 'no-projector' });
    expect(h.store.get().character?.name).toBe('Thorin');
    h.relay.last.setPeer(false);
    h.relay.last.setPeer(true);
    await settle();
    const [hello] = await gm.drain();
    await gm.reply({ ...WELCOME, rid: hello?.rid });
    await gm.reply({ t: 'snapshot', what: 'character', data: makeCharacter() });
    await gm.reply({ t: 'snapshot', what: 'map', data: makeMap() });
    await settle();
    expect(h.store.get().connection.status).toBe('online');
    h.relay.last.setPeer(true); // already welcomed: nothing
  });

  it('backs off exponentially when the relay is unreachable and counts down', async () => {
    const h = setup();
    h.relay.failing = new Error('relay did not answer');
    await h.session.start(h.creds);
    await settle();
    expect(h.store.get().connection).toMatchObject({
      status: 'offline',
      cause: 'network',
      attempt: 1,
      retryInMs: 1_000,
    });
    vi.advanceTimersByTime(1_000);
    await settle();
    expect(h.store.get().connection).toMatchObject({ attempt: 2, retryInMs: 2_000 });
    vi.advanceTimersByTime(SESSION_TIMING.countdownTick);
    expect(h.store.get().connection.retryInMs).toBe(1_000);
    h.relay.failing = null;
    vi.advanceTimersByTime(1_000);
    await settle();
    expect(h.store.get().connection.status).toBe('connecting');
  });

  it('non-Error failures are reported as network outages', async () => {
    const h = setup();
    h.relay.failing = 'boom' as unknown as Error;
    await h.session.start(h.creds);
    await settle();
    expect(h.session.info().diagnostics.at(-1)?.message).toBe('network: boom');
  });

  it('drops a link that opens after the flow was superseded', async () => {
    const h = setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const open = h.relay.open;
    (h.session as unknown as { deps: { openRelay: typeof open } }).deps.openRelay = async (
      relay,
      room,
    ) => {
      await gate;
      return open(relay, room);
    };
    const first = h.session.start(h.creds);
    await settle();
    h.session.disconnect();
    release();
    await first;
    await settle();
    expect(h.relay.last.closed).toBe(true);
  });
});

describe('online behaviour', () => {
  it('routes deltas to the store', async () => {
    const h = setup();
    const gm = await goOnline(h);
    await gm.reply({
      t: 'delta',
      seq: 0,
      topic: CHARACTER_DELTA_TYPE,
      data: makeCharacter({ hp: 7 }),
    });
    await gm.reply({ t: 'delta', seq: 1, topic: COMBAT_TURN_DELTA_TYPE, data: makeCombat(3) });
    await gm.reply({
      t: 'delta',
      seq: 2,
      topic: LOG_DELTA_TYPE,
      data: { events: [logEvent('x', 5)] },
    });
    await gm.reply({ t: 'delta', seq: 3, topic: R1_ACTION_RESULT_TYPE, data: makeActionResult() });
    await gm.reply({
      t: 'delta',
      seq: 4,
      topic: R1_REACTION_AVAILABLE_TYPE,
      data: { kind: 'shield', sourceName: 'Goblin', expiresAt: 5 },
    });
    await settle();
    const s = h.store.get();
    expect(s.character?.hp).toBe(7);
    expect(s.combat?.round).toBe(3);
    expect(s.log?.events.map((e) => e.id)).toEqual(['x']);
    expect(s.lastResult?.outcome).toBe('hit');
    expect(s.reaction?.sourceName).toBe('Goblin');
  });

  it('stores action economy + movement, ignores multi-attack progress, clears them when combat ends', async () => {
    const h = setup();
    const gm = await goOnline(h);
    const economy = {
      actorId: 'thorin',
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: 'p1',
    };
    const movement = { actorId: 'thorin', walkSpeed: 30, usedThisTurn: 10, remainingFeet: 20 };
    await gm.reply({ t: 'delta', seq: 0, topic: COMBAT_TURN_DELTA_TYPE, data: makeCombat(1) });
    await gm.reply({ t: 'delta', seq: 1, topic: R1_ACTION_ECONOMY_TYPE, data: economy });
    await gm.reply({ t: 'delta', seq: 2, topic: R1_MOVEMENT_BUDGET_TYPE, data: movement });
    await gm.reply({
      t: 'delta',
      seq: 3,
      topic: R1_MULTIATTACK_PROGRESS_TYPE,
      data: { attackId: crypto.randomUUID(), current: 1, total: 2, chatCardId: null, actorId: 't' },
    });
    await gm.reply({ t: 'delta', seq: 4, topic: R1_ACTION_ECONOMY_TYPE, data: { bad: 1 } });
    await settle();
    expect(h.store.get().actionEconomy).toEqual(economy);
    expect(h.store.get().movement).toEqual(movement);
    const messages = h.session.info().diagnostics.map((d) => d.message);
    expect(messages).toContain(`invalid ${R1_ACTION_ECONOMY_TYPE} delta`);
    expect(messages.some((m) => m.includes(R1_MULTIATTACK_PROGRESS_TYPE))).toBe(false);

    await gm.reply({ t: 'delta', seq: 5, topic: COMBAT_STATE_DELTA_TYPE, data: null });
    await settle();
    expect(h.store.get()).toMatchObject({ combat: null, actionEconomy: null, movement: null });

    await gm.reply({ t: 'delta', seq: 6, topic: R1_MOVEMENT_BUDGET_TYPE, data: movement });
    await gm.reply({ t: 'snapshot', what: 'combat', data: null });
    await settle();
    expect(h.store.get().movement).toBeNull();
  });

  it('turns invalidating deltas into debounced snapshot requests', async () => {
    const h = setup();
    const gm = await goOnline(h);
    await gm.reply({ t: 'delta', seq: 0, topic: SCENE_VIEWPORT_DELTA_TYPE, data: {} });
    await gm.reply({ t: 'delta', seq: 1, topic: SCENE_VIEWPORT_DELTA_TYPE, data: {} });
    await gm.reply({ t: 'delta', seq: 2, topic: EVENT_LOG_DELTA_TYPE, data: {} });
    await settle();
    expect(await gm.drain()).toEqual([]);
    vi.advanceTimersByTime(SESSION_TIMING.refreshDebounce);
    await settle();
    // Concurrent seals → arrival order is not deterministic; assert the set.
    expect((await gm.drain()).map((m) => m.what).sort()).toEqual(['log', 'map']);
  });

  it('resyncs every topic on a sequence gap and records invalid/unknown deltas', async () => {
    const h = setup();
    const gm = await goOnline(h);
    await gm.reply({ t: 'delta', seq: 0, topic: 'mystery.topic', data: {} });
    await gm.reply({ t: 'delta', seq: 5, topic: CHARACTER_DELTA_TYPE, data: { bad: true } });
    await settle();
    vi.advanceTimersByTime(SESSION_TIMING.refreshDebounce);
    await settle();
    // The four `get`s are sealed concurrently (WebCrypto): emission order is not defined.
    expect((await gm.drain()).map((m) => m.what).sort()).toEqual([
      'character',
      'combat',
      'log',
      'map',
    ]);
    const messages = h.session.info().diagnostics.map((d) => d.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'unhandled delta topic mystery.topic',
        'delta gap 0→5: resync',
        `invalid ${CHARACTER_DELTA_TYPE} delta`,
      ]),
    );
    expect(h.store.get().character?.hp).toBe(45);
  });

  it('records invalid snapshots without touching the store', async () => {
    const h = setup();
    const gm = await goOnline(h);
    await gm.reply({ t: 'snapshot', what: 'map', data: { nope: 1 } });
    await settle();
    expect(h.store.get().map?.name).toBe('Cripta');
    expect(h.session.info().diagnostics.at(-1)?.message).toBe('invalid map snapshot');
  });

  it('invokes tools with rid correlation and resolves results', async () => {
    const h = setup();
    const gm = await goOnline(h);
    const ok = h.session.invoke('weapon-attack', { itemId: 'axe' });
    const ko = h.session.invoke('cast-spell', {});
    await settle();
    const [a, b] = (await gm.drain()) as [Decoded, Decoded];
    expect(a).toMatchObject({ t: 'invoke', tool: 'weapon-attack', input: { itemId: 'axe' } });
    await gm.reply({ t: 'result', rid: a.rid, ok: true, data: { hit: true } });
    await gm.reply({
      t: 'result',
      rid: b.rid,
      ok: false,
      error: { code: 'E_SLOT', message: 'no slot' },
    });
    await gm.reply({ t: 'result', rid: 'unknown', ok: true, data: null });
    await settle();
    await expect(ok).resolves.toEqual({ ok: true, data: { hit: true } });
    await expect(ko).resolves.toEqual({ ok: false, error: { code: 'E_SLOT', message: 'no slot' } });
  });

  it('times out invokes after 10 s', async () => {
    const h = setup();
    await goOnline(h);
    const pending = h.session.invoke('weapon-attack', {});
    vi.advanceTimersByTime(SESSION_TIMING.invokeTimeout);
    await expect(pending).resolves.toEqual({
      ok: false,
      error: { code: 'timeout', message: 'weapon-attack timed out' },
    });
  });

  it('refuses invokes while offline and fails pending ones on close', async () => {
    const h = setup();
    await expect(h.session.invoke('x', {})).resolves.toMatchObject({ error: { code: 'offline' } });
    await goOnline(h);
    const pending = h.session.invoke('x', {});
    h.session.disconnect();
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'offline' } });
    h.session.refresh('map');
  });

  it('measures latency on pong and goes offline after 2 missed pongs', async () => {
    const h = setup();
    const gm = await goOnline(h);
    vi.advanceTimersByTime(SESSION_TIMING.heartbeatInterval);
    await settle();
    const [ping] = await gm.drain();
    expect(ping?.t).toBe('ping');
    vi.advanceTimersByTime(84);
    await gm.reply({ t: 'pong', rid: ping?.rid });
    await settle();
    expect(h.session.info().latencyMs).toBe(84);
    vi.advanceTimersByTime(SESSION_TIMING.heartbeatInterval * 2);
    expect(h.store.get().connection.status).toBe('online');
    vi.advanceTimersByTime(SESSION_TIMING.heartbeatInterval);
    expect(h.store.get().connection).toMatchObject({
      status: 'offline',
      cause: 'network',
      attempt: 1,
    });
  });

  it('goes offline when the relay link drops', async () => {
    const h = setup();
    await goOnline(h);
    h.relay.last.drop(1006);
    expect(h.store.get().connection).toMatchObject({
      status: 'offline',
      cause: 'network',
      actorName: 'Thorin',
    });
    expect(h.store.get().character?.name).toBe('Thorin');
  });

  it('handles revoked: clears credentials and data', async () => {
    const h = setup();
    const gm = await goOnline(h);
    await gm.reply({ t: 'revoked' });
    await settle();
    expect(h.store.get().connection).toEqual({ status: 'revoked' });
    expect(h.store.get().character).toBeNull();
    expect(h.storage.data.has(CREDENTIALS_STORAGE_KEY)).toBe(false);
  });

  it('records unexpected frames, undecryptable or malformed envelopes', async () => {
    const h = setup();
    const gm = await goOnline(h);
    h.relay.last.deliver({ hello: 'world' });
    await gm.reply({ t: 'pong', rid: 'x' }, h.creds.key, 'someone-else');
    await gm.reply({ t: 'pong', rid: 'x' }, generateDeviceKey());
    await gm.reply({ t: 'bogus' });
    // Reflected back (glasses → glasses): dropped, never processed.
    const key = await importDeviceKey(h.creds.key);
    h.relay.last.deliver(await seal(key, 'projector', 'projector', { t: 'revoked' }));
    await settle();
    expect(h.session.info().diagnostics.map((d) => d.message)).toEqual([
      'unexpected relay frame dropped',
      'unexpected relay frame dropped',
      'envelope rejected (auth)',
      'invalid projector message',
      'unexpected relay frame dropped',
    ]);
    expect(h.store.get().connection.status).toBe('online');
  });

  it('hydrates map pictures from asset messages (unknown refs dropped)', async () => {
    const h = setup();
    const gm = await goOnline(h);
    const data = 'data:image/jpeg;base64,AAAA';
    await gm.reply({ t: 'asset', id: 'bg', data });
    await gm.reply({ t: 'asset', id: 'bg', data });
    await gm.reply({
      t: 'snapshot',
      what: 'map',
      data: {
        ...makeMap(),
        background: { src: 'evf-asset:bg', x: 0, y: 0, w: 1000, h: 1000 },
        tiles: [{ src: 'evf-asset:missing', x: 0, y: 0, w: 10, h: 10, z: 0 }],
        tokens: [
          { id: 't', name: 'T', kind: 'self', x: 1, y: 1, w: 1, h: 1, img: 'evf-asset:bg' },
          { id: 'u', name: 'U', kind: 'enemy', x: 2, y: 2, w: 1, h: 1, img: 'evf-asset:gone' },
        ],
      },
    });
    await settle();
    const map = h.store.get().map;
    expect(map?.background?.src).toBe(data);
    expect(map?.tiles).toBeUndefined();
    expect(map?.tokens[0]?.img).toBe(data);
    expect(map?.tokens[1]?.img).toBeUndefined();
  });

  it('keeps at most ASSETS_MAX pictures', () => {
    const assets = new Map<string, string>();
    const map = hydrateMap(
      { ...makeMap(), background: { src: 'plain.png', x: 0, y: 0, w: 1, h: 1 } },
      assets,
    );
    expect(map.background).toBeUndefined();
    expect(ASSETS_MAX).toBeGreaterThan(64);
  });

  it('keeps at most DIAGNOSTICS_MAX entries and notifies listeners', async () => {
    const h = setup();
    const gm = await goOnline(h);
    const listener = vi.fn();
    const off = h.session.subscribeInfo(listener);
    for (let i = 0; i < DIAGNOSTICS_MAX + 3; i++) {
      await gm.reply({ t: 'delta', seq: i, topic: 'x', data: {} });
    }
    await settle();
    expect(h.session.info().diagnostics).toHaveLength(DIAGNOSTICS_MAX);
    expect(listener).toHaveBeenCalled();
    off();
  });

  it('goes online after the snapshot timeout even without a map snapshot', async () => {
    const h = setup();
    await h.session.start(h.creds);
    await settle();
    const gm = h.gm();
    h.relay.last.setPeer(true);
    await settle();
    const hellos = await gm.drain();
    await gm.reply({
      t: 'welcome',
      rid: hellos.at(-1)?.rid,
      actorId: 'a',
      actorName: 'T',
      userName: 'U',
      gmName: 'G',
      worldTitle: 'W',
    });
    await settle();
    expect(h.store.get().connection.status).toBe('connecting');
    vi.advanceTimersByTime(SESSION_TIMING.snapshotTimeout);
    expect(h.store.get().connection.status).toBe('online');
  });
});

describe('lifecycle and user actions', () => {
  it('closes on FOREGROUND_EXIT and reconnects on FOREGROUND_ENTER', async () => {
    const h = setup();
    await goOnline(h);
    const link = h.relay.last;
    h.session.onForeground(false);
    expect(link.closed).toBe(true);
    expect(h.store.get().connection).toMatchObject({ status: 'offline', cause: 'background' });
    vi.advanceTimersByTime(60_000);
    expect(h.relay.links).toHaveLength(1);
    h.session.onForeground(true);
    await settle();
    expect(h.relay.links).toHaveLength(2);
  });

  it('ignores foreground events when unpaired or already online', async () => {
    const h = setup();
    await h.session.start(null);
    h.session.onForeground(false);
    h.session.onForeground(true);
    expect(h.store.get().connection.status).toBe('unpaired');
    await goOnline(h);
    h.session.onForeground(true);
    await settle();
    expect(h.relay.links).toHaveLength(1);
  });

  it('disconnect pauses without retry; reconnect resumes; forget unpairs', async () => {
    const h = setup();
    await goOnline(h);
    h.session.disconnect();
    expect(h.store.get().connection.status).toBe('offline');
    expect(h.store.get().connection.retryInMs).toBeUndefined();
    vi.advanceTimersByTime(60_000);
    expect(h.relay.links).toHaveLength(1);
    h.session.reconnect();
    await settle();
    expect(h.relay.links).toHaveLength(2);
    await h.session.forget();
    expect(h.store.get().connection).toEqual({ status: 'unpaired' });
    h.session.disconnect();
    expect(h.store.get().connection.status).toBe('unpaired');
  });

  it('pairs with the 16-char code: room and key by HKDF', async () => {
    const h = setup();
    await h.session.start(null);
    await h.session.pairCode('7qk3 mx9p 2hra c4te');
    const expected = await deriveCodePairing('7QK3-MX9P-2HRA-C4TE');
    expect(JSON.parse(h.storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual(expected);
    expect(h.relay.last.room).toBe(expected.room);
    await expect(h.session.pairCode('bad')).rejects.toThrow('invalid manual code');
    expect(formatManualCode('7QK37QK3')).toBe('7QK3-7QK3');
  });

  it('pairs with a scanned QR text; rejects anything else', async () => {
    const h = setup();
    await h.session.start(null);
    const code = '7QK3MX9P2HRAC4TE';
    await h.session.pairScanned(
      buildPairingUrl('https://aiacos.github.io/EvenFoundryVTT/app/', {
        code,
        relay: 'ws://10.0.0.2:8787',
      }),
    );
    const { room } = await deriveCodePairing(code);
    expect(h.relay.last).toMatchObject({ room, relay: 'ws://10.0.0.2:8787' });
    await expect(h.session.pairScanned('https://example.com')).rejects.toThrow('not a pairing QR');
  });

  it('persists settings and resolves the locale', () => {
    const h = setup();
    expect(h.store.get().settings).toEqual(DEFAULT_SETTINGS);
    expect(h.session.locale()).toBe('it');
    h.session.updateSettings({ locale: 'en', mapCellPx: 12 });
    expect(h.store.get().settings).toMatchObject({ locale: 'en', mapCellPx: 12 });
    expect(JSON.parse(h.storage.data.get(SETTINGS_STORAGE_KEY) ?? '')).toMatchObject({
      locale: 'en',
    });
    expect(h.session.locale()).toBe('en');
    h.session.dispose();
  });

  it('a frame sent on a closed link is recorded, not thrown', async () => {
    const h = setup();
    await goOnline(h);
    h.relay.last.open = false;
    h.session.refresh('map');
    await settle();
    expect(h.session.info().diagnostics.at(-1)?.message).toBe('get dropped: relay link closed');
  });
});
