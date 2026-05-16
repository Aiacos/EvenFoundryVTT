/**
 * Unit tests for parseR1HintString (Phase 6 Plan 03 helper).
 *
 * Tests (RHP-*):
 *   - RHP-01: happy path — standard format `tap=X scroll=Y long=Z` parsed correctly
 *   - RHP-02: order-independent — `scroll=Y tap=X long=Z` parsed correctly
 *   - RHP-03: missing field — absent token defaults to empty string
 *   - RHP-04: extra whitespace tolerated (double-space or multi-space between tokens)
 *   - RHP-05: malformed input (empty string) returns three empty strings without throw
 *   - RHP-06: unrecognised tokens are silently ignored
 *   - RHP-07: `q[sheet]` bracket format preserved verbatim (longPressLabel includes brackets)
 *   - RHP-08: DE locale string parsed correctly (e.g. `scroll=Init tap=Schnell long=q[Kampf]`)
 *
 * @see packages/g2-app/src/status-hud/r1-hint-parser.ts
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-03-PLAN.md Task 1
 */

import { describe, expect, it } from 'vitest';
import { parseR1HintString } from '../r1-hint-parser.js';

describe('parseR1HintString', () => {
  it('RHP-01: parses canonical format tap=X scroll=Y long=Z', () => {
    const result = parseR1HintString('tap=cycle  scroll=nav  long=quick');
    expect(result.tap).toBe('cycle');
    expect(result.scroll).toBe('nav');
    expect(result.longPressLabel).toBe('quick');
  });

  it('RHP-02: order-independent — scroll=Y tap=X long=Z parsed correctly', () => {
    const result = parseR1HintString('scroll=iniz tap=rapida long=q[combat]');
    expect(result.tap).toBe('rapida');
    expect(result.scroll).toBe('iniz');
    expect(result.longPressLabel).toBe('q[combat]');
  });

  it('RHP-03: missing field defaults to empty string', () => {
    const result = parseR1HintString('tap=cycle scroll=nav');
    expect(result.tap).toBe('cycle');
    expect(result.scroll).toBe('nav');
    expect(result.longPressLabel).toBe('');
  });

  it('RHP-04: extra whitespace between tokens is tolerated', () => {
    // Multiple spaces between tokens (as authored in i18n-budgets pre-composed strings)
    const result = parseR1HintString('tap=cycle-tab  scroll=cont  long=q[sheet]');
    expect(result.tap).toBe('cycle-tab');
    expect(result.scroll).toBe('cont');
    expect(result.longPressLabel).toBe('q[sheet]');
  });

  it('RHP-05: malformed input (empty string) returns three empty strings without throw', () => {
    expect(() => parseR1HintString('')).not.toThrow();
    const result = parseR1HintString('');
    expect(result).toEqual({ tap: '', scroll: '', longPressLabel: '' });
  });

  it('RHP-06: whitespace-only input returns three empty strings', () => {
    const result = parseR1HintString('   ');
    expect(result).toEqual({ tap: '', scroll: '', longPressLabel: '' });
  });

  it('RHP-07: q[sheet] bracket format preserved verbatim in longPressLabel', () => {
    const result = parseR1HintString('tap=cambia-tab scroll=cont long=q[sheet]');
    expect(result.longPressLabel).toBe('q[sheet]');
    // Full bracket preserved — not truncated or modified.
    expect(result.longPressLabel).toContain('[');
    expect(result.longPressLabel).toContain(']');
  });

  it('RHP-08: DE locale string parsed correctly', () => {
    const result = parseR1HintString('scroll=Init tap=Schnell long=q[Kampf]');
    expect(result.tap).toBe('Schnell');
    expect(result.scroll).toBe('Init');
    expect(result.longPressLabel).toBe('q[Kampf]');
  });
});
