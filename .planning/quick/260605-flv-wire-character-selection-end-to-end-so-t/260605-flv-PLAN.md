---
phase: quick-260605-flv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared-protocol/src/handshake.ts
  - packages/shared-protocol/test/handshake.test.ts
  - packages/bridge/src/ws/session-store.ts
  - packages/bridge/src/ws/handshake.ts
  - packages/bridge/src/ws/initial-snapshot.ts
  - packages/bridge/src/ws/delta-emitter.ts
  - packages/bridge/src/server.ts
  - packages/bridge/test/ws/session-store.test.ts
  - packages/bridge/test/ws/handshake.test.ts
  - packages/bridge/test/ws/initial-snapshot.test.ts
  - packages/bridge/test/ws/delta-emitter.test.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/engine/capability-handshake.ts
  - packages/g2-app/src/internal/launch.ts
  - packages/g2-app/test/internal/launch.test.ts
  - packages/g2-app/test/engine/capability-handshake.test.ts
autonomous: true
requirements: [FLV-CHAR-SELECT]
must_haves:
  truths:
    - "A g2-app client can declare which PC it wants via the handshake actorId field"
    - "The bridge persists the selected actor on the session as selectedActorId"
    - "The on-connect initial character.delta serves the selected actor, not always characters[0]"
    - "A session that selected actorX never receives character.delta envelopes for actorY"
    - "g2-app resolves the actor from ?actor= URL param > Tier3 characterId > undefined and threads it to the handshake"
  artifacts:
    - path: packages/shared-protocol/src/handshake.ts
      provides: "actorId optional field on HandshakeClientSchema + inferred type"
      contains: "actorId"
    - path: packages/bridge/src/ws/session-store.ts
      provides: "selectedActorId on Session + createSession param"
      contains: "selectedActorId"
    - path: packages/bridge/src/ws/delta-emitter.ts
      provides: "per-session character.delta actor targeting"
      contains: "selectedActorId"
    - path: packages/g2-app/src/internal/boot-engine-core.ts
      provides: "characterId on BootEngineOpts threaded to handshake"
      contains: "characterId"
  key_links:
    - from: packages/bridge/src/ws/handshake.ts
      to: packages/bridge/src/ws/session-store.ts
      via: "createSession(token, locale, caps, client.actorId)"
      pattern: "createSession\\("
    - from: packages/bridge/src/server.ts
      to: packages/bridge/src/ws/initial-snapshot.ts
      via: "pass sessionStore.getSession(sessionId)?.selectedActorId"
      pattern: "selectedActorId"
    - from: packages/g2-app/src/internal/launch.ts
      to: packages/g2-app/src/engine/capability-handshake.ts
      via: "characterId → BootEngineOpts → performCapabilityHandshake actorId"
      pattern: "characterId"
---

<objective>
Wire end-to-end character selection so the user's chosen PC renders on the glasses HUD instead of always `characters[0]`.

The wizard already persists the chosen PC's id to Tier3 `SessionSchema.characterId`, but that value dies there: `BootEngineOpts` has no field for it, `launchApp` never reads it, the handshake envelope carries no actor selector, and the bridge `pushInitialCharacterDelta` unconditionally uses `roster.characters[0]`. Separately, `emitDelta` fans every `character.delta` to ALL `read_char` sessions, so per-player selection would leak other players' character updates.

This plan closes the loop across three packages with a single additive wire: a new optional `actorId` handshake field carried from g2-app → bridge session → initial snapshot + per-session delta targeting.

Purpose: deliver the core value — the player sees THEIR character, and only theirs, glanceable on the G2 HUD.
Output: additive `actorId`/`selectedActorId`/`characterId` field threaded through shared-protocol, bridge, and g2-app, plus per-session `character.delta` targeting.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Wire surfaces (read each once, extract field shapes + signatures)
@packages/shared-protocol/src/handshake.ts
@packages/bridge/src/ws/session-store.ts
@packages/bridge/src/ws/handshake.ts
@packages/bridge/src/ws/initial-snapshot.ts
@packages/bridge/src/ws/delta-emitter.ts
@packages/g2-app/src/internal/boot-engine-core.ts
@packages/g2-app/src/engine/capability-handshake.ts
@packages/g2-app/src/internal/launch.ts
@packages/g2-app/src/wizard/tier3-storage.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: shared-protocol actorId + bridge session/selection plumbing</name>
  <files>packages/shared-protocol/src/handshake.ts, packages/shared-protocol/test/handshake.test.ts, packages/bridge/src/ws/session-store.ts, packages/bridge/src/ws/handshake.ts, packages/bridge/test/ws/session-store.test.ts, packages/bridge/test/ws/handshake.test.ts</files>
  <behavior>
    - shared-protocol: HandshakeClientSchema.safeParse of a payload WITHOUT actorId still succeeds (additive/optional — existing clients unaffected).
    - shared-protocol: HandshakeClientSchema.safeParse of a payload WITH actorId:"6KWxQXAiJgz4zKlS" succeeds and parsed.actorId === that value.
    - shared-protocol: actorId:"" (empty string) fails validation (min(1)). HandshakeClient inferred type exposes `actorId?: string`.
    - bridge SessionStore.createSession(token, locale, caps) (no 4th arg) yields session.selectedActorId === undefined (back-compat).
    - bridge SessionStore.createSession(token, locale, caps, "actorX") yields session.selectedActorId === "actorX".
    - bridge handshake first-connect: a handshake message carrying actorId="actorX" produces a session whose selectedActorId === "actorX".
    - bridge handshake reconnect-not-found (session_id present but expired) with actorId="actorY" → new session selectedActorId === "actorY".
    - bridge handshake reconnect-found: existing session's selectedActorId is preserved (NOT overwritten / cleared) even if the reconnect handshake omits actorId.
  </behavior>
  <action>
In shared-protocol handshake.ts add `actorId: z.string().min(1).optional()` to HandshakeClientSchema (placed after `capabilities`, before/after `session_id` — additive). Update the JSDoc field list to document `actorId` as "Optional selected PC actor id (bridge domain); when set the bridge pins this session's character.delta to that actor." The inferred `HandshakeClient` type updates automatically via z.infer — no manual type edit.

In session-store.ts add `selectedActorId?: string` to the `Session` interface with a TSDoc line ("Selected PC actor id pinned for this session; when set, only character.delta envelopes for this actor are delivered (per FLV-CHAR-SELECT). undefined = no pin (last-write-wins roster[0])."). Add an optional 4th param `selectedActorId?: string` to `createSession`, and set `selectedActorId` on the constructed Session object (use a conditional spread or assign only when defined to satisfy exactOptionalPropertyTypes). Update the createSession TSDoc.

In handshake.ts (bridge) thread `client.actorId` into BOTH createSession call sites:
- first-connect path (~line 144): `sessionStore.createSession(client.token, client.locale, intersection, client.actorId)`
- reconnect-not-found path (~line 137): same 4-arg call with `client.actorId`
- reconnect-found path (~line 131): do NOT modify the existing session's selectedActorId — leave the found session untouched (this preserves the prior pin per the spec).

Write the failing tests FIRST in the three test files (shared-protocol handshake.test.ts, bridge session-store.test.ts, bridge handshake.test.ts) covering every bullet in &lt;behavior&gt;. Follow existing test setup patterns in those files (token-cache mocks, socket mock for handshake). Add TSDoc only on the changed public surfaces (HandshakeClient field, createSession, Session.selectedActorId) per INV-4. No dead code.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/shared-protocol exec vitest run && corepack pnpm --filter @evf/bridge exec vitest run test/ws/session-store.test.ts test/ws/handshake.test.ts</automated>
  </verify>
  <done>actorId is optional on HandshakeClientSchema; Session carries selectedActorId; createSession accepts it; bridge handshake sets it on first-connect and reconnect-not-found and preserves it on reconnect-found. All new + existing shared-protocol and session-store/handshake tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: bridge initial-snapshot honors selection + per-session character.delta targeting</name>
  <files>packages/bridge/src/ws/initial-snapshot.ts, packages/bridge/src/ws/delta-emitter.ts, packages/bridge/src/server.ts, packages/bridge/test/ws/initial-snapshot.test.ts, packages/bridge/test/ws/delta-emitter.test.ts</files>
  <behavior>
    - pushInitialCharacterDelta with selectedActorId="actorX" present in roster → foundryFn called with ("evf.getCharacterSnapshot", "actorX", token); the delta is for actorX, not roster[0].
    - pushInitialCharacterDelta with selectedActorId undefined → falls back to roster.characters[0].actorId (unchanged legacy behavior; existing tests still pass).
    - pushInitialCharacterDelta with selectedActorId set to an id NOT in the roster → still fetches that id via foundryFn (the dog cache serves any pushed actorId); graceful no-op only if foundryFn returns null.
    - emitDelta('character.delta', {actorId:"actorX", ...}): session A (selectedActorId="actorX") receives it; session B (selectedActorId="actorY") does NOT; session C (selectedActorId undefined) receives it (broadcast fallback).
    - emitDelta('character.delta', payload WITHOUT an actorId field): all read_char sessions receive it regardless of their selectedActorId (fall back to current broadcast — no actorId on payload means cannot target).
    - emitDelta('combat.turn', ...) and every non-character.delta type: targeting logic is NOT applied — fanout identical to before (existing delta-emitter tests unchanged).
    - The read_char cap gate still applies first: a session without read_char receives nothing for character.delta regardless of actor match.
    - seq allocation behavior unchanged (globalSeq increments once per emitDelta call as today).
  </behavior>
  <action>
In initial-snapshot.ts add an optional `selectedActorId?: string` field to `PushInitialCharacterDeltaArgs` (TSDoc: "When set, the session's pinned actor; selects this actor instead of roster[0]."). In `pushInitialCharacterDelta`, change Step 1 actor resolution to `const actorId = selectedActorId ?? roster.characters[0]?.actorId;`. Keep all existing guards (cold/empty roster still no-ops only when there is no resolvable actor AND no selectedActorId; if selectedActorId is set but roster is empty, you MAY still fetch it — but to stay minimal and match &lt;behavior&gt;, resolve `selectedActorId ?? roster[0]` AFTER the roster null/empty guard only when selectedActorId is undefined; if selectedActorId IS set, skip the roster-empty early-return and fetch the pinned id directly). Update the function + module TSDoc to document the selection precedence.

In server.ts (~line 634) the call site already reads `const session = sessionStore.getSession(sessionId)`; pass `selectedActorId: session?.selectedActorId` into the `pushInitialCharacterDelta({...})` args object.

In delta-emitter.ts add character.delta targeting INSIDE the per-session loop of `emitDelta`, AFTER the existing cap check, BEFORE building the envelope. Implement a narrow gate that ONLY filters when all three are present: `type === 'character.delta'` AND the session has `selectedActorId` AND the payload has a string `actorId`. Only then, `continue` (skip) when `session.selectedActorId !== payload.actorId`. If any of the three is absent → do nothing (current broadcast behavior preserved). Read payload.actorId defensively: `const payloadActorId = (typeof payload === 'object' && payload !== null && 'actorId' in payload && typeof (payload as { actorId?: unknown }).actorId === 'string') ? (payload as { actorId: string }).actorId : undefined;`. Do NOT apply this to sendInitialToSession (it already targets a single session) and do NOT touch any non-character.delta path. Update the emitDelta TSDoc to note the additive character.delta actor gate.

Write failing tests FIRST. In delta-emitter.test.ts add a describe block for character.delta targeting using three registered sessions with selectedActorId variations (set via createSession 4th arg from Task 1) and assert send counts per session. Verify the existing emitDelta tests still pass (they use payloads/types that do NOT trigger the new gate, or sessions without selectedActorId). In initial-snapshot.test.ts add cases for selectedActorId set / unset / not-in-roster. Reuse existing mock harnesses (mock ws, mock SessionStore/DeltaEmitter, vi.fn foundryFn). INV-4: real assertions on actorId passed to foundryFn and on per-session send calls; no dead code.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/bridge exec vitest run test/ws/initial-snapshot.test.ts test/ws/delta-emitter.test.ts</automated>
  </verify>
  <done>pushInitialCharacterDelta uses selectedActorId ?? roster[0]; server.ts passes the session's selectedActorId; emitDelta only delivers character.delta to a session when its selectedActorId is unset or matches payload.actorId, with all three-present gate guarding the new path; non-character.delta fanout and existing tests unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: g2-app threads characterId → handshake actorId (URL ?actor= > Tier3 > undefined)</name>
  <files>packages/g2-app/src/engine/capability-handshake.ts, packages/g2-app/src/internal/boot-engine-core.ts, packages/g2-app/src/internal/launch.ts, packages/g2-app/test/engine/capability-handshake.test.ts, packages/g2-app/test/internal/launch.test.ts</files>
  <behavior>
    - performCapabilityHandshake(ws, token, locale, sessionId, timeoutMs, actorId="actorX") sends a client envelope whose JSON includes `"actorId":"actorX"`.
    - performCapabilityHandshake called WITHOUT actorId sends an envelope with NO actorId key (exactOptionalPropertyTypes-clean; existing handshake tests unaffected).
    - _bootEngineCore passes `opts.characterId` through to performCapabilityHandshake as the actorId arg (both the initial handshake ~line 530 and the reconnect handshake ~line 953).
    - launchApp no-auth dev branch: with `?actor=6KWxQXAiJgz4zKlS` in the URL, bootEngine is called with characterId === "6KWxQXAiJgz4zKlS".
    - launchApp no-auth dev branch: with NO ?actor= param, bootEngine is called with characterId === undefined.
    - resolveCharacterId precedence: URL ?actor= wins over a stored Tier3 session.characterId; stored characterId is used when no ?actor=; undefined when neither.
  </behavior>
  <action>
In capability-handshake.ts add a trailing optional param `actorId?: string` to `performCapabilityHandshake` (after `timeoutMs`). In the `clientMsg` object spread, conditionally attach it like the existing session_id pattern: `...(actorId !== undefined ? { actorId } : {})`. Update the function TSDoc (@param actorId — "Optional selected PC actor id; pins this session's character.delta to that actor on the bridge").

In boot-engine-core.ts add `readonly characterId?: string;` to `BootEngineOpts` with TSDoc ("Selected PC actor id (from wizard Tier3 characterId or ?actor= override); forwarded to the bridge as the handshake actorId so the HUD renders THIS character."). Thread `opts.characterId` as the new 6th arg to BOTH performCapabilityHandshake calls (~line 530 initial, ~line 953 reconnect). `BootEngineOpts` is re-exported from index.ts unchanged (no edit needed there).

In launch.ts add a private helper `resolveCharacterId(search: string, session?: Session): string | undefined` (or inline via a LaunchDeps seam) implementing precedence: parse `new URLSearchParams(search).get('actor')` → if non-empty return it; else `session?.characterId`; else undefined. Add a `readUrlSearch?: () => string` to `LaunchDeps` defaulting to `() => window.location.search` (testing seam, mirrors existing dep-injection style). In the no-auth dev branch, resolve characterId (no stored session needed there, pass undefined session → only ?actor= applies) and pass `characterId` into the `bootEngine({...})` call. Document in the module header that the no-auth branch now honors `?actor=` so the simulator can pick a PC. Leave Branch B/C (navigate to wizard) behavior unchanged — the wizard's own post-token boot path independently reads Tier3 characterId; do not call bootEngine from launch.ts for branch B.

Write failing tests FIRST. capability-handshake.test.ts: assert the sent JSON contains/omits actorId. launch.test.ts: inject `readUrlSearch: () => '?actor=6KWxQXAiJgz4zKlS'` and a spy `bootEngine`, assert the spy received `characterId: '6KWxQXAiJgz4zKlS'`; second case with `readUrlSearch: () => ''` asserts `characterId: undefined`. Reuse the existing launch.test.ts dependency-override harness. INV-4: TSDoc on BootEngineOpts.characterId and performCapabilityHandshake actorId param; no dead code; real assertions.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app exec vitest run test/engine/capability-handshake.test.ts test/internal/launch.test.ts</automated>
  </verify>
  <done>BootEngineOpts has characterId; bootEngine threads it to both handshake calls; performCapabilityHandshake emits actorId when set; launchApp resolves ?actor= > Tier3 characterId > undefined and passes it to bootEngine in the no-auth branch. All new + existing g2-app handshake/launch tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| g2-app (WebView) → bridge /ws | Untrusted handshake input including the new actorId field |
| bridge → Foundry (foundryFn) | actorId becomes a lookup key into the dog cache |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-flv-01 | Information Disclosure | character.delta fanout | mitigate | Per-session targeting gates character.delta to sessions whose selectedActorId matches payload.actorId; prevents cross-player character leakage (Task 2) |
| T-flv-02 | Tampering | handshake actorId field | accept | actorId is a selector only; bearer/caps still validated upstream (handshake.ts token gate + read_char cap). A session can only ever receive snapshots the module already pushed to the dog cache (cache-bound); actorId cannot widen access |
| T-flv-03 | Information Disclosure | initial-snapshot pinned fetch | accept | foundryFn('evf.getCharacterSnapshot', selectedActorId, token) is served from the schema-validated dog cache; a non-cached actorId returns null → graceful no-op, no error surface |
| T-flv-SC | Tampering | npm/pip/cargo installs | mitigate | No new dependencies added (constraint); no install tasks → supply-chain surface unchanged |
</threat_model>

<verification>
Full workspace gates after all three tasks:

```
corepack pnpm --filter @evf/shared-protocol exec vitest run
corepack pnpm --filter @evf/bridge exec vitest run
corepack pnpm --filter @evf/g2-app exec vitest run
corepack pnpm typecheck
corepack pnpm lint:ci
```

The shared-protocol change ripples to bridge + g2-app types, so the workspace-wide `typecheck` is mandatory (not just per-package). No bare `pnpm` — corepack only.
</verification>

<success_criteria>
- HandshakeClientSchema accepts optional `actorId` (min(1)); existing clients/tests unaffected.
- bridge Session carries `selectedActorId`; createSession accepts it; handshake sets it on first-connect + reconnect-not-found, preserves it on reconnect-found.
- pushInitialCharacterDelta serves `selectedActorId ?? roster[0]`; server.ts wires the session's selectedActorId.
- character.delta only reaches a session when its selectedActorId is unset or equals payload.actorId; non-character.delta fanout unchanged; existing emitDelta tests green.
- g2-app: BootEngineOpts.characterId threads to both handshake calls; performCapabilityHandshake emits actorId; launchApp resolves ?actor= > Tier3 characterId > undefined.
- All three per-package vitest suites + workspace typecheck + lint:ci pass.
- Live sim re-verify (orchestrator): load g2-app with `?actor=6KWxQXAiJgz4zKlS` (Dante) + seed a Dante snapshot in the bridge cache → HUD renders Dante, not Artemis.
</success_criteria>

<output>
Create `.planning/quick/260605-flv-wire-character-selection-end-to-end-so-t/260605-flv-SUMMARY.md` when done.
</output>
