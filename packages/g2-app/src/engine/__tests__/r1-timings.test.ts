/**
 * Unit tests for DEFAULT_R1_TIMINGS + R1Timings type (Plan 06-01 Task 1).
 *
 * Covers the r1-timings behavior block:
 *   - RT-01: DEFAULT_R1_TIMINGS has correct locked values
 *   - RT-02: DEFAULT_R1_TIMINGS is frozen (immutability guard)
 *
 * (RT-03 retired by ADR-0012: `longPressMs` no longer exists — long-press is
 * not a supported hardware gesture; no duration-based input.)
 *
 * @see ../r1-timings.ts (source)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-01-PLAN.md Task 1
 * @see Specs.md §3.2 + §10.0.1 (R1 hardware model + GO criteria)
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_R1_TIMINGS } from '../r1-timings.js';

describe('DEFAULT_R1_TIMINGS (RT-01..RT-02)', () => {
  it('RT-01: has locked timing values (tapMs=250, doubleTapWindowMs=350, scrollDebounceMs=50)', () => {
    expect(DEFAULT_R1_TIMINGS.tapMs).toBe(250);
    expect(DEFAULT_R1_TIMINGS.doubleTapWindowMs).toBe(350);
    expect(DEFAULT_R1_TIMINGS.scrollDebounceMs).toBe(50);
  });

  it('RT-02: Object.isFrozen(DEFAULT_R1_TIMINGS) === true (immutability guard)', () => {
    expect(Object.isFrozen(DEFAULT_R1_TIMINGS)).toBe(true);
  });
});
