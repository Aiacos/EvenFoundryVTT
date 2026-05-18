# Roadmap: EvenFoundryVTT (EVF)

## Milestones

- ✅ **v0.9.11 MVP** — Phases 0–13 (shipped 2026-05-17). Full details: [`milestones/v0.9.11-ROADMAP.md`](milestones/v0.9.11-ROADMAP.md)
- ✅ **v0.9.12 Quick Wins** — Phases 14–15 (shipped 2026-05-17 · 2 phases · 8/8 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.12-ROADMAP.md`](milestones/v0.9.12-ROADMAP.md)
- 🚧 **v0.9.13 Sheet Data Completion + Polish** — Phases 16–18 (in planning · 3 phases · ~7 plans estimate · 9/9 v1 REQ-IDs scoped · software-only · 0 new hardware-pending SCs)

## Phases

<details>
<summary>✅ v0.9.11 MVP (Phases 0–13) — SHIPPED 2026-05-17 · 71/71 plans · 2,097 tests · 48/48 v1 REQ-IDs software-complete</summary>

MVP scope = Phase 0 → 10. V2 OPZIONALE = Phase 11 → 13 (shipped early). Full details in archive.

- [x] **Phase 0: Validation Gates** (4/4 plans) — ADR-0005 PROVISIONAL Branch A `human_needed` for hardware-pending SCs
- [x] **Phase 1: Foundation** (3/3) — monorepo + Biome + TS strict + Vitest + ADRs 0001–0008
- [x] **Phase 2: Foundry Module Core + Pairing UI** (5/5) — module.json + readers + WS handshake + locale + QR pairing
- [x] **Phase 3: Bridge Service Skeleton** (5/5) — Fastify + ws + bearer + Tool Registry + healthz/readyz/metrics
- [x] **Phase 4a: G2 Engine + Raster + Status HUD** (6/6) — layered raster pipeline + persistent status HUD; ADR-0009 ACCEPTED
- [x] **Phase 4b: Overlay Slot + Map Mode + Adversarial UI** (6/6) — overlay panel API + toast queue + boot errors + death-saves + concentration-drop; ADR-0009 Amendment 1
- [x] **Phase 5: Panel Plugin System + Read-Only Panels** (6/6) — 6-tab Sheet + Combat tracker + Log/Inv/Spellbook + dual-edition + i18n
- [x] **Phase 6: R1 Integration + Quick Action + INV-5** (4/4) — R1 routing + Quick Action menu; **INV-5 Gesture Determinism ratified**
- [x] **Phase 7: Foundry Module Write Path** (6/6) — socketlib.executeAsGM single-workflow-origin; ADR-0011 ACCEPTED; 14-handler invariant
- [x] **Phase 8: Manual Action UX** (5/5) — tap-to-cast + tap-to-use + Quick-action bar + action-result toasts
- [x] **Phase 9: Action Economy & Edge Cases** (5/5) — Action/Bonus/Reaction enforcement + slot consumption + concentration handling
- [x] **Phase 10: Polish & Field Test MVP** (5/5) — WsReconnect + PerfProbe + INV-1..5 verification suite + 5 MVP docs · **MVP SOFTWARE-COMPLETE**
- [x] **Phase 11: V2 `foundry-mcp` Server** *(OPZIONALE)* (4/4) — MCP SDK 1.29.0 + Streamable HTTP + 4 resources + Claude Desktop config
- [x] **Phase 12: V2 Voice UX Tuning** *(OPZIONALE)* (3/3) — GM-Agent prompt + worked examples + IT↔EN STT spell-name lookup
- [x] **Phase 13: V2 Stretch** *(OPZIONALE)* (4/4) — ACT-04 reaction execution + STRETCH-06 portrait (flag-gated); 7 STRETCH items deferred

</details>

<details>
<summary>✅ v0.9.12 Quick Wins (Phases 14–15) — SHIPPED 2026-05-17 · 8/8 plans · 9/9 v1 REQ-IDs · software-only</summary>

Two atomic software-only phases shipped end-to-end. Zero new hardware-gated SCs (35 `human_needed` SCs carry from v0.9.11 under ADR-0005 Branch A unchanged). CI Gate 8 socketlib handler count = 17 preserved end-to-end. Full details in archive.

- [x] **Phase 14: Raster z=0.5 Idle Content Infill** (3/3 plans) — z=0.5 layer ratified via INV-1 fixtures + ADR-0001 Amendment 1 + INV-3 atomic commit 3a0c5cf
- [x] **Phase 15: Deepgram Keyterm Prompting + Entity-Pack Integration** (5/5 plans) — Nova-3 `keyterm` parameter wired; static SPELL_KEYTERMS + dynamic EntityPackCache union; debounce 250ms + mutex hot-update via `/internal/delta`; INV-3 atomic commit dc161d6

</details>

### v0.9.13 Sheet Data Completion + Polish (active)

Three software-only phases to complete the Character Sheet panel's data wiring (Main + Skills tabs) and close the Phase-14.1 spec-prose drift carry-forward. Zero new hardware-gated SCs (35 `human_needed` SCs from v0.9.11 carry under ADR-0005 Branch A unchanged). CI Gate 8 socketlib handler count = **17 preserved end-to-end** — both Sheet phases are pure read-path extensions, no new socketlib handlers. Each phase closes with a single INV-3 atomic commit (Specs.md + README + showcase + ADR-amendment-if-any + STATE.md + ROADMAP.md + VERIFICATION.md). Phase 14/15 patterns are the canonical examples.

- [ ] **Phase 16: Sheet Ability Scores (Main tab data wiring)** (~3 plans) — `CharacterSnapshotSchema.abilities` extension + `character-reader.ts` ability read + `renderMainTab()` data binding replacing `dash` placeholders; INV-1 fixtures updated; INV-3 atomic ratification commit
- [ ] **Phase 17: Sheet Skills Tab (Skills tab data wiring)** (~3 plans) — `CharacterSnapshotSchema.skills` extension (18 keys × `{total, ability, proficient, passive}`) + `character-reader.ts` skill read + `renderSkillsTab()` data binding with proficiency glyphs (○/◉/◈); INV-1 fixtures updated; INV-3 atomic ratification commit
- [ ] **Phase 18: Phase-14.1 Spec-Drift Polish** (~1–2 plans) — UI-SPEC §2 col-anchor reconciliation (col 71 → col 68) + §10 width-budget table aligned to fixture bytes + IT locale leak fix in `glyph-scene.glyph-idle-z05.it.txt` rows 1/17 + Z05-INV-02b triade IT extension; single INV-3 atomic commit

## Phase Details

### Phase 16: Sheet Ability Scores (Main tab data wiring)

**Goal:** Player opens Sheet → Main tab and sees real ability scores (STR 16 +3, DEX 14 +2, …) with proficiency markers (◉ / ○) on saving throws, instead of `—` placeholders. Spec §7.5.2 mockup honored end-to-end via Foundry read pipeline.

**Depends on:** v0.9.11 Phase 5 (6-tab Sheet panel + `character-sheet-tab-renderers.ts` + `CharacterSnapshotSchema` baseline operational); dnd5e 5.3.x canonical `actor.system.abilities.<k>.{value, mod, save.value, proficient, dc}` schema (INV-2 cross-checked 2026-05-18 via `github.com/foundryvtt/dnd5e` release-5.3.3 `module/data/actor/templates/common.mjs` + dnd5e wiki Roll-Formulas)

**Requirements:** SHEET-05, SHEET-06, SHEET-07

**Success Criteria** (what must be TRUE):
  1. Player Sheet → Main tab shows 6 real ability values (STR/DEX/CON/INT/WIS/CHA) sourced from `actor.system.abilities.<k>.value` instead of `—` placeholders
  2. Each ability row shows its modifier formatted `+N` / `-N` from `actor.system.abilities.<k>.mod`
  3. Each ability row shows its saving throw modifier formatted `+N` / `-N` from `actor.system.abilities.<k>.save` with `◉` proficiency marker when `proficient === 1` and `○` otherwise
  4. `CharacterSnapshotSchema` extended with `abilities` field (6 sub-objects each `{value, mod, save, proficient, dc}`); reader validates and emits the new field; all existing 6-tab snapshot tests remain green
  5. INV-1 fixtures updated for Main tab character-sheet state (IT + EN locales) with real ability numbers replacing placeholders; UI-SPEC §5.2 cross-reference unchanged

**Plans:** TBD (estimated 3 — shared-protocol schema + tests · character-reader read + tests · renderMainTab binding + INV-1 fixture + INV-3 atomic ratification commit)

### Phase 17: Sheet Skills Tab (Skills tab data wiring)

**Goal:** Player opens Sheet → Skills tab and sees real skill modifiers (◉ Acrobatics +5, ○ Animal Handling +1, …) with proficiency glyphs (○ / ◉ / ◈ for none / proficient / expert), instead of mockup placeholders. Spec §7.5.3 mockup honored end-to-end. Passive Perception/Insight/Investigation values surface on the Main tab senses line as a side-benefit.

**Depends on:** Phase 16 (abilities snapshot field already present — the skills snapshot extends the schema as a sibling field; skill modifier computation visibility depends on abilities being correctly wired); dnd5e 5.3.x canonical `actor.system.skills.<k>.{total, ability, proficient, passive}` schema (INV-2 cross-checked 2026-05-18)

**Requirements:** SHEET-08, SHEET-09, SHEET-10

**Success Criteria** (what must be TRUE):
  1. Player Sheet → Skills tab shows 18 real skill modifiers sourced from `actor.system.skills.<k>.total` formatted with sign (`+N` / `-N`) instead of mockup placeholders
  2. Each skill row carries the correct proficiency glyph: `○` for `proficient === 0`, `◉` for `proficient === 1`, `◈` for `proficient === 2` (expert); half-proficient (`0.5`) rendered per UI-SPEC width-budget (deferred to plan if narrative glyph not achievable within INV-1)
  3. Main tab senses line surfaces passive Perception / Insight / Investigation from `actor.system.skills.{prc,ins,inv}.passive` (side-benefit of skills snapshot — replaces remaining `—` placeholder on senses line)
  4. `CharacterSnapshotSchema` extended with `skills` field (18 sub-objects keyed by dnd5e short code); reader validates and emits the new field; all existing snapshot tests remain green
  5. INV-1 fixtures updated for Skills tab state (IT + EN locales) with real skill data; width-budget preserved (3-char modifier column + 1-char glyph + skill name); UI-SPEC §5.3 cross-reference unchanged

**Plans:** TBD (estimated 3 — shared-protocol schema + tests · character-reader read + tests · renderSkillsTab binding + INV-1 fixtures + INV-3 atomic ratification commit)

### Phase 18: Phase-14.1 Spec-Drift Polish (single INV-3 atomic)

**Goal:** Close 3 UI-REVIEW WR-UI findings from Phase 14 (col-anchors drift, width-budget drift, IT locale leak in glyph-idle-z05 fixture) in a single INV-3 atomic commit. Mostly doc + 1 fixture edit + 1 test extension; zero implementation defects to fix. Brings UI-SPEC numeric tables back into byte-identity with the actual fixtures shipped in Phase 14.

**Depends on:** Phase 14 (UI-SPEC §2/§10 + `glyph-scene.glyph-idle-z05.it.txt` fixture + Z05-INV-02b test already shipped via 3a0c5cf); 14-UI-REVIEW findings WR-UI-01/02/03 (advisory non-blocking, deferred at close). Parallelizable with Phase 16/17 in principle, but conventionally sequenced last for cleaner milestone close.

**Requirements:** INFILL-14.1-A, INFILL-14.1-B, INFILL-14.1-C

**Success Criteria** (what must be TRUE):
  1. UI-SPEC §2 spacing token table cites `right-stop (z=0.5) = col 67` and `content-width (z=0.5 strip) = 64 cells (col 4 → col 67 inclusive)` with one-line note explaining central divider `║` lands at col 68 (matches actual fixture bytes)
  2. UI-SPEC §10 width-budget table re-derived from `idle-infill-layer.ts` constants — label container width-budget aligns to fixture bytes (~52 cells), stats container width-budget aligns to fixture bytes (~54 cells); spec table no longer drifts from runtime literals
  3. `packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` row 1 reads `TURNO 2/5` (IT) and row 17 reads `Condizioni` (IT) — both with width-budget preserved to 96-col fixture invariant
  4. Z05-INV-02b extended to triade A_it ↔ B_it ↔ C_it byte-identity check on rows 3..20 cols 69..95 (closes the regression-detection gap that allowed WR-UI-03 to pass CI)
  5. All changes land in a single INV-3 atomic commit (UI-SPEC + Specs.md cross-ref if needed + fixture + test + STATE.md + ROADMAP.md + VERIFICATION.md); workspace suite green at exit; CI Gate 8 socketlib count = 17 preserved

**Plans:** TBD (estimated 1–2 — UI-SPEC §2/§10 correction + IT locale leak fix + Z05-INV-02b triade IT extension all in INV-3 atomic commit; optional second verification commit)

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.9.11 MVP | 15 (0–13) | 71/71 | ✅ Shipped | 2026-05-17 |
| v0.9.12 Quick Wins | 2 (14–15) | 8/8 | ✅ Shipped | 2026-05-17 |
| v0.9.13 Sheet Data Completion + Polish | 3 (16–18) | 0/~7 | 🚧 In planning | — |

---
*Last reorganized: 2026-05-18 — v0.9.13 Sheet Data Completion + Polish opened (3 phases 16–18, ~7 plans estimate, 9/9 v1 REQ-IDs scoped, software-only). v0.9.11 + v0.9.12 archives preserved under collapsed details blocks.*
