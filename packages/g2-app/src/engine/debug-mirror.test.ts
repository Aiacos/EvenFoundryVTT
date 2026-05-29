/**
 * Tests for DebugMirror — Quick Task 260529-h5e Wave 4.
 *
 * The DebugMirror copies the PerfProbe zero-overhead pattern: when `enabled` is
 * false, `record()` is a hard no-op (the injected `send` sink is NEVER called,
 * no allocations). When enabled, `record()` stamps `ts` and calls `send` once
 * with a complete {@link DisplayOpPayload}.
 *
 * @see ./debug-mirror.ts
 * @see ./perf-probe.ts (the zero-overhead pattern this mirrors)
 */

import type { DisplayOpPayload } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { DebugMirror } from './debug-mirror.js';

describe('DebugMirror — disabled (zero overhead)', () => {
  it('record() is a no-op when disabled: send is never called', () => {
    const send = vi.fn();
    const mirror = new DebugMirror({ enabled: false, send });
    mirror.record({ op: 'rebuild', containerCount: 3, z: 0 });
    mirror.record({ op: 'mount' });
    mirror.record({ op: 'destroy' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('DebugMirror — enabled', () => {
  it('record() stamps ts and calls send once with a DisplayOpPayload', () => {
    const send = vi.fn<(p: DisplayOpPayload) => void>();
    const mirror = new DebugMirror({ enabled: true, send, now: () => 1_700_000_000_000 });
    mirror.record({ op: 'rebuild', containerCount: 3, z: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]?.[0] as DisplayOpPayload;
    expect(payload.op).toBe('rebuild');
    expect(payload.containerCount).toBe(3);
    expect(payload.z).toBe(0);
    expect(payload.ts).toBe(1_700_000_000_000);
  });

  it('records mount and destroy ops with their op tag', () => {
    const send = vi.fn<(p: DisplayOpPayload) => void>();
    const mirror = new DebugMirror({ enabled: true, send });
    mirror.record({ op: 'mount' });
    mirror.record({ op: 'destroy' });
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[0]?.[0] as DisplayOpPayload).op).toBe('mount');
    expect((send.mock.calls[1]?.[0] as DisplayOpPayload).op).toBe('destroy');
    for (const call of send.mock.calls) {
      expect(typeof (call[0] as DisplayOpPayload).ts).toBe('number');
    }
  });

  it('uses Date.now by default when no `now` provided', () => {
    const send = vi.fn<(p: DisplayOpPayload) => void>();
    const before = Date.now();
    const mirror = new DebugMirror({ enabled: true, send });
    mirror.record({ op: 'rebuild' });
    const ts = (send.mock.calls[0]?.[0] as DisplayOpPayload).ts;
    expect(ts).toBeGreaterThanOrEqual(before);
  });
});
