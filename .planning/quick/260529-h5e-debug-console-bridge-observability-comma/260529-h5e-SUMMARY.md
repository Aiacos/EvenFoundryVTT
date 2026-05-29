---
quick_id: 260529-h5e
title: Debug Console — bridge observability + command system (dev-only)
type: execute
branch: develop
status: partial (Waves 1+2 of 4 complete; Waves 3+4 remaining)
subsystem: bridge + shared-protocol
tags: [debug, observability, dev-tooling, security-gated, adr-0011]
requires: []
provides:
  - "@evf/shared-protocol: DebugEvent/DisplayOp/Inject/Dispatch/Gesture schemas"
  - "@evf/bridge: isDebugEnabled() gate, DebugEventBus, registerDebugRoutes (7 endpoints + WS stream)"
affects:
  - packages/bridge/src/server.ts (additive taps + gated route wiring)
  - packages/bridge/src/ws/delta-emitter.ts (additive onEmit? hook)
  - packages/bridge/src/ws/session-store.ts (listSessions())
tech-stack:
  added: []
  patterns: [zero-overhead-when-disabled (PerfProbe parity), timing-safe-secret, structural-token-redaction]
key-files:
  created:
    - packages/shared-protocol/src/debug/debug-events.ts
    - packages/shared-protocol/src/debug/debug-events.test.ts
    - packages/bridge/src/debug/is-debug-enabled.ts
    - packages/bridge/src/debug/is-debug-enabled.test.ts
    - packages/bridge/src/debug/debug-event-bus.ts
    - packages/bridge/src/debug/debug-event-bus.test.ts
    - packages/bridge/src/debug/inbound-tap.ts
    - packages/bridge/src/debug/inbound-tap.test.ts
    - packages/bridge/src/debug/debug-routes.ts
    - packages/bridge/src/debug/debug-routes.test.ts
    - .changeset/260529-h5e-debug-console.md
  modified:
    - packages/shared-protocol/src/index.ts
    - packages/bridge/src/server.ts
    - packages/bridge/src/ws/delta-emitter.ts
    - packages/bridge/src/ws/session-store.ts
decisions:
  - "Inbound tap extracted to makeInboundTap() so the disabled-mode no-op + closure-captured flag (W-2) is unit-testable."
  - "secretsEqual duplicated (not imported) into debug-routes to avoid coupling to the internal-delta route module (plan-sanctioned)."
  - "debugDispatchRef late-binding lets routes register before wsDispatchFn is declared while still reusing the SAME dispatch fn (ADR-0011)."
metrics:
  tasks_completed: 2
  tasks_total: 4
  tests_added: 59
  test_count: 2786
  baseline: 2727
---

# Quick Task 260529-h5e: Debug Console (Waves 1+2) Summary

Dev-only, three-layer-gated observability + command backend for the EVF bridge: shared-protocol
debug schemas (Wave 1) + the bridge DebugEventBus, gating helper, 7 secret-gated endpoints, WS
stream, and additive zero-overhead taps (Wave 2). Waves 3 (CRT dashboard) + 4 (g2-app mirror)
are a deliberate follow-up run to keep each commit focused and reviewable.

## What was built

### Wave 1 — `@evf/shared-protocol` (commit `acd2d51`)
- `src/debug/debug-events.ts`: `DebugEventSchema`, `DisplayOpPayloadSchema` (+ `R1_DEBUG_DISPLAYOP_TYPE`),
  `DebugInjectBodySchema`, `DebugDispatchBodySchema` (optional UUID `idempotencyKey`),
  `DebugGestureBodySchema` (reuses the canonical 5 R1 gesture kinds). All re-exported from the barrel.
- 20 round-trip / reject / barrel-export tests.

### Wave 2 — `@evf/bridge` (commit `40d3a52`)
- `is-debug-enabled.ts`: existence gate (`EVF_DEBUG==='true'`, plus `EVF_DEBUG_ALLOW_PROD==='true'`
  required in production). Off ⇒ routes never registered ⇒ genuine 404.
- `debug-event-bus.ts`: bounded ring buffer (default cap 2000) with push/query/subscribe/clear,
  `subscriberCount`, and STRUCTURAL token redaction.
- `debug-routes.ts`: `registerDebugRoutes(app, deps)` — `/debug/state`, `/debug/events`,
  `/debug/inject`, `/debug/dispatch-tool`, `/debug/simulate-gesture`, `/debug/displayop`, and
  WS `/debug/stream`. `requireSecret` mirrors timing-safe `secretsEqual`.
- `inbound-tap.ts`: `makeInboundTap(debugEnabled, bus)` — no-op when disabled (W-2).
- `delta-emitter.ts`: additive optional `onEmit?` hook (zero overhead when unset).
- `session-store.ts`: `listSessions()` for the redacted snapshot.
- `server.ts`: constructs the bus + captures `debugEnabled` once; sets `onEmit` + inbound tap +
  registers routes ONLY behind `isDebugEnabled()`; env-var docs added.
- 39 tests (gating, bus, routes, auth, redaction, inbound tap, WS teardown).

## Folded plan-checker resolutions (all confirmed)

- **W-1 (fresh uuid):** `/debug/dispatch-tool` generates a fresh `crypto.randomUUID()` per call when
  `idempotencyKey` is omitted; a supplied key must be a UUID (non-UUID → 400) and is forwarded
  verbatim. Test `W-1: two omitted-key dispatches produce two DISTINCT fresh uuids` asserts
  `key1 !== key2` and UUID format. ✓
- **W-2 (closure-captured flag, zero per-msg work):** `debugEnabled` captured once at buildServer
  time; `makeInboundTap(false, …)` returns a no-op. Test asserts `JSON.parse`/`bus.push` are NEVER
  called when disabled, and a later `process.env.EVF_DEBUG='true'` flip does NOT enable a built tap. ✓
- **W-3 (unsub on close AND error):** WS `/debug/stream` registers `unsubscribe` on both `close` and
  `error`. Test asserts `subscriberCount` returns to baseline after socket teardown. ✓
- **W-4 (structural redaction):** `DebugEventBus.redact` scrubs known session tokens from free-form
  summaries AND arbitrarily nested payloads, plus a token-shaped-field heuristic. Test nests a real
  token inside `payload.outer.inner.authHeader` and `payload.list[0]` and asserts the full token is
  absent from the stored event. ✓

## Security gating (verified)

- Three-layer gate: existence (`isDebugEnabled()`, 404 when off) + auth (`EVF_INTERNAL_SECRET`
  timing-safe, 401) + redaction (tokenHint ≤8 chars; raw token never in `/debug/state`).
- ADR-0011: `/debug/dispatch-tool` routes through the SAME injected `dispatchToolFn`; `/debug/inject`
  and `/debug/simulate-gesture` only call `emitDelta`. `grep -rnE 'activity\.use\('` over
  `packages/g2-app packages/bridge` (non-comment) → **zero hits** (CI Gate 8 clean). No socketlib
  handler added (foundry-module untouched; count stays 17).

## Exit gates

- `pnpm typecheck` → exit 0.
- `pnpm lint:ci` → exit 0 (only pre-existing info/warnings; new code clean).
- `pnpm test` → **2786 passed** (baseline 2727 + 59 new; all existing tests still green — backward-compat).
- `pnpm changeset:status` → exit 0 (`@evf/shared-protocol` + `@evf/bridge` minor).

## Deviations from Plan

- **[Rule 3 — blocking]** Added `SessionStore.listSessions()` (the snapshot needs to iterate
  sessions; the store previously exposed only `getSession`/`size`). Additive, JSDoc'd, no behavior change.
- **[Structure]** Extracted the inbound WS tap into `inbound-tap.ts` (`makeInboundTap`) rather than
  inlining it in `server.ts`, to make the W-2 zero-work-when-disabled contract unit-testable.

None of the above change plan scope; they are correctness/testability requirements.

## REMAINING — follow-up run (Waves 3 + 4)

- **Wave 3 — `feat(bridge): add single-file CRT debug console dashboard`**: `dashboard.html`
  (phosphor-green single-file UI) + GET `/debug/console` (alias `/debug`) secret-gated route that
  survives the bridge tsup bundle; `dashboard-route.test.ts` (200 HTML enabled+authed / 401 bad
  secret / 404 disabled).
- **Wave 4 — `feat(g2-app): add display-op debug mirror (zero-overhead when off)`**: `debug-mirror.ts`
  (PerfProbe-pattern), additive optional mirror DI in `layer-manager.ts`, `?debug=true` wiring in
  `boot-engine-core.ts` that POSTs DisplayOps to `/debug/displayop`; backward-compat assertions.
  This run adds the `@evf/g2-app` minor bump to the changeset. The live "what the glasses show"
  feed is hardware-deferred (established defer-hardware carry pattern).
