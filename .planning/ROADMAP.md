# Roadmap: EvenFoundryVTT (EVF)

## Milestones

- ✅ **v0.9.11 MVP** — Phases 0–13 (shipped 2026-05-17). Full details: [`milestones/v0.9.11-ROADMAP.md`](milestones/v0.9.11-ROADMAP.md)
- ✅ **v0.9.12 Quick Wins** — Phases 14–15 (shipped 2026-05-17 · 2 phases · 8/8 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.12-ROADMAP.md`](milestones/v0.9.12-ROADMAP.md)
- ✅ **v0.9.13 Sheet Data Completion + Polish** — Phases 16–18 (shipped 2026-05-18 · 3 phases · 7/7 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.13-ROADMAP.md`](milestones/v0.9.13-ROADMAP.md)
- 🚧 **v0.9.14 Release & Distribution + deferred hardening** — Phases 19–22 (in progress · opened 2026-05-30)

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

- [x] **Phase 16: Sheet Ability Scores (Main tab data wiring)** (3/3 plans) — `CharacterSnapshotSchema.abilities` extension + `extractAbilities()` reader + `renderMainTab()` data binding + 4 INV-1 fixtures — INV-3 atomic commit `d68d7f2`. Workspace tests 2559 → 2648 (+89). CI Gate 8 = 17.
- [x] **Phase 17: Sheet Skills Tab (Skills tab data wiring)** (3/3 plans) — `CharacterSnapshotSchema.skills` extension + `extractSkills()` reader + `SKILL_DEFAULT_ABILITY` map + `renderSkillsTab()` dynamic + SKILL_NAMES 3-locale + senses passives + 5 INV-1 fixtures — INV-3 atomic commit `c208d24`. Workspace tests 2645 → 2667 (+22). CI Gate 8 = 17.
- [x] **Phase 18: Phase-14.1 Spec-Drift Polish** (1/1 plan, 4 commits) — Z05-INV-02b-triade test + IT fixture locale-leak fix (6 rows) + archived 14-UI-SPEC §2/§10 reconciled + INV-3 atomic milestone-close commit `df4ea02`. Workspace tests 2667 → 2668 (+1). CI Gate 8 = 17.

</details>

### 🚧 v0.9.14 Release & Distribution + deferred hardening (In Progress)

**Milestone Goal:** Ship an installable release of all system components via CI/CD, then close the highest-value hardening gaps surfaced by the 2026-05-29/30 deep reviews.

- [ ] **Phase 19: Release & Distribution** — CD pipeline: foundry-module GitHub Release (module.json + zip) · bridge Docker GHCR · g2-app dist zip · Changesets release notes · README Installation section (INV-3)
- [ ] **Phase 20: Background-state & Lifecycle** — INV-2 SDK 0.0.10 lifecycle surface verification · session-state survival across background/foreground · shutDownPageContainer exit gesture · mic-off on background
- [ ] **Phase 21: Render Correctness** — `_flushPage` real container schema · overlay-block/toast-block hardware rendering · exactly-one isEventCapture:1 · INV-1 LVGL pixel-model reconciliation · HUD/glyph ≤10 rows vertical budget
- [ ] **Phase 22: Tier-4 Polish** — DE locale support + minor 2026-05-29 deep-review carries


## Phase Details

### Phase 19: Release & Distribution
**Goal**: End users can install and run the entire EVF system from publicly-published CI-built artifacts without manual build steps
**Depends on**: Nothing (independent, sequenced first in milestone)
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05
**Success Criteria** (what must be TRUE):
  1. A user can install the Foundry module by pasting the GitHub Release `module.json` manifest URL into Foundry's "Install Module" dialog — no manual file download required
  2. `docker pull ghcr.io/<owner>/evf-bridge:<version>` succeeds from any machine with Docker installed, producing a runnable bridge container
  3. A user can download `g2-app-dist.zip` from the GitHub Release page and serve it from a static HTTPS host to run the g2-app plugin
  4. The GitHub Release page shows human-readable release notes aggregated from the Changesets changelog without any manual copy-paste
  5. `README.md` "Installation" section documents all three component installation paths (foundry-module manifest URL, bridge docker-compose from GHCR, g2-app static host), coherent with Specs.md + showcase per INV-3
**Plans**: 2 plans
- [ ] 19-01-PLAN.md — CD workflow: GHCR bridge image + g2-app dist zip + Changesets release notes (REL-01..04)
- [ ] 19-02-PLAN.md — README ## Installation (3 components) + INV-3 atomic close + bridge GHCR runbook (REL-05)
**UI hint**: no

### Phase 20: Background-state & Lifecycle
**Goal**: The plugin handles phone background/foreground and exit lifecycle events cleanly — session state survives without reset and hardware capture (mic) is never left hot
**Depends on**: Nothing (independent of Phase 19)
**Requirements**: LIFE-01, LIFE-02, LIFE-03, LIFE-04
**Success Criteria** (what must be TRUE):
  1. An INV-2 verification round documents the actual `@evenrealities/even_hub_sdk@0.0.10` lifecycle event surface (`onEvenHubEvent` FOREGROUND_ENTER/EXIT/ABNORMAL_EXIT/SYSTEM_EXIT via `OsEventTypeList`) with canonical-source citations, and explicitly confirms that `setBackgroundState`/`onBackgroundRestore` are absent on 0.0.10
  2. After backgrounding the Even Realities App and returning to foreground, the active panel, effective locale, and map mode are exactly as left — the plugin does not boot-reset [human_needed: on-glasses verification]
  3. A user can exit the plugin from the glasses/ring via a reserved gesture that calls `bridge.shutDownPageContainer(...)` — the app closes gracefully [human_needed: on-glasses verification]
  4. On FOREGROUND_EXIT/ABNORMAL_EXIT lifecycle events, `audioControl(false)` is called before teardown — the microphone is no longer capturing after the event fires (verified in unit tests; hardware silence confirmation is human_needed)
**Plans**: TBD

### Phase 21: Render Correctness
**Goal**: `LayerManager._flushPage` emits the complete container schema so overlay-block and toast-block actually render on hardware, and the char-grid vs LVGL pixel model is reconciled so INV-1 layout integrity holds against real hardware geometry
**Depends on**: Nothing (independent of Phases 19 and 20)
**Requirements**: REND-01, REND-02, REND-03
**Success Criteria** (what must be TRUE):
  1. `_flushPage` assembles a container schema that includes non-empty `overlay-block` and `toast-block` containers when those layers are mounted, and exactly one emitted container carries `isEventCapture:1` — verified by unit tests against the full container-schema shape
  2. INV-1 layout validation is extended to assert alignment-bearing columns against LVGL pixel metrics (proportional-font glyph widths), so the char-grid model and actual pixel rendering stay in sync — any reconciliation deltas are documented in Specs.md (INV-3)
  3. HUD card and glyph map layouts are validated to fit within 576×288 at 27px/line (≤10 rows for a full-screen container); any 21-row layouts are re-budgeted or scroll-gated so no row is silently clipped [hardware rendering outcome is human_needed]
**Plans**: TBD
**UI hint**: yes

### Phase 22: Tier-4 Polish
**Goal**: DE locale is fully supported and minor hardening items from the 2026-05-29 deep review are addressed or explicitly re-deferred with documented rationale
**Depends on**: Nothing (independent; can run in parallel with or after any other phase)
**Requirements**: LOC-01
**Success Criteria** (what must be TRUE):
  1. All in-app text strings render correctly in DE locale — no EN/IT fallback leaks visible to a German-speaking player navigating the full panel set [human_needed: on-glasses DE-locale run]
  2. Every Tier-4 item from the 2026-05-29 deep review is either resolved (with test coverage) or explicitly re-deferred with a documented rationale entry in Specs.md changelog
**Plans**: TBD


## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 0. Validation Gates | v0.9.11 | 4/4 | Complete | 2026-05-10 |
| 1. Foundation | v0.9.11 | 3/3 | Complete | 2026-05-11 |
| 2. Foundry Module Core + Pairing UI | v0.9.11 | 5/5 | Complete | 2026-05-11 |
| 3. Bridge Service Skeleton | v0.9.11 | 5/5 | Complete | 2026-05-12 |
| 4a. G2 Engine + Raster + Status HUD | v0.9.11 | 6/6 | Complete | 2026-05-13 |
| 4b. Overlay Slot + Map Mode + Adversarial UI | v0.9.11 | 6/6 | Complete | 2026-05-14 |
| 5. Panel Plugin System + Read-Only Panels | v0.9.11 | 6/6 | Complete | 2026-05-14 |
| 6. R1 Integration + Quick Action + INV-5 | v0.9.11 | 4/4 | Complete | 2026-05-15 |
| 7. Foundry Module Write Path | v0.9.11 | 6/6 | Complete | 2026-05-15 |
| 8. Manual Action UX | v0.9.11 | 5/5 | Complete | 2026-05-16 |
| 9. Action Economy & Edge Cases | v0.9.11 | 5/5 | Complete | 2026-05-16 |
| 10. Polish & Field Test MVP | v0.9.11 | 5/5 | Complete | 2026-05-17 |
| 11. V2 foundry-mcp Server | v0.9.11 | 4/4 | Complete | 2026-05-17 |
| 12. V2 Voice UX Tuning | v0.9.11 | 3/3 | Complete | 2026-05-17 |
| 13. V2 Stretch | v0.9.11 | 4/4 | Complete | 2026-05-17 |
| 14. Raster z=0.5 Idle Content Infill | v0.9.12 | 3/3 | Complete | 2026-05-17 |
| 15. Deepgram Keyterm + Entity-Pack | v0.9.12 | 5/5 | Complete | 2026-05-17 |
| 16. Sheet Ability Scores | v0.9.13 | 3/3 | Complete | 2026-05-18 |
| 17. Sheet Skills Tab | v0.9.13 | 3/3 | Complete | 2026-05-18 |
| 18. Phase-14.1 Spec-Drift Polish | v0.9.13 | 1/1 | Complete | 2026-05-18 |
| 19. Release & Distribution | v0.9.14 | 0/? | Not started | - |
| 20. Background-state & Lifecycle | v0.9.14 | 0/? | Not started | - |
| 21. Render Correctness | v0.9.14 | 0/? | Not started | - |
| 22. Tier-4 Polish | v0.9.14 | 0/? | Not started | - |

---
*Last updated: 2026-05-30 — v0.9.14 roadmap Phases 19–22 created. Prior: 2026-05-18 v0.9.13 ARCHIVED.*
