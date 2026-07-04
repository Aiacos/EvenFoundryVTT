/**
 * Unit tests for the HUD render-mode boot override reader (Feature 002).
 *
 * @see packages/g2-app/src/engine/hud-render-mode.ts
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { loadPersistedRenderMode, RENDER_MODE_STORAGE_KEY } from '../hud-render-mode.js';

/** Minimal bridge stub exposing only getLocalStorage. */
function bridgeReturning(value: string | Promise<never>): EvenAppBridge {
  return {
    getLocalStorage: vi.fn(async () => value),
  } as unknown as EvenAppBridge;
}

describe('loadPersistedRenderMode', () => {
  it('reads the override from the canonical kv key', async () => {
    const bridge = bridgeReturning('showcase');
    await loadPersistedRenderMode(bridge);
    expect((bridge.getLocalStorage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
      RENDER_MODE_STORAGE_KEY,
    );
    expect(RENDER_MODE_STORAGE_KEY).toBe('view.hud.render');
  });

  it.each([
    'showcase',
    'hybrid',
    'canvas',
    'glyph',
  ] as const)('returns %s when explicitly stored', async (m) => {
    expect(await loadPersistedRenderMode(bridgeReturning(m))).toBe(m);
  });

  it('returns null for a missing key (empty string)', async () => {
    expect(await loadPersistedRenderMode(bridgeReturning(''))).toBeNull();
  });

  it('returns null for an unknown / out-of-whitelist value', async () => {
    expect(await loadPersistedRenderMode(bridgeReturning('raster'))).toBeNull();
    expect(await loadPersistedRenderMode(bridgeReturning('garbage'))).toBeNull();
  });

  it('returns null (never throws) on a getLocalStorage rejection', async () => {
    const bridge = {
      getLocalStorage: vi.fn(async () => {
        throw new Error('kv unavailable');
      }),
    } as unknown as EvenAppBridge;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadPersistedRenderMode(bridge)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
