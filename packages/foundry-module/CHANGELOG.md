# @evf/foundry-module

## 0.1.41

### Patch Changes

- Write channel resilience: the tool-invocation poller now performs a GM-fallback
  unfiltered drain in addition to the owner-scoped poll. When the bridge cannot route
  a queued write to a bound user — `boundUserId === null`, e.g. its bearer-registry
  cache went cold after a restart (the registry is only pushed on Foundry `ready`) —
  the request previously sat unrouted until it timed out, so skill checks / attacks /
  spells silently did nothing. A GM client now also drains the unfiltered slice and
  executes those orphaned (and genuinely global) requests. This is ADR-0014-safe: the
  per-actor write authz (`dispatchToolAuthorized` → `validateBearer` against Foundry's
  authoritative local registry) still gates execution by the request's own bearer, so a
  GM executing here cannot act as an actor the bearer does not own.

## 0.1.40

### Minor Changes

- Player-owned write execution (ADR-0011 Amendment 2): the tool-invocation poller
  is no longer GM-gated. Each client polls for ITS OWN user's invocations
  (`GET /internal/tool-requests?userId=<game.user.id>`) and executes them, so a
  PLAYER rolls their own actor's skill check / attack / spell **without a GM
  online**. The bridge routes each queued write to the bearer's bound user; the
  per-actor write authz (ADR-0014) is unchanged (the acting actor must be owned by
  the bearer's user, and the executing client IS that user).

## 0.1.39

### Minor Changes

- Phase-8 write channel: write tools now actually EXECUTE in Foundry. Previously
  the bridge could not reach Foundry for writes (its dispatch was a stub), so
  `tool.invoke` envelopes (cast-spell / use-item / skill-check) were dropped. A
  GM-gated poller now drains the bridge's tool-invocation queue
  (`GET /internal/tool-requests`), runs each invocation through the authoritative
  write path, and POSTs the result back (`POST /internal/tool-result`). Per-actor
  write authorization (ADR-0014) is enforced by a single shared
  `dispatchToolAuthorized` gate used by BOTH the socketlib adapter and the new
  poller — the acting `actor_id` must be owned by the bearer's bound user. No new
  socketlib handler (count stays 17). Requires a GM client online (ADR-0011).

### Patch Changes

- New `skill-check` write tool: rolls a skill check via `actor.rollSkill(...)` (as
  if clicking the skill button on the Foundry sheet). Wired to the g2-app
  interactive Skill panel + Quick Action `[K]` entry.
- Stop reading the deprecated dnd5e `SpellData#preparation.{mode,prepared}` getters
  in `extractSpellbook` (read `system.method`/`system.prepared` on 5.1+; fall back
  to `preparation` only for < 5.1). Removes the per-spell deprecation-warning flood.

## 0.1.38

### Patch Changes

- Fix: character snapshots were silently dropped by the bridge for any actor with
  NO temporary HP. dnd5e leaves `actor.system.attributes.hp.temp` as `null` (not 0)
  when there is no temp HP; character-reader passed it straight through as
  `tempHp: null`, which fails the bridge's `CharacterSnapshotSchema`
  (`tempHp: number().nonnegative()`). The bridge still answers `200` to the
  `/internal/delta` POST but never caches the snapshot, so `GET /v1/character/:id`
  returns `404` and the glasses sheet/HUD stay empty. Now coerced to `0`. The
  "active" character (whose temp HP is often set) worked, masking the bug.

## 0.1.37

### Patch Changes

- PairModal UX: the "active" pairing state now shows an explicit **"Generate new
  token"** button (mints a fresh bearer bound to the current user). Previously the
  active state offered only "Revoke", so there was no obvious way to re-pair or
  rotate without first revoking — confusing. Removed the now-dead
  `evf.pair.user.select_label` i18n string left over from the user-picker dropdown.

## 0.1.36

### Minor Changes

- Self-service device pairing: every Foundry user can mint their OWN G2 bearer
  token, bound to their own authenticated identity, with no manual GM action. The
  pair menu is no longer GM-restricted and the user-picker dropdown is removed —
  you pair only your own device. Secure by construction (ADR-0014): a user writes
  a `pendingPair` flag (carrying a client-generated token) on their OWN User
  document — only that user can write their own user flags — and a GM client
  auto-ingests it into the world-scope bearer registry, binding the token to the
  user the flag belongs to (never a client-asserted id), then pushes it to the
  bridge. socketlib is deliberately NOT used (it cannot authenticate the caller).
  No new socketlib handler (count stays 17). A GM client must be online to
  finalize a token (auto-ingested; world-scope writes are GM-only).

## 0.1.35

### Minor Changes

- ADR-0015 §C browser-capture: show a player's REAL view by capturing from their
  already-open Foundry browser — no headless re-login (which The Forge blocks by
  binding a session to its account's user). The module now polls the bridge
  (`/internal/stream-request`) for the requested actor and elects the actor's
  ACTIVE, CONSENTING, NON-GM owner as the stream leader; that client captures its
  own vision/fog/lighting directly. If no consenting owner is online, the default
  GM-wins election still applies (the map is never blank). Pairs with the bridge's
  `EVF_PLAYER_VIEW_HEADLESS=0` default (headless becomes a self-hosted-only fallback).

## 0.1.34

### Patch Changes

- ADR-0015 §C (BUG-4): roster heartbeat. The character-list reader emitted
  `r1.characters.available` only on `ready` + actor CRUD hooks, so after a bridge
  (re)start or stream-leadership migration the bridge `CharacterListCache` went
  cold until an actor changed — breaking the g2-app PC selector (`GET /v1/characters`)
  and the actor player-view (`actorId → userName` resolution → `unavailable`). The
  stream leader now re-publishes the roster on the same 10s cadence as the
  display-settings heartbeat, keeping the cache warm. Leader-gated; best-effort.

## 0.1.15

### Minor Changes

- Quick Task 260611-e71: frame_png wire format — greyscale lossless PNG (~1-5 KB vs ~884 KB RGBA).
  - `canvas-extractor.ts` now emits ONLY `frame_png` envelopes (never `frame_pixels`).
  - PNG encode via `UPNG.encode([rgbaLuma.buffer], w, h, 0, undefined, true)` (ctype=2 RGB, exact luma roundtrip, ~100–700× smaller than frame_pixels).
  - Identical-frame skip: FNV-1a 32-bit luma hash — no POST when content unchanged.
  - Leading+trailing hook throttle (THROTTLE_MS=200 ms): continuous canvasPan emits ~5 fps.
  - Live `captureIntervalMs` world setting (default 250 ms, range 100–5000 ms, step 50 ms) via TICK_MS=100 ms poll — DM can change cadence without module reload.

## 0.1.4

### Patch Changes

- e5b4a3f: Fix the "Pair Device" dialog crashing on Foundry v13+ with _"PairModal … is not renderable
  because it does not implement \_renderHTML and \_replaceHTML"_. `PairModal` mixed v1 `Application`
  patterns (`defaultOptions.template`, `getData`, `_activateListeners`) onto the abstract
  `ApplicationV2` base. Converted it to the real v13 API: `HandlebarsApplicationMixin(ApplicationV2)`
  - `static DEFAULT_OPTIONS`/`PARTS`, `_prepareContext()`, `_onRender()` (reads `this.element`),
    and `render({ force: true })`. The hand-rolled `foundry.applications.api` type declaration gained
    `HandlebarsApplicationMixin` + the v13 ApplicationV2 surface.

## 0.1.3

### Patch Changes

- 68deaf8: Distribution re-release: bundle the updated g2-app (Even Hub app icon + manifest `description` +
  dev-mode docs) into the release assets. No module source change — the foundry-module release is the
  distribution anchor that re-packages `g2-app-dist.zip` + the submission-ready `evenfoundryvtt.ehpk`
  (now carrying the icon + description) and attaches them to the GitHub Release.

## 0.1.2

### Patch Changes

- 2ac3fbd: Add `readme`, `manual`, `bugs`, and `changelog` links to `module.json` so the Foundry
  package listing surfaces the GitHub README, the showcase guide
  (`https://aiacos.github.io/EvenFoundryVTT/showcase/`), the issue tracker, and the
  releases changelog. (CI-only, no package change: the tagged-release CD now also packs
  and attaches the submission-ready Even Hub `evenfoundryvtt.ehpk` as a permanent GitHub
  Release asset, and `release.yml` gains `actions: write` so the tagged release auto-builds
  without a manual `workflow_dispatch`.)

## 0.1.1

### Patch Changes

- Updated dependencies [36aea7f]
  - @evf/shared-protocol@0.2.0

## 0.1.0

### Minor Changes

- 498c01f: Phase 2 Wave 0: module skeleton, module.json, settings panel, locale catalogs (EN + IT).

  Bootstraps `packages/foundry-module` from placeholder to a buildable Foundry module:

  - `module.json` with relationships.requires (socketlib, midi-qol, dnd5e), socket:true
  - tsup ESM build pipeline → `dist/module.js`
  - `src/module.ts`: MODULE_ID export, Hooks.once("init") bootstrap
  - `src/settings.ts`: registerSettings(), PairModalStub, detectedLocale (I18N-01)
  - `lang/en.json` + `lang/it.json`: 24 UI-A i18n keys (evf.pair._ + evf.settings._)
  - 10 unit tests, coverage ≥80%

- 7f5d0d1: Phase 2 Plan 05: Reader API + Foundry hooks + delta emitter

  - **@evf/shared-protocol**: Add Zod `strictObject` payload schemas for `CharacterSnapshot`, `CombatSnapshot`, `SceneViewport`, `EventLogEntry`, and `EventLogResponse`; re-export all from package index
  - **@evf/foundry-module**: Add `RingBuffer<T>` (200-entry, oldest-evict), character/combat/scene/event-log readers, `registerHookSubscribers()` for 5 Foundry hooks (updateActor, updateCombat, canvasReady, controlToken, createChatMessage, targetToken), `bridgeDeltaEmitter` fire-and-forget POST to bridge `/internal/delta`, extended socketlib GM handlers for all 5 snapshot reads
  - **@evf/bridge**: Add REST routes `GET /v1/character/:actorId`, `GET /v1/combat/current`, `GET /v1/scene/viewport`, `GET /v1/events`, `GET /v1/characters`; `POST /internal/delta` (EVF_INTERNAL_SECRET auth); `DeltaEmitter` WS fanout with capability routing and replay buffer integration

### Patch Changes

- 6959c54: Implement ADR-0003 Tool Registry: 7 Zod-typed tools in @evf/shared-protocol (cast_spell, weapon_attack, use_item, skill_check, move_token, place_template, set_targets), GET /v1/tools returns full entries with Zod 4 native .toJSONSchema(), POST /v1/tools/:name dispatches via stub returning phase-07-pending (write path lands in Phase 07 per D-15). Foundry-module socketlib-handlers gains 7 stub registrations for Phase 07 wiring.
- b516ab6: Forward weapon-attack `advantage` + weapon/spell `targets` to the dnd5e workflow via `MidiQOL.completeActivityUse` when present; honest single `console.warn` (no behavior change, no double-roll) when MidiQOL is absent.

  FIX-B + FIX-C: both protocol fields previously passed Zod validation but reached a dead end — neither write-path handler read them, so they had zero effect on the actual roll. This wires them through a MidiQOL capability split:

  - **MidiQOL present** (`typeof MidiQOL !== 'undefined' && game.modules.get('midi-qol')?.active`): `weapon-attack` forwards `midiOptions.targetUuids` + `advantage`/`disadvantage` (preserving the `i===0` Extra-Attack action economy and multi-attack progress emit); `cast-spell` forwards `midiOptions.targetUuids` merged with the spell slot override (concentration-conflict pre-check still runs first).
  - **MidiQOL absent**: behavior is byte-identical to today's `activity.use` — NO `rollAttack`, NO roll hook, NO `game.user.targets` mutation, no double-execution. A single honest `console.warn` surfaces that advantage/target auto-application requires MidiQOL.

  Backward-compat: `advantage='normal'` + empty `targets` is unchanged. No new public API surface — schema fields were already public; this only wires them into the workflow.

- 1f3f2bf: fix(foundry-module): combat-action-tracker reads `flags.evf.audit.tool` not `audit.toolId`

  The `createChatMessage` hook read `audit.toolId`, which `writeAuditLog`/`dispatchTool`
  never write (the real `AuditEntry` field is `tool`). The read was always `undefined`,
  short-circuiting before any action-economy `emit` — dead code per INV-4. Reading
  `audit.tool` (matching the sibling `action-result-watcher`) revives production
  action-economy tracking. Added a CAT-REGRESSION guard pinning the wire-shape field name.

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
- Updated dependencies [c80d16f]
  - @evf/shared-protocol@0.1.0
