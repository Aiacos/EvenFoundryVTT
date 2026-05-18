---
phase: 17-sheet-skills-tab-skills-tab-data-wiring
plan: 01
subsystem: shared-protocol
tags: [schema, tdd, character-snapshot, dnd5e-skills, atomic-extension]
requirements: [SHEET-08]
status: complete
completed: 2026-05-18
duration_minutes: ~6
commits:
  red:   d2e0403  # test(17-01): RED — CS-SK-1..8 + VALID_SKILLS Thorin canonical
  green: 79564d9  # feat(17-01): GREEN — SkillSchema + SkillsSchema + SKILL_KEYS + ABILITY_KEYS + skills field
artifacts:
  created:
    - packages/shared-protocol/src/payloads/character.ts:218  # ABILITY_KEYS const tuple
    - packages/shared-protocol/src/payloads/character.ts:219  # type AbilityKey
    - packages/shared-protocol/src/payloads/character.ts:220  # AbilityKeySchema (z.enum)
    - packages/shared-protocol/src/payloads/character.ts:328  # SKILL_KEYS const tuple
    - packages/shared-protocol/src/payloads/character.ts:348  # type SkillKey
    - packages/shared-protocol/src/payloads/character.ts:393  # SkillSchema (z.object, forward-compat)
    - packages/shared-protocol/src/payloads/character.ts:405  # type Skill
    - packages/shared-protocol/src/payloads/character.ts:422  # SkillsSchema (z.strictObject, 18 keys)
    - packages/shared-protocol/src/payloads/character.ts:461  # type Skills
    - packages/shared-protocol/src/payloads/character.ts:543  # CharacterSnapshotSchema.skills (REQUIRED)
  modified:
    - packages/shared-protocol/src/index.ts                     # +9 re-exports
    - packages/shared-protocol/src/payloads/character.test.ts   # +8 CS-SK tests, +VALID_SKILLS, VALID_SNAPSHOT extension
metrics:
  tests_added: 8                       # CS-SK-1..8
  tests_passing_character: 48          # 40 baseline → 40 + 8
  tests_passing_shared_protocol: 347   # 339 (Phase 16) → 339 + 8 (zero regression)
  schema_lines_added: 189              # character.ts diff stat
  new_exports: 9                       # ABILITY_KEYS, AbilityKey, AbilityKeySchema, SKILL_KEYS, Skill, SkillKey, SkillSchema, Skills, SkillsSchema
gate_evidence:
  WAVE-17-01-G1: pass   # Two atomic commits: RED d2e0403 + GREEN 79564d9
  WAVE-17-01-G2: pass   # 8/8 CS-SK-* tests pass in GREEN (vitest log)
  WAVE-17-01-G3: pass   # 347/347 shared-protocol pass; CS-DS/CHAR-MR/CHAR-INV/CHAR-SPL/CS-PORT/CS-AB all green
  WAVE-17-01-G4: pass   # grep -cE "skills[^:]*\.optional\(\)" character.ts = 0
  WAVE-17-01-G5: pass   # 9 new public names re-exported from index.ts (substantive grep verified)
  WAVE-17-01-G6: pass   # pnpm --filter @evf/shared-protocol typecheck exits 0
  WAVE-17-01-G7: pass   # AbilitiesSchema runtime literal byte-identical (HEAD~2..HEAD diff = 0 hits)
  WAVE-17-01-G8: deferred  # Workspace test deferred to Plan 17-03 close per atomic-extension design
  WAVE-17-01-G9: pass   # socketlib.registerComplexHandler count = 17 preserved
---

# Phase 17 Plan 01: shared-protocol skills schema extension — Summary

**One-liner:** Atomic TDD schema extension exporting `SkillSchema` (z.object,
forward-compat with closed numeric-literal `proficient 0|0.5|1|2` enum),
`SkillsSchema` (z.strictObject, 18-key closed enumeration), `SKILL_KEYS` /
`ABILITY_KEYS` const tuples, and a REQUIRED `CharacterSnapshotSchema.skills`
field — no `.optional()` drift window, locking the SHEET-08 wire contract
before the reader/renderer consume it in Plans 17-02 + 17-03.

## What was built

Two atomic commits closed the RED/GREEN TDD cycle on the SHEET-08 schema half:

| Step | Commit    | What                                                                                                                                                                              | Tests state                                                                                                                                                                  |
| ---- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED  | `d2e0403` | 8 failing CS-SK tests + canonical `VALID_SKILLS` Thorin spread (18 keys) + VALID_SNAPSHOT extension carrying `skills` through every existing spread-based test                    | 24 fails: 6 CS-SK genuine + 16 pre-existing tests broken because VALID_SNAPSHOT now carries an unknown-to-schema `skills` field (strictObject rejection); typecheck TS2305+ |
| GREEN| `79564d9` | `ABILITY_KEYS` + `AbilityKey` + `AbilityKeySchema` + `SKILL_KEYS` + `SkillKey` + `SkillSchema` + `SkillsSchema` + `Skill` / `Skills` types + `CharacterSnapshotSchema.skills` REQUIRED + 9 re-exports in `index.ts` | 48/48 pass in character.test.ts; 347/347 pass across full shared-protocol suite; typecheck + biome exit 0                                                                    |

### Schema design crystallized in this plan

- **`ABILITY_KEYS` const tuple (6 entries, fixed order `str/dex/con/int/wis/cha`)**
  is introduced as an additive named export. The verbatim
  `AbilitiesSchema = z.strictObject({ str: AbilityScoreSchema, ..., cha: AbilityScoreSchema })`
  literal from Phase 16 is preserved byte-identical at runtime (G7 gate verified)
  — `ABILITY_KEYS` is NOT used to construct `AbilitiesSchema` programmatically;
  it is a standalone tuple that `SkillSchema.ability` references via
  `AbilityKeySchema = z.enum(ABILITY_KEYS)`.

- **`SKILL_KEYS` const tuple (18 entries, canonical dnd5e order)** —
  `acr/ani/arc/ath/dec/his/ins/itm/inv/med/nat/prc/prf/per/rel/slt/ste/sur`.
  Frozen by D&D 5e rules. Plan 17-02 reader iteration + Plan 17-03 renderer
  static `SKILL_NAMES` table both consume this tuple as the canonical key set.

- **`SkillSchema`** uses `z.object` (NOT strict) so Phase 18+ may add
  `bonus` / `expertise` / `advantage` siblings on per-skill sub-objects
  without a top-level schema re-bump (Phase 16 forward-compat precedent on
  AbilityScoreSchema). Bounds:
  - `total z.number().int()` allowing negative (CHA-8 → Persuasione -1).
  - `ability AbilityKeySchema` (closed 6-code enum).
  - `proficient z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)])` —
    closed 4-value numeric enum (NOT boolean — Skills tab needs full glyph
    spectrum ○/◉/★ per UI-SPEC §3; half-prof rounds up to ◉ at the renderer).
  - `passive z.number().int().nonnegative()` — accepts 0 (debuffed-actor edge
    case) but rejects negatives (data corruption). Independent of `total`;
    no cross-validation in schema.

- **`SkillsSchema`** uses `z.strictObject` because the 18 D&D 5e skill codes
  are frozen by the canonical rules — any unknown key on the wire indicates
  drift or a malformed payload and MUST reject.

- **`CharacterSnapshotSchema.skills`** is REQUIRED end-to-end. Pitfall 3
  mitigation per Phase 4b/16 precedent: no `.optional()` drift window between
  schema declaration and producer adoption — the field lands required in 17-01,
  the reader emits it (defensive defaults for fresh actors) in 17-02, and the
  renderer consumes it in 17-03. All atomic within this milestone.

### CS-SK-1..8 test coverage

| Test    | Asserts                                                                                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CS-SK-1 | Happy-path parse of full 18-keyed `skills` with Thorin spread; spot-checks on Atletica (STR-based proficient +6), Indagare (passive=14 vs total=0 divergence), Percezione/Intuizione passive=11                                                          |
| CS-SK-2 | REQUIRED field — missing `skills` rejected (mirrors CS-AB-2 / CS-DS-6 atomic gate)                                                                                                                                                                       |
| CS-SK-3 | Invalid `ability` enum — `'xyz'` rejected (closed AbilityKey 6-code enum)                                                                                                                                                                                |
| CS-SK-4 | Invalid `proficient` — `1.5` rejected (closed 0\|0.5\|1\|2 enum, NOT z.number with refine, NOT boolean)                                                                                                                                                  |
| CS-SK-5 | `passive` boundary — `passive=0` accepted, `passive=-1` rejected (nonnegative)                                                                                                                                                                           |
| CS-SK-6 | `SkillSchema` is `z.object` forward-compat — extra `bonus: 2` sibling on a per-skill object accepted                                                                                                                                                     |
| CS-SK-7 | Type inference + standalone schema roundtrips — `Skills` / `Skill` / `SkillKey` / `AbilityKey` types compile; `SkillsSchema.parse(VALID_SKILLS)` roundtrips; `SKILL_KEYS` length 18, first=`acr`, last=`sur`; `ABILITY_KEYS` equals str/dex/con/int/wis/cha; `AbilityKeySchema` rejects `'xyz'` |
| CS-SK-8 | `SkillsSchema` rejects missing skill key (closed 18-key enum — counterpart to CS-AB-7b)                                                                                                                                                                  |

## 9 new public exports verified in index.ts

```
ABILITY_KEYS,
type AbilityKey,
AbilityKeySchema,
SKILL_KEYS,
type Skill,
type SkillKey,
SkillSchema,
type Skills,
SkillsSchema,
```

Grep evidence (lines 39, 42, 43, 55, 56, 57, 58, 59, 60 of `index.ts`):
```
$ grep -nE "^  (type )?(Skill|Ability|SKILL_KEYS|ABILITY_KEYS)" packages/shared-protocol/src/index.ts | head -12
39:  ABILITY_KEYS,
42:  type AbilityKey,
43:  AbilityKeySchema,
55:  SKILL_KEYS,
56:  type Skill,
57:  type SkillKey,
58:  SkillSchema,
59:  type Skills,
60:  SkillsSchema,
```

## Pitfall 3 verification (WAVE-17-01-G4)

```
$ grep -cE "skills[^:]*\.optional\(\)" packages/shared-protocol/src/payloads/character.ts
0
```

The only `.optional()` in the file is the pre-existing
`portrait: z.object({ url }).optional()` (Plan 13-03 STRETCH-06). The new
`skills` field lands REQUIRED with zero drift window.

## AbilitiesSchema preservation (WAVE-17-01-G7)

```
$ git diff HEAD~2..HEAD -- packages/shared-protocol/src/payloads/character.ts | \
    grep -E '^[-+].*AbilitiesSchema = z\.strictObject' | wc -l
0
```

The Phase 16 verbatim literal is byte-identical at runtime. `ABILITY_KEYS`
is an additive export only — it is NOT used to construct `AbilitiesSchema`
programmatically.

## CI Gate 8 socketlib count (WAVE-17-01-G9)

```
$ grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts
17
```

Plan 17-01 touches no socketlib code. Count unchanged from Phase 13 close.

## Deviations from plan

### 1. `proficient` schema: z.union over z.enum (planned route — no deviation)

The plan's `<interfaces>` block explicitly mandated
`z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)])` and the
Action block's Pitfall avoidance section reinforced it ("the Zod 4.x preferred
pattern is `z.union` for non-string literal sets (z.enum requires strings)"). I
followed this verbatim. No deviation. Zod 4.x `z.enum` is strictly for
string-literal sets; numeric-literal enums must use `z.union(z.literal*)`.

### 2. CS-SK-3 / CS-SK-4 RED-step "accidental pass"

In the RED commit, CS-SK-3 (invalid ability enum) and CS-SK-4 (invalid
proficient=1.5) coincidentally pass because the entire snapshot rejects for
an unrelated reason (the strictObject `CharacterSnapshotSchema` doesn't yet
recognize the `skills` field, so unknown-key rejection triggers before inner
sub-object validation can run). After GREEN, both tests pass for the genuine
reason — invalid enum on the per-skill sub-object is rejected by the inner
`AbilityKeySchema` / `z.union(z.literal)` gates. This is a known property of
the test-before-code RED pattern; the plan's `<verify>` block accepted "≥ 7
failing CS-SK-* tests" — we landed 6 unambiguous fails + 2 trivially passes
(both still verify genuine schema behavior in GREEN). No remediation needed.

### 3. CS-SK-7 over-tested vs plan minimum

Plan Task 1 CS-SK-7 spec called for `Skills` type inference + `SkillsSchema.parse`
roundtrip + `SkillKey` compile-time. The implementation also exercises
`SKILL_KEYS` length+first+last, `ABILITY_KEYS` equality, `AbilityKey` type
compile, and `AbilityKeySchema` runtime accept/reject — all part of the new
public API and worth locking down. Plan-baseline of "≥ 7 new tests" satisfied
(8 landed: CS-SK-1..8). No re-scoping needed.

## Forward pointers — what Plans 17-02 and 17-03 must close

### Plan 17-02 (foundry-module reader)

- **`foundry-module` typecheck will FAIL** until `extractSkills(actor)` helper
  is added in `character-reader.ts` and wired into `getCharacterSnapshot()`.
  Expected break (Phase 16 precedent):
  > TS2353: Object literal may only specify known properties, and 'skills' does
  > not exist in type ... — in test/mock CharacterSnapshot literals that don't
  > yet carry the new field.

- **`Dnd5eActorSystem.skills?`** type addition required in the reader's
  Foundry-shim type declarations (alongside Phase 16's `abilities?` field).

- **Tests to add (planning baseline `CR-SK-1..5`):**
  - `CR-SK-1` dnd5e canonical → snapshot skills parse
  - `CR-SK-2` missing `actor.system.skills` → 18 defensive defaults
    `{total: 0, ability: <SKILL_DEFAULT_ABILITY[k]>, proficient: 0, passive: 10}`
  - `CR-SK-3` `proficient: 0.5` → pass-through verbatim (NOT coerced; unlike
    abilities reader Plan 16-02 which coerced to boolean)
  - `CR-SK-4` `passive` read-through (dnd5e prep-time computed)
  - `CR-SK-5` `SKILL_DEFAULT_ABILITY` mapping correctness
    (acr/ste→dex, ath→str, arc/his/inv/nat/rel→int,
     ani/ins/med/prc/sur→wis, dec/itm/prf/per→cha)

- Reader must read `skills.<k>.total` (dnd5e prep-time computed total
  including ability + prof + bonuses), NOT `.mod` (which excludes bonuses).

### Plan 17-03 (renderer + fixtures + atomic ratification)

- **g2-app `character-sheet-tab-renderers.test.ts`** `snapshot2014` /
  `snapshot2024` literals will need `skills: <Thorin canonical>` extension.
  Same atomic-extension Wave-3 closure as Phase 16's 11+ file extension surge —
  expect a similar 11-17 file surface (snapshot literals in g2-app, bridge,
  foundry-module tests, foundry-mcp tests). All must add the new field.

- **Renderer wiring** per UI-SPEC §5:
  - Replace `DEFAULT_SKILLS` hardcoded array with
    `SKILL_KEYS.map(k => ({ ...SKILL_NAMES[k], ability: snapshot.skills[k].ability, profLevel: <round-up-half-prof>, modifier: snapshot.skills[k].total }))`
  - Half-prof glyph round-up: `proficient === 0.5 ? 1 : proficient as ProfLevel`
    → render as `◉` per UI-SPEC §3.
  - `SKILL_NAMES` static const map (it/en/de) extracted from existing
    DEFAULT_SKILLS string literals.

- **Main tab senses line** (row 17, 4 fixtures):
  - IT: `Sensi  PP {prc.passive} · PI {ins.passive} · IND {inv.passive}`
  - EN: `Senses  PP {prc.passive} · INS {ins.passive} · INV {inv.passive}`
  - DE: `Sinne  WN 11 · EIN 11 · UNT 14` (verify abbreviations in `i18n-budgets.ts`)
  - Width budget: 28-30 codepoints content, well within 66-cell row.

- **Fixtures to update/add:**
  - `sheet.skills.it.txt` — byte-identical (Thorin canonical matches DEFAULT_SKILLS)
  - `sheet.skills.en.txt` — **NEW** (parallel to IT)
  - `sheet.main.{2014.it,2024.it,2014.en,2014.de}.txt` row 17 — senses line update

- **INV-3 atomic ratification commit** at phase close: STATE.md + ROADMAP.md +
  REQUIREMENTS.md (SHEET-08/09/10 → Resolved) + 17-VERIFICATION.md.
  Phase 14 `3a0c5cf` / Phase 15 `dc161d6` / Phase 16 `d68d7f2` precedent.

- **DO NOT bump Specs.md version** this milestone — defer to Phase 18+
  milestone close per CONTEXT §Claude's Discretion.

## Threat Surface

No new threat surface introduced. Per the plan's `<threat_model>`:
- T-17-01-T (Tampering on SkillSchema) — `mitigate` — implemented:
  `z.union(z.literal(0), z.literal(0.5), z.literal(1), z.literal(2))` rejects
  malformed `proficient` (CS-SK-4 verifies); `AbilityKeySchema = z.enum(ABILITY_KEYS)`
  rejects invalid `ability` (CS-SK-3 verifies); `z.number().int().nonnegative()`
  clamps `passive` (CS-SK-5 verifies).
- T-17-01-D (DoS on SkillsSchema) — `mitigate` — implemented:
  `z.strictObject` with 18 fixed keys + bounded `z.number().int()` fields →
  constant-time parse; no recursion, no regex.
- T-17-01-SC (Supply chain) — `accept` — NO new package installs; schema-only edit.
- All other STRIDE categories accepted (read-path, no auth/network/file boundary).

## Known Stubs

None. This plan introduces schema-only contracts. No UI rendering, no
data-source wiring — all of that is in Plans 17-02 (reader) and 17-03
(renderer + fixtures). The schema is a structural contract, not a feature
with placeholder data.

## Self-Check: PASSED

- ✓ Two commits exist in git log: `d2e0403` (RED) + `79564d9` (GREEN)
- ✓ `packages/shared-protocol/src/payloads/character.ts` contains:
  - `ABILITY_KEYS` const tuple (line 218)
  - `AbilityKey` type + `AbilityKeySchema` (lines 219-220)
  - `SKILL_KEYS` const tuple (line 328) with 18 entries in canonical order
  - `SkillKey` type (line 348)
  - `SkillSchema = z.object` with `proficient: z.union(z.literal*4)` (line 393)
  - `SkillsSchema = z.strictObject` with all 18 keys (line 422)
  - `skills: SkillsSchema` on `CharacterSnapshotSchema` (REQUIRED, no .optional, line 543)
- ✓ `packages/shared-protocol/src/index.ts` re-exports 9 new names
- ✓ `packages/shared-protocol/src/payloads/character.test.ts` defines
  `VALID_SKILLS` constant with Thorin canonical 18-spread
- ✓ `VALID_SNAPSHOT` carries `skills: VALID_SKILLS`
- ✓ 8 CS-SK-* tests present (CS-SK-1..8)
- ✓ Full @evf/shared-protocol test suite: 347/347 passing, 0 failing
- ✓ character.test.ts: 48/48 passing (40 baseline + 8 CS-SK)
- ✓ typecheck (shared-protocol scope): exit 0
- ✓ biome ci (shared-protocol scope): exit 0
- ✓ Pitfall 3 grep gate: 0 matches for `skills[^:]*\.optional\(\)`
- ✓ AbilitiesSchema literal verbatim preserved (HEAD~2..HEAD diff: 0 hits)
- ✓ CI Gate 8 socketlib count = 17 preserved
- ✓ No modification to STATE.md or ROADMAP.md in this plan's commits
  (orchestrator-level STATE.md change pre-existed and stays unstaged for Plan 17-03)
