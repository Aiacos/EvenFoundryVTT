/**
 * SeqTracker unit tests (Task 1 — Plan 10-01 TDD RED phase).
 *
 * Covers the 7 behaviour points specified in the plan:
 *   ST-01 new SeqTracker() starts at lastConfirmedSeq = -1
 *   ST-02 observe(env) with env.seq=0 advances to 0
 *   ST-03 observe(env) with seq < current is a no-op (monotonic guard)
 *   ST-04 observe(env) with seq > current+1 still advances (gap is bridge's problem)
 *   ST-05 observe accepts any object with `seq: number` (duck-typed, no Zod parse)
 *   ST-06 getLastConfirmedSeq() returns current value (read-only accessor)
 *   ST-07 reset() returns tracker to -1
 *
 * @see packages/g2-app/src/engine/seq-tracker.ts
 * @see .planning/phases/10-polish-field-test-mvp/10-01-PLAN.md Task 1
 */
import { describe, expect, it } from 'vitest';
import { SeqTracker } from '../engine/seq-tracker.js';

describe('SeqTracker', () => {
  it('ST-01: new SeqTracker() starts at lastConfirmedSeq = -1', () => {
    const tracker = new SeqTracker();
    expect(tracker.getLastConfirmedSeq()).toBe(-1);
  });

  it('ST-02: observe(env) with env.seq=0 advances to 0', () => {
    const tracker = new SeqTracker();
    tracker.observe({ seq: 0 });
    expect(tracker.getLastConfirmedSeq()).toBe(0);
  });

  it('ST-03: observe(env) with seq < current is a no-op (monotonic guard)', () => {
    const tracker = new SeqTracker();
    tracker.observe({ seq: 5 });
    tracker.observe({ seq: 3 });
    // Out-of-order replay — must stay at 5
    expect(tracker.getLastConfirmedSeq()).toBe(5);
  });

  it('ST-04: observe(env) with seq > current+1 still advances (gap is bridge problem)', () => {
    const tracker = new SeqTracker();
    tracker.observe({ seq: 0 });
    tracker.observe({ seq: 5 }); // gap of 4 — tracker advances anyway
    expect(tracker.getLastConfirmedSeq()).toBe(5);
  });

  it('ST-05: observe accepts any object with seq:number (duck-typed, no Zod parse)', () => {
    const tracker = new SeqTracker();
    // Extra fields are tolerated — duck-typing, not schema validation.
    // Cast to { seq: number } since TS checks object literal extra properties;
    // at runtime, only seq is read (the whole point of duck-typing).
    const envelope = { seq: 7, type: 'character.delta', proto: 'evf-v1', extra: true } as {
      seq: number;
    };
    tracker.observe(envelope);
    expect(tracker.getLastConfirmedSeq()).toBe(7);
  });

  it('ST-06: getLastConfirmedSeq() returns the current value (read-only accessor)', () => {
    const tracker = new SeqTracker();
    expect(tracker.getLastConfirmedSeq()).toBe(-1);
    tracker.observe({ seq: 3 });
    expect(tracker.getLastConfirmedSeq()).toBe(3);
    tracker.observe({ seq: 3 }); // same seq — no-op (monotonic guard applies at >=)
    expect(tracker.getLastConfirmedSeq()).toBe(3);
    tracker.observe({ seq: 10 });
    expect(tracker.getLastConfirmedSeq()).toBe(10);
  });

  it('ST-07: reset() returns tracker to -1 (used on resume_full_snapshot)', () => {
    const tracker = new SeqTracker();
    tracker.observe({ seq: 42 });
    expect(tracker.getLastConfirmedSeq()).toBe(42);
    tracker.reset();
    expect(tracker.getLastConfirmedSeq()).toBe(-1);
  });
});
