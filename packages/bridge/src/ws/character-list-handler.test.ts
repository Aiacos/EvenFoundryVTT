/**
 * Unit tests for handleCharacterListEnvelope.
 *
 * Quick Task 260604-eyf — push-based character-list path for real pairing.
 *
 * @see ./character-list-handler.ts
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 3
 */

import { R1_CHARACTERS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharacterListCache } from '../cache/character-list-cache.js';
import { handleCharacterListEnvelope } from './character-list-handler.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeValidPayload() {
  return {
    characters: [
      { actorId: 'actor-1', name: 'Aragorn', level: 10 },
      { actorId: 'actor-2', name: 'Legolas', level: 8 },
    ],
    source: 'foundry-world' as const,
    count: 2,
    generatedAt: NOW,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('handleCharacterListEnvelope', () => {
  let cache: CharacterListCache;

  beforeEach(() => {
    cache = new CharacterListCache();
  });

  it('returns false when type does not match', () => {
    const result = handleCharacterListEnvelope('r1.other.type', {}, cache);
    expect(result).toBe(false);
    expect(cache.get()).toBeNull();
  });

  it('returns true and sets cache when type matches and payload is valid', () => {
    const payload = makeValidPayload();
    const result = handleCharacterListEnvelope(R1_CHARACTERS_AVAILABLE_TYPE, payload, cache);
    expect(result).toBe(true);
    expect(cache.get()).not.toBeNull();
    expect(cache.get()?.count).toBe(2);
    expect(cache.get()?.characters[0]?.name).toBe('Aragorn');
  });

  it('returns true but leaves cache unchanged when payload fails Zod validation', () => {
    // Invalid: missing `characters` field
    const badPayload = { source: 'foundry-world', count: 0, generatedAt: NOW };
    const result = handleCharacterListEnvelope(R1_CHARACTERS_AVAILABLE_TYPE, badPayload, cache);
    expect(result).toBe(true); // type matched
    expect(cache.get()).toBeNull(); // cache NOT written (T-RFP-01)
  });

  it('returns true but leaves cache unchanged for character with level 0', () => {
    const badPayload = {
      characters: [{ actorId: 'a', name: 'Bad', level: 0 }],
      source: 'foundry-world',
      count: 1,
      generatedAt: NOW,
    };
    const result = handleCharacterListEnvelope(R1_CHARACTERS_AVAILABLE_TYPE, badPayload, cache);
    expect(result).toBe(true);
    expect(cache.get()).toBeNull();
  });

  it('last-write-wins: second valid push overwrites first', () => {
    const first = makeValidPayload();
    const second = {
      characters: [{ actorId: 'actor-3', name: 'Gimli', level: 7 }],
      source: 'foundry-world' as const,
      count: 1,
      generatedAt: NOW + 1000,
    };
    handleCharacterListEnvelope(R1_CHARACTERS_AVAILABLE_TYPE, first, cache);
    handleCharacterListEnvelope(R1_CHARACTERS_AVAILABLE_TYPE, second, cache);
    expect(cache.get()?.count).toBe(1);
    expect(cache.get()?.characters[0]?.name).toBe('Gimli');
  });
});
