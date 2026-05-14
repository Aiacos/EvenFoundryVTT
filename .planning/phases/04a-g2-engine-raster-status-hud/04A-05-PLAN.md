---
phase: 04a
plan: 05
type: execute
wave: 3
depends_on: ["04a-03", "04a-04"]
files_modified:
  - packages/g2-app/src/index.ts
  - packages/g2-app/src/__tests__/example-status-hud.test.ts
  - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts
  - docs/architecture/0009-layer-manager-contract.md
  - docs/architecture/README.md
autonomous: false
requirements: [DISP-01, DISP-02, DISP-03, MAP-01, MAP-02, MAP-03, MAP-04, NAV-04, I18N-04]
user_setup: []
tags: [g2-app, integration, smoke, adr-0009-accept, human-checkpoint, wave-3]
must_haves:
  truths:
    - "packages/g2-app/src/index.ts boots the engine end-to-end: waitForEvenAppBridge → createBootPage → showBootSplash → performCapabilityHandshake → setNegotiatedCaps + setBleVerdict → mount MapBaseLayer (z=0) + IdleInfillLayer (z=0.5) + StatusHudLayer (z=1)"
    - "Scene-renderer smoke test runs entire boot → first frame flow against mock EvenAppBridge + mock WebSocket and exits with 0 capture-invariant violations"
    - "ADR-0009 moves from `proposed` to `accepted` status after the smoke test passes; PROVISIONAL Branch A SC carrying human_needed gates are listed in the ADR Confirmation section"
    - "Phase 4a human-verify checkpoint pauses for the operator to acknowledge that 5 hardware-pending SC (capability handshake on real G2, raster ≥5 fps, BLE fallback, PIXI extract perf, INV-1 on real phosphor display) remain human_needed per ADR-0005"
    - "ROADMAP.md Phase 4a Plans table shows 5/5 plans complete (auto-updated by execute-plan postscript)"
  artifacts:
    - path: "packages/g2-app/src/index.ts"
      provides: "real boot entry replacing the placeholder; calls installHubPolyfill (for wizard backward compat) + bootEngine() that wires LayerManager + the 3 layers + RasterController"
      contains: "performCapabilityHandshake"
    - path: "packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts"
      provides: "end-to-end integration test of the boot flow under happy-dom + Worker mock; asserts capture-invariant + handshake + layer mount order"
      exports: ["(test only)"]
    - path: "packages/g2-app/src/__tests__/example-status-hud.test.ts"
      provides: "updated from Phase 1 placeholder to consume real StatusHudRenderer + matchAsciiFixture against the 9 new fixtures"
      contains: "matchAsciiFixture"
    - path: "docs/architecture/0009-layer-manager-contract.md"
      provides: "ACCEPTED status; Amendments section reserved for Phase 4b bundle() extensions"
      contains: "**ACCEPTED**"
  key_links:
    - from: "packages/g2-app/src/index.ts"
      to: "all engine + raster + status-hud modules"
      via: "single boot function importing every Layer + RasterController + LayerManager"
      pattern: "import.*from '\\./engine/|import.*from '\\./raster/|import.*from '\\./status-hud/"
    - from: "packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts"
      to: "packages/g2-app/src/index.ts bootEngine()"
      via: "direct invocation under happy-dom with mocked bridge + WS"
      pattern: "bootEngine"
    - from: "docs/architecture/0009-layer-manager-contract.md"
      to: "Plan 02 layer-manager.test.ts"
      via: "Confirmation section cites the test file as the invariant verification artifact"
      pattern: "layer-manager\\.test\\.ts"

threat_model:
  trust_boundaries:
    - description: "Phase 4a integration: all individual trust boundaries from Plans 02-04 compose here; the smoke test exercises the full stack end-to-end against mocks"
    - description: "Hardware checkpoint boundary: software is green; real-device behavior is the next trust transition (Phase 4b + field test)"
  threats:
    - id: "T-4a-05-01"
      category: "T"
      component: "scene-renderer-smoke.test.ts mock fidelity"
      disposition: "mitigate"
      mitigation_plan: "Smoke test uses the SAME mocks as Plans 02-04 (worker-mock + makeMockBridge + MockSocket); does not invent new mock surfaces that could mask real bugs. Hardware path verification is human_needed per ADR-0005"
    - id: "T-4a-05-02"
      category: "D"
      component: "index.ts boot order dependency chain"
      disposition: "mitigate"
      mitigation_plan: "Explicit await sequence: waitForEvenAppBridge → createBootPage → showBootSplash → performCapabilityHandshake → ble probe → setMapMode → mount layers in order z=0, z=0.5, z=1. Any reject propagates and the smoke test asserts the boot fails closed (no half-initialized state)"
    - id: "T-4a-05-03"
      category: "I"
      component: "ADR-0009 status transition"
      disposition: "accept"
      mitigation_plan: "ADR-0009 ACCEPT requires Wave 2 tests green; the checkpoint in this plan is the human gate that confirms the transition"
---

<objective>
Integration smoke + ADR-0009 ACCEPTed + human checkpoint for hardware-pending SC. This plan closes the loop on Phase 4a by wiring the deliverables of Plans 02-04 into a single boot path and ratifying the Layer Manager contract.

Purpose: After Plans 02-04 ship in parallel, the individual modules need to compose into a single boot flow. This plan provides the integration entry point (`packages/g2-app/src/index.ts` real entry, replacing the Phase 1 placeholder), the end-to-end smoke test that proves the modules compose without capture-invariant violations, the ADR-0009 transition from `proposed` to `accepted`, and the human-verify checkpoint that surfaces the 5 hardware-pending SC carrying `human_needed` per ADR-0005 PROVISIONAL Branch A.

Output: 3 source/test files modified + ADR-0009 status updated + docs/architecture/README.md ADR index row updated + ROADMAP Phase 4a row marked 5/5 complete. The plan is NOT autonomous — Task 3 is a `checkpoint:human-verify` that pauses for the operator to acknowledge hardware-pending SC remain on the human gate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-VALIDATION.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-01-SUMMARY.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-02-SUMMARY.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-03-SUMMARY.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-04-SUMMARY.md
@docs/architecture/0001-layered-ui-model.md
@docs/architecture/0005-phase0-go-no-go.md
@docs/architecture/0009-layer-manager-contract.md
@packages/g2-app/src/index.ts
@packages/g2-app/src/__tests__/example-status-hud.test.ts
@packages/g2-app/src/hub-polyfill.ts
@packages/g2-app/src/engine/layer-manager.ts
@packages/g2-app/src/engine/page-lifecycle.ts
@packages/g2-app/src/engine/capability-handshake.ts
@packages/g2-app/src/engine/boot-splash.ts
@packages/g2-app/src/raster/map-base-layer.ts
@packages/g2-app/src/raster/raster-controller.ts
@packages/g2-app/src/status-hud/status-hud-layer.ts
@packages/g2-app/src/status-hud/idle-infill-layer.ts

<interfaces>
<!-- This plan composes; it does not introduce new types. See Plans 02-04 SUMMARYs for the full export surface. -->

Plan 02 exports:
- `LayerManager` (mount/destroy/bundle/setNegotiatedCaps/setMapMode/getMapMode)
- `createBootPage(bridge)`, `createMainPage(bridge)`, `rebuildToOverlay(bridge, def)`
- `performCapabilityHandshake(ws, token, locale, sessionId?, timeoutMs?)`, `probeBleThroughput(bytes, durationMs)`, `HandshakeError`
- `showBootSplash(bridge, {steps, protocolVersion, panelsAvailable, containerName?})`, `BootStepState`

Plan 03 exports:
- `RasterController` (constructed with bridge; requestFrame/setBleVerdict/getBleVerdict/startIdleHeartbeat/terminate)
- `MapBaseLayer` implements Layer (id='map-base'; getCaptureContainer→'map-capture'; draw routes to raster|glyph)
- `renderGlyphScene`, `buildGlyphGrid`
- `TileDelta`, `encodeRle4bit`, `decodeRle4bit`

Plan 04 exports:
- `StatusHudLayer` implements Layer (id='status-hud'; no getCaptureContainer)
- `IdleInfillLayer` implements Layer (id='idle-infill'; no getCaptureContainer)
- `StatusHudRenderer`, `HUD_WIDTH_BUDGETS`, `assertWithinBudget`
- 9 fixture files in packages/shared-render/src/fixtures/

Existing Plan 02 contracts the smoke test mocks:
- mock EvenAppBridge per PATTERNS.md §makeMockBridge factory
- mock WebSocket per PATTERNS.md §MockSocket EventEmitter pattern
- mock wsEvents (`{subscribe(channel, fn)}`)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Real boot entry (packages/g2-app/src/index.ts) + scene-renderer-smoke integration test</name>
  <read_first>
    - packages/g2-app/src/index.ts (current Phase 1 placeholder — about to replace)
    - packages/g2-app/src/hub-polyfill.ts (the existing installHubPolyfill function — index.ts must continue to call this for Phase 2 wizard backward compat)
    - packages/g2-app/src/wizard/wizard.ts (existing wizard entry — should remain callable from index.ts via a route check; do NOT delete wizard wiring)
    - packages/g2-app/src/__tests__/example-status-hud.test.ts (Phase 1 throwaway — to be replaced with a real boot smoke test that consumes Plan 04's status-hud.loading.txt fixture)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Recommended Project Structure (canonical g2-app/src/ tree showing index.ts replaces placeholder, hub-polyfill stays, wizard/ unchanged)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-VALIDATION.md §Per-Task Verification Map row 4a-05-01 (smoke test command + behavior)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Screen 1 + §Interaction Contract (the boot order is: splash → handshake → main HUD with map-capture as the capture container)
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md (the full integration target — every locked decision composes here)
    - All four prior SUMMARYs (04a-01-SUMMARY.md, 04a-02-SUMMARY.md, 04a-03-SUMMARY.md, 04a-04-SUMMARY.md) — these record any deviations from the plans that the smoke test must account for
  </read_first>
  <files>packages/g2-app/src/index.ts, packages/g2-app/src/__tests__/example-status-hud.test.ts, packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts</files>
  <action>
    **1. Replace `packages/g2-app/src/index.ts` with the real boot entry:**

    Module JSDoc citing CLAUDE.md §Repository state (Phase 4a entry replaces Phase 4a placeholder), 04A-RESEARCH.md §Recommended Project Structure.

    File structure:
    1. `import { installHubPolyfill } from './hub-polyfill.js'` — preserved for Phase 2 wizard backward compat per RESEARCH §Project Structure note "hub-polyfill stays".
    2. `import { LayerManager } from './engine/layer-manager.js'` + `import { createBootPage, createMainPage } from './engine/page-lifecycle.js'` + `import { performCapabilityHandshake, probeBleThroughput, HandshakeError } from './engine/capability-handshake.js'` + `import { showBootSplash } from './engine/boot-splash.js'` + `import { ZIndex } from './engine/layer-types.js'`.
    3. `import { RasterController } from './raster/raster-controller.js'` + `import { MapBaseLayer } from './raster/map-base-layer.js'` + `import { renderGlyphScene } from './raster/glyph-renderer.js'`.
    4. `import { StatusHudLayer } from './status-hud/status-hud-layer.js'` + `import { StatusHudRenderer } from './status-hud/status-hud-renderer.js'` + `import { IdleInfillLayer } from './status-hud/idle-infill-layer.js'`.
    5. `import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'`.

    Exports + entry behavior:
    - `export interface BootEngineOpts { bridgeUrl: string; token: string; locale: 'it'|'en'|'de' }`
    - `export async function bootEngine(opts: BootEngineOpts, dependencies?: { wsFactory?: (url: string) => WebSocket; bridgeFactory?: () => Promise<EvenAppBridge> }): Promise<{ layerManager: LayerManager; rasterController: RasterController; teardown: () => void }>` — the integration entry point.

    Boot sequence inside `bootEngine`:
    1. Call `installHubPolyfill()` (idempotent per its existing implementation).
    2. `const bridge = await (dependencies?.bridgeFactory ?? waitForEvenAppBridge)()`.
    3. `await createBootPage(bridge)` (the 11-container page from Plan 02).
    4. `await showBootSplash(bridge, { steps: [...], protocolVersion: '1.0', panelsAvailable: 5 })` — initial 5 step entries marked `[ ⟳ ]` then `[ ✓ ]` per UI-SPEC §Screen 1 State table.
    5. `const ws = (dependencies?.wsFactory ?? (url => new WebSocket(url)))(opts.bridgeUrl)` then await `'open'` event.
    6. `const handshake = await performCapabilityHandshake(ws, opts.token, opts.locale)`.
    7. `const lm = new LayerManager(bridge); lm.setNegotiatedCaps(new Set(handshake.server_caps))`.
    8. `const controller = new RasterController(bridge)`.
    9. Probe phase: collect bytesObserved + duration during a 1 s window (real probe is hardware-pending per ADR-0005; for software boot the probe is a no-op returning 'auto') → `controller.setBleVerdict(probeBleThroughput(...))` then `lm.setMapMode('auto')`.
    10. Build the 3 layers: `mapBase = new MapBaseLayer(bridge, controller, renderGlyphScene, lm)`, `idleInfill = new IdleInfillLayer(bridge, lm.getMapMode())`, `statusHud = new StatusHudLayer({ bridge, renderer: new StatusHudRenderer({locale: opts.locale}), wsEvents: createWsEventBus(ws) })`. The `createWsEventBus(ws)` is a small inline helper that adapts WebSocket message events into the `{subscribe(channel, fn): unsubscribe}` shape StatusHudLayer expects — implement inline (~10 lines).
    11. Mount in atomic bundle to satisfy capture-invariant: `await lm.bundle([{type:'mount', z: ZIndex.Z0_MAP, layer: mapBase}, {type:'mount', z: ZIndex.Z0_5_IDLE_INFILL, layer: idleInfill}, {type:'mount', z: ZIndex.Z1_STATUS_HUD, layer: statusHud}])` — bundle ensures exactly one rebuildPageContainer flush per CONTEXT.md Area 1.
    12. `await mapBase.draw()` to render the first frame (raster or glyph based on mode).
    13. `return { layerManager: lm, rasterController: controller, teardown: () => { controller.terminate(); lm.destroy(ZIndex.Z1_STATUS_HUD); lm.destroy(ZIndex.Z0_5_IDLE_INFILL); lm.destroy(ZIndex.Z0_MAP); ws.close() } }`.

    Failure handling:
    - HandshakeError → log + propagate (Plan 02 boot-splash already renders the in-progress checklist; full error screen UX is Phase 4b BOOT-01).
    - Layer mount throwing LayerManagerError → propagate; teardown not returned (boot fails closed).

    **2. Replace `packages/g2-app/src/__tests__/example-status-hud.test.ts`:**

    Phase 1 had a throwaway placeholder. Replace it with a real test that:
    - Imports StatusHudRenderer + matchAsciiFixture from @evf/shared-render
    - `it('renders loading state with em-dash placeholders (INV-1 ck 15)')` — calls `renderer.renderLoading()` and `matchAsciiFixture(grid, '../../../shared-render/src/fixtures/status-hud.loading.txt')` (3-dirs-up from `src/__tests__/` to `packages/`).
    - `it('renders IT raster idle (INV-1 ck 14)')` — full snapshot match against `glyph-scene.raster-idle-it.txt`.
    - `it('renders DE raster idle (INV-1 ck 14)')` — full snapshot match against `glyph-scene.raster-idle-de.txt`.

    Note this test file is at `packages/g2-app/src/__tests__/` (3 dirs up to `packages/`) — different path offset than Plan 04's tests which live in `src/status-hud/__tests__/` (4 dirs up).

    **3. Create `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts`:**

    The end-to-end integration smoke. Uses the worker-mock + makeMockBridge + MockSocket factories already established in earlier plans.

    Tests:
    - Test SR-1: `bootEngine({bridgeUrl, token, locale}, {wsFactory: () => mockSocket, bridgeFactory: async () => mockBridge})` completes without throwing.
    - Test SR-2: After bootEngine, the mock bridge received `createStartUpPageContainer` exactly once (boot page) — `mockBridge.createStartUpPageContainer.mock.calls.length === 1`.
    - Test SR-3: After bootEngine, mockBridge received `rebuildPageContainer` exactly once (from the bundled 3-layer mount) — proves CONTEXT.md Area 1 atomic bundle.
    - Test SR-4: The mounted layer set in LayerManager satisfies capture-invariant: `lm.getCaptureContainerCount() === 1` (the map-capture from MapBaseLayer).
    - Test SR-5: showBootSplash was called and bridge.textContainerUpgrade received the 5 expected step labels in order (verify via mock call sequence).
    - Test SR-6: performCapabilityHandshake sent the HandshakeClient JSON over ws.send; MockSocket fires a valid HandshakeServer response; LayerManager.setNegotiatedCaps was called with the returned server_caps Set.
    - Test SR-7: After successful boot, calling `teardown()` clears all timers + terminates the raster worker (verify mockWorker.terminate.mock.calls.length === 1).
    - Test SR-8: When MockSocket fires a CharacterSnapshot delta, after the 200 ms debounce StatusHudLayer.draw renders via bridge.textContainerUpgrade with containerName 'status-hud'.

    All assertions use vi.useFakeTimers() for the debounce/heartbeat steps to keep the test fast (target <500 ms total).

    Constraints:
    - bootEngine MUST accept the `dependencies` injection parameter so tests can supply mocks (testability).
    - Do not write to STATE.md, ROADMAP.md, or ADR-0009 in this task — Task 2 handles those.
    - JSDoc on `bootEngine` and `BootEngineOpts`.
    - INV-4: zero dead code. If installHubPolyfill is called but the polyfill is dead in the engine path, keep the call because wizard.ts still relies on it.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/__tests__/example-status-hud.test.ts src/__tests__/scene-renderer-smoke.test.ts && grep -c 'bootEngine' packages/g2-app/src/index.ts && grep -c 'installHubPolyfill' packages/g2-app/src/index.ts && grep -c 'LayerManager' packages/g2-app/src/index.ts && grep -c 'RasterController' packages/g2-app/src/index.ts && grep -c 'StatusHudLayer' packages/g2-app/src/index.ts && grep -c 'IdleInfillLayer' packages/g2-app/src/index.ts && grep -c 'MapBaseLayer' packages/g2-app/src/index.ts && grep -c 'lm.bundle' packages/g2-app/src/index.ts && grep -c 'matchAsciiFixture' packages/g2-app/src/__tests__/example-status-hud.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Both test files green (11 tests minimum: 3 example-status-hud + 8 scene-renderer-smoke); index.ts wires every Layer + LayerManager + RasterController + installHubPolyfill + bundles atomic mount; example-status-hud test consumes matchAsciiFixture; typecheck + lint:ci both exit 0.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: ADR-0009 ACCEPTed + docs/architecture/README.md ADR index update + ROADMAP postscript</name>
  <read_first>
    - docs/architecture/0009-layer-manager-contract.md (the Plan 01 scaffold; Status currently `PROPOSED`)
    - docs/architecture/0001-layered-ui-model.md (lines 38-58 — the exact format of an ACCEPTED status line + Confirmation section bullets; analog for the transition)
    - docs/architecture/README.md (current ADR index — find the ADR-0009 row from Plan 01 and update its status column)
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-01-SUMMARY.md + 04a-02-SUMMARY.md + 04a-03-SUMMARY.md + 04a-04-SUMMARY.md (which test files prove the contract; cite them in the Confirmation section)
    - .planning/ROADMAP.md §Phase 4a (the Plans table to update to 5/5 complete; also the Progress table row)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-VALIDATION.md §Manual-Only Verifications (the 5 human_needed entries to summarize in ADR-0009 Confirmation + PROVISIONAL gates section)
    - docs/architecture/0005-phase0-go-no-go.md (PROVISIONAL Branch A — ADR-0009 must cross-reference this for the human_needed gating)
  </read_first>
  <files>docs/architecture/0009-layer-manager-contract.md, docs/architecture/README.md, .planning/ROADMAP.md</files>
  <action>
    **1. Update `docs/architecture/0009-layer-manager-contract.md`:**

    Frontmatter: change `status: proposed` → `status: accepted` and add `last_amended: 2026-05-15` (or actual commit date).

    Status section: change `**PROPOSED** — 2026-05-15. Will move to ACCEPTED in Phase 4a Plan 05 after layer-manager tests are green.` → `**ACCEPTED** — 2026-05-15. Binds Phase 4a (G2 Engine + Raster + Status HUD), Phase 4b (Overlay Slot + Map Mode Toggle), Phase 5 (Panel Plugin System).`

    Confirmation section: rewrite to list specific verification artifacts produced by Plans 02-05:
    - `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` — capture-invariant at 0/1/2 capture counts; capability-gate; bundle single-flush (Plan 02)
    - `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` — end-to-end boot flow with atomic 3-layer bundle and zero capture-invariant violations (Plan 05)
    - `packages/shared-render/src/fixtures/*.txt` — 9 INV-1 fixtures locking character-perfect layout across raster/glyph/loading states (Plan 04)

    PROVISIONAL Hardware Gates section (new, can be appended after Pros and Cons): explicitly list the 5 SC inheriting human_needed from ADR-0005 per 04A-VALIDATION.md §Manual-Only Verifications:
    1. Capability handshake on real G2 (DISP-01, DISP-02, NAV-04)
    2. Raster sustains ≥5 fps standard with measured BLE p50 latency (MAP-02, MAP-04)
    3. Branch B/C glyph fallback auto-degrades without operator intervention (MAP-04)
    4. INV-1 layout holds character-perfect on real G2 phosphor display (DISP-03, I18N-04)
    5. PIXI canvas extract via OffscreenCanvas does NOT block Foundry desktop UI (Specs §11.5.7 pitfall 11)

    Each entry cross-refs ADR-0005 Branch A PROVISIONAL status and identifies the validation-harness command (`pnpm --filter @evf/validation-harness validate:all`) that closes the gate when hardware grants land.

    Amendments section (new, empty placeholder): `### Amendment 1 (reserved): Phase 4b bundle() composition rules for modal-on-modal (CONC-01 + DEATH-01 race)`.

    **2. Update `docs/architecture/README.md`:**

    Find the ADR-0009 row added in Plan 01 and update the status column from `Proposed` to `Accepted`. If the README ADR index does not have a status column, simply confirm ADR-0009 row exists and add a note to the SUMMARY that the README format was inspected.

    **3. Update `.planning/ROADMAP.md`:**

    Two edits:
    1. In §Phase 4a Plan list (line ~109 in ROADMAP.md per current state — verify before editing): add the 5 plan lines `- [ ] 04A-01-PLAN.md — ...`, `- [ ] 04A-02-PLAN.md — ...`, `- [ ] 04A-03-PLAN.md — ...`, `- [ ] 04A-04-PLAN.md — ...`, `- [ ] 04A-05-PLAN.md — ...` (the plan-phase orchestrator will normally do this but if absent at write-time, add them; checked off when execute-plan runs).
    2. In §Progress table, update row `| 4a. G2 Engine + Raster + Status HUD | 0/TBD | Not started | - |` → `| 4a. G2 Engine + Raster + Status HUD | 0/5 | In Progress (post-Plan 05 ACCEPT) | - |`.

    Constraints:
    - INV-3 doc coherence: if any change here touches Specs.md (it should NOT — Phase 4a doesn't bump spec version), the same commit must update README.md + docs/showcase/index.html. Default assumption: Phase 4a is internal infrastructure and does not touch Specs.md.
    - Pre-commit hook will run Biome on the markdown — accept any auto-format diff.
  </action>
  <verify>
    <automated>grep -c '^status: accepted' docs/architecture/0009-layer-manager-contract.md && grep -c 'ACCEPTED' docs/architecture/0009-layer-manager-contract.md && grep -c 'layer-manager.test.ts' docs/architecture/0009-layer-manager-contract.md && grep -c 'scene-renderer-smoke.test.ts' docs/architecture/0009-layer-manager-contract.md && grep -c 'PROVISIONAL' docs/architecture/0009-layer-manager-contract.md && grep -c 'human_needed' docs/architecture/0009-layer-manager-contract.md && grep -c '0/5\|5/5\|/5' .planning/ROADMAP.md</automated>
  </verify>
  <done>
    ADR-0009 frontmatter shows `status: accepted`; body contains `ACCEPTED`, cites both test files, lists PROVISIONAL hardware gates, references human_needed. ROADMAP shows Phase 4a Plans count = 5.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human checkpoint — acknowledge 5 hardware-pending SC remain on human_needed gate</name>
  <files>(none — checkpoint task; no source files modified)</files>
  <what-built>
    Software-side Phase 4a is complete:
    - LayerManager singleton enforcing capture-invariant + capability gating + atomic bundle (Plan 02)
    - capability-handshake WS client + BLE throughput probe (Plan 02)
    - boot-splash 5-step checklist renderer (Plan 02)
    - page-lifecycle (createBootPage/createMainPage/rebuildToOverlay) (Plan 02)
    - Raster pipeline singleton Web Worker (image-q + upng-js + xxhash-wasm + OffscreenCanvas) with 10-stage pipeline (Plan 03)
    - RasterController with 200 ms debounce + 0.3 fps idle heartbeat + 3-consecutive-failure → glyph fallback (Plan 03)
    - Glyph renderer with canonical glyph dictionary + 96×24 AsciiGrid (Plan 03)
    - MapBaseLayer routing between raster + glyph via LayerManager.getMapMode() (Plan 03)
    - StatusHudLayer with 5 fields + 200 ms debounce + 30 s heartbeat + safeParse WS receive (Plan 04)
    - IdleInfillLayer (z=0.5) with raster/glyph mode degradation (Plan 04)
    - HUD_WIDTH_BUDGETS const-as-truth IT/EN/DE budget table + build-time `satisfies` gate (Plan 04)
    - 9 INV-1 ASCII fixtures locking layout across boot, raster (IT/EN/DE), glyph, loading, hp-overflow, conditions-overflow (Plan 04)
    - ADR-0009 ACCEPTed (Plan 05 Task 2)
    - Integration smoke test passing under happy-dom + Worker mock + MockSocket (Plan 05 Task 1)
  </what-built>
  <action>
    This is a `checkpoint:human-verify` task. The executor does not modify any source files in this task. Pause the workflow and present the `<how-to-verify>` checklist to the user. Wait for the `<resume-signal>` response before marking Phase 4a complete.

    On `approved` or `defer-hardware-tests`: proceed to phase close; the autonomous workflow will route the 5 hardware-pending SC through AskUserQuestion when hardware grants land.

    On any other response describing a software-side issue: stop, do NOT close the phase, surface the issue to the planner-revision workflow for a follow-up plan.
  </action>
  <how-to-verify>
    1. Confirm `pnpm lint:ci && pnpm typecheck && pnpm test:coverage` all exit 0 (full workspace).
    2. Confirm `docs/architecture/0009-layer-manager-contract.md` shows `status: accepted` and the Confirmation section references the specific test files.
    3. Confirm `packages/shared-render/src/fixtures/` contains 10 files total (the 1 baseline from Phase 1 + 9 new Phase 4a fixtures: glyph-scene.boot, glyph-scene.raster-idle, glyph-scene.raster-idle-{it,en,de}, glyph-scene.glyph-idle, status-hud.loading, status-hud.hp-overflow, status-hud.conditions-overflow).

    Acknowledge the following 5 SC remain on the **human_needed** gate per ADR-0005 PROVISIONAL Branch A (NOT software-verified; require real G2 + R1 hardware + 3 RF environments before they flip to PASSED):

    - **SC #1 — Capability handshake on real G2** (DISP-01, DISP-02, NAV-04): software-side end-to-end smoke passes against mocks; real-device boot → splash → handshake → main HUD requires QR-paired G2 from Phase 2 wizard + Even App WebView loading the plugin host. Test command (when hardware lands): pair → open plugin URL → verify splash within 3 s → HUD card within 8 s → console `handshake.complete` log.
    - **SC #3 — Raster ≥5 fps standard with measured BLE p50 latency** (MAP-02, MAP-04): software-side bench OK; real-device fps + BLE p50 in Phase 0 envelope cannot be simulated. Test command: `pnpm validation-harness sustain --duration 600 --raster-fps 5` against paired G2.
    - **SC #3b — Branch B/C glyph fallback auto-degrades without operator intervention** (MAP-04): software trigger (`setBleVerdict('glyph')` from RasterController) is unit-tested + smoke-tested; real RF degradation profile cannot be simulated. Test command: pair G2 in microwave-loaded 2.4 GHz env, observe handshake probe <100 kbps, verify glyph mode engages + `[GLY]` badge visible.
    - **SC #4 — INV-1 layout holds character-perfect on real G2 phosphor display** (DISP-03, I18N-04): 9 ASCII fixtures verified char-by-char under Vitest; real-device font rendering across IT/EN/DE locales requires eyeball verification at physical column boundaries. Test: photograph Status HUD under each locale + HP=999/999, verify col 68 divider straight.
    - **SC #5 — PIXI canvas extract via OffscreenCanvas does NOT block Foundry desktop UI** (Specs §11.5.7 pitfall 11): Worker isolation enforced software-side; real Foundry desktop UI thread contention requires real player canvas + token drag. Test: combat scene + drag token 30 s, verify desktop UI interactive + ≥5 fps on Worker thread.

    The autonomous workflow will route these 5 SC through AskUserQuestion at hardware-grant time. Type `approved` to ACKNOWLEDGE that the software-side phase is complete and the 5 SC remain on the human_needed gate per ADR-0005.

    Alternative responses:
    - `defer-hardware-tests` — same as approved; explicitly tracks the deferral
    - Description of any software-side issue uncovered during checkpoint review (e.g., test flakiness, lint warning, INV-3 doc drift)
  </how-to-verify>
  <verify>
    <automated>echo "Checkpoint task — human-gated; no automated verify. Operator confirmation required via resume-signal."</automated>
  </verify>
  <done>
    Operator typed `approved` or `defer-hardware-tests` AND the prior two tasks' automated verify gates all passed. The 5 hardware-pending SC are acknowledged as carrying ADR-0005 PROVISIONAL Branch A human_needed gates.
  </done>
  <resume-signal>Type `approved` or `defer-hardware-tests` to close Phase 4a; or describe any software-side issue to revise before close.</resume-signal>
</task>

</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Plan 02-04 modules compose in bootEngine | Each plan's threat mitigations carry through; smoke test exercises the composed surface |
| ADR-0009 status transition | Documentation transition is human-gated via Task 3 checkpoint |
| Hardware gate | 5 SC remain outside software trust boundary; require real-device verification |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4a-05-01 | T | scene-renderer-smoke.test.ts mock fidelity | mitigate | Reuse the same mocks (worker-mock, makeMockBridge, MockSocket) that Plans 02-04 already use; hardware path verification is human_needed |
| T-4a-05-02 | D | index.ts boot order dependency chain | mitigate | Sequential awaits with explicit failure propagation; smoke test SR-1 asserts no throw on happy path; teardown function returned for cleanup |
| T-4a-05-03 | I | ADR-0009 status transition | accept | Reviewer-gated checkpoint Task 3; transition only after Wave 2 tests green |
| T-4a-05-04 | S | bootEngine dependency injection accepts arbitrary wsFactory/bridgeFactory | accept | DI is test-only convenience; production callers use real `waitForEvenAppBridge` + `new WebSocket(url)` defaults |
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 with smoke test + example-status-hud test green
- `pnpm lint:ci && pnpm typecheck && pnpm test:coverage` exit 0 across full workspace
- ADR-0009 status is `accepted`; references both layer-manager.test.ts and scene-renderer-smoke.test.ts
- 9 INV-1 fixtures present in packages/shared-render/src/fixtures/
- ROADMAP Phase 4a shows 5/5 plans
- 5 hardware-pending SC explicitly acknowledged in ADR-0009 PROVISIONAL Hardware Gates section
- Human checkpoint approved → Phase 4a software-side complete; hardware SC routed to autonomous workflow AskUserQuestion at grant time

**Hardware-pending verifications (verification_mode: human_needed per ADR-0005 PROVISIONAL Branch A):**
- 5 SC listed in Task 3 checkpoint above — each cross-refs ADR-0005 and the validation-harness command that closes the gate
</verification>

<success_criteria>
Phase 4a closes when:
- DISP-01 ✅ (software): Status HUD persistent z=1 layer + INV-1 fixtures; hardware INV-1 on phosphor display = human_needed (SC #4)
- DISP-02 ✅ (software + smoke): capture-invariant enforced at every mount/destroy/bundle + tested under integration smoke; real G2 verification = human_needed (SC #1)
- DISP-03 ✅: 9 INV-1 fixtures lock character-perfect layout; CI snapshot drift detection active; real phosphor verification = human_needed (SC #4)
- MAP-01 ✅ (software): Raster pipeline produces 4-bit indexed PNGs via 10-stage Worker pipeline; smoke proves dispatch to bridge.updateImageRawData
- MAP-02 ✅ (software): Glyph fallback renderer + auto-trigger software-tested; hardware verification = human_needed (SC #3b)
- MAP-03 ✅ (software): 6-layer optimization stack — delta hash (xxhash) + sub-tile encoding (28 sub-tiles/tile) + custom RLE + idle heartbeat (Layer 6) all in source; BLE 4.2+ DLE is platform-level; BLE p50 hardware = human_needed (SC #3)
- MAP-04 ✅ (software): pipeline produces frames; ≥5 fps sustained on real hardware = human_needed (SC #3)
- NAV-04 ✅ (software): boot splash → handshake → main HUD wired end-to-end and smoke-tested; real G2 verification = human_needed (SC #1)
- I18N-04 ✅: HUD_WIDTH_BUDGETS `satisfies` build-time gate + IT/EN/DE fixtures verify width budget enforced; real-device locale verification = human_needed (SC #4)
- ADR-0009 ACCEPTED
- Phase 4b (next phase) has stable LayerManager API, MapBaseLayer at z=0, IdleInfillLayer at z=0.5 reservation contract, and StatusHudLayer at z=1 to build upon
</success_criteria>

<output>
After completion, create `.planning/phases/04a-g2-engine-raster-status-hud/04a-05-SUMMARY.md` capturing:
- bootEngine() signature delivered (including the test-only dependencies injection parameter)
- Smoke test count green (target: 8 in scene-renderer-smoke.test.ts + 3 in example-status-hud.test.ts = 11 minimum)
- ADR-0009 ACCEPT diff summary (frontmatter status change, Confirmation rewrite, PROVISIONAL Hardware Gates section content)
- 5 human_needed SC explicitly enumerated with their REQ-ID + ADR-0005 cross-ref + closing test command
- Whether the human checkpoint was approved or revisions were requested (and what they were)
- Full Phase 4a totals: total files modified across Plans 01-05; total tests added (target: ~80-90 unit tests + smoke + INV-1 snapshots); total commits
</output>
