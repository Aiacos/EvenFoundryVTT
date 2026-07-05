/**
 * Branch-coverage tests for spell-lookup-foundry.ts.
 *
 * Complements spell-lookup-foundry.test.ts by exercising the resolution arms
 * the original suite skipped:
 * - Dynamic substring EN / locale matches (word-boundary containment).
 * - Dynamic Levenshtein tie → ambiguous result with candidate list.
 * - Dynamic post-fuzzy no-match (all distances > MAX_FUZZY_DISTANCE).
 * - containsSpellName word-boundary at string start (idx === 0).
 * - Static-fallback substring EN / locale, fuzzy single winner, and no-match
 *   (reached when no bridge config is supplied).
 *
 * Every assertion pins the resolved dnd5eId / confidence / source — no
 * call-and-ignore. Behaviour is asserted against the exact SpellLookupResult.
 *
 * @see packages/foundry-mcp/src/voice/spell-lookup-foundry.ts
 */

import type { AvailableSpellsPayload } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetSpellCache, lookupSpellIdFromBridge } from '../spell-lookup-foundry.js';

const BRIDGE_URL = 'http://localhost:8910';
const BEARER = 'test-bearer-token';

const FIREBALL_ENTRY = {
  id: 'fireball',
  packId: 'dnd5e.spells',
  name: 'Fireball',
  nameLocalized: 'Palla di Fuoco',
  level: 3,
  school: 'evo',
};

const MAGIC_MISSILE_ENTRY = {
  id: 'magic-missile',
  packId: 'dnd5e.spells',
  name: 'Magic Missile',
  nameLocalized: 'Dardo Incantato',
  level: 1,
  school: 'evo',
};

function makePayload(entries: object[]): AvailableSpellsPayload {
  return {
    entries,
    source: 'foundry-packs',
    count: entries.length,
    generatedAt: Date.now(),
  } as AvailableSpellsPayload;
}

function stubFetch(payload: AvailableSpellsPayload): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
  );
}

describe('lookupSpellIdFromBridge — dynamic resolution arms', () => {
  beforeEach(() => {
    _resetSpellCache();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dynamic substring EN match inside a sentence → en-table', async () => {
    stubFetch(makePayload([FIREBALL_ENTRY, MAGIC_MISSILE_ENTRY]));
    const result = await lookupSpellIdFromBridge('i cast fireball now', BRIDGE_URL, BEARER);
    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
    expect(result.source).toBe('en-table');
  });

  it('dynamic substring match at string start (idx === 0) → en-table', async () => {
    stubFetch(makePayload([FIREBALL_ENTRY, MAGIC_MISSILE_ENTRY]));
    const result = await lookupSpellIdFromBridge('fireball incoming', BRIDGE_URL, BEARER);
    expect(result.dnd5eId).toBe('fireball');
    expect(result.source).toBe('en-table');
  });

  it('dynamic substring locale match inside a sentence → it-table', async () => {
    stubFetch(makePayload([FIREBALL_ENTRY, MAGIC_MISSILE_ENTRY]));
    const result = await lookupSpellIdFromBridge(
      'lancio palla di fuoco adesso',
      BRIDGE_URL,
      BEARER,
    );
    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
    expect(result.source).toBe('it-table');
  });

  it('dynamic Levenshtein tie → ambiguous with both candidates', async () => {
    // "glyxh" is Levenshtein-1 from both "glyph" and "glyfh"; locale names are far.
    const glyphA = {
      id: 'glyph-of-warding',
      packId: 'dnd5e.spells',
      name: 'Glyph',
      nameLocalized: 'zzzzzzzzzz',
      level: 3,
      school: 'abj',
    };
    const glyphB = {
      id: 'false-glyfh',
      packId: 'dnd5e.spells',
      name: 'Glyfh',
      nameLocalized: 'wwwwwwwwww',
      level: 3,
      school: 'abj',
    };
    stubFetch(makePayload([glyphA, glyphB]));
    const result = await lookupSpellIdFromBridge('glyxh', BRIDGE_URL, BEARER);
    expect(result.dnd5eId).toBeNull();
    expect(result.confidence).toBe('ambiguous');
    expect(result.source).toBe('levenshtein');
    expect(result.candidates?.map((c) => c.dnd5eId).sort()).toEqual(
      ['false-glyfh', 'glyph-of-warding'].sort(),
    );
  });

  it('dynamic single fuzzy winner → levenshtein with distance', async () => {
    stubFetch(makePayload([FIREBALL_ENTRY, MAGIC_MISSILE_ENTRY]));
    // "firebal" is distance 1 from "fireball" (EN), far from everything else.
    const result = await lookupSpellIdFromBridge('firebal', BRIDGE_URL, BEARER);
    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('fuzzy');
    expect(result.source).toBe('levenshtein');
    expect(result.distance).toBe(1);
  });

  it('dynamic no-match: all distances > 2 → no-match, no static fallback', async () => {
    stubFetch(makePayload([FIREBALL_ENTRY, MAGIC_MISSILE_ENTRY]));
    const result = await lookupSpellIdFromBridge('qwertyuiopzxcv', BRIDGE_URL, BEARER);
    expect(result.dnd5eId).toBeNull();
    expect(result.confidence).toBe('none');
    expect(result.source).toBe('no-match');
  });
});

describe('lookupSpellIdFromBridge — static fallback arms (no bridge config)', () => {
  beforeEach(() => {
    _resetSpellCache();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('static substring EN match inside a sentence → en-table', async () => {
    const result = await lookupSpellIdFromBridge('i cast fireball now');
    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
    expect(result.source).toBe('en-table');
  });

  it('static substring locale match inside a sentence → it-table', async () => {
    const result = await lookupSpellIdFromBridge('lancio palla di fuoco adesso');
    expect(result.dnd5eId).toBe('fireball');
    expect(result.source).toBe('it-table');
  });

  it('static fuzzy single winner (typo) → levenshtein', async () => {
    const result = await lookupSpellIdFromBridge('firebal');
    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('fuzzy');
    expect(result.source).toBe('levenshtein');
    expect(result.distance).toBe(1);
  });

  it('static no-match: gibberish → none / no-match', async () => {
    const result = await lookupSpellIdFromBridge('zzzzqwertyxcvb');
    expect(result.dnd5eId).toBeNull();
    expect(result.confidence).toBe('none');
    expect(result.source).toBe('no-match');
  });
});
