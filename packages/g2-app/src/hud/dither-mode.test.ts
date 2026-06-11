/**
 * dither-mode.test.ts — Unit tests for the dither-mode persistence helper.
 *
 * Mirrors the pattern established by locale-override.ts tests.
 *
 * Coverage:
 *   DM-01 — loadDitherMode: missing key ('') → true (default ON)
 *   DM-02 — loadDitherMode: '0' → false (OFF)
 *   DM-03 — loadDitherMode: '1' → true (ON)
 *   DM-04 — loadDitherMode: unknown value → true (fail-soft)
 *   DM-05 — loadDitherMode: getLocalStorage throws → true (fail-soft, warns)
 *   DM-06 — persistDitherMode: writes '1' when on=true
 *   DM-07 — persistDitherMode: writes '0' when on=false
 *   DM-08 — persistDitherMode: swallows setLocalStorage errors (best-effort)
 *   DM-09 — DITHER_MODE_KV_KEY export constant has the correct value
 *
 * @see packages/g2-app/src/hud/dither-mode.ts (implementation)
 * @see packages/g2-app/src/locale/locale-override.ts (pattern exemplar)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { DITHER_MODE_KV_KEY, loadDitherMode, persistDitherMode } from './dither-mode.js';

// ── Mock bridge factory ──────────────────────────────────────────────────────

function makeBridge(getResult: string | Error = '') {
  return {
    getLocalStorage: vi.fn().mockImplementation(() => {
      if (getResult instanceof Error) return Promise.reject(getResult);
      return Promise.resolve(getResult);
    }),
    setLocalStorage: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge & {
    getLocalStorage: ReturnType<typeof vi.fn>;
    setLocalStorage: ReturnType<typeof vi.fn>;
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DITHER_MODE_KV_KEY', () => {
  it('DM-09: exported constant has value "view.hud.dither"', () => {
    expect(DITHER_MODE_KV_KEY).toBe('view.hud.dither');
  });
});

describe('loadDitherMode', () => {
  it('DM-01: missing key ("") returns true (default ON)', async () => {
    const bridge = makeBridge('');
    const result = await loadDitherMode(bridge);
    expect(result).toBe(true);
    expect(bridge.getLocalStorage).toHaveBeenCalledWith(DITHER_MODE_KV_KEY);
  });

  it('DM-02: stored "0" returns false (OFF)', async () => {
    const bridge = makeBridge('0');
    const result = await loadDitherMode(bridge);
    expect(result).toBe(false);
  });

  it('DM-03: stored "1" returns true (ON)', async () => {
    const bridge = makeBridge('1');
    const result = await loadDitherMode(bridge);
    expect(result).toBe(true);
  });

  it('DM-04: unknown value (e.g. "yes") returns true (fail-soft)', async () => {
    const bridge = makeBridge('yes');
    const result = await loadDitherMode(bridge);
    expect(result).toBe(true);
  });

  it('DM-05: getLocalStorage throws → returns true and emits console.warn', async () => {
    const bridge = makeBridge(new Error('kv store unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await loadDitherMode(bridge);
    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});

describe('persistDitherMode', () => {
  it('DM-06: on=true writes "1" under the kv key', async () => {
    const bridge = makeBridge();
    await persistDitherMode(bridge, true);
    expect(bridge.setLocalStorage).toHaveBeenCalledWith(DITHER_MODE_KV_KEY, '1');
  });

  it('DM-07: on=false writes "0" under the kv key', async () => {
    const bridge = makeBridge();
    await persistDitherMode(bridge, false);
    expect(bridge.setLocalStorage).toHaveBeenCalledWith(DITHER_MODE_KV_KEY, '0');
  });

  it('DM-08: setLocalStorage error is swallowed (best-effort, resolves normally)', async () => {
    const bridge = makeBridge();
    (bridge.setLocalStorage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('kv write failed'),
    );
    await expect(persistDitherMode(bridge, true)).resolves.toBeUndefined();
  });
});
