# Stack Research — EvenFoundryVTT (EVF)

**Domain:** FoundryVTT D&D 5e companion plugin running on Even Realities G2 AR glasses (4-bit greyscale 576×288 phosphor display) controlled by R1 smart ring, with optional V2 MCP voice/AI server.
**Researched:** 2026-05-10
**Researcher:** GSD project research agent
**Overall confidence:** **HIGH** — every version below was queried live against `npm view`, official docs, or GitHub releases on 2026-05-10. Specs.md §11.5.7 had already done the deep raster-library work; this report confirms no drift and locks the rest of the stack with the same rigor.

> **Cross-references to spec**: this STACK.md is a *projection* of decisions already locked in `Specs.md` v0.9.11. Where the spec settled a pick (raster pipeline §11.5.7, MCP transport §4.7, repo layout §5.6.10, INV-2 cross-validation discipline) we **confirm** rather than re-litigate. Drift, where present, is flagged explicitly.

---

## 0. TL;DR — Phase 1 install matrix

A single block to copy/paste into Phase 1 monorepo bootstrap:

```bash
# Repo root
corepack enable
corepack prepare pnpm@10.33.4 --activate

# Workspace devDeps (root package.json)
pnpm add -Dw \
  typescript@5.8.3 \
  @biomejs/biome@2.4.15 \
  vitest@4.1.5 \
  @vitest/coverage-v8@4.1.5 \
  @changesets/cli@2.31.0 \
  tsx@4.21.0 \
  @types/node@25.6.2

# packages/g2-app (browser bundle, served from plugin host server)
pnpm --filter g2-app add image-q@4.0.0 upng-js@2.1.0 xxhash-wasm@1.1.0
pnpm --filter g2-app add -D vite@8.0.11 @playwright/test@1.59.1

# packages/bridge (Node 24 LTS service)
pnpm --filter bridge add fastify@5.8.5 @fastify/websocket@11.2.0 \
  @fastify/cors@11.2.0 @fastify/rate-limit@10.3.0 \
  ws@8.20.0 pino@10.3.1 zod@4.4.3 prom-client@15.1.3 qrcode@1.5.4
pnpm --filter bridge add -D tsup@8.5.1

# packages/foundry-mcp (V2, deferred to Phase 11)
pnpm --filter foundry-mcp add @modelcontextprotocol/sdk@1.29.0 zod@4.4.3
```

> **Pinning convention (per Specs.md §11.5.7)**: store as `^X.Y.Z` caret ranges in `package.json` for patch+minor compat; cite as "vX.x" in prose. Both forms are equivalent.

---

## 1. Recommended Stack — by package

### 1.1 `packages/g2-app` — Plugin host bundle (browser, Even Realities App WebView)

Runs inside the WebView of the Even Realities iPhone app, fetched from a server you control (Specs.md §3.7 — *plugin code is server-hosted, NOT bundled inside the Even App*). Talks to Even Hub SDK via `bridge.*` API (`audioControl`, `createTextContainer`, `updateImageRawData`). Strict 200 KB gz bundle ceiling (Specs.md INV-4 polish gate).

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **TypeScript** | **5.8.3** | Type-safe authoring of plugin sources | Strict mode mandatory per INV-4 §0.1 (`noUnusedLocals`, `noUnusedParameters`). 5.8 stable; 6.0.x is also "latest" on npm but only 9 days old at time of research — **stay on 5.8.x for Phase 1** until 6.0 has a quarter of ecosystem catch-up. Drift-corrected 2026-05-11: original `5.8.5` does not exist on npm (Phase 0 Plan 01 finding); `5.8.3` is the actual latest in the 5.8.x series. Re-verified ✓ 2026-05-11. |
| **Vite** | **8.0.11** | Dev server + production bundler | Fastest iteration loop (HMR <50 ms), worker-aware (`?worker` import suffix), tree-shakes `image-q`/`upng-js` cleanly. Outputs an `index.html` + JS chunks suitable for plain HTTP hosting (CDN-friendly per Specs.md §3.7). Vite 8 is current `latest` (verified 2026-05-10). |
| **`image-q`** | **4.0.0** | Floyd-Steinberg / Atkinson / Bayer dither + custom 16-step greyscale palette | Specs.md §11.5.7 already settled; only library on npm with FS+Atkinson+Bayer **and** custom palette support. ~60 KB gz tree-shaken. **Worker-safe** (no DOM dep). |
| **`upng-js`** | **2.1.0** | 4-bit indexed-palette PNG encode | Only mature npm encoder supporting `depth: 4` indexed-palette (matches G2 wire format §3.1). Photopea-maintained. ~25 KB gz. |
| **`xxhash-wasm`** | **1.1.0** | Sub-tile hash for delta encoding (Layer 1 + Layer 2) | WASM `~1 GB/s` throughput → 5-10× faster than custom JS murmur/FNV. 1.3 KB gz. **Critical** for the 15 fps stretch target (Specs.md §11.5.7.1). |
| **OffscreenCanvas + Web Worker** | platform | GPU-accelerated resize stage, off-main-thread quantize/dither/PNG encode | Native browser API, no library. `imageSmoothingQuality:'high'` GPU resize is 3-5× faster than custom bilinear (§11.5.7.1). Worker isolation also gives the failure-mode story §11.5.8.4 (worker crash → fallback glyph mode). |
| **Native `WebSocket` + `fetch`** | platform | Talk to Bridge | No `axios`/`socket.io` needed. Even Realities WebView is Safari WKWebView (iOS) — modern WHATWG fetch + WebSocket are baseline. |

**Even Hub SDK note**: `bridge.*` (`audioControl`, `createTextContainer`, `updateImageRawData`, `imuControl`, `isEventCapture`) is **not an npm package** — it's injected by the Even Realities App into the WebView global scope (Specs.md §3.7, §4.3). Phase 1 ships hand-typed `.d.ts` declarations in `packages/shared-protocol/even-hub.d.ts` based on `hub.evenrealities.com/docs/guides/device-apis`. Re-verify per INV-2 cadence.

**Why no React/Vue/Svelte**: 576×288 4-bit greyscale, no CSS/DOM/flex (Specs.md §3.1 — *coordinate-absolute pixel layout, no CSS/DOM/flex*). "DOM" doesn't exist for the rendered output — we emit `bridge.createTextContainer({x,y,w,h,text})` calls. A virtual-DOM diffing framework brings zero value here. Use plain TypeScript modules + an in-house `state-store.js` observable per Specs.md §5.4.

---

### 1.2 `packages/bridge` — Node.js service (homelab Docker Compose)

The CORS-friendly reverse-proxy and tool-registry executor (Specs.md §5.2, §5.3). Talks to Foundry via WebSocket (socketlib bridging) and exposes REST + WS to the plugin.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Node.js** | **24.x LTS** ("Krypton") | Runtime | Active LTS as of 2026-05 (verified nodejs.org/en/about/previous-releases). Alternative: 22 LTS ("Jod", maintenance). Pin in `.nvmrc` and Docker base image. Native `WebSocket` client (since 22), native `--watch`, native test runner (we still pick Vitest, see §1.6). |
| **Fastify** | **5.8.5** | HTTP/REST framework | Specs.md §5.2 already chose Fastify. Fastify 5 is current major (`latest` tag). Schema-first (Zod via `fastify-type-provider-zod`), 2-3× faster than Express, first-class TS, plugin ecosystem covers everything we need below. Express 5 is acceptable but lacks built-in schema validation and is slower; **don't use Express**. |
| **`@fastify/websocket`** | **11.2.0** | WebSocket plugin (uses `ws` underneath) | The Fastify-blessed way to expose WS endpoints. Mounts on the same Fastify instance — single port, single auth pipeline. |
| **`ws`** | **8.20.0** | WS client toward Foundry's socket | Lower-level direct usage when we need to *originate* a connection (bridge → Foundry module). De-facto standard, used by `@fastify/websocket` itself. **Don't use `socket.io`**: Foundry doesn't speak socket.io protocol on its module socket layer; we'd be paying for a parallel handshake. |
| **`@fastify/cors`** | **11.2.0** | CORS for plugin-host origin | The plugin host URL and the bridge URL are different origins (Specs.md §3.7). Whitelist plugin-host origin only — no wildcards (Even Hub network constraint §3.3). |
| **`@fastify/rate-limit`** | **10.3.0** | Per-token rate limit on action endpoints | Bearer 24h tokens (Specs.md §11.5.4) + rate limit = belt-and-suspenders against runaway loops or compromised tokens. |
| **`zod`** | **4.4.3** | Runtime schema validation | Single source of truth in `packages/shared-protocol`. Fastify type-provider derives static types AND runtime validators. Same Zod schemas re-used by `foundry-mcp` (§1.4) — Zod is the schema language MCP TS SDK already serializes to JSON Schema (Specs.md §4.7 *"developer scrive Zod, il client riceve JSON Schema standard"*). |
| **`pino`** | **10.3.1** | Structured logging | Specs.md §5.2 already chose pino. Lowest overhead Node logger. JSON-line out → `pino-pretty` in dev, ship to Loki/CloudWatch in prod. |
| **`prom-client`** | **15.1.3** | Prometheus metrics | Specs.md §5.2 mentions Prometheus. `/metrics` endpoint per Phase 3 §10. |
| **`qrcode`** | **1.5.4** | Generate the pairing QR (24h bearer payload) | Specs.md §11.5.4 / §7.14.7.3 — DM scans QR from Foundry desktop UI on Even App. SVG output, no native deps. |
| **In-memory LRU cache** | platform `Map` + ttl | Tier 1 storage (Specs.md §11.5.5) | MVP single-tenant: a `Map<sessionId, State>` with TTL is sufficient. Redis is Phase 13 stretch only. **Don't add Redis to MVP**. |

**Bun / Hono alternative explicitly considered & rejected for MVP**: Specs.md §5.2 mentions Bun+Hono as alternative. Faster, but (a) Hono's WS story is less mature than `@fastify/websocket`, (b) Bun's compatibility with `socketlib` round-tripping (which uses Foundry-flavored Node sockets) is unverified, (c) Bun in production Docker still has rough edges with native modules. **Stick with Node 24 + Fastify 5 for MVP**; revisit Bun for Phase 13 multi-tenant cloud when raw RPS matters.

**Build tooling**: `tsup@8.5.1` for bundling the bridge to a single ESM file → smaller Docker image, faster cold start. Alternative `tsx@4.21.0` for `ts-node`-style dev runs (use both: `tsup` for prod, `tsx` for `pnpm dev`).

---

### 1.3 `packages/foundry-module` — `evenfoundryvtt` Foundry module

Foundry runs **its own** v8/Node-flavored module loader; modules ship as raw JS+manifest (NOT npm-published). This package is the most constrained.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Foundry VTT** | **≥ 13.347, verified on 14** | Host platform | Specs.md §3.4 — verified live on `system.json` for dnd5e@5.3.3 (`compatibility.minimum: 13.347`, `compatibility.verified: 14`). v12 explicitly **not supported** (Activity system requirement). |
| **dnd5e system** | **≥ 5.3.3** (latest 2026-05-07) | Game system providing Activity API | Verified live on github.com/foundryvtt/dnd5e/releases. Specs.md §11.5.1 mandates dual-edition (PHB 2014 + PHB 2024 via `core.modernRules`); dnd5e 5.x supports both. **Migration alert**: dnd5e 5.3.0 changed advancement data from array → object; if Phase 2 readers iterate that data, they must use object iteration. |
| **`socketlib`** | **mandatory** (latest from `farling42/foundryvtt-socketlib`) | GM-side `executeAsGM` plumbing | **NOT on npm** (verified — `npm view socketlib` returns 404). It's a Foundry module installed as a sibling module via Foundry's manifest. Declare as `relationships.requires` in our `module.json` (Foundry will surface install prompt). Specs.md §4.8. |
| **MidiQOL** | **optional** (latest from `gitlab.com/tposney/midi-qol`) | Attack→damage→save→effect full-flow | Module-level dependency, optional. When present, our writers (§Phase 7) call `MidiQOL.completeActivityUse`; when absent, fallback to vanilla `activity.use()`. Capability handshake §5.6.3 detects presence. |
| **TypeScript** | **5.8.3** + `tsup` | Source authoring | We author TS, compile to plain ESM JS for Foundry. Foundry doesn't run TS directly; ship compiled output + sourcemap. `module.json` references the compiled JS. Drift-corrected 2026-05-11 (was 5.8.5 — ghost version). |
| **`fvtt-types`** | community types (verify Phase 2) | Type defs for Foundry globals | The `fvtt-types` package on npm is community-maintained. Pin to a version compatible with Foundry v13/v14 schema. Re-verify per INV-2 in Phase 2. |

**`module.json` shape** (canonical fields per Foundry v13+ manifest):

```json
{
  "id": "evenfoundryvtt",
  "title": "EvenFoundryVTT",
  "version": "0.1.0",
  "compatibility": { "minimum": "13.347", "verified": "14" },
  "relationships": {
    "systems":   [{ "id": "dnd5e", "compatibility": { "minimum": "5.3.0" } }],
    "requires":  [{ "id": "socketlib" }],
    "recommends":[{ "id": "midi-qol" }]
  },
  "esmodules": ["scripts/init.mjs"],
  "languages": [{ "lang": "en", "path": "lang/en.json" }, { "lang": "it", "path": "lang/it.json" }]
}
```

**Versioning**: SemVer per package, `Changesets@2.31.0` orchestrates the bump (Specs.md §10 cross-cutting). Foundry's package registry expects single-version manifest; Changesets writes the new version, CI publishes a release zip + updates the manifest URL.

---

### 1.4 `packages/foundry-mcp` — V2 optional MCP server

Deferred to Phase 11 per Specs.md §10. Isolated package; not a runtime dependency of MVP.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **`@modelcontextprotocol/sdk`** | **1.29.0** | Official MCP TypeScript SDK | Verified live on npm 2026-05-10. Implements both required transports (stdio for Claude Desktop, **Streamable HTTP** for remote homelab). Tool registration via Zod schemas, auto-serialized to JSON Schema for the wire (Specs.md §4.7). |
| **Transport: stdio + Streamable HTTP** | spec rev **2025-06-18** | MCP wire | Verified live on `modelcontextprotocol.io/specification/2025-06-18/basic/transports`. **HTTP+SSE is deprecated** (since 2024-11-05 transport version, replaced by Streamable HTTP from 2025-03-26 onward). Specs.md §4.7 already says exactly this — confirmed, no drift. **Do NOT implement HTTP+SSE except as backwards-compat fallback for legacy clients** (and even that is optional per spec). |
| **`zod`** | **4.4.3** | Tool input schemas | Same Zod the bridge uses → single source of truth for tool inputs (cast_spell, weapon_attack, etc.). Specs.md §5.7.2. |
| **Node.js** | 24.x LTS | Runtime (matches bridge) | Same runtime as bridge for ops simplicity. |

**Transport selection logic**: stdio for `claude_desktop_config.json` local invocation (Specs.md §5.7.5 *"Locale (default)"*); Streamable HTTP for the homelab Docker container variant. Both shipped from the same SDK.

---

### 1.5 `packages/shared-protocol` — TypeScript types + Zod schemas

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **TypeScript** | 5.8.3 | Type defs only | Pure types + Zod schemas. No runtime apart from Zod itself. Drift-corrected 2026-05-11 (was 5.8.5 — ghost version). |
| **`zod`** | 4.4.3 | Runtime + static schema | Schemas defined here, imported by bridge, foundry-module, g2-app, foundry-mcp. |

This is the canonical place for: `CharacterState`, `CombatState`, `Tool` discriminated union (§5.3), `Panel` contracts (§5.6.2), `even-hub.d.ts` ambient types, and the `app.json` shape for the plugin host.

---

### 1.6 Test, lint, build — workspace-wide

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| **Vitest** | **4.1.5** | Unit + integration test runner | Specs.md INV-4 mandates "Vitest coverage gate". v4 is the current `latest`. Native ESM, TS first-class, `--coverage` via v8. **Snapshot tests** are the backbone of INV-1 layout-integrity (Specs.md §7.14.4 ck 11-15 — every panel state vs ASCII fixtures). |
| **`@vitest/coverage-v8`** | 4.1.5 | Coverage provider (matches Vitest) | Use v8 over istanbul — faster, no source-map gymnastics on TS sources. |
| **`happy-dom`** | 20.9.0 | Test environment for plugin code | Faster than jsdom for simple WebView-shaped code. Switch to jsdom only if a corner case demands it. |
| **Playwright** | **`@playwright/test@1.59.1`** | E2E for the plugin host UI | Drives the WebView-equivalent (plain Chromium) for visual snapshot of HUD layouts and bridge-mock integration. **Don't use Cypress** — slower, multi-tab limited, and our flow is single-page. Phase 4+ only; not Phase 1. |
| **Biome** | **2.4.15** | Lint + format (replaces ESLint + Prettier) | Specs.md INV-4 already chose Biome. Single binary, ~10× faster than ESLint+Prettier combined, TS-aware out of the box. CI rule: `biome ci .` fails on any warning. v2 is the current `latest`. **Don't add Prettier or ESLint** — Biome covers both, and dual-tooling is the original sin we're avoiding. |
| **TypeScript** | 5.8.3 | Type-check (`tsc --noEmit`) in CI | Strict + `noUnusedLocals` + `noUnusedParameters` per INV-4 §0.1. Drift-corrected 2026-05-11 (was 5.8.5 — ghost version). |
| **`tsx`** | 4.21.0 | TS execution for dev scripts | Node native loader for `.ts` — replaces `ts-node`. |
| **`tsup`** | 8.5.1 | Bundle bridge + foundry-mcp to ESM | Zero-config; fast esbuild backend. Outputs single-file dist for Docker. |
| **pnpm** | **10.33.4** | Package manager + workspaces | Specs.md §10 already chose pnpm. Strict by default (`shamefully-hoist=false`), workspace protocol (`workspace:*`) for inter-package deps. Pin via `corepack` so Docker builds are reproducible. Drift-corrected 2026-05-11 (was 10.3.1 — ghost version; current `latest-10` dist-tag is 10.33.4). Re-verified ✓ 2026-05-11. |
| **Changesets** | **2.31.0** (`@changesets/cli`) | Versioning + changelog | Specs.md §11.5.6 already chose Changesets. Each PR adds a `.changeset/*.md` file declaring bump type per package. |

---

### 1.7 Deployment — Docker Compose homelab

| Component | Image / Recipe | Notes |
|-----------|----------------|-------|
| **Bridge** | `node:24-alpine` base; copy `tsup` bundle; `EXPOSE 8910` | Multi-stage build keeps final image <100 MB. Specs.md §11.5.3. |
| **Plugin host** | Static `nginx:alpine` serving `g2-app/dist/` | Plain HTTPS file host. Specs.md §3.7 — *static, CDN-friendly, zero state*. Caddy is an acceptable swap for auto-HTTPS via Let's Encrypt. |
| **Foundry VTT** | (out of scope for our compose; lives on user homelab already) | We don't ship Foundry; we ship a module **for** Foundry. Compose may include a `foundry` reference in dev-only `docker-compose.dev.yml` for CI integration tests. |
| **`foundry-mcp` (V2)** | `node:24-alpine`; same base as bridge | Phase 11 only. Streamable HTTP variant. |
| **Reverse proxy / TLS** | Caddy or Traefik | Automatic Let's Encrypt for the public plugin-host URL; mTLS optional for bridge if exposed beyond LAN. **Not** required for pure-LAN MVP. |

**File structure**:
```
deploy/
├── docker-compose.yml           # bridge + plugin-host + (caddy)
├── docker-compose.dev.yml       # adds local Foundry stub
├── bridge.Dockerfile
└── plugin-host.Dockerfile
```

---

## 2. Alternatives Considered (and why we picked otherwise)

| Recommended | Alternative | Why not |
|-------------|-------------|---------|
| Fastify 5 | Express 5 | 2-3× slower, no built-in schema validation, weaker TS story. |
| Fastify 5 | Hono + Bun | Specs.md considered it. Hono's WS story is less mature; Bun in production with native deps still has edge cases; rejecting until Phase 13 cloud rewrite. |
| Vitest 4 | Jest | Slower, ESM story is still rough as of 2026, requires `babel-jest` for TS. Vitest is the modern default for new TS projects. |
| Biome 2 | ESLint + Prettier | Two tools, two configs, two CI invocations, ~10× slower. Biome handles both. |
| pnpm 10 | npm workspaces / yarn 4 | npm workspaces lacks `workspace:*` rigor and is slower. yarn 4 is fine, but pnpm has stricter dependency hoisting which catches bugs early — exactly what INV-4 wants. |
| `image-q` 4.0.0 | `jimp` | Specs.md §11.5.7 already documented: jimp `@jimp/plugin-dither` is **Bayer 565 only**, no FS/Atkinson, no 4-bit indexed PNG output. **Insufficient for our requirement.** |
| `image-q` 4.0.0 | `ditherjs` / `floyd-steinberg` / `digidither` | All abandoned >5 years (red flag). |
| `upng-js` 2.1.0 | `pngjs` | 8-bit only — wrong shape for 4-bit indexed. |
| `upng-js` 2.1.0 | `fast-png` | Decode-only on 4-bit; we need encode. |
| `upng-js` 2.1.0 | `sharp` (browser) | sharp is server-only (libvips native binding). Cannot run in WebView. **In-bridge fallback** (Specs.md §11.5.7 Option B) is fine if we ever need server-side rendering, but MVP ships Option A in the browser worker. |
| `xxhash-wasm` 1.1.0 | hand-rolled MurmurHash3 in JS | 5-10× slower (Specs.md §11.5.7.1). Critical path. |
| Streamable HTTP | HTTP+SSE | **Deprecated 2025-03-26**. Confirmed live on `modelcontextprotocol.io/specification/2025-06-18/basic/transports`. Spec text: *"This replaces the HTTP+SSE transport from protocol version 2024-11-05."* |
| `ws` (raw) | `socket.io` | Foundry doesn't speak socket.io natively at the module-socket layer; we'd add a parallel handshake/abstraction. Direct `ws` is leaner and matches Foundry's own protocol. |
| In-memory `Map` | Redis (MVP) | Specs.md §11.5.5 — Tier 2 Redis is **Phase 13 stretch** only. Single-tenant homelab does not need it. |
| Plain TS modules | React / Vue / Svelte (g2-app) | No DOM emitted. The "render target" is `bridge.createTextContainer({...})` calls. Virtual DOM brings zero value. |
| Playwright | Cypress | Multi-tab limited, slower, weaker TS story. |
| TypeScript 5.8.3 | TypeScript 6.0.x | 6.0 is `latest` on npm but only days old at time of research. Wait one quarter for ecosystem (esp. Vitest, Biome, fvtt-types) catch-up. (Drift-corrected 2026-05-11: was 5.8.5.) |
| Node 24 LTS | Node 22 LTS (Maintenance) | 24 is Active LTS as of 2026-05. Pin in `.nvmrc`. |

---

## 3. What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`jimp`** for raster pipeline | Only Bayer 565 dither, no FS/Atkinson, no 4-bit indexed PNG. Specs.md §11.5.7 — explicit `Skip jimp`. | `image-q` v4.0.0 + `upng-js` v2.1.0 |
| **`pngjs` / `fast-png`** | Wrong bit depth (`pngjs` 8-bit only; `fast-png` decode-only on 4-bit). Specs.md §11.5.7. | `upng-js` v2.1.0 |
| **`pako` / `fflate`** in raster pipeline | PNG already DEFLATEs the payload. Adding a second compression layer wastes bytes. Specs.md §11.5.7. | Trust upng-js's built-in DEFLATE |
| **HTTP+SSE MCP transport** | **Deprecated 2025-03-26** (verified spec rev 2025-06-18). | Streamable HTTP (the official replacement) |
| **`socket.io`** (bridge ↔ Foundry) | Foundry doesn't speak socket.io at module-socket layer. Parallel handshake. | `ws@8.20.0` raw |
| **Express** (any version) | Slower, no built-in validation, weaker TS, less plugin coverage for our needs. | Fastify 5 |
| **ESLint + Prettier** (separately) | Two tools, ~10× slower combined, two configs to maintain. INV-4 wants single source of code-quality truth. | Biome 2.4.15 |
| **Jest** | ESM still painful in 2026; needs `babel-jest`. | Vitest 4.1.5 |
| **`ts-node`** | Deprecated in favor of `tsx` for new projects. | `tsx@4.21.0` |
| **`yarn` / `npm workspaces`** | pnpm's strict hoisting catches the kind of bug INV-4 wants caught. | pnpm 10.33.4 |
| **React / Vue / Svelte** in `g2-app` | No DOM emitted to G2 — all output is `bridge.createTextContainer` / `updateImageRawData` calls. Virtual DOM brings zero value, just bundle bloat. | Plain TS modules + observable state-store (Specs.md §5.4) |
| **Redis** in MVP bridge | Specs.md §11.5.5 — Tier 1 in-memory `Map` is sufficient for single-tenant. Redis is Phase 13 stretch. | `Map<sessionId, State>` with TTL |
| **EvenAI native LLM** | Specs.md §3.6 — **non-API for developers** (Even Realities proprietary). | External MCP via `foundry-mcp` (V2) |
| **localStorage / sessionStorage** in g2-app | Specs.md §3.1 — sandboxed iframe in WebView, **no localStorage**. Tier 4 storage uses Even Hub key-value only. | Even Hub host-managed kv store |
| **Wildcards in `app.json` whitelist** | Specs.md §3.3 — Even Hub network constraint forbids them. | Origin-complete URLs (plugin host + bridge URL only) |

---

## 4. Stack Patterns by Variant

**If single-player homelab MVP (Phase 1-10, default):**
- Single Docker Compose file: bridge + plugin-host + (caddy).
- Tier 1 in-memory cache only.
- Bearer 24h tokens, paired by QR.
- No `foundry-mcp`.

**If V2 voice/AI add-on (Phase 11+):**
- Add `foundry-mcp` container + `claude_desktop_config.json` snippet.
- Uses **Streamable HTTP** for remote, **stdio** for local.
- Same bearer token as MVP — no new auth surface (Specs.md §5.7.4).

**If Phase 13 stretch (multi-player / cloud):**
- Promote `Tier 1 Map` → `Tier 2 Redis`.
- Promote `homelab Caddy` → `Cloudflare Tunnel` or `Fly.io`/`Railway`.
- Re-evaluate Bun+Hono migration if RPS becomes a bottleneck.
- Add `bridge-headless-foundry` (Puppeteer/Playwright) for server-side raster pipeline (Specs.md §11.5.7 Option B).

---

## 5. Version Compatibility Matrix

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `dnd5e@5.3.3` | `Foundry@13.347+` (verified `14`) | From live `system.json` 2026-05-10. |
| `foundry-module/evenfoundryvtt@0.1.x` | `dnd5e@>=5.3.0` | Activity system requirement. v12 explicitly **not supported**. |
| `image-q@4.0.0` + `upng-js@2.1.0` + `xxhash-wasm@1.1.0` | OffscreenCanvas + Web Worker | All three are worker-safe (no DOM). Specs.md §11.5.7 verified. |
| `Vite 8` + `TypeScript 5.8` | Node 24 build host | Both are current latest. |
| `Vitest 4` + `@vitest/coverage-v8 4.1.5` | Match major+minor | Always co-bump (Vitest convention). |
| `Fastify 5` + `@fastify/websocket 11` + `@fastify/cors 11` + `@fastify/rate-limit 10` | Pinned major matrix | Mismatches cause runtime errors at plugin registration. |
| `@modelcontextprotocol/sdk@1.29.0` | MCP spec rev `2025-06-18` | Streamable HTTP supported. HTTP+SSE deprecated but still wire-compatible. |
| `Node 24 LTS` | All deps above | 22 LTS also works (Maintenance) — pin via `.nvmrc`. |

---

## 6. Drift / Supply-Chain Notes (INV-2 audit findings)

These are **drift signals** flagged for ADR-0006 / ADR-0008 follow-up:

1. **`image-q@4.0.0` npm-vs-git mismatch (verified 2026-05-10, unchanged from Specs.md note)**
   - npm `image-q@4.0.0` published **2022-06-19**, no newer release in nearly 4 years.
   - GitHub repo `ibezkrovnyi/image-quantization` has not pushed a `v4.x` git tag — last tag visible is `v2.1.2` (2023-10) and `image-q@3.0.4` (2021).
   - **Action**: pin-by-hash in `pnpm-lock.yaml`; consider an internal fork mirror for supply-chain resilience. Documented as ADR-0006 raster-pipeline followup in Specs.md §11.5.7.
   - **Confidence: HIGH** — verified directly via `npm view image-q time`.

2. **TypeScript 6.0.x is `latest` but very recent**
   - `npm view typescript dist-tags` returns `latest: 6.0.3` and `next: 6.0.0-dev.20260416`.
   - Phase 1 should pin **5.8.3** until Vitest, Biome, fvtt-types, and the rest publish 6-compat releases. Re-evaluate per INV-2 cadence at Phase 4 entry. (Drift-corrected 2026-05-11: original `5.8.5` does not exist on npm; `5.8.3` is the actual latest 5.8.x.)
   - **Confidence: HIGH** — version state is empirical.

3. **Node 24 LTS vs 22 LTS choice**
   - Both work. 24 is Active LTS, 22 is Maintenance. Pinning **24** future-proofs through 2027-04 (typical Node Active LTS lifetime).
   - Docker base image: `node:24-alpine` (or `node:24-slim` if Alpine musl edge cases bite — empirically test in Phase 3).
   - **Confidence: HIGH** — verified on nodejs.org/en/about/previous-releases.

4. **MCP transport — confirmed no drift from spec**
   - Specs.md §4.7: *"stdio + Streamable HTTP. HTTP+SSE è deprecato dal 2025-03-26 ma resta retrocompat-only per server legacy."*
   - Live verification (`modelcontextprotocol.io/specification/2025-06-18/basic/transports`) confirms: *"This replaces the HTTP+SSE transport from protocol version 2024-11-05."*
   - **Confidence: HIGH** — direct quote from current spec page.

5. **`socketlib` is NOT on npm**
   - `npm view socketlib` → 404. Confirmed: it ships as a Foundry module, declared in `module.json`'s `relationships.requires`. Not a `pnpm add` dependency.
   - **Confidence: HIGH** — verified empirically.

---

## 7. Phase 1 Implications — what gets installed in the pnpm workspace skeleton

This section tells the roadmap exactly what Phase 1 must bootstrap.

**Workspace root (`package.json`)**:
```json
{
  "private": true,
  "packageManager": "pnpm@10.33.4",
  "engines": { "node": ">=24.0.0", "pnpm": ">=10" },
  "devDependencies": {
    "typescript": "^5.8.3",
    "@biomejs/biome": "^2.4.15",
    "vitest": "^4.1.5",
    "@vitest/coverage-v8": "^4.1.5",
    "@changesets/cli": "^2.31.0",
    "tsx": "^4.21.0",
    "@types/node": "^25.6.2",
    "happy-dom": "^20.9.0"
  }
}
```

**`pnpm-workspace.yaml`**:
```yaml
packages:
  - "packages/*"
```

**Per-package skeletons (as Specs.md §5.6.10):**
```
packages/
├── shared-protocol/      # TS types + Zod schemas (Phase 1 boot)
├── shared-render/        # ASCII primitives, glyph dictionary (Phase 1 stub)
├── foundry-module/       # Foundry module sources (Phase 2 fills in)
├── bridge/               # Fastify service (Phase 3 fills in)
├── g2-app/               # WebView plugin (Phase 4 fills in)
└── foundry-mcp/          # V2 MCP server (Phase 11 — empty in Phase 1)
```

**CI workflow (`.github/workflows/ci.yml`)** must run, in this order, on every PR:
1. `pnpm install --frozen-lockfile`
2. `pnpm biome ci .` (lint + format)
3. `pnpm tsc --noEmit -p tsconfig.json` (type-check)
4. `pnpm test --coverage` (Vitest with coverage gate ≥ 80% on core modules per Phase 4+)
5. INV-4 grep blockers: `! grep -rE 'TODO\b(?!\()' src/ packages/*/src/` and `! grep -rE 'if \(false\)|console\.log' src/`.

**ADRs to write in Phase 1** (per Specs.md §5.6.10 and §10):
- `docs/architecture/0001-layered-ui-model.md`
- `docs/architecture/0002-protocol-versioning.md`
- `docs/architecture/0003-tool-registry-pattern.md`
- `docs/architecture/0004-voice-via-mcp-not-internal.md`
- `docs/architecture/0005-phase0-go-no-go.md` (after Phase 0 completes)
- `docs/architecture/0006-raster-pipeline-library-stack.md` (after Phase 0 raster validation)
- `docs/architecture/0008-code-quality-configuration.md` (Biome rules, TS strict flags, CI gates concretized)

**Files Phase 1 creates (that downstream phases consume):**
- `tsconfig.base.json` (strict, ESM, `moduleResolution: bundler`)
- `biome.jsonc` (lint rules, format settings)
- `vitest.config.ts` (workspace-wide config)
- `.changeset/config.json`
- `.nvmrc` (`24`)
- `Dockerfile`(s) under `deploy/`
- `packages/shared-protocol/src/even-hub.d.ts` (hand-typed declarations from `hub.evenrealities.com/docs/guides/device-apis`)

---

## 8. Confidence Assessment per Decision

| Decision | Confidence | Source |
|----------|-----------|--------|
| Raster pipeline (`image-q` + `upng-js` + `xxhash-wasm`) | **HIGH** | Specs.md §11.5.7 + live npm verification 2026-05-10. Drift signal noted (image-q npm-vs-git mismatch) but choice still optimal. |
| Fastify 5 + `ws` + Zod for bridge | **HIGH** | Specs.md §5.2 settled; live npm verification confirms current stable majors. |
| Streamable HTTP only (no HTTP+SSE) for MCP | **HIGH** | modelcontextprotocol.io/specification/2025-06-18 quoted directly. |
| Node 24 LTS | **HIGH** | nodejs.org/en/about/previous-releases verified 2026-05-10. |
| `dnd5e@5.3.3` + Foundry v13.347 / v14 | **HIGH** | Live `system.json` from `release-5.3.3` tag. |
| TypeScript 5.8.3 (deferring 6.0) | **MEDIUM-HIGH** | TypeScript 6.0 is `latest` on npm but 9 days old at research time; conservative pin until ecosystem catches up. Decision: pragmatic, not blocking. (Drift-corrected 2026-05-11: was 5.8.5.) |
| Biome 2 (no ESLint/Prettier) | **HIGH** | Specs.md INV-4 already chose; Biome 2.4.15 is current `latest`. |
| Vitest 4 + Playwright 1.59 + happy-dom | **HIGH** | Specs.md INV-4 already chose Vitest; live npm verification of v4 series. |
| pnpm 10 + Changesets + monorepo layout | **HIGH** | Specs.md §5.6.10 already settled. |
| OffscreenCanvas + Web Worker for raster | **HIGH** | Specs.md §11.5.7 settled; native browser API. |
| No React/Vue/Svelte in g2-app | **HIGH** | Specs.md §3.1 — no DOM emitted, no value-add from VDOM. |
| Bun+Hono deferred to Phase 13 | **MEDIUM** | Specs.md mentions as alternative; my recommendation to defer is conservative. Acceptable to revisit if Phase 3 perf demands it. |
| In-memory cache (no Redis) for MVP | **HIGH** | Specs.md §11.5.5 settled. |

---

## 9. Open Questions for Phase 0 / Phase 1

These cannot be answered from training data or current registries; they require runtime validation:

1. **`updateImageRawData` exact byte format** — PNG indexed-palette? Raw 4-bit packed? Endianness? Nibble order? **Phase 0 §10.0.2 critical gate.** If raw 4-bit packed, we may not need `upng-js` at all (trim ~25 KB gz). Re-validate library choice after Phase 0.
2. **BLE bandwidth real-world** — Phase 0 §10.0.3. Below 100 kbps forces glyph-mode-only; the entire raster library stack becomes optional (still ship for V2/recovery scenarios).
3. **Even Hub SDK exact `bridge.*` surface** — `audioControl`, `createTextContainer`, `updateImageRawData`, `imuControl`. Phase 0 must produce the canonical `even-hub.d.ts` from a developer-access SDK reference.
4. **`fvtt-types` version compatible with v13.347/v14** — Phase 2 must verify the community types package is current. If gaps exist, hand-write the subset we need in `packages/shared-protocol`.
5. **Biome 2 vs deno_lint / oxlint** — Biome remains the chosen pick, but the JS-tooling-in-Rust space is moving fast (Biome, oxc, deno_lint, swc-lint). Re-evaluate at Phase 13.

---

## 10. Sources (verification provenance)

All retrieved or verified on **2026-05-10** unless noted:

- `npm view image-q time --json` → 4.0.0 published 2022-06-19, no newer release.
- `npm view image-q repository` → `git+https://github.com/ibezkrovnyi/image-quantization.git`.
- `npm view upng-js version` → 2.1.0 (latest).
- `npm view xxhash-wasm version` → 1.1.0 (latest).
- `npm view fastify version` → 5.8.5 (latest).
- `npm view @fastify/websocket version` → 11.2.0 (latest).
- `npm view @fastify/cors version` → 11.2.0 (latest).
- `npm view @fastify/rate-limit version` → 10.3.0 (latest).
- `npm view ws version` → 8.20.0 (latest).
- `npm view typescript dist-tags` → `latest: 6.0.3`; latest 5-series is `5.8.3` (drift-corrected from 5.8.5 — that version never existed; re-verified ✓ 2026-05-11).
- `npm view vite version` → 8.0.11 (latest).
- `npm view vitest version` → 4.1.5 (latest).
- `npm view @vitest/coverage-v8 version` → 4.1.5 (latest).
- `npm view @biomejs/biome version` → 2.4.15 (latest).
- `npm view @modelcontextprotocol/sdk version` → 1.29.0 (latest).
- `npm view pnpm dist-tags` → `latest: 11.0.9`, `latest-10: 10.33.4` (drift-corrected from 10.3.1 — ghost version; MVP pins `latest-10` track; re-verified ✓ 2026-05-11).
- `npm view zod version` → 4.4.3 (latest).
- `npm view pino version` → 10.3.1 (latest).
- `npm view @playwright/test version` → 1.59.1 (latest).
- `npm view @changesets/cli version` → 2.31.0 (latest).
- `npm view tsx version` → 4.21.0 (latest).
- `npm view tsup version` → 8.5.1 (latest).
- `npm view prom-client version` → 15.1.3 (latest).
- `npm view qrcode version` → 1.5.4 (latest).
- `npm view happy-dom version` → 20.9.0 (latest).
- `npm view @types/node version` → 25.6.2 (latest).
- `npm view socketlib version` → **E404**, confirms socketlib is NOT on npm (Foundry module manifest dependency only).
- WebFetch `nodejs.org/en/about/previous-releases` → Node 24 (Krypton) Active LTS, 22 (Jod) Maintenance LTS.
- WebFetch `modelcontextprotocol.io/specification/2025-06-18/basic/transports` → Streamable HTTP is current; HTTP+SSE deprecated since protocol version 2024-11-05.
- WebFetch `github.com/foundryvtt/dnd5e/releases` → 5.3.3 latest stable, released 2026-05-07.
- WebFetch `raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/system.json` → `compatibility.minimum: 13.347`, `compatibility.verified: 14`.

**Internal cross-references**:
- `Specs.md` v0.9.11 §3.1 (G2 hardware), §3.4 (Foundry), §3.7 (3-hop deployment), §4.7 (MCP), §4.8 (deps), §5.2 (Bridge stack), §5.6.10 (monorepo layout), §10 (Phase 0/1), §11.5.1 (edition), §11.5.2 (license), §11.5.3 (deploy), §11.5.4 (auth), §11.5.5 (storage), §11.5.6 (branch strategy), §11.5.7 (raster lib stack), §11.5.7.1 (perf gain), §11.5.8.4 (worker failure mode), INV-4 §0.1 (code quality config).
- `PROJECT.md` Context + Constraints + Key Decisions tables.

---

## 11. Drift Corrections Log

Per INV-2 discipline (Specs §0.1), versions cited in this document that diverged from npm registry state at the time of pinning are tracked here. Each row records the discovery context and the actual pinned value in repo configuration (`package.json` + `.changeset` + `tsconfig.base.json`).

| Date | Library | Was | Is | Source | Notes |
|------|---------|-----|-----|--------|-------|
| 2026-05-11 | TypeScript | 5.8.5 | 5.8.3 | `npm view typescript versions` | `5.8.5` does not exist on npm; `5.8.3` is the actual latest 5.8-series tag at research time. Discovered by Phase 0 Plan 01 SUMMARY (commit `40732fe`). Re-verified ✓ 2026-05-11 via npm registry query. |
| 2026-05-11 | pnpm | 10.3.1 | 10.33.4 | `npm view pnpm dist-tags → latest-10` | `10.3.1` does not exist; `10.33.4` is current `latest-10` dist-tag (pnpm 11 is `latest`, but MVP stays on 10-track for monorepo stability — re-evaluate Phase 13). Discovered by Phase 0 Plan 01 SUMMARY. Re-verified ✓ 2026-05-11. |

**Note:** `npm view pnpm dist-tags` reports `latest: 11.0.9` as of 2026-05-11 — MVP intentionally pins `latest-10: 10.33.4` per CLAUDE.md "pnpm@10" convention to keep workspace toolchain on the LTS-track major. Re-evaluate at Phase 13 multi-tenant cloud migration.

---

*Stack research for: FoundryVTT D&D 5e companion plugin running on Even Realities G2 AR glasses (EvenFoundryVTT / EVF)*
*Researched: 2026-05-10*
*Drift corrections: 2026-05-11 (Phase 1 Plan 03 closure — INV-3 atomic commit)*
*Methodology: live npm registry queries, current spec WebFetches, INV-2 cross-validation discipline. No claim is rooted in training data alone.*
