/**
 * Unit tests for entity-lookup-foundry.ts.
 *
 * Quick Task 260517-k2g (parallel additive pipeline to spell-lookup-foundry tests).
 *
 * Coverage (per PLAN Task 3, 12 minimum cases):
 *  (1) fetchAvailableEntities happy: 200 + valid payload → DynamicEntry[] + cache.
 *  (2) fetchAvailableEntities 500 → null.
 *  (3) fetchAvailableEntities 200 source='empty' → null.
 *  (4) fetchAvailableEntities 200 invalid payload (T-EP-02) → null.
 *  (5) fetchAvailableEntities TTL: cache hit within 5 min; re-fetch after TTL+1s.
 *  (6) lookupEntityFromBridge Italian fuzzy: 'spada lunga' → weapon Longsword.
 *  (7) lookupEntityFromBridge EN exact: 'goblin' → actor.npc Goblin.
 *  (8) lookupEntityFromBridge Levenshtein typo: 'potionn of healing' → consumable.
 *  (9) lookupEntityFromBridge no match (bridge reachable) → EntityLookupResult found=false.
 * (10) lookupEntityFromBridge bridge unreachable (fetch throws) → null.
 * (11) lookupEntityFromBridge without bridgeUrl → null (no static fallback).
 * (12) lookupEntityFromBridge empty transcript → null.
 *
 * @see packages/foundry-mcp/src/voice/entity-lookup-foundry.ts
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md Task 3
 */

import type { AvailableEntitiesPayload } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetEntityCache,
  ENTITY_CACHE_TTL_MS,
  fetchAvailableEntities,
  lookupEntityFromBridge,
} from '../entity-lookup-foundry.js';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const BRIDGE_URL = 'http://localhost:8910';
const BEARER = 'test-bearer-token';

const LONGSWORD_ENTRY = {
  id: 'longsword',
  packId: 'dnd5e.items',
  entityKind: 'item' as const,
  entityType: 'weapon',
  name: 'Longsword',
  nameLocalized: 'Spada Lunga',
};

const GOBLIN_ENTRY = {
  id: 'goblin-1',
  packId: 'dnd5e.monsters',
  entityKind: 'actor' as const,
  entityType: 'npc',
  name: 'Goblin',
  nameLocalized: 'Goblin',
};

const POTION_ENTRY = {
  id: 'potion-of-healing',
  packId: 'dnd5e.items',
  entityKind: 'item' as const,
  entityType: 'consumable',
  name: 'Potion of Healing',
  nameLocalized: 'Pozione di Cura',
};

function makeValidPayload(
  entries: AvailableEntitiesPayload['entries'] = [LONGSWORD_ENTRY, GOBLIN_ENTRY, POTION_ENTRY],
): AvailableEntitiesPayload {
  return {
    entries,
    source: 'foundry-packs',
    count: entries.length,
    generatedAt: Date.now(),
  };
}

function makeFetchMock(
  response: { ok: boolean; json?: () => Promise<unknown> } | null,
): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(() =>
    response === null
      ? Promise.reject(new Error('Network error'))
      : Promise.resolve({
          ok: response.ok,
          json: response.json ?? (() => Promise.resolve({})),
        }),
  );
}

// ─── fetchAvailableEntities ────────────────────────────────────────────────────

describe('fetchAvailableEntities', () => {
  beforeEach(() => {
    _resetEntityCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(1) happy-path: returns dynamic entries for valid payload', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: () => Promise.resolve(payload) }));

    const result = await fetchAvailableEntities(BRIDGE_URL, BEARER);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
    expect(result?.[0]?.id).toBe('longsword');
    expect(result?.[0]?.kind).toBe('item');
    expect(result?.[1]?.id).toBe('goblin-1');
    expect(result?.[1]?.kind).toBe('actor');
  });

  it('(1) cache is returned on second call without re-fetching', async () => {
    const payload = makeValidPayload();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAvailableEntities(BRIDGE_URL, BEARER);
    await fetchAvailableEntities(BRIDGE_URL, BEARER);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('(2) 500 status → returns null', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ ok: false }));

    const result = await fetchAvailableEntities(BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('(3) source=empty → returns null', async () => {
    const emptyPayload: AvailableEntitiesPayload = {
      entries: [],
      source: 'empty',
      count: 0,
      generatedAt: Date.now(),
    };
    vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: () => Promise.resolve(emptyPayload) }));

    const result = await fetchAvailableEntities(BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('(4) invalid payload fails schema parse → returns null (T-EP-02)', async () => {
    const invalid = { entries: 'not-an-array', source: 'bad', count: -1 };
    vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: () => Promise.resolve(invalid) }));

    const result = await fetchAvailableEntities(BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('(5) TTL eviction: cache hit within 5min, re-fetch after ENTITY_CACHE_TTL_MS+1s', async () => {
    vi.useFakeTimers();

    const payload = makeValidPayload();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    // First fetch
    await fetchAvailableEntities(BRIDGE_URL, BEARER);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Within TTL — should hit cache
    vi.advanceTimersByTime(ENTITY_CACHE_TTL_MS - 1000);
    await fetchAvailableEntities(BRIDGE_URL, BEARER);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past TTL — should re-fetch
    vi.advanceTimersByTime(2000);
    await fetchAvailableEntities(BRIDGE_URL, BEARER);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

// ─── lookupEntityFromBridge ────────────────────────────────────────────────────

describe('lookupEntityFromBridge', () => {
  beforeEach(() => {
    _resetEntityCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(6) Italian exact (locale) match: "spada lunga" → weapon Longsword', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupEntityFromBridge('spada lunga', BRIDGE_URL, BEARER);

    expect(result).not.toBeNull();
    expect(result?.found).toBe(true);
    expect(result?.kind).toBe('item');
    expect(result?.entityType).toBe('weapon');
    expect(result?.id).toBe('longsword');
    expect(result?.source).toBe('it-table');
  });

  it('(7) English exact match: "goblin" → actor.npc Goblin', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupEntityFromBridge('goblin', BRIDGE_URL, BEARER);

    expect(result).not.toBeNull();
    expect(result?.found).toBe(true);
    expect(result?.kind).toBe('actor');
    expect(result?.entityType).toBe('npc');
    expect(result?.id).toBe('goblin-1');
    // 'goblin' matches BOTH normEn and normLoc (locale === 'Goblin' too) — exact-EN wins
    // because we check the EN column first.
    expect(result?.source).toBe('en-table');
  });

  it('(8) Levenshtein typo: "potionn of healing" → consumable Potion of Healing', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupEntityFromBridge('potionn of healing', BRIDGE_URL, BEARER);

    expect(result).not.toBeNull();
    expect(result?.found).toBe(true);
    expect(result?.kind).toBe('item');
    expect(result?.entityType).toBe('consumable');
    expect(result?.id).toBe('potion-of-healing');
    expect(result?.source).toBe('levenshtein');
    expect(result?.distance).toBe(1);
  });

  it('(9) no match (bridge reachable + lookup found nothing) → found=false', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupEntityFromBridge('asdfqwerty', BRIDGE_URL, BEARER);

    expect(result).not.toBeNull();
    expect(result?.found).toBe(false);
    expect(result?.kind).toBeNull();
    expect(result?.entityType).toBeNull();
    expect(result?.id).toBeNull();
    expect(result?.source).toBe('no-match');
  });

  it('(10) bridge unreachable (fetch throws) → null', async () => {
    vi.stubGlobal('fetch', makeFetchMock(null)); // network error

    const result = await lookupEntityFromBridge('spada lunga', BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('(11) no bridgeUrl → null (no static fallback)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupEntityFromBridge('longsword');

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('(11) no bearer → null (no static fallback)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupEntityFromBridge('longsword', BRIDGE_URL);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('(12) empty transcript → null', async () => {
    const result = await lookupEntityFromBridge('', BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('(12) whitespace-only transcript → null', async () => {
    const result = await lookupEntityFromBridge('   ', BRIDGE_URL, BEARER);
    expect(result).toBeNull();
  });

  it('English exact match (item): "longsword" → weapon', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupEntityFromBridge('Longsword', BRIDGE_URL, BEARER);

    expect(result?.found).toBe(true);
    expect(result?.kind).toBe('item');
    expect(result?.entityType).toBe('weapon');
    expect(result?.id).toBe('longsword');
    expect(result?.source).toBe('en-table');
  });

  it('substring EN match (word-boundary): "I want a longsword now" → weapon', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupEntityFromBridge('I want a longsword now', BRIDGE_URL, BEARER);

    expect(result?.found).toBe(true);
    expect(result?.kind).toBe('item');
    expect(result?.entityType).toBe('weapon');
    expect(result?.source).toBe('en-table');
  });

  it('substring locale match (word-boundary): "uso la spada lunga ora" → weapon (it-table)', async () => {
    const payload = makeValidPayload();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupEntityFromBridge('uso la spada lunga ora', BRIDGE_URL, BEARER);

    expect(result?.found).toBe(true);
    expect(result?.kind).toBe('item');
    expect(result?.entityType).toBe('weapon');
    expect(result?.source).toBe('it-table');
  });

  it('ambiguous Levenshtein (≥2 tied at min distance) → found=false (precision-first)', async () => {
    // Two entries with identical Levenshtein distance from the transcript.
    const entryA = {
      id: 'sword-a',
      packId: 'dnd5e.items',
      entityKind: 'item' as const,
      entityType: 'weapon',
      name: 'Aword',
      nameLocalized: 'Aword',
    };
    const entryB = {
      id: 'sword-b',
      packId: 'dnd5e.items',
      entityKind: 'item' as const,
      entityType: 'weapon',
      name: 'Bword',
      nameLocalized: 'Bword',
    };
    const payload = makeValidPayload([entryA, entryB]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    // 'cword' has distance 1 from both 'aword' and 'bword' (substitution).
    const result = await lookupEntityFromBridge('cword', BRIDGE_URL, BEARER);

    expect(result).not.toBeNull();
    expect(result?.found).toBe(false);
    expect(result?.source).toBe('levenshtein');
    expect(result?.id).toBeNull();
  });

  it('dynamic lookup succeeds for homebrew entry not in any static table', async () => {
    const homebrew = {
      id: 'frost-axe',
      packId: 'world.homebrew',
      entityKind: 'item' as const,
      entityType: 'weapon',
      name: 'Frost Axe',
      nameLocalized: 'Ascia del Gelo',
    };
    const payload = makeValidPayload([LONGSWORD_ENTRY, homebrew]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const result = await lookupEntityFromBridge('ascia del gelo', BRIDGE_URL, BEARER);

    expect(result?.found).toBe(true);
    expect(result?.id).toBe('frost-axe');
    expect(result?.kind).toBe('item');
    expect(result?.entityType).toBe('weapon');
    expect(result?.source).toBe('it-table');
  });
});
