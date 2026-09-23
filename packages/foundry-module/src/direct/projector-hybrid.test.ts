/**
 * ADR-0017 §Confirmation — hybrid projector: the player's own client answers for its
 * self-paired glasses, the GM takes over (with the player-sealed key) when the player
 * leaves, only the elected client executes `invoke`, legacy ADR-0016 records migrate.
 */
import {
  DIRECT_SOCKET_EVENT,
  generateDeviceKey,
  generateIdentityKeyPair,
  type IdentityKeyPair,
  importDeviceKey,
  open,
  PROJECTOR_ADDRESS,
  readPairingFragment,
  type SealedEnvelope,
  seal,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  becomeClient,
  type FoundryMock,
  installFoundry,
  type MockUser,
  makeActor,
  makeUser,
} from '../__tests__/direct-fixtures.js';
import { enableGlasses, getAccess, openMyPassword } from './glasses-access.js';
import { readSelfDevice } from './glasses-flags.js';
import { startPairing } from './pairing-flow.js';
import { getDevice, migrateKeyHolders, upsertDevice } from './pairing-store.js';
import { Projector } from './projector.js';
import { startSelfPairing } from './self-pairing.js';

const dispatchTool = vi.hoisted(() => vi.fn());
vi.mock('../write-path/tool-registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../write-path/tool-registry.js')>()),
  dispatchTool,
}));
vi.mock('../readers/character-reader.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../readers/character-reader.js')>()),
  getCharacterSnapshot: (id: string) => ({ actorId: id }),
}));
vi.mock('../readers/combat-reader.js', () => ({ getCombatSnapshot: () => null }));

let f: FoundryMock;
let player: MockUser;
let ids: Record<'gm1' | 'p1', IdentityKeyPair>;
const browsers = new Map<string, Map<string, unknown>>();
let g2Id: string;
let deviceKey: string;

async function appSend(message: object, key = deviceKey, projector: Projector): Promise<void> {
  const env = await seal(await importDeviceKey(key), g2Id, PROJECTOR_ADDRESS, message);
  await projector.handleEnvelope(env);
}

async function received(key: string): Promise<Array<Record<string, unknown>>> {
  const ck = await importDeviceKey(key);
  const out: Array<Record<string, unknown>> = [];
  for (const env of f.emitted as SealedEnvelope[]) {
    expect(env.from).toBe(PROJECTOR_ADDRESS);
    const r = await open(ck, env);
    if (r.ok) out.push(r.message);
  }
  return out;
}

/** GM enables p1; p1 self-pairs from its own browser. Leaves the mock on p1's client. */
async function selfPaired(): Promise<void> {
  becomeClient(f, 'gm1', browsers, ids.gm1);
  player.flags = { evenfoundryvtt: { pub: ids.p1.publicJwk } };
  g2Id = await enableGlasses('p1');
  becomeClient(f, 'p1', browsers, ids.p1);
  const session = await startSelfPairing('mira');
  deviceKey = readPairingFragment(new URL(session.url).hash)?.k ?? '';
}

beforeEach(async () => {
  browsers.clear();
  dispatchTool.mockReset();
  player = makeUser('p1', 'Luca');
  f = installFoundry({
    users: [player],
    actors: [makeActor('mira', 'Mira', { ownership: { p1: 3 } })],
  });
  ids = { gm1: await generateIdentityKeyPair(), p1: await generateIdentityKeyPair() };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('hybrid projector (ADR-0017)', () => {
  it('HP-01 the player client answers hello with a key-only rotation and re-seals it for the GM', async () => {
    await selfPaired();
    const projector = new Projector();
    await appSend({ t: 'hello', rid: 'h1', proto: 1, app: 'g2' }, deviceKey, projector);
    const msgs = await received(deviceKey);
    const welcome = msgs[0] as { t: string; rotate?: { key: string; password?: string } };
    expect(welcome).toMatchObject({ t: 'welcome', actorId: 'mira', gmName: 'Anna' });
    expect(welcome.rotate?.password).toBeUndefined();
    const newKey = welcome.rotate?.key ?? '';
    expect(getDevice(g2Id)?.key).toBe(newKey);
    expect(readSelfDevice(player)).toMatchObject({ pendingRotation: false, playerHasKey: true });

    // Following messages use the new key; snapshots were pushed with it.
    f.emitted.length = 0;
    await appSend({ t: 'ping', rid: 'p' }, newKey, projector);
    expect(await received(newKey)).toEqual([{ t: 'pong', rid: 'p' }]);

    // The GM browser can now open the rotated key from the player's flag.
    becomeClient(f, 'gm1', browsers, null);
    player.active = false;
    const gmProjector = new Projector();
    f.emitted.length = 0;
    await appSend({ t: 'ping', rid: 'g' }, newKey, gmProjector);
    expect(await received(newKey)).toEqual([{ t: 'pong', rid: 'g' }]);
  });

  it('HP-02 only the elected client answers: the GM stays silent while the player is online', async () => {
    await selfPaired();
    becomeClient(f, 'gm1', browsers, null);
    const gmProjector = new Projector();
    dispatchTool.mockResolvedValue({ success: true, data: {} });
    await appSend({ t: 'invoke', rid: 'i1', tool: 'end-turn', input: {} }, deviceKey, gmProjector);
    expect(f.emitted).toHaveLength(0);
    expect(dispatchTool).not.toHaveBeenCalled();
    // ...but it knows the device is online, ready to take over.
    expect(gmProjector.isOnline(g2Id)).toBe(true);
  });

  it('HP-03 GM fallback: no rotation of a pending self QR; takes over with fresh snapshots on userConnected', async () => {
    await selfPaired();
    becomeClient(f, 'gm1', browsers, null);
    const gmProjector = new Projector();
    gmProjector.start();
    await appSend({ t: 'ping', rid: 'x' }, deviceKey, gmProjector); // player online: silent
    expect(f.emitted).toHaveLength(0);

    player.active = false;
    f.fire('userConnected', player, false);
    await vi.waitFor(async () => {
      const topics = (await received(deviceKey)).map((m) => m.what);
      expect(topics).toEqual(['character', 'map', 'combat', 'log']);
    });

    f.emitted.length = 0;
    await appSend({ t: 'hello', rid: 'h', proto: 1, app: 'g2' }, deviceKey, gmProjector);
    const [welcome] = await received(deviceKey);
    expect(welcome).toMatchObject({ t: 'welcome', actorId: 'mira' });
    expect(welcome).not.toHaveProperty('rotate');
    expect(readSelfDevice(player)?.pendingRotation).toBe(true);
    // A second presence event does not re-push (already responder).
    f.emitted.length = 0;
    f.fire('userConnected', player, false);
    await new Promise((r) => setTimeout(r, 20));
    expect(f.emitted).toHaveLength(0);
    gmProjector.stop();
  });

  it('HP-04 invoke on the player client dispatches as the player and targets with the player own targets', async () => {
    await selfPaired();
    const setTarget = vi.fn();
    vi.stubGlobal('canvas', {
      tokens: { get: (id: string) => (id === 'tGob' ? { setTarget } : undefined) },
    });
    (f.game.scenes as { active: unknown }).active = {
      id: 's1',
      name: 'Cripta',
      tokens: {
        contents: [
          {
            id: 'tGob',
            uuid: 'Scene.s1.Token.tGob',
            name: 'Gob',
            x: 0,
            y: 0,
            actorId: null,
            actor: null,
          },
        ],
        get: () => undefined,
      },
    };
    dispatchTool.mockResolvedValue({ success: true, data: { ok: 1 } });
    const projector = new Projector();
    await appSend(
      {
        t: 'invoke',
        rid: 'w1',
        tool: 'weapon-attack',
        input: { item_id: 'axe', targets: ['tGob'] },
      },
      deviceKey,
      projector,
    );
    expect(setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(dispatchTool).toHaveBeenCalledWith('weapon-attack', {
      args: { item_id: 'axe', targets: ['Scene.s1.Token.tGob'], actor_id: 'mira' },
      idempotencyKey: 'w1',
      bearer: `g2:${g2Id}`,
    });
    expect(await received(deviceKey)).toEqual([
      { t: 'result', rid: 'w1', ok: true, data: { ok: 1 } },
    ]);
  });

  it('HP-05 a non-elected client with a wrong key does not warn; an unknown GM key cannot open', async () => {
    await selfPaired();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    becomeClient(f, 'gm1', browsers, null);
    const gmProjector = new Projector();
    await appSend({ t: 'ping', rid: 'x' }, generateDeviceKey(), gmProjector);
    expect(warn).not.toHaveBeenCalled();
    // A GM whose browser changed (new identity) cannot open the stale entry.
    becomeClient(f, 'gm1', new Map(), await generateIdentityKeyPair());
    player.active = false;
    const fresh = new Projector();
    await appSend({ t: 'ping', rid: 'y' }, deviceKey, fresh);
    expect(f.emitted).toHaveLength(0);
    // A player client never opens another device's GM entry.
    f.users.push(makeUser('p2', 'Bea'));
    becomeClient(f, 'p2', browsers, null);
    await appSend({ t: 'ping', rid: 'z' }, deviceKey, new Projector());
    expect(f.emitted).toHaveLength(0);
  });

  it('HP-06 legacy ADR-0016 record: migrateKeyHolders lets a non-designated GM holding the key answer', async () => {
    const gm2 = makeUser('gm2', 'Bo', { isGM: true });
    f.users.push(gm2, makeUser('g2a', 'Luca (G2)', { flags: { evenfoundryvtt: { g2For: 'p1' } } }));
    g2Id = 'g2a';
    deviceKey = generateDeviceKey();
    await upsertDevice(
      {
        g2UserId: 'g2a',
        playerUserId: 'p1',
        actorId: 'mira',
        label: 'Luca (G2)',
        createdAt: 1,
        lastSeenAt: null,
        pendingRotation: false,
      },
      deviceKey,
    );
    (f.game.users as { activeGM: unknown }).activeGM = gm2;
    const projector = new Projector();
    await appSend({ t: 'ping', rid: 'a' }, deviceKey, projector);
    expect(f.emitted).toHaveLength(0); // legacy: only the designated GM is assumed to hold it
    await expect(migrateKeyHolders()).resolves.toBe(1);
    await expect(migrateKeyHolders()).resolves.toBe(0);
    expect(getDevice('g2a')?.meta.keyHolder).toBe('gm1');
    await appSend({ t: 'ping', rid: 'b' }, deviceKey, projector);
    expect(await received(deviceKey)).toEqual([{ t: 'pong', rid: 'b' }]);
  });

  it('HP-07 pairing on behalf of an enabled player: GM custody, self flags cleared, rotated password re-delivered', async () => {
    await selfPaired();
    becomeClient(f, 'gm1', browsers, null);
    const session = await startPairing('p1', 'mira');
    expect(readSelfDevice(player)).toBeNull();
    expect(getDevice(g2Id)?.meta).toMatchObject({ keyHolder: 'gm1', pendingRotation: true });
    const key = readPairingFragment(new URL(session.url).hash)?.k ?? '';
    const projector = new Projector();
    await appSend({ t: 'hello', rid: 'h', proto: 1, app: 'g2' }, key, projector);
    const [welcome] = await received(key);
    const rotated = (welcome as { rotate: { password: string } }).rotate.password;
    expect(rotated).toEqual(expect.any(String));
    // The enabled player can still open the (new) password from their browser.
    expect(getAccess('p1')?.sealed).not.toBeNull();
    becomeClient(f, 'p1', browsers, null);
    await expect(openMyPassword()).resolves.toBe(rotated);
  });

  it('HP-08 revoke seals {t:"revoked"} with a GM-sealed key the GM never stored', async () => {
    await selfPaired();
    becomeClient(f, 'gm1', browsers, null);
    const projector = new Projector();
    await projector.revoke(g2Id);
    expect(await received(deviceKey)).toEqual([{ t: 'revoked' }]);
    expect(f.socketHandlers.has(DIRECT_SOCKET_EVENT)).toBe(false);
  });
});
