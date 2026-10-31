import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/app-store.js';
import { MemoryStorage } from './__fixtures__/direct-fixtures.js';
import {
  loadSettings,
  MirroredSettingsStorage,
  SETTINGS_STORAGE_KEY,
  saveSettings,
} from './settings.js';

function sdk(stored: Record<string, string> = {}) {
  return {
    setLocalStorage: vi.fn(async (key: string, value: string) => {
      stored[key] = value;
      return true;
    }),
    getLocalStorage: vi.fn(async (key: string) => stored[key] ?? ''),
  };
}

describe('settings persistence', () => {
  it('returns defaults when nothing is stored or storage is null', () => {
    expect(loadSettings(new MemoryStorage(), vi.fn())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null, vi.fn())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips and keeps valid fields while dropping invalid ones', () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, locale: 'en', mapCellPx: 12 }, vi.fn());
    expect(loadSettings(storage, vi.fn())).toMatchObject({ locale: 'en', mapCellPx: 12 });
    storage.data.set(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ locale: 'fr', mapCellPx: 6, followToken: 'yes' }),
    );
    expect(loadSettings(storage, vi.fn())).toEqual({ ...DEFAULT_SETTINGS, mapCellPx: 6 });
  });

  it('persists the optional map pixel size; invalid values are dropped', () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, mapPixelSize: 3 }, vi.fn());
    expect(loadSettings(storage, vi.fn()).mapPixelSize).toBe(3);
    storage.data.set(SETTINGS_STORAGE_KEY, JSON.stringify({ mapPixelSize: 4 }));
    const loaded = loadSettings(storage, vi.fn());
    expect(loaded).toEqual(DEFAULT_SETTINGS);
    expect('mapPixelSize' in loaded).toBe(false);
  });

  it('falls back to defaults on corrupted JSON or non-object values', () => {
    const storage = new MemoryStorage();
    storage.data.set(SETTINGS_STORAGE_KEY, '{oops');
    expect(loadSettings(storage, vi.fn())).toEqual(DEFAULT_SETTINGS);
    storage.data.set(SETTINGS_STORAGE_KEY, '42');
    expect(loadSettings(storage, vi.fn())).toEqual(DEFAULT_SETTINGS);
  });

  it('warns instead of throwing when storage is blocked', () => {
    const storage = new MemoryStorage();
    storage.failing = true;
    const warn = vi.fn();
    expect(loadSettings(storage, warn)).toEqual(DEFAULT_SETTINGS);
    saveSettings(storage, DEFAULT_SETTINGS, warn);
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      'localStorage getItem failed',
      'localStorage setItem failed',
    ]);
  });
});

describe('MirroredSettingsStorage (SDK key-value mirror, like the credentials)', () => {
  it('mirrors every save into the SDK store once attached', async () => {
    const local = new MemoryStorage();
    const storage = new MirroredSettingsStorage(local, vi.fn());
    const mirror = sdk();
    expect(await storage.attach(mirror)).toBeNull(); // nothing stored anywhere
    saveSettings(storage, { ...DEFAULT_SETTINGS, locale: 'it' }, vi.fn());
    expect(local.data.get(SETTINGS_STORAGE_KEY)).toContain('"it"');
    expect(mirror.setLocalStorage).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
      local.data.get(SETTINGS_STORAGE_KEY),
    );
  });

  it('restores settings from the SDK store when WebView storage lost them', async () => {
    const saved = JSON.stringify({ ...DEFAULT_SETTINGS, locale: 'it', mapCellPx: 12 });
    const local = new MemoryStorage();
    const storage = new MirroredSettingsStorage(local, vi.fn());
    const restored = await storage.attach(sdk({ [SETTINGS_STORAGE_KEY]: saved }));
    expect(restored).toMatchObject({ locale: 'it', mapCellPx: 12 });
    expect(local.data.get(SETTINGS_STORAGE_KEY)).toBe(saved);
    expect(loadSettings(storage, vi.fn())).toMatchObject({ locale: 'it', mapCellPx: 12 });
  });

  it('keeps local settings, and a save made while the mirror was being read', async () => {
    const saved = JSON.stringify({ ...DEFAULT_SETTINGS, locale: 'it' });
    const local = new MemoryStorage();
    local.data.set(SETTINGS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, locale: 'en' }));
    const mirror = sdk({ [SETTINGS_STORAGE_KEY]: saved });
    expect(await new MirroredSettingsStorage(local, vi.fn()).attach(mirror)).toBeNull();
    expect(mirror.getLocalStorage).not.toHaveBeenCalled();

    const empty = new MemoryStorage();
    const racing = new MirroredSettingsStorage(empty, vi.fn());
    const pending = racing.attach(mirror);
    saveSettings(racing, { ...DEFAULT_SETTINGS, locale: 'en' }, vi.fn());
    expect(await pending).toBeNull();
    expect(empty.data.get(SETTINGS_STORAGE_KEY)).toContain('"en"');
  });

  it('reports storage failures instead of throwing', async () => {
    const local = new MemoryStorage();
    local.failing = true;
    const warn = vi.fn();
    const storage = new MirroredSettingsStorage(local, warn);
    const mirror = sdk();
    mirror.getLocalStorage.mockRejectedValueOnce(new Error('ble'));
    expect(await storage.attach(mirror)).toBeNull();
    mirror.setLocalStorage.mockRejectedValueOnce(new Error('ble'));
    saveSettings(storage, DEFAULT_SETTINGS, warn);
    await new Promise((r) => setTimeout(r, 0));
    // The SDK mirror still receives the record when WebView storage is blocked.
    expect(mirror.setLocalStorage).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      'localStorage getItem failed',
      'sdk getLocalStorage failed',
      'localStorage setItem failed',
      'sdk setLocalStorage failed',
    ]);
  });
});
