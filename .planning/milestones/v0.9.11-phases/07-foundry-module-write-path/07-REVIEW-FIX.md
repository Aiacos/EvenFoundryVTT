---
phase: 07-foundry-module-write-path
fixed_at: 2026-05-16T14:00:00Z
review_path: .planning/phases/07-foundry-module-write-path/07-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-05-16T14:00:00Z
**Source review:** `.planning/phases/07-foundry-module-write-path/07-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (5 Critical + 3 Warning)
- Fixed: 8
- Skipped: 0

**Final suite gate:** 1637 tests passed (106 test files), typecheck clean, lint 0 errors.
Regression tests added: 21 (across 7 new/modified test files).

---

## Fixed Issues

### CR-05: `confirm-template-placement` absent from `TOOL_ID_SCHEMA`

**Files modified:** `packages/shared-protocol/src/payloads/tool.ts`, `packages/shared-protocol/src/payloads/tool.test.ts`
**Commit:** `9c56adf`
**Applied fix:** Added `'confirm-template-placement'` as the 7th entry in the `TOOL_ID_SCHEMA` z.enum. Updated JSDoc count from 6 to 7. Added regression test `TP-CR05` verifying that a valid `ToolInvocationEnvelopePayloadSchema` parse succeeds with `toolId: 'confirm-template-placement'`.

**Note:** Fixed before CR-01 because CR-01's `handleToolInvoke` would validate incoming envelopes via `ToolInvocationEnvelopePayloadSchema` — fixing CR-01 without CR-05 first would route `confirm-template-placement` through validation and still reject it.

---

### CR-01: Bridge WS never handles `tool.invoke` — all g2-app write actions silently dropped

**Files modified:** `packages/bridge/src/ws/tool-invoke.ts` (new), `packages/bridge/src/ws/tool-invoke.test.ts` (new), `packages/bridge/src/server.ts`
**Commit:** `bf282db`
**Applied fix:** Created `packages/bridge/src/ws/tool-invoke.ts` exporting `handleToolInvoke` with injectable `DispatchToolFn` dependency (matching the `handleResume` testability pattern). Handler pipeline: parse JSON → validate `EnvelopeSchema` → guard `type === 'tool.invoke'` → validate `ToolInvocationEnvelopePayloadSchema` → look up session bearer via `sessionStore` → invoke `dispatchToolFn` → send `tool.result` response frame. Added 10 regression tests covering happy path, wrong type (ignored), bad JSON, bad payload, no session, dispatch throw, confirm-template-placement tool, drop-concentration tool, result shape, and bearer forwarding. Wired into `server.ts` alongside `handleResume` in the message handler.

---

### CR-02: Audit log emits public ChatMessage when no GMs are connected

**Files modified:** `packages/foundry-module/src/write-path/audit-log.ts`, `packages/foundry-module/src/write-path/audit-log.test.ts`
**Commit:** `10fdd04`
**Applied fix:** Added early-return guard after `gmIds` is built: if `gmIds.length === 0`, emit `console.warn` with tool name and idempotencyKey (never full payload or bearer_id), then return without calling `ChatMessage.create`. This prevents a public audit message from exposing `idempotencyKey`, `actorId`, `bearer_id`, and `payload` to all players when no GMs are connected. Added 2 regression tests: one verifying `ChatMessage.create` is not called when no GMs present, one verifying no exception is thrown.

---

### CR-03: `[Atk N/M]` chip overflows INV-1 row budget for count >= 10

**Files modified:** `packages/g2-app/src/panels/combat-tracker-panel.ts`, `packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts`
**Commit:** `f81fee0`
**Applied fix:** Replaced the bare chip assignment with a clamp: chip is built as `chipRaw`, then if `chipRaw.length <= 9` padded to exactly 9 with `.padEnd(9)`, else truncated to 8 chars + `'…'` (U+2026, 1 code-point) = exactly 9 code-points. Worst case `[Atk 10/10]` (11 chars) becomes `[Atk 10/…` (9 code-points). Added 3 regression tests: CTP-CR03-NORMAL (counts 1/3, chip = `[Atk 1/3]` padded), CTP-CR03-OVERFLOW (counts 10/10, chip clamped to 9), CTP-CR03-PARTIAL (counts 10/2, chip clamped to 9).

---

### CR-04: `PLACEMENT_CONTEXTS` never evicted on successful template confirm

**Files modified:** `packages/foundry-module/src/write-path/handlers/place-template.ts`, `packages/foundry-module/src/write-path/handlers/place-template.test.ts`
**Commit:** `0116a6f`
**Applied fix:** Added `PLACEMENT_CONTEXTS.delete(args.placementId)` immediately after `createEmbeddedDocuments` succeeds and before reading `created[0]?.id`. This ensures the placement context is evicted on first successful commit, so subsequent calls with the same `placementId` within the 60s TTL window receive `placement_expired` rather than creating duplicate `MeasuredTemplate` documents. Added regression test (double-confirm): first confirm returns success and calls `createEmbeddedDocuments` once; second confirm returns `{ success: false, error: 'placement_expired' }` without calling `createEmbeddedDocuments` a second time.

---

### WR-01: `dispatchTool` caches failed results — transient errors permanently locked for 60s

**Files modified:** `packages/foundry-module/src/write-path/tool-registry.ts`, `packages/foundry-module/src/write-path/tool-registry.test.ts`
**Commit:** `9d689b8`
**Applied fix:** Wrapped the `moduleIdempotencyStore.set(...)` call in `if (result.success)`. Failed results (e.g., `no_gm_connected`, transient socket errors) are no longer cached, allowing the caller to retry with the same `idempotencyKey` after transient conditions resolve. Successful results remain cached as before to prevent duplicate writes. Added regression test WR-01: mock handler returns failure on first call, success on second call with same `idempotencyKey`; verifies handler is called twice (not cached on failure) and the second call returns success.

**Commit status:** fixed: requires human verification (logic change — verify cache-on-failure semantics match idempotency intent for all error categories).

---

### WR-02: `onSnapshot` doesn't clear `multiAttackState` on turn advance

**Files modified:** `packages/g2-app/src/panels/combat-tracker-panel.ts`, `packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts`
**Commit:** `199d088`
**Applied fix:** Added `this.multiAttackState = null;` in the turn-advance branch of `onSnapshot` (where `newSnapshot.currentCombatantId !== this.lastCurrentCombatantId`), matching the JSDoc invariant at line 66–67 that the chip is "cleared on combat-turn-advance". Added regression test CTP-WR02: sets multiAttackState, calls onSnapshot with new combatant ID, verifies multiAttackState is null and draw is called.

---

### WR-03: `template-placement-panel.ts` `tool.invoke` envelope missing `idempotencyKey`

**Files modified:** `packages/g2-app/src/panels/template-placement-panel.ts`, `packages/g2-app/src/panels/template-placement-panel.test.ts`
**Commit:** `a2acd30`
**Applied fix:** Added `declare const crypto: { randomUUID(): string };` ambient declaration at module top (same pattern as `concentration-drop-modal.ts:57`). Added `idempotencyKey: crypto.randomUUID()` to the `tool.invoke` envelope payload in the `'tap'` case handler. Added 2 regression tests: one verifying the envelope payload contains a valid UUID-format `idempotencyKey`, one verifying each tap generates a distinct UUID (randomness check).

---

### Biome format auto-fixes

**Files modified:** `packages/bridge/src/ws/tool-invoke.test.ts`, `packages/foundry-module/src/write-path/audit-log.ts`, `packages/foundry-module/src/write-path/tool-registry.test.ts`, `packages/g2-app/src/panels/template-placement-panel.test.ts`
**Commit:** `5fe072e`
**Applied fix:** `pnpm format` auto-fixed Biome rule violations introduced by fix commits: `noNonNullAssertion` in test files (replaced `!` assertions with nullish coalescing or explicit cast), `useTemplate` in combat-tracker-panel (string concatenation → template literal). No logic changes.

---

## Skipped Issues

None — all 8 findings were fixed.

---

_Fixed: 2026-05-16T14:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
