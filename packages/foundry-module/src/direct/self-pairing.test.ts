/**
 * ADR-0017 §Confirmation — self-service pairing from the player's client and key
 * custody for multiple GMs.
 */
import {
  deriveKeyFromManualCode,
  deviceKeyContext,
  generateIdentityKeyPair,
  type IdentityKeyPair,
  importIdentityPrivateKey,
  openSealed,
  readPairingFragment,
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
import { deliverPassword, enableGlasses, regeneratePassword } from './glasses-access.js';
import { readGmKeys, readSelfDevice } from './glasses-flags.js';
import { PAIRING_TTL_MS } from './pairing-flow.js';
import { getDevice } from './pairing-store.js';
import {
  expireSelfPairing,
  ownedCharacters,
  reconcileSelfCustody,
  resealForGms,
  rotateSelfKey,
  SelfPairingError,
  startSelfPairing,
} from './self-pairing.js';

let f: FoundryMock;
let player: MockUser;
let gm2: MockUser;
let ids: Record<'gm1' | 'gm2' | 'p1', IdentityKeyPair>;
const browsers = new Map<string, Map<string, unknown>>();
let g2Id: string;

async function gmCanOpen(gmId: 'gm1' | 'gm2', key: string): Promise<boolean> {
  const entry = readGmKeys(player)[gmId];
  const priv = await importIdentityPrivateKey(ids[gmId].privateJwk);
  return (await openSealed(priv, entry?.blob, deviceKeyContext(g2Id, gmId))) === key;
}

beforeEach(async () => {
  browsers.clear();
  player = makeUser('p1', 'Luca');
  gm2 = makeUser('gm2', 'Bo', { isGM: true });
  f = installFoundry({
    users: [player, gm2],
    actors: [
      makeActor('mira', 'Mira', { ownership: { p1: 3 } }),
      makeActor('zed', 'Zed', { ownership: { default: 3 } }),
      makeActor('orc', 'Orc', { type: 'npc', ownership: { p1: 3 } }),
      makeActor('thorin', 'Thorin'),
    ],
  });
  ids = {
    gm1: await generateIdentityKeyPair(),
    gm2: await generateIdentityKeyPair(),
    p1: await generateIdentityKeyPair(),
  };
  becomeClient(f, 'gm1', browsers, ids.gm1);
  gm2.flags = { evenfoundryvtt: { pub: ids.gm2.publicJwk } };
  player.flags = { evenfoundryvtt: { pub: ids.p1.publicJwk } };
  g2Id = await enableGlasses('p1');
  becomeClient(f, 'p1', browsers, ids.p1);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('self-service pairing (player client)', () => {
  it('SP-01 ownedCharacters lists owned characters only, sorted', () => {
    expect(ownedCharacters()).toEqual([
      { id: 'mira', name: 'Mira' },
      { id: 'zed', name: 'Zed' },
    ]);
  });

  it('SP-02 QR + manual code are two views of one secret; key stored locally, announced, sealed for every GM', async () => {
    const session = await startSelfPairing('mira', 100);
    expect(session).toMatchObject({
      g2UserId: g2Id,
      actorName: 'Mira',
      expiresAt: 100 + PAIRING_TTL_MS,
    });
    const payload = readPairingFragment(new URL(session.url).hash);
    const password = (f.users.find((u) => u.id === g2Id) as unknown as { password: string })
      .password;
    expect(payload).toMatchObject({ u: g2Id, p: password });
    expect(session.code?.replaceAll('-', '')).toBe(password);
    expect(payload?.k).toBe(await deriveKeyFromManualCode(password, g2Id));
    expect(session.qrSvg).toContain('<svg');

    expect(getDevice(g2Id)?.key).toBe(payload?.k);
    expect(readSelfDevice(player)).toEqual({
      g2UserId: g2Id,
      actorId: 'mira',
      pendingRotation: true,
      playerHasKey: true,
      updatedAt: 100,
    });
    const key = payload?.k ?? '';
    await expect(gmCanOpen('gm1', key)).resolves.toBe(true);
    await expect(gmCanOpen('gm2', key)).resolves.toBe(true);
    // The key never lands in clear on the User document.
    expect(JSON.stringify(player.flags)).not.toContain(key);
  });

  it('SP-03 rotateSelfKey (first hello): new key stored, pending cleared, re-sealed for the GMs', async () => {
    await startSelfPairing('mira');
    const key = 'n'.repeat(43);
    await rotateSelfKey(g2Id, key, 7);
    expect(getDevice(g2Id)?.key).toBe(key);
    expect(readSelfDevice(player)).toMatchObject({ pendingRotation: false, updatedAt: 7 });
    await expect(gmCanOpen('gm1', key)).resolves.toBe(true);
  });

  it('SP-04 expiry rotates an unused QR only once', async () => {
    const session = await startSelfPairing('mira');
    const first = getDevice(g2Id)?.key;
    await expect(expireSelfPairing(g2Id)).resolves.toBe(true);
    expect(getDevice(g2Id)?.key).not.toBe(first);
    await expect(expireSelfPairing(g2Id)).resolves.toBe(false);
    await expect(expireSelfPairing('other')).resolves.toBe(false);
    expect(session.g2UserId).toBe(g2Id);
  });

  it('SP-05 refusals: not enabled, password not readable (new browser), actor not owned', async () => {
    await expect(startSelfPairing('thorin')).rejects.toMatchObject({ reason: 'no_actor' });
    await expect(startSelfPairing('orc-missing')).rejects.toBeInstanceOf(SelfPairingError);
    // New browser: a fresh identity cannot open the password sealed for the old one.
    becomeClient(f, 'p1', new Map(), await generateIdentityKeyPair());
    await expect(startSelfPairing('mira')).rejects.toMatchObject({ reason: 'password_pending' });
    f.users.push(makeUser('p3', 'Neo'));
    becomeClient(f, 'p3', browsers, await generateIdentityKeyPair());
    await expect(startSelfPairing('mira')).rejects.toMatchObject({ reason: 'not_enabled' });
  });

  it('SP-06 a GM-rotated (random) password: QR only, random key, no manual code', async () => {
    becomeClient(f, 'gm1', browsers, null);
    await deliverPassword('p1', g2Id, 'random-password-not-a-code');
    becomeClient(f, 'p1', browsers, null);
    const session = await startSelfPairing('zed');
    expect(session.code).toBeNull();
    expect(readPairingFragment(new URL(session.url).hash)?.p).toBe('random-password-not-a-code');
  });

  it('SP-07 resealForGms: only when a GM key is new or changed; GMs never re-seal', async () => {
    await expect(resealForGms()).resolves.toBe(false); // nothing paired yet
    await startSelfPairing('mira');
    await expect(resealForGms()).resolves.toBe(false); // up to date
    ids.gm2 = await generateIdentityKeyPair();
    gm2.flags = { evenfoundryvtt: { pub: ids.gm2.publicJwk } };
    await expect(resealForGms()).resolves.toBe(true);
    await expect(gmCanOpen('gm2', getDevice(g2Id)?.key ?? '')).resolves.toBe(true);
    becomeClient(f, 'gm1', browsers, null);
    await expect(resealForGms()).resolves.toBe(false);
  });

  it('SP-08 reconcileSelfCustody tells the election when this browser lost / regained the key', async () => {
    await expect(reconcileSelfCustody()).resolves.toBe(false); // nothing paired
    await startSelfPairing('mira');
    await expect(reconcileSelfCustody()).resolves.toBe(false);
    f.settings.set('evenfoundryvtt.g2DeviceKeys', {});
    await expect(reconcileSelfCustody(3)).resolves.toBe(true);
    expect(readSelfDevice(player)).toMatchObject({ playerHasKey: false, updatedAt: 3 });
    f.settings.set('evenfoundryvtt.g2DeviceKeys', { [g2Id]: 'k'.repeat(43) });
    await expect(reconcileSelfCustody()).resolves.toBe(true);
    expect(readSelfDevice(player)?.playerHasKey).toBe(true);
  });

  it('SP-09 GM regenerates the password: the player opens the new one', async () => {
    becomeClient(f, 'gm1', browsers, null);
    await regeneratePassword('p1');
    becomeClient(f, 'p1', browsers, null);
    const session = await startSelfPairing('mira');
    const password = (f.users.find((u) => u.id === g2Id) as unknown as { password: string })
      .password;
    expect(session.code?.replaceAll('-', '')).toBe(password);
  });
});
