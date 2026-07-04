/**
 * hud-delta-driver.encode-skip.test.ts — perf regression suite for the
 * source-tile delta gate (ENC-SKIP-01..04).
 *
 * These tests lock in the optimization that unchanged tiles are NEVER dithered
 * nor PNG-encoded: the driver now hashes the SOURCE (pre-dither) pixels of each
 * tile and only encodes the tiles whose source changed. Before this change all
 * 4 tiles were encoded every cycle and the xxhash skip only saved the BLE push,
 * not the (dominant) `UPNG.encode` cost.
 *
 * Kept in a SEPARATE file from `hud-delta-driver.test.ts` so the module mock
 * that wraps `encodeHudTile` with a call-counter is isolated from the 40 tests
 * that exercise the un-instrumented driver.
 *
 * @see packages/g2-app/src/engine/hud-delta-driver.ts (_runCycle source-tile gate)
 * @see packages/g2-app/src/hud/hud-raster-frame.ts (encodeHudTile / splitFrameIntoTiles)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HudTile } from '../hud/hud-raster-frame.js';
import { encodeHudTile } from '../hud/hud-raster-frame.js';
import type { HudDeltaDriverOpts } from './hud-delta-driver.js';
import { DEFAULT_MIN_REDRAW_INTERVAL_MS, HudDeltaDriver } from './hud-delta-driver.js';

// ── xxhash-wasm mock (FNV-1a over the whole buffer — byte-position-sensitive) ──

vi.mock('xxhash-wasm', () => {
  const h32Raw = (buf: Uint8Array): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < buf.length; i++) {
      h = (h ^ (buf[i] ?? 0)) >>> 0;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  return { default: () => Promise.resolve({ h32Raw }) };
});

// ── hud-raster-frame mock — wrap encodeHudTile with a spy, keep the rest real ──

vi.mock('../hud/hud-raster-frame.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hud/hud-raster-frame.js')>();
  return {
    ...actual,
    // Delegates to the real encoder so behaviour (and byte output) is unchanged;
    // the spy only records how many tiles were actually encoded per cycle.
    encodeHudTile: vi.fn(actual.encodeHudTile),
  };
});

const FRAME_W = 576;
const FRAME_H = 288;
const TILE_W = 288;
const TILE_H = 144;
const STRIDE = 4;

function makeBlankRgba(): Uint8ClampedArray {
  return new Uint8ClampedArray(FRAME_W * FRAME_H * STRIDE);
}

/** Fill the tile-0 (TL) quadrant so its source hash differs from the baseline. */
function mutateTile0(rgba: Uint8ClampedArray, value = 42): void {
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const idx = (y * FRAME_W + x) * STRIDE;
      rgba[idx] = value;
      rgba[idx + 1] = value;
      rgba[idx + 2] = value;
      rgba[idx + 3] = 255;
    }
  }
}

function makeCompositor(initial?: Uint8ClampedArray) {
  const rgbaRef = { value: initial ?? makeBlankRgba() };
  const compositor = { composite: vi.fn(() => rgbaRef.value) };
  return { rgbaRef, compositor };
}

function makeBridge() {
  return { updateImageRawData: vi.fn().mockResolvedValue({ isSuccess: () => true }) };
}

function makeWsEvents() {
  const subs = new Map<string, Array<(raw: unknown) => void>>();
  const wsEvents = {
    subscribe(channel: string, fn: (raw: unknown) => void): () => void {
      const handlers = subs.get(channel) ?? [];
      handlers.push(fn);
      subs.set(channel, handlers);
      return () => {
        const hs = subs.get(channel) ?? [];
        const idx = hs.indexOf(fn);
        if (idx !== -1) hs.splice(idx, 1);
      };
    },
  };
  const fire = (channel: string): void => {
    for (const h of subs.get(channel) ?? []) h({});
  };
  return { wsEvents, fire };
}

function baseOpts(
  compositor: { composite: ReturnType<typeof vi.fn> },
  bridge: ReturnType<typeof makeBridge>,
  wsEvents: ReturnType<typeof makeWsEvents>['wsEvents'],
): HudDeltaDriverOpts {
  return {
    compositor: compositor as unknown as HudDeltaDriverOpts['compositor'],
    bridge: bridge as unknown as HudDeltaDriverOpts['bridge'],
    wsEvents,
  };
}

const encodeSpy = vi.mocked(encodeHudTile);

describe('HudDeltaDriver — source-tile delta gate (encode-skip)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('ENC-SKIP-01: sync path — identical compositor output → 0 tiles re-encoded (zero-encode-on-idle)', async () => {
    const { compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(baseOpts(compositor, bridge, wsEvents));
    await driver.start();
    await driver.runFirstFrame();

    // First frame encodes all 4 tiles.
    expect(encodeSpy).toHaveBeenCalledTimes(4);
    const encodesAfterFirst = encodeSpy.mock.calls.length;

    // A delta with byte-identical source → nothing re-encoded, nothing pushed.
    const pushesAfterFirst = bridge.updateImageRawData.mock.calls.length;
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    expect(encodeSpy.mock.calls.length - encodesAfterFirst).toBe(0);
    expect(bridge.updateImageRawData.mock.calls.length - pushesAfterFirst).toBe(0);

    driver.stop();
  });

  it('ENC-SKIP-02: sync path — one changed tile → exactly 1 tile encoded and 1 push (not 4)', async () => {
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(baseOpts(compositor, bridge, wsEvents));
    await driver.start();
    await driver.runFirstFrame();

    const encodesAfterFirst = encodeSpy.mock.calls.length;
    const pushesAfterFirst = bridge.updateImageRawData.mock.calls.length;

    const next = makeBlankRgba();
    mutateTile0(next, 99);
    rgbaRef.value = next;

    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    // Only tile-0's source changed → exactly 1 encode, 1 push, containerID 0.
    expect(encodeSpy.mock.calls.length - encodesAfterFirst).toBe(1);
    const newPush = bridge.updateImageRawData.mock.calls.length - pushesAfterFirst;
    expect(newPush).toBe(1);
    const arg = bridge.updateImageRawData.mock.calls[pushesAfterFirst]?.[0] as
      | { containerID: number }
      | undefined;
    expect(arg?.containerID).toBe(0);
    // The single encode targeted container 0.
    const encodedId = encodeSpy.mock.calls[encodesAfterFirst]?.[1];
    expect(encodedId).toBe(0);

    driver.stop();
  });

  it('ENC-SKIP-03: worker path — idle cycle makes ZERO worker round-trips; a change makes exactly one', async () => {
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const buildTilesAsync = vi.fn(
      (_rgba: Uint8ClampedArray, _dither: boolean): Promise<HudTile[]> =>
        Promise.resolve(
          [0, 1, 2, 3].map((i) => ({
            containerID: i,
            containerName: `hud-tile-${i}`,
            bytes: new Uint8Array([i + 1]),
          })),
        ),
    );

    const driver = new HudDeltaDriver({
      ...baseOpts(compositor, bridge, wsEvents),
      buildTilesAsync,
    });
    await driver.start();
    await driver.runFirstFrame();

    // First frame: one worker build for all 4 tiles.
    expect(buildTilesAsync).toHaveBeenCalledTimes(1);
    // Worker path → the sync encoder is never touched.
    expect(encodeSpy).not.toHaveBeenCalled();

    // Idle delta → source unchanged → NO worker round-trip at all.
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);
    expect(buildTilesAsync).toHaveBeenCalledTimes(1);

    // Change tile-0 → exactly one more worker build, and one push for container 0.
    const pushesBefore = bridge.updateImageRawData.mock.calls.length;
    const next = makeBlankRgba();
    mutateTile0(next, 77);
    rgbaRef.value = next;
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    expect(buildTilesAsync).toHaveBeenCalledTimes(2);
    const newPushes = bridge.updateImageRawData.mock.calls.length - pushesBefore;
    expect(newPushes).toBe(1);
    const arg = bridge.updateImageRawData.mock.calls[pushesBefore]?.[0] as
      | { containerID: number }
      | undefined;
    expect(arg?.containerID).toBe(0);

    driver.stop();
  });

  it('ENC-SKIP-04: a live dither-mode flip forces a full 4-tile repaint even with identical source', async () => {
    let ditherOn = true;
    const rgba = makeBlankRgba();
    mutateTile0(rgba, 33); // some content so all-black-tiles are not trivially equal
    const { compositor } = makeCompositor(rgba);
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver({
      ...baseOpts(compositor, bridge, wsEvents),
      getDitherMode: () => ditherOn,
    });
    await driver.start();
    await driver.runFirstFrame();

    const encodesAfterFirst = encodeSpy.mock.calls.length;
    const pushesAfterFirst = bridge.updateImageRawData.mock.calls.length;

    // Flip the mode; source pixels are byte-identical. The mode-independent source
    // hash would skip — but the driver must force a full repaint so the toggle shows.
    ditherOn = false;
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    expect(encodeSpy.mock.calls.length - encodesAfterFirst).toBe(4);
    expect(bridge.updateImageRawData.mock.calls.length - pushesAfterFirst).toBe(4);

    driver.stop();
  });
});
