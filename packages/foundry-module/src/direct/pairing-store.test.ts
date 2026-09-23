import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FoundryMock, installFoundry } from '../__tests__/direct-fixtures.js';
import {
  DEVICE_KEYS_SETTING,
  DEVICES_SETTING,
  type DeviceMeta,
  getDevice,
  listDevices,
  registerPairingSettings,
  removeDevice,
  setDeviceKey,
  TOUCH_PERSIST_INTERVAL_MS,
  touchDevice,
  updateDeviceMeta,
  upsertDevice,
} from './pairing-store.js';

const KEY = 'k'.repeat(43);

function meta(id: string, extra: Partial<DeviceMeta> = {}): DeviceMeta {
  return {
    g2UserId: id,
    playerUserId: `p-${id}`,
    actorId: `a-${id}`,
    label: `${id} (G2)`,
    createdAt: 1000,
    lastSeenAt: null,
    pendingRotation: true,
    ...extra,
  };
}

let foundry: FoundryMock;

beforeEach(() => {
  foundry = installFoundry();
});
afterEach(() => vi.unstubAllGlobals());

describe('pairing-store', () => {
  it('PS-01 registers a world-scope metadata setting and a client-scope key setting', () => {
    registerPairingSettings();
    const register = (foundry.game.settings as { register: ReturnType<typeof vi.fn> }).register;
    expect(register).toHaveBeenCalledWith(
      'evenfoundryvtt',
      DEVICES_SETTING,
      expect.objectContaining({ scope: 'world', config: false }),
    );
    expect(register).toHaveBeenCalledWith(
      'evenfoundryvtt',
      DEVICE_KEYS_SETTING,
      expect.objectContaining({ scope: 'client', config: false }),
    );
  });

  it('PS-02 secret split: the key never lands in the world setting', async () => {
    await upsertDevice(meta('u1'), KEY);
    const world = JSON.stringify(foundry.settings.get(`evenfoundryvtt.${DEVICES_SETTING}`));
    expect(world).not.toContain(KEY);
    expect(foundry.settings.get(`evenfoundryvtt.${DEVICE_KEYS_SETTING}`)).toEqual({ u1: KEY });
    expect(getDevice('u1')).toEqual({ meta: meta('u1'), key: KEY });
  });

  it('PS-03 list is sorted by createdAt; unknown device → null; missing key → key null', async () => {
    await upsertDevice(meta('b', { createdAt: 2000 }), KEY);
    await upsertDevice(meta('a', { createdAt: 1000 }), KEY);
    expect(listDevices().map((d) => d.g2UserId)).toEqual(['a', 'b']);
    expect(getDevice('zzz')).toBeNull();
    foundry.settings.set(`evenfoundryvtt.${DEVICE_KEYS_SETTING}`, {});
    expect(getDevice('a')?.key).toBeNull();
  });

  it('PS-04 corrupted settings degrade to empty', () => {
    foundry.settings.set(`evenfoundryvtt.${DEVICES_SETTING}`, {
      bad: { g2UserId: 'bad' },
      mismatch: meta('other'),
      ok: meta('ok'),
    });
    foundry.settings.set(`evenfoundryvtt.${DEVICE_KEYS_SETTING}`, { ok: 42 });
    expect(listDevices().map((d) => d.g2UserId)).toEqual(['ok']);
    expect(getDevice('ok')?.key).toBeNull();
    foundry.settings.set(`evenfoundryvtt.${DEVICES_SETTING}`, 'garbage');
    foundry.settings.set(`evenfoundryvtt.${DEVICE_KEYS_SETTING}`, null);
    expect(listDevices()).toEqual([]);
  });

  it('PS-05 setDeviceKey / updateDeviceMeta / removeDevice', async () => {
    await upsertDevice(meta('u1'), KEY);
    await setDeviceKey('u1', 'n'.repeat(43));
    await updateDeviceMeta('u1', { pendingRotation: false });
    await updateDeviceMeta('ghost', { pendingRotation: false });
    expect(getDevice('u1')).toEqual({
      meta: meta('u1', { pendingRotation: false }),
      key: 'n'.repeat(43),
    });
    await removeDevice('u1');
    expect(getDevice('u1')).toBeNull();
    expect(foundry.settings.get(`evenfoundryvtt.${DEVICE_KEYS_SETTING}`)).toEqual({});
  });

  it('PS-06 touch persists lastSeen at most once per interval', async () => {
    await upsertDevice(meta('u1'), KEY);
    expect(await touchDevice('u1', 10_000)).toBe(true);
    expect(await touchDevice('u1', 10_000 + TOUCH_PERSIST_INTERVAL_MS - 1)).toBe(false);
    expect(await touchDevice('u1', 10_000 + TOUCH_PERSIST_INTERVAL_MS)).toBe(true);
    expect(getDevice('u1')?.meta.lastSeenAt).toBe(10_000 + TOUCH_PERSIST_INTERVAL_MS);
    expect(await touchDevice('nobody', 1)).toBe(false);
  });
});
