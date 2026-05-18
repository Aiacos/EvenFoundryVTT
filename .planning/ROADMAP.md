# Roadmap: EvenFoundryVTT (EVF)

## Milestones

- ✅ **v0.9.11 MVP** — Phases 0–13 (shipped 2026-05-17). Full details: [`milestones/v0.9.11-ROADMAP.md`](milestones/v0.9.11-ROADMAP.md)
- ✅ **v0.9.12 Quick Wins** — Phases 14–15 (shipped 2026-05-17 · 2 phases · 8/8 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.12-ROADMAP.md`](milestones/v0.9.12-ROADMAP.md)
- ✅ **v0.9.13 Sheet Data Completion + Polish** — Phases 16–18 (shipped 2026-05-18 · 3 phases · 7/7 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.13-ROADMAP.md`](milestones/v0.9.13-ROADMAP.md)

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

<details>
<summary>✅ v0.9.13 Sheet Data Completion + Polish (Phases 16–18) — SHIPPED 2026-05-18 · 7/7 plans · 9/9 v1 REQ-IDs · software-only · 2668 workspace tests</summary>

Three software-only phases completed the Character Sheet panel's data wiring (Main + Skills tabs) and closed the Phase-14.1 spec-prose drift carry-forward. Zero new hardware-gated SCs (35 `human_needed` SCs from v0.9.11 carry under ADR-0005 Branch A unchanged). CI Gate 8 socketlib handler count = **17 preserved end-to-end** — both Sheet phases are pure read-path extensions, no new socketlib handlers. Each phase closed with a single INV-3 atomic commit (Specs.md + README + showcase + STATE.md + ROADMAP.md + VERIFICATION.md). Phase 14/15 patterns are the canonical examples.

- [x] **Phase 16: Sheet Ability Scores (Main tab data wiring)** (3/3 plans) — `CharacterSnapshotSchema.abilities` extension (16-01) + `extractAbilities()` reader helper (16-02) + `renderMainTab()` data binding + `formatAbilityValue`/`formatAbilityMod` helpers + 4 INV-1 fixtures byte-updated (16-03) — closed via single INV-3 atomic ratification commit `d68d7f2` per Phase 14/15 precedent. Workspace tests 2559 → 2648 (+89). CI Gate 8 socketlib count = 17 preserved.
- [x] **Phase 17: Sheet Skills Tab (Skills tab data wiring)** (3/3 plans) — `CharacterSnapshotSchema.skills` extension (17-01 `79564d9`) + `extractSkills()` reader helper + SKILL_DEFAULT_ABILITY map + verbatim `proficient: 0|0.5|1|2` pass-through (17-02 `54e577e`) + `renderSkillsTab()` dynamic `SKILL_KEYS.map` lookup replacing `DEFAULT_SKILLS` hardcoded array + SKILL_NAMES 3-locale i18n + PASSIVE_ABBR const + Main tab senses line `PP/PI/IND` surfacing (half-prof 0.5 → ◉ round-up per UI-SPEC §3) + 5 INV-1 fixtures (`sheet.skills.it.txt` byte-identical + `sheet.skills.en.txt` regenerated from BASE per Phase 16 D-3 + 4 `sheet.main.*` row-17 byte-updates) + 5 CSTR-SKILLS-DATA-* tests + 23 downstream snapshot literals extended (17-03) — closed via single INV-3 atomic ratification commit `c208d24` per Phase 14/15/16 precedent. Workspace tests 2645 → 2667 (+22). CI Gate 8 socketlib count = 17 preserved.
- [x] **Phase 18: Phase-14.1 Spec-Drift Polish** (1/1 plan, 4 commits) — RED `e064168` (Z05-INV-02b-triade test extension) + GREEN `fe4d81f` (IT fixture rows 1/5/7/9/12/17 locale-leak fix — plan acknowledged 2 leaks, triade test exposed 4 additional per Rule 2 broader-scope auto-fix; `[GLY]` row 20 cols 89..93 exempted per UI-SPEC §6.3) + DOC `a84f6a9` (archived 14-UI-SPEC.md §2/§10 reconciled + 14-UI-REVIEW.md WR-UI-01/02/03 resolutions cross-referenced) + CLOSE INV-3 atomic milestone-close commit covering Specs.md v0.9.13 bump + changelog stanza + README + showcase + STATE/ROADMAP/REQUIREMENTS + 18-VERIFICATION.md. Workspace tests 2667 → 2668 (+1 triade). CI Gate 8 socketlib count = 17 preserved.

</details>


## Phase Details

(v0.9.13 phases archived to [`milestones/v0.9.13-ROADMAP.md`](milestones/v0.9.13-ROADMAP.md). Live phase details will populate here as the next milestone opens.)

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.9.11 MVP | 15 (0–13) | 71/71 | ✅ Shipped | 2026-05-17 |
| v0.9.12 Quick Wins | 2 (14–15) | 8/8 | ✅ Shipped | 2026-05-17 |
| v0.9.13 Sheet Data Completion + Polish | 3 (16–18) | 7/7 | ✅ Shipped | 2026-05-18 |

---
*Last reorganized: 2026-05-18 — **v0.9.13 SHIPPED** via Phase 18 INV-3 atomic milestone-close commit (single commit covers Specs.md v0.9.12 → v0.9.13 bump + changelog stanza summarizing Phases 16+17+18 + README badge + showcase version stat + STATE.md frontmatter complete + ROADMAP Phase 18 ✅ + REQUIREMENTS INFILL-14.1-A/B/C → Resolved + 18-VERIFICATION.md). Phase 18 execution: 4 commits (RED + GREEN + DOC + CLOSE) — triade test exposed 6 IT-locale leaks (4 broader than plan acknowledged); §10 width-budget Option (a) doc-fix re-derived from runtime literals; `[GLY]` row 20 surgically exempted per UI-SPEC §6.3. Workspace tests 2667 → 2668 (+1 triade). CI Gate 8 socketlib count = **17** preserved end-to-end across the milestone. 9/9 v1 REQ-IDs Resolved (3 SHEET ability + 3 SHEET skills + 3 INFILL-14.1 sub-items). Software-only. Next: `/gsd-audit-milestone` → `/gsd-complete-milestone v0.9.13` → `/gsd-cleanup` per v0.9.11 + v0.9.12 close pattern.*
