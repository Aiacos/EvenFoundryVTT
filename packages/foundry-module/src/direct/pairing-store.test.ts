import { generateDeviceKey, generateRoomId } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FoundryMock, installFoundry } from '../__tests__/direct-fixtures.js';
import {
  getPairing,
  listPairings,
  PAIRINGS_SETTING,
  type Pairing,
  pruneExpired,
  registerPairingSettings,
  removePairing,
  savePairing,
  updatePairing,
} from './pairing-store.js';

function pairing(id: string, extra: Partial<Pairing> = {}): Pairing {
  return {
    deviceId: id,
    room: generateRoomId(),
    key: generateDeviceKey(),
    actorId: `a-${id}`,
    label: `Hero ${id}`,
    createdAt: 1000,
    lastSeenAt: null,
    expiresAt: null,
    ...extra,
  };
}

let foundry: FoundryMock;

beforeEach(() => {
  foundry = installFoundry();
});
afterEach(() => vi.unstubAllGlobals());

describe('pairing store (client scope, ADR-0019)', () => {
  it('PS-01 registers one hidden client-scope setting', () => {
    registerPairingSettings();
    const settings = foundry.game.settings as { register: ReturnType<typeof vi.fn> };
    expect(settings.register).toHaveBeenCalledWith('evenfoundryvtt', PAIRINGS_SETTING, {
      scope: 'client',
      config: false,
      type: Object,
      default: {},
    });
  });

  it('PS-02 saves, lists (oldest first), gets, updates and removes', async () => {
    await savePairing(pairing('b', { createdAt: 2000 }));
    await savePairing(pairing('a', { createdAt: 1000 }));
    expect(listPairings().map((p) => p.deviceId)).toEqual(['a', 'b']);
    expect(getPairing('a')?.label).toBe('Hero a');
    expect(await updatePairing('a', { lastSeenAt: 5 })).toMatchObject({ lastSeenAt: 5 });
    expect(await updatePairing('nope', { lastSeenAt: 5 })).toBeNull();
    await removePairing('a');
    await removePairing('a');
    expect(getPairing('a')).toBeNull();
    expect(listPairings()).toHaveLength(1);
  });

  it('PS-03 ignores corrupted or mismatched records instead of throwing', () => {
    foundry.settings.set(`evenfoundryvtt.${PAIRINGS_SETTING}`, {
      good: pairing('good'),
      wrongId: pairing('other'),
      bad: { deviceId: 'bad', room: 'x' },
    });
    expect(listPairings().map((p) => p.deviceId)).toEqual(['good']);
    foundry.settings.set(`evenfoundryvtt.${PAIRINGS_SETTING}`, 'garbage');
    expect(listPairings()).toEqual([]);
  });

  it('PS-04 rejects invalid pairings on write', async () => {
    await expect(savePairing({ ...pairing('x'), room: 'short' })).rejects.toThrow();
  });

  it('PS-05 prunes only expired, never-connected pairings', async () => {
    await savePairing(pairing('old', { expiresAt: 100 }));
    await savePairing(pairing('fresh', { expiresAt: 10_000 }));
    await savePairing(pairing('paired'));
    expect(await pruneExpired(500)).toEqual(['old']);
    expect(await pruneExpired(500)).toEqual([]);
    expect(
      listPairings()
        .map((p) => p.deviceId)
        .sort(),
    ).toEqual(['fresh', 'paired']);
  });
});
