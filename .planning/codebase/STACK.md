# Technology Stack

**Analysis Date:** 2026-05-14

## Languages

**Primary:**
- **TypeScript** 5.8.3 - Core authoring language for all packages (strict mode mandatory per INV-4 §0.1 with `noUnusedLocals`, `noUnusedParameters`, plus 4 additional strict flags)
  - TS version note: Research pinned 5.8.5; actual repo pins **5.8.3** (5.8.5 does not exist on npm registry per 2026-05-11 verification). Concrete pin in `package.json` devDependencies.

**Secondary:**
- JavaScript (via TypeScript transpilation) - Output target ES2023 for all packages
- JSON/JSONC - Configuration and data formats

## Runtime

**Environment:**
- **Node.js** 24 LTS ("Krypton") - Backend service runtime (bridge, foundry-mcp v2), active LTS as of 2026-05
  - Pinned via `.nvmrc=24` and `package.json` `engines: { "node": ">=24.0.0" }`
  - Alternative: 22 LTS ("Jod", Maintenance) acceptable but Phase 1 targets 24 Active
  - Native features: WebSocket client (since 22), `--watch`, test runner support

**Browser Runtime:**
- **Safari WKWebView** - g2-app target, iOS/Android WebView in Even Realities App phone
  - ES2023 target ensures modern feature compatibility (native fetch, WebSocket, OffscreenCanvas, Web Worker)

**Package Manager:**
- **pnpm** 10.33.4 - Monorepo workspace manager, strict by default (`shamefully-hoist=false`)
  - Repository lockfile: `pnpm-lock.yaml` (committed)
  - Workspace protocol: `workspace:*` for inter-package dependencies (`@evf/shared-protocol` → `@evf/bridge`, etc.)
  - Core config: `.npmrc` enforces strict hoisting, disables auto-install peer deps, enables workspace linking

## Frameworks

**Core Backend:**
- **Fastify** 5.8.5 - HTTP/REST service framework (bridge package)
  - Plugins: `@fastify/websocket` 11.2.0, `@fastify/cors` 11.2.0, `@fastify/rate-limit` 10.3.0
  - Schema validation via `@fastify/type-provider-zod` (integrates Zod)
  - WS via native `ws@8.20.0` client underneath `@fastify/websocket`

**Frontend Build:**
- **Vite** 8.0.11 - Dev server + production bundler for g2-app (browser plugin host)
  - Multi-entry support via rollupOptions (Phase 4a G2 plugin + Phase 2 wizard)
  - Target: `es2023`, output static ESM bundle (CDN-friendly, zero state)
  - Config: `packages/g2-app/vite.config.ts`

**Bundler (Backend):**
- **tsup** 8.5.1 - Fast esbuild-based bundler for bridge and foundry-mcp
  - Produces single-file ESM dist for Docker deployment
  - Used in `@evf/bridge` and `@evf/foundry-module` build scripts

## Testing

**Test Framework:**
- **Vitest** 4.1.5 - Unit + integration test runner, workspace-aware
  - Config: `vitest.config.ts` at root with `test.projects: ['packages/*']`
  - Coverage provider: **v8** (not istanbul) via `@vitest/coverage-v8@4.1.5`
  - Coverage thresholds: 80% lines/branches/functions (root-level gate)
  - Test environment: `happy-dom@20.9.0` (faster than jsdom for non-DOM code)
  - Run commands: `pnpm test` (all), `pnpm test:watch`, `pnpm test:coverage`
  - Snapshot tests critical for INV-1 layout integrity verification

**E2E / Browser Testing:**
- **Playwright** 1.59.1 (`@playwright/test`) - Reserved for Phase 4a+ visual snapshots (not Phase 1)
  - Drives headless Chromium equivalent to WKWebView plugin host

**Test-Only Dependencies:**
- `happy-dom@20.9.0` - Lightweight DOM mock for g2-app, bridge unit tests
- `@vitest/coverage-v8@4.1.5` - V8 coverage provider (co-pinned with Vitest)

## Code Quality & Linting

**Formatter + Linter:**
- **Biome** 2.4.15 - Single unified tool replacing ESLint + Prettier
  - Config: `biome.jsonc` (replaces `.eslintrc` and `.prettierrc`)
  - Rules: `recommended: true` + strict overrides (`noExplicitAny: warn`, `noConsole: warn with allow: [error, warn]`)
  - Lint commands: `pnpm lint` (check & fix), `pnpm lint:ci` (read-only for CI)
  - Format command: `pnpm format` (writes fixes)
  - Line width: 100, spaces: 2, trailing commas: all, quotes: single, semicolons: always

**Type Checking:**
- **TypeScript** 5.8.3 compiler - `tsc --noEmit` for workspace-wide type validation
  - Root config: `tsconfig.base.json` (strict mode, no emit)
  - Per-package: each has its own `tsconfig.json` extending base
  - Command: `pnpm typecheck` (root check + per-package checks via `pnpm -r exec tsc --noEmit`)
  - Strict flags: `strict: true` + `noUnusedLocals` + `noUnusedParameters` + `noImplicitOverride` + `noFallthroughCasesInSwitch` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`

## Key Dependencies

### @evf/shared-protocol (Zod schemas, shared types)

**Critical:**
- **Zod** 4.4.3 - TypeScript-first schema validation & runtime parsing
  - Single source of truth for all protocol schemas (bridge API, MCP tools, settings)
  - Used by: bridge (route validation), g2-app (API responses), foundry-module (pairing), foundry-mcp (tool schemas)

### @evf/g2-app (Browser plugin host)

**Image Processing Pipeline:**
- **image-q** 4.0.0 - Floyd-Steinberg / Atkinson / Bayer dither + custom 16-step greyscale palette
  - Why this lib: only npm option supporting FS+Atkinson+Bayer **and** custom palette; ~60 KB gz tree-shaken
  - Dither algorithms: FS (default precision), Atkinson (performance), Bayer 8×8 (structured pattern)
  - No browser DOM dependency, worker-safe (INV-1 raster pipeline §11.5.7)

- **upng-js** 2.1.0 - 4-bit indexed-palette PNG encode/decode
  - Only mature npm encoder supporting `depth: 4` indexed-palette matching G2 wire format (§3.1)
  - Photopea-maintained, ~25 KB gz
  - No browser DOM dependency, worker-safe

- **xxhash-wasm** 1.1.0 - WASM xxHash for sub-tile delta encoding
  - ~1 GB/s throughput → 5-10× faster than hand-rolled JS murmur/FNV
  - Critical for Layer 1 + Layer 2 delta hashing (15 fps stretch target, §11.5.7.1)
  - 1.3 KB gz, zero-dependency WASM

**Networking:**
- Native `fetch` + `WebSocket` (no external library; browser baseline)

**State & Schema:**
- **Zod** 4.4.3 (workspace inter-package)

### @evf/bridge (Node.js service)

**HTTP/WS Server:**
- **Fastify** 5.8.5 - Core framework
- **@fastify/websocket** 11.2.0 - WebSocket plugin
- **@fastify/cors** 11.2.0 - CORS handling (plugin-host origin whitelist)
- **@fastify/rate-limit** 10.3.0 - Per-token rate limiting (10 req/s per bearer, audio 30s max)
- **ws** 8.20.0 - WebSocket client (originate connection toward Foundry module socket)

**Logging & Observability:**
- **pino** 10.3.1 - Structured logging, JSON-line output
  - In dev: piped to `pino-pretty` (human-readable)
  - In prod: ship to Loki/CloudWatch

- **prom-client** 15.1.3 - Prometheus metrics exposition (`/metrics` endpoint per Phase 3)

**Utilities:**
- **Zod** 4.4.3 (workspace, route/tool schema validation)

### @evf/foundry-module (Foundry module `evenfoundryvtt`)

**Foundry Integration:**
- No npm dependencies on Foundry/dnd5e (they're globals in the Foundry runtime)
- **socketlib** (NOT on npm) - Foundry module dependency declared in `module.json` `relationships.requires`
  - Enables GM-side execution: `socket.executeAsGM(handler, ...args)` pattern
  - Sourced from `github.com/farling42/foundryvtt-socketlib`

- **midi-qol** (NOT on npm) - Optional Foundry module dependency (also in `relationships.requires`)
  - Full-flow wrapper: attack → damage → save → effect
  - Sourced from `gitlab.com/tposney/midi-qol`

- **dnd5e** system (NOT on npm) - Required system, declared in `relationships.systems`
  - Minimum: 5.3.3 (Activity system mandatory, v12 not supported)
  - Sourced from `github.com/foundryvtt/dnd5e` (verified via live `system.json` as of 2026-05-10)

**QR Code:**
- **qrcode** 1.5.4 - Generate pairing QR (bearer token + metadata, SVG output)

**Types:**
- `@types/qrcode` 1.5.5 - TypeScript definitions
- Community `fvtt-types` (if needed, Phase 2 migration) - Foundry v13/v14 types

### @evf/shared-render (ASCII grid + snapshot matcher)

**Testing & Rendering:**
- **Vitest** 4.1.5 (peer dependency, used for snapshot fixture comparison)
  - INV-1 snapshot tests verify layout integrity (frame alignment, column consistency, content overflow handling)

### @evf/validation-harness (Phase 0+ hardware tests)

**CSV Output:**
- **csv-stringify** 6.5.2 - Performance test result serialization (timing, throughput measurements)

**Image Utilities:**
- **upng-js** 2.1.0 (workspace, for image format validation tests §10.0.2)

**Schema:**
- **Zod** 4.4.3 (workspace, for test payload validation)

## Configuration

**Environment:**
- Settings bootstrap via Foundry module `game.settings.register*` calls
- Bearer registry stored in `evenfoundryvtt` settings (per-pair, 24h TTL)
- Bridge URL + auth token configured in Even Realities App per-plugin settings UI (phone-side persistence, §3.8)
- Locale override stored device-local in G2 plugin state (never modifies world setting, §7.16)

**Build Configuration:**
- `package.json` - Workspace manifest, script definitions, Node 24 engine requirement
- `pnpm-workspace.yaml` - Packages glob (`packages/*`)
- `tsconfig.base.json` - Root-level TS strict config (root files only, packages have own configs)
- `tsconfig.json` - Per-package: each extends base, adds DOM/WebWorker libs as needed
- `biome.jsonc` - Unified linter + formatter config (root level, applies to all packages except documented exclusions)
- `vitest.config.ts` - Root Vitest workspace config + coverage thresholds
- `.changeset/config.json` - Semantic versioning per-package, independent bumps, pre-1.0 no-publish
- `.nvmrc` - Node version pinned to 24
- `.npmrc` - pnpm strict mode settings
- `.editorconfig` - Editor neutral formatting hints
- `.husky/` - Git hook scripts for `commitlint` (Conventional Commits enforcement)

**CI/CD:**
- `.github/workflows/ci.yml` - GitHub Actions D-1.10 7-gate pipeline (lint, typecheck, test coverage, changesets)

## Platform Requirements

**Development:**
- **Node.js 24+** (pinned `.nvmrc=24`)
- **pnpm 10.33.4** (managed via corepack in CI for reproducibility)
- Foundry VTT v13.347+ (for module development/testing via symlink or manifest install)
- dnd5e system 5.3.3+ (dependency for module features)
- socketlib module (Foundry dependency, auto-prompted by module.json)
- Even Hub SDK access (Phase 0+ hardware tests, gated on Even Realities account)

**Production (Bridge Service):**
- **Node.js 24 LTS** runtime container (`node:24-alpine` base image)
- **Docker** (Compose for MVP homelab single-tenant)
- **HTTPS** mandatory (Let's Encrypt or self-signed in dev)
- Network whitelist compliance: Bridge + Plugin Host URLs both in Even Hub `app.json` origin list (no wildcards, Specs.md §3.3)

**Production (G2 Plugin Host):**
- Static HTTP(S) server (`nginx:alpine` or Caddy)
- CDN-friendly (zero state, cacheable forever via content-hash in filename)
- HTTPS mandatory in prod
- CORS headers optional (server-to-browser, no API calls from host itself)

**Production (Plugin WebView):**
- **Even Realities App** on iOS/Android smartphone
- **Safari WKWebView** (iOS) or Chromium-based WebView (Android)
- Even R1 ring pairing via BLE

## Deployment Architecture

**Three-hop deployment** (Specs.md §3.7):

```
[ G2 firmware (display + input) ]
       ↓ BLE LC3 audio + display ops
[ Even Realities App (phone WebView) ]
       ↓ HTTPS GET (load plugin)
[ Plugin Host (static nginx/Caddy) ]
       ↓ HTTPS/WSS (game state)
[ Bridge (Node.js Fastify service) ]
       ↓ socket.io / ws / REST
[ Foundry VTT + dnd5e module ]
```

**MVP Compose stack (homelab):**
- `bridge` service: `node:24-alpine` + tsup bundle, port 8910 internal (exposed via reverse proxy)
- `plugin-host` service: `nginx:alpine` serving `packages/g2-app/dist/`, port 80/443
- `foundry` service: (user's existing homelab installation, no changes)
- Optional `caddy` service: auto-HTTPS reverse proxy, Let's Encrypt integration

**V2 MCP Addon (Phase 11+, optional):**
- `foundry-mcp` service: `node:24-alpine`, Streamable HTTP transport + stdio for local clients
- Auth: same bearer token as bridge (no new surface)

## Version Pinning & Drift Corrections

**Drift from research (per CLAUDE.md §Technology Stack):**

1. **TypeScript** - Research noted `5.8.5`; actual pinned **5.8.3**
   - Root cause: 5.8.5 does not exist on npm registry (latest 5-series is 5.8.3)
   - Pin location: `package.json` devDependencies
   - Status: CRITICAL — corrected 2026-05-11, verified live npm registry

2. **pnpm** - Research noted `10.3.1`; actual pinned **10.33.4**
   - Root cause: 10.3.1 does not exist; current `latest-10` dist-tag is 10.33.4
   - Pin location: `package.json` `packageManager` field + `pnpm-lock.yaml` lockfile version
   - Status: CRITICAL — corrected 2026-05-11, verified live npm registry

All other version pins verified as current-latest as of 2026-05-10 (see CLAUDE.md §10 Sources for full WebFetch audit trail).

---

*Stack analysis: 2026-05-14*
