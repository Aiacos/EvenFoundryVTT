# Phase 8: Manual Action UX — Context

**Gathered:** 2026-05-16
**Status:** Ready for research + planning
**Source:** smart-discuss (autonomous batch — 2 areas accepted)

<domain>
## Phase Boundary

Player can cast a spell, use an item, attack, or move entirely via R1 from G2 overlays; every action surfaces a result toast.

**Phase 7 delivered:** Tool Registry + 7 real handlers (cast-spell, weapon-attack, use-item, move-token, place-template, drop-concentration + audit log). All mutations go through `dispatchTool` → `socketlib.executeAsGM`. CI Gate 8 enforces single-workflow-origin. Bridge `handleToolInvoke` routes `tool.invoke` envelopes.

**Phase 8 wires:**
1. **`ActionOptionsModal`** — long-press on Spellbook/Inventory row opens modal `[Tap=cast/use] [Long=details]`. Confirm-tap dispatches the matching tool envelope.
2. **`TargetPickerPanel`** (new OverlayPanel z=2) — scrolling list of valid targets. Used by spell-cast and weapon-attack flows. Empty list → "Nessun bersaglio" hint + auto-close 2s.
3. **`MoveDirectionPicker`** (new OverlayPanel z=2) — 8-direction (N/NE/E/SE/S/SW/W/NW) scroll-cycle for `move-token`. Distance budgeted by remaining movement; chip `Mov 25/30`.
4. **`createChatMessage` Foundry hook** in foundry-module — filters for `flags.evf.audit.idempotencyKey` match, emits `r1.action.result` envelope `{ d20, outcome, damage, status }`. g2-app dispatcher renders result toast via Phase 4b ToastQueueLayer.
5. **Error toast taxonomy** — 5 typed errors: `no-targets / out-of-range / out-of-resource / wrong-turn / gm-rejected`. Each maps to `error.action.<kind>` i18n key.
6. **Quick-action bar wiring** in CombatTrackerPanel (Phase 5 rendered the bar; Phase 6 routes long-press to Quick Action menu; Phase 8 wires the `[A][S][I][M]` keys to action flows).

**NOT in scope:**
- Reaction execution (ACT-04) — V2.
- Action Economy enforcement (COMB-02) — Phase 9.
- Concentration drop confirmation flow (CONC-01) — already in Phase 4b/7.
- AoE template placement — already in Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Action Flow Choreography

- **Launch surface:** Long-press on a row in SpellbookPanel or InventoryPanel opens `ActionOptionsModal` (new OverlayPanel at z=2). Modal shows `[Tap = cast/use] [Long-press = details]`. Confirm-tap dispatches the action's `tool.invoke` envelope.
  - Quick-action bar `[A]ttack [S]pell [I]tem [M]ove` in CombatTrackerPanel: tapping a key (Phase 6 routes the gesture via R1 event source → top layer) opens the action-type-specific flow.
    - `[A]` → opens weapon-attack flow (default weapon from `actor.system.weapons.preferred` or first equipped). For Fighter L5+, automatically uses `count: <extraAttacks>`.
    - `[S]` → opens SpellbookPanel.
    - `[I]` → opens InventoryPanel.
    - `[M]` → opens MoveDirectionPicker.
- **Target picker:** `TargetPickerPanel` (new OverlayPanel at z=2):
  - Source: `combat.turns` filtered by spell/attack range (estimated via `actor.system.attributes.distance`). For non-combat, all visible scene tokens.
  - Scrolling list with `▶` active-target indicator.
  - Tap = confirm + dispatch tool envelope.
  - Double-tap = cancel (popOverlay restores caller).
  - Empty list: render `Nessun bersaglio` hint (locale-aware) + auto-close after 2s via `setTimeout(panelRouter.popOverlay, 2000)`.
- **Result toast:** Reuse Phase 4b ToastQueueLayer with new typed payloads:
  - Success: `[d20=18] Colpito! 1d8+3 = 7 sl` (cast/attack) or `[Uso] Pozione: HP 24/30 → 36/30` (item use).
  - Failure (attack miss): `[d20=4] Mancato`.
  - Failure (save success vs spell): `[d20=15 vs DC 13] Save ✓`.
  - Error: `❌ <localized error>`.
  - Dwell 3s (existing Phase 4b default).

### Area 2: Action Result Telemetry + Error Handling

- **Chat-card → toast linkage** (`packages/foundry-module/src/write-path/action-result-watcher.ts`):
  - `Hooks.on('createChatMessage', (msg, opts, userId) => …)` filters for `msg.flags?.evf?.audit?.idempotencyKey`.
  - When match: extract `d20`, `outcome` ('hit' | 'miss' | 'save_success' | 'save_fail' | 'damage_dealt'), `damage` (e.g., `'7 sl'`), and `status` ('success' | 'failure').
  - Emit `r1.action.result` envelope via `socketlib.executeForUser(playerId, ...)`.
  - g2-app `action-result-dispatcher.ts`: receives envelope, parses via Zod, queues toast via ToastQueueLayer (severity = `success | warn | error` based on outcome).
- **`r1.action.result` envelope schema** (`packages/shared-protocol/src/payloads/action-result.ts`):
  ```ts
  ActionResultPayloadSchema = z.object({
    idempotencyKey: z.string().uuid(),
    toolId: ToolIdSchema,
    d20: z.number().int().nullable(),
    outcome: z.enum(['hit', 'miss', 'save_success', 'save_fail', 'damage_dealt', 'no_roll']),
    damage: z.string().optional(),
    status: z.enum(['success', 'failure', 'error']),
    errorKind: z.enum(['no-targets', 'out-of-range', 'out-of-resource', 'wrong-turn', 'gm-rejected']).optional(),
  });
  ```
- **5 error toast types** (i18n keys + budgets):
  - `error.action.no-targets` IT: `Nessun bersaglio` / EN: `No targets`
  - `error.action.out-of-range` IT: `Fuori portata` / EN: `Out of range`
  - `error.action.out-of-resource` IT: `Risorse esaurite` / EN: `Out of resources`
  - `error.action.wrong-turn` IT: `Non il tuo turno` / EN: `Not your turn`
  - `error.action.gm-rejected` IT: `Rifiutato dal GM` / EN: `GM rejected`
  - Width budget: ≤ 28 chars (toast row budget). All 5 fit canonical IT/EN/DE.
- **Move-token UX (`MoveDirectionPicker`):**
  - 8 directions scroll-cycled: N/NE/E/SE/S/SW/W/NW.
  - Active direction shown with `▶` indicator.
  - Movement step = 5 ft per tap (default). Distance budget: `actor.system.attributes.movement.walk - movementUsedThisTurn`.
  - Chip in StatusHudRenderer footer during move-mode: `Mov 25/30` (5 ft consumed of 30 ft total).
  - Confirm-tap commits via `move-token` handler with computed `{ x, y }` delta. Foundry's hex/grid math determines actual landing tile.
  - Cancel via double-tap.

### Area 3: Plan Decomposition (anticipated)

| Wave | Plan | Title | REQ |
|------|------|-------|-----|
| 0 | 08-01 | ActionResultPayloadSchema + action-result-watcher (createChatMessage hook) + action-result-dispatcher + 5 error i18n keys | ACT-01 (telemetry foundation) |
| 1 | 08-02 | TargetPickerPanel + target-picker-dispatcher + empty-targets hint + INV-1 fixtures | ACT-01 (target selection) |
| 1 | 08-03 | ActionOptionsModal + Spellbook/Inventory long-press wiring + INV-1 fixtures | ACT-01 (launch surface) |
| 2 | 08-04 | MoveDirectionPicker + StatusHud move-chip + move-token integration | ACT-01 (move variant) |
| 2 | 08-05 | Quick-action bar wiring `[A][S][I][M]` in CombatTrackerPanel + integration smoke ISM-W8-01..10 + Phase 8 closure | ACT-01 (combat flow) |

Wave 1 plans (08-02 + 08-03) have disjoint files — runnable in parallel. Same for Wave 2 (08-04 + 08-05). RESEARCH must verify.

### Area 4: Test Discipline

- Tests colocated per Phase 4b convention.
- INV-1 fixtures for new panels: TargetPickerPanel (3 states), ActionOptionsModal (2), MoveDirectionPicker (3). ~8 new fixtures.
- Hardware-pending SC (carry to ADR-0005 Branch A): SC-08-01 (real chat-card → toast latency p95 ≤ 400ms), SC-08-02 (target picker feels right on real R1 + G2). ~2-3 items.

### Area 5: Security Threat Model

- T-08-01: Action-result envelope forgery (player intercepts and forges a "success" toast for an action that failed). Mitigated: dispatcher validates envelope via `socketlib` user check (only GM-side hooks can emit).
- T-08-02: Action result for another player's action leaking. Mitigated: `socketlib.executeForUser(playerId)` scopes the emission.

</decisions>

<canonical_refs>
## Canonical References

- packages/foundry-module/src/write-path/* (Phase 7 — Tool Registry + handlers)
- packages/g2-app/src/panels/spellbook-panel.ts (Phase 5 — long-press wiring target)
- packages/g2-app/src/panels/inventory-panel.ts (Phase 5 — long-press wiring target)
- packages/g2-app/src/panels/combat-tracker-panel.ts (Phase 5 — quick-action bar wiring target)
- packages/g2-app/src/panels/concentration-drop-modal.ts (Phase 4b — modal exemplar for ActionOptionsModal)
- packages/g2-app/src/panels/template-placement-panel.ts (Phase 7 — panel + dispatcher exemplar)
- packages/g2-app/src/status-hud/toast-queue-layer.ts (Phase 4b — toast surface for result toasts)
- packages/g2-app/src/engine/panel-router.ts (Phase 5/6 — pushOverlay/popOverlay)
- packages/foundry-module/src/write-path/reaction-watcher.ts (Phase 7 — Hooks.on pattern for action-result-watcher)
- packages/shared-protocol/src/payloads/r1.ts (Phase 6 — envelope wrapping pattern)
- Specs.md §7.10 — Action result toast (State 3 — reused without voice).

</canonical_refs>

<specifics>
## Specific Ideas

### ActionOptionsModal mockup

```
┌──────────────────────────────────────────────┐
│ AZIONE: Palla di Fuoco                       │
│                                              │
│  [tap]   Lancia incantesimo                  │
│  [long]  Mostra dettagli                     │
│  [×2]    Annulla                             │
└──────────────────────────────────────────────┘
```

### TargetPickerPanel mockup

```
┌──────────────────────────────────────────────┐
│ BERSAGLIO                                    │
│                                              │
│   1.  GOBLIN ARCHER     PF  5/15  CA 13 ★    │
│ ▶ 2.  GOBLIN BRUTO      PF 11/15  CA 14 ★    │
│   3.  CANE OMBRA        PF 18/22  CA 12 ★    │
│                                              │
│  [tap] conferma  [long] annulla              │
└──────────────────────────────────────────────┘
```

### MoveDirectionPicker mockup

```
┌──────────────────────────────────────────────┐
│ MOVIMENTO  (rimangono 25 ft)                 │
│                                              │
│        N                                     │
│   NW  ▶NE                                    │
│ W              E                             │
│   SW    SE                                   │
│        S                                     │
│                                              │
│  [tap] commit  [long] annulla                │
└──────────────────────────────────────────────┘
```

### Result toast examples

```
✓ [d20=18] Colpito! 1d8+3 = 7 sl     (success)
i [d20=4] Mancato                     (failure — info-level toast)
❌ Nessun bersaglio                   (error)
```

</specifics>

<deferred>
## Deferred Ideas

- **Combat action economy enforcement (COMB-02)** — Phase 9.
- **Reaction execution from a tap-fire reaction toast** — V2 (ACT-04).
- **Range estimation accuracy** — Phase 8 uses `actor.system.attributes.distance` heuristic; precise grid distance Phase 9+.
- **Multi-target spells with explicit AoE templates** — already in Phase 7. Phase 8 doesn't extend this.
- **Critical hit / fumble emphasis in result toast** — minor polish; can be added in Phase 10.

</deferred>

---

*Phase: 08-manual-action-ux*
*Context gathered: 2026-05-16 via /gsd-autonomous smart-discuss batch (2 areas)*
