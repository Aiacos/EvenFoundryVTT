/**
 * ADR-0013 §Confirmation — GM enablement, sealed password delivery, regeneration,
 * ownership mirroring.
 */
import {
  generateIdentityKeyPair,
  type IdentityKeyPair,
  normalizeManualCode,
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
import {
  ACCESS_SETTING,
  deliverPassword,
  eligiblePlayers,
  enableGlasses,
  getAccess,
  isDesignatedGm,
  mirrorActor,
  openMyPassword,
  ownershipPatch,
  refreshSealedPasswords,
  regeneratePassword,
  registerAccessSettings,
  registerOwnershipMirror,
  removeAccess,
} from './glasses-access.js';
import { getDevice, upsertDevice } from './pairing-store.js';

let f: FoundryMock;
let player: MockUser;
let playerId: IdentityKeyPair;
const browsers = new Map<string, Map<string, unknown>>();

beforeEach(async () => {
  browsers.clear();
  player = makeUser('p1', 'Luca', { character: { id: 'mira' } });
  f = installFoundry({
    users: [player, makeUser('p2', 'Bea')],
    actors: [
      makeActor('mira', 'Mira', { ownership: { p1: 3, default: 0 } }),
      makeActor('orc', 'Orc', { type: 'npc', ownership: { default: 1 } }),
    ],
  });
  playerId = await generateIdentityKeyPair();
  player.flags = { evenfoundryvtt: { pub: playerId.publicJwk } };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function g2Of(id: string): MockUser {
  const u = f.users.find((x) => x.flags.evenfoundryvtt?.g2For === id);
  if (u === undefined) throw new Error('no g2 user');
  return u;
}

describe('glasses enablement (GM)', () => {
  it('GA-01 registers a world setting; eligible players exclude GMs and G2 users', async () => {
    registerAccessSettings();
    expect((f.game.settings as { register: unknown }).register).toHaveBeenCalledWith(
      'evenfoundryvtt',
      ACCESS_SETTING,
      expect.objectContaining({ scope: 'world' }),
    );
    await enableGlasses('p1');
    expect(eligiblePlayers().map((u) => u.id)).toEqual(['p1', 'p2']);
  });

  it('GA-02 enable: G2 user + device without GM key + password sealed for the player only', async () => {
    const g2Id = await enableGlasses('p1', 5);
    const g2 = g2Of('p1');
    expect(g2.id).toBe(g2Id);
    expect(getDevice(g2Id)).toEqual({
      meta: expect.objectContaining({ playerUserId: 'p1', actorId: 'mira', keyHolder: null }),
      key: null,
    });
    const access = getAccess('p1');
    expect(access).toMatchObject({ g2UserId: g2Id, sealedFor: playerId.publicJwk.x, updatedAt: 5 });
    // The world record holds ciphertext only.
    const password = (g2 as unknown as { password: string }).password;
    expect(normalizeManualCode(password)).toBe(password);
    expect(JSON.stringify(f.settings.get(`evenfoundryvtt.${ACCESS_SETTING}`))).not.toContain(
      password,
    );
    // The GM browser cannot open it; the player's browser can.
    await expect(openMyPassword()).resolves.toBeNull();
    becomeClient(f, 'p1', browsers, playerId);
    await expect(openMyPassword()).resolves.toBe(password);
    // Ownership mirrored: the G2 user owns what the player owns.
    expect(f.actors.get('mira')?.ownership).toMatchObject({ [g2Id]: 3 });
    expect(f.actors.get('orc')?.ownership).toMatchObject({ [g2Id]: 1 });
  });

  it('GA-03 a player without a published key gets a null seal ("waiting"), refreshed on key publication', async () => {
    player.flags = {};
    await enableGlasses('p1');
    expect(getAccess('p1')).toMatchObject({ sealed: null, sealedFor: null });
    await expect(refreshSealedPasswords()).resolves.toEqual([]);
    player.flags = { evenfoundryvtt: { pub: playerId.publicJwk } };
    await expect(refreshSealedPasswords()).resolves.toEqual(['p1']);
    becomeClient(f, 'p1', browsers, playerId);
    await expect(openMyPassword()).resolves.toBe(
      (g2Of('p1') as unknown as { password: string }).password,
    );
  });

  it('GA-04 regenerate issues a new password; unknown / non-GM paths are refused or no-ops', async () => {
    await enableGlasses('p1');
    const before = (g2Of('p1') as unknown as { password: string }).password;
    await regeneratePassword('p1');
    const after = (g2Of('p1') as unknown as { password: string }).password;
    expect(after).not.toBe(before);
    await expect(regeneratePassword('p2')).rejects.toThrow('not enabled');
    await expect(enableGlasses('gm1')).rejects.toThrow('cannot own glasses');
    await expect(enableGlasses('ghost')).rejects.toThrow('cannot own glasses');
    await expect(deliverPassword('p2', 'x', 'pw')).resolves.toBe(false); // not enabled
    f.game.user.isGM = false;
    await expect(deliverPassword('p1', g2Of('p1').id, 'pw')).resolves.toBe(false);
    await expect(refreshSealedPasswords()).resolves.toEqual([]);
  });

  it('GA-05 re-enabling keeps createdAt / actor and drops a key this GM held from an on-behalf pairing', async () => {
    const g2Id = await enableGlasses('p1', 1);
    await upsertDevice(
      { ...(getDevice(g2Id)?.meta ?? ({} as never)), keyHolder: 'gm1' },
      'k'.repeat(43),
    );
    await enableGlasses('p1', 9);
    expect(getDevice(g2Id)).toEqual({
      meta: expect.objectContaining({ createdAt: 1, keyHolder: null }),
      key: null,
    });
  });

  it('GA-06 enable picks an owned character when the player has none assigned; removeAccess forgets', async () => {
    const g2Id = await enableGlasses('p2');
    expect(getDevice(g2Id)?.meta.actorId).toBe('');
    player.character = null;
    const id1 = await enableGlasses('p1');
    expect(getDevice(id1)?.meta.actorId).toBe('mira');
    await removeAccess('p1');
    await removeAccess('p1');
    expect(getAccess('p1')).toBeNull();
  });

  it('GA-07 corrupted access records degrade to "not enabled"', () => {
    f.settings.set(`evenfoundryvtt.${ACCESS_SETTING}`, { p1: { g2UserId: 1 }, p2: 'x' });
    expect(getAccess('p1')).toBeNull();
    f.settings.set(`evenfoundryvtt.${ACCESS_SETTING}`, 'garbage');
    expect(getAccess('p1')).toBeNull();
  });
});

describe('ownership mirroring', () => {
  it('GA-10 ownershipPatch mirrors explicit level, else default, else NONE; null when in sync', () => {
    const pairs = [
      { playerUserId: 'p1', g2UserId: 'g1' },
      { playerUserId: 'p2', g2UserId: 'g2' },
    ];
    expect(ownershipPatch({ p1: 3, default: 1 }, pairs)).toEqual({ g1: 3, g2: 1 });
    expect(ownershipPatch({ p1: 3 }, pairs)).toEqual({ g1: 3, g2: 0 });
    expect(ownershipPatch({ p1: 3, g1: 3, g2: 0 }, pairs)).toBeNull();
  });

  it('GA-11 hooks mirror on createActor / updateActor(ownership) on the designated GM only', async () => {
    const g2Id = await enableGlasses('p1');
    const ids = registerOwnershipMirror();
    expect(ids).toHaveLength(2);
    const fresh = makeActor('new', 'New', { ownership: { p1: 3 } });
    f.fire('createActor', fresh);
    await vi.waitFor(() => expect(fresh.ownership).toMatchObject({ [g2Id]: 3 }));

    const mira = f.actors.get('mira') as {
      ownership: Record<string, number>;
      update: ReturnType<typeof vi.fn>;
    };
    mira.ownership = { p1: 2, [g2Id]: 3 };
    mira.update.mockClear();
    f.fire('updateActor', mira, { name: 'x' }); // not an ownership change
    expect(mira.update).not.toHaveBeenCalled();
    f.fire('updateActor', mira, { ownership: { p1: 2 } });
    await vi.waitFor(() => expect(mira.ownership[g2Id]).toBe(2));

    // Another GM is the designated one: this client stays silent.
    (f.game.users as { activeGM: unknown }).activeGM = makeUser('gm2', 'Bo', { isGM: true });
    expect(isDesignatedGm()).toBe(false);
    mira.update.mockClear();
    f.fire('updateActor', mira, { ownership: { p1: 3 } });
    mira.ownership.p1 = 3;
    expect(mira.update).not.toHaveBeenCalled();
  });

  it('GA-12 mirror failures are logged; actors without update are skipped', async () => {
    await enableGlasses('p1');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerOwnershipMirror();
    const broken = makeActor('b', 'B', { ownership: { p1: 3 } });
    (broken.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('denied'));
    f.fire('createActor', broken);
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        '[EVF] could not mirror actor ownership to the G2 user',
        expect.any(Error),
      ),
    );
    await expect(
      mirrorActor({ id: 'x', name: 'X', type: 'npc', ownership: { p1: 3 } } as never),
    ).resolves.toBe(false);
  });
});
