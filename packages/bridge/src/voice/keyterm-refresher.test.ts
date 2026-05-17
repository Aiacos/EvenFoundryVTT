/**
 * Unit tests for KeytermRefresher — Phase 15 Plan 03 Task 3.
 *
 * The refresher orchestrates the debounced + mutex-serialised refresh path:
 *
 *   EntityPackCache.set(payload)
 *     → cache.onChange listener fires
 *       → schedule setTimeout(DEBOUNCE_MS)
 *         → on fire: adapter.refreshKeyterm()
 *
 * Test IDs:
 *   - KRF-01: constructor subscribes to cache.onChange exactly once
 *   - KRF-02: A single cache.set() schedules a setTimeout(DEBOUNCE_MS);
 *             after the timer fires, adapter.refreshKeyterm() is called once
 *   - KRF-03: Burst of 5 cache.set() within DEBOUNCE_MS → exactly 1 refresh
 *   - KRF-04: Two cache.set() separated by 2× DEBOUNCE_MS → exactly 2 refreshes
 *   - KRF-05: While a refresh is in-flight, additional set() calls do NOT
 *             enqueue extra refreshes (drain-then-restart pattern)
 *   - KRF-06: dispose() removes the listener AND clears any pending timer
 *   - KRF-07: A throwing adapter.refreshKeyterm() does NOT leave the mutex
 *             stuck; the next debounced cycle still triggers a refresh
 *
 * @see ./keyterm-refresher.ts
 * @see ../cache/entity-pack-cache.ts (onChange producer; Task 1)
 * @see ./deepgram-stt.ts (refreshKeyterm consumer; Task 2)
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-03-PLAN.md Task 3
 */

import type { AvailableEntitiesPayload } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityPackCache } from '../cache/entity-pack-cache.js';
import type { DeepgramAdapter } from './deepgram-stt.js';
import { DEBOUNCE_MS, KeytermRefresher } from './keyterm-refresher.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePayload(name: string): AvailableEntitiesPayload {
  return {
    entries: [
      {
        id: `id-${name}`,
        packId: 'dnd5e.items',
        entityKind: 'item',
        entityType: 'weapon',
        name,
        nameLocalized: name,
      },
    ],
    source: 'foundry-packs',
    count: 1,
    generatedAt: 1000,
  };
}

function silentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as ConstructorParameters<typeof KeytermRefresher>[0]['logger'];
}

function buildMockAdapter(overrides?: Partial<DeepgramAdapter>): DeepgramAdapter {
  return {
    isEnabled: vi.fn(() => true),
    connect: vi.fn(),
    refreshKeyterm: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('KeytermRefresher — debounce + mutex (KRF-01..07)', () => {
  let cache: EntityPackCache;
  let adapter: DeepgramAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new EntityPackCache();
    adapter = buildMockAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('KRF-01: constructor subscribes to cache.onChange exactly once', () => {
    const onChangeSpy = vi.spyOn(cache, 'onChange');
    const refresher = new KeytermRefresher({ cache, adapter, logger: silentLogger() });
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
    refresher.dispose();
  });

  it('KRF-02: One cache.set() triggers exactly one adapter.refreshKeyterm() after DEBOUNCE_MS', () => {
    const refresher = new KeytermRefresher({ cache, adapter, logger: silentLogger() });
    cache.set(makePayload('one'));
    // Before the debounce window elapses, no refresh should have fired.
    expect(adapter.refreshKeyterm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(adapter.refreshKeyterm).toHaveBeenCalledTimes(1);
    refresher.dispose();
  });

  it('KRF-03: Burst of 5 cache.set() within DEBOUNCE_MS coalesces to exactly 1 refresh', () => {
    const refresher = new KeytermRefresher({ cache, adapter, logger: silentLogger() });
    for (let i = 0; i < 5; i++) {
      cache.set(makePayload(`burst-${i}`));
      vi.advanceTimersByTime(40); // 5 × 40 = 200 < DEBOUNCE_MS (250)
    }
    // Still inside the debounce window — timer keeps resetting on each set().
    expect(adapter.refreshKeyterm).not.toHaveBeenCalled();
    // Now flush the remaining window.
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(adapter.refreshKeyterm).toHaveBeenCalledTimes(1);
    refresher.dispose();
  });

  it('KRF-04: Two cache.set() separated by 2× DEBOUNCE_MS → exactly 2 refreshes', () => {
    const refresher = new KeytermRefresher({ cache, adapter, logger: silentLogger() });
    cache.set(makePayload('first'));
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(adapter.refreshKeyterm).toHaveBeenCalledTimes(1);
    // Now well past the first debounce window — second event triggers a new cycle.
    vi.advanceTimersByTime(DEBOUNCE_MS);
    cache.set(makePayload('second'));
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(adapter.refreshKeyterm).toHaveBeenCalledTimes(2);
    refresher.dispose();
  });

  it('KRF-05: set() calls during in-flight refresh do NOT enqueue extra refreshes (drain-then-restart)', () => {
    // Track in-flight by stalling the adapter's refresh (synchronously, so the
    // mutex semantic is exercised without needing async machinery).
    // The mutex is set _inFlight=true → call refreshKeyterm → _inFlight=false.
    // We simulate "in-flight" by spying on refreshKeyterm and asserting that
    // a set() call DURING the synchronous body does not schedule another
    // timer. (Synchronous body is the simplest correctness proof for the
    // drain-then-restart pattern.)
    const callsDuringRefresh: number[] = [];
    let refreshCallCount = 0;
    const adapterMutexProbe: DeepgramAdapter = {
      isEnabled: vi.fn(() => true),
      connect: vi.fn(),
      refreshKeyterm: vi.fn(() => {
        refreshCallCount += 1;
        // While we're "in flight", push 3 more cache events.
        cache.set(makePayload(`mid-refresh-${refreshCallCount}-a`));
        cache.set(makePayload(`mid-refresh-${refreshCallCount}-b`));
        cache.set(makePayload(`mid-refresh-${refreshCallCount}-c`));
        callsDuringRefresh.push(refreshCallCount);
      }),
    };
    const refresher = new KeytermRefresher({
      cache,
      adapter: adapterMutexProbe,
      logger: silentLogger(),
    });

    // Kick off the first refresh.
    cache.set(makePayload('initial'));
    vi.advanceTimersByTime(DEBOUNCE_MS);
    // After the first refresh body returns, _inFlight is false again and the
    // 3 set() calls fired DURING the body did NOT schedule additional timers
    // (drain-then-restart: in-flight body discards mid-flight events).
    expect(adapterMutexProbe.refreshKeyterm).toHaveBeenCalledTimes(1);
    // Advancing more time should NOT trigger any extra refreshes — those
    // mid-flight set() calls were absorbed by the drain semantic.
    vi.advanceTimersByTime(DEBOUNCE_MS * 4);
    expect(adapterMutexProbe.refreshKeyterm).toHaveBeenCalledTimes(1);
    refresher.dispose();
  });

  it('KRF-06: dispose() removes the cache listener AND clears any pending timer', () => {
    const removeSpy = vi.spyOn(cache, 'removeListener');
    const refresher = new KeytermRefresher({ cache, adapter, logger: silentLogger() });
    // Schedule a pending refresh.
    cache.set(makePayload('pending'));
    expect(adapter.refreshKeyterm).not.toHaveBeenCalled();
    refresher.dispose();
    // The pending timer must be cleared by dispose; advancing time must NOT fire it.
    vi.advanceTimersByTime(DEBOUNCE_MS * 4);
    expect(adapter.refreshKeyterm).not.toHaveBeenCalled();
    // The cache listener was detached.
    expect(removeSpy).toHaveBeenCalledTimes(1);
    // A subsequent set() on the now-detached cache must NOT trigger anything.
    cache.set(makePayload('post-dispose'));
    vi.advanceTimersByTime(DEBOUNCE_MS * 4);
    expect(adapter.refreshKeyterm).not.toHaveBeenCalled();
  });

  it('KRF-07: A throwing refreshKeyterm() is logged and does NOT leave the mutex stuck', () => {
    const logger = silentLogger();
    let throwOnce = true;
    const adapterThrowing: DeepgramAdapter = {
      isEnabled: vi.fn(() => true),
      connect: vi.fn(),
      refreshKeyterm: vi.fn(() => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('boom');
        }
      }),
    };
    const refresher = new KeytermRefresher({ cache, adapter: adapterThrowing, logger });

    // Cycle 1 — adapter throws, refresher must catch + warn.
    cache.set(makePayload('cycle-1'));
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(adapterThrowing.refreshKeyterm).toHaveBeenCalledTimes(1);
    // The warn-level log must have fired.
    const warnFn = logger.warn as unknown as ReturnType<typeof vi.fn>;
    expect(warnFn).toHaveBeenCalled();

    // Cycle 2 — mutex must be released; this refresh must still fire.
    cache.set(makePayload('cycle-2'));
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(adapterThrowing.refreshKeyterm).toHaveBeenCalledTimes(2);
    refresher.dispose();
  });
});

describe('KeytermRefresher — DEBOUNCE_MS constant', () => {
  it('exports DEBOUNCE_MS === 250 (CONTEXT D-07-locked)', () => {
    expect(DEBOUNCE_MS).toBe(250);
  });
});
