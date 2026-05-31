# @evf/g2-app

## 0.2.1

### Patch Changes

- cf4330d: Add an Even Hub-compatible app icon and a `description` to the plugin manifest, and document the
  dev-mode test flow (fixing the "trial version expired" trap).

  - `app.json` now carries `description` + `icon` (`icon.png`), bundled into the `.ehpk` (the Even
    Hub `pack` accepts both fields). The icon is a greyscale d20 (Even Hub requires monochrome
    foreground + background), regenerable via `assets/generate-icon.py`; the same icon is reused as
    the Docker image / Compose icon (OCI label).
  - New scripts: `pack:ehpk` (fresh build + pack) and `dev:qr` (`evenhub qr` for on-device dev mode
    with hot reload — the no-expiry path; `.ehpk` portal trials expire). Documented in README, the
    Even Hub runbook, and the wiki (`docs/wiki/Testing-and-Distribution.md`).

## 0.2.0

### Minor Changes

- 36aea7f: Retire the `long-press` R1 gesture (ADR-0012; GEST-01 / EXIT-01 / LIFE-01).

  Canonical Even Realities docs (`guides/input-events`, INV-2 re-verified 2026-05-31)
  confirm the complete hardware gesture set is **press / double-press / swipe-up /
  swipe-down only** — there is no long-press / duration-based input.

  - **GEST-01** — `long-press` removed from the wire enum (`R1GesturePayloadSchema`), the
    bridge gesture surface, the internal `R1Gesture` union, all 12 panels, the status-HUD
    hint chip (token `long=` → `qa=`, field `longPressLabel` → `quickActionLabel`), i18n
    keys, and tests. The Quick-Action menu now opens via **over-scroll** (swipe-up at the
    focused layer's top boundary) — new `Layer.isAtTopBoundary()` + the renamed
    `quick-action-overscroll-dispatcher`. Per-panel context actions remapped:
    `inventory`/`spellbook` Action Options → `tap`; `template-placement` cancel → `double-tap`.
  - **EXIT-01 / LIFE-03** — new `root-exit-dispatcher`: a `double-tap` on the bare map root
    calls `bridge.shutDownPageContainer(1)` (Mode 1 graceful exit dialog), satisfying the
    Even Hub app-submission requirement.
  - **LIFE-01** — INV-2 verification of the SDK lifecycle surface (`OsEventTypeList` 4/5/6 +
    `shutDownPageContainer`) documented in ADR-0012.

  `Specs.md` §3.2/§7.13a/§7.14.x + ASCII mockups (INV-1), `README.md`, and the showcase were
  updated atomically (INV-3).

### Patch Changes

- 722d63e: Emit the Vite HTML entry at the dist root (`dist/index.html`) via `root: 'src'` +
  `outDir: '../dist'`, and restore the Even Hub manifest `entrypoint` to the canonical
  `index.html`. This supersedes the earlier `src/index.html` band-aid (which leaked
  Vite's source path into the published manifest) and re-aligns `app.json` with the
  documented entrypoint in `docs/release/evenhub.md`, `.planning/REQUIREMENTS.md`
  (DIST-EHUB-01) and `Specs.md`. Verified: `evenhub pack` succeeds against
  `dist/index.html`.
- Updated dependencies [36aea7f]
  - @evf/shared-protocol@0.2.0
  - @evf/shared-render@0.1.1

## 0.1.1

### Patch Changes

- cfc02e5: Fix `app.json` `entrypoint` to `src/index.html` — Vite emits the entry at
  `dist/src/index.html`, so the Even Hub `pack` step now resolves it correctly
  (verified: `Successfully packed ... (99940 bytes)`).
- 83d0c0c: Add Even Hub manifest (`app.json`) for the g2-app plugin + CI packaging pipeline
  (`evenhub-pack.yml`) that builds and packs a submission-ready `.ehpk` on every merge
  to main. Closes DIST-EHUB-01 (portal submission remains manual — Even Hub has no
  non-interactive CI submit). See `docs/release/evenhub.md`.

## 0.1.0

### Minor Changes

- 40d3a52: Quick Task 260529-h5e — Debug Console (Waves 1-4: shared-protocol schemas + bridge backend + CRT dashboard + g2-app display-op mirror)

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

- 5e53f98: Phase 4a: G2 Engine + Raster + Status HUD — layer manager, raster pipeline (image-q + upng-js + xxhash-wasm + OffscreenCanvas Web Worker singleton), Status HUD z=1 with IT/EN/DE width budgets, glyph fallback, 9 INV-1 ASCII fixtures.

### Patch Changes

- 4d49f90: Fix 3 G2 SDK-conformance findings: portrait image-tile target (CRITICAL), audio-stream WS bearer auth for WKWebView (IMPORTANT), and R1 wire-kind provenance comment (INV-2).

  **B1 — CRITICAL (g2-app):** Portrait override in `map-base-layer.ts` was targeting `'map-capture'` (the TEXT capture container) with a non-existent `index` field hidden behind an `as unknown as` cast. Fixed to use a typed `ImageRawDataUpdate({ containerName: 'map-tile-${slot}', imageData: bytes })` targeting the correct IMAGE tile container, and check `ImageRawDataUpdateResult.isSuccess(result)` with a `console.warn` on failure. INV-4 cast removed.

  **B2 — IMPORTANT production bug (g2-app + bridge):** Browser/WKWebView WebSocket ignores the `headers` option — the bearer was silently dropped in production, causing close 1008 on every audio-stream WS upgrade. Fixed both sides: `audio-capture.ts` appends `?token=<encoded>` to the WS URL (with the Authorization header retained for the Node-ws test path); `audio-stream-route.ts` reads `?token=` as a header fallback, routing both through the same `tokenCache.validate` gate. Token is never logged. New test ASR-09 asserts query-param auth succeeds without an Authorization header.

  **B3 — INV-2 doc drift (g2-app):** `r1-event-source.ts` comment incorrectly attributed wire kinds to "flat string enums from the Even Hub SDK". Corrected to state they are the bridge's server-side-normalized strings mapped from `OsEventTypeList` + `EventSourceType.TOUCH_EVENT_FROM_RING`. Comment-only change.

- f44b008: Quick-task 260529-g0j: three source-verified write-path/dispatcher hardening fixes.

  - **FIX D** (`tool-registry.ts` `dispatchTool`): close the in-flight idempotency race. A module-scoped `Map<cacheKey, Promise<ToolResult>>` collapses truly-concurrent duplicate calls (same bearer + idempotencyKey, both cache-misses) to ONE `handler.handle`, ONE `moduleIdempotencyStore.set`, and ONE audit-log write; the second caller awaits the shared promise and receives the identical result. The entry is deleted in a `finally`, so only OVERLAPPING calls are deduped — a later sequential retry re-runs (preserving WR-01: failures are not cached and stay retryable). Cache-hit short-circuit and always-resolves-never-rejects semantics unchanged.
  - **FIX E** (`combat-movement-tracker.ts`): add a `deleteCombat` hook that clears `_state` + `_lastPosition` so stale `usedThisTurn` from an ended encounter cannot leak into a freshly created combat before its first turn-advance. Mirrors the existing defensive try/catch/never-return-false pattern; the unsubscribe closure now also `Hooks.off`s the deleteCombat hook.
  - **FIX F** (`reaction-prompt-dispatcher.ts` `handleClose`): add an early-return idempotency guard (`if (mountedPanel === null) return;`) so a late gesture after the 5s auto-timeout does not issue a redundant second destroy bundle. Mirrors the auto-timeout's existing `mountedPanel !== null` gate.

- c80d16f: Quick-task 260529-khy: codebase-review fixes — Tier 1 (R1/R2/R3) + Tier 3 hardening.

  **Wave 1 — R1 FULL WebSocket reconnect rewire (CRITICAL, g2-app):**
  After a WS reconnect, ALL functionality recovers (display + input + outbound
  action dispatch) AND repeated reconnects work.

  - BLOCKER 1 — repeated-reconnect close re-arm (`ws-reconnect.ts`): the controller
    tracks `currentWs` and re-arms its `'close'` listener on the new socket after each
    successful reconnect, so a second/third disconnect is detected (previously reconnect
    worked exactly once → permanent dark on the next drop). `dispose()` removes the
    listener from `currentWs`, not the original socket.
  - BLOCKER 2 — outbound + missed inbound (`ws-sender.ts`, `status-hud-layer.ts`,
    `boot-engine-core.ts`): new `WsSender` holder gives panels/probes a stable
    outbound-socket indirection (`send`/`swap`) structurally assignable to the narrow
    panel `{send}` interfaces, so a reconnect's `holder.swap(newWs)` redirects every
    outbound sender (perfProbe + SlotPicker + both ActionOptionsModal) with no panel
    churn. A new optional `onReconnected(newWs)` controller callback fires after resume
    (before chip-unmount on both resume paths); the boot handler swaps the holder +
    disposes-and-re-attaches all 7 inbound listeners against the live socket — including
    reaction-prompt + portrait (the two sources missed in the first rewire) — plus
    `StatusHudLayer.rebindWsEvents` for the 3 HUD channels.

  **Wave 2 — Tier 1 robustness:**

  - R2 (g2-app `raster-controller.ts`): a fatal worker error now settles ALL pending
    frames (and a debounced `pendingPayload`) with the existing `RasterResponse.error`
    shape, clears the map and logs — previously a worker crash left awaiting callers
    parked forever.
  - R3 (foundry-module `combat-action-tracker.ts`): subscribe `deleteCombat` (mirroring
    combat-movement-tracker FIX E) to clear `_state` + `_attackIdSeen` on combat removal;
    unsubscribe closure offs the new hook id. (Hooks.on, not a socketlib handler — CI
    Gate 8 socketlib count stays 17.)

  **Wave 3 — Tier 3 hardening:**

  - R-longpress (g2-app spellbook + inventory panels): long-press now resolves the item
    under the cursor ROW via a header-aware row→item map instead of indexing the flat
    array with the content-row scroll offset (which dispatched the wrong item after
    scrolling past a section header).
  - shared-protocol schema bounds: `d20` → `int().min(1).max(20).nullable()`; debug-events
    `id` `.min(1)`, `ts` (+ perf-sample) and layer-index `z` `.int()`.
  - foundry-mcp `spell-lookup.ts`: relocate mass-cure-wounds (level 5) into a dedicated L5
    grouping + fix block-count comments (SPELL_LOOKUP length stays 70, SKT-02 gate).
  - foundry-mcp `bridge-client.ts`: snapshot getters pass `null` default to `_restGet`
    (network failure → null, not undefined); `ws.onclose` early-returns on a pre-handshake
    close so it does not fall through to the 4001 / other-close branches.
  - foundry-module `character-reader.ts`: spell `range.value === 0` with a non-self/touch
    unit renders `--` (not `0m`).
  - validation-harness `inv-suite.ts`: INV-5 returns `skipped` (not green) when the COR-
    vitest run exits 0 with no matching tests ("no test files found").

  Backward compatible: `onReconnected` is optional; `WsSender`, `rebindWsEvents`,
  `worker.onerror`, the deleteCombat hook and the row→item maps are all additive; schema
  tightenings reject only previously-invalid values; the bridge-client null default makes
  the `… | null` return type honest.

- Updated dependencies [498c01f]
- Updated dependencies [0eaa5aa]
- Updated dependencies [7f5d0d1]
- Updated dependencies [a05f35e]
- Updated dependencies [6959c54]
- Updated dependencies [40d3a52]
- Updated dependencies [5e53f98]
- Updated dependencies [c80d16f]
  - @evf/shared-protocol@0.1.0
  - @evf/shared-render@0.1.0
