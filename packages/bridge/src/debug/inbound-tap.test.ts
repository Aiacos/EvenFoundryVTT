/**
 * Unit tests for makeInboundTap — the gated WS inbound debug tap (W-2).
 *
 * Quick Task 260529-h5e Wave 2.
 *
 * W-2 contract:
 *   - The debug-enabled boolean is captured ONCE as a closure const at build time
 *     (NOT re-read from process.env per message).
 *   - When disabled, the tap does ZERO work per message: no JSON parse, no bus.push.
 *   - When enabled, each message best-effort-parses type/seq and pushes one inbound event.
 *
 * @see ./inbound-tap.ts
 * @see ../server.ts (consumer — wires the tap inside the WS message loop)
 */
import { describe, expect, it, vi } from 'vitest';
import { DebugEventBus } from './debug-event-bus.js';
import { makeInboundTap } from './inbound-tap.js';

describe('makeInboundTap (W-2)', () => {
  it('returns a no-op that does ZERO work when disabled (no parse, no push)', () => {
    const bus = new DebugEventBus();
    const pushSpy = vi.spyOn(bus, 'push');
    const parseSpy = vi.spyOn(JSON, 'parse');

    const tap = makeInboundTap(false, bus);
    tap('s1', JSON.stringify({ type: 'tool.invoke', seq: 5 }));

    expect(pushSpy).not.toHaveBeenCalled();
    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it('pushes one inbound event with best-effort parsed type/seq when enabled', () => {
    const bus = new DebugEventBus();
    const tap = makeInboundTap(true, bus);
    tap('s1', JSON.stringify({ type: 'tool.invoke', seq: 5 }));

    const events = bus.query({ tail: 10 });
    expect(events.length).toBe(1);
    expect(events[0]?.direction).toBe('inbound');
    expect(events[0]?.type).toBe('tool.invoke');
    expect(events[0]?.seq).toBe(5);
    expect(events[0]?.sessionId).toBe('s1');
  });

  it('falls back to "unparsed" type for non-JSON messages when enabled', () => {
    const bus = new DebugEventBus();
    const tap = makeInboundTap(true, bus);
    tap('s1', 'not-json-at-all');
    const events = bus.query({ tail: 10 });
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('unparsed');
    expect(events[0]?.seq).toBeNull();
  });

  it('captures the disabled flag at build time — later env flips do not enable it', () => {
    const bus = new DebugEventBus();
    const tap = makeInboundTap(false, bus);
    process.env.EVF_DEBUG = 'true'; // must NOT affect the already-built tap
    tap('s1', JSON.stringify({ type: 'x' }));
    expect(bus.query({ tail: 10 }).length).toBe(0);
    delete process.env.EVF_DEBUG;
  });
});
