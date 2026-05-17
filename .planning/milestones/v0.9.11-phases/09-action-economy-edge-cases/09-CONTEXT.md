# Phase 9: Action Economy & Edge Cases — Context

**Gathered:** 2026-05-16
**Status:** Ready for planning
**Source:** smart-discuss (autonomous batch — 2 areas accepted)

<domain>
## Phase Boundary

Action / Bonus / Reaction enforcement visible and binding; concentration drop, multi-attack, and slot consumption all behave correctly under real combat sequencing.

**Phase 9 ships:**
1. **Action Economy Widget** in StatusHudRenderer footer — `Az ▓ Bn ░ R▓ Mov 25/30` style chip. ~22 chars.
2. **`combat-action-tracker.ts`** (foundry-module) — Hooks.on('createChatMessage', updateCombat) increments per-combatant action/bonus/reaction counters; resets on turn change. Emits `r1.action.economy` envelope per change.
3. **Client-side preconditioner** in ActionOptionsModal — blocks invalid actions BEFORE dispatch (saves round-trip).
4. **Concentration drop wiring** — wires Phase 4b modal trigger to Phase 7 handler. Cast handler detects active concentration → pauses dispatch, modal opens, Y → drop-concentration tool.invoke → cast resumes; N → cast aborted.
5. **Multi-attack Action consumption math** — single Action consumed for entire multi-attack sequence (grouped by `attackId`).
6. **`SlotPickerPanel`** — new OverlayPanel z=2 for upcast/downcast spell-slot selection. Scroll cycles available levels.
7. **Reaction-slot accounting** — REACT-01 from Phase 7 displays the toast; Phase 9 wires the widget's `R▓` counter to fire when reaction-prompt envelope arrives.

**NOT in scope:**
- Reaction execution (ACT-04) — V2.
- Movement budget — Phase 8 already shipped `Mov 25/30`.
- New write-path handlers — all reuse Phase 7 infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Action Economy Widget + Client-Side Preconditioner

- **Widget location:** Status HUD footer row, below the R1 context chip from Phase 6. Format: `Az ▓ Bn ░ R▓ Mov 25/30` (22 chars). Glyphs: `▓` = used / `░` = available.
- **i18n keys:** `econ.action.short` (IT: `Az` / EN: `Ac` / DE: `Akt`), `econ.bonus.short` (IT: `Bn` / EN: `Bn` / DE: `Bn`), `econ.reaction.short` (IT: `R` / EN: `R` / DE: `R`), `econ.move.budget` (existing from Phase 8).
- **`combat-action-tracker.ts`** (`packages/foundry-module/src/write-path/combat-action-tracker.ts`):
  - Hooks: `createChatMessage` (filter `flags.evf.audit.toolId in ['cast-spell', 'weapon-attack', 'use-item']` → increment counters) + `updateCombat` (turn change → reset counters for the new combatant).
  - State: per-combatant counters `{ actionsUsed, bonusActionsUsed, reactionsUsed }` (`{0|1, 0|1, 0|1}` — most actions cap at 1 per turn).
  - Emit `r1.action.economy` envelope per state change (delta-emit only).
- **`ActionEconomyPayloadSchema`** (`packages/shared-protocol/src/payloads/action-economy.ts`):
  ```ts
  ActionEconomyPayloadSchema = z.strictObject({
    actionsUsed: z.number().int().min(0).max(1),
    bonusActionsUsed: z.number().int().min(0).max(1),
    reactionsUsed: z.number().int().min(0).max(1),
    multiAttackInProgress: z.boolean(),
    recipientUserId: z.string(),
  });
  ```
- **Client-side preconditioner** in `ActionOptionsModal.onEvent(tap)`:
  - Pre-dispatch check: lookup `actionEconomyState` (from action-economy-dispatcher). If action requires Action slot AND `actionsUsed >= 1` AND NOT in multi-attack → emit error toast `error.action.already-used-action` + abort.
  - Same for Bonus actions (`bonusActionsUsed >= 1` → block).
  - Reactions are server-validated only (passive notification surface — REACT-01).

### Area 2: Concentration + Multi-Attack + Slot Upcast UX

- **Concentration drop wiring:**
  - Phase 7 `cast-spell` handler is updated to check `actor.effects` for active concentration before calling `activity.use`.
  - If concentration active → handler returns `{ success: false, error: 'concentration-required', existingEffect: <name> }`.
  - g2-app `action-result-dispatcher` (Phase 8) routes `concentration-required` error to `concentration-drop-modal` (Phase 4b) instead of toast.
  - Modal Y tap → `drop-concentration` tool.invoke (Phase 7) → on success, retry the original cast.
  - Modal N tap → cast aborted, error toast `error.action.concentration-cancelled`.
- **Multi-attack Action consumption:**
  - `combat-action-tracker` filters `createChatMessage` events by `flags.evf.audit.attackId`. Multiple chat-cards with the same `attackId` count as ONE Action (`actionsUsed += 1` on first card, no-op on subsequent).
  - `multiAttackInProgress: true` while `attackId` group is incomplete. Widget shows `Az ▓ [Atk N/M]` during the sequence; reverts to `Az ▓ Bn ░ R░ ...` when complete.
- **`SlotPickerPanel`** (`packages/g2-app/src/panels/slot-picker-panel.ts`):
  - OverlayPanel z=2 (Strategy A single 'overlay-block').
  - Shown when casting a spell with N>1 available slot levels (1st through 9th, filtered to non-empty slots).
  - Scroll-up/down cycles available levels. Active = `▶ N° (X/Y disponibili)` row.
  - Tap = confirm + dispatch `cast-spell` tool.invoke with `slotLevel: <selected>`.
  - Default selection = spell's base level (lowest sufficient slot).
  - Auto-skip: if only one slot level available, panel NOT shown (cast directly at that level).
  - Phase 7 `cast-spell` handler extended to accept `slotLevel` argument.

### Area 3: Plan Decomposition (anticipated)

| Wave | Plan | Title | REQ |
|------|------|-------|-----|
| 0 | 09-01 | ActionEconomyPayloadSchema + combat-action-tracker hook subscription + action-economy-dispatcher in g2-app | COMB-02 (telemetry) |
| 1 | 09-02 | Action Economy Widget in StatusHudRenderer footer + client-side preconditioner in ActionOptionsModal + i18n keys + INV-1 fixtures | COMB-02 (widget + block) |
| 2 | 09-03 | Concentration drop wiring (Phase 7 cast handler check + Phase 4b modal routing + retry flow) + integration tests | concentration closure |
| 3 | 09-04 | SlotPickerPanel + cast-spell handler slotLevel arg extension + INV-1 fixtures | COMB-02 (slot upcast) |
| 4 | 09-05 | ISM-W9-01..10 integration smoke + Phase 9 closure (STATE/ROADMAP/VERIFICATION) | closure |

5 plans, mostly sequential (each consumes prior wave's outputs).

### Area 4: Threat Model

- T-09-01: Action economy desync (client thinks 0 actions used, server thinks 1). Mitigated: server-side validation in handlers (re-check from chat-card history before executing). Client-side preconditioner is OPTIONAL fast-path; never source of truth.
- T-09-02: Multi-attack attackId collision (two players' attacks share an attackId). Mitigated: handler generates attackId as UUID v4 + combatantId composite.
- T-09-03: Concentration retry race (player taps Y then immediately attempts a different cast). Mitigated: retry is single-attempt; subsequent casts must be independent dispatches.

### Area 5: Hardware-Pending SC (carry to ADR-0005 Branch A)

- SC-09-01: Action Economy Widget renders character-perfect on real G2.
- SC-09-02: Concentration drop end-to-end on real Foundry world + dnd5e 5.3.3.
- SC-09-03: SlotPickerPanel scroll-cycle feels right on real R1.

3 items. Running project total after Phase 9: **26 + 3 = 29 hardware-pending SCs**.

</decisions>

<canonical_refs>
## Canonical References

- packages/foundry-module/src/write-path/audit-log.ts (Phase 7 — audit flag pattern)
- packages/foundry-module/src/write-path/handlers/cast-spell.ts (Phase 7 — extend with concentration check + slotLevel arg)
- packages/foundry-module/src/write-path/handlers/weapon-attack.ts (Phase 7 — Path B loop)
- packages/foundry-module/src/write-path/combat-movement-tracker.ts (Phase 8 — pattern for combat-action-tracker)
- packages/foundry-module/src/write-path/action-result-watcher.ts (Phase 8 — hook pattern)
- packages/g2-app/src/panels/action-options-modal.ts (Phase 8 — extend with preconditioner)
- packages/g2-app/src/panels/concentration-drop-modal.ts (Phase 4b — reuse for concentration wiring)
- packages/g2-app/src/panels/target-picker-panel.ts (Phase 8 — exemplar for SlotPickerPanel)
- packages/g2-app/src/status-hud/status-hud-renderer.ts (extend with widget row)
- packages/shared-protocol/src/payloads/action-result.ts (Phase 8)
- Specs.md §7.6 (combat tracker + action economy mockup)
- REQ COMB-02 (Action economy widget + enforcement)

</canonical_refs>

<specifics>
## Specifics

### Status HUD footer with widget

```
║ R1: tap=cycle  scroll=nav  long=quick   Az ▓ Bn ░ R░  Mov 25/30  ║
                                          ^^^^^^^^^^^^  ^^^^^^^^^^
                                          Phase 9        Phase 8
```

### SlotPickerPanel mockup

```
┌──────────────────────────────────────────────┐
│ INCANTESIMO: Palla di Fuoco                  │
│ Livello base 3°                              │
│                                              │
│   3°  (2/4 disponibili)                      │
│ ▶ 4°  (3/3 disponibili)  ← upcast +1d6       │
│   5°  (1/2 disponibili)  ← upcast +2d6       │
│                                              │
│  [tap] conferma  [long] annulla              │
└──────────────────────────────────────────────┘
```

</specifics>

<deferred>
## Deferred Ideas

- **Reaction execution from preconditioner** — V2 (ACT-04).
- **Bonus action cooldown tracking** — same-turn bonus action limit is the only constraint; cross-turn cooldowns not in 5e.
- **Movement budget enforcement** — Phase 8 already ships `Mov 25/30` chip; Phase 9 doesn't extend.

</deferred>

---

*Phase: 09-action-economy-edge-cases*
*Context gathered: 2026-05-16 via /gsd-autonomous smart-discuss batch (2 areas)*
