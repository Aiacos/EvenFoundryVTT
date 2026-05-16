# Phase 7: Foundry Module Write Path — Research

**Researched:** 2026-05-16
**Domain:** dnd5e 5.3.3 write path · socketlib.executeAsGM · AoE templates · reaction hooks · bearer rotation · idempotency LRU · CI gate
**Confidence:** HIGH (core API questions answered via source inspection; MEDIUM on hook payload details; LOW on ChatMessage whisper runtime behavior)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Area 1 — Single-Workflow-Origin Discipline + Tool Registry**
- Tool Registry location: `packages/foundry-module/src/write-path/tool-registry.ts`
- Tool ID enum (Phase 7 set): `'cast-spell' | 'weapon-attack' | 'use-item' | 'move-token' | 'drop-concentration' | 'place-template'`
- CI grep gate in `.github/workflows/ci.yml`: `! grep -rE 'activity\.use\(' packages/g2-app packages/bridge --include="*.ts"` exit 0 required
- Idempotency: 60s LRU cache by `idempotencyKey` in module; client supplies UUID v4
- Bridge wire format extension: `packages/shared-protocol/src/payloads/tool.ts` ships `ToolInvocationEnvelopeSchema`

**Area 2 — AoE Templates + Multi-Attack Semantics**
- AoE: `place-template` handler calls `AbilityTemplate.fromActivity(activity)` → array iteration → `TemplatePlacementPanel` (reuse Phase 4b modal pattern)
- Multi-attack route: **RESEARCH must verify** `activity.use({ count: N })` support (Path A) vs client-side loop (Path B)
- Multi-attack tracker: CombatTrackerPanel acquires transient `multiAttackState` field; footer chip `[Atk 1/2]`

**Area 3 — Bearer Rotation + Reaction Toast + Audit Log**
- Bearer: 24h cycle + 60s grace; `setTimeout(rotate, 24h - elapsed)` at boot; `bearer.rotated` envelope; validator checks `current || (previous && now - rotatedAt < 60_000)`
- Reaction hooks: `dnd5e.preActivityUse` (incoming attacks targeting player) + `dnd5e.preItemUsage` (spell activations triggering Counterspell window) → match logic → `r1.reaction.available` envelope
- Audit log format: `ChatMessage.create({ whisper: gmIds, flags: { evf: { audit: auditEntry } } })`; queryable via `flags.evf.audit`; no auto-prune Phase 7

### Claude's Discretion

CONTEXT.md marks no discretion areas — all 3 grey areas accepted.

### Deferred Ideas (OUT OF SCOPE)

- Reaction execution (ACT-04) — V2
- Multi-player target conflict resolution — Phase 13
- Audit log auto-prune — Phase 13
- Bearer device fingerprinting — beyond MVP
- MidiQOL workflow extension — Phase 0 confirmed; no special wiring needed beyond capability check
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUN-03 | Write path via `activity.use()` + MidiQOL workflow (GM veto power preserved, no nesting) | §Research Q1: `activity.use()` signature confirmed no `count` param → Path B (client loop). MidiQOL detected via capability check (Phase 0 MIDIQ-01). §Pattern 1: handler structure. |
| ACT-02 | AoE template placement via `AbilityTemplate.fromActivity()` array iteration per multi-template | §Research Q2: `fromActivity()` is synchronous, returns `AbilityTemplate[] \| null`, supports `target.count > 1`. Templates start at x:0, y:0 — require explicit positioning. §Pattern 2: placement flow. |
| ACT-03 | GM-side actions forwarded via `socketlib.executeAsGM` (single-workflow-origin discipline option A) | §Research Q4: `executeAsGM(moduleId, handlerId, ...args)` returns `Promise<unknown>`, rejects on GM-side error. Phase 2 already uses `registerComplexHandler` (14 handlers). §Pattern 3: handler structure. |
| MULTI-01 | Multi-attack action tracker (`Atk 1/2`, `Atk 2/2`) for Fighter Extra Attack L5+ | §Research Q1 conclusion: Path B confirmed (client-side loop). CombatTrackerPanel extension pattern documented. |
| REACT-01 | Reaction passive-notification toast (Shield / Counterspell / Opportunity Attack — display-only, no execution) | §Research Q3: hook name is `dnd5e.preUseActivity` (NOT `preActivityUse` or `preItemUsage`). Payload: `(activity, usageConfig, dialogConfig, messageConfig)`. Cancellable with `return false`. ToastQueueLayer reuse confirmed. |
</phase_requirements>

---

## Summary

Phase 7 is the write path for EvenFoundryVTT — it turns the read-only pipeline of Phases 2–6 into a bidirectional one. Research resolved all 10 critical questions before planning can begin. The most consequential findings:

**dnd5e 5.3.3 `activity.use()` has NO `count` parameter** (confirmed via source at `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/mixin.mjs`). `ActivityUseConfiguration` has no `count`, `times`, or `repeat` field. Path A is not available; the multi-attack tracker (MULTI-01) must use **Path B: client-side loop** in the module (`for i in count: await activity.use({ configure: false })`). This was the gating open question from Phase 0 §10.0.10 P2 — it is now closed.

**`AbilityTemplate.fromActivity()` is synchronous and returns `AbilityTemplate[] | null`**, not a Promise. Templates initialize at `x:0, y:0` and enter an interactive preview via `drawPreview()`. For EVF's R1-driven placement flow, we cannot use `drawPreview()` (it requires mouse interaction). Instead the handler must: (1) call `fromActivity()` to get the template array, (2) send per-template `template.placement.requested` to bridge, (3) receive `place-template.confirm` with `{x, y, templateIndex}` from g2-app, (4) call `canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData])` directly — bypassing the interactive preview entirely.

**The correct hook name is `dnd5e.preUseActivity`** (not `preActivityUse` as the CONTEXT.md reaction-watcher plan states). The hook signature is `(activity, usageConfig, dialogConfig, messageConfig)` and returns `false` to cancel. `dnd5e.preItemUsage` does NOT exist as a distinct hook in dnd5e 5.3.3 at the item level — item.use() delegates to activity.use() which fires `dnd5e.preUseActivity`.

**socketlib.executeAsGM** returns `Promise<unknown>` and propagates errors back as rejected promises. The codebase already uses `registerComplexHandler` (14 handlers currently, all Phase 2–3 placeholders for Phase 7). The phase must replace the 7 stub handlers with real implementations.

**Bearer rotation infrastructure already exists in `bearer-registry.ts`** via `generateBearer(alias, url, worldId, refresh=true)`. The `refresh=true` path already implements 60s grace by shortening old token TTL. Phase 7 needs to add the `setTimeout` scheduling, the `bearer.rotated` envelope emission, and the dual-token validator middleware.

**Idempotency cache for the module**: the bridge already has `IdempotencyStore` (Map-based, 60s TTL, max 10,000 entries). The module needs its own idempotency cache at the Foundry layer. No external library is needed — a `Map<string, {result, cachedAt}>` + eager TTL eviction matches the bridge's proven pattern (see `packages/bridge/src/middleware/idempotency.ts`). This keeps zero new dependencies and matches CLAUDE.md "no unnecessary deps" stance.

**Primary recommendation:** Implement Path B multi-attack loop, use `dnd5e.preUseActivity` hook (correct spelling), bypass `drawPreview()` for template placement, and hand-roll the module-side idempotency cache using the bridge's existing Map-based pattern.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tool dispatch (cast/attack/use/move) | Foundry Module (GM-side) | Bridge (routing) | `activity.use()` must run on GM client; bridge is a pass-through |
| AoE template creation | Foundry Module (GM-side) | — | `AbilityTemplate.fromActivity()` + `canvas.scene.createEmbeddedDocuments()` are Foundry API — GM only |
| Template position confirmation UI | g2-app (phone WebView) | — | R1 tap-to-confirm is phone-side; coordinates sent upstream via WS |
| Multi-attack loop | Foundry Module (GM-side) | — | `activity.use()` calls must be serialized on GM client |
| Idempotency cache (module-side) | Foundry Module | — | Foundry runs in browser; Map<string,entry> sufficient for single-tenant |
| Idempotency cache (bridge-side) | Bridge (Node.js) | — | Already implemented (IdempotencyStore); Phase 7 extends bearer-binding |
| Bearer rotation scheduler | Foundry Module | Bridge (propagation) | Module mints/rotates tokens; bridge propagates `bearer.rotated` to g2-app |
| Bearer dual-validator | Bridge (auth middleware) | — | Bridge validates all inbound bearers; checks current + previous within grace |
| Reaction hook subscription | Foundry Module | — | `dnd5e.preUseActivity` fires in Foundry browser context only |
| Reaction toast display | g2-app (phone WebView) | — | ToastQueueLayer already implemented Phase 4b |
| Audit log write | Foundry Module (GM-side) | — | `ChatMessage.create()` must run as GM (whisper: gmIds) |
| CI grep gate enforcement | CI pipeline | — | `! grep -rE 'activity\.use\('` on g2-app + bridge sources |

---

## Standard Stack

### Core (write path additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dnd5e (Foundry system) | ≥5.3.3 | `activity.use()` + `AbilityTemplate.fromActivity()` | Already declared `relationships.requires` in module.json (Phase 2) |
| socketlib | latest (Foundry module) | `registerComplexHandler` / `executeAsGM` | Already in `relationships.requires`; Phase 2 uses 14 handlers |
| Zod | 4.4.3 | Args validation in handler pipeline | Already in `@evf/shared-protocol`; same schema language used throughout |
| `Map<string, IdempotencyEntry>` | platform | 60s LRU cache for module-side idempotency | Hand-rolled; matches bridge's proven pattern; zero deps |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| MidiQOL | optional (Foundry module) | Full attack→damage→save→effect workflow | When `typeof MidiQOL !== "undefined"` at runtime (capability handshake per Phase 0 MIDIQ-01) |
| `crypto.randomUUID()` | platform (Foundry v13+ browser) | UUID v4 for idempotency keys (client supplies; module validates format) | Already used in bearer-registry.ts via `crypto.getRandomValues` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled Map LRU | `lru-cache@11.3.6` | `lru-cache` is browser-hostile (ESM CJS shim issues in Foundry WebView); hand-rolled is 30 lines, zero deps, matches bridge pattern |
| Hand-rolled Map LRU | `quick-lru@7.3.0` | `quick-lru` is ESM-only and works in browser, but Foundry module compile target is `tsup → ESM`; still unnecessary given the bridge's proven hand-rolled pattern |
| Path B client loop | Path A `activity.use({count: N})` | Path A does not exist in dnd5e 5.3.3 (verified); Path B is the only option |
| `dnd5e.preUseActivity` | `dnd5e.preActivityUse` or `dnd5e.preItemUsage` | The latter two do not exist in dnd5e 5.3.3 (verified via source inspection) |

**No new npm dependencies needed for Phase 7** beyond what the codebase already has.

---

## Critical Research Findings

### Q1: dnd5e 5.3.3 `activity.use({count: N})` — RESOLVED: Path B required

**Verdict: `count` is NOT supported. Path B (client-side loop) is mandatory.**

Source inspection of `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/mixin.mjs`:

```javascript
// mixin.mjs — use() method signature (line ~323)
async use(usage={}, dialog={}, message={}) { ... }

// ActivityUseConfiguration typedef (_types.mjs):
// @property {object|false} create
// @property {object} concentration
// @property {object|false} consume
// @property {Event} event
// @property {boolean|number} scaling
// @property {object} spell
// @property {boolean} [subsequentActions=true]
// @property {object} [cause]
// — NO count, times, or repeat field
```

The `use()` method executes a single activation and produces one chat card. Multi-attack requires:

```typescript
// Path B — module-side loop (inside executeAsGM handler)
for (let i = 0; i < count; i++) {
  await activity.use({ configure: false, consume: { action: i === 0 } });
  // Bridge emits multiAttackState update after each iteration
}
```

`configure: false` skips the dialog on subsequent attacks. `consume.action: true` only on the first (the action economy deducted once; Extra Attack is a feature, not repeated action cost in 5e rules).

[VERIFIED: github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/mixin.mjs — _types.mjs]

### Q2: `AbilityTemplate.fromActivity()` return shape — RESOLVED

**`fromActivity` is synchronous and returns `AbilityTemplate[] | null`.**

Source: `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/canvas/ability-template.mjs`

```javascript
// Synchronous static method:
static fromActivity(activity, options={}) {
  // ...
  const created = Array.fromRange(target.count || 1).map(() => {
    const template = new cls(foundry.utils.deepClone(templateData), { parent: canvas.scene });
    const object = new this(template);
    object.activity = activity;
    return object;
  });
  return created; // AbilityTemplate[] (synchronous)
}
```

Templates are initialized with `x: 0, y: 0` (placeholder coordinates). The standard flow uses `drawPreview()` which requires mouse interaction and is therefore **incompatible with R1 gesture input**.

**EVF-specific template placement flow (bypasses drawPreview):**

```
1. executeAsGM('evf.placeTemplate', {actorId, spellId}) is called
2. Handler: templates = AbilityTemplate.fromActivity(activity)  // sync, returns T[]
3. Handler emits per-template envelope to bridge:
   { type: 'template.placement.requested', payload: { templateIndex, total, templateType, range } }
4. g2-app: TemplatePlacementPanel (new) shows position-confirm UI
5. R1 tap → g2-app sends { type: 'place-template.confirm', payload: { x, y, templateIndex } }
6. Handler receives confirm → canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{...templateData, x, y}])
7. Repeat for each template in array (Magic Missile = 3 iterations)
```

Multi-template count comes from `target.count > 1` in the spell's activity config. For Magic Missile at base level, `target.count = 3`.

[VERIFIED: github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/canvas/ability-template.mjs]

### Q3: `dnd5e.preUseActivity` hook signature — RESOLVED (with correction)

**The correct hook name is `dnd5e.preUseActivity`** — NOT `preActivityUse` or `preItemUsage`.

Source: `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/mixin.mjs` lines 311–351:

```javascript
// Hook call site (mixin.mjs ~line 348):
if ( Hooks.call("dnd5e.preUseActivity", activity, usageConfig, dialogConfig, messageConfig) === false ) return;
```

**Hook payload:**
- `activity` — the Activity document being used (has `.actor`, `.item`, `.target`, `.activation`, `.type`)
- `usageConfig` — `ActivityUseConfiguration` object
- `dialogConfig` — `ActivityDialogConfiguration` object
- `messageConfig` — `ActivityMessageConfiguration` object
- **Return `false` to cancel** the activity execution

**`dnd5e.preItemUsage` does NOT exist** in dnd5e 5.3.3. The CONTEXT.md mention of `dnd5e.preItemUsage` refers to a hook that no longer exists as a distinct hook at the item level — `item.use()` delegates directly to `activity.use()` which fires `dnd5e.preUseActivity`. The reaction-watcher must subscribe to **`dnd5e.preUseActivity`** only.

**CONTEXT.md correction required:** CONTEXT.md §Area 3 lists `dnd5e.preItemUsage` as a hook to subscribe. This hook does not exist. Use `dnd5e.preUseActivity` for both use cases.

**Reaction match logic for `dnd5e.preUseActivity`:**
```typescript
Hooks.on('dnd5e.preUseActivity', (activity, usageConfig) => {
  // activity.actor = the actor performing the action
  // activity.item.system.activation.type = 'reaction' for reaction-type items
  // To detect attacks targeting the player, inspect activity.target (if present)
  // or listen for the post-hook after the fact (display-only — no blocking needed)
  const actorId = activity.actor?.id;
  if (!actorId) return; // unknown actor
  if (isPlayerCharacterTargeted(activity)) {
    emitReactionToast(activity);
  }
  // Do NOT return false — Phase 7 is display-only (ACT-04 is V2)
});
```

[VERIFIED: github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/mixin.mjs]

### Q4: `socketlib.executeAsGM` signature + error semantics — RESOLVED

From `github.com/farling42/foundryvtt-socketlib` README and Phase 2 codebase inspection:

```typescript
// Existing declaration (foundry-globals.d.ts, already in codebase):
declare const socketlib: {
  registerComplexHandler(moduleId: string, handlerId: string, handler: (...args) => unknown): void;
  executeAsGM(moduleId: string, handlerId: string, ...args: unknown[]): Promise<unknown>;
};
```

**Return value:** `Promise<unknown>` — resolves with the handler's return value after GM execution.

**Error propagation:** If the handler throws on the GM client, `executeAsGM` rejects the returned Promise on the caller's side. Callers must `try/catch` or `.catch()` to handle GM-side errors.

**GM offline:** If no GM is connected, `executeAsGM` rejects immediately with an error. The module must handle this case in the `dispatchTool` function (return `{ success: false, error: 'no_gm_connected' }`).

**Registration:** `registerComplexHandler` is already the correct method (README documents only `socket.register()` but the codebase correctly uses `registerComplexHandler` for async return values). The Phase 2 pattern is proven and unit-tested.

**Current state:** 14 handlers registered via `registerComplexHandler` in `socketlib-handlers.ts`. 7 are Phase 7 stubs returning `{ status: 'phase-07-pending' }`. Phase 7 replaces these 7 stubs in-place.

[VERIFIED: codebase grep + farling42/foundryvtt-socketlib README + Phase 2 unit tests (168 passing)]

### Q5: `ChatMessage.whisper` visibility — RESOLVED (MEDIUM confidence)

**Verdict: `whisper: [gmId1, gmId2]` makes the message invisible to all non-listed users, including the player who triggered the action.**

From official Foundry VTT documentation (`foundryvtt.com/article/chat/`):

> "GM users have no special permission to view whispered messages. If they are not included in the targets of a whispered message, they cannot see it."

This principle applies symmetrically: if a non-GM player is not in the `whisper` array, they cannot see the message. The `whisper: gmIds` pattern for audit logs is correct and secure — the triggering player will NOT see the audit message.

**How to get GM user IDs:**
```typescript
// In the executeAsGM handler context (Foundry browser):
const gmIds = game.users.contents
  .filter(u => u.isGM && u.active)
  .map(u => u.id);
// For the whisper field on inactive GMs: include all GMs to ensure audit survives session end
const allGmIds = game.users.contents
  .filter(u => u.isGM)
  .map(u => u.id);
```

**Note:** `game.users` is not currently declared in `foundry-globals.d.ts`. Wave 0 (Plan 07-01) must add this declaration.

[CITED: foundryvtt.com/article/chat/] [ASSUMED: exact runtime behavior — verified logically from the symmetric visibility rule]

### Q6: Bearer rotation interaction with CONN-05 — RESOLVED

**Phase 2 already implements the structural building blocks. Phase 7 adds scheduling + envelope emission.**

From `packages/foundry-module/src/pair/bearer-registry.ts`:

```typescript
export async function generateBearer(alias, bridgeUrl, worldId, refresh = false): Promise<BearerEntry> {
  // refresh=true → shortens old token TTL to GRACE_60S_MS (60,000 ms)
  // Generates new token + new internalSecret
  // Persists to Foundry settings (Tier 3)
}

export function validateBearer(token: string): { valid: boolean; entry?: BearerEntry; reason?: string } {
  // Checks: exists → revokedAt → expiresAt
  // Does NOT currently check a "previous" token within grace window
}
```

**What Phase 7 must add:**

1. **`scheduleRotation()` in module boot** (`Hooks.once('ready')`):
   ```typescript
   function scheduleRotation() {
     const activeEntry = getActiveBearer(); // first non-revoked, non-expired entry
     if (!activeEntry) return;
     const elapsed = Date.now() - activeEntry.createdAt;
     const remaining = TTL_24H_MS - elapsed;
     setTimeout(async () => {
       const newEntry = await generateBearer(activeEntry.alias, activeEntry.bridgeUrl, activeEntry.worldId, true);
       emitBearerRotatedEnvelope(newEntry.token);
       scheduleRotation(); // chain next rotation
     }, Math.max(0, remaining));
   }
   ```

2. **Bridge dual-validator middleware** — currently `TokenCache` in bridge validates via `socketlib.executeAsGM('evf.validateToken', token)`. Phase 7 must update `handleValidateToken` in `socketlib-handlers.ts` to accept tokens within the 60s grace window:
   ```typescript
   // Enhanced validateBearer to support previous-token grace:
   // validateBearer already shortens old token's expiresAt to now + 60s via refresh=true
   // So the existing expiry check ALREADY handles grace window correctly — no structural change needed
   // The old token's expiresAt becomes now + 60s at rotation time, not revokedAt
   ```

   **Key insight:** The existing `generateBearer(refresh=true)` already implements grace by setting `old.expiresAt = now + GRACE_60S_MS`. Since `validateBearer` checks `expiresAt > Date.now()`, the old token naturally stays valid for 60s after rotation — **no structural change to validation logic is needed**. Phase 7 only adds the scheduler and the envelope emission.

3. **`bearer.rotated` envelope schema** in `packages/shared-protocol/src/payloads/tool.ts` (new file, Plan 07-01).

[VERIFIED: bearer-registry.ts source code; GRACE_60S_MS = 60,000 ms already defined; refresh=true path already shortens old entry expiresAt]

### Q7: Idempotency cache — RESOLVED: hand-roll the Map pattern

**Recommendation: hand-roll a `Map<string, IdempotencyEntry>` in the module, matching the bridge's proven pattern.**

The bridge already has `IdempotencyStore` (`packages/bridge/src/middleware/idempotency.ts`) — a `Map<string, IdempotencyEntry>` with:
- Max 10,000 entries (Map insertion-order eviction)
- 60s TTL per entry (lazy eviction on read)
- No external dependency

The module-side cache is simpler:
```typescript
interface ModuleIdempotencyEntry {
  result: ToolResult;
  cachedAt: number;
}
const MODULE_IDEMPOTENCY_CACHE = new Map<string, ModuleIdempotencyEntry>();
const MODULE_IDEMPOTENCY_TTL_MS = 60_000;
const MODULE_IDEMPOTENCY_MAX = 1_000; // single-tenant; much smaller than bridge

function checkIdempotencyCache(key: string): ToolResult | null {
  const entry = MODULE_IDEMPOTENCY_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > MODULE_IDEMPOTENCY_TTL_MS) {
    MODULE_IDEMPOTENCY_CACHE.delete(key);
    return null;
  }
  return entry.result;
}
```

**Why not `lru-cache@11.3.6`?** The Foundry module compiles to ESM via `tsup` and runs in Foundry's browser context. `lru-cache@11` is Node.js-targeted with CJS/ESM dual bundle; bringing it into a Foundry module introduces unnecessary complexity. The 30-line hand-roll is zero-risk and follows the bridge precedent.

**Why not `quick-lru@7.3.0`?** ESM-only and browser-compatible, but 30-line hand-roll is sufficient for single-tenant MVP.

[VERIFIED: bridge/src/middleware/idempotency.ts pattern; CLAUDE.md "no unnecessary deps" stance]

### Q8: CI grep gate placement — RESOLVED

**Slot as Gate 8 (after Gate 7 changeset) in `quality-gates` job.**

Current CI structure (`.github/workflows/ci.yml`):
- Gate 1: `pnpm install --frozen-lockfile --ignore-scripts`
- Gate 2: `pnpm biome ci .`
- Gate 3: `pnpm typecheck`
- Gate 4: `pnpm test:coverage`
- Gate 5: TODO discipline grep
- Gate 6: Snapshot drift check
- Gate 7: Changeset status (PR only)

Phase 7 adds Gate 8 **after Gate 7**, since it's a project-architecture enforcement check (not a test gate):

```yaml
      # D-7.01 gate 8: Single-workflow-origin guard (Phase 7 ADR-0011)
      # The ONLY valid call sites for activity.use() are packages/foundry-module/src/write-path/handlers/*.ts
      # Any hit in g2-app or bridge is a client-side write bypass — critical security violation.
      - name: Single-workflow-origin guard
        run: |
          if grep -rE 'activity\.use\(' packages/g2-app packages/bridge --include="*.ts" 2>/dev/null; then
            echo "::error::Client-side activity.use() call detected — violates ADR-0011 single-workflow-origin discipline"
            exit 1
          fi
```

**Note:** The CONTEXT.md uses `! grep ...` (invert exit code via `!`). The explicit `if grep ... exit 1` form is more readable and produces a clear error message in CI. Either form is functionally equivalent; use the explicit form to match the CI style of Gate 5 (TODO discipline).

[VERIFIED: .github/workflows/ci.yml — current 7-gate structure]

### Q9: Hardware-deferred SC for Phase 7

Phase 7 requires real-Foundry integration for definitive verification. Recommend 4 SC items:

| ID | Description | Deferral Reason |
|----|-------------|-----------------|
| SC-07-01 | Real `executeAsGM` round-trip: `cast-spell` handler invokes `activity.use()` and a real chat card appears in Foundry | Requires live Foundry world + dnd5e 5.3.3 + GM session |
| SC-07-02 | `dnd5e.preUseActivity` hook fires correctly and EVF module receives the payload with correct `activity.actor.id` for a real NPC attack | Requires live Foundry combat encounter |
| SC-07-03 | MidiQOL full workflow: `weapon-attack` with `autoFastForward` active produces full attack→damage→save chain without stalling on chat-card buttons | Requires MidiQOL installed + configured |
| SC-07-04 | Concentration drop: Phase 4b `conc.drop.confirmed` envelope reaches Phase 7 `drop-concentration` handler and `effect.delete()` removes the concentration effect on GM side | Requires live Foundry actor with active concentration |

All 4 carry forward to ADR-0005 Branch A SC list (same pattern as Phases 4a, 4b, 5, 6). Running total will be 18 + 4 = 22 hardware-pending SCs.

### Q10: socketlib registration pattern — VERIFIED in codebase

`registerSocketlibHandlers()` currently registers 14 handlers at `Hooks.once('ready')`. Phase 7 replaces 7 stubs with real implementations in-place. No new `registerComplexHandler` calls needed — the registration call for each Phase 7 handler already exists in the stub set.

The module test asserts `expect(socketlibMock.registerComplexHandler).toHaveBeenCalledTimes(14)` — this count must NOT change in Phase 7 (replacement, not addition).

[VERIFIED: foundry-module/src/pair/socketlib-handlers.ts line count; module.test.ts assertion]

---

## Architecture Patterns

### System Architecture Diagram

```
[G2 glasses] ←visual← [g2-app phone WebView]
                              │
                         R1 tap/scroll → WS envelope { type: 'tool.invoke', payload: { toolId, idempotencyKey, args } }
                              │
                        [Bridge — Fastify]
                              │ POST /v1/tools/:name
                              │ validate bearer (TokenCache → socketlib → Foundry)
                              │ idempotency check (IdempotencyStore 60s)
                              │ dispatch to ToolHandler
                              │
                        socketlib.executeAsGM(moduleId, handlerId, args)
                              │
                        [Foundry VTT — GM browser]
                              │
                        ┌─────┴──────────────────────────────────────┐
                        │  write-path/tool-registry.ts               │
                        │  dispatchTool(toolId, {args, iKey})        │
                        │    → module idempotency cache check        │
                        │    → activity.use() OR loop (Path B)       │
                        │    → AbilityTemplate.fromActivity() [AoE]  │
                        │    → effect.delete() [drop-conc]           │
                        │    → ChatMessage.create({whisper:gmIds})   │
                        └─────────────────────────────────────────────┘
                              │
                        dnd5e.preUseActivity hook (reaction-watcher.ts)
                              │ match: NPC attacks targeting player
                              │
                        socketlib.executeForUser(playerId, ...)
                              │
                        bridge → g2-app toastQueue.enqueue({kind: 'reaction', ...})
```

### Recommended Project Structure

```
packages/foundry-module/src/
├── write-path/                     # NEW — Phase 7 write surface
│   ├── tool-registry.ts            # TOOL_REGISTRY, dispatchTool, ToolHandler interface
│   ├── idempotency-cache.ts        # Map-based 60s LRU (hand-rolled)
│   ├── handlers/
│   │   ├── cast-spell.ts           # activity.use() + slot selection
│   │   ├── weapon-attack.ts        # activity.use() + Path B loop
│   │   ├── use-item.ts             # activity.use() for consumables
│   │   ├── move-token.ts           # Token.update({x, y})
│   │   ├── drop-concentration.ts   # effect.delete() + effectId lookup
│   │   └── place-template.ts       # AbilityTemplate.fromActivity() + createEmbeddedDocuments
│   ├── reaction-watcher.ts         # dnd5e.preUseActivity hook subscription
│   └── audit-log.ts                # ChatMessage.create({whisper: gmIds, flags: {evf:{audit}}})
├── pair/
│   ├── bearer-registry.ts          # EXISTING — add scheduleRotation()
│   └── socketlib-handlers.ts       # EXISTING — replace 7 stubs with real handlers
└── types/
    └── foundry-globals.d.ts        # EXISTING — add game.users, ChatMessage, MidiQOL types
packages/shared-protocol/src/payloads/
└── tool.ts                         # NEW — ToolInvocationEnvelopeSchema, BearerRotatedPayloadSchema
packages/g2-app/src/panels/
├── combat-tracker-panel.ts         # EXTEND — multiAttackState chip
└── template-placement-panel.ts     # NEW — z=2 overlay for AoE position confirm
```

### Pattern 1: Handler + dispatchTool + Idempotency

```typescript
// write-path/tool-registry.ts
export type ToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

export interface ToolHandler<TArgs = unknown> {
  argsSchema: z.ZodSchema<TArgs>;
  handle(args: TArgs): Promise<ToolResult>;
}

export async function dispatchTool(
  toolId: ToolId,
  payload: { args: unknown; idempotencyKey: string },
): Promise<ToolResult> {
  // 1. Idempotency cache check
  const cached = checkIdempotencyCache(payload.idempotencyKey);
  if (cached) return cached;

  // 2. Lookup handler
  const handler = TOOL_REGISTRY[toolId];
  if (!handler) return { success: false, error: 'unknown_tool' };

  // 3. Validate args
  const parsed = handler.argsSchema.safeParse(payload.args);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  // 4. Execute (runs as GM via socketlib)
  let result: ToolResult;
  try {
    result = await handler.handle(parsed.data);
  } catch (err) {
    result = { success: false, error: String(err) };
  }

  // 5. Cache + audit
  setIdempotencyCache(payload.idempotencyKey, result);
  await writeAuditLog({ toolId, payload: payload.args, idempotencyKey: payload.idempotencyKey, result });

  return result;
}
```

[ASSUMED — pattern derived from CONTEXT.md design doc]

### Pattern 2: Path B Multi-Attack Loop

```typescript
// handlers/weapon-attack.ts
export const weaponAttackHandler: ToolHandler<WeaponAttackInput> = {
  argsSchema: WeaponAttackInputSchema,
  async handle(args) {
    const actor = game.actors.get(args.actor_id);
    if (!actor) return { success: false, error: 'actor_not_found' };

    const item = actor.items.get(args.item_id);
    if (!item) return { success: false, error: 'item_not_found' };

    // Find the attack activity on the item
    const activity = item.system.activities?.contents.find(a => a.type === 'attack');
    if (!activity) return { success: false, error: 'no_attack_activity' };

    const count = args.count ?? 1; // MULTI-01: count from WeaponAttackInput (Phase 7 adds count field)

    // Path B: client-side loop (activity.use has no count param — verified dnd5e 5.3.3)
    const results: unknown[] = [];
    for (let i = 0; i < count; i++) {
      await activity.use({ configure: false });
      results.push({ attackIndex: i + 1, of: count });
      // Bridge receives hook update; CombatTrackerPanel chip updates via combat.state delta
    }

    return { success: true, data: { attacks: results } };
  },
};
```

[ASSUMED — pattern; `activity.use({ configure: false })` inferred from ActivityUseConfiguration inspection]

### Pattern 3: AoE Template Placement (bypassing drawPreview)

```typescript
// handlers/place-template.ts
export const placeTemplateHandler: ToolHandler<PlaceTemplateInput> = {
  argsSchema: PlaceTemplateInputSchema,
  async handle(args) {
    const actor = game.actors.get(args.actor_id);
    const item = actor?.items.get(args.item_id);
    const activity = item?.system.activities?.contents[0];
    if (!actor || !item || !activity) return { success: false, error: 'not_found' };

    // Synchronous — returns AbilityTemplate[] | null
    const templates = dnd5e.canvas.AbilityTemplate.fromActivity(activity);
    if (!templates || templates.length === 0) return { success: false, error: 'no_templates' };

    // Cannot use drawPreview() — requires mouse. Instead:
    // Emit per-template placement request to bridge → g2-app shows TemplatePlacementPanel
    // g2-app sends back { type: 'place-template.confirm', payload: { x, y, templateIndex } }
    // Phase 7 Plan 07-03 handles the async response chain

    return { success: true, data: { templateCount: templates.length, pendingPlacement: true } };
  },
};
```

[VERIFIED: AbilityTemplate.fromActivity is synchronous; ASSUMED: exact `dnd5e.canvas.AbilityTemplate` namespace path — verify at execution time]

### Pattern 4: Audit Log Write

```typescript
// audit-log.ts
export interface AuditEntry {
  tool: string;
  payload: unknown;
  idempotencyKey: string;
  actor: string;
  result: unknown;
  timestamp: number;
  bearer_id: string; // first 8 chars of bearer (T-02-01: never log full token)
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const gmIds = game.users.contents.filter(u => u.isGM).map(u => u.id);
  await ChatMessage.create({
    user: game.user?.id ?? '',
    whisper: gmIds,
    speaker: { alias: 'EVF Audit' },
    content: `<div class="evf-audit" style="display:none">${JSON.stringify(entry)}</div>`,
    flags: { evf: { audit: entry } },
  });
}
```

[CITED: foundryvtt.com/article/chat/ — whisper visibility rule; ASSUMED: ChatMessage.create() signature shape]

### Anti-Patterns to Avoid

- **`activity.use()` in g2-app or bridge** — violates ADR-0011 single-workflow-origin; detected by CI grep gate
- **`drawPreview()` for R1 template placement** — requires mouse interaction; use `createEmbeddedDocuments` directly after receiving coordinates from g2-app
- **`dnd5e.preItemUsage` hook subscription** — hook does not exist in dnd5e 5.3.3; use `dnd5e.preUseActivity`
- **`return false` in `dnd5e.preUseActivity` for reaction detection** — Phase 7 is DISPLAY-ONLY; returning false would cancel the NPC action (only ACT-04 V2 may cancel)
- **Logging full bearer token in audit** — T-02-01; use first 8 chars as `bearer_id`
- **`lru-cache` npm package in Foundry module** — browser compatibility risk; use Map-based hand-roll

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bearer token generation | Custom PRNG | `crypto.getRandomValues()` (already in bearer-registry.ts) | Cryptographic random is mandatory; custom PRNG is insecure |
| Zod schema for ToolInvocationEnvelope | Ad-hoc JSON parsing | `ToolInvocationEnvelopeSchema` (Phase 7 adds to shared-protocol) | Consistency with ADR-0002 envelope contract |
| Activity execution | Custom Foundry hooks | `activity.use()` (via socketlib.executeAsGM) | dnd5e manages slot consumption, concentration, MidiQOL workflow |
| Template document creation | Direct PIXI manipulation | `canvas.scene.createEmbeddedDocuments("MeasuredTemplate", ...)` | Foundry's embedded document API handles persistence, permissions, sync |
| GM user ID lookup | Hard-coded user IDs | `game.users.contents.filter(u => u.isGM).map(u => u.id)` | Foundry user list is authoritative |
| Chat message whisper targeting | Custom visibility logic | `ChatMessage.create({ whisper: gmIds })` | Foundry's native whisper semantics are well-tested |

---

## Runtime State Inventory

> Not applicable — Phase 7 is a greenfield write path. No renames, refactors, or data migrations. No stored data references old identifiers.

---

## Common Pitfalls

### Pitfall 1: `dnd5e.preActivityUse` vs `dnd5e.preUseActivity`
**What goes wrong:** Subscribing to the non-existent `dnd5e.preActivityUse` hook; the handler never fires; reaction toasts are never emitted.
**Why it happens:** CONTEXT.md §Area 3 incorrectly names the hook as `dnd5e.preActivityUse`. The actual hook name in dnd5e 5.3.3 is `dnd5e.preUseActivity`.
**How to avoid:** Use `Hooks.on('dnd5e.preUseActivity', ...)` only. The `reaction-watcher.ts` file must use the verified hook name.
**Warning signs:** No reaction toasts emitted during testing; `Hooks.on` call returns a hook ID but handler never executes.

### Pitfall 2: Path A assumption (activity.use({count: N}))
**What goes wrong:** Implementing `activity.use({ count: 2 })` — this field does not exist; Foundry silently ignores unknown fields and only runs one attack.
**Why it happens:** Specs.md §10.0.10 P2 listed this as an open question; if the researcher does not verify, the planner may implement Path A incorrectly.
**How to avoid:** ALWAYS use Path B (client-side loop). count field is absent from ActivityUseConfiguration in dnd5e 5.3.3.
**Warning signs:** Multi-attack only produces 1 chat card regardless of count argument.

### Pitfall 3: `drawPreview()` for template placement
**What goes wrong:** Calling `template.drawPreview()` from within an `executeAsGM` handler — it sets up mouse event listeners in the GM's browser context, not the player's. Even if it works, it cannot receive R1 gestures which originate phone-side.
**Why it happens:** `drawPreview()` is the natural dnd5e API; non-obvious that it's mouse-only.
**How to avoid:** Bypass `drawPreview()` entirely. Use `fromActivity()` to get the template shape, then `createEmbeddedDocuments()` with coordinates received from g2-app's TemplatePlacementPanel.
**Warning signs:** Template placement panel appears on GM's canvas, not phone; R1 taps have no effect.

### Pitfall 4: Idempotency key scope
**What goes wrong:** The module-side idempotency cache uses the `idempotencyKey` alone as the cache key. A malicious replay with a different bearer but the same key would return the cached result.
**Why it happens:** T-03-05 identified this as the Phase 3 limitation; Phase 7 must bind cache entries to `${bearerHash}:${idempotencyKey}`.
**How to avoid:** Cache key = `SHA256(bearer).slice(0,16) + ':' + idempotencyKey`. Bearer hash can be computed in the module using `crypto.subtle.digest('SHA-256', ...)` available in Foundry's browser context.
**Warning signs:** Replay attack test passes with different bearer + same idempotencyKey.

### Pitfall 5: socketlib GM offline
**What goes wrong:** `executeAsGM` rejects if no GM is connected. The bridge calls `dispatchTool()` which calls the Foundry handler via socketlib, and the rejection propagates up as an unhandled error.
**Why it happens:** Single-player MVP assumes GM is always connected; disconnected GMs are an edge case.
**How to avoid:** Wrap all `executeAsGM` calls in `try/catch`; return `{ success: false, error: 'no_gm_connected' }` on rejection. The bridge handler for `/v1/tools/:name` must translate this into HTTP 503.
**Warning signs:** 500 Internal Server Error from bridge instead of 503 when GM disconnects.

### Pitfall 6: `game.users` not declared in foundry-globals.d.ts
**What goes wrong:** TypeScript compilation fails with "Property 'users' does not exist on type '...'".
**Why it happens:** `foundry-globals.d.ts` was written incrementally; `game.users` was not needed for Phases 2–6 and was not added.
**How to avoid:** Wave 0 (Plan 07-01) must add `users: FoundryCollection<FoundryUser>` to the `game` declaration. `FoundryUser` already exists in the type file.
**Warning signs:** `pnpm typecheck` fails on `game.users.contents`.

### Pitfall 7: registerComplexHandler count assertion
**What goes wrong:** If Phase 7 adds new `registerComplexHandler` calls (instead of replacing stubs), `module.test.ts` assertion `toHaveBeenCalledTimes(14)` fails.
**Why it happens:** Phase 2/3 pre-registered the 7 Phase 7 stubs to enable forward-compatible testing. Phase 7 must replace handlers, not add new registrations.
**How to avoid:** Replace the stub function bodies inside `socketlib-handlers.ts`. Do NOT add new `registerComplexHandler` calls. Keep total = 14.
**Warning signs:** `module.test.ts` fails with "Expected 14, received 21".

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### activity.use() call (Path B single iteration)
```typescript
// Source: dnd5e 5.3.3 mixin.mjs — confirmed single activation
await activity.use({ configure: false }); // skips dialog, uses defaults
```

### AbilityTemplate.fromActivity() call
```typescript
// Source: dnd5e 5.3.3 ability-template.mjs — synchronous, returns AbilityTemplate[] | null
const templates = dnd5e.canvas.AbilityTemplate.fromActivity(activity);
if (!templates) return { success: false, error: 'no_template_shape' };
// templates[0].document contains the shape (type, size) at x:0, y:0
```

### dnd5e.preUseActivity hook subscription
```typescript
// Source: dnd5e 5.3.3 mixin.mjs line ~348
Hooks.on('dnd5e.preUseActivity', (activity, usageConfig, dialogConfig, messageConfig) => {
  // activity.actor?.id — who is acting
  // activity.item?.name — what item/spell is being used
  // Do NOT return false — Phase 7 is display-only
});
```

### socketlib handler registration (existing pattern)
```typescript
// Source: packages/foundry-module/src/pair/socketlib-handlers.ts
socketlib.registerComplexHandler(MODULE_ID, 'evf.castSpell', handleCastSpell);
// Replaces the stub; total registerComplexHandler count stays 14
```

### ChatMessage audit log
```typescript
// Source: foundryvtt.com/api (ChatMessage.create)
await ChatMessage.create({
  user: game.user?.id ?? '',
  whisper: game.users.contents.filter(u => u.isGM).map(u => u.id),
  speaker: { alias: 'EVF Audit' },
  content: `<div class="evf-audit" style="display:none">${JSON.stringify(auditEntry)}</div>`,
  flags: { evf: { audit: auditEntry } },
});
```

### Bearer rotation with existing infra
```typescript
// Source: bearer-registry.ts — refresh=true already handles 60s grace
const newEntry = await generateBearer(alias, bridgeUrl, worldId, true);
// Old token's expiresAt = now + 60_000 (GRACE_60S_MS)
// New token's expiresAt = now + 86_400_000 (TTL_24H_MS)
// validateBearer() already accepts both within their respective windows
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `dnd5e.preItemUsage` hook | `dnd5e.preUseActivity` hook | dnd5e 4.x → 5.x (Activity system rewrite) | CONTEXT.md §Area 3 must use the new hook name |
| `item.use()` (legacy) | `activity.use()` via Activity system | dnd5e 3.x → 4.x (introduced in dnd5e 4.0) | Items no longer directly have `use()`; all actions go through Activity sub-documents |
| `HTTP+SSE` MCP transport | Streamable HTTP | 2025-03-26 | Already handled; no Phase 7 impact |

**Deprecated/outdated:**
- `dnd5e.preItemUsage`: Was a hook in pre-Activity dnd5e; replaced by `dnd5e.preUseActivity` in dnd5e 4.x/5.x when the Activity sub-document system was introduced. Do not use.
- `item.use()`: Replaced by `activity.use()`. The `item.use()` method in dnd5e 5.3.3 is a thin wrapper that finds the first activity and delegates.
- `AbilityTemplate.fromData(data)`: Pre-Activity API; replaced by `AbilityTemplate.fromActivity(activity)`. Not relevant for Phase 7 but worth noting for type declarations.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dnd5e.canvas.AbilityTemplate` is the correct namespace path for the class in dnd5e 5.3.3 | Pattern 3, Code Examples | Could be `dnd5e.canvas.ability.AbilityTemplate` or require import; fix at execution time via namespace inspection |
| A2 | `activity.type === 'attack'` correctly identifies attack activities on weapon items | Pattern 2 | Might be `'mwak'` or another type string; verify at execution time via `game.actors` inspection |
| A3 | `item.system.activities.contents` is the correct iterable for activities on a dnd5e 5.3.3 item | Pattern 2, 3 | Could be `item.system.activities.values()` or a Map; verify via dnd5e source at execution time |
| A4 | `ChatMessage.create()` is the correct static method name for creating audit messages | Pattern 4, Code Examples | API shape confirmed via foundryvtt.com API docs but exact argument shape not verified in source |
| A5 | `game.user?.id` is the correct field for the current user's ID | Pattern 4 | Could be `game.user.id` (non-optional) in Foundry v13+; check type declaration |
| A6 | Bearer rotation via `generateBearer(refresh=true)` correctly handles all devices paired simultaneously | Q6 | The loop in `generateBearer` shortens ALL active tokens matching alias+bridgeUrl; if multiple devices share an alias (shouldn't happen in MVP), all get shortened TTL |
| A7 | `Hooks.on('dnd5e.preUseActivity', ...)` fires for NPC attacks (not just player actions) | Q3 | If the hook only fires for PC actions, reaction detection for NPC attacks won't work; needs empirical verification (SC-07-02) |

**3 of 10 research questions required ASSUMED claims (A1–A7). All are verifiable at execution time via source inspection or runtime testing. No compliance/security decisions rely on ASSUMED claims.**

---

## Open Questions

1. **`AbilityTemplate` namespace path in dnd5e 5.3.3**
   - What we know: `fromActivity` is a static method on `AbilityTemplate`
   - What's unclear: exact import path / global namespace (`dnd5e.canvas.AbilityTemplate`? `game.dnd5e`?)
   - Recommendation: Add a type declaration stub using `declare namespace dnd5e.canvas { class AbilityTemplate { ... } }` and verify at plan execution time via Foundry inspector

2. **`dnd5e.preUseActivity` for NPC actions vs player actions**
   - What we know: Hook fires before ANY activity.use() call
   - What's unclear: Whether it fires for NPCs in combat (not just player-initiated uses)
   - Recommendation: SC-07-02 closes this; assume it fires for all actors pending hardware verification

3. **`WeaponAttackInputSchema` needs `count` field for MULTI-01**
   - What we know: Phase 3 `weapon-attack.ts` has no `count` field
   - What's unclear: Phase 7 must add `count: z.number().int().min(1).max(10).default(1)` to `WeaponAttackInputSchema`
   - Recommendation: Plan 07-04 (multi-attack) adds the field; breaks no existing tests since default is 1

4. **TemplatePlacementPanel interaction with existing overlay slot**
   - What we know: Phase 4b established the z=2 overlay slot; ConcentrationDropModalPanel uses `'overlay-block'` container
   - What's unclear: Can TemplatePlacementPanel reuse `'overlay-block'`, or does it need a separate container name?
   - Recommendation: Reuse `'overlay-block'` strategy — same container name, different content per ADR-0009 Amendment 1 (single text container per overlay panel)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| dnd5e (Foundry system) | All write handlers | Declared in module.json | ≥5.3.3 | None — required |
| socketlib (Foundry module) | All executeAsGM calls | Declared in module.json | latest | None — required |
| MidiQOL (Foundry module) | Enhanced workflow | Optional | latest | Fallback to vanilla `activity.use()` |
| `crypto.getRandomValues` | Module idempotency cache key hashing | ✓ (Foundry v13+ browser) | platform | None needed |
| `ChatMessage.create` | Audit log | ✓ (Foundry v13+ API) | platform | None needed |

**No missing dependencies with no fallback** — all required dependencies are already declared.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root workspace) |
| Quick run command | `pnpm --filter @evf/foundry-module test` |
| Full suite command | `pnpm test:coverage` |

**Current baseline:** 1315 tests passing across 82 test files (verified 2026-05-16).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUN-03 | `dispatchTool('cast-spell', {...})` invokes `activity.use()` in handler | unit | `pnpm --filter @evf/foundry-module test` | ❌ Wave 0: `packages/foundry-module/src/write-path/tool-registry.test.ts` |
| FOUN-03 | Idempotency cache returns cached result on repeat key | unit | `pnpm --filter @evf/foundry-module test` | ❌ Wave 0: `packages/foundry-module/src/write-path/idempotency-cache.test.ts` |
| FOUN-03 | Audit log emits `ChatMessage.create` with `whisper: gmIds` | unit (mock ChatMessage) | `pnpm --filter @evf/foundry-module test` | ❌ Wave 1: `packages/foundry-module/src/write-path/audit-log.test.ts` |
| ACT-02 | `AbilityTemplate.fromActivity` returns array; each template gets x,y from confirm | unit (mock dnd5e) | `pnpm --filter @evf/foundry-module test` | ❌ Wave 2: `packages/foundry-module/src/write-path/handlers/place-template.test.ts` |
| ACT-02 | TemplatePlacementPanel renders position-confirm UI; tap emits `place-template.confirm` | unit (happy-dom) | `pnpm --filter @evf/g2-app test` | ❌ Wave 2: `packages/g2-app/src/panels/template-placement-panel.test.ts` |
| ACT-03 | `registerSocketlibHandlers` still registers exactly 14 handlers after stub replacement | unit | `pnpm --filter @evf/foundry-module test` | ✅ `packages/foundry-module/src/module.test.ts` (count assertion) |
| ACT-03 | `executeAsGM` rejection (GM offline) returns `{ success: false, error: 'no_gm_connected' }` | unit | `pnpm --filter @evf/foundry-module test` | ❌ Wave 1: in `tool-registry.test.ts` |
| MULTI-01 | Path B loop: `weaponAttackHandler` calls `activity.use()` N times for count=2 | unit (mock activity) | `pnpm --filter @evf/foundry-module test` | ❌ Wave 2: `packages/foundry-module/src/write-path/handlers/weapon-attack.test.ts` |
| MULTI-01 | CombatTrackerPanel renders `[Atk 1/2]` chip when `multiAttackState.current=1, total=2` | unit (INV-1 fixture) | `pnpm --filter @evf/g2-app test` | ❌ Wave 2: fixture in `packages/g2-app/src/panels/__fixtures__/` |
| REACT-01 | `reaction-watcher.ts` subscribes to `dnd5e.preUseActivity` (correct hook name) | unit | `pnpm --filter @evf/foundry-module test` | ❌ Wave 3: `packages/foundry-module/src/write-path/reaction-watcher.test.ts` |
| REACT-01 | Toast emitted for matching NPC attack targeting player | unit (mock Hooks + mock bridge) | `pnpm --filter @evf/foundry-module test` | ❌ Wave 3: in `reaction-watcher.test.ts` |
| CONC-01 | `drop-concentration` handler calls `effect.delete()` when given valid effectId | unit | `pnpm --filter @evf/foundry-module test` | ❌ Wave 3: `packages/foundry-module/src/write-path/handlers/drop-concentration.test.ts` |
| bearer (cross-cutting) | `scheduleRotation()` calls `generateBearer(refresh=true)` after 24h | unit (vi.useFakeTimers) | `pnpm --filter @evf/foundry-module test` | ❌ Wave 0: in `bearer-registry.test.ts` extension |
| bearer (cross-cutting) | Bridge TokenCache correctly validates previous-token within 60s grace | unit | `pnpm --filter @evf/bridge test` | ❌ Wave 0: in `packages/bridge/src/auth/token-cache.test.ts` extension |
| FOUN-03 (hardware) | Real executeAsGM round-trip: cast-spell produces Foundry chat card | manual | human: `pnpm --filter @evf/validation-harness validate:all` | SC-07-01 deferred |
| REACT-01 (hardware) | `dnd5e.preUseActivity` fires for NPC attack; reaction toast visible on G2 | manual | human: live combat encounter | SC-07-02 deferred |
| FOUN-03 (hardware) | MidiQOL full workflow with autoFastForward | manual | human: live session + MidiQOL | SC-07-03 deferred |
| CONC-01 (hardware) | Phase 4b conc.drop.confirmed → effect.delete on GM side | manual | human: live actor with concentration | SC-07-04 deferred |

### Sampling Rate
- **Per task commit:** `pnpm --filter @evf/foundry-module test` (+ `@evf/g2-app` for UI tasks)
- **Per wave merge:** `pnpm test:coverage` (full 1315+ test suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/foundry-module/src/write-path/tool-registry.test.ts` — covers FOUN-03 dispatch + idempotency cache
- [ ] `packages/foundry-module/src/write-path/idempotency-cache.test.ts` — covers 60s TTL eviction, max entries, bearer-bound key
- [ ] `packages/foundry-module/src/write-path/audit-log.test.ts` — covers ChatMessage.create with whisper: gmIds
- [ ] `packages/bridge/src/auth/token-cache.test.ts` — extension: grace window validation
- [ ] `packages/shared-protocol/src/payloads/tool.test.ts` — covers ToolInvocationEnvelopeSchema, BearerRotatedPayloadSchema
- [ ] Extend `packages/foundry-module/src/types/foundry-globals.d.ts` — add `game.users`, `ChatMessage.create`, `ActiveEffect.delete()`, dnd5e namespace types

*(Existing infrastructure at 1315 tests covers all Phases 1–6 surfaces — no regression of prior tests expected)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer opaque 24h + 60s grace rotation; dual-validator middleware |
| V3 Session Management | yes | 60s LRU idempotency cache; replay attack mitigation |
| V4 Access Control | yes | `socketlib.executeAsGM` — GM authority gating; whisper: gmIds for audit log |
| V5 Input Validation | yes | Zod schema parse on all tool args before dispatch |
| V6 Cryptography | partial | `crypto.getRandomValues` for bearer generation (already implemented); SHA-256 for idempotency cache key binding (new) |

### Known Threat Patterns for Phase 7 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Replay attack on idempotency key | Spoofing | Cache key = `SHA256(bearer).slice(0,16) + ':' + idempotencyKey` — ties result to bearer identity |
| Bearer leak (player intercepts rotation) | Information Disclosure | 24h rotation + 60s grace; bearer not logged (T-02-01); first 8 chars only in audit |
| Client-side write bypass (activity.use in g2-app) | Tampering | CI grep gate (Gate 8) at compile time; ADR-0011 architecture constraint |
| Audit log tampering | Tampering | `whisper: allGmIds` (Foundry-enforced visibility); flags.evf.audit in immutable Foundry document |
| GM offline injection | Denial of Service | executeAsGM rejects → 503; no silent failure |
| Idempotency key flooding | Denial of Service | Max 1,000 entries in module cache; bridge-side rate limit 100 req/min already applied upstream |

---

## Sources

### Primary (HIGH confidence)
- `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/mixin.mjs` — `use()` signature, `dnd5e.preUseActivity` hook name + payload, ActivityUseConfiguration fields (no count param)
- `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/_types.mjs` — ActivityUseConfiguration typedef (no count field)
- `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/canvas/ability-template.mjs` — `fromActivity()` synchronous, returns `AbilityTemplate[] | null`, `target.count` multi-template
- `github.com/farling42/foundryvtt-socketlib` README — executeAsGM signature, error propagation, registration pattern
- `packages/foundry-module/src/pair/bearer-registry.ts` — existing rotation infra (TTL_24H_MS, GRACE_60S_MS, refresh=true)
- `packages/foundry-module/src/pair/socketlib-handlers.ts` — 14 existing handler registrations, 7 Phase 7 stubs
- `packages/bridge/src/middleware/idempotency.ts` — Map-based LRU pattern to replicate in module
- `.github/workflows/ci.yml` — 7-gate CI structure; Gate 8 slot identified
- `packages/foundry-module/src/module.test.ts` — `toHaveBeenCalledTimes(14)` assertion
- `pnpm test` (2026-05-16) — 1315 tests passing, baseline verified

### Secondary (MEDIUM confidence)
- `foundryvtt.com/article/chat/` — whisper visibility: recipients-only rule
- `foundryvtt.com/api/classes/foundry.documents.ChatMessage.html` — ChatMessage.create() static method, whisper ArrayField definition
- `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/attack.mjs` — AttackActivity has no count/repeat logic; confirms Path B
- `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/item.mjs` — `dnd5e.preItemUsage` absent; item.use() delegates to activity.use()

### Tertiary (LOW confidence / ASSUMED)
- `dnd5e.canvas.AbilityTemplate` namespace path (A1) — inferred from dnd5e module structure
- `activity.type === 'attack'` discriminant (A2) — inferred from dnd5e attack.mjs class name
- `item.system.activities.contents` iterable shape (A3) — inferred from Foundry Collection pattern (game.actors.contents, etc.)

---

## Metadata

**Confidence breakdown:**
- Core API (activity.use, fromActivity, hook name, socketlib): HIGH — verified via source inspection
- Bearer rotation extension: HIGH — existing code read directly
- idempotency cache recommendation: HIGH — bridge pattern replicated
- ChatMessage whisper security: MEDIUM — documented rule verified, runtime behavior not live-tested
- AoE namespace paths (dnd5e.canvas.AbilityTemplate): LOW — inferred from module structure

**Research date:** 2026-05-16
**Valid until:** 2026-08-16 (90 days — dnd5e minor versions move fast; re-verify `fromActivity` signature before Phase 7 executor runs if >30 days elapse)

**Key decision this research closes:** Phase 0 §10.0.10 P2 open question "Multi-attack count param (`activity.use({count: 2})` vs client-loop)" is now **CLOSED**: Path B (client-side loop) is the only valid implementation. `count` does not exist in `ActivityUseConfiguration` in dnd5e 5.3.3.
