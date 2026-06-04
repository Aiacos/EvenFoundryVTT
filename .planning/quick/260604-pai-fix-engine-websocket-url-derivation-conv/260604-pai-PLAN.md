---
phase: quick-260604-pai
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/g2-app/src/engine/ws-url.ts
  - packages/g2-app/src/engine/__tests__/ws-url.test.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/package.json
  - .changeset/fix-engine-ws-url-derivation.md
autonomous: true
requirements: [PAI-WS-URL]

must_haves:
  truths:
    - "bootEngine opens its initial WebSocket against a ws/wss scheme URL ending in /ws (the bridge's real route), not the raw https REST base."
    - "The WsReconnectController is constructed with the same derived ws(s)://…/ws URL so reconnects target the live route."
    - "toWsConnectUrl is a pure, exported, unit-tested helper: http→ws / https→wss, trailing slashes stripped, /ws appended, idempotent for already-ws-scheme and already-/ws inputs."
    - "The displayop HTTP base (line 389) and audio startAudioCapture bridgeUrl (line ~1073) still resolve to correct http(s) URLs after the change."
    - "Full @evf/g2-app vitest suite, tsc, and file-scoped biome pass (INV-4); @evf/g2-app version bumped + changeset added."
  artifacts:
    - path: "packages/g2-app/src/engine/ws-url.ts"
      provides: "toWsConnectUrl pure helper"
      exports: ["toWsConnectUrl"]
      min_lines: 15
    - path: "packages/g2-app/src/engine/__tests__/ws-url.test.ts"
      provides: "unit tests for scheme conversion, /ws append, trailing slash, idempotency"
    - path: ".changeset/fix-engine-ws-url-derivation.md"
      provides: "patch bump for @evf/g2-app"
  key_links:
    - from: "packages/g2-app/src/internal/boot-engine-core.ts"
      to: "packages/g2-app/src/engine/ws-url.ts"
      via: "import + call at line 366 (initial connect) and line 775 (reconnect url)"
      pattern: "toWsConnectUrl\\(opts\\.bridgeUrl\\)"
---

<objective>
Fix the g2-app boot engine so its WebSocket connects to the bridge's real `/ws` route. Today `bootEngine` opens `new WebSocket(opts.bridgeUrl)` with a raw REST base like `https://host:443` — wrong scheme, no `/ws` path — so the WS never connects and bootEngine throws at step 5 ("[EVF] launch: bootEngine failed"), leaving the glasses black.

The fix is localized to `boot-engine-core.ts`: add a pure `toWsConnectUrl(baseUrl)` helper that derives the WS connect URL (`http→ws`/`https→wss`, strip trailing slashes, append `/ws`, idempotent), and use it at the two WS-open sites. `launchApp`'s contract is unchanged — `opts.bridgeUrl` stays the REST base URL. The displayop and audio consumers of `opts.bridgeUrl` are left as REST consumers.

Purpose: make the WS CONNECT + capability handshake succeed so the engine boots (boot splash + StatusHUD frame render).
Output: `engine/ws-url.ts` helper + tests, two wire-in edits in `boot-engine-core.ts`, doc fix, version bump + changeset.

OUT OF SCOPE (do NOT implement): bridge changes, `launchApp` behavior changes, the WS DATA path that fills the StatusHUD with the real character sheet, `.ehpk` packaging/deploy.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

@packages/g2-app/src/internal/boot-engine-core.ts
@packages/g2-app/src/engine/ws-reconnect.ts
@packages/g2-app/src/__tests__/ws-reconnect.test.ts
@packages/bridge/src/server.ts

Key facts verified during planning:
- Bridge serves WS at `app.get('/ws', { websocket: true })` (server.ts:571). Probe: `GET /ws` w/ Upgrade -> 101; `GET /v1/ws` -> 404.
- `boot-engine-core.ts` line 366: `const ws = wsCtor(opts.bridgeUrl)` — initial connect.
- `boot-engine-core.ts` line 775: `WsReconnectController({ url: opts.bridgeUrl, ... })`; reconnect calls `wsFactory(opts.url)` (ws-reconnect.ts:255).
- `boot-engine-core.ts` line 389: displayop URL = `opts.bridgeUrl.replace(/^ws/,'http').replace(/\/+$/,'')+'/debug/displayop'` — with an `https://` REST base the `^ws` replace is a no-op, still correct. LEAVE unchanged.
- `boot-engine-core.ts` line ~1073: `startAudioCapture({ bridgeUrl: opts.bridgeUrl, ... })` — REST base consumer. LEAVE unchanged.
- `boot-engine-core.ts` line ~114: `BootEngineOpts.bridgeUrl` doc currently says "Bridge WebSocket URL" — must be corrected to "REST base URL".
- TEST IMPACT: `ws-reconnect.test.ts` constructs `WsReconnectController` directly with `url: 'wss://test.local/ws'` and asserts `wsFactory` called with that exact string — this is BELOW the derivation layer and MUST NOT change. The boot-engine tests pass `bridgeUrl: 'ws://test/bridge'` but their `wsFactory` ignores the URL argument (no assertion on it), so no boot-engine test asserts the derived value.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add pure toWsConnectUrl helper + unit tests</name>
  <files>packages/g2-app/src/engine/ws-url.ts, packages/g2-app/src/engine/__tests__/ws-url.test.ts</files>
  <behavior>
    toWsConnectUrl(baseUrl: string): string
    - 'https://h:443'       -> 'wss://h:443/ws'    (https->wss, append /ws)
    - 'http://h:8910'       -> 'ws://h:8910/ws'    (http->ws, append /ws)
    - 'https://h:443/'      -> 'wss://h:443/ws'    (strip trailing slash before append)
    - 'https://h:443///'    -> 'wss://h:443/ws'    (collapse multiple trailing slashes)
    - 'wss://h/ws'          -> 'wss://h/ws'        (idempotent: already ws connect URL ending /ws -> unchanged)
    - 'ws://h:8910/ws'      -> 'ws://h:8910/ws'    (idempotent for ws scheme + /ws path)
    - 'wss://test.local/ws' -> 'wss://test.local/ws' (matches the ws-reconnect.test.ts contract string)
    Contract notes:
    - Scheme conversion: ONLY a leading 'http' is rewritten to 'ws' (so 'https'->'wss', 'http'->'ws'). An input already on a ws/wss scheme is NOT scheme-converted.
    - If the input already ends in '/ws' (after trailing-slash strip), do NOT append a second '/ws'.
    - An already-ws-scheme input is treated as already a connect URL: leave its path as-is (do not force-append '/ws' to e.g. 'ws://test/bridge'); this keeps existing boot-engine fixtures byte-stable.
    - Pure function: no window/global access; safe to import from tests.
  </behavior>
  <action>Create `packages/g2-app/src/engine/ws-url.ts` exporting a single pure function `toWsConnectUrl(baseUrl: string): string` implementing the contract in the behavior block. Use a leading-anchored regex for scheme rewrite (`/^http/`), a trailing-slash collapse (`/\/+$/`), and an idempotent `/ws` append guarded by an `endsWith('/ws')` check. For an http(s) input: rewrite scheme to ws(s), strip trailing slashes, append `/ws` unless already present. For an input already on a `ws://`/`wss://` scheme: strip trailing slashes and return as-is (do NOT scheme-convert, do NOT force `/ws` onto a non-`/ws` path) — this preserves existing fixtures and avoids double conversion. Add a TSDoc block (INV-4: public API documented) explaining it derives the WS connect URL from the REST base URL and why (bridge serves `/ws`; WebSocket requires ws(s) scheme). Create `packages/g2-app/src/engine/__tests__/ws-url.test.ts` with one describe block and a test per row in the behavior block, plus an explicit idempotency test that `toWsConnectUrl(toWsConnectUrl('https://h:443')) === 'wss://h:443/ws'`. Do NOT inline implementation code anywhere except the source file itself.</action>
  <verify>
    <automated>cd packages/g2-app && pnpm exec vitest --run src/engine/__tests__/ws-url.test.ts</automated>
  </verify>
  <done>ws-url.ts exports toWsConnectUrl; all rows in the behavior block pass; idempotency test green; helper has TSDoc and no window/global access.</done>
</task>

<task type="auto">
  <name>Task 2: Wire toWsConnectUrl into both WS-open sites, fix doc, bump + changeset</name>
  <files>packages/g2-app/src/internal/boot-engine-core.ts, packages/g2-app/package.json, .changeset/fix-engine-ws-url-derivation.md</files>
  <action>In `boot-engine-core.ts`: (1) add `import { toWsConnectUrl } from '../engine/ws-url';` (verify the relative path resolves from `src/internal/` to `src/engine/`). (2) Line 366: change `const ws = wsCtor(opts.bridgeUrl);` to `const ws = wsCtor(toWsConnectUrl(opts.bridgeUrl));`. (3) Line 775: change the `WsReconnectController` `url:` field from `opts.bridgeUrl` to `toWsConnectUrl(opts.bridgeUrl)`. (4) Line ~114: update the `BootEngineOpts.bridgeUrl` TSDoc from "Bridge WebSocket URL (Phase 3 bridge service)." to state it is the REST base URL (scheme `http`/`https`) and that the engine derives the `ws(s)://…/ws` connect URL internally via `toWsConnectUrl`. (5) LEAVE line 389 (displayop `^ws`->http replace) and line ~1073 (`startAudioCapture({ bridgeUrl: opts.bridgeUrl })`) UNCHANGED — verify by reading them that they still produce correct `http(s)` URLs from a REST base (the `^ws` replace is a correct no-op on an `https://` base). Do NOT touch `launch.ts`, `index.ts`, the bridge, or `ws-reconnect.ts`. Bump `@evf/g2-app` version in `packages/g2-app/package.json` (patch: 0.2.3 -> 0.2.4) and create `.changeset/fix-engine-ws-url-derivation.md` declaring a `patch` bump for `@evf/g2-app` describing the WS-URL derivation fix.</action>
  <verify>
    <automated>cd /home/aiacos/workspace/EvenFoundryVTT && pnpm exec tsc --noEmit -p tsconfig.base.json && pnpm exec biome check packages/g2-app/src/internal/boot-engine-core.ts packages/g2-app/src/engine/ws-url.ts packages/g2-app/src/engine/__tests__/ws-url.test.ts && pnpm --filter @evf/g2-app exec vitest --run</automated>
  </verify>
  <done>Both WS-open sites call toWsConnectUrl(opts.bridgeUrl); BootEngineOpts.bridgeUrl doc says REST base URL; displayop + audio consumers unchanged and still produce http(s) URLs; tsc clean; biome clean on touched files; full @evf/g2-app suite green; version 0.2.4 + changeset present.</done>
</task>

</tasks>

<verification>
- `grep -n "toWsConnectUrl(opts.bridgeUrl)" packages/g2-app/src/internal/boot-engine-core.ts` returns 2 matches (line ~366 + line ~775).
- `grep -n "/debug/displayop" packages/g2-app/src/internal/boot-engine-core.ts` still shows the unchanged displayop URL built from `opts.bridgeUrl`.
- `pnpm exec tsc --noEmit -p tsconfig.base.json` exits 0.
- `pnpm --filter @evf/g2-app exec vitest --run` passes (ws-reconnect.test.ts unchanged + new ws-url.test.ts green + no boot-engine test regressions).
- `pnpm changeset:status` shows a declared bump for `@evf/g2-app`.
</verification>

<success_criteria>
- bootEngine's initial WebSocket and the reconnect controller both target the derived `ws(s)://<host>/ws` URL.
- `toWsConnectUrl` is pure, exported, unit-tested (scheme conversion, trailing-slash strip, `/ws` append, idempotency).
- `launch.ts`, `index.ts`, the bridge, and `ws-reconnect.ts` are untouched; displayop + audio consumers still resolve correct http(s) URLs.
- INV-4 green: tsc, file-scoped biome, full g2-app vitest suite.
- `@evf/g2-app` bumped to 0.2.4 with a changeset.
</success_criteria>

<output>
Create `.planning/quick/260604-pai-fix-engine-websocket-url-derivation-conv/260604-pai-01-SUMMARY.md` when done.
</output>
