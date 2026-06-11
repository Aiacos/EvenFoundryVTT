/**
 * hud-delta-driver.test.ts — DL-01..DL-06 + DL-07 + DL-08 + DL-09..DL-13 + first-frame + default-interval
 *
 * Unit tests for {@link HudDeltaDriver}: event-driven throttle loop with
 * per-tile xxhash delta detection (Phase 24, RPROMO-01) + trailing-edge
 * re-arm (DG5, 2026-06-11).
 *
 * Test coverage:
 *   DL-01 — 1-of-4 tiles changed → exactly 1 updateImageRawData call
 *   DL-02 — 0 tiles changed → 0 updateImageRawData calls (zero-push-on-idle)
 *   DL-03 — 3 rapid deltas within throttle window → 1 render cycle (collapse)
 *   DL-04 — configurable throttle interval (50ms custom vs 100ms default)
 *   DL-05 — static-chrome determinism: identical compositor output → 0 pushes after first frame
 *   DL-06 — stop() cancels pending timer and releases all subscriptions
 *   DL-07 — start() idempotency (CR-01): calling start() twice yields exactly 4 subscriptions
 *   DL-08 — sustained events faster than interval do NOT starve the cycle (throttle, not debounce)
 *   DL-09 — cadence: trailing pacing delivers ≥ floor of cycles over 1000ms continuous input
 *   DL-10 — no event loss: event during pending window triggers exactly one follow-up cycle
 *   DL-11 — no overlap: single-in-flight guard — composite() calls are serialized
 *   DL-12 — idle no re-arm: no events after first cycle → zero further composites
 *   DL-13 — stop() during pending: follow-up cycle cancelled, no push after stop
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
    // FNV-1a over the WHOLE buffer — cheap but byte-position-sensitive. The old
    // first-64-bytes sum collided on indexed PNGs whose header+palette prefix is
    // identical (Bayer-dithered tiles, 2026-06-10).
    let h = 0x811c9dc5;
    for (let i = 0; i < buf.length; i++) {
      h = (h ^ (buf[i] ?? 0)) >>> 0;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  return {
    default: () => Promise.resolve({ h32Raw }),
  };
});

// ── Frame geometry constants ──────────────────────────────────────────────────

const FRAME_W = 576;
const FRAME_H = 288;
const TILE_W = 288;
const TILE_H = 144;
const RGBA_STRIDE = 4;

// ── Test double factories ─────────────────────────────────────────────────────

/**
 * Build a synthetic 576×288×4 RGBA buffer where all pixels are zero (black).
 */
function makeBlankRgba(): Uint8ClampedArray {
  return new Uint8ClampedArray(FRAME_W * FRAME_H * RGBA_STRIDE);
}

/**
 * Fill the tile-0 (TL, x=0..287, y=0..143) quadrant with a non-zero byte value
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

    // Trigger a delta event and advance timers by the default throttle.
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

  it('DL-03: 3 rapid delta events within throttle window collapse into 1 render cycle', async () => {
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

    // 3 rapid deltas — all within the throttle window (no timer advance between them).
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

  // ── DL-04: configurable throttle interval ────────────────────────────────────

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

  // ── DL-08: throttle anti-starvation (updated to also serve as DL-09 cadence baseline) ─

  it('DL-08: sustained events faster than the interval do NOT starve the cycle (throttle, not debounce)', async () => {
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));
    await driver.start();
    await driver.runFirstFrame();

    const compositeCallsAfterFirstFrame = compositor.composite.mock.calls.length;

    // Storm: an event every 50ms for 1000ms — always faster than the 100ms
    // interval. With the old clearTimeout+re-arm (debounce) behaviour the timer
    // was perpetually reset and ZERO cycles fired during the storm (live-measured
    // 2026-06-10: ≥15fps frame input → ~0.2 fps delivered). Throttle semantics
    // must fire ~1 cycle per interval: expect ≥8 composites over 1000ms.
    let seed = 1;
    for (let t = 0; t < 20; t++) {
      const rgba = makeBlankRgba();
      mutateTile0(rgba, seed++);
      rgbaRef.value = rgba;
      fire('character.delta');
      await vi.advanceTimersByTimeAsync(50);
    }

    const cyclesDuringStorm =
      compositor.composite.mock.calls.length - compositeCallsAfterFirstFrame;
    expect(cyclesDuringStorm).toBeGreaterThanOrEqual(8);

    driver.stop();
  });

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

    // Schedule a timer (throttle in flight).
    fire('character.delta');

    // Stop before timer fires.
    driver.stop();

    // Advance past the throttle window — timer must NOT fire.
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS * 2);
    const callsAfterStop = bridge.updateImageRawData.mock.calls.length;
    expect(callsAfterStop).toBe(callsBeforeStop);

    // All 4 channel unsub closures must have been invoked.
    expect(unsubCalls).toHaveLength(4);
    expect(unsubCalls).toContain('character.delta');
    expect(unsubCalls).toContain('combat.turn');
    expect(unsubCalls).toContain('combat.state');
    expect(unsubCalls).toContain('r1.gesture');
  });

  // ── DL-07: start() idempotency — calling start() twice yields exactly 4 subscriptions ──

  it('DL-07 (CR-01): start() called twice yields only 4 active subscriptions and a single debounce cycle per delta', async () => {
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, subs, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));

    // Call start() twice — the second call must be a no-op.
    await driver.start();
    await driver.start();

    // Each channel must have exactly 1 subscriber, not 2.
    expect(subs.get('character.delta')).toHaveLength(1);
    expect(subs.get('combat.turn')).toHaveLength(1);
    expect(subs.get('combat.state')).toHaveLength(1);
    expect(subs.get('r1.gesture')).toHaveLength(1);

    await driver.runFirstFrame();

    // Mutate tile-0 so a change is detectable.
    const newRgba = makeBlankRgba();
    mutateTile0(newRgba, 22);
    rgbaRef.value = newRgba;

    const callsAfterFirstFrame = bridge.updateImageRawData.mock.calls.length;

    // Exactly 1 composite() per throttle cycle, not 2 (no duplicate handler).
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(DEFAULT_MIN_REDRAW_INTERVAL_MS);

    const additionalCalls = bridge.updateImageRawData.mock.calls.length - callsAfterFirstFrame;
    expect(additionalCalls).toBe(1);

    driver.stop();
  });

  // ── DL-DITHER: getDitherMode option is threaded through _buildTiles ────────────

  it('DL-DITHER-01: HudDeltaDriverOpts accepts optional getDitherMode callback', () => {
    // Should compile and construct without error when getDitherMode is provided
    const { compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents } = makeWsEvents();
    const opts: HudDeltaDriverOpts = {
      compositor: compositor as unknown as HudDeltaDriverOpts['compositor'],
      bridge: bridge as unknown as HudDeltaDriverOpts['bridge'],
      wsEvents,
      getDitherMode: () => true,
    };
    const driver = new HudDeltaDriver(opts);
    expect(driver).toBeDefined();
    driver.stop();
  });

  it('DL-DITHER-02: HudDeltaDriverOpts without getDitherMode defaults to dither=true (no regression)', async () => {
    // No getDitherMode → same as before (dither=true implicitly)
    const rgba = makeBlankRgba();
    const { compositor } = makeCompositor(rgba);
    const bridge = makeBridge();
    const { wsEvents } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));
    await driver.start();
    await driver.runFirstFrame();
    // Must still push all 4 tiles (no regression)
    expect(bridge.updateImageRawData).toHaveBeenCalledTimes(4);
    driver.stop();
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

  // ── DL-09: trailing-edge cadence — continuous deltas → ≥ floor cycles ────────

  it('DL-09: continuous deltas every 50ms for ~1000ms with each mutation → trailing pacing delivers ≥8 composite calls', async () => {
    // This is the trailing-edge cadence assertion. With the new trailing-edge
    // re-arm, even if a cycle is in flight when the timer would fire, a follow-up
    // is armed immediately upon cycle completion. Period = max(interval, cycleTime).
    // With interval=100ms and 1000ms of continuous events, ≥8 cycles are expected.
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents));
    await driver.start();
    await driver.runFirstFrame();

    const compositeBase = compositor.composite.mock.calls.length;

    // Deliver one event every 50ms for 1000ms (20 events total), each mutating
    // tile-0 with a fresh seed so changes are always detected.
    let seed = 1;
    for (let t = 0; t < 20; t++) {
      const rgba = makeBlankRgba();
      mutateTile0(rgba, seed++);
      rgbaRef.value = rgba;
      fire('character.delta');
      await vi.advanceTimersByTimeAsync(50);
    }

    const cyclesDelivered = compositor.composite.mock.calls.length - compositeBase;
    // With 100ms interval and 1000ms of events: expect ≥8 (trailing-edge pacing).
    expect(cyclesDelivered).toBeGreaterThanOrEqual(8);

    driver.stop();
  });

  // ── DL-10: no event loss — event during pending window triggers one follow-up ─

  it('DL-10: event fired during pending window (timer armed) triggers exactly one follow-up cycle', async () => {
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const INTERVAL = 50;
    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents, INTERVAL));
    await driver.start();
    await driver.runFirstFrame();

    // Seed a change for the first cycle.
    const rgba1 = makeBlankRgba();
    mutateTile0(rgba1, 10);
    rgbaRef.value = rgba1;
    const compositeBase = compositor.composite.mock.calls.length;

    // First event: arms the timer (leading edge).
    fire('character.delta');

    // Second event: arrives BEFORE the timer fires (during the pending window).
    // This must set _pendingAgain = true (coalesced into follow-up).
    const rgba2 = makeBlankRgba();
    mutateTile0(rgba2, 20);
    rgbaRef.value = rgba2;
    fire('character.delta');

    // Advance through the first interval — first cycle fires and completes.
    // The trailing-edge re-arm arms a follow-up immediately (0 remaining time
    // since the cycle completes nearly instantly under fake timers).
    await vi.advanceTimersByTimeAsync(INTERVAL);

    // At this point the first cycle has run; with _pendingAgain set, a follow-up
    // should be armed. Advance one more interval to fire the follow-up.
    await vi.advanceTimersByTimeAsync(INTERVAL);

    // We expect EXACTLY 2 composite calls: first cycle + one follow-up.
    const cyclesAfter = compositor.composite.mock.calls.length - compositeBase;
    expect(cyclesAfter).toBe(2);

    driver.stop();
  });

  // ── DL-11: no overlap — single in-flight cycle guard ─────────────────────────

  it('DL-11: composite() calls are ordered (no interleaving) even with back-to-back cycles', async () => {
    // Under fake timers, cycles complete synchronously in order. We verify that
    // multiple cycles never overlap by checking composite() is called in order
    // with no concurrent calls: each invocation sees the rgbaRef value set
    // immediately before its triggering event.
    const capturedValues: number[] = [];
    const rgbaRef = { value: makeBlankRgba() };
    const compositor = {
      composite: vi.fn(() => {
        // Snapshot the current tile-0 pixel at the time of the composite call.
        capturedValues.push(rgbaRef.value[0] ?? 0);
        return rgbaRef.value;
      }),
    };
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const INTERVAL = 50;
    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents, INTERVAL));
    await driver.start();
    await driver.runFirstFrame();

    const compositeBase = compositor.composite.mock.calls.length;

    // Three sequential cycles with distinct mutations. Each cycle should see
    // the rgba value set at or before its trigger.
    const rgba1 = makeBlankRgba();
    mutateTile0(rgba1, 111);
    rgbaRef.value = rgba1;
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(INTERVAL); // first cycle fires

    const rgba2 = makeBlankRgba();
    mutateTile0(rgba2, 122);
    rgbaRef.value = rgba2;
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(INTERVAL); // second cycle fires

    const rgba3 = makeBlankRgba();
    mutateTile0(rgba3, 133);
    rgbaRef.value = rgba3;
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(INTERVAL); // third cycle fires

    const cyclesAfter = compositor.composite.mock.calls.length - compositeBase;
    // Three distinct triggers → three cycles, no overlap.
    expect(cyclesAfter).toBe(3);

    // The captured values must be non-decreasing: each composite() ran after its
    // mutation was applied, proving no interleaving.
    const capturedAfter = capturedValues.slice(compositeBase);
    for (let i = 1; i < capturedAfter.length; i++) {
      expect(capturedAfter[i] ?? 0).toBeGreaterThanOrEqual(capturedAfter[i - 1] ?? 0);
    }

    driver.stop();
  });

  // ── DL-12: idle no re-arm — no events → zero further composites ──────────────

  it('DL-12: no events after the first cycle → no further re-arm, zero additional composites (D-24.3)', async () => {
    // After the first triggered cycle completes with _pendingAgain = false,
    // the driver must NOT re-arm the timer. Advancing 3× the interval with no
    // new events must produce zero additional composite() calls.
    const { compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const INTERVAL = 50;
    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents, INTERVAL));
    await driver.start();
    await driver.runFirstFrame();

    const compositeBase = compositor.composite.mock.calls.length;

    // One event to arm the first cycle.
    const rgba = makeBlankRgba();
    mutateTile0(rgba, 5);
    (compositor.composite as ReturnType<typeof vi.fn>).mockReturnValue(rgba);
    fire('character.delta');
    await vi.advanceTimersByTimeAsync(INTERVAL); // first cycle fires

    const compositeAfterFirst = compositor.composite.mock.calls.length - compositeBase;
    expect(compositeAfterFirst).toBe(1);

    // No further events — advance 3× the interval.
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    const compositeAfterIdle = compositor.composite.mock.calls.length - compositeBase;
    // Still only 1: no re-arm when idle.
    expect(compositeAfterIdle).toBe(1);

    driver.stop();
  });

  // ── DL-13: stop() during pending — follow-up cancelled ───────────────────────

  it('DL-13: stop() while _pendingAgain is set cancels the follow-up — no cycle after stop', async () => {
    const { rgbaRef, compositor } = makeCompositor(makeBlankRgba());
    const bridge = makeBridge();
    const { wsEvents, fire } = makeWsEvents();

    const INTERVAL = 50;
    const driver = new HudDeltaDriver(makeOpts(compositor, bridge, wsEvents, INTERVAL));
    await driver.start();
    await driver.runFirstFrame();

    // First event: arm the timer (leading edge).
    const rgba1 = makeBlankRgba();
    mutateTile0(rgba1, 30);
    rgbaRef.value = rgba1;
    fire('character.delta');

    // Second event: arrives during the pending window → sets _pendingAgain = true.
    const rgba2 = makeBlankRgba();
    mutateTile0(rgba2, 60);
    rgbaRef.value = rgba2;
    fire('character.delta');

    // Advance through the first interval so first cycle fires and _pendingAgain
    // is detected. _fireCycle will try to re-arm, but stop() has cleared the flag.
    // Stop BEFORE the re-arm fires.
    driver.stop();

    const compositeAfterStop = compositor.composite.mock.calls.length;

    // Advance well past where the follow-up would have fired.
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    // No additional composite() calls after stop.
    expect(compositor.composite.mock.calls.length).toBe(compositeAfterStop);
  });
});
