import {
  DIRECT_SOCKET_EVENT,
  generateDeviceKey,
  importDeviceKey,
  open,
  PROJECTOR_ADDRESS,
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
import { type DeviceMeta, getDevice, upsertDevice } from './pairing-store.js';
import { KEY_GRACE_MS, MAP_THROTTLE_MS, Projector } from './projector.js';

const dispatchTool = vi.hoisted(() => vi.fn());
vi.mock('../write-path/tool-registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../write-path/tool-registry.js')>()),
  dispatchTool,
}));
vi.mock('../readers/character-reader.js', () => ({
  getCharacterSnapshot: (id: string) => ({ actorId: id, name: 'Thorin' }),
}));
vi.mock('../readers/combat-reader.js', () => ({ getCombatSnapshot: () => null }));

const KEY = generateDeviceKey();
const T0 = new Date('2026-09-23T10:00:00Z').getTime();

let f: FoundryMock;
let g2: MockUser;
let projector: Projector;

function meta(extra: Partial<DeviceMeta> = {}): DeviceMeta {
  return {
    g2UserId: 'g2a',
    playerUserId: 'p1',
    actorId: 'thorin',
    label: 'Luca (G2)',
    createdAt: T0,
    lastSeenAt: null,
    pendingRotation: false,
    ...extra,
  };
}

/** Lets fire-and-forget WebCrypto work settle (runs on the real event loop). */
async function flush(): Promise<void> {
  let stable = 0;
  let last = -1;
  for (let i = 0; i < 5_000 && stable < 50; i++) {
    await new Promise((r) => setImmediate(r));
    stable = f.emitted.length === last ? stable + 1 : 0;
    last = f.emitted.length;
  }
}

/** Waits (real event loop) until at least `n` envelopes were emitted. */
async function until(n: number): Promise<void> {
  await vi.waitFor(
    () => {
      if (f.emitted.length < n) throw new Error(`waiting for ${n} envelopes`);
    },
    { timeout: 5_000, interval: 5 },
  );
}

async function appSend(
  message: object,
  key = KEY,
  from = 'g2a',
  to: string = PROJECTOR_ADDRESS,
): Promise<void> {
  const env = await seal(await importDeviceKey(key), from, to, message);
  await projector.handleEnvelope(env);
}

/** Decrypts every emitted envelope with `key`; failures are dropped. */
async function received(key = KEY): Promise<Array<Record<string, unknown>>> {
  const ck = await importDeviceKey(key);
  const out: Array<Record<string, unknown>> = [];
  for (const env of f.emitted as SealedEnvelope[]) {
    expect(env.from).toBe(PROJECTOR_ADDRESS);
    const r = await open(ck, env);
    if (r.ok) out.push(r.message);
  }
  return out;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(T0);
  dispatchTool.mockReset();
  g2 = makeUser('g2a', 'Luca (G2)', { flags: { evenfoundryvtt: { g2For: 'p1' } } });
  f = installFoundry({
    users: [makeUser('p1', 'Luca'), g2],
    actors: [makeActor('thorin', 'Thorin', { ownership: { p1: 3 } })],
  });
  await upsertDevice(meta(), KEY);
  projector = new Projector();
});

afterEach(async () => {
  await flush(); // drain fire-and-forget sends so they cannot leak into the next test
  projector.stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Projector — hello / welcome / rotation', () => {
  it('PJ-01 hello → welcome then 4 snapshots (no rotation when not pending)', async () => {
    await appSend({ t: 'hello', rid: 'r1', proto: 1, app: 'g2' });
    const msgs = await received();
    expect(msgs[0]).toEqual({
      t: 'welcome',
      rid: 'r1',
      actorId: 'thorin',
      actorName: 'Thorin',
      userName: 'Luca (G2)',
      gmName: 'Anna',
      worldTitle: 'Cripta',
      locale: 'it',
    });
    expect(msgs.slice(1).map((m) => m.what)).toEqual(['character', 'map', 'combat', 'log']);
    expect(msgs[1]?.data).toEqual({ actorId: 'thorin', name: 'Thorin' });
    expect(projector.isOnline('g2a')).toBe(true);
    expect(getDevice('g2a')?.meta.lastSeenAt).toBe(T0);
  });

  it('PJ-02 pending rotation: new password on the user, new key sent sealed with the old key, grace window', async () => {
    await upsertDevice(meta({ pendingRotation: true }), KEY);
    await appSend({ t: 'hello', rid: 'r1', proto: 1, app: 'g2' });
    const [welcome] = await received(KEY);
    const rotate = welcome?.rotate as { password: string; key: string };
    expect(rotate.password).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(g2.update).toHaveBeenCalledWith({ password: rotate.password });
    expect(getDevice('g2a')).toEqual({
      meta: meta({ pendingRotation: false, lastSeenAt: T0 }),
      key: rotate.key,
    });
    // snapshots after the welcome use the new key
    expect((await received(rotate.key)).map((m) => m.t)).toEqual([
      'snapshot',
      'snapshot',
      'snapshot',
      'snapshot',
    ]);

    f.emitted.length = 0;
    await appSend({ t: 'ping', rid: 'old-key' }, KEY); // grace
    await appSend({ t: 'ping', rid: 'new-key' }, rotate.key);
    expect((await received(rotate.key)).map((m) => m.rid)).toEqual(['old-key', 'new-key']);

    vi.setSystemTime(T0 + KEY_GRACE_MS + 1);
    f.emitted.length = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await appSend({ t: 'ping', rid: 'too-late' }, KEY);
    expect(f.emitted).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('authentication failed'));
  });

  it('PJ-03 rotation failure keeps credentials and still welcomes', async () => {
    await upsertDevice(meta({ pendingRotation: true }), KEY);
    g2.update.mockRejectedValueOnce(new Error('db down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await appSend({ t: 'hello', rid: 'r1', proto: 1, app: 'g2' });
    const msgs = await received(KEY);
    expect(msgs[0]?.t).toBe('welcome');
    expect(msgs[0]?.rotate).toBeUndefined();
    expect(getDevice('g2a')?.meta.pendingRotation).toBe(true);
    expect(error).toHaveBeenCalled();
  });

  it('PJ-01b welcome carries the answering module version when Foundry reports one', async () => {
    f.game.modules = {
      get: (id: string) =>
        id === 'evenfoundryvtt' ? { active: true, version: '0.2.0' } : undefined,
    };
    await appSend({ t: 'hello', rid: 'r1', proto: 1, app: 'g2' });
    const [welcome] = await received();
    expect(welcome).toMatchObject({ t: 'welcome', moduleVersion: '0.2.0' });
  });

  it('PJ-01c a reconnect (new hello) resyncs every snapshot, map included, at once', async () => {
    await appSend({ t: 'hello', rid: 'r1', proto: 1, app: 'g2' });
    await appSend({ t: 'hello', rid: 'r2', proto: 1, app: 'g2' });
    const msgs = await received();
    expect(msgs.map((m) => (m.t === 'welcome' ? `welcome:${m.rid}` : m.what))).toEqual([
      'welcome:r1',
      'character',
      'map',
      'combat',
      'log',
      'welcome:r2',
      'character',
      'map',
      'combat',
      'log',
    ]);
  });

  it('PJ-04 hello for a deleted actor → result actor_missing', async () => {
    f.actors.clear();
    await appSend({ t: 'hello', rid: 'r1', proto: 1, app: 'g2' });
    expect(await received()).toEqual([
      {
        t: 'result',
        rid: 'r1',
        ok: false,
        error: { code: 'actor_missing', message: expect.any(String) },
      },
    ]);
  });
});

describe('Projector — get / ping / invoke', () => {
  it('PJ-05 get returns the topic snapshot with rid; ping → pong', async () => {
    await appSend({ t: 'get', rid: 'g1', what: 'log' });
    await appSend({ t: 'get', rid: 'g2', what: 'map' });
    await appSend({ t: 'ping', rid: 'p1' });
    expect(await received()).toEqual([
      { t: 'snapshot', rid: 'g1', what: 'log', data: { events: [] } },
      { t: 'snapshot', rid: 'g2', what: 'map', data: null },
      { t: 'pong', rid: 'p1' },
    ]);
  });

  it('PJ-06 invoke routes through dispatchTool for the paired actor with rid as idempotency key', async () => {
    dispatchTool.mockResolvedValueOnce({ success: true, data: { chatCardId: 'c1' } });
    await appSend({ t: 'invoke', rid: 'i1', tool: 'use-item', input: { item_id: 'x' } });
    expect(dispatchTool).toHaveBeenCalledWith('use-item', {
      args: { item_id: 'x', actor_id: 'thorin' },
      idempotencyKey: 'i1',
      bearer: 'g2:g2a',
    });
    expect(await received()).toEqual([
      { t: 'result', rid: 'i1', ok: true, data: { chatCardId: 'c1' } },
    ]);
  });

  it('PJ-07 invoke errors: unknown tool, non-object input, foreign actor, handler failure', async () => {
    dispatchTool.mockResolvedValueOnce({ success: false, error: 'item_not_found' });
    await appSend({ t: 'invoke', rid: 'a', tool: 'delete-world', input: {} });
    await appSend({ t: 'invoke', rid: 'b', tool: 'use-item', input: [1] });
    await appSend({ t: 'invoke', rid: 'c', tool: 'use-item', input: { actor_id: 'goblin' } });
    await appSend({ t: 'invoke', rid: 'd', tool: 'use-item', input: { actor_id: 'thorin' } });
    const codes = (await received()).map((m) => [m.rid, (m.error as { code: string }).code]);
    expect(codes).toEqual([
      ['a', 'unknown_tool'],
      ['b', 'invalid_input'],
      ['c', 'forbidden_actor'],
      ['d', 'item_not_found'],
    ]);
    expect(dispatchTool).toHaveBeenCalledTimes(1);
  });
});

describe('Projector — live ownership check', () => {
  it('PJ-21 revoking ownership after pairing denies hello / get / invoke (forbidden_actor) and audits', async () => {
    const actor = f.actors.get('thorin') as { ownership: Record<string, number> };
    actor.ownership = {};
    const create = vi.fn(async () => ({}));
    vi.stubGlobal('ChatMessage', { create });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await appSend({ t: 'hello', rid: 'h', proto: 1, app: 'g2' });
    await appSend({ t: 'get', rid: 'g', what: 'character' });
    await appSend({ t: 'invoke', rid: 'i', tool: 'use-item', input: { item_id: 'x' } });
    await flush();
    const msgs = await received();
    expect(msgs.map((m) => [m.t, m.rid, (m.error as { code: string } | undefined)?.code])).toEqual([
      ['result', 'h', 'forbidden_actor'],
      ['result', 'g', 'forbidden_actor'],
      ['result', 'i', 'forbidden_actor'],
    ]);
    expect(dispatchTool).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenCalledTimes(3);
    expect(
      create.mock.calls.map(
        (c) =>
          (c as unknown as [{ flags: { evf: { audit: { tool: string; result: unknown } } } }])[0]
            .flags.evf.audit,
      ),
    ).toEqual([
      expect.objectContaining({
        tool: 'hello',
        result: { success: false, error: 'forbidden_actor' },
      }),
      expect.objectContaining({ tool: 'get:character', actorId: 'thorin' }),
      expect.objectContaining({ tool: 'use-item', idempotencyKey: 'i', payload: { item_id: 'x' } }),
    ]);
  });

  it('PJ-22 ownership is re-read live: granting it back lets the next invoke through', async () => {
    const actor = f.actors.get('thorin') as { ownership: Record<string, number> };
    actor.ownership = {};
    vi.stubGlobal('ChatMessage', { create: vi.fn(async () => ({})) });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await appSend({ t: 'invoke', rid: 'a', tool: 'use-item', input: {} });
    actor.ownership = { default: 3 };
    dispatchTool.mockResolvedValueOnce({ success: true, data: null });
    await appSend({ t: 'invoke', rid: 'b', tool: 'use-item', input: {} });
    const msgs = await received();
    expect(msgs.map((m) => [m.rid, m.ok])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });
});

describe('Projector — targets and combat priming (ADR-0016)', () => {
  function scene(): Record<string, unknown> {
    const tok = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      uuid: `Scene.s1.Token.${id}`,
      name: id,
      x: 0,
      y: 0,
      actorId: null,
      actor: null,
      ...extra,
    });
    return {
      id: 's1',
      name: 'Cripta',
      tokens: { contents: [tok('tGob'), tok('tHidden', { hidden: true })], get: () => undefined },
    };
  }

  it('PJ-18 invoke translates visible MapSnapshot token ids into token UUIDs', async () => {
    (f.game.scenes as { active: unknown }).active = scene();
    dispatchTool.mockResolvedValueOnce({ success: true, data: {} });
    await appSend({
      t: 'invoke',
      rid: 'w1',
      tool: 'weapon-attack',
      input: { item_id: 'axe', targets: ['tGob'] },
    });
    expect(dispatchTool).toHaveBeenCalledWith('weapon-attack', {
      args: { item_id: 'axe', targets: ['Scene.s1.Token.tGob'], actor_id: 'thorin' },
      idempotencyKey: 'w1',
      bearer: 'g2:g2a',
    });
  });

  it('PJ-19 invoke rejects ids not on the scene / hidden / malformed targets without dispatching', async () => {
    (f.game.scenes as { active: unknown }).active = scene();
    await appSend({
      t: 'invoke',
      rid: 'a',
      tool: 'cast-spell',
      input: { spell_id: 's', slot_level: 1, targets: ['tGob', 'other-scene-token'] },
    });
    await appSend({ t: 'invoke', rid: 'b', tool: 'use-item', input: { targets: ['tHidden'] } });
    await appSend({ t: 'invoke', rid: 'c', tool: 'use-item', input: { targets: 'tGob' } });
    await appSend({ t: 'invoke', rid: 'd', tool: 'use-item', input: { targets: [7] } });
    const codes = (await received()).map((m) => [m.rid, (m.error as { code: string }).code]);
    expect(codes).toEqual([
      ['a', 'invalid_target'],
      ['b', 'invalid_target'],
      ['c', 'invalid_input'],
      ['d', 'invalid_input'],
    ]);
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it('PJ-20 hello during combat primes action economy + movement for the paired actor', async () => {
    f.game.combat = { id: 'c1', round: 1, turn: 0 };
    await appSend({ t: 'hello', rid: 'r1', proto: 1, app: 'g2' });
    const deltas = (await received()).filter((m) => m.t === 'delta');
    expect(deltas.map((m) => [m.seq, m.topic])).toEqual([
      [1, 'r1.action.economy'],
      [2, 'r1.movement.budget'],
    ]);
    expect(deltas[0]?.data).toMatchObject({ actorId: 'thorin', actionsUsed: 0 });
    expect(deltas[1]?.data).toMatchObject({ actorId: 'thorin', remainingFeet: 30 });
  });
});

describe('Projector — ignored input', () => {
  it('PJ-08 non-GM client, non-active GM, wrong recipient, unknown sender, malformed envelope', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await appSend({ t: 'ping', rid: 'x' }, KEY, 'g2a', 'someone-else');
    await appSend({ t: 'ping', rid: 'x' }, KEY, 'stranger');
    await projector.handleEnvelope({ evf: 1, to: PROJECTOR_ADDRESS });
    await projector.handleEnvelope('garbage');
    f.game.user.isGM = false;
    await appSend({ t: 'ping', rid: 'x' });
    f.game.user.isGM = true;
    (f.game.users as { activeGM: unknown }).activeGM = makeUser('gm2', 'Other GM', { isGM: true });
    await appSend({ t: 'ping', rid: 'x' });
    expect(f.emitted).toHaveLength(0);
    expect(warn.mock.calls).toEqual([]);
  });

  it('PJ-09 bad ciphertext (other key) and schema-invalid plaintext are rejected with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await appSend({ t: 'ping', rid: 'x' }, generateDeviceKey());
    await appSend({ t: 'nope', rid: 'x' });
    expect(f.emitted).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('PJ-10 device without a key on this GM client is ignored', async () => {
    f.settings.set('evenfoundryvtt.g2DeviceKeys', {});
    await appSend({ t: 'ping', rid: 'x' });
    expect(f.emitted).toHaveLength(0);
  });
});

describe('Projector — pushes', () => {
  async function goOnline(): Promise<void> {
    await appSend({ t: 'ping', rid: 'online' });
    f.emitted.length = 0;
  }

  it('PJ-11 pushDelta routes by actorId / recipientUserId / userId, numbers seq, skips offline devices', async () => {
    projector.pushDelta('character.delta', { actorId: 'thorin' });
    await flush();
    expect(f.emitted).toHaveLength(0); // offline

    await goOnline();
    projector.pushDelta('character.delta', { actorId: 'thorin', hp: 3 });
    projector.pushDelta('character.delta', { actorId: 'goblin' });
    projector.pushDelta('combat.targets', { userId: 'p1', targets: [] });
    projector.pushDelta('combat.targets', { userId: 'gm1', targets: [] });
    projector.pushDelta('r1.action.result', { recipientUserId: 'g2a', status: 'success' });
    projector.pushDelta('r1.action.result', { recipientUserId: 'someone-else', status: 'success' });
    projector.pushDelta('combat.turn', { round: 2 });
    projector.pushDelta('raw', 7);
    await until(5);
    await flush();
    const msgs = await received();
    expect(msgs.map((m) => [m.seq, m.topic])).toEqual([
      [1, 'character.delta'],
      [2, 'combat.targets'],
      [3, 'r1.action.result'],
      [4, 'combat.turn'],
      [5, 'raw'],
    ]);
  });

  it('PJ-11b emits in seq order even when an earlier seal is slower (per-device queue)', async () => {
    await goOnline();
    const subtle = globalThis.crypto.subtle;
    const original = subtle.encrypt.bind(subtle);
    let calls = 0;
    const spy = vi
      .spyOn(subtle, 'encrypt')
      .mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => {
        // The first seal is slow: without the per-device queue the second delta overtakes it.
        if (calls++ === 0) for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
        return original(...args);
      });
    try {
      projector.pushDelta('combat.turn', { round: 1 });
      projector.pushDelta('combat.turn', { round: 2 });
      await until(2);
      await flush();
      expect((await received()).map((m) => m.seq)).toEqual([1, 2]);
    } finally {
      spy.mockRestore();
    }
  });

  it('PJ-12 chat messages are pushed only when visible to the player', async () => {
    projector.start();
    await goOnline();
    f.fire('createChatMessage', { id: 'm1', speaker: { alias: 'Mira' }, whisper: [] });
    f.fire('createChatMessage', { id: 'm2', whisper: ['gm1'] });
    f.fire('createChatMessage', { id: '' });
    f.fire('createChatMessage', null);
    await until(1);
    await flush();
    const msgs = await received();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      t: 'delta',
      topic: 'log.delta',
      data: { id: 'm1', actorName: 'Mira' },
    });
  });

  it('PJ-12b a dnd5e roll-request card is also relayed as r1.roll.request', async () => {
    projector.start();
    await goOnline();
    f.fire('createChatMessage', {
      id: 'm9',
      whisper: [],
      content:
        '<div class="card-buttons"><button data-type="save" data-ability="wis" data-dc="14" data-action="rollRequest">SAG</button></div>',
    });
    await until(2);
    await flush();
    const msgs = await received();
    expect(msgs.map((m) => m.topic)).toEqual(['log.delta', 'r1.roll.request']);
    expect(msgs[1]).toMatchObject({
      data: { messageId: 'm9', kind: 'save', ability: 'wis', dc: 14 },
    });
  });

  it('PJ-13 map refresh is throttled to one snapshot per second per device', async () => {
    projector.start();
    await goOnline();
    f.fire('updateToken');
    f.fire('updateToken');
    f.fire('createWall');
    await vi.advanceTimersByTimeAsync(0);
    await until(1);
    expect((await received()).map((m) => m.what)).toEqual(['map']);
    f.emitted.length = 0;
    // `until` (vi.waitFor) advances the fake clock while polling: measure the throttle
    // window from the first send (at T0), not from now.
    const elapsed = Date.now() - T0;
    f.fire('targetToken');
    await vi.advanceTimersByTimeAsync(MAP_THROTTLE_MS - 10 - elapsed);
    expect(f.emitted).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(20);
    await until(1);
    expect(f.emitted).toHaveLength(1);
  });

  it('PJ-14 start subscribes the socket relay; stop unsubscribes hooks and timers', async () => {
    projector.start();
    const handler = f.socketHandlers.get(DIRECT_SOCKET_EVENT);
    expect(handler).toBeDefined();
    const env = await seal(await importDeviceKey(KEY), 'g2a', PROJECTOR_ADDRESS, {
      t: 'ping',
      rid: 'via-socket',
    });
    handler?.(env);
    await until(1);
    expect((await received()).map((m) => m.rid)).toEqual(['via-socket']);
    f.emitted.length = 0;
    f.fire('updateToken');
    projector.stop();
    await flush();
    expect(f.emitted).toHaveLength(0);
    expect(f.socketHandlers.has(DIRECT_SOCKET_EVENT)).toBe(false);
  });

  it('PJ-15 start throws without game.socket', () => {
    (f.game as { socket?: unknown }).socket = undefined;
    expect(() => new Projector().start()).toThrow(/game.socket/);
  });

  it('PJ-16 revoke seals {t:"revoked"}; unknown device is a no-op', async () => {
    await projector.revoke('g2a');
    await projector.revoke('ghost');
    expect(await received()).toEqual([{ t: 'revoked' }]);
  });

  it('PJ-17 push failures are logged, never thrown', async () => {
    await goOnline();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (f.game.socket as { emit: ReturnType<typeof vi.fn> }).emit.mockImplementation(() => {
      throw new Error('socket closed');
    });
    projector.pushDelta('combat.turn', {});
    // Sealing runs on real WebCrypto: wait for the rejection instead of a fixed flush.
    await vi.waitFor(
      () =>
        expect(error).toHaveBeenCalledWith(
          expect.stringContaining('failed to push'),
          expect.anything(),
        ),
      { timeout: 5_000, interval: 5 },
    );
  });
});
