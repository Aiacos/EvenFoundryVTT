---
phase: 07-foundry-module-write-path
reviewed: 2026-05-16T00:00:00Z
depth: quick
files_reviewed: 17
files_reviewed_list:
  - packages/foundry-module/src/write-path/tool-registry.ts
  - packages/foundry-module/src/write-path/idempotency-cache.ts
  - packages/foundry-module/src/write-path/audit-log.ts
  - packages/foundry-module/src/write-path/handlers/cast-spell.ts
  - packages/foundry-module/src/write-path/handlers/weapon-attack.ts
  - packages/foundry-module/src/write-path/handlers/use-item.ts
  - packages/foundry-module/src/write-path/handlers/move-token.ts
  - packages/foundry-module/src/write-path/handlers/place-template.ts
  - packages/foundry-module/src/write-path/handlers/drop-concentration.ts
  - packages/foundry-module/src/write-path/reaction-watcher.ts
  - packages/foundry-module/src/pair/bearer-rotation.ts
  - packages/g2-app/src/panels/template-placement-panel.ts
  - packages/g2-app/src/panels/template-placement-dispatcher.ts
  - packages/g2-app/src/panels/multi-attack-progress-dispatcher.ts
  - packages/g2-app/src/panels/reaction-toast-dispatcher.ts
  - packages/g2-app/src/panels/concentration-drop-modal.ts
  - packages/g2-app/src/panels/combat-tracker-panel.ts
findings:
  critical: 5
  warning: 3
  info: 0
  total: 8
status: fixed
fixes_applied:
  fixed: 8
  skipped: 0
  fix_report: 07-REVIEW-FIX.md
  fixed_at: 2026-05-16T14:00:00Z
---

# Phase 7: Code Review Report

**Reviewed:** 2026-05-16T00:00:00Z
**Depth:** quick
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 7 ships the write-path infrastructure (dispatchTool, idempotency cache, audit log, 6 handlers) and the corresponding g2-app dispatchers. The foundation — IdempotencyStore, hashBearer, dispatchTool pipeline, handler single-workflow-origin discipline, double-trust-boundary dispatchers — is correctly implemented. CI Gate 8 is clean: zero `activity.use()` calls outside `write-path/handlers/`.

Five critical defects were found:

1. **The bridge WS server never routes `tool.invoke` messages from g2-app** — every `ws.send(JSON.stringify(toolInvokeEnvelope))` call in `concentration-drop-modal.ts` and `template-placement-panel.ts` is silently dropped. The `drop-concentration` and `confirm-template-placement` flows are completely non-functional end-to-end.
2. **Audit log with no GMs online broadcasts audit entries publicly** (`whisper: []` = visible to all in Foundry).
3. **`[Atk N/M]` chip overflows the INV-1 66-char row budget** when count >= 10 — `[Atk 10/10]` is 11 chars, not 9.
4. **`PLACEMENT_CONTEXTS` entry is never deleted on successful confirm** — idempotency cache guards do not apply here (different code path), so the same `templateIndex` can be confirmed multiple times within the 60s TTL window, creating duplicate `MeasuredTemplate` documents.
5. **`confirm-template-placement` is absent from `TOOL_ID_SCHEMA`** — the `ToolInvocationEnvelopePayloadSchema` in `shared-protocol` does not include this toolId, meaning any bridge-side envelope validation would reject it outright.

---

## Critical Issues

### CR-01: Bridge WS never handles `tool.invoke` — all g2-app write actions silently dropped

**File:** `packages/bridge/src/server.ts:249`
**Issue:** `packages/bridge/src/server.ts` installs exactly one WS `message` handler: `handleResume` (which handles only `client_resume` type). Any `tool.invoke` envelope sent by `concentration-drop-modal.ts` or `template-placement-panel.ts` via `ws.send(...)` arrives at the bridge and is silently ignored — `handleResume` returns `undefined` after failing `ClientResumeSchema.safeParse`. The architectural flow documented in `07-05-PLAN.md` line 65 ("Tap emits tool.invoke envelope → bridge → socketlib evf.dropConcentration → dispatchTool") has no implementation on the bridge side. Both CONC-01 (drop-concentration) and ACT-02 (confirm-template-placement) write paths are non-functional in production.

**Fix:** Add a `tool.invoke` WS message handler alongside `handleResume` in `server.ts`. The handler must:
1. Parse the raw message via `EnvelopeSchema.safeParse`.
2. Narrow on `envelope.type === 'tool.invoke'`.
3. Validate `envelope.payload` via `ToolInvocationEnvelopePayloadSchema.safeParse`.
4. Authenticate the session (use `sessionStore.getSession(sessionId)` to retrieve the bearer).
5. Call the appropriate socketlib-registered handler via the Foundry socket (e.g., `socketlibSocket.executeAsGM(handlerId, { args, idempotencyKey, bearer })`).

```typescript
// In server.ts, inside the 'ready' handler after registerSession:
socket.on('message', (rawData) => {
  // existing client_resume routing
  handleResume(socket, sessionId, replayBuffer, rawData, logger);
  // NEW: tool.invoke routing
  handleToolInvoke(socket, sessionId, sessionStore, rawData, logger);
});
```

---

### CR-02: Audit log emits public ChatMessage when no GMs are connected

**File:** `packages/foundry-module/src/write-path/audit-log.ts:93`
**Issue:** `gmIds` is built from `game.users.contents.filter(u => u.isGM).map(u => u.id)`. In Foundry VTT, `ChatMessage.create({ whisper: [] })` creates a **public** message visible to all connected players — `whisper: []` does not mean "hide from all", it means "not whispered" (i.e., the message shows in every player's chat). If no GMs are online at the moment of `writeAuditLog` (e.g., GM disconnected mid-session, or early-boot write before GM logs in), every player can read the audit entry including `idempotencyKey`, `actorId`, `bearer_id`, and the full `payload` object. The `payload` field is the raw args before schema validation, which could expose internal document IDs.

**Fix:**
```typescript
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const gmIds = game.users.contents.filter((u) => u.isGM).map((u) => u.id);

  // If no GMs are online, skip the write entirely — a public audit message
  // is worse than no audit message (T-07-04: players must not read audit entries).
  if (gmIds.length === 0) {
    console.warn('[EVF] writeAuditLog: no GMs connected — skipping audit write to prevent public exposure', {
      tool: entry.tool,
      idempotencyKey: entry.idempotencyKey,
    });
    return;
  }

  try {
    await ChatMessage.create({ ... });
  } catch (err) { ... }
}
```

---

### CR-03: `[Atk N/M]` chip overflows INV-1 row budget for count >= 10

**File:** `packages/g2-app/src/panels/combat-tracker-panel.ts:305`
**Issue:** The chip is built as `` `[Atk ${multiAttackState.current}/${multiAttackState.total}]` `` and the comment on line 299 states "exactly 9 chars". However `WeaponAttackInputSchema` permits `count` up to 10, and `MultiAttackProgressPayloadSchema` permits `total` up to 10. For `current=10, total=10` the chip is `[Atk 10/10]` = **11 chars**. The `distDirGap3` field replaces 9 chars (6 dist + 3 gap), producing a 68-char row instead of the required 66. The `mainCps !== INNER_WIDTH` guard at line 339 catches this at runtime and fires `console.warn`, but the corrupted row is still sent to the bridge, violating INV-1 layout integrity.

**Fix:** Truncate the chip to exactly 9 chars:
```typescript
if (isActiveMultiAttack) {
  const chipRaw = `[Atk ${multiAttackState.current}/${multiAttackState.total}]`;
  // Clamp to exactly 9 chars to preserve INV-1 row width (dist=6 + gap3=3).
  // Worst case [Atk 10/10]=11 chars; truncate to "[Atk 10/" (8) + "…" = "[Atk 10/…" (9).
  distDirGap3 = chipRaw.length <= 9 ? chipRaw.padEnd(9) : `${chipRaw.slice(0, 8)}…`;
}
```
Alternatively, lower `WeaponAttackInputSchema.count.max` to 9 so the chip never exceeds 9 chars (requires shared-protocol change + ADR amendment).

---

### CR-04: `PLACEMENT_CONTEXTS` never evicted on successful template confirm — duplicate template creation possible

**File:** `packages/foundry-module/src/write-path/handlers/place-template.ts:277`
**Issue:** `confirmTemplatePlacementHandler` reads `PLACEMENT_CONTEXTS.get(args.placementId)` but on successful commit (steps 5–6) never calls `PLACEMENT_CONTEXTS.delete(args.placementId)`. Within the 60-second TTL window a player (or a replayed/retried tool.invoke) can call `confirm-template-placement` with the same `placementId + templateIndex` multiple times. Each call passes all guards (TTL not expired, index in range, context found) and invokes `createEmbeddedDocuments` again, placing duplicate `MeasuredTemplate` documents on the scene. The idempotency cache in `dispatchTool` mitigates this only if the `idempotencyKey` is identical — different keys (e.g., retries or the lack of idempotencyKey in the template-placement-panel envelope, per CR-01) bypass the cache.

**Fix:** Delete the placement context immediately after a successful commit:
```typescript
const created = await scene.createEmbeddedDocuments('MeasuredTemplate', [templateData]);
// Evict context after successful commit — prevents duplicate placement within TTL window.
PLACEMENT_CONTEXTS.delete(args.placementId);
const templateId = created[0]?.id ?? null;
return { success: true, data: { templateId, templateIndex: args.templateIndex, x: args.x, y: args.y } };
```

---

### CR-05: `confirm-template-placement` absent from `TOOL_ID_SCHEMA` — wire validation always fails

**File:** `packages/shared-protocol/src/payloads/tool.ts:46`
**Issue:** `TOOL_ID_SCHEMA` enumerates exactly 6 tool IDs: `cast-spell`, `weapon-attack`, `use-item`, `move-token`, `drop-concentration`, `place-template`. The tool ID `confirm-template-placement` is absent. `ToolInvocationEnvelopePayloadSchema` (line 82) uses `toolId: TOOL_ID_SCHEMA`, making it a strict enum. Any bridge-side validation of an incoming `tool.invoke` envelope with `toolId: 'confirm-template-placement'` will fail with a Zod parse error — the tool would be rejected before reaching `dispatchTool`. This is consistent with CR-01 (the bridge doesn't currently parse tool.invoke at all), but fixing CR-01 without fixing CR-05 would route the confirm through validation and still fail.

**Fix:**
```typescript
// packages/shared-protocol/src/payloads/tool.ts
export const TOOL_ID_SCHEMA = z.enum([
  'cast-spell',
  'weapon-attack',
  'use-item',
  'move-token',
  'drop-concentration',
  'place-template',
  'confirm-template-placement',  // ADD: Plan 07-03 template confirmation flow
]);
```
Also update `ToolId` in `tool-registry.ts` — it already includes `'confirm-template-placement'` at line 64, so the shared-protocol enum is the only gap.

---

## Warnings

### WR-01: `dispatchTool` caches failed results — transient errors permanently locked for 60s

**File:** `packages/foundry-module/src/write-path/tool-registry.ts:299`
**Issue:** Step 6 caches `result` unconditionally regardless of `result.success`. A transient failure (e.g., `no_gm_connected` when the GM momentarily disconnects) locks that `idempotencyKey` for 60 seconds. A legitimate retry with the same `idempotencyKey` — e.g., the bridge or g2-app retrying after the GM reconnects — will receive the stale failure response from cache instead of re-executing. The spec's idempotency intent is "don't re-execute successful writes", not "don't retry failures". This is particularly harmful for `no_gm_connected` errors, which are transient by nature.

**Fix:**
```typescript
// Step 6: only cache SUCCESSFUL results (failure = retryable; success = idempotent)
if (result.success) {
  moduleIdempotencyStore.set(cacheKey, { result, cachedAt: Date.now() });
}
```

---

### WR-02: `onSnapshot` doesn't clear `multiAttackState` on turn advance — stale chip persists

**File:** `packages/g2-app/src/panels/combat-tracker-panel.ts:653`
**Issue:** `onSnapshot` resets `scrollOffset = 0` when `currentCombatantId` changes (new turn), but does **not** clear `this.multiAttackState`. The JSDoc comment at line 66–67 says the chip is "cleared... on combat-turn-advance (turn change detected in `onSnapshot`)" but the implementation omits this. If a multi-attack sequence is in progress when the turn advances (e.g., Extra Attack is interrupted by a combatant's reaction moving the turn), the `[Atk N/M]` chip stays rendered for the next combatant's turn until the dispatcher sends a final `current === total` progress event or until the dispatcher itself calls `setMultiAttackState(null)`. The dispatcher only clears on `current === total`, which never arrives if the handler threw an error mid-sequence.

**Fix:**
```typescript
onSnapshot(newSnapshot: CombatSnapshot): void {
  if (newSnapshot.currentCombatantId !== this.lastCurrentCombatantId) {
    this.scrollOffset = 0;
    this.lastCurrentCombatantId = newSnapshot.currentCombatantId;
    // Clear stale multi-attack chip on turn advance (documented invariant, missing impl).
    this.multiAttackState = null;
  }
  this.snapshot = newSnapshot;
  void this.draw();
}
```

---

### WR-03: `template-placement-panel.ts` `tool.invoke` envelope missing `idempotencyKey`

**File:** `packages/g2-app/src/panels/template-placement-panel.ts:183`
**Issue:** The `tool.invoke` envelope emitted on tap (line 183–198) omits `idempotencyKey`. The `ToolInvocationEnvelopePayloadSchema` (shared-protocol) requires `idempotencyKey: z.string().uuid()`. When CR-01 is fixed and the bridge routes this envelope through `ToolInvocationEnvelopePayloadSchema.safeParse`, the parse will fail and the confirm will be silently rejected. By contrast, `concentration-drop-modal.ts` correctly generates `idempotencyKey: crypto.randomUUID()` (line 283).

Note: `concentration-drop-modal.ts` has `declare const crypto: { randomUUID(): string }` at line 57, which is appropriate for the Even Realities WebView context. `template-placement-panel.ts` already uses `crypto.randomUUID()` would need the same declaration or a shared utility.

**Fix:**
```typescript
// template-placement-panel.ts, in the 'tap' case:
const confirmEnvelope = {
  proto: 'evf-v1' as const,
  seq: 0,
  ts: Date.now(),
  type: 'tool.invoke' as const,
  session_id: this.sessionId,
  payload: {
    toolId: 'confirm-template-placement',
    idempotencyKey: crypto.randomUUID(),  // ADD: required by ToolInvocationEnvelopePayloadSchema
    args: {
      placementId: this.payload.placementId,
      templateIndex: this.payload.templateIndex,
      x: this.x,
      y: this.y,
    },
  },
};
```
Add `declare const crypto: { randomUUID(): string };` at the top of the file (same pattern as `concentration-drop-modal.ts:57`).

---

## REVIEW COMPLETE

**5 Critical, 3 Warning findings.**

The most urgent defect is **CR-01**: the bridge WS server has no handler for `tool.invoke` messages, making both CONC-01 (drop-concentration) and ACT-02 (confirm-template-placement) completely non-functional in production — g2-app sends the envelope, the bridge silently ignores it. **CR-02** (audit exposure when no GMs online) is a security regression with low trigger probability but high impact. **CR-03–CR-05** are correctness defects affecting INV-1 integrity, duplicate template creation, and schema mismatch. The three warnings (CR-style deferred: WR-01 retryable-failure caching, WR-02 stale chip on turn-advance, WR-03 missing idempotencyKey) are secondary but must be addressed before CR-01 fix lands or the retried tool.invoke paths will have new failure modes.

---

_Reviewed: 2026-05-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
