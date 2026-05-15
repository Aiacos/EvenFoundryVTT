/**
 * Unit tests for `map-mode-toggle.ts` — toggle primitive + Even Hub persistence
 * (Phase 4b Plan 02 Task 1).
 *
 * Covers MMT-LP-01..07 + MMT-TG-01..07 from 04B-02-PLAN.md `<behavior>` block:
 *
 *   loadPersistedMapMode:
 *     - MMT-LP-01..03: bridge.getLocalStorage resolves valid value → returned verbatim
 *     - MMT-LP-04..05: empty / invalid value → defensive fallback to 'auto'
 *     - MMT-LP-06: rejection → 'auto' + console.warn called once
 *     - MMT-LP-07: STORAGE_KEY constant exported, equals 'view.map.mode'
 *
 *   toggleMapMode:
 *     - MMT-TG-01..03: each MapMode value applies setMapMode + (raster/glyph only)
 *       setBleVerdict + setLocalStorage call
 *     - MMT-TG-04: in-memory mutations precede setLocalStorage (call order)
 *     - MMT-TG-05..06: setLocalStorage rejection / false → in-memory state stays
 *       toggled (best-effort persistence per Q8); console.warn called once
 *     - MMT-TG-07: idempotent — calling twice triggers two full cycles
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-02-PLAN.md Task 1
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 3
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 2 + §Q8
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerManager, MapMode } from '../layer-manager.js';
import type { RasterControllerLike } from '../layer-types.js';
import { loadPersistedMapMode, STORAGE_KEY, toggleMapMode } from '../map-mode-toggle.js';

// ─── Mock factories ──────────────────────────────────────────────────────────

interface BridgeMock {
  setLocalStorage: ReturnType<typeof vi.fn>;
  getLocalStorage: ReturnType<typeof vi.fn>;
}

function makeBridge(
  overrides: Partial<{
    setLocalStorageImpl: (k: string, v: string) => Promise<boolean>;
    getLocalStorageImpl: (k: string) => Promise<string>;
  }> = {},
): { bridge: EvenAppBridge; spies: BridgeMock } {
  const setLocalStorage = vi.fn(overrides.setLocalStorageImpl ?? (async () => true));
  const getLocalStorage = vi.fn(overrides.getLocalStorageImpl ?? (async () => ''));
  const bridge = {
    setLocalStorage,
    getLocalStorage,
  } as unknown as EvenAppBridge;
  return { bridge, spies: { setLocalStorage, getLocalStorage } };
}

interface LayerManagerMock {
  setMapMode: ReturnType<typeof vi.fn>;
  getMapMode: ReturnType<typeof vi.fn>;
}

function makeLayerManager(): { layerManager: LayerManager; spies: LayerManagerMock } {
  const setMapMode = vi.fn();
  const getMapMode = vi.fn().mockReturnValue('auto' as MapMode);
  const layerManager = {
    setMapMode,
    getMapMode,
  } as unknown as LayerManager;
  return { layerManager, spies: { setMapMode, getMapMode } };
}

interface RasterControllerMock {
  setBleVerdict: ReturnType<typeof vi.fn>;
  getBleVerdict: ReturnType<typeof vi.fn>;
}

function makeRasterController(): {
  rasterController: RasterControllerLike;
  spies: RasterControllerMock;
} {
  const setBleVerdict = vi.fn();
  const getBleVerdict = vi.fn().mockReturnValue(null);
  const rasterController = {
    setBleVerdict,
    getBleVerdict,
    requestFrame: vi.fn(),
    startIdleHeartbeat: vi.fn(),
    stopIdleHeartbeat: vi.fn(),
    terminate: vi.fn(),
  } as unknown as RasterControllerLike;
  return { rasterController, spies: { setBleVerdict, getBleVerdict } };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('map-mode-toggle — loadPersistedMapMode (Phase 4b Plan 02 Task 1)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silent */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("MMT-LP-01: getLocalStorage resolves 'raster' → returns 'raster'", async () => {
    const { bridge, spies } = makeBridge({
      getLocalStorageImpl: async () => 'raster',
    });
    const result = await loadPersistedMapMode(bridge);
    expect(result).toBe('raster');
    expect(spies.getLocalStorage).toHaveBeenCalledWith(STORAGE_KEY);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("MMT-LP-02: getLocalStorage resolves 'glyph' → returns 'glyph'", async () => {
    const { bridge } = makeBridge({
      getLocalStorageImpl: async () => 'glyph',
    });
    const result = await loadPersistedMapMode(bridge);
    expect(result).toBe('glyph');
  });

  it("MMT-LP-03: getLocalStorage resolves 'auto' → returns 'auto'", async () => {
    const { bridge } = makeBridge({
      getLocalStorageImpl: async () => 'auto',
    });
    const result = await loadPersistedMapMode(bridge);
    expect(result).toBe('auto');
  });

  it("MMT-LP-04: getLocalStorage resolves '' (missing key per SDK) → returns 'auto'", async () => {
    const { bridge } = makeBridge({
      getLocalStorageImpl: async () => '',
    });
    const result = await loadPersistedMapMode(bridge);
    expect(result).toBe('auto');
    // Empty string is the SDK's "missing key" signal — defensive fallback, no warn.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("MMT-LP-05: getLocalStorage resolves 'invalid-value' → returns 'auto' (whitelist rejection)", async () => {
    const { bridge } = makeBridge({
      getLocalStorageImpl: async () => 'invalid-value',
    });
    const result = await loadPersistedMapMode(bridge);
    expect(result).toBe('auto');
  });

  it("MMT-LP-06: getLocalStorage rejects with Error → returns 'auto' + console.warn once", async () => {
    const { bridge } = makeBridge({
      getLocalStorageImpl: async () => {
        throw new Error('simulated kv read failure');
      },
    });
    const result = await loadPersistedMapMode(bridge);
    expect(result).toBe('auto');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("MMT-LP-07: STORAGE_KEY constant equals 'view.map.mode' literal", () => {
    // Structural grep gate — pins the constant to the planned wire literal.
    expect(STORAGE_KEY).toBe('view.map.mode');
  });
});

describe('map-mode-toggle — toggleMapMode (Phase 4b Plan 02 Task 1)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silent */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("MMT-TG-01: 'raster' → setMapMode('raster') + setBleVerdict('raster') + setLocalStorage('view.map.mode','raster')", async () => {
    const { bridge, spies: bs } = makeBridge();
    const { layerManager, spies: ls } = makeLayerManager();
    const { rasterController, spies: rs } = makeRasterController();

    await toggleMapMode(bridge, layerManager, rasterController, 'raster');

    expect(ls.setMapMode).toHaveBeenCalledWith('raster');
    expect(rs.setBleVerdict).toHaveBeenCalledWith('raster');
    expect(bs.setLocalStorage).toHaveBeenCalledWith(STORAGE_KEY, 'raster');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("MMT-TG-02: 'glyph' → setMapMode('glyph') + setBleVerdict('glyph') + setLocalStorage('view.map.mode','glyph')", async () => {
    const { bridge, spies: bs } = makeBridge();
    const { layerManager, spies: ls } = makeLayerManager();
    const { rasterController, spies: rs } = makeRasterController();

    await toggleMapMode(bridge, layerManager, rasterController, 'glyph');

    expect(ls.setMapMode).toHaveBeenCalledWith('glyph');
    expect(rs.setBleVerdict).toHaveBeenCalledWith('glyph');
    expect(bs.setLocalStorage).toHaveBeenCalledWith(STORAGE_KEY, 'glyph');
  });

  it("MMT-TG-03: 'auto' → setMapMode('auto') called; setBleVerdict NOT called; setLocalStorage('view.map.mode','auto') called", async () => {
    const { bridge, spies: bs } = makeBridge();
    const { layerManager, spies: ls } = makeLayerManager();
    const { rasterController, spies: rs } = makeRasterController();

    await toggleMapMode(bridge, layerManager, rasterController, 'auto');

    expect(ls.setMapMode).toHaveBeenCalledWith('auto');
    // 'auto' is NOT a valid setBleVerdict input — Pitfall 7 documents this.
    expect(rs.setBleVerdict).not.toHaveBeenCalled();
    expect(bs.setLocalStorage).toHaveBeenCalledWith(STORAGE_KEY, 'auto');
  });

  it('MMT-TG-04: in-memory mutations precede setLocalStorage (best-effort policy)', async () => {
    const { bridge, spies: bs } = makeBridge();
    const { layerManager, spies: ls } = makeLayerManager();
    const { rasterController, spies: rs } = makeRasterController();

    await toggleMapMode(bridge, layerManager, rasterController, 'raster');

    const setMapModeOrder = ls.setMapMode.mock.invocationCallOrder[0];
    const setBleVerdictOrder = rs.setBleVerdict.mock.invocationCallOrder[0];
    const setLocalStorageOrder = bs.setLocalStorage.mock.invocationCallOrder[0];
    // All three mocks were invoked (each exactly once for this toggle), so the
    // invocation-order entries are non-undefined; narrow the type for `toBeLessThan`.
    expect(setMapModeOrder).toBeDefined();
    expect(setBleVerdictOrder).toBeDefined();
    expect(setLocalStorageOrder).toBeDefined();
    if (
      setMapModeOrder === undefined ||
      setBleVerdictOrder === undefined ||
      setLocalStorageOrder === undefined
    ) {
      throw new Error('invocationCallOrder unexpectedly undefined');
    }
    // setMapMode and setBleVerdict (in-memory) must both happen BEFORE setLocalStorage.
    expect(setMapModeOrder).toBeLessThan(setLocalStorageOrder);
    expect(setBleVerdictOrder).toBeLessThan(setLocalStorageOrder);
  });

  it('MMT-TG-05: setLocalStorage returns false → toggle still applied, console.warn called once', async () => {
    const { bridge, spies: bs } = makeBridge({
      setLocalStorageImpl: async () => false,
    });
    const { layerManager, spies: ls } = makeLayerManager();
    const { rasterController } = makeRasterController();

    await expect(
      toggleMapMode(bridge, layerManager, rasterController, 'glyph'),
    ).resolves.toBeUndefined();

    // In-memory toggle MUST still have happened (Q8 best-effort policy — no rollback).
    expect(ls.setMapMode).toHaveBeenCalledWith('glyph');
    expect(bs.setLocalStorage).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/setLocalStorage returned false/);
  });

  it('MMT-TG-06: setLocalStorage rejects → toggle still applied, console.warn called once', async () => {
    const { bridge, spies: bs } = makeBridge({
      setLocalStorageImpl: async () => {
        throw new Error('simulated kv write failure');
      },
    });
    const { layerManager, spies: ls } = makeLayerManager();
    const { rasterController } = makeRasterController();

    await expect(
      toggleMapMode(bridge, layerManager, rasterController, 'raster'),
    ).resolves.toBeUndefined();

    // In-memory toggle MUST still have happened.
    expect(ls.setMapMode).toHaveBeenCalledWith('raster');
    expect(bs.setLocalStorage).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/setLocalStorage threw/);
  });

  it('MMT-TG-07: idempotent — calling twice triggers two full cycles', async () => {
    const { bridge, spies: bs } = makeBridge();
    const { layerManager, spies: ls } = makeLayerManager();
    const { rasterController, spies: rs } = makeRasterController();

    await toggleMapMode(bridge, layerManager, rasterController, 'glyph');
    await toggleMapMode(bridge, layerManager, rasterController, 'glyph');

    expect(ls.setMapMode).toHaveBeenCalledTimes(2);
    expect(rs.setBleVerdict).toHaveBeenCalledTimes(2);
    expect(bs.setLocalStorage).toHaveBeenCalledTimes(2);
  });
});
