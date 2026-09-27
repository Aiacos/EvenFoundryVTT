# @evf/shared-protocol

## 0.4.2

### Patch Changes

- 35d7fcf: Pairing on the phone: «Scansiona QR» decodes screen photos at 1024 → 640 → 400 px (plus the native `BarcodeDetector` where available) and says when the camera is unavailable; the code field accepts the whole pairing link, without a length cap or forced capitals; link keys are read case-insensitively.

## 0.4.1

### Patch Changes

- 4d4d7c5: Pairing QR now carries only the 16-character code (`…/app/#c=<CODE>`, about 63 characters instead of 201): the QR is small enough for the Even Realities App to scan from a screen, and the link is short enough to type. The window also shows the plain app address for developer mode (open it, then type the code). Pairings made with v0.3.0 keep working.

## 0.4.0

### Minor Changes

- 65ada3a: Relay pairing (ADR-0019): connect the glasses alone, with one QR, without a GM and without any Foundry login on the phone.

  - «Collega occhiali G2» / «Connect G2 glasses» (right-click your name in the Players list, Alt+G, or Settings): opening the window shows the QR and a 16-character code at once; the glasses reconnect by themselves whenever that browser has Foundry open. «Scollega» to forget them.
  - Your Foundry tab streams the sheet, the map (scene pictures now work on The Forge CDN too) and your actions through an end-to-end encrypted relay (`packages/relay`, Cloudflare Worker); Foundry no longer needs public HTTPS.
  - The glasses app ships on Even Hub (FoundryVTT G2 HUD: «Scansiona QR» with the phone camera, or the code) and on GitHub Pages `/app/`; it is no longer inside the module zip (Foundry ≥ 14.361 serves module HTML as text).
  - Migration: pair the glasses again once. The "(G2)" users of the previous version are no longer used — the GM may delete them.

## 0.3.0

### Minor Changes

- ff883b1: ADR-0016 direct Foundry → G2 streaming. The g2-app is now built into the module
  (`packages/foundry-module/g2/`) and served by Foundry at
  `/modules/evenfoundryvtt/g2/index.html`; the Even Realities App loads it by scanning the
  pairing QR shown in Foundry. The phone logs in as a dedicated "(G2)" Foundry user and talks
  to the GM-client projector over `module.evenfoundryvtt` with AES-GCM sealed envelopes;
  all writes still go through the GM-side `dispatchTool` pipeline (ADR-0011).

  **Removed:** the Node bridge (`@evf/bridge`), the V2 MCP server (`@evf/foundry-mcp`) and the
  Docker Compose deployment (`deploy/`). There is no longer a GHCR bridge image or a separate
  `g2-app-dist.zip` release asset — the module zip is the only artefact. Bridge-only protocol
  (handshake/resume/debug events), the g2-app bridge wizard and audio capture are gone; voice/MCP
  need a new ADR before returning.

- 1e3e055: ADR-0017 player-owned glasses. Each player pairs their own G2 from Foundry
  (self-service `PairG2App` or the Players-list shortcut): the pairing QR carries an
  ECDH-custodied, per-device credential, and writes run on the player's own client first,
  falling back to the active GM (per-device responder election). The projector re-checks
  actor ownership live on every invoke, so revoking ownership after pairing takes effect
  immediately. There is no long-lived shared bearer token any more.

  **Migration:** remove the bridge container and re-pair every pair of glasses from the
  Foundry Players list — old bridge pairings are not compatible.

- 1e3e055: Direct-channel hardening and ports:

  - The projector re-checks on every hello / get / invoke that the paired player still owns
    the actor (revoking ownership in Foundry takes effect at once; denials are audited).
  - Pairing lists only characters the chosen player owns (Players-list shortcut and GM
    pairing window) and refuses a stale selection.
  - `welcome.moduleVersion` reports the running `evenfoundryvtt` version to the glasses.
  - `details.classLabel` carries the multiclass label (e.g. «Fighter / Wizard»).
  - Removed payload schemas nothing used any more (`r1`, `frame`, `perf-probe`, template /
    scene / concentration leftovers, combatant `tokenUuid`) and stale bridge-era wording.

- a823240: New `skill-check` write tool: `actor.rollSkill({ skill, advantage, disadvantage },
{ configure: false })` (dnd5e 5.x config-object API), registered in the module
  `ToolId`/`TOOL_IDS` and the shared `TOOL_ID_SCHEMA`, dispatched through the same
  single-workflow-origin `dispatchTool` path as every other write tool (ADR-0011).
  The input takes `kind: 'skill' | 'check' | 'save'` (default `skill`) with `skill` /
  `ability`, the same vocabulary as the GM roll-request card, so the glasses can answer a
  request with `rollSkill`, `rollAbilityCheck` or `rollSavingThrow`. `TOOL_ID_SCHEMA` also
  gains the missing `end-turn`.

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

## 0.1.0

### Minor Changes

- 0eaa5aa: Phase 2 Plan 04: Fastify bridge server with WS handshake, capability negotiation, 60s replay buffer, bearer token cache, and HTTP routes (/v1/health, /v1/i18n/:lang, /v1/tools stub). First real Zod schemas in shared-protocol (EnvelopeSchema, HandshakeClientSchema, HandshakeServerSchema).
- 7f5d0d1: Phase 2 Plan 05: Reader API + Foundry hooks + delta emitter

  - **@evf/shared-protocol**: Add Zod `strictObject` payload schemas for `CharacterSnapshot`, `CombatSnapshot`, `SceneViewport`, `EventLogEntry`, and `EventLogResponse`; re-export all from package index
  - **@evf/foundry-module**: Add `RingBuffer<T>` (200-entry, oldest-evict), character/combat/scene/event-log readers, `registerHookSubscribers()` for 5 Foundry hooks (updateActor, updateCombat, canvasReady, controlToken, createChatMessage, targetToken), `bridgeDeltaEmitter` fire-and-forget POST to bridge `/internal/delta`, extended socketlib GM handlers for all 5 snapshot reads
  - **@evf/bridge**: Add REST routes `GET /v1/character/:actorId`, `GET /v1/combat/current`, `GET /v1/scene/viewport`, `GET /v1/events`, `GET /v1/characters`; `POST /internal/delta` (EVF_INTERNAL_SECRET auth); `DeltaEmitter` WS fanout with capability routing and replay buffer integration

- a05f35e: Phase 03 Plan 01 — Bridge handshake wiring + WS resume protocol

  **Critical fix:** Phase 02 shipped a latent bug where `handleHandshake` returned
  `void` and the production code in `server.ts` never wired
  `deltaEmitter.registerSession`. Every delta emitted via `/internal/delta` was
  silently dropped in production because the emitter's `connections` map was
  always empty. Tests passed because they injected directly into the map.

  This change:

  - Promotes `handleHandshake` return type to `Promise<string | null>` so callers
    can wire the registration step.
  - In `server.ts`, every accepted handshake now calls
    `deltaEmitter.registerSession(sessionId, socket)` and registers a
    `socket.on('close', ...)` handler that unregisters from the emitter, deletes
    the session, and clears the replay buffer.
  - Adds `socket.on('message', ...)` that routes to the new resume handler
    (`@evf/bridge/ws/resume.ts`).

  **WS resume protocol (ADR-0002):**

  - `@evf/shared-protocol` exports `ClientResumeSchema`, `ResumeReplaySchema`,
    `ResumeFullSnapshotSchema`. ResumeReplay uses a leaner `count: N` header
    followed by N envelope frames (separate sends) instead of bundling all
    deltas inline — smaller individual frames, simpler client decoding.
  - `@evf/bridge/ws/replay-buffer.ts` adds `hasGap(sessionId, fromSeq)`. Returns
    true when buffered entries with seq > fromSeq are non-contiguous. Used to
    short-circuit replay attempts that would silently hide a gap.
  - `@evf/bridge/ws/resume.ts` implements the decision matrix: gap → full_snapshot
    with `reason: 'buffer_gap'`; empty → full_snapshot with `reason:
'buffer_expired'`; contiguous → header + envelope frames.

  No public API of `@evf/bridge` is removed. All existing endpoints continue to
  work identically. The signature change to `handleHandshake` is internal (only
  `server.ts` calls it).

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

### Patch Changes

- 498c01f: Phase 2 Wave 0: module skeleton, module.json, settings panel, locale catalogs (EN + IT).

  Bootstraps `packages/foundry-module` from placeholder to a buildable Foundry module:

  - `module.json` with relationships.requires (socketlib, midi-qol, dnd5e), socket:true
  - tsup ESM build pipeline → `dist/module.js`
  - `src/module.ts`: MODULE_ID export, Hooks.once("init") bootstrap
  - `src/settings.ts`: registerSettings(), PairModalStub, detectedLocale (I18N-01)
  - `lang/en.json` + `lang/it.json`: 24 UI-A i18n keys (evf.pair._ + evf.settings._)
  - 10 unit tests, coverage ≥80%

- 6959c54: Implement ADR-0003 Tool Registry: 7 Zod-typed tools in @evf/shared-protocol (cast_spell, weapon_attack, use_item, skill_check, move_token, place_template, set_targets), GET /v1/tools returns full entries with Zod 4 native .toJSONSchema(), POST /v1/tools/:name dispatches via stub returning phase-07-pending (write path lands in Phase 07 per D-15). Foundry-module socketlib-handlers gains 7 stub registrations for Phase 07 wiring.
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
