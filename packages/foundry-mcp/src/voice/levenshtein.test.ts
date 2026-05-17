/**
 * Unit tests for levenshteinDistance + normaliseForFuzzyMatch.
 *
 * Phase 12 Plan 01 Task 1 — TDD RED-then-GREEN.
 *
 * @see levenshtein.ts
 */
import { describe, expect, it } from 'vitest';
import { levenshteinDistance, normaliseForFuzzyMatch } from './levenshtein.js';

describe('levenshteinDistance', () => {
  it('empty vs empty = 0', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('identical strings = 0', () => {
    expect(levenshteinDistance('fireball', 'fireball')).toBe(0);
  });

  it('one deletion: fireball vs firball = 1', () => {
    expect(levenshteinDistance('fireball', 'firball')).toBe(1);
  });

  it('one deletion (space): palla di fuoco vs palladi fuoco = 1', () => {
    expect(levenshteinDistance('palla di fuoco', 'palladi fuoco')).toBe(1);
  });

  it('one deletion: palla di fuoco vs pala di fuoco = 1', () => {
    expect(levenshteinDistance('palla di fuoco', 'pala di fuoco')).toBe(1);
  });

  it('one substitution: cura vs cure = 1', () => {
    expect(levenshteinDistance('cura', 'cure')).toBe(1);
  });

  it('one-character vs empty = 1', () => {
    expect(levenshteinDistance('a', '')).toBe(1);
    expect(levenshteinDistance('', 'a')).toBe(1);
  });

  it('asymmetric distances are commutative', () => {
    expect(levenshteinDistance('abc', 'ab')).toBe(levenshteinDistance('ab', 'abc'));
  });

  it('completely different short strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  it('Unicode code-point: è vs e = 1 BEFORE normalisation (code-point counted once)', () => {
    // Multi-byte character should cost 1 (code-point counting), not 2–3 (byte counting)
    expect(levenshteinDistance('è', 'e')).toBe(1);
  });
});

describe('normaliseForFuzzyMatch', () => {
  it('empty string → empty string', () => {
    expect(normaliseForFuzzyMatch('')).toBe('');
  });

  it('NFD + strip combining marks + lowercase: Velocità → velocita', () => {
    expect(normaliseForFuzzyMatch('Velocità')).toBe('velocita');
  });

  it('multi-space collapse + trim: "  Palla   Di   Fuoco  " → "palla di fuoco"', () => {
    expect(normaliseForFuzzyMatch('  Palla   Di   Fuoco  ')).toBe('palla di fuoco');
  });

  it('plain ASCII lowercase', () => {
    expect(normaliseForFuzzyMatch('Fireball')).toBe('fireball');
  });

  it('Unicode combining marks confirmation: à vs a', () => {
    // After normalisation, 'à' becomes 'a'
    expect(normaliseForFuzzyMatch('à')).toBe('a');
    expect(normaliseForFuzzyMatch('Á')).toBe('a');
  });

  it('composition: normalise both sides first → è and e are distance 0', () => {
    // Smoke-test the composition pattern: levenshtein(normalise(a), normalise(b))
    const a = normaliseForFuzzyMatch('è');
    const b = normaliseForFuzzyMatch('e');
    expect(a).toBe('e');
    expect(b).toBe('e');
    expect(levenshteinDistance(a, b)).toBe(0);
  });
});
