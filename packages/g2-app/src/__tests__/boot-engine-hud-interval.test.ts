/**
 * resolveHudMinIntervalMs unit tests (latency audit 2026-06-11).
 *
 * The HudDeltaDriver throttle default (33 ms ≈ 30 fps cap) became a per-boot
 * knob: `BootEngineOpts.hudMinIntervalMs` > `?hudms=` URL param > default.
 * These tests pin the resolution priority and the [8, 1000] clamp.
 *
 * @see packages/g2-app/src/internal/boot-engine-core.ts (resolveHudMinIntervalMs)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHudMinIntervalMs } from '../internal/boot-engine-core.js';

/** Stub `window.location.href` with the given query string. */
function stubLocation(search: string): void {
  vi.stubGlobal('window', {
    location: { href: `https://app.local/index.html${search}` },
  });
}

describe('resolveHudMinIntervalMs (HUD-INT)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('HUD-INT-1: defaults to 33 ms with no opt and no URL param', () => {
    stubLocation('');
    expect(resolveHudMinIntervalMs(undefined)).toBe(33);
  });

  it('HUD-INT-2: explicit boot opt wins over the URL param', () => {
    stubLocation('?hudms=20');
    expect(resolveHudMinIntervalMs(50)).toBe(50);
  });

  it('HUD-INT-3: ?hudms= URL param applies when no boot opt is given', () => {
    stubLocation('?hudms=20');
    expect(resolveHudMinIntervalMs(undefined)).toBe(20);
  });

  it('HUD-INT-4: values clamp to the [8, 1000] range', () => {
    stubLocation('');
    expect(resolveHudMinIntervalMs(1)).toBe(8);
    expect(resolveHudMinIntervalMs(99_999)).toBe(1000);
  });

  it('HUD-INT-5: unparsable URL param falls through to the default', () => {
    stubLocation('?hudms=fast');
    expect(resolveHudMinIntervalMs(undefined)).toBe(33);
  });

  it('HUD-INT-6: no window (Node test host) → default, no throw', () => {
    // No stubbed window: rely on the bare Node global (vitest workspace uses
    // happy-dom for g2-app, so emulate the absence explicitly).
    vi.stubGlobal('window', undefined);
    expect(resolveHudMinIntervalMs(undefined)).toBe(33);
  });
});
