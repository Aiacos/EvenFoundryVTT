# Requirements: EvenFoundryVTT (EVF) — v0.9.13 Sheet Data Completion + Polish

**Defined:** 2026-05-18
**Milestone goal:** Complete the Character Sheet panel's data wiring (ability scores + skills) and close the Phase-14.1 spec-prose drift carry-forward.
**Core Value:** Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.
**Source:**
- [Specs.md](../Specs.md) v0.9.12 §7.5.2 (Main tab mockup — ability scores + saving throws + senses) + §7.5.3 (Skills tab mockup)
- v0.9.12 Phase 15 close audit `.planning/v0.9.12-MILESTONE-AUDIT.md` (Phase-14.1 carry-forward)
- v0.9.12 Phase 14 UI-REVIEW `.planning/milestones/v0.9.12-phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-REVIEW.md` (3 spec-prose drifts)
- `github.com/foundryvtt/dnd5e` `release-5.3.3` `module/data/actor/templates/common.mjs` (abilities schema — INV-2 cross-checked 2026-05-18)
- `github.com/foundryvtt/dnd5e/wiki/Roll-Formulas` (@abilities.*.value / .mod / .save.value / .dc / .proficient — INV-2 cross-checked 2026-05-18)

## v1 Requirements

8 requirement totali, distribuiti su 3 categorie. Tutti software-only — nessun hardware-gate. Carry-forward dei 35 SC `human_needed` v0.9.11 sotto ADR-0005 Branch A invariato (non riconsiderati in questo milestone).

### Sheet — Ability Scores

Ability scores end-to-end nel Main tab del Character Sheet panel. Spec §7.5.2 prevede `STR 16 +3 / DEX 14 +2 / …` con marcatori `◉`/`○` di proficienza sui tiri salvezza; il codice attuale popola tutto come `—` perché `CharacterSnapshotSchema` non ha il campo `abilities`. Schema dnd5e canonical: `actor.system.abilities.<key>.{value, mod, save.value, proficient, dc}` per ciascuna delle 6 abilità.

- [ ] **SHEET-05**: Extend `CharacterSnapshotSchema` in `@evf/shared-protocol` with `abilities` field — 6 sub-objects (str/dex/con/int/wis/cha) ciascuno con `{value: number, mod: number, save: number, proficient: boolean, dc: number}`
- [ ] **SHEET-06**: Extend `character-reader.ts` in `@evf/foundry-module` to read `actor.system.abilities.*` for each key and emit the new `abilities` snapshot field (mapping `proficient === 1` → `true`, leaving `mod` / `save.value` / `dc` as-read from dnd5e prep-time computation)
- [ ] **SHEET-07**: Update `renderMainTab()` in `character-sheet-tab-renderers.ts` — replace 6× `dash` placeholders for ability values with `snapshot.abilities.<k>.value` (2-char column), `mod` formatted as `+N`/`-N` (3-char column), `save` formatted as `+N`/`-N` with `◉`/`○` proficiency marker

### Sheet — Skills Tab

Skill modifiers + proficiency markers nella Skills tab. Mockup §7.5.3 prevede `◉ Acrobatics +5 / ○ Animal Handling +1 / …`. Dipendenza diretta da SHEET-05 (gli skill modifier sono `abilities.<base>.mod + prof × skill.proficient`). Schema dnd5e: `actor.system.skills.<key>.{value, total, ability, proficient, bonuses, mod, passive}`.

- [ ] **SHEET-08**: Extend `CharacterSnapshotSchema` with `skills` field — 18 sub-objects keyed by dnd5e short code (acr/ani/arc/ath/dec/his/ins/itm/inv/med/nat/prc/prf/per/rel/slt/ste/sur) each `{total: number, ability: AbilityKey, proficient: 0 | 0.5 | 1 | 2, passive: number}` (proficient is 0/0.5/1/2 for none/half/proficient/expert per dnd5e canonical)
- [ ] **SHEET-09**: Extend `character-reader.ts` to read `actor.system.skills.*` and emit the new `skills` snapshot field
- [ ] **SHEET-10**: Update `renderSkillsTab()` in `character-sheet-tab-renderers.ts` — replace mockup placeholders with `snapshot.skills.<k>.total` (3-char column with sign) + proficiency glyph (`○` for none, `◉` for proficient, `◈` for expert; `◉` with half-tone for half-proficient if achievable; INV-1 width-budget preserved)

### Polish — Phase-14.1 Carry-Forward

Cleanup di 3 spec-prose drift identificati dall'UI-REVIEW di Phase 14, in un commit INV-3 atomico (UI-SPEC + Specs.md + showcase coherence). Uno è un real defect (locale leak); gli altri due sono drift puramente prose.

- [ ] **INFILL-14.1-A**: UI-SPEC §2 column anchors riconciliati alla realtà delle fixture (`right-stop col 67`, `content-width 64`; divider `║` at col 68 anziché col 71); UI-REVIEW WR-UI-02
- [ ] **INFILL-14.1-B**: UI-SPEC §10 width-budget table allineata alle fixture bytes effettive (label container width-budget aggiornato a 52 cells dalla spec 40; stats container 54 cells dalla spec 60); UI-REVIEW WR-UI-01
- [ ] **INFILL-14.1-C**: Locale leak in `packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` rows 1/17 — riga 1 `ROUND 3 · TURN 2/5` (EN) → `TURNO 2/5` (IT); riga 17 `Conditions` (EN) → `Condizioni` (IT); estendere Z05-INV-02b al triade IT (A_it↔B_it↔C_it) per catturare regressioni future; UI-REVIEW WR-UI-03 (real defect)

## v2 Requirements

(Carry from v0.9.11 — see `.planning/milestones/v0.9.11-REQUIREMENTS.md` for full V2 list including VOICE-01..05, ACT-04, STRETCH-01..08.)

## Out of Scope (this milestone)

| Feature | Reason |
|---------|--------|
| Hardware validation (35 SC `human_needed`) | No Even Hub access this cycle — carry-forward under ADR-0005 Branch A unchanged |
| Inventory tab data binding | Already wired (items.contents); separate cleanup if needed → future milestone |
| Spells tab spell DC | Sheet-09 will already provide `abilities.<k>.dc` for downstream Spells tab consumption; the actual Spells tab DC binding is a separate task pinned to a future Sheet polish cycle |
| Bio tab content | Static template; data binding deferred to a future "narrative polish" milestone |
| Feats tab | Currently fed from `actor.items` filtered by type=feat; works; no change needed |
| Picovoice Rhino edge classifier | Conditional on SC-12-01 (p50 > 800ms threshold) — not measurable |
| RTL languages | ADR-0007 reserved — V2 stretch |
| STRETCH-01..05, 07, 08 | All explicitly carried forward unchanged from v0.9.11 |

## Milestone status

Milestone v0.9.13 Sheet Data Completion + Polish — **REQUIREMENTS defined** (3 categories, 8 v1 REQ-IDs); awaiting roadmap creation via `gsd-roadmapper`.

## Traceability

Mapped 2026-05-18 by manual scoping (will be re-checked by `gsd-roadmapper`). REQ-IDs assigned to provisional phases — final phase mapping happens at roadmap creation.

| Requirement | Provisional Phase | Status |
|-------------|-------------------|--------|
| SHEET-05 | Phase 16 (Ability Scores) | Defined |
| SHEET-06 | Phase 16 | Defined |
| SHEET-07 | Phase 16 | Defined |
| SHEET-08 | Phase 17 (Skills) | Defined |
| SHEET-09 | Phase 17 | Defined |
| SHEET-10 | Phase 17 | Defined |
| INFILL-14.1-A | Phase 18 (Polish) | Defined |
| INFILL-14.1-B | Phase 18 | Defined |
| INFILL-14.1-C | Phase 18 | Defined |

**Coverage:**
- v1 requirements: **8** total (Ability 3 · Skills 3 · Polish 3 = 9 sub-items across 3 INFILL-14.1-* but only 1 REQ each counts; final = 9 REQ-IDs)

Note: actual count is 9 REQ-IDs (3 SHEET ability + 3 SHEET skills + 3 INFILL-14.1 sub-items). Final coverage check by roadmapper.

---

*Requirements defined: 2026-05-18 — derived from v0.9.12 Phase 14 UI-REVIEW carry-forward + Specs.md §7.5.2/§7.5.3 mockup gap analysis*
*Traceability provisional: 2026-05-18 — final phase mapping by `gsd-roadmapper` agent*
