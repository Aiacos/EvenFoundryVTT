/**
 * Tests for ForcedLeaderTracker — mark/isActive + TTL expiry (ADR-0015 §C P2c).
 */
import { describe, expect, it } from 'vitest';
import { ForcedLeaderTracker } from './forced-leader-tracker.js';

describe('ForcedLeaderTracker', () => {
  it('FLT-1: inactive before any mark', () => {
    expect(new ForcedLeaderTracker().isActive(1000)).toBe(false);
  });

  it('FLT-2: active right after mark', () => {
    const t = new ForcedLeaderTracker(10_000);
    t.mark(1000);
    expect(t.isActive(1000)).toBe(true);
    expect(t.isActive(9999)).toBe(true);
  });

  it('FLT-3: expires after the TTL', () => {
    const t = new ForcedLeaderTracker(10_000);
    t.mark(1000);
    expect(t.isActive(11_000)).toBe(false); // 10s elapsed
    expect(t.isActive(10_999)).toBe(true);
  });

  it('FLT-4: a fresh mark re-extends the window', () => {
    const t = new ForcedLeaderTracker(10_000);
    t.mark(1000);
    t.mark(8000);
    expect(t.isActive(17_000)).toBe(true); // within 10s of the 2nd mark
    expect(t.isActive(18_001)).toBe(false);
  });
});
