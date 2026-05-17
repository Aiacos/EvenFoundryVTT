# Phase 7: Foundry Module Write Path — Context

**Gathered:** 2026-05-16
**Status:** Ready for research + planning
**Source:** smart-discuss (autonomous batch — all 3 areas accepted)

<domain>
## Phase Boundary

GM-side `activity.use()` execution via `socketlib.executeAsGM` (single-workflow-origin Option A) wires up cast/attack/use end-to-end; multi-attack tracker + reaction passive-notification join MVP; concentration-drop modal write closes via the Phase 4b modal's bridge event; bearer rotation + chat-message audit log are cross-cutting infrastructure.

**Phase 6 delivered:** R1 event source + QuickActionMenuPanel + context chip + INV-5 ratified. Long-press from any panel reaches `[A] Action` menu entry — Phase 7 provides the action surface.

**Phase 7 ships:**

1. **Tool Registry** — `packages/foundry-module/src/write-path/tool-registry.ts` exports `TOOL_REGISTRY: Record<ToolId, ToolHandler>`. Bridge forwards `/v1/tools/<id>` POSTs to the module; module dispatches via registry.
2. **`socketlib.executeAsGM` handlers** (Option A single-workflow-origin) for:
   - `cast-spell` (with optional AoE template flow)
   - `weapon-attack` (with multi-attack `Atk N/M` tracker)
   - `use-item`
   - `move-token`
   - `drop-concentration` (Phase 4b's modal event → effect.delete)
3. **CI grep gate** preventing `activity.use()` calls outside the module: `! grep -rE "activity\.use\(\)" packages/g2-app packages/bridge` must exit 0.
4. **Idempotency** — 60s LRU dedup in the module; client supplies `idempotencyKey` UUID v4.
5. **AoE template placement** — `AbilityTemplate.fromActivity(activity)` array iteration; R1 tap confirms each template position; multi-template spells supported.
6. **Multi-attack tracker** — chip `[Atk 1/2]` → `[Atk 2/2]` in CombatTrackerPanel. Phase 0 §10.0.10 P2 row dictates `count` param vs client loop.
7. **Reaction passive-notification** — Foundry hooks (`dnd5e.preActivityUse`, `dnd5e.preItemUsage`) detect reaction-trigger events; module emits `r1.reaction.available` → bridge → g2-app toast queue (Phase 4b). DISPLAY-ONLY; execution stays V2 ACT-04.
8. **Bearer rotation** — 24h rotation + 60s grace; module's bearer-validator checks current OR previous (within grace); rotation events audit-logged.
9. **Chat-message audit log** — every `executeAsGM` writes a hidden chat-message with `evf-audit` flag visible only to GMs (`whisperTo: gmIds`) recording `{ tool, payload, idempotencyKey, actor, result, timestamp }`.

**NOT in scope:**
- Reaction *execution* (ACT-04) — V2.
- Voice / MCP — V2.
- Multi-player sync — Phase 13 stretch.
- Real player-side game-state mutations bypassing Foundry — architecturally impossible by design.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Single-Workflow-Origin Discipline + Tool Registry

- **Tool Registry location:** `packages/foundry-module/src/write-path/tool-registry.ts` exports `TOOL_REGISTRY: Record<ToolId, ToolHandler>` plus a `dispatchTool(toolId, payload)` function. Each handler returns a `ToolResult` (`{ success: true, data } | { success: false, error }`).
- **Tool ID enum (Phase 7 set):** `'cast-spell' | 'weapon-attack' | 'use-item' | 'move-token' | 'drop-concentration' | 'place-template'`.
- **Client-side mutation guard:** CI grep gate enforced in `.github/workflows/ci.yml`:
  ```yaml
  - name: Single-workflow-origin guard
    run: |
      ! grep -rE 'activity\.use\(' packages/g2-app packages/bridge --include="*.ts"
  ```
  Exit 0 required. The ONLY call sites are `packages/foundry-module/src/write-path/handlers/*.ts`.
- **Idempotency keys:** `IdempotencyKey = z.string().uuid()` field on every tool envelope. Module maintains a 60s LRU cache keyed by `idempotencyKey`. On hit: return cached `ToolResult` immediately without re-executing. On miss: execute + cache result + emit audit log.
- **Bridge wire format extension:** `packages/shared-protocol/src/payloads/tool.ts` ships `ToolInvocationEnvelopeSchema` (canonical Envelope wrap, `type: 'tool.invoke'`, `payload: { toolId, idempotencyKey, args }`).

### Area 2: AoE Templates + Multi-Attack Semantics

- **AoE template flow:**
  - `place-template` handler invokes `AbilityTemplate.fromActivity(activity)` which returns `AbilityTemplate[]` (verified Phase 0 §10.0.10 P2).
  - Module sends per-template `template.placement.requested` envelope to bridge → g2-app overlays a position-confirm panel (reuse Phase 4b modal pattern; new `TemplatePlacementPanel`).
  - R1 tap on confirmed position → g2-app POSTs `place-template.confirm` with `{ x, y, templateIndex }`.
  - Module commits via `template.document.update({ x, y })`.
  - Iterate for each template in the array (Magic Missile = 3 templates).
- **Multi-attack route:** RESEARCH must verify dnd5e 5.3.3 supports `activity.use({ count: N })`:
  - **Path A (preferred, if supported):** Single `executeAsGM(weapon-attack, { count: 2 })` call; dnd5e handles iteration internally; chat cards stream back one per attack.
  - **Path B (fallback):** Client-side loop in module — `for (let i = 0; i < count; i++) await activity.use({ configure: false })`. One WS round-trip per attack but tracker chip updates correctly.
  - RESEARCH Open Q: verify dnd5e 5.3.3 `count` param via `github.com/foundryvtt/dnd5e` source.
- **Multi-attack tracker UI:** CombatTrackerPanel acquires a transient `multiAttackState: { current: number; total: number; attackId: string }` field. During active multi-attack:
  - Footer chip shows `[Atk 1/2]` in IT / `[Atk 1/2]` in EN (same widget, no localization needed).
  - R1 tap on the chip triggers next attack via tool-registry.
  - Chip clears when `current === total` OR on combat-turn-advance.

### Area 3: Bearer Rotation + Reaction Toast + Audit Log

- **Bearer rotation:** 24h cycle + 60s grace window:
  - Module schedules rotation at boot using `setTimeout(rotate, 24h - elapsed)`.
  - On rotation: mint new bearer, store as `current`, store old as `previous` (valid for 60s), emit `bearer.rotated` envelope to bridge (which propagates to g2-app for token refresh).
  - bearer-validator middleware: `current === incoming || (previous === incoming && now - rotatedAt < 60_000)`.
  - Each rotation writes an audit-log chat message.
- **Reaction passive-notification:** Foundry hook subscription in module `packages/foundry-module/src/write-path/reaction-watcher.ts`:
  - Hooks: `dnd5e.preActivityUse` (for incoming attacks targeting the player), `dnd5e.preItemUsage` (for spell activations triggering Counterspell window).
  - Match logic: compare `activity.target` (or AoE area) against player-character ID; check player's `actor.system.attributes.reactions.available` flag for relevant reactions.
  - On match: module emits `r1.reaction.available` envelope `{ kind: 'Shield' | 'Counterspell' | 'Opportunity Attack' | ..., source: <NPC name>, expiresAt: <ms> }` via `socketlib.executeForUser(playerId, ...)` → bridge → g2-app.
  - g2-app: Toast queue (Phase 4b) displays "REAZIONE: Shield disponibile" (~3s dwell). DISPLAY-ONLY. No tap-to-fire.
  - **NOT execution** — ACT-04 stays V2.
- **Audit log format:**
  ```ts
  ChatMessage.create({
    user: gmId,
    whisper: gmIds,  // GM-only visibility
    speaker: { alias: 'EVF Audit' },
    content: `<div class="evf-audit">${JSON.stringify(auditEntry)}</div>`,
    flags: { evf: { audit: auditEntry } },
  });
  ```
  - `auditEntry = { tool, payload, idempotencyKey, actor, result, timestamp, bearer_id }`.
  - Queryable via Foundry chat filter `flags.evf.audit`.
- **Audit retention:** No automatic pruning Phase 7. GM can manually delete old audit messages. Future Phase 13 stretch may add auto-prune.

### Area 4: Plan Decomposition (anticipated)

| Wave | Plan | Title | REQ |
|------|------|-------|-----|
| 0 | 07-01 | Tool Registry scaffold + ToolInvocationEnvelopeSchema + idempotency LRU + bearer rotation + audit log infrastructure + CI grep gate | FOUN-03 (infrastructure), ACT-03 |
| 1 | 07-02 | `cast-spell` + `weapon-attack` + `use-item` + `move-token` handlers (basic cast/attack/use flow); chat-card audit recording | FOUN-03, ACT-03 |
| 2 | 07-03 | AoE template placement (place-template handler + TemplatePlacementPanel + multi-template iteration) | ACT-02 |
| 2 | 07-04 | Multi-attack tracker (CombatTrackerPanel chip + activity.use({count}) or client loop) | MULTI-01 |
| 3 | 07-05 | Reaction watcher (Foundry hook subscription + r1.reaction.available envelope + toast queue display); concentration-drop write (effect.delete via executeAsGM) | REACT-01, CONC-01 (closure) |
| 4 | 07-06 | Bearer rotation finalize (24h + 60s grace) + integration smoke + Phase 7 closure | cross-cutting |

**Wave 2 parallelism:** Plans 07-03 + 07-04 likely have disjoint files (AoE templates vs combat-tracker chip). Verify via planner files_modified audit.

### Area 5: Test Discipline

- Tests colocated per Phase 4b convention.
- INV-1 fixtures: minimal new fixtures (multi-attack chip + reaction toast variants). Most Phase 7 changes are backend write-path with no new ASCII rendering surfaces.
- Foundry-module tests use the test world from Phase 0 (`phase-0-midiqol-test` augmented for Phase 7 actors).
- Hardware-pending SC (carry to ADR-0005 Branch A): `SC-07-01..03` — TBD by research (likely real-Foundry-world integration for actual chat-card generation + dnd5e.preActivityUse hook firing).

### Area 6: Security Threat Model

- **Threat 1:** Replay attack on idempotency key — mitigated by 60s LRU cache (cache validates HMAC of bearer + key, not just key).
- **Threat 2:** Bearer leak (player intercepts) — mitigated by 24h rotation + every-action revalidation.
- **Threat 3:** Client-side write bypass — mitigated by CI grep gate (compile-time) + module-side `executeAsGM` discipline (runtime).
- **Threat 4:** Audit log tampering — mitigated by `whisper: gmIds` (only GMs see/edit) + JSON serialization in flags (Foundry hash). Audit entries are append-only by convention.

</decisions>

<canonical_refs>
## Canonical References

### Phase 4b/5/6 deliverables (foundation)

- `packages/foundry-module/src/index.ts` — module entry (Phase 2)
- `packages/foundry-module/src/readers/character-reader.ts` (Phase 2/5)
- `packages/foundry-module/src/readers/combat-reader.ts` (Phase 2/5)
- `packages/foundry-module/src/readers/log-reader.ts` (Phase 5)
- `packages/foundry-module/src/types/foundry-globals.d.ts` (Phase 5)
- `packages/g2-app/src/panels/concentration-drop-modal.ts` (Phase 4b — emits `conc.drop.confirmed`; Phase 7 wires the actual `effect.delete`)
- `packages/g2-app/src/panels/conc-conflict-dispatcher.ts` (Phase 4b)
- `packages/g2-app/src/status-hud/toast-queue-layer.ts` (Phase 4b — reused for reaction toasts)
- `packages/bridge/src/` — Phase 3 Tool Registry stub (Phase 7 extends with real tool wire-up)

### Architecture decisions

- **ADR-0011 (proposed):** "Foundry write path — single-workflow-origin via socketlib.executeAsGM only". To be authored in Plan 07-01.
- `docs/architecture/INVARIANTS.md` — Phase 6 ratified INV-1..5. Phase 7 may add INV-6 "GM Authority Preservation" (proposed).

### Specs.md sections

- §3.4 — Foundry compatibility.
- §3.6 — Native EvenAI non-API note.
- §4.8 — socketlib dependency declaration.
- §5.6.3 — MidiQOL capability handshake.
- §7.13 — Quick Action `[A] Action` menu entry (Phase 6 surface; Phase 7 fills the action surface).
- §10.0.10 P2 — Multi-attack count param (RESEARCH must close).

### REQUIREMENTS.md

- FOUN-03 — Write path via `activity.use()` + MidiQOL workflow.
- ACT-02 — AoE template placement via `AbilityTemplate.fromActivity()` array iteration.
- ACT-03 — GM-side actions via `socketlib.executeAsGM` (single-workflow-origin).
- MULTI-01 — Multi-attack action tracker.
- REACT-01 — Reaction passive-notification toast.

</canonical_refs>

<specifics>
## Specific Ideas

### Tool Registry shape (Area 1)

```ts
// packages/foundry-module/src/write-path/tool-registry.ts
export type ToolId =
  | 'cast-spell' | 'weapon-attack' | 'use-item' | 'move-token'
  | 'drop-concentration' | 'place-template';

export interface ToolHandler<TArgs, TResult> {
  argsSchema: z.ZodSchema<TArgs>;
  resultSchema: z.ZodSchema<TResult>;
  handle(args: TArgs): Promise<TResult>;
}

export const TOOL_REGISTRY: Record<ToolId, ToolHandler<any, any>> = {
  'cast-spell': castSpellHandler,
  // ...
};

export async function dispatchTool<TArgs, TResult>(
  toolId: ToolId,
  payload: { args: TArgs; idempotencyKey: string },
): Promise<TResult> {
  // 1. Check idempotency cache → if hit, return cached result
  // 2. Look up handler in TOOL_REGISTRY
  // 3. Validate args via handler.argsSchema.safeParse
  // 4. await socketlib.executeAsGM(handler.handle, payload.args)
  // 5. Validate result via resultSchema.safeParse
  // 6. Cache result by idempotencyKey
  // 7. Emit audit-log chat message
  // 8. Return result
}
```

### Reaction toast example (Area 3)

```
┌─────────────────────────────────┐
│ ! REAZIONE: Shield disponibile  │
│   Goblin attacca te (15→17 ▲)   │
└─────────────────────────────────┘
  → 3s dwell, no tap-to-fire
```

### Multi-attack tracker chip (Area 2)

```
║ ▶ 4.  Aragorn      PF ████████░ 51/56  CA 16   [Atk 1/2]  --      ★ ║
```

The chip occupies the dist+dir field (cols 53-58 → `[Atk 1/2]` 9 chars, slight overflow ok during multi-attack since dist hidden during active turn).

</specifics>

<deferred>
## Deferred Ideas

- **Reaction execution (ACT-04)** — V2. Phase 7 ships display-only notification.
- **Multi-player target conflict resolution** — single-player MVP per §11.5.1.
- **Audit log auto-prune** — Phase 13 stretch.
- **Bearer device fingerprinting** — beyond MVP; opaque bearers only.
- **MidiQOL workflow extension** — Phase 0 §10.0.10 confirmed MidiQOL adds the buttons; Phase 7's `executeAsGM` already gets MidiQOL workflow via dnd5e's hook chain. No special wiring needed beyond capability check.

</deferred>

---

*Phase: 07-foundry-module-write-path*
*Context gathered: 2026-05-16 via /gsd-autonomous smart-discuss batch (3 areas)*
