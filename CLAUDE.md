# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**v0.10.0 — direct Foundry → G2 streaming** ([ADR-0012](docs/architecture/0012-direct-foundry-streaming.md)). The Node bridge, `packages/foundry-mcp`, `deploy/` (Docker Compose) and voice were **removed**. The g2-app is built into `packages/foundry-module/g2/`, Foundry serves it at `/modules/evenfoundryvtt/g2/index.html`, and the Even Realities App loads it by QR sideload. The Foundry module in the GM browser is the **projector**.

**Config (root):**

- `package.json` — pnpm workspace, `packageManager: pnpm@10.33.4`, scripts for lint/typecheck/test/changeset/release
- `pnpm-workspace.yaml` — `packages/*` glob
- `tsconfig.base.json` — strict + 6 flags
- `biome.jsonc` — Biome 2.4.15 config (recommended + strict rules)
- `vitest.config.ts` — Vitest 4 `test.projects` workspace API + v8 coverage 80%
- `.changeset/config.json` — independent per-package semver
- `commitlint.config.js` + `.husky/{pre-commit,commit-msg}` — Conventional Commits enforcement
- `.nvmrc=24`, `.npmrc`, `.gitattributes`, `.editorconfig`, `.gitignore` (`packages/foundry-module/g2/` is build output, never committed)

**Packages:**

- `packages/foundry-module/` — Foundry module `evenfoundryvtt`: dnd5e readers, write path (`dispatchTool`, ADR-0011), `src/direct/` projector + pairing (menu `pairG2` "Pair G2 glasses"), ships `g2/`
- `packages/g2-app/` — glasses app (Vite 8, Even Hub SDK 0.0.15): `src/direct/` (credentials, `/join` + socket.io client, sealed session), `src/hud/` (D&D-sheet layout, zone renderers + sender, input state machine), `src/phone/` (phone page P02/P03)
- `packages/shared-protocol/` — Zod schemas + `direct/` envelope (WebCrypto AES-GCM), messages, pairing payload, map snapshot
- `packages/shared-render/` — ASCII grid + INV-1 matchers, `src/pixel/` 4-bit pixel renderer + bitmap fonts + D&D icons, per-zone golden fixtures `sheet.*.txt`
- `packages/validation-harness/` — GO/NO-GO hardware scripts (defer-hardware pattern), `inv:all`, `validate:direct-sideload`

**Architecture:** `docs/architecture/` — ADR-0001…0012 (0012 = direct streaming, supersedes the bridge topology) + `INVARIANTS.md`; design contract `docs/design/g2-sheet-ux.html` («Scheda da tavolo G2», screens S1–S12; screenshots `docs/design/img/`); `docs/design/g2-thirds-layout.md` is superseded history (its pairing mocks P01–P03 still apply).

**Documentation:**

- `Specs.md` (**canonical source of truth**, v0.10.0) — requirements, hardware constraints, APIs, data models, UI/UX mockups, roadmap, risk register
- `README.md` — projection of `Specs.md` for GitHub readers; must stay coherent (see INV-3)
- `docs/showcase/index.html` — animated single-file showcase (GitHub Pages); `docs/index.html` redirects to it
- `docs/setup-guide.md` · `docs/runbook.md` · `docs/firmware-compatibility.md` · `docs/release/{foundry-module,evenhub}.md`
- `LICENSE` (MIT)

**CI:** `.github/workflows/ci.yml` — D-1.10 gates 1–7 + Gate 8 (`activity.use(` only under `foundry-module/src/write-path`) + Gate 9 (no socketlib outside `foundry-module`) + Gate 10 (g2-app builds into `foundry-module/g2/index.html`). Release: `foundry-module-release.yml` (tag → module zip incl. `g2/`), `evenhub-pack.yml` (secondary `.ehpk`), `release.yml` (Changesets).

### Build/Test/Lint Commands

```bash
pnpm install                  # install workspace deps
pnpm typecheck                # tsc --noEmit -p tsconfig.base.json && pnpm -r exec tsc --noEmit
pnpm lint                     # biome check .
pnpm lint:ci                  # biome ci . (read-only, CI-style)
pnpm format                   # biome check --write .
pnpm test                     # vitest --run (workspace-wide)
pnpm test:watch               # vitest (watch)
pnpm test:coverage            # vitest --run --coverage
pnpm changeset                # add a changeset for the current PR
pnpm changeset:status         # check changeset declared since origin/main

# Per-package (filter via pnpm)
pnpm --filter @evf/g2-app build                  # vite → packages/foundry-module/g2/
pnpm --filter @evf/foundry-module build:all      # g2-app build, then tsup → dist/module.js
pnpm --filter @evf/validation-harness inv:all    # invariant suite
FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload:skip-hardware   # ADR-0012 software GO/NO-GO
pnpm --filter @evf/validation-harness validate:all:skip-hardware    # Phase 0 software-only smoke
```

### Self-test (clean clone)

```bash
pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status
# All exit 0 = healthy
```

## Project Invariants (NON-NEGOTIABLE)

`Specs.md` §0.1 ratifies four invariants that govern every change to this repo. Read them before doing anything. Short version:

- **INV-1 Layout integrity** — every ASCII mockup and (future) runtime layout must align character-perfect across all states / contents / locales. Verifiable via §7.1a (8 sub-rules) and §7.14.4 ck 11–15. Frame corners, dividers, columns: same column from top to bottom, always. Variable content (HP=`7` vs `700`, name length, conditions overflow, IT vs EN i18n) gets width-budgeted at build time, never best-effort.
- **INV-2 Online cross-validation** — every technical claim cites a canonical upstream source. Sources allowed: `hub.evenrealities.com/docs/*`, `evenrealities.com/{ai-glasses,smart-glasses,translation-glasses,smart-ring}`, `support.evenrealities.com/specs`, `foundryvtt.com/api/*`, `github.com/foundryvtt/dnd5e`, `modelcontextprotocol.io/specification/*`, `github.com/farling42/foundryvtt-socketlib`, `gitlab.com/tposney/midi-qol`, vendor pricing pages (Deepgram, AssemblyAI). **Aggregator/blog/AI-summary sources are not authoritative.** Re-verify before each bump. Drift is classified CRITICAL / IMPORTANT / NICE-TO-HAVE and logged. Pattern: ≥4 parallel WebFetch on independent domains.
- **INV-3 Documentation coherence** — `Specs.md` + `README.md` + `docs/showcase/index.html` update **in the same commit** for any cross-cutting change (version, fps target, phase count, hardware spec, library version, locale set, ADR list). No half-updated states. Cross-reference integrity is a hard gate.
- **INV-4 Code quality** (binds Phase 1+ when code lands) — clean, optimized, documented, **zero dead/unreachable code** tolerated. Biome + TypeScript strict + Vitest coverage gate enforce in CI. `// TODO` requires `(#issue)` or `(ADR-NNNN)`. JSDoc/TSDoc on every public API. Hot-path benchmarks gate regressions.

## Engineering Constitution (ALWAYS APPLY)

Standing principles that bind every change — code, docs, CI, and agent workflow. They extend INV-1..4 (never override them); on conflict the invariants and `Specs.md` win. A change that violates a principle is not "done", even if tests pass.

### P1 · 💎 Code quality

- Readable, intention-revealing code that matches the surrounding idiom (naming, comment density, module layout). Small single-purpose functions; pure logic separated from I/O (Foundry hooks, WS, Even Hub bridge calls).
- TypeScript strict, no `any` / non-null `!` without a justifying comment; Zod schemas in `shared-protocol` are the single source of truth for wire shapes — never redefine a type locally.
- Zero dead code, unused exports, commented-out blocks, or orphan files (INV-4). `// TODO` only with `(#issue)` or `(ADR-NNNN)`.
- TSDoc on every public API: purpose, params, return, thrown errors, and the `Specs.md §` it implements.
- Errors are never swallowed: every `catch` either recovers explicitly, degrades with a documented fallback (e.g. raster → glyph), or rethrows with context. Log via the g2-app debug channel (`src/debug/`) or `[EVF]`-prefixed `console.warn/error` in the Foundry module, never bare `console.log` in shipped code.

### P2 · 🧪 Testing standards

- Every behavior change ships with tests in the same commit; every bug fix ships with a regression test that fails before the fix.
- Test pyramid: unit (pure logic, reducers, formatters) → integration (g2-app session ↔ projector via sealed-envelope round-trips on a fake socket) → snapshot (INV-1 ASCII layouts, all states × IT/EN × min/max content widths) → E2E/simulator where hardware-like behavior matters.
- Coverage gate ≥ 80% (vitest v8) is a floor, not a target: cover edge cases (empty/overflow/unicode/locale, disconnect/reconnect, stale tokens), not lines.
- Tests are deterministic: no real timers, network, or randomness without fakes/seeds. Flaky tests are bugs — fix or quarantine with an issue link, never retry-until-green.
- Hardware-only checks follow the defer pattern: written as GO/NO-GO harness scripts in `validation-harness`, runnable with `--skip-hardware`, never blocking software CI.

### P3 · 👓 User experience consistency

- Core Value first: if a design forces the player to look at phone or laptop, it is wrong.
- One visual language on G2: phosphor-green CRT/VFD style, same frame glyphs, dividers, column grid, and status-HUD placement across every panel (INV-1). Reuse `shared-render` primitives — never hand-roll a frame.
- One input grammar on R1: only canonical gestures (`press / double-press / swipe-up / swipe-down`); the same gesture means the same thing on every panel. No duration-based input.
- All user-facing strings go through i18n (IT + EN, EN canonical fallback), width-budgeted at build time. Feedback is always visual (toast / HUD) — G2 has no speaker.
- Foundry module UI, setup guide, and showcase use the same terminology as the glasses UI (one glossary, no synonyms).

### P4 · ⚡ Performance requirements

- Budgets are contracts: 5 fps committed / 15 fps stretch (§7.4b.6.1), BLE ≥ 200 kbps sustained, raster pipeline off the main thread (Worker + OffscreenCanvas).
- Hot paths (raster pipeline, delta hashing, render diff, WS fan-out) have benchmarks under `docs/perf/` and regressions > 10% fail review. Measure before optimizing; state the number in the commit/PR.
- Prefer delta over full updates, cache static layers, avoid allocations in per-frame loops, debounce Foundry hook storms. Bundle size of `g2-app` is tracked; no heavy deps without justification (see §Technology Stack "What NOT to Use").

### P5 · 🐞 Auto-debug & validation system

- Every feature must be observable and drivable without glasses: record structured events in the g2-app debug channel, add a `?demo=` scenario for every new HUD state, and keep the Even Hub simulator loop (`sim:check`: screenshots + input + console via the automation API) green.
- Debug surfaces are dev-only and fail closed (404 when off, secret-gated) — never reachable in production builds.
- Validate before claiming done: `pnpm lint:ci && pnpm typecheck && pnpm test:coverage`, plus `inv:all` for invariant-touching changes and the Even Hub simulator for display/input changes. Report real output; never claim "works" without evidence.
- Debug autonomously first (reproduce → isolate via debug endpoints/logs → fix → regression test); ask the user only for hardware-gated steps.

### P6 · 🔬 Research & document SDKs and libraries

- Before using or upgrading an SDK/library API (Even Hub SDK, Foundry, dnd5e, socketlib, MidiQOL, MCP SDK, Fastify, …), verify it against the canonical upstream source (INV-2) and the `everything-evenhub:*` skills — never from memory or blogs.
- Record what you learned where the next person will find it: the relevant ADR, `Specs.md §`, or a TSDoc `@see` link to the upstream doc/version. Hand-typed SDK declarations (e.g. `even-hub.d.ts`) cite their source URL and verification date.
- Version pins are checked with live `npm view`; drift is logged (CRITICAL / IMPORTANT / NICE-TO-HAVE) per INV-2.

### P7 · 📚 Technical & user documentation

- Docs are part of the change, not a follow-up: code + tests + docs land in the same commit/PR (INV-3 for cross-cutting changes: `Specs.md` + `README.md` + showcase together).
- Technical docs (`docs/architecture/` ADRs, `Specs.md`, `docs/runbook.md`) explain *why*; user docs (`README.md`, `docs/setup-guide.md`, `docs/wiki/`) explain *how*, with copy-pasteable commands that were actually run.
- New architectural decisions get an ADR; stale docs are fixed or deleted when noticed — outdated docs are bugs.

### P8 · 🧹 Repository hygiene & cleanup

- Leave the repo cleaner than you found it: remove unused files, scripts, deps, fixtures, stale branches/worktrees, and generated artifacts that slipped in.
- No secrets, local paths, `.env`, build output, or scratch files committed; temp work goes to the scratchpad, not the repo.
- Completed planning artifacts are archived (`/gsd-cleanup`), not left to rot at the top level. Every file in the repo has an owner and a reason to exist.

### P9 · 🚀 CI/CD

- CI is the enforcement of this constitution: every principle that can be checked mechanically gets a gate (lint, typecheck, coverage, TODO discipline, snapshot drift, changeset, ADR-0011 guard, …). Never bypass with `--no-verify`, skipped jobs, or lowered thresholds.
- Keep pipelines fast, deterministic and useful: pinned actions and tool versions, cached pnpm store, clear job names, actionable failure messages. Remove gates that no longer protect anything; add one when a bug class escapes.
- Release flow stays GitFlow + Changesets (`develop` → `main`, Version Packages PR, release workflows). Workflows are tested on a branch before merge; a red `develop` is fixed before new feature work.

### P10 · 🤖 Subagent usage

- Delegate to subagents for independent, parallelizable work (multi-file exploration, parallel INV-2 WebFetch rounds, focused reviews: code, silent-failure, types, tests) — launch independent agents in a single message.
- Do small, known-location work directly; don't spawn agents for a single lookup or a one-file edit, and never delegate the same search twice.
- Give each agent a self-contained brief (goal, files, constraints, expected output format) and verify its result before acting on it — subagent output is input, not truth. Use GSD agents inside GSD workflows; keep workflows proportionate to the task.

### P11 · 🏷️ Consistent chapter icons

Every `##` heading in `README.md`, `docs/**/*.md`, wiki pages and the showcase uses one leading emoji from this canonical map — same concept, same icon, everywhere. Extend the map here before introducing a new icon; never use two icons for one concept.

| Concept | Icon | Concept | Icon |
|---|---|---|---|
| Overview / What is it | 🎲 | Hardware (G2 / R1) | 🥽 |
| Quick summary / In one sentence | 💡 | Stack / Dependencies | 🧰 |
| Installation / Setup | 📦 | Research / SDK notes | 🔬 |
| Configuration | ⚙️ | Documentation / Guides | 📚 |
| Usage / Gestures | 🕹️ | Testing | 🧪 |
| UX / UI design | 👓 | Debug / Troubleshooting | 🐞 |
| Architecture | 🏗️ | Performance | ⚡ |
| Highlights / Features | ✨ | Security / Auth | 🔐 |
| Code quality | 💎 | CI/CD / Release | 🚀 |
| Invariants / Principles | 🛡️ | Contributing / Cleanup | 🧹 |
| Status / Progress | 📊 | Agents / Automation | 🤖 |
| Roadmap / Milestones | 🗺️ | Voice / MCP (V2) | 🎙️ |
| Changelog | 📝 | Inspiration | 🎨 |
| Icons / Conventions | 🏷️ | License | ⚖️ |
| Author / Credits | 👤 | | |

## Pre-bump checklist (manual until CI lands)

Before bumping `Specs.md` version (e.g., v0.9.10 → v0.9.11):

1. README badge version = Specs.md header version = showcase hero stat version = boot splash mockup version (§7.12)
2. README hardware bullets = §3 hardware spec (display, mics/speaker, R1, networking, Foundry)
3. README phase table = §10 phase list (count + weeks)
4. Showcase stats reflect §3 + §10 + changelog round count
5. `grep -nE '§[0-9]+\.[0-9]+' Specs.md` → every reference exists as a heading
6. New cross-check round: ≥4 parallel WebFetch against canonical upstream, drift logged in changelog with `Re-verified ✓` or `Drift: …` lines

## Architecture mental model

EvenFoundryVTT projects a Foundry VTT D&D 5e session onto Even Realities G2 AR glasses, driven by R1 ring gestures. Since v0.10.0 there is **no server of our own** ([ADR-0012](docs/architecture/0012-direct-foundry-streaming.md)):

```
[ G2 glasses ] ⇄ BLE ⇄ [ Even App WebView — page served by Foundry: /modules/evenfoundryvtt/g2/ ]
                                   │ same-origin HTTPS: POST /join (cookie) + socket.io
                                   ▼
                           [ Foundry server ] ── relays module.evenfoundryvtt (AES-GCM sealed)
                                   │
                                   ▼
             [ GM browser — evenfoundryvtt module = PROJECTOR ]
               dnd5e readers · dispatchTool write path (ADR-0011) · pairing registry
```

Crucial constraints baked into the spec (do not re-litigate without upstream evidence):

- **Plugins run on the paired phone WebView, not on G2 firmware.** G2 is a thin client: display + 4-mic + IMU + touchpads. See §3.7.
- **Same-origin sideload is load-bearing**: Even Hub whitelists are fixed per build (no wildcards) and do not bypass CORS; Foundry v14 accepts the socket session only from the first-party `session` cookie. Hence the page is served by Foundry and QR-sideloaded, and Foundry must be on **valid HTTPS** reachable from the phone.
- **Identity**: one Foundry user `"<Player> (G2)"` per paired player (role Player, owner of one actor). Pairing via settings menu `pairG2` → QR (5 min, single use; password + key rotate on first `hello`) + 16-char manual code.
- **Privacy**: every relay payload is a sealed envelope (AES-256-GCM, AAD `from>to`). Device keys live **only** in the pairing GM browser (client-scope setting); only `game.users.activeGM` answers.
- **G2 has no speaker / no audio output / no camera**. All feedback is visual (toast, HUD). Voice/MCP removed in v0.10.0; may return as a client of the direct channel via a new ADR. Native EvenAI has no developer API (§3.6).
- **Sheet layout** (Specs §7.0): portrait 144² · header 288×144 (AC, HP, turn, action economy) · square map 144² (≤ 1 fps) on top; sheet 288×144 (Abilities · Saves & Skills, death saves at 0 HP) · context panel 288×144 (firmware text, the only zone that takes input) below. 4/4 images drawn by our pixel renderer (firmware font lacks D&D glyphs), one at a time ≥ 100 ms apart; 4/8 text. See `docs/design/g2-sheet-ux.html`.
- **Input**: press / double-press / swipe up/down; long-press is an **extra** (SDK ≥ 0.0.14, Even App ≥ 2.2.9) opening the `menuObject` shortcuts, never the only path. Double-tap at root exits (`shutDownPageContainer(1)`).
- **Locale follows Foundry** (`game.i18n.lang`) with device-local override (phone page or glasses menu). See §7.16.
- **Hardware assumptions are gated** by GO/NO-GO harness scripts (defer-hardware pattern), incl. `validate:direct-sideload`. See §10.0.

## Working in this repo

- The user's primary language is **Italian**; the spec is mostly Italian with English code/identifiers. Reply in Italian unless they ask otherwise. UI strings target IT (MVP) + EN (canonical fallback) per §7.16.5.
- When asked to make a spec change, **think atomic**: the same prompt usually requires updates to `Specs.md` § + changelog + README (badge + relevant section) + showcase (version + relevant section). Never leave a half-updated state.
- New invariants, ADR placeholders, or open-question resolutions go through the changelog with rationale. Past patterns to study: changelog entries v0.9.6–v0.9.10 (all from 2026-05-10).
- Don't re-litigate constraints already verified upstream. If you suspect a claim has drifted, run a fresh WebFetch round (INV-2) against canonical sources and log the result — don't quietly "correct" without evidence.
- ASCII mockups in `Specs.md` are **load-bearing**: they're the contract for INV-1 snapshot tests. Edit them with character-precision; never let alignment slip when adding a row.
- The user may ask you to invoke `/ultrareview` — that is user-triggered/billed and you cannot launch it yourself.

## Roadmap snapshot

v0.9.11 → v0.9.13 (bridge-based MVP, quick wins, sheet data) are archived under `.planning/milestones/`. **v0.10.0** (current): direct Foundry → G2 streaming, D&D-sheet HUD, one-scan pairing (ADR-0012). Next: hardware UAT on G2 + R1 (sideload, cookie persistence, BLE map pacing) and, if wanted, voice/MCP as a client of the direct channel (new ADR required).

<!-- GSD:project-start source:PROJECT.md -->
## Project

**EvenFoundryVTT (EVF)**

Un plugin che proietta una sessione di **D&D 5e** ospitata su **FoundryVTT** direttamente sugli occhiali AR **Even Realities G2** (576×288, 4-bit greyscale phosphor green), guidato da gesture dell'anello **Even R1**. Il giocatore non distoglie mai lo sguardo dal tavolo fisico — scheda PG, combat tracker, mappa rasterizzata, log e spellbook appaiono come HUD glanceable in stile Alien Nostromo / VFD / CRT verde, mentre miniature, mappe di carta e DM umano restano al centro dell'esperienza. Il sistema è **deterministico nel core MVP** (ogni azione è gesture esplicita); voice/AI è una stretch V2 opzionale via MCP server, mai dipendenza.

**Core Value:** **Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.** Tutto il resto (fps, raster vs glyph, voice V2, multi-player) è subordinato a questo principio: se una decisione di design forza il giocatore a guardare il telefono o un laptop, è sbagliata.

### Constraints

- **Hardware G2**: 576×288 4-bit greyscale, 4 image + 8 text/list container per pagina, 1 container con `isEventCapture: 1`, image max 288×144 px, ≥ 100 ms tra update immagine, no speaker, no camera. — *Vincolo Even Realities, non negoziabile.*
- **Hardware R1**: BLE → smartphone Even App → G2; gesture canoniche = `press / double-press / swipe-up / swipe-down`; **long-press solo come extra** (SDK ≥ 0.0.14, Even App ≥ 2.2.9: apre il menu contestuale `menuObject`, mai unico accesso a una funzione); nessun input testuale. — *hub.evenrealities.com/docs/reference/changelog + /build/input (re-verified 2026-09-23). Il drift GEST-01 è chiuso dalla v0.10.0.*
- **Plugin execution model**: il g2-app è servito da **Foundry stesso** (`/modules/evenfoundryvtt/g2/index.html`) e caricato dall'Even Realities App via QR sideload nel WebView del telefono. Il G2 firmware NON esegue il nostro codice. — *ADR-0012; hub.evenrealities.com/docs/get-started/architecture.*
- **Network**: Foundry su HTTPS **valido** raggiungibile dal telefono (no self-signed); tutto il traffico è same-origin (`/join` + socket.io), quindi nessuna whitelist/CORS per il sideload. Il `.ehpk` (secondario) resta vincolato alla whitelist `app.json` (origin completo, no wildcards). — *Vincolo Even Hub + ADR-0012.*
- **BLE bandwidth**: target ≥200 kbps sustained; <100 kbps blocca raster MVP (degrade a glyph-only). — *Phase 0 §10.0.3.*
- **D&D edition**: dual-support PHB 2014 + PHB 2024 via `core.modernRules`. Setting MVP. — *§11.5.1.*
- **License**: MIT su tutti i package del monorepo. — *§11.5.2.*
- **Deployment**: solo il modulo Foundry (zip GitHub Release con `g2/`); niente bridge, niente Docker Compose (rimossi in v0.10.0). Serve un browser GM online (projector). — *ADR-0012 (supersede §11.5.3).*
- **Auth**: utente Foundry dedicato `"<Giocatore> (G2)"` + chiave AES-256 per dispositivo; QR monouso 5 min (password + chiave ruotano al primo `hello`) o codice manuale di 16 caratteri; revoca dalla finestra «Associa occhiali G2». — *ADR-0012 (supersede §11.5.4 bearer 24h).*
- **Tooling fissato**: TypeScript strict + Biome lint/format + Vitest coverage gate; CI fail su `// TODO` senza issue-link. — *INV-4 §0.1.*
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

> **v0.10.0 (2026-09-23)** — rewritten after [ADR-0012](docs/architecture/0012-direct-foundry-streaming.md). The original research snapshot (`.planning/research/STACK.md`, 2026-05-10) described a Node bridge + Docker + `foundry-mcp`; those rows are collapsed into *Removed in v0.10.0* below. Authoritative pins live in the `package.json` files (exact versions, re-check with `npm view` per INV-2).

### Current stack (by package)

| Package | Runtime deps (pinned) | Notes |
|---|---|---|
| `g2-app` | `@evenrealities/even_hub_sdk` 0.0.15 · `@evenrealities/pretext` 0.1.4 · `socket.io-client` 4.8.3 · `upng-js` 2.1.0 · `xxhash-wasm` 1.1.0 · `image-q` 4.0.0 · `zod` 4.4.3 · Vite 8.0.11 (dev) | Built into `packages/foundry-module/g2/`, relative `base`, no CDN assets. `app.json` `min_sdk_version` 0.0.14. |
| `foundry-module` | `qrcode` 1.5.4 · `@evf/shared-protocol` · `tsup` 8.5.1 (dev) | Foundry ≥ 13.347 (v14 verified), dnd5e ≥ 5.3.3, midi-qol optional (`recommends`). socketlib **not used**. |
| `shared-protocol` | `zod` 4.4.3 · WebCrypto (AES-256-GCM, HKDF-SHA256) | Zod = single source of truth for wire shapes; `direct/` envelope/messages/pairing/map. |
| `shared-render` | — | ASCII grid + `matchAsciiFixture` (INV-1). |
| `validation-harness` | `zod` 4.4.3 · `upng-js` 2.1.0 · `csv-stringify` 6.5.2 · `tsx` | GO/NO-GO scripts, `inv:all`, `validate:direct-sideload`. |
| Workspace tooling | TypeScript 5.8.3 · pnpm 10.33.4 · Node 24 LTS (`.nvmrc`) · Vitest 4.1.5 + `@vitest/coverage-v8` 4.1.5 · happy-dom 20.9.0 · Biome 2.4.15 · Changesets 2.31.0 · Playwright 1.59.1 · commitlint + husky | Stay on TS 5.8.x until the ecosystem (Vitest, Biome) catches up with 6.x. |

### Removed in v0.10.0 (ADR-0012)

`packages/bridge` (Fastify 5, `@fastify/{websocket,cors,rate-limit}`, `ws`, `pino`, `prom-client`, in-memory token/cache, `sharp` portrait renderer), `packages/foundry-mcp` (`@modelcontextprotocol/sdk`, stdio/Streamable HTTP), `deploy/` (Docker Compose, `node:24-alpine` images, GHCR `evf-bridge`), Deepgram voice proxy and g2-app audio capture, socketlib `executeAsGM`, standalone `g2-app-dist.zip`. Do not reintroduce any of them without a new ADR.

### What NOT to use

| Avoid | Why | Use instead |
|---|---|---|
| A server/bridge between Foundry and the phone | ADR-0012: zero-infrastructure goal; cross-origin fails (whitelist per build, no CORS bypass, v14 cookie-only session) | Same-origin page served by Foundry + `module.evenfoundryvtt` relay |
| Plaintext payloads on `module.evenfoundryvtt` | The relay broadcasts to every client | Sealed envelopes (`@evf/shared-protocol` `direct/envelope.ts`) |
| socketlib / `activity.use()` outside `foundry-module/src/write-path` | ADR-0011 single-workflow-origin; CI Gates 8/9 | `dispatchTool` in the GM-client projector |
| `jimp`, `pngjs`, `fast-png`, `pako`/`fflate` for the map | Wrong dither / bit depth / double compression (§11.5.7) | `upng-js` 4-bit + `xxhash-wasm` tile hashes (SDK LZ4 in transit) |
| React / Vue / Svelte in `g2-app` | Glasses output is SDK container calls; phone page is plain DOM | Plain TS modules + app store |
| ESLint + Prettier, Jest, `ts-node` | Dual tooling / ESM pain / deprecated | Biome, Vitest, `tsx` |
| EvenAI native LLM | No developer API (§3.6) | — (voice/MCP only via a future ADR) |
| Wildcards in `app.json` whitelist | Even Hub forbids them | Origin-complete URL (only relevant for the secondary `.ehpk`) |

### Version compatibility

| A | Compatible with | Notes |
|---|---|---|
| `@evenrealities/even_hub_sdk` 0.0.15 | Even Realities App ≥ 2.2.9 (long-press/menu); npm metadata `minAppVersion` 2.2.10 | See `docs/firmware-compatibility.md`. |
| `evenfoundryvtt` module | Foundry ≥ 13.347 (v14 verified) · dnd5e ≥ 5.3.3 | v12 not supported (Activity system). |
| `socket.io-client` 4.8.x | Foundry socket.io server (EIO 4) | Undocumented `/join` + handshake → guarded by `validate:direct-sideload`. |
| Vitest 4.1.5 + `@vitest/coverage-v8` 4.1.5 | match major+minor | Always co-bump. |
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
