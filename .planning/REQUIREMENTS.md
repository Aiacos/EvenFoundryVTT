# Requirements: EvenFoundryVTT (EVF) — v0.9.12 Quick Wins

**Defined:** 2026-05-17
**Milestone goal:** Land two high-value software-only improvements that build on v0.9.11 MVP — without requiring Even Hub hardware access.
**Core Value:** Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.
**Source:**
- [Specs.md](../Specs.md) v0.9.11 §7 (layered model) + §7.4c (idle content infill — to be amended for INFILL-*)
- `.planning/quick/20260514-raster-dynamic-infill/PLAN.md` (carry-forward for INFILL-*)
- `.planning/quick/20260517-voice-intent-research/RESEARCH.md` (research basis for VOICE-06..09)
- `.planning/milestones/v0.9.11-phases/12-v2-voice-ux-tuning/` (Phase 12 baseline — Deepgram Nova-3 + spell-lookup integration)

## v1 Requirements

9 requirement totali, distribuiti su 2 categorie. Tutti software-only — nessun hardware-gate. Carry-forward dei 35 SC `human_needed` v0.9.11 sotto ADR-0005 Branch A invariato (non riconsiderati in questo milestone).

### Raster Pipeline Extension

z=0.5 Idle Content Infill — nuovo layer tra mappa raster (z=0) e Status HUD (z=1). Riempie le righe vuote del map-area in raster mode quando nessun overlay z=2 è montato. Auto-demolisce su mount di overlay.

- [ ] **INFILL-01**: z=0.5 Idle Content Infill layer formalizzato nel layered model (Specs.md §7.2 amendment) — nuovo layer enumerato + state machine
- [ ] **INFILL-02**: 3 dynamic text containers (combat-log mini · z=0.5 label · stats strip) popolano le righe vuote del map-area in raster mode quando no overlay z=2 mounted
- [ ] **INFILL-03**: Auto-demolish on z=2 overlay mount (no race condition; differential demolish via existing LayerManager.bundle() — Phase 4b Wave-0 pattern)
- [ ] **INFILL-04**: ADR-0001 amendment formalizing z=0.5 layer (consistent with single-capture-container premise; no semantic change to z=0/1/2 — additive only)
- [ ] **INFILL-05**: INV-1 fixtures for idle-fill states + overlay-mount transitions (snapshot-test discipline §7.14.4 ck 11–15)

### Voice Recognition Quality

Deepgram Keyterm Prompting integration in Phase 12 voice pipeline. Boost +625% entity-recall su nomi esotici (Bigby's Hand, Counterspell, etc.) via vocabolario keyterm dinamico Foundry-derived.

- [ ] **VOICE-06**: Deepgram Keyterm Prompting parameter integrazione in `deepgram-stt.ts` — Phase 12 enhancement (Nova-3 Multilingual supporta `keyterm` parameter)
- [ ] **VOICE-07**: Keyterm vocabulary fed from BOTH static spell-lookup (70 SRD entries) AND dynamic entity-pack (Foundry-derived items/weapons/armor/NPCs/monsters; from quick-task 260517-k2g)
- [ ] **VOICE-08**: Locale-aware keyterm — IT + EN both included for cross-lingual STT robustness (player può code-switch "fireball" / "palla di fuoco" intra-frase)
- [ ] **VOICE-09**: Keyterm hot-update via WS delta — quando entity-pack o spell-pack changes, keyterm list refreshes nello STT client (same `/internal/delta` channel; no socketlib handler add)

## v2 Requirements

(Carry from v0.9.11 — see `.planning/milestones/v0.9.11-REQUIREMENTS.md` for full V2 list including VOICE-01..05, ACT-04, STRETCH-01..08.)

## Out of Scope (this milestone)

| Feature | Reason |
|---------|--------|
| Hardware validation (35 SC `human_needed`) | No Even Hub access this cycle — carry-forward under ADR-0005 Branch A unchanged |
| Picovoice Rhino edge classifier | Conditional on SC-12-01 hardware test (p50 > 800ms threshold) — not yet measurable |
| MCP polish / V2 hardening (auth · multi-client · error UX) | Future milestone; v0.9.12 stays focused on quick wins |
| Specs.md global bump v0.9.11 → v0.9.12 numbering | Phase 14 (INFILL spec bump) is the only artifact that requires Specs.md edit; full version bump deferred to phase-close INV-3 atomic commit |
| RTL languages | ADR-0007 reserved — V2 stretch |
| STRETCH-01..05, 07, 08 | All explicitly carried forward unchanged from v0.9.11 |

## Milestone status

Milestone v0.9.12 Quick Wins — **planning** (REQUIREMENTS defined; ROADMAP pending roadmapper).

## Traceability

To be populated by `gsd-roadmapper` agent. Expected: 9 v1 REQ-IDs mapped 1:1 to phases (INFILL-* → Phase 14 candidate; VOICE-* → Phase 15 candidate).

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFILL-01..05 | (pending roadmap) | Active |
| VOICE-06..09 | (pending roadmap) | Active |

**Coverage:**
- v1 requirements: **9** total (Raster 5 · Voice 4)
- Mapped to phases: pending
- V2 OPZIONALE: carry from v0.9.11 unchanged

---

*Requirements defined: 2026-05-17 — derived from quick-task PLAN.md (raster) + voice-intent-research RESEARCH.md (Deepgram Keyterm)*
*Traceability mapped: pending roadmapper*
*Last updated: 2026-05-17 at milestone v0.9.12 Quick Wins planning start*
