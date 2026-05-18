---
phase: 16-sheet-ability-scores-main-tab-data-wiring
plan: 02
subsystem: foundry-module
tags: [reader, tdd, dnd5e-abilities, foundry-module, atomic-extension]
requirements: [SHEET-06]
status: complete
completed: 2026-05-18
duration_minutes: ~25
commits:
  red:   20db536  # test(16-02): RED — CR-AB-1..5 + makeActor abilities mock support
  green: c4fd451  # feat(16-02): GREEN — extractAbilities + wire into getCharacterSnapshot
artifacts:
  created:
    - packages/foundry-module/src/readers/character-reader.ts:254   # ABILITY_KEYS closed enum
    - packages/foundry-module/src/readers/character-reader.ts:266   # zeroAbilities() defensive-default helper
    - packages/foundry-module/src/readers/character-reader.ts:291   # readAbility() per-ability projector
    - packages/foundry-module/src/readers/character-reader.ts:324   # extractAbilities(actor) helper
    - packages/foundry-module/src/types/foundry-globals.d.ts:217    # Dnd5eAbilityRaw interface
    - packages/foundry-module/src/types/foundry-globals.d.ts:252    # Dnd5eActorSystem.abilities? optional field
  modified:
    - packages/foundry-module/src/readers/character-reader.ts:32-33     # +Abilities, +AbilityScore type imports
    - packages/foundry-module/src/readers/character-reader.ts:416       # getCharacterSnapshot return wires abilities
    - packages/foundry-module/src/readers/readers.test.ts:94            # type AbilityMockShape
    - packages/foundry-module/src/readers/readers.test.ts:124           # makeActor abilities override key
    - packages/foundry-module/src/readers/readers.test.ts:148           # abilitiesField passthrough into system
    - packages/foundry-module/src/readers/readers.test.ts:559-727       # CR-AB-1..5 test block
metrics:
  tests_added: 5                # CR-AB-1..5
  tests_passing_foundry_module: 468   # full package suite, zero regression
  tests_passing_reader_file: 117      # readers.test.ts only
  lines_added: 313                    # net additions across 3 files (313 ins, 1 del)
  helper_loc: ~75                     # extractAbilities + readAbility + zeroAbilities combined
gate_evidence:
  WAVE-16-02-G1: pass     # Two atomic commits: RED 20db536 + GREEN c4fd451
  WAVE-16-02-G2: pass     # CR-AB-1..5 all pass (5/5)
  WAVE-16-02-G3: pass     # 468/468 foundry-module tests pass; CR-DS-4 / CHRD-INV-4 / CHRD-SPL-5 round-trips now green
  WAVE-16-02-G4: pass     # CR-AB-5 schema.safeParse round-trip returns success: true
  WAVE-16-02-G5: pass*    # save.value grep = 4; proficient coercion landed under variable name `proficientRaw` — see deviation note
  WAVE-16-02-G6: pass     # zero write-path code; single grep hit is the file-header JSDoc reading-only contract reference
  WAVE-16-02-G7: pass     # foundry-module typecheck exit 0; shared-protocol still 339/339 passing
  WAVE-16-02-G8: deferred # Workspace-wide gate intentionally deferred to Plan 16-03 (atomic-extension design — renderer + 4 INV-1 fixtures close the gap)
---

# Phase 16 Plan 02: foundry-module character-reader extension (extractAbilities) — Summary

**One-liner:** Atomic TDD reader extension exporting an `extractAbilities(actor)`
helper that reads `actor.system.abilities.{str,dex,con,int,wis,cha}.{value, mod,
save.value, proficient, dc}` defensively, coerces dnd5e's raw `proficient: 0|0.5|1|2`
to a strict boolean (0|0.5 → false, 1|2 → true per CONTEXT D-Area-2), and wires
the result into `getCharacterSnapshot` — closing the Wave-1 → Wave-2 atomic
gap opened by Plan 16-01's schema-only landing so every snapshot round-trips
clean through `CharacterSnapshotSchema`.

## What was built

Two atomic commits closed the RED/GREEN TDD cycle on the SHEET-06 reader half:

| Step | Commit | What | Tests state |
|------|--------|------|-------------|
| RED   | `20db536` | 5 failing CR-AB-* tests + `AbilityMockShape` type + extended `makeActor` overrides (carries the dnd5e canonical `save: {value: number}` shape and `proficient: 0|0.5|1|2` raw values; passes overrides through verbatim so the reader owns defensive-default semantics) | 8 fails (5 new CR-AB-1..5 + 3 pre-existing round-trip tests CR-DS-4 / CHRD-INV-4 / CHRD-SPL-5 that flipped to RED when Plan 16-01 made `abilities` REQUIRED on the schema); 109 pre-existing tests still passing |
| GREEN | `c4fd451` | `extractAbilities` (top-level helper, ~75 LOC across 3 internal helpers: `extractAbilities` + `readAbility` + `zeroAbilities`) + `Dnd5eAbilityRaw` + `Dnd5eActorSystem.abilities?` typedefs + reader wiring in `getCharacterSnapshot`'s return object | 117/117 readers.test.ts; 468/468 foundry-module total; typecheck exit 0; biome exit 0 on touched files |

### Reader design crystallized in this plan

- **`extractAbilities`** is the public Phase 16 entrypoint mirroring
  `extractInventory` / `extractSpellbook` style — explicit defensive
  short-circuits at `actor === undefined` and `system.abilities === undefined`,
  then a bounded 6-key iteration. No recursion, constant-time read pattern
  (T-16-02-D mitigation).

- **`readAbility`** is the per-ability projector. Critical correctness choices:
  - **`save.value` direct read** (not recomputed from `mod + prof`) per
    CONTEXT D-Area-2. dnd5e prep-time already computed the save total;
    re-computing would diverge on edge cases (magic items granting save
    bonuses, racial save bonuses, feats).
  - **`proficient` strict coercion** `proficientRaw === 1 || proficientRaw === 2`
    per CONTEXT D-Area-2. Rejects garbage too (string, NaN, undefined all
    become `false` — safe default; T-16-02-T mitigation).
  - **Per-field nullish-coalesce**: `value ?? 10`, `mod ?? 0`,
    `save?.value ?? 0`, `dc ?? 10` — defends against partial shapes
    (e.g. `system.abilities.str` present but `proficient` absent).

- **`zeroAbilities()`** returns 6 × `{value:10, mod:0, save:0, proficient:false,
  dc:10}` for fresh actors lacking `system.abilities` entirely. Mirrors the
  Phase 4b death-saves defensive-default pattern (CR-DS-3) — never throws,
  never returns null for the field.

- **Typedef extension** (`foundry-globals.d.ts`): added `Dnd5eAbilityRaw`
  interface and made `Dnd5eActorSystem.abilities?` optional. This unblocked
  a TS2352 typecheck break that surfaced when the reader started traversing
  a previously-undeclared sub-tree; the type extension also serves as
  living documentation of the dnd5e 5.x ability shape for future readers.

### CR-AB-1..5 test coverage

| Test | Asserts |
|------|---------|
| CR-AB-1 | Canonical Thorin spread (STR 16/+3/+5 prof, DEX 14/+2/+2, CON 14/+2/+5 prof, INT 18/+4/+4, WIS 12/+1/+1, CHA 8/−1/−1) → snapshot.abilities populated with all computed totals including negative mod/save |
| CR-AB-2 | `actor.system.abilities === undefined` → 6× zero-default emitted (defensive-defaults path) |
| CR-AB-3 | `proficient: 0.5` (half-prof) → boolean `false` on Main tab |
| CR-AB-4 | `proficient: 2` (expertise) → boolean `true` on Main tab |
| CR-AB-5 | Full snapshot round-trips through `CharacterSnapshotSchema.safeParse` (closes Wave-1 → Wave-2 atomic gap) |

CR-AB-5 is the load-bearing test of this plan: it asserts that the producer
(reader) + consumer (schema) are now coherent — proving the Plan 16-01 GREEN
gate (`abilities` REQUIRED) and the Plan 16-02 GREEN gate (reader emits
`abilities`) are co-deployed atomically with no drift window.

## Grep evidence for gates

```bash
# G5a: D-Area-2 proficient coercion landed
$ grep -cE "proficient[a-zA-Z]* === 1 \|\| .* === 2" packages/foundry-module/src/readers/character-reader.ts
1   # line 304: `const proficient = proficientRaw === 1 || proficientRaw === 2`

# G5b: save.value read path landed
$ grep -cE "save\.value|saveRaw\.value" packages/foundry-module/src/readers/character-reader.ts
4   # JSDoc citations + line 297: `const save = raw?.save?.value ?? 0`

# G6: no write-path / no socketlib handler added (excluding doc references)
$ grep -nE "actor\.update|game\.settings\.set|registerComplexHandler" packages/foundry-module/src/readers/character-reader.ts | grep -vE "^\s*[0-9]+:\s*\*"
(no matches — single hit on line 7 is the file-header JSDoc documenting the read-only contract)
```

## Deviations from plan

### 1. WAVE-16-02-G5 gate regex narrowness (informational, same flavor as Plan 16-01 G5)

The plan's gate regex is `"proficient === 1 \\|\\| .* === 2"` which expects
the bare identifier `proficient`. Implementation uses the more readable
`proficientRaw` variable name (storing dnd5e's raw `0|0.5|1|2` value before
coercion) so the assignment line reads
`const proficient = proficientRaw === 1 || proficientRaw === 2`. The
substantive D-Area-2 coercion intent is fully satisfied — verified with a
slightly-relaxed regex `proficient[a-zA-Z]* === 1 \|\| .* === 2` which
matches the implementation line. Plan 16-03 may refine the gate regex if
it consumes this gate verbatim. (Suggested fix:
`proficient(Raw)? === 1 \\|\\| .* === 2`.)

### 2. Typedef extension beyond plan scope (Rule 3 auto-fix — blocking typecheck break)

Plan Task 2 step (b) described accessing `actor.system.abilities` via
`Record<string, unknown>` casts. When implemented as written, this produced
a TS2352 "Conversion of type 'Dnd5eActorSystem' to type 'Record<string,
unknown>' may be a mistake" typecheck error because `Dnd5eActorSystem` is
a closed interface without an index signature. Auto-fix per deviation Rule 3
(blocking typecheck): added `Dnd5eAbilityRaw` interface and
`Dnd5eActorSystem.abilities?` optional field to `foundry-globals.d.ts`.
The result is cleaner than the plan's cast approach (no `as` escapes — better
INV-4 hygiene) and serves as living documentation of the dnd5e 5.x ability
shape. The reader code simplified to `actor.system?.abilities`
direct-property access with structural typing carrying through to
`readAbility(raw: Dnd5eAbilityRaw | undefined)`.

### 3. Biome formatter long-line fold (one-shot retry)

First commit attempt was rejected by the pre-commit Biome formatter for an
overly-wrapped two-line declaration of `abilitiesField`. Trivial fix —
folded onto a single line. No semantic change. (Recorded for transparency;
no plan deviation in spirit.)

## Known stubs

None. This plan introduces a reader extension with full computation paths
and defensive defaults. No UI rendering, no placeholder data — all that is
in Plan 16-03 (renderer + fixtures + atomic ratification).

## Threat surface

No new threat surface introduced. Per plan `<threat_model>`:
- All STRIDE categories `accept` except T-16-02-T (Tampering) and
  T-16-02-D (DoS), both `mitigate` and landed as planned:
  - **T-16-02-T**: `proficientRaw === 1 || proficientRaw === 2` rejects
    garbage (string, NaN, undefined all → `false`; safe default).
  - **T-16-02-D**: bounded 6-key loop, no recursion, constant-time read
    pattern; defensive defaults prevent error-throwing on malformed actor.
- No new auth, network, or file boundary introduced.
- No `actor.update`, no `game.settings.set`, no `socketlib.registerComplexHandler`
  added — CI Gate 8 socketlib handler count preserved (= 17).
- Read-only contract (Phase 2) preserved end-to-end.

## TDD Gate Compliance

- ✓ `test(16-02): RED — …` commit exists (`20db536`)
- ✓ `feat(16-02): GREEN — …` commit exists after RED (`c4fd451`)
- ✗ `refactor(16-02):` commit — not needed; GREEN implementation was clean
  on first pass (mirrors `extractInventory` / `extractSpellbook` structure
  established in Phase 5).

## Workspace-wide test state (informational — Plan 16-03 gate)

Workspace-wide `pnpm test` after Plan 16-02 GREEN: **2622 passing / 17 failing**.

The 17 failures are the expected atomic-extension gap that Plan 16-03 closes.
All 17 failures share a single root cause: tests in `g2-app`, `bridge`, and
`foundry-mcp` that construct `CharacterSnapshot` literals (via
`snapshot2014` / `snapshot2024` test fixtures or inline) without the new
REQUIRED `abilities` field, which `CharacterSnapshotSchema.safeParse` now
rejects. Breakdown of failing test files:

| Package | File | Count |
|---------|------|------:|
| g2-app  | `panels/__tests__/inventory-panel.test.ts` | 2 |
| g2-app  | `panels/__tests__/spellbook-panel.test.ts` | 2 |
| g2-app  | `status-hud/__tests__/status-hud-layer.test.ts` | 7 |
| g2-app  | `__tests__/04b-integration-smoke.test.ts` | 1 |
| g2-app  | `__tests__/scene-renderer-smoke.test.ts` | 1 |
| bridge  | `server.test.ts` (GET `/v1/character/:actorId`) | 1 |
| foundry-mcp | `resources/ws-subscription.test.ts` (cases 2 + 8) | 2 |
| g2-app  | `panels/__tests__/character-sheet-tab-renderers.test.ts` (CSTR-FIX-MAIN-* etc.) | 1 |

These are EXPECTED per WAVE-16-02-G8 and explicitly scoped to Plan 16-03 by
the plan's verification section: "Do NOT run `pnpm test` at workspace root
at the end of Plan 16-02 — defer that gate to Plan 16-03 final close."

## Forward pointers — what Plan 16-03 must close

### Renderer half of SHEET-06 (consumer)

- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts:192` —
  `renderMainTab(snapshot, locale)` must consume
  `snapshot.abilities.<k>.{value, mod, save, proficient}` and replace the
  `dash` placeholders. UI-SPEC §3 lists the 14 cells changing (6 values,
  6 mods, 6 saves, 6 prof glyphs — saves and mods share `+N`/`−N` format
  helpers).

### Test fixtures that need byte-update

All snapshot literals in failing tests must add the new `abilities` field
(simplest: spread `VALID_ABILITIES` from `shared-protocol/src/payloads/character.test.ts`
or define minimal zero-default abilities). Specifically:

- `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts`:
  `snapshot2014` and `snapshot2024` literals — carry the Thorin Lv5 fighter
  spread per CONTEXT §Area 4 (STR 16/+3/+5 prof, DEX 14/+2/+2, CON 14/+2/+5 prof,
  INT 18/+4/+4, WIS 12/+1/+1, CHA 8/−1/−1) so the fixture round-trips end-to-end.
- `packages/g2-app/src/panels/__tests__/inventory-panel.test.ts`,
  `spellbook-panel.test.ts`,
  `status-hud/__tests__/status-hud-layer.test.ts`,
  `__tests__/04b-integration-smoke.test.ts`,
  `__tests__/scene-renderer-smoke.test.ts`: minimal zero-default
  `abilities` suffices (these tests don't assert ability rendering).
- `packages/bridge/src/server.test.ts`: same — minimal zero-default
  abilities on the mock character snapshot.
- `packages/foundry-mcp/src/resources/ws-subscription.test.ts`: cases 2
  and 8 — minimal zero-default abilities on the cached snapshot fixtures.

### INV-1 fixtures (byte-update)

4 fixtures must be byte-updated with real numbers in place of dashes:
- `packages/shared-render/src/fixtures/sheet.main.2014.it.txt`
- `packages/shared-render/src/fixtures/sheet.main.2014.en.txt`
- `packages/shared-render/src/fixtures/sheet.main.2014.de.txt`
- `packages/shared-render/src/fixtures/sheet.main.2024.it.txt`

CONTEXT D-Area-3 reaffirms the width-invariant: the existing `dash`
placeholders already budget 2 cells for value + 1 cell separator + 2 cells
for mod, and `+N`/`−N` save format reuses the dash slot. No row-count or
column-anchor change.

### INV-3 atomic ratification commit

Plan 16-03 final commit must touch:
- `.planning/STATE.md` (advance plan counter, current plan = 16-03)
- `.planning/ROADMAP.md` (Phase 16 progress row)
- `.planning/REQUIREMENTS.md` (SHEET-05 + SHEET-06 checkboxes; SHEET-06
  has now had its producer half landed — the renderer half is the
  16-03 closure)

**Note:** This plan did NOT touch `Specs.md`. Phase 16 close does NOT bump
the `Specs.md` version (atomic per phase, milestone-close bump is
conventionally Phase 18 per CONTEXT §Claude's Discretion). Plan 16-03
should NOT bump `Specs.md` either — but it MAY update §7.5.2 mockup if the
actual ASCII output differs from the in-spec ASCII at byte level after the
fixtures are regenerated.

## Self-Check: PASSED

- ✓ Two commits exist in git log: `20db536` (RED) + `c4fd451` (GREEN)
- ✓ `packages/foundry-module/src/readers/character-reader.ts` contains:
  - `function extractAbilities` (line 324)
  - `function readAbility` (line 291)
  - `function zeroAbilities` (line 266)
  - `abilities: extractAbilities(actor)` in `getCharacterSnapshot` return (line 416)
  - Type imports `Abilities, AbilityScore` (lines 32-33)
- ✓ `packages/foundry-module/src/readers/readers.test.ts` contains:
  - `type AbilityMockShape` (line 94)
  - `abilities` override on `makeActor` (line 124)
  - 5 CR-AB-* tests in dedicated section (CR-AB-1..5)
- ✓ `packages/foundry-module/src/types/foundry-globals.d.ts` contains:
  - `interface Dnd5eAbilityRaw` (line 217)
  - `Dnd5eActorSystem.abilities?` optional field (line 252)
- ✓ Full `@evf/foundry-module` test suite: 468 passing, 0 failing
- ✓ readers.test.ts: 117 passing, 0 failing
- ✓ typecheck (foundry-module scope): exit 0
- ✓ typecheck (shared-protocol scope): exit 0 (regression check from Plan 16-01)
- ✓ shared-protocol tests still 339/339 passing (zero regression)
- ✓ Biome formatter exit 0 on all 3 modified files
- ✓ G5b grep for `save.value|saveRaw.value` returns 4 (confirms save.value read path)
- ✓ G6 grep returns 0 hits when JSDoc lines filtered out (zero write-path code)
- ✓ No modification to `.planning/STATE.md` or `.planning/ROADMAP.md` in this plan's commits
  (orchestrator-level STATE.md change pre-existed and stays unstaged for Plan 16-03)
- ✓ Workspace-wide failures (17) are the EXPECTED atomic-extension gap that Plan 16-03 closes; all 17 share a single root cause (missing `abilities` on snapshot literals)
