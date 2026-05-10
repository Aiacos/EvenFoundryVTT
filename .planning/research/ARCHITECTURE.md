# Architecture Research — EvenFoundryVTT (EVF)

**Domain:** Multi-boundary AR-glasses companion plugin for FoundryVTT D&D 5e (4–5 component spans: G2 firmware → Even App WebView → Bridge service → Foundry+dnd5e → optional MCP client)
**Researched:** 2026-05-10
**Confidence:** HIGH for component boundaries and data flow (spec is mature, architecture confirmed by reverse-engineering of Even Realities ecosystem + reference repos `foundryvtt-rest-api`, `foundry-api-bridge`, `evenfoundryvtt-mcp` precedents); MEDIUM for plugin contract granularity (spec § 5.6 may be over-engineered for MVP); MEDIUM-HIGH for build order critique.

---

## 1. Standard Architecture (the shape that already-shipping systems converge on)

### 1.1 System overview — what the spec settled vs. what 2026 patterns confirm

The spec's § 2.1 / § 3.7 / § 5.6 lock in a **5-tier, 3-hop deployment** that maps 1:1 to the dominant 2026 pattern for "headless device + cloud/host VTT" companions. Validated against:

- **`foundryvtt-rest-api`** ([ThreeHats](https://github.com/ThreeHats/foundryvtt-rest-api)) — same 3-tier shape: Foundry module ↔ WebSocket relay ↔ REST consumer. Auto-reconnect with **exponential backoff** (1000 ms base, max 20 attempts), **30 s ping interval** keep-alive, `x-api-key` header auth.
- **`foundry-api-bridge`** ([foundry-mcp.com](https://foundryvtt.com/packages/foundry-api-bridge)) — bidirectional REST + WS, **selective compendium sync**, connection-status notifications in Foundry UI, v11–v13 compatibility band. Identical reconnect pattern.
- **Even Realities G2 plugin model** ([Even Hub docs](https://hub.evenrealities.com/docs/getting-started/architecture), [brianmatzelle starter](https://github.com/brianmatzelle/even-realities-g2-glasses)) — JS bridge `EvenAppBridge` injected into WebView; code lives on a server, phone app fetches HTML+JS, BLE relays display ops to glasses. Conversate / Translate / Teleprompt all follow this shape.

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 0 — G2 Firmware (closed, EvenOS)                       │
│  Display 576×288 4-bit · 4-mic · IMU · touchpads             │
│  Speaks: BLE LC3 (audio) + display-ops protocol              │
└────────────────────────┬─────────────────────────────────────┘
              BLE 4.2+ (LC3 audio, display ops, IMU events)
┌────────────────────────▼─────────────────────────────────────┐
│  TIER 1 — Even Realities App (phone, WebView host)           │
│  • Hub SDK runtime → bridge.audioControl() / containers      │
│  • Per-app phone settings UI (§ 3.8)                         │
│  • Tier 3 storage (bridge_url, auth_token, character_id…)    │
│  • Loads OUR plugin code from a separate HTTP server         │
└────────────────────────┬─────────────────────────────────────┘
              HTTPS GET (initial WebView load — once per session)
┌────────────────────────▼─────────────────────────────────────┐
│  TIER 2 — Plugin host server (CDN-friendly static)           │
│  evenfoundryvtt-g2/index.html + JS bundle (TypeScript)       │
│  Stateless. Versioned manifest (app.json). Can be GitHub     │
│  Pages, Cloudflare Pages, S3+CDN, or self-hosted nginx.      │
└──────────────────────────────────────────────────────────────┘
              ↑ this is the CODE source — NOT the data path
              
              ↓ runtime data path (after WebView loads plugin)
┌──────────────────────────────────────────────────────────────┐
│  TIER 3 — Bridge service (Node.js, homelab Docker Compose)   │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Fastify HTTP/2 + ws WebSocket fanout                │     │
│  │ Auth: bearer per-player (24 h TTL, QR-paired)       │     │
│  │ Tool Registry (cast_spell, weapon_attack, …)        │     │
│  │ State cache (in-memory LRU MVP / Redis stretch)     │     │
│  │ Replay buffer (60 s of deltas, sequenced)           │     │
│  │ /healthz · /readyz · /metrics (Prometheus)          │     │
│  └─────────────────────────────────────────────────────┘     │
└────────────────────────┬─────────────────────────────────────┘
              Foundry-side WebSocket (single persistent conn)
┌────────────────────────▼─────────────────────────────────────┐
│  TIER 4 — FoundryVTT host (homelab) + dnd5e ≥ 5.x            │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ evenfoundryvtt Foundry module                       │     │
│  │  - Readers: actor, combat, scene, log               │     │
│  │  - Writers: activity.use(), setTargets, templates   │     │
│  │  - Hooks: dnd5e.preUseActivity / postUseActivity /  │     │
│  │    rollAttackV2 / rollDamageV2 / preCreateTemplate  │     │
│  │  - socketlib.executeAsGM() for NPC-side writes      │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘

V2 OPTIONAL (decoupled):
┌──────────────────────────────────────────────────────────────┐
│  TIER 5 — MCP Client (Claude Desktop / Claude Code / future) │
│      ↓  MCP protocol (stdio | Streamable HTTP)               │
│  TIER 5b — foundry-mcp standalone server (npm pkg)           │
│      ↓  HTTPS to Bridge (re-uses MVP bearer)                 │
│  → re-enters Tier 3 via the same Tool Registry endpoints     │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Component responsibilities

| Component | Owns | Talks to | Implementation 2026 |
|-----------|------|----------|---------------------|
| **G2 Firmware** | Display rendering, BLE relay, mic capture, IMU | Phone via BLE only | Closed source (EvenOS) — non-negotiable surface |
| **Even App / WebView** | Plugin code execution, BLE proxy, phone settings storage (Tier 3), wear detection, camera (QR scan) | G2 (BLE), Plugin host (HTTPS), Bridge (HTTPS/WSS), App settings UI | Native iOS app + injected JS bridge `EvenAppBridge` ([Even Hub](https://hub.evenrealities.com/docs/getting-started/overview)) |
| **Plugin host** | Static asset delivery (HTML+JS bundle) | WebView fetches once | Stateless. Caddy / nginx / Cloudflare Pages. Versioning via `app.json`. |
| **G2 App (our plugin)** | Layered UI, R1 events, panel registry, raster pipeline (worker), state store | Bridge (WSS+REST) | TypeScript + Vite + workers. ~250–500 KB gzipped target. |
| **Bridge service** | Auth, rate limit, CORS proxy, Tool Registry, state cache, replay buffer, metrics | G2 App (WSS), Foundry module (WSS), MCP server (HTTPS) | Node.js 22 + Fastify + ws + pino + Prometheus exporter. Docker Compose homelab single-tenant. |
| **Foundry module `evenfoundryvtt`** | Read/write API on `actor.*`, hooks → delta events, GM-side forward via socketlib, QR-pairing UI for token issuance | Foundry game state, Bridge (WSS) | ESM module per Foundry convention. Versioned `foundry-adapter` interface for dnd5e major bumps. |
| **`foundry-mcp` (V2)** | MCP tool surface mirroring Tool Registry; resources (`actor://`, `scene://`, `combat://`, `log://`); session auth | MCP client (stdio/HTTP), Bridge (HTTPS) | TypeScript SDK [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — `McpServer` + `StdioServerTransport` + `StreamableHTTPServerTransport`. |

---

## 2. Per-question findings

### 2.1 Plugin / WebView companion architecture (Q1)

**Pattern that has converged in the Even ecosystem (HIGH confidence on shape, MEDIUM on details since only one official starter exists publicly):**

- **Single-page app** with a **state machine driving display pages** — verbatim Even Hub: *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."* Conversate / Translate / Teleprompt all keep the **business logic in one HTML/JS bundle** loaded into the WebView; the glasses are dumb framebuffers.
- **State location** in shipping plugins:
  - **Per-plugin phone-side persistent storage** (Tier 3 in the spec) — managed by the Even Realities App itself, surviving WebView kill. This is exactly the canonical place for `bridge_url`, `auth_token`, `character_id`. Verbatim user guide: *"You can configure each widget individually through the Even App."*
  - **In-memory app state** (Tier 1 bridge cache for game state): WebView state is **volatile** and **short-lived** (the app is suspended when the user takes off the G2 — `bridge.onWear(false)` → standby). Persistent game state never lives on the phone; it always lives upstream (Foundry as the canonical source).
  - **localStorage / IndexedDB on the WebView** (Tier 4 in the spec) for tiny gesture-only overrides (`view.map.mode`, `i18n.override`). Quota in practice ≤ 5 KB per § 11.5.5.
- **State machine pattern**: the spec's § 5.4 layered model (map base + status HUD + overlay slot + boot/quick-action standalone pages) **matches the dominant pattern**. Single "main page" + page transitions for modals (boot splash, quick-action, voice-V2). This is the same shape Conversate uses for its capture/review/dismiss states (inferred from the support docs describing distinct phases) and matches the [`brianmatzelle/even-realities-g2-glasses`](https://github.com/brianmatzelle/even-realities-g2-glasses) starter (TypeScript + Vite, hot reload via QR sideload).

**Recommendation:** spec is correct. Don't deviate. Use TypeScript + Vite for parity with the starter ecosystem. Resist the urge to introduce a heavyweight UI framework (React/Vue/Svelte) — the G2 surface is **not the DOM**: it's a custom container API. Frameworks help with DOM diffing, which doesn't apply here. Use a tiny observable store (Nano stores, Zustand-style) and pure render functions.

### 2.2 Bridge service patterns (Q2)

**Reference repos cross-validate the spec almost perfectly:**

- [`ThreeHats/foundryvtt-rest-api`](https://github.com/ThreeHats/foundryvtt-rest-api) split: **Foundry module** (WS client) ↔ **relay server** (WS server + REST). Auth via `x-api-key` header. **Reconnect: exponential backoff, base 1000 ms, max 20 attempts, ping every 30 s.**
- [`alexivenkov/foundry-api-bridge-module`](https://github.com/alexivenkov/foundry-api-bridge-module): same shape, HTTP REST surface for external tools.
- [`cclloyd/planeshift`](https://github.com/cclloyd/planeshift): another REST API for Foundry, same architectural shape.
- [`foundry-api-bridge` (foundry-mcp.com)](https://foundryvtt.com/packages/foundry-api-bridge): purpose-built for MCP — **exact precedent** for the EVF V2 path. Bidirectional sync, selective compendium pack sync, auto-reconnect with exponential backoff.

**Cross-cutting concerns the spec already covers (validated against the above):**

| Concern | Spec section | Reference confirms | Notes |
|---------|--------------|---------------------|-------|
| Auth | § 11.5.4 (bearer 24 h, QR-paired) | All three ref repos use API-key in header | Spec is **stronger** than refs — QR pairing reduces clipboard exposure |
| Rate limit | § 4.2 (10 req/s, audio 30 s) | Refs don't document explicitly | Spec leads — recommend documenting per-tool limits too |
| Health endpoints | § 5.6.6 (`/healthz`, `/readyz`, `/metrics`) | Standard k8s pattern, refs don't document | Spec is exemplary |
| Reconnect | § 11.5.8.1 (2 s → 30 s exp backoff, 60 s replay buffer) | Both refs use exp backoff w/ 1000 ms base | Spec's 2 s base is gentler — **OK as-is**; consider matching refs at 1000 ms for snappier reconnect |
| Heartbeat / ping | § 11.5.8.1 (5 s heartbeat, then offline) | refs use 30 s ping | **Spec's 5 s detection is aggressive** for a homelab LAN; consider 10–15 s to absorb wifi blips |

**Cross-cutting concerns NOT explicit in spec, worth flagging:**

| Gap | Why it matters | Suggested addition |
|-----|----------------|---------------------|
| **Idempotency keys** for write-path POSTs | If R1 tap → POST `/v1/action/use-activity` and the WS replies twice (network blip + replay buffer overlap), Foundry could fire `activity.use()` twice → double damage | Client generates `idempotency_key` (UUID) per action; bridge dedupes on a 60 s LRU |
| **Server-Sent Events as WS fallback** | Behind some restrictive corporate proxies WS upgrade fails | spec already lists `bridge-http` provider as "fallback polling"; **keep it minimal** — most homelabs don't need it |
| **Prometheus cardinality blast** | `frame.render` per-player + per-panel labels can balloon the metric series | Cap label cardinality; aggregate per-panel histograms server-side |
| **Bearer rotation race** | Token rotates at 24 h; in-flight WS may use stale token mid-rotation | Server accepts old token for 60 s grace; client refreshes proactively at 23 h |
| **Connection-pool DoS** | A buggy client can hold many WS connections to bridge | Cap WS per `(player_id, device_fingerprint)` to 2 (one G2 + one debug client) |

### 2.3 MCP server architecture (V2, Q3)

**Verified against the official TypeScript SDK** ([@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk), [docs](https://ts.sdk.modelcontextprotocol.io/), [server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)):

```typescript
// foundry-mcp/src/server.ts — canonical 2026 shape
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const server = new McpServer({ name: "foundry-mcp", version: "0.1.0" });

// Tool — Zod schema serialized to JSON Schema on the wire
server.registerTool("cast_spell", {
  description: "Cast a prepared spell at one or more targets…",
  inputSchema: {
    spell_id: z.string(),
    slot_level: z.number().int().min(1).max(9),
    targets: z.union([z.array(z.string()), z.object({ x: z.number(), y: z.number() })]),
    concentration_drop: z.boolean().optional(),
  },
}, async (input) => {
  const result = await bridgeClient.callTool("cast_spell", input);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

// Resources (read-only)
server.registerResource("actor", "actor://current", { mimeType: "application/json" },
  async () => ({ contents: [{ uri: "actor://current", text: JSON.stringify(await bridgeClient.getActor()) }] }));

// Transport — choose based on env
const mode = process.env.FOUNDRY_MCP_TRANSPORT ?? "stdio";
if (mode === "stdio") await server.connect(new StdioServerTransport());
else await server.connect(new StreamableHTTPServerTransport({ /* port, sessionMgmt */ }));
```

**Architectural points that match the spec § 5.7:**

- **Stdio transport** for local Claude Desktop integration (the dominant MVP path — spec § 5.7.5 has the exact `claude_desktop_config.json` snippet).
- **Streamable HTTP transport** for remote/Docker — **HTTP+SSE is deprecated** since 2025-03-26 (spec correctly notes this in § 4.7).
- **Capability handshake**: MCP SDK handles this internally — server declares `tools` + `resources` capabilities at `initialize`; client negotiates. Spec § 5.6.3's homemade handshake is for the **G2 ↔ Bridge** path, NOT MCP — they're orthogonal and that's correct.
- **Tool surface mirrors Bridge Tool Registry**: spec § 5.7.1 keeps the MCP server **stateless and thin** — every MCP tool is a 1-liner that POSTs to the same bridge endpoint MVP uses. **This is the right call**: zero re-implementation, zero auth-escalation surface (MCP can do nothing MVP can't already do).
- **Schema serialization**: spec § 4.7 verbatim correctly notes "MCP TS SDK uses Zod / Standard Schema serialized to JSON Schema." This matches 2026 SDK behavior.

**One concern to flag for V2:** the spec says the server holds a "session per MCP connection" but doesn't specify session lifecycle. Recommend: **MCP session = bridge bearer + ephemeral context cache (5-min TTL)**. When MCP client disconnects, drop cache. This avoids the "long-lived MCP session leaks bearer past 24 h" trap.

### 2.4 Real-time state replication (Foundry → Bridge → G2 plugin) (Q4)

**WS push, not poll** — confirmed industry standard for low-latency state sync ([WebSocket.org best practices](https://websocket.org/guides/best-practices/), [WebSocket.org reconnection guide](https://websocket.org/guides/reconnection/)). Spec § 4.2 + § 11.5.8.1 already specifies this.

**Pattern triangulated from production WS systems and the spec:**

```
Foundry Hook (updateActor, dnd5e.postUseActivity, etc.)
   │
   ▼
evenfoundryvtt module: build delta { seq, ts, type, path, value }
   │  WS frame, pino-logged
   ▼
Bridge: append to per-player replay buffer (ring, last 60 s of deltas)
        broadcast to subscribed WS clients (fanout)
        update in-memory state cache for resync
   │
   ▼
G2 plugin: apply delta to local state-store, ack {seq}
           on disconnect: keep last_seen_seq
           on reconnect: hello { last_seen_seq } → bridge replays gap
                         if seq gap > buffer (60 s), bridge sends full snapshot
```

**Spec choices vs. industry best-practice:**

| Decision | Spec | Industry reference | Verdict |
|----------|------|---------------------|---------|
| Push vs. poll | Push (WS) with `bridge-http` polling fallback | WS first ([WebSocket.org](https://websocket.org/guides/best-practices/)) | ✓ Correct |
| Delta encoding | "json-delta" negotiated at handshake (§ 5.6.3) | Standard pattern: only changed fields ([WebSocket.org reconnection](https://websocket.org/guides/reconnection/)) | ✓ Correct |
| Replay buffer | 60 s, in-memory ring | Pattern: TTL-bounded buffer keyed by user ([Saxo plain WS streaming](https://www.developer.saxo/openapi/learn/plain-websocket-streaming)) | ✓ Correct; 60 s is conservative-safe |
| Sequence numbers | Implicit ("ultimo confermato") | Explicit `seq` per delta — required for gap detection | **Spec should make this explicit** — recommend monotonic 64-bit per-session `seq`, ack via ws |
| Schema migration | "settings schema migrate auto" (§ 5.6.5) for config; not formalized for delta payloads | Versioned message envelope `{ proto, version, type, payload }` | **Gap**: delta payloads should declare `proto: 1.x`, otherwise minor adds break old G2 clients silently |
| Snapshot fallback | Full snapshot if gap > 60 s | Resync via separate HTTP fetch ([WebSocket.org](https://websocket.org/guides/reconnection/)) | ✓ Correct, but **make the snapshot path reuse `GET /v1/actor` + `/v1/scene` + `/v1/combat`** rather than inventing a new "full state dump" message — fewer endpoints, fewer bugs |

**Concrete recommendation:** wire the WS envelope as:

```typescript
type DeltaFrame = {
  proto: "1.0";
  seq: number;          // monotonic per-session
  ts: number;           // ms epoch
  type: "delta" | "event" | "heartbeat" | "snapshot-needed";
  path?: string;        // "actor.system.attributes.hp.value"
  value?: unknown;
  prev_seq?: number;    // gap-detection helper
};
```

### 2.5 Plugin contracts (panel/tool/provider/foundry-adapter) — overengineered for MVP? (Q5)

**Honest assessment: the § 5.6 contract surface is partially over-engineered for MVP, but most of it is cheap to keep.**

| Contract | Cost to introduce | Cost to retrofit later | Verdict |
|----------|-------------------|------------------------|---------|
| `Panel` interface (manifest, render, handleEvent, onOpen/onClose) | Low (~50 LOC base class) | High (every panel touches state plumbing) | **KEEP** — the auto-discovery registry is the cheapest enforceable boundary; pays for itself by Phase 5 |
| `Tool` interface (name, description, inputSchema, preconditions, execute) | Low (just typed dispatch table) | High (V2 MCP needs JSON Schema reflection) | **KEEP** — also pays for itself: Tool Registry is the single source of truth for both MVP gestures and V2 MCP, exactly the pattern recommended by [foundry-api-bridge](https://foundryvtt.com/packages/foundry-api-bridge) |
| `STTProvider` / `LLMProvider` | Medium (interface + 2 impls min for testing) | Medium (only V2 cares) | **DEFER until Phase 11**. Spec § 5.6.2 introduces these in MVP shared-protocol but no MVP code calls them. Add the types in V2 phase. |
| `FoundryAdapter` (versioned per dnd5e major) | Medium (~150 LOC of adapter shim) | **Very high** (dnd5e v6 may rewrite Activity) | **KEEP from Phase 2**. This is the highest-ROI abstraction in the entire spec — it's literally the only thing standing between you and a 2-week rewrite when dnd5e ships v6. |
| Capability-negotiation handshake (§ 5.6.3) | Low (a JSON exchange) | High (G2-bridge protocol drift) | **KEEP**. Trivial to implement, invaluable for multi-version coexistence. |
| Plugin manifest (`PanelManifest` with `dataSubscriptions`, `capabilities`) | Medium (~100 LOC + per-panel manifests) | Medium (refactor easier in TypeScript) | **SIMPLIFY for MVP**: drop `capabilities` and `dataSubscriptions` initially; just `{ id, version, title, size }`. Add the rest only when a 2nd panel needs them. |

**Anti-pattern to avoid:** building a generic plugin loader that can dynamically load **third-party** panels at runtime (à la Foundry modules). The G2 plugin is **served as a single immutable bundle from the host** (§ 3.7) — there is no "user installs another G2 panel." Auto-discovery in MVP means **build-time discovery via `import.meta.glob`** (Vite native), not a runtime plugin sandbox. If you over-build this, you'll spend weeks on capability negotiation that nobody uses.

**Browser-extension parallel:** Chrome MV3 ([dev.to guide](https://dev.to/javediqbal8381/understanding-chrome-extensions-a-developers-guide-to-manifest-v3-233l)) keeps manifest version + service worker as the only mandatory boundary; everything else is conventional. Mirror that minimalism.

### 2.6 Three-tier settings architecture (Q6)

The spec's § 7.14.6 / § 11.5.5 **three-tier (technically four-tier with bridge-side cache) split is unusual but correct for this domain.**

I couldn't find a published reference architecture documenting exactly this 3-tier pattern (Foundry world / Even App phone / G2 device-local) — searches returned generic 3-tier-app-architecture material that's a different concept. The closest analog is **Chrome extension storage tiers** (`storage.sync` / `storage.local` / `storage.session`), which solves a similar problem (per-device vs. per-user vs. per-session). The spec's reasoning maps onto that pattern with strong rationale.

**Pitfalls in similar 3-tier configs (from generic mobile-architecture literature + analogous browser-extension patterns):**

| Pitfall | Manifestation in EVF | Mitigation |
|---------|----------------------|------------|
| **Same logical setting on >1 tier** | Player's locale: `game.i18n.lang` (Foundry world) vs. `i18n.override` (G2 device) — what wins? | Spec § 11.5.5 already nails this: explicit precedence (`#3 G2 wins for gesture overrides`, `#2 phone wins for connection-bootstrap`). **Don't deviate.** |
| **Migration drift between tiers** | Schema version bumps on Tier 1 (Foundry settings) but Tier 4 (G2 localStorage) holds old shape | Spec § 5.6.5 already requires versioned `config/schema.json` + numbered migrations — **extend the same pattern to Tier 4**, not just Tier 1 |
| **Silent "fallback to default"** | User sets `view.map.mode=raster` on G2; G2 storage wiped on reinstall; user re-opens and gets glyph | Toast on first boot after any storage reset: "Preferences reset. Defaults restored." |
| **Cross-tier sync illusion** | Player expects "I changed it on phone, it should also work on G2" — but G2 has its own override that supersedes | Setting UI should show **effective value** + tier badge ("from device", "from phone", "from world") |
| **First-run paradox** | Tier 3 (phone) needs bridge URL before Tier 1 (Foundry) is reachable | Spec § 7.14.7 already solves with the on-phone wizard. **This is the canonical fix** — copy this pattern for any future bootstrap settings. |
| **Test scope blindness** | Unit tests mock single tier; bug only appears when Tier 1 + 4 disagree | Add **contract test** that walks the full settings-resolution function with all 8 (2³) tier-presence combinations |

**Verdict:** spec § 7.14.6 is **best-in-class** for this problem domain. The decision-tree flowchart resolves the "where does this setting go" question definitively. The cross-cutting concern the spec doesn't formalize is **observable resolution** — exposing which tier a setting was resolved from in dev-tools / a debug overlay. Recommend adding `effectiveSettings()` API that returns `{ key, value, tier, raw }` for each setting.

### 2.7 Security boundary pattern — player-side code triggering GM-side actions (Q7)

**Pattern is well-established in the Foundry community** ([socketlib README](https://github.com/farling42/foundryvtt-socketlib), [Foundry VTT Wiki — Sockets](https://foundryvtt.wiki/en/development/api/sockets)):

- Player client calls `await socket.executeAsGM("handlerName", ...args)`.
- If a GM is connected, **exactly one** GM client executes the handler. Result is awaited and returned to the caller.
- If no GM is connected, the call rejects (no offline NPC mutations).
- Spec § 4.8 + § 11.5.8 + § 9 already document this correctly.

**How other Foundry modules (PF2e Workbench, MidiQOL, Monk's Active Tile Triggers, etc.) handle this:**

1. **Permission gate at the handler** — even though the dispatcher is `executeAsGM`, every handler **re-validates** that the calling user owns the source actor. Defense in depth: a malicious player could craft a fake socket message bypassing socketlib if they popped a JS context, but the GM-side handler still rejects.
2. **No CSRF defense needed** — Foundry's socket layer is authenticated by the same session cookie that authenticates the player. If a player's session is hijacked, the attacker has full Foundry access anyway; CSRF is moot.
3. **No replay protection in vanilla socketlib** — but for **bridge-mediated** writes (EVF's case, where the path is `G2 → bridge → module → socketlib`), **idempotency keys belong on the bridge layer**, not socketlib. The bridge dedupes on `idempotency_key` before forwarding.
4. **Audit logging** — § 9 of the spec correctly says *"Operazioni GM-only vanno via socketlib.executeAsGM con audit log."* Standard pattern: handler calls `ChatMessage.create({whisper: gmIds, content: log})` for every GM-side action so the DM has a paper trail.

**Concrete recommendations the spec doesn't explicitly enumerate:**

| Recommendation | Rationale |
|---------------|-----------|
| Every `executeAsGM` handler **re-checks `actor.testUserPermission(callingUser, "OWNER")`** before mutating | Defense in depth against socket-layer bypass |
| Bridge stamps every forwarded write with `{idempotency_key, source_user_id, timestamp}` | Replay protection at the bridge tier; socketlib doesn't do this |
| Bridge **never directly impersonates GM**; always routes through the player's user ID into Foundry, and the module decides whether to socketlib-forward | Spec § 2.3 already says this — make it a code-review checklist item |
| `applyDamage` to NPCs goes through `socketlib.executeAsGM` only after **server-side rate limiting per (player, target_id)** | Prevents player exploiting "one tap = many damage" via held R1 |
| Dice rolls are **always real Foundry rolls** (`Roll(...).evaluate()`), never client-side computed and asserted | Trust model: dice integrity is the GM's job, not ours |

The spec's § 2.3 + § 9 + § 11.5.4 already cover this correctly. The above bulletpoints are tightening, not corrections.

---

## 3. Suggested project structure (monorepo)

This matches spec § 5.6.10. No critique — it's the canonical pnpm workspace shape.

```
evenfoundryvtt/
├─ packages/
│  ├─ foundry-module/            # the Foundry module (publishable)
│  │   ├─ module.json
│  │   ├─ src/
│  │   │   ├─ init.ts
│  │   │   ├─ api.ts              # game.modules.get(...).api surface
│  │   │   ├─ readers/
│  │   │   ├─ writers/
│  │   │   ├─ bridge-client.ts    # WS to bridge
│  │   │   ├─ pairing/            # QR-pairing UI for Settings
│  │   │   └─ adapters/
│  │   │       └─ dnd5e-5x/       # versioned per dnd5e major
│  │   └─ lang/
│  ├─ bridge/                     # Node.js Fastify + ws service
│  │   ├─ src/
│  │   │   ├─ index.ts
│  │   │   ├─ auth/               # bearer rotation, QR token issuance
│  │   │   ├─ tools/              # Tool Registry impls
│  │   │   ├─ ws/                 # fanout, replay buffer, sequencing
│  │   │   ├─ rest/               # REST endpoints
│  │   │   ├─ foundry-conn.ts     # WS client → Foundry module
│  │   │   └─ telemetry/          # pino logs + Prometheus exporter
│  │   ├─ Dockerfile
│  │   └─ docker-compose.yml
│  ├─ g2-app/                     # Even Hub plugin (the WebView code)
│  │   ├─ app.json                # whitelist, manifest, capability declaration
│  │   ├─ index.html
│  │   ├─ src/
│  │   │   ├─ core/               # app, state-store, event-router, frame-painter
│  │   │   ├─ layers/             # map-base, status-hud, overlay-slot
│  │   │   ├─ panels/             # auto-discovered via import.meta.glob
│  │   │   ├─ providers/          # bridge-ws, bridge-http, ring-r1
│  │   │   ├─ render/             # HP-bar, glyph-grid, image-tile, dither, RLE
│  │   │   ├─ pages/              # boot, main, quick-action, voice-modal (V2)
│  │   │   └─ workers/            # raster pipeline worker (image-q + upng + xxhash)
│  │   └─ assets/
│  ├─ foundry-mcp/                # V2 MCP server
│  │   ├─ src/
│  │   │   ├─ index.ts            # McpServer + transport selection
│  │   │   ├─ tools/              # 1:1 mirror of bridge Tool Registry
│  │   │   └─ resources/          # actor/scene/combat/log
│  │   └─ Dockerfile
│  ├─ shared-protocol/            # ZERO-runtime: TypeScript types + JSON Schema
│  │   ├─ src/
│  │   │   ├─ delta-frame.ts      # WS envelope types
│  │   │   ├─ tool.ts             # Tool Registry types
│  │   │   ├─ panel.ts            # PanelManifest, Panel interface
│  │   │   └─ settings-schema.ts  # versioned config schema
│  │   └─ schemas/                # JSON Schema files (single source of truth)
│  └─ shared-render/              # ASCII primitives shared by g2-app + tests
├─ docs/
│  ├─ architecture/               # ADRs (one per design decision)
│  ├─ api/                        # autogenerated reference
│  └─ runbooks/                   # ops playbooks
├─ scripts/
└─ .github/workflows/             # CI: lint, type-check, test, build, release
```

### Structure rationale

- **`shared-protocol/`** is zero-runtime — only types + JSON Schema. Keeps G2 plugin bundle small.
- **`shared-render/`** keeps ASCII renderers (box, glyph) testable without G2 SDK.
- **`adapters/dnd5e-5x/`** under `foundry-module/` is the versioned compatibility layer. v6 lives next to it, not as a fork.
- **`workers/`** in `g2-app/` isolates the raster pipeline (image-q + upng + xxhash) so a worker crash doesn't kill the UI thread (spec § 11.5.8.4).

---

## 4. Architectural patterns

### Pattern 1 — Layered HUD (z-stack with single capture owner)

**What:** One "main page" with z-ordered layers (map base, status HUD, overlay slot). Exactly **one** layer holds `isEventCapture: 1` at any time; capture migrates as the user opens/closes overlays.

**When to use:** Hardware with strict container budgets (G2: max 4 image + 8 text + exactly 1 capture). Mirrors the [Even Hub plugin model](https://hub.evenrealities.com/docs/getting-started/architecture).

**Trade-offs:** Slightly more state plumbing (capture transition logic) but trivially auditable (§ 7.14.4 has a 15-checkpoint reachability matrix). The alternative — multiple pages with full-state navigation — burns container budget on transition flicker and breaks status-HUD persistence.

### Pattern 2 — Tool Registry as single source of truth

**What:** A typed dispatch table on the bridge — `cast_spell`, `weapon_attack`, `place_template`… — invokable from both manual gestures (MVP) and MCP voice (V2). Same code, two callers.

**When to use:** Whenever you have multiple input modalities driving the same action surface. Standard pattern in [foundry-api-bridge](https://foundryvtt.com/packages/foundry-api-bridge) for the same reason.

**Trade-offs:** Forces you to design every action with a complete `inputSchema` upfront (so MCP can serialize it). Pays back enormously when V2 ships — V2 becomes weeks of glue, not a re-architecture.

### Pattern 3 — Versioned protocol with capability negotiation

**What:** Every WS connection opens with a `hello`/`welcome` exchange declaring `protocol: 1.x`, client/server versions, and negotiated features. Server retains adapters for previous major versions for ≥1 cycle.

**When to use:** Long-lived clients you can't atomically upgrade (G2 plugin runs for months without re-fetch; Foundry module updates on different schedule).

**Trade-offs:** Complexity at the boundary; eliminates breaking-change cascades. ADR-0002 in the spec already commits to this.

### Pattern 4 — Auto-discovered panel registry (build-time, not runtime)

**What:** Panels live in `panels/<id>/` with a `manifest.ts`. `panels/_registry.ts` uses `import.meta.glob('./*/manifest.ts', { eager: true })` (Vite) to assemble the registry at build time. No runtime plugin loading.

**When to use:** When you want extensibility without runtime sandbox cost. Most "plugin auto-discovery" claims in MVP specs are runtime; **doing it at build time gives 90% of the value at 10% of the cost.**

**Trade-offs:** Adding a new panel still requires a build. For a single-DM homelab MVP that's not actually a constraint.

---

## 5. Data flow

### 5.1 Read path (HUD updates, MVP)

```
Foundry hook (e.g. dnd5e.postUseActivity)
   ↓
evenfoundryvtt.hookHandler — builds DeltaFrame { seq, type:"delta", path, value }
   ↓
WS frame to bridge (single persistent conn from module)
   ↓
bridge: ring-buffer append + per-player fanout + state-cache update
   ↓
WS frame(s) to G2 plugin(s) subscribed to that actor
   ↓
G2 state-store.applyDelta() → triggers subscriber re-render → updateText/updateImageRawData

Latency target: <500 ms p95, <1 s p99 (spec § 2.2)
```

### 5.2 Write path (manual action via R1, MVP)

```
R1.tap on Spellbook overlay → panel.handleEvent → returns { tool: "cast_spell", input }
   ↓
G2 plugin: POST /v1/action/use-activity { tool, input, idempotency_key }
   ↓
bridge: auth check → rate-limit check → idempotency dedupe → forward to Foundry module
   ↓
foundry module writer: activity.use({ configure: false }) → may need socketlib.executeAsGM for NPC effects
   ↓
Foundry hooks fire (preUse → rollAttackV2 → rollDamageV2 → postUse)
   ↓
chat card created → hooks → bridge WS push (read path resumes)
   ↓
G2 receives delta, panel re-renders, toast banner shows result

Latency target: <400 ms p50, <1 s p99 (spec § 2.2)
```

### 5.3 Bootstrap path (first-run, phone-side)

```
User scans QR install → Even App registers plugin URL
   ↓
User opens "EvenFoundryVTT" in Even App → WebView fetches plugin host URL
   ↓
plugin detects first-run (Tier 3 settings empty) → renders setup wizard (§ 7.14.7)
   ↓
User pastes/scans bridge URL + auth token (QR-paired from Foundry desktop)
   ↓
plugin → GET /v1/actor (handshake) → bridge → foundry module → returns char list
   ↓
User selects character → settings persist Tier 3
   ↓
User wears G2 → Even App detects wear → plugin auto-connects → main HUD

Latency target end-to-end: ≤90 s for first setup (spec § 7.14.7.2)
```

### 5.4 V2 voice path (optional)

```
User speaks "Cast Fireball at the gnolls" → MCP client (Claude Desktop) STT
   ↓
MCP client → tool call cast_spell { spell_id, slot_level, targets: [token_uuids] }
   ↓
foundry-mcp server: forwards to bridge as POST /v1/action/use-activity (same endpoint as MVP)
   ↓
[…rest is identical to write path § 5.2…]
   ↓
Result returned to MCP → Claude Desktop confirms
   ↓
G2 receives delta + toast "Fireball cast — 3 hits, 24 damage"

Latency target end-to-end: 1.5–3 s p50 (depends on STT+LLM provider, spec § 2.2)
```

---

## 6. Suggested build order — reconciling with Specs.md § 10

The spec's 13-week Phase 0–10 (+ V2 Phase 11–13) order is **fundamentally correct** but I have **three ordering critiques** worth surfacing for the roadmap phase:

### 6.1 Confirmation: Phase 0 → 4 ordering is correct and irreplaceable

Phase 0 (validation) → 1 (foundation) → 2 (Foundry module) → 3 (Bridge) → 4 (G2 app + raster) is **the only sensible order** because:

- Phase 0's GO/NO-GO branches (§ 10.0.5) gate the **entire** Phase 4 raster vs. glyph decision. Trying to start Phase 4 before Phase 0 risks rebuilding the renderer when reality differs from assumption.
- Phase 2 (module readers) and Phase 3 (bridge skeleton) need the **shared-protocol** package from Phase 1 to be useful. This is correctly sequenced.
- The G2 app (Phase 4) is the **highest-risk, longest single phase** (3 weeks: weeks 4–7). Starting it first would mean building against a moving server contract.

### 6.2 Critique 1 — Phase 5 (Panel Plugin System) starts at week 6, **overlapping with Phase 4 (week 4–7).** This is OK if Phase 4 has finished the layer-manager + state-store before week 6, but the dependency is implicit.

**Recommendation for roadmap:** Make explicit that Phase 5 has a hard dep on Phase 4's `core/state-store.ts` + `layers/layer-manager.ts` (specifically the layer-manager API for `mountOverlay(panel, capture: bool)`). Either:
- Pull layer-manager into Phase 4 weeks 4–5 deliverable;
- Or split Phase 4 into 4a (raster + status HUD only, week 4–5) and 4b (overlay slot + map mode toggle, week 6–7) so panel work can begin week 6 with a stable layer-manager API.

### 6.3 Critique 2 — Phase 6 (R1 Integration) at week 7–8 is **risky to defer that late** if Phase 0's R1 SDK validation surfaces undocumented quirks. R1 is the **only input device**; if its SDK behaves unexpectedly, Phases 5 and 4 will need rework.

**Recommendation for roadmap:** Pull a thin "R1 event source" stub into Phase 4 (weeks 4–5) so panels in Phase 5 can be tested with real R1 events end-to-end. Phase 6 then becomes "Quick Action menu + telemetry" rather than "first time R1 events flow through the app."

### 6.4 Critique 3 — Phase 7 (Foundry Module Write Path) at week 8–9 is **after** Phase 5 panels are built. This is fine if all Phase 5 panels are read-only — and looking at the spec, they are (`sheet`, `combat`, `log`, `inventory`, `spellbook` are all read-only displays in Phase 5; write-paths come in Phase 8). **OK as specified.**

### 6.5 Cross-cutting concerns the spec's roadmap doesn't explicitly schedule

| Concern | Phase to introduce | Why it matters |
|---------|-------------------|----------------|
| **Idempotency-key implementation** | Phase 3 (Bridge) — write path forming begins | Cheaper to add up-front than retrofit after first double-cast bug |
| **Replay buffer + sequence numbers** | Phase 3 (Bridge) | Spec § 11.5.8.1 requires it; needs to be in by Phase 3 or first reconnect kills delta integrity |
| **ADR template + first 5 ADRs** | Phase 1 | Spec § 1 already names ADR-0001…0006; commit them in Phase 1, not retroactively |
| **i18n test fixture** | Phase 1 (alongside `shared-protocol`) | Hard to retrofit width-budget tests after panel layouts settle |
| **Telemetry schema** | Phase 1 | Naming events `frame.render` vs. `g2.frame.rendered` is a thousand-paper-cut decision; lock event names early |
| **Pairing UI in Foundry module** | Phase 2 (currently in Phase 7 implicitly via "writers") — **pull forward** | Pairing UI doesn't depend on writers. Pull it into Phase 2 so Phase 3+4 dev can use real bearer tokens, not mocks. |
| **`/healthz` and `/readyz` from day 1** | Phase 3 | Spec § 5.6.6 names them but doesn't say "Phase 3 deliverable"; without these, Docker Compose health checks are blind. |

---

## 7. Anti-patterns to avoid

### Anti-pattern 1 — Bridge as a smart adapter (business logic on the bridge)

**What people do:** Bridge ends up implementing combat rules, action economy enforcement, target validation logic ("am I in range?")

**Why it's wrong:** Foundry + dnd5e + MidiQOL already do this. Re-implementing creates two sources of truth. When dnd5e v6 changes a rule, you debug **both** Foundry and the bridge.

**Do this instead:** Bridge is a **dumb proxy + tool dispatcher + cache + auth**. ALL game logic lives in Foundry hooks and dnd5e activities. Spec § 2.3 ("Single source of truth: FoundryVTT") is the canonical guardrail — enforce it in code review.

### Anti-pattern 2 — Runtime plugin sandbox for panels

**What people do:** Build a plugin loader that fetches panels from URLs at runtime so users can install third-party panels.

**Why it's wrong:** G2 plugin code is served as a single immutable bundle from the host (§ 3.7). There is no install mechanism for third-party G2 panels in 2026. Building this scaffolding burns 2+ weeks for zero MVP value.

**Do this instead:** Build-time auto-discovery via Vite `import.meta.glob('./panels/*/manifest.ts')`. New panel = new folder + rebuild + redeploy plugin host. Same DX, 1/10 the cost.

### Anti-pattern 3 — Tier mixing for "convenience"

**What people do:** Store the bridge URL in Foundry world settings ("so the DM can update it once and all players get it"). Or store the raster/glyph mode preference world-side ("so the DM can force a mode for low-bandwidth players").

**Why it's wrong:** Bridge URL is **per-device** (some players use LAN, some use Cloudflare Tunnel). Map mode is **per-device** (one player's BLE is fine, another's is degraded). Mixing tiers violates § 7.14.6 and breaks the multi-device case.

**Do this instead:** Apply the spec's decision-tree religiously. Add a code-review checklist: "Where does this setting live? Why?"

### Anti-pattern 4 — Rolling your own raster pipeline

**What people do:** Write Floyd-Steinberg dither + 4-bit indexed PNG encoder from scratch.

**Why it's wrong:** § 11.5.7.1 quantifies the gap: ~500–1000 LOC of edge-case-prone code, vs. 90 KB of production-tested library stack (image-q + upng-js + xxhash-wasm) that's 30–50% faster. The "vendor lock-in" concern is null because all three are MIT.

**Do this instead:** Use the library stack from § 11.5.7. Pin versions in `pnpm-lock.yaml`. Add `image-q` supply-chain note as a known risk (§ 11.5.7 already flags this).

### Anti-pattern 5 — MCP server holds long-lived state independent of Bridge

**What people do:** MCP server caches actor state aggressively; falls out of sync with Foundry when Foundry updates.

**Why it's wrong:** MCP becomes a third source of truth that diverges from Bridge cache and Foundry. Hard to debug "why does Claude think Thorin still has 12 HP when chat says 4?"

**Do this instead:** MCP server is **stateless**. Every tool call and resource fetch goes through the bridge. 5-minute ephemeral cache only for the LLM-context construction (not for write-path decisions). Spec § 5.7.4 already commits to this — keep it.

---

## 8. Integration points

### External services

| Service | Integration | Notes |
|---------|-------------|-------|
| Foundry VTT | Foundry module + `socketlib.executeAsGM` | Spec § 4.8 — pin `foundryvtt-socketlib` to `^1.x`; module manifest `relationships.requires` |
| dnd5e system | Versioned `FoundryAdapter` | Spec § 5.6.2 + ADR-0006; `dnd5eCompatible: ["5.x", "6.x"]` declared in module.json |
| MidiQOL (optional) | `MidiQOL.completeActivityUse()` if installed; vanilla `activity.use()` fallback | Detect at runtime; both code paths in `writers/use-activity.ts` |
| Even Hub SDK | `bridge.audioControl`, `createImageContainer`, `onEvenHubEvent` | Spec § 4.3; provider-isolated in `providers/g2-sdk-vXX/` |
| MCP clients (V2) | Stdio (Claude Desktop) + Streamable HTTP (remote) | Spec § 5.7.5; npm-publishable `foundry-mcp` |
| STT providers (V2) | Pluggable `STTProvider` interface; AssemblyAI / Deepgram / distil-whisper | Spec § 4.5; injected into MCP client by user, NOT into the bridge |

### Internal boundaries

| Boundary | Communication | Cross-cutting concerns |
|----------|---------------|------------------------|
| G2 plugin ↔ Even App SDK | `bridge.*` JS API in WebView | Provider-isolated for SDK version drift |
| G2 plugin ↔ Bridge | WSS (deltas) + HTTPS (writes/handshake) | Versioned protocol, replay buffer, idempotency keys, rate limit |
| Bridge ↔ Foundry module | WSS (single persistent conn) | Same versioned protocol; module is the WS client, bridge is server |
| Foundry module ↔ Foundry game | Native API + hooks + socketlib | Versioned `FoundryAdapter`; permission gates re-validated in handlers |
| MCP client ↔ MCP server | MCP JSON-RPC (stdio/Streamable HTTP) | Standard MCP capability negotiation |
| MCP server ↔ Bridge | HTTPS (re-uses bridge endpoints) | Bearer token; same auth model as MVP |

---

## 9. Sources

- **Reference Foundry bridge architectures:**
  - [ThreeHats/foundryvtt-rest-api (GitHub)](https://github.com/ThreeHats/foundryvtt-rest-api) — module + relay split, exp-backoff reconnect, x-api-key auth
  - [ThreeHats/foundryvtt-rest-api-relay (GitHub)](https://github.com/ThreeHats/foundryvtt-rest-api-relay) — relay server side
  - [alexivenkov/foundry-api-bridge-module (GitHub)](https://github.com/alexivenkov/foundry-api-bridge-module) — HTTP REST shape
  - [cclloyd/planeshift (GitHub)](https://github.com/cclloyd/planeshift) — REST API for Foundry
  - [Foundry API Bridge / foundry-mcp (Foundry packages)](https://foundryvtt.com/packages/foundry-api-bridge) — closest precedent for EVF V2: bidirectional WS + REST + MCP
  - [Foundry REST API (Foundry packages)](https://foundryvtt.com/packages/foundry-rest-api)
  - [Foundry HTTP API (Foundry packages)](https://foundryvtt.com/packages/api)

- **socketlib & GM-side action forwarding:**
  - [farling42/foundryvtt-socketlib (GitHub)](https://github.com/farling42/foundryvtt-socketlib) — canonical executeAsGM pattern
  - [foundryvtt-socketlib README (manuelVo fork, develop)](https://github.com/manuelVo/foundryvtt-socketlib/blob/develop/README.md) — usage patterns
  - [Foundry VTT Wiki — Sockets](https://foundryvtt.wiki/en/development/api/sockets) — community wisdom on socket usage
  - [socketlib (Foundry packages)](https://foundryvtt.com/packages/socketlib)

- **Even Realities ecosystem:**
  - [Even Hub — Architecture (official docs)](https://hub.evenrealities.com/docs/getting-started/architecture)
  - [Even Hub home](https://hub.evenrealities.com/)
  - [Even Realities G2 product page](https://www.evenrealities.com/smart-glasses)
  - [Conversate (support)](https://support.evenrealities.com/hc/en-us/articles/14273795154319-Conversate)
  - [Translate (support)](https://support.evenrealities.com/hc/en-us/articles/14273831059983-Translate)
  - [brianmatzelle/even-realities-g2-glasses (GitHub starter)](https://github.com/brianmatzelle/even-realities-g2-glasses) — TypeScript+Vite starter, hot reload via QR sideload
  - [i-soxi/even-g2-protocol (GitHub reverse-engineering)](https://github.com/i-soxi/even-g2-protocol) — BLE protocol documentation efforts

- **MCP TypeScript SDK & 2026 architecture:**
  - [modelcontextprotocol/typescript-sdk (GitHub)](https://github.com/modelcontextprotocol/typescript-sdk)
  - [TypeScript SDK server.md (GitHub)](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
  - [@modelcontextprotocol/sdk (npm)](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
  - [MCP TypeScript SDK docs](https://ts.sdk.modelcontextprotocol.io/)
  - [Complete Guide to MCP in 2026 (DEV)](https://dev.to/x4nent/complete-guide-to-mcp-model-context-protocol-in-2026-architecture-implementation-and-4a11)
  - [MCP Cheat Sheet 2026 (Webfuse)](https://www.webfuse.com/mcp-cheat-sheet)
  - [Build an MCP Server with TypeScript: 2026 Tutorial (DEV)](https://dev.to/jangwook_kim_e31e7291ad98/build-an-mcp-server-with-typescript-2026-tutorial-1ipk)

- **WebSocket reconnect / replay buffer / delta-encoding patterns:**
  - [WebSocket.org — Reconnection: state sync and recovery](https://websocket.org/guides/reconnection/)
  - [WebSocket.org — Best practices](https://websocket.org/guides/best-practices/)
  - [WebSocket.org — React hooks lifecycle and pitfalls](https://websocket.org/guides/frameworks/react/)
  - [Saxo plain WebSocket streaming (delta encoding example)](https://www.developer.saxo/openapi/learn/plain-websocket-streaming)

- **Plugin architecture & manifest patterns:**
  - [Plugin Architecture in Practice — Versioning, Distribution, Ecosystem](https://oninebx.github.io/blog/architecture/plugin-architecture-in-practice-part-4-versioning-distribution-and-ecosystem/)
  - [Chrome Manifest V3 architecture overview (Chrome for Devs)](https://dev.to/javediqbal8381/understanding-chrome-extensions-a-developers-guide-to-manifest-v3-233l)

- **Spec context (read in full):**
  - `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/PROJECT.md` (lines 1–154)
  - `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/Specs.md` § 2 (System Architecture, lines 152–263), § 3.4 (Foundry/dnd5e, lines 343–354), § 3.7 (Plugin Execution Model, lines 433–472), § 3.8 (Plugin Configuration Surface, lines 474–501), § 4 (APIs & Dependencies, lines 504–610), § 5 (Components, lines 613–1103), § 5.6 (Modular Architecture, lines 779–1003), § 5.7 (foundry-mcp, lines 1006–1102), § 7.14.6 (Settings Tre superfici, lines 2674–2702), § 7.14.7 (Phone-Side Configuration UI, lines 2704–2825), § 9 (Privacy & Security, lines 3209–3217), § 10 (Roadmap, lines 3221–3543), § 11.5 (Decisions Log, lines 3561–3796).

---

## 10. Summary for downstream roadmap consumer

| Question | Verdict | Action for roadmap |
|----------|---------|---------------------|
| Plugin/WebView companion architecture (Q1) | Spec correct; SPA + state machine + Tier 3 phone storage matches Conversate/Translate/Teleprompt model | No change needed |
| Bridge service patterns (Q2) | Spec correct; matches `foundryvtt-rest-api` + `foundry-api-bridge` shape. Add idempotency keys, bearer rotation grace, WS connection cap | Add cross-cutting concern checklist to Phase 3 |
| MCP server architecture V2 (Q3) | Spec correct; SDK supports stdio + Streamable HTTP exactly as specified. Stateless server is the right call | No change needed |
| Real-time state replication (Q4) | Spec correct; explicit `seq` numbers and versioned envelope worth adding | Make sequence numbers + envelope `proto` field a Phase 3 deliverable |
| Plugin contracts (Q5) | Mostly KEEP; defer `STTProvider`/`LLMProvider` to V2; simplify `PanelManifest` for MVP | Mark contract simplifications in Phase 5 |
| Three-tier settings (Q6) | Spec is best-in-class; add `effectiveSettings()` API + tier badge in dev UI | Phase 1 deliverable for Tier 4 + migration extension |
| Security boundary for player → GM forward (Q7) | Spec correct; add re-validation in handlers + idempotency keys + rate limit per (player, target_id) | Phase 7 checklist item |
| Build order (Section 6) | Phase 0–10 sequencing fundamentally correct; pull R1 stub forward into Phase 4, split Phase 4 into 4a/4b for cleaner Phase 5 dep, pull pairing UI into Phase 2 | Three concrete adjustments listed in § 6.2–6.4 |

**Cross-cutting concerns the spec might have missed (concise list for roadmap intake):**

1. **Idempotency keys** on write-path POSTs (bridge layer dedupe, 60 s LRU)
2. **Explicit sequence numbers** in WS frame envelope + `proto` version field
3. **Effective-settings dev-tools** API showing which tier resolved each setting
4. **Re-validation in `executeAsGM` handlers** (defense in depth against socket bypass)
5. **Bearer rotation grace window** (60 s overlap to absorb in-flight WS during 24 h refresh)
6. **WS connection cap per (player, device)** (DoS resistance)
7. **Snapshot fallback path reuses `GET /v1/actor`** etc. (instead of inventing a new "full state dump" message)
8. **Telemetry event schema lock-in at Phase 1** (avoid the thousand-paper-cuts rename later)
9. **Tier 4 (G2 device-local) settings get the same versioned migration treatment as Tier 1**

**Files referenced (absolute paths):**
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/PROJECT.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/Specs.md`
- `/home/aiacos/.claude/get-shit-done/templates/research-project/ARCHITECTURE.md` (template — ASCII diagrams + section structure followed)