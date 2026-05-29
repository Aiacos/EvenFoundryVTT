---
'@evf/shared-protocol': minor
'@evf/bridge': minor
---

Quick Task 260529-h5e — Debug Console (Waves 1+2: shared-protocol schemas + bridge backend)

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

Waves 3 (CRT dashboard) + 4 (g2-app display-op mirror) land in a follow-up run; `@evf/g2-app`
gets its `minor` bump there.
