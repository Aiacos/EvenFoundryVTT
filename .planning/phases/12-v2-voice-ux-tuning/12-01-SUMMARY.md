---
phase: "12"
plan: "01"
subsystem: foundry-mcp/voice
tags: [voice, spell-lookup, levenshtein, clarify-detector, tdd]
dependency_graph:
  requires: [11-01, 11-02, 11-03, 11-04]
  provides: [12-02, 12-03]
  affects: [foundry-mcp]
tech_stack:
  added: []
  patterns: [two-row-DP-levenshtein, nfd-normalisation, substring-spell-detection, closed-set-slang-verbs]
key_files:
  created:
    - packages/foundry-mcp/src/voice/levenshtein.ts
    - packages/foundry-mcp/src/voice/levenshtein.test.ts
    - packages/foundry-mcp/src/voice/spell-lookup.ts
    - packages/foundry-mcp/src/voice/spell-lookup.test.ts
    - packages/foundry-mcp/src/voice/clarify-detector.ts
    - packages/foundry-mcp/src/voice/clarify-detector.test.ts
    - packages/foundry-mcp/src/voice/index.ts
    - packages/foundry-mcp/src/__tests__/voice-no-secret-leak.test.ts
  modified:
    - packages/foundry-mcp/README.md
decisions:
  - "Levenshtein uses Unicode code-point iteration ([...str]) to correctly count multi-byte chars"
  - "SPELL_LOOKUP has exactly 70 entries (20 cantrips + 30 L1 + 14 L2 + 6 L3) verified at runtime"
  - "lookupSpellId resolution order: exact-EN -> exact-IT -> substring-EN -> substring-IT -> fuzzy-lev2 -> ambiguous/none"
  - "T-12-03: dnd5eId always from SPELL_LOOKUP whitelist; no hallucinated IDs possible"
  - "SLANG_VERBS is a CLOSED set of 6 (scorch/blast/toast/fry/nuke/zap); non-slang verbs do not trigger"
  - "noUncheckedIndexedAccess compliance: prev[j] ?? 0 guards, destructuring with undefined check for winner"
metrics:
  duration: "resumed (prior session + ~45 min this session)"
  completed: "2026-05-17T06:32:36Z"
  tasks_completed: 3
  files_changed: 9
---

# Phase 12 Plan 01: Voice Spell Lookup + Clarify Detector Summary

**One-liner:** Deterministic IT↔EN spell resolver (70 SRD entries, Levenshtein fuzzy ≤2) with clarify-detector heuristic routing empty/slang/ambiguous/resolved transcripts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Levenshtein + normaliseForFuzzyMatch | c7e5a9e | levenshtein.ts, levenshtein.test.ts |
| 2 | SPELL_LOOKUP table (70 entries) + lookupSpellId | 541f8a7 | spell-lookup.ts, spell-lookup.test.ts |
| 3 | detectClarify + voice barrel + T-12-LEAK-01 grep gate | a2847a3 | clarify-detector.ts, clarify-detector.test.ts, index.ts, voice-no-secret-leak.test.ts, README.md |

## What Was Built

**Levenshtein engine (`levenshtein.ts`):**
- Two-row DP with Unicode code-point iteration (`[...str]`) — correctly handles multi-byte Italian characters
- `normaliseForFuzzyMatch`: NFD decomposition → diacritic strip → lowercase → trim → collapse whitespace
- `noUncheckedIndexedAccess` compliant: `prev[j] ?? 0` guards throughout

**Spell lookup table (`spell-lookup.ts`):**
- 70 SRD entries: 20 cantrips (L0) + 30 L1 (including 5 reactions: shield, feather-fall, absorb-elements, hellish-rebuke, silvery-barbs) + 14 L2 + 6 L3 (including counterspell)
- Italian translations from dnd5e.it community localisation
- `NORMALISED` pre-computed index at module load for O(1) exact lookups
- `containsSpellName()`: word-boundary substring detection for full-sentence transcripts ("cast fireball at the goblins")
- Resolution order: exact-EN → exact-IT → substring-EN → substring-IT → Levenshtein ≤2 → ambiguous/none
- T-12-03 invariant: dnd5eId always from SPELL_LOOKUP (no hallucinated IDs)

**Clarify detector (`clarify-detector.ts`):**
- `SLANG_VERBS`: closed set of 6 words (scorch, blast, toast, fry, nuke, zap)
- Routing: empty → 'empty-transcript'; ambiguous → 'ambiguous-match' + candidates; none+slang → 'slang-no-target'; none+no-slang → 'no-spell-name'; exact/fuzzy → `{needsClarify: false, resolvedSpellId}`
- Non-slang verbs (cast, lancia, scaglia, use, drop, lock) do NOT trigger

**Voice barrel (`index.ts`):**
- Single entry point for all Plan 12-01 public symbols
- Organized imports: levenshtein → spell-lookup → clarify-detector

**T-12-LEAK-01 grep gate (`voice-no-secret-leak.test.ts`):**
- Walks all `src/voice/*.ts` files at test-collection time
- Asserts zero matches of `/DEEPGRAM_API_KEY|sk-[A-Za-z0-9]{20,}|Token [A-Za-z0-9_-]{20,}/`
- Excludes test files (self-match prevention)

## Test Coverage

101 tests total across `@evf/foundry-mcp`:
- `levenshtein.test.ts`: 11 tests (empty, identical, substitutions, Unicode, normalisation)
- `spell-lookup.test.ts`: tests for count gate (70), schema validation, uniqueness, reactions, exact/fuzzy/none/T-12-03
- `clarify-detector.test.ts`: all 4 reason codes + non-slang verb pass-through
- `voice-no-secret-leak.test.ts`: T-12-LEAK-01 (1 gate + N per-file assertions)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] lookupSpellId failed to match full-sentence transcripts**
- **Found during:** Task 2 testing
- **Issue:** "cast fireball at the goblins" returned confidence='none' because exact match compared full transcript vs spell name, and Levenshtein distance was huge
- **Fix:** Added `containsSpellName()` helper with word-boundary regex; resolution order extended with substring-EN and substring-IT stages before Levenshtein
- **Files modified:** spell-lookup.ts, spell-lookup.test.ts
- **Commit:** 541f8a7

**2. [Rule 1 - Bug] SPELL_LOOKUP count wrong (73 then 66 before settling at 70)**
- **Found during:** Task 2 testing
- **Issue:** Grep-based counting was unreliable (matched NormalisedEntry interface fields too)
- **Fix:** Used `npx tsx -e "import(...).then(m => console.log(m.SPELL_LOOKUP.length))"` for actual runtime count; iteratively adjusted entries
- **Files modified:** spell-lookup.ts
- **Commit:** 541f8a7

**3. [Rule 2 - Biome] noNonNullAssertion compliance**
- **Found during:** Task 3 lint:ci run
- **Issue:** `winner!.dnd5eId` in spell-lookup.ts and `lookup.dnd5eId!` in clarify-detector.ts triggered biome noNonNullAssertion
- **Fix:** Destructure + undefined guard for winner; `?? undefined` for clarify-detector
- **Files modified:** spell-lookup.ts, clarify-detector.ts
- **Commit:** a2847a3

**4. [Rule 2 - Biome] organize-imports and format drift in multiple files**
- **Found during:** Task 3 lint:ci run
- **Issue:** Biome organize-imports wanted different import order in voice-no-secret-leak.test.ts, index.ts; format differences in levenshtein.ts, spell-lookup.ts, spell-lookup.test.ts (trailing commas in arrays)
- **Fix:** `biome check --write` on all affected files
- **Files modified:** levenshtein.ts, spell-lookup.ts, spell-lookup.test.ts, voice-no-secret-leak.test.ts, index.ts
- **Commit:** a2847a3

## Known Stubs

None. All 70 spell entries have both `it` and `en` fields populated. `lookupSpellId` returns real dnd5eId values from the table.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: data-integrity | spell-lookup.ts | SPELL_LOOKUP is a closed whitelist — additions require T-12-03 re-verification |

## Self-Check: PASSED

- [x] levenshtein.ts exists: `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/packages/foundry-mcp/src/voice/levenshtein.ts`
- [x] spell-lookup.ts exists: `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/packages/foundry-mcp/src/voice/spell-lookup.ts`
- [x] clarify-detector.ts exists: `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/packages/foundry-mcp/src/voice/clarify-detector.ts`
- [x] index.ts exists: `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/packages/foundry-mcp/src/voice/index.ts`
- [x] voice-no-secret-leak.test.ts exists
- [x] Commits c7e5a9e, 541f8a7, a2847a3 in git log
- [x] 101 tests pass
- [x] biome ci clean on all 8 voice files
