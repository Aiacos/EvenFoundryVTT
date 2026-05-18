# Phase 16: Sheet Ability Scores (Main tab data wiring) - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous), 4 grey areas accepted-all on Phase 4b/5 precedent

<domain>
## Phase Boundary

Player opens Sheet → Main tab and sees real ability scores (STR 16 +3, DEX 14 +2, …) with proficiency markers (◉ / ○) on saving throws, instead of `—` placeholders. Spec §7.5.2 mockup honored end-to-end via Foundry read pipeline.

End-to-end scope: `CharacterSnapshotSchema` extension → `character-reader.ts` extension → `renderMainTab()` data binding → INV-1 fixtures byte-updated (IT + EN locales for 2014 + 2024 editions) → INV-3 atomic ratification commit (Specs.md cross-ref + README + showcase if any + STATE.md + ROADMAP.md + VERIFICATION.md).

**Explicitly out of scope this phase** (deferred to later phases or unchanged this milestone):
- INI, VEL, Hit Dice values on the Main tab vitals row — kept as `—` (not ability fields; come from `attributes.init.total`, `attributes.movement.walk`, `attributes.hd.value`).
- Passive Perception/Insight/Investigation on the senses line — deferred to Phase 17 (SHEET-10 sub-criterion explicitly puts passives in skills snapshot consumption).
- Skills tab data binding — Phase 17.
- Half-proficient (`0.5`) handling — Main tab only needs boolean; Phase 17 will add the full glyph spectrum (○/◉/◈) and half-tone treatment if achievable within INV-1 width budget.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Schema field shape (`abilities`)

- **Nested keyed by ability code** — `abilities.{str,dex,con,int,wis,cha}` sub-objects, mirroring dnd5e `actor.system.abilities.*` shape and the existing `SpellSlotSchema`/`DeathSavesSchema` patterns. Renderer indexes by key without re-mapping.
- **Per-ability shape:** `{value: number, mod: number, save: number, proficient: boolean, dc: number}` — all plain numbers (dnd5e prep-time computes the values; we read computed totals, not formulas).
- **Include `dc` field** per REQ-05 spec. Cheap to emit; primes Spells tab DC binding without a follow-up schema bump.
- **`z.object` (forward-compat), not `z.strictObject`** — matches `WorldStateSchema`/`InventoryItemSchema` precedent. Allows Phase 17 to extend with half-prof / expertise fields without re-bumping the top-level `CharacterSnapshotSchema` strict gate.
- **Top-level field NOT optional** — atomic extension per ADR-0002 Phase 2 (Pitfall 3 mitigation: no `.optional()` drift window). Reader emits the field every time; defensive defaults on fresh actors.

### Area 2: Reader defensive behavior (`extractAbilities`)

- **Separate helper function** `extractAbilities(actor): CharacterSnapshot['abilities']` in `character-reader.ts`, mirroring `extractInventory`/`extractSpellbook` precedent.
- **Defensive defaults on missing `actor.system.abilities`** (fresh actor, dnd5e prep not run): emit 6 zero-defaults `{value: 10, mod: 0, save: 0, proficient: false, dc: 10}` per ability. Matches Phase 4b death-saves defensive nullish-coalesce; never returns `null` for the field.
- **`proficient === 1` → `true` coercion** per REQ-06. dnd5e `proficient` is `0 | 0.5 | 1 | 2`; for Main tab boolean, both `0` and `0.5` (half-prof) become `false`, both `1` and `2` (expert) become `true`. Phase 17 will introduce the full numeric for the Skills tab (which needs the glyph spectrum).
- **Read `save.value`** for the save modifier (dnd5e prep-time computed total), NOT recomputed from base+prof. INV-2 cross-check 2026-05-18 confirmed canonical `actor.system.abilities.<k>.save.value`.
- **Read order:** value → mod → save.value → proficient → dc, each with defensive nullish-coalesce per field (defends against the same nullish-coalesce pattern Phase 4b used for `attributes.death`).

### Area 3: Renderer width budget (`renderMainTab`)

- **In-place dash replacement** — existing layout `│ FOR  —  —          │` already budgets 2 cells for value + 1 cell separator + 2 cells for mod. Replace with `│ FOR 16 +3          │` (value zero-pad-2, mod signed `+N`/`-N` 3-wide). Width invariant preserved — no row-count or column-anchor change.
- **Saves column same:** `│ ◉ FOR  —    DES  — │` → `│ ◉ FOR  +5    DES  +2 │`. Glyph at col 3 unchanged; `+N`/`-N` formatted save.value at the dash slot. Proficient glyph `◉` when `proficient === true`, `○` otherwise.
- **Vitals row INI/VEL/Hit Dice — keep `—`** for now. These come from `attributes.init.total`, `attributes.movement.walk`, `attributes.hd.value` — not ability fields, outside REQ-IDs for Phase 16.
- **Senses line `Sensi  —` — keep `—`** for now. Phase 17 SHEET-10 sub-criterion fills passive Perception/Insight/Investigation from `skills.{prc,ins,inv}.passive`.

### Area 4: Test fixtures & snapshots

- **`VALID_SNAPSHOT` in `packages/shared-protocol/src/payloads/character.test.ts` extended** with the new `abilities` field (canonical sample). All `CS-DS-*`, `CS-IV-*`, `CS-SP-*` tests rebase on the extended canonical without behavior change.
- **`snapshot2014` / `snapshot2024` in `character-sheet-tab-renderers.test.ts` updated** to carry the Thorin Oakenshield spec-§7.5.2 ability scores: STR 16 mod +3 save +5 prof, DEX 14 mod +2 save +2 not-prof, CON 14 mod +2 save +5 prof, INT 18 mod +4 save +4 not-prof, WIS 12 mod +1 save +1 not-prof, CHA 8 mod −1 save −1 not-prof. Prof bonus +2 for Lv 8 → `save = mod + 0` for not-prof, `save = mod + prof` for prof.
- **Existing fixtures `sheet.main.2014.it.txt`, `sheet.main.2024.it.txt`, `sheet.main.2014.en.txt`, `sheet.main.2014.de.txt` updated byte-by-byte** with real numbers in place of dashes (per SC#5 INV-1 acceptance criterion). +0 new fixtures.
- **Test naming `CS-AB-*`** following Phase 4b `CS-DS-*` precedent. Specific cases: CS-AB-1 happy-path 6 abilities parse; CS-AB-2 missing field rejected (REQUIRED); CS-AB-3 negative mod (Cha 8 → −1) parses; CS-AB-4 dc validation (≥ 0); CS-AB-5 proficient strict-boolean enforced; CS-AB-6 extra sibling field on `abilities.str` accepted (z.object forward-compat); CS-AB-7 type inference compiles.
- **Reader tests** `CR-AB-*` in `readers.test.ts` (existing test file): CR-AB-1 dnd5e canonical → snapshot abilities parse; CR-AB-2 missing `actor.system.abilities` → defensive defaults emitted; CR-AB-3 `proficient: 0.5` → false (half-prof coercion); CR-AB-4 `proficient: 2` → true (expert coercion).

### Claude's Discretion

- Specific test count beyond the CS-AB-1..7 / CR-AB-1..4 baseline (more edge cases at execution discretion if a corner case surfaces).
- Plan wave breakdown (likely 3 plans: shared-protocol schema · character-reader extension · renderer + fixtures + INV-3 atomic ratification).
- Whether to bump `Specs.md` v0.9.12 → v0.9.13 in Phase 16 close or defer to Phase 18 close (likely defer — Phase 18 is conventionally the milestone-close commit per plan).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared-protocol/src/payloads/character.ts:228` — `CharacterSnapshotSchema` (`z.strictObject`); extend with new `abilities` field.
- `packages/shared-protocol/src/payloads/character.test.ts` — canonical `VALID_SNAPSHOT` test base with CS-DS-*, CS-IV-*, CS-SP-* prior test markers; extend with abilities sample.
- `packages/foundry-module/src/readers/character-reader.ts:265` — `getCharacterSnapshot(actorId)` producer; add `extractAbilities` helper next to `extractInventory`/`extractSpellbook`.
- `packages/foundry-module/src/readers/readers.test.ts` — existing CR-IV-*, CR-SP-* markers; extend with CR-AB-*.
- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts:192` — `renderMainTab(snapshot, locale)` consumer; replace `dash` with `snapshot.abilities.<k>.{value, mod, save}`.
- `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts` — INV-1 round-trip CSTR-FIX-MAIN-2014/2024 fixture tests; update `snapshot2014`/`snapshot2024` with Thorin abilities.
- `packages/shared-render/src/fixtures/sheet.main.2014.{it,en,de}.txt` + `sheet.main.2024.it.txt` — 4 INV-1 fixtures to byte-update.

### Established Patterns
- **Atomic schema extension** (no `.optional()` drift window): Phase 4b `DeathSavesSchema` + Phase 5 inventory/spells. Schema + reader + consumer + fixtures all land in the same commit (or commit chain) — never half-extended.
- **Defensive nullish-coalesce** in reader: `(actor.system.abilities?.<k>?.value as number | undefined) ?? 10` — fresh actor / missing prep returns sane defaults, never throws.
- **CS-XX-* / CR-XX-* / CSTR-FIX-* test markers** — discoverable through grep; new section gets its own 2-letter mnemonic (`AB` for abilities).
- **`z.object` for forward-compat sub-objects** (`WorldStateSchema`, `InventoryItemSchema`, `SpellbookSchema`), `z.strictObject` reserved for top-level frozen contracts.
- **Width-budget invariant** in renderer: existing dash placeholders already occupy the target cells; replacement is byte-identical width.
- **Fixture-driven INV-1 snapshot tests** via `loadFixture('sheet.main.2014.it.txt')` + `normaliseRows()` comparator.

### Integration Points
- `@evf/shared-protocol` re-exports `CharacterSnapshotSchema` + `CharacterSnapshot` type via `index.ts:41`; consumers (`@evf/foundry-module` reader · `@evf/g2-app` renderer · `@evf/bridge` cache) all pick up the field automatically once schema is bumped.
- `@evf/bridge` `CharacterSnapshotCache` consumes the field passively — no bridge code changes required (full-replacement delta per ADR-0002 Phase 2).
- INV-3 atomic ratification commit pattern from Phase 14 (`3a0c5cf`) + Phase 15 (`dc161d6`): single commit touches Specs.md cross-ref (if any) + README + showcase + STATE.md + ROADMAP.md + VERIFICATION.md.

</code_context>

<specifics>
## Specific Ideas

- **Thorin Oakenshield ability spread** (spec §7.5.2 mockup canonical character):
  - STR 16 mod +3 save +5 PROF
  - DEX 14 mod +2 save +2
  - CON 14 mod +2 save +5 PROF
  - INT 18 mod +4 save +4
  - WIS 12 mod +1 save +1
  - CHA  8 mod −1 save −1
  - Prof bonus +2 (Lv 5–8 progression). Prof on STR and CON saves (Fighter class).
- **Schema sub-object shape** `z.object({ value: z.number().int().min(0).max(30), mod: z.number().int(), save: z.number().int(), proficient: z.boolean(), dc: z.number().int().min(0) })` — bounds keep ability `value` in standard 0–30 range, allow negative `mod`/`save` (Cha 8 = −1).
- **INV-3 atomic** — Phase 16 close does NOT bump `Specs.md` version (atomic per phase, milestone-close bump is conventionally in Phase 18). It DOES update the §7.5.2 mockup if the actual ASCII output differs from the in-spec ASCII at byte level.
- **No bridge cache changes** — full-replacement delta; cache passes through unchanged.
- **No socketlib handler count change** — CI Gate 8 invariant 17-handler count preserved (read-path extension only).

</specifics>

<deferred>
## Deferred Ideas

- INI / VEL / Hit Dice values on Main tab vitals row — deferred until a future "vitals data binding" task (not in v0.9.13 scope).
- Senses line passives (Perception/Insight/Investigation) — Phase 17 SHEET-10 sub-criterion.
- XP bar value — out of scope (no REQ-ID).
- Race/Class line beyond `Lv N` — out of scope (no REQ-ID; depends on `actor.system.details.race` / class items aggregation).
- Spells tab DC binding — primed by the new `abilities.<k>.dc` field but the actual Spells tab DC binding is its own task in a future milestone (per REQUIREMENTS.md Out of Scope).

</deferred>
