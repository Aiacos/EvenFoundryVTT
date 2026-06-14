---
phase: quick/260614-r81-code-review-fixes-batch
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false   # contains a STOP-GATE before T13
requirements: [R81-CODE-REVIEW]
files_modified:
  - .github/workflows/ci.yml
  - .gitignore
  - docs/architecture/README.md
  - packages/g2-app/src/status-hud/status-hud-renderer.ts
  - packages/g2-app/src/engine/container-registry.ts
  - packages/g2-app/src/status-hud/i18n-budgets.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/engine/perf-probe.ts
  - packages/g2-app/src/engine/capability-handshake.ts
  - packages/foundry-module/src/pair/PairModal.ts
  - packages/foundry-module/src/pair/PairModal.test.ts
  - packages/bridge/src/ws/handshake.ts
  - packages/bridge/src/server.ts
  - packages/bridge/src/routes/character.ts
  - packages/foundry-module/src/module.ts
  - packages/foundry-module/src/canvas-extractor.ts
  - packages/shared-protocol/src/payloads/settings-display.ts
  - packages/shared-protocol/src/payloads/settings-display.test.ts

must_haves:
  truths:
    - "CI INV-4 TODO gate fires (exits non-zero) only on genuinely untagged TODOs"
    - "git status is clean of the scratch/build dirs (_*.ts, release/, release-artifacts/)"
    - "Pairing via registerMenu renders the real bridgeUrl + worldId, not undefined"
    - "A bearer token cannot read a non-owned actorId over REST"
    - "WS handshake closes idle sockets after ~10s with code 4400"
    - "Reconnect rebinds the wsEventBus so canvas-mode consumers stay live"
    - "On-glasses [N] Language change reaches navigated panels without reboot"
    - "Frame pipeline does not wedge when the frame-POST callback throws"
    - "canvas-extractor reset removes all 5 Hooks listeners (no leak)"
    - "ClientSettingMessageSchema rejects extra fields (strictObject)"
  artifacts:
    - path: ".github/workflows/ci.yml"
      provides: "Working PCRE-based INV-4 TODO gate"
    - path: "packages/foundry-module/src/pair/PairModal.ts"
      provides: "No-arg constructor reading settings + world id in _prepareContext"
    - path: "packages/bridge/src/routes/character.ts"
      provides: "Actor-ownership enforcement from validated token"
    - path: "packages/shared-protocol/src/payloads/settings-display.test.ts"
      provides: "Bounds + round-trip + strict-rejection coverage"
  key_links:
    - from: "packages/bridge/src/routes/character.ts"
      to: "token ownership"
      via: "validated-token allowed-actor gate (mirror WS selectedActorId)"
      pattern: "ownership|selectedActorId|allowedActor"
---

<objective>
Batch of full-codebase code-review fixes (review R81). Each fix is its own atomic
task → one atomic commit. Tasks are ordered strictly by risk: safest first
(Batch 1 quick wins) → CRITICAL (Batch 2) → HIGH (Batch 3), with an explicit
human STOP-GATE before the irreversible dead-code deletion (T13).

Purpose: close correctness, security, and INV-4 hygiene gaps found in review
without re-litigating any upstream-verified constraint (INV-2) and keeping
docs coherent (INV-3).

Output: 14 atomic commits across 3 batches, each leaving `pnpm lint:ci`,
`pnpm typecheck`, and `pnpm test` green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@.github/workflows/ci.yml
@packages/foundry-module/src/pair/PairModal.ts
@packages/foundry-module/src/pair/BridgeConfigModal.ts
@packages/bridge/src/ws/handshake.ts
@packages/bridge/src/routes/character.ts
@packages/bridge/src/auth/token-cache.ts
@packages/foundry-module/src/module.ts
@packages/foundry-module/src/canvas-extractor.ts
@packages/shared-protocol/src/payloads/settings-display.ts
@packages/g2-app/src/internal/boot-engine-core.ts
</context>

<conventions>
- pnpm workspace. Per-batch verification: `pnpm lint:ci` (Biome read-only),
  `pnpm typecheck` (tsc strict), `pnpm test` (Vitest). All must exit 0 before commit.
- One commit per task. Conventional Commits (commitlint + husky enforced).
- INV-2: do NOT re-litigate any upstream-verified hardware/SDK claim. No new
  external claims needed for any task here.
- INV-3: any doc-touching task (T3) updates coherently in the same commit.
- INV-4: zero bare `// TODO`; every TODO carries `(#NN)` or `(ADR-NNNN)`.
  RULE for T4: never invent issue numbers — convert untruthful markers to a
  real ADR ref or to a plain `// NOTE:` / `// Deferred:` non-action comment.
- TODO-gate self-check command (use the SAME pattern the CI gate will use after T1):
    grep -RPn '// TODO ?(?!\((#[0-9]+|ADR-[0-9]+)\))' --include='*.ts' --include='*.tsx' --include='*.js' packages/ docs/architecture/
  Must return no matches (exit 1 = clean) over packages/*/src after T4.
</conventions>

<tasks>

<!-- ════════════════════ BATCH 1 — quick wins, lowest risk ════════════════════ -->

<task type="auto">
  <name>T1: Fix broken INV-4 TODO gate in CI (ERE→PCRE)</name>
  <files>.github/workflows/ci.yml</files>
  <action>
    In the "TODO discipline grep" step (~line 53), the current command uses
    `grep -RnE '// TODO(?!\((#[0-9]+|ADR-[0-9]+)\))'`. ERE (`-E`) does not
    support the PCRE negative-lookahead `(?!…)`, so the pattern never matches
    and the gate never fires. Replace `-RnE` with `-RPn` (PCRE) and make the
    pattern tolerate an optional space after `TODO`:
    `// TODO ?(?!\((#[0-9]+|ADR-[0-9]+)\))`.
    Keep the same `--include` globs and the same `packages/ docs/architecture/`
    scope, the same `::error::` message, and the same `exit 1` on match.
    Do NOT change any other CI step. Do not edit packages here — T4 cleans the
    tags so this gate is green over real sources.
  </action>
  <verify>
    <automated>grep -RPn '// TODO ?(?!\((#[0-9]+|ADR-[0-9]+)\))' README.md >/dev/null; printf 'untagged // TODO\n' | grep -RPn '// TODO ?(?!\((#[0-9]+|ADR-[0-9]+)\))' - && echo GATE_FIRES_ON_UNTAGGED</automated>
  </verify>
  <done>The step uses `grep -RPn` with the optional-space lookahead; run by hand it exits non-zero ONLY on genuinely untagged TODOs, and exits zero on `// TODO (#42)` / `// TODO(ADR-0005)`.</done>
</task>

<task type="auto">
  <name>T2: .gitignore scratch + build dirs</name>
  <files>.gitignore</files>
  <action>
    Append three patterns under a clearly-labelled section:
    `_*.ts` (matches packages/bridge/_seed.ts and
    packages/foundry-module/_scene_e2e.ts scratch files),
    `release/` (packages/foundry-module/release build output), and
    `release-artifacts/` (root release staging). Do NOT delete the files —
    only ignore them. Do not add `dist/`/`build/` (already present).
  </action>
  <verify>
    <automated>git status --porcelain | grep -E '_seed\.ts|_scene_e2e\.ts|^.. (packages/foundry-module/)?release/|release-artifacts/' && echo STILL_DIRTY || echo CLEAN</automated>
  </verify>
  <done>`git status` no longer lists `_seed.ts`, `_scene_e2e.ts`, `release/`, or `release-artifacts/` as untracked.</done>
</task>

<task type="auto">
  <name>T3: Architecture README index — add ADR-0012/0013, fix ADR-0005 status</name>
  <files>docs/architecture/README.md</files>
  <action>
    INV-3 doc coherence. In docs/architecture/README.md `## Index` table:
    (1) Add an ADR-0012 row — read docs/architecture/0012-*.md frontmatter:
        status `accepted`, title "R1 Gesture Model — Retire Long-Press,
        Over-Scroll Quick Action, Root Exit, Lifecycle Handlers". Phase gate:
        cite the gesture-redesign phase (per ADR body — Phase 20 GEST-01).
    (2) Add an ADR-0013 row — read docs/architecture/0013-*.md: status
        `accepted` (2026-06-05), title "HUD raster rendering (image-based HUD)".
        Phase gate: the HUD raster milestone.
    (3) Correct the ADR-0005 row status from `proposed` to its real status:
        read docs/architecture/0005-*.md "## Status" — it is
        **PROVISIONAL-ACCEPTED** (2026-05-14). Use that exact term in the cell.
    Insert rows in numeric order (0012 after 0011, 0013 after 0012). Update the
    "Numbering" prose only if it now misstates the highest authored ADR.
    Do not edit any ADR body (immutable post-acceptance).
  </action>
  <verify>
    <automated>grep -q 'ADR-0012' docs/architecture/README.md && grep -q 'ADR-0013' docs/architecture/README.md && grep -q 'PROVISIONAL-ACCEPTED' docs/architecture/README.md && ! grep -E 'ADR-0005.*proposed' docs/architecture/README.md && echo OK</automated>
  </verify>
  <done>Index lists ADR-0012 and ADR-0013 with correct titles/statuses; ADR-0005 row reads PROVISIONAL-ACCEPTED, not proposed.</done>
</task>

<task type="auto">
  <name>T4: Normalize non-conforming TODO tags so the T1 gate passes</name>
  <files>packages/g2-app/src/status-hud/status-hud-renderer.ts, packages/g2-app/src/engine/container-registry.ts, packages/g2-app/src/status-hud/i18n-budgets.ts, packages/g2-app/src/internal/boot-engine-core.ts, packages/g2-app/src/engine/perf-probe.ts, packages/g2-app/src/engine/capability-handshake.ts</files>
  <action>
    Run the self-check grep (see conventions) to get the live offender list, then
    fix each truthfully. Do NOT invent issue numbers. Known offenders to resolve:
    - `// TODO(HUD-27PX): … (#issue)` literal placeholders in status-hud-renderer.ts
      and container-registry.ts (and i18n-budgets.ts / status-hud-layer.ts if the
      grep flags them): these are deferred HUD-27PX work with a literal `(#issue)`
      placeholder, which is NOT a real reference. Convert each to a plain
      explanatory `// NOTE (HUD-27PX): …` / `// Deferred (HUD-27PX): …` comment
      (drop the `TODO` action marker and the fake `(#issue)`), OR, if a real
      tracking issue exists for HUD-27PX, use `(#NN)`. Truth over convenience.
    - `// TODO(SC-10-01)` / `// TODO(SC-10-02)` markers in boot-engine-core.ts and
      perf-probe.ts: SC-10-0x is a plan/station tag, not an `(#NN)`/`(ADR-NNNN)`
      reference. Reword to `// NOTE (SC-10-02): …` / `// Deferred (SC-10-02): …`
      (plain comment) unless a real issue/ADR applies.
    - `// TODO(ADR-0005-OQ-INV2-1.b)` in capability-handshake.ts: the gate regex
      only accepts `ADR-NNNN` (4 digits, no suffix). Normalize to `(ADR-0005)`
      so it matches, keeping the OQ detail in the comment prose
      (e.g. `// TODO(ADR-0005): re-tune on real G2 hardware (OQ-INV2-1.b)`).
    Leave already-conforming TODOs that carry real `(#NN)` (e.g. #31–#44) untouched.
    After this task the self-check grep over packages/*/src must be clean.
  </action>
  <verify>
    <automated>grep -RPn '// TODO ?(?!\((#[0-9]+|ADR-[0-9]+)\))' --include='*.ts' packages/g2-app/src packages/bridge/src packages/foundry-module/src packages/shared-protocol/src && echo OFFENDERS_REMAIN || echo CLEAN</automated>
  </verify>
  <done>The T1 gate pattern returns no matches across packages/*/src; no fabricated issue numbers were introduced; ADR-0005 ref normalized to `(ADR-0005)`.</done>
</task>

<!-- ════════════════════ BATCH 2 — CRITICAL ════════════════════ -->

<task type="auto" tdd="true">
  <name>T5: PairModal no-arg constructor (registerMenu renders undefined)</name>
  <files>packages/foundry-module/src/pair/PairModal.ts, packages/foundry-module/src/pair/PairModal.test.ts</files>
  <behavior>
    - `new PairModal()` (no args) constructs successfully.
    - `_prepareContext` returns `bridgeUrl` from `game.settings.get(MODULE_ID,'bridgeUrl')` and `worldId` from `game.world.id`, not undefined.
    - The "Refresh now" path (generateBearer) uses the same settings/world values, not stale constructor fields.
  </behavior>
  <action>
    Foundry's `registerMenu(..., { type: PairModal })` instantiates with `new
    type()` (no args), so the current `constructor(bridgeUrl, worldId)` leaves
    `_bridgeUrl`/`_worldId` undefined and the modal copies `undefined`. Mirror
    the no-arg pattern in BridgeConfigModal.ts (read it first — it reads
    `readStringSetting('bridgeUrl')` inside `_prepareContext`).
    Refactor PairModal:
    - Drop the constructor params and the `_bridgeUrl`/`_worldId` readonly
      fields (or replace the constructor with the default no-arg one).
    - In `_prepareContext`, read `bridgeUrl` via
      `game.settings.get(MODULE_ID,'bridgeUrl')` (string-coerced like
      BridgeConfigModal) and `worldId` via `game.world.id`.
    - Update every prior `this._bridgeUrl` / `this._worldId` use (notably the
      `generateBearer(currentAlias, this._bridgeUrl, this._worldId, true)` call
      ~line 471) to read the live settings/world values at call time.
    - settings.ts already calls `new type()` via registerMenu and notes the cast;
      remove the now-stale "typed args" comment lines (~144–145) so the comment
      matches reality. Do not change the registerMenu wiring itself.
    Update PairModal.test.ts: change construction to the real no-arg
    `new PairModal()` path and stub `game.settings.get`/`game.world.id` so the
    test exercises the production code path (the bug is masked today because
    tests pass args). Add an assertion that `_prepareContext` surfaces the
    stubbed bridgeUrl + worldId (not undefined).
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module test -- PairModal</automated>
  </verify>
  <done>`new PairModal()` with no args yields the real bridgeUrl + worldId in `_prepareContext`; PairModal.test.ts covers no-arg construction and asserts non-undefined values; full `pnpm test` green.</done>
</task>

<!-- ════════════════════ BATCH 3 — HIGH (each atomic, tests added/adjusted) ════ -->

<task type="auto" tdd="true">
  <name>T6: WS handshake idle timeout (close 4400 after ~10s)</name>
  <files>packages/bridge/src/ws/handshake.ts</files>
  <behavior>
    - If no first message arrives within ~10s, the socket is closed with code 4400 and the promise resolves null.
    - When a message arrives, the timer is cleared (no spurious close after success/failure).
  </behavior>
  <action>
    In `handleHandshake` (the `new Promise((resolve) => …)` body), add a
    `setTimeout` (~10_000 ms; expose as a named const, allow override via an
    optional param defaulting to 10_000 for testability) that, on fire:
    `socket.close(CLOSE_INVALID_HANDSHAKE, 'handshake_timeout')` and
    `resolve(null)`. Store the timer handle and `clearTimeout` it at the very
    start of the `socket.on('message', …)` handler (before any parse/branch) so
    every resolve path — success, invalid handshake, invalid token — clears it.
    Reuse the existing `CLOSE_INVALID_HANDSHAKE` (4400) constant; do not add a
    new close code. Keep all existing resolve(null)/resolve(sessionId) paths.
  </action>
  <verify>
    <automated>pnpm --filter @evf/bridge test -- handshake</automated>
  </verify>
  <done>A new test drives a socket that sends nothing → after the (injected short) timeout the socket closes with 4400 and the promise resolves null; the message path clears the timer (no double close). Existing handshake tests still pass.</done>
</task>

<task type="auto" tdd="true">
  <name>T7: WS maxPayload + concurrent-connection cap</name>
  <files>packages/bridge/src/server.ts</files>
  <behavior>
    - @fastify/websocket registered with an explicit `options.maxPayload`.
    - Connections beyond a configured ceiling are rejected (socket closed, not accepted into the session store).
  </behavior>
  <action>
    At the `@fastify/websocket` registration (~line 342), pass
    `options.maxPayload` (a sane byte ceiling, e.g. const
    `WS_MAX_PAYLOAD_BYTES`; size for the largest legitimate frame_png/handshake
    — derive from existing frame budget, document the choice in a comment).
    Add a concurrent-connection cap: a module-level counter (or read the
    sessionStore size) checked in the WS connection handler; beyond
    `WS_MAX_CONNECTIONS` (named const), close the new socket immediately
    (code 4503 / 1013-style "try again later"; reuse an existing close-code
    constant if one fits, else add a documented one) before `handleHandshake`
    runs, and do NOT register the session. Decrement/track on close. Keep
    existing handshake + session wiring intact for accepted connections.
  </action>
  <verify>
    <automated>pnpm --filter @evf/bridge test -- server</automated>
  </verify>
  <done>maxPayload is set on the ws plugin; a test opening connections past the cap shows the extra connection is closed and not added to the session store; under-cap connections still handshake normally.</done>
</task>

<task type="auto" tdd="true">
  <name>T8 (SECURITY): REST actor-ownership enforcement</name>
  <files>packages/bridge/src/server.ts, packages/bridge/src/routes/character.ts</files>
  <behavior>
    - A bearer token may read ONLY an actorId it owns; a request for a non-owned actorId returns 403 (or 404 if leak-avoidance preferred), never the snapshot.
    - The owned-actor identity comes from the validated token, mirroring the WS path's selectedActorId/ownership gate — not from the client-supplied actorId.
  </behavior>
  <action>
    Today `GET /v1/character/:actorId` validates the token then calls
    `foundryFn('evf.getCharacterSnapshot', actorId, token)` for ANY actorId —
    `internalSnapshotFn` in server.ts (~line 451) serves it straight from
    CharacterSnapshotCache with no ownership check. The bearer is not scoped to
    an actor, so any valid token reads any actor. Close the leak by mirroring
    the WS path's ownership gate (handshake.ts `selectedActorId` /
    initial-snapshot.ts ownership resolution):
    - Determine the token's allowed actor(s). The WS side resolves this from the
      session's `selectedActorId` / the foundry ownership of the token's world
      bearer. Surface the same allowed-actor identity to the REST path: extend
      the validated-token result (token-cache `ValidateTokenResult.entry`) or
      add a lookup that maps a validated token → its owned actorId(s) using the
      same source the WS gate uses. (Inspect initial-snapshot.ts ownership
      resolution and the bearer-registry/character-list caches before choosing
      the exact source — do NOT invent a new ownership model; reuse the WS one.)
    - In routes/character.ts, after token validation and BEFORE calling
      `foundryFn`, compare the requested `:actorId` against the token's allowed
      actor(s). On mismatch return 403 `forbidden` (or 404 `actor_not_found` if
      we prefer not to confirm existence — pick the option the WS path's
      behavior is consistent with) and do NOT call foundryFn.
    - Keep the existing 401/404/200 arms. Update the route's JSDoc error list.
    Add a test (extend character.test.ts) where a valid token for actor A
    requests actor B's id and asserts the response is the ownership-denied status
    and that foundryFn was NOT invoked for B. Keep CHR-ROUTE-01..05 passing.
    NOTE: this is the security-critical task — verify the chosen ownership source
    is the SAME one the WS path trusts; surface any ambiguity at execution time
    rather than guessing.
  </action>
  <verify>
    <automated>pnpm --filter @evf/bridge test -- character</automated>
  </verify>
  <done>A token scoped to actor A receives an ownership-denied status (not the snapshot) when requesting actor B; the gate derives the allowed actor from the validated token (same source as the WS selectedActorId gate); foundryFn is not called on denial; existing route tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>T9: Reconnect rebinds wsEventBus for canvas-mode consumers</name>
  <files>packages/g2-app/src/internal/boot-engine-core.ts</files>
  <behavior>
    - After a WS reconnect, hudDeltaDriver / canvasStatusHud / displaySettingsSync receive events from the NEW socket, not the dead one.
    - statusHud-mode path (non-canvas) still rebinds as before (no regression).
  </behavior>
  <action>
    At the reconnect handler (~line 1397) the only HUD rebind is
    `statusHud?.rebindWsEvents(createWsEventBus(newWs, …))`, which is a no-op in
    canvas mode (`statusHud` is null). The persistent `wsEventBus` created at
    step 5a (~line 608) — consumed by hudDeltaDriver (line 690-ish, `wsEvents:
    wsEventBus`), canvasStatusHud (~line 909, `wsEvents: wsEventBus`), and
    displaySettingsSync (~line 953, `createDisplaySettingsSync(wsEventBus, …)`) —
    keeps listening on the dead socket. Fix by rebinding the SHARED bus to
    `newWs` on reconnect rather than creating a throwaway bus only for statusHud:
    - Add/confirm a rebind method on the wsEventBus (e.g. `wsEventBus.rebind(newWs)`
      or equivalent re-subscription) that detaches old-socket listeners and
      attaches to newWs while preserving existing consumer subscriptions and the
      late-bound perfProbe (`setPerfProbe`). If the bus has no such method, add
      one (and a focused unit for it) rather than reconstructing consumers.
    - In the reconnect handler call that rebind on the shared `wsEventBus` so all
      three canvas-mode consumers resume on newWs; keep the existing
      `statusHud?.rebindWsEvents(...)` call for the non-canvas path (or route it
      through the same shared-bus rebind).
    - After rebind, kick `hudDeltaDriver.requestCycle()` so the canvas repaints
      against the live socket.
    Inspect the ws-event-bus implementation (createWsEventBus) before choosing
    rebind-vs-recreate; do not leave consumers holding a reference to a stale bus.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test -- boot-engine</automated>
  </verify>
  <done>A reconnect test in canvas mode (statusHud null) asserts that after reconnect an inbound event on newWs reaches hudDeltaDriver/canvasStatusHud/displaySettingsSync (and not via the old socket); non-canvas path unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>T10: Live [N] Language change reaches navigated panels</name>
  <files>packages/g2-app/src/internal/boot-engine-core.ts</files>
  <behavior>
    - After an on-glasses [N] Language change, a subsequently navigated panel/modal/toast renders in the new locale (no reboot).
    - The menu chrome (already updated via localeEvents) keeps working.
  </behavior>
  <action>
    `effectiveLocale` (~line 806) is a `const` captured by the openPanel/quick-
    action closures (~line 1039+ `makeMenu`/panel factory closures capture
    `effectiveLocale`), so changing locale via [N] only updates the menu chrome
    (which already subscribes to `localeEvents`); navigated panels/modals/toasts
    stay stale until reboot. Thread the live locale to the navigation sites:
    - Introduce a mutable locale holder (e.g. `let currentLocale = effectiveLocale`
      or a `{ value }` ref) updated by the existing `localeEvents` listener
      (~line 1060 "WR-03: mutable refs updated by localeEvents") so it always
      holds the live locale.
    - Change the openPanel / quick-action / toast construction sites that
      currently capture the `const effectiveLocale` to read the mutable holder at
      call time (or subscribe the panel to `localeEvents`). Cover openPanel,
      the action-overlay factory closures (makeActionOptions/makeMovePicker), and
      the toast/result handlers that take a locale arg.
    - Keep StatusHudRenderer's boot-time locale as-is unless it is one of the
      navigation sites; the requirement is navigated panels/modals/toasts.
    Do not alter world settings (locale override is device-local per §7.16).
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test -- boot-engine</automated>
  </verify>
  <done>A test emits a localeEvents change then opens a panel and asserts the panel was constructed with the NEW locale (mutable holder/subscription), not the boot-time const; menu-chrome locale behavior unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>T11: Frame pipeline must not wedge on callback throw</name>
  <files>packages/foundry-module/src/module.ts</files>
  <behavior>
    - If the frame-POST `.then` callback throws synchronously, `_framePostBusy` is still reset and `_pendingFramePost` is drained.
    - Normal success path still drains the queued next frame.
  </behavior>
  <action>
    In `runFramePost` (~line 265), `_framePostBusy = false` and the
    `_pendingFramePost` drain live inside the success `.then(res => …)`. A sync
    throw inside that callback (e.g. applyDisplaySettings or the safeParse path)
    leaves `_framePostBusy = true` forever, permanently wedging the single-flight
    frame pipeline. Refactor to a `.finally`:
    - Keep the success logic (read `res.pendingSettings`, safeParse, apply) inside
      `.then`, but move `_framePostBusy = false` and the
      `_pendingFramePost` read+recurse into `.finally` (or `.then(...).catch(log).finally(reset+drain)`)
      so the busy flag clears and the queued frame drains regardless of success,
      network rejection, or a thrown callback.
    - Add a `.catch` that logs a warning (consistent with the file's "never throw"
      T-02-01 discipline) so a rejected postDelta does not surface unhandled.
    - Preserve recursion semantics: drain exactly one queued `_pendingFramePost`.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module test -- module</automated>
  </verify>
  <done>A test that makes the `.then` callback throw (or postDelta reject) asserts `_framePostBusy` returns to false and a queued `_pendingFramePost` is drained (pipeline not wedged); the happy path still drains the next frame.</done>
</task>

<task type="auto" tdd="true">
  <name>T12: canvas-extractor reset must Hooks.off all 5 listeners</name>
  <files>packages/foundry-module/src/canvas-extractor.ts</files>
  <behavior>
    - `_resetCanvasExtractor()` removes all 5 hook listeners (canvasReady, drawCanvas, refreshToken, updateScene, canvasPan).
    - register → reset → register leaves exactly one set of listeners (no leak / no duplicate fires).
  </behavior>
  <action>
    `_resetCanvasExtractor` (~line 1033) only nulls `_registered` and never calls
    `Hooks.off`, so the 5 listeners registered (~lines 971-975: canvasReady,
    drawCanvas, refreshToken, updateScene, canvasPan) leak across
    re-registration/reload. The register path already returns/stores an
    unregister function (~line 758 "Returns an unregister function that calls
    Hooks.off", stored on `_registered.handlers` ~line 1008, used by the live
    unregister ~line 1023). Make `_resetCanvasExtractor` invoke that live
    unregister (call `_registered.handlers`'s Hooks.off for each, or the stored
    unregister fn) BEFORE nulling `_registered`. Guard for `_registered === null`
    (no-op). Do not change the register-time listener set.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module test -- canvas-extractor</automated>
  </verify>
  <done>A test that registers, resets, registers, then fires a hook (e.g. canvasReady) asserts the extractor reacts exactly once (no duplicate from a leaked listener); reset with no registration is a safe no-op.</done>
</task>

<!-- ⛔ STOP-GATE before T13 -->
<task type="checkpoint:human-verify" gate="blocking">
  <name>STOP-GATE: confirm legacy raster pipeline is dead before T13 deletion</name>
  <what-built>
    Tasks T1–T12 complete and committed. T13 proposes deleting
    packages/g2-app/src/raster/rle-encoder.ts (+ __tests__/rle-encoder.test.ts)
    and the unreachable legacy 400×200 raster-worker pipeline.
  </what-built>
  <how-to-verify>
    Before any deletion, report to the orchestrator/user the dead-code scope:
    1. Confirm rle-encoder.ts is imported ONLY by its own test (grep already
       shows the sole importer is __tests__/rle-encoder.test.ts).
    2. Establish whether the legacy 400×200 raster-worker path (raster-worker.ts /
       raster-controller.ts) is truly unreachable now that the HUD is canvas-
       composited full-screen (ADR-0013) — list every live importer of
       raster-worker / raster-controller and whether any is on a reachable boot path.
    3. Deletion is irreversible-ish (INV-4 dead-code removal). WAIT for explicit
       human confirmation that the legacy raster pipeline is dead before deleting.
  </how-to-verify>
  <resume-signal>Type "confirmed dead — delete" to proceed with T13 deletion, or "keep — add TODO+test" to take the fallback path.</resume-signal>
</task>

<task type="auto">
  <name>T13: Remove g2-app raster dead code (INV-4) — gated</name>
  <files>packages/g2-app/src/raster/rle-encoder.ts, packages/g2-app/src/raster/__tests__/rle-encoder.test.ts, packages/g2-app/src/raster/raster-worker.ts, packages/g2-app/src/raster/raster-controller.ts</files>
  <action>
    ONLY after the STOP-GATE confirms the legacy raster pipeline is dead.
    IF confirmed dead:
    - Delete rle-encoder.ts and its __tests__/rle-encoder.test.ts.
    - Delete the unreachable legacy 400×200 raster-worker pipeline files
      (raster-worker.ts and any raster-controller.ts code that is solely its
      consumer) — only the parts proven unreachable at the gate; keep any
      module still imported by a live boot path. Remove now-dangling imports/
      exports (e.g. index.ts re-exports) and update any barrel files.
    - Run a full typecheck to catch orphaned references.
    IF the gate decided "keep":
    - Do NOT delete. Instead add an issue-linked `// TODO (#NN)` (real issue) or
      ADR ref at the head of each file documenting why it is retained, and add a
      minimal integration test asserting the path is exercised, so INV-4 dead-code
      tolerance is satisfied without deletion.
    Commit message must state which branch (delete vs keep) was taken and cite the
    gate decision.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app typecheck && pnpm --filter @evf/g2-app test</automated>
  </verify>
  <done>Either the dead files are gone with no dangling imports and typecheck/test green, OR the retained files carry an issue/ADR-linked marker plus a covering test; INV-4 dead-code rule satisfied; commit cites the gate decision.</done>
</task>

<task type="auto" tdd="true">
  <name>T14: shared-protocol settings-display bounds + strictObject</name>
  <files>packages/shared-protocol/src/payloads/settings-display.ts, packages/shared-protocol/src/payloads/settings-display.test.ts</files>
  <behavior>
    - brightness accepts -100..100, rejects -101/101; webpQuality 0..100 rejects -1/101; captureFps 1..60 rejects 0/61.
    - Full snapshot and single-key partial both round-trip (parse → infer → re-parse).
    - ClientSettingMessageSchema rejects an unknown extra field (strict).
    - Empty object `{}` is accepted by SettingsDisplaySchema (all-optional partial).
  </behavior>
  <action>
    Two changes:
    (1) In settings-display.ts change `ClientSettingMessageSchema` from
        `z.object({...})` to `z.strictObject({...})` so the upstream
        `client_setting` message rejects extra/leaked fields. Update the inline
        comment that currently says `z.object (not strict) for additive
        forward-compat` to reflect the strict decision (extra fields now rejected).
        Leave `SettingsDisplaySchema` as `.partial()` (all-optional) — only the
        outer message becomes strict. (If `.partial()` blocks `strictObject`
        composition, apply `.strict()` on the message object, not the inner one.)
    (2) Create settings-display.test.ts covering: brightness/webpQuality/captureFps
        boundary accept+reject (in/out of range, non-integer rejected), full-
        snapshot round-trip, single-key partial round-trip, empty `{}` accepted,
        and ClientSettingMessageSchema rejecting an object with an unknown extra
        key (strict). Use the exported schemas/types directly.
  </action>
  <verify>
    <automated>pnpm --filter @evf/shared-protocol test -- settings-display</automated>
  </verify>
  <done>ClientSettingMessageSchema is strict (extra field → parse error); new settings-display.test.ts covers bounds, round-trip, empty/partial, and strict rejection; `pnpm test` green.</done>
</task>

</tasks>

<verification>
Per-batch gate (run after each batch; all must exit 0 before the next batch):
  pnpm lint:ci
  pnpm typecheck
  pnpm test
Plus the INV-4 self-check after T4 (and again after T13):
  grep -RPn '// TODO ?(?!\((#[0-9]+|ADR-[0-9]+)\))' --include='*.ts' packages/*/src   # must be clean
</verification>

<success_criteria>
- 14 atomic commits, one per task, in risk order (T1→T14).
- Batch 1 (T1–T4): CI TODO gate fixed + fires correctly; scratch dirs ignored;
  ADR index coherent (INV-3); all package TODO tags conform (INV-4).
- Batch 2 (T5): registerMenu pairing renders real bridgeUrl/worldId; no-arg test.
- Batch 3 (T6–T14): handshake timeout, ws maxPayload+cap, REST ownership gate
  (security), reconnect bus rebind, live locale, frame-pipeline finally,
  canvas-extractor Hooks.off, gated dead-code removal, strict settings schema.
- STOP-GATE honored before T13 (no deletion without human confirmation).
- After every batch: `pnpm lint:ci` && `pnpm typecheck` && `pnpm test` all exit 0.
</success_criteria>

<output>
This is a quick-mode plan; tasks are executed in order with one commit each.
No SUMMARY file required unless the orchestrator requests one.
</output>
