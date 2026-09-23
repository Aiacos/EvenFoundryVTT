import { deriveKeyFromManualCode, readPairingFragment } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FoundryMock,
  installFoundry,
  makeActor,
  makeUser,
} from '../__tests__/direct-fixtures.js';
import { enableGlasses, getAccess } from './glasses-access.js';
import {
  checkEnvironment,
  expirePairing,
  foundryBaseUrl,
  isLoopbackHost,
  PAIRING_TTL_MS,
  revokePairing,
  startPairing,
} from './pairing-flow.js';
import { getDevice } from './pairing-store.js';

let f: FoundryMock;
const thorin = () => makeActor('thorin', 'Thorin', { ownership: { p1: 3 } });

beforeEach(() => {
  f = installFoundry({
    users: [makeUser('p1', 'Luca')],
    actors: [thorin(), makeActor('mira', 'Mira', { ownership: { p1: 3 } })],
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pairing-flow', () => {
  it('PF-01 foundryBaseUrl includes the route prefix without trailing slash', () => {
    expect(foundryBaseUrl()).toBe(`${window.location.origin}/vtt`);
  });

  it('PF-02 startPairing: user + ownership + stored device + QR carrying the manual-code credentials', async () => {
    const session = await startPairing('p1', 'thorin', 5_000);
    const g2 = f.users.find((u) => u.name === 'Luca (G2)');
    expect(g2).toBeDefined();
    expect(session).toMatchObject({
      label: 'Luca (G2)',
      actorName: 'Thorin',
      expiresAt: 5_000 + PAIRING_TTL_MS,
    });
    expect(session.code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    expect(session.qrSvg).toContain('<svg');

    const payload = readPairingFragment(new URL(session.url).hash);
    expect(
      session.url.startsWith(
        `${window.location.origin}/vtt/modules/evenfoundryvtt/g2/index.html#evf=`,
      ),
    ).toBe(true);
    expect(payload?.u).toBe(g2?.id);
    const code = session.code ?? '';
    expect(payload?.p).toBe(code.replaceAll('-', ''));
    expect(payload?.k).toBe(await deriveKeyFromManualCode(code, g2?.id ?? ''));

    const device = getDevice(g2?.id ?? '');
    expect(device?.key).toBe(payload?.k);
    expect(device?.meta).toMatchObject({
      playerUserId: 'p1',
      actorId: 'thorin',
      pendingRotation: true,
      createdAt: 5_000,
    });
    expect((f.actors.get('thorin') as { ownership: Record<string, number> }).ownership).toEqual({
      p1: 3,
      [g2?.id ?? '']: 3,
    });
  });

  it('PF-03 re-pairing keeps createdAt, moves ownership to the new actor', async () => {
    const first = await startPairing('p1', 'thorin', 1_000);
    await startPairing('p1', 'mira', 9_000);
    expect(getDevice(first.g2UserId)?.meta).toMatchObject({ actorId: 'mira', createdAt: 1_000 });
    expect(
      (f.actors.get('thorin') as { ownership: Record<string, number> }).ownership[first.g2UserId],
    ).toBe(0);
  });

  it('PF-04 startPairing rejects unknown player / actor', async () => {
    await expect(startPairing('nobody', 'thorin')).rejects.toThrow(/player/);
    await expect(startPairing('p1', 'nobody')).rejects.toThrow(/actor/);
    (f.actors.get('mira') as { ownership: Record<string, number> }).ownership = {};
    await expect(startPairing('p1', 'mira')).rejects.toThrow(/does not own actor mira/);
  });

  it('PF-05 expirePairing rotates unused credentials only', async () => {
    const session = await startPairing('p1', 'thorin');
    const before = getDevice(session.g2UserId)?.key;
    expect(await expirePairing(session.g2UserId)).toBe(true);
    expect(getDevice(session.g2UserId)?.key).not.toBe(before);
    const g2 = f.users.find((u) => u.id === session.g2UserId);
    expect(g2?.update).toHaveBeenLastCalledWith({
      password: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/),
    });
    f.settings.set('evenfoundryvtt.g2Devices', {
      [session.g2UserId]: { ...getDevice(session.g2UserId)?.meta, pendingRotation: false },
    });
    expect(await expirePairing(session.g2UserId)).toBe(false);
    expect(await expirePairing('ghost')).toBe(false);
  });

  it('PF-06 revokePairing notifies first, then deletes user + device even if notify fails', async () => {
    const session = await startPairing('p1', 'thorin');
    const order: string[] = [];
    const g2 = f.users.find((u) => u.id === session.g2UserId);
    g2?.delete.mockImplementation(async () => order.push('delete'));
    await revokePairing(session.g2UserId, async () => {
      order.push('notify');
    });
    expect(order).toEqual(['notify', 'delete']);
    expect(getDevice(session.g2UserId)).toBeNull();

    const again = await startPairing('p1', 'thorin');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await revokePairing(again.g2UserId, async () => {
      throw new Error('offline');
    });
    expect(warn).toHaveBeenCalled();
    expect(getDevice(again.g2UserId)).toBeNull();
  });

  it('PF-06b revoking an enabled player also forgets the enablement and self-pairing flags', async () => {
    const g2Id = await enableGlasses('p1');
    const player = f.users.find((u) => u.id === 'p1');
    if (player === undefined) throw new Error('p1');
    player.flags = {
      evenfoundryvtt: {
        device: {
          g2UserId: g2Id,
          actorId: 'thorin',
          pendingRotation: false,
          playerHasKey: true,
          updatedAt: 1,
        },
      },
    };
    await revokePairing(g2Id, async () => undefined);
    expect(getAccess('p1')).toBeNull();
    expect(player.flags.evenfoundryvtt).toEqual({});
  });

  it('PF-07 checkEnvironment reports https / served / socket', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('net'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await checkEnvironment()).toEqual({
      https: window.location.protocol === 'https:',
      served: true,
      socket: true,
      publicHost: !isLoopbackHost(window.location.hostname),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${window.location.origin}/vtt/modules/evenfoundryvtt/g2/index.html`,
      {
        method: 'HEAD',
      },
    );
    (f.game.socket as { connected: boolean }).connected = false;
    expect(await checkEnvironment()).toMatchObject({ served: false, socket: false });
  });

  it('PF-08 isLoopbackHost flags addresses the phone cannot reach', () => {
    for (const host of [
      'localhost',
      'LOCALHOST',
      'foundry.localhost',
      '127.0.0.1',
      '127.1.2.3',
      '[::1]',
      '::1',
    ]) {
      expect(isLoopbackHost(host)).toBe(true);
    }
    for (const host of [
      'foundry.example.com',
      '192.168.1.10',
      'vtt.tail1234.ts.net',
      '1127.0.0.1',
    ]) {
      expect(isLoopbackHost(host)).toBe(false);
    }
  });
});
