/**
 * Unit tests for SPELL_LOOKUP table + lookupSpellId resolver.
 *
 * Phase 12 Plan 01 Task 2 — TDD RED-then-GREEN.
 *
 * @see spell-lookup.ts
 */
import { describe, expect, it } from 'vitest';
import { SPELL_LOOKUP, lookupSpellId } from './spell-lookup.js';

// ─── Table shape invariants ──────────────────────────────────────────────────

describe('SPELL_LOOKUP table invariants', () => {
  it('SPELL_LOOKUP_COUNT_GATE: exactly 70 entries', () => {
    expect(SPELL_LOOKUP.length).toBe(70);
  });

  it('every entry has non-empty it, en, kebab-case dnd5eId, and level in [0..9]', () => {
    const kebabRe = /^[a-z][a-z0-9-]*[a-z0-9]$/;
    for (const entry of SPELL_LOOKUP) {
      expect(entry.it.length).toBeGreaterThan(0);
      expect(entry.en.length).toBeGreaterThan(0);
      expect(kebabRe.test(entry.dnd5eId)).toBe(true);
      expect(entry.level).toBeGreaterThanOrEqual(0);
      expect(entry.level).toBeLessThanOrEqual(9);
    }
  });

  it('dnd5eId values are unique across the table', () => {
    const ids = SPELL_LOOKUP.map((e) => e.dnd5eId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('includes 5 canonical reactions: shield, counterspell, absorb-elements, hellish-rebuke, feather-fall', () => {
    const reactionIds = new Set(['shield', 'counterspell', 'absorb-elements', 'hellish-rebuke', 'feather-fall']);
    const found = SPELL_LOOKUP.filter((e) => reactionIds.has(e.dnd5eId));
    expect(found.length).toBe(5);
  });

  it('includes fireball, cure-wounds, mass-cure-wounds, magic-missile, healing-word', () => {
    const required = new Set(['fireball', 'cure-wounds', 'mass-cure-wounds', 'magic-missile', 'healing-word']);
    const found = SPELL_LOOKUP.filter((e) => required.has(e.dnd5eId));
    expect(found.length).toBe(5);
  });
});

// ─── lookupSpellId — exact matches ──────────────────────────────────────────

describe('lookupSpellId — exact matches', () => {
  it('EN exact: fireball → { dnd5eId: "fireball", confidence: "exact", source: "en-table" }', () => {
    const result = lookupSpellId('fireball');
    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
    expect(result.source).toBe('en-table');
  });

  it('whitespace + case insensitive: "Fireball  " → en-table exact', () => {
    const result = lookupSpellId('Fireball  ');
    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
    expect(result.source).toBe('en-table');
  });

  it('IT exact: "palla di fuoco" → { dnd5eId: "fireball", confidence: "exact", source: "it-table" }', () => {
    const result = lookupSpellId('palla di fuoco');
    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
    expect(result.source).toBe('it-table');
  });

  it('IT with accent: "Velocità" → { dnd5eId: "haste", confidence: "exact", source: "it-table" }', () => {
    const result = lookupSpellId('Velocità');
    expect(result.dnd5eId).toBe('haste');
    expect(result.confidence).toBe('exact');
    expect(result.source).toBe('it-table');
  });
});

// ─── lookupSpellId — fuzzy matches ──────────────────────────────────────────

describe('lookupSpellId — fuzzy matches (Levenshtein ≤ 2)', () => {
  it('"firball" (typo, distance=1) → { confidence: "fuzzy", source: "levenshtein", distance: 1 }', () => {
    const result = lookupSpellId('firball');
    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('fuzzy');
    expect(result.source).toBe('levenshtein');
    expect(result.distance).toBe(1);
  });
});

// ─── lookupSpellId — ambiguous + no-match ────────────────────────────────────

describe('lookupSpellId — ambiguous / no-match', () => {
  it('"xyzzy" (no match) → { dnd5eId: null, confidence: "none", source: "no-match" }', () => {
    const result = lookupSpellId('xyzzy');
    expect(result.dnd5eId).toBeNull();
    expect(result.confidence).toBe('none');
    expect(result.source).toBe('no-match');
  });

  it('empty string → { dnd5eId: null, confidence: "none", source: "no-match" }', () => {
    const result = lookupSpellId('');
    expect(result.dnd5eId).toBeNull();
    expect(result.confidence).toBe('none');
    expect(result.source).toBe('no-match');
  });
});

// ─── T-12-03 mitigation ───────────────────────────────────────────────────────

describe('T-12-03 mitigation: no hallucinated IDs', () => {
  it('every non-null result dnd5eId is present in SPELL_LOOKUP', () => {
    const ids = new Set(SPELL_LOOKUP.map((e) => e.dnd5eId));
    // Sample several lookups
    const inputs = [
      'fireball', 'palla di fuoco', 'cure wounds', 'magic missile',
      'shield', 'invisibility', 'xyzzy', '', 'haste', 'firball',
    ];
    for (const input of inputs) {
      const result = lookupSpellId(input);
      if (result.dnd5eId !== null) {
        expect(ids.has(result.dnd5eId)).toBe(true);
      }
    }
  });
});
