---
phase: quick-260604-cwa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared-protocol/src/debug/agent-protocol.ts
  - packages/shared-protocol/src/index.ts
  - packages/bridge/src/debug/agent-registry.ts
  - packages/bridge/src/debug/agent-registry.test.ts
  - packages/bridge/src/debug/agent-routes.ts
  - packages/bridge/src/debug/agent-routes.test.ts
  - packages/bridge/src/server.ts
  - packages/g2-app/src/debug/debug-agent.ts
  - packages/g2-app/src/debug/debug-agent.test.ts
  - packages/g2-app/src/debug/wizard-commands.ts
  - packages/g2-app/src/debug/wizard-commands.test.ts
  - packages/g2-app/src/wizard/wizard.ts
  - packages/g2-app/src/index.ts
  - docs/release/debug-harness.md
  - .changeset/debug-harness.md
autonomous: true
requirements: [DEVHARNESS-01, DEVHARNESS-02, DEVHARNESS-03]

must_haves:
  truths:
    - "With EVF_DEBUG=1, the bridge exposes WS /debug/agent; a g2-app client connects, registers {role,name}, and appears in GET /debug/agents."
    - "POST /debug/cmd {target, cmd, args} relays a command to the named agent over WS and returns {id}; the agent's result (correlated by id) lands in the aggregated log stream and (optionally) in the response when wait is requested."
    - "GET /debug/logs?since=<n> returns aggregated ring-buffer events (incl. bridge pino logs) with newest-id tracking."
    - "installDebugAgent() in the g2-app drives the wizard: setBridgeUrl -> goStep 2 -> setToken -> click(connect) advances the store through the real pairing flow, observable via getState."
    - "When the dev flag is OFF, installDebugAgent() is a no-op (no WS opened) AND the debug-agent code is absent from the production .ehpk dist bundle."
  artifacts:
    - path: "packages/shared-protocol/src/debug/agent-protocol.ts"
      provides: "Zod schemas for agent register / log / command / result messages + cmd-relay HTTP bodies"
      contains: "AgentRegisterSchema"
    - path: "packages/bridge/src/debug/agent-registry.ts"
      provides: "In-memory connected-agent registry + id-correlated pending-command map"
      exports: ["AgentRegistry"]
    - path: "packages/bridge/src/debug/agent-routes.ts"
      provides: "WS /debug/agent + GET /debug/agents + POST /debug/cmd + GET /debug/logs"
      exports: ["registerAgentRoutes"]
    - path: "packages/g2-app/src/debug/debug-agent.ts"
      provides: "installDebugAgent() dev-gated WS agent + console/error mirroring + window.__EVF_DEBUG__"
      exports: ["installDebugAgent"]
    - path: "packages/g2-app/src/debug/wizard-commands.ts"
      provides: "Command handlers that drive the wizard store + DOM (getState/setBridgeUrl/setToken/goStep/click/reveal/dumpDom/snapshot)"
      exports: ["makeWizardCommandHandlers"]
    - path: "docs/release/debug-harness.md"
      provides: "Enable/security/curl-ws recipe docs for the harness"
      min_lines: 60
  key_links:
    - from: "packages/bridge/src/server.ts"
      to: "registerAgentRoutes"
      via: "registered inside the existing `if (debugEnabled && debugBus !== undefined)` block"
      pattern: "registerAgentRoutes"
    - from: "packages/g2-app/src/wizard/wizard.ts"
      to: "installDebugAgent"
      via: "called from initWizard behind import.meta.env.DEV || VITE_EVF_DEBUG"
      pattern: "installDebugAgent"
    - from: "packages/bridge/src/debug/agent-routes.ts"
      to: "AgentRegistry"
      via: "cmd relay resolves target agent + correlates result by id"
      pattern: "agentRegistry\\.(send|resolve|register)"
---

<objective>
Add a DEV-ONLY whole-system control channel on top of the EXISTING `/debug` observability backend (Quick Tasks 260529-h5e / 260529-icd). Today the bridge already has: a `DebugEventBus` ring buffer, secret-gated `/debug/state|events|inject|dispatch-tool|simulate-gesture|displayop`, a WS `/debug/stream` feed, and a pino->bus log tap. What is MISSING is the *agent control channel*: a WS endpoint where the g2-app (running inside the real Even Hub simulator WebView) connects AS a named agent and RECEIVES commands, a relay (`POST /debug/cmd`) that routes a command to a named agent and correlates the result by id, an `/debug/agents` roster, an aggregated `/debug/logs` reader with newest-id tracking, and the g2-app-side `installDebugAgent()` that maps received commands onto the wizard store + DOM.

This closes the gap that the Even Hub simulator automation API can only send glasses touchpad input and cannot drive the wizard DOM — so an external orchestrator (curl/ws) can drive the FULL wizard pairing flow headlessly: `setBridgeUrl -> goStep 2 -> setToken -> click(connect)` while reading `/debug/logs`.

Purpose: enable headless end-to-end driving + log aggregation of g2-app + bridge (+ Foundry, stretch) for autonomous test orchestration.
Output: shared-protocol agent schemas; bridge agent-registry + agent-routes wired into the existing debug block; g2-app dev-only debug-agent + wizard-commands; wizard/engine entry wiring; tests; docs; changeset.

Reuse-not-duplicate constraints (READ FIRST):
- REUSE the existing `DebugEventBus` (push/query/subscribe/size, structural token redaction) — do NOT create a second ring buffer. `GET /debug/logs` is a thin reader over `debugBus.query(...)` with `since`-id semantics; agent log events and command results `push()` into the SAME bus with new `direction` values.
- REUSE the existing secret gate: copy the `requireSecret` / `secretsEqual` / `secretFromAuthHeader` pattern from `debug-routes.ts` (WS path accepts `?secret=` because browsers cannot set WS headers). Same `EVF_INTERNAL_SECRET`.
- REUSE the existing existence gate `isDebugEnabled()` (layer 1) — register the new routes inside the SAME `if (debugEnabled && debugBus !== undefined)` block in `server.ts` (around line 416-431) so they are literally absent (genuine 404) when debug is off / prod.
- The bridge binds `0.0.0.0` today (index.ts) per Docker; the spec asks for localhost gating. Do NOT change the bind (would break Docker reader routes). Instead document that the debug surface is gated behind `EVF_DEBUG` + `EVF_INTERNAL_SECRET` and MUST NOT be exposed beyond LAN; the prod Dockerfile must not set `EVF_DEBUG`. Add the existing double-opt-in note (`EVF_DEBUG_ALLOW_PROD`) to the docs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Existing debug backend (REUSE — do not duplicate)
@packages/bridge/src/server.ts
@packages/bridge/src/debug/debug-routes.ts
@packages/bridge/src/debug/debug-event-bus.ts
@packages/bridge/src/debug/is-debug-enabled.ts
@packages/shared-protocol/src/debug/debug-events.ts

# g2-app wizard the agent must drive
@packages/g2-app/src/wizard/wizard.ts
@packages/g2-app/src/wizard/state.ts
@packages/g2-app/src/wizard/wizard.html
@packages/g2-app/src/wizard/steps/step2-token.ts
@packages/g2-app/src/index.ts
@packages/g2-app/vite.config.ts
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| external driver (curl/ws) -> bridge /debug/* | Untrusted control input crosses here; privileged (can drive real pairing). |
| g2-app WebView -> bridge /debug/agent | Agent connection; can be impersonated if secret leaks. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cwa-01 | Elevation | /debug/agent WS + /debug/cmd + /debug/agents + /debug/logs | mitigate | Existence gate: register ONLY inside the existing `if (debugEnabled && debugBus)` block (genuine 404 when off). Reuse `isDebugEnabled()` (double opt-in in prod). |
| T-cwa-02 | Spoofing | /debug/agent WS register + /debug/cmd | mitigate | Reuse `requireSecret` (timing-safe `EVF_INTERNAL_SECRET`); WS accepts `?secret=`, close 1008 on mismatch. |
| T-cwa-03 | Info disclosure | agent log events + command results -> bus | mitigate | Push through the SAME `DebugEventBus` whose structural redaction scrubs known tokens + token-named fields. Seed known tokens via existing `setKnownTokens`. |
| T-cwa-04 | DoS | unbounded agents / pending commands | accept | AgentRegistry caps pending commands with a TTL sweep + a fixed max; dev-only localhost surface, low value. |
| T-cwa-05 | Tampering | prod bundle ships debug agent | mitigate | g2-app agent guarded by `import.meta.env.DEV || import.meta.env.VITE_EVF_DEBUG`; Task 3 adds a grep gate asserting a marker string is absent from prod `dist`. |
| T-cwa-SC | Tampering | npm/pip/cargo installs | mitigate | No new runtime deps added (bridge already has `ws`; g2-app uses native WebSocket). slopcheck N/A — zero new packages. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Agent protocol schemas + bridge AgentRegistry + agent routes (WS /debug/agent, /debug/agents, /debug/cmd, /debug/logs)</name>
  <files>packages/shared-protocol/src/debug/agent-protocol.ts, packages/shared-protocol/src/index.ts, packages/bridge/src/debug/agent-registry.ts, packages/bridge/src/debug/agent-registry.test.ts, packages/bridge/src/debug/agent-routes.ts, packages/bridge/src/debug/agent-routes.test.ts, packages/bridge/src/server.ts</files>
  <behavior>
    AgentRegistry (unit):
    - register({role,name,socket}) returns an agentId; listAgents() includes it with {agentId, role, name, connectedAt}; unregister(agentId) removes it.
    - send(target, cmd, args) resolves the agent by name (fallback by role when name omitted), generates a command id, writes the {id,cmd,args} frame to that agent's socket, and stores a pending entry; returns {id} or throws/returns null when target unknown.
    - resolve(id, {ok,result,error}) settles the matching pending entry's promise and clears it; resolving an unknown id is a no-op.
    - waitFor(id, timeoutMs) resolves with the result when resolve() is called before the timeout, else rejects/resolves with a timeout sentinel; pending entries are swept after TTL so the map stays bounded (cap enforced).
    Agent routes (integration via app.inject / a ws test-double for the registry):
    - GET /debug/agents with correct secret returns 200 + the roster; wrong/missing secret returns 401.
    - POST /debug/cmd {target,cmd,args} with correct secret returns 200 + {id}; unknown target returns 404; missing secret 401. With wait=true (query or body) and a result resolved by the registry, the response includes the result.
    - GET /debug/logs?since=<n> returns events from the shared DebugEventBus with id > since (newest-id tracking); response carries the latest id so the caller can poll. Wrong secret 401.
    - Agent log frames pushed via the registry land in the bus as direction 'agent-log'; command results land as direction 'agent-result' with the correlating id in the payload.
  </behavior>
  <action>
Create `packages/shared-protocol/src/debug/agent-protocol.ts` with Zod schemas mirroring the lean style of `debug-events.ts`: `AgentRegisterSchema` ({role: enum ['g2-app','bridge','foundry'], name: string min 1}), `AgentLogSchema` ({ts:int, level: enum ['debug','info','warn','error'], source: string, msg: string}), `AgentCommandSchema` ({id: uuid, cmd: string min 1, args: z.unknown()}), `AgentResultSchema` ({id: uuid, ok: boolean, result: z.unknown().optional(), error: string.optional()}), `AgentClientFrameSchema` (discriminated union of register/log/result on a `kind` field: 'register'|'log'|'result'), and `DebugCmdBodySchema` ({target: string min 1, cmd: string min 1, args: z.unknown(), wait: boolean.optional()}). Export inferred types. Add a `DEBUG_AGENT_LOG_DIRECTION = 'agent-log'` and `DEBUG_AGENT_RESULT_DIRECTION = 'agent-result'` const. NOTE: the existing `DebugEvent.direction` is a closed enum `['inbound','outbound','tool','log','display']`; extend it in `debug-events.ts` to add `'agent-log'` and `'agent-result'` (additive — update the bus `byDirection()` seed in a follow-on edit within Task 1 to seed the two new keys at 0). Re-export the new agent-protocol symbols from `packages/shared-protocol/src/index.ts` next to the existing debug-events block (line ~360-377).

Create `packages/bridge/src/debug/agent-registry.ts` exporting class `AgentRegistry`: holds `Map<agentId, {role,name,socket,connectedAt}>` and `Map<commandId, {resolve, timer}>`. Methods: `register`, `unregister`, `listAgents`, `send(target,cmd,args)` (resolve by name then role; `crypto.randomUUID()` id; `socket.send(JSON.stringify({id,cmd,args}))`), `resolve(id, result)`, `waitFor(id, timeoutMs)` (returns a Promise settled by resolve or a `{ok:false,error:'timeout'}` sentinel after timeoutMs; always clears the pending entry + timer). Enforce a `MAX_PENDING` cap and a per-entry TTL sweep so the map is bounded (T-cwa-04). Full TSDoc on every public method.

Create `packages/bridge/src/debug/agent-routes.ts` exporting `registerAgentRoutes(app, deps)` where deps = `{ debugBus, agentRegistry }`. Copy the `secretsEqual` / `secretFromAuthHeader` / `requireSecret` helpers from `debug-routes.ts` (acceptable duplication per the existing precedent comment in debug-routes.ts) OR import them if you first export them from debug-routes.ts (planner's call — prefer a tiny shared `debug-secret.ts` helper module to avoid a third copy, and refactor debug-routes.ts to import it in the SAME task). Endpoints: WS `GET /debug/agent` (secret via `?secret=` or Authorization; close 1008 on mismatch; on message parse `AgentClientFrameSchema` — 'register' -> registry.register + push a roster log event; 'log' -> debugBus.push({direction:'agent-log', source from agent, ...}); 'result' -> registry.resolve(id,...) + debugBus.push({direction:'agent-result', payload:{id,...}}); unregister on close+error). HTTP `GET /debug/agents` (secret-gated, returns roster). HTTP `POST /debug/cmd` (secret-gated, validate `DebugCmdBodySchema`; `const {id} = registry.send(...)`; if `wait` -> `const r = await registry.waitFor(id, 2000)` and include it; 404 when target unknown). HTTP `GET /debug/logs?since=<n>` (secret-gated; return `{ events: debugBus.query(...).filter(e=>e.id>since), latestId }` — implement a thin `since` filter over the existing query result; include bridge pino logs which already flow into the bus via the existing multistream tap). Full TSDoc; reference T-cwa-01..04.

Wire into `packages/bridge/src/server.ts`: inside the EXISTING `if (debugEnabled && debugBus !== undefined)` block (~line 416), construct `const agentRegistry = new AgentRegistry();` and `await registerAgentRoutes(app, { debugBus, agentRegistry });` AFTER the existing `registerDebugRoutes(...)` call. Do NOT touch the bind host. Add a one-line `@see ./debug/agent-routes.ts` to the server.ts step-11 header comment.

Tests: `agent-registry.test.ts` (register/list/unregister, send routes to correct socket double + returns id, resolve settles waitFor, timeout sentinel, MAX_PENDING/TTL bound). `agent-routes.test.ts` (use `buildServer()` with `EVF_DEBUG='true'` + `EVF_INTERNAL_SECRET` set in the test; `app.inject` for /debug/agents + /debug/cmd + /debug/logs happy + 401 + 404 paths; for WS register/result, inject a fake agent into the registry or use a `ws` client against `app.listen` on an ephemeral port — prefer registry-level assertions for the WS frame handling to keep it fast). Reset env in afterEach.
  </action>
  <verify>
    <automated>cd /home/aiacos/workspace/EvenFoundryVTT && corepack pnpm --filter @evf/shared-protocol --filter @evf/bridge exec tsc --noEmit && corepack pnpm test -- --run packages/bridge/src/debug/agent-registry.test.ts packages/bridge/src/debug/agent-routes.test.ts</automated>
  </verify>
  <done>Agent schemas exist in shared-protocol and re-export; AgentRegistry + agent-routes implemented and wired in server.ts inside the existing debug-enabled block; bus direction enum extended additively; new tests pass; typecheck clean for both packages.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: g2-app dev-only debug agent + wizard command handlers + entry wiring</name>
  <files>packages/g2-app/src/debug/debug-agent.ts, packages/g2-app/src/debug/debug-agent.test.ts, packages/g2-app/src/debug/wizard-commands.ts, packages/g2-app/src/debug/wizard-commands.test.ts, packages/g2-app/src/wizard/wizard.ts, packages/g2-app/src/index.ts</files>
  <behavior>
    wizard-commands (happy-dom, against a mounted wizard DOM via initWizard + a store handle):
    - getState() returns the wizard store snapshot ({step, bridgeUrl, token, characterId, ...}).
    - setBridgeUrl(url) sets store.bridgeUrl (store.set) and returns the new snapshot.
    - goStep(2) sets store.step to STEP2 (maps numbers 1/2/3 -> WizardStep.STEP1/2/3) and the DOM re-renders.
    - setToken(t): with Step 2 rendered, finds #evf-token-input, sets value + dispatches an 'input' event so the connect button enables.
    - click('connect') / click('#evf-connect-btn'): resolves an action alias to a selector ([data-action] or known id), finds the element, dispatches a click; click('connect') triggers onConnect.
    - reveal toggles the show/hide; dumpDom returns container.outerHTML; snapshot returns a small {step, visibleButtons, inputs} object.
    debug-agent:
    - installDebugAgent() with the dev flag ON opens a WS to VITE_EVF_DEBUG_HUB (default ws://localhost:8910/debug/agent), sends a register frame {kind:'register',role:'g2-app',name}, and on a command frame {id,cmd,args} invokes the matching handler and posts back {kind:'result',id,ok,result|error}.
    - console.* and window 'error'/'unhandledrejection' are mirrored into {kind:'log',...} frames.
    - window.__EVF_DEBUG__ is exposed with the same command handlers callable directly.
    - GATING: installDebugAgent() returns false / no-op without opening a WS when the dev flag is off (test stubs import.meta.env.DEV=false and VITE_EVF_DEBUG unset).
  </behavior>
  <action>
Create `packages/g2-app/src/debug/wizard-commands.ts` exporting `makeWizardCommandHandlers(store)` (store typed as `Store<WizardState>` from `../wizard/state.js`) returning a record of async handlers: `getState`, `setBridgeUrl(url)`, `setToken(t)`, `goStep(n)` (number->WizardStep map reusing the enum), `click(actionOrSelector)`, `reveal`, `dumpDom`, `snapshot`. DOM-driving handlers query `document` (the wizard mounts into `#step-content`): for inputs, set `.value` then `el.dispatchEvent(new Event('input', {bubbles:true}))`; for clicks, resolve aliases (`connect`->`#evf-connect-btn`, `back`->the back button, generic `[data-action="x"]` else treat the string as a CSS selector) then `el.dispatchEvent(new MouseEvent('click',{bubbles:true}))`. Store mutations use `store.set(...)`. Full TSDoc; note T-02-01 (token held in-memory only — handlers never persist it).

Create `packages/g2-app/src/debug/debug-agent.ts` exporting `installDebugAgent(opts?)`. First line GATE: `const enabled = import.meta.env.DEV === true || import.meta.env.VITE_EVF_DEBUG === 'true' || import.meta.env.VITE_EVF_DEBUG === true;` — if not enabled, `return false` immediately (no WS, no console patch). Include a literal marker string constant `const EVF_DEBUG_AGENT_MARKER = '__EVF_DEBUG_AGENT_v1__';` referenced inside the enabled branch so the grep gate in Task 3 can assert its absence from prod dist. When enabled: resolve hub URL from `import.meta.env.VITE_EVF_DEBUG_HUB ?? 'ws://localhost:8910/debug/agent'` (append `?secret=` from `VITE_EVF_DEBUG_SECRET` when present), open a native `WebSocket`, on open send the register frame, on message parse and dispatch to `makeWizardCommandHandlers` (the store handle is passed via `opts.store` from the wizard entry; engine entry may pass undefined and only mirror logs), post results back. Mirror `console.log/info/warn/error` (wrap originals, never swallow) + `window.addEventListener('error'|'unhandledrejection')` into log frames. Set `window.__EVF_DEBUG__` to the handlers. All failures soft-fail (try/catch + original console) — the agent MUST NEVER break the wizard. Full TSDoc with the prominent DEV-ONLY warning.

Wire `packages/g2-app/src/wizard/wizard.ts`: in `initWizard()`, after `const store = createStore(...)`, add (behind the same gate, lazy dynamic import so prod tree-shakes it): `if (import.meta.env.DEV || import.meta.env.VITE_EVF_DEBUG) { const { installDebugAgent } = await import('../debug/debug-agent.js'); installDebugAgent({ store }); }`. Wire `packages/g2-app/src/index.ts`: in `bootEngine` (or `_bootEngineCore` if the gate belongs there — planner: keep it in index.ts thin wrapper to avoid touching the internal core's W-4 grep gate) add the same dynamic-import gate calling `installDebugAgent()` with no store (engine entry mirrors logs + exposes `window.__EVF_DEBUG__` only). Confirm `packages/g2-app/src/index.ts` still contains zero `wsFactory|bridgeFactory` substrings (existing W-4 grep gate) — the debug import introduces neither.

Tests: `wizard-commands.test.ts` (happy-dom: mount wizard via initWizard against a jsdom/happy-dom document, drive setBridgeUrl->goStep(2)->setToken->click('connect'); assert store snapshot transitions; stub global `fetch` so onConnect's /v1/health call resolves 200 and the store advances to STEP3). `debug-agent.test.ts` (gating: with DEV stubbed false + VITE_EVF_DEBUG unset, `installDebugAgent()` returns false and opens no WS — assert a `vi.fn()` WebSocket global is never constructed; with the flag on + a fake WebSocket, assert register frame sent on open and a command frame triggers the handler + a result frame is posted; assert console.* mirroring produces a log frame). Use `vi.stubGlobal('WebSocket', FakeWS)` and `vi.stubEnv` for import.meta.env where supported (else inject the flag via opts).
  </action>
  <verify>
    <automated>cd /home/aiacos/workspace/EvenFoundryVTT && corepack pnpm --filter @evf/g2-app exec tsc --noEmit && corepack pnpm test -- --run packages/g2-app/src/debug/wizard-commands.test.ts packages/g2-app/src/debug/debug-agent.test.ts && grep -q "installDebugAgent" packages/g2-app/src/wizard/wizard.ts && grep -q "installDebugAgent" packages/g2-app/src/index.ts && ! grep -E "wsFactory|bridgeFactory" packages/g2-app/src/index.ts</automated>
  </verify>
  <done>debug-agent + wizard-commands implemented with dev gate; wizard.ts + index.ts call installDebugAgent behind the gate via dynamic import; gating + command-handler + console-mirror tests pass; g2-app typecheck clean; W-4 grep gate still holds.</done>
</task>

<task type="auto">
  <name>Task 3: Prod tree-shake verification, docs, changeset, full-gate green</name>
  <files>docs/release/debug-harness.md, .changeset/debug-harness.md</files>
  <action>
Build the g2-app prod bundle and assert the debug agent is tree-shaken out: run `corepack pnpm --filter @evf/g2-app build`, then grep the emitted `packages/g2-app/dist/**/*.js` for the marker `__EVF_DEBUG_AGENT_v1__` and assert ZERO matches (the dynamic import behind `import.meta.env.DEV`/`VITE_EVF_DEBUG` must be eliminated in a default prod build where `DEV=false` and the flag is unset). The default `vite build` sets `import.meta.env.DEV=false`; the gate constant-folds to false and Rollup drops the dynamic import + the marker. If the marker survives, the gate must be tightened (e.g. wrap the dynamic import so the condition is statically `false`) — this is part of the task, not a deferral.

Write `docs/release/debug-harness.md` (>=60 lines), structured like the sibling `docs/release/bridge.md`:
  - Prominent SECURITY banner at the top: DEV-ONLY; gated behind `EVF_DEBUG=1` + `EVF_INTERNAL_SECRET`; existence-gated (genuine 404 when off); double opt-in `EVF_DEBUG_ALLOW_PROD` required to even attempt enabling in prod; the prod Docker image MUST NOT set `EVF_DEBUG`; bind is LAN — never expose the debug surface beyond localhost/LAN.
  - How to enable: bridge `EVF_DEBUG=1 EVF_INTERNAL_SECRET=<secret> corepack pnpm --filter @evf/bridge dev`; g2-app `VITE_EVF_DEBUG=1 VITE_EVF_DEBUG_HUB=ws://localhost:8910/debug/agent VITE_EVF_DEBUG_SECRET=<secret> corepack pnpm --filter @evf/g2-app dev` (+ the headless simulator: `npx --yes @evenrealities/evenhub-simulator http://localhost:5173`, and `dev:qr` for device).
  - Endpoint reference table: WS `/debug/agent`, GET `/debug/agents`, POST `/debug/cmd`, GET `/debug/logs?since=`, plus a pointer to the pre-existing `/debug/state|events|inject|dispatch-tool|simulate-gesture|stream` from Quick Task 260529-h5e.
  - curl/ws recipe to drive the wizard end-to-end headlessly: (1) `GET /debug/agents` to confirm the g2-app agent connected; (2) `POST /debug/cmd {target:'g2-app',cmd:'setBridgeUrl',args:{url:'http://localhost:8910'}}`; (3) `goStep` args `{n:2}`; (4) `setToken` args `{t:'<bearer>'}`; (5) `click` args `{target:'connect'}` with `wait:true`; (6) poll `GET /debug/logs?since=<lastId>` to read the aggregated g2-app + bridge logs and the command results. Show the `Authorization: Bearer <secret>` header on every HTTP call and `?secret=<secret>` on the WS connect.
  - STRETCH note (do NOT implement): Foundry-module log forwarding to the hub is out-of-scope for this task; leave a `// TODO(#issue): forward foundry-module logs to /debug/agent` marker only if you add a placeholder, otherwise just document it here as future work. Add the TODO with an issue ref ONLY if a placeholder line is introduced (INV-4 requires `(#issue)`); prefer documenting in this file with no dangling TODO.
  - INV-2/INV-3 note: no Specs.md version bump required (dev tooling, no cross-cutting hardware/version claim). Optionally mention a one-line `Specs.md §5.2` cross-ref is left to a future bump.

Add `.changeset/debug-harness.md` with a patch bump on `@evf/bridge` and `@evf/g2-app` and a one-line summary ("dev-only debug/control harness — /debug/agent control channel + g2-app agent driving the wizard").

Then run the full workspace gates to ensure nothing regressed.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app build && ! grep -rE "__EVF_DEBUG_AGENT_v1__" packages/g2-app/dist && test -f docs/release/debug-harness.md && [ "$(grep -vc '^[[:space:]]*$' docs/release/debug-harness.md)" -ge 60 ] && test -f .changeset/debug-harness.md && corepack pnpm lint:ci && corepack pnpm typecheck && corepack pnpm test --run</automated>
  </verify>
  <done>Prod dist contains zero matches of the debug-agent marker (tree-shaken); docs/release/debug-harness.md exists (>=60 non-blank lines) with the security banner + enable steps + endpoint table + end-to-end curl/ws wizard recipe; patch changeset for @evf/bridge + @evf/g2-app exists; full workspace lint:ci + typecheck + test all green.</done>
</task>

</tasks>

<verification>
- Existence gate: with `EVF_DEBUG` unset, `GET /debug/agents`, `POST /debug/cmd`, `GET /debug/logs`, and WS `/debug/agent` all return Fastify's default 404 (routes not registered) — assert in agent-routes.test.ts via a `buildServer()` built without the env flag.
- Secret gate: every new HTTP route returns 401 on missing/wrong secret; WS closes 1008 on mismatch.
- Redaction: a known session token echoed inside an agent log frame or a command result is scrubbed to a hint in `/debug/logs` output (reuses DebugEventBus structural redaction — add one assertion).
- Tree-shake: `! grep -rE "__EVF_DEBUG_AGENT_v1__" packages/g2-app/dist` after `vite build`.
- End-to-end intent: wizard-commands.test.ts proves setBridgeUrl -> goStep(2) -> setToken -> click('connect') advances the store to STEP3 (with fetch stubbed 200), matching the headless pairing recipe in the docs.
- No new runtime deps (T-cwa-SC): `git diff packages/bridge/package.json packages/g2-app/package.json` shows no new `dependencies`.
</verification>

<success_criteria>
- WS `/debug/agent` + `GET /debug/agents` + `POST /debug/cmd` + `GET /debug/logs?since=` exist, secret-gated, registered only behind the existing `isDebugEnabled()` block in server.ts (genuine 404 when off).
- `installDebugAgent()` opens a WS to the hub when the dev flag is on, registers role 'g2-app', mirrors console + window errors, exposes `window.__EVF_DEBUG__`, and executes getState/setBridgeUrl/setToken/goStep/click/reveal/dumpDom/snapshot against the wizard store + DOM.
- POST /debug/cmd relays to the named agent and correlates the result by id into the aggregated log/result stream; `wait` returns the result inline.
- Agent is a no-op when the dev flag is off AND absent from the prod `.ehpk` dist bundle (marker grep = 0).
- INV-4 holds: TSDoc on every public API, Vitest tests pass, `lint:ci` + `typecheck` clean, zero dead code, no dangling TODO without `(#issue)`.
- Patch changeset on @evf/bridge + @evf/g2-app; docs/release/debug-harness.md with the prominent DEV-ONLY/localhost security note.
- Foundry-module log forwarding is explicitly OUT OF SCOPE (documented as future work in debug-harness.md; no dangling placeholder TODO).
</success_criteria>

<output>
Create `.planning/quick/260604-cwa-dev-only-whole-system-debug-control-harn/260604-cwa-SUMMARY.md` when done.
</output>
