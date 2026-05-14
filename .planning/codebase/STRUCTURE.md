# Codebase Structure

**Analysis Date:** 2026-05-14

## Directory Layout

```
EvenFoundryVTT/
├── .changeset/              # Changesets for semantic versioning (per-package)
├── .claude/                 # Claude Code project skills & guidelines (if present)
├── .github/                 # GitHub Actions CI/CD (.github/workflows/ci.yml)
├── .husky/                  # Git hooks (pre-commit, commit-msg via commitlint)
├── .planning/               # GSD workflow artifacts & research
│   ├── codebase/            # ← Generated codebase maps (ARCHITECTURE.md, STRUCTURE.md, etc.)
│   ├── phases/              # Phase-level planning documents & logs
│   ├── research/            # Research memos, STACK.md, INTEGRATIONS.md, etc.
│   └── *.md                 # PROJECT, REQUIREMENTS, ROADMAP, STATE
├── deploy/                  # Docker Compose & Dockerfile(s) for bridge + plugin host
├── docs/                    # Architecture Decision Records (ADRs) + showcase
│   ├── architecture/        # 0001-0008.md (accepted ADRs) + 0005-0006 proposed
│   ├── perf/                # Phase 0 performance calibration methodology
│   ├── release/             # Release notes template (foundry-module.md)
│   ├── showcase/            # GitHub Pages static HTML showcase
│   └── wiki/                # Placeholder for wiki-style docs
├── packages/                # pnpm monorepo packages
│   ├── g2-app/              # Even Realities App WebView bundle (Vite, Phase 4a placeholder)
│   ├── bridge/              # Node.js Fastify service (Phase 3 real, Phase 2 placeholder)
│   ├── foundry-module/      # Foundry VTT module `evenfoundryvtt` (Phase 2 real)
│   ├── shared-protocol/     # Zod schemas + TypeScript types (shared across all packages)
│   ├── shared-render/       # ASCII grid model + INV-1 snapshot matcher
│   └── validation-harness/  # Phase 0 hardware validation tests
├── .editorconfig            # EditorConfig (tabs, line length, etc.)
├── .gitignore               # Git ignore rules (node_modules, coverage, dist, .env*)
├── .gitattributes           # Git attributes (eol, binary handling)
├── .npmrc                    # npm/pnpm config (registry, audit settings)
├── .nvmrc                    # Node.js version pin (24)
├── biome.jsonc              # Biome linter + formatter config (v2.4.15)
├── commitlint.config.js     # Conventional Commits enforcement
├── CLAUDE.md                # Project guidelines for Claude (this repo's canonical instructions)
├── CONTRIBUTING.md          # Contribution guidelines
├── LICENSE                  # MIT
├── package.json             # Root workspace config (pnpm 10.33.4, devDeps, scripts)
├── pnpm-lock.yaml           # Lock file (commit this)
├── pnpm-workspace.yaml      # Workspace glob (packages/*)
├── README.md                # GitHub projection (coherent with Specs.md + showcase)
├── Specs.md                 # Canonical spec v0.9.11 (~4040 lines, source of truth)
├── tsconfig.base.json       # Shared TypeScript config (strict + 6 flags, excludes packages)
└── vitest.config.ts         # Vitest workspace config (test.projects: ['packages/*'], coverage gates)
```

## Directory Purposes

**`.planning/codebase/`:**
- Purpose: GSD-generated codebase maps (ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md, STACK.md, INTEGRATIONS.md)
- Contains: Analysis snapshots written by `/gsd-map-codebase` and read by `/gsd-plan-phase` / `/gsd-execute-phase`
- Key files: Each map is an independent Markdown document; no subdirs

**`.planning/phases/`:**
- Purpose: Per-phase planning (context, research, plan, summary, discussion logs)
- Contains: `NN-CONTEXT.md` (phase setup), `NN-RESEARCH.md` (investigation), `NN-01-PLAN.md` through `NN-04-PLAN.md` (execution plans), `NN-01-SUMMARY.md` (completion)
- Naming: `DD-DESIGNATION/` directories (e.g., `01-foundation/`, `02-foundry-module-core-pairing-ui/`, `03-bridge-service-skeleton/`)
- Key files: Each phase has its own subdir with CONTEXT.md (required reading before planning), RESEARCH.md (findings), PLANs (per-day breakdowns), SUMMARY (completion state)

**`.planning/research/`:**
- Purpose: Long-lived research memos (not phase-specific)
- Contains: STACK.md (technology stack snapshot), INTEGRATIONS.md (external APIs), ARCHITECTURE.md (high-level design overview, updated during research phases), FEATURES.md, PITFALLS.md, SUMMARY.md
- Key files: STACK.md is refreshed during pre-bump verification (INV-2 upstream validation round)

**`docs/architecture/`:**
- Purpose: Accepted Architecture Decision Records (MADR format)
- Contains: 0001.md through 0008.md (7 accepted, 1 reserved for RTL v2); 0005, 0006 are proposed stubs
- Naming: `NNNN-kebab-case-title.md` with frontmatter (status, date, deciders, consulted, informed)
- Key references: ADR-0001 (layered UI model), ADR-0002 (protocol versioning + resumption), ADR-0003 (tool registry), ADR-0004 (voice via MCP), ADR-0008 (code quality config)

**`deploy/`:**
- Purpose: Docker Compose and Dockerfile(s) for bridge + optional plugin host reverse proxy
- Contains: `bridge.Dockerfile` (multi-stage Node.js build), `docker-compose.yml` (bridge + nginx/caddy + optional foundry-mcp v2), `.env.example`
- Key files: `docker-compose.yml` (MVP single-tenant homelab), `bridge.Dockerfile` (build bridge from tsup bundle)

**`packages/g2-app/`:**
- Purpose: Even Realities App WebView plugin bundle (TypeScript + Vite)
- Contains: Wizard (pairing flow), HUD state machine (Phase 4a placeholder), auto-reconnect logic, i18n, Tier 3 storage (Even Hub kv)
- Key structure:
  - `src/index.ts` — stub (Phase 4a fills implementation)
  - `src/wizard/` — pairing wizard (step1-profile, step2-token, step3-character, completion)
  - `src/wizard/wizard.ts` — state machine + flow controller
  - `src/wizard/auto-connect.ts` — WebSocket reconnect + exponential backoff
  - `src/__tests__/` — snapshot & integration tests
  - `vite.config.ts` — Vite dev server + production build (outputs to dist/)
  - `vitest.config.ts` — test config (happy-dom environment)

**`packages/bridge/`:**
- Purpose: Node.js Fastify service (core business logic bridge)
- Contains: HTTP/WebSocket server, session management, replay buffer, token cache, reader REST routes, tool dispatch
- Key structure:
  - `src/index.ts` — production entry point (boot Fastify, listen on PORT 8910)
  - `src/server.ts` — `buildServer()` factory (plugin registration order, test injection points)
  - `src/auth/token-cache.ts` — LRU token cache with TTL, bearer validation
  - `src/ws/handshake.ts` — WS client connection, protocol negotiation, session_id assignment
  - `src/ws/replay-buffer.ts` — 60-second envelope buffer, gap detection (ADR-0002)
  - `src/ws/session-store.ts` — in-memory Map<session_id, session_state> with TTL
  - `src/ws/delta-emitter.ts` — broadcast envelope to all connected clients
  - `src/ws/resume.ts` — handle `client_resume` message, respond with replay or full snapshot
  - `src/routes/` — HTTP endpoints: `/v1/health`, `/v1/character/:actorId`, `/v1/combat/current`, `/v1/scene/viewport`, `/v1/events`, `/v1/i18n/:lang`, `/v1/tools/:tool`, `/internal/delta`, `/metrics`, `/healthz`, `/readyz`
  - `src/routes/tools-dispatch.ts` — TOOL_DISPATCH_TABLE[toolName] → handler function
  - `src/middleware/idempotency.ts` — dedup POST requests by idempotency-key (ADR-0002)
  - `src/metrics/registry.ts` — prom-client Prometheus metrics registry
  - `tsup.config.ts` — bundle to single `dist/index.js` for Docker

**`packages/foundry-module/`:**
- Purpose: Foundry VTT module (`evenfoundryvtt`, esmodules entry point)
- Contains: Module init, settings panel, pairing modal, socketlib handlers, Foundry hook readers
- Key structure:
  - `src/module.ts` — entry point, exports MODULE_ID, registers Hooks.once('init') + Hooks.once('ready')
  - `src/settings.ts` — register settings panel (pairing UI, internal secret storage, bearer registry)
  - `src/pair/` — pairing flow (modal, socketlib handlers, bearer registry CRUD)
    - `PairModal.ts` — application class, QR code gen, accept/cancel buttons
    - `socketlib-handlers.ts` — GM-side RPC handlers for tool invocations (cast_spell, weapon_attack, etc.)
    - `bearer-registry.ts` — manage active bearer entries (add, revoke, check expiry)
  - `src/readers/` — Foundry state extraction (character, combat, scene, event-log)
    - `character-reader.ts` — CharacterReader.snapshot(actor) → CharacterSnapshot (via dnd5e Activity API)
    - `combat-reader.ts` — CombatReader.snapshot(combat) → CombatSnapshot
    - `scene-reader.ts` — SceneReader.snapshot(scene) → SceneViewport (active token + camera)
    - `event-log-reader.ts` — EventLogReader.snapshot(world) → recent chat entries
    - `hook-subscribers.ts` — registerHookSubscribers(bridgeDeltaEmitter) — Hooks.on('updateActor'), etc.
    - `ring-buffer.ts` — RingBuffer<T> utility for event-log retention
  - `src/types/foundry-globals.d.ts` — ambient type declarations for Foundry globals (game, Hooks, etc.)
  - `module.json` — Foundry module manifest (id: evenfoundryvtt, esmodules, languages, relationships)
  - `tsup.config.ts` — bundle TypeScript sources to `dist/module.js` + `dist/module.d.ts`

**`packages/shared-protocol/`:**
- Purpose: Zod schemas + TypeScript types (single source of truth)
- Contains: Wire protocol contracts (envelope, handshake, resume, payloads, tool inputs)
- Key structure:
  - `src/index.ts` — re-exports all schemas (barrel file)
  - `src/envelope.ts` — `EnvelopeSchema`, `DeltaEnvelopeSchema`, resume schemas (ClientResumeSchema, ResumeReplaySchema, ResumeFullSnapshotSchema) per ADR-0002
  - `src/handshake.ts` — `HandshakeClientSchema`, `HandshakeServerSchema`, protocol cap negotiation
  - `src/payloads/character.ts` — `CharacterSnapshotSchema`, CHARACTER_DELTA_TYPE constant
  - `src/payloads/combat.ts` — `CombatSnapshotSchema`, `CombatantSchema`, COMBAT_STATE/TURN/TARGETS_DELTA_TYPE
  - `src/payloads/scene.ts` — `SceneViewportSchema`, SCENE_VIEWPORT_DELTA_TYPE
  - `src/payloads/event.ts` — `EventLogEntrySchema`, `EventTypeSchema`, EVENT_LOG_DELTA_TYPE
  - `src/tools/index.ts` — `TOOL_REGISTRY`, `TOOL_NAMES`, `TOOL_INPUT_SCHEMAS` discriminated union
  - `src/tools/cast-spell.ts`, `weapon-attack.ts`, `move-token.ts`, `place-template.ts`, `set-targets.ts`, `skill-check.ts`, `use-item.ts` — per-tool schemas (CastSpellInputSchema, etc.)

**`packages/shared-render/`:**
- Purpose: ASCII grid model + INV-1 snapshot matcher for layout integrity testing
- Contains: Character grid representation, snapshot fixture matcher (per Specs §7.14.4 ck 11–15)
- Key structure:
  - `src/ascii-grid.ts` — AsciiGrid class (rows, columns, set cell, get cell, toString())
  - `src/snapshot.ts` — `matchAsciiFixture(actual: Grid, expected: string)` for Vitest snapshot assertions
  - `src/fixtures/` — `.txt` ASCII fixture files (HUD layouts per z=0/z=1/z=2 state)

**`packages/validation-harness/`:**
- Purpose: Phase 0 hardware/SDK validation tests (gated on Even Hub access)
- Contains: R1 timing, image format, BLE bandwidth, DLE sustained, queue depth, palette calibration, MidiQOL probe
- Key structure:
  - `scripts/run-all.ts` — orchestrator (run all validation scripts in sequence, report pass/fail)
  - `scripts/10-0-1-r1-timing.ts` — validate R1 gesture latency (Specs §10.0.1)
  - `scripts/10-0-2-image-format.ts` — validate G2 image API (4-bit indexed, 576×288 max)
  - `scripts/10-0-3-ble-multi-env.ts` — BLE bandwidth under different network conditions
  - `scripts/10-0-7-dle-sustained.ts` — DLE sustained throughput (Phase 0 gate §10.0.7)
  - `scripts/10-0-8-queue-depth.ts` — command queue depth for raster + status updates
  - `scripts/10-0-9-palette-calibration.ts` — verify 16-step greyscale palette rendering
  - `scripts/midiqol-config-probe.ts` — probe MidiQOL system config (Phase 7 planning)
  - `src/lib/` — helper utilities (HTTP client, Even Hub SDK wrapper, test data fixtures)

## Key File Locations

**Entry Points:**
- `packages/g2-app/src/index.ts` — g2-app stub (Phase 4a fills real wizard + HUD)
- `packages/bridge/src/index.ts` — bridge production entry (boot, listen, accept connections)
- `packages/foundry-module/src/module.ts` — Foundry module entry (hooks, settings, pairing)
- `packages/validation-harness/scripts/run-all.ts` — hardware validation orchestrator

**Configuration:**
- `package.json` — root workspace (pnpm 10.33.4, Node 24, devDeps, scripts)
- `pnpm-workspace.yaml` — workspace glob (packages/*)
- `tsconfig.base.json` — shared TS config (strict + 6 flags)
- `vitest.config.ts` — Vitest workspace config (projects, coverage thresholds)
- `biome.jsonc` — Biome lint + format (v2.4.15, recommended + 4 strict)
- `packages/*/package.json` — per-package config (name @evf/*, scripts, deps)
- `packages/*/tsconfig.json` — per-package TS config (extends base)

**Core Logic:**
- `packages/shared-protocol/src/envelope.ts` — wire protocol envelope schemas (single source of truth)
- `packages/bridge/src/server.ts` — Fastify server factory + plugin registration order
- `packages/bridge/src/ws/handshake.ts` — WS client connection logic
- `packages/bridge/src/ws/replay-buffer.ts` — 60-second envelope buffer (ADR-0002)
- `packages/bridge/src/routes/tools-dispatch.ts` — tool invocation routing table
- `packages/foundry-module/src/module.ts` — Foundry hook bootstrap + pairing modal setup
- `packages/foundry-module/src/readers/character-reader.ts` — character state extraction
- `packages/foundry-module/src/pair/socketlib-handlers.ts` — GM-side RPC for tool invocations

**Testing:**
- `vitest.config.ts` — workspace config (projects, coverage gates)
- `packages/*/vitest.config.ts` — per-package overrides
- `packages/*/src/**/*.test.ts` — unit tests (co-located with source)
- `packages/g2-app/src/__tests__/` — integration tests (wizard, auto-connect, example HUD)
- `packages/shared-render/src/fixtures/` — ASCII layout fixtures (for snapshot matching)
- `packages/validation-harness/scripts/` — Phase 0 hardware tests

## Naming Conventions

**Files:**
- `kebab-case.ts` — TypeScript source files (modules)
- `PascalCase.ts` — TypeScript classes / application definitions (e.g., `PairModal.ts`, `AsciiGrid.ts`)
- `*-reader.ts` — Foundry state extraction modules (character-reader.ts, combat-reader.ts)
- `*.test.ts` — unit tests (co-located with source)
- `*.d.ts` — TypeScript ambient type declarations (foundry-globals.d.ts, even-hub.d.ts)
- `NN-kebab-title.md` — ADR files (0001-layered-ui-model.md, etc.)
- `NN-DESIGNATION/NN-CONTEXT.md` — phase planning docs (e.g., `02-foundry-module-core-pairing-ui/02-CONTEXT.md`)

**Directories:**
- `kebab-case/` — directory names (src/, packages/, docs/, .planning/, etc.)
- `@evf/*` — npm package names (monorepo scope)
- `PascalCase/` — none used in this codebase (lowercase preferred)

**Imports & Exports:**
- `workspace:*` — pnpm monorepo protocol (inter-package deps in package.json)
- `./relative/path.js` — relative imports (always explicit .js extension, ESM)
- `import type { Foo }` — type-only imports (T-safe, no runtime cost)

## Where to Add New Code

**New Feature (e.g., concentration checks):**
- Primary code: `packages/foundry-module/src/readers/` (reader for concentration state) + `packages/shared-protocol/src/payloads/` (add ConcentrationDeltaSchema) + `packages/bridge/src/routes/concentration.ts` (REST endpoint) + `packages/g2-app/src/` (render widget, Phase 4a)
- Tests: `packages/*/src/**/*.test.ts` (co-located, same dir structure as source)
- Specs update: `Specs.md` §7 (UI mockup) + `README.md` (coherence check) + `docs/showcase/index.html` (projection)

**New Component/Module:**
- Implementation: Create `packages/shared-protocol/src/types/my-feature.ts` (types) + `packages/shared-protocol/src/payloads/my-feature.ts` (Zod schema) + `packages/bridge/src/routes/my-feature.ts` (HTTP handler) + `packages/foundry-module/src/readers/my-feature-reader.ts` (reader)
- Integration: Update `packages/shared-protocol/src/index.ts` (re-export), `packages/bridge/src/server.ts` (register route), `packages/foundry-module/src/module.ts` (register hook)
- Tests: Add `packages/*/src/**/*.test.ts` per package

**Utilities/Helpers:**
- Shared helpers: `packages/shared-protocol/src/` (types that cross boundaries), or create new `packages/shared-utils/` for multi-package utilities
- Bridge-only: `packages/bridge/src/lib/` (auth, metrics, etc.)
- Foundry-module-only: `packages/foundry-module/src/lib/` (Foundry-specific helpers)
- g2-app-only: `packages/g2-app/src/lib/` (UI/rendering helpers, Phase 4a)

**Tests:**
- Unit tests: `packages/*/src/**/*.test.ts` (co-located with source, same file structure)
- Integration tests: `packages/*/src/__tests__/` (for multi-file integration flows)
- Fixtures: `packages/shared-render/src/fixtures/` (ASCII grid snapshots) or per-package `src/__fixtures__/` (test data)
- Hardware validation: `packages/validation-harness/scripts/NN-NNN-*.ts` (Phase 0 gates)

**Configuration:**
- Workspace-wide: root `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `biome.jsonc`, `.husky/`
- Per-package: `packages/*/package.json`, `packages/*/tsconfig.json`, `packages/*/vitest.config.ts` (overrides)
- Docker: `deploy/Dockerfile`, `docker-compose.yml`, `.env.example`
- Git hooks: `.husky/{pre-commit,commit-msg}` (executed by scripts in root `package.json`)

## Special Directories

**`coverage/`:**
- Purpose: Vitest v8 coverage reports (HTML + LCOV)
- Generated: Yes (via `pnpm test:coverage`)
- Committed: No (.gitignore excludes `coverage/`)
- Note: Reports are generated per CI run; local builds also create coverage/ (not checked in)

**`dist/` (per-package):**
- Purpose: Compiled output (ESM JavaScript + TypeScript declarations)
- Generated: Yes (via `pnpm build` or package build script)
- Committed: No (.gitignore excludes `dist/`)
- Structure:
  - `packages/bridge/dist/index.js` — tsup bundle (single file, all deps inlined for Docker)
  - `packages/foundry-module/dist/module.js` — tsup bundle (loaded by Foundry)
  - `packages/g2-app/dist/` — Vite output (HTML + JS chunks + assets)
  - Others are library packages (no dist/ needed; imports use src/index.ts via workspace:* + package.json exports field)

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes (via `pnpm install`)
- Committed: No (.gitignore excludes `node_modules/`)
- Lock file: `pnpm-lock.yaml` (commit this; pnpm uses it for deterministic installs)

**`.changeset/`:**
- Purpose: Changesets for semantic versioning (per-package)
- Generated: Yes (via `pnpm changeset`)
- Committed: Yes (PR-level changeset files declare bumps)
- Note: CI publishes versions from main branch changesets; each package is independent per `.changeset/config.json`

**`.planning/phases/NN-*/`:**
- Purpose: Phase-level planning (context, research, plans, summary)
- Generated: Yes (via `/gsd-plan-phase` + `/gsd-execute-phase`)
- Committed: Yes (planning artifacts are part of PR history)
- Example: `.planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md`, `02-RESEARCH.md`, `02-01-PLAN.md` through `02-04-PLAN.md`, `02-SUMMARY.md`

---

*Structure analysis: 2026-05-14*
