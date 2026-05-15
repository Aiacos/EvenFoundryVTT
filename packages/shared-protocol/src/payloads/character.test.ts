/**
 * @evf/shared-protocol — CharacterSnapshotSchema + DeathSavesSchema tests.
 *
 * Covers Plan 4b-06 Task 1 behaviour CS-DS-1..CS-DS-8 — the death-saves schema
 * extension landed atomically alongside the character-reader.ts producer and the
 * downstream g2-app + bridge consumer fixtures (Pitfall 3 mitigation: no
 * `.optional()` window of drift).
 *
 *   - CS-DS-1  happy-path: success=0, failure=0 (idle character) parses
 *   - CS-DS-2  stabilized: success=3, failure=0 parses
 *   - CS-DS-3  dead: success=0, failure=3 parses
 *   - CS-DS-4  out-of-range high: success=4 rejected
 *   - CS-DS-5  negative: success=-1 rejected
 *   - CS-DS-6  REQUIRED (not .optional()): missing `death` field rejected
 *   - CS-DS-7  DeathSavesSchema exported separately + roundtrips
 *   - CS-DS-8  type inference: `const d: DeathSaves = {...}` compiles cleanly
 *
 * @see ./character.ts (schema definitions)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-06-PLAN.md Task 1
 */
import { describe, expect, it } from 'vitest';
import {
  type CharacterSnapshot,
  CharacterSnapshotSchema,
  type DeathSaves,
  DeathSavesSchema,
} from './character.js';

/** Canonical valid snapshot used as the test base; the `death` field is the
 *  schema-extension under test and is overridden per case. */
const VALID_SNAPSHOT: CharacterSnapshot = {
  actorId: 'pc-aiacos',
  name: 'Aiacos',
  hp: 36,
  maxHp: 36,
  tempHp: 0,
  ac: 16,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
};

describe('CharacterSnapshotSchema — death-saves extension (CS-DS)', () => {
  it('CS-DS-1: parses an idle character with death={success:0,failure:0}', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: 0, failure: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('CS-DS-2: parses a stabilized character with death={success:3,failure:0}', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: 3, failure: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('CS-DS-3: parses a dead character with death={success:0,failure:3}', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: 0, failure: 3 },
    });
    expect(result.success).toBe(true);
  });

  it('CS-DS-4: rejects death.success=4 (out of 0..3 range)', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: 4, failure: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('CS-DS-5: rejects death.success=-1 (negative)', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: -1, failure: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('CS-DS-6: REQUIRED field — snapshot without `death` is rejected (NOT .optional())', () => {
    const { death: _death, ...snapshotWithoutDeath } = VALID_SNAPSHOT;
    const result = CharacterSnapshotSchema.safeParse(snapshotWithoutDeath);
    expect(result.success).toBe(false);
  });

  it('CS-DS-7: DeathSavesSchema parses {success:1,failure:2} standalone', () => {
    const result = DeathSavesSchema.safeParse({ success: 1, failure: 2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ success: 1, failure: 2 });
    }
  });

  it('CS-DS-8: DeathSaves type infers correctly (compile-time check)', () => {
    // If this compiles, the type is correctly inferred. Asserting equality at
    // runtime is a belt-and-suspenders sanity check.
    const d: DeathSaves = { success: 1, failure: 2 };
    expect(d.success).toBe(1);
    expect(d.failure).toBe(2);
  });
});
