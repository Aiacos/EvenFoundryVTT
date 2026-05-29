---
'@evf/shared-protocol': minor
'@evf/bridge': minor
'@evf/g2-app': minor
---

Quick Task 260529-h5e — Debug Console (Waves 1-4: shared-protocol schemas + bridge backend + CRT dashboard + g2-app display-op mirror)

Dev-only, gated observability + command system for the bridge.

**@evf/shared-protocol (Wave 1):**

- Add lean debug-console schemas under `src/debug/debug-events.ts`: `DebugEventSchema`,
  `DisplayOpPayloadSchema` (+ `R1_DEBUG_DISPLAYOP_TYPE`), `DebugInjectBodySchema`,
  `DebugDispatchBodySchema` (optional UUID `idempotencyKey`), `DebugGestureBodySchema`
  (reuses the canonical 5 R1 gesture kinds). All re-exported from the package barrel.

**@evf/bridge (Wave 2):**

- `isDebugEnabled()` existence gate (prod-safe double opt-in via `EVF_DEBUG` +
  `EVF_DEBUG_ALLOW_PROD`); when off, `/debug/*` routes are never registered (genuine 404).
- `DebugEventBus` bounded ring buffer (push/query/subscribe/clear) with STRUCTURAL token
  redaction (scrubs known session tokens + token-shaped fields in summaries and nested payloads).
- `registerDebugRoutes()` — 7 secret-gated endpoints (`/debug/state|events|inject|dispatch-tool|
  simulate-gesture|displayop` + WS `/debug/stream`). `requireSecret` mirrors the timing-safe
  `secretsEqual` from `internal-delta.ts`. `/debug/dispatch-tool` routes through the SAME injected
  `dispatchToolFn` (ADR-0011 — no `activity.use` in the bridge; socketlib handler count unchanged)
  and generates a FRESH uuid per call when `idempotencyKey` is omitted.
- Additive `DeltaEmitter.onEmit?` hook (default undefined = zero overhead) + gated WS inbound tap
  (`makeInboundTap`, no work per message when disabled). `SessionStore.listSessions()` added for
  the redacted snapshot.

**@evf/bridge (Wave 3):**

- Single-file phosphor-green CRT debug console dashboard, inlined as a TS string constant
  (`dashboard.ts`) so it survives the tsup bundle with no runtime asset resolution. Served at
  `GET /debug/console` (+ `/debug` alias), secret-gated: 200 `text/html` when enabled+authed,
  401 on bad secret, 404 when debug disabled. Live WS `/debug/stream` feed with direction/type/
  session filters, `/debug/state` poll panel, and inject/dispatch-tool/simulate-gesture forms.

**@evf/g2-app (Wave 4):**

- `DebugMirror` (`src/engine/debug-mirror.ts`) copies the PerfProbe zero-overhead pattern:
  `record()` is a hard no-op when disabled (no allocations, sink never called); when enabled it
  stamps `ts` and POSTs a `DisplayOpPayload` to the bridge `/debug/displayop` sink.
- `LayerManager` gains an optional injected `debugMirror?` (default undefined ⇒ byte-identical to
  prior behavior — all existing tests pass unchanged). When present it records `mount`/`destroy`
  ops during a bundle and a `rebuild` (z-stack summary + container count) after `_flushPage()`.
- Boot wiring (`boot-engine-core.ts`) constructs the mirror enabled ONLY under `?debug=true`
  (parallel to the perf-probe `?probe=true` opt-in); default off. The mirror POSTs to a debug HTTP
  endpoint — it never calls `activity.use` and adds no socketlib handler (ADR-0011; Gate 8 = 17).
  The live "what the glasses show" feed is hardware-deferred; software tests mock the POST sink.
