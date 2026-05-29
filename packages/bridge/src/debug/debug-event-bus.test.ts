/**
 * Unit tests for DebugEventBus — bounded ring buffer + filter + subscribe + redaction.
 *
 * Quick Task 260529-h5e Wave 2.
 *
 * Coverage:
 *   - push assigns monotonically increasing ids starting at 1.
 *   - cap eviction: cap=3, after 5 pushes only the last 3 remain.
 *   - query filters by type / direction / sessionId independently and combined.
 *   - subscribe(fn) receives each subsequent push; unsubscribe stops delivery; clear() empties.
 *   - W-4 STRUCTURAL REDACTION: a full token nested in summary OR deep in payload is scrubbed
 *     to a ≤8-char hint; the full token never appears in the stored event.
 *
 * @see ./debug-event-bus.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { DebugEventBus } from './debug-event-bus.js';

/** Minimal partial-event factory (push() assigns the id). */
function ev(overrides: Partial<Omit<Parameters<DebugEventBus['push']>[0], never>> = {}) {
  return {
    ts: 1_700_000_000_000,
    direction: 'outbound' as const,
    sessionId: 's1',
    type: 'character.delta',
    seq: 1,
    summary: 'character.delta',
    payload: {},
    ...overrides,
  };
}

describe('DebugEventBus.push', () => {
  it('assigns monotonically increasing ids starting at 1', () => {
    const bus = new DebugEventBus();
    const a = bus.push(ev());
    const b = bus.push(ev());
    const c = bus.push(ev());
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(c.id).toBe(3);
  });
});

describe('DebugEventBus cap eviction', () => {
  it('keeps only the last `cap` events', () => {
    const bus = new DebugEventBus({ cap: 3 });
    for (let i = 0; i < 5; i++) bus.push(ev({ seq: i }));
    const all = bus.query({ tail: 10 });
    expect(all.length).toBe(3);
    // Oldest two (ids 1,2) evicted; ids 3,4,5 remain in order.
    expect(all.map((e) => e.id)).toEqual([3, 4, 5]);
  });
});

describe('DebugEventBus.query filters', () => {
  it('filters by type, direction, sessionId independently and combined', () => {
    const bus = new DebugEventBus();
    bus.push(ev({ direction: 'inbound', type: 'tool.invoke', sessionId: 'a' }));
    bus.push(ev({ direction: 'outbound', type: 'character.delta', sessionId: 'b' }));
    bus.push(ev({ direction: 'outbound', type: 'combat.turn', sessionId: 'a' }));

    expect(bus.query({ direction: 'outbound' }).length).toBe(2);
    expect(bus.query({ type: 'tool.invoke' }).length).toBe(1);
    expect(bus.query({ sessionId: 'a' }).length).toBe(2);
    expect(bus.query({ direction: 'outbound', sessionId: 'a' }).length).toBe(1);
  });

  it('caps results to `tail` (newest), oldest-first ordering preserved', () => {
    const bus = new DebugEventBus();
    for (let i = 0; i < 5; i++) bus.push(ev({ seq: i }));
    const tailed = bus.query({ tail: 2 });
    expect(tailed.length).toBe(2);
    expect(tailed.map((e) => e.id)).toEqual([4, 5]);
  });
});

describe('DebugEventBus.subscribe', () => {
  it('delivers each subsequent push; unsubscribe stops delivery', () => {
    const bus = new DebugEventBus();
    const fn = vi.fn();
    const unsub = bus.subscribe(fn);
    bus.push(ev());
    bus.push(ev());
    expect(fn).toHaveBeenCalledTimes(2);
    unsub();
    bus.push(ev());
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('subscriberCount returns to baseline after unsubscribe (W-3 support)', () => {
    const bus = new DebugEventBus();
    const base = bus.subscriberCount;
    const unsub = bus.subscribe(vi.fn());
    expect(bus.subscriberCount).toBe(base + 1);
    unsub();
    expect(bus.subscriberCount).toBe(base);
  });

  it('clear() empties the buffer', () => {
    const bus = new DebugEventBus();
    bus.push(ev());
    bus.push(ev());
    bus.clear();
    expect(bus.query({ tail: 10 }).length).toBe(0);
  });
});

describe('DebugEventBus.size + byDirection (Quick Task 260529-icd)', () => {
  it('size reflects buffer length (and honours cap eviction)', () => {
    const bus = new DebugEventBus({ cap: 3 });
    expect(bus.size).toBe(0);
    bus.push(ev());
    bus.push(ev());
    expect(bus.size).toBe(2);
    bus.push(ev());
    bus.push(ev());
    bus.push(ev());
    // cap=3 → size stays at 3 after 5 pushes.
    expect(bus.size).toBe(3);
  });

  it('byDirection seeds all 5 directions at 0 and counts pushed events', () => {
    const bus = new DebugEventBus();
    expect(bus.byDirection()).toEqual({
      inbound: 0,
      outbound: 0,
      tool: 0,
      log: 0,
      display: 0,
    });
    bus.push(ev({ direction: 'inbound' }));
    bus.push(ev({ direction: 'outbound' }));
    bus.push(ev({ direction: 'outbound' }));
    bus.push(ev({ direction: 'log' }));
    bus.push(ev({ direction: 'tool' }));
    bus.push(ev({ direction: 'display' }));
    expect(bus.byDirection()).toEqual({
      inbound: 1,
      outbound: 2,
      tool: 1,
      log: 1,
      display: 1,
    });
  });
});

describe('DebugEventBus structural redaction (W-4)', () => {
  const TOKEN = 'evf_live_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c';

  it('scrubs a known session token nested deep inside a payload', () => {
    const bus = new DebugEventBus();
    bus.setKnownTokens([TOKEN]);
    const pushed = bus.push(
      ev({
        summary: `dispatched with ${TOKEN}`,
        payload: { outer: { inner: { authHeader: `Bearer ${TOKEN}` } }, list: [TOKEN] },
      }),
    );
    const serialized = JSON.stringify(pushed);
    expect(serialized).not.toContain(TOKEN);
    // A short hint may remain, but never the full token.
    expect(pushed.summary).not.toContain(TOKEN);
  });

  it('scrubs token-shaped fields by name even when no known token is registered', () => {
    const bus = new DebugEventBus();
    const pushed = bus.push(
      ev({
        summary: 'no token in summary',
        payload: {
          token: 'abcdefghijklmnopqrstuvwxyz0123456789',
          nested: { bearer: 'XYZ-very-long-secret-value-1234567890' },
        },
      }),
    );
    const serialized = JSON.stringify(pushed);
    expect(serialized).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
    expect(serialized).not.toContain('XYZ-very-long-secret-value-1234567890');
  });
});
