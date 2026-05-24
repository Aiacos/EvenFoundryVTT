# External Integrations

**Analysis Date:** 2026-05-24

## APIs & External Services

**Even Realities:**
- Even Hub SDK (`@evenrealities/even_hub_sdk@0.0.10`)
  - What it's used for: Device API envelopes (display update ops, audio capture, touch events, device status)
  - Location: `packages/g2-app/src/hub-polyfill.ts` (main SDK dispatch wrapper)
  - Events: `EvenAppBridge.subscribe()` listeners for `buttonTap`, `scroll`, `longPress`, `audioEvent`, `statusEvent`
  - Display ops: `EvenAppBridge.createTextContainer()`, `EvenAppBridge.updateImageRawData()`, `EvenAppBridge.setLocalStorage()`
  - Auth: None; SDK is pre-authenticated via Even Realities App WebView context

**Deepgram Nova-3 Multilingual STT (Phase 12+):**
- Deepgram WebSocket API (`wss://api.deepgram.com/v1/listen`)
  - What it's used for: Speech-to-text streaming transcription (optional V2 voice feature)
  - Location: `packages/bridge/src/voice/deepgram-stt.ts`
  - Auth: `Authorization: Token <DEEPGRAM_API_KEY>` header (verified DG-06)
  - Format: PCM 16 kHz s16le mono (passthrough from Even Hub SDK `audioEvent.audioPcm`)
  - Soft-fail: Missing DEEPGRAM_API_KEY env var → bridge boots normally, `/v1/audio/stream` closes 1011 'voice-disabled'
  - Keyterm integration: Phase 15 Plan 02 feeds entity-pack snapshots as Deepgram session keyterms for entity-aware STT

**FoundryVTT:**
- D&D 5e system API (dnd5e ≥5.3.3)
  - What it's used for: Actor/item/scene data models, Activity system, advancement tracking
  - Location: `packages/foundry-module/` (module-level socket integration)
  - Compatibility: Foundry ≥13.347 (verified on v14), dnd5e ≥5.3.3
  - Module dependency: `socketlib` (farling42/foundryvtt-socketlib) — **NOT on npm**, installed as Foundry module via manifest.json `relationships.requires`
  - Optional: MidiQOL (gitlab.com/tposney/midi-qol) for full attack→damage→save flow; fallback to vanilla `activity.use()`

**Model Context Protocol (Phase 11+):**
- MCP stdio transport (local): Claude Desktop integration
- MCP Streamable HTTP transport (remote): HTTP+SSE variant for remote homelab MCP clients
  - Location: `packages/foundry-mcp/`
  - Spec: modelcontextprotocol.io/specification/2025-06-18
  - Tool registry: Exposed as MCP Tools (cast_spell, weapon_attack, et al.) with Zod schema validation
  - Auth: Bearer token (same 24h opaque as bridge)

## Data Storage

**Databases:**
- Not detected - MVP uses in-memory state only
- Tier 1 (MVP): In-memory `Map<sessionId, State>` with TTL in bridge (see SessionStore)
- Tier 2 (Phase 13+): Redis (planned for multi-tenant/cloud scaling)

**File Storage:**
- Local filesystem only (homelab Docker volume mounts)
- Portrait cache: `packages/bridge/src/portrait/portrait-cache.ts` - LRU in-memory cache for actor portrait blobs
- No cloud storage integration (Phase 13+ stretch)

**Even Realities Key-Value Store (Tier 4):**
- Even Hub SDK provides `setLocalStorage()` / `getLocalStorage()` for persistent app state
- Used for: G2 device-local settings (e.g., Quick Action overrides per `packages/g2-app/src/engine/map-mode-toggle.ts`)
- Scope: Per-device, never synced to world settings (INV-2 verified §7.16)

**Entity Pack Cache:**
- `packages/bridge/src/cache/entity-pack-cache.ts` - In-memory snapshot of Foundry actor/item entities
- Refreshed via `/internal/delta` webhook from foundry-module
- Consumed by: Phase 15 voice keyterm integration + reader REST routes

**Spell Pack Cache:**
- `packages/bridge/src/cache/spell-pack-cache.ts` - In-memory snapshot of available spells (SPELL_KEYTERMS)
- Refreshed via `/internal/delta` webhook
- Consumed by: Voice keyterm integration + `/v1/spells` REST route

## Caching

**Caching Strategy:**
- Tier 1: In-memory LRU (portrait, entity-pack, spell-pack, session state)
- Tier 1.5: Replay buffer (WS handshake recovery, `packages/bridge/src/ws/replay-buffer.ts`)
- Idempotency store: Request deduplication via Idempotency-Key header (ADR-0002, Plan 03-02)
- No Redis (MVP only)

## Authentication & Identity

**Auth Provider:**
- Custom bearer token system (not external SSO)
  - Implementation: QR-pairing flow in Foundry module (Specs.md §11.5.4, §7.14.7.3)
  - Token: 24-hour opaque bearer (generated server-side, scanned via QR code by paired device)
  - Location: `packages/foundry-module/src/pairing-ui.ts` + `packages/bridge/src/auth/token-cache.ts`
  - Validation: TokenCache validates incoming WS handshakes against module-stored 24h window

**API Token Scopes:**
- All bearer tokens have same scope (no granular permissions in MVP)
- Rate limit: 100 req/min per token (via Fastify rate-limit plugin)
- Internal secret: `EVF_INTERNAL_SECRET` env var — used for module → bridge `/internal/delta` POST auth (separate from user bearer)

**Foundry Module Auth:**
- socketlib `executeAsGM` wrapper (Phase 3+) — GM-only actions (Specs.md §4.8)
- Reader routes (Phase 5+) — permissioned snapshot queries (visibility checks per actor ownership)

## Monitoring & Observability

**Error Tracking:**
- Not detected — no Sentry/DataDog integration in MVP
- Bridge logging: pino structured JSON with security redact list (`deepgramKey`, `apiKey` patterns)
- Deepgram error frames: Malformed JSON silently dropped at debug log level (no crash)

**Logs:**
- Framework: pino 10.3.1 (JSON line output in prod)
- Security: Redact list in `packages/bridge/src/server.ts` (lines T-02-01 + T-03-07)
  - Patterns: `'deepgramKey'`, `'*.deepgramKey'`, `'apiKey'`, `'*.apiKey'`, `'EVF_INTERNAL_SECRET'`
- Dev output: `pino-pretty` (human-readable, Phase 2+ when integrated)

**Metrics:**
- Framework: prom-client 15.1.3
- Prometheus registry: `packages/bridge/src/metrics/registry.ts`
- Histogram: HTTP route duration + response status (onRequest + onResponse hooks)
- Endpoint: `/metrics` (Prometheus scrape format)
- Health checks: `/healthz` (liveness), `/readyz` (readiness per Specs.md)

## CI/CD & Deployment

**Hosting:**
- Docker Compose (homelab single-tenant, Phase 13+ may add Fly.io/Railway)
- Image base: node:24-alpine (bridge + foundry-mcp)
- Multi-stage builds: Minimize final image size (~80 MB bridge + ~60 MB mcp)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/ci.yml`)
- Gates: Lint (Biome), typecheck, test, coverage (80%), changeset status, no TODO without issue-link
- On PR: all gates must pass before merge

**Build Commands (Phase 1+):**
```bash
pnpm install --frozen-lockfile --ignore-scripts  # Docker builder stage
pnpm -r build                                     # tsup bridge + mcp
pnpm --filter @evf/bridge --prod deploy --legacy /app/bridge  # Runtime image
```

## Environment Configuration

**Required env vars:**
- `EVF_INTERNAL_SECRET` - 32-byte random (generate: `openssl rand -base64 32`)
- `EVF_PLUGIN_HOST_URL` - CORS origin (e.g., `https://g2app.yourdomain.com`)

**Optional env vars:**
- `DEEPGRAM_API_KEY` - STT integration (Phase 12+; missing = soft-fail)
- `EVF_BEARER` - MCP server bridge auth (Phase 11+)
- `EVF_BRIDGE_URL` - MCP server bridge endpoint (default `http://bridge:8910`)
- `EVF_ACTOR_ID` - MCP server actor override (blank = auto-detect)
- `MCP_HTTP_PORT` - MCP Streamable HTTP port (default 8911)
- `NODE_ENV` - "production" or "development"
- `LOG_LEVEL` - pino log level (info, debug, error)
- `PORT` - Bridge HTTP port (default 8910)

**Secrets location:**
- Development: `.env` (gitignored, copy from `.env.example`)
- Docker: `deploy/.env` (gitignored, mounted as env_file in compose)
- Never commit: `DEEPGRAM_API_KEY`, `EVF_INTERNAL_SECRET`, `.env`

## Webhooks & Callbacks

**Incoming Webhooks:**
- `POST /internal/delta` - Foundry module → bridge entity/spell-pack updates
  - Auth: `Authorization: Bearer <EVF_INTERNAL_SECRET>` header
  - Payload: Entity pack snapshot + spell pack deltas
  - Handler: `packages/bridge/src/routes/internal-delta.ts`
  - Triggers: Module-side onCreateItem/onDeleteItem/onUpdateItem hooks

**Outgoing Webhooks:**
- None detected (all communication is request-response or WebSocket subscriptions)

**WebSocket Subscriptions:**
- `WS /ws` (handshake at `packages/bridge/src/ws/handshake.ts`)
  - Client → Bridge: `subscribe`, `toolInvoke`, `updateKeytermCache` envelopes
  - Bridge → Client: `delta`, `entityPack`, `spellPack`, `toolResult` envelopes
  - Payload schema: Zod-validated (shared-protocol types)

**REST Endpoints (Bridge):**
- Reader routes (no auth required if public, bearer token if private per Phase 5):
  - `GET /v1/character/:actorId` - Actor snapshot + sheet data
  - `GET /v1/characters` - List owned actors
  - `GET /v1/combat/current` - Active combat state
  - `GET /v1/scene/viewport` - Map raster + tokens
  - `GET /v1/events` - Event log (SSE stream, Phase 5+)
  - `GET /v1/spells` - Spell catalog
  - `GET /v1/entities` - Entity pack snapshot

- Admin routes (GM only via foundry-module socketlib):
  - `POST /internal/delta` - Module-originated state push

- Voice routes (Phase 12+):
  - `WS /v1/audio/stream` - Audio PCM stream + transcript results

- Ops routes (no auth):
  - `GET /healthz` - Liveness probe (returns `ok`)
  - `GET /readyz` - Readiness probe (Foundry socket connected, cache warm)
  - `GET /metrics` - Prometheus metrics

---

*Integration audit: 2026-05-24*
