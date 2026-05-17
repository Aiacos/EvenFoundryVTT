---
phase: 10-polish-field-test-mvp
plan: "01"
subsystem: engine/reconnect
tags: [ws-reconnect, seq-tracker, sync-lost-chip, inv-1, boot-engine]
dependency_graph:
  requires:
    - 09-04 (StatusHudRenderer renderContextChip — extended with syncLost opts)
    - 03-01 (bridge resume.ts + replay-buffer.ts — server already implemented)
  provides:
    - WsReconnectController (packages/g2-app/src/engine/ws-reconnect.ts)
    - SeqTracker (packages/g2-app/src/engine/seq-tracker.ts)
    - buildSyncLostChip (packages/g2-app/src/engine/sync-lost-chip.ts)
    - StatusHudLayer.setSyncLost (chip mount/unmount lifecycle)
    - INV-1 fixtures status-hud.sync-lost.{it,en}.txt
  affects:
    - packages/g2-app/src/internal/boot-engine-core.ts (seqTracker + wsReconnect wiring)
    - packages/g2-app/src/status-hud/status-hud-renderer.ts (renderContextChip opts extension)
    - packages/g2-app/src/status-hud/status-hud-layer.ts (setSyncLost + syncLostState)
    - packages/g2-app/src/status-hud/i18n-budgets.ts (2 new SYNC LOST keys)
tech_stack:
  added: []
  patterns:
    - TDD RED→GREEN per task (7+8+11 tests across 3 new modules)
    - Recursive setTimeout for chip countdown (avoids vitest fake-timer infinite loop)
    - Duck-typed SeqTracker.observe — no Zod on hot path
    - Transition-guard on setSyncLost (mirror of setMovementBudget SHR-MV-03 pattern)
key_files:
  created:
    - packages/g2-app/src/engine/seq-tracker.ts
    - packages/g2-app/src/engine/ws-reconnect.ts
    - packages/g2-app/src/engine/sync-lost-chip.ts
    - packages/g2-app/src/__tests__/seq-tracker.test.ts
    - packages/g2-app/src/__tests__/ws-reconnect.test.ts
    - packages/g2-app/src/__tests__/sync-lost-chip.test.ts
    - packages/shared-render/src/fixtures/status-hud.sync-lost.it.txt
    - packages/shared-render/src/fixtures/status-hud.sync-lost.en.txt
  modified:
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/status-hud/status-hud-renderer.ts
    - packages/g2-app/src/status-hud/status-hud-layer.ts
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
decisions:
  - "Recursive setTimeout for countdown ticks instead of setInterval (avoids vitest runAllTimersAsync infinite-loop on chained retries — pragmatic test-compatibility choice)"
  - "SeqTracker.observe is duck-typed {seq:number} — no Zod parse on hot path (WS parse already done upstream)"
  - "onFullRefreshRequired is a console.warn stub in boot-engine-core (REST GET /v1/actor wiring deferred to Plan 10-04 per SC-10-01)"
  - "INV-1 fixtures for sync-lost are the standard HUD grid (renderChip is the footer row, tested separately via SLC-05)"
metrics:
  duration: "17 minutes"
  completed: "2026-05-17"
  tasks: 4
  files_created: 8
  files_modified: 5
  tests_before: 1206
  tests_after: 1232
  tests_added: 26
---

# Phase 10 Plan 01: WS Reconnect + SeqTracker + SYNC LOST Chip Summary

**One-liner:** WS reconnect resilience layer with exponential backoff, `client_resume` dispatch to Phase 3 bridge, and `⚠ SYNC LOST` HUD chip; T-10-01 stale-seq mitigation via `resume_full_snapshot` forced full refresh.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | seq-tracker module + observer contract | 730145c | seq-tracker.ts, seq-tracker.test.ts |
| 2 | WsReconnectController + backoff + client_resume | acc4776 | ws-reconnect.ts, ws-reconnect.test.ts |
| 3 | sync-lost-chip + i18n + INV-1 fixtures + renderer | a7305f6 | sync-lost-chip.ts, i18n-budgets.ts, status-hud-renderer.ts, 2 fixtures |
| 4 | boot-engine wiring + chip lifecycle | f98f331 | boot-engine-core.ts, status-hud-layer.ts |

## New Module Exports + Consumer Wiring

### SeqTracker (`packages/g2-app/src/engine/seq-tracker.ts`)
- `observe(env: {seq: number})` — duck-typed monotonic hot-path observer
- `getLastConfirmedSeq(): number` — returns -1 until first envelope
- `reset()` — called by WsReconnectController on `resume_full_snapshot`
- Wired in boot-engine-core step 10: `const seqTracker = new SeqTracker()`
- `createWsEventBus(ws, seqTracker)` calls `seqTracker.observe()` on every parsed envelope

### WsReconnectController (`packages/g2-app/src/engine/ws-reconnect.ts`)
- Backoff schedule: `[1000, 2000, 4000, 8000, 15000, 30000]` ms, cap 30s (D-Area1)
- On `ws.close`: starts countdown → `onChipTick({ remainingMs, attempt })` every 1s
- On backoff expiry: `wsFactory(url)` + `performCapabilityHandshake(newWs, sessionId)`
- On handshake success: sends `client_resume { proto, type, session_id, last_seq }` (last_seq clamped ≥0)
- On `resume_replay`: calls `onChipUnmount()`
- On `resume_full_snapshot`: calls `seqTracker.reset()` + `onFullRefreshRequired()` (T-10-01)
- `dispose()`: cancels timers, removes 'close' listener (no leaks)
- Wired at boot step 11a with callbacks into `statusHud.setSyncLost()`

### buildSyncLostChip (`packages/g2-app/src/engine/sync-lost-chip.ts`)
- `buildSyncLostChip(retryInMs, locale)` → `'⚠ SYNC LOST (riconnetto in 4s)'` (IT)
- `retryInMs === 0` → inflight sentinel `'⚠ SYNC LOST (riconnessione…)'` (IT)
- ≤38 code-points for all retry values 0..30s in IT + EN (INV-1 budget)
- Reads from `hud_sync_lost_chip_template` / `hud_sync_lost_chip_inflight` i18n keys

### StatusHudRenderer.renderContextChip (extended)
- New optional 3rd arg `opts?: { syncLost?: { retryInMs: number } | null }`
- When `syncLost` non-null: returns `buildSyncLostChip(...)` — no `R1:` prefix
- When omitted/null: existing R1 chip path runs unchanged (back-compat preserved)

### StatusHudLayer (extended)
- `setSyncLost(state: { retryInMs: number } | null)`: mounts/unmounts chip with transition guard
- `_renderNow()` passes `syncLostState` to `renderContextChip` on every render

## T-10-01 Mitigation Verification (test WSR-07)

Test WSR-07 verifies: when bridge replies `resume_full_snapshot { reason: 'buffer_gap' }`:
1. `onFullRefreshRequired` fires (tracked via mock assertion)
2. It fires **before** any further envelope is forwarded (the listener self-removes before calling)
3. `seqTracker.reset()` is called first (confirmed by `getLastConfirmedSeq() === -1`)

The `_attachResumeListener` in `WsReconnectController` implements the ordering:
1. Zod-free parse of the resume response
2. `ws.removeEventListener('message', onMessage)` — self-remove (no further envelopes forwarded)
3. `seqTracker.reset()` — clear stale seq
4. `onFullRefreshRequired()` — notify caller
5. `onChipUnmount()` — unmount chip (WS is live, just needs refresh)

## Test Counts Before/After

| Metric | Before | After |
|--------|--------|-------|
| Test files | 72 | 75 |
| Tests | 1206 | 1232 |
| New tests | — | +26 (ST-01..07, WSR-01..07+03b, SLC-01..06b) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18n-budgets key count test needed update 216→218**
- **Found during:** Task 3
- **Issue:** i18n-budgets.test.ts had hardcoded count `216` that needed updating for the 2 new SYNC LOST keys
- **Fix:** Updated all 3 occurrences of the count assertion to `218`
- **Files modified:** packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts

**2. [Rule 1 - Bug] WSR-02 fake-timer infinite loop**
- **Found during:** Task 2 (WSR-02 test)
- **Issue:** `setInterval` for countdown ticks + `vi.runAllTimersAsync()` caused infinite-loop abort (>10000 timers)
- **Fix:** Rewrote countdown ticker as recursive `setTimeout` chain; WSR-02 test uses `advanceTimersByTime` + manual microtask flush instead of `runAllTimersAsync`
- **Files modified:** ws-reconnect.ts, ws-reconnect.test.ts

**3. [Rule 1 - Bug] TypeScript strict errors in test files**
- **Found during:** Task 3 typecheck (seq-tracker.test.ts ST-05 extra-property error; ws-reconnect.test.ts vi.fn() intersection type)
- **Fix:** Cast in seq-tracker.test.ts for duck-typing test; intersection cast for vi.fn() typed callbacks in ws-reconnect.test.ts
- **Files modified:** seq-tracker.test.ts, ws-reconnect.test.ts

**4. [Rule 1 - Bug] noUncheckedIndexedAccess in BACKOFF_DELAYS_MS[index]**
- **Found during:** Task 3 typecheck
- **Issue:** Accessing `const` array with computed index returns `T | undefined` in strict mode
- **Fix:** `const delayMs: number = BACKOFF_DELAYS_MS[cappedIndex] ?? 30000` with explicit fallback
- **Files modified:** ws-reconnect.ts

## Deferred to Plan 10-02/10-04

- `onFullRefreshRequired` is a `console.warn` stub in boot-engine-core — REST GET /v1/actor wiring deferred to Plan 10-04 per SC-10-01 (hardware-pending, no actor REST endpoint shipped yet)
- Reconnect duration logging for perf-probe integration deferred to Plan 10-02 (perf probe module)

## Stub Tracking

One stub exists that is intentional and documented:

```
packages/g2-app/src/internal/boot-engine-core.ts — onFullRefreshRequired callback
  Status: console.warn stub ("REST GET /v1/actor wiring deferred to Plan 10-04")
  Reason: REST /v1/actor endpoint not yet shipped; SC-10-01 is hardware-pending
  Future: Plan 10-04 will wire the actual REST call
```

This stub does NOT prevent the plan's primary goal (WS reconnect + SYNC LOST chip) from being achieved — the T-10-01 mitigation path (`seqTracker.reset()` + chip unmount) still fires correctly. The REST re-fetch is the final step after reset, and users see the chip unmount.

## Threat Flags

No new network endpoints or trust boundary surfaces introduced beyond what was planned.

## Self-Check: PASSED

**Files verified (13/13 FOUND):**
- packages/g2-app/src/engine/seq-tracker.ts
- packages/g2-app/src/engine/ws-reconnect.ts
- packages/g2-app/src/engine/sync-lost-chip.ts
- packages/g2-app/src/__tests__/seq-tracker.test.ts
- packages/g2-app/src/__tests__/ws-reconnect.test.ts
- packages/g2-app/src/__tests__/sync-lost-chip.test.ts
- packages/shared-render/src/fixtures/status-hud.sync-lost.it.txt
- packages/shared-render/src/fixtures/status-hud.sync-lost.en.txt
- packages/g2-app/src/internal/boot-engine-core.ts
- packages/g2-app/src/status-hud/status-hud-renderer.ts
- packages/g2-app/src/status-hud/status-hud-layer.ts
- packages/g2-app/src/status-hud/i18n-budgets.ts
- packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts

**Commits verified (4/4 FOUND):**
- 730145c feat(10-01): seq-tracker module + observer contract (ST-01..07)
- acc4776 feat(10-01): WsReconnectController + exponential backoff + client_resume dispatch (WSR-01..07)
- a7305f6 feat(10-01): sync-lost-chip + i18n keys + INV-1 fixtures + renderer integration (SLC-01..06)
- f98f331 feat(10-01): boot-engine wiring + chip mount/unmount lifecycle (Task 4)
