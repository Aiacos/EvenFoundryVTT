# Roadmap: EvenFoundryVTT (EVF)

## Milestones

- ✅ **v0.9.11 MVP** — Phases 0–13 (shipped 2026-05-17). Full details: [`milestones/v0.9.11-ROADMAP.md`](milestones/v0.9.11-ROADMAP.md)
- ✅ **v0.9.12 Quick Wins** — Phases 14–15 (shipped 2026-05-17 · 2 phases · 8/8 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.12-ROADMAP.md`](milestones/v0.9.12-ROADMAP.md)
- ✅ **v0.9.13 Sheet Data Completion + Polish** — Phases 16–18 (shipped 2026-05-18 · 3 phases · 7/7 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.13-ROADMAP.md`](milestones/v0.9.13-ROADMAP.md)
- ⏸️ **v0.9.14 Release & Distribution + deferred hardening** — PARKED 2026-06-05 (Phases 19–22 dirs cleared; will be re-roadmapped when resumed). Requirements: REL-01..05, LIFE-01..04, REND-01..03, LOC-01.
- ✅ **v0.10.0 Raster UI Substrate** — Phases 19–26 (shipped 2026-06-08 · 8 phases · 26/26 plans · 13/13 v1 REQ-IDs software-complete · hardware UAT deferred ADR-0005 Branch A). Full details: [`milestones/v0.10.0-ROADMAP.md`](milestones/v0.10.0-ROADMAP.md)

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

Three software-only phases completed the Character Sheet panel's data wiring (Main + Skills tabs) and closed the Phase-14.1 spec-prose drift carry-forward. Zero new hardware-gated SCs (35 `human_needed` SCs from v0.9.11 carry under ADR-0005 Branch A unchanged). CI Gate 8 socketlib handler count = **17 preserved end-to-end** — both Sheet phases are pure read-path extensions, no new socketlib handlers. Each phase closed with a single INV-3 atomic commit.

- [x] **Phase 16: Sheet Ability Scores (Main tab data wiring)** (3/3 plans) — `CharacterSnapshotSchema.abilities` + `extractAbilities()` + `renderMainTab()` data binding + 4 INV-1 fixtures — INV-3 atomic commit `d68d7f2`
- [x] **Phase 17: Sheet Skills Tab (Skills tab data wiring)** (3/3 plans) — `CharacterSnapshotSchema.skills` + `extractSkills()` + `renderSkillsTab()` dynamic + SKILL_NAMES 3-locale + senses passives + 5 INV-1 fixtures — INV-3 atomic commit `c208d24`
- [x] **Phase 18: Phase-14.1 Spec-Drift Polish** (1/1 plan) — Z05-INV-02b-triade + IT fixture locale-leak fix + archived 14-UI-SPEC §2/§10 reconciled — INV-3 atomic milestone-close commit `df4ea02`

</details>

<details>
<summary>✅ v0.10.0 Raster UI Substrate (Phases 19–26) — SHIPPED 2026-06-08 · 26/26 plans · 3300 workspace tests · 13/13 v1 REQ-IDs software-complete</summary>

Replaced the HUD render substrate from 27px text-containers to a canvas-composited raster region (400×200 → dither → 4×200×100 tiles → serialized SDK push), with full typography control, 6-tab character sheet, combat tracker, ~5fps xxhash delta loop, and promotion to default boot with glyph as BLE-degraded fallback. INV-2 image-container limits re-verified (2026-06-05 + 2026-06-08, no drift). Hardware UAT deferred per ADR-0005 Branch A (tracked in archived `*-HUMAN-UAT.md`). A milestone-audit integration check caught + fixed BLOCKER-01 (character.delta → CanvasCharacterSheetPanel runtime wire) before close. Full details in archive.

- [x] **Phase 19: ADR-0013 Amendment 1 + Canvas Compositor Core** (4/4) — geometry 400×200 / 4×200×100 ratified; `CanvasCompositor` + `CanvasLayer` + 5-container page schema; glyph path byte-identical (RAST-01..05, RINV-02)
- [x] **Phase 20: Status HUD su Canvas + Font VT323 + INV-1 Raster Baseline** (5/5) — `CanvasStatusHudLayer` z=1 + VT323 + ImageBitmap chrome pre-bake + dirty-gate; INV-1 raster contract + `inv:all` glyph/raster split (RFONT-01..03, RINV-01)
- [x] **Phase 21: Character Sheet su Canvas + Dati Main-tab** (5/5) — `CanvasCharacterSheetPanel` z=2 · 6 tabs · gesture nav preserved · portrait dither · class/initiative/speed schema+reader (RSHEET-01..03, RDATA-01..02)
- [x] **Phase 22: Features + Biography Schema Extension** (3/3) — `feats[]` + `biography` schema + readers; Features/Bio tabs on real data + Bio scroll (RDATA-03..04)
- [x] **Phase 23: Combat Tracker su Canvas + Combatant AC** (3/3) — `CanvasCombatTrackerPanel` z=2 (5-row auto-follow window · turn highlight) · `CombatantSchema.ac` + reader (RCOMB-01, RDATA-05)
- [x] **Phase 24: Delta Loop ~5fps xxhash** (2/2) — `HudDeltaDriver` event-driven debounced (default 100ms) xxhash h32 sub-tile delta; naive driver removed (INV-4); zero-push-on-idle (RPROMO-01)
- [x] **Phase 25: Promozione Raster a Default Boot + Fallback Glyph** (3/3) — canvas default boot · `?hud=raster` PoC removed (INV-4) · glyph BLE-degraded fallback atomic switch (RPROMO-02)
- [x] **Phase 26: INV-3 Doc Coherence Milestone Close** (1/1) — atomic Specs §7 + README + showcase bump to v0.10.0; ASCII mockups → "Glyph Fallback Mode" subsection (RINV-03)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 0–13 | v0.9.11 | 71/71 | Complete | 2026-05-17 |
| 14–15 | v0.9.12 | 8/8 | Complete | 2026-05-17 |
| 16–18 | v0.9.13 | 7/7 | Complete | 2026-05-18 |
| 19. ADR-0013 + Canvas Compositor Core | v0.10.0 | 4/4 | Complete | 2026-06-06 |
| 20. Status HUD Canvas + VT323 + INV-1 | v0.10.0 | 5/5 | Complete | 2026-06-06 |
| 21. Character Sheet su Canvas + Main-tab | v0.10.0 | 5/5 | Complete | 2026-06-07 |
| 22. Features + Biography Schema | v0.10.0 | 3/3 | Complete | 2026-06-07 |
| 23. Combat Tracker su Canvas + AC | v0.10.0 | 3/3 | Complete | 2026-06-08 |
| 24. Delta Loop ~5fps xxhash | v0.10.0 | 2/2 | Complete | 2026-06-08 |
| 25. Raster Default Boot + Glyph Fallback | v0.10.0 | 3/3 | Complete | 2026-06-08 |
| 26. INV-3 Doc Coherence Milestone Close | v0.10.0 | 1/1 | Complete | 2026-06-08 |
| 27. Mappa su canvas + corner-card layout | next (v0.11.0 cand.) | 0/? | Not planned | — |

## Next Milestone (in pianificazione — v0.11.0 candidate)

### Phase 27: Mappa su canvas substrate + corner-card HUD layout

**Goal:** La mappa di scena diventa il layer base del compositor canvas e il layout on-glasses passa al design Specs §7.2 (z=0 mappa · z=1 status HUD "corner card" · z=2 overlay) — chiudendo il gap di convivenza per cui il percorso scena legacy e l'HudDeltaDriver si contendono le tile id 0-3 (verificato live 2026-06-10, schermo ibrido).

Scope:
1. **`CanvasMapLayer` z=0** — consuma i `frame_pixels` decodificati (400×200 canonici, pipeline fixata in commit `edae764`) e dipinge nel compositor; il percorso legacy `RasterController→map-tile-0..3` viene ritirato in canvas mode (INV-4: niente doppio driver sulle stesse tile).
2. **Layout corner-card** — `CanvasStatusHudLayer` smette di riempire l'intero 400×200 di nero opaco: status card compatta in un angolo (chrome non full-frame), mappa visibile sotto; INV-1 raster baselines rigenerate di conseguenza.
3. **`[M] Mappa` toggle reale** — sostituisce lo stub no-op "Phase 7" in boot-engine-core (mappa on/off o full-map mode).
4. **Root-exit in canvas mode** — `root-exit-dispatcher` presuppone top layer id 'map-base'; a root canvas `getTopLayer()` è null e l'exit double-tap non scatta mai. Con la mappa montata a z=0 il contratto torna valido (o si adegua il dispatcher).

**Requirements**: TBD (derivare in plan-phase; evidenze in `.planning/debug/resolved/map-frame-pipeline-dims.md`)
**Depends on:** Phase 19–26 (v0.10.0 Raster UI Substrate) + fix pipeline frame `edae764`
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 27 to break down)

---
*Last updated: 2026-06-10 — Phase 27 (Mappa su canvas + corner-card layout) added as next-milestone candidate. Prior: 2026-06-08 v0.10.0 SHIPPED (Phases 19–26, archived); v0.9.14 parked.*
