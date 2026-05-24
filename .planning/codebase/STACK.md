# Technology Stack

**Analysis Date:** 2026-05-24

## Languages

**Primary:**
- TypeScript 5.8.3 - All package sources (strict mode enabled per INV-4)

**Secondary:**
- JavaScript - Generated output from TypeScript compilation via tsup/Vite

## Runtime

**Environment:**
- Node.js 24.x LTS (pinned in `.nvmrc`) - Bridge, foundry-mcp, build scripts
- Browser (WebView) - g2-app plugin host runs in Even Realities App WebView (Safari WKWebView)

**Package Manager:**
- pnpm 10.33.4 - Workspace manager with strict hoisting (shamefully-hoist=false per INV-4)
- Lockfile: pnpm-lock.yaml (present, frozen-lockfile enforced in CI and Docker builds)

## Frameworks

**Core:**
- Fastify 5.8.5 - HTTP/REST framework for bridge service (`packages/bridge`)
- Vite 8.0.11 - Dev server + production bundler for g2-app plugin (`packages/g2-app`)

**WebSocket:**
- @fastify/websocket 11.2.0 - WebSocket plugin for Fastify
- ws 8.20.0 - Raw WebSocket client (bridge → Foundry module connections)

**MCP (Phase 11+):**
- @modelcontextprotocol/sdk 1.29.0 - Official Model Context Protocol TypeScript SDK

**Testing:**
- Vitest 4.1.5 - Unit/integration test runner (workspace-wide via test.projects)
- @vitest/coverage-v8 4.1.5 - Coverage provider (v8, 80% threshold)
- happy-dom 20.9.0 - Test environment for browser-shaped code
- @playwright/test 1.59.1 - E2E testing (Phase 4+)

**Build/Dev:**
- tsup 8.5.1 - Bundle bridge and foundry-mcp to single-file ESM
- tsx 4.21.0 - TypeScript loader for dev scripts (Node native)

**Code Quality:**
- Biome 2.4.15 - Lint + format (replaces ESLint + Prettier; CI gate: biome ci .)
- commitlint 19.x + husky 9.x - Conventional Commits enforcement (pre-commit + commit-msg hooks)

**Versioning:**
- @changesets/cli 2.31.0 - Per-package semver with independent pre-1.0 no-publish strategy

## Key Dependencies

**Raster Pipeline (g2-app + bridge):**
- image-q 4.0.0 - Floyd-Steinberg/Atkinson/Bayer dithering + custom 16-step greyscale palette for 4-bit quantization
- upng-js 2.1.0 - 4-bit indexed-palette PNG encoder (G2 wire format compatible, Specs.md §11.5.7)
- xxhash-wasm 1.1.0 - Sub-tile hashing for delta encoding (WASM, ~1 GB/s throughput, critical for 15 fps stretch target)

**Even Realities Integration (g2-app):**
- @evenrealities/even_hub_sdk 0.0.10 - Official SDK for Even Hub device APIs (EvenAppBridge envelope dispatch, display ops, audio capture)

**Validation & Types:**
- zod 4.4.3 - Runtime schema validation (single source of truth shared across bridge, g2-app, foundry-mcp, shared-protocol)

**Infrastructure (bridge):**
- Fastify CORS 11.2.0 - CORS plugin with origin whitelist (env var EVF_PLUGIN_HOST_URL, no wildcards per Even Hub constraint)
- Fastify Rate-Limit 10.3.0 - Per-bearer-token rate limiting (100 req/min, falls back to IP)
- pino 10.3.1 - Structured JSON logging with security redact list (deepgramKey, apiKey patterns)
- prom-client 15.1.3 - Prometheus metrics (registry + histogram hooks for HTTP route duration)
- sharp 0.34.0 - Server-side image processing fallback (Specs.md §11.5.7 Option B — not used in MVP raster path)

**Voice STT (Phase 12+):**
- Deepgram Nova-3 Multilingual via WebSocket - External STT service (DEEPGRAM_API_KEY env var, soft-fail when missing)

**Foundry Integration (foundry-module):**
- qrcode 1.5.4 - QR code generation for pairing flow (SVG output, Specs.md §11.5.4, §7.14.7.3)

**Utilities:**
- csv-stringify 6.5.2 - CSV output for validation harness reports

**Type Definitions:**
- @types/node 25.6.2 - Node.js runtime types
- @types/qrcode 1.5.5 - QRCode library types
- @types/ws 8.5.14 - WebSocket types

## Configuration

**Environment:**
- `.env` template: `deploy/.env.example` (gitignored, never committed)
- Key env vars (bridge):
  - `EVF_INTERNAL_SECRET` (required) - 32-byte random bearer secret for module → bridge auth (Specs.md §11.5.4)
  - `EVF_PLUGIN_HOST_URL` (required) - CORS allow-list origin (no wildcards)
  - `NODE_ENV` - "production" in Docker, "development" in dev
  - `LOG_LEVEL` - pino log level (info, debug, etc.)
  - `PORT` - HTTP listen port (default 8910)
  - `DEEPGRAM_API_KEY` (optional Phase 12+) - STT integration; missing = soft-fail voice-disabled

**TypeScript:**
- `tsconfig.base.json` - Root strict mode config (ES2023 target, ESNext module, bundler resolution)
  - Strict flags: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
  - Each package extends this base with its own `tsconfig.json`

**Linting & Format:**
- `biome.jsonc` - Single configuration for lint + format
  - Format: 2-space indent, 100 char line width, single quotes, trailing commas, always semicolons
  - Lint: recommended rules + strict suspicious/correctness overrides
  - CI gate: `biome ci .` (read-only, fails on any warning)

**Test:**
- `vitest.config.ts` - Workspace-wide test projects + v8 coverage (80% threshold)
  - Projects: `packages/*` (passWithNoTests: true for Phase 2+ stubs)
  - Excluded from coverage: placeholder index.ts, test files, dist/, validation-harness/src/lib/ (hardware tests)

**Workspace:**
- `pnpm-workspace.yaml` - `packages/*` glob
- `.npmrc` - shamefully-hoist=false, auto-install-peers=false, ignore-scripts=true
- `.editorconfig` - UTF-8, LF line endings, 2-space indent

**Build:**
- `Dockerfile`s (two stages):
  - `deploy/bridge.Dockerfile` - Node 24-alpine builder + runner (pnpm install --frozen-lockfile, tsup build, pnpm deploy --legacy)
  - `deploy/foundry-mcp.Dockerfile` - Same pattern for foundry-mcp service

## Platform Requirements

**Development:**
- Node.js ≥24.0.0 (engines field in root package.json)
- pnpm ≥10 (packageManager field enforces via corepack)
- Commands:
  - `pnpm install` - Install workspace deps
  - `pnpm typecheck` - Full workspace type-check (tsc --noEmit per package)
  - `pnpm lint` - Biome check (writes fixes)
  - `pnpm lint:ci` - Biome ci (read-only for CI)
  - `pnpm test` - Vitest --run (all projects)
  - `pnpm test:watch` - Vitest watch mode
  - `pnpm test:coverage` - Vitest with v8 coverage report
  - `pnpm changeset` - Add changeset for PR versioning

**Production:**
- Deployment target: Docker Compose homelab (Phase 13+ may upgrade to cloud)
- Services:
  - `bridge` - Node 24-alpine, port 8910, healthz endpoint `/healthz`
  - `foundry-mcp` - Node 24-alpine (Phase 11+), port 8911, healthz endpoint `/healthz`
  - Plugin host - Static HTTPS server (Caddy/nginx) for g2-app build output
  - Foundry VTT ≥13.347 (verified on v14) - Not shipped by EVF; module is a **plugin for** existing Foundry
- Reverse proxy: Caddy/Traefik with Let's Encrypt (TLS required by Even Hub in prod)
- Network: All domains in app.json whitelist (origin-complete URLs only, no wildcards per §3.3)

---

*Stack analysis: 2026-05-24*
