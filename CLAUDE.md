# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**Phase 1 active.** Monorepo skeleton lives under `packages/`; tooling foundation is committed and CI gates active. The repo contains:

**Config (root):**

- `package.json` — pnpm workspace, `packageManager: pnpm@10.33.4`, scripts for lint/typecheck/test/changeset
- `pnpm-workspace.yaml` — `packages/*` glob
- `tsconfig.base.json` — strict + 6 flags (lifted from Phase 0 proven config)
- `biome.jsonc` — Biome 2.4.15 config (recommended + 4 strict rules)
- `vitest.config.ts` — Vitest 4 `test.projects` workspace API + v8 coverage 80%
- `.changeset/config.json` — independent per-package semver, pre-1.0 no-publish
- `commitlint.config.js` + `.husky/{pre-commit,commit-msg}` — Conventional Commits enforcement
- `.nvmrc=24`, `.npmrc`, `.gitattributes`, `.editorconfig`, `.gitignore`

**Packages:**

- `packages/g2-app/` — Phase 4a placeholder (Vite 8 → Even Realities App WebView)
- `packages/bridge/` — Phase 3 placeholder (Fastify + ws Node 24 service)
- `packages/foundry-module/` — Phase 2 placeholder (Foundry module `evenfoundryvtt`)
- `packages/shared-protocol/` — Zod schemas + types (Phase 2+ fills real schemas)
- `packages/shared-render/` — ASCII grid + INV-1 snapshot matcher (Phase 4a real consumer)
- `packages/validation-harness/` — folded from `tests/phase-0/` per Phase 0 D-15 + Phase 1 D-1.02 (hardware execution gated on Even Hub access)

**Architecture:**

- `docs/architecture/` — 5 ADRs accepted (0001-0004 + 0008) + 2 Phase 0 stubs (0005, 0006); ADR-0007 reserved for V2 RTL stretch

**Documentation:**

- `Specs.md` (~4040 lines, **canonical source of truth**, v0.9.11) — requirements, hardware constraints, APIs, data models, UI/UX with ASCII mockups, layered raster pipeline, optional V2 MCP voice module, 13-week MVP roadmap, risk register
- `README.md` — projection of `Specs.md` for GitHub readers; must stay coherent (see INV-3)
- `docs/showcase/index.html` — animated single-file showcase deployed to GitHub Pages; another projection
- `docs/index.html` — root redirect to `/showcase/`
- `LICENSE` (MIT)

**CI:** GitHub Actions `.github/workflows/ci.yml` enforces D-1.10 7 quality gates on every PR.

### Build/Test/Lint Commands (Phase 1+)

```bash
pnpm install                  # install workspace deps
pnpm typecheck                # tsc --noEmit -p tsconfig.base.json && pnpm -r exec tsc --noEmit
pnpm lint                     # biome check . (writes fixes? use lint:ci for read-only)
pnpm lint:ci                  # biome ci . (read-only, CI-style)
pnpm format                   # biome check --write .
pnpm test                     # vitest --run (workspace-wide)
pnpm test:watch               # vitest --watch
pnpm test:coverage            # vitest --run --coverage
pnpm changeset                # add a changeset for the current PR
pnpm changeset:status         # check changeset declared since main

# Per-package (filter via pnpm)
pnpm --filter @evf/g2-app build
pnpm --filter @evf/validation-harness validate:all      # full hardware run (with Even Hub access)
pnpm --filter @evf/validation-harness validate:all -- --skip-hardware   # software-only smoke
```

### Phase 1 self-test (clean clone)

```bash
pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status
# All exit 0 = Phase 1 healthy
```

## Project Invariants (NON-NEGOTIABLE)

`Specs.md` §0.1 ratifies four invariants that govern every change to this repo. Read them before doing anything. Short version:

- **INV-1 Layout integrity** — every ASCII mockup and (future) runtime layout must align character-perfect across all states / contents / locales. Verifiable via §7.1a (8 sub-rules) and §7.14.4 ck 11–15. Frame corners, dividers, columns: same column from top to bottom, always. Variable content (HP=`7` vs `700`, name length, conditions overflow, IT vs EN i18n) gets width-budgeted at build time, never best-effort.
- **INV-2 Online cross-validation** — every technical claim cites a canonical upstream source. Sources allowed: `hub.evenrealities.com/docs/*`, `evenrealities.com/{ai-glasses,smart-glasses,translation-glasses,smart-ring}`, `support.evenrealities.com/specs`, `foundryvtt.com/api/*`, `github.com/foundryvtt/dnd5e`, `modelcontextprotocol.io/specification/*`, `github.com/farling42/foundryvtt-socketlib`, `gitlab.com/tposney/midi-qol`, vendor pricing pages (Deepgram, AssemblyAI). **Aggregator/blog/AI-summary sources are not authoritative.** Re-verify before each bump. Drift is classified CRITICAL / IMPORTANT / NICE-TO-HAVE and logged. Pattern: ≥4 parallel WebFetch on independent domains.
- **INV-3 Documentation coherence** — `Specs.md` + `README.md` + `docs/showcase/index.html` update **in the same commit** for any cross-cutting change (version, fps target, phase count, hardware spec, library version, locale set, ADR list). No half-updated states. Cross-reference integrity is a hard gate.
- **INV-4 Code quality** (binds Phase 1+ when code lands) — clean, optimized, documented, **zero dead/unreachable code** tolerated. Biome + TypeScript strict + Vitest coverage gate enforce in CI. `// TODO` requires `(#issue)` or `(ADR-NNNN)`. JSDoc/TSDoc on every public API. Hot-path benchmarks gate regressions.

## Pre-bump checklist (manual until CI lands)

Before bumping `Specs.md` version (e.g., v0.9.10 → v0.9.11):

1. README badge version = Specs.md header version = showcase hero stat version = boot splash mockup version (§7.12)
2. README hardware bullets = §3 hardware spec (display, mics/speaker, R1, networking, Foundry)
3. README phase table = §10 phase list (count + weeks)
4. Showcase stats reflect §3 + §10 + changelog round count
5. `grep -nE '§[0-9]+\.[0-9]+' Specs.md` → every reference exists as a heading
6. New cross-check round: ≥4 parallel WebFetch against canonical upstream, drift logged in changelog with `Re-verified ✓` or `Drift: …` lines

## Architecture mental model

EvenFoundryVTT projects a Foundry VTT D&D 5e session onto Even Realities G2 AR glasses, driven by R1 ring gestures. The spec resolves around a four-boundary system:

```
[ G2 glasses ]  ←BLE LC3 audio + display ops→  [ Even Realities App (phone, WebView) ]
                                                  │
                                                  │ HTTPS / WSS
                                                  ▼
                                       [ Bridge (Node.js Fastify + ws) ]
                                                  │
                                                  │ socketlib + REST + hooks
                                                  ▼
                                       [ FoundryVTT + dnd5e 5.x ]
                                                  │
                                                  │ optional V2: foundry-mcp
                                                  ▼
                                       [ MCP client e.g. Claude Desktop ]
```

Crucial constraints baked into the spec (do not re-litigate without upstream evidence):

- **Plugins run on the paired phone WebView, not on G2 firmware** (verbatim `hub.evenrealities.com/docs/getting-started/overview`). G2 is a thin client: display + 4-mic + IMU + touchpads. See §3.7.
- **G2 has 4 directional mics** but **no speaker / no audio output / no camera** (verbatim `hub.evenrealities.com/docs/guides/device-apis`: *"no audio output, no arbitrary pixel drawing, no camera"*). All "voice" feedback must be visual (toast §7.15.2, status HUD §7.4). See §3.1, §3.5.
- **Native EvenAI is opaque to dev apps** — proprietary "Even LLM", cloud-backed, **no API**, no transcript subscription. ChatGPT is G1-only. Our V2 voice via `foundry-mcp` MCP server is a **platform constraint**, not a design preference. See §3.6.
- **Audio capture for our app**: `bridge.audioControl(true|false)` + `event.audioEvent.audioPcm` → PCM 16 kHz s16le mono. BLE raw codec is LC3 (decoded by Hub SDK; the app sees PCM). See §3.5.
- **Rendering is layered**: z=0 map (raster default 4-bit dithered, glyph fallback) + z=1 persistent status HUD corner card + z=2 overlay panel slot. One UI, layered like Foundry desktop. See §7.2.
- **Frame rate target**: 5 fps committed / 15 fps stretch via 6-layer optimization stack (delta hash · sub-tile encoding · static caching · custom RLE · BLE 4.2+ DLE · adaptive frame rate). See §7.4b.6.1.
- **Locale follows Foundry** (`game.i18n.lang`) with **on-glasses override** via Quick Action `[N] Language`. Override is device-local, never modifies world settings. See §7.16.
- **Phase 0 is gating**: hardware assumptions (R1 events, image API format, BLE bandwidth, partial-update API, DLE, audio chunk size) all have written GO/NO-GO tests before any application code lands. See §10.0.

## Working in this repo

- The user's primary language is **Italian**; the spec is mostly Italian with English code/identifiers. Reply in Italian unless they ask otherwise. UI strings target IT (MVP) + EN (canonical fallback) per §7.16.5.
- When asked to make a spec change, **think atomic**: the same prompt usually requires updates to `Specs.md` § + changelog + README (badge + relevant section) + showcase (version + relevant section). Never leave a half-updated state.
- New invariants, ADR placeholders, or open-question resolutions go through the changelog with rationale. Past patterns to study: changelog entries v0.9.6–v0.9.10 (all from 2026-05-10).
- Don't re-litigate constraints already verified upstream. If you suspect a claim has drifted, run a fresh WebFetch round (INV-2) against canonical sources and log the result — don't quietly "correct" without evidence.
- ASCII mockups in `Specs.md` are **load-bearing**: they're the contract for INV-1 snapshot tests. Edit them with character-precision; never let alignment slip when adding a row.
- The user may ask you to invoke `/ultrareview` — that is user-triggered/billed and you cannot launch it yourself.

## Roadmap snapshot

13-week MVP (Phase 0 validation → Phase 10 polish) + V2 optional (Phase 11 MCP server / Phase 12 voice tuning / Phase 13 stretch). When code starts landing, the **first commit of Phase 1** must include monorepo skeleton + Biome + TypeScript strict + Vitest + ADR-0001 to ADR-0008 placeholders. Once that lands, replace this file's "Repository state" section with real commands.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**EvenFoundryVTT (EVF)**

Un plugin che proietta una sessione di **D&D 5e** ospitata su **FoundryVTT** direttamente sugli occhiali AR **Even Realities G2** (576×288, 4-bit greyscale phosphor green), guidato da gesture dell'anello **Even R1**. Il giocatore non distoglie mai lo sguardo dal tavolo fisico — scheda PG, combat tracker, mappa rasterizzata, log e spellbook appaiono come HUD glanceable in stile Alien Nostromo / VFD / CRT verde, mentre miniature, mappe di carta e DM umano restano al centro dell'esperienza. Il sistema è **deterministico nel core MVP** (ogni azione è gesture esplicita); voice/AI è una stretch V2 opzionale via MCP server, mai dipendenza.

**Core Value:** **Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.** Tutto il resto (fps, raster vs glyph, voice V2, multi-player) è subordinato a questo principio: se una decisione di design forza il giocatore a guardare il telefono o un laptop, è sbagliata.

### Constraints

- **Hardware G2**: 576×288 4-bit greyscale, 4 image + 8 text/list container per pagina, 1 container con `isEventCapture: 1`, image max 200×100 px, no speaker, no camera. — *Vincolo Even Realities, non negoziabile.*
- **Hardware R1**: BLE → smartphone Even App → G2; gesture solo `tap / scroll / long-press`; nessun input testuale possibile. — *Hardware Even Realities.*
- **Plugin execution model**: il codice plugin è servito da un server HTTP separato; l'Even Realities App lo carica nel WebView phone. Il G2 firmware NON esegue il nostro codice. — *Verbatim simulator README.*
- **Network**: HTTPS obbligatorio in prod; ogni dominio outbound deve essere in `app.json` whitelist (origin completo, no wildcards). — *Vincolo Even Hub.*
- **BLE bandwidth**: target ≥200 kbps sustained; <100 kbps blocca raster MVP (degrade a glyph-only). — *Phase 0 §10.0.3.*
- **D&D edition**: dual-support PHB 2014 + PHB 2024 via `core.modernRules`. Setting MVP. — *§11.5.1.*
- **License**: MIT su tutti i package del monorepo. — *§11.5.2.*
- **Deployment MVP**: Docker Compose homelab single-tenant; cloud è stretch Phase 13. — *§11.5.3.*
- **Auth**: bearer opaque 24h, paired via QR scan dal modulo Foundry desktop. — *§11.5.4.*
- **Tooling fissato**: TypeScript strict + Biome lint/format + Vitest coverage gate; CI fail su `// TODO` senza issue-link. — *INV-4 §0.1.*
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

> **Drift corrections (2026-05-11)** — the §Technology Stack rows below are a snapshot from `.planning/research/STACK.md` (researched 2026-05-10). Two version pins were drift-corrected after live `npm view` queries during Phase 0 Plan 01 (commit `40732fe`) and Phase 1 Plan 01 (commit `5096129`):
>
> - **TypeScript** — research cited `5.8.5`; actual pinned version is **`5.8.3`** (5.8.5 does not exist on npm registry). Re-verified ✓ 2026-05-11.
> - **pnpm** — research cited `10.3.1`; actual pinned version is **`10.33.4`** (10.3.1 does not exist; current `latest-10` dist-tag). Re-verified ✓ 2026-05-11.
>
> Authoritative current pins live in repo configuration (`package.json` `packageManager`, root `devDependencies`, `.changeset/config.json`). Drift Corrections Log: `.planning/research/STACK.md` §11.

## 0. TL;DR — Phase 1 install matrix
# Repo root
# Workspace devDeps (root package.json)
# packages/g2-app (browser bundle, served from plugin host server)
# packages/bridge (Node 24 LTS service)
# packages/foundry-mcp (V2, deferred to Phase 11)
## 1. Recommended Stack — by package
### 1.1 `packages/g2-app` — Plugin host bundle (browser, Even Realities App WebView)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **TypeScript** | **5.8.5** | Type-safe authoring of plugin sources | Strict mode mandatory per INV-4 §0.1 (`noUnusedLocals`, `noUnusedParameters`). 5.8 stable; 6.0.x is also "latest" on npm but only 9 days old at time of research — **stay on 5.8.x for Phase 1** until 6.0 has a quarter of ecosystem catch-up. |
| **Vite** | **8.0.11** | Dev server + production bundler | Fastest iteration loop (HMR <50 ms), worker-aware (`?worker` import suffix), tree-shakes `image-q`/`upng-js` cleanly. Outputs an `index.html` + JS chunks suitable for plain HTTP hosting (CDN-friendly per Specs.md §3.7). Vite 8 is current `latest` (verified 2026-05-10). |
| **`image-q`** | **4.0.0** | Floyd-Steinberg / Atkinson / Bayer dither + custom 16-step greyscale palette | Specs.md §11.5.7 already settled; only library on npm with FS+Atkinson+Bayer **and** custom palette support. ~60 KB gz tree-shaken. **Worker-safe** (no DOM dep). |
| **`upng-js`** | **2.1.0** | 4-bit indexed-palette PNG encode | Only mature npm encoder supporting `depth: 4` indexed-palette (matches G2 wire format §3.1). Photopea-maintained. ~25 KB gz. |
| **`xxhash-wasm`** | **1.1.0** | Sub-tile hash for delta encoding (Layer 1 + Layer 2) | WASM `~1 GB/s` throughput → 5-10× faster than custom JS murmur/FNV. 1.3 KB gz. **Critical** for the 15 fps stretch target (Specs.md §11.5.7.1). |
| **OffscreenCanvas + Web Worker** | platform | GPU-accelerated resize stage, off-main-thread quantize/dither/PNG encode | Native browser API, no library. `imageSmoothingQuality:'high'` GPU resize is 3-5× faster than custom bilinear (§11.5.7.1). Worker isolation also gives the failure-mode story §11.5.8.4 (worker crash → fallback glyph mode). |
| **Native `WebSocket` + `fetch`** | platform | Talk to Bridge | No `axios`/`socket.io` needed. Even Realities WebView is Safari WKWebView (iOS) — modern WHATWG fetch + WebSocket are baseline. |
### 1.2 `packages/bridge` — Node.js service (homelab Docker Compose)
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
### 1.3 `packages/foundry-module` — `evenfoundryvtt` Foundry module
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Foundry VTT** | **≥ 13.347, verified on 14** | Host platform | Specs.md §3.4 — verified live on `system.json` for dnd5e@5.3.3 (`compatibility.minimum: 13.347`, `compatibility.verified: 14`). v12 explicitly **not supported** (Activity system requirement). |
| **dnd5e system** | **≥ 5.3.3** (latest 2026-05-07) | Game system providing Activity API | Verified live on github.com/foundryvtt/dnd5e/releases. Specs.md §11.5.1 mandates dual-edition (PHB 2014 + PHB 2024 via `core.modernRules`); dnd5e 5.x supports both. **Migration alert**: dnd5e 5.3.0 changed advancement data from array → object; if Phase 2 readers iterate that data, they must use object iteration. |
| **`socketlib`** | **mandatory** (latest from `farling42/foundryvtt-socketlib`) | GM-side `executeAsGM` plumbing | **NOT on npm** (verified — `npm view socketlib` returns 404). It's a Foundry module installed as a sibling module via Foundry's manifest. Declare as `relationships.requires` in our `module.json` (Foundry will surface install prompt). Specs.md §4.8. |
| **MidiQOL** | **optional** (latest from `gitlab.com/tposney/midi-qol`) | Attack→damage→save→effect full-flow | Module-level dependency, optional. When present, our writers (§Phase 7) call `MidiQOL.completeActivityUse`; when absent, fallback to vanilla `activity.use()`. Capability handshake §5.6.3 detects presence. |
| **TypeScript** | **5.8.5** + `tsup` | Source authoring | We author TS, compile to plain ESM JS for Foundry. Foundry doesn't run TS directly; ship compiled output + sourcemap. `module.json` references the compiled JS. |
| **`fvtt-types`** | community types (verify Phase 2) | Type defs for Foundry globals | The `fvtt-types` package on npm is community-maintained. Pin to a version compatible with Foundry v13/v14 schema. Re-verify per INV-2 in Phase 2. |
### 1.4 `packages/foundry-mcp` — V2 optional MCP server
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **`@modelcontextprotocol/sdk`** | **1.29.0** | Official MCP TypeScript SDK | Verified live on npm 2026-05-10. Implements both required transports (stdio for Claude Desktop, **Streamable HTTP** for remote homelab). Tool registration via Zod schemas, auto-serialized to JSON Schema for the wire (Specs.md §4.7). |
| **Transport: stdio + Streamable HTTP** | spec rev **2025-06-18** | MCP wire | Verified live on `modelcontextprotocol.io/specification/2025-06-18/basic/transports`. **HTTP+SSE is deprecated** (since 2024-11-05 transport version, replaced by Streamable HTTP from 2025-03-26 onward). Specs.md §4.7 already says exactly this — confirmed, no drift. **Do NOT implement HTTP+SSE except as backwards-compat fallback for legacy clients** (and even that is optional per spec). |
| **`zod`** | **4.4.3** | Tool input schemas | Same Zod the bridge uses → single source of truth for tool inputs (cast_spell, weapon_attack, etc.). Specs.md §5.7.2. |
| **Node.js** | 24.x LTS | Runtime (matches bridge) | Same runtime as bridge for ops simplicity. |
### 1.5 `packages/shared-protocol` — TypeScript types + Zod schemas
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **TypeScript** | 5.8.5 | Type defs only | Pure types + Zod schemas. No runtime apart from Zod itself. |
| **`zod`** | 4.4.3 | Runtime + static schema | Schemas defined here, imported by bridge, foundry-module, g2-app, foundry-mcp. |
### 1.6 Test, lint, build — workspace-wide
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| **Vitest** | **4.1.5** | Unit + integration test runner | Specs.md INV-4 mandates "Vitest coverage gate". v4 is the current `latest`. Native ESM, TS first-class, `--coverage` via v8. **Snapshot tests** are the backbone of INV-1 layout-integrity (Specs.md §7.14.4 ck 11-15 — every panel state vs ASCII fixtures). |
| **`@vitest/coverage-v8`** | 4.1.5 | Coverage provider (matches Vitest) | Use v8 over istanbul — faster, no source-map gymnastics on TS sources. |
| **`happy-dom`** | 20.9.0 | Test environment for plugin code | Faster than jsdom for simple WebView-shaped code. Switch to jsdom only if a corner case demands it. |
| **Playwright** | **`@playwright/test@1.59.1`** | E2E for the plugin host UI | Drives the WebView-equivalent (plain Chromium) for visual snapshot of HUD layouts and bridge-mock integration. **Don't use Cypress** — slower, multi-tab limited, and our flow is single-page. Phase 4+ only; not Phase 1. |
| **Biome** | **2.4.15** | Lint + format (replaces ESLint + Prettier) | Specs.md INV-4 already chose Biome. Single binary, ~10× faster than ESLint+Prettier combined, TS-aware out of the box. CI rule: `biome ci .` fails on any warning. v2 is the current `latest`. **Don't add Prettier or ESLint** — Biome covers both, and dual-tooling is the original sin we're avoiding. |
| **TypeScript** | 5.8.5 | Type-check (`tsc --noEmit`) in CI | Strict + `noUnusedLocals` + `noUnusedParameters` per INV-4 §0.1. |
| **`tsx`** | 4.21.0 | TS execution for dev scripts | Node native loader for `.ts` — replaces `ts-node`. |
| **`tsup`** | 8.5.1 | Bundle bridge + foundry-mcp to ESM | Zero-config; fast esbuild backend. Outputs single-file dist for Docker. |
| **pnpm** | **10.3.1** | Package manager + workspaces | Specs.md §10 already chose pnpm. Strict by default (`shamefully-hoist=false`), workspace protocol (`workspace:*`) for inter-package deps. Pin via `corepack` so Docker builds are reproducible. |
| **Changesets** | **2.31.0** (`@changesets/cli`) | Versioning + changelog | Specs.md §11.5.6 already chose Changesets. Each PR adds a `.changeset/*.md` file declaring bump type per package. |
### 1.7 Deployment — Docker Compose homelab
| Component | Image / Recipe | Notes |
|-----------|----------------|-------|
| **Bridge** | `node:24-alpine` base; copy `tsup` bundle; `EXPOSE 8910` | Multi-stage build keeps final image <100 MB. Specs.md §11.5.3. |
| **Plugin host** | Static `nginx:alpine` serving `g2-app/dist/` | Plain HTTPS file host. Specs.md §3.7 — *static, CDN-friendly, zero state*. Caddy is an acceptable swap for auto-HTTPS via Let's Encrypt. |
| **Foundry VTT** | (out of scope for our compose; lives on user homelab already) | We don't ship Foundry; we ship a module **for** Foundry. Compose may include a `foundry` reference in dev-only `docker-compose.dev.yml` for CI integration tests. |
| **`foundry-mcp` (V2)** | `node:24-alpine`; same base as bridge | Phase 11 only. Streamable HTTP variant. |
| **Reverse proxy / TLS** | Caddy or Traefik | Automatic Let's Encrypt for the public plugin-host URL; mTLS optional for bridge if exposed beyond LAN. **Not** required for pure-LAN MVP. |
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
| TypeScript 5.8.5 | TypeScript 6.0.x | 6.0 is `latest` on npm but only days old at time of research. Wait one quarter for ecosystem (esp. Vitest, Biome, fvtt-types) catch-up. |
| Node 24 LTS | Node 22 LTS (Maintenance) | 24 is Active LTS as of 2026-05. Pin in `.nvmrc`. |
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
| **`yarn` / `npm workspaces`** | pnpm's strict hoisting catches the kind of bug INV-4 wants caught. | pnpm 10.3.1 |
| **React / Vue / Svelte** in `g2-app` | No DOM emitted to G2 — all output is `bridge.createTextContainer` / `updateImageRawData` calls. Virtual DOM brings zero value, just bundle bloat. | Plain TS modules + observable state-store (Specs.md §5.4) |
| **Redis** in MVP bridge | Specs.md §11.5.5 — Tier 1 in-memory `Map` is sufficient for single-tenant. Redis is Phase 13 stretch. | `Map<sessionId, State>` with TTL |
| **EvenAI native LLM** | Specs.md §3.6 — **non-API for developers** (Even Realities proprietary). | External MCP via `foundry-mcp` (V2) |
| **localStorage / sessionStorage** in g2-app | Specs.md §3.1 — sandboxed iframe in WebView, **no localStorage**. Tier 4 storage uses Even Hub key-value only. | Even Hub host-managed kv store |
| **Wildcards in `app.json` whitelist** | Specs.md §3.3 — Even Hub network constraint forbids them. | Origin-complete URLs (plugin host + bridge URL only) |
## 4. Stack Patterns by Variant
- Single Docker Compose file: bridge + plugin-host + (caddy).
- Tier 1 in-memory cache only.
- Bearer 24h tokens, paired by QR.
- No `foundry-mcp`.
- Add `foundry-mcp` container + `claude_desktop_config.json` snippet.
- Uses **Streamable HTTP** for remote, **stdio** for local.
- Same bearer token as MVP — no new auth surface (Specs.md §5.7.4).
- Promote `Tier 1 Map` → `Tier 2 Redis`.
- Promote `homelab Caddy` → `Cloudflare Tunnel` or `Fly.io`/`Railway`.
- Re-evaluate Bun+Hono migration if RPS becomes a bottleneck.
- Add `bridge-headless-foundry` (Puppeteer/Playwright) for server-side raster pipeline (Specs.md §11.5.7 Option B).
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
## 6. Drift / Supply-Chain Notes (INV-2 audit findings)
## 7. Phase 1 Implications — what gets installed in the pnpm workspace skeleton
- `docs/architecture/0001-layered-ui-model.md`
- `docs/architecture/0002-protocol-versioning.md`
- `docs/architecture/0003-tool-registry-pattern.md`
- `docs/architecture/0004-voice-via-mcp-not-internal.md`
- `docs/architecture/0005-phase0-go-no-go.md` (after Phase 0 completes)
- `docs/architecture/0006-raster-pipeline-library-stack.md` (after Phase 0 raster validation)
- `docs/architecture/0008-code-quality-configuration.md` (Biome rules, TS strict flags, CI gates concretized)
- `tsconfig.base.json` (strict, ESM, `moduleResolution: bundler`)
- `biome.jsonc` (lint rules, format settings)
- `vitest.config.ts` (workspace-wide config)
- `.changeset/config.json`
- `.nvmrc` (`24`)
- `Dockerfile`(s) under `deploy/`
- `packages/shared-protocol/src/even-hub.d.ts` (hand-typed declarations from `hub.evenrealities.com/docs/guides/device-apis`)
## 8. Confidence Assessment per Decision
| Decision | Confidence | Source |
|----------|-----------|--------|
| Raster pipeline (`image-q` + `upng-js` + `xxhash-wasm`) | **HIGH** | Specs.md §11.5.7 + live npm verification 2026-05-10. Drift signal noted (image-q npm-vs-git mismatch) but choice still optimal. |
| Fastify 5 + `ws` + Zod for bridge | **HIGH** | Specs.md §5.2 settled; live npm verification confirms current stable majors. |
| Streamable HTTP only (no HTTP+SSE) for MCP | **HIGH** | modelcontextprotocol.io/specification/2025-06-18 quoted directly. |
| Node 24 LTS | **HIGH** | nodejs.org/en/about/previous-releases verified 2026-05-10. |
| `dnd5e@5.3.3` + Foundry v13.347 / v14 | **HIGH** | Live `system.json` from `release-5.3.3` tag. |
| TypeScript 5.8.5 (deferring 6.0) | **MEDIUM-HIGH** | TypeScript 6.0 is `latest` on npm but 9 days old at research time; conservative pin until ecosystem catches up. Decision: pragmatic, not blocking. |
| Biome 2 (no ESLint/Prettier) | **HIGH** | Specs.md INV-4 already chose; Biome 2.4.15 is current `latest`. |
| Vitest 4 + Playwright 1.59 + happy-dom | **HIGH** | Specs.md INV-4 already chose Vitest; live npm verification of v4 series. |
| pnpm 10 + Changesets + monorepo layout | **HIGH** | Specs.md §5.6.10 already settled. |
| OffscreenCanvas + Web Worker for raster | **HIGH** | Specs.md §11.5.7 settled; native browser API. |
| No React/Vue/Svelte in g2-app | **HIGH** | Specs.md §3.1 — no DOM emitted, no value-add from VDOM. |
| Bun+Hono deferred to Phase 13 | **MEDIUM** | Specs.md mentions as alternative; my recommendation to defer is conservative. Acceptable to revisit if Phase 3 perf demands it. |
| In-memory cache (no Redis) for MVP | **HIGH** | Specs.md §11.5.5 settled. |
## 9. Open Questions for Phase 0 / Phase 1
## 10. Sources (verification provenance)
- `npm view image-q time --json` → 4.0.0 published 2022-06-19, no newer release.
- `npm view image-q repository` → `git+https://github.com/ibezkrovnyi/image-quantization.git`.
- `npm view upng-js version` → 2.1.0 (latest).
- `npm view xxhash-wasm version` → 1.1.0 (latest).
- `npm view fastify version` → 5.8.5 (latest).
- `npm view @fastify/websocket version` → 11.2.0 (latest).
- `npm view @fastify/cors version` → 11.2.0 (latest).
- `npm view @fastify/rate-limit version` → 10.3.0 (latest).
- `npm view ws version` → 8.20.0 (latest).
- `npm view typescript dist-tags` → `latest: 6.0.3`, plus 5.8.5 in 5-series.
- `npm view vite version` → 8.0.11 (latest).
- `npm view vitest version` → 4.1.5 (latest).
- `npm view @vitest/coverage-v8 version` → 4.1.5 (latest).
- `npm view @biomejs/biome version` → 2.4.15 (latest).
- `npm view @modelcontextprotocol/sdk version` → 1.29.0 (latest).
- `npm view pnpm version` → 10.3.1 (latest).
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
- `Specs.md` v0.9.11 §3.1 (G2 hardware), §3.4 (Foundry), §3.7 (3-hop deployment), §4.7 (MCP), §4.8 (deps), §5.2 (Bridge stack), §5.6.10 (monorepo layout), §10 (Phase 0/1), §11.5.1 (edition), §11.5.2 (license), §11.5.3 (deploy), §11.5.4 (auth), §11.5.5 (storage), §11.5.6 (branch strategy), §11.5.7 (raster lib stack), §11.5.7.1 (perf gain), §11.5.8.4 (worker failure mode), INV-4 §0.1 (code quality config).
- `PROJECT.md` Context + Constraints + Key Decisions tables.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
