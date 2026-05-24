# Codebase Structure

**Analysis Date:** 2026-05-24

## Directory Layout

```
EvenFoundryVTT/
├── .changeset/              # Changesets for semantic versioning (per-package)
├── .claude/                 # Claude Code project context
├── .github/                 # GitHub Actions CI/CD workflows
├── .husky/                  # Git hooks (pre-commit, commit-msg via commitlint)
├── .planning/               # GSD workflow artifacts
│   ├── codebase/            # ← GSD-generated codebase maps (ARCHITECTURE.md, STRUCTURE.md, etc.)
│   ├── phases/              # Phase-level planning documents
│   ├── research/            # Research memos (STACK.md, INTEGRATIONS.md)
│   └── *.md                 # PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md
├── deploy/                  # Docker Compose + Dockerfile(s)
├── docs/                    # Architecture Decision Records + showcase
│   ├── architecture/        # 0001-0011.md (ADRs)
│   ├── perf/                # Performance calibration methodology
│   ├── release/             # Release notes template
│   ├── showcase/            # GitHub Pages static HTML
│   └── wiki/                # Wiki-style documentation
├── packages/                # pnpm monorepo (workspaces)
│   ├── g2-app/              # Even Realities App bundle (Vite)
│   │   ├── src/
│   │   │   ├── engine/              # Boot, layer manager, r1 events, capability handshake
│   │   │   ├── panels/              # Character, combat, log, spellbook, inventory, modals
│   │   │   ├── raster/              # Map rendering, delta encoding, Web Worker
│   │   │   ├── status-hud/          # Status bar, toast queue, action economy
│   │   │   ├── locale/              # Locale override, menu, events
│   │   │   ├── wizard/              # Pairing wizard (3 steps + auto-connect)
│   │   │   ├── internal/            # Boot core (W-4 closure, internal detail)
│   │   │   ├── types/               # TypeScript .d.ts stubs (even-hub, upng-js)
│   │   │   ├── __tests__/           # Integration tests (boot, panel, raster)
│   │   │   ├── index.ts             # Production entry point
│   │   │   └── index.test-support.ts # Test DI surface (NOT in production)
│   │   ├── dist/                    # Build output (Vite bundle)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── bridge/              # Fastify service (Node 24)
│   │   ├── src/
│   │   │   ├── routes/              # HTTP routes (character, combat, scene, tools, health, etc.)
│   │   │   ├── ws/                  # WebSocket handlers (handshake, delta, tool-invoke, resume)
│   │   │   ├── cache/               # Tier 1 in-memory (token, portrait, spell-pack, entity-pack)
│   │   │   ├── voice/               # Deepgram STT, keyterm merger, audio-stream
│   │   │   ├── auth/                # Bearer token validation + cache
│   │   │   ├── portrait/            # Portrait rendering + caching
│   │   │   ├── middleware/          # Idempotency store, rate limiting
│   │   │   ├── metrics/             # Prometheus registry
│   │   │   ├── types/               # TypeScript .d.ts stubs
│   │   │   ├── __tests__/           # Integration tests (voice redact, etc.)
│   │   │   ├── index.ts             # Startup guard + server boot
│   │   │   └── server.ts            # Fastify factory + plugin registration
│   │   ├── dist/                    # Build output (tsup bundle)
│   │   ├── coverage/                # Test coverage reports
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── foundry-module/      # Foundry VTT module (evenfoundryvtt)
│   │   ├── src/
│   │   │   ├── pair/                # Bearer generation, rotation, QR modal, socketlib dispatch
│   │   │   ├── readers/             # Hook subscribers, character/combat/scene/log/entity/spell extraction
│   │   │   ├── write-path/          # 17 socketlib handlers, action trackers, concentration detector
│   │   │   │   ├── handlers/        # Individual action handlers (cast-spell, weapon-attack, etc.)
│   │   │   │   └── *.ts             # Watchers, trackers, audit log, idempotency cache
│   │   │   ├── types/               # Foundry globals stubs
│   │   │   ├── __tests__/           # Integration tests (read/write path)
│   │   │   ├── module.ts            # Foundry entry point (Hooks registration)
│   │   │   ├── settings.ts          # Settings panel + bridge config
│   │   │   ├── canvas-extractor.ts  # Scene viewport + token extractor
│   │   │   └── module.json          # Foundry manifest (esmodules, manifest+ 5.x, compatibility)
│   │   ├── dist/                    # Build output (compiled JS + manifest)
│   │   ├── lang/                    # i18n JSON (en.json, it.json)
│   │   ├── templates/               # Pair modal HTML template(s)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── shared-protocol/     # Zod schemas + TypeScript types
│   │   ├── src/
│   │   │   ├── payloads/            # Character, combat, scene, log, frame, portal, voice, spell-pack, entity-pack schemas
│   │   │   ├── tools/               # Tool input schemas (cast-spell, weapon-attack, move-token, etc.)
│   │   │   ├── voice/               # Voice keyterms (spell vocabulary for Deepgram)
│   │   │   ├── envelope.ts          # Top-level WS envelope schema + types
│   │   │   ├── handshake.ts         # Handshake + SERVER_CAPS_V1 schema
│   │   │   ├── perf-probe.ts        # Performance probe envelope schema
│   │   │   ├── index.ts             # Re-exports (single source of truth)
│   │   │   └── __tests__/           # Schema validation tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── shared-render/       # ASCII grid + snapshot matcher
│   │   ├── src/
│   │   │   ├── fixtures/            # Fixture templates (boot splash, panels, status HUD)
│   │   │   ├── grid.ts              # ASCII grid builder + cell model
│   │   │   ├── matcher.ts           # Vitest snapshot assertion helper
│   │   │   └── index.ts             # Re-exports
│   │   ├── tests/                   # Snapshot test fixtures
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── validation-harness/  # Phase 0 hardware validation
│       ├── src/
│       │   ├── scripts/              # Individual validation scripts (10-0-1, 10-0-2, etc.)
│       │   ├── tests/                # Software-only probe tests
│       │   └── foundry-modules/      # Test double modules (mock socketlib, etc.)
│       ├── package.json
│       └── tsconfig.json
│
├── coverage/                # Aggregate coverage reports (root + bridge)
├── node_modules/            # Workspace node_modules (pnpm)
├── .editorconfig            # EditorConfig settings
├── .gitignore               # Git ignore rules
├── .gitattributes           # Git attributes (eol, binary)
├── .npmrc                    # npm/pnpm config
├── .nvmrc                    # Node.js version pin (24)
├── biome.jsonc              # Biome linter + formatter config
├── commitlint.config.js     # Conventional Commits enforcement
├── CLAUDE.md                # Project guidelines (this repo's instructions for Claude)
├── CONTRIBUTING.md          # Contribution guidelines
├── LICENSE                  # MIT
├── package.json             # Root workspace config
├── pnpm-lock.yaml           # Dependency lock file
├── pnpm-workspace.yaml      # Workspace glob
├── README.md                # GitHub projection
├── Specs.md                 # Canonical spec (source of truth, ~4000 lines)
├── tsconfig.base.json       # Shared TypeScript strict config
└── vitest.config.ts         # Workspace test config
```

## Directory Purposes

**`packages/g2-app/src/`:**
- **engine/:** Core boot sequence, layer orchestration, R1 event wiring, capability handshake, page lifecycle, WS reconnect.
- **panels/:** State machines for character sheet, combat tracker, inventory, spellbook, log, reaction prompts, action options, target picker, template placement.
- **raster/:** Map base layer, delta encoding, tile hashing, RLE compression, Web Worker interface, glyph fallback.
- **status-hud/:** Status bar rendering, toast queue, action economy display, idle infill, i18n budgets, R1 hint parsing.
- **locale/:** Locale override menu, events, i18n string replacement.
- **wizard/:** Pairing flow (profile → token scan → character select), auto-connect, Tier 3 storage interface.
- **internal/:** Boot engine core (W-4 closure, NOT exposed to production).
- **types/:** TypeScript declaration stubs (.d.ts) for Even Hub SDK and upng-js.
- **__tests__/:** Integration smoke tests, boot wiring tests, scene renderer tests.

**`packages/bridge/src/`:**
- **routes/:** HTTP route handlers (character snapshot, combat turn, scene viewport, i18n, spells, entities, portrait proxy, events, health checks).
- **ws/:** WebSocket handlers (handshake negotiation, delta emitter, tool invocation dispatch, session resumption, replay buffer).
- **cache/:** Tier 1 in-memory caches (TokenCache, PortraitCache, SpellPackCache, EntityPackCache).
- **voice/:** Deepgram STT integration, audio stream route, keyterm merger for voice recognition.
- **auth/:** Bearer token validation, token cache with TTL.
- **portrait/:** Portrait rendering + caching (stretch STRETCH-06).
- **middleware/:** Idempotency store (with 24h TTL) + pre/post hooks; rate limiting.
- **metrics/:** Prometheus metrics registry + endpoint handler.
- **types/:** TypeScript stubs for Fastify extensions, upng-js.
- **__tests__/:** Voice secret redaction tests.

**`packages/foundry-module/src/`:**
- **pair/:** Bearer token generation, 24h rotation scheduler, QR pairing modal, bearer registry, socketlib handler dispatch registration.
- **readers/:** Hook subscribers (updateToken, updateActor, updateCombat, createChatMessage), character/combat/scene/log/entity/spell pack extractors.
- **write-path/:** 17 socketlib action handlers (cast-spell, weapon-attack, move-token, use-item, place-template, opportunity-attack, cast-shield, cast-counterspell, drop-concentration, skill-check), action result watcher, action economy tracker, concentration detector, movement tracker, audit log, idempotency cache, reaction watcher.
- **types/:** Foundry globals stubs (.d.ts).
- **__tests__/:** Integration tests (reader extraction, write path handlers, socketlib dispatch).

**`packages/shared-protocol/src/`:**
- **payloads/:** Schema definitions for every WS envelope payload (character, combat, scene, log, frame, action-economy, movement, portrait, voice, spell-pack, entity-pack, action-result, reaction, concentration, template, multi-attack, etc.).
- **tools/:** Input schemas for all tool invocations (cast-spell, weapon-attack, move-token, use-item, place-template, skill-check, opportunity-attack, cast-shield, cast-counterspell, drop-concentration, set-targets).
- **voice/:** Spell keyterms vocabulary for Deepgram voice recognition.
- **envelope.ts:** Top-level `Envelope` schema + `DeltaEnvelope`, validation wrapper.
- **handshake.ts:** Handshake client/server schemas + `SERVER_CAPS_V1` capability set.
- **perf-probe.ts:** Performance probe envelope for latency instrumentation.

**`packages/shared-render/src/`:**
- **fixtures/:** ASCII mockup templates (boot splash checklist, status HUD corner card, panel layouts) for snapshot tests.
- **grid.ts:** ASCII grid builder (fixed-width, column-justified cells) + cell model for character-perfect layout validation (INV-1).
- **matcher.ts:** Vitest snapshot assertion helper (`expectAsciiMatch(actual, fixture)`).

**`packages/validation-harness/src/`:**
- **scripts/:** Individual Phase 0 hardware validation probes (R1 timing, image format, BLE bandwidth, audio chunk size, etc.) + CSV output formatters.
- **tests/:** Software-only validation (no Even Hub access required).
- **foundry-modules/:** Mock Foundry modules for test harness (socketlib double, item/actor fixtures).

**`docs/architecture/`:**
- **0001-layered-ui-model.md:** ADR-0001 (z-stack atomicity, single rebuildPageContainer per frame, ADR-0001 Amendment 1).
- **0002-protocol-versioning.md:** ADR-0002 (Zod validation at every boundary, idempotency via uuid + timestamp, resumption via replay buffer).
- **0003-tool-registry-pattern.md:** ADR-0003 (tool input schemas, handler registration, ADR-0011 single-workflow-origin).
- **0004-voice-via-mcp-not-internal.md:** ADR-0004 (V2 voice via MCP server, not internal EvenAI API).
- **0005-phase0-go-no-go.md:** Hardware validation methodology + go/no-go decision criteria.
- **0006-raster-pipeline-library-stack.md:** Technology choices (image-q, upng-js, xxhash-wasm, OffscreenCanvas).
- **0008-code-quality-configuration.md:** Biome + TypeScript strict + Vitest coverage (INV-4).
- **0009-layer-manager-contract.md:** LayerManager atomicity contract, differential demolish rule (ADR-0009).
- **0010-panel-plugin-registry.md:** Panel plugin architecture + ADR-0010.
- **0011-foundry-write-path-single-workflow-origin.md:** ADR-0011 (all mutations route through dispatchTool).
- **INVARIANTS.md:** INV-1 through INV-4 + ADR-0011 overview + CI Gate 8 checklist.
- **README.md:** ADR index.

**`deploy/`:**
- **bridge.Dockerfile:** Multi-stage Node.js 24 build (FROM node:24-alpine → compile → runtime).
- **docker-compose.yml:** MVP single-tenant homelab (bridge service + nginx static host + optional foundry-mcp).
- **docker-compose.dev.yml:** Development variant (optional, for local testing with Foundry VTT).
- **.env.example:** Template for required env vars (EVF_INTERNAL_SECRET, BRIDGE_URL, etc.).

## Key File Locations

**Entry Points:**
- `packages/g2-app/src/index.ts` — Production boot (`bootEngine`)
- `packages/bridge/src/index.ts` — Bridge startup + server boot
- `packages/foundry-module/src/module.ts` — Foundry module init hook

**Configuration:**
- `package.json` — Root workspace + scripts (lint, test, typecheck, changeset)
- `tsconfig.base.json` — Shared TypeScript strict config (ES2023, no emit)
- `biome.jsonc` — Linter + formatter (Biome 2.4.15, 5 strict rules)
- `vitest.config.ts` — Workspace test config (test.projects, coverage gates)
- `.changeset/config.json` — Changesets per-package, pre-1.0 no-publish

**Core Logic:**
- **g2-app layers:** `packages/g2-app/src/engine/layer-manager.ts`, `layer-types.ts`
- **bridge routes:** `packages/bridge/src/routes/`, `packages/bridge/src/ws/`
- **foundry-module handlers:** `packages/foundry-module/src/write-path/handlers/`
- **shared protocol:** `packages/shared-protocol/src/envelope.ts`, `handshake.ts`, `payloads/`, `tools/`

**Testing:**
- Vitest config: Each package has `vitest.config.ts` with project-specific setup
- Test files: Co-located with source (`.test.ts` suffix) or in `__tests__/` subdirs
- Coverage gate: 80% target (v8 provider)
- Snapshots: `__tests__/__snapshots__/` for status HUD, panel layouts

## Naming Conventions

**Files:**
- TypeScript source: `camelCase.ts`
- Tests: `camelCase.test.ts` (co-located) or `__tests__/camelCase.test.ts`
- Type definitions: `camelCase.d.ts`
- Config files: `lower-kebab-case.config.ts` or `lower.jsonc`
- ADRs: `NNNN-kebab-case-title.md`

**Directories:**
- Feature modules: `kebab-case/` (e.g., `status-hud/`, `write-path/`)
- Test directories: `__tests__/` (Vitest convention)
- Snapshot fixtures: `__snapshots__/` or `fixtures/`
- Internal details: `internal/` (e.g., `packages/g2-app/src/internal/boot-engine-core.ts`)

**Functions & Classes:**
- Public functions: `camelCase` (e.g., `bootEngine`, `LayerManager`)
- Private/internal functions: `_camelCase` prefix (e.g., `_bootEngineCore`, `_flushPage`)
- Handler functions: `verbNounHandler` (e.g., `castSpellHandler`, `weaponAttackHandler`)
- Types: `PascalCase` (e.g., `LayerManager`, `DeltaEnvelope`, `ToolHandler`)

**Constants:**
- Enum values / type tags: `UPPER_SNAKE_CASE` (e.g., `R1_ACTION_ECONOMY_TYPE`, `Z0_MAP_LAYER`)
- Immutable collections: `UPPER_SNAKE_CASE` (e.g., `SERVER_CAPS_V1`, `SPELL_KEYTERMS`)

## Where to Add New Code

**New Feature (e.g., "add new panel type"):**
- Implementation: `packages/g2-app/src/panels/{feature}-panel.ts` + state machine in `{feature}-state.ts` + dispatcher in `{feature}-dispatcher.ts`
- Tests: `packages/g2-app/src/panels/__tests__/{feature}-panel.test.ts`
- Protocol schema: `packages/shared-protocol/src/payloads/{feature}.ts` (if envelope)
- Bridge route (if required): `packages/bridge/src/routes/{feature}.ts`
- Example: Character sheet panel (`character-sheet-panel.ts`, `character-sheet-tab-renderers.ts`, snapshot tests)

**New Socketlib Handler (e.g., "add new action"):**
- Implementation: `packages/foundry-module/src/write-path/handlers/{action}-handler.ts`
- Register: Add side-effect import to `packages/foundry-module/src/write-path/handlers/index.ts`
- Input schema: Add to `packages/shared-protocol/src/tools/{action}.ts`
- Register in TOOL_REGISTRY: `packages/shared-protocol/src/tools/index.ts`
- Tests: `packages/foundry-module/src/write-path/handlers/{action}.test.ts`
- Important: Socketlib count must remain at 17 (Phase 13 invariant per ADR-0011)

**New Payload Type (WS envelope):**
- Schema: `packages/shared-protocol/src/payloads/{topic}.ts` (define payload type + Zod schema + type constant `{TOPIC}_TYPE`)
- Re-export: Add to `packages/shared-protocol/src/index.ts`
- Bridge handler: `packages/bridge/src/ws/{topic}-handler.ts` (if upstream from module)
- g2-app consumer: `packages/g2-app/src/panels/{topic}-dispatcher.ts` + state machine

**New Utility/Helper:**
- Shared (3+ packages): `packages/shared-protocol/src/utils/` (create new directory)
- g2-app only: `packages/g2-app/src/internal/` (internal utilities stay internal)
- Bridge only: `packages/bridge/src/util/` or appropriate subdirectory
- foundry-module only: `packages/foundry-module/src/util/`

**New Test Fixtures:**
- ASCII snapshots: `packages/shared-render/src/fixtures/`
- Mock Foundry data: `packages/validation-harness/src/foundry-modules/`
- Schema fixtures: `packages/shared-protocol/src/__tests__/fixtures/`

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD-generated architecture + structure maps
- Generated by: `/gsd-map-codebase --focus arch` (this sweep)
- Consumed by: `/gsd-plan-phase` (reads ARCHITECTURE.md + STRUCTURE.md), `/gsd-execute-phase`
- Committed: Yes, checked into git
- Frequency: Re-scanned during architecture changes or phase hand-offs

**`.planning/phases/NN-*/`:**
- Purpose: Phase-level planning (per-phase context, research, day plans, summaries)
- Structure: `NN-CONTEXT.md` (required reading), `NN-RESEARCH.md`, `NN-01-PLAN.md` through `NN-04-PLAN.md`, `NN-SUMMARY.md`
- Committed: Yes, archived after phase completion

**`docs/architecture/`:**
- Purpose: Accepted ADRs (decision log, reference)
- Naming: `NNNN-kebab-title.md` with frontmatter
- Committed: Yes, canonical; updates only on major architecture changes

**`node_modules/` + `packages/*/node_modules/`:**
- Purpose: Dependency trees
- Generated by: `pnpm install`
- Committed: NO (gitignore)
- Size: ~600 MB total (pnpm hoists common deps to root)

**`dist/` directories:**
- Purpose: Build artifacts (Vite bundles, tsup output, compiled JS)
- Generated by: `pnpm build` (per-package build scripts)
- Committed: NO (gitignore)
- Cleanup: `pnpm clean` (if implemented) or manual `rm -rf packages/*/dist`

**`coverage/`:**
- Purpose: Test coverage reports (LCOV, HTML)
- Generated by: `pnpm test:coverage` (Vitest v8 provider)
- Committed: NO (gitignore)
- Viewed: `coverage/index.html` in browser

## Build & Output

**Vite (g2-app):**
- Entry: `packages/g2-app/src/index.ts`
- Output: `packages/g2-app/dist/index.html` + JS chunks
- Served by: Static HTTP host (even-plugin-host HTTPS reverse proxy)
- Size goal: <500 KB gzipped (target: 15 fps on 200 kbps BLE, per Specs.md §11.5.7)

**tsup (bridge + foundry-module):**
- Entry: `packages/bridge/src/index.ts`, `packages/foundry-module/src/module.ts`
- Output: `packages/bridge/dist/index.js`, `packages/foundry-module/dist/module.js`
- Executed by: Node.js (bridge), Foundry VM (module)
- No tree-shaking for module (Foundry requires full ES modules); tree-shaking enabled for bridge

**TypeScript (all packages):**
- Checked by: `pnpm typecheck` (tsc --noEmit, strict + 6 flags)
- No emit (JavaScript generated by Vite/tsup, not tsc)

---

*Structure analysis: 2026-05-24*
