# External Integrations

**Analysis Date:** 2026-05-14

## APIs & External Services

### Even Realities Ecosystem

**Even Hub SDK (G2 Display & Input):**
- Service: Even Realities Hub — Display ops, event capture, audio input, networking whitelist
- Used by: `@evf/g2-app` (browser plugin host)
- SDK/Client: Declarative API via `bridge.*` globals injected by Even Realities App WebView runtime
  - `bridge.createTextContainer`, `bridge.updateText`, `bridge.createImageContainer`, `bridge.updateImageRawData`
  - `bridge.createListContainer`, `bridge.updateList`
  - `bridge.audioControl(true|false)`, event listener `event.audioEvent.audioPcm` (PCM 16 kHz s16le mono)
  - `onPageLoad`, `onPageUnload` lifecycle hooks
  - Event capture: container with `isEventCapture: 1` receives `onTap`, `onScroll`, `onLongPress` events
- Auth: Bearer token (player-scoped, 24h TTL) provided by bridge service at pairing
- Constraints: 4-bit greyscale 576×288 display, max 4 image containers + 8 text/list per page, 1 event-capture container, no localStorage, no audio output (G2 has no speaker)
- Documentation: `hub.evenrealities.com/docs/*` (verified Specs.md §3.1, §3.5)

**Even R1 Ring (Gesture Input):**
- Service: Even Realities smart ring via BLE → Even App → WebView event stream
- Used by: `@evf/g2-app` gesture handler (R1-to-panel navigation)
- SDK/Client: Event objects `{ r1.tap | r1.scroll | r1.longPress | r1.biometrics }`
  - Tap: `{ count: 1|2, timestamp }`
  - Scroll: `{ direction: "up"|"down"|"left"|"right", magnitude }`
  - Long-press: `{ phase: "start"|"end", duration_ms }`
  - Biometrics: `{ hr, hrv, spo2, ts }` (low-frequency push)
- Auth: None (hardware-level, user bound by BLE pairing)
- Constraints: No audio output from ring; gesture mapping is tap/scroll/long-press only (Specs.md §3.2)
- Documentation: `evenrealities.com/smart-ring` + `support.evenrealities.com/specs` (product page verified)

**Even Realities App Configuration UI (Phone WebView):**
- Service: Per-plugin settings panel exposed in Even Realities App on phone
- Used by: `@evf/g2-app` wizard and pairing flow (bridge URL, auth token, character selection)
- Interface: Native phone UI, not G2-rendered; settings persisted in Even App storage
- Fields: Bridge URL, auth token (paste or QR scan), player/character enum, world identifier (optional), connection profile, auto-connect toggle
- Auth: None (user-local device configuration)
- Documentation: Verified `support.evenrealities.com` ("configure each widget individually through the Even App"), Specs.md §3.8

**Even Hub Network Constraints:**
- Whitelist enforcement: Every origin (plugin-host URL + bridge URL) must be in `app.json` `network.whitelist` (origin-complete strings, no wildcards)
- HTTPS mandatory in production, HTTP allowed in local dev
- Payload size: Not documented; assume best-effort, compress
- Documentation: `hub.evenrealities.com/docs/guides/networking` (verified Specs.md §3.3)

### FoundryVTT & dnd5e System

**Foundry VTT Core:**
- Service: FoundryVTT game platform (user's homelab installation or The Forge)
- Used by: `@evf/foundry-module` (reads actor, combat, scene, token state; writes activity execution, targets, templates)
- SDK/Client: Global `game.*` objects + Hooks API
  - `game.actors` (collection), `game.combats`, `game.scenes`, `game.messages`, `game.settings`
  - `game.i18n` (Localization instance with `lang`, `localize()`, `format()`)
  - `Hooks.once()`, `Hooks.on()` for init, ready, updateActor, etc.
- Compatibility: **Minimum v13.347** (required by dnd5e 5.x), **verified on v14**
- Auth: Module runs with Foundry system user permissions (GM for socket handlers, player for module API reads)
- Constraints: Single world, no multiplayer sync cross-world
- Documentation: `foundryvtt.com/api/*` (verified Specs.md §3.4)

**dnd5e System (≥5.3.3):**
- Service: Official D&D 5e system for Foundry
- Used by: `@evf/foundry-module` for activity system, spell/weapon/item execution, roll flows
- SDK/Client: 
  - `actor.system.activities` (Collection of Activity pseudodocuments, each with `activity.use(usage, dialog, message)`)
  - `AbilityTemplate.fromActivity(activity)` → `AbilityTemplate[] | null` (array for multi-template AoE)
  - Hooks: `dnd5e.preUseActivity`, `dnd5e.postUseActivity`, `dnd5e.preRollAttackV2`, `dnd5e.rollAttackV2`, `dnd5e.postRollAttackV2`, `dnd5e.preRollDamageV2`, `dnd5e.rollDamageV2`, `dnd5e.preCreateActivityTemplate`
  - Targeting: `Token#setTarget()` no longer accepts `user` param (v13+); use `TokenLayer#setTargets(tokens)` for multi-target
- Compatibility: **≥5.3.3** (v5.3.0 changed advancement data structure from array → object), v12 explicitly not supported
- Auth: Integrated with Foundry user model; player can execute activity only on possessed actor
- Constraints: Dual-edition support (PHB 2014 + 2024 via `core.modernRules` setting)
- Documentation: `github.com/foundryvtt/dnd5e` (live `system.json` verified 2026-05-10, Specs.md §3.4)

**Foundry Localization API:**
- Service: i18n/localization system
- Used by: `@evf/foundry-module` for locale detection and runtime override
- SDK/Client: `game.i18n` instance
  - `game.i18n.lang` (current BCP-47 code, e.g., "it", "en")
  - `game.i18n.localize(key)`, `game.i18n.format(key, data)`
  - `game.i18n.has(key)`
  - `game.settings.get('core', 'language')` (core setting for Foundry default)
- Architecture: Foundry modules register language catalogs via `manifest.languages: [{lang, name, path}]`
- Constraint: Module override stored device-local, never modifies world setting (Specs.md §7.16)
- Documentation: `foundryvtt.com/api/classes/foundry.helpers.Localization.html`

### FoundryVTT Module Dependencies

**socketlib (`github.com/farling42/foundryvtt-socketlib`):**
- Service: GM-side code execution dispatcher for Foundry modules
- Used by: `@evf/foundry-module` for bearer registry writes, socketlib-handlers (Phase 2 D-2.12)
- SDK/Client: Registration pattern `socketlib.registerModule("evenfoundryvtt")` → socket instance
  - `socket.register(handlerName, fn)` → register handler
  - `await socket.executeAsGM(handlerName, ...args)` → invoke handler as GM
  - Also: `executeAsUser`, `executeForAllGMs`, `executeForOtherGMs`, `executeForEveryone`, `executeForOthers`, `executeForUsers`
- Dependency declaration: `module.json` `relationships.requires` (Foundry auto-prompts install)
- Authentication: Foundry-internal permission model (socket guarantees handler runs as specified user/role)
- NOT on npm — sourced from `github.com/farling42/foundryvtt-socketlib`, installed as Foundry module
- Documentation: Project README on GitHub (verified Specs.md §4.8)

**MidiQOL (`gitlab.com/tposney/midi-qol`):**
- Service: Full-flow attack→damage→save→effect workflow wrapper for dnd5e activities
- Used by: `@evf/foundry-module` (optional, detected via capability handshake §5.6.3)
- SDK/Client: When present, bridge calls `MidiQOL.completeActivityUse({ asUser, ...opts })` instead of raw `activity.use()`
- Dependency declaration: `module.json` `relationships.requires` (optional but recommended)
- Fallback: If absent, bridge executes `activity.use()` directly (deterministic core MVP not blocked)
- NOT on npm — sourced from `gitlab.com/tposney/midi-qol`, installed as Foundry module
- Documentation: GitLab project wiki (verified Specs.md §4.8)

## Data Storage

**Databases:**
- Not applicable for MVP (Phase 1). In-memory Map<sessionId, state> with TTL sufficient for single-tenant homelab.

**State Persistence (Foundry Module Settings):**
- Bearer registry: `game.settings.register(MODULE_ID, 'bearerRegistry', {...})`
  - Structure: `{ entries: Record<tokenId, { bridgeUrl, internalSecret, expiresAt, revokedAt }> }`
  - Used by: Foundry module to authenticate delta POSTs to bridge `/internal/delta`
  - Scope: GM-only (write protected); module reads for auth
- Locale override: Stored device-local in G2 plugin state (not in Foundry world)

**File Storage:**
- Bridge service: No persistent file storage (in-memory only, MVP)
- G2 plugin: Persisted settings via Even Realities App phone-side key-value (user-controlled, not in code)
- Foundry module: Uses Foundry's `game.settings` for bearer registry + metadata
- Plugin host: Stateless, zero storage

**Caching:**
- Bridge: In-memory LRU cache per session (actor state, combat state, event log snapshots)
- Phase 13 stretch: Promote to Redis Tier 2 (not MVP)

## Authentication & Identity

**Auth Provider:**
- Custom bearer token system per Specs.md §11.5.4
  - Generation: `evenfoundryvtt` Foundry module generates opaque 24h tokens at pairing time
  - Storage: Encoded in QR code + stored in bearer registry on GM account
  - Transport: HTTPS/WSS Bearer header `Authorization: Bearer <token>`
  - Validation: Bridge verifies token against internal registry, timing-safe comparison (`crypto.timingSafeEqual`)
  - Scope: Per-player (token tied to Foundry user ID), not global

**Auth Flow:**
1. GM initiates pairing: clicks "Generate Pairing QR" in Foundry module settings (Phase 2 UI)
2. Module creates bearer entry: 24h TTL, unique internal_secret, QR payload (Specs.md §7.14.7.3)
3. Player scans QR on Even App phone: wizard loads bridge URL + pastes token
4. Handshake: `GET /v1/actor` authenticated with bearer → bridge validates → returns character list
5. Player selects character → settings persisted on phone (Even Realities App storage)
6. G2 connects: auto-authenticate with stored token on WebView load

**No OAuth/External Identity:**
- Foundry user model is the source of truth; no external IdP
- Token scope: single player, single world instance

## Monitoring & Observability

**Error Tracking:**
- Not deployed in MVP (Phase 1)
- Future: Sentry or equivalent for bridge service (Phase 3+ stretch)

**Logs:**
- Bridge: **pino** structured logging (JSON-line format)
  - In dev: piped to `pino-pretty` for human-readable output
  - In prod: ship to centralized logging (Loki, CloudWatch, etc.)
  - Includes: request/response timing, bearer auth events, delta emit success/failure
- Foundry module: Uses Foundry's `console.warn/error` (allowed by Biome linter per noConsole allow list)
- G2 plugin: Errors logged to bridge via heartbeat/failure channel (Phase 4a implementation)

**Metrics:**
- Bridge: **prom-client** Prometheus metrics exposition
  - Endpoint: `/metrics` (per Phase 3 §10)
  - Metrics: HTTP request duration, WS connection count, bearer token validity distribution, delta emit latency, activity execution duration
  - Scrape target: Prometheus (optional, Phase 13 cloud)

**Observability Constraints:**
- No external observability in MVP; metrics internal only
- Structured logging sufficient for debugging homelab deployments

## CI/CD & Deployment

**Hosting (MVP):**
- **Plugin Host:** Static HTTP(S) via nginx/Caddy serving `packages/g2-app/dist/` (zero state, CDN-friendly)
  - Deployment: Docker Compose `nginx:alpine` service
  - Caching: Aggressive (content-hash in filename, cache-busting on build)
  - Origin for whitelist: `https://evenfoundryvtt.example/g2/` (or user's domain)

- **Bridge Service:** Node.js Fastify service on `node:24-alpine`
  - Deployment: Docker Compose, port 8910 (exposed via reverse proxy)
  - Health checks: `/healthz` (liveness), `/readyz` (readiness)
  - Compose networks: shared with Foundry (if co-located)
  - Origin for whitelist: `https://homelab.lan:8910` (dev) or tunnel URL (prod)

- **Foundry Module:** Installed via manifest URL (GitHub Release) or symlinked in dev
  - Release artifact: `evenfoundryvtt.zip` containing `dist/module.js` + lang files
  - Manifest URL: `https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json`
  - Auto-dependencies: socketlib, midi-qol, dnd5e ≥5.3.3 (declared in module.json)

**CI Pipeline (GitHub Actions):**
- Workflow: `.github/workflows/ci.yml` enforces D-1.10 seven-gate pipeline on every PR
  - Gates: lint (Biome), typecheck (TS), test (Vitest coverage ≥80%), changeset present, no secrets
  - Triggers: push to main, PR from any branch
  - No external API calls in CI (Phase 0 hardware tests are manual, gated on Even Hub access)

**Release Process:**
- Changesets: `@changesets/cli` per-package independent versioning
  - Each PR includes `.changeset/*.md` file (auto-generated by `pnpm changeset`)
  - Pre-1.0 no-publish (can bump versions without publishing to npm)
  - Foundry module releases: GitHub Release with module.json + zip artifact

**V2 MCP Deployment (Phase 11+):**
- Transport: **Streamable HTTP** (MCP spec 2025-06-18+) for remote clients, **stdio** for local (Claude Desktop)
- Service: `node:24-alpine` container, same bearer token auth as bridge
- Origin for whitelist: same bridge origin (both on homelab or tunneled)

## Environment Configuration

**Required env vars (Bridge service):**
- None hardcoded; all via Foundry settings or Even App configuration
- Future: PORT, LOG_LEVEL, PROM_PORT (Phase 3 stretch)

**Secrets location:**
- Bearer registry: Stored in Foundry module settings (GM account, encrypted by Foundry)
- Internal secret: Generated per-pair, included in QR payload, stored on phone Even App
- No .env files checked in (per `.gitignore` and security best practice)

**Configuration sources:**
1. Foundry module settings UI (GM pairing interface)
2. Even Realities App per-plugin settings (player phone configuration)
3. G2 plugin state (device-local overrides, e.g., locale)
4. Docker Compose env for bridge service (optional, future)

## Webhooks & Callbacks

**Incoming (to Bridge):**
- REST API endpoints: `POST /v1/action/use-activity`, `POST /v1/action/set-targets`, etc. (Phase 7 fills implementation)
- WebSocket endpoint: `WS /v1/stream` (push delta updates, real-time HUD sync)
- Health check: `GET /healthz`, `GET /readyz` (Kubernetes-style, liveness/readiness)
- Metrics: `GET /metrics` (Prometheus scrape target, Phase 3+)

**Outgoing (from Bridge to Foundry):**
- WebSocket client toward Foundry module socket: handshake + heartbeat + bearer write commands (Phase 2+)
- HTTP POST toward plugin WebView (future): for push notifications or async event stream (not MVP)

**Outgoing (from Foundry Module):**
- HTTP POST to Bridge `/internal/delta` (fire-and-forget delta emitter, Phase 3 Plan 05)
  - Headers: `Authorization: Bearer <internal_secret>`
  - Body: `{ type: "character.delta" | "combat.delta" | ..., payload: {...} }`
  - No retry on failure (warning logged, session continues)

## Third-Party Service Integrations

**STT (Speech-to-Text) — V2 Optional:**
- Default cloud: **AssemblyAI Universal-Streaming** ($0.0025/min, ~250–310 ms p50)
- Alternative: **Deepgram Nova-3** ($0.0048/min monolingual / $0.0058/min multilingual streaming, PAYG or Growth tier discounts)
- Self-hosted: **faster-whisper** (distil-whisper-large-v3 via GPU, ~300–600 ms)
- Integration point: Bridge service (Phase 11 foundry-mcp) or MCP client (Claude Desktop voice mode)
- Phase: V2 optional, not MVP
- Documentation: Verified direct on `assemblyai.com/pricing` and `deepgram.com/pricing` (live 2026-05-10)

**LLM (Voice Agent) — V2 Optional:**
- Integrated via **Model Context Protocol (MCP)** — any MCP-compatible client (Claude Desktop, Claude Code, future apps)
- Vendor independence: No hard dependency on specific LLM; schema contract via Zod → JSON Schema
- Phase: V2 optional, not MVP
- Documentation: `modelcontextprotocol.io/specification/2025-06-18` (current spec, Streamable HTTP approved)

**MCP Server (foundry-mcp) — V2 Optional:**
- Transport: **Streamable HTTP** (primary) + **stdio** (for local clients like Claude Desktop)
- Deprecated: HTTP+SSE (deprecated since MCP spec 2024-11-05, replaced by Streamable HTTP 2025-03-26)
- Auth: Same bearer token as bridge (no new identity surface)
- Tools exposed: `cast_spell`, `weapon_attack`, `use_item`, `skill_check`, `move_token`, `place_template`, `set_targets`, `clarify`
- Resources exposed: `actor://{id}`, `scene://current`, `combat://current`, `log://recent`
- Phase: V2 optional, Phase 11 implementation
- Documentation: `modelcontextprotocol.io/` (verified 2026-05-10)

---

*Integration audit: 2026-05-14*
