<!-- refreshed: 2026-05-14 -->
# Architecture

**Analysis Date:** 2026-05-14

## System Overview

EvenFoundryVTT is a **protocol-driven, four-boundary system** that projects a Foundry VTT D&D 5e session onto Even Realities G2 AR glasses via an R1 ring gesture controller. The architecture spans:

1. **G2 glasses** (thin client) — display container API + 4-mic audio + IMU + touchpads
2. **Even Realities App (WebView)** — runs `g2-app` bundle (no arbitrary code execution on G2 firmware)
3. **Bridge service** (Node 24 LTS) — Fastify + WebSocket CORS proxy with bearer token auth
4. **FoundryVTT + dnd5e 5.x** — existing user infrastructure; our `foundry-module` plugs in as a module

**Optional V2:** `foundry-mcp` (MCP server for voice integration via external LLM)

```text
┌──────────────────────────────────────────────────────────────┐
│                      G2 Glasses (Display)                     │
│                  Even Realities Hub SDK API                  │
│         ┌────────────┬──────────┬─────────────┬────────┐     │
│         │ Container  │ Container│  Container  │ Event  │     │
│         │    1-4     │          │  Capture    │Emitter │     │
│         │ (images,   │ (text,   │ (isEvent    │(R1 tap,│     │
│         │  raster)   │ lists)   │  Capture:1) │scroll) │     │
│         └────────────┴──────────┴─────────────┴────────┘     │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │ BLE LC3 (4.2+ DLE, raw PCM audio)
                   │
┌──────────────────▼───────────────────────────────────────────┐
│        Even Realities App (Phone, WebView)                    │
│              @evf/g2-app bundle (Vite + TS)                  │
│         ┌──────────────┬─────────────────────────────┐        │
│         │ Wizard       │ HUD State Machine           │        │
│         │ (pair, auth) │ (z=0 map / z=1 HUD / z=2   │        │
│         │              │  overlay per ADR-0001)      │        │
│         └──────┬───────┴────────────┬────────────────┘        │
│                │                    │                         │
│                │ Tier 3 Storage     │ WebSocket (secure)      │
│                │ (Even Hub kv)      │ (auto-reconnect)        │
│                └────────────────────┼─────────────────────────┤
└───────────────────────────────────────┼──────────────────────┘
                                        │
                        HTTPS / WSS (plugin-host origin)
                                        │
┌───────────────────────────────────────▼──────────────────────┐
│         Bridge Service (Docker Compose)                       │
│    @evf/bridge (Fastify 5 + @fastify/websocket)             │
│    ┌──────────────┬──────────────┬──────────────┬──────────┐ │
│    │ WS Endpoint  │ HTTP REST    │ Auth Layer   │ Tool     │ │
│    │ (handshake,  │ (character,  │ (bearer 24h  │ Dispatch │ │
│    │  resume,     │  combat,     │  token,      │ (socket  │ │
│    │  replay)     │  scene, i18n)│  QR pair)    │  lib)    │ │
│    └──────┬───────┴──────┬───────┴──────┬───────┴──┬───────┘ │
│           │              │              │          │          │
│    Session│Replay Buffer │Idempotency   │Metrics   │Tag Cache │
│    Store  │(60s, ADR-0002│Store         │Registry  │(Token    │
│    (Map   │gap detection)│(POST dedupe) │(Prom)    │validate) │
│    w/ TTL)│              │              │          │          │
└───────────┼──────────────┼──────────────┼──────────┼──────────┘
            │              │              │          │
            │   socketlib executeAsGM (GM-side gate)
            │
┌───────────▼──────────────────────────────────────────────────┐
│         FoundryVTT (v13.347+, verified v14)                   │
│         @evf/foundry-module (evenfoundryvtt)                 │
│    ┌──────────────┬──────────────┬──────────────┬──────────┐ │
│    │ Module Init  │ Pair Modal   │ Bearer       │ Hook     │ │
│    │ (settings    │ (QR gen)     │ Registry     │Subscribers│
│    │  panel)      │              │ (socketlib)  │ (reader  │ │
│    │              │              │              │  deltas) │ │
│    └──────────────┴──────────────┴──────────────┴──────────┘ │
│    ┌──────────────┬──────────────┬──────────────┬──────────┐ │
│    │ Character    │ Combat       │ Event Log    │ Scene    │ │
│    │ Reader       │ Reader       │ Reader       │ Reader   │ │
│    │ (via dnd5e   │ (via dnd5e   │ (chat log    │ (token   │ │
│    │  Activity)   │  Activity)   │  capture)    │ viewport)│ │
│    └──────┬───────┴──────┬───────┴──────┬───────┴──┬───────┘ │
│           │ Delta emit (via Hooks.once() capture)             │
└───────────┼──────────────────────────────────────────────────┘
            │
         POST /internal/delta
         (Fire-and-forget, authorization: Bearer <internal_secret>)
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **g2-app wizard** | Bootstrap auth flow, connect to bridge, manage WebSocket state, handle Even Hub SDK lifecycle | `packages/g2-app/src/wizard/wizard.ts` |
| **g2-app HUD state machine** | Render z=0/z=1/z=2 layers per ADR-0001, manage overlay slot transitions, poll bridge for character/combat/scene state | Phase 4a (placeholder in `packages/g2-app/src/index.ts`) |
| **Bridge WS handshake** | Accept client connection, negotiate protocol version (`evf-v1`), assign session_id UUID, validate bearer token via TokenCache | `packages/bridge/src/ws/handshake.ts` |
| **Bridge replay buffer** | Store 60-second window of envelopes, detect gaps (ADR-0002), respond to `client_resume` with either replay or full snapshot | `packages/bridge/src/ws/replay-buffer.ts` |
| **Bridge REST reader routes** | Query Foundry state via socketlib `executeAsGM`, return character/combat/scene/i18n snapshots | `packages/bridge/src/routes/character.ts` + `combat.ts` + `scene.ts` + `events.ts` |
| **Bridge tool dispatch** | Route tool invocations (cast_spell, weapon_attack, move_token, etc.) to Foundry hooks via socketlib handlers | `packages/bridge/src/routes/tools-dispatch.ts` |
| **Foundry module init** | Register settings panel, load pairing UI, bind `Hooks.once("init")` + `Hooks.once("ready")` handlers | `packages/foundry-module/src/module.ts` |
| **Foundry pairing modal** | Display QR code (24h bearer payload), persist internal_secret + bridge URL to settings, validate on socket close | `packages/foundry-module/src/pair/PairModal.ts` |
| **Foundry socketlib handlers** | GM-side RPC handlers for tool invocations (cast_spell, weapon_attack, etc.); respond with result or error | `packages/foundry-module/src/pair/socketlib-handlers.ts` |
| **Foundry hook readers** | Capture updates on character/combat/scene/event-log via Foundry hooks, emit deltas to bridge via `bridgeDeltaEmitter` | `packages/foundry-module/src/readers/hook-subscribers.ts` |
| **shared-protocol** | Zod schemas for envelope, handshake, payload types, tool inputs — single source of truth (ADR-0002, ADR-0003) | `packages/shared-protocol/src/` |
| **shared-render** | ASCII grid model + snapshot matcher for INV-1 layout integrity testing (Phase 4a real usage) | `packages/shared-render/src/ascii-grid.ts` + `snapshot.ts` |

## Pattern Overview

**Overall:** Protocol-driven async messaging via WebSocket (Foundry → Bridge → G2-app), with REST fallback for snapshot queries. All messages use the `evf-v1` envelope schema (ADR-0002). State is immutable deltas — no full rewrites. Zod schemas are the single source of truth for all wire contracts.

**Key Characteristics:**
- **Stateless service tier** — Bridge holds no game state; all queries go through socketlib to Foundry on demand
- **WS resumption + replay** — Clients reconnect via `client_resume`; bridge either replays buffered envelopes or sends full snapshot (ADR-0002)
- **Layered rendering** — G2 display is z=0 (raster/glyph map) + z=1 (status HUD corner card, persistent) + z=2 (overlay panel slot, modal-like)
- **Fire-and-forget delta push** — Foundry → Bridge via POST /internal/delta with no response expectation; failures log warning only (T-02-01)
- **Bearer tokens scoped to device** — QR pairing encodes 24h token + internal_secret; revoke by clearing entry in Foundry's bearer registry
- **Shared Zod schemas** — All wire types defined once in `shared-protocol`; bridge, foundry-module, g2-app, and (future) foundry-mcp all import and trust the same schemas

## Layers

**Layer 0 — Even Realities Hardware Boundary:**
- Purpose: Render UI to G2 display, capture R1 gestures
- Location: G2 glasses (firmware, not our code) + Even Hub SDK (Tier 3 storage, image/text container API)
- Contains: Display ops API (createTextContainer, createImageRawData, updateImageRawData), audio capture (PCM 16 kHz s16le mono), gesture events (tap, scroll, long-press)
- Depends on: Nothing (origin)
- Used by: g2-app via Even Hub SDK (provided by Even Realities App WebView)

**Layer 1 — Plugin Host (Even Realities App WebView):**
- Purpose: Run the client application bundle; manage WebSocket lifecycle; render UI per bridge state
- Location: `packages/g2-app/`
- Contains: Vite-bundled TypeScript app, wizard (pairing flow), HUD state machine (Phase 4a), connection auto-reconnect logic
- Depends on: shared-protocol (Zod schemas), shared-render (ASCII grid testing), Even Hub SDK (provided by WebView)
- Used by: G2 glasses (via Even Hub SDK calls)

**Layer 2 — Bridge Service (Node.js):**
- Purpose: Protocol translation, session management, WS replay buffer, Foundry state proxy, tool dispatch coordination
- Location: `packages/bridge/`
- Contains: Fastify HTTP/WS server, socketlib gateway, token cache, metrics, idempotency deduplication
- Depends on: shared-protocol (schemas), Foundry (via socketlib over TCP), Even Hub (bearer token validation at token-cache layer if needed)
- Used by: g2-app (WebSocket), Foundry module (POST /internal/delta)

**Layer 3 — Foundry Module:**
- Purpose: Hook into Foundry's game loop; read character/combat/scene state; dispatch tool invocations
- Location: `packages/foundry-module/`
- Contains: Module init, settings panel, pairing modal (QR gen), socketlib handlers, Foundry hook readers (dnd5e Activity API readers)
- Depends on: shared-protocol (schemas), Foundry VTT (13.347+), dnd5e system (5.3.3+), socketlib module (required via module.json)
- Used by: Foundry VTT (via esmodules hook)

**Layer 4 — Shared Data Contracts:**
- Purpose: Type safety and wire protocol guarantee across all layers
- Location: `packages/shared-protocol/` (Zod schemas), `packages/shared-render/` (ASCII grid model + snapshot matcher)
- Contains: Envelope schema, handshake schema, payload schemas (character, combat, scene, event-log), tool input schemas, ASCII fixture matcher
- Depends on: Zod library, Vitest (for snapshot matcher peer dependency)
- Used by: All other packages (import-time schema validation + serialization)

## Data Flow

### Primary Request Path: Character State Update

1. Player action in Foundry triggers a dnd5e Activity Hook or actor data change (`actor.update()`)
2. Foundry module hook subscriber (`registerHookSubscribers`) observes the hook and calls `CharacterReader.snapshot()`
3. CharacterReader traverses the actor's data model (via dnd5e 5.x Activity API) and emits a `CharacterSnapshot` (typed per `shared-protocol`)
4. Hook subscriber wraps the snapshot in a `DeltaEnvelope` (`type: "character.delta"`, `seq`, `ts`, `session_id`) and calls `bridgeDeltaEmitter()`
5. `bridgeDeltaEmitter()` POSTs the envelope to `bridge:8910/internal/delta` with `Authorization: Bearer <internal_secret>` header
6. Bridge's `/internal/delta` route validates the bearer token (token-cache), appends the envelope to the replay buffer, and broadcasts it to all connected WebSocket clients via `DeltaEmitter.broadcast()`
7. g2-app client receives the delta envelope on the WebSocket, applies it to local state, and triggers a re-render of the affected HUD element (e.g., HP bar, action count)
8. g2-app calls `even.createTextContainer()` or `updateImageRawData()` to update the Even Hub container
9. G2 firmware receives the container update and refreshes the display at next vsync

**Key invariant:** Each envelope is idempotent per `seq` (via IdempotencyStore middleware). If the client receives `seq=42` twice, only the first POST to `/internal/delta` takes effect; the second is deduped.

### Secondary Flow: Player Action (Tool Invocation)

1. Player taps R1 ring or swipes, triggering an R1 gesture event on G2
2. Even Hub SDK emits the gesture to the WebView, caught by g2-app's `handleR1Gesture()`
3. g2-app determines the intended action (e.g., "cast spell") and calls `bridge.POST /v1/tools/cast-spell` with the tool input (actor ID, spell name, target list, etc.)
4. Bridge's `/v1/tools/:tool` route looks up the tool in `TOOL_DISPATCH_TABLE`, validates input against the Zod schema, and calls the handler
5. Tool handler calls `socketlib.executeAsGM('my-tool-handler', { actor_id, spell_name, ... })` to invoke the GM-side handler in Foundry
6. Foundry module's socketlib handler (in `socketlib-handlers.ts`) receives the invoke, performs the action (call `actor.activity.use()`, etc.), and returns the result
7. Bridge responds to the client with HTTP 200 + result JSON (or 400/500 on error)
8. g2-app receives the result, updates local state (e.g., spell slots decremented), and re-renders

**State Management:**
- **Client-side state** (g2-app): Transient, reconstructed from bridge snapshots + received deltas. Cleared on disconnect; full refresh on resume via `/v1/character` REST call
- **Bridge-side state** (in-memory Map + replay buffer): Session state + 60s envelope window. TTL-evicted entries are dropped; new clients calling `/v1/character` re-fetch from Foundry
- **Server-side authoritative state** (Foundry): The source of truth. All readers (`character-reader.ts`, etc.) query Foundry on demand via socketlib. No caching beyond the 60s replay buffer

## Key Abstractions

**Envelope (ADR-0002):**
- Purpose: Framing for all wire protocol messages
- Examples: `EnvelopeSchema` in `packages/shared-protocol/src/envelope.ts`, `DeltaEnvelopeSchema`, `ClientResumeSchema`
- Pattern: Discriminated union via `type` field. Each message type (character.delta, resume_replay, etc.) has its own narrow schema; all extend the base envelope shape

**Tool Registry (ADR-0003):**
- Purpose: Define MVP gestures (cast_spell, weapon_attack, move_token, place_template, set_targets, skill_check, use_item) + extensibility for Phase 5+
- Examples: `TOOL_REGISTRY` in `packages/shared-protocol/src/tools/index.ts`, with per-tool input schemas (CastSpellInputSchema, WeaponAttackInputSchema, etc.)
- Pattern: Zod discriminated union. Tool name → input schema → dispatch handler function. Schemas are the contract; bridge validates input and rejects invalid calls before reaching Foundry

**Layer Manager (ADR-0001, Phase 4a):**
- Purpose: Manage z=0/z=1/z=2 layer stack, single capture container migration, overlay open/close transitions
- Examples: Phase 4a will implement `LayerManager` in g2-app; outlined in `docs/architecture/0001-layered-ui-model.md`
- Pattern: State machine with three layers; z=2 overlay slot is single-tenant; closing overlay returns capture to z=1 HUD

**Reader (Foundry → Bridge snapshot contract):**
- Purpose: Extract a game-state snapshot from Foundry, return typed payload
- Examples: `CharacterReader.snapshot()`, `CombatReader.snapshot()`, `SceneReader.snapshot()`
- Pattern: Pure function accepting actor/combat/scene ID, returning a Zod-validated snapshot. Readers live in `packages/foundry-module/src/readers/`; bridge REST routes call them via socketlib

## Entry Points

**g2-app:**
- Location: `packages/g2-app/src/index.ts` (stub; Phase 4a fills real entry)
- Triggers: Even Realities App WebView loads the plugin host URL (HTTPS served by static nginx)
- Responsibilities: Initialize wizard (pairing UI), set up WebSocket connection to bridge, spin up HUD state machine, begin listening for delta envelopes and R1 gestures

**Bridge:**
- Location: `packages/bridge/src/index.ts`
- Triggers: Docker container starts, reads `PORT` and `EVF_INTERNAL_SECRET` from environment, calls `buildServer()` and `.listen()`
- Responsibilities: Boot Fastify instance, register all plugins (cors, rate-limit, websocket, routes), await ready, log listen address, accept connections

**Foundry Module:**
- Location: `packages/foundry-module/src/module.ts`
- Triggers: Foundry VTT boots, loads `module.json`, executes `esmodules: ["dist/module.js"]` (compiled from this entry)
- Responsibilities: Export `MODULE_ID` constant, register `Hooks.once('init')` to call `registerSettings()`, register `Hooks.once('ready')` to call `registerSocketlibHandlers()` + `registerHookSubscribers()`

**Validation Harness (Phase 0 tests):**
- Location: `packages/validation-harness/src/`
- Scripts: `scripts/10-0-*.ts` (hardware validation) + `scripts/midiqol-config-probe.ts`
- Triggers: Manual `pnpm --filter @evf/validation-harness validate:all` (requires Even Hub access); CI smoke test via `--skip-hardware`
- Responsibilities: Gate-test hardware assumptions (R1 timing, image format, BLE bandwidth, DLE sustained, queue depth, palette calibration, MidiQOL probe)

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js Fastify); async I/O via Promise/await. No worker threads in bridge MVP; g2-app has optional Web Worker for raster encoding (Phase 4a, spec §11.5.7)
- **Global state:** Bridge uses `SessionStore` (Map<sessionId, state>), `ReplayBuffer`, `IdempotencyStore` (Map<idempotency-key, result>), `TokenCache` (Map<token, metadata>). All are per-`buildServer()` instance — tests inject fresh instances for isolation
- **Circular imports:** None detected; monorepo uses `workspace:*` with `moduleResolution: Bundler` to prevent cycles
- **Protocol versioning:** `evf-v1` baked into all envelopes. Breaking wire changes → new `evf-v2` (future); old clients rejected at handshake
- **Mandatory assumptions:** Foundry ≥13.347, dnd5e ≥5.3.3, Node 24 LTS, pnpm 10.33.4. Enforce via `engines` in root `package.json` and Docker base image pin

## Anti-Patterns

### Full-page re-renders on every state change

**What happens:** Re-rendering the entire G2 display when a single value (e.g., HP) changes. ADR-0001 forbids this.

**Why it's wrong:** G2's 5 fps target (Specs §7.4b) and latency budget (16–200 ms per frame per different constraints) means redrawing 576×288 4-bit every change blows bandwidth and battery. Layer persistence (z=1 HUD always visible, z=2 overlays isolated) requires partial updates only.

**Do this instead:** Compute a delta (changed region), encode only the delta in the image container (Specs §11.5.7 custom RLE + sub-tile hashing via `xxhash-wasm`), call `updateImageRawData()` with the delta rect.

### Synchronous token validation in request path

**What happens:** Bridge calls Foundry's bearer token validation inline per request. If Foundry is slow or offline, requests hang.

**Why it's wrong:** Bridge is a stateless proxy. Token cache should pre-populate tokens from Foundry at pair time or on first successful request, then cache with TTL. Synchronous blocking violates async I/O principles.

**Do this instead:** Use `TokenCache` (see `packages/bridge/src/auth/token-cache.ts`): pre-fetch known tokens, cache with 1-hour TTL, non-blocking validation. Fail fast on unknown token before reaching Foundry.

### Storing game state in the bridge

**What happens:** Bridge accumulates actor/combat state, tries to diff against received deltas, rejects "old" deltas.

**Why it's wrong:** Bridge is a message broker, not a game engine. If Foundry's source of truth diverges from bridge's cache, silent failures occur. Stateless design is harder to reason about but safer.

**Do this instead:** Bridge stores NO game state except session metadata. All snapshots come from Foundry on demand (via `/v1/character`, etc.). Replay buffer stores ENVELOPES only, not payload interpretation. See `packages/bridge/src/ws/replay-buffer.ts`.

### Broadcasting to all clients without filtering

**What happens:** g2-app player A receives character state for player B's token (or DM-only scene data).

**Why it's wrong:** Even Realities has no built-in RBAC. We must filter outbound deltas per session (which player is this token?). ADR-0002 §resume protocol doesn't mention filtering yet (Phase 5 design).

**Do this instead:** Session creation MUST capture the pairing player's ID. Tool invocations and delta subscriptions MUST be scoped to that player. (Phase 3–5 real implementation.)

## Error Handling

**Strategy:** Fail open (incomplete action logged as warning), never throw in critical paths.

**Patterns:**
- **Foundry → Bridge delta push:** POST /internal/delta in Foundry module is `fire-and-forget`. Network failure logs warning via `console.warn` but does NOT interrupt the Foundry session. Player action succeeds locally; remote client sees stale state until next snapshot refresh (T-02-01)
- **WS handshake failure:** Client retry-logic in g2-app's auto-connect flow (exponential backoff + jitter). Bridge does not re-initiate
- **Token validation failure:** Bearer token unknown or expired → HTTP 401 Unauthorized. Client MUST re-pair (Specs §11.5.4). Revocation via cleared bearer registry entry
- **Replay buffer gap (ADR-0002):** client_resume asked for seq > buffer contains → bridge responds `resume_full_snapshot` with reason (`buffer_expired` or `buffer_gap`). Client re-fetches all state via REST `/v1/character`, `/v1/combat`, etc.
- **Tool invocation failure:** Foundry socketlib handler returns error object; bridge HTTP 400 with error detail. Client shows toast warning, action reverted locally

## Cross-Cutting Concerns

**Logging:** pino structured logger at bridge level (JSON-line output). Redaction list for bearer tokens (T-02-01, see `packages/bridge/src/server.ts` pino config). Foundry module uses console.warn for bridgeDeltaEmitter failures (whitelisted per biome.jsonc `noConsole` rule)

**Validation:** Zod runtime validation at all wire boundaries:
- `/internal/delta` POST payload parsed as `DeltaEnvelopeSchema`
- `/v1/tools/:tool` input validated against `TOOL_INPUT_SCHEMAS[toolName]`
- WS envelope messages validated as `EnvelopeSchema` or subschemas (ClientResumeSchema, ResumeReplaySchema, etc.)
- Invalid data → HTTP 400 + error detail (no crash)

**Authentication:** Bearer token (opaque 24-character string, generated at pair time). Stored in Foundry module settings under `bearerRegistry.entries[tokenId].internalSecret`. 24-hour TTL. Revoke by setting `revokedAt = now`. No user password authentication; tokens are device-paired only (Specs §11.5.4)

---

*Architecture analysis: 2026-05-14*
