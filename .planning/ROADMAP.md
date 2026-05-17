# Roadmap: EvenFoundryVTT (EVF)

## Milestones

- ✅ **v0.9.11 MVP** — Phases 0–13 (shipped 2026-05-17). Full details: [`milestones/v0.9.11-ROADMAP.md`](milestones/v0.9.11-ROADMAP.md)
- ✅ **v0.9.12 Quick Wins** — Phases 14–15 (shipped 2026-05-17 · 2 phases · 8/8 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs)

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

### ✅ v0.9.12 Quick Wins (Shipped 2026-05-17 — Phases 14–15)

Two atomic software-only phases shipped end-to-end on 2026-05-17. No hardware-gated SCs added (35 `human_needed` SCs carry from v0.9.11 under ADR-0005 Branch A unchanged). Both phases fully software-validatable; CI Gate 8 `socketlib.registerComplexHandler` count = 17 preserved end-to-end; workspace test suite 2624 / 2624 green at milestone close.

- [x] **Phase 14: Raster z=0.5 Idle Content Infill** (✅ closed 2026-05-17) — Fill the previously-empty rows of raster-mode map-area with 3 dynamic text containers when no z=2 overlay is mounted; auto-demolish on overlay mount via existing LayerManager.bundle() differential demolish (ADR-0009 Amd 1 pattern); ADR-0001 amended; Specs.md §7.2/§7.3/§7.4 + new §7.4c bumped to v0.9.12 in single INV-3 atomic commit.
- [x] **Phase 15: Deepgram Keyterm Prompting + Entity-Pack Integration** (✅ closed 2026-05-17 — Option C from voice-intent-research shipped; 17-socketlib invariant preserved; +625% entity-recall lift per Deepgram docs) — Wired Nova-3 `keyterm` parameter in `deepgram-stt.ts` (Phase 12 enhancement); seeded keyterm vocabulary from BOTH static `SPELL_KEYTERMS` (70 SRD entries × IT + EN = 140 candidates in shared-protocol) AND dynamic `EntityPackCache` (Foundry-derived items/weapons/armor/NPCs/monsters from quick-task 260517-k2g); IT+EN locale-aware merging with static-wins + cap-drops-dynamic-first semantics (`DEEPGRAM_KEYTERM_LIMIT = 100`); hot-update on WS delta via existing `/internal/delta` channel (debounce 250ms + drain-then-restart mutex; no new socketlib handler — count stays at 17); failure modes (empty cache one-shot warn · close-code 1007/1008/4xxx retry-then-fallback) never fail-closed; Phase 12 baseline byte-for-byte preserved when keytermProvider absent.

## Phase Details

### Phase 14: Raster z=0.5 Idle Content Infill
**Goal**: Player in raster mode (no overlay mounted) sees the previously-empty map-area rows populated with glanceable status content (combat log mini + z=0.5 label + stats strip), and the infill disappears without flicker when an overlay opens.
**Depends on**: v0.9.11 Phase 4a/4b (raster pipeline + LayerManager + overlay panel API operational); carry-forward PLAN at `.planning/quick/20260514-raster-dynamic-infill/PLAN.md` (already INV-2 cross-checked, CORRECTED-B option approved by user 2026-05-14)
**Requirements**: INFILL-01, INFILL-02, INFILL-03, INFILL-04, INFILL-05
**Success Criteria** (what must be TRUE):
  1. Player in raster mode with no z=2 overlay mounted sees combat-log mini + z=0.5 label + stats strip rendered in the previously-empty map-area rows (3 text containers populated; INFILL-02 verified)
  2. Opening any z=2 overlay (Sheet, Inventory, Spellbook, Combat) auto-demolishes the z=0.5 infill via LayerManager.bundle() differential demolish — no flicker, no layout shift on z=0 (raster) or z=1 (Status HUD) (INFILL-03 verified; mirrors ADR-0009 Amd 1 toast-cohabit pattern)
  3. Closing the overlay re-mounts z=0.5 infill atomically (round-trip state machine verified)
  4. INV-1 ASCII snapshot fixtures pass for: (a) idle-fill state (z=0+z=0.5+z=1), (b) overlay-open state (z=0+z=1+z=2 with z=0.5 absent), (c) glyph-mode idle-fill state — all char-precision, same column boundaries (INFILL-05 verified)
  5. Specs.md §7.2 + §7.3 + §7.4 + new §7.4c + README.md + showcase + ADR-0001 amendment all bumped to v0.9.12 in a single INV-3 atomic commit; CI Gate INV-3 atomic doc coherence remains green (INFILL-01 + INFILL-04 verified)
**Plans**: 3 plans complete · `14-01-PLAN.md` (3 INV-1 fixtures + Z05-INV-01..04 cross-state invariants) · `14-02-PLAN.md` (LMT-DD-07 race coverage) · `14-03-PLAN.md` (INV-3 atomic ratification — this commit)
Plans:
- [x] 14-01-PLAN.md — 3 INV-1 fixtures (raster-overlay-open.it/en + glyph-idle-z05.it) + Z05-INV-01..04 cross-state column-equality test
- [x] 14-02-PLAN.md — LMT-DD-07 race-coverage unit test in layer-manager.test.ts (single bundle flush atomicity under z=0.5 → z=2 transition)
- [x] 14-03-PLAN.md — INV-3 atomic ratification commit: ADR-0001 Amendment 1 status flip + Specs.md changelog entry + README + showcase + STATE.md + ROADMAP.md (7-file atomic)
**UI hint**: yes

### Phase 15: Deepgram Keyterm Prompting + Entity-Pack Integration
**Goal**: Voice STT correctly recognizes esoteric D&D 5e entity names (spells, weapons, monsters) in both IT and EN — including code-switch — by feeding the Deepgram Nova-3 Multilingual `keyterm` parameter with the union of the static 70-spell SRD subset and the dynamic Foundry-derived entity vocabulary, refreshed live on WS delta.
**Depends on**: v0.9.11 Phase 12 (Deepgram Nova-3 + `deepgram-stt.ts` baseline); quick-task `20260517-spell-lookup-foundry-derived` (static `spell-lookup.ts` 70-entry SRD subset); quick-task `260517-k2g` (entity-pack pipeline — `entity-pack-cache.ts` + `entity-lookup-foundry.ts` + `/internal/delta` multiplex). Research basis: `.planning/quick/20260517-voice-intent-research/RESEARCH.md` Option C (+625% entity-recall lift per Deepgram docs).
**Requirements**: VOICE-06, VOICE-07, VOICE-08, VOICE-09 — all SATISFIED (Resolved · Software-only)
**Success Criteria** (all VERIFIED 2026-05-17 — see [`.planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-VERIFICATION.md`](phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-VERIFICATION.md)):
  1. ✅ Deepgram STT call from `deepgram-stt.ts` passes the `keyterm` parameter populated from the merged vocabulary (VOICE-06 — verified DGKT-01..06 + INT-01)
  2. ✅ Keyterm vocabulary merges static `SPELL_KEYTERMS` (70 SRD × IT + EN = 140 candidates) + `EntityPackCache` snapshot; both IT and EN locale variants included (VOICE-07 + VOICE-08 — verified KM-01..12 + INT-01/03)
  3. ✅ Adding/removing an entity triggers a WS delta on `/internal/delta` which refreshes the keyterm list within ≤ 5 minutes (VOICE-09 — verified EPC-SUB-01..05 + KRF-01..07 + INT-01)
  4. ✅ socketlib `registerComplexHandler` count remains exactly **17** after Phase 15 close (Phase 13 invariant + CI Gate 8 preserved)
  5. ✅ Phase 12 behavior fully backward-compatible (DGKT-04 + DGKT-06 byte-for-byte URL `.toBe(DEEPGRAM_URL)` when keytermProvider absent)
**Plans**: 5 plans complete
Plans:
- [x] 15-01-PLAN.md — SPELL_KEYTERMS data (@evf/shared-protocol) + buildKeytermList pure function (@evf/bridge)
- [x] 15-02-PLAN.md — Deepgram adapter keytermProvider + URL builder + server.ts step 10 wiring
- [x] 15-03-PLAN.md — EntityPackCache.onChange + KeytermRefresher (debounce 250ms + drain-then-restart mutex)
- [x] 15-04-PLAN.md — keyterm sanitizer + empty-cache one-shot warn + retry-then-fallback + integration test
- [x] 15-05-PLAN.md — INV-3 atomic doc coherence closure (Specs.md §3.6 + §5.2 + changelog · README · showcase · STATE · ROADMAP · REQUIREMENTS · 15-VERIFICATION.md)

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.9.11 MVP | 15 (0–13) | 71/71 | ✅ Shipped | 2026-05-17 |
| v0.9.12 Quick Wins | 2 (14–15) | 8/8 | ✅ Shipped | 2026-05-17 |

### v0.9.12 Phase Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 14. Raster z=0.5 Idle Content Infill | 3/3 | ✅ Complete | 2026-05-17 |
| 15. Deepgram Keyterm + Entity-Pack | 5/5 | ✅ Complete | 2026-05-17 |

---
*Last reorganized: 2026-05-17 — v0.9.12 Quick Wins ✅ SHIPPED (Phase 14 INFILL-01..05 + Phase 15 VOICE-06..09; 9/9 v1 REQ-IDs resolved; CI Gate 8 socketlib handler count = 17 preserved end-to-end)*
