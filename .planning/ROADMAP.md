# Roadmap: EvenFoundryVTT (EVF)

## Milestones

- ✅ **v0.9.11 MVP** — Phases 0–13 (shipped 2026-05-17). Full details: [`milestones/v0.9.11-ROADMAP.md`](milestones/v0.9.11-ROADMAP.md)
- ✅ **v0.9.12 Quick Wins** — Phases 14–15 (shipped 2026-05-17 · 2 phases · 8/8 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.12-ROADMAP.md`](milestones/v0.9.12-ROADMAP.md)

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

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.9.11 MVP | 15 (0–13) | 71/71 | ✅ Shipped | 2026-05-17 |
| v0.9.12 Quick Wins | 2 (14–15) | 8/8 | ✅ Shipped | 2026-05-17 |

---
*Last reorganized: 2026-05-17 — v0.9.12 Quick Wins ✅ SHIPPED + archived to `milestones/v0.9.12-ROADMAP.md`. Ready for next milestone via `/gsd-new-milestone`.*
