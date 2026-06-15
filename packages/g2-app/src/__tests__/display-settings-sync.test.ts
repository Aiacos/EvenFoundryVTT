/**
 * createDisplaySettingsSync unit tests (display-settings sync, latency audit 2026-06-14).
 *
 * @see packages/g2-app/src/engine/display-settings-sync.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDisplaySettingsSync } from '../engine/display-settings-sync.js';

/** Minimal fake bus capturing the subscribed fn so the test can push payloads. */
function makeBus() {
  const handlers = new Map<string, (raw: unknown) => void>();
  const unsubscribe = vi.fn();
  return {
    subscribe: vi.fn((channel: string, fn: (raw: unknown) => void) => {
      handlers.set(channel, fn);
      return unsubscribe;
    }),
    push: (channel: string, raw: unknown) => handlers.get(channel)?.(raw),
    unsubscribe,
  };
}

describe('createDisplaySettingsSync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DSS-01: subscribes to the settings.display channel', () => {
    const bus = makeBus();
    const sender = { send: vi.fn() };
    createDisplaySettingsSync(bus, sender);
    expect(bus.subscribe).toHaveBeenCalledWith('settings.display', expect.any(Function));
  });

  it('DSS-02: downstream push merges into get() and fires onUpdate', () => {
    const bus = makeBus();
    const sender = { send: vi.fn() };
    const onUpdate = vi.fn();
    const sync = createDisplaySettingsSync(bus, sender, onUpdate);

    bus.push('settings.display', { payload: { dither: true, brightness: 30 } });
    expect(sync.get()).toEqual({ dither: true, brightness: 30 });
    expect(onUpdate).toHaveBeenCalledWith({ dither: true, brightness: 30 });

    // A later partial push merges (keeps dither, updates brightness).
    bus.push('settings.display', { payload: { brightness: 80 } });
    expect(sync.get()).toEqual({ dither: true, brightness: 80 });
  });

  it('DSS-03: tolerates a raw payload that is the settings object directly', () => {
    const bus = makeBus();
    const sync = createDisplaySettingsSync(bus, { send: vi.fn() });
    bus.push('settings.display', { webpQuality: 50 });
    expect(sync.get()).toEqual({ webpQuality: 50 });
  });

  it('DSS-04: ignores an invalid downstream payload', () => {
    const bus = makeBus();
    const onUpdate = vi.fn();
    const sync = createDisplaySettingsSync(bus, { send: vi.fn() }, onUpdate);
    bus.push('settings.display', { payload: { brightness: 9999 } }); // out of range
    expect(sync.get()).toEqual({});
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('DSS-05: sendEdit sends a client_setting message and optimistically merges', () => {
    const bus = makeBus();
    const sender = { send: vi.fn() };
    const sync = createDisplaySettingsSync(bus, sender);

    sync.sendEdit({ dither: false });
    expect(sender.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'client_setting', settings: { dither: false } }),
    );
    expect(sync.get()).toEqual({ dither: false }); // optimistic
  });

  it('DSS-06: sendEdit never throws when the sender fails', () => {
    const bus = makeBus();
    const sender = {
      send: vi.fn(() => {
        throw new Error('socket closed');
      }),
    };
    const sync = createDisplaySettingsSync(bus, sender);
    expect(() => sync.sendEdit({ brightness: 10 })).not.toThrow();
  });

  it('DSS-07: dispose unsubscribes from the bus', () => {
    const bus = makeBus();
    const sync = createDisplaySettingsSync(bus, { send: vi.fn() });
    sync.dispose();
    expect(bus.unsubscribe).toHaveBeenCalled();
  });
});
