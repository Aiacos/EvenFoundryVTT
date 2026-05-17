/**
 * Tests for keyterm-merger.ts — the pure vocabulary-merger that builds the
 * Deepgram Keyterm Prompting `keyterm` list.
 *
 * Phase 15 Plan 01 Task 2 — KM-01..KM-12 case coverage.
 *
 * The merger is a pure function over (static SPELL_KEYTERMS, dynamic
 * AvailableEntitiesPayload | null) returning a deduplicated, capped,
 * locale-merged string[]. No side effects, no I/O, no SDK dependency —
 * tested entirely with literal fixtures.
 *
 * Conventions exercised here:
 * - VOICE-07 union (static spells + dynamic entity-pack)
 * - VOICE-08 locale-aware (BOTH .it and .en for spells; BOTH .name and
 *   .nameLocalized for entities)
 * - CONTEXT D-01 static wins on conflict (lower-cased trimmed key)
 * - CONTEXT D-04 truncation drops dynamic entity-pack entries first
 *
 * @see packages/bridge/src/voice/keyterm-merger.ts
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-01-PLAN.md Task 2
 */

import type { AvailableEntitiesPayload, SpellKeytermEntry } from '@evf/shared-protocol';
import { SPELL_KEYTERMS } from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import {
  type BuildKeytermListOpts,
  buildKeytermList,
  DEEPGRAM_KEYTERM_LIMIT,
} from './keyterm-merger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal empty payload (source='empty'). */
function emptyPayload(): AvailableEntitiesPayload {
  return { entries: [], source: 'empty', count: 0, generatedAt: 0 };
}

/** Build a payload from a list of (name, nameLocalized) tuples. */
function payloadFromEntities(
  pairs: ReadonlyArray<{ name: string; nameLocalized: string }>,
): AvailableEntitiesPayload {
  return {
    entries: pairs.map((p, i) => ({
      id: `e-${i}`,
      packId: 'test.pack',
      entityKind: 'item' as const,
      entityType: 'weapon',
      name: p.name,
      nameLocalized: p.nameLocalized,
    })),
    source: 'foundry-packs',
    count: pairs.length,
    generatedAt: 1_700_000_000_000,
  };
}

/** A 2-entry mini static spell list — used when KM-09 wants a small static set. */
const MINI_STATIC: ReadonlyArray<SpellKeytermEntry> = Object.freeze([
  { it: 'palla di fuoco', en: 'fireball' },
  { it: 'scudo', en: 'shield' },
]);

// ─── Constants ────────────────────────────────────────────────────────────────

describe('DEEPGRAM_KEYTERM_LIMIT', () => {
  it('equals 100 (Deepgram documented cap per RESEARCH.md §1 Sources)', () => {
    expect(DEEPGRAM_KEYTERM_LIMIT).toBe(100);
  });
});

// ─── Union basics — KM-01..KM-03 ─────────────────────────────────────────────

describe('buildKeytermList — union basics', () => {
  it('KM-01: empty entity-cache snapshot returns 140 entries (70 spells × 2 locales)', () => {
    const result = buildKeytermList(SPELL_KEYTERMS, emptyPayload(), { limitOverride: 1000 });
    expect(result.length).toBe(140);
  });

  it('KM-02: includes BOTH .it and .en of each spell (VOICE-08 locale-aware)', () => {
    const result = buildKeytermList(SPELL_KEYTERMS, emptyPayload(), { limitOverride: 1000 });
    // Spot-check both locales for a representative entry.
    expect(result).toContain('fireball');
    expect(result).toContain('palla di fuoco');
    expect(result).toContain('counterspell');
    expect(result).toContain('contromagia');
    // Both locales of every entry are present.
    for (const k of SPELL_KEYTERMS) {
      expect(result, `missing en form of ${k.en}`).toContain(k.en);
      expect(result, `missing it form of ${k.it}`).toContain(k.it);
    }
  });

  it('KM-03: includes BOTH .name and .nameLocalized of each entity entry', () => {
    const snap = payloadFromEntities([
      { name: 'Longsword', nameLocalized: 'Spada Lunga' },
      { name: 'Lord Brankor', nameLocalized: 'Lord Brankor' },
    ]);
    const result = buildKeytermList(SPELL_KEYTERMS, snap, { limitOverride: 1000 });
    // Entity-pack candidates preserve original casing (no static-collision here).
    expect(result).toContain('Longsword');
    expect(result).toContain('Spada Lunga');
    expect(result).toContain('Lord Brankor'); // single occurrence — see KM-04
    // Dedupe by lower-cased trimmed key — the duplicate Lord Brankor / Lord Brankor
    // pair within the same entry collapses to a single entry in `out`.
    expect(result.filter((s) => s.toLowerCase().trim() === 'lord brankor')).toHaveLength(1);
  });
});

// ─── Dedupe + static wins — KM-04..KM-05 ─────────────────────────────────────

describe('buildKeytermList — dedupe + static wins', () => {
  it('KM-04: dedupes by lowercased trimmed key across all sources', () => {
    const snap = payloadFromEntities([
      // Two entries with name === nameLocalized → would emit twice if not deduped.
      { name: 'Lord Brankor', nameLocalized: 'Lord Brankor' },
      // Same entity repeated across packs (compendium dedup is upstream, but
      // we belt-and-suspenders dedup here too).
      { name: 'Lord Brankor', nameLocalized: 'lord brankor' },
    ]);
    const result = buildKeytermList(SPELL_KEYTERMS, snap, { limitOverride: 1000 });
    expect(result.filter((s) => s.toLowerCase().trim() === 'lord brankor')).toHaveLength(1);
  });

  it('KM-05: static wins on conflict (CONTEXT D-01)', () => {
    const snap = payloadFromEntities([
      // These collide with static spell entries; should be dropped in favour
      // of the static (lower-case canonical) versions.
      { name: 'Fireball', nameLocalized: 'Palla Di Fuoco' },
      { name: 'Shield', nameLocalized: 'Scudo' },
    ]);
    const result = buildKeytermList(SPELL_KEYTERMS, snap, { limitOverride: 1000 });

    // Static "fireball" + "palla di fuoco" present (lower-case from SPELL_KEYTERMS).
    expect(result.filter((s) => s.toLowerCase() === 'fireball')).toHaveLength(1);
    expect(result.filter((s) => s.toLowerCase() === 'palla di fuoco')).toHaveLength(1);
    expect(result.filter((s) => s.toLowerCase() === 'shield')).toHaveLength(1);
    expect(result.filter((s) => s.toLowerCase() === 'scudo')).toHaveLength(1);

    // The capitalised dynamic variants are absent — the merger emitted the
    // static lower-case form first, and the dynamic dedupe-by-lower-key
    // dropped the entity-pack version.
    expect(result).not.toContain('Fireball');
    expect(result).not.toContain('Palla Di Fuoco');
    expect(result).not.toContain('Shield');
    expect(result).not.toContain('Scudo');
  });
});

// ─── Filtering — KM-06 ──────────────────────────────────────────────────────

describe('buildKeytermList — filtering', () => {
  it('KM-06: drops empty / whitespace-only candidates before insertion', () => {
    // Inject empty strings via a mini static list to exercise the filter
    // without depending on entity-pack (where Zod min(1) prevents empties
    // at the cache boundary anyway).
    const dirtyStatic: ReadonlyArray<SpellKeytermEntry> = [
      { it: '', en: 'valid-en' },
      { it: 'valid-it', en: '   ' },
      { it: 'valid-it-2', en: 'valid-en-2' },
    ];
    const result = buildKeytermList(dirtyStatic, emptyPayload(), { limitOverride: 1000 });
    // Only the non-empty/non-whitespace candidates survive.
    expect(result).toContain('valid-en');
    expect(result).toContain('valid-it');
    expect(result).toContain('valid-it-2');
    expect(result).toContain('valid-en-2');
    expect(result).not.toContain('');
    expect(result).not.toContain('   ');
    // Total = 4 unique non-empty values.
    expect(result.length).toBe(4);
  });
});

// ─── Cap behaviour — KM-07..KM-09 ────────────────────────────────────────────

describe('buildKeytermList — cap', () => {
  it('KM-07: result.length ≤ DEEPGRAM_KEYTERM_LIMIT; entity entries dropped first', () => {
    // Mini static (4 candidates: en×2 + it×2 ≤ limit of 5) + lots of entities.
    const snap = payloadFromEntities([
      { name: 'item1', nameLocalized: 'oggetto1' }, // 2 candidates
      { name: 'item2', nameLocalized: 'oggetto2' }, // 2 candidates, but cap=5 → only 1 fits
      { name: 'item3', nameLocalized: 'oggetto3' }, // not reached
    ]);
    const result = buildKeytermList(MINI_STATIC, snap, { limitOverride: 5 });
    expect(result.length).toBe(5);
    // All 4 static candidates survived.
    expect(result).toContain('fireball');
    expect(result).toContain('palla di fuoco');
    expect(result).toContain('shield');
    expect(result).toContain('scudo');
    // Only the first entity-pack candidate squeezed in (encounter order — KM-08).
    expect(result).toContain('item1');
    expect(result).not.toContain('oggetto1'); // would have been the 6th
    expect(result).not.toContain('item2');
    expect(result).not.toContain('item3');
  });

  it('KM-08: entity-pack truncation preserves encounter (array) order', () => {
    const snap = payloadFromEntities([
      { name: 'alpha', nameLocalized: 'alfa' },
      { name: 'beta', nameLocalized: 'beta-it' },
      { name: 'gamma', nameLocalized: 'gamma-it' },
    ]);
    // Static = 4 candidates, limit = 6 → only 2 entity-pack slots.
    const result = buildKeytermList(MINI_STATIC, snap, { limitOverride: 6 });
    expect(result.length).toBe(6);
    // The 5th and 6th outputs are the first 2 entity-pack candidates in array
    // order: 'alpha' (name of first entry) then 'alfa' (nameLocalized of same
    // first entry) — NOT the name of the second entry. This is the encounter
    // order specified by the action algorithm (iterate entries, push name
    // then nameLocalized).
    expect(result.slice(4)).toEqual(['alpha', 'alfa']);
    expect(result).not.toContain('beta');
    expect(result).not.toContain('gamma');
  });

  it('KM-09: when static candidates alone exceed limit, caps at limit and emits no entity entries', () => {
    // SPELL_KEYTERMS = 70 entries → 140 candidates. Cap at 50 → exactly 50,
    // and entity-pack contributes zero.
    const snap = payloadFromEntities([{ name: 'should-not-appear', nameLocalized: 'mai' }]);
    const result = buildKeytermList(SPELL_KEYTERMS, snap, { limitOverride: 50 });
    expect(result.length).toBe(50);
    expect(result).not.toContain('should-not-appear');
    expect(result).not.toContain('mai');
  });
});

// ─── Result shape — KM-10 ────────────────────────────────────────────────────

describe('buildKeytermList — result shape', () => {
  it('KM-10: returns a fresh, mutable string[] (not frozen)', () => {
    const result = buildKeytermList(SPELL_KEYTERMS, null);
    expect(Array.isArray(result)).toBe(true);
    expect(Object.isFrozen(result)).toBe(false);
    // Caller can mutate freely.
    result.push('extra-callsite-term');
    expect(result.at(-1)).toBe('extra-callsite-term');
  });
});

// ─── Cold-cache + empty source — KM-11..KM-12 ────────────────────────────────

describe('buildKeytermList — cold-cache + empty source', () => {
  it('KM-11: null entitySnapshot is accepted and behaves like empty entries[]', () => {
    const withNull = buildKeytermList(SPELL_KEYTERMS, null, { limitOverride: 1000 });
    const withEmpty = buildKeytermList(SPELL_KEYTERMS, emptyPayload(), { limitOverride: 1000 });
    expect(withNull).toEqual(withEmpty);
    expect(withNull.length).toBe(140);
  });

  it("KM-12: source='empty' payload is treated equivalently to entries.length===0", () => {
    const emptySource: AvailableEntitiesPayload = {
      entries: [],
      source: 'empty',
      count: 0,
      generatedAt: 0,
    };
    const foundryEmpty: AvailableEntitiesPayload = {
      entries: [],
      source: 'foundry-packs',
      count: 0,
      generatedAt: 0,
    };
    const a = buildKeytermList(SPELL_KEYTERMS, emptySource, { limitOverride: 1000 });
    const b = buildKeytermList(SPELL_KEYTERMS, foundryEmpty, { limitOverride: 1000 });
    expect(a).toEqual(b);
    expect(a.length).toBe(140);
  });
});

// ─── Production default path — opts omitted ──────────────────────────────────

describe('buildKeytermList — production default (no opts)', () => {
  it('defaults to DEEPGRAM_KEYTERM_LIMIT when no opts are passed', () => {
    const result = buildKeytermList(SPELL_KEYTERMS, null);
    // 140 static candidates would be emitted; cap=100 forces truncation.
    expect(result.length).toBe(DEEPGRAM_KEYTERM_LIMIT);
    expect(result.length).toBe(100);
  });

  // Compile-time anchor — guards future signature drift on BuildKeytermListOpts.
  it('exposes BuildKeytermListOpts shape consumable by callers', () => {
    const opts: BuildKeytermListOpts = { limitOverride: 7 };
    expect(opts.limitOverride).toBe(7);
  });
});
