import {
  deriveCodePairing,
  GLASSES_ADDRESS,
  generateDeviceKey,
  generateRoomId,
  importDeviceKey,
  LOG_DELTA_TYPE,
  type MapSnapshot,
  open,
  PROJECTOR_ADDRESS,
  R1_ACTION_ECONOMY_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
  R1_ROLL_REQUEST_TYPE,
  type SealedEnvelope,
  seal,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FoundryMock,
  installFoundry,
  type MockUser,
  makeActor,
  makeUser,
} from '../__tests__/direct-fixtures.js';
import { MapAssetCache } from './map-assets.js';
import { getPairing, type Pairing, savePairing, updatePairing } from './pairing-store.js';
import { MAP_THROTTLE_MS, Projector } from './projector.js';
import {
  RelayConnection as RealRelayConnection,
  type RelayConnection,
  type RelayHandlers,
  type SocketLike,
} from './relay-connection.js';

const dispatchTool = vi.hoisted(() => vi.fn());
const writeAuditLog = vi.hoisted(() => vi.fn(async () => {}));
const readMapSnapshot = vi.hoisted(() => vi.fn());
const resolveTargetUuids = vi.hoisted(() => vi.fn());
const applyOwnTargets = vi.hoisted(() => vi.fn());
vi.mock('../write-path/tool-registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../write-path/tool-registry.js')>()),
  dispatchTool,
}));
vi.mock('../write-path/audit-log.js', () => ({ writeAuditLog }));
vi.mock('../readers/character-reader.js', () => ({
  getCharacterSnapshot: (id: string) => ({ actorId: id, name: 'Thorin' }),
}));
vi.mock('../readers/combat-reader.js', () => ({ getCombatSnapshot: () => null }));
vi.mock('../write-path/combat-action-tracker.js', () => ({
  getActionEconomy: (actorId: string) => ({ actorId, action: true }),
}));
vi.mock('../write-path/combat-movement-tracker.js', () => ({
  getMovementBudget: (actorId: string) => ({ actorId, remaining: 30 }),
}));
vi.mock('./map-reader.js', () => ({ readMapSnapshot, resolveTargetUuids }));
vi.mock('./own-targets.js', () => ({ applyOwnTargets }));

const MAP: MapSnapshot = {
  sceneId: 's1',
  name: 'Crypt',
  cols: 10,
  rows: 10,
  gridPx: 100,
  background: { src: 'worlds/bg.webp', x: 0, y: 0, w: 1000, h: 1000 },
  darkness: 0,
  walls: [],
  tokens: [{ id: 't1', name: 'Thorin', kind: 'self', x: 1, y: 1, w: 1, h: 1 }],
  selfTokenId: 't1',
};

/** Fake relay link: records frames, lets the test drive peer/link events. */
class FakeLink {
  sent: SealedEnvelope[] = [];
  rooms: string[] = [];
  started = false;
  stopped = false;
  connected = true;
  /** Sends that fail before reaching the relay (a dropped socket mid-push). */
  failNext = 0;
  constructor(
    public room: string,
    readonly handlers: RelayHandlers,
    readonly base = 'wss://relay.example',
  ) {
    this.rooms.push(room);
  }
  start(): void {
    this.started = true;
    this.handlers.onLink(true);
  }
  stop(): void {
    this.stopped = true;
  }
  switchRoom(room: string): void {
    this.room = room;
    this.rooms.push(room);
  }
  async send(frame: object): Promise<void> {
    if (!this.connected) throw new Error('relay not connected');
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('socket dropped');
    }
    this.sent.push(frame as SealedEnvelope);
  }
}

let f: FoundryMock;
let luca: MockUser;
let links: FakeLink[];
let projector: Projector;
let now: number;

function pairing(extra: Partial<Pairing> = {}): Pairing {
  return {
    deviceId: 'dev1',
    room: generateRoomId(),
    key: generateDeviceKey(),
    actorId: 'thorin',
    label: 'Thorin',
    createdAt: 1,
    lastSeenAt: null,
    expiresAt: null,
    ...extra,
  };
}

async function boot(p: Pairing = pairing()): Promise<{ link: FakeLink; p: Pairing }> {
  await savePairing(p);
  await projector.start();
  const link = links[links.length - 1] as FakeLink;
  link.handlers.onPeer(true);
  return { link, p };
}

/** Sends a sealed app message as the glasses would. */
async function glasses(
  link: FakeLink,
  message: object,
  key: string,
  from: string = GLASSES_ADDRESS,
) {
  const env = await seal(await importDeviceKey(key), from, PROJECTOR_ADDRESS, message, now);
  link.handlers.onFrame(env);
}

/** Waits until the link carried `n` frames, then decrypts them all with `key`. */
async function received(link: FakeLink, n: number, key: string) {
  await vi.waitFor(
    () => {
      if (link.sent.length < n) throw new Error(`waiting for ${n} frames (${link.sent.length})`);
    },
    { timeout: 3_000, interval: 2 },
  );
  const ck = await importDeviceKey(key);
  const out: Array<Record<string, unknown>> = [];
  for (const env of link.sent) {
    expect(env.from).toBe(PROJECTOR_ADDRESS);
    expect(env.to).toBe(GLASSES_ADDRESS);
    const r = await open(ck, env, now);
    if (r.ok) out.push(r.message);
  }
  return out;
}

beforeEach(() => {
  now = Date.now();
  luca = makeUser('p1', 'Luca');
  f = installFoundry({
    users: [luca],
    localIsGM: false,
    actors: [makeActor('thorin', 'Thorin', { ownership: { p1: 3 } })],
  });
  f.game.user = luca;
  links = [];
  readMapSnapshot.mockReturnValue(MAP);
  resolveTargetUuids.mockReturnValue({ ok: true, uuids: ['Scene.s1.Token.t9'] });
  dispatchTool.mockResolvedValue({ success: true, data: { rolled: 17 } });
  projector = new Projector({
    relayBase: () => 'wss://relay.example',
    connect: (base, room, handlers) => {
      const link = new FakeLink(room, handlers, base);
      links.push(link);
      return link as unknown as RelayConnection;
    },
    assets: new MapAssetCache(async () => 'data:image/jpeg;base64,AAAA'),
    lock: (_id, hold) => {
      hold();
      return () => {};
    },
    now: () => now,
  });
});

afterEach(() => {
  projector.stop();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Projector (ADR-0019)', () => {
  it('PJ-01 start drops expired QR sessions and opens one channel per pairing in its room', async () => {
    await savePairing(pairing({ deviceId: 'old', expiresAt: now - 1 }));
    const { p } = await boot();
    expect(links).toHaveLength(1);
    expect(links[0]?.rooms).toEqual([p.room]);
    expect(links[0]?.started).toBe(true);
    expect(getPairing('old')).toBeNull();
    projector.open('dev1');
    projector.open('missing');
    expect(links).toHaveLength(1);
    expect(projector.status('dev1')).toBe('waiting');
    expect(projector.status('missing')).toBe('offline');
  });

  it('PJ-02 first hello through a QR rotates room + key and moves to the new room', async () => {
    const code = await deriveCodePairing('7QK3-MX9P-2HRA-C4TE');
    const { link } = await boot(pairing({ ...code, expiresAt: now + 60_000 }));
    await glasses(link, { t: 'hello', rid: 'h1', proto: 2, app: '1.0.0' }, code.key);
    const [welcome] = await received(link, 1, code.key);
    expect(welcome).toMatchObject({
      t: 'welcome',
      rid: 'h1',
      actorName: 'Thorin',
      userName: 'Luca',
    });
    const rotate = (welcome as { rotate: { room: string; key: string } }).rotate;
    expect(rotate.room).not.toBe(code.room);
    await vi.waitFor(() => expect(getPairing('dev1')?.expiresAt).toBeNull());
    expect(getPairing('dev1')).toMatchObject({ room: rotate.room, key: rotate.key });
    expect(link.rooms).toEqual([code.room, rotate.room]);
    expect(projector.status('dev1')).toBe('waiting');
    // The old key no longer authenticates.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await glasses(link, { t: 'ping', rid: 'x' }, code.key);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(link.sent).toHaveLength(1);
  });

  it('PJ-02b regression: two hellos racing on a fresh QR rotate the secrets exactly once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = await deriveCodePairing('7QK3-MX9P-2HRA-C4TE');
    const { link } = await boot(pairing({ ...code, expiresAt: now + 60_000 }));
    await glasses(link, { t: 'hello', rid: 'a', proto: 2, app: '1' }, code.key);
    await glasses(link, { t: 'hello', rid: 'b', proto: 2, app: '1' }, code.key);
    await received(link, 1, code.key);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(link.rooms).toHaveLength(2);
    expect(link.sent).toHaveLength(1);
  });

  it('PJ-03 hello on a paired device → welcome, assets, snapshots, combat priming; online', async () => {
    f.game.combat = {} as never;
    const { link, p } = await boot();
    await glasses(link, { t: 'hello', rid: 'h1', proto: 2, app: '1.0.0' }, p.key);
    const msgs = await received(link, 8, p.key);
    expect(msgs.map((m) => m.t)).toEqual([
      'welcome',
      'snapshot',
      'asset',
      'snapshot',
      'snapshot',
      'snapshot',
      'delta',
      'delta',
    ]);
    expect(msgs[1]).toMatchObject({ what: 'character', data: { actorId: 'thorin' } });
    const map = msgs[3] as { what: string; data: MapSnapshot };
    expect(map.what).toBe('map');
    expect(map.data.background?.src).toBe(`evf-asset:${(msgs[2] as { id: string }).id}`);
    expect(msgs[6]).toMatchObject({ topic: R1_ACTION_ECONOMY_TYPE, seq: 1 });
    expect(msgs[7]).toMatchObject({ topic: R1_MOVEMENT_BUDGET_TYPE, seq: 2 });
    expect(projector.status('dev1')).toBe('online');
    expect(getPairing('dev1')?.lastSeenAt).toBe(now);
    // A second get:map does not resend the asset.
    await glasses(link, { t: 'get', rid: 'g1', what: 'map' }, p.key);
    const again = await received(link, 9, p.key);
    expect(again[8]).toMatchObject({ t: 'snapshot', rid: 'g1', what: 'map' });
  });

  it('PJ-04 drops frames not for the projector, from others, forged or malformed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { link, p } = await boot();
    link.handlers.onFrame({ nope: 1 });
    await glasses(link, { t: 'ping', rid: 'r' }, p.key, 'someone');
    await glasses(link, { t: 'ping', rid: 'r' }, generateDeviceKey());
    await glasses(link, { t: 'hack' }, p.key);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    expect(link.sent).toHaveLength(0);
  });

  it('PJ-05 ownership is re-checked live: forbidden_actor + audit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { link, p } = await boot();
    (f.actors.get('thorin') as { ownership: Record<string, number> }).ownership = {};
    await glasses(link, { t: 'get', rid: 'g', what: 'character' }, p.key);
    const [res] = await received(link, 1, p.key);
    expect(res).toMatchObject({
      t: 'result',
      rid: 'g',
      ok: false,
      error: { code: 'forbidden_actor' },
    });
    await vi.waitFor(() => expect(writeAuditLog).toHaveBeenCalled());
  });

  it('PJ-06 a deleted actor answers actor_missing to hello', async () => {
    const { link, p } = await boot();
    f.actors.delete('thorin');
    await glasses(link, { t: 'hello', rid: 'h', proto: 2, app: '1' }, p.key);
    const [res] = await received(link, 1, p.key);
    expect(res).toMatchObject({ ok: false, error: { code: 'actor_missing' } });
  });

  it('PJ-07 invoke validates, translates targets (own targets on a player tab), dispatches', async () => {
    const { link, p } = await boot();
    const send = (rid: string, tool: string, input: unknown) =>
      glasses(link, { t: 'invoke', rid, tool, input }, p.key);
    await send('1', 'nope', {});
    await send('2', 'weapon-attack', [1]);
    await send('3', 'weapon-attack', { actor_id: 'other' });
    await send('4', 'weapon-attack', { targets: 'x' });
    resolveTargetUuids.mockReturnValueOnce({ ok: false, invalidId: 'tX' });
    await send('5', 'weapon-attack', { targets: ['tX'] });
    await send('6', 'weapon-attack', { item_id: 'axe', targets: ['t9'] });
    dispatchTool.mockImplementation(async (_tool: string, req: { args: { item_id?: string } }) =>
      req.args.item_id === 'wand'
        ? { success: false, error: 'no_slots' }
        : { success: true, data: { rolled: 17 } },
    );
    await send('7', 'weapon-attack', { item_id: 'wand' });
    const out = await received(link, 7, p.key);
    const byRid = Object.fromEntries(out.map((m) => [m.rid, m]));
    expect(byRid['1']).toMatchObject({ error: { code: 'unknown_tool' } });
    expect(byRid['2']).toMatchObject({ error: { code: 'invalid_input' } });
    expect(byRid['3']).toMatchObject({ error: { code: 'forbidden_actor' } });
    expect(byRid['4']).toMatchObject({ error: { code: 'invalid_input' } });
    expect(byRid['5']).toMatchObject({ error: { code: 'invalid_target' } });
    expect(byRid['6']).toMatchObject({ ok: true, data: { rolled: 17 } });
    expect(byRid['7']).toMatchObject({ ok: false, error: { code: 'no_slots' } });
    expect(applyOwnTargets).toHaveBeenCalledWith(['t9']);
    expect(dispatchTool).toHaveBeenCalledWith('weapon-attack', {
      args: { item_id: 'axe', targets: ['Scene.s1.Token.t9'], actor_id: 'thorin' },
      idempotencyKey: '6',
      bearer: 'g2:dev1',
    });
  });

  it('PJ-08 ping → pong; a GM tab does not touch its own targets', async () => {
    f.game.user = f.users[0] as MockUser;
    const { link, p } = await boot();
    await glasses(link, { t: 'ping', rid: 'p' }, p.key);
    await glasses(
      link,
      { t: 'invoke', rid: 'i', tool: 'weapon-attack', input: { targets: ['t9'] } },
      p.key,
    );
    const out = await received(link, 2, p.key);
    expect(out[0]).toEqual({ t: 'pong', rid: 'p' });
    expect(applyOwnTargets).not.toHaveBeenCalled();
  });

  it('PJ-09 deltas go only to welcomed devices concerned by the payload', async () => {
    const { link, p } = await boot();
    projector.pushDelta('character.delta', { actorId: 'thorin' });
    expect(link.sent).toHaveLength(0);
    await glasses(link, { t: 'hello', rid: 'h', proto: 2, app: '1' }, p.key);
    await received(link, 6, p.key);
    projector.pushDelta('character.delta', { actorId: 'other' });
    projector.pushDelta('x', { userId: 'someone' });
    projector.pushDelta('x', { recipientUserId: 'someone' });
    projector.pushDelta('character.delta', { actorId: 'thorin' });
    projector.pushDelta('x', { userId: 'p1' });
    projector.pushDelta('x', 'plain');
    const out = await received(link, 9, p.key);
    expect(out.slice(6).map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(projector.projectedActors()).toEqual(['thorin']);
  });

  it('PJ-10 chat messages visible to this user become log / roll-request deltas', async () => {
    const { link, p } = await boot();
    await glasses(link, { t: 'hello', rid: 'h', proto: 2, app: '1' }, p.key);
    await received(link, 6, p.key);
    f.fire('createChatMessage', null);
    f.fire('createChatMessage', { id: 'm0', whisper: ['someone'], author: { id: 'gm1' } });
    f.fire('createChatMessage', {
      id: 'm1',
      content: 'Hello',
      author: { id: 'gm1', name: 'Anna' },
      timestamp: 5,
      whisper: [],
    });
    const out = await received(link, 7, p.key);
    expect(out[6]).toMatchObject({ t: 'delta', topic: LOG_DELTA_TYPE });
    expect(R1_ROLL_REQUEST_TYPE).toBeTypeOf('string');
  });

  it('PJ-11 map hooks are throttled per device and skip unchanged assets', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { link, p } = await boot();
      await glasses(link, { t: 'hello', rid: 'h', proto: 2, app: '1' }, p.key);
      await received(link, 6, p.key);
      now += MAP_THROTTLE_MS;
      f.fire('updateToken');
      f.fire('updateToken');
      vi.advanceTimersByTime(MAP_THROTTLE_MS);
      const out = await received(link, 7, p.key);
      expect(out[6]).toMatchObject({ t: 'snapshot', what: 'map' });
      expect(out.filter((m) => m.t === 'asset')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('PJ-12 a null or invalid map is sent as null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { link, p } = await boot();
    readMapSnapshot.mockReturnValueOnce(null).mockReturnValueOnce({ bogus: true });
    await glasses(link, { t: 'get', rid: 'a', what: 'map' }, p.key);
    await glasses(link, { t: 'get', rid: 'b', what: 'map' }, p.key);
    const out = await received(link, 2, p.key);
    expect(out.map((m) => m.data)).toEqual([null, null]);
    expect(warn).toHaveBeenCalled();
  });

  it('PJ-13 peer-down unwelcomes; revoke notifies, stops and forgets', async () => {
    const { link, p } = await boot();
    const listener = vi.fn();
    const off = projector.subscribe(listener);
    await glasses(link, { t: 'hello', rid: 'h', proto: 2, app: '1' }, p.key);
    await received(link, 6, p.key);
    link.handlers.onPeer(false);
    expect(projector.status('dev1')).toBe('waiting');
    await projector.revoke('dev1');
    const out = await received(link, 7, p.key);
    expect(out[6]).toEqual({ t: 'revoked' });
    expect(link.stopped).toBe(true);
    expect(getPairing('dev1')).toBeNull();
    expect(listener).toHaveBeenCalled();
    off();
    link.handlers.onLink(false);
    expect(projector.status('dev1')).toBe('offline');
  });

  it('PJ-14 revoke of an unreachable device still forgets it; failed pushes are logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { link, p } = await boot();
    await glasses(link, { t: 'hello', rid: 'h', proto: 2, app: '1' }, p.key);
    await received(link, 6, p.key);
    link.connected = false;
    projector.pushDelta('x', {});
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    await projector.revoke('dev1');
    expect(getPairing('dev1')).toBeNull();
    await projector.revoke('never');
  });

  it('PJ-15 the projector expires an unused QR by itself (window closed or not); a scan in time keeps it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const listener = vi.fn();
      projector.subscribe(listener);
      const code = await deriveCodePairing('7QK3-MX9P-2HRA-C4TE');
      const { link } = await boot(pairing({ ...code, expiresAt: now + 60_000 }));
      await savePairing(pairing({ deviceId: 'dev2', expiresAt: now + 60_000 }));
      projector.open('dev2');
      const link2 = links[1] as FakeLink;
      // dev2 is scanned in time: rotated, so its expiry no longer applies.
      await glasses(
        link2,
        { t: 'hello', rid: 'h', proto: 2, app: '1' },
        getPairing('dev2')?.key ?? '',
      );
      await vi.waitFor(() => expect(getPairing('dev2')?.expiresAt).toBeNull());
      // (vi.waitFor above may have advanced the fake clock by a few intervals.)
      vi.advanceTimersByTime(55_000);
      expect(getPairing('dev1')).not.toBeNull();
      vi.advanceTimersByTime(5_000);
      await vi.waitFor(() => expect(getPairing('dev1')).toBeNull());
      expect(link.stopped).toBe(true);
      expect(link.sent).toHaveLength(0); // nothing to notify: nobody used the code
      expect(projector.status('dev1')).toBe('offline');
      expect(listener).toHaveBeenCalled();
      expect(getPairing('dev2')).not.toBeNull();
      expect(link2.stopped).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('PJ-15b regression: a hello after the QR expired on this clock (timer late: a sleeping laptop) pairs nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { link, p } = await boot(pairing({ expiresAt: now + 60_000 }));
      now += 61_000; // the clock moved on; the expiry timer has not fired yet
      await glasses(link, { t: 'hello', rid: 'h', proto: 2, app: '1' }, p.key);
      await vi.waitFor(() => expect(getPairing('dev1')).toBeNull());
      expect(link.sent).toHaveLength(0); // no welcome, no rotation
      expect(link.stopped).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('PJ-16 diagnostics: relay link, glasses in the room, last rejected frame (clock, key, shape)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listener = vi.fn();
    projector.subscribe(listener);
    expect(projector.diagnostics('nope')).toEqual({
      relay: false,
      glasses: false,
      rejected: null,
    });
    const { link, p } = await boot();
    expect(projector.diagnostics('dev1')).toEqual({ relay: true, glasses: true, rejected: null });
    const stale = await seal(
      await importDeviceKey(p.key),
      GLASSES_ADDRESS,
      PROJECTOR_ADDRESS,
      { t: 'ping', rid: 'r' },
      now - 10 * 60_000,
    );
    listener.mockClear();
    link.handlers.onFrame(stale);
    await vi.waitFor(() => expect(projector.diagnostics('dev1').rejected).toBe('stale'));
    expect(listener).toHaveBeenCalled();
    await glasses(link, { t: 'ping', rid: 'r' }, generateDeviceKey());
    await vi.waitFor(() => expect(projector.diagnostics('dev1').rejected).toBe('auth'));
    await glasses(link, { t: 'hack' }, p.key);
    await vi.waitFor(() => expect(projector.diagnostics('dev1').rejected).toBe('malformed'));
    // A good frame clears it.
    await glasses(link, { t: 'ping', rid: 'ok' }, p.key);
    await vi.waitFor(() => expect(projector.diagnostics('dev1').rejected).toBeNull());
    link.handlers.onPeer(false);
    link.handlers.onLink(false);
    expect(projector.diagnostics('dev1')).toMatchObject({ relay: false, glasses: false });
  });

  it('PJ-17 regression: a second hello on a welcomed link gets only a welcome (no second full push)', async () => {
    const { link, p } = await boot();
    await glasses(link, { t: 'hello', rid: 'h1', proto: 2, app: '1' }, p.key);
    await received(link, 6, p.key);
    await glasses(link, { t: 'hello', rid: 'h2', proto: 2, app: '1' }, p.key);
    // Frames are handled one at a time: the pong comes only after the second hello was
    // fully handled, so anything it pushed would sit between the welcome and the pong.
    await glasses(link, { t: 'ping', rid: 'p' }, p.key);
    const out = await received(link, 8, p.key);
    expect(out.slice(6).map((m) => [m.t, m.rid])).toEqual([
      ['welcome', 'h2'],
      ['pong', 'p'],
    ]);
    // The sent-assets cache survived: a get:map sends no picture again.
    await glasses(link, { t: 'get', rid: 'g', what: 'map' }, p.key);
    const again = await received(link, 9, p.key);
    expect(again[8]).toMatchObject({ t: 'snapshot', what: 'map' });
    // A glasses socket (re)joining the room (relay peer-up) is a new link: full push again.
    link.handlers.onPeer(true);
    expect(projector.status('dev1')).toBe('waiting');
    await glasses(link, { t: 'hello', rid: 'h3', proto: 2, app: '1' }, p.key);
    const fresh = await received(link, 15, p.key);
    expect(fresh.slice(9).map((m) => m.t)).toEqual([
      'welcome',
      'snapshot',
      'asset',
      'snapshot',
      'snapshot',
      'snapshot',
    ]);
  });

  it('PJ-19 regression: each pairing is served on the relay it was made on (setting only for old records)', async () => {
    await savePairing(pairing({ deviceId: 'custom', relay: 'ws://10.0.0.2:8787' }));
    await savePairing(pairing({ deviceId: 'old', createdAt: 2 }));
    await projector.start();
    expect(links.map((l) => l.base)).toEqual(['ws://10.0.0.2:8787', 'wss://relay.example']);
  });

  it('PJ-20 regression: a picture whose send failed is sent again with the next map', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { link, p } = await boot();
    link.failNext = 1; // the asset frame of the first map snapshot is lost
    await glasses(link, { t: 'get', rid: 'a', what: 'map' }, p.key);
    await vi.waitFor(() => expect(err).toHaveBeenCalled());
    expect(link.sent).toHaveLength(0);
    await glasses(link, { t: 'get', rid: 'b', what: 'map' }, p.key);
    const out = await received(link, 2, p.key);
    expect(out.map((m) => m.t)).toEqual(['asset', 'snapshot']);
  });

  it('PJ-21 regression: the expiry timer of a QR that got used meanwhile forgets nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { link } = await boot(pairing({ expiresAt: now + 60_000 }));
      // Rotated by a path that did not disarm this tab's timer (e.g. another tab's write).
      await updatePairing('dev1', { expiresAt: null });
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      expect(getPairing('dev1')).not.toBeNull();
      expect(link.stopped).toBe(false);
      expect(projector.status('dev1')).toBe('waiting');
    } finally {
      vi.useRealTimers();
    }
  });

  it('PJ-18 regression: pairing on a scene with 30 pictures, then a scene change, stays under a 60 frames/s relay (no eject)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      /** Relay socket that ejects its sender above 60 frames in a rolling second. */
      class LimitedSocket implements SocketLike {
        readyState = 0;
        frames: string[] = [];
        stamps: number[] = [];
        ejected = false;
        onopen: ((ev: unknown) => void) | null = null;
        onmessage: ((ev: { data: unknown }) => void) | null = null;
        onclose: ((ev: { code: number }) => void) | null = null;
        onerror: ((ev: unknown) => void) | null = null;
        send(data: string): void {
          const at = Date.now();
          this.stamps = this.stamps.filter((t) => t > at - 1_000);
          this.stamps.push(at);
          if (this.stamps.length > 60) {
            this.ejected = true;
            this.readyState = 3;
            this.onclose?.({ code: 1008 });
            return;
          }
          this.frames.push(data);
        }
        close(): void {
          this.readyState = 3;
        }
      }
      const sockets: LimitedSocket[] = [];
      const scenePictures = (scene: string) =>
        Array.from({ length: 30 }, (_, i) => ({
          id: `${scene}${i}`,
          data: `data:image/png;base64,${'A'.repeat(64)}${i}`,
        }));
      let pictures = scenePictures('crypt');
      const paced = new Projector({
        relayBase: () => 'wss://relay.example',
        connect: (base, room, handlers) =>
          new RealRelayConnection(base, room, handlers, {
            now: () => Date.now(),
            createSocket: () => {
              const s = new LimitedSocket();
              sockets.push(s);
              return s;
            },
            setTimeout: (fn, ms) => setTimeout(fn, ms),
            clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
          }),
        assets: {
          prepare: async (map: MapSnapshot) => ({ map, assets: pictures }),
        } as unknown as MapAssetCache,
        lock: (_id, hold) => {
          hold();
          return () => {};
        },
      });
      const p = pairing();
      await savePairing(p);
      await paced.start();
      const socket = sockets[0] as LimitedSocket;
      socket.readyState = 1;
      socket.onopen?.({});
      socket.onmessage?.({ data: '{"relay":"peer-up"}' });
      const key = await importDeviceKey(p.key);
      const say = async (message: object) => {
        const env = await seal(key, GLASSES_ADDRESS, PROJECTOR_ADDRESS, message, Date.now());
        socket.onmessage?.({ data: JSON.stringify(env) });
      };
      // A hello, a repeated hello on the same link (the glasses re-say it on every
      // `peer-up`), then a get per topic.
      await say({ t: 'hello', rid: 'h1', proto: 2, app: '1' });
      await say({ t: 'hello', rid: 'h2', proto: 2, app: '1' });
      for (const what of ['character', 'map', 'combat', 'log']) {
        await say({ t: 'get', rid: `g-${what}`, what });
      }
      // The fake clock stands still while the (real, async) sealing runs: it moves only
      // once the socket is quiet, so every frame written "now" counts in the same second.
      const realPause = () =>
        new Promise<void>((resolve) => {
          const h = setInterval(() => {
            clearInterval(h);
            resolve();
          }, 10);
        });
      const untilQuiet = async () => {
        for (let quiet = 0; quiet < 3; ) {
          const before = socket.frames.length;
          await realPause();
          await vi.advanceTimersByTimeAsync(0);
          quiet = socket.frames.length === before ? quiet + 1 : 0;
        }
      };
      await untilQuiet();
      // The GM switches to another scene with 30 other pictures in the same second.
      pictures = scenePictures('forest');
      f.fire('canvasReady');
      for (let second = 0; second < 4; second++) {
        await untilQuiet();
        await vi.advanceTimersByTimeAsync(1_000);
      }
      expect(socket.ejected).toBe(false);
      const types: string[] = [];
      for (const raw of socket.frames) {
        const r = await open(key, JSON.parse(raw) as SealedEnvelope, Date.now());
        if (r.ok) types.push(String(r.message.t));
      }
      expect(types.filter((t) => t === 'asset')).toHaveLength(60);
      expect(types.filter((t) => t === 'welcome')).toHaveLength(2);
      expect(paced.status('dev1')).toBe('online');
      paced.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
