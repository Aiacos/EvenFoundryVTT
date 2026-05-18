---
phase: 16-sheet-ability-scores-main-tab-data-wiring
plan: 01
subsystem: shared-protocol
tags: [schema, tdd, character-snapshot, dnd5e-abilities, atomic-extension]
requirements: [SHEET-05]
status: complete
completed: 2026-05-18
duration_minutes: ~25
commits:
  red:   1336417  # test(16-01): RED — CS-AB-1..7 + VALID_ABILITIES canonical sample
  green: e13136b  # feat(16-01): GREEN — AbilityScoreSchema + AbilitiesSchema + abilities field
artifacts:
  created:
    - packages/shared-protocol/src/payloads/character.ts:240   # AbilityScoreSchema (z.object)
    - packages/shared-protocol/src/payloads/character.ts:254   # type AbilityScore
    - packages/shared-protocol/src/payloads/character.ts:273   # AbilitiesSchema (z.strictObject)
    - packages/shared-protocol/src/payloads/character.ts:288   # type Abilities
    - packages/shared-protocol/src/payloads/character.ts:354   # CharacterSnapshotSchema.abilities (REQUIRED)
  modified:
    - packages/shared-protocol/src/index.ts                    # +4 re-exports
    - packages/shared-protocol/src/payloads/character.test.ts  # +8 CS-AB tests, +VALID_ABILITIES, VALID_SNAPSHOT extension
metrics:
  tests_added: 8                # CS-AB-1..7 + CS-AB-7b (closed-enum bonus)
  tests_passing_character: 40   # was 32 baseline → 32 + 8
  tests_passing_shared_protocol: 339   # full package suite, zero regression
  schema_lines_added: ~85       # ≥60 plan minimum
gate_evidence:
  WAVE-16-01-G1: pass    # Two atomic commits: RED 1336417 + GREEN e13136b
  WAVE-16-01-G2: pass    # 8/8 CS-AB-* tests pass (vitest verbose log)
  WAVE-16-01-G3: pass    # Pre-existing 32 character.test.ts tests pass; 339 shared-protocol tests pass
  WAVE-16-01-G4: pass    # grep -cE "abilities[^:]*\.optional\(\)" = 0
  WAVE-16-01-G5: pass*   # 4 new exports present in index.ts; gate regex narrowly matched only 3 (see deviation note)
  WAVE-16-01-G6: pass    # pnpm --filter @evf/shared-protocol typecheck exits 0
  WAVE-16-01-G7: pass    # Workspace test deferred to Plan 16-03 per atomic-extension design
---

# Phase 16 Plan 01: shared-protocol ability scores schema extension — Summary

**One-liner:** Atomic TDD schema extension exporting `AbilityScoreSchema` (z.object,
forward-compat), `AbilitiesSchema` (z.strictObject, 6-key closed enum), and a
REQUIRED `CharacterSnapshotSchema.abilities` field — no `.optional()` drift
window, locking the SHEET-05 wire contract before the reader/renderer consume
it in Plans 16-02 + 16-03.

## What was built

Two atomic commits closed the RED/GREEN TDD cycle on the SHEET-05 schema half:

| Step | Commit | What | Tests state |
|------|--------|------|-------------|
| RED   | `1336417` | 8 failing CS-AB tests + canonical `VALID_ABILITIES` Thorin spread + VALID_SNAPSHOT extension carrying `abilities` through every existing spread-based test | 21 fails (8 new + 13 pre-existing spread-test breaks from unknown-key rejection on strictObject); typecheck reveals TS2305/TS2353/TS2339 |
| GREEN | `e13136b` | `AbilityScoreSchema` + `AbilitiesSchema` + `Ability` + `Abilities` types + `CharacterSnapshotSchema.abilities: AbilitiesSchema` REQUIRED field + 4 re-exports in `index.ts` | 40/40 pass in character.test.ts; 339/339 pass across full shared-protocol suite; typecheck + biome exit 0 |

### Schema design crystallized in this plan

- **`AbilityScoreSchema`** uses `z.object` (not strict) so Phase 17 may add
  half-prof / expertise siblings on per-ability sub-objects without a top-level
  schema re-bump. Bounds: `value 0..30` (divine cap), `mod`/`save` `z.number()
  .int()` allowing negative (CHA 8 → mod -1), `proficient z.boolean()` strict —
  reader's job to coerce dnd5e's raw `0|0.5|1|2` proficiency number to boolean
  (CONTEXT D-Area-2), `dc z.number().int().min(0)`.
- **`AbilitiesSchema`** uses `z.strictObject` because the six D&D 5e ability
  codes (`str`, `dex`, `con`, `int`, `wis`, `cha`) are frozen by the canonical
  rules — any unknown key on the wire indicates drift or a malformed payload
  and MUST reject.
- **`CharacterSnapshotSchema.abilities`** is REQUIRED end-to-end. Pitfall 3
  mitigation per Phase 4b precedent: no `.optional()` drift window between
  schema declaration and producer adoption — the field lands required in
  16-01, the reader emits it (defensive defaults for fresh actors) in 16-02,
  and the renderer consumes it in 16-03. All atomic within this milestone.

### CS-AB-1..7 test coverage (+ CS-AB-7b bonus)

| Test | Asserts |
|------|---------|
| CS-AB-1  | Happy-path parse of full 6-keyed `abilities` with Thorin spread; data shape preserved |
| CS-AB-2  | REQUIRED field — missing `abilities` rejected (mirrors CS-DS-6 atomic gate) |
| CS-AB-3  | Negative mod/save parse — CHA 8 → mod -1, save -1 accepted |
| CS-AB-4  | Range gates — dc=-1 rejected, dc=23 accepted, value=31 rejected, value=30 accepted |
| CS-AB-5  | `proficient` strict-boolean — numeric `1` rejected (reader's coercion responsibility, NOT schema's) |
| CS-AB-6  | `z.object` forward-compat — extra sibling field (`expertise: true`) on a per-ability object accepted |
| CS-AB-7  | `AbilitiesSchema` + `AbilityScoreSchema` standalone roundtrip + `Abilities` type inference |
| CS-AB-7b | `AbilitiesSchema` rejects missing ability key (closed 6-key enum — bonus case, not in original 1..7 spec) |

Added CS-AB-7b at executor discretion (plan allowed this in CS-AB-4 fold area:
*"fold into CS-AB-4 or add as CS-AB-4b at executor discretion"*) to lock the
closed-enum semantics of `z.strictObject` explicitly — this is the
counterpart to CS-AB-6's forward-compat assertion on the inner `z.object`,
and the two together fully document the strict vs forward-compat boundary.

## Deviations from plan

### 1. WAVE-16-01-G5 gate regex narrowness (informational)

The plan's gate is:
```
grep -cE "(AbilityScoreSchema|AbilitiesSchema|type Ability\b|type Abilities)" \
  packages/shared-protocol/src/index.ts | grep -q '^4$'
```

The substantive intent (4 new exports: `AbilityScoreSchema`, `AbilitiesSchema`,
`type AbilityScore`, `type Abilities`) is fully satisfied — all 4 names are
present in `index.ts` lines 39-42. However, the regex matches only 3 because
`type Ability\b` requires a word boundary after `Ability`, which is NOT
present in `type AbilityScore` (the next char `S` is a word character → no
boundary). The substantive 4-export check is verified with a stricter
helper grep:

```bash
grep -nE "^  (type )?(AbilityScore|Abilities)" packages/shared-protocol/src/index.ts
# 39:  type Abilities,
# 40:  AbilitiesSchema,
# 41:  type AbilityScore,
# 42:  AbilityScoreSchema,
```

No code change needed — this is a gate regex flaw, not an implementation gap.
Plans 16-02 and 16-03 can refine the regex if they consume this gate
verbatim. (Suggested fix: `(AbilityScoreSchema|AbilitiesSchema|type Ability\w*|type Abilities)`.)

### 2. CS-AB-7b added as bonus closed-enum test (in-scope per plan)

Plan Task 1 explicitly allowed: *"Out-of-range value: value:31 REJECTED (max
30) — fold into CS-AB-4 or add as CS-AB-4b at executor discretion"*. Used
the discretion clause to add CS-AB-7b (covers AbilitiesSchema closed-enum
rejection of missing keys) so the test name preserves the 1..7 happy-path
sequence and the strictObject semantics are tested in a dedicated case
alongside CS-AB-6's z.object forward-compat counterpart. Plan-baseline of
"7 new tests added" still satisfied (CS-AB-7b counts toward the 8 actually
landed, which exceeds the min).

### 3. Thorin canonical numbers — no adjustment required

The plan asked for an explicit deviation note if VALID_SNAPSHOT's existing AC/
level alignment forced a Thorin number adjustment. None was required:
- VALID_SNAPSHOT pre-existing values: `hp: 36, maxHp: 36, ac: 16, level: 5`.
- Thorin spec §7.5.2 spread (STR 16/+3/+5/prof, DEX 14/+2/+2, CON 14/+2/+5/prof,
  INT 18/+4/+4, WIS 12/+1/+1, CHA 8/-1/-1) is fully compatible with the
  existing level=5 fighter profile (prof bonus +3 at L5; for plan baseline
  we used uniform dc=10 since the snapshot is a non-spellcaster).
- DEX 14 → AC 16 with chain mail or studded leather + shield + DEX 2 — fits.
- CON 14 + L5 fighter → HP ≈ 36 (5d10 + 5 CON mod = ~36) — fits.

So the Thorin numbers slot cleanly into the existing canonical without
re-balancing the snapshot's HP/AC/level fields.

## Pitfall 3 verification

`grep -cE "abilities[^:]*\.optional\(\)" packages/shared-protocol/src/payloads/character.ts`
returns **0**. The only `.optional()` in the file is the pre-existing
`portrait: z.object({ url }).optional()` (Plan 13-03 STRETCH-06 — by design
optional for actors lacking `actor.img`). The new `abilities` field lands
REQUIRED with zero drift window.

## Known Stubs

None. This plan introduces schema-only contracts. No UI rendering, no
data-source wiring — all of that is in Plans 16-02 (reader) and 16-03
(renderer + fixtures). The schema is a structural contract, not a feature
with placeholder data.

## Threat Surface

No new threat surface. Per the plan's `<threat_model>`:
- All STRIDE categories have `accept` disposition except T-16-01-T (Tampering)
  and T-16-01-D (DoS), both `mitigate` and implemented exactly as planned:
  - T-16-01-T: `z.object` rejects wrong types; `min(0).max(30)` clamps `value`;
    `proficient z.boolean()` rejects numeric coercion (CS-AB-5 enforces).
  - T-16-01-D: `z.strictObject` with 6 fixed keys + `z.number().int()` bounded
    fields → constant-time parse; no recursion, no regex.
- No new auth, network, or file boundary introduced. Read-path schema only.

## Forward pointers — what Plans 16-02 and 16-03 must close

### Plan 16-02 (foundry-module reader)
- foundry-module typecheck will FAIL until `extractAbilities(actor)` helper
  is added in `character-reader.ts` and wired into `getCharacterSnapshot()`.
  This is the Wave-1 → Wave-2 staged atomicity acknowledged in PLAN
  WAVE-16-01-G7. The expected break manifests as:
  > Object literal may only specify known properties, and 'abilities' does
  > not exist in type ... — TS2353
  in any test/mock that constructs a `CharacterSnapshot` literal without the
  new field.
- Tests to add: `CR-AB-1` dnd5e canonical → snapshot abilities parse;
  `CR-AB-2` missing `actor.system.abilities` → defensive defaults emitted;
  `CR-AB-3` `proficient: 0.5` → false (half-prof coercion); `CR-AB-4`
  `proficient: 2` → true (expert coercion).
- Reader must read `save.value` (dnd5e prep-time computed total), NOT
  recompute from base+prof.

### Plan 16-03 (renderer + fixtures + atomic ratification)
- g2-app fixture round-trip tests (`CSTR-FIX-MAIN-2014` / `-2024`) will FAIL
  until `renderMainTab(snapshot)` consumes `snapshot.abilities.<k>.{value,
  mod, save, proficient}` and replaces the `dash` placeholders. UI-SPEC
  Section 5 lists the 14 cells changing (6 values + 6 mods + 6 saves +
  6 prof glyphs; saves and mods share format helpers).
- 4 INV-1 fixtures to byte-update: `sheet.main.2014.{it,en,de}.txt` +
  `sheet.main.2024.it.txt`.
- INV-3 atomic ratification commit pattern (touches STATE.md, ROADMAP.md,
  REQUIREMENTS.md SHEET-05 checkbox).
- DO NOT bump Specs.md version this milestone — defer milestone-close
  bump to Phase 18 per CONTEXT §Claude's Discretion.

## Self-Check: PASSED

- ✓ Two commits exist in git log: `1336417` (RED) + `e13136b` (GREEN)
- ✓ `packages/shared-protocol/src/payloads/character.ts` contains
  `AbilityScoreSchema = z.object` (line 240), `AbilitiesSchema = z.strictObject`
  (line 273), `abilities: AbilitiesSchema` (line 354 — REQUIRED, no .optional)
- ✓ `packages/shared-protocol/src/index.ts` exports `type Abilities`,
  `AbilitiesSchema`, `type AbilityScore`, `AbilityScoreSchema` (lines 39-42)
- ✓ `packages/shared-protocol/src/payloads/character.test.ts` defines
  `VALID_ABILITIES` constant with Thorin canonical numbers
- ✓ `VALID_SNAPSHOT` carries `abilities: VALID_ABILITIES`
- ✓ 8 CS-AB-* tests present (CS-AB-1..7 + CS-AB-7b bonus)
- ✓ Full @evf/shared-protocol test suite: 339 passing, 0 failing
- ✓ typecheck (shared-protocol scope): exit 0
- ✓ biome lint (shared-protocol scope): exit 0
- ✓ Pitfall 3 grep gate: 0 matches for `abilities[^:]*\.optional\(\)`
- ✓ No modification to STATE.md or ROADMAP.md in this plan's commits
  (orchestrator-level STATE.md change pre-existed and stays unstaged for Plan 16-03)
