/**
 * Unit tests for spell-lookup-foundry.ts.
 *
 * Quick Task 20260517-spell-lookup-foundry-derived (Task 3).
 *
 * Coverage:
 * (a) fetchAvailableSpells: happy-path returns dynamic list
 * (b) fetchAvailableSpells: fetch fail → returns null (fallback to static)
 * (c) fetchAvailableSpells: bridge returns source=empty → returns null
 * (d) fetchAvailableSpells: invalid response body → returns null (T-SP-02)
 * (e) fetchAvailableSpells: 5-min TTL eviction (cache invalidation)
 * (f) lookupSpellIdFromBridge: Italian name fuzzy match ('palla di fuocoo' with typo)
 * (g) lookupSpellIdFromBridge: fallback when bridge is unreachable
 * (h) lookupSpellIdFromBridge: no bridgeUrl → static fallback
 * (i) lookupSpellIdFromBridge: dynamic exact EN match
 * (j) lookupSpellIdFromBridge: dynamic exact locale match
 *
 * @see packages/foundry-mcp/src/voice/spell-lookup-foundry.ts
 * @see .planning/quick/20260517-spell-lookup-foundry-derived/PLAN.md Task 3
 */

import type { AvailableSpellsPayload } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetSpellCache,
  fetchAvailableSpells,
  lookupSpellIdFromBridge,
  SPELL_CACHE_TTL_MS,
} from '../spell-lookup-foundry.js';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

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

function makeValidPayload(entries = [FIREBALL_ENTRY, MAGIC_MISSILE_ENTRY]): AvailableSpellsPayload {
  return {
    entries,
    source: 'foundry-packs',
    count: entries.length,
    generatedAt: Date.now(),
  };
}

function makeFetchMock(response: { ok: boolean; json?: () => Promise<unknown> } | null) {
  return vi.fn().mockResolvedValueOnce(
    response === null
      ? Promise.reject(new Error('Network error'))
      : {
          ok: response.ok,
          json: response.json ?? (() => Promise.resolve({})),
        },
  );
}

// ─── fetchAvailableSpells ─────────────────────────────────────────────────────

describe('fetchAvailableSpells', () => {
  beforeEach(() => {
    _resetSpellCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) happy-path: returns dynamic entries for valid payload', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: () => Promise.resolve(payload) }));

    const result = await fetchAvailableSpells(BRIDGE_URL, BEARER);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result?.[0]?.dnd5eId).toBe('fireball');
    expect(result?.[1]?.dnd5eId).toBe('magic-missile');
  });

  it('(a) cache is returned on second call without re-fetching', async () => {
    const payload = makeValidPayload();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAvailableSpells(BRIDGE_URL, BEARER);
    await fetchAvailableSpells(BRIDGE_URL, BEARER);

    // Only one fetch call (second hits cache)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('(b) fetch fail (network error) → returns null', async () => {
    vi.stubGlobal('fetch', makeFetchMock(null));

    const result = await fetchAvailableSpells(BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('(b) non-2xx response → returns null', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ ok: false }));

    const result = await fetchAvailableSpells(BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('(c) source=empty → returns null', async () => {
    const emptyPayload: AvailableSpellsPayload = {
      entries: [],
      source: 'empty',
      count: 0,
      generatedAt: Date.now(),
    };
    vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: () => Promise.resolve(emptyPayload) }));

    const result = await fetchAvailableSpells(BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('(d) invalid response body fails schema parse → returns null (T-SP-02)', async () => {
    const invalid = { entries: 'not-an-array', source: 'bad', count: -1 };
    vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: () => Promise.resolve(invalid) }));

    const result = await fetchAvailableSpells(BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('(e) TTL eviction: cache is re-fetched after 5 minutes', async () => {
    vi.useFakeTimers();

    const payload = makeValidPayload();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    // First fetch
    await fetchAvailableSpells(BRIDGE_URL, BEARER);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance time past TTL
    vi.advanceTimersByTime(SPELL_CACHE_TTL_MS + 1000);

    // Second fetch after TTL — should re-fetch
    await fetchAvailableSpells(BRIDGE_URL, BEARER);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

// ─── lookupSpellIdFromBridge ──────────────────────────────────────────────────

describe('lookupSpellIdFromBridge', () => {
  beforeEach(() => {
    _resetSpellCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(f) Italian fuzzy match with typo (palla di fuocoo → fireball)', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    // 'palla di fuocoo' has Levenshtein distance 1 from 'palla di fuoco'
    const result = await lookupSpellIdFromBridge('palla di fuocoo', BRIDGE_URL, BEARER);

    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('fuzzy');
    expect(result.source).toBe('levenshtein');
    expect(result.distance).toBe(1);
  });

  it('(g) fallback when bridge is unreachable → static SPELL_LOOKUP used', async () => {
    vi.stubGlobal('fetch', makeFetchMock(null)); // network error

    // 'palla di fuoco' is in static SPELL_LOOKUP → should still resolve
    const result = await lookupSpellIdFromBridge('palla di fuoco', BRIDGE_URL, BEARER);

    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
  });

  it('(h) no bridgeUrl → uses static fallback only', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupSpellIdFromBridge('fireball');

    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
    // fetch should NOT have been called (no bridgeUrl)
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('(i) dynamic exact EN match', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupSpellIdFromBridge('Fireball', BRIDGE_URL, BEARER);

    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
    expect(result.source).toBe('en-table');
  });

  it('(j) dynamic exact locale match (IT)', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupSpellIdFromBridge('palla di fuoco', BRIDGE_URL, BEARER);

    expect(result.dnd5eId).toBe('fireball');
    expect(result.confidence).toBe('exact');
    expect(result.source).toBe('it-table');
  });

  it('empty transcript → returns no-match', async () => {
    const result = await lookupSpellIdFromBridge('', BRIDGE_URL, BEARER);
    expect(result.dnd5eId).toBeNull();
    expect(result.confidence).toBe('none');
  });

  it('dynamic lookup succeeds even when bridge result has more entries than static table', async () => {
    // Add a spell not in the static table (homebrew)
    const payload = makeValidPayload([
      ...makeValidPayload().entries,
      {
        id: 'chromatic-explosion',
        packId: 'world.homebrew',
        name: 'Chromatic Explosion',
        nameLocalized: 'Esplosione Cromatica',
        level: 4,
        school: 'evo',
      },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupSpellIdFromBridge('esplosione cromatica', BRIDGE_URL, BEARER);

    expect(result.dnd5eId).toBe('chromatic-explosion');
    expect(result.confidence).toBe('exact');
  });
});
