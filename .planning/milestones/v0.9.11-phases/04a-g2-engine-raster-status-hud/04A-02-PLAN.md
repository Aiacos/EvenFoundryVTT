---
phase: 04a
plan: 02
type: execute
wave: 1
depends_on: ["04a-01"]
files_modified:
  - packages/g2-app/src/engine/layer-manager.ts
  - packages/g2-app/src/engine/page-lifecycle.ts
  - packages/g2-app/src/engine/capability-handshake.ts
  - packages/g2-app/src/engine/boot-splash.ts
  - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
  - packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts
  - packages/g2-app/src/engine/__tests__/capability-handshake.test.ts
  - packages/g2-app/src/engine/__tests__/boot-splash.test.ts
autonomous: true
requirements: [DISP-01, DISP-02, NAV-04]
user_setup: []
tags: [g2-app, engine, layer-manager, handshake, boot-splash, wave-1]
must_haves:
  truths:
    - "LayerManager enforces exactly 1 isEventCapture=1 container after every mount/destroy/bundle (capture-invariant unit-tested at 0/1/2 capture counts)"
    - "LayerManager refuses to mount a layer whose requiredCaps are not in the negotiated SERVER_CAPS_V1 set (capability_gate_denied error)"
    - "bundle([ops]) applies all ops then calls bridge.rebuildPageContainer exactly once (single render flush)"
    - "performCapabilityHandshake sends HandshakeClient JSON over WebSocket, parses HandshakeServer response via safeParse, returns negotiated caps + session_id + replay_seq"
    - "BLE throughput probe after handshake returns 'auto'|'raster'|'glyph' branch verdict; threshold <100 kbps sustained → glyph"
    - "page-lifecycle.createBootPage() calls bridge.createStartUpPageContainer with the 4-image + 7-text container schema declared in 04A-UI-SPEC.md §Container Budget Allocation"
    - "boot-splash renders the 5-step checklist via textContainerUpgrade in order: G2 display → R1 paired → Bridge ws → Foundry sync → Character"
  artifacts:
    - path: "packages/g2-app/src/engine/layer-manager.ts"
      provides: "Singleton class exposing mount/destroy/bundle/setMapMode/setNegotiatedCaps; enforces capture + capability invariants"
      exports: ["LayerManager"]
    - path: "packages/g2-app/src/engine/page-lifecycle.ts"
      provides: "createBootPage(), createMainPage(), rebuildToOverlay() wrappers around EvenAppBridge envelope calls"
      exports: ["createBootPage", "createMainPage", "rebuildToOverlay"]
    - path: "packages/g2-app/src/engine/capability-handshake.ts"
      provides: "performCapabilityHandshake() WS client + probeBleThroughput() returning Branch verdict"
      exports: ["performCapabilityHandshake", "probeBleThroughput", "HandshakeError"]
    - path: "packages/g2-app/src/engine/boot-splash.ts"
      provides: "showBootSplash(bridge, steps[]) renders 5-step checklist; transitions to main HUD on completion"
      exports: ["showBootSplash", "BootStepState"]
  key_links:
    - from: "packages/g2-app/src/engine/layer-manager.ts"
      to: "@evenrealities/even_hub_sdk EvenAppBridge"
      via: "bridge.rebuildPageContainer in _flushPage()"
      pattern: "bridge\\.rebuildPageContainer"
    - from: "packages/g2-app/src/engine/capability-handshake.ts"
      to: "@evf/shared-protocol HandshakeClientSchema + HandshakeServerSchema"
      via: "import + safeParse at WS boundary"
      pattern: "HandshakeServerSchema\\.safeParse"
    - from: "packages/g2-app/src/engine/boot-splash.ts"
      to: "packages/g2-app/src/engine/page-lifecycle.ts createBootPage"
      via: "await createBootPage(bridge) before rendering steps"
      pattern: "createBootPage"
    - from: "packages/g2-app/src/engine/layer-manager.ts"
      to: "packages/g2-app/src/engine/layer-types.ts"
      via: "import type { ZIndex, Layer, LayerOp, LayerManagerError }"
      pattern: "from '\\./layer-types"

threat_model:
  trust_boundaries:
    - description: "Bridge WS → g2-app: untrusted JSON enters at handshake response parse"
    - description: "EvenAppBridge envelope: each call dispatches via flutterBridge to host runtime (trusted Even Realities App WebView)"
  threats:
    - id: "T-4a-02-01"
      category: "T"
      component: "capability-handshake.ts HandshakeServer parse"
      disposition: "mitigate"
      mitigation_plan: "All handshake responses parsed via HandshakeServerSchema.safeParse (never .parse). On schema failure → HandshakeError('schema_failed'). On JSON.parse failure → HandshakeError('parse_failed'). Never throw raw Error strings; never trust ev.data unvalidated."
    - id: "T-4a-02-02"
      category: "T"
      component: "layer-manager.ts capability gating"
      disposition: "mitigate"
      mitigation_plan: "mount() checks every requiredCap against negotiatedCaps Set before insertion into layers Map. Missing cap → LayerManagerError('capability_gate_denied'). Negotiated caps come from handshake response (already schema-validated)."
    - id: "T-4a-02-03"
      category: "D"
      component: "performCapabilityHandshake() never-resolving Promise"
      disposition: "mitigate"
      mitigation_plan: "Wrap message listener in a timeout race (10 s); on timeout → reject with HandshakeError('timeout'). Caller (Plan 05 smoke test) renders boot-error state on rejection (Phase 4b will fully specify error UI; Plan 02 reserves the failure code path)."
    - id: "T-4a-02-04"
      category: "I"
      component: "boot-splash.ts checklist rendering"
      disposition: "accept"
      mitigation_plan: "Boot status strings are static (no user input). No PII rendered. Information disclosure surface limited to bridge URL which is already paired via QR (Phase 2)."
---

<objective>
Land the four core engine modules that the rest of Phase 4a depends on: LayerManager singleton, page-lifecycle wrappers, capability-handshake WS client, and boot-splash sequential renderer.

Purpose: This plan is the foundational behavior layer. LayerManager is the singleton orchestrator that enforces ADR-0001 + ADR-0009 invariants (exactly-one capture container, capability gating, atomic bundle). Capability-handshake is the WS client half of Phase 3's server handshake. Boot-splash is the visible boot path that NAV-04 measures. All four modules use EvenAppBridge directly (NOT the legacy hub.* polyfill).

Output: 4 source modules + 4 test files; layer-manager.test.ts covers capture-invariant at 0/1/2 capture counts; capability-handshake.test.ts mocks WebSocket + verifies safeParse path; page-lifecycle.test.ts mocks EvenAppBridge + verifies createBootPage container schema; boot-splash.test.ts verifies the 5-step sequence ordering.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-01-SUMMARY.md
@docs/architecture/0001-layered-ui-model.md
@docs/architecture/0009-layer-manager-contract.md
@packages/g2-app/src/engine/layer-types.ts
@packages/g2-app/src/hub-polyfill.ts
@packages/g2-app/src/wizard/wizard.ts
@packages/g2-app/src/wizard/steps/completion.ts
@packages/bridge/src/ws/handshake.ts
@packages/bridge/src/ws/handshake.test.ts
@packages/shared-protocol/src/handshake.ts
@packages/shared-protocol/src/index.ts

<interfaces>
<!-- Key SDK + protocol types this plan imports. -->
<!-- Source: /home/aiacos/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts + packages/shared-protocol/src/*. -->

From @evenrealities/even_hub_sdk:
- `class EvenAppBridge { static getInstance(): EvenAppBridge; createStartUpPageContainer(data: CreateStartUpPageContainer): Promise<StartUpPageCreateResult>; rebuildPageContainer(data: RebuildPageContainer): Promise<boolean>; updateImageRawData(data: ImageRawDataUpdate): Promise<ImageRawDataUpdateResult>; textContainerUpgrade(data: TextContainerUpgrade): Promise<boolean>; shutDownPageContainer(data: ShutDownPageContainer): Promise<boolean>; onDeviceStatusChanged(handler): unsubscribe; }`
- `function waitForEvenAppBridge(): Promise<EvenAppBridge>` — resolves on `evenAppBridgeReady` event
- `class CreateStartUpPageContainer { constructor(data?: Partial<{ containerTotalNum?: number; textObject?: TextContainerProperty[]; imageObject?: ImageContainerProperty[] }>) }`
- `class RebuildPageContainer { constructor(data?: Partial<{ containerTotalNum?: number; textObject?: TextContainerProperty[]; imageObject?: ImageContainerProperty[] }>) }`
- `class TextContainerProperty { constructor(data?: Partial<TextContainerProperty>); containerName: string; isEventCapture: 0|1; /* xPosition/yPosition/width/height etc. */ }`
- `class ImageContainerProperty { constructor(data?: Partial<ImageContainerProperty>); containerName: string; width: number; height: number; xPosition?: number; yPosition?: number }`
- `enum StartUpPageCreateResult { success, ... }` + namespace `StartUpPageCreateResult.normalize(raw): StartUpPageCreateResult`
- `enum ImageRawDataUpdateResult` + namespace `ImageRawDataUpdateResult.isSuccess(value): boolean`

From @evf/shared-protocol:
- `const SERVER_CAPS_V1 = ['read_char', 'read_combat', 'read_scene', 'subscribe'] as const`
- `type ServerCap = (typeof SERVER_CAPS_V1)[number]`
- `const HandshakeClientSchema = z.object({ proto, token, locale, capabilities, session_id? })`
- `const HandshakeServerSchema = z.object({ proto, server_caps, server_locale, session_id, replay_seq })`
- `type HandshakeServer = z.infer<typeof HandshakeServerSchema>`

From packages/g2-app/src/engine/layer-types.ts (created in Plan 01):
- `enum ZIndex { Z0_MAP = 0, Z0_5_IDLE_INFILL = 0.5, Z1_STATUS_HUD = 1, Z2_OVERLAY = 2 }`
- `interface Layer { id: string; draw(): Promise<void>; destroy(): void; getCaptureContainer?(): string }`
- `type LayerOp = { type: 'mount'; z: ZIndex; layer: Layer; requiredCaps?: ReadonlyArray<ServerCap> } | { type: 'destroy'; z: ZIndex }`
- `class LayerManagerError extends Error { readonly code: LayerManagerErrorCode }`

UI-SPEC §Container Budget Allocation — raster mode idle (this is the boot page schema):
- 4 image containers: `map-tile-0`, `map-tile-1`, `map-tile-2`, `map-tile-3` (200×100 each, positioned at 2×2 grid: (0,0), (200,0), (0,100), (200,100))
- 7 text containers: `header`, `footer`, `status-hud`, `map-capture` (isEventCapture=1), `z05-combat-log`, `z05-label`, `z05-stats`
- Exactly one isEventCapture=1 → `map-capture`
- containerTotalNum: 11 (4 image + 7 text); within 1-12 SDK limit
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: LayerManager singleton + invariant tests (TDD)</name>
  <read_first>
    - packages/g2-app/src/engine/layer-types.ts (the contracts created in Plan 01 — ZIndex, Layer, LayerOp, LayerManagerError)
    - packages/g2-app/src/wizard/wizard.ts (analog for singleton orchestrator pattern with mount/destroy lifecycle; PATTERNS.md identifies this as the role-match analog)
    - packages/g2-app/src/wizard/state.ts (lines 54-105 — createStore observable pattern; subscribe/unsubscribe contract LayerManager may emit for setMapMode listeners)
    - packages/bridge/src/ws/handshake.test.ts (analog for mock-heavy unit test with vi.fn() factories — see PATTERNS.md §__tests__/layer-manager.test.ts)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md lines 107-178 (verbatim singleton + invariant-assert pattern with capability gate, _assertCaptureInvariant, bundle ops loop)
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 1 (4 locked decisions: registration signature, z=0.5↔z=2 bundle, capture-invariant assertion, capability gating)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Interaction Contract (capture invariant rules — z=0 holds capture in default view; z=0.5/z=1 never hold capture; z=2 holds capture when mounted)
    - docs/architecture/0001-layered-ui-model.md §Confirmation (capture-container assertion as Phase 4a integration test)
  </read_first>
  <files>packages/g2-app/src/engine/layer-manager.ts, packages/g2-app/src/engine/__tests__/layer-manager.test.ts</files>
  <behavior>
    - Test 1: After `lm.mount(Z0_MAP, layerWithCapture('map-capture'))`, `lm.getCaptureContainerCount()` returns 1
    - Test 2: After mounting z=0 with capture + z=1 without capture, count remains 1; no throw
    - Test 3: Mounting a layer with NO capture-container provider while no other capture layer exists → throws LayerManagerError with code='capture_invariant_violated' and message includes "found 0"
    - Test 4: Mounting two layers both providing capture → throws LayerManagerError with code='capture_invariant_violated' and message includes "found 2"
    - Test 5: destroy(Z0_MAP) when that z was the sole capture provider → throws capture_invariant_violated
    - Test 6: mount with requiredCaps=['read_char'] when negotiatedCaps is empty Set → throws code='capability_gate_denied'
    - Test 7: mount with requiredCaps=['read_char'] after setNegotiatedCaps(new Set(['read_char','read_scene'])) → succeeds
    - Test 8: bundle([{type:'destroy', z: Z0_5_IDLE_INFILL}, {type:'mount', z: Z2_OVERLAY, layer: layerWithCapture('overlay')}]) calls bridge.rebuildPageContainer EXACTLY ONCE (verify via vi.fn() call count = 1)
    - Test 9: bundle ops are applied in array order; if intermediate state violates invariant but final state satisfies it, no throw (invariant asserted only after all ops applied)
    - Test 10: setMapMode('raster'|'glyph'|'auto') updates internal state and is queryable via getMapMode(); does NOT immediately call bridge (wiring is Phase 4b/6)
  </behavior>
  <action>
    Following PATTERNS.md §layer-manager.ts analog, implement `packages/g2-app/src/engine/layer-manager.ts`:

    1. Module JSDoc header citing ADR-0009, ADR-0001, 04a-CONTEXT.md Area 1.
    2. `import type { EvenAppBridge, RebuildPageContainer, TextContainerProperty, ImageContainerProperty }` (types only; no `new` instantiation needed at runtime if you stash bridge.rebuildPageContainer behind a method). Also import the matching SDK runtime class for RebuildPageContainer construction.
    3. `import type { ServerCap }` from `@evf/shared-protocol`.
    4. `import { ZIndex, type Layer, type LayerOp, LayerManagerError }` from `./layer-types.js`.
    5. `class LayerManager` with:
       - Private state: `layers: Map<ZIndex, Layer>` (use Map for ordered iteration over z values), `negotiatedCaps: ReadonlySet<ServerCap> = new Set()`, `mapMode: 'auto'|'raster'|'glyph' = 'auto'`.
       - Constructor: `constructor(private readonly bridge: EvenAppBridge)`.
       - `setNegotiatedCaps(caps: ReadonlySet<ServerCap>): void` — replaces internal Set; called by capability-handshake.ts post-handshake.
       - `mount(z: ZIndex, layer: Layer, requiredCaps: ReadonlyArray<ServerCap> = []): void` — capability gate loop (throw capability_gate_denied if any cap missing), then `layers.set(z, layer)`, then `_assertCaptureInvariant()`.
       - `destroy(z: ZIndex): void` — `layers.delete(z)`, then `_assertCaptureInvariant()`.
       - `bundle(ops: LayerOp[]): Promise<void>` — apply all ops (mount inserts into Map after capability check; destroy deletes), then `_assertCaptureInvariant()`, then `await _flushPage()`. EXACTLY one `bridge.rebuildPageContainer` per bundle call.
       - `setMapMode(mode: 'auto'|'raster'|'glyph'): void` — store; no I/O.
       - `getMapMode(): 'auto'|'raster'|'glyph'` — getter.
       - `getCaptureContainerCount(): number` — counts layers whose `getCaptureContainer?.()` returns a non-undefined string (used by tests and by `_assertCaptureInvariant`).
       - `private _assertCaptureInvariant()` — throws LayerManagerError('capture_invariant_violated', `expected 1 capture container, found ${n}`).
       - `private async _flushPage()` — for Plan 02, this is a stub that calls `bridge.rebuildPageContainer(new RebuildPageContainer({ containerTotalNum: N, textObject: [...], imageObject: [...] }))` derived from the currently mounted layers (a simple union over layers.values()). Concrete container array assembly is fine to inline; future plans (4b panels) will refactor.

    Write tests FIRST in `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` matching the `<behavior>` block — RED phase. Use the mock-bridge factory + makeMockLayer pattern from PATTERNS.md §__tests__/layer-manager.test.ts (verbatim). Then implement the class to GREEN.

    Constraints:
    - No virtual DOM (D-2.04). Pure class + Map.
    - TypeScript strict + noUncheckedIndexedAccess: any `layers.get(z)` returns `Layer | undefined` — guard accordingly.
    - JSDoc on every public method (per INV-4 §0.1).
    - Conventional Commits scope `g2-app`.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/layer-manager.test.ts && grep -c 'capture_invariant_violated' packages/g2-app/src/engine/__tests__/layer-manager.test.ts && grep -c 'capability_gate_denied' packages/g2-app/src/engine/__tests__/layer-manager.test.ts && grep -c 'rebuildPageContainer' packages/g2-app/src/engine/__tests__/layer-manager.test.ts && grep -cE 'class LayerManager\b' packages/g2-app/src/engine/layer-manager.ts</automated>
  </verify>
  <done>
    All 10 behaviors are tests that pass (vitest exit 0); both error codes (capture_invariant_violated, capability_gate_denied) are exercised in the test file; bundle-single-flush assertion exists; LayerManager class is declared.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: page-lifecycle + capability-handshake + boot-splash (TDD)</name>
  <read_first>
    - packages/g2-app/src/hub-polyfill.ts (lines 56-102 — EvenAppBridge import + singleton-get + waitForEvenAppBridge + result-enum check pattern — PATTERNS.md page-lifecycle analog)
    - packages/bridge/src/ws/handshake.ts (lines 19-30 + 61-170 — the SERVER side of this handshake; capability-handshake.ts is the client inversion)
    - packages/bridge/src/ws/handshake.test.ts (lines 30-90 — MockSocket pattern with EventEmitter + addEventListener stub for client-side test; PATTERNS.md capability-handshake.test.ts analog)
    - packages/shared-protocol/src/handshake.ts (HandshakeClientSchema, HandshakeServerSchema, SERVER_CAPS_V1 exact shapes)
    - packages/g2-app/src/wizard/steps/completion.ts (analog for sequential render-and-update flow — boot-splash steps cycle through textContainerUpgrade calls in order)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §page-lifecycle.ts + §capability-handshake.ts + §boot-splash.ts (verbatim code patterns)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Example 1 (boot sequence with full container schema) + §Example 5 (HandshakeClient capability negotiation)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Screen 1 (Boot Splash ASCII mockup + 5-step checklist + State table)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Container Budget Allocation §Raster mode idle (exact slot assignments for createBootPage)
  </read_first>
  <files>packages/g2-app/src/engine/page-lifecycle.ts, packages/g2-app/src/engine/capability-handshake.ts, packages/g2-app/src/engine/boot-splash.ts, packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts, packages/g2-app/src/engine/__tests__/capability-handshake.test.ts, packages/g2-app/src/engine/__tests__/boot-splash.test.ts</files>
  <behavior>
    page-lifecycle:
    - Test PL-1: `createBootPage(bridge)` calls `bridge.createStartUpPageContainer` with `containerTotalNum: 11`, `imageObject.length: 4`, `textObject.length: 7`
    - Test PL-2: Among textObject entries, exactly one has `isEventCapture: 1` and its containerName is `map-capture`
    - Test PL-3: Image containers have names `map-tile-0` through `map-tile-3` with width=200 height=100 and 2×2 positions
    - Test PL-4: When `createStartUpPageContainer` returns a non-success enum value → `createBootPage` throws Error with message containing the result value
    - Test PL-5: `rebuildToOverlay(bridge, overlayDef)` calls `bridge.rebuildPageContainer` exactly once with the merged container definition (z=0.5 demolished, z=2 mounted)

    capability-handshake:
    - Test CH-1: `performCapabilityHandshake(mockWs, 'tok-123', 'it')` calls `ws.send` exactly once with JSON containing `proto:'evf-v1'`, `token:'tok-123'`, `locale:'it'`, `capabilities` array equal to SERVER_CAPS_V1
    - Test CH-2: When mock socket fires `message` event with a valid HandshakeServer JSON → Promise resolves with parsed `{ server_caps, server_locale, session_id, replay_seq }`
    - Test CH-3: When response is non-JSON text → rejects with HandshakeError code='parse_failed'
    - Test CH-4: When response JSON fails HandshakeServerSchema validation (e.g., missing server_caps) → rejects with HandshakeError code='schema_failed'
    - Test CH-5: When no message arrives within 10s (vi.useFakeTimers + advance) → rejects with HandshakeError code='timeout'
    - Test CH-6: `probeBleThroughput(bytesObserved: number, durationMs: number)` returns 'raster' for ≥100 kbps, 'glyph' for <100 kbps, 'auto' when durationMs < 500 (insufficient sample)

    boot-splash:
    - Test BS-1: `showBootSplash(bridge, {steps})` calls `bridge.textContainerUpgrade` 5 times, once per step, in order: `G2 display 576×288` → `R1 ring paired` → `Bridge ws://...` → `Foundry sync` → `Character: ...`
    - Test BS-2: Each step's content string matches UI-SPEC §Screen 1 Boot Splash format (checklist marker `[ ✓ ]` / `[ ⟳ ]` / `[   ]`)
    - Test BS-3: When provided `protocolVersion: '1.0'` and `panelsAvailable: 5` → the protocol line `protocol 1.0 · panels available: 5` is rendered as the final textContainerUpgrade
    - Test BS-4: If `bridge.textContainerUpgrade` rejects, showBootSplash propagates the error (no swallow)
  </behavior>
  <action>
    Implement three modules + three test files in one task (they form a vertical slice: handshake feeds into boot-splash; both consume page-lifecycle).

    **1. `packages/g2-app/src/engine/page-lifecycle.ts`:**
    Module JSDoc citing ADR-0001, 04a-CONTEXT.md Area 1, OQ-INV2-1 resolution (page-based declarative API).

    Imports: `import { EvenAppBridge, CreateStartUpPageContainer, RebuildPageContainer, ImageContainerProperty, TextContainerProperty, waitForEvenAppBridge, StartUpPageCreateResult } from '@evenrealities/even_hub_sdk'`.

    Exports:
    - `export async function createBootPage(bridge: EvenAppBridge): Promise<void>` — builds the 4-image + 7-text container schema per UI-SPEC §Container Budget Allocation (raster mode idle row). Calls `await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({...}))`. If result !== StartUpPageCreateResult.success → throw Error with the result value included.
    - `export async function createMainPage(bridge: EvenAppBridge): Promise<void>` — same schema for now (boot and main pages share the container layout; boot-splash repurposes containers for the splash UI then main HUD reuses them). Document in JSDoc that Phase 4b may diverge these.
    - `export async function rebuildToOverlay(bridge: EvenAppBridge, overlayDef: { textObject: TextContainerProperty[]; imageObject: ImageContainerProperty[]; containerTotalNum: number }): Promise<void>` — single `bridge.rebuildPageContainer` call. Reserved for layer-manager.bundle() consumption.

    **2. `packages/g2-app/src/engine/capability-handshake.ts`:**
    Module JSDoc citing ADR-0002, ADR-0009, 04a-CONTEXT.md Area 4 (BLE probe threshold).

    Imports: `import { HandshakeClientSchema, type HandshakeServer, HandshakeServerSchema, SERVER_CAPS_V1 } from '@evf/shared-protocol'`.

    Exports:
    - `export class HandshakeError extends Error { constructor(public readonly code: 'parse_failed' | 'schema_failed' | 'timeout' | 'transport_error', message: string) { super(message); this.name = 'HandshakeError' } }`
    - `export async function performCapabilityHandshake(ws: WebSocket, token: string, locale: string, sessionId?: string, timeoutMs: number = 10000): Promise<HandshakeServer>` — assembles client payload (omit session_id when undefined to satisfy strict schema; spread guard pattern from PATTERNS.md), `ws.send(JSON.stringify(...))`, registers a one-shot `addEventListener('message', ...)`, races against `setTimeout(timeoutMs)`. On message: `JSON.parse` (catch → parse_failed), then `HandshakeServerSchema.safeParse` (failure → schema_failed). On timeout: clear listener, reject with timeout code.
    - `export function probeBleThroughput(bytesObserved: number, durationMs: number): 'auto' | 'raster' | 'glyph'` — if durationMs < 500 return 'auto'; compute `kbps = (bytesObserved * 8) / 1000 / (durationMs / 1000)`; return 'glyph' if kbps < 100, else 'raster'. JSDoc references ADR-0005 PROVISIONAL Branch A threshold + 04a-CONTEXT.md Area 4 + TODO(ADR-0005-OQ-INV2-1.b) for hardware re-tune.

    **3. `packages/g2-app/src/engine/boot-splash.ts`:**
    Module JSDoc citing 04A-UI-SPEC.md §Screen 1 + Specs.md §7.12.

    Imports: `import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'`.

    Exports:
    - `export type BootStepState = 'pending' | 'in_progress' | 'done' | 'failed'` (maps to `[   ]` / `[ ⟳ ]` / `[ ✓ ]` / `[ ✕ ]` markers per UI-SPEC §Screen 1 State table)
    - `export interface BootStep { label: string; state: BootStepState }`
    - `export async function showBootSplash(bridge: EvenAppBridge, opts: { steps: BootStep[]; protocolVersion: string; panelsAvailable: number; containerName?: string }): Promise<void>` — for each step in order: call `bridge.textContainerUpgrade(...)` to render the cumulative checklist with the current step marked in_progress, then mark done before advancing. Final call renders the protocol line `protocol ${protocolVersion} · panels available: ${panelsAvailable}`. Default containerName = `'header'` (UI-SPEC reserves header text container for the boot checklist rendering). Use textContainerUpgrade per OQ-INV2-1; do NOT call createImageContainer / createTextContainer.

    Write the three test files in `packages/g2-app/src/engine/__tests__/` first matching `<behavior>` (RED phase), using the MockSocket EventEmitter pattern from PATTERNS.md §capability-handshake.test.ts and the makeMockBridge pattern from PATTERNS.md §layer-manager.test.ts.

    Constraints:
    - All four modules import EvenAppBridge directly from `@evenrealities/even_hub_sdk` — NEVER use `hub.*` global (Pitfall 1).
    - All Zod parsing uses `.safeParse()` at the WS boundary, never `.parse()`.
    - `noUncheckedIndexedAccess`: use spread-guard pattern `...(sessionId !== undefined ? { session_id: sessionId } : {})` for optional fields, not direct undefined assignment.
    - JSDoc on every public export (INV-4).
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/page-lifecycle.test.ts src/engine/__tests__/capability-handshake.test.ts src/engine/__tests__/boot-splash.test.ts && grep -c "containerTotalNum: 11" packages/g2-app/src/engine/page-lifecycle.ts && grep -c "isEventCapture: 1" packages/g2-app/src/engine/page-lifecycle.ts && grep -c "HandshakeServerSchema.safeParse" packages/g2-app/src/engine/capability-handshake.ts && grep -c "probeBleThroughput" packages/g2-app/src/engine/capability-handshake.ts && grep -c "100" packages/g2-app/src/engine/capability-handshake.ts && grep -c "textContainerUpgrade" packages/g2-app/src/engine/boot-splash.ts && grep -v '^[[:space:]]*//\|^[[:space:]]*\*\|^[[:space:]]*/\*' packages/g2-app/src/engine/capability-handshake.ts | grep -c "HandshakeServerSchema" && pnpm typecheck</automated>
  </verify>
  <done>
    All three test files pass (15 total tests per `<behavior>`); page-lifecycle declares containerTotalNum:11 + at least one isEventCapture:1; capability-handshake uses safeParse (proven via grep that filters comments out, so the count is a non-comment usage); probeBleThroughput exists with the 100 kbps threshold visible in source; boot-splash calls textContainerUpgrade; pnpm typecheck exits 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Bridge WS → g2-app | Handshake response JSON crosses trust boundary; must be safeParse-validated |
| EvenAppBridge envelope → host Flutter runtime | Internal call surface; host runtime is trusted Even Realities App WebView |
| g2-app singleton state → consumer modules | LayerManager exposes mutation methods; misuse would violate invariants |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4a-02-01 | T | capability-handshake.ts HandshakeServer parse | mitigate | All responses parsed via `HandshakeServerSchema.safeParse` (never `.parse`); JSON.parse wrapped in try/catch → HandshakeError('parse_failed'); schema failure → HandshakeError('schema_failed') |
| T-4a-02-02 | T | layer-manager.ts capability gating | mitigate | mount() iterates requiredCaps against negotiatedCaps Set; missing cap → LayerManagerError('capability_gate_denied'); negotiated set sourced from schema-validated handshake |
| T-4a-02-03 | D | performCapabilityHandshake never-resolving Promise | mitigate | 10s timeout (configurable param); on timeout, removeEventListener + reject HandshakeError('timeout'); Plan 05 smoke test asserts timeout path |
| T-4a-02-04 | I | boot-splash.ts checklist | accept | Static labels only; bridge URL is paired-in (Phase 2), already known to G2/phone owner |
| T-4a-02-05 | S | LayerManager._flushPage rebuildPageContainer call | accept | Privileged page rebuild authority is intentional; only LayerManager calls bridge.rebuildPageContainer; no external entry point bypasses the invariant assertion |
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 with all 4 new test files green
- `pnpm typecheck && pnpm lint:ci` exit 0
- LayerManager source contains class declaration; tests exercise both error codes (capture_invariant_violated, capability_gate_denied) and bundle single-flush
- page-lifecycle.ts containerTotalNum:11 matches UI-SPEC §Container Budget Allocation row
- capability-handshake.ts safeParse is non-comment usage (grep -v filter)
- boot-splash 5-step sequence verified by vi.fn().mock.calls.length === 5 (or 6 including protocol line)
</verification>

<success_criteria>
Plan 02 closes when:
- DISP-01 partially addressed: Status HUD persistence machinery exists via LayerManager (final HUD layer implementation lands in Plan 04)
- DISP-02 fully addressed at runtime: capture-container invariant enforced by LayerManager and unit-tested at 0/1/2 counts
- NAV-04 fully addressed software-side: boot splash → handshake → main HUD transition is testable end-to-end against mocks; real-hardware verification carries human_needed gate (ADR-0005)
- All 4 engine modules pass vitest under happy-dom
- Plan 03 (raster) and Plan 04 (status-hud) can import `LayerManager` and `Layer` interface to define their own layers
</success_criteria>

<output>
After completion, create `.planning/phases/04a-g2-engine-raster-status-hud/04a-02-SUMMARY.md` capturing:
- LayerManager API delivered (mount/destroy/bundle/setMapMode signatures actually shipped)
- Capability-gate behavior (which caps gate which mounts — note that requiredCaps array is per-mount, not per-layer)
- BLE probe threshold value (100 kbps) and the TODO(ADR-0005-OQ-INV2-1.b) reference for hardware tuning
- Any deviation from the PATTERNS.md analogs (especially fallback if image-q API shape forced a different import structure — but that is mostly Plan 03's risk)
- Test counts per module (target: 10 layer-manager + 5 page-lifecycle + 6 capability-handshake + 4 boot-splash = 25 minimum)
</output>
