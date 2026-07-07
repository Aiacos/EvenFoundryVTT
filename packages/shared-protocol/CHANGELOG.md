# @evf/shared-protocol

## 0.3.0

### Minor Changes

- b385bf8: Combat snapshots now carry each combatant's **token UUID** (`tokenUuid`, e.g.
  `Scene.X.Token.Y`) read from `combatant.token?.uuid`. The combatant `id` is the
  Combatant document id, NOT a token UUID, so the glasses target picker — which forwards
  the selected target into MidiQOL's `midiOptions.targetUuids` — was passing a value
  MidiQOL could not resolve, silently producing no attack/cast on the chosen token (only
  the EVF Audit card appeared). `CombatantSchema` gains an optional+nullable `tokenUuid`
  field (back-compat with pre-tokenUuid module builds) and the combat reader emits it.
- 96d2022: Add frame_png wire format (greyscale lossless PNG ~1-5KB vs 427KB RGBA) for the map stream: new FramePngSchema in shared-protocol, DM-configurable captureIntervalMs + leading+trailing hook throttle + identical-frame hash-skip + PNG encode in foundry-module v0.1.15, frame_png decode in g2-app (frame_pixels back-compat retained).
- 2d5a35b: Optional `actorId` added to `HandshakeClientSchema` (task flv).

  The field is additive (optional string, no default, no migration required). It lets the
  g2-app pass the player's chosen character ID at WS connect time so the bridge can target
  the initial `character.delta` push to that actor's snapshot. Sessions that omit `actorId`
  fall back to `roster.characters[0]` (existing behaviour preserved).

- a6c8fc8: Latency-audit follow-up: residual fps fixes + map brightness + bidirectional display-settings sync.

  **Performance (residual latency removed):**

  - foundry-module: the capture loop no longer awaits the native encode — `runEncodeJob` is fire-and-forget behind the single-flight latest-wins queue, so the loop re-arms after acquire+process only (the encode genuinely overlaps the next capture). Raises the producer ceiling well past 30 fps.
  - foundry-module: lossy WebP wire format via `OffscreenCanvas.convertToBlob` (new `mapWebpQuality` world setting, default 75) — ~4–7× smaller than PNG, cutting the per-hop bandwidth from ~22 to ~4 Mbit/s at 30 fps. Transparent PNG fallback on hosts without WebP encoding.
  - foundry-module: the `/internal/delta` frame POST is now single-flight latest-wins with a 5 s `AbortSignal.timeout`, so a slow WAN can no longer accumulate unbounded in-flight requests.
  - bridge: frame deltas (`frame_png`/`frame_pixels`/`frame_stats`) are excluded from the replay buffer (no ~160 MB/session growth, no stale-frame replay burst on reconnect) and reuse the current seq (gap detection stays correct). Per-session `bufferedAmount` backpressure drops frames for a saturated client instead of queuing unbounded.
  - g2-app: the HudDeltaDriver throttle (33 ms ≈ 30 fps cap) is now configurable per boot via `BootEngineOpts.hudMinIntervalMs` / `?hudms=` for lab tuning.

  **Map brightness:** new `mapBrightness` client setting (−100..+100 luma gain) applied module-side before the 16-level quantize, with on-glasses `[+]`/`[-]` Quick Action menu rows.

  **Bidirectional display-settings sync:** the five map settings (dither, brightness, WebP quality, capture fps, contrast-normalize) stay in sync between Foundry and the glasses and are controllable from both. Downstream over a new `settings.display` delta (cached by the bridge, pushed on connect); upstream over a `client_setting` WS message that the bridge piggybacks on the module's next frame-POST response (no new connection / no polling — the module is push-only). New `@evf/shared-protocol` payload `settings-display.ts`.

- e17065e: Layout B — full-screen 576×288 map: 4 image tiles of 288×144 (SDK verbatim max, INV-2 drift corrected from 200×100) cover the entire G2 display; the extractor emits 576×288 frames; status/fps move into a translucent raster corner card (top-right) drawn over the map; the native hud-status container is removed (the host renders image containers over text).
- a823240: Phase-8 write channel + skill-check tool, end-to-end.

  The bridge could receive `tool.invoke` envelopes but had no way to execute write
  tools in Foundry (it cannot use socketlib; the only bridge↔Foundry channel was the
  one-way module → `/internal/delta` POST). This adds a poll-based REVERSE channel that
  mirrors the player-view stream-request pattern:

  - **bridge**: a new in-memory `ToolInvocationQueue` (`enqueue`/`drainPending`/`resolveResult`
    with a 10s `foundry_timeout`) and two internal-secret-guarded, rate-limit-exempt
    routes — `GET /internal/tool-requests` (drain pending) and `POST /internal/tool-result`
    (resolve the awaiting promise). The production WS dispatch now enqueues on this queue
    (the test override is preserved).
  - **foundry-module**: a GM-gated `tool-invocation-poller` (≈1s cadence, fault-tolerant)
    polls the bridge, dispatches each write, and POSTs the result back. The ADR-0014
    per-actor write authorization was extracted into a single shared
    `dispatchToolAuthorized` used by BOTH the socketlib adapter and the new poller, so
    both channels enforce identical authorization. No new socketlib handler is added
    (the `socket.register` count stays 17).
  - **skill-check tool**: new `skill-check` write tool — `actor.rollSkill({ skill,
advantage, disadvantage })` (dnd5e 5.x config-object API). Added to the shared
    `TOOL_ID_SCHEMA`, the module `ToolId`/`TOOL_HANDLER_IDS`, and a new handler.
  - **g2-app**: a new interactive canvas Skills panel (Quick Action `[K]`) that, on tap,
    dispatches a `skill-check` `tool.invoke` directly (no ActionOptions modal), plus the
    `[K]` menu item, icon, and `quick_item_skills` i18n key (IT/EN/DE).

### Patch Changes

- 8c4c5e3: Feature 001 — Foundry-to-G2 HUD UX slice:

  - **Direct-link connection** — one canonical connection profile to the bridge; removed the
    implicit `localhost:8910` default (the on-phone "unreachable bridge" bug). `bridgeUrl` is
    persisted; the bearer token stays in memory and is re-acquired by the wizard (T-02-01 upheld).
  - **Unified view selection** — the map-view mode dropdown is removed; the roster selector gains a
    synthetic "Party" entry (→ streaming overview), a PC → actor (owner-elected). Pure
    `toPlayerViewRequest` mapping; `client_player_view` wire shape unchanged (shared-protocol doc only).
  - **D&D-styled sheet + shared icon dictionary** — new `icon-dictionary` as the single source for
    glyph + canvas paths (consolidates item-type / proficiency / spell-slot / vitals glyphs,
    byte-identical → INV-1 fixtures unchanged); double-ruled canvas frame + corner brackets; Main-tab
    vitals drawn as icons.
  - **Composited FPS badge** — FPS split into its own small corner widget via `EVF_FPS_CORNER`
    (build-time `VITE_EVF_FPS_CORNER`, default bottom-right); yields below the status card on overlap.

- edae764: Fix the scene-frame pipeline dimension contradiction that made every `frame_pixels` payload un-processable: `FramePixelsSchema` capped frames at 288×144 (pre-ADR-0013 SDK-polyfill bound) while `raster-worker.ts` rejects anything that is not the canonical 400×200 raster region. Schema bounds now admit 20–400 × 20–200; `canvas-extractor` always emits exactly 400×200 (center-crop + opaque-black letterbox, pure byte copy); `scene-input` center-pads undersized frames to the canonical region as consumer-side defence. Live-sim verified: a real 400×200 scene frame now dithers and renders on the glasses end-to-end.
- 0038f94: Wire push-based bridge↔Foundry bearer-registry + character-list path enabling real pairing.

  Adds two new push envelopes (`r1.bearers.available`, `r1.characters.available`) that the Foundry
  module emits on `ready` and on bearer/actor lifecycle events. The bridge caches both and uses
  them to validate bearer tokens (`GET /v1/health`) and serve the player-character roster
  (`GET /v1/characters`) without a socketlib roundtrip. `buildServer({})` now works with NO
  options — real token validation and character listing are wired internally.

  Security: bearer tokens are pushed over the EVF_INTERNAL_SECRET-gated /internal/delta channel
  (homelab trust model). Tokens are Zod-validated at the handler boundary before cache write and
  never logged (T-RFP-01 / T-RFP-02). A never-pushed cache returns `foundry_unreachable` (503)
  distinguishable from `unknown_token` (401) — T-RFP-03.

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
