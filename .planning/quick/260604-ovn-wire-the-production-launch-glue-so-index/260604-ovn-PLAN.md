---
phase: quick-260604-ovn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/g2-app/src/internal/launch.ts
  - packages/g2-app/src/index.ts
  - packages/g2-app/src/wizard/steps/completion.ts
  - packages/g2-app/src/wizard/wizard.ts
  - packages/g2-app/src/__tests__/launch.test.ts
  - packages/g2-app/package.json
  - .changeset/quick-260604-ovn-launch-glue.md
autonomous: true
requirements: [OVN-01, OVN-02, OVN-03]

must_haves:
  truths:
    - "On index.html load, launchApp() runs and decides between boot / wizard-redirect."
    - "When isWizardNoAuth() is true, the engine boots via bootEngine({ bridgeUrl: devBridgeUrl(), token: '', locale }) — the simulator shows the boot sequence + HUD frame instead of black."
    - "When unpaired and not in dev no-auth, the app navigates to wizard/wizard.html instead of staying black."
    - "When a stored session exists in a non-dev build (bridgeUrl but no persisted token), the app routes to the wizard for token re-acquisition."
    - "Reaching wizard COMPLETION (after saveSession) hands off to the engine by redirecting to index.html."
    - "index.ts stays thin: zero wsFactory / bridgeFactory / TestingDependencies substrings (W-4 gate stays green)."
    - "A boot failure logs via console.error and does not throw out of the top-level module (no silent white-screen)."
  artifacts:
    - path: "packages/g2-app/src/internal/launch.ts"
      provides: "launchApp(deps) decision logic — session resolve, no-auth dev fallback, wizard redirect, fail-soft"
      exports: ["launchApp", "LaunchDeps"]
    - path: "packages/g2-app/src/__tests__/launch.test.ts"
      provides: "Unit tests for all launchApp decision branches + W-4 grep assertion on index.ts"
    - path: ".changeset/quick-260604-ovn-launch-glue.md"
      provides: "@evf/g2-app patch bump changeset"
  key_links:
    - from: "packages/g2-app/src/index.ts"
      to: "packages/g2-app/src/internal/launch.ts"
      via: "import launchApp + call on module load"
      pattern: "launchApp"
    - from: "packages/g2-app/src/internal/launch.ts"
      to: "bootEngine (boot-engine-core)"
      via: "await bootEngine(opts)"
      pattern: "bootEngine"
    - from: "packages/g2-app/src/wizard/steps/completion.ts"
      to: "index.html"
      via: "redirect on completion render"
      pattern: "index\\.html"
---

<objective>
Wire the production launch glue. Today `index.html` → `index.ts` only installs the dev debug-agent and EXPORTS `bootEngine` — it never CALLS it, so the glasses stay black on launch. This plan adds a thin, unit-testable `launchApp(deps)` module that, on app load, resolves the active session and boots the already-implemented HUD engine, with a wizard fallback when unpaired and a no-auth dev fallback for the EvenHub simulator. It also wires the wizard COMPLETION → engine handoff.

Purpose: Close the "nothing ever calls bootEngine()" gap so the engine actually boots (boot sequence + HUD frame) instead of a black screen.
Output: `internal/launch.ts` (decision logic), a thin call-site in `index.ts`, a completion→index.html handoff, and unit tests for every branch (W-4 gate kept green).

CRITICAL design constraint discovered while planning (load-bearing — do NOT "fix" it):
The bearer token is NEVER persisted to Tier 3. `SessionSchema` in `wizard/tier3-storage.ts` enforces `tokenObfuscated: z.null()` (T-02-01); `WizardState.token` is in-memory only. Therefore a stored `Session` provides a `bridgeUrl` but NO token. Consequences for the decision logic:
- The no-auth dev fallback is the ONLY path that can boot from "no usable token" — because the no-auth bridge accepts an empty token.
- A stored session in a NON-dev build cannot complete the capability handshake (no token in memory) → it must route to the wizard, whose existing auto-connect / STEP2 flow re-acquires the token. This matches the existing auto-connect design (token expiry → STEP2).
Do NOT invent a Session token field. The Session schema also has no locale field — default locale to 'it' (fallback 'en'), do not read it from the session.

OUT OF SCOPE (do NOT plan): the WS DATA path that fills StatusHudLayer with the real character sheet; bridge/foundry-module changes; .ehpk packaging/deploy.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@packages/g2-app/src/index.ts
@packages/g2-app/src/internal/boot-engine-core.ts
@packages/g2-app/src/index.test-support.ts
@packages/g2-app/src/wizard/tier3-storage.ts
@packages/g2-app/src/wizard/is-dev-no-auth.ts
@packages/g2-app/src/wizard/state.ts
@packages/g2-app/src/wizard/wizard.ts
@packages/g2-app/src/wizard/steps/completion.ts
@packages/g2-app/src/wizard/steps/step3-character.ts
@packages/g2-app/vite.config.ts
@packages/g2-app/app.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create launchApp decision module + unit tests</name>
  <files>packages/g2-app/src/internal/launch.ts, packages/g2-app/src/__tests__/launch.test.ts</files>
  <behavior>
    launchApp(deps) where deps is a small injectable surface for testability:
      LaunchDeps = {
        bootEngine: (opts: BootEngineOpts) => Promise<unknown>;   // default: real bootEngine from ../index.js
        listProfiles: () => Promise<Session[]>;                   // default: tier3-storage listProfiles
        isNoAuth: () => boolean;                                  // default: isWizardNoAuth
        devBridgeUrl: () => string;                               // default: devBridgeUrl
        navigate: (url: string) => void;                          // default: (u) => { window.location.href = u; }
        locale?: string;                                          // default: 'it'
      }
    All deps default to the real implementations, so index.ts can call launchApp() with no args.

    - Branch A (no-auth dev): when isNoAuth() === true → await bootEngine({ bridgeUrl: devBridgeUrl(), token: '', locale }). Boot regardless of stored session — the no-auth bridge accepts the empty token. This is what unblocks the simulator.
      - Test 1: isNoAuth true → bootEngine called once with { bridgeUrl: <devBridgeUrl return>, token: '', locale }. navigate NOT called.
    - Branch B (paired, non-dev): isNoAuth() === false AND listProfiles() returns ≥1 valid Session → the stored session has a bridgeUrl but NO token (schema enforces tokenObfuscated null), so the handshake cannot complete → route to the wizard for token re-acquisition: navigate('./wizard/wizard.html'). bootEngine NOT called. (Document in code WHY a stored session still routes to the wizard: no persisted token — cite tier3-storage T-02-01.)
      - Test 2: isNoAuth false + listProfiles returns one valid session → navigate called with a path ending 'wizard/wizard.html'; bootEngine NOT called.
    - Branch C (unpaired, non-dev): isNoAuth() === false AND listProfiles() returns [] → navigate('./wizard/wizard.html'); bootEngine NOT called.
      - Test 3: isNoAuth false + listProfiles returns [] → navigate to wizard; bootEngine NOT called.
    - Fail-soft: wrap the bootEngine path in try/catch. On bootEngine rejection → console.error('[EVF] launch: bootEngine failed', err) and return normally (do NOT rethrow). launchApp itself must never reject for a boot error.
      - Test 4: bootEngine rejects (no-auth path) → launchApp resolves (no throw); console.error called.
    - locale resolution: launchApp uses deps.locale ?? 'it'. (Session has no locale field — confirmed in SessionSchema — so do NOT read it from the session.)
    - W-4 guard test: read packages/g2-app/src/index.ts from disk and assert it contains no 'wsFactory', no 'bridgeFactory', no 'TestingDependencies' substrings. (Exercised again after Task 2 edits index.ts.)
  </behavior>
  <action>Create `packages/g2-app/src/internal/launch.ts` exporting `launchApp(deps?: Partial<LaunchDeps>): Promise<void>` and the `LaunchDeps` type. Import `bootEngine` + `BootEngineOpts` from `../index.js` (production wrapper — keeps launch.ts free of DI literals; the W-4 gate only covers index.ts). Import `listProfiles` + `Session` from `../wizard/tier3-storage.js`, `isWizardNoAuth` + `devBridgeUrl` from `../wizard/is-dev-no-auth.js`. Implement the three branches and fail-soft exactly per the behavior block. For navigation default, use `window.location.href = url`. Resolve the wizard path relative to index.html as `./wizard/wizard.html` (dist layout: index.html at root, wizard at dist/wizard/wizard.html — confirmed in vite.config.ts). Do NOT duplicate hub-polyfill / waitForEvenAppBridge — bootEngine already does steps 1-2. Add TSDoc on `launchApp` + `LaunchDeps` (INV-4). Then create `packages/g2-app/src/__tests__/launch.test.ts` (vitest, happy-dom) implementing Tests 1-4 + the W-4 disk-read assertion. Inject mocks by passing the `LaunchDeps` surface (no module mocking needed for deps); for the W-4 test, read index.ts via `node:fs` `readFileSync` with an absolute path resolved from the test file. Follow the style of existing `__tests__/*.ts` (vi/describe/it/expect).</action>
  <verify>
    <automated>cd packages/g2-app && pnpm exec vitest --run --project g2-app --root ../.. src/__tests__/launch.test.ts</automated>
  </verify>
  <done>launch.test.ts passes; all four decision/fail-soft branches asserted; W-4 disk-read assertion green; launch.ts type-checks.</done>
</task>

<task type="auto">
  <name>Task 2: Wire launchApp into index.ts + wizard completion handoff</name>
  <files>packages/g2-app/src/index.ts, packages/g2-app/src/wizard/steps/completion.ts, packages/g2-app/src/wizard/wizard.ts</files>
  <action>
1. `index.ts`: add `import { launchApp } from './internal/launch.js';` and, AFTER the existing dev debug-agent dynamic-import block (ordering note: debug-agent install is fire-and-forget; bootEngine installs the hub polyfill + waits for the bridge itself, so calling launchApp after the debug block is safe), invoke `launchApp().catch((err) => { console.error('[EVF] index: launchApp failed', err); });`. Keep the existing `bootEngine` export, `PACKAGE_NAME`, and the debug-agent block intact. CRITICAL: do NOT introduce any `wsFactory` / `bridgeFactory` / `TestingDependencies` substrings — index.ts must stay thin (W-4 gate). launchApp's own `.catch` plus its internal fail-soft means a boot error never white-screens.
2. Wizard handoff: hand off to the engine when the wizard finalizes. Implement in `wizard/steps/completion.ts` `render(...)`: after building the completion screen, when handoff is requested, schedule a redirect to the engine entry — `setTimeout(() => { window.location.href = '../index.html'; }, 1500)` so the user briefly sees the success screen, then index.html's launchApp picks up. (Path note: wizard runs at dist/wizard/wizard.html, so the engine entry is `../index.html`.) Guard the redirect so it does NOT fire for the REPAIR re-entry path: completion.render is reused for both COMPLETION and REPAIR (see wizard.ts switch). Add an optional `handoff?: boolean` to the `opts` parameter of `render`; only fire the redirect when `opts.handoff === true`. Store the timer id so `destroy()` clears it (clearTimeout) — prevents a stray redirect after the screen is torn down in tests.
3. `wizard.ts`: in the `case WizardStep.COMPLETION:` branch, pass `handoff: true` into the existing `Completion.render(content, store, t, { characterName, characterClass, handoff: true })` opts object. Leave the `case WizardStep.REPAIR:` `Completion.render(content, store, t)` call unchanged (no handoff).
4. Confirm no existing wizard test breaks: wizard-init / completion tests must not trigger a real navigation. The redirect is `setTimeout`-based, cleared by `destroy()`, and gated by `handoff` (existing tests pass no handoff). `window.location.href` assignment in happy-dom is throwless. If any test asserts on completion.render's opts shape, the new `handoff` key is optional/additive and should not break it.
  </action>
  <verify>
    <automated>cd packages/g2-app && pnpm exec vitest --run --project g2-app --root ../.. && ! grep -E "wsFactory|bridgeFactory|TestingDependencies" src/index.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <done>Full g2-app suite green; W-4 grep on index.ts returns nothing (`!` makes the command pass only when clean); tsc clean; index.ts calls launchApp(); COMPLETION redirects to ../index.html while REPAIR does not.</done>
</task>

<task type="auto">
  <name>Task 3: Version bump + changeset + INV-4 closeout</name>
  <files>packages/g2-app/package.json, .changeset/quick-260604-ovn-launch-glue.md</files>
  <action>Bump `@evf/g2-app` version in `packages/g2-app/package.json` from `0.2.2` to `0.2.3` (patch — launch glue, no API change to bootEngine). Create `.changeset/quick-260604-ovn-launch-glue.md` with front-matter `"@evf/g2-app": patch` and a one-line summary: "Wire production launch glue: index.html now boots the HUD engine (no-auth dev fallback for the simulator; wizard fallback when unpaired; completion→engine handoff)." Then run the workspace INV-4 gates (file-scoped where possible) and fix any lint/format/type issues introduced by Tasks 1-2.</action>
  <verify>
    <automated>cd /home/aiacos/workspace/EvenFoundryVTT && pnpm exec biome check packages/g2-app/src/internal/launch.ts packages/g2-app/src/index.ts packages/g2-app/src/wizard/steps/completion.ts packages/g2-app/src/wizard/wizard.ts packages/g2-app/src/__tests__/launch.test.ts && pnpm --filter @evf/g2-app exec tsc --noEmit && pnpm changeset:status</automated>
  </verify>
  <done>Version is 0.2.3; changeset present and detected by `changeset:status`; biome clean on touched files; tsc clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| app load → engine boot | launchApp decides whether to open a bridge WS (via bootEngine) using session-derived bridgeUrl |
| stored Tier 3 session → boot opts | bridgeUrl read from kv crosses into a network connection target |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ovn-01 | Tampering | bridgeUrl from Tier 3 session | mitigate | bridgeUrl is already Zod `z.string().url()`-validated by `SessionSchema` on load (listProfiles drops invalid). launchApp consumes only validated sessions; no new validation surface. |
| T-ovn-02 | Information disclosure | empty-token no-auth boot | accept | No-auth path is dev-only (`VITE_EVF_NO_AUTH==='true'`, unset in `.ehpk` prod → dead branch). Bridge side independently hard-gated OFF by default. |
| T-ovn-03 | Spoofing | wizard→index redirect | accept | Redirect is a same-origin static-path navigation (`../index.html`); no token or secret travels in the URL (token never persisted, re-acquired by auto-connect). |
| T-ovn-SC | Tampering | npm/pip/cargo installs | n/a | No new dependencies installed; all imports are existing workspace/SDK modules. |
</threat_model>

<verification>
- `index.html` load path: `index.ts` imports and calls `launchApp()`; the dev debug-agent block is preserved.
- W-4 gate: `grep -E "wsFactory|bridgeFactory|TestingDependencies" packages/g2-app/src/index.ts` returns nothing.
- launchApp branches all unit-tested (no-auth boot / paired→wizard / unpaired→wizard / fail-soft).
- Wizard COMPLETION redirects to `../index.html`; REPAIR does not.
- INV-4: full g2-app vitest suite green, tsc clean, biome clean on touched files, changeset declared.
</verification>

<success_criteria>
- On `index.html` load, `bootEngine` is actually invoked in the no-auth simulator path (glasses show boot sequence + HUD frame instead of black).
- Unpaired / paired-non-dev launches route to the wizard rather than staying black.
- Wizard completion hands off to the engine via redirect to `index.html`.
- `index.ts` stays thin (W-4 grep gate green); the engine is NOT reimplemented — only `bootEngine` is called.
- Boot errors fail soft (console.error, no top-level throw).
- `@evf/g2-app` bumped to 0.2.3 with a changeset; INV-4 gates pass.
</success_criteria>

<output>
Create `.planning/quick/260604-ovn-wire-the-production-launch-glue-so-index/260604-ovn-SUMMARY.md` when done.
</output>
