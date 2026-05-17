/**
 * Unit tests for portrait-state cache (Plan 13-04 — STRETCH-06).
 *
 * PS-01: empty cache returns null for unknown actorId
 * PS-02: set+get round-trips — correct entry returned
 * PS-03: clearPortraitBytes(actorId) removes specific actor, leaves others
 * PS-04: clearPortraitBytes() (no arg) empties full cache
 *
 * @see packages/g2-app/src/panels/portrait-state.ts
 * @see .planning/phases/13-v2-stretch/13-04-PLAN.md Task 1
 */

import { afterEach, describe, expect, it } from 'vitest';
import { clearPortraitBytes, getPortraitBytes, setPortraitBytes } from './portrait-state.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTOR_A = 'actor-aaaaa';
const ACTOR_B = 'actor-bbbbb';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const B64_A =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const B64_B =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';

describe('portrait-state', () => {
  afterEach(() => {
    clearPortraitBytes();
  });

  // PS-01: empty cache returns null
  it('PS-01: getPortraitBytes returns null for unknown actorId', () => {
    expect(getPortraitBytes(ACTOR_A)).toBeNull();
  });

  // PS-02: set+get round-trips
  it('PS-02: set+get returns the stored entry', () => {
    setPortraitBytes(ACTOR_A, { pngBase64: B64_A, urlHash: HASH_A });
    const entry = getPortraitBytes(ACTOR_A);
    expect(entry).not.toBeNull();
    expect(entry?.pngBase64).toBe(B64_A);
    expect(entry?.urlHash).toBe(HASH_A);
  });

  // PS-03: clearPortraitBytes(actorId) removes specific actor
  it('PS-03: clearPortraitBytes(actorId) removes only that actor', () => {
    setPortraitBytes(ACTOR_A, { pngBase64: B64_A, urlHash: HASH_A });
    setPortraitBytes(ACTOR_B, { pngBase64: B64_B, urlHash: HASH_B });

    clearPortraitBytes(ACTOR_A);

    expect(getPortraitBytes(ACTOR_A)).toBeNull();
    expect(getPortraitBytes(ACTOR_B)).not.toBeNull();
  });

  // PS-04: clearPortraitBytes() empties all
  it('PS-04: clearPortraitBytes() (no arg) empties the full cache', () => {
    setPortraitBytes(ACTOR_A, { pngBase64: B64_A, urlHash: HASH_A });
    setPortraitBytes(ACTOR_B, { pngBase64: B64_B, urlHash: HASH_B });

    clearPortraitBytes();

    expect(getPortraitBytes(ACTOR_A)).toBeNull();
    expect(getPortraitBytes(ACTOR_B)).toBeNull();
  });
});
