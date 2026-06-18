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

### Even Hub canonical developer docs (INV-2 source of truth)

The Even Hub developer documentation is the canonical upstream for every G2/plugin claim above. Re-verify against these before any bump (INV-2); aggregator/blog/AI-summary sources are **not** authoritative.

- **Overview / execution model** — <https://hub.evenrealities.com/docs/getting-started/overview> — *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."* Canonical source for: phone-WebView execution, the 5-step dev workflow, and the G2 hardware envelope (576×288 4-bit greyscale, 4-mic 16 kHz PCM, touchpad press/double-press/swipe-up/swipe-down, **no camera, no speaker**).
- **Device APIs** — <https://hub.evenrealities.com/docs/guides/device-apis> — verbatim constraint list: *"no arbitrary pixel drawing, no audio output, no text alignment, no font control, no background colors, no per-item list styling, no programmatic scroll position, no animations, no camera (there is none), and images are greyscale only."* Audio capture: `bridge.audioControl(true|false)` → PCM 16 kHz s16le mono via `audioEvent`.
- **Input & events** — <https://hub.evenrealities.com/docs/guides/input-events> — complete gesture set is press / double-press / swipe-up / swipe-down only (`CLICK_EVENT(0)`, `DOUBLE_CLICK_EVENT(3)`, `SCROLL_TOP_EVENT(1)`, `SCROLL_BOTTOM_EVENT(2)`); **no long-press / duration-based input** (see GEST-01 drift in Specs.md changelog 2026-05-31).
- **CLI reference** — <https://hub.evenrealities.com/docs/reference/cli> — commands are `login` / `init` / `qr` / `pack` only; **there is NO non-interactive `publish`/`submit`/`upload` command** (portal submission is manual + review-gated). `evenhub pack app.json dist -o myapp.ehpk` (`-c` runs the online package_id availability check).
- **Packaging & App Submission** — <https://hub.evenrealities.com/docs/reference/packaging> · <https://hub.evenrealities.com/docs/reference/app-submission> — `.ehpk` manifest fields + the manual portal review/approval gate.
- **npm packages**: `@evenrealities/even_hub_sdk` (plugin SDK — we ship hand-typed `packages/g2-app/src/types/even-hub.d.ts` + `hub-polyfill.ts` against it), `@evenrealities/evenhub-simulator` (local preview: `evenhub-simulator http://localhost:5173`), `@evenrealities/evenhub-cli` (init/pack used by the CD).
- **Our runbook**: `docs/release/evenhub.md` operationalizes the above for `packages/g2-app` (build → version-sync → `pack` → artifact; manual portal submit). CD: `.github/workflows/evenhub-pack.yml`.

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
- **Hardware R1**: BLE → smartphone Even App → G2; gesture supportate (doc canonica) = `press / double-press / swipe-up / swipe-down`; **nessun long-press / input duration-based**; nessun input testuale. — *Hardware Even Realities (INV-2 re-verified 2026-05-31).* ⚠️ DRIFT noto: il codice usa ancora `long-press` per l'invocazione Quick-Action (assunzione `[SC-06-01 pending]` ora contraddetta) → fix schedulato GEST-01 (Specs changelog 2026-05-31). La doc canonica vince.
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

> **Condensed decision summary.** The authoritative pinned versions and the "do NOT use" list are below; the per-package "why", alternatives-considered, and INV-2 verification provenance were captured in the (now-removed) GSD `.planning/research/STACK.md` — recoverable from git history if needed. Re-verify any pin against canonical upstream (INV-2) before changing it.
>
> **Drift corrections** (re-verified ✓ 2026-05-11): TypeScript is pinned **5.8.3** (research said 5.8.5 — does not exist on npm); pnpm is pinned **10.33.4** (research said 10.3.1 — does not exist). Authoritative current pins live in repo config (`package.json` `packageManager`, root `devDependencies`, `.changeset/config.json`).

### Key pins by package

- **`g2-app`** (browser bundle, Even Realities App WebView): TypeScript 5.8.3 · Vite 8 · `image-q` 4.0.0 (FS/Atkinson/Bayer dither + custom 16-step greyscale palette) · `upng-js` 2.1.0 (4-bit indexed PNG) · `xxhash-wasm` 1.1.0 (sub-tile delta hash) · OffscreenCanvas + Web Worker · native `WebSocket`/`fetch`. No DOM framework.
- **`bridge`** (Node 24 LTS, homelab Docker): Fastify 5 · `@fastify/websocket` 11 · `ws` 8.20 (originates the bridge→Foundry connection) · `@fastify/cors` 11 · `@fastify/rate-limit` 10 · `zod` 4.4.3 · `pino` 10 · `prom-client` 15 · `qrcode` 1.5 · in-memory `Map`+TTL (Tier 1 storage).
- **`foundry-module`** (`evenfoundryvtt`): Foundry VTT ≥13.347 (verified 14; v12 unsupported — Activity system) · dnd5e ≥5.3.3 (dual PHB 2014/2024 via `core.modernRules`; note 5.3.0 advancement array→object) · `socketlib` (mandatory; NOT on npm — declare in `relationships.requires`) · MidiQOL (optional, capability handshake) · TypeScript 5.8.3 + `tsup` · `fvtt-types` (community, re-verify per INV-2 in Phase 2).
- **`foundry-mcp`** (V2, Phase 11): `@modelcontextprotocol/sdk` 1.29 · transports stdio + **Streamable HTTP** (spec rev 2025-06-18) · `zod` 4.4.3 · Node 24.
- **`shared-protocol`**: TypeScript 5.8.3 + `zod` 4.4.3 (single source of truth — schemas imported by all packages).
- **workspace tooling**: Vitest 4.1.5 + `@vitest/coverage-v8` 4.1.5 (always co-bump) + `happy-dom` 20.9 · Playwright 1.59 (E2E, Phase 4+) · Biome 2.4.15 (lint+format; `biome ci` fails on any warning) · `tsx` 4.21 · `tsup` 8.5 · pnpm 10.33.4 · Changesets 2.31.
- **deploy** (Docker Compose homelab): bridge `node:24-alpine` (EXPOSE 8910) · plugin host static `nginx:alpine` serving `g2-app/dist/` · Caddy/Traefik for TLS (not required on pure-LAN MVP).

### Hard "do NOT use" list (load-bearing decisions — see STACK.md §2/§3 for why)

- **Raster:** no `jimp` (Bayer-565 only), no `pngjs`/`fast-png` (wrong bit depth), no `sharp` in the browser (server-only), no `pako`/`fflate` second compression layer → use `image-q` + `upng-js` (trust upng-js's built-in DEFLATE).
- **Bridge:** no Express (use Fastify 5), no `socket.io` (Foundry has no socket.io layer — use raw `ws`), no Redis in MVP (use `Map`+TTL; Redis is Phase 13 stretch).
- **MCP:** no HTTP+SSE transport (deprecated 2025-03-26) → Streamable HTTP.
- **Tooling:** no ESLint/Prettier (Biome covers both), no Jest (use Vitest), no `ts-node` (use `tsx`), no yarn / npm-workspaces (use pnpm), no TypeScript 6.x yet (stay on 5.8.x).
- **`g2-app`:** no React/Vue/Svelte (no DOM emitted — output is `bridge.createTextContainer` / `updateImageRawData`), no `localStorage`/`sessionStorage` (sandboxed WebView — use Even Hub kv store), no wildcards in the `app.json` whitelist (origin-complete URLs only).
- **Voice:** no EvenAI native LLM (no developer API) → external `foundry-mcp` (V2).
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

## Planning Workflow — Spec Kit

Planning has migrated from GSD to **Spec Kit**. The old GSD `.planning/` directory was removed
on 2026-06-18 (recoverable from git history); the project constitution lives at
`.specify/memory/constitution.md` (v1.0.0) and feature specs live under `specs/`.

Workflow for substantive features:
- `/speckit.specify` — write/refresh the feature spec (`specs/<NNN>-<slug>/spec.md`).
- `/speckit.clarify` — resolve underspecified areas (optional).
- `/speckit.plan` — produce the implementation plan + design artifacts.
- `/speckit.tasks` — generate the dependency-ordered task list.
- `/speckit.implement` — execute the tasks.

The constitution's principles (code quality, test-first, INV-1 layout, performance budgets,
autonomous debug, source-verified research, doc coherence, repo hygiene, reliable CI/CD,
disciplined subagent use) are the binding quality gates — `/speckit.plan` runs a Constitution
Check against them. Trivial fixes may be made directly; keep changes atomic and tested.

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

<!-- SPECKIT START -->
Active feature: **001-foundry-g2-hud** — connection simplification (one direct link),
unified map-view selection (roster "Party" entry; mode dropdown removed), D&D-styled
sheet UI with icons on the canvas compositor, composited FPS badge (`EVF_FPS_CORNER`),
code cleanup, and docs refresh. For technologies, structure, and the implementation
approach, read the current plan: `specs/001-foundry-g2-hud/plan.md`
(spec: `specs/001-foundry-g2-hud/spec.md`; research/data-model/contracts/quickstart alongside).
<!-- SPECKIT END -->
