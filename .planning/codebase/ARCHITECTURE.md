<!-- refreshed: 2026-05-24 -->
# Architecture

**Analysis Date:** 2026-05-24

## System Overview

EvenFoundryVTT projects a D&D 5e Foundry VTT session onto Even Realities G2 AR glasses (576×288 4-bit greyscale), driven by R1 ring gestures. The system operates as a four-boundary pipeline:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│              G2 Glasses (client, browser-embedded)                       │
│                   @evf/g2-app (Vite bundle)                             │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ LayerManager (z=0 map, z=0.5 HUD, z=1 status, z=2 overlay)    │   │
│  │ RasterController (Web Worker, dither + encode + delta)        │   │
│  │ PanelRouter + gesture handlers                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└────────────────────────┬──────────────────────────────────────────────────┘
                         │ BLE LC3 audio + WSS frame updates
                         │
┌────────────────────────▼──────────────────────────────────────────────────┐
│        Even Realities App WebView (phone, Fastify bridge proxy)           │
│              @evf/bridge (Node 24 service, port 8910)                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ HTTP routes: /v1/character, /v1/combat, /v1/scene, /v1/spells │   │
│  │ WebSocket: /ws (handshake + delta stream + tool invocation)   │   │
│  │ Voice: /v1/audio/stream (Deepgram STT)                        │   │
│  │ Internal: /internal/delta (module push via EVF_INTERNAL_SECRET)│   │
│  └──────────────────────────────────────────────────────────────────┘   │
└────────────────────────┬──────────────────────────────────────────────────┘
                         │ socketlib + REST + hooks
                         │
┌────────────────────────▼──────────────────────────────────────────────────┐
│             FoundryVTT + dnd5e 5.x (Game Master's instance)               │
│              @evf/foundry-module (evenfoundryvtt module)                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Readers: scene/combat/character/log extractors                  │   │
│  │ Write path: 17 socketlib handlers (weapon, spell, move, etc.)   │   │
│  │ Tool Registry: routes bridgeInvoke payloads to handlers         │   │
│  │ Hooks: updateToken, updateActor, updateCombat, etc.            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└────────────────────────┬──────────────────────────────────────────────────┘
                         │ optional V2: MCP client
                         │
                    ┌────▼────┐
                    │ foundry-mcp
                    │ (Phase 11 STRETCH)
                    └─────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **@evf/g2-app** | Render G2 layered HUD; drive UI state machines; wire R1 gestures; manage raster delta updates | `packages/g2-app/src/` |
| **@evf/bridge** | HTTP+WS proxy; actor/combat snapshots; tool dispatch; scene viewport; portrait + voice; token cache; idempotency | `packages/bridge/src/` |
| **@evf/foundry-module** | Reader hooks (5 Foundry hooks); 17 socketlib action handlers; pairing UI (QR bearer token); settings + bearer rotation | `packages/foundry-module/src/` |
| **@evf/shared-protocol** | Zod schemas + TS types for envelopes, handshake, payloads, tools (single source of truth per ADR-0002, ADR-0003) | `packages/shared-protocol/src/` |
| **@evf/shared-render** | ASCII grid model + snapshot matcher for INV-1 layout-integrity tests | `packages/shared-render/src/` |
| **@evf/validation-harness** | Phase 0 hardware validation scripts; re-validation entry point | `packages/validation-harness/src/` |

## Pattern Overview

**Overall:** Multi-boundary push-pull pipeline. Foundry module reads world state and pushes deltas upstream via the bridge; bridge fans out to g2-app via WebSocket. Tool invocations flow downstream (g2-app gesture → bridge dispatch → foundry-module socketlib handler → Foundry actor mutation → upstreaming via hook). Each boundary enforces schema validation with Zod (ADR-0002).

**Key Characteristics:**
- **Layered UI (z-stack):** ADR-0001 + Amendment 1 atomicity. One capture container per frame. Three persistent layers (map z=0, status-hud z=1) + one transient overlay (z=2). All rendered via `EvenAppBridge.rebuildPageContainer()`.
- **Single-workflow-origin discipline:** ADR-0011. All Foundry mutations route through `dispatchTool` in the write-path; 17 socketlib handlers are registered in advance, never dynamically added.
- **Protocol versioning:** ADR-0002. Every WS envelope is Zod-validated. Handshake negotiates `SERVER_CAPS_V1` set; LayerManager gates mount operations on required caps.
- **Tool registry:** ADR-0003. Tool input shapes defined in shared-protocol; bridge maps envelope → tool name → ToolHandler; no cross-tool collision.
- **Reader-hook pattern:** Foundry module hooks fire on world mutations (updateToken, createChatMessage, etc.); reader collects state; delta emitter pushes upstream via `/internal/delta` POST (authenticated with `EVF_INTERNAL_SECRET` shared at pair time).

## Layers

**G2 Application (@evf/g2-app):**
- **Purpose:** Render the 576×288 G2 display in real time; manage panel overlays; wire R1 gesture input; delta frame encoding + compression.
- **Location:** `packages/g2-app/src/`
- **Contains:** Boot engine, layer manager, raster pipeline, panels (character, combat, log, spellbook, etc.), status HUD, locale override, wizard.
- **Depends on:** shared-protocol (schemas), shared-render (snapshot fixtures), Even Realities SDK, Vite (build-time only).
- **Used by:** Served as static bundle from plugin-host HTTP; loaded by Even Realities App WebView.

**Key modules:**
- `engine/`: Boot sequence, layer orchestration, event wiring, capability handshake.
- `raster/`: Map rendering, delta encoding, Web Worker interface.
- `panels/`: State machines for character sheet, combat, inventory, spellbook, log, modals.
- `status-hud/`: Status bar renderer, toast queue, action economy display.
- `wizard/`: Pairing flow (Step 1 profile, Step 2 token scan, Step 3 character select).

**Bridge Service (@evf/bridge):**
- **Purpose:** REST + WS proxy between G2 app and Foundry; snapshot cached state; dispatch tool invocations to Foundry module via socketlib; serve character/combat/scene data; stream voice frames to Deepgram.
- **Location:** `packages/bridge/src/`
- **Contains:** HTTP routes (character, combat, scene, spells, entities, portrait, i18n), WS handlers (handshake, delta emit, tool invoke), caches (token, portrait, entity-pack, spell-pack), voice (audio stream, Deepgram STT, keyterm merger), middleware (idempotency, rate limit, CORS).
- **Depends on:** Fastify + plugins (ws, cors, rate-limit), shared-protocol, pino logger, prom-client metrics.
- **Used by:** Started via Docker; listens on port 8910. G2 app connects via WSS. Foundry module pushes deltas via authenticated POST.

**Key modules:**
- `routes/`: HTTP handlers (character, character-list, combat, scene, events, i18n, portrait, spells, tools, health checks).
- `ws/`: WebSocket handlers (handshake, tool invoke, delta emitter, session store, replay buffer, resume).
- `cache/`: Tier 1 in-memory storage (token, portrait, spell-pack, entity-pack).
- `voice/`: Deepgram STT integration, keyterm merger for voice recognition.
- `auth/`: Bearer token validation, token cache.
- `middleware/`: Idempotency store + hooks, rate limiting.

**Foundry Module (@evf/foundry-module):**
- **Purpose:** Read Foundry world state; emit deltas to bridge; handle tool invocations; manage pairing + bearer token rotation; subscribe to action results (reactions, concentrations).
- **Location:** `packages/foundry-module/src/`
- **Contains:** Module init (settings, hooks); pair UI (modal, QR, bearer registry); readers (character, combat, scene, entity-pack, spell-pack, log); write-path (17 socketlib handlers for actions), action watchers, concentration detector.
- **Depends on:** shared-protocol, qrcode, Foundry globals (injected at test-support boundary).
- **Used by:** Installed as a Foundry module via `module.json` manifest. Loaded by Foundry VTT `v13.347+` with dnd5e `5.3.3+`.

**Key modules:**
- `pair/`: Bearer generation, rotation, QR modal, socketlib dispatch registry.
- `readers/`: Hook subscribers, character/combat/scene/log/entity/spell pack extraction.
- `write-path/`: 17 socketlib action handlers (cast-spell, weapon-attack, move-token, use-item, etc.), action economy tracker, concentration detector, reaction watcher.

**Shared Protocol (@evf/shared-protocol):**
- **Purpose:** Single source of truth for all schema contracts per ADR-0002, ADR-0003. Zod schemas + TS types imported by all three runtime packages.
- **Location:** `packages/shared-protocol/src/`
- **Contains:** Envelope + handshake schemas, payload schemas (character, combat, scene, log, frame, action-economy, movement, portrait, voice, spell-pack, entity-pack), tool input schemas (cast-spell, weapon-attack, move-token, etc.), voice spell keyterms.
- **Depends on:** Zod (runtime validation).
- **Used by:** All packages (g2-app, bridge, foundry-module) re-export for downstream consumers.

**Shared Render (@evf/shared-render):**
- **Purpose:** ASCII grid model + Vitest snapshot matcher for INV-1 layout-integrity testing. Ensures every mockup state aligns character-perfect across all display widths.
- **Location:** `packages/shared-render/src/`
- **Contains:** ASCII grid builder, cell model, snapshot assertion helper, fixture templates (boot splash, status HUD, panels).
- **Depends on:** Vitest (peerDep for snapshot API).
- **Used by:** Status HUD tests, panel snapshot tests.

**Validation Harness (@evf/validation-harness):**
- **Purpose:** Phase 0 hardware validation (R1 timing, image format, BLE bandwidth, audio chunk size). Folded from `tests/phase-0/` during Phase 1. Contains GO/NO-GO test harness for hardware assumptions.
- **Location:** `packages/validation-harness/src/`
- **Contains:** Hardware probe scripts, CSV output formatters, test runners.
- **Depends on:** upng-js, csv-stringify, shared-protocol.
- **Used by:** `pnpm validate:all` (requires Even Hub access).

## Data Flow

### Primary Request Path (Reading)

1. **Foundry world mutation** — `packages/foundry-module/src/readers/hook-subscribers.ts`
   - Hook fires: `updateToken`, `updateActor`, `updateCombat`, `createChatMessage`, `updateCombat`
   - Reader collects current state via Foundry API

2. **Reader emits snapshot** — `packages/foundry-module/src/readers/*.ts`
   - E.g., `character-reader.ts` → `CharacterSnapshot`; `combat-reader.ts` → `CombatSnapshot`
   - Snapshot wrapped in `DeltaEnvelope` (type = "r1.character.update", payload = snapshot)

3. **Delta emitted upstream** — `packages/foundry-module/src/readers/hook-subscribers.ts`
   - `bridgeDeltaEmitter.push(envelope)` POSTs to `{bridgeUrl}/internal/delta`
   - Auth: `EVF_INTERNAL_SECRET` header (shared at pair time)
   - Fire-and-forget: logs warning on failure, never throws

4. **Bridge receives and caches** — `packages/bridge/src/routes/internal-delta.ts`
   - `onDelta` callback multiplexes to handlers: `handleSpellPackEnvelope`, `handleEntityPackEnvelope`
   - Cache updates stored in memory (Tier 1, Specs.md §11.5.5)

5. **Bridge streams to g2-app** — `packages/bridge/src/ws/delta-emitter.ts`
   - WebSocket `/ws` endpoint receives delta envelopes in order
   - `DeltaEmitter.push(envelope)` broadcasts to all connected clients

6. **G2-app processes delta** — `packages/g2-app/src/engine/*.ts` + `packages/g2-app/src/panels/*.ts`
   - Panel dispatchers (e.g., `character-sheet-panel`) consume deltas via subscription
   - State machines update internal view model
   - `LayerManager.bundle()` collects all mutations → single `rebuildPageContainer` call

**Example flow (player reads character sheet):**
```
Foundry: actor.updateSource() 
  → Hook: "updateActor" fires 
  → character-reader collects HP, spells, inventory 
  → pushes r1.character.update envelope 
  → Bridge caches + streams 
  → g2-app character-sheet-panel updates 
  → status-hud-layer re-renders 
  → rebuildPageContainer emitted
```

### Tool Invocation Path (Writing)

1. **R1 gesture detected** — `packages/g2-app/src/engine/r1-event-source.ts`
   - G2 gestures: `tap`, `scroll`, `long-press` on R1 ring
   - Gesture mapped to action (e.g., tap on "Cast Fireball" → `CastSpellInput`)

2. **g2-app sends tool invocation** — `packages/g2-app/src/panels/action-options-modal.ts`
   - Constructs `ToolInvocationEnvelopePayload` (toolId, input, idempotencyKey)
   - Sends via WebSocket to bridge `/ws` (authenticated with 24h bearer token)

3. **Bridge receives and dispatches** — `packages/bridge/src/ws/tool-invoke.ts`
   - Validates envelope against `ToolInvocationEnvelopePayloadSchema`
   - Looks up `ToolHandler` from registry
   - Calls `handler(input, { idempotencyKey, sessionId })`

4. **Foundry module handles action** — `packages/foundry-module/src/write-path/handlers/*.ts`
   - E.g., `cast-spell.handler()` runs dnd5e Activity system
   - Calls socketlib `executeAsGM` to mutate actor state
   - Emits action result via `actionResultWatcher`

5. **Action result streams back** — `packages/foundry-module/src/write-path/action-result-watcher.ts`
   - `r1.action.result` envelope pushed upstream → bridge → g2-app
   - g2-app `action-result-dispatcher` routes to toast + state update

**Example flow (cast Fireball):**
```
g2-app: user taps "Cast Fireball" button
  → R1 gesture handler creates CastSpellInput
  → sends ToolInvocationEnvelope
  → Bridge validates & looks up castSpellHandler
  → foundry-module: castSpellHandler calls activity.use()
  → dnd5e rolls for concentration, deducts slot
  → action-result-watcher collects outcome
  → pushes r1.action.result envelope
  → Bridge streams to g2-app
  → action-result-dispatcher shows success/failure toast
```

### State Management

- **Tier 1 (bridge in-memory):** TokenCache, PortraitCache, EntityPackCache, SpellPackCache (Map + TTL, no Redis in MVP per Specs.md §11.5.5)
- **Tier 3 (g2-app local):** Panel view models (action-economy state, portrait state, conc-retry cache)
- **Tier 4 (Even Hub key-value):** OAuth token refresh storage (via Even Hub API, not localStorage)
- **Tier 5 (Foundry server):** Canonical world state (flags.evf.audit for action economy)

## Key Abstractions

**Envelope:**
- **Purpose:** Top-level wire container for all protocol messages (Zod-validated).
- **Examples:** `DeltaEnvelope`, `ToolInvocationEnvelope`, `PerfSampleEnvelope`
- **Pattern:** `{ type, payload, idempotencyKey?, seqNum? }`
- **Location:** `packages/shared-protocol/src/envelope.ts`

**Layer (z-stack abstraction):**
- **Purpose:** Composable UI fragment that owns one z-index level and emits a container (image, text, list, event-capture).
- **Examples:** `MapBaseLayer` (z=0), `StatusHudLayer` (z=1), `OverlayPanel` (z=2)
- **Pattern:** Interface `{ mount(), destroy(), bundle(), captureContainer() }`
- **Location:** `packages/g2-app/src/engine/layer-types.ts`

**LayerManager:**
- **Purpose:** Orchestrates z-stack atomicity; enforces capture-container invariant (ADR-0001 Amendment 1).
- **Pattern:** Mounts/destroys layers in order, bundles all ops into one `rebuildPageContainer` call.
- **Location:** `packages/g2-app/src/engine/layer-manager.ts`

**ToolHandler:**
- **Purpose:** Processes a single tool invocation; mutates Foundry state via socketlib.
- **Examples:** `castSpellHandler`, `weaponAttackHandler`, `moveTokenHandler`
- **Pattern:** `async (input: ToolInput, context) => { await socketlib.executeAsGM(...); return ActionResult; }`
- **Location:** `packages/foundry-module/src/write-path/handlers/*.ts`

**RasterController:**
- **Purpose:** Manages Web Worker for delta encoding; off-loads dither + hash + PNG encode.
- **Pattern:** Singleton; async `encodeFrame(scene) → FramePixels`; delegates encode to worker.
- **Location:** `packages/g2-app/src/raster/raster-controller.ts`

## Entry Points

**@evf/g2-app:**
- **Location:** `packages/g2-app/src/index.ts`
- **Triggers:** Served by HTTP plugin host; Even Realities App loads as `<script src="...index.js">`
- **Responsibilities:** Boot engine, initialize layers, wire R1 events, start delta subscription.

**@evf/bridge:**
- **Location:** `packages/bridge/src/index.ts`
- **Triggers:** Node.js process start (Docker Compose)
- **Responsibilities:** Start Fastify server, bind to port 8910, register all routes + middleware.

**@evf/foundry-module:**
- **Location:** `packages/foundry-module/src/module.ts`
- **Triggers:** Foundry `Hooks.once("init")`
- **Responsibilities:** Register settings panel, register Hooks.once("ready") for socketlib + delta emitter, schedule bearer rotation.

## Architectural Constraints

- **Threading:** Single-threaded event loop (browser) + Node event loop (bridge) + Game Master's JS VM (Foundry). RasterController uses Web Worker to offload CPU-bound dither/encode from main thread.
- **Global state:** Singletons: `LayerManager`, `RasterController`, `SessionStore` (bridge), `TokenCache` (bridge), `ToolRegistry` (foundry-module). No circular imports; all singletons injected or lazily initialized via `await waitForEvenAppBridge()`.
- **Circular imports:** Prevented by architecture. Each module exports types, uses DI for runtime instances. No circular dep chains detected (Biome linting enforces).
- **Capture-container invariant:** Every frame (from `LayerManager.bundle()`) must have exactly one mounted layer with a non-null capture container. Violation throws `LayerManagerError`. Enforced at bundle-time, not statically.
- **Idempotency:** Bridge stores all tool invocations by `idempotencyKey` (uuid + timestamp). Re-submission of same key returns cached result. Lifespan: 24h TTL (matched to bearer token lifetime per Specs.md §11.5.4).
- **Bearer token lifetime:** 24h from issue. Module schedules refresh at 23h50m via `bearer-rotation.ts`. New tokens propagated to g2-app via `r1.bearer.rotated` envelope.
- **Async error handling:** Bridge uses Fastify error handlers; foundry-module uses socketlib error callbacks; g2-app uses boot error layer + panel error recovery. No silent failures; all errors either logged or surfaced to user as toast.

## Anti-Patterns

### Direct Window/Document Access in g2-app Tests

**What happens:** Unit tests import `@evf/g2-app` and directly call `document.querySelector()` or `window.location`.

**Why it's wrong:** G2 app is **not DOM-based** (Specs.md §3.1, CLAUDE.md; no React/Vue/Svelte). Render target is `EvenAppBridge` envelopes. DOM in tests breaks isolation and gives false confidence.

**Do this instead:** Mock `EvenAppBridge` via test support. See `packages/g2-app/src/index.test-support.ts` and `bootEngineForTest()` pattern. Tests validate internal state machines, not DOM side effects.

### Unvalidated WS Payloads in Bridge Routes

**What happens:** A route reads `request.body.someField` without checking the Zod schema first.

**Why it's wrong:** Breaks ADR-0002 contract. Allows malformed payloads to propagate to Foundry. Type system gives false confidence.

**Do this instead:** Always parse with `SomePayloadSchema.parseAsync()` at the WS-receive boundary (e.g., `tool-invoke.ts`). Let Zod errors surface to the logger + client.

### Modifying TOOL_REGISTRY After Boot

**What happens:** A phase adds a new tool handler by mutating the registry map at runtime.

**Why it's wrong:** Violates ADR-0011 (single-workflow-origin). Handlers registered dynamically are not discoverable statically; test coverage gaps emerge.

**Do this instead:** All 17 handlers registered in `foundry-module/src/write-path/handlers/index.ts` as side-effect imports before `Hooks.once("ready")` fires. Register exactly once at boot. If adding a new tool, add handler + update shared-protocol tool input schema + add to test suite.

## Error Handling

**Strategy:** Fail-open at boundaries; fail-closed at core. Bridge 500s propagate as `r1.error` envelopes to g2-app. Foundry module socketlib handler errors are logged but never cancel NPC actions (REACT-01 display-only constraint). Boot errors in g2-app trigger error splash (§7.12) and block further progress.

**Patterns:**
- **WS handshake failure:** Boot error layer shows reason, offers retry.
- **Tool invocation failure:** Result envelope carries `ActionOutcome = "error"` + `ActionErrorKind` (e.g., "invalid_target", "not_enough_slots"). g2-app shows as toast, retains last known good state.
- **Missing bearer token:** HTTP 401 → re-login wizard (Phase 2 Plan 01).
- **Tool not found:** 400 Bad Request with message. Bridge logs unknown tool ID.
- **Idempotency conflict:** 409 with cached result. Never re-executes; returns prior outcome.

## Cross-Cutting Concerns

**Logging:** Pino (structured, JSON-line). Bridge logs at `info` (normal ops), `warn` (recoverable errors), `error` (fatal). Foundry module uses Foundry's `console.log` (Phase 1 placeholder, upgraded in Phase 2 to pino if Foundry supports it). g2-app uses `console.*` for now (test phases upgrade to pino once voice logging requirements are clear per Specs.md §5.8.3).

**Validation:** Zod at every schema boundary (ADR-0002). No `any` types in schemas. All payload unions exhaustive (TypeScript `never` fallthrough catch). Test gate: `biome ci .` enforces `noUnusedLocals`, catching schema fields that were never used.

**Authentication:** Bearer tokens issued by foundry-module at pair time, stored in Tier 4 (Even Hub key-value), sent by g2-app in every WS message. No session cookies (WASM plugins don't support Set-Cookie per Even Hub SDK). Rate limit by token (100 req/min per `@fastify/rate-limit` default); fallback to IP if token missing.

---

*Architecture analysis: 2026-05-24*
