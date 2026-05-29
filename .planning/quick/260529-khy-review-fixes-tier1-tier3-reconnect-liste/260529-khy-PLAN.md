---
quick_id: 260529-khy
type: quick
branch: develop
title: "Codebase-review fixes — Tier 1 (R1/R2/R3) + Tier 3 hardening"
waves: 3
baseline_tests: 2815
files_modified:
  - packages/g2-app/src/engine/ws-reconnect.ts
  - packages/g2-app/src/engine/ws-sender.ts
  - packages/g2-app/src/status-hud/status-hud-layer.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/__tests__/ws-reconnect.test.ts
  - packages/g2-app/src/engine/ws-sender.test.ts
  - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
  - packages/g2-app/src/__tests__/boot-engine-reconnect-rewire.test.ts
  - packages/g2-app/src/panels/action-options-modal.ts
  - packages/g2-app/src/panels/slot-picker-panel.ts
  - packages/g2-app/src/raster/raster-controller.ts
  - packages/foundry-module/src/write-path/combat-action-tracker.ts
  - packages/g2-app/src/panels/spellbook-panel.ts
  - packages/g2-app/src/panels/inventory-panel.ts
  - packages/shared-protocol/src/payloads/action-result.ts
  - packages/shared-protocol/src/debug/debug-events.ts
  - packages/foundry-mcp/src/voice/spell-lookup.ts
  - packages/foundry-mcp/src/tools/bridge-client.ts
  - packages/foundry-module/src/readers/character-reader.ts
  - packages/validation-harness/src/inv-suite.ts
constraints:
  - "typecheck + lint:ci + test all green at each wave exit"
  - "CI Gate 8 socketlib handler count = 17 (no socketlib add/remove)"
  - "ADR-0011: no activity.use( in g2-app or bridge (holder only wraps ws.send of existing envelopes)"
  - "INV-4: zero dead code + JSDoc on every new public API"
  - "changeset (patch, multi-package) before exit"
  - "No hardware dependency for software tests (mock sockets/holder.swap/workers/hooks)"
  - "Backward-compat: non-reconnect callers (handshake, audio-capture own-WS, DebugMirror HTTP) untouched"
---

<objective>
Apply three Tier-1 engine fixes (R1 FULL reconnect rewire, R2 raster worker
fatal-error handling, R3 combat-action-tracker deleteCombat cleanup) plus a Tier-3
hardening bundle (long-press item mapping, schema bounds, spell-level data fix,
INV-5 false-pass, bridge-client null/return fixes, character-reader range-0 guard),
all from a verified codebase review.

Purpose: close correctness/robustness gaps found in review without reducing scope.
The CRITICAL item is R1. The plan-checker returned REVISE with 2 BLOCKERS on Wave 1:

  BLOCKER 1 — the reconnect controller attaches its 'close' listener ONLY to the
  original socket and never re-arms it on the new socket, so reconnect works exactly
  ONCE; a second disconnect is never detected → permanent dark.

  BLOCKER 2 — the listener rewire covered only 5 inbound data sources and missed
  (a) ALL outbound senders (panels capture the boot-time ws and call this.ws.send,
  so after reconnect the player can SEE but cannot ACT) and (b) two inbound listeners
  (reaction-prompt + portrait). The user chose the FULL fix: after reconnect EVERYTHING
  works (display + input + outbound action dispatch) AND repeated reconnects work.

Output: 3 waves of TDD RED→GREEN fixes, atomic Conventional Commits, one patch
changeset spanning the touched packages. Baseline 2815 tests must stay green and grow
(Wave 1 now carries a larger delta after the full rewire).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<verified_anchors>
All file:line anchors below were read from source during planning (2026-05-29).
Two brief anchors were corrected against the real tree:

- boot file path is `packages/g2-app/src/internal/boot-engine-core.ts`
  (NOT `packages/g2-app/src/engine/...`).
- raster-controller path is `packages/g2-app/src/raster/raster-controller.ts`
  (NOT `.../engine/...`).
- StatusHudLayer subscribes to THREE channels, not two:
  character.delta (line 198), r1.movement.budget (line 205), r1.action.economy
  (line 212); their unsub closures are `this.unsubscribe`, `this.unsubscribeMovement`,
  `this.unsubscribeEconomy` (called in destroy() at lines 290-292). rebind MUST cover all three.
- boot binds the following ws-bound sources (full audit — see Wave 1 risk note):
  INBOUND (addEventListener('message') on boot `ws`):
    createWsEventBus(ws,…) → statusHud.wsEvents (line 517),
    attachSceneInputToWs(ws, rasterController) → unsubSceneInput (line 522),
    attachR1EventSource(ws, gestureBus, layerManager, DEFAULT_R1_TIMINGS) → unsubR1 (line 568),
    attachConcConflictHandler(ws,…) → unsubConcConflict (line 693),
    attachReactionPromptHandler({ ws, … }) → detachReactionPrompt (line 707) — MISSED in v1,
    attachPortraitHandler(ws) → detachPortrait (line 721) — MISSED in v1,
    attachActionResultHandler(ws,…) → unsubActionResult (line 745),
    attachActionEconomyHandler(ws,…) → unsubActionEconomy (line 754).
  OUTBOUND (capture boot `ws` const + call .send()):
    perfProbe.wsSend (line 504-506: `ws.send(JSON.stringify(env))`),
    SlotPickerPanel (boot line 818 closure → slot-picker-panel.ts:261 `this.ws.send`),
    ActionOptionsModal × 2 (boot lines 839 + 867 closures → action-options-modal.ts:387).
  OUTBOUND via dispatchers (ws threaded through; panel constructed at envelope time):
    ConcentrationDropModalPanel (conc-conflict-dispatcher.ts:151 → concentration-drop-modal.ts:307/319/329),
    ReactionPromptPanel (reaction-prompt-dispatcher.ts:144 → reaction-prompt-panel.ts:257),
    TemplatePlacementPanel (template-placement-dispatcher.ts:140 → template-placement-panel.ts:208/225).
  NOT ws-bound (excluded from rewire): DebugMirror (boot:392 — HTTP POST via fetch, not ws),
    audio-capture (boot:968 startAudioCapture opens its OWN internal WS from bridgeUrl+bearer,
    self-managed lifecycle), capability-handshake (one-shot per (re)connect, not persistent).
- KEY CHURN-MINIMISER (verified): ALL 7 sender panels accept `ws` typed as a NARROW
  interface `{ send(data: string): void }` (ActionOptionsWebSocket l.146, SlotPickerWebSocket l.94,
  MoveDirectionPickerWebSocket l.137, ConcModalWebSocket l.92, TargetPickerWebSocket l.93,
  TemplatePanelWebSocket l.77, ReactionPanelWebSocket l.75). A stable `WsSender` holder with a
  `.send(data: string): void` method satisfies every one of these with ZERO constructor signature
  changes — we only change the VALUE passed at the construction call sites (boot closures), not the
  panel APIs. This is the lowest-churn path (holder satisfies the `{send}` shape several panels
  already accept — exploited here).
- DISPATCHER senders need NO holder: conc-conflict / reaction-prompt / template-placement are
  re-attached as INBOUND listeners against newWs; each one captures its `ws` param and passes it to
  the panel it constructs AT ENVELOPE TIME — so after the dispatcher is re-attached with newWs, every
  panel it spawns post-reconnect sends to newWs automatically. (No live instance survives a reconnect:
  a disconnect tears down the active overlay; even if one lingered, the holder/dispatcher swap covers
  the next dispatch.) MoveDirectionPicker + TargetPicker have NO live boot construction site (Phase 8/9
  `[A]`/`[M]` are console.warn stubs at boot:897/926) — when they are wired in a future phase they MUST
  receive the holder (documented in the risk note so the next author cannot regress).
- bridge-client field is `this._sessionId` (line 143), not `sessionId`. onclose at
  lines 278-293. _restGet signature at 526 takes optional `defaultValue?: T`; the three
  snapshot getters (getCharacterSnapshot 447, getCombatSnapshot 477, getSceneViewport 490)
  call _restGet with only TWO args → defaultValue is `undefined`, so a network throw
  returns `undefined as T` (lying about the `… | null` return type). Fix: pass `null`.
- debug-events: `id` is already `.int()` (line 42) — add `.min(1)`; `ts` at 44/102/107
  is bare `z.number()` — add `.int()`; layer-index `z` at line 88 is bare — add `.int()`.
- spell-lookup mass-cure-wounds is at line 158 with `level: 5` (data value CORRECT);
  it sits inside the level-3 grouping block → relocate the line into the L5 grouping +
  fix the surrounding block comment counts. SPELL_LOOKUP length must stay 70 (SKT-02).
- InvResult status union is `'green' | 'red' | 'skipped'` (line 48); checkInv5 at 318-366
  returns green on exit 0 even when zero COR- tests match (vitest exits 0 on "no tests found").
</verified_anchors>

<wave_1_risk_note>
## Wave 1 risk note — every ws-bound source enumerated, covered status

User chose the FULL fix (D-2026-05-29): after reconnect display + input + outbound
dispatch all work, AND repeated reconnects work. NOTHING is deferred (no source left
on the dead socket). The design splits ws-bound sources by their binding mechanism:

**Why holder for senders, re-attach for listeners (design justification):**
- OUTBOUND senders only ever call `.send(data)`. They capture a socket reference and
  never register listeners. The minimal-churn fix is to give them a STABLE object whose
  identity never changes but whose internal target socket is swapped on reconnect — a
  `WsSender` holder. On reconnect we call `holder.swap(newWs)`; NO re-attach, NO panel
  API change (the holder satisfies the existing `{ send(data:string):void }` shape).
- INBOUND listeners call `addEventListener('message', fn)` which binds to a SPECIFIC
  socket instance; a holder cannot redirect an already-registered listener. These MUST
  be disposed-and-re-attached against the concrete `newWs`. We keep each on a mutable
  unsub `let` so `onReconnected` can dispose-before-reattach and teardown calls the
  current value.

| ws-bound source                         | mechanism            | covered by              | status   |
|-----------------------------------------|----------------------|-------------------------|----------|
| perfProbe.wsSend (boot:504)             | OUTBOUND send        | WsSender holder swap     | COVERED  |
| SlotPickerPanel (boot:818)              | OUTBOUND send        | WsSender holder (passed) | COVERED  |
| ActionOptionsModal #1 (boot:839)        | OUTBOUND send        | WsSender holder (passed) | COVERED  |
| ActionOptionsModal #2 (boot:867)        | OUTBOUND send        | WsSender holder (passed) | COVERED  |
| createWsEventBus → statusHud (boot:517) | INBOUND (3 channels) | rebindWsEvents(newWs)    | COVERED  |
| attachSceneInputToWs (boot:522)         | INBOUND msg          | re-attach unsubSceneInput| COVERED  |
| attachR1EventSource (boot:568)          | INBOUND msg          | re-attach unsubR1        | COVERED  |
| attachConcConflictHandler (boot:693)    | INBOUND + spawns send | re-attach unsubConcConflict | COVERED |
| attachReactionPromptHandler (boot:707)  | INBOUND + spawns send | re-attach detachReactionPrompt | COVERED (was MISSED in v1) |
| attachPortraitHandler (boot:721)        | INBOUND msg          | re-attach detachPortrait | COVERED (was MISSED in v1) |
| attachActionResultHandler (boot:745)    | INBOUND msg          | re-attach unsubActionResult | COVERED |
| attachActionEconomyHandler (boot:754)   | INBOUND msg          | re-attach unsubActionEconomy| COVERED |
| ConcentrationDropModalPanel send        | spawned by dispatcher | dispatcher re-attached w/ newWs | COVERED |
| ReactionPromptPanel send                | spawned by dispatcher | dispatcher re-attached w/ newWs | COVERED |
| TemplatePlacementPanel send             | spawned by dispatcher | dispatcher re-attached w/ newWs | COVERED |
| MoveDirectionPicker / TargetPicker send | NO live boot site (Phase 8/9 stub) | holder when wired (documented) | N/A NOW / GUARDED |
| controller 'close' listener             | addEventListener     | re-arm on newWs (BLOCKER 1) | COVERED |
| DebugMirror (boot:392)                  | HTTP POST (fetch)    | — not ws-bound          | EXCLUDED |
| audio-capture (boot:968)                | own internal WS      | — self-managed lifecycle | EXCLUDED |
| capability-handshake                    | one-shot per connect | — re-run on each reconnect | EXCLUDED |

No source remains on a dead socket after reconnect, and no source is deferred.
</wave_1_risk_note>
</context>

<tasks>

<!-- ===================== WAVE 1 ===================== -->

<task type="auto" tdd="true">
  <name>Task 1 (Wave 1): R1 — WsSender holder + WsReconnectController onReconnected & repeated-reconnect close re-arm</name>
  <files>packages/g2-app/src/engine/ws-sender.ts, packages/g2-app/src/engine/ws-sender.test.ts, packages/g2-app/src/engine/ws-reconnect.ts, packages/g2-app/src/__tests__/ws-reconnect.test.ts</files>
  <behavior>
    WsSender holder (new file ws-sender.ts):
    - `new WsSender(ws)` exposes `.send(data: string): void` that delegates to the
      current target socket; identity of the holder is STABLE across swaps.
    - `.swap(newWs)` redirects the internal target so subsequent `.send` calls hit newWs.
    - Satisfies the structural `{ send(data: string): void }` shape (assignable to every
      panel WebSocket interface) — verified by a type-level assignment in the test.
    WsReconnectController (BLOCKER 1 + onReconnected):
    - onReconnected fires with the new live WebSocket on resume_replay.
    - onReconnected fires with the new live WebSocket on resume_full_snapshot.
    - In BOTH paths onReconnected fires BEFORE onChipUnmount.
    - resume_full_snapshot ordering preserved: seqTracker.reset() → onReconnected →
      onFullRefreshRequired → onChipUnmount.
    - resume_replay ordering: onReconnected → onChipUnmount.
    - onReconnected is optional (absent → no-op) — backward compatible.
    - REPEATED RECONNECTS (BLOCKER 1): after a successful reconnect, the 'close' listener
      is re-armed on newWs. Two sequential disconnects (original→ws2, then ws2→ws3) EACH
      trigger a countdown + reconnect attempt. (Today the 2nd disconnect is never detected.)
    - dispose() removes the 'close' listener from the CURRENT socket (currentWs), not the
      original opts.ws.
  </behavior>
  <action>
    NEW FILE ws-sender.ts: export class `WsSender` with `private target: { send(data: string): void }`,
    constructor `(ws: { send(data: string): void })`, method `send(data: string): void` delegating to
    `this.target.send(data)`, and method `swap(ws: { send(data: string): void }): void` reassigning
    `this.target`. Full JSDoc: "Stable outbound-socket holder. Panels/probes hold the WsSender, never a
    raw WebSocket, so a reconnect swaps the target via .swap(newWs) with no re-wiring (INV-4). Senders
    only need `.send`; this is why outbound uses a holder while inbound listeners re-attach."

    ws-reconnect.ts:
    1. BLOCKER 1 — repeated-reconnect close re-arm. Add `private currentWs: WebSocket = opts.ws;`
       (initialise from opts.ws). In the constructor, attach the close listener to `this.currentWs`
       (semantically equal to opts.ws at construction). In `_attemptReconnect` AFTER a successful
       handshake, BEFORE/around the resume listener attach (and before onReconnected fires), re-arm:
       `this.currentWs.removeEventListener('close', this._onClose as EventListener);
        this.currentWs = newWs;
        newWs.addEventListener('close', this._onClose as EventListener);`
       Change `dispose()` to `this.currentWs.removeEventListener('close', this._onClose as EventListener)`
       (NOT opts.ws). Update the dispose() + constructor JSDoc to say the listener is re-armed on the
       live socket each successful reconnect (repeated reconnects supported).
    2. onReconnected — add `readonly onReconnected?: (newWs: WebSocket) => void;` to
       WsReconnectControllerOpts (interface at line 59) with JSDoc: "fired with the now-live socket so
       the host can rebind persistent inbound listeners + swap the outbound WsSender; fires before
       onChipUnmount in both resume paths". In `_attachResumeListener`: resume_replay branch (line 293)
       call `this.opts.onReconnected?.(ws)` BEFORE `onChipUnmount()`. resume_full_snapshot branch
       (line 297) keep `seqTracker.reset()` first, then `this.opts.onReconnected?.(ws)` BEFORE
       `onFullRefreshRequired()` and `onChipUnmount()`. Do NOT change onFullRefreshRequired semantics.

    RED tests FIRST (commit RED then GREEN):
    - ws-sender.test.ts: send delegates to current target; swap redirects; identity stable;
      structural-assignability to a `{ send(data:string):void }` consumer.
    - ws-reconnect.test.ts (extend existing):
      (a) onReconnected fires with newWs before onChipUnmount on BOTH resume paths;
          full_snapshot still resets seqTracker first; absent callback is a no-op.
      (b) REPEATED RECONNECT: drive original close → reconnect to ws2 (resume_replay) → then fire
          'close' on ws2 → assert a second countdown + reconnect to ws3 occurs (fails today: the 2nd
          close is on a socket with no listener).
      (c) dispose() after a reconnect removes the close listener from the current socket (ws2), and a
          subsequent 'close' on ws2 does NOT start a countdown.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test -- --run ws-sender ws-reconnect</automated>
  </verify>
  <done>WsSender holder swaps target with stable identity + satisfies the panel `{send}` shape; onReconnected fires with newWs before onChipUnmount on both resume paths (full_snapshot resets seq first); the 'close' listener is re-armed on newWs so repeated reconnects each trigger a countdown; dispose() removes the listener from currentWs; ws-sender + ws-reconnect tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (Wave 1): R1 — StatusHudLayer.rebindWsEvents (rebind all 3 channels)</name>
  <files>packages/g2-app/src/status-hud/status-hud-layer.ts, packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts</files>
  <behavior>
    - rebindWsEvents(newWsEvents) drops the existing character.delta,
      r1.movement.budget, and r1.action.economy subscriptions (calls all three
      stored unsub closures) then re-subscribes the same three channels against
      newWsEvents, storing the new unsub closures.
    - No double-subscribe: subscriber count on the OLD source returns to 0 and the
      NEW source has exactly one subscriber per channel (assert via mock subscribe/unsub
      call counts).
    - After rebind, a character.delta on the NEW source updates the HUD; a delta on
      the OLD source is ignored.
    - destroy() after a rebind calls the NEW unsub closures (no leak of old or new).
  </behavior>
  <action>
    The three subscription unsub fields (this.unsubscribe line 139, this.unsubscribeMovement
    line 146, this.unsubscribeEconomy line 155) are currently `readonly`. Change them to
    mutable private fields. Extract the three subscribe calls (lines 198, 205, 212) into a
    private `subscribeWsEvents(src: CharacterDeltaEvents): void` helper that assigns the three
    unsub fields; call it from the constructor. Add public method
    `rebindWsEvents(newWsEvents: CharacterDeltaEvents): void` with JSDoc that calls the three
    current unsub closures (drop old subscriptions) then `this.subscribeWsEvents(newWsEvents)`.
    destroy() at lines 290-292 keeps calling the (now-current) three unsub fields. Write RED
    tests first (rebindWsEvents does not exist), then GREEN. Commit RED then GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test -- --run status-hud-layer</automated>
  </verify>
  <done>rebindWsEvents drops all 3 old subscriptions and re-subscribes against the new source with zero double-subscribe; old-source deltas ignored after rebind; destroy() disposes current closures; status-hud-layer tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3 (Wave 1): R1 — boot FULL rewire: WsSender holder for senders + re-attach ALL inbound (incl. reactionPrompt + portrait) on reconnect</name>
  <files>packages/g2-app/src/internal/boot-engine-core.ts, packages/g2-app/src/__tests__/boot-engine-reconnect-rewire.test.ts</files>
  <behavior>
    - After a simulated reconnect (resume_replay on newWs), an inbound envelope
      (frame_pixels / r1.gesture / character.delta / r1.reaction.available /
      r1.portrait.ready) arriving on newWs reaches its consumer, proving every inbound
      listener moved to newWs (including reactionPrompt + portrait, missed in v1).
    - Inbound envelopes arriving on the OLD (dead) socket after reconnect are NOT processed.
    - An OUTBOUND panel send (SlotPicker / ActionOptionsModal) after reconnect goes to
      newWs, NOT the dead socket — because the panel was given the WsSender holder and
      onReconnected called holder.swap(newWs).
    - perfProbe.wsSend writes to the holder/current socket after reconnect, not the dead one.
    - No double-subscribe / no leak: each inbound re-attach disposes the prior unsub first.
    - holder/currentWs is declared BEFORE perfProbe construction (ordering pinned, see action).
  </behavior>
  <action>
    ORDERING (pinned): immediately BEFORE the `const perfProbe = new PerfProbe({...})` construction
    (line 501), declare the stable outbound holder:
      `const wsSender = new WsSender(ws);`  (import WsSender from '../engine/ws-sender.js')
    Then change perfProbe.wsSend (line 504-506) from `ws.send(JSON.stringify(env))` to
    `wsSender.send(JSON.stringify(env))`. (The holder is the single outbound indirection; no separate
    `currentWs` variable is needed since every sender routes through the holder and inbound listeners
    receive the concrete newWs in onReconnected.)

    Convert each INBOUND unsub binding to a mutable `let` (so onReconnected can dispose-before-reattach
    and teardown calls the current value):
      `let unsubSceneInput = attachSceneInputToWs(ws, rasterController)` (522),
      `let unsubR1 = attachR1EventSource(ws, gestureBus, layerManager, DEFAULT_R1_TIMINGS)` (568),
      `let unsubConcConflict = attachConcConflictHandler(ws, …)` (693),
      `let detachReactionPrompt = attachReactionPromptHandler({ ws: ws as …, … })` (707),
      `let detachPortrait = attachPortraitHandler(ws as …)` (721),
      `let unsubActionResult = attachActionResultHandler(ws as …, …)` (745),
      `let unsubActionEconomy = attachActionEconomyHandler(ws as …, …)` (754).
    (Teardown at lines 1003-1062 already calls these by identifier, so converting to `let` keeps
    teardown correct with zero churn there.)

    Pass the holder to the OUTBOUND panel construction sites (NOT the raw ws):
      - SlotPickerPanel (boot:816-818): pass `wsSender as unknown as ConstructorParameters<typeof SlotPickerPanel>[1]`
        in place of the `ws as …` arg (holder satisfies SlotPickerWebSocket `{send}`).
      - ActionOptionsModal #1 (boot:837-839) and #2 (boot:865-867): pass `wsSender as unknown as
        ConstructorParameters<typeof ActionOptionsModal>[1]` in place of the `ws as …` arg.
      Dispatcher-spawned senders (conc-conflict, reaction-prompt, template-placement) need NO change:
      they are re-attached as inbound listeners with newWs (below), so panels they spawn post-reconnect
      send to newWs automatically.

    Pass `onReconnected: (newWs) => { ... }` to the WsReconnectController opts (line 536 block). The
    handler MUST, in order:
      1. wsSender.swap(newWs);  // every outbound sender (perfProbe + panels) now targets newWs
      2. dispose + re-attach each INBOUND source against newWs (dispose-before-reattach, all 7):
         unsubSceneInput(); unsubSceneInput = attachSceneInputToWs(newWs, rasterController);
         unsubR1(); unsubR1 = attachR1EventSource(newWs, gestureBus, layerManager, DEFAULT_R1_TIMINGS);
         unsubConcConflict(); unsubConcConflict = attachConcConflictHandler(newWs, …same args…);
         detachReactionPrompt(); detachReactionPrompt = attachReactionPromptHandler({ ws: newWs as …, …same args… });
         detachPortrait(); detachPortrait = attachPortraitHandler(newWs as …);
         unsubActionResult(); unsubActionResult = attachActionResultHandler(newWs as …, toastQueue, effectiveLocale, currentUserId);
         unsubActionEconomy(); unsubActionEconomy = attachActionEconomyHandler(newWs as …, currentUserId);
      3. statusHud.rebindWsEvents(createWsEventBus(newWs, seqTracker, perfProbe));
    seqProvider already reads seqTracker (no rebind). Note: reaction-prompt + portrait are added here
    (the two inbound sources missed in v1). Add a short JSDoc/comment on the onReconnected handler
    explaining holder-swap (senders) vs re-attach (listeners) per the Wave 1 risk note.

    RED test FIRST (boot-engine-reconnect-rewire.test.ts), then GREEN. Use the existing wsFactory/deps
    injection to drive a reconnect and assert:
      (i) an r1.gesture on newWs reaches gestureBus, and an r1.gesture on the OLD socket does not;
      (ii) a reaction-prompt (r1.reaction.available) + portrait (r1.portrait.ready) envelope on newWs
           is handled (regression guard for the v1 miss);
      (iii) after holder.swap, a wsSender.send (or a panel constructed with the holder) writes to newWs
            not the dead socket.
    If the boot harness cannot drive a full reconnect for a given assertion, fall back to asserting the
    onReconnected wiring re-binds/swaps (Tasks 1+2 unit coverage is the primary guarantee for the
    controller + holder mechanics). Commit RED then GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test -- --run boot-engine-reconnect-rewire</automated>
  </verify>
  <done>onReconnected swaps the WsSender holder (perfProbe + SlotPicker + both ActionOptionsModal route to newWs) AND re-attaches all 7 inbound sources (incl. reactionPrompt + portrait) + the wsEvents bus to newWs; post-reconnect inbound envelopes on newWs reach consumers; old-socket envelopes ignored; outbound sends hit newWs; holder declared before perfProbe; no double-subscribe; boot reconnect-rewire tests green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Wave 1 R1 FULL reconnect rewire — WsSender holder (outbound senders), onReconnected callback + repeated-reconnect close re-arm (ws-reconnect), rebindWsEvents (status-hud), boot rewire swapping the holder + re-attaching all 7 inbound sources (incl. reactionPrompt + portrait) + wsEvents bus to newWs.</what-built>
  <how-to-verify>
    Software gate (automated, run now):
      1. `pnpm --filter @evf/g2-app test -- --run` → green, test count grew (Wave 1 delta is larger now).
      2. `pnpm typecheck && pnpm lint:ci` → exit 0.
    Hardware gate (DEFERRED — no hardware in this session):
      Live END-TO-END reconnect on real G2 + R1 over a real (flaky) connection — drop the bridge
      socket mid-session, confirm display + input + outbound ACTION dispatch all resume on the glasses
      without reload, AND that a SECOND disconnect also recovers (repeated reconnect). This is
      HARDWARE-DEFERRED, consistent with the established defer-hardware-tests carry pattern. The
      software tests use mock sockets + holder.swap; the unit + boot coverage above is the software-side
      guarantee for the rewire logic.
  </how-to-verify>
  <resume-signal>Type "approved" to proceed to Wave 2, or describe issues.</resume-signal>
</task>

<!-- ===================== WAVE 2 ===================== -->

<task type="auto" tdd="true">
  <name>Task 4 (Wave 2): R2 — raster-controller worker.onerror fatal handler</name>
  <files>packages/g2-app/src/raster/raster-controller.ts, packages/g2-app/src/raster/raster-controller.test.ts</files>
  <behavior>
    - On worker.onerror: every pending entry in this.pending settles with an
      error-shaped response (not left hanging), and the map is cleared.
    - If this.pendingPayload is non-null, its resolver also settles with the error
      shape, and pendingPayload is reset to null.
    - A console.error is emitted.
    - Promises that were awaiting requestFrame REJECT/RESOLVE (no permanent hang).
  </behavior>
  <action>
    In the constructor, after assigning `this.worker.onmessage` (line 140), add
    `this.worker.onerror = (ev): void => { … }`. The handler must iterate this.pending,
    settle each resolver with the same error-shaped response the existing failure path
    uses (match the shape used at line 162 / response handling at 267-274 — use the
    controller's existing error response shape, do NOT invent a new one), then
    `this.pending.clear()`; if `this.pendingPayload !== null`, settle its resolver and set
    `this.pendingPayload = null`; then `console.error('[raster-controller] worker fatal error', ev)`.
    The WorkerLike type (line 57) only declares `onmessage` — add an optional
    `onerror: ((ev: unknown) => void) | null;` to it so tests can trigger it via the mock.
    Add JSDoc. Write a RED test (mock worker fires onerror with pending entries → all settle),
    then GREEN. Commit RED then GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test -- --run raster-controller</automated>
  </verify>
  <done>worker.onerror settles all pending + pendingPayload with the existing error shape, clears the map, logs console.error; no permanent hang; raster-controller tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5 (Wave 2): R3 — combat-action-tracker deleteCombat cleanup (mirror FIX E)</name>
  <files>packages/foundry-module/src/write-path/combat-action-tracker.ts, packages/foundry-module/src/write-path/combat-action-tracker.test.ts</files>
  <behavior>
    - On deleteCombat: _state.clear() AND _attackIdSeen.clear() both run.
    - deleteCombat handler NEVER returns false (void return, wrapped in try/catch
      that console.warns on throw — mirror combat-movement-tracker FIX E exactly).
    - The unsubscribe closure now also calls Hooks.off(deleteCombatHookId) alongside
      the existing createChatHookId + updateCombatHookId offs.
  </behavior>
  <action>
    Inside registerCombatActionTracker (line 177), after the updateCombat hook block
    (ends line 298), add a deleteCombat subscriber following combat-movement-tracker.ts
    lines 290-298 EXACTLY: `const deleteCombatHookId = Hooks.on('deleteCombat',
    (..._args: unknown[]): void => { try { _state.clear(); _attackIdSeen.clear(); }
    catch (err) { console.warn('[combat-action-tracker] deleteCombat handler threw', err); } });`.
    Update the JSDoc (lines ~162-176) to list the third hook and the third Hooks.off in the
    returned closure. Add `Hooks.off(deleteCombatHookId);` to the unsubscribe closure (currently
    lines 301-304). Write a RED test (accumulate _state/_attackIdSeen, fire deleteCombat, assert
    both cleared) — fails against current code (no deleteCombat handler) — then GREEN.
    Commit RED then GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module test -- --run combat-action-tracker</automated>
  </verify>
  <done>deleteCombat clears _state + _attackIdSeen, never returns false, hookId offed in unsubscribe; combat-action-tracker tests green.</done>
</task>

<!-- ===================== WAVE 3 ===================== -->

<task type="auto" tdd="true">
  <name>Task 6 (Wave 3): R-longpress — header-aware item mapping in spellbook + inventory long-press</name>
  <files>packages/g2-app/src/panels/spellbook-panel.ts, packages/g2-app/src/panels/inventory-panel.ts, packages/g2-app/src/panels/spellbook-panel.test.ts, packages/g2-app/src/panels/inventory-panel.test.ts</files>
  <behavior>
    - In a multi-section spellbook (cantrips header + cantrip rows + level-1 header +
      level-1 spell rows …), a long-press after scrolling past a section header
      dispatches the spell visually under the cursor, NOT the wrong array element.
    - Same for inventory if/when it has section structure; at minimum the flat case
      stays correct (regression guard).
    - Empty list / out-of-range cursor → no-op (existing behavior preserved).
  </behavior>
  <action>
    Root cause (verified): the render builds an interleaved `allRows` array
    (filter bar + section headers + item rows) and scrolls by content-ROW index
    (spellbook line 289 JSDoc "First visible content row index", render 295-346;
    inventory analogous), but the long-press handlers (spellbook 591-593, inventory
    571-573) index the FLAT `spells`/`inventory` array with `this.scrollOffset` directly —
    so headers shift the mapping. FIX: build a parallel row→item map alongside `allRows`
    in the render path (push `null` for header/blank/filter rows, the item ref for item rows),
    store it on the instance (e.g. `private rowItemMap: (Spell|null)[]` / `(Item|null)[]`),
    and in the long-press handler resolve the selected item from that map at the current
    cursor row (the same clampedOffset the render uses). If the cursor row maps to null
    (header/blank), pick the nearest following item row, or no-op if none. Reuse the existing
    row-building helpers (renderLevelSection / the cantrip+level loops) so the map cannot drift
    from the rendered rows. Add JSDoc on the new field/mapping. Write RED tests first
    (multi-section list, long-press after a header offset asserts the correct dnd5eId/item id),
    then GREEN. Commit RED then GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test -- --run spellbook-panel inventory-panel</automated>
  </verify>
  <done>long-press dispatches the visually-correct item across section headers in both panels; flat-list regression preserved; empty/out-of-range → no-op; panel tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 7 (Wave 3): shared-protocol schema bounds — d20 + debug-events</name>
  <files>packages/shared-protocol/src/payloads/action-result.ts, packages/shared-protocol/src/debug/debug-events.ts, packages/shared-protocol/test/* (co-located or test dir per package convention)</files>
  <behavior>
    - action-result d20 (line 138): rejects 0, 21, -1; accepts 1, 20, and null.
    - debug-events id (line 42): rejects 0; accepts 1 (keeps .int()).
    - debug-events ts fields (lines 44, 102, 107) reject non-integer (e.g. 1.5).
    - debug-events layer-index z (line 88) rejects non-integer.
    - All other existing debug-events validations unchanged.
  </behavior>
  <action>
    action-result.ts:138 — `d20: z.number().int().nullable()` →
    `d20: z.number().int().min(1).max(20).nullable()`. Keep the JSDoc.
    debug-events.ts: `id` (line 42) `z.number().int()` → `z.number().int().min(1)`;
    `ts` at lines 44, 102, 107 `z.number()` → `z.number().int()`; layer-index `z`
    at line 88 `z.number().optional()` → `z.number().int().optional()`. Find the package's
    test convention (check for existing *.test.ts beside these files or a test/ dir) and add
    a RED test per bound (reject out-of-range / non-int), then GREEN. Commit RED then GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @evf/shared-protocol test -- --run</automated>
  </verify>
  <done>d20 bounded [1,20] nullable; debug-events id >=1, ts + z integer; out-of-range rejected; shared-protocol tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 8 (Wave 3): foundry-mcp + reader data/logic fixes (spell-level, bridge-client, range-0)</name>
  <files>packages/foundry-mcp/src/voice/spell-lookup.ts, packages/foundry-mcp/src/tools/bridge-client.ts, packages/foundry-module/src/readers/character-reader.ts, plus their co-located test files</files>
  <behavior>
    - spell-lookup: no entry's level disagrees with its grouping comment block;
      specifically mass-cure-wounds.level === 5 and it lives in the L5 group;
      SPELL_LOOKUP length stays 70 (SKT-02 gate).
    - bridge-client: getCharacterSnapshot/getCombatSnapshot/getSceneViewport return
      `null` (not undefined) on network failure.
    - bridge-client: when onclose fires before handshake (!_sessionId), the 4001 /
      other-close branch does NOT also run (early return after resolve()).
    - character-reader: a spell with range.value === 0 and a non-self/non-touch unit
      emits "--" (not "0m"); a spell with range.value > 0 still emits "{value}m".
  </behavior>
  <action>
    spell-lookup.ts: move the `mass-cure-wounds` line (currently line 158, inside the
    level-3 grouping) into the level-5 grouping block; keep `level: 5` (data value is
    already correct). Fix any block-comment counts around the L3/L5 groups so comments match
    contents. Do NOT add/remove entries — length must remain 70.
    bridge-client.ts: pass `null` as the third `_restGet` arg in the three snapshot getters
    (getCharacterSnapshot 452 + 463, getCombatSnapshot 478, getSceneViewport 491) so a network
    throw returns null per the `… | null` return type. In ws.onclose (lines 278-293), add
    `return;` immediately after the `resolve();` inside `if (!this._sessionId) { … }` (line 282)
    so a pre-handshake close does not fall through to the 4001/other-close branch.
    character-reader.ts: at the range extraction (lines 222-227), change the guard so the
    numeric branch only fires for a positive number — replace the `rangeValue !== ''` shape with
    `typeof rangeValue === 'number' && rangeValue > 0 ? `${rangeValue}m` : '--'` (preserve the
    self/touch unit short-circuit above it). Add a RED test per fix (level/comment consistency
    or mass-cure level===5; network-failure returns null + pre-handshake close no-fallthrough;
    range value:0 → "--"), then GREEN. Commit RED then GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-mcp test -- --run && pnpm --filter @evf/foundry-module test -- --run character-reader</automated>
  </verify>
  <done>mass-cure-wounds in L5 group, SPELL_LOOKUP length 70; snapshot getters return null on failure; pre-handshake onclose early-returns; range-0 → "--"; affected tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 9 (Wave 3): INV-5 false-pass — detect "no tests" and return skipped</name>
  <files>packages/validation-harness/src/inv-suite.ts, packages/validation-harness/src/inv-suite.test.ts</files>
  <behavior>
    - When the COR- vitest run exits 0 but stdout/stderr indicates no matching tests
      ("no test files found" / "0 tests" / "No test files"), checkInv5 returns
      status 'skipped' (NOT 'green').
    - When COR- tests run and pass (exit 0, tests > 0), and the hook anchor is present,
      checkInv5 still returns 'green'.
    - When COR- tests fail (exit != 0), checkInv5 still returns 'red'.
  </behavior>
  <action>
    checkInv5 (lines 318-366) currently only inspects exitCode. runSpawn returns stderr;
    capture stdout too (extend the runSpawn destructure to include stdout if available — verify
    runSpawn's return shape and add stdout capture if needed). After the `exitCode !== 0` red
    branch, before the green return, add a guard: if combined stdout/stderr matches a
    no-tests-found pattern (case-insensitive, e.g. /no test files found|no tests found|0 tests\b/),
    return `{ id: 'INV-5', status: 'skipped', detail: 'no COR- tests matched — skipped (not green)' }`.
    'skipped' is already in the InvStatus union (line 48). Write a RED test mocking runSpawn to
    return exit 0 + stdout "No test files found" → expects 'skipped' (fails today: returns green),
    then GREEN. Commit RED then GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @evf/validation-harness test -- --run inv-suite</automated>
  </verify>
  <done>checkInv5 returns 'skipped' on no-tests-found, 'green' on real pass, 'red' on failure; validation-harness tests green.</done>
</task>

<task type="auto">
  <name>Task 10 (Wave 3 exit): full gates + multi-package patch changeset</name>
  <files>.changeset/*.md</files>
  <action>
    Run the full workspace gates: `pnpm typecheck`, `pnpm lint:ci`, `pnpm test:coverage`.
    All must exit 0 and coverage stay >= 80%. Add a single patch-level changeset
    (`pnpm changeset`) marking @evf/g2-app, @evf/foundry-module, @evf/shared-protocol,
    @evf/foundry-mcp, @evf/validation-harness as patch, summarizing the review fixes
    (R1 FULL reconnect rewire — holder swap + repeated-reconnect close re-arm + all-inbound
    re-attach incl. reactionPrompt/portrait, R2 worker error, R3 deleteCombat, long-press
    mapping, schema bounds, spell-level, bridge-client null/return, range-0, INV-5 skipped).
    Then `pnpm changeset:status` must show the changeset declared since main.
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint:ci && pnpm test:coverage && pnpm changeset:status</automated>
  </verify>
  <done>All workspace gates green, coverage >= 80%, one multi-package patch changeset declared.</done>
</task>

</tasks>

<verification>
## Three software gates (every wave exit + final)
- `pnpm typecheck` → exit 0
- `pnpm lint:ci` → exit 0
- `pnpm test:coverage` → exit 0, coverage >= 80%

## Test delta
Baseline 2815 tests green. Each fix adds RED→GREEN tests:
- R1 (FULL): WsSender holder (~3-4), ws-reconnect onReconnected + repeated-reconnect re-arm + dispose-currentWs (~4-6),
  status-hud rebind (~2-3), boot full rewire incl. reactionPrompt+portrait + holder-swap (~3-5)
- R2: raster worker onerror (~1-2)
- R3: combat-action-tracker deleteCombat (~1)
- Tier 3: long-press mapping (~2-4), schema bounds (~4-6), spell-level (~1-2),
  bridge-client null+return (~2-3), range-0 (~1-2), INV-5 skipped (~1-2)
Estimated delta (larger now after the FULL R1 fix): +25 to +40 tests
(target final ~2840-2855). Final count must exceed 2815.

## Invariant / policy gates
- CI Gate 8: socketlib handler count = 17. No task adds or removes a socketlib handler
  (the WsSender holder + reconnect rewire are pure g2-app client plumbing; verify no
  `executeAsGM`/`socketlib.register*` added). Re-confirm at final gate.
- ADR-0011: no `activity.use(` introduced in packages/g2-app or packages/bridge. The
  WsSender holder ONLY wraps `ws.send` of EXISTING envelopes (tool.invoke/confirm) — it
  never constructs or calls activity.use. The ADR-0011 guard ignores doc-comment mentions.
- INV-4: zero dead/unreachable code; JSDoc on every new public API
  (WsSender class + send/swap, onReconnected opt, currentWs re-arm, rebindWsEvents,
  subscribeWsEvents helper, worker onerror, rowItemMap field). No `// TODO` without
  (#issue) or (ADR-NNNN).
- INV-3 not triggered: no version/phase/library/spec cross-cutting change in this task.

## Backward compatibility
- WsSender is a NEW additive class; existing callers that still pass a raw WebSocket are
  unaffected (panels accept the structural `{send}` shape — holder is assignable, raw ws
  still assignable).
- onReconnected is optional → existing WsReconnectController callers unaffected.
- The 'close' re-arm uses `currentWs` initialised to opts.ws — first reconnect behaves
  identically to before; only the SECOND+ reconnect is newly supported.
- rebindWsEvents is additive → StatusHudLayer constructor + destroy() unchanged.
- Re-attaching reactionPrompt + portrait on reconnect is additive (they were never
  rebound before → strictly more correct, no valid prior path regresses).
- worker.onerror is additive; WorkerLike gains an optional field.
- deleteCombat handler is additive; unsubscribe closure superset of prior behavior.
- Schema tightenings reject previously-invalid values only (d20 outside 1-20, non-int
  ts/z, id 0) — no valid payload regresses.
- bridge-client null defaultValue makes the return type honest (was lying with undefined).
- DebugMirror (HTTP), audio-capture (own WS), capability-handshake (one-shot) are NOT
  ws-bound and are deliberately left untouched.

## Hardware-deferred (NOT a blocker)
- R1 LIVE end-to-end reconnect on real G2 + R1 ring over a real flaky connection — socket
  drop → on-glasses resume of display + input + outbound ACTION dispatch without reload,
  AND a SECOND disconnect also recovers (repeated reconnect) — is HARDWARE-DEFERRED per the
  established defer-hardware-tests carry pattern. Software tests use mock sockets + holder.swap;
  the unit + boot mock-socket coverage above is the software guarantee for the rewire logic.
</verification>

<success_criteria>
- All 10 tasks complete, each fix landed as atomic RED→GREEN Conventional Commits.
- 3 software gates green at each wave exit and final.
- Test count > 2815, coverage >= 80%.
- CI Gate 8 socketlib = 17 preserved; ADR-0011 clean; INV-4 clean (JSDoc + no dead code).
- One multi-package patch changeset declared (changeset:status green).
- R1 reconnect (FULL): (1) the 'close' listener re-arms on newWs so REPEATED reconnects
  each recover; (2) ALL outbound senders (perfProbe + SlotPicker + both ActionOptionsModal)
  route through the WsSender holder swapped on reconnect → player can ACT after reconnect;
  (3) ALL inbound listeners (sceneInput, R1, concConflict, reactionPrompt, portrait,
  actionResult, actionEconomy, wsEvents bus) re-attach to newWs → player can SEE + receive
  prompts after reconnect; (4) no source left on the dead socket; no double-subscribe/leak.
- Stays on branch develop; no new branch.
</success_criteria>

<output>
Atomic commits on develop (no PLAN-tracking SUMMARY required for quick tasks; STATE.md
note optional). Each fix: `test(...)` RED commit then `fix(...)`/`feat(...)` GREEN commit,
scoped to the touched package. Final `chore(*): patch changeset for review fixes`.
</output>
</output>
