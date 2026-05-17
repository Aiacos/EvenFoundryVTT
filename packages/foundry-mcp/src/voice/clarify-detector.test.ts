/**
 * Unit tests for detectClarify heuristic.
 *
 * Phase 12 Plan 01 Task 3 — TDD RED-then-GREEN.
 *
 * @see clarify-detector.ts
 */
import { describe, expect, it } from 'vitest';
import { detectClarify } from './clarify-detector.js';

describe('detectClarify — edge cases', () => {
  it('empty transcript → { needsClarify: true, reason: "empty-transcript" }', () => {
    const result = detectClarify('');
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('empty-transcript');
  });
});

describe('detectClarify — slang verbs (slang-no-target)', () => {
  it('"scorch \'em" → slang-no-target', () => {
    const result = detectClarify("scorch 'em");
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('slang-no-target');
  });

  it('"blast them" → slang-no-target', () => {
    const result = detectClarify('blast them');
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('slang-no-target');
  });

  it('"toast the lot" → slang-no-target', () => {
    const result = detectClarify('toast the lot');
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('slang-no-target');
  });

  it('"fry those goblins" → slang-no-target', () => {
    const result = detectClarify('fry those goblins');
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('slang-no-target');
  });

  it('"nuke them all" → slang-no-target', () => {
    const result = detectClarify('nuke them all');
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('slang-no-target');
  });

  it('"zap the orc" → slang-no-target', () => {
    const result = detectClarify('zap the orc');
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('slang-no-target');
  });
});

describe('detectClarify — non-slang verbs do NOT raise slang flag', () => {
  it('"cast fireball at goblins" → needsClarify: false', () => {
    const result = detectClarify('cast fireball at the goblins');
    expect(result.needsClarify).toBe(false);
    expect(result.resolvedSpellId).toBe('fireball');
  });

  it('"lancia palla di fuoco contro i goblin" → needsClarify: false', () => {
    const result = detectClarify('lancia palla di fuoco contro i goblin');
    expect(result.needsClarify).toBe(false);
    expect(result.resolvedSpellId).toBe('fireball');
  });
});

describe('detectClarify — no-spell-name', () => {
  it('"xyzzy on them" → no-spell-name (slang absent, lookup = none)', () => {
    const result = detectClarify('xyzzy on them');
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('no-spell-name');
  });
});

describe('detectClarify — valid spell present', () => {
  it('"cast fireball" (spell present, no target word) → needsClarify: false with resolvedSpellId', () => {
    // Having a valid spell ID is the strong signal; target-absence alone does NOT trigger clarify
    const result = detectClarify('cast fireball');
    expect(result.needsClarify).toBe(false);
    expect(result.resolvedSpellId).toBe('fireball');
  });
});
