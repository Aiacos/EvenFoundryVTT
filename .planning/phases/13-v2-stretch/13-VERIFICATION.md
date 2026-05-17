---
phase: 13-v2-stretch
status: human_needed
human_needed_reason: "SC-13-01 — reaction prompt UAT on real Foundry world with dnd5e 5.3.3 (real R1 gesture → Shield/Counterspell/OA execution); SC-13-02 — portrait fidelity on real G2 phosphor display at 100×60 4-bit greyscale. All software deliverables verified by automated tests."
hardware_pending_scs:
  - id: SC-13-01
    description: "Real Foundry world + dnd5e 5.3.3 — NPC attack triggers r1.reaction.available → 500ms debounce → ReactionPromptPanel at z=2 → [Y] R1 tap → Shield chat card / Counterspell ability check / Opportunity Attack via Ready Action; 5s timeout dismisses without fire"
    target: "Reaction execution round-trip working end-to-end on hardware (ACT-04)"
    runbook: "docs/field-test-template.md §3 (reaction UAT)"
  - id: SC-13-02
    description: "Real G2 phosphor display — Bio tab portrait renders as recognizable 100×60 4-bit greyscale image in bottom-right quadrant; INV-1 textual layout character-perfect around portrait; portrait cached on second open (no fetch delay)"
    target: "STRETCH-06 portrait fidelity at 4-bit dithered phosphor green"
    runbook: "docs/field-test-template.md §4 (portrait fidelity)"
running_hardware_pending_total: 35
last_updated: "2026-05-17"
---

# Phase 13 Verification — V2 Stretch (ACT-04 + STRETCH-06)

Goal-backward audit of Phase 13 success criteria. Each SC maps to automated evidence and the plan that delivers it. 7 STRETCH items (STRETCH-01..05, 07, 08) explicitly deferred to post-v0.9.11 milestones per 13-CONTEXT.md.

## Success Criteria Audit

### SC 1: Reaction execution flow (ACT-04)

Shield consume reaction slot; Counterspell ability check; Opportunity Attack via Ready Action — promoted from REACT-01 passive notification.

| Item | Status | Evidence |
|------|--------|----------|
| cast-shield handler — consumeReactionSlot + executeAsGM + chat card | PASS | `RH-SHIELD-01..06` in `packages/foundry-module/src/reactions/reaction-handlers.test.ts` — bearer + idempotency + tool.invoke dispatch; reaction slot accounted |
| cast-counterspell handler — ability check via MidiQOL fallback | PASS | `RH-CS-01..06` in same test file — level gating (≥5 + spell slot available); Counterspell channel via MidiQOL when present |
| opportunity-attack handler — Ready Action via executeAsGM | PASS | `RH-OA-01..06` in same test file — melee reach validation; Ready Action queued via Foundry combat turn hook |
| socketlib registrations 14 → 17 (3 new slots) | PASS | `RM-INV-01` in `socketlib-invariant.test.ts` — grep-based count assertion; module.test flip confirmed |
| ReactionPromptPanel z=2 — 500ms debounce + 5s auto-timeout | PASS | `RPD-01..10` in `packages/g2-app/src/panels/reaction-prompt-dispatcher.test.ts` — fake timers verify debounce prevents double-mount; 5s fires destroy |
| Concurrent reaction envelope dropped while panel mounted | PASS | `RPD-04` — second r1.reaction.available silently dropped (panel lock guard) |
| ReactionPromptPanel INV-1 fixtures (3 states: shield/counterspell/oa) | PASS | `RPP-FIX-01..03` in `packages/g2-app/src/panels/__tests__/reaction-prompt-panel.test.ts` — matchAsciiFixture on all 3 layouts |
| combat-action-tracker reaction slot accounting | PASS | `CAT-REACT-01..04` — tracker debits reaction slot on ACT-04 dispatch; accounting integrated with action-economy-state |
| ISM-13-01..04 integration smoke (reaction-prompt end-to-end) | PASS | `ISM-13-01..04` in `packages/g2-app/src/__tests__/13-integration-smoke.test.ts` — mount on message, WS unsubscribe on detach, auto-timeout destroy, concurrent-drop guard |
| SC-13-01: real Foundry world UAT | **HUMAN_NEEDED** | Requires physical R1 + Foundry world + dnd5e 5.3.3. Runbook: `docs/field-test-template.md §3`. ADR-0005 PROVISIONAL Branch A carry. |

**Verdict:** PASS (software-complete). SC-1 hardware-interactive portion deferred to hardware availability.

---

### SC 2: STRETCH-06 Sheet portrait behind feature flag

Bio tab portrait (100×60 4-bit dithered) behind `view.features.portrait` Even Hub key (default `'off'`).

| Item | Status | Evidence |
|------|--------|----------|
| portrait-state cache — get/set/clear per actorId | PASS | `PS-01..04` in `packages/g2-app/src/panels/portrait-state.test.ts` — module-scoped Map; round-trip; partial clear; full clear |
| portrait-dispatcher — double trust boundary (EnvelopeSchema → PortraitReadyPayloadSchema) | PASS | `PD-01..06` in `packages/g2-app/src/panels/portrait-dispatcher.test.ts` — non-JSON, malformed envelope, wrong type, malformed payload all rejected; happy path stores bytes |
| Bridge GET /v1/portrait/:actorId — SSRF deny-list + SHA-256 cache | PASS | `PC-01..09` + `PR-RENDER-01..06` in `packages/bridge/src/portrait/` tests — LRU+TTL cache; SSRF block (localhost/private IP/SMB); image-q+upng-js dither pipeline |
| portrait.url in CharacterSnapshot + character-reader | PASS | `CS-PORT-01..04` in `packages/shared-protocol/src/__tests__/` + `CR-PORT-01..03` in foundry-module — snapshot schema carries portrait.url; character-reader extracts from actor.img |
| MapBaseLayer.setPortraitOverride — slot 3 override in draw() | PASS | `MBL-PORT-01..05` in `packages/g2-app/src/raster/map-base-layer.test.ts` — stores override; draw() calls bridge.updateImageRawData for slot 3; clearing override stops calls; getContainerCount raster={image:4,text:1} / glyph={image:0,text:1} |
| CharacterSheetPanel Bio tab — portrait flag + bytes → setPortraitOverride | PASS | `CHSP-PORT-01..08` in `packages/g2-app/src/panels/__tests__/character-sheet-panel.test.ts` — flag 'on'+bio+bytes → setPortraitOverride called; 'off' → not called; non-bio tab → not called; unmount → clear |
| INV-1 fixtures — Bio with and without portrait | PASS | `CHSP-FIX-PORT-01..02` in character-sheet-panel.test.ts — matchAsciiFixture on sheet-bio-with-portrait.it.txt + sheet-bio-without-portrait.it.txt |
| boot-engine wires attachPortraitHandler + attachReactionPromptHandler | PASS | `ISM-13-05` in 13-integration-smoke.test.ts — portrait-state bytes cached after r1.portrait.ready fire; ISM-13-06 — setPortraitOverride called on Bio tab with cached bytes |
| clearPortraitBytes() on teardown | PASS | boot-engine-core.ts teardown chain calls clearPortraitBytes(); ISM-13-09 — unmount clears slot |
| Container budget math (raster + portrait ON + sheet bio open) | PASS | `ISM-13-10` — budget assertion: z=0 (image:4, text:1) + z=1 status-hud (image:0, text:1) + z=2 sheet bio (image:0, text:3) = 4 image ≤ 4 cap, 5 text ≤ 8 cap. Portrait occupies a MapBaseLayer image SLOT, not a new container; budget passes trivially. |
| SC-13-02: portrait fidelity on real G2 phosphor display | **HUMAN_NEEDED** | Requires real G2 hardware + view.features.portrait='on'. Runbook: `docs/field-test-template.md §4`. ADR-0005 PROVISIONAL Branch A carry. |

**Verdict:** PASS (software-complete) / HUMAN_NEEDED (SC-13-02 hardware gate).

---

### SC 3: socketlib count FLIPS 14 → 17 + container budget ≤ SDK cap

| Item | Status | Evidence |
|------|--------|----------|
| registerComplexHandler count = 17 | PASS | Verified by grep: `grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts` → **17** |
| 3 new slots: evf.castShield + evf.castCounterspell + evf.opportunityAttack | PASS | `RM-INV-01` + `RM-NEW-01..03` in socketlib-invariant.test.ts — each slot verified present |
| Container budget SDK cap (4 image / 8 text) not exceeded | PASS | `ISM-13-10` — static budget math verified in integration smoke |
| Portrait uses MapBaseLayer image SLOT (no new container) | PASS | CharacterSheetPanel.getContainerCount stays {image:0, text:1} (D-13-08 final decision) |

**Verdict:** PASS (all automated).

---

## REQ-ID Coverage

| REQ-ID | Description | Plans | Status |
|--------|-------------|-------|--------|
| ACT-04 | Reaction execution (Shield + Counterspell + OA) — 3 handlers | 13-01 (handlers + socketlib), 13-02 (prompt panel + dispatcher), 13-04 (integration + wiring) | CLOSED (software) |
| STRETCH-06 | Sheet/Token portrait — Bio tab image behind feature flag | 13-03 (bridge pipeline), 13-04 (g2-app consumer + wiring) | CLOSED (software) |

7 deferred: STRETCH-01 (multi-player sync), STRETCH-02 (DSN raster stream), STRETCH-03 (biometric cues), STRETCH-04 (headless Foundry bridge), STRETCH-05 (advanced dither), STRETCH-07 (dnd5e v6 adapter), STRETCH-08 (PF2e) — all explicitly out of v0.9.11 scope per 13-CONTEXT.md.

## STRIDE Threat Register (Phase 13 disposition)

| Threat ID | Category | Status |
|-----------|----------|--------|
| T-13-01 | SSRF via portrait URL | Mitigated — Plan 13-03 bridge-side deny-list (localhost / 127.0.0.0/8 / 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16 / file:// / smb:// blocked); SHA-256 cache key; PC-01..09 GREEN |
| T-13-02 (carried) | SSRF (g2-app side) | Mitigated — g2-app trusts bridge's already-rendered bytes; no client-side URL fetch; schema-validated via PortraitReadyPayloadSchema |
| T-13-03 | Portrait cache poisoning at WS boundary | Mitigated — Double trust boundary: EnvelopeSchema.safeParse → narrow on R1_PORTRAIT_READY_TYPE → PortraitReadyPayloadSchema.safeParse; urlHash regex `/^[0-9a-f]{64}$/` guard; PD-01..06 GREEN |
| T-13-04 | Reaction handler bypass via direct bridge call | Mitigated — All 3 handlers routed through dispatchTool (bearer + idempotency + audit); boot-engine attaches portrait dispatcher AFTER bearer validation; RH-SHIELD-01..06 + RH-CS-01..06 + RH-OA-01..06 GREEN |

## 17-Socketlib-Handler Invariant

Phase 13 FLIPS the invariant from **14 → 17** (3 new reaction handler slots added in Plan 13-01).

```bash
grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts
# → 17
```

**New slots added in Plan 13-01:**
- `evf.castShield` — Shield reaction handler
- `evf.castCounterspell` — Counterspell reaction handler
- `evf.opportunityAttack` — Opportunity Attack reaction handler

**Prior 14 slots** (Phases 7–9; count never exceeded across Phases 10–12 closures): cast-spell, weapon-attack, use-item, move-token, confirmTemplatePlacement, multiattack-next, dropConcentration, manualCastSpell, manualAttack, manualUseItem, completeManualAction, cancelManualAction, rotateMoveDirection, confirmMove.

Test assertion: `RM-INV-01` in `packages/foundry-module/src/__tests__/socketlib-invariant.test.ts` (`grep count === 17`). This assertion MUST be updated if Phase 14+ adds or removes handlers.

## Hardware-Pending Carry-Forward

| SC | Description | Runbook |
|----|-------------|---------|
| SC-13-01 | Real Foundry world + R1 reaction UAT (Shield / Counterspell / OA end-to-end) | `docs/field-test-template.md §3` |
| SC-13-02 | Real G2 portrait fidelity at 100×60 4-bit phosphor greyscale | `docs/field-test-template.md §4` |

Running hardware-pending total: **35** (33 from Phase 12 closure + 2 from Phase 13).

Prior 33 items:
- Phase 4a (5): capability handshake + raster fps + glyph fallback + INV-1 phosphor + PIXI canvas
- Phase 4b (5): overlay z=2 + toast BLE + boot error states + death-saves pivot + concentration-drop modal
- Phase 5 + 6 (3): field-test SC-05-x
- Phase 7 (5): SC-07-01..05 (real executeAsGM write path)
- Phase 8 (3): SC-08-01..03 (spellbook + QA-bar + action-result toast)
- Phase 9 (3): SC-09-01..03 (action economy widget + conc-drop + slot picker)
- Phase 10 (3): SC-10-01..03 (multi-session field test + latency p50 + microwave RF)
- Phase 11 (0): pure software — no hardware SCs
- Phase 12 (1): SC-12-01 (voice flow end-to-end)

Close via `pnpm --filter @evf/validation-harness validate:all` (with G2 + R1 hardware + Deepgram key + consenting DM available) once hardware is accessible.
