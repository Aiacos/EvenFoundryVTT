# Roadmap: EvenFoundryVTT (EVF)

## Milestones

- ✅ **v0.9.11 MVP** — Phases 0–13 (shipped 2026-05-17). Full details: [`milestones/v0.9.11-ROADMAP.md`](milestones/v0.9.11-ROADMAP.md)
- 🟢 **v0.9.12 Quick Wins** — Phases 14–15 (planning · 2 phases, 9 v1 REQ-IDs, software-only)

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

### 🟢 v0.9.12 Quick Wins (Planning — Phases 14–15)

Two atomic software-only phases. No hardware-gated SCs added (35 `human_needed` SCs carry from v0.9.11 under ADR-0005 Branch A unchanged). Both phases ship via the `defer-hardware-tests` carry pattern if any UAT surfaces during work — but the scope as defined is 100% software-validatable.

- [ ] **Phase 14: Raster z=0.5 Idle Content Infill** — Fill the previously-empty rows of raster-mode map-area with 3 dynamic text containers when no z=2 overlay is mounted; auto-demolish on overlay mount via existing LayerManager.bundle() differential demolish (ADR-0009 Amd 1 pattern); ADR-0001 amended; Specs.md §7.2/§7.3/§7.4 + new §7.4c bumped to v0.9.12 in single INV-3 atomic commit.
- [ ] **Phase 15: Deepgram Keyterm Prompting + Entity-Pack Integration** — Wire Nova-3 `keyterm` parameter in `deepgram-stt.ts` (Phase 12 enhancement); seed keyterm vocabulary from BOTH static `spell-lookup.ts` (70 SRD entries) AND dynamic `entity-pack-cache.ts` (Foundry-derived items/weapons/armor/NPCs/monsters from quick-task 260517-k2g); IT+EN locale-aware merging; hot-update on WS delta via existing `/internal/delta` channel (no new socketlib handler — count stays at 17).

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
**Plans**: TBD
**UI hint**: yes

### Phase 15: Deepgram Keyterm Prompting + Entity-Pack Integration
**Goal**: Voice STT correctly recognizes esoteric D&D 5e entity names (spells, weapons, monsters) in both IT and EN — including code-switch — by feeding the Deepgram Nova-3 Multilingual `keyterm` parameter with the union of the static 70-spell SRD subset and the dynamic Foundry-derived entity vocabulary, refreshed live on WS delta.
**Depends on**: v0.9.11 Phase 12 (Deepgram Nova-3 + `deepgram-stt.ts` baseline); quick-task `20260517-spell-lookup-foundry-derived` (static `spell-lookup.ts` 70-entry SRD subset); quick-task `260517-k2g` (entity-pack pipeline — `entity-pack-cache.ts` + `entity-lookup-foundry.ts` + `/internal/delta` multiplex). Research basis: `.planning/quick/20260517-voice-intent-research/RESEARCH.md` Option C (+625% entity-recall lift per Deepgram docs).
**Requirements**: VOICE-06, VOICE-07, VOICE-08, VOICE-09
**Success Criteria** (what must be TRUE):
  1. Deepgram STT call from `deepgram-stt.ts` passes the `keyterm` parameter populated from the merged vocabulary; mocked Nova-3 response with `Bigby's Hand` / `Counterspell` / `Vicious Mockery` transcript resolves correctly through the existing intent-extraction path (VOICE-06 verified via unit + integration tests)
  2. Keyterm vocabulary is composed by merging `spell-lookup.ts` (70 SRD static entries) AND `entity-pack-cache.ts` snapshot at request time (Foundry-derived items/weapons/armor/NPCs/monsters via existing additive parallel pipeline); both IT and EN locale variants are included in a single union list (VOICE-07 + VOICE-08 verified — cross-lingual code-switch e.g. "cast palla di fuoco" resolves to `fireball` ID)
  3. Adding/removing an entity in the Foundry compendium triggers a WS delta on `/internal/delta` which refreshes the keyterm list inside the STT client within ≤ 5 minutes (existing TTL semantics; same channel used by spell-pack and entity-pack — no new bridge endpoint, no new socketlib handler) (VOICE-09 verified)
  4. socketlib `registerComplexHandler` count remains exactly **17** after Phase 15 close (Phase 13 invariant + CI Gate 8 preserved; vocabulary refresh uses existing push-based delta channel — no new handler registered)
  5. Deepgram API `keyterm` parameter is correctly enabled only when Nova-3 Multilingual model is selected and gracefully no-ops with feature flag off; existing Phase 12 behavior is fully backward-compatible (no regression in 2546-test baseline)
**Plans**: TBD

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.9.11 MVP | 15 (0–13) | 71/71 | ✅ Shipped | 2026-05-17 |
| v0.9.12 Quick Wins | 2 (14–15) | 0/~7 | 🟢 Planning | — |

### v0.9.12 Phase Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 14. Raster z=0.5 Idle Content Infill | 0/~4 | Not started | — |
| 15. Deepgram Keyterm + Entity-Pack | 0/~3 | Not started | — |

---
*Last reorganized: 2026-05-17 — v0.9.12 Quick Wins planning (Phases 14–15) appended after v0.9.11 MVP archive*
