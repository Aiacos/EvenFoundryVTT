/**
 * hud-delta-driver.test.ts — DL-01..DL-06 + first-frame + default-interval
 *
 * Unit tests for {@link HudDeltaDriver}: event-driven debounce loop with
 * per-tile xxhash delta detection (Phase 24, RPROMO-01).
 *
 * Test coverage:
 *   DL-01 — 1-of-4 tiles changed → exactly 1 updateImageRawData call
 *   DL-02 — 0 tiles changed → 0 updateImageRawData calls (zero-push-on-idle)
 *   DL-03 — 3 rapid deltas within debounce window → 1 render cycle (collapse)
 *   DL-04 — configurable debounce interval (50ms custom vs 100ms default)
 *   DL-05 — static-chrome determinism: identical compositor output → 0 pushes after first frame
 *   DL-06 — stop() cancels pending timer and releases all subscriptions
 *   first-frame — runFirstFrame() pushes all 4 tiles unconditionally; seeds hashes
 *   default-interval — DEFAULT_MIN_REDRAW_INTERVAL_MS === 100
 *
 * @see packages/g2-app/src/engine/hud-delta-driver.ts (implementation — created in Task 2)
 * @see .planning/phases/EVF-24-delta-loop-5fps-xxhash/24-01-PLAN.md (plan context)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HudDeltaDriverOpts } from './hud-delta-driver.js';
import { DEFAULT_MIN_REDRAW_INTERVAL_MS, HudDeltaDriver } from './hud-delta-driver.js';

// ── xxhash-wasm mock ──────────────────────────────────────────────────────────

/**
 * Mock the xxhash-wasm default export.
 *
 * `await xxhash()` resolves synchronously to an object whose `h32Raw(Uint8Array)`
 * returns a deterministic hash based on the input bytes:
 *   - Empty/zero-filled buffers → 0
 *   - Non-zero buffers → sum of the first 64 bytes (mod 2^32)
 * This guarantees: identical bytes → identical hash; changed bytes → changed hash.
 */
vi.mock('xxhash-wasm', () => {
  const h32Raw = (buf: Uint8Array): number => {
    // Sum first 64 bytes as a cheap deterministic hash.
    let h = 0;
    const limit = Math.min(buf.length, 64);
    for (let i = 0; i < limit; i++) {
      h = ((h + (buf[i] ?? 0)) & 0xffffffff) >>> 0;
    }
    return h;
  };
  return {
    default: () => Promise.resolve({ h32Raw }),
  };
});

// ── Frame geometry constants ──────────────────────────────────────────────────

const FRAME_W = 400;
const FRAME_H = 200;
const TILE_W = 200;
const TILE_H = 100;
const RGBA_STRIDE = 4;

// ── Test double factories ─────────────────────────────────────────────────────

/**
 * Build a synthetic 400×200×4 RGBA buffer where all pixels are zero (black).
 */
function makeBlankRgba(): Uint8ClampedArray {
  return new Uint8ClampedArray(FRAME_W * FRAME_H * RGBA_STRIDE);
}

/**
 * Fill the tile-0 (TL, x=0..199, y=0..99) quadrant with a non-zero byte value
 * so that tile-0 PNG bytes will differ from the blank baseline.
 *
 * @param rgba Mutable 400×200×4 RGBA buffer.
 * @param value Byte value to write (1..255; 0 = unchanged).
 */
function mutateTile0(rgba: Uint8ClampedArray, value = 42): void {
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const idx = (y * FRAME_W + x) * RGBA_STRIDE;
      rgba[idx] = value;
      rgba[idx + 1] = value;
      rgba[idx + 2] = value;
      rgba[idx + 3] = 255;
    }
  }
}

/**
 * Create a `CanvasCompositorLike` test double with a controllable RGBA return.
 *
 * `rgbaRef` is a mutable holder — reassign `rgbaRef.value` between calls to
 * change what `composite()` returns.
 */
function makeCompositor(initial?: Uint8ClampedArray): {
  rgbaRef: { value: Uint8ClampedArray };
  compositor: { composite: ReturnType<typeof vi.fn> };
} {
  const rgbaRef = { value: initial ?? makeBlankRgba() };
  const compositor = {
    composite: vi.fn(() => rgbaRef.value),
  };
  return { rgbaRef, compositor };
}

/**
 * Create a bridge double with a spy on `updateImageRawData`.
 *
 * Returns `{ isSuccess: () => true }` to satisfy the fail-soft check in
 * `pushHudTiles` without throwing.
 */
function makeBridge() {
  return {
    updateImageRawData: vi.fn().mockResolvedValue({ isSuccess: () => true }),
  };
}

/**
 * Create a `wsEvents` double that records subscribed channels and lets tests
 * simulate delta events by invoking the stored handler.
 *
 * Returns `{ wsEvents, fire(channel) }` where `fire` invokes all handlers
 * subscribed to that channel.
 */
function makeWsEvents() {
  const subs = new Map<string, Array<(raw: unknown) => void>>();
  const unsubCalls: string[] = [];

  const wsEvents = {
    subscribe(channel: string, fn: (raw: unknown) => void): () => void {
      const handlers = subs.get(channel) ?? [];
      handlers.push(fn);
      subs.set(channel, handlers);
      return () => {
        unsubCalls.push(channel);
        const hs = subs.get(channel) ?? [];
        const idx = hs.indexOf(fn);
        if (idx !== -1) hs.splice(idx, 1);
      };
    },
  };

  const fire = (channel: string, payload: unknown = {}): void => {
    const handlers = subs.get(channel) ?? [];
    for (const h of handlers) h(payload);
  };

  return { wsEvents, fire, unsubCalls, subs };
}

/**
 * Build a `HudDeltaDriverOpts` object from test doubles.
 */
function makeOpts(
  compositor: { composite: ReturnType<typeof vi.fn> },
  bridge: ReturnType<typeof makeBridge>,
  wsEvents: ReturnType<typeof makeWsEvents>['wsEvents'],
  minRedrawIntervalMs?: number,
): HudDeltaDriverOpts {
  return {
    compositor: compositor as unknown as HudDeltaDriverOpts['compositor'],
    bridge: bridge as unknown as HudDeltaDriverOpts['bridge'],
    wsEvents,
    ...(minRedrawIntervalMs !== undefined ? { minRedrawIntervalMs } : {}),
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('HudDeltaDriver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── Default-interval assertion ──────────────────────────────────────────────

  it('DEFAULT_MIN_REDRAW_INTERVAL_MS === 100 (D-24.1, overrides ROADMAP literal 200)', () => {
    expect(DEFAULT_MIN_REDRAW_INTERVAL_MS).toBe(100);
  });

  // ── DL-01: 1-of-4 tiles changed → exactly 1 push ───────────────────────────

  it('DL-01: after runFirstFrame seeds baselines, mutating tile-0 triggers exactly 1 updateImageRawData with containerID=0', async () => {
    // Build doubles with blank initial RGBA.
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));
    await driver.start();

    // First frame: push all 4 tiles and set baseline hashes.
    await driver.runFirstFrame();
    const callsAfterFirstFrame = bridge.updateImageRawData.mock.calls.length;
    expect(callsAfterFirstFrame).toBe(4);

    // Mutate tile-0 in the compositor output.
    const newRgba = makeBlankRgba();
    mutateTile0(newRgba, 99);
    rgbaRef.value = newRgba;

    // Trigger a delta event and advance timers by the default debounce.
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    // Exactly 1 additional call (tile 0 only).
    const additionalCalls = bridge.updateImageRawData.mock.calls.length - callsAfterFirstFrame;
    expect(additionalCalls).toBe(1);

    // The call must be for containerID = 0 (tile TL).
    const lastCallArg = bridge.updateImageRawData.mock.calls[callsAfterFirstFrame]?.[0] as
      | { containerID: number }
      | undefined;
    expect(lastCallArg?.containerID).toBe(0);

    driver.stop();
  });

  // ── DL-02: 0 tiles changed → 0 pushes (zero-push-on-idle) ──────────────────

  it('DL-02: after runFirstFrame, identical compositor output → 0 additional updateImageRawData calls', async () => {
    const rgba = makeBlankRgba();
    const { compositor } = makeCompositor(rgba);
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));
    await driver.start();
    await driver.runFirstFrame();

    const callsAfterFirstFrame = bridge.updateImageRawData.mock.calls.length;

    // Fire a delta — compositor returns identical RGBA.
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    const additionalCalls = bridge.updateImageRawData.mock.calls.length - callsAfterFirstFrame;
    expect(additionalCalls).toBe(0);

    driver.stop();
  });

  // ── DL-03: 3 rapid deltas within window collapse to 1 cycle ─────────────────

  it('DL-03: 3 rapid delta events within debounce window collapse into 1 render cycle', async () => {
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));
    await driver.start();
    await driver.runFirstFrame();

    const callsAfterFirstFrame = bridge.updateImageRawData.mock.calls.length;
    const compositeCallsAfterFirstFrame = compositor.composite.mock.calls.length;

    // Ensure tile-0 changes so at least one push would occur.
    const newRgba = makeBlankRgba();
    mutateTile0(newRgba, 77);
    rgbaRef.value = newRgba;

    // 3 rapid deltas — all within the debounce window (no timer advance between them).
    fire('character.delta');
    fire('combat.turn');
    fire('combat.state');

    // Advance timers once — exactly 1 composite() call should occur.
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    const additionalCompositeCalls =
      compositor.composite.mock.calls.length - compositeCallsAfterFirstFrame;
    expect(additionalCompositeCalls).toBe(1);

    // Only 1 push (tile-0 changed once).
    const additionalPushCalls = bridge.updateImageRawData.mock.calls.length - callsAfterFirstFrame;
    expect(additionalPushCalls).toBe(1);

    driver.stop();
  });

  // ── DL-04: configurable debounce interval ────────────────────────────────────

  it('DL-04: with minRedrawIntervalMs:50, a 49ms advance does NOT trigger a cycle; 50ms does', async () => {
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents, 50));
    await driver.start();
    await driver.runFirstFrame();

    // Mutate so a change would be detected.
    const newRgba = makeBlankRgba();
    mutateTile0(newRgba, 55);
    rgbaRef.value = newRgba;

    const callsAfterFirstFrame = bridge.updateImageRawData.mock.calls.length;

    // Trigger delta.
    fire('character.delta');

    // 49ms advance — timer not yet fired.
    await vi.advanceTimersByTimeAsync(49);
    const callsAt49ms = bridge.updateImageRawData.mock.calls.length - callsAfterFirstFrame;
    expect(callsAt49ms).toBe(0);

    // 1 more ms — timer fires at exactly 50ms.
    await vi.advanceTimersByTimeAsync(1);
    const callsAt50ms = bridge.updateImageRawData.mock.calls.length - callsAfterFirstFrame;
    expect(callsAt50ms).toBe(1);

    driver.stop();
  });

  // ── DL-05: static-chrome determinism ─────────────────────────────────────────

  it('DL-05: two consecutive cycles with byte-identical compositor output → 0 pushes on the second cycle', async () => {
    const rgba = makeBlankRgba();
    // Non-zero pixels so the first cycle sees actual content.
    mutateTile0(rgba, 33);
    const { compositor } = makeCompositor(rgba);
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));
    await driver.start();
    await driver.runFirstFrame();

    // First delta cycle — compositor returns the same RGBA as first frame.
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    const callsAfterFirstCycle = bridge.updateImageRawData.mock.calls.length;

    // Second delta cycle — compositor still returns identical RGBA.
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    const callsAfterSecondCycle = bridge.updateImageRawData.mock.calls.length;
    expect(callsAfterSecondCycle - callsAfterFirstCycle).toBe(0);

    driver.stop();
  });

  // ── DL-06: stop() cancels timer and releases all subscriptions ────────────────

  it('DL-06: stop() cancels pending debounce timer and invokes all unsub closures', async () => {
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, unsubCalls, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));
    await driver.start();
    await driver.runFirstFrame();

    // Mutate so a change would be detected if the timer fired.
    const newRgba = makeBlankRgba();
    mutateTile0(newRgba, 11);
    rgbaRef.value = newRgba;

    const callsBeforeStop = bridge.updateImageRawData.mock.calls.length;

    // Schedule a timer (debounce in flight).
    fire('character.delta');

    // Stop before timer fires.
    driver.stop();

    // Advance past the debounce window — timer must NOT fire.
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS * 2);
    const callsAfterStop = bridge.updateImageRawData.mock.calls.length;
    expect(callsAfterStop).toBe(callsBeforeStop);

    // All 3 channel unsub closures must have been invoked.
    expect(unsubCalls).toHaveLength(3);
    expect(unsubCalls).toContain('character.delta');
    expect(unsubCalls).toContain('combat.turn');
    expect(unsubCalls).toContain('combat.state');
  });

  // ── First-frame: runFirstFrame pushes all 4 tiles unconditionally ─────────────

  it('first-frame: runFirstFrame() pushes all 4 tiles regardless of hash state, and seeds baseline hashes so subsequent identical cycle → 0 pushes', async () => {
    const rgba = makeBlankRgba();
    const { compositor } = makeCompositor(rgba);
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));
    await driver.start();

    // No prior hashes — first frame must push all 4 tiles.
    await driver.runFirstFrame();
    expect(bridge.updateImageRawData).toHaveBeenCalledTimes(4);

    // Subsequent cycle with identical compositor output → 0 additional pushes.
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);
    expect(bridge.updateImageRawData).toHaveBeenCalledTimes(4);

    driver.stop();
  });
});
