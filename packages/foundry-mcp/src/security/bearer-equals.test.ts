/**
 * Unit tests for bearerEquals (T-11-02 — constant-time bearer comparison).
 *
 * Covers every branch:
 * - Equal tokens → true (fast path: same length + same bytes)
 * - Unequal same-length tokens → false (timingSafeEqual returns false)
 * - Length mismatch → false (fast-reject branch, before timingSafeEqual)
 * - Empty provided vs non-empty expected → false (length mismatch)
 * - Both empty strings → true (degenerate equal-length equal-bytes case)
 * - Same-length, differ in last char → false (documents constant-time intent)
 */

import { describe, expect, it } from 'vitest';
import { bearerEquals } from './bearer-equals.js';

describe('bearerEquals', () => {
  it('returns true for identical tokens', () => {
    expect(bearerEquals('abc123', 'abc123')).toBe(true);
  });

  it('returns false for unequal same-length tokens', () => {
    expect(bearerEquals('abc123', 'xyz789')).toBe(false);
  });

  it('returns false on length mismatch (provided shorter) — fast-reject branch', () => {
    expect(bearerEquals('short', 'longer-token')).toBe(false);
  });

  it('returns false when provided is empty and expected is non-empty — length mismatch', () => {
    expect(bearerEquals('', 'abc')).toBe(false);
  });

  it('returns true when both tokens are empty strings — degenerate equal-length case', () => {
    expect(bearerEquals('', '')).toBe(true);
  });

  it('returns false for same-length tokens differing only in the last character — documents constant-time property', () => {
    // Both inputs have the same length, so timingSafeEqual is used (no early-exit on
    // length check). This test documents that the function does NOT short-circuit on
    // the first differing byte — the timing is constant with respect to byte values.
    expect(bearerEquals('aaaaaa', 'aaaaab')).toBe(false);
  });
});
