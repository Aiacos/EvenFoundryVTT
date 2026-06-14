/**
 * settings.ts display-settings sync helpers (latency audit 2026-06-14).
 *
 * Covers the module-side half of the bidirectional sync:
 *   - buildDisplaySettingsSnapshot reads the five live getters into a snapshot.
 *   - applyDisplaySettings maps a partial edit to game.settings.set ids.
 *
 * @see ./settings.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Minimal Foundry globals that `module.js` (imported transitively) touches at load. */
function stubFoundryGlobals(): void {
  vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn(), off: vi.fn() });
  vi.stubGlobal('Application', class {});
  vi.stubGlobal('foundry', {
    applications: {
      api: {
        ApplicationV2: class {},
        HandlebarsApplicationMixin: (Base: unknown) => Base,
      },
    },
  });
}

/** Stub `game.settings` with get backed by a value map + a spy set. */
function stubGame(values: Record<string, unknown>) {
  stubFoundryGlobals();
  const set = vi.fn(async () => undefined);
  vi.stubGlobal('game', {
    settings: {
      get: vi.fn((_mod: string, key: string) => values[key]),
      set,
    },
  });
  return { set };
}

describe('buildDisplaySettingsSnapshot', () => {
  it('SET-01: reads all five settings into a full snapshot', async () => {
    stubGame({
      mapDither: true,
      mapBrightness: 40,
      mapWebpQuality: 60,
      captureFps: 24,
      mapContrastNormalize: true,
    });
    const { buildDisplaySettingsSnapshot } = await import('./settings.js');
    expect(buildDisplaySettingsSnapshot()).toEqual({
      dither: true,
      brightness: 40,
      webpQuality: 60,
      captureFps: 24,
      normalize: true,
    });
  });

  it('SET-02: falls back to defaults on unreadable/missing settings', async () => {
    stubGame({}); // all undefined → getters return defaults
    const { buildDisplaySettingsSnapshot } = await import('./settings.js');
    expect(buildDisplaySettingsSnapshot()).toEqual({
      dither: false,
      brightness: 0,
      webpQuality: 0,
      captureFps: 30,
      normalize: false,
    });
  });
});

describe('applyDisplaySettings', () => {
  it('SET-03: maps each present key to its Foundry setting id', async () => {
    const { set } = stubGame({});
    const { applyDisplaySettings } = await import('./settings.js');
    await applyDisplaySettings({ brightness: 50, dither: true });

    expect(set).toHaveBeenCalledWith('evenfoundryvtt', 'mapBrightness', 50);
    expect(set).toHaveBeenCalledWith('evenfoundryvtt', 'mapDither', true);
    expect(set).toHaveBeenCalledTimes(2); // only the two present keys
  });

  it('SET-04: maps all five keys with the correct setting ids', async () => {
    const { set } = stubGame({});
    const { applyDisplaySettings } = await import('./settings.js');
    await applyDisplaySettings({
      dither: false,
      brightness: -20,
      webpQuality: 0,
      captureFps: 60,
      normalize: true,
    });
    const calls = (set.mock.calls as unknown as Array<[string, string, unknown]>).map((c) => [
      c[1],
      c[2],
    ]);
    expect(calls).toEqual(
      expect.arrayContaining([
        ['mapDither', false],
        ['mapBrightness', -20],
        ['mapWebpQuality', 0],
        ['captureFps', 60],
        ['mapContrastNormalize', true],
      ]),
    );
  });

  it('SET-05: a failing game.settings.set never throws out of applyDisplaySettings', async () => {
    stubFoundryGlobals();
    vi.stubGlobal('game', {
      settings: {
        get: vi.fn(() => undefined),
        set: vi.fn(async () => {
          throw new Error('foundry rejected');
        }),
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { applyDisplaySettings } = await import('./settings.js');
    await expect(applyDisplaySettings({ brightness: 10 })).resolves.toBeUndefined();
  });
});
