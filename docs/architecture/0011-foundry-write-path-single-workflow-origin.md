---
status: accepted
date: 2026-05-16
deciders: planner
consulted: planner-checker
informed: executor
---

# ADR-0011: Foundry Write Path — Single-Workflow-Origin Discipline

## Status

**ACCEPTED** — 2026-05-16. Binds Phase 7 (Foundry Module Write Path) and all
downstream phases that add new write-path tools.

### Confirmation

Plan 07-01 (Wave 0) produces the following artifacts that prove the contract:

- `packages/foundry-module/src/write-path/tool-registry.ts` — `dispatchTool` pipeline
- `packages/foundry-module/src/write-path/idempotency-cache.ts` — bearer-bound cache
- `packages/foundry-module/src/write-path/audit-log.ts` — `whisper: gmIds` audit writer
- `.github/workflows/ci.yml` — Gate 8: `grep -rE 'activity\.use\(' packages/g2-app packages/bridge`

## Context

Foundry VTT enforces a GM authority model: only the Game Master client can call
`activity.use()` (dnd5e 5.x API) to execute actions that modify world state (cast
spells, roll attacks, use items, move tokens). Player clients cannot directly write
to Foundry game state without GM-side execution.

EvenFoundryVTT routes player actions from the G2 glasses (via bridge → g2-app → WS)
to the Foundry module running on the GM's browser. Two architectural options were
considered for how this write path should be structured:

**Phase 0 D-15** (original constraint): all game-state mutations go through
`socketlib.executeAsGM` in `packages/foundry-module/src/write-path/handlers/`.
This is "single-workflow-origin discipline" — the phrase captures that there is
exactly ONE origin for all write-path mutations: the GM client running the
Foundry module, via socketlib.

**Phase 7 threat model context:**

- **T-07-01 (client write bypass):** Any code path in `packages/g2-app` or
  `packages/bridge` that calls `activity.use()` directly would bypass the GM
  authority model, the idempotency cache, and the audit log — a critical security
  violation in the multi-GM setup.
- **T-07-02 (cross-bearer replay):** IdempotencyStore uses
  `SHA256(bearer).slice(0,16) + ':' + idempotencyKey` as the cache key. Different
  bearer tokens produce different cache keys, preventing cross-session replay.
- **T-07-04 (audit log tampering):** `whisper: gmIds` ensures only GMs see audit
  entries. Foundry ChatMessage documents are immutable post-creation.

## Decision Drivers

- **GM authority preservation:** `activity.use()` must execute on the GM client.
  Player clients in the WebView cannot call Foundry APIs directly — they go through
  the bridge WS → module socketlib round-trip.
- **Single audit trail:** every mutation logged to GM-only `ChatMessage.flags.evf.audit`.
- **Idempotency:** client supplies UUID v4 `idempotencyKey`; module deduplicates
  within 60s TTL using bearer-bound cache keys.
- **CI enforcement:** compile-time gate (grep) prevents future regressions where
  `activity.use()` leaks back to client packages.
- **DM veto power:** because all mutations go through the GM client, the DM can
  in principle intercept or deny any action at the Foundry layer.

## Considered Options

### Option A: `socketlib.executeAsGM` only — CHOSEN

- Every write-path tool dispatch goes through
  `socketlib.executeAsGM(MODULE_ID, handlerId, ...args)`.
- All handlers live in `packages/foundry-module/src/write-path/handlers/*.ts`.
- `packages/g2-app` and `packages/bridge` are **read-only** with respect to
  Foundry game state (they can read via REST + WS snapshots but never write directly).
- CI Gate 8 enforces this constraint at compile time.

**Pros:**
- GM authority model preserved unconditionally.
- Single audit entry per action (no double-execution races).
- IdempotencyStore + writeAuditLog can be co-located with the handlers.
- CI gate provides compile-time enforcement — no runtime escape hatch.

**Cons:**
- Every write incurs a WS round-trip latency (bridge → module → `executeAsGM` → Foundry → socketlib reply → bridge).
- Foundry must be connected; GM client must be online for any action to execute.

### Option B: Client-side `activity.use()` with bearer auth — REJECTED

- The bridge or g2-app would call `activity.use()` directly via a Foundry REST
  hook or WebSocket injection.
- Bearer token validates the caller identity.

**Why rejected:**
- Requires every client to independently implement the GM permissions check —
  a distributed invariant that cannot be enforced centrally.
- Bypasses the socketlib `executeAsGM` boundary: the GM client is not involved.
  The DM loses veto power at the activity level.
- Creates two separate audit trails (bridge + Foundry) that can diverge.
- Cannot be enforced by CI grep (the pattern would be in `packages/bridge`).
- Contradicts Phase 0 D-15 explicit constraint (Option A single-workflow-origin).

## Decision Outcome

**Chosen: Option A — `socketlib.executeAsGM` only.**

### Implementation

1. `dispatchTool(toolId, payload)` in `packages/foundry-module/src/write-path/tool-registry.ts`:
   - 7-step pipeline: cache-lookup → handler-lookup → args-validate → handle → cache-result → audit-log → return.
   - `TOOL_REGISTRY: Partial<Record<ToolId, ToolHandler<unknown>>>` — populated by `registerToolHandler` in Waves 1-3.

2. `IdempotencyStore` in `packages/foundry-module/src/write-path/idempotency-cache.ts`:
   - Bearer-bound key: `SHA256(bearer).slice(0,16) + ':' + idempotencyKey`.
   - 60s TTL, 1000-entry FIFO eviction (T-07-05).

3. `writeAuditLog(entry)` in `packages/foundry-module/src/write-path/audit-log.ts`:
   - `ChatMessage.create({ whisper: gmIds, flags: { evf: { audit: entry } } })`.
   - Fault-tolerant — never throws (T-02-01 belt-and-suspenders).

4. **CI Gate 8** in `.github/workflows/ci.yml`:
   - Grep `activity\.use\(` in `packages/g2-app` + `packages/bridge` `.ts` files.
   - Fail PR on any hit. Error message cites this ADR.

### Anti-patterns (enforced by Gate 8)

The following patterns are explicitly forbidden:

```ts
// ANTI-PATTERN 1: activity.use() in g2-app (WebView client)
// packages/g2-app/src/actions/cast-spell.ts — FORBIDDEN
await activity.use({ configure: false });  // ← Gate 8 kills this PR

// ANTI-PATTERN 2: activity.use() in bridge (Node.js proxy)
// packages/bridge/src/handlers/cast.ts — FORBIDDEN
await activity.use({ actorId });  // ← Gate 8 kills this PR

// ANTI-PATTERN 3: calling socketlib.executeAsGM outside handlers/
// packages/foundry-module/src/module.ts — FORBIDDEN (unless it's registerSocketlibHandlers)
await socketlib.executeAsGM(MODULE_ID, 'evf.castSpell', args);  // ← no Gate, but code review blocks
```

The ONLY valid pattern:

```ts
// CORRECT: handler in packages/foundry-module/src/write-path/handlers/
// Called via dispatchTool → socketlib.executeAsGM → this handler
async function handleCastSpell(args: CastSpellArgs): Promise<ToolResult> {
  const activity = actor.items.get(args.spellId)?.system?.activities?.first();
  await activity.use({ configure: false, event: null });  // ← VALID: GM client only
  return { success: true, data: { rolled: true } };
}
registerToolHandler('cast-spell', { argsSchema: CastSpellArgsSchema, handle: handleCastSpell });
```

## Pros and Cons

### Pros

- **GM authority unconditionally preserved** — the DM client is always the
  execution origin; no player action can bypass the GM layer.
- **Single audit trail** — every `dispatchTool` call writes one `ChatMessage`
  visible only to GMs.
- **Compile-time enforcement** — CI Gate 8 prevents future regressions at PR time,
  not at runtime.
- **Idempotency** — client retries safely; 60s dedup window with bearer-bound keys.
- **No double-execution races** — `socketlib.executeAsGM` serializes on the GM client.

### Cons

- **WS round-trip latency** — every action adds at least one network hop (bridge → GM
  Foundry client). For local homelab: ~5-20ms. For remote bridge: ~50-200ms.
- **GM must be online** — if the GM client disconnects, all write-path actions fail
  immediately. Graceful degradation (queue + retry) is a Phase 13 consideration.
- **Testing requires GM client stub** — handler tests must mock socketlib globals.
  The `foundry-globals.d.ts` declarations make this tractable.

## More Information

- `@see Phase 0 D-15` — original single-workflow-origin constraint (pre-code)
- `@see .planning/phases/07-foundry-module-write-path/07-CONTEXT.md §Area 1` — locked decisions
- `@see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q1, Q8` — research backing
- `@see ADR-0003` — Tool Registry pattern (wire format + TOOL_NAMES)
- `@see ADR-0008` — Code quality configuration (CI gate conventions)
- `@see Specs.md §5.6.10` — single-workflow-origin cited in phase decomposition

## Amendment 1

_Reserved — not yet authored._
