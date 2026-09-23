import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../state/app-store.js';
import { MemoryStorage } from './__fixtures__/direct-fixtures.js';
import { loadSettings, SETTINGS_STORAGE_KEY, saveSettings } from './settings.js';

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
