/**
 * Unit tests for the write-path debug-trace beacon state (debug-trace.ts).
 *
 * The trace is module-global by design (handlers can mark progress without threading a
 * sequence), so each test resets it via `_resetDebugTrace`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetDebugTrace,
  beginTrace,
  getEnvSummary,
  getWritePathTrace,
  setEnvSummary,
  traceCurrent,
  traceStep,
} from './debug-trace.js';

describe('debug-trace', () => {
  afterEach(() => _resetDebugTrace());

  it('beginTrace bumps the sequence and records the opening label', () => {
    const seq1 = beginTrace('cast-spell:start');
    expect(seq1).toBe(1);
    expect(getWritePathTrace()).toBe('#1:cast-spell:start');

    const seq2 = beginTrace('skill-check:start');
    expect(seq2).toBe(2);
    expect(getWritePathTrace()).toBe('#2:skill-check:start');
  });

  it('traceCurrent marks a step on the latest sequence without threading it', () => {
    beginTrace('cast-spell:start');
    traceCurrent('cast-spell:activity.use:pending');
    expect(getWritePathTrace()).toBe('#1:cast-spell:activity.use:pending');
  });

  it('traceStep records against an explicit sequence', () => {
    const seq = beginTrace('use-item:start');
    traceStep(seq, 'use-item:handler:done:true');
    expect(getWritePathTrace()).toBe('#1:use-item:handler:done:true');
  });

  it('env summary round-trips and starts empty', () => {
    expect(getEnvSummary()).toBe('');
    setEnvSummary('fvtt:13;sys:dnd5e@5.3.3;midi:1;socketlib:1;gm:0');
    expect(getEnvSummary()).toBe('fvtt:13;sys:dnd5e@5.3.3;midi:1;socketlib:1;gm:0');
  });

  it('_resetDebugTrace clears trace, env, and the sequence', () => {
    beginTrace('x');
    setEnvSummary('y');
    _resetDebugTrace();
    expect(getWritePathTrace()).toBe('');
    expect(getEnvSummary()).toBe('');
    // sequence restarts at 1 after reset
    expect(beginTrace('z')).toBe(1);
  });
});
