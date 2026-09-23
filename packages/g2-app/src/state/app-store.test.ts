import { describe, expect, it, vi } from 'vitest';
import { createAppStore, DEFAULT_SETTINGS, initialState, resolveLocale } from './app-store.js';

describe('createAppStore', () => {
  it('shallow-merges patches and notifies listeners with previous state', () => {
    const store = createAppStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.update({ log: { events: [] } as never });
    store.update((s) => ({ connection: { ...s.connection, status: 'connecting' } }));
    expect(store.get().connection.status).toBe('connecting');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[1].connection.status).toBe('unpaired');
    off();
    store.update({ map: null });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('resolveLocale', () => {
  it('prefers the explicit setting', () => {
    const s = { ...initialState(), settings: { ...DEFAULT_SETTINGS, locale: 'en' as const } };
    expect(
      resolveLocale({ ...s, connection: { status: 'online', foundryLocale: 'it' } }, 'it'),
    ).toBe('en');
  });

  it("follows Foundry's language when set to auto, then the phone, then English", () => {
    const s = initialState();
    expect(
      resolveLocale({ ...s, connection: { status: 'online', foundryLocale: 'it' } }, 'en-US'),
    ).toBe('it');
    expect(resolveLocale(s, 'it-IT')).toBe('it');
    expect(resolveLocale(s, 'de-DE')).toBe('en');
    expect(resolveLocale(s)).toBe('en');
  });
});
