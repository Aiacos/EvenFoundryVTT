---
quick_id: 260529-h5e
title: Debug Console — bridge observability + command system (dev-only)
type: execute
branch: develop
status: complete (all 4 waves done)
subsystem: bridge + shared-protocol + g2-app
tags: [debug, observability, dev-tooling, security-gated, adr-0011, hardware-deferred]
requires: []
provides:
  - "@evf/shared-protocol: DebugEvent/DisplayOp/Inject/Dispatch/Gesture schemas"
  - "@evf/bridge: isDebugEnabled() gate, DebugEventBus, registerDebugRoutes (7 endpoints + WS stream + GET /debug/console dashboard)"
  - "@evf/g2-app: DebugMirror (zero-overhead display-op mirror) + LayerManager optional mirror DI"
affects:
  - packages/bridge/src/server.ts (additive taps + gated route wiring)
  - packages/bridge/src/ws/delta-emitter.ts (additive onEmit? hook)
  - packages/bridge/src/ws/session-store.ts (listSessions())
  - packages/g2-app/src/engine/layer-manager.ts (additive optional debugMirror DI)
  - packages/g2-app/src/internal/boot-engine-core.ts (additive ?debug=true mirror construction)
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
    - packages/bridge/src/debug/dashboard.ts
    - packages/bridge/src/debug/dashboard-route.test.ts
    - packages/g2-app/src/engine/debug-mirror.ts
    - packages/g2-app/src/engine/debug-mirror.test.ts
    - .changeset/260529-h5e-debug-console.md
  modified:
    - packages/shared-protocol/src/index.ts
    - packages/bridge/src/server.ts
    - packages/bridge/src/ws/delta-emitter.ts
    - packages/bridge/src/ws/session-store.ts
    - packages/bridge/src/debug/debug-routes.ts (Wave 3: GET /debug/console + /debug alias)
    - packages/g2-app/src/engine/layer-manager.ts
    - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
decisions:
  - "Inbound tap extracted to makeInboundTap() so the disabled-mode no-op + closure-captured flag (W-2) is unit-testable."
  - "secretsEqual duplicated (not imported) into debug-routes to avoid coupling to the internal-delta route module (plan-sanctioned)."
  - "debugDispatchRef late-binding lets routes register before wsDispatchFn is declared while still reusing the SAME dispatch fn (ADR-0011)."
  - "Dashboard HTML inlined as a TS string constant (dashboard.ts), NOT a separate .html asset — survives the bridge tsup bundle with zero runtime asset resolution; verified the 'EVF Debug Console' marker is present in dist/index.js."
  - "DebugMirror is fully injected into LayerManager (default undefined). Mirror-null path is byte-identical to prior behavior; all pre-existing LayerManager tests pass unchanged."
metrics:
  tasks_completed: 4
  tasks_total: 4
  tests_added: 71
  test_count: 2798
  baseline: 2727
---

# Quick Task 260529-h5e: Debug Console Summary (all 4 waves complete)

Dev-only, three-layer-gated observability + command system for the EVF bridge spanning the full
chain `G2 glasses ← g2-app ←WSS→ bridge ←socketlib→ Foundry`: shared-protocol debug schemas
(Wave 1), the bridge DebugEventBus + gating + 7 secret-gated endpoints + WS stream + additive
zero-overhead taps (Wave 2), a single-file phosphor-green CRT dashboard at GET /debug/console
(Wave 3), and a zero-overhead g2-app DisplayOp mirror that reflects "what the glasses show" back
into the debug feed (Wave 4).

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

### Wave 3 — `@evf/bridge` CRT dashboard (commit `db732f0`)
- `dashboard.ts`: single self-contained HTML+CSS+JS document inlined as the `DASHBOARD_HTML`
  string constant (no build step, mirrors `docs/showcase/index.html` ethos). Phosphor-green CRT
  aesthetic (greyscale-green palette, monospace, scanline backdrop). Features: one-time in-memory
  secret field (sent as `Authorization: Bearer` on fetch + `?secret=` on the WS), live WS
  `/debug/stream` feed with direction/type/session client-side filters, `/debug/state` poll panel
  (manual + auto interval), and inject (envelope-type dropdown + JSON payload + optional target) /
  dispatch-tool / simulate-gesture (5 R1 kinds) command forms.
- `debug-routes.ts`: GET `/debug/console` + `/debug` alias, secret-gated, returns
  `text/html; charset=utf-8`.
- 5 tests: 200 HTML + marker when authed, alias works, 401 bad/no secret, 404 when disabled.
- **tsup-bundle safety:** inlining as a TS string constant (not a `.html` asset) means tsup inlines
  the markup into `dist/index.js` verbatim — resolves identically in dev (`tsx`) and bundled (`dist`)
  with no `import.meta.url` / asset-copy fragility. Verified post-build: `grep -c "EVF Debug Console"
  packages/bridge/dist/index.js` → 2 (present in bundle). `pnpm --filter @evf/bridge build` succeeds.

### Wave 4 — `@evf/g2-app` display-op mirror (commit `242e103`)
- `debug-mirror.ts`: `DebugMirror` class copying the PerfProbe zero-overhead pattern — `record()`
  short-circuits on the first line (`if (!this.enabled) return;`) with no allocations and the
  injected `send` sink is never called when disabled. Enabled, it stamps `ts` and forwards a full
  `DisplayOpPayload` once per call.
- `layer-manager.ts`: optional injected `debugMirror?` (constructor 2nd param, default undefined =
  no-op). During a `bundle()` it records `mount`/`destroy` ops as layers are applied, and a
  `rebuild` op (z-stack summary + `containerCount`) after the single `_flushPage()`. The mirror is
  fully injected — `layer-manager.ts` never imports bridge HTTP.
- `boot-engine-core.ts`: constructs `DebugMirror({ enabled: true, send: postToBridgeDebug })` ONLY
  under `?debug=true` (parallel to the perf-probe `?probe=true` opt-in); default off ⇒ undefined.
  `send` is a fire-and-forget POST to `/debug/displayop` (HTTP base derived from `bridgeUrl`
  ws→http) with `?debugSecret=`-supplied bearer; POST failures are swallowed (never reach the
  render path).
- 7 tests: 4 in `debug-mirror.test.ts` (disabled no-op / enabled record-once / mount+destroy tags /
  default Date.now) + 3 appended to `layer-manager.test.ts` (mirror-undefined backward-compat flush;
  injected-mirror records rebuild with containerCount; injected-mirror records mount+destroy).

## Backward-compatibility confirmation (Wave 4)

`LayerManager` mirror-null path is **byte-identical** to prior behavior: the new constructor param
defaults `undefined`, the `bundle()` mirror calls are all `this.debugMirror?.record(...)` (a no-op
when undefined). All **86 g2-app test files / 1352 tests pass unchanged**, including the full
existing `layer-manager.test.ts` capture-invariant / capability-gate / atomic-bundle suite. No
existing test was modified to accommodate the mirror (only additive test blocks appended).

## Hardware-defer note (Wave 4)

The DisplayOp mirror's REAL value — a live "what the glasses show" feed — only materializes with
the physical G2 glasses. Software verification mocks the `send` sink (DebugMirror tests) and the
POST endpoint (bridge `/debug/displayop` tests) and asserts the record/no-op contracts. The live
end-to-end glasses feed is **hardware-deferred** (established defer-hardware carry pattern,
Phases 4a/4b/5/6/7/8/9/10/12/13).

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

## Exit gates (all 4 waves — final)

- `pnpm typecheck` → exit 0.
- `pnpm lint:ci` → exit 0 (only pre-existing info/warnings; new code clean; none of the new files flagged).
- `pnpm test` → **2798 passed** / 194 test files (baseline 2786 after Waves 1+2 + 12 new in Waves 3+4;
  Wave 3 = 5 dashboard-route tests, Wave 4 = 4 DebugMirror + 3 LayerManager-DI tests). All existing
  tests still green — backward-compat preserved.
- `pnpm changeset:status` → exit 0 (`@evf/shared-protocol` + `@evf/bridge` + `@evf/g2-app` minor).
- **ADR-0011 / CI Gate 8:** the exact CI guard grep
  `grep -rnE 'activity\.use\(' packages/g2-app packages/bridge --include="*.ts" | grep -vE ':[0-9]+:\s*(\*|//|/\*)'`
  → **zero real hits** (the two g2-app matches are JSDoc doc-comments the guard ignores). No
  socketlib handler added — `foundry-module` was not touched this run, so the handler count is
  unchanged (17). The mirror POSTs to the bridge `/debug/displayop` HTTP sink; it does NOT call
  `activity.use` or register a socketlib handler.

## Deviations from Plan

- **[Rule 3 — blocking]** Added `SessionStore.listSessions()` (the snapshot needs to iterate
  sessions; the store previously exposed only `getSession`/`size`). Additive, JSDoc'd, no behavior change. (Wave 2)
- **[Structure]** Extracted the inbound WS tap into `inbound-tap.ts` (`makeInboundTap`) rather than
  inlining it in `server.ts`, to make the W-2 zero-work-when-disabled contract unit-testable. (Wave 2)
- **[Wave 3 — design choice]** The plan offered "read the file at startup via `node:fs`" OR "inline
  as a string constant" for the dashboard, and asked the executor to pick whichever survives the
  tsup bundle. Chose the **inlined string constant** (`dashboard.ts` exporting `DASHBOARD_HTML`) —
  no runtime asset resolution, byte-for-byte present in `dist/index.js` (verified). This is the
  prompt-preferred, lower-fragility option.

None of the above change plan scope; they are correctness/testability/robustness requirements.

## Self-Check: PASSED

- Created files exist: `dashboard.ts`, `dashboard-route.test.ts`, `debug-mirror.ts`, `debug-mirror.test.ts` — all FOUND.
- Commits exist: Wave 3 `db732f0`, Wave 4 `242e103` — both FOUND in git log.
- Gates: typecheck exit 0, lint:ci exit 0, `pnpm test` 2798 passed / 194 files, changeset:status exit 0.
