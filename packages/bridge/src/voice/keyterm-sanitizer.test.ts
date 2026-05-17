/**
 * Unit tests for sanitizeKeyterms — Phase 15 Plan 04 Task 1.
 *
 * sanitizeKeyterms is the "minimal damage" form for the Deepgram keyterm retry
 * path (CONTEXT D-06). When Deepgram closes a session with a keyterm-reject
 * code, the Phase 15 adapter retries ONCE with the sanitized form before
 * falling back to a no-keyterm baseline URL.
 *
 * Test IDs:
 *   - SAN-01: Pure-clean input passes through unchanged
 *   - SAN-02: ASCII control chars (0x00-0x1F + 0x7F) are stripped from each term
 *   - SAN-03: Runs of internal whitespace collapse to a single space
 *   - SAN-04: Leading/trailing whitespace trimmed; <2-char terms dropped
 *   - SAN-05: Idempotency — sanitizeKeyterms(sanitizeKeyterms(x)) === sanitizeKeyterms(x)
 *   - SAN-06: Cap at DEEPGRAM_KEYTERM_LIMIT (=100)
 *
 * @see ./keyterm-sanitizer.ts
 * @see ./keyterm-merger.ts (DEEPGRAM_KEYTERM_LIMIT source)
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-04-PLAN.md Task 1
 */

import { describe, expect, it } from 'vitest';
import { DEEPGRAM_KEYTERM_LIMIT } from './keyterm-merger.js';
import { sanitizeKeyterms } from './keyterm-sanitizer.js';

describe('sanitizeKeyterms — pure function (SAN-01..06)', () => {
  it('SAN-01: pure-clean input passes through unchanged', () => {
    const input = ['fireball', 'palla di fuoco', 'counterspell', 'è accentata'];
    expect(sanitizeKeyterms(input)).toEqual(input);
  });

  it('SAN-02: strips ASCII control chars (0x00-0x1F + 0x7F) from each term', () => {
    // Embedded control chars: NUL (\x00), TAB (\x09), CR (\x0D), DEL (\x7F).
    // The sanitizer must remove the control chars but preserve the surrounding
    // visible glyphs. Note that '\t' between words collapses to a single space
    // via SAN-03 (whitespace collapse runs AFTER control-char strip).
    const input = ['fire\x00ball', 'palla\tdi\rfuoco', 'foo\x7Fbar', 'shi\x1Feld'];
    const out = sanitizeKeyterms(input);
    // 'fire\x00ball' → 'fireball' (NUL stripped, no whitespace to collapse)
    expect(out).toContain('fireball');
    // 'palla\tdi\rfuoco' → '\t' is whitespace (collapses to single space later),
    // but \r is ALSO whitespace. The control-char strip handles \x0D explicitly
    // (it falls in 0x00-0x1F). Tab (\x09) is also in 0x00-0x1F. The net result
    // is both stripped, then any remaining whitespace collapses.
    // Both \t and \r are stripped → 'palladifuoco'.
    expect(out).toContain('palladifuoco');
    // 'foo\x7Fbar' → 'foobar' (DEL stripped)
    expect(out).toContain('foobar');
    // 'shi\x1Feld' → 'shield' (US stripped)
    expect(out).toContain('shield');
  });

  it('SAN-03: collapses runs of internal whitespace to a single space', () => {
    const input = ['palla  di   fuoco', 'long       sword', 'one two'];
    const out = sanitizeKeyterms(input);
    // Multiple internal spaces → single space.
    expect(out).toContain('palla di fuoco');
    expect(out).toContain('long sword');
    // U+00A0 NBSP matches /\s/ in JS regex and collapses to a single space.
    expect(out).toContain('one two');
  });

  it('SAN-04: trims leading/trailing whitespace and drops <2-char terms', () => {
    const input = [
      '  fireball  ', // trimmed → 'fireball' (kept; len 8)
      'a', // dropped (len 1)
      '   ', // dropped (empty after trim)
      '', // dropped (empty)
      'ab', // kept (len 2 — boundary)
      '  z  ', // trimmed → 'z' (dropped; len 1)
      '\t\nshield\r', // trimmed/stripped → 'shield' (kept)
    ];
    const out = sanitizeKeyterms(input);
    expect(out).toContain('fireball');
    expect(out).toContain('ab');
    expect(out).toContain('shield');
    expect(out).not.toContain('a');
    expect(out).not.toContain('z');
    expect(out).not.toContain('');
    // Total expected: 3 kept (fireball, ab, shield)
    expect(out).toHaveLength(3);
  });

  it('SAN-05: idempotent — sanitizeKeyterms(sanitizeKeyterms(x)) === sanitizeKeyterms(x)', () => {
    // Messy input mixing all SAN-02/03/04 cases at once.
    const messy = [
      'fire\x00ball', // SAN-02 strip
      'palla  di   fuoco', // SAN-03 collapse
      '  counterspell  ', // SAN-04 trim
      'a', // SAN-04 drop
      'è\taccentata', // SAN-02 strip + SAN-03 collapse
      '', // SAN-04 drop
    ];
    const once = sanitizeKeyterms(messy);
    const twice = sanitizeKeyterms(once);
    expect(twice).toEqual(once);
  });

  it('SAN-06: caps output at DEEPGRAM_KEYTERM_LIMIT (first-N wins)', () => {
    // 200 unique 3-char terms → must cap at 100 (first 100 preserved).
    const big = Array.from({ length: 200 }, (_, i) => `abc${i}`);
    const out = sanitizeKeyterms(big);
    expect(out).toHaveLength(DEEPGRAM_KEYTERM_LIMIT);
    expect(out[0]).toBe('abc0');
    expect(out[DEEPGRAM_KEYTERM_LIMIT - 1]).toBe(`abc${DEEPGRAM_KEYTERM_LIMIT - 1}`);
    // Beyond the cap: nothing.
    expect(out).not.toContain(`abc${DEEPGRAM_KEYTERM_LIMIT}`);
    expect(out).not.toContain('abc199');
  });
});
