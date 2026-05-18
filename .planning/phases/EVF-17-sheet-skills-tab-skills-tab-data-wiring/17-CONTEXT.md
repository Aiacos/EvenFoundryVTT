# Phase 17: Sheet Skills Tab (Skills tab data wiring) - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous), 4 grey areas accepted-all on Phase 16 atomic-extension precedent

<domain>
## Phase Boundary

Player opens Sheet → Skills tab and sees real skill modifiers sourced from the live Foundry actor (replacing the hardcoded `DEFAULT_SKILLS` table currently in the renderer). Spec §7.5.3 mockup honored end-to-end via the same Foundry read pipeline used by Phase 16 abilities. Side-benefit: Main tab senses line surfaces passive Perception/Insight/Investigation per SHEET-10 sub-criterion.

End-to-end scope: `CharacterSnapshotSchema.skills` extension (18 keys × `{total, ability, proficient, passive}`) → `extractSkills` reader helper → renderer dynamic lookup (replacing static `DEFAULT_SKILLS`) → Main tab senses line passive integration → INV-1 fixtures `sheet.skills.it.txt` byte-update + new `sheet.skills.en.txt` + Main tab senses line in 4 sheet.main fixtures → INV-3 atomic ratification commit.

**Explicitly out of scope:**
- Skill bonuses beyond `total` (item/feat/feature bonus inspection) — `skills.<k>.total` already includes them per dnd5e prep-time computation.
- Skill saving throws (not a dnd5e concept; ability saves only — handled by Phase 16).
- Skill detail expansion / ability hover info — current renderer shows compact list + glyph + modifier; UX unchanged.
- Inventory or spell tab changes — outside REQ-IDs.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Schema field shape (`skills`)

- **Keyed object** by 18 dnd5e skill codes (`acr/ani/arc/ath/dec/his/ins/itm/inv/med/nat/prc/prf/per/rel/slt/ste/sur`), mirroring Phase 16 `abilities` precedent. Renderer indexes by key.
- **Per-skill shape** exactly per REQ-08: `{total: number, ability: AbilityKey, proficient: 0 | 0.5 | 1 | 2, passive: number}`. No bonuses/mod expansion — `total` includes them.
- **`proficient` numeric `0 | 0.5 | 1 | 2`** preserved (not boolean) — needed for the ○/◉/★ glyph spectrum and half-proficient handling. Phase 16 abilities used boolean coercion (Main tab is binary); Phase 17 skills need the full spectrum.
- **`ability` field as `AbilityKey` enum** (`z.enum(['str','dex','con','int','wis','cha'])`) — re-uses the type from Phase 16's `AbilityScoreSchema`. Compile-time safety for renderer grouping (skills grouped by ability column).
- **`SkillSchema` exported as a named schema** alongside `SkillsSchema` (object of 18 keys, like Phase 16's `AbilitiesSchema`). Renderer imports `SkillKey` type for compile-safety in static name tables.
- **`SKILL_KEYS` const tuple exported** listing the 18 codes in canonical dnd5e order (for renderer iteration + i18n table coverage tests).

### Area 2: Reader behavior (`extractSkills`)

- **Separate helper function** `extractSkills(actor): CharacterSnapshot['skills']` in `character-reader.ts`, mirroring `extractAbilities`/`extractInventory`/`extractSpellbook` precedent.
- **Defensive defaults on missing `actor.system.skills`**: 18 sub-objects each `{total: 0, ability: <canonical-ability-default per skill>, proficient: 0, passive: 10}`. Each skill's canonical ability default per dnd5e (e.g., acr → dex, arc → int, prc → wis). Static table `SKILL_DEFAULT_ABILITY` defined alongside `SKILL_KEYS`.
- **Read `skills.<k>.total`** for the modifier (dnd5e prep-time computed) — includes ability + prof + bonuses. NOT `.mod` (which excludes bonuses).
- **Read `skills.<k>.passive`** directly (dnd5e prep-time computed; per INV-2 cross-check 2026-05-18).
- **`proficient` passes through verbatim** as `0 | 0.5 | 1 | 2` — Zod schema validates the closed enum.
- **Read order:** total → ability → proficient → passive, each with defensive nullish-coalesce.

### Area 3: Renderer wiring (`renderSkillsTab` + senses line)

- **Replace `DEFAULT_SKILLS` hardcoded array** with dynamic lookup: `Object.entries(snapshot.skills)` → group by ability → render rows. The shape `{nameIt, nameEn, nameDe, abilityLabel, profLevel, modifier}` is built from `(name catalog) + (snapshot data)`.
- **Static `SKILL_NAMES` table** in renderer (it/en/de) keyed by `SkillKey`. Renderer-side i18n because plugin-side has no Foundry runtime; static table is the only viable approach. Existing `DEFAULT_SKILLS` array already has these strings — extract them into `SKILL_NAMES` const map.
- **Glyph map keeps existing `PROF_GLYPHS = {0: '○', 1: '◉', 2: '★'}`** (shipped Phase 5 contract). REQ-10 mentioned `◈` but the actual rendered glyph is `★`; treat REQ spec as advisory, shipped contract as authoritative. INV-1 fixture stays byte-identical (no glyph swap).
- **Half-proficient (`proficient === 0.5`) → render as `◉`** (round up). Rationale: half-prof still adds the proficiency bonus; treating as "proficient" is more honest than "untrained" for the glyph. The `total` value already reflects the half-prof bonus; visual binary (○ / ◉ / ★) just identifies presence/strength of proficiency. Document in renderer comment.
- **Main tab senses line:** `Sensi  PP {prc.passive} · PI {ins.passive} · IND {inv.passive}` (IT) / `Senses  PP {prc} · INS {ins} · INV {inv}` (EN). Width-budget check: 66-cell content row gives ~50 chars for the senses content — `Sensi  PP 11 · PI 11 · IND 14` is ~28 chars, well within budget. Replace `Sensi  —` placeholder with the new line.
- **Sort skills** by their canonical dnd5e order (per `SKILL_KEYS` tuple), grouped by ability column (FOR/DES/COS/INT/SAG/CAR). Match existing fixture ordering.

### Area 4: Main tab senses + fixtures + tests

- **Update `snapshot2014`/`snapshot2024` test snapshots** (already extended with abilities in Phase 16) with Thorin canonical skills spread. Match existing `DEFAULT_SKILLS` Thorin spread byte-for-byte so the existing `sheet.skills.it.txt` fixture remains byte-identical after the renderer swap. Add `prc.passive = 11`, `ins.passive = 11`, `inv.passive = 14` for the Main tab senses line.
- **Existing `sheet.skills.it.txt` byte-update unnecessary** — current fixture matches DEFAULT_SKILLS Thorin spread; the dynamic-lookup swap preserves rendered output exactly (Pitfall: verify after implementation via fixture round-trip).
- **NEW fixture `sheet.skills.en.txt`** — EN locale parallel to IT; current renderer supports EN via `getLabel(field, locale)` but no EN fixture exists. Add it for INV-1 coverage parity with Main tab (which has both `sheet.main.2014.it.txt` and `sheet.main.2014.en.txt`).
- **Update 4 `sheet.main.*` fixtures** with the new senses line content (replacing `Sensi  —` / `Senses  —`):
  - `sheet.main.2014.it.txt` row 17: `Sensi  PP 11 · PI 11 · IND 14`
  - `sheet.main.2024.it.txt` row 17: same
  - `sheet.main.2014.en.txt` row 17: `Senses  PP 11 · INS 11 · INV 14`
  - `sheet.main.2014.de.txt` row 17: `Sinne  PP 11 · EIN 11 · NCH 14` (or per existing DE label catalog)
- **Test markers `CS-SK-*`** in shared-protocol character.test.ts following CS-AB pattern. Concrete: CS-SK-1 happy-path 18 skills parse; CS-SK-2 missing field rejected (REQUIRED); CS-SK-3 invalid ability enum value rejected; CS-SK-4 invalid proficient value (e.g., 1.5) rejected; CS-SK-5 passive=10 minimum boundary; CS-SK-6 schema type inference compiles; CS-SK-7 z.object forward-compat (extra sibling on skill sub-object accepted).
- **Test markers `CR-SK-*`** in foundry-module readers.test.ts. CR-SK-1 dnd5e canonical → snapshot skills parse; CR-SK-2 missing actor.system.skills → 18 defensive defaults; CR-SK-3 proficient pass-through (0.5 stays 0.5); CR-SK-4 passive read-through; CR-SK-5 SKILL_DEFAULT_ABILITY mapping correctness.
- **Test markers `CSTR-SKILLS-DATA-*`** in g2-app character-sheet-tab-renderers.test.ts. CSTR-SKILLS-DATA-1 snapshot drives rendered modifiers; CSTR-SKILLS-DATA-2 ★ for expert (proficient === 2); CSTR-SKILLS-DATA-3 0.5 renders as ◉ (half-prof round-up); CSTR-SKILLS-DATA-4 grouping by ability column; CSTR-SKILLS-DATA-5 Main tab senses line populated with passives.

### Claude's Discretion

- Specific count of CS-SK / CR-SK / CSTR-SKILLS-DATA tests beyond the baseline (executor adds edge cases as surface).
- Plan wave breakdown — likely 3 plans matching Phase 16 cadence: schema · reader · renderer + fixtures + INV-3 atomic.
- Whether to add a new INV-1 fixture for the locale-override stress test (existing `locale-override.stress-es.it.txt` may need an update if senses content shifts) — executor discretion.
- Exact DE label for passive abbreviations (PP/EIN/NCH or similar) — confirm via existing `i18n-budgets.ts` DE catalog at execution time.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared-protocol/src/payloads/character.ts` — extend with `SkillSchema`, `SkillsSchema`, `SKILL_KEYS`, `SkillKey`; `CharacterSnapshotSchema.skills` REQUIRED field. Pattern fully mirrors Phase 16's `AbilityScoreSchema`/`AbilitiesSchema`.
- `packages/shared-protocol/src/payloads/character.test.ts` — extend `VALID_SNAPSHOT` with `skills` field (canonical Thorin spread per §7.5.3). CS-DS/CS-IV/CS-SP/CS-AB precedent → CS-SK.
- `packages/foundry-module/src/readers/character-reader.ts` — `extractSkills(actor)` helper next to `extractAbilities` (Phase 16). Wire into `getCharacterSnapshot` return. Phase 16 type extension `Dnd5eActorSystem.abilities?` will be matched by `skills?` addition.
- `packages/foundry-module/src/readers/readers.test.ts` — CR-AB/CR-IV/CR-SP precedent → CR-SK.
- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` — `renderSkillsTab` already exists with `DEFAULT_SKILLS` hardcoded; extract names into `SKILL_NAMES` map, replace hardcoded array with snapshot-driven lookup. `renderMainTab` senses line replacement.
- `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts` — `snapshot2014`/`snapshot2024` extended with `skills` field (matching existing DEFAULT_SKILLS Thorin values for byte-identical fixture round-trip).
- `packages/shared-render/src/fixtures/sheet.skills.it.txt` — existing fixture, byte-identical post-swap (validation only, no edit).
- `packages/shared-render/src/fixtures/sheet.main.{2014.it,2024.it,2014.en,2014.de}.txt` — row 17 senses line update.

### Established Patterns
- Atomic schema extension (no `.optional()`): Phase 4b/5/16 precedent. Schema + reader + consumer + fixtures land atomically.
- Defensive nullish-coalesce in reader: `(actor.system.skills?.<k>?.total as number | undefined) ?? 0`.
- CS-XX-* / CR-XX-* / CSTR-* test markers — 2-letter mnemonics (`SK` for skills).
- Static `SKILL_NAMES` / `SKILL_KEYS` / `SKILL_DEFAULT_ABILITY` const tables in renderer-side TS (no Foundry runtime available plugin-side).
- INV-1 width budget invariant: 66 codepoints per row, `[...str].length` codepoint counting.
- INV-3 atomic ratification commit at phase close: STATE.md + ROADMAP.md + REQUIREMENTS.md + 17-VERIFICATION.md in single commit, Phase 14 3a0c5cf / Phase 15 dc161d6 / Phase 16 d68d7f2 precedent.

### Integration Points
- `@evf/shared-protocol` re-exports `CharacterSnapshotSchema`. Consumers pick up new `skills` field automatically.
- `@evf/bridge` `CharacterSnapshotCache` consumes passively (full-replacement delta per ADR-0002 Phase 2). No bridge code changes.
- 11+ downstream snapshot literals in g2-app/bridge/foundry-mcp test files will need `skills` field extension (same atomic-extension gap pattern as Phase 16; closed in this phase's renderer plan).
- CI Gate 8 socketlib handler count = 17 preserved (read-only extension, no handler changes).

</code_context>

<specifics>
## Specific Ideas

- **Thorin Oakenshield skills spread** (§7.5.3 + existing DEFAULT_SKILLS):
  - STR: Atletica +6 ◉ (prof, ability=str, total=+6, passive irrelevant)
  - DEX: Acrobazia +2 ○, Rapidità di mano +2 ○, Furtività +2 ○ (all not-prof, ability=dex)
  - CON: (no CON-based skills in dnd5e)
  - INT: Arcano +0, Storia +0, Indagare +0, Natura +0, Religione +0 (all not-prof, ability=int)
  - WIS: Addestrare animali +4 ◉, Intuizione +1, Medicina +4 ◉, Percezione +1, Sopravvivenza +1 (3 prof; Insight=+1 not-prof per current fixture; passive Perception = 11, passive Insight = 11)
  - CHA: Inganno +1, Intimidazione +1, Intrattenimento +1, Persuasione +1 (all not-prof, ability=cha)
  - Passive Investigation (INT-based) = 14 (Thorin Lv 8 INT 18 +4 → 10 + 4 = 14)
- **dnd5e 18-skill canonical order:** acr · ani · arc · ath · dec · his · ins · itm · inv · med · nat · prc · prf · per · rel · slt · ste · sur. Maps to: Acrobatics · Animal Handling · Arcana · Athletics · Deception · History · Insight · Intimidation · Investigation · Medicine · Nature · Perception · Performance · Persuasion · Religion · Sleight of Hand · Stealth · Survival.
- **`SKILL_DEFAULT_ABILITY`** static map: acr/ste→dex, ath→str, arc/his/inv/nat/rel→int, ani/ins/med/prc/sur→wis, dec/itm/prf/per→cha (no CON-based skills in 5e).
- **Senses line width:** `Sensi  PP 11 · PI 11 · IND 14` is 30 codepoints, fits the row 17 budget (66 - 30 = 36 cells of trailing space). Same fixture row 17 in 2024.it.txt currently reads `Sensi  —` (8 codepoints + padding).
- **DE locale:** verify exact DE abbreviation in `i18n-budgets.ts` — likely `WN` for Wahrnehmung passive (Perception). Fall back to translation table at execution.
- **INV-3 atomic close commit** touches: STATE.md + ROADMAP.md (Phase 17 ✅ + 2/3 phases) + REQUIREMENTS.md (SHEET-08/09/10 → Resolved) + 17-VERIFICATION.md (5 SC verified). NO Specs.md version bump (reserved for Phase 18 milestone close).
- **No socketlib changes** — CI Gate 8 invariant 17-handler count preserved.

</specifics>

<deferred>
## Deferred Ideas

- Skill detail expansion (tap-to-roll, ability hover) — Phase 18+ if at all; not in v0.9.13 scope.
- Custom skill bonuses inspection — `total` already includes them per dnd5e prep-time.
- Skill saving throws — not a dnd5e concept.
- Skill-based passive senses beyond Perception/Insight/Investigation — not requested.
- Glyph spectrum extension (e.g., separate half-prof `◐` half-tone) — REQ noted as "if achievable within INV-1"; current decision rounds up to `◉` to preserve INV-1; future Phase could add a 4th glyph if width-budget allows.

</deferred>
