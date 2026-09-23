/**
 * ADR-0013 — identity keys, self-pairing flags, custody sync on `ready` / `updateUser`,
 * player-client targets.
 */
import { generateIdentityKeyPair } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FoundryMock,
  installFoundry,
  type MockUser,
  makeActor,
  makeUser,
} from '../__tests__/direct-fixtures.js';
import { changesPublicKey, onPublicKeyChanged, startCustodySync } from './custody-sync.js';
import { enableGlasses, getAccess } from './glasses-access.js';
import { readGmKeys, readSelfDevice, writeSelfFlags } from './glasses-flags.js';
import {
  ensureIdentity,
  IDENTITY_SETTING,
  keyIdOf,
  myPrivateKey,
  publicKeyOf,
  registerIdentitySettings,
} from './identity-keys.js';
import { applyOwnTargets } from './own-targets.js';

let f: FoundryMock;
let player: MockUser;

beforeEach(() => {
  player = makeUser('p1', 'Luca');
  f = installFoundry({
    users: [player],
    actors: [makeActor('mira', 'Mira', { ownership: { p1: 3 } })],
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('identity keys', () => {
  it('ID-01 registers a client setting; creates, stores and publishes the key once', async () => {
    registerIdentitySettings();
    expect((f.game.settings as { register: unknown }).register).toHaveBeenCalledWith(
      'evenfoundryvtt',
      IDENTITY_SETTING,
      expect.objectContaining({ scope: 'client' }),
    );
    await expect(myPrivateKey()).resolves.toBeNull();
    const pub = await ensureIdentity();
    expect(publicKeyOf(f.game.user)).toEqual(pub);
    expect(JSON.stringify(f.game.user.flags)).not.toContain('"d"');
    const update = f.game.user.update;
    update.mockClear();
    await expect(ensureIdentity()).resolves.toEqual(pub);
    expect(update).not.toHaveBeenCalled();
    const priv = await myPrivateKey();
    expect(priv).not.toBeNull();
    await expect(myPrivateKey()).resolves.toBe(priv); // cached
  });

  it('ID-02 corrupted storage regenerates; a refused publication is logged, not thrown', async () => {
    f.settings.set(`evenfoundryvtt.${IDENTITY_SETTING}`, {
      publicJwk: { kty: 'EC' },
      privateJwk: {},
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    f.game.user.update.mockRejectedValueOnce(new Error('denied'));
    const pub = await ensureIdentity();
    expect(keyIdOf(pub)).toHaveLength(43);
    expect(warn).toHaveBeenCalledWith(
      '[EVF] could not publish the identity key on this user',
      expect.any(Error),
    );
    f.settings.set(`evenfoundryvtt.${IDENTITY_SETTING}`, 'garbage');
    await expect(myPrivateKey()).resolves.toBeNull();
    expect(publicKeyOf(undefined)).toBeNull();
  });
});

describe('self-pairing flags', () => {
  it('GF-01 write merges, null deletes, invalid entries are dropped on read', async () => {
    const device = {
      g2UserId: 'g',
      actorId: 'a',
      pendingRotation: true,
      playerHasKey: true,
      updatedAt: 1,
    };
    await writeSelfFlags(player, { device });
    await writeSelfFlags(player, {}); // no-op
    expect(readSelfDevice(player)).toEqual(device);
    player.flags.evenfoundryvtt = {
      ...player.flags.evenfoundryvtt,
      gmKeys: { gm1: { for: 'x' }, gm2: 'y' },
    };
    expect(readGmKeys(player)).toEqual({});
    player.flags.evenfoundryvtt = { ...player.flags.evenfoundryvtt, gmKeys: 'garbage' };
    expect(readGmKeys(player)).toEqual({});
    await writeSelfFlags(player, { device: null, gmKeys: null });
    expect(player.flags.evenfoundryvtt).toEqual({});
    await expect(writeSelfFlags({ id: 'x' }, { device: null })).rejects.toThrow('not updatable');
  });
});

describe('custody sync', () => {
  it('CS-01 changesPublicKey detects pub flag changes only', () => {
    expect(changesPublicKey({ flags: { evenfoundryvtt: { pub: {} } } })).toBe(true);
    expect(changesPublicKey({ flags: { evenfoundryvtt: { device: {} } } })).toBe(false);
    expect(changesPublicKey({ name: 'x' })).toBe(false);
    expect(changesPublicKey(null)).toBe(false);
  });

  it('CS-02 GM ready: identity published, ownership mirror + updateUser hooks; a new player key re-seals the password', async () => {
    const hooks = await startCustodySync();
    expect(hooks).toHaveLength(3);
    expect(publicKeyOf(f.game.user)).not.toBeNull();
    await enableGlasses('p1');
    expect(getAccess('p1')?.sealed).toBeNull();
    const pair = await generateIdentityKeyPair();
    player.flags = {
      ...player.flags,
      evenfoundryvtt: { ...player.flags.evenfoundryvtt, pub: pair.publicJwk },
    };
    f.fire('updateUser', player, { flags: { evenfoundryvtt: { pub: pair.publicJwk } } });
    f.fire('updateUser', player, { name: 'ignored' });
    await vi.waitFor(() => expect(getAccess('p1')?.sealedFor).toBe(pair.publicJwk.x));
  });

  it('CS-03 player ready: reconciles + re-seals; a GM key change triggers re-sealing; errors are logged', async () => {
    f.game.user = player;
    const hooks = await startCustodySync();
    expect(hooks).toHaveLength(1);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gm = f.users[0] as MockUser;
    // No device yet: nothing to re-seal, no error.
    await onPublicKeyChanged(gm);
    await onPublicKeyChanged(player);
    expect(error).not.toHaveBeenCalled();
    // A failing re-seal is logged by the hook wrapper.
    player.flags = {
      evenfoundryvtt: {
        ...player.flags.evenfoundryvtt,
        device: {
          g2UserId: 'g2a',
          actorId: 'mira',
          pendingRotation: false,
          playerHasKey: true,
          updatedAt: 1,
        },
      },
    };
    f.settings.set('evenfoundryvtt.g2Devices', {
      g2a: {
        g2UserId: 'g2a',
        playerUserId: 'p1',
        actorId: 'mira',
        label: 'L',
        createdAt: 1,
        lastSeenAt: null,
        pendingRotation: false,
      },
    });
    f.settings.set('evenfoundryvtt.g2DeviceKeys', { g2a: 'k'.repeat(43) });
    gm.flags = {
      evenfoundryvtt: { pub: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'B'.repeat(43) } },
    };
    f.fire('updateUser', gm, { flags: { evenfoundryvtt: { pub: {} } } });
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        '[EVF] custody sync: re-sealing after a key change failed',
        expect.anything(),
      ),
    );
  });
});

describe('player-client targets', () => {
  it('OT-01 targets tokens on this canvas, first one releasing others; reports missing ones', () => {
    const a = { setTarget: vi.fn() };
    const b = { setTarget: vi.fn() };
    vi.stubGlobal('canvas', { tokens: { get: (id: string) => ({ a, b })[id as 'a' | 'b'] } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(applyOwnTargets(['a', 'zz', 'b'])).toEqual(['zz']);
    expect(a.setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(b.setTarget).toHaveBeenCalledWith(true, { releaseOthers: false });
    expect(warn).toHaveBeenCalledTimes(1);
    vi.stubGlobal('canvas', null);
    expect(applyOwnTargets([])).toEqual([]);
    expect(applyOwnTargets(['a'])).toEqual(['a']);
  });
});
