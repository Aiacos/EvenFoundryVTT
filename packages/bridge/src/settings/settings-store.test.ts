/**
 * SettingsStore unit tests (display-settings sync, latency audit 2026-06-14).
 *
 * @see ./settings-store.ts
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsStore } from './settings-store.js';

describe('SettingsStore', () => {
  let store: SettingsStore;
  beforeEach(() => {
    store = new SettingsStore();
  });

  it('SS-01: getLatest is null before any setLatest (cold cache)', () => {
    expect(store.getLatest()).toBeNull();
  });

  it('SS-02: setLatest replaces the cached snapshot (last-write-wins)', () => {
    store.setLatest({ dither: true, brightness: 10 });
    store.setLatest({ dither: false, brightness: 40, webpQuality: 75 });
    expect(store.getLatest()).toEqual({ dither: false, brightness: 40, webpQuality: 75 });
  });

  it('SS-03: drainPending is null before any queue, and returns + clears once', () => {
    expect(store.drainPending()).toBeNull();
    store.queuePending({ brightness: 50 });
    expect(store.drainPending()).toEqual({ brightness: 50 });
    expect(store.drainPending()).toBeNull(); // cleared after the first drain
  });

  it('SS-04: queuePending merges partial edits (latest-wins per key)', () => {
    store.queuePending({ dither: true, brightness: 10 });
    store.queuePending({ brightness: 80 }); // overrides brightness, keeps dither
    expect(store.drainPending()).toEqual({ dither: true, brightness: 80 });
  });

  it('SS-05: clear resets both latest and pending', () => {
    store.setLatest({ dither: true });
    store.queuePending({ brightness: 5 });
    store.clear();
    expect(store.getLatest()).toBeNull();
    expect(store.drainPending()).toBeNull();
  });
});
