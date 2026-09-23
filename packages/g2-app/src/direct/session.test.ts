import {
  CHARACTER_DELTA_TYPE,
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  DIRECT_SOCKET_EVENT,
  EVENT_LOG_DELTA_TYPE,
  generateDeviceKey,
  importDeviceKey,
  LOG_DELTA_TYPE,
  PROJECTOR_ADDRESS,
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
  FakeGm,
  FakeSocket,
  MemoryStorage,
  makeActionResult,
  makeCharacter,
  makeCombat,
  makeCredentials,
  makeMap,
  settle,
  USER_ID,
} from './__fixtures__/direct-fixtures.js';
import { CREDENTIALS_STORAGE_KEY, CredentialStore } from './credentials.js';
import { FoundryClientError } from './foundry-client.js';
import {
  backoffDelay,
  DIAGNOSTICS_MAX,
  DirectSession,
  LOG_TAIL_MAX,
  mergeLog,
  SESSION_TIMING,
} from './session.js';
import { SETTINGS_STORAGE_KEY } from './settings.js';

function logEvent(id: string, timestamp: number) {
  return { id, timestamp, actorName: 'Mira', kind: 'chat' as const, description: id };
}

function setup() {
  const store = createAppStore();
  const storage = new MemoryStorage();
  const credentials = new CredentialStore(storage, () => {});
  let socket = new FakeSocket();
  const client = {
    probeStatus: vi.fn(async () => ({ active: true, version: '14.360', generation: 14 })),
    fetchJoinPage: vi.fn(async () => '<html></html>'),
    login: vi.fn(async (_u: string, _p: string) => {}),
    openSocket: vi.fn(async () => {
      socket = new FakeSocket();
      return socket;
    }),
    listG2Users: vi.fn(async () => [{ id: 'u', name: 'Luca (G2)' }]),
  };
  let n = 0;
  const session = new DirectSession({
    store,
    credentials,
    base: 'https://foundry.example/vtt',
    createClient: () => client,
    appVersion: '0.2.0',
    settingsStorage: storage,
    deviceLanguage: () => 'it-IT',
    random: () => 0,
    uuid: () => `rid-${++n}`,
  });
  const creds = makeCredentials();
  const h = {
    store,
    storage,
    credentials,
    client,
    session,
    creds,
    socket: () => socket,
    gm: () => new FakeGm(socket, creds.key),
  };
  return h;
}

type Harness = ReturnType<typeof setup>;

/** Drives start → hello → welcome → snapshots → online. Returns the GM double. */
async function goOnline(h: Harness, welcomeExtra: object = {}): Promise<FakeGm> {
  await h.session.start(h.creds);
  await settle();
  const gm = h.gm();
  const [hello] = await gm.drain();
  await gm.reply({
    t: 'welcome',
    rid: hello?.rid,
    actorId: 'actor1',
    actorName: 'Thorin',
    userName: 'Luca (G2)',
    gmName: 'Anna',
    worldTitle: 'Cripta',
    ...welcomeExtra,
  });
  await settle();
  if ('rotate' in welcomeExtra)
    gm.keyB64 = (welcomeExtra as { rotate: { key: string } }).rotate.key;
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

describe('connect flow', () => {
  it('shows unpaired without credentials', async () => {
    const h = setup();
    await h.session.start(null);
    expect(h.store.get().connection).toEqual({ status: 'unpaired' });
    expect(h.client.fetchJoinPage).not.toHaveBeenCalled();
  });

  it('walks M10 steps to online and fills identity + snapshots', async () => {
    const h = setup();
    const statuses: string[] = [];
    h.store.subscribe((s) =>
      statuses.push(`${s.connection.status}:${JSON.stringify(s.connection.steps ?? {})}`),
    );
    await h.session.start(h.creds);
    await settle();
    expect(h.client.login).toHaveBeenCalledWith(USER_ID, h.creds.password);
    const gm = h.gm();
    const [hello] = await gm.drain();
    expect(hello).toMatchObject({ t: 'hello', proto: 1, app: '0.2.0', locale: 'it' });
    expect(h.store.get().connection).toMatchObject({
      status: 'connecting',
      server: 'foundry.example',
      steps: { server: true, login: true, gm: false, character: false, scene: false },
    });
    await gm.reply({
      t: 'welcome',
      rid: hello?.rid,
      actorId: 'actor1',
      actorName: 'Thorin',
      userName: 'Luca (G2)',
      gmName: 'Anna',
      worldTitle: 'Cripta',
    });
    await settle();
    const gets = await gm.drain();
    expect(gets.map((m) => m.what)).toEqual(['character', 'combat', 'map', 'log']);
    expect(h.store.get().connection.steps?.gm).toBe(true);
    await gm.reply({ t: 'snapshot', what: 'character', data: makeCharacter() });
    await gm.reply({ t: 'snapshot', what: 'combat', data: null });
    await gm.reply({ t: 'snapshot', what: 'map', data: makeMap() });
    await settle();
    const s = h.store.get();
    expect(s.connection).toEqual({
      status: 'online',
      server: 'foundry.example',
      userName: 'Luca (G2)',
      gmName: 'Anna',
      actorName: 'Thorin',
      worldTitle: 'Cripta',
      lastSyncAt: 1_000_000,
    });
    expect(s.character?.name).toBe('Thorin');
    expect(s.map?.name).toBe('Cripta');
    expect(s.combat).toBeNull();
    expect(statuses.some((x) => x.startsWith('connecting'))).toBe(true);
    expect(h.session.info().foundryVersion).toBe('14.360');
  });

  it('persists fragment credentials before connecting', async () => {
    const h = setup();
    await goOnline(h);
    expect(JSON.parse(h.storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual(h.creds);
  });

  it('applies welcome.rotate atomically and switches to the new key', async () => {
    const h = setup();
    const rotate = { password: 'rotated-password-1', key: generateDeviceKey() };
    const gm = await goOnline(h, { rotate });
    expect(JSON.parse(h.storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual({
      ...h.creds,
      ...rotate,
    });
    expect(h.store.get().connection.status).toBe('online');
    h.session.refresh('log');
    await settle();
    expect((await gm.drain()).map((m) => m.t)).toEqual(['get']);
  });

  it('addresses the elected projector and applies a key-only rotation (ADR-0013)', async () => {
    const h = setup();
    await h.session.start(h.creds);
    await settle();
    const [raw] = h.socket().emitted.filter((e) => e.event === DIRECT_SOCKET_EVENT);
    expect((raw?.args[0] as { to: string; from: string }).to).toBe(PROJECTOR_ADDRESS);
    expect((raw?.args[0] as { to: string; from: string }).from).toBe(USER_ID);
    h.session.dispose();

    const h2 = setup();
    const rotate = { key: generateDeviceKey() };
    await goOnline(h2, { rotate });
    expect(JSON.parse(h2.storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual({
      ...h2.creds,
      key: rotate.key,
    });
    expect(h2.store.get().connection.status).toBe('online');
  });

  it('survives a projector switch: replies from another sender with the device key are accepted', async () => {
    const h = setup();
    const gm = await goOnline(h);
    // The player's browser went offline: a GM client answers now, with a sender id of
    // its own — authenticity comes from the key, the sender is informational.
    await gm.reply(
      { t: 'delta', seq: 1, topic: COMBAT_STATE_DELTA_TYPE, data: makeCombat() },
      gm.keyB64,
      USER_ID,
      'gm-browser',
    );
    await settle();
    expect(h.store.get().combat).toEqual(makeCombat());
    // A forged envelope (wrong key) is still rejected, whatever it claims to be.
    await gm.reply(
      { t: 'delta', seq: 2, topic: COMBAT_STATE_DELTA_TYPE, data: null },
      generateDeviceKey(),
    );
    await settle();
    expect(h.store.get().combat).toEqual(makeCombat());
    expect(h.session.info().diagnostics.at(-1)?.message).toContain('envelope rejected');
  });

  it('ignores a welcome that does not answer our hello', async () => {
    const h = setup();
    await h.session.start(h.creds);
    await settle();
    const gm = h.gm();
    await gm.drain();
    await gm.reply({
      t: 'welcome',
      rid: 'other',
      actorId: 'a',
      actorName: '',
      userName: '',
      gmName: '',
      worldTitle: '',
    });
    await settle();
    expect(h.store.get().connection.steps?.gm).toBe(false);
  });

  it('goes offline with cause no-gm when welcome does not arrive in 8 s, then retries', async () => {
    const h = setup();
    await h.session.start(h.creds);
    await settle();
    vi.advanceTimersByTime(SESSION_TIMING.welcomeTimeout);
    expect(h.store.get().connection).toMatchObject({
      status: 'offline',
      cause: 'no-gm',
      attempt: 1,
      retryInMs: 1_000,
      server: 'foundry.example',
    });
    expect(h.socket().disconnected).toBe(true);
    vi.advanceTimersByTime(1_000);
    await settle();
    expect(h.client.openSocket).toHaveBeenCalledTimes(2);
    expect(h.store.get().connection.status).toBe('connecting');
  });

  it('backs off exponentially on network errors and counts down', async () => {
    const h = setup();
    h.client.login.mockRejectedValue(new FoundryClientError('network', 'down'));
    await h.session.start(h.creds);
    await settle();
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) {
      const c = h.store.get().connection;
      expect(c).toMatchObject({ status: 'offline', cause: 'network', attempt: i + 1 });
      seen.push(c.retryInMs ?? -1);
      if (i === 3) {
        // 8 s step: the 1 s countdown tick updates the remaining time.
        vi.advanceTimersByTime(SESSION_TIMING.countdownTick);
        expect(h.store.get().connection.retryInMs).toBe(7_000);
        vi.advanceTimersByTime(7_000);
      } else {
        vi.advanceTimersByTime(c.retryInMs ?? 0);
      }
      await settle();
    }
    expect(seen).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
  });

  it('treats server errors and unexpected throws as network outages', async () => {
    const h = setup();
    h.client.fetchJoinPage.mockRejectedValueOnce(new FoundryClientError('server', 'HTTP 503'));
    await h.session.start(h.creds);
    await settle();
    expect(h.store.get().connection).toMatchObject({ status: 'offline', cause: 'network' });
    h.client.openSocket.mockRejectedValueOnce('weird');
    h.session.reconnect();
    await settle();
    expect(h.store.get().connection).toMatchObject({
      status: 'offline',
      cause: 'network',
      attempt: 1,
    });
    expect(h.session.info().diagnostics.at(-1)?.message).toContain('weird');
  });

  it('revokes and clears credentials when login is rejected', async () => {
    const h = setup();
    h.client.login.mockRejectedValue(new FoundryClientError('auth', 'HTTP 401'));
    await h.session.start(h.creds);
    await settle();
    expect(h.store.get().connection).toEqual({ status: 'revoked', cause: 'auth' });
    expect(h.storage.data.has(CREDENTIALS_STORAGE_KEY)).toBe(false);
  });

  it('drops stale continuations when the flow is superseded', async () => {
    const h = setup();
    let release: () => void = () => {};
    h.client.login.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const started = h.session.start(h.creds);
    await settle();
    h.session.disconnect();
    release();
    await started;
    expect(h.client.openSocket).not.toHaveBeenCalled();
    expect(h.store.get().connection.status).toBe('offline');
  });

  it('closes a socket that opens after the flow was superseded', async () => {
    const h = setup();
    const late = new FakeSocket();
    let release: (s: FakeSocket) => void = () => {};
    h.client.openSocket.mockImplementationOnce(() => new Promise<FakeSocket>((r) => (release = r)));
    const started = h.session.start(h.creds);
    await settle();
    h.session.disconnect();
    release(late);
    await started;
    expect(late.disconnected).toBe(true);
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
    expect((await gm.drain()).map((m) => m.what)).toEqual(['map', 'log']);
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

  it('goes offline when the socket disconnects', async () => {
    const h = setup();
    await goOnline(h);
    h.socket().deliver('disconnect', 'transport close');
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

  it('ignores foreign traffic and records undecryptable or malformed envelopes', async () => {
    const h = setup();
    const gm = await goOnline(h);
    h.socket().deliver(DIRECT_SOCKET_EVENT, { hello: 'world' });
    await gm.reply({ t: 'pong', rid: 'x' }, h.creds.key, 'someone-else');
    await settle();
    expect(h.session.info().diagnostics).toEqual([]);
    await gm.reply({ t: 'pong', rid: 'x' }, generateDeviceKey());
    await gm.reply({ t: 'bogus' });
    await settle();
    expect(h.session.info().diagnostics.map((d) => d.message)).toEqual([
      'envelope rejected (auth)',
      'invalid projector message',
    ]);
    // Addressed to another device: skipped even though it is well-formed.
    const key = await importDeviceKey(h.creds.key);
    h.socket().deliver(
      DIRECT_SOCKET_EVENT,
      await seal(key, 'projector', 'user9', { t: 'revoked' }),
    );
    await settle();
    expect(h.store.get().connection.status).toBe('online');
    expect(h.session.info().diagnostics).toHaveLength(2);
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
    const [hello] = await gm.drain();
    await gm.reply({
      t: 'welcome',
      rid: hello?.rid,
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
    const socket = h.socket();
    h.session.onForeground(false);
    expect(socket.disconnected).toBe(true);
    expect(h.store.get().connection).toMatchObject({ status: 'offline', cause: 'background' });
    vi.advanceTimersByTime(60_000);
    expect(h.client.openSocket).toHaveBeenCalledTimes(1);
    h.session.onForeground(true);
    await settle();
    expect(h.client.openSocket).toHaveBeenCalledTimes(2);
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
    expect(h.client.openSocket).toHaveBeenCalledTimes(1);
  });

  it('disconnect pauses without retry; reconnect resumes; forget unpairs', async () => {
    const h = setup();
    await goOnline(h);
    h.session.disconnect();
    expect(h.store.get().connection.status).toBe('offline');
    expect(h.store.get().connection.retryInMs).toBeUndefined();
    vi.advanceTimersByTime(60_000);
    expect(h.client.openSocket).toHaveBeenCalledTimes(1);
    h.session.reconnect();
    await settle();
    expect(h.client.openSocket).toHaveBeenCalledTimes(2);
    await h.session.forget();
    expect(h.store.get().connection).toEqual({ status: 'unpaired' });
    h.session.disconnect();
    expect(h.store.get().connection.status).toBe('unpaired');
  });

  it('pairs manually and lists users', async () => {
    const h = setup();
    await h.session.start(null);
    await expect(h.session.listUsers()).resolves.toEqual([{ id: 'u', name: 'Luca (G2)' }]);
    await h.session.pairManual('u', '7QK3-MX9P-2HRA-C4TE');
    const stored = JSON.parse(h.storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '');
    expect(stored).toMatchObject({
      base: 'https://foundry.example/vtt',
      userId: 'u',
      password: '7QK3MX9P2HRAC4TE',
    });
    expect(h.client.login).toHaveBeenCalledWith('u', '7QK3MX9P2HRAC4TE');
    await expect(h.session.pairManual('u', 'bad')).rejects.toThrow('invalid manual code');
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
});
