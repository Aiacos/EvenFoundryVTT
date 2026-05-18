---
phase: 17-sheet-skills-tab-skills-tab-data-wiring
plan: 02
subsystem: foundry-module
tags: [reader, tdd, dnd5e-skills, foundry-module, atomic-extension]
requirements: [SHEET-09]
status: complete
completed: 2026-05-18
duration_minutes: ~12
commits:
  red:   c19320c  # test(17-02): RED — CR-SK-1..6 + Dnd5eSkillRaw + makeActor skills mock
  green: 54e577e  # feat(17-02): GREEN — extractSkills + SKILL_DEFAULT_ABILITY + wire into getCharacterSnapshot
artifacts:
  created:
    - packages/foundry-module/src/readers/character-reader.ts:376  # SKILL_DEFAULT_ABILITY static map (18-key)
    - packages/foundry-module/src/readers/character-reader.ts:409  # zeroSkills() defensive-default helper
    - packages/foundry-module/src/readers/character-reader.ts:445  # readSkill(raw, key) per-skill projector
    - packages/foundry-module/src/readers/character-reader.ts:492  # extractSkills(actor) public entry
    - packages/foundry-module/src/types/foundry-globals.d.ts:258   # Dnd5eSkillRaw interface
    - packages/foundry-module/src/types/foundry-globals.d.ts:306   # Dnd5eActorSystem.skills? optional field
  modified:
    - packages/foundry-module/src/readers/character-reader.ts:31-46   # type imports + SKILL_KEYS value import
    - packages/foundry-module/src/readers/character-reader.ts:585     # getCharacterSnapshot return wires skills
    - packages/foundry-module/src/readers/readers.test.ts:113         # type SkillMockShape
    - packages/foundry-module/src/readers/readers.test.ts:121         # type SkillMockKey (18-key dnd5e canonical)
    - packages/foundry-module/src/readers/readers.test.ts:177         # makeActor skills override key
    - packages/foundry-module/src/readers/readers.test.ts:191-196     # skillsField passthrough into system
    - packages/foundry-module/src/readers/readers.test.ts:805         # thorinSkills() inline fixture
    - packages/foundry-module/src/readers/readers.test.ts:783-995     # CR-SK-1..6 test block
metrics:
  tests_added: 6                       # CR-SK-1..6
  tests_passing_readers_file: 123      # 117 baseline → 117 + 6 (4 pre-existing round-trip tests also flipped GREEN)
  tests_passing_foundry_module: 474    # 468 baseline → 468 + 6
  tests_passing_shared_protocol: 347   # unchanged (Plan 17-01 regression baseline preserved)
  lines_added: 515                     # net diff stat (172 reader + 266 test + 78 d.ts = 516 ins, 4 del)
  helper_loc: ~120                     # SKILL_DEFAULT_ABILITY + zeroSkills + readSkill + extractSkills combined
gate_evidence:
  WAVE-17-02-G1: pass    # Two atomic commits: RED c19320c + GREEN 54e577e
  WAVE-17-02-G2: pass    # 6/6 CR-SK-1..6 tests pass
  WAVE-17-02-G3: pass    # 474/474 foundry-module pass; CR-DS-4 / CHRD-INV-4 / CHRD-SPL-5 / CR-AB-5 round-trips now GREEN
  WAVE-17-02-G4: pass    # CR-SK-6 round-trip CharacterSnapshotSchema.safeParse returns success: true
  WAVE-17-02-G5: pass*   # Per-occurrence count = 6 (≥4); per-line count = 2 — see deviation note (Biome forced one-line fold)
  WAVE-17-02-G6: pass    # zero non-JSDoc write-path; CI Gate 8 socketlib count = 17 preserved
  WAVE-17-02-G7: pass    # foundry-module typecheck exit 0; shared-protocol 347/347 unchanged
  WAVE-17-02-G8: deferred  # Workspace-wide gate intentionally deferred to Plan 17-03 (atomic-extension design — renderer + 4 INV-1 fixtures + 17+ downstream snapshot literal extensions close the gap)
---

# Phase 17 Plan 02: foundry-module character-reader extension (extractSkills) — Summary

**One-liner:** Atomic TDD reader extension exporting an `extractSkills(actor)`
helper that reads `actor.system.skills.{acr,ani,...,sur}.{total, ability,
proficient, passive}` defensively for all 18 dnd5e canonical skill codes,
preserves `proficient: 0|0.5|1|2` verbatim through the wire (Skills tab needs
the full glyph spectrum ○/◉/★ per UI-SPEC §3 — explicit difference from Phase
16's boolean coercion for Main tab), reads `passive` directly (NOT recomputed
from `10 + total` — Observant feat / magic items may diverge), and wires the
result into `getCharacterSnapshot` — closing the Wave-1 → Wave-2 atomic gap
opened by Plan 17-01's schema-only landing so every snapshot round-trips
clean through `CharacterSnapshotSchema`.

## What was built

Two atomic commits closed the RED/GREEN TDD cycle on the SHEET-09 reader half:

| Step | Commit | What | Tests state |
|------|--------|------|-------------|
| RED   | `c19320c` | 6 failing CR-SK-* tests + `SkillMockShape` / `SkillMockKey` typedefs + extended `makeActor` overrides (carries the dnd5e canonical 18-skill shape with `total` as bare number — different from Phase 16 `save.value` wrapper — and `proficient: 0|0.5|1|2` raw values; passes overrides through verbatim so the reader owns defensive-default semantics) + `Dnd5eSkillRaw` ambient global + `Dnd5eActorSystem.skills?` optional 18-key field | 10 fails (6 new CR-SK-1..6 + 4 pre-existing round-trip tests CR-DS-4 / CHRD-INV-4 / CHRD-SPL-5 / CR-AB-5 that flipped to RED when Plan 17-01 made `skills` REQUIRED); 113 pre-existing reader tests still passing |
| GREEN | `54e577e` | `extractSkills` (top-level helper, ~120 LOC across 4 internal helpers: `extractSkills` + `readSkill` + `zeroSkills` + `SKILL_DEFAULT_ABILITY` map) + reader wiring `skills: extractSkills(actor)` between `abilities:` and `...portraitField` in `getCharacterSnapshot`'s return; imports of `AbilityKey`/`Skill`/`SkillKey`/`Skills` (type) + `SKILL_KEYS` (value) from `@evf/shared-protocol`; local `AbilityKey` typedef removed (Plan 17-01 is now the single source of truth) | 123/123 readers.test.ts; 474/474 foundry-module total; 347/347 shared-protocol unchanged; typecheck exit 0; Biome exit 0 on touched files |

### Reader design crystallized in this plan

- **`SKILL_DEFAULT_ABILITY` static map** — 18-key `Record<SkillKey, AbilityKey>`
  encoding the canonical D&D 5e default ability driver per skill. No CON-based
  skills exist in canonical 5e (INV-2 cross-checked 2026-05-18 against dnd5e
  wiki Roll-Formulas + dnd5e 5.3.3 module/data/actor/templates/common.mjs).
  Mapping:
  - `dex`: acr (Acrobatics), ste (Stealth), slt (Sleight of Hand)
  - `str`: ath (Athletics — the only STR-based skill)
  - `int`: arc (Arcana), his (History), inv (Investigation), nat (Nature), rel (Religion)
  - `wis`: ani (Animal Handling), ins (Insight), med (Medicine), prc (Perception), sur (Survival)
  - `cha`: dec (Deception), itm (Intimidation), prf (Performance), per (Persuasion)

  Used for both `zeroSkills()` defensive defaults AND per-skill `ability`
  fallback when `actor.system.skills.<k>.ability` is missing (Rule 2
  mitigation against homebrew systems writing non-canonical values).

- **`extractSkills`** is the public Phase 17 entry-point mirroring
  `extractAbilities` (Phase 16) / `extractInventory` (Phase 5) / `extractSpellbook`
  (Phase 5) style — explicit defensive short-circuits at `actor === undefined`
  and `system.skills === undefined`, then a bounded 18-key iteration via
  `SKILL_KEYS`. No recursion, constant-time read pattern (T-17-02-D
  mitigation).

- **`readSkill`** is the per-skill projector. Critical correctness choices:
  - **`total` direct read** as a bare number (dnd5e prep-time computed,
    includes ability + prof + bonuses) — NOT `.mod` (which excludes bonuses)
    per CONTEXT D-Area-2.
  - **`ability` validated against the 6-key set** with `SKILL_DEFAULT_ABILITY`
    fallback (T-17-02-T mitigation — homebrew systems writing non-canonical
    values default to the canonical D&D 5e ability rather than failing
    schema validation downstream).
  - **`proficient` PRESERVED VERBATIM** as `0|0.5|1|2` (NO boolean coercion).
    This is the **explicit difference from Phase 16's `readAbility`** which
    coerces `0|0.5 → false, 1|2 → true` for the Main tab boolean wire.
    Phase 17 Skills tab UI-SPEC §3 needs the full glyph spectrum (○/◉/★)
    with half-prof round-up handled at render time (renderer's job, not
    reader's). The reader clamps malformed values (anything outside
    `0|0.5|1|2`) to `0` (T-17-02-T mitigation).
  - **`passive` read directly** from dnd5e prep-time computed value (NOT
    recomputed via `10 + total` — Observant feat, magic items, half-prof
    bonus, and tool-proficiency interactions may diverge from the naive
    formula) per CONTEXT D-Area-2 "Read passive directly". Clamped
    non-negative as schema requires (T-17-02-T).
  - **Per-field nullish-coalesce**: `total ?? 0`, `ability ?? SKILL_DEFAULT_ABILITY[key]`,
    `proficient ?? 0`, `passive ?? 10` — defends against partial shapes
    (e.g., `system.skills.acr` exists but `ability` is undefined).

- **`zeroSkills()`** returns 18 × `{total:0, ability:SKILL_DEFAULT_ABILITY[k],
  proficient:0, passive:10}` for fresh actors lacking `system.skills`
  entirely. The canonical-default-ability mapping is critical: passing the
  fresh-actor zero-default through `CharacterSnapshotSchema.safeParse` requires
  the inner `ability` field on every sub-object to match the 6-key
  `AbilityKey` enum (no `con`-based skills sneak through). Mirrors Phase 16
  `zeroAbilities` / Phase 4b death-saves defensive-default pattern — never
  throws, never returns null for the field.

- **Type extension** (`foundry-globals.d.ts`): added `Dnd5eSkillRaw` ambient
  interface (parallel to Phase 16 `Dnd5eAbilityRaw`) and
  `Dnd5eActorSystem.skills?` optional 18-key field. The 18-key list is
  duplicated as a string-literal union (NOT imported from
  `@evf/shared-protocol`'s `SKILL_KEYS`) because `foundry-globals.d.ts` is a
  pure ambient declaration file — module imports in `.d.ts` ambient files
  conflict with global typings. Mirrors the Phase 16 abilities pattern
  exactly.

### CR-SK-1..6 test coverage

| Test | Asserts |
|------|---------|
| CR-SK-1 | Canonical Thorin Lv8 fighter spread (Specs.md §7.5.3 — Athletics +6 prof STR, Investigation total=0 / passive=14 divergence, Perception+Insight passive=11, Animal Handling +4 prof WIS) → snapshot.skills populated correctly across all 18 keys with the expected total / ability / proficient / passive values |
| CR-SK-2 | `actor.system.skills === undefined` → 18 zero-default sub-objects emitted with **SKILL_DEFAULT_ABILITY map correctness** explicitly gated (acr→dex, ath→str, prc→wis, arc→int, dec→cha, ste→dex, sur→wis) and full enumeration check that every one of the 18 keys is `{total:0, proficient:0, passive:10}` |
| CR-SK-3 | `proficient: 0.5` (Jack of All Trades half-prof) → snapshot value stays exactly `0.5` (NOT coerced to `false` like Phase 16 reader) — explicit difference test |
| CR-SK-4 | `proficient: 2` (Expertise) → snapshot value stays exactly `2` (NOT coerced to `true` or `1` — full glyph spectrum support for Skills tab) |
| CR-SK-5 | `passive: 18` while `total: 1` → snapshot.passive === 18 (the divergence test — proves reader does NOT recompute as `10 + total`; Observant feat / magic-item scenario) |
| CR-SK-6 | Full snapshot with abilities + skills round-trips through `CharacterSnapshotSchema.safeParse` (closes Wave 1 → Wave 2 atomic gap; the load-bearing test of this plan — producer + consumer coherence proof) |

CR-SK-6 is the load-bearing test: it asserts that the producer (reader) +
consumer (schema) are now coherent — proving the Plan 17-01 GREEN gate
(`skills` REQUIRED) and the Plan 17-02 GREEN gate (reader emits `skills`)
are co-deployed atomically with no drift window.

## Grep evidence for gates

```bash
# G5a: D-Area-2 proficient verbatim pass-through landed (per-occurrence count)
$ grep -oE "proficient[a-zA-Z]*\s*===\s*(0\.5|0|1|2)" packages/foundry-module/src/readers/character-reader.ts | wc -l
6   # 2 from line 326 (Phase 16 readAbility boolean coercion) + 4 from line 467 (Phase 17 readSkill enum clamp)

# G5a (line-count form — Biome forced one-line fold, see deviation 1)
$ grep -nE "proficient.*===\s*(0|0\.5|1|2)" packages/foundry-module/src/readers/character-reader.ts
326:  const proficient = proficientRaw === 1 || proficientRaw === 2;
467:    proficientRaw === 0 || proficientRaw === 0.5 || proficientRaw === 1 || proficientRaw === 2

# G5b: SKILL_DEFAULT_ABILITY usage landed (≥4 expected; got 7)
$ grep -cE "SKILL_DEFAULT_ABILITY" packages/foundry-module/src/readers/character-reader.ts
7   # 1 definition + JSDoc references + zeroSkills usage + readSkill fallback + ability-validation fallback

# G5c: passive read-through landed (≥1 expected)
$ grep -cE "raw\?\.passive" packages/foundry-module/src/readers/character-reader.ts
1   # line 477: const passiveRaw = raw?.passive ?? 10;

# G6a: no non-JSDoc write-path / no socketlib handler added
$ grep -nE "actor\.update|game\.settings\.set|registerComplexHandler" packages/foundry-module/src/readers/character-reader.ts | grep -vE "^\s*[0-9]+:\s*\*"
(no matches — single hit on line 7 is the file-header JSDoc documenting the read-only contract)

# G6b: CI Gate 8 socketlib count preserved
$ grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts
17  # unchanged from Phase 13 close
```

## Deviations from plan

### 1. WAVE-17-02-G5 line-count vs per-occurrence-count gate semantics

The plan's gate regex `grep -cE "proficient.*===\s*(0|0\.5|1|2)" ≥ 4` was
written assuming the implementation would fold the proficient clamp into 4
vertical lines (one per literal value), as Task 2(d) showed:

```typescript
// Plan-stated 4-line layout (NOT what Biome accepts):
const safeProficient =
  proficient === 0 ||
  proficient === 0.5 ||
  proficient === 1 ||
  proficient === 2
    ? proficient
    : 0;
```

However, Biome 2.4.15's formatter rejected this layout and forced a
single-line fold:

```typescript
// Biome-accepted single-line form (what actually landed):
const proficient: 0 | 0.5 | 1 | 2 =
  proficientRaw === 0 || proficientRaw === 0.5 || proficientRaw === 1 || proficientRaw === 2
    ? proficientRaw
    : 0;
```

`grep -c` counts LINES, not occurrences, so the line-count gate dropped to
2 (line 326 from Phase 16 readAbility + line 467 from Phase 17 readSkill).
The SUBSTANTIVE intent — verbatim clamp through the closed 4-value enum
`0|0.5|1|2` — is fully landed (per-occurrence count = 6 via the loosened
regex `proficient[a-zA-Z]*\s*===\s*(0\.5|0|1|2)`). Same flavor as Plan
16-02's documented G5 deviation (the planner's regex was narrower than the
implementation variable name — `proficient === 1` expected vs
`proficientRaw === 1` landed); Plan 17-03 may refine the gate regex to
`grep -oE ... | wc -l ≥ 4` if it consumes this gate verbatim.

### 2. Local `AbilityKey` typedef removed (single-source-of-truth alignment)

Plan Task 2(a) said "Add `Skills, Skill, SkillKey, AbilityKey, SKILL_KEYS`
to the type-only + value imports from `@evf/shared-protocol`. Keep
`Abilities, AbilityScore` (Phase 16 baseline)." It did not explicitly say
to remove the existing local `AbilityKey` typedef on line 269 of
`character-reader.ts` (introduced by Plan 16-02 c4fd451). After adding the
import, TypeScript flagged a duplicate-identifier conflict. Per CLAUDE.md
INV-4 "single source of truth" + the plan's Plan 17-01 ratification of
`@evf/shared-protocol` as the canonical `AbilityKey` source, I deleted the
local typedef. The local `ABILITY_KEYS` runtime tuple stays (it's a value
needed for the `extractAbilities` iteration loop, and the imported
`AbilityKey` type is structurally identical to the local
`(typeof ABILITY_KEYS)[number]` so all existing `as AbilityKey` casts
continue to type-check). No semantic change. Deviation logged for
transparency; Plan 17-03 may revisit whether to also import
`ABILITY_KEYS` as a value from shared-protocol.

### 3. `thorinSkills()` fixture placed inside `describe` block, not module-top

Plan Task 1 step (c) said "the most readable approach is to define a helper
`function thorinSkills(): Partial<Record<SkillKey, SkillMockShape>>`
returning all 18 keys; otherwise the test bloats. Place this helper inline
in the test file or in a `// ─── Test fixtures ───` section near the top."

I placed `thorinSkills()` inside the `describe('getCharacterSnapshot', ...)`
block immediately above the CR-SK-* test block rather than at module top
because Phase 16's CR-AB-* tests inlined the spread (no helper) and the
Phase 17 spread is much larger (18 keys vs 6), making a local helper
clearer than a module-level one used only by Phase-17 tests. The
`SkillMockKey` ambient type is module-level so the helper can still
reference it from inside the describe block. No functional impact.

## Known stubs

None. This plan introduces a reader extension with full computation paths
and defensive defaults. No UI rendering, no placeholder data — all that is
in Plan 17-03 (renderer + fixtures + atomic ratification).

## Threat surface

No new threat surface introduced. Per plan `<threat_model>`:

- T-17-02-S (Spoofing) — `accept` — read-only against trusted actor; same
  trust boundary as Phase 5 / Phase 16 readers.
- T-17-02-T (Tampering) — `mitigate` — all three sub-fields are clamped:
  - `ability` validated against the 6-key `AbilityKey` enum with
    `SKILL_DEFAULT_ABILITY[key]` fallback (CR-SK-2 indirectly proves the
    fallback path via the defensive-default branch; explicit
    AbilityKey-enum gate is enforced by `CharacterSnapshotSchema` at the
    consumer side).
  - `proficient` clamped to closed 4-value enum `0|0.5|1|2` (anything else
    defaults to `0`). CR-SK-3 + CR-SK-4 prove verbatim pass-through.
  - `passive` clamped non-negative (T-17-02-T). CR-SK-5 proves direct
    read-through.
- T-17-02-R (Repudiation) — `accept` — no audit-relevant action.
- T-17-02-I (Info Disclosure) — `accept` — same scope as Phase 5/16 sheet
  read; player sees only their own actor.
- T-17-02-D (DoS) — `mitigate` — bounded 18-key loop via `SKILL_KEYS`; no
  recursion; constant-time read pattern; defensive defaults prevent
  error-throwing on malformed actor.
- T-17-02-E (Elevation) — `accept` — read-path only; no write surface
  introduced.
- T-17-02-SC (Supply Chain) — `accept` — NO new package installs in Plan
  17-02; reader-extension only.

CI Gate 8 socketlib handler count = 17 preserved (read-only extension; no
handler changes; no `actor.update`, no `game.settings.set`, no
`socketlib.registerComplexHandler` added).

## TDD Gate Compliance

- ✓ `test(17-02): RED — …` commit exists (`c19320c`)
- ✓ `feat(17-02): GREEN — …` commit exists after RED (`54e577e`)
- ✗ `refactor(17-02):` commit — not needed; GREEN implementation was clean
  on first pass (mirrors `extractAbilities` / `extractInventory` /
  `extractSpellbook` structure). One Biome formatter retry was needed
  (Plan deviation 1) but it was a single-character whitespace fold, not a
  semantic refactor — folded inline in the GREEN commit.

## Workspace-wide test state (informational — Plan 17-03 gate)

Workspace-wide `pnpm test` after Plan 17-02 GREEN is intentionally NOT run
per WAVE-17-02-G8 and the plan's explicit guidance: "Do NOT run `pnpm test`
at workspace root at the end of Plan 17-02 — defer that gate to Plan 17-03
final close."

Expected atomic-extension gap (Phase 16 precedent): 17+ failing tests
across g2-app, bridge, foundry-mcp test suites that construct
`CharacterSnapshot` literals (via `snapshot2014` / `snapshot2024` fixtures
or inline) without the new REQUIRED `skills` field, which
`CharacterSnapshotSchema.safeParse` now rejects. All share a single root
cause: missing `skills` field on snapshot literals.

The four pre-existing round-trip tests within `packages/foundry-module`
that were temporarily RED at the start of Plan 17-02 (CR-DS-4 /
CHRD-INV-4 / CHRD-SPL-5 / CR-AB-5) all flipped GREEN with Task 2 — those
were the within-package signal of the Plan 17-01 schema gate; the
downstream packages (g2-app / bridge / foundry-mcp) still need their
snapshot literals byte-extended with the `skills` field. Plan 17-03 closes
this gap atomically alongside the renderer + INV-1 fixture changes.

## Forward pointers — what Plan 17-03 must close

### Renderer half of SHEET-09 + SHEET-10 (consumer)

- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` —
  `renderSkillsTab(snapshot, locale)` must replace the hardcoded
  `DEFAULT_SKILLS` array with `SKILL_KEYS.map(k => ({ ...SKILL_NAMES[k],
  ability: snapshot.skills[k].ability, profLevel: <half-prof-round-up
  via 0.5→1>, modifier: snapshot.skills[k].total }))`. Half-prof glyph
  round-up: `proficient === 0.5 ? 1 : proficient as ProfLevel` → render
  as `◉` per UI-SPEC §3.
- `renderMainTab` senses line (row 17): replace `Sensi  —` /
  `Senses  —` placeholders with
  `Sensi  PP {prc.passive} · PI {ins.passive} · IND {inv.passive}` (IT)
  / `Senses  PP {prc.passive} · INS {ins.passive} · INV {inv.passive}`
  (EN) / DE per `i18n-budgets.ts` abbreviations.
- `SKILL_NAMES` static const map (it/en/de) extracted from existing
  `DEFAULT_SKILLS` string literals (renderer-side i18n — plugin-side
  has no Foundry runtime).

### Test fixtures that need byte-update (17+ downstream snapshot literals)

All snapshot literals in failing tests must add the new `skills` field
(simplest: spread a canonical 18-skill default or import a helper from
`shared-protocol/src/payloads/character.test.ts`'s `VALID_SKILLS`).
Specifically (Phase 16 precedent surface):

- `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts`:
  `snapshot2014` and `snapshot2024` literals — carry the Thorin Lv8
  fighter spread per CONTEXT §Specifics so the existing `sheet.skills.it.txt`
  fixture remains byte-identical after the renderer swap.
- `packages/g2-app/src/panels/__tests__/inventory-panel.test.ts`,
  `spellbook-panel.test.ts`, `status-hud/__tests__/status-hud-layer.test.ts`,
  `__tests__/04b-integration-smoke.test.ts`,
  `__tests__/scene-renderer-smoke.test.ts`: minimal zero-default skills
  suffices (these tests don't assert skill rendering).
- `packages/bridge/src/server.test.ts`: minimal zero-default skills on
  the mock character snapshot.
- `packages/foundry-mcp/src/resources/ws-subscription.test.ts`: cases
  needing the cached snapshot fixtures.

A small reusable `defaultSkillsFixture()` helper in a shared test-utils
location (or inline) avoids duplicating the 18-key Thorin spread across
~17 test files.

### INV-1 fixtures

- `packages/shared-render/src/fixtures/sheet.skills.it.txt` — should
  remain byte-identical (existing fixture matches DEFAULT_SKILLS Thorin
  spread; dynamic-lookup swap preserves rendered output). VERIFY via
  fixture round-trip post-renderer-swap.
- `packages/shared-render/src/fixtures/sheet.skills.en.txt` — **NEW**
  fixture (EN locale parallel to IT, per INV-1 coverage parity with
  Main tab which already has both `sheet.main.2014.it.txt` and
  `sheet.main.2014.en.txt`).
- `packages/shared-render/src/fixtures/sheet.main.{2014.it,2024.it,
  2014.en,2014.de}.txt` row 17 — senses line byte-update (CONTEXT D-Area-3).

### INV-3 atomic ratification commit

Plan 17-03 final commit must touch:
- `.planning/STATE.md` (advance plan counter; current plan = 17-03)
- `.planning/ROADMAP.md` (Phase 17 ✅ + N/N plans complete)
- `.planning/REQUIREMENTS.md` (SHEET-08 + SHEET-09 + SHEET-10 → Resolved)
- `.planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-VERIFICATION.md`
  (5 SC verified — happy-path, fresh-actor, half-prof, expertise,
  passive divergence)

Phase 14 `3a0c5cf` / Phase 15 `dc161d6` / Phase 16 `d68d7f2` precedent —
single atomic commit closes the milestone gate.

**Note:** Plan 17-02 did NOT touch `Specs.md`. Phase 17 close does NOT
bump the `Specs.md` version (atomic per phase, milestone-close bump is
conventionally Phase 18 per CONTEXT §Claude's Discretion). Plan 17-03
should NOT bump `Specs.md` either — but it MAY update §7.5.3 mockup if
the actual ASCII output differs from the in-spec ASCII at byte level
after the fixtures are regenerated.

## Self-Check: PASSED

- ✓ Two commits exist in git log: `c19320c` (RED) + `54e577e` (GREEN)
- ✓ `packages/foundry-module/src/readers/character-reader.ts` contains:
  - `const SKILL_DEFAULT_ABILITY` static map at line 376 (18-key, no CON-based)
  - `function zeroSkills` at line 409
  - `function readSkill` at line 445
  - `function extractSkills` at line 492
  - `skills: extractSkills(actor)` in `getCharacterSnapshot` return at line 585
  - Type imports `AbilityKey, Skill, SkillKey, Skills` from `@evf/shared-protocol`
  - Value import `SKILL_KEYS` from `@evf/shared-protocol`
- ✓ `packages/foundry-module/src/readers/readers.test.ts` contains:
  - `type SkillMockShape` (line 113)
  - `type SkillMockKey` (line 121, 18-key dnd5e canonical)
  - `skills` override on `makeActor` (line 177)
  - `skillsField` system passthrough (lines 191-196)
  - `thorinSkills()` inline fixture (line 805)
  - 6 CR-SK-* tests in dedicated section (CR-SK-1..6) at lines 828-995
- ✓ `packages/foundry-module/src/types/foundry-globals.d.ts` contains:
  - `interface Dnd5eSkillRaw` at line 258
  - `Dnd5eActorSystem.skills?` optional field at line 306
- ✓ Full `@evf/foundry-module` test suite: 474 passing, 0 failing
- ✓ `readers.test.ts`: 123 passing (117 baseline + 6 new = 123, 0 failing)
- ✓ typecheck (foundry-module scope): exit 0
- ✓ shared-protocol regression: 347/347 passing (unchanged from Plan 17-01)
- ✓ Biome formatter exit 0 on all 3 modified files
- ✓ G5a per-occurrence count = 6 (deviation 1 documented)
- ✓ G5b SKILL_DEFAULT_ABILITY grep = 7 (≥ 4 expected)
- ✓ G5c `raw?.passive` read-through grep = 1 (≥ 1 expected)
- ✓ G6a non-JSDoc write-path grep returns no matches (only JSDoc line 7)
- ✓ G6b CI Gate 8 socketlib count = 17 preserved
- ✓ No modification to `.planning/STATE.md` or `.planning/ROADMAP.md` in
  this plan's commits (orchestrator-level STATE.md change pre-existed and
  stays unstaged for Plan 17-03)
- ✓ Workspace-wide failures (17+ expected) are the atomic-extension gap
  that Plan 17-03 closes; foundry-module-local round-trip tests already
  flipped GREEN
