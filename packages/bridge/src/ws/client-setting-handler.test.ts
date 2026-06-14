/**
 * handleClientSetting unit tests (display-settings sync, latency audit 2026-06-14).
 *
 * @see ./client-setting-handler.ts
 */
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../settings/settings-store.js';
import { handleClientSetting } from './client-setting-handler.js';

const noopLogger = { debug: vi.fn() } as unknown as Logger;

describe('handleClientSetting', () => {
  let store: SettingsStore;
  beforeEach(() => {
    store = new SettingsStore();
  });

  it('CSH-01: queues a valid partial client_setting edit', () => {
    handleClientSetting(
      store,
      JSON.stringify({ type: 'client_setting', settings: { brightness: 40 } }),
      noopLogger,
    );
    expect(store.drainPending()).toEqual({ brightness: 40 });
  });

  it('CSH-02: ignores non-JSON input (no throw, nothing queued)', () => {
    expect(() => handleClientSetting(store, 'not json{', noopLogger)).not.toThrow();
    expect(store.drainPending()).toBeNull();
  });

  it('CSH-03: ignores other message types (e.g. client_resume)', () => {
    handleClientSetting(store, JSON.stringify({ type: 'client_resume', last_seq: 5 }), noopLogger);
    expect(store.drainPending()).toBeNull();
  });

  it('CSH-04: ignores an empty settings object (no-op edit)', () => {
    handleClientSetting(
      store,
      JSON.stringify({ type: 'client_setting', settings: {} }),
      noopLogger,
    );
    expect(store.drainPending()).toBeNull();
  });

  it('CSH-05: rejects an out-of-range value via schema (brightness > 100)', () => {
    handleClientSetting(
      store,
      JSON.stringify({ type: 'client_setting', settings: { brightness: 999 } }),
      noopLogger,
    );
    expect(store.drainPending()).toBeNull();
  });

  it('CSH-06: accepts a Buffer payload (ws binary frame)', () => {
    handleClientSetting(
      store,
      Buffer.from(JSON.stringify({ type: 'client_setting', settings: { dither: true } }), 'utf-8'),
      noopLogger,
    );
    expect(store.drainPending()).toEqual({ dither: true });
  });
});
