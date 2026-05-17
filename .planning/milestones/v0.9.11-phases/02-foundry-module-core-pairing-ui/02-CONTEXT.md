# Phase 2: Foundry Module Core + Pairing UI - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous batch — non-interactive flag)

<domain>
## Phase Boundary

Players can pair a G2 to a Foundry world, the `evenfoundryvtt` Foundry module reads character/combat/scene/event state over a versioned WebSocket, and a phone-side wizard (rendered inside the Even Realities App WebView) onboards the device. **Zero writes** — Phase 2 is a one-way read pipeline from Foundry → bridge → phone WebView → G2 display layer (which Phase 4a will consume). Writes (activity.use, setTargets) are deferred to Phase 7.

In scope:
- Foundry desktop side: module skeleton (`module.json` with `relationships.requires.midi-qol`), pair button in module Settings, QR-payload modal, 24h bearer registry, revoke flow.
- Bridge side: token validation (consult Foundry-side registry via socketlib), WS handshake with capability negotiation, REST snapshot endpoints + WS subscribe for deltas.
- Phone wizard: 3-step (profile/URL → token → character), Tier 3 persistence (Even Hub host kv), auto-connect on G2 wear.
- Locale: detect `game.i18n.lang` at module boot, propagate via WS handshake; catalogs ship from Foundry + module evenfoundryvtt (G2 ships no strings).
- Reader contracts: `getCharacterState`, `getCombatState`, `getSceneViewport`, `getEventLog`, `subscribeUpdates` (FOUN-01).
- `TokenLayer.setTargets()` v13 multi-target reader (FOUN-04, read-side only — write of targets is Phase 7).

Out of scope (deferred):
- All writes (`activity.use`, `setTargets` mutating, chat-card automation) → Phase 7.
- Locale runtime override Quick Action `[N] Language` (I18N-02) → Phase 5.
- Width-budget per-key + EN fallback (I18N-04) → Phase 4a.
- DE/ES/FR/PT-BR catalogs (I18N-05) → Phase 5.

</domain>

<decisions>
## Implementation Decisions

### A. Foundry-Desktop Pairing UI

- **D-2.01 [Pair-button location]:** Bottone "Pair a G2 device" nel **Foundry Settings panel sotto "Module Settings → EvenFoundryVTT"**. Non in scene controls (riservato a play) né token HUD (per-token, irrelevant). Settings è il luogo canonico per pairing config + revoke list.
- **D-2.02 [Pair dialog framework]:** **ApplicationV2** (Foundry v13+ unified app framework). Mostra: QR (SVG inline da `qrcode@1.5.4`) + bearer expiry countdown (24h) + tabella dispositivi pareggiati (revoke per row). Modal-style, non-blocking.
- **D-2.03 [Multi-pair semantics]:** N device concurrent per world. Ogni pair genera **bearer + alias label** (es. "Aiacos's G2 — bedroom") che il DM imposta o auto-derived da Even Hub device descriptor. Revoke list per-token, non per-world.

### B. Phone WebView Wizard (Even Realities App side)

- **D-2.04 [Stack]:** **Vanilla TypeScript + minimal CSS**. No React/Vue/Svelte (CLAUDE.md Specs §3.1 — sandboxed WebView, no DOM emit to G2, virtual DOM brings zero value + bundle bloat). Bundle via Vite 8 con `?worker` chunks per i pezzi heavy.
- **D-2.05 [Step 1 — profile + URL]:** Form con `<select>` profile dropdown (saved profiles from Tier 3 storage) + `<input type="url">` per bridge URL custom. Default placeholder: `https://bridge.local:8910`. Validazione: regex per `https?://[host]:[port]`.
- **D-2.06 [Step 2 — token entry]:** **Manual paste prima, QR scan second** (paste è universale, QR scan dipende da Even App camera API disponibilità). UI offre toggle "Scan QR" che fa fallback graceful a paste se camera API non disponibile.
- **D-2.07 [Step 3 — character selection]:** Wizard fa initial GET `/v1/characters?world=` con bearer appena ottenuto → mostra list (`<select>` o card grid se ≤8 char). Stato persistito a Tier 3 al confirm.
- **D-2.08 [Tier 3 persistence]:** Even Hub host kv store (`hub.setItem("evf.session.{profileId}", JSON.stringify(...))`). Survive kill/restart/reboot per Specs §11.5.5. Schema: `{ profileId, bridgeUrl, tokenObfuscated?, characterId, savedAt }` — token NON committed in plaintext qui (per CONN-05 silent refresh, viene ri-ottenuto via stored profile/handshake).
- **D-2.09 [Auto-connect on G2 wear]:** Subscribe a `bridge.eventBus` events `g2.wear` + `g2.unwear` (Even SDK). Su `g2.wear`: leggi Tier 3 session → reopen plugin → reauth handshake. Se token expired: silent refresh tentato; se fail → wizard re-launch.

### C. Bridge Token Model

- **D-2.10 [Token format]:** **Opaque bearer** (32-byte cryptographic random base64url-encoded). NOT JWT. Reason: rotation + revoke list semantics non richiedono verifiable claims; opaque = più semplice, ruotabile a volontà, revocable lookup O(1). Generato lato Foundry module via `foundry.utils.randomID()` derivato da `crypto.getRandomValues` (v13 supporta).
- **D-2.11 [Token TTL]:** **24h hard cutoff** + **silent refresh** quando residual TTL < 1h al next API call (CONN-05). Refresh emette nuovo token + invalida vecchio dopo 60s grace.
- **D-2.12 [Revoke registry storage tier]:** **Foundry module setting (Tier 3 — DM authoritative)** + **bridge in-memory cache 5min TTL (Tier 1)**. Bridge consulta Foundry via `socketlib.executeAsGM("evf.validateToken", token)` su cache miss. Reason: DM è single source of truth per revoke (può deautorizzare qualsiasi device dalla pair modal); bridge cache è ottimizzazione per evitare roundtrip ogni request.
- **D-2.13 [WS handshake protocol]:** Client → `{ proto: "evf-v1", token, locale, capabilities: ["read_char", "read_combat", "read_scene", "subscribe", "midiqol_capability_v1"] }`. Server → `{ proto_chosen: "evf-v1", server_caps: [...], server_locale, session_id, replay_seq }`. **Capability mismatch policy: warn-and-continue with intersection**. Version mismatch: server seleziona highest common, sends `proto_chosen` che differisce → client adatta. Invalid token: 401 close with reason. Reconnect: client riassume da `session_id` + `replay_seq` (replay buffer 60s LRU per ADR-0002).

### D. Reader API (FOUN-01)

- **D-2.14 [Foundry hooks subscribed]:**
  - `updateActor` → emit `character.delta` (HP, AC, conditions, current effects)
  - `updateCombat` + `combatTurn` → emit `combat.turn` + `combat.state`
  - `canvasReady` + `controlToken` → emit `scene.viewport`
  - `createChatMessage` → emit `event.log.delta`
  - `targetToken` (read-side per FOUN-04) → emit `combat.targets`
- **D-2.15 [Polling]:** **Zero polling**. Push-only via hooks + WS subscribe deltas. Snapshot endpoints (REST) servono solo per initial state hydration al pair / reconnect.
- **D-2.16 [Event log buffer]:** **Ring buffer 200 entries Foundry-side**, cursor-based delta sync via `subscribeUpdates({since: seq})`. Older messages: fetch dal Foundry messages collection on-demand.
- **D-2.17 [API surface]:** Mixed REST + WS:
  - **REST GET** `/v1/character/:actorId` / `/v1/combat/current` / `/v1/scene/viewport` / `/v1/events?since=N&limit=200` — snapshot, JSON.
  - **WS subscribe** post-handshake — server pushes delta envelopes `{type, seq, ts, payload}` (per ADR-0002).
  - REST endpoints versionati `v1`; WS proto envelope ha `proto: evf-v1` separato.

### E. Locale (I18N-01 + I18N-03)

- **D-2.18 [Detection]:** Module boot legge `game.i18n.lang` (Foundry built-in). Esempio: `en`, `it`, `de-DE`. Normalizzazione: solo primary tag (`it-IT` → `it`).
- **D-2.19 [Catalog source]:** **Foundry core + dnd5e module + module evenfoundryvtt own catalog**. Module ships `lang/{en,it}.json` minimum (MVP IT + EN canonical per I18N-05). G2 ships **zero strings** — tutti i label vengono dal phone/bridge side resolution.
- **D-2.20 [Propagation]:** Locale in WS handshake `locale` field → bridge propaga a downstream consumers (g2-app). Override Quick Action `[N] Language` deferred a Phase 5 (I18N-02).

### F. Wave Plan (suggested for plan-phase)

- **Wave 0:** module skeleton (`module.json`, ts entrypoint, `relationships.requires`, build via tsup → ESM), settings panel registration, pair-button stub.
- **Wave 1:** ApplicationV2 pair modal (QR + countdown + revoke table); bearer registry storage (settings-based Tier 3); socketlib.executeAsGM validateToken handler.
- **Wave 2:** phone wizard 3-step (Vite bundle, hosted from bridge or static CDN), Tier 3 storage via Even Hub kv, auto-connect on wear.
- **Wave 3:** bridge handshake + capability negotiation (Fastify + @fastify/websocket), capability matrix doc, replay buffer 60s LRU.
- **Wave 4:** reader endpoints REST + WS subscribe, Foundry hooks subscribers (5 hooks), delta envelope schemas in `@evf/shared-protocol`, integration smoke via mock Foundry world.

### Claude's Discretion

- Exact file structure within `packages/foundry-module/src/` left to planner (suggested: `module.ts` entry, `pair/` subdir for UI, `readers/` per-resource hook subscribers, `bridge-client.ts` for outbound calls).
- Phone wizard bundle target: Phase 2 phase decides whether to serve from `packages/g2-app` (existing) or new `packages/phone-wizard` (separate concern). Recommendation: subdir within `packages/g2-app/src/wizard/` (shared Vite config, separate entry-point) to avoid 7th package.
- Specific Zod schema shapes for envelope/payload — defer to planner reading ADR-0002.
- Test strategy per wave (unit vs integration) — planner decides; INV-1 snapshot tests for any rendered UI strings (Foundry side + wizard side).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1 packages skeleton)

- **`packages/shared-protocol/src/index.ts`** — currently a placeholder. Phase 2 fills with first real Zod schemas: envelope type, handshake message, snapshot payloads (character/combat/scene/event), delta envelope. ADR-0002 locks envelope structure.
- **`packages/shared-render/src/`** — `AsciiGrid` + `matchAsciiFixture` available for INV-1 snapshot tests if Phase 2 renders any G2-bound text (probably not yet; consumed by Phase 4a). Useful for Foundry-side UI snapshot fixtures if we want regression on the pair modal layout.
- **`packages/foundry-module/src/index.ts`** — current placeholder (single `PACKAGE_NAME` export). Phase 2 replaces with the real entry point. `module.json` NOT generated yet (Phase 1 D-1.01 explicitly defers to Phase 2).
- **`packages/bridge/src/index.ts`** — same placeholder pattern. Phase 3 fills with Fastify server; Phase 2 stub helpers (Fastify route shape, WS plugin registration) may land if useful for Phase 2 integration tests.
- **`packages/validation-harness/foundry-modules/midiqol-probe-module/`** — proven shape for a tiny Foundry module with `module.json` + `relationships.requires` + script. Phase 2 module.json mirrors structure but with real metadata (compatibility, scripts).

### Established Patterns (Phase 1 outcomes)

- **TypeScript strict** (D-1.04): `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Every reader hook must explicitly check for `undefined` array indexing.
- **Biome 2.4.15** (D-1.05): `noConsole` warns (test allowlist via biome-ignore directive). For Foundry runtime logs, use `console.warn` / `console.error` only with biome-ignore on the line.
- **Vitest 4 + workspace mode** (D-1.06): coverage 80% gate applies. Phase 2 must bring `foundry-module/src/**` and any new `shared-protocol/src/**` to ≥80% line coverage. Phase 2's Wave 4 (readers) is the testable surface — `happy-dom` env for hook subscribers, mock Foundry globals.
- **ADR-0002 (Protocol Versioning)**: WS envelope `{proto, seq, ts, type, ...}`. Phase 2 schemas must conform. Replay buffer 60s LRU on bridge side.
- **ADR-0003 (Tool Registry Pattern)**: Phase 2 is read-only so no tool registry consumers yet — but the bridge's `/v1/tools` discovery endpoint can land here as a stub returning empty array (Phase 7 fills with write tools).
- **ADR-0008 (Code Quality)**: CI gates D-1.10 #1–7 apply. Phase 2 commits must add `.changeset/*.md` declaring `minor` bump on touched packages.

### Integration Points

- **socketlib** (NOT on npm; declared as `relationships.requires.socketlib` in `module.json`). Bridge talks to Foundry-side via `socketlib.executeAsGM(handlerId, ...args)`. Phase 2 registers handlers: `evf.validateToken`, `evf.getCharacterSnapshot`, `evf.getCombatSnapshot`, `evf.getSceneViewport`, `evf.getEventLog`.
- **MidiQOL** (relationships.requires — Phase 0 MIDIQ-01 evidence pending, but module declaration locked). Phase 2 module.json includes `"midi-qol": { type: "module", manifest: "<url>", compatibility: "..." }`. No code dependency yet (Phase 7 wires the actual write path).
- **dnd5e@5.3.3** (relationships.requires). Used for `actor.system.*` shape on the reader side. Migration alert: dnd5e 5.3.0+ uses object-iteration for advancement data (Phase 0 STACK.md note).
- **Even Hub SDK** (`hub.evenrealities.com/docs/...`): phone wizard side uses `hub.setItem` / `hub.getItem` for Tier 3 persistence; `hub.eventBus` for wear events.
- **`shared-protocol` (Zod)**: single source of truth for envelopes + payloads. Phase 2 fills first real schemas; consumer packages import from `@evf/shared-protocol`.

</code_context>

<specifics>
## Specific Ideas

- **No camera dependency for QR scan in wizard** — Even App may not expose camera API on all OS variants. Manual paste is the canonical path; QR scan is a UX nicety that gracefully degrades.
- **Pair modal countdown UI** — show remaining TTL in human format (`23h 47m`) updating every minute. When < 1h, suggest "Refresh now" button (DM-side action).
- **Revoke registry surfaces in module settings as a sub-panel** — DM can see list of paired devices + revoke per row, separate from the Pair button. Useful when troubleshooting.
- **Phone wizard must not break on stale state** — if bridge URL changed since last session OR token revoked, wizard detects via failed handshake and surfaces a clear error + "Repair" button → restart wizard from step 1.

</specifics>

<deferred>
## Deferred Ideas

- **Bridge dashboard / observability UI** — pino logs + Prometheus metrics are useful but no UI for them in Phase 2; deferred to Phase 10 polish.
- **Pair history audit log** — when each device was paired, when revoked. Captured but not surfaced UI-side; lands at Phase 10 if user asks.
- **Multi-world support per Foundry instance** — current scope is single-world-per-pair (token includes world). Multi-world juggling deferred to Phase 13 stretch.
- **Bridge clustering / HA** — single-bridge MVP per Specs.md §11.5.3 (homelab Docker Compose). HA deferred to Phase 13 cloud rewrite.
- **OAuth / SSO alternative to opaque bearer** — Specs.md §11.5.4 locks bearer for MVP; OAuth could be Phase 13 enterprise feature.

</deferred>
