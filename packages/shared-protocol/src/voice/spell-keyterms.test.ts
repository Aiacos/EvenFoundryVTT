/**
 * Tests for SPELL_KEYTERMS — the canonical SRD spell vocabulary subset
 * shipped from @evf/shared-protocol for Deepgram Keyterm Prompting.
 *
 * Phase 15 Plan 01 Task 1 — SKT-01..05 case coverage.
 *
 * The SKT-02 test imports SPELL_LOOKUP from @evf/foundry-mcp via a relative
 * source path (foundry-mcp is NOT a workspace dependency of shared-protocol;
 * the import is test-only to enforce 1:1 drift-proofing). Production code in
 * spell-keyterms.ts MUST NOT depend on foundry-mcp.
 *
 * @see packages/shared-protocol/src/voice/spell-keyterms.ts
 * @see packages/foundry-mcp/src/voice/spell-lookup.ts (source-of-truth for drift gate)
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-01-PLAN.md
 */

import { describe, expect, it } from 'vitest';
// Test-only relative import — foundry-mcp is NOT a workspace dependency of
// @evf/shared-protocol. The 1:1 mapping check exists to fail the build the
// moment SPELL_LOOKUP drifts from SPELL_KEYTERMS.
import { SPELL_LOOKUP } from '../../../foundry-mcp/src/voice/spell-lookup.js';
import { SPELL_KEYTERMS, type SpellKeytermEntry } from './spell-keyterms.js';

describe('SPELL_KEYTERMS', () => {
  it('SKT-01: contains exactly 70 entries (matches SPELL_LOOKUP_COUNT_GATE)', () => {
    expect(SPELL_KEYTERMS.length).toBe(70);
  });

  it('SKT-02: maps 1:1 to foundry-mcp SPELL_LOOKUP (it,en) — drift-proof', () => {
    // Sanity: both tables have the same row count.
    expect(SPELL_KEYTERMS.length).toBe(SPELL_LOOKUP.length);

    // For every entry e in SPELL_LOOKUP, there exists exactly one entry k in
    // SPELL_KEYTERMS where k.it === e.it && k.en === e.en.
    for (const e of SPELL_LOOKUP) {
      const matches = SPELL_KEYTERMS.filter((k) => k.it === e.it && k.en === e.en);
      expect(
        matches.length,
        `SPELL_LOOKUP entry ${e.dnd5eId} (it='${e.it}', en='${e.en}') must appear exactly once in SPELL_KEYTERMS`,
      ).toBe(1);
    }

    // Symmetric guard: no SPELL_KEYTERMS entry is missing from SPELL_LOOKUP.
    for (const k of SPELL_KEYTERMS) {
      const matches = SPELL_LOOKUP.filter((e) => e.it === k.it && e.en === k.en);
      expect(
        matches.length,
        `SPELL_KEYTERMS entry (it='${k.it}', en='${k.en}') must appear in SPELL_LOOKUP`,
      ).toBe(1);
    }
  });

  it('SKT-03: is Object.frozen (immutable at runtime)', () => {
    expect(Object.isFrozen(SPELL_KEYTERMS)).toBe(true);
  });

  it('SKT-04: every entry has non-empty .it and .en strings', () => {
    for (const k of SPELL_KEYTERMS) {
      expect(k.it).toBeTruthy();
      expect(k.it.trim().length).toBeGreaterThan(0);
      expect(k.en).toBeTruthy();
      expect(k.en.trim().length).toBeGreaterThan(0);
    }
  });

  it('SKT-05: SpellKeytermEntry type shape compiles (compile-time-only)', () => {
    // Compile-time-only assertion: assigning a literal of the type shape from
    // the package barrel typechecks. If SpellKeytermEntry shape drifts, tsc
    // (via `pnpm typecheck`) fails — which is the gate, not the runtime.
    const sample: SpellKeytermEntry = { it: 'palla di fuoco', en: 'fireball' };
    expect(sample.it).toBe('palla di fuoco');
    expect(sample.en).toBe('fireball');
  });
});
