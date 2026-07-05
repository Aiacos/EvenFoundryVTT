/**
 * `installHubPolyfill` behavior tests.
 *
 * Verifies the `globalThis.hub` shim's observable contract against a mocked
 * `EvenAppBridge`: idempotency, prior-installation respect, bridge-unavailable
 * graceful degradation, storage method delegation + `""`→`null` normalization,
 * and the DeviceStatus-derived wear/unwear event bus (first-status seeding,
 * transition edges, and listener-throw isolation).
 *
 * @see packages/g2-app/src/hub-polyfill.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable holder so each test can steer `EvenAppBridge.getInstance()`.
const control: {
  getInstance: () => unknown;
} = {
  getInstance: () => null,
};

vi.mock('@evenrealities/even_hub_sdk', () => ({
  EvenAppBridge: {
    getInstance: () => control.getInstance(),
  },
}));

import { _resetHubPolyfillForTests, installHubPolyfill } from './hub-polyfill.js';

/** Minimal mock bridge exposing only the surface the polyfill touches. */
function makeMockBridge(over: Partial<Record<string, unknown>> = {}) {
  let statusCb: ((s: { isWearing?: boolean }) => void) | undefined;
  const bridge = {
    setLocalStorage: vi.fn(async (_k: string, _v: string) => true),
    getLocalStorage: vi.fn(async (_k: string) => ''),
    onDeviceStatusChanged: vi.fn((cb: (s: { isWearing?: boolean }) => void) => {
      statusCb = cb;
    }),
    // test-only accessor to fire a device-status update
    _emitStatus: (isWearing: boolean | undefined) =>
      statusCb?.(isWearing === undefined ? {} : { isWearing }),
    ...over,
  };
  return bridge;
}

type Hub = {
  setItem(k: string, v: string): Promise<void>;
  getItem(k: string): Promise<string | null>;
  removeItem(k: string): Promise<void>;
  eventBus: {
    on(e: 'g2.wear' | 'g2.unwear', cb: () => void): void;
    off(e: string, cb: () => void): void;
  };
};

function getHub(): Hub {
  return (globalThis as { hub?: Hub }).hub as Hub;
}

beforeEach(() => {
  _resetHubPolyfillForTests();
  control.getInstance = () => null;
});

afterEach(() => {
  _resetHubPolyfillForTests();
  vi.restoreAllMocks();
});

describe('installHubPolyfill — installation guards', () => {
  it('installs the hub global and returns true on first call', () => {
    control.getInstance = () => makeMockBridge();
    expect(installHubPolyfill()).toBe(true);
    expect(getHub()).toBeDefined();
    expect(typeof getHub().setItem).toBe('function');
  });

  it('is idempotent: a second call returns false and keeps the same hub', () => {
    control.getInstance = () => makeMockBridge();
    expect(installHubPolyfill()).toBe(true);
    const first = getHub();
    expect(installHubPolyfill()).toBe(false);
    expect(getHub()).toBe(first);
  });

  it('respects a prior global hub (test stub / WebView injection) and does not overwrite', () => {
    const stub = { sentinel: true } as unknown as Hub;
    (globalThis as { hub?: unknown }).hub = stub;
    expect(installHubPolyfill()).toBe(false);
    expect(getHub()).toBe(stub);
  });
});

describe('installHubPolyfill — bridge unavailable', () => {
  it('installs even when getInstance throws, and storage methods reject', async () => {
    control.getInstance = () => {
      throw new Error('no bridge');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(installHubPolyfill()).toBe(true);
    await expect(getHub().setItem('k', 'v')).rejects.toThrow('EvenAppBridge unavailable');
    await expect(getHub().getItem('k')).rejects.toThrow('EvenAppBridge unavailable');
    await expect(getHub().removeItem('k')).rejects.toThrow('EvenAppBridge unavailable');
  });

  it('event bus on/off is a no-op-safe when bridge is null (no status subscription)', () => {
    control.getInstance = () => null;
    installHubPolyfill();
    const cb = vi.fn();
    // Should not throw even though onDeviceStatusChanged was never wired.
    expect(() => getHub().eventBus.on('g2.wear', cb)).not.toThrow();
    expect(() => getHub().eventBus.off('g2.wear', cb)).not.toThrow();
  });
});

describe('installHubPolyfill — storage delegation', () => {
  it('setItem delegates to bridge.setLocalStorage', async () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    installHubPolyfill();
    await getHub().setItem('token', 'abc');
    expect(bridge.setLocalStorage).toHaveBeenCalledWith('token', 'abc');
  });

  it('getItem normalizes the SDK empty-string sentinel to null', async () => {
    const bridge = makeMockBridge({ getLocalStorage: vi.fn(async () => '') });
    control.getInstance = () => bridge;
    installHubPolyfill();
    await expect(getHub().getItem('missing')).resolves.toBeNull();
  });

  it('getItem returns a present value unchanged', async () => {
    const bridge = makeMockBridge({ getLocalStorage: vi.fn(async () => 'stored') });
    control.getInstance = () => bridge;
    installHubPolyfill();
    await expect(getHub().getItem('k')).resolves.toBe('stored');
  });

  it('removeItem clears via setLocalStorage with empty string (no explicit delete in SDK)', async () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    installHubPolyfill();
    await getHub().removeItem('k');
    expect(bridge.setLocalStorage).toHaveBeenCalledWith('k', '');
  });
});

describe('installHubPolyfill — wear/unwear event bus', () => {
  it('seeds prevWearing on the first status update without firing listeners', () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    installHubPolyfill();
    const wear = vi.fn();
    getHub().eventBus.on('g2.wear', wear);
    // First status is a seed, must not fire.
    bridge._emitStatus(true);
    expect(wear).not.toHaveBeenCalled();
  });

  it('fires g2.wear on a not-wearing → wearing transition', () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    installHubPolyfill();
    const wear = vi.fn();
    getHub().eventBus.on('g2.wear', wear);
    bridge._emitStatus(false); // seed
    bridge._emitStatus(true); // transition up
    expect(wear).toHaveBeenCalledTimes(1);
  });

  it('fires g2.unwear on a wearing → not-wearing transition', () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    installHubPolyfill();
    const unwear = vi.fn();
    getHub().eventBus.on('g2.unwear', unwear);
    bridge._emitStatus(true); // seed
    bridge._emitStatus(false); // transition down
    expect(unwear).toHaveBeenCalledTimes(1);
  });

  it('does not fire when wearing state is unchanged', () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    installHubPolyfill();
    const wear = vi.fn();
    const unwear = vi.fn();
    getHub().eventBus.on('g2.wear', wear);
    getHub().eventBus.on('g2.unwear', unwear);
    bridge._emitStatus(true); // seed
    bridge._emitStatus(true); // no change
    expect(wear).not.toHaveBeenCalled();
    expect(unwear).not.toHaveBeenCalled();
  });

  it('off() removes a listener so it no longer fires', () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    installHubPolyfill();
    const wear = vi.fn();
    getHub().eventBus.on('g2.wear', wear);
    getHub().eventBus.off('g2.wear', wear);
    bridge._emitStatus(false);
    bridge._emitStatus(true);
    expect(wear).not.toHaveBeenCalled();
  });

  it('isolates a throwing listener so sibling listeners still fire (wear)', () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    installHubPolyfill();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    getHub().eventBus.on('g2.wear', bad);
    getHub().eventBus.on('g2.wear', good);
    bridge._emitStatus(false);
    expect(() => bridge._emitStatus(true)).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener on unwear as well', () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    installHubPolyfill();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    getHub().eventBus.on('g2.unwear', bad);
    bridge._emitStatus(true);
    expect(() => bridge._emitStatus(false)).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it('treats a non-true isWearing as not-wearing (=== true coercion)', () => {
    const bridge = makeMockBridge();
    control.getInstance = () => bridge;
    installHubPolyfill();
    const wear = vi.fn();
    getHub().eventBus.on('g2.wear', wear);
    bridge._emitStatus(undefined); // seed as not-wearing
    bridge._emitStatus(true); // transition up
    expect(wear).toHaveBeenCalledTimes(1);
  });

  it('survives onDeviceStatusChanged throwing at subscription time', () => {
    const bridge = makeMockBridge({
      onDeviceStatusChanged: vi.fn(() => {
        throw new Error('subscribe failed');
      }),
    });
    control.getInstance = () => bridge;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(installHubPolyfill()).toBe(true);
    expect(getHub()).toBeDefined();
  });
});
