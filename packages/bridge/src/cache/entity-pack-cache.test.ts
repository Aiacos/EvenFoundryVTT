/**
 * Unit tests for EntityPackCache — Phase 15 Plan 03 Task 1.
 *
 * Test IDs:
 *   - EPC-BASIC-01: get() before any set() returns null (cold cache)
 *   - EPC-BASIC-02: set() overwrites the previous payload (last-write-wins)
 *   - EPC-BASIC-03: clear() resets the cache to null
 *
 * Phase 15 Plan 03 — onChange subscription API (VOICE-09 hot-update path):
 *   - EPC-SUB-01: onChange(listener) registers; subsequent set() invokes listener
 *                 synchronously AFTER the cache state is updated
 *   - EPC-SUB-02: Multiple listeners are all invoked in registration order
 *   - EPC-SUB-03: removeListener(listener) detaches by reference; subsequent set()
 *                 does NOT invoke the removed listener
 *   - EPC-SUB-04: A listener that throws does NOT block subsequent listeners
 *   - EPC-SUB-05: clear() invokes listeners with `null` payload (consistent contract:
 *                 listeners see the new cache state, whatever it is)
 *
 * @see ./entity-pack-cache.ts
 * @see ../voice/keyterm-refresher.ts (production consumer of onChange — Task 3)
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-03-PLAN.md Task 1
 */

import type { AvailableEntitiesPayload } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityPackCache } from './entity-pack-cache.js';

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EntityPackCache — base contract (EPC-BASIC-01..03)', () => {
  let cache: EntityPackCache;
  beforeEach(() => {
    cache = new EntityPackCache();
  });

  it('EPC-BASIC-01: get() before any set() returns null (cold cache)', () => {
    expect(cache.get()).toBeNull();
  });

  it('EPC-BASIC-02: set() overwrites previous payload (last-write-wins)', () => {
    const first = makePayload('first');
    const second = makePayload('second');
    cache.set(first);
    expect(cache.get()).toBe(first);
    cache.set(second);
    expect(cache.get()).toBe(second);
  });

  it('EPC-BASIC-03: clear() resets the cache to null', () => {
    cache.set(makePayload('to-clear'));
    expect(cache.get()).not.toBeNull();
    cache.clear();
    expect(cache.get()).toBeNull();
  });
});

describe('EntityPackCache — onChange subscription (EPC-SUB-01..05)', () => {
  let cache: EntityPackCache;
  beforeEach(() => {
    cache = new EntityPackCache();
  });

  it('EPC-SUB-01: onChange(listener) registers; set() invokes listener synchronously after state update', () => {
    const observed: Array<AvailableEntitiesPayload | null> = [];
    let stateAtInvocation: AvailableEntitiesPayload | null | undefined;
    cache.onChange((payload) => {
      observed.push(payload);
      // Assert: the cache state has ALREADY been updated when the listener fires.
      stateAtInvocation = cache.get();
    });
    const p = makePayload('sub-01');
    cache.set(p);
    expect(observed).toEqual([p]);
    expect(stateAtInvocation).toBe(p);
  });

  it('EPC-SUB-02: Multiple listeners invoked in registration order', () => {
    const order: string[] = [];
    cache.onChange(() => order.push('first'));
    cache.onChange(() => order.push('second'));
    cache.onChange(() => order.push('third'));
    cache.set(makePayload('sub-02'));
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('EPC-SUB-03: removeListener(listener) detaches by reference', () => {
    const a = vi.fn();
    const b = vi.fn();
    cache.onChange(a);
    cache.onChange(b);
    cache.removeListener(a);
    cache.set(makePayload('sub-03'));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('EPC-SUB-04: A throwing listener does NOT block subsequent listeners', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const boom = vi.fn(() => {
      throw new Error('boom');
    });
    const after = vi.fn();
    cache.onChange(boom);
    cache.onChange(after);
    expect(() => cache.set(makePayload('sub-04'))).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    // The fallback warn fires when no injected logger is available.
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('EPC-SUB-05: clear() invokes listeners with `null` payload', () => {
    const listener = vi.fn();
    cache.set(makePayload('sub-05'));
    cache.onChange(listener);
    cache.clear();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(null);
  });
});
