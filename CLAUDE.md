# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**v0.12.0 — direct Foundry → G2 streaming, ported onto `develop`** ([ADR-0016](docs/architecture/0016-direct-foundry-streaming.md) · [ADR-0017](docs/architecture/0017-player-owned-glasses-hybrid-projector.md) · [ADR-0018](docs/architecture/0018-dnd-sheet-hud-pixel-renderer.md)). The bridge-era line v0.9.14 → v0.11.0 (releases up to `v0.1.55`) is kept in git history and in the `Specs.md` changelog; its Node bridge, `packages/foundry-mcp`, `deploy/` (Docker Compose), bearer pairing, canvas/player-view map capture, raster HUD substrates and voice were **removed**. The g2-app is built into `packages/foundry-module/g2/`, Foundry serves it at `/modules/evenfoundryvtt/g2/index.html`, and the Even Realities App loads it by QR sideload. The **projector** is the player's own Foundry client when online, else an active GM holding the device key (hybrid, ADR-0017).

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

- `packages/foundry-module/` — Foundry module `evenfoundryvtt`: dnd5e readers, write path (`dispatchTool`, ADR-0011; `Activity#use(usage, dialog, message)` with `configure:false` in the **dialog** arg; `skill-check` handler), `src/direct/` projector + election + self-service pairing (menus "Pair G2 glasses" / "Pair my glasses"), ships `g2/`
- `packages/g2-app/` — glasses app (Vite 8, Even Hub SDK 0.0.15): `src/direct/` (credentials, `/join` + socket.io client, sealed session), `src/hud/` (D&D-sheet layout on the 2×2 288×144 tile grid, zone renderers + tile sender, input state machine), `src/map-art/` (pixelated original scene art), `src/phone/` (phone page P02/P03)
- `packages/shared-protocol/` — Zod schemas + `direct/` envelope (WebCrypto AES-GCM), messages, pairing payload, map snapshot
- `packages/shared-render/` — ASCII grid (browser-safe `./ascii-grid` subpath) + INV-1 matchers, `src/pixel/` 4-bit pixel renderer + bitmap fonts + D&D icons, per-zone golden fixtures `sheet.*.txt`
- `packages/validation-harness/` — GO/NO-GO hardware scripts (defer-hardware pattern), `inv:all`, `validate:direct-sideload`

**Architecture:** `docs/architecture/` — ADR-0001…0018 (index with statuses in `docs/architecture/README.md`; 0007 reserved). Current: 0011 write path · **0012 R1 gesture model (canonical, remote)** · 0016 direct streaming · 0017 player-owned glasses · 0018 D&D-sheet HUD. Superseded: bridge-era 0013 (raster HUD → 0018), 0014 (bearer authz → 0017), 0015 (player-view capture → 0016), 0009/0010 (→ 0018). Plus `INVARIANTS.md` (INV-1…6); design contract `docs/design/g2-sheet-ux.html` («Scheda da tavolo G2», screens S1–S12; screenshots `docs/design/img/`); `docs/design/g2-thirds-layout.md` is superseded history (its pairing mocks P01–P03 still apply).

**Documentation:**

- `Specs.md` (**canonical source of truth**, v0.12.0; superseded bridge-era sections carry `SUPERSEDED in v0.12.0` banners) — requirements, hardware constraints, APIs, data models, UI/UX mockups, roadmap, risk register
- `README.md` — projection of `Specs.md` for GitHub readers; must stay coherent (see INV-3)
- `docs/showcase/index.html` — animated single-file showcase (GitHub Pages); `docs/index.html` redirects to it
- `docs/wiki/` — project wiki (Italian, 25 pages), mirrored to the GitHub wiki by `wiki-sync.yml`; check with `node scripts/check-wiki-links.mjs docs/wiki`
- `specs/NNN-*/` — Spec Kit features (`003-direct-streaming` = this port; `002` superseded) · `.specify/memory/constitution.md`
- `docs/setup-guide.md` · `docs/runbook.md` · `docs/firmware-compatibility.md` · `docs/release/{foundry-module,evenhub}.md`
- `LICENSE` (MIT)

**CI:** `.github/workflows/ci.yml` — D-1.10 gates 1–7 + Gate 8 (`activity.use(` only under `foundry-module/src/write-path`) + Gate 9 (no socketlib outside `foundry-module`) + Gate 10 (g2-app builds into `foundry-module/g2/index.html`). Release: `release.yml` (Changesets; `scripts/release-tag.mjs` tags `vX.Y.Z` and dispatches) → `foundry-module-release.yml` (module zip incl. `g2/`, version-stamped esmodule filename, `.ehpk` attached), `evenhub-pack.yml` (`.ehpk` validation), `wiki-sync.yml`. Last bridge-era release `v0.1.55`; next `v0.2.0`.

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
FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload:skip-hardware   # ADR-0016 software GO/NO-GO
pnpm --filter @evf/validation-harness validate:all:skip-hardware    # Phase 0 software-only smoke
```

### Self-test (clean clone)

```bash
pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status
# All exit 0 = healthy
```

## Constitution (READ FIRST, EVERY CHANGE)

**Before any substantive change, read and adhere to the project constitution: `.specify/memory/constitution.md`.** Its principles are BINDING quality gates, not suggestions: I. Code Quality & Zero Dead Code · II. Test-First & Coverage Discipline (≥80%; new behavior MUST be tested, bug fixes MUST add a regression test) · III. Layout & UX Consistency (INV-1) · IV. Performance Budgets · V. Autonomous Debug & Validation · VI. Source-Verified SDK/Library Research (INV-2) · VII. Documentation Coherence (INV-3) · plus VIII repo hygiene · IX reliable CI/CD · X disciplined subagent use · XI consistent chapter icons (v1.1.0). When in doubt, the constitution wins; it operationalizes the four invariants below.

## Project Invariants (NON-NEGOTIABLE)

`Specs.md` §0.1 ratifies four invariants that govern every change to this repo. Read them before doing anything. Short version:

- **INV-1 Layout integrity** — every ASCII mockup and (future) runtime layout must align character-perfect across all states / contents / locales. Verifiable via §7.1a (8 sub-rules) and §7.14.4 ck 11–15. Frame corners, dividers, columns: same column from top to bottom, always. Variable content (HP=`7` vs `700`, name length, conditions overflow, IT vs EN i18n) gets width-budgeted at build time, never best-effort.
- **INV-2 Online cross-validation** — every technical claim cites a canonical upstream source. Sources allowed: `hub.evenrealities.com/docs/*`, `evenrealities.com/{ai-glasses,smart-glasses,translation-glasses,smart-ring}`, `support.evenrealities.com/specs`, `foundryvtt.com/api/*`, `github.com/foundryvtt/dnd5e`, `modelcontextprotocol.io/specification/*`, `github.com/farling42/foundryvtt-socketlib`, `gitlab.com/tposney/midi-qol`, vendor pricing pages (Deepgram, AssemblyAI). **Aggregator/blog/AI-summary sources are not authoritative.** Re-verify before each bump. Drift is classified CRITICAL / IMPORTANT / NICE-TO-HAVE and logged. Pattern: ≥4 parallel WebFetch on independent domains.
- **INV-3 Documentation coherence** — `Specs.md` + `README.md` + `docs/showcase/index.html` update **in the same commit** for any cross-cutting change (version, fps target, phase count, hardware spec, library version, locale set, ADR list). No half-updated states. Cross-reference integrity is a hard gate.
- **INV-4 Code quality** (binds Phase 1+ when code lands) — clean, optimized, documented, **zero dead/unreachable code** tolerated. Biome + TypeScript strict + Vitest coverage gate enforce in CI. `// TODO` requires `(#issue)` or `(ADR-NNNN)`. JSDoc/TSDoc on every public API. Hot-path benchmarks gate regressions.

## Engineering Constitution (ALWAYS APPLY)

Standing principles that bind every change — code, docs, CI, and agent workflow. They are the working form of the constitution in `.specify/memory/constitution.md` (P1≈I · P2≈II · P3≈III · P4≈IV · P5≈V · P6≈VI · P7≈VII · P8≈VIII · P9≈IX · P10≈X · P11=XI); both must say the same thing. They extend INV-1..4 (never override them); on conflict the invariants and `Specs.md` win. A change that violates a principle is not "done", even if tests pass.

### P1 · 💎 Code quality

- Readable, intention-revealing code that matches the surrounding idiom (naming, comment density, module layout). Small single-purpose functions; pure logic separated from I/O (Foundry hooks, WS, Even Hub bridge calls).
- TypeScript strict, no `any` / non-null `!` without a justifying comment; Zod schemas in `shared-protocol` are the single source of truth for wire shapes — never redefine a type locally.
- Zero dead code, unused exports, commented-out blocks, or orphan files (INV-4). `// TODO` only with `(#issue)` or `(ADR-NNNN)`.
- TSDoc on every public API: purpose, params, return, thrown errors, and the `Specs.md §` it implements.
- Errors are never swallowed: every `catch` either recovers explicitly, degrades with a documented fallback (e.g. original-art map → schematic map), or rethrows with context (log `String(err)`: the WebView console serialises `Error` as `{}`). Log via the g2-app debug channel (`src/debug/`) or `[EVF]`-prefixed `console.warn/error` in the Foundry module, never bare `console.log` in shipped code.

### P2 · 🧪 Testing standards

- Every behavior change ships with tests in the same commit; every bug fix ships with a regression test that fails before the fix.
- Test pyramid: unit (pure logic, reducers, formatters) → integration (g2-app session ↔ projector via sealed-envelope round-trips on a fake socket) → snapshot (INV-1 ASCII layouts, all states × IT/EN × min/max content widths) → E2E/simulator where hardware-like behavior matters.
- Coverage gate ≥ 80% (vitest v8) is a floor, not a target: cover edge cases (empty/overflow/unicode/locale, disconnect/reconnect, stale tokens), not lines.
- Tests are deterministic: no real timers, network, or randomness without fakes/seeds. Flaky tests are bugs — fix or quarantine with an issue link, never retry-until-green.
- Hardware-only checks follow the defer pattern: written as GO/NO-GO harness scripts in `validation-harness`, runnable with `--skip-hardware`, never blocking software CI.

### P3 · 👓 User experience consistency

- Core Value first: if a design forces the player to look at phone or laptop, it is wrong.
- One visual language on G2: phosphor-green CRT/VFD style, same frame glyphs, dividers, column grid, and status-HUD placement across every panel (INV-1). Reuse `shared-render` primitives — never hand-roll a frame.
- One input grammar on R1 (ADR-0012): canonical gestures `press / double-press / swipe-up / swipe-down`; the same gesture means the same thing on every panel. Long-press only as an optional duplicate shortcut — no function may need it.
- All user-facing strings go through i18n (IT + EN, EN canonical fallback), width-budgeted at build time. Feedback is always visual (toast / HUD) — G2 has no speaker.
- Foundry module UI, setup guide, and showcase use the same terminology as the glasses UI (one glossary, no synonyms).

### P4 · ⚡ Performance requirements

- Budgets are contracts: map ≤ 1 fps and only on hash change, image updates one at a time ≥ 100 ms apart (SDK), per-tile hash skip, sized for the real-G2 BLE (~10–30 KB/s — 30 fps flooded it in the bridge era). The old 5/15 fps stream budget (§7.4b.6.1) binds only if a streamed map returns.
- Hot paths (pixel renderer, PNG encode, map pixelation/dither, tile hashing, envelope sealing) have benchmarks under `docs/perf/` and regressions > 10% fail review. Measure before optimizing; state the number in the commit/PR.
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
- Completed Spec Kit features are marked done/superseded in their `specs/NNN-*/` folder, not left to rot. Every file in the repo has an owner and a reason to exist.

### P9 · 🚀 CI/CD

- CI is the enforcement of this constitution: every principle that can be checked mechanically gets a gate (lint, typecheck, coverage, TODO discipline, snapshot drift, changeset, ADR-0011 guard, …). Never bypass with `--no-verify`, skipped jobs, or lowered thresholds.
- Keep pipelines fast, deterministic and useful: pinned actions and tool versions, cached pnpm store, clear job names, actionable failure messages. Remove gates that no longer protect anything; add one when a bug class escapes.
- Release flow stays GitFlow + Changesets (`develop` → `main`, Version Packages PR, release workflows). Workflows are tested on a branch before merge; a red `develop` is fixed before new feature work.

### P10 · 🤖 Subagent usage

- Delegate to subagents for independent, parallelizable work (multi-file exploration, parallel INV-2 WebFetch rounds, focused reviews: code, silent-failure, types, tests) — launch independent agents in a single message.
- Do small, known-location work directly; don't spawn agents for a single lookup or a one-file edit, and never delegate the same search twice.
- Give each agent a self-contained brief (goal, files, constraints, expected output format) and verify its result before acting on it — subagent output is input, not truth. Use the Spec Kit commands for substantive features; keep workflows proportionate to the task.

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
3. README roadmap table = §10 note + changelog milestones
4. Showcase stats reflect §3 + §10 + changelog round count
5. `grep -nE '§[0-9]+\.[0-9]+' Specs.md` → every reference exists as a heading
6. New cross-check round: ≥4 parallel WebFetch against canonical upstream, drift logged in changelog with `Re-verified ✓` or `Drift: …` lines

## Architecture mental model

EvenFoundryVTT projects a Foundry VTT D&D 5e session onto Even Realities G2 AR glasses, driven by R1 ring gestures. Since v0.12.0 there is **no server of our own** ([ADR-0016](docs/architecture/0016-direct-foundry-streaming.md)):

```
[ G2 glasses ] ⇄ BLE ⇄ [ Even App WebView — page served by Foundry: /modules/evenfoundryvtt/g2/ ]
                                   │ same-origin HTTPS: POST /join (cookie) + socket.io
                                   ▼
                           [ Foundry server ] ── relays module.evenfoundryvtt (AES-GCM sealed)
                                   │
                                   ▼
   [ PROJECTOR = player's own browser when online · else an active GM holding the device key ]
     evenfoundryvtt module: dnd5e readers · dispatchTool write path (ADR-0011) · pairing
```

Crucial constraints baked into the spec (do not re-litigate without upstream evidence):

- **Plugins run on the paired phone WebView, not on G2 firmware.** G2 is a thin client: display + 4-mic + IMU + touchpads. See §3.7.
- **Same-origin sideload is load-bearing**: Even Hub whitelists are fixed per build (no wildcards) and do not bypass CORS; Foundry v14 accepts the socket session only from the first-party `session` cookie. Hence the page is served by Foundry and QR-sideloaded, and Foundry must be on **valid HTTPS** reachable from the phone.
- **Identity** (ADR-0017): one Foundry user `"<Player> (G2)"` per player (role Player, owner of one actor), created when the GM enables players once; its password is sealed with ECDH P-256 for the player's public key. The player pairs from their own Foundry ("Pair my glasses") or the GM pairs on their behalf (Players list); QR 5 min single use (key rotates on first `welcome`) + 16-char manual code.
- **Privacy & authority**: every relay payload is a sealed envelope (AES-256-GCM, AAD `from>to`, 120 s anti-replay). Device keys are sealed per holder; per device the player's client answers when online, else the active GM with the key; only the elected client executes `invoke` (ADR-0011, INV-6).
- **G2 has no speaker / no audio output / no camera**. All feedback is visual (toast, HUD). Voice/MCP removed in v0.12.0; may return as a client of the direct channel via a new ADR. Native EvenAI has no developer API (§3.6).
- **Page geometry is hardware-proven, not simulator-proven** (Specs §7.0): the real G2 host **rejects** pages whose image containers sit off the (0,0)-anchored grid (d97b12e: tiles at (88,44) → `REJECTED`, white glasses); the simulator accepts any offset. Only the 2×2 grid of 288×144 (or 200×100) tiles is proven. Image containers always render **on top of** text regardless of `zOrderIndex`; ids are declared images first, then text; `containerID` is mandatory on updates; the capture container has content `' '` and there is exactly one.
- **Sheet layout** (Specs §7.0): top band 576×144 = portrait 144² · header 288×144 (AC, HP, turn, action economy) · square map 144² (original scene art pixelated, ≤ 1 fps), rendered once and split at x = 288 into two tiles; sheet tile 288×144 at (0,144) (Abilities · Saves & Skills, death saves at 0 HP); context panel 288×144 at (288,144) = firmware text, the only zone that takes input. 3/4 images drawn by our pixel renderer (firmware font lacks D&D glyphs), one at a time ≥ 100 ms apart; 4/8 text. See `docs/design/g2-sheet-ux.html`.
- **Input** (ADR-0012, Amd 2): tap at the base view opens the Actions menu; swipe up/down moves the cursor; double-tap = back, at root exits (`shutDownPageContainer(1)`); long-press is an **extra** (SDK ≥ 0.0.14, Even App ≥ 2.2.9) opening the `menuObject` shortcuts, never the only path. Lifecycle: FOREGROUND_ENTER/EXIT (+ ABNORMAL_EXIT) handled.
- **Foundry/dnd5e facts found live** (keep them): `Activity#use(usage, dialog, message)` — `configure:false` belongs in the dialog arg or every use hangs ~10 s; `hp.temp` may be null; spell `prepared` is a number (0/1/2) since dnd5e 5.1; items can have quantity 0; Foundry caches module JS (esmodule filename is version-stamped at release); the browser bundle must never import `node:fs`.
- **Locale follows Foundry** (`game.i18n.lang`) with device-local override (phone page or glasses menu). See §7.16.
- **Hardware assumptions are gated** by GO/NO-GO harness scripts (defer-hardware pattern), incl. `validate:direct-sideload`. See §10.0.

### Even Hub canonical developer docs (INV-2 source of truth)

The Even Hub developer documentation is the canonical upstream for every G2/plugin claim above. Re-verify against these before any bump (INV-2); aggregator/blog/AI-summary sources are **not** authoritative.

- **Overview / execution model** — <https://hub.evenrealities.com/docs/getting-started/overview> — *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."* Canonical source for: phone-WebView execution, the 5-step dev workflow, and the G2 hardware envelope (576×288 4-bit greyscale, 4-mic 16 kHz PCM, touchpad press/double-press/swipe-up/swipe-down, **no camera, no speaker**).
- **Device APIs** — <https://hub.evenrealities.com/docs/guides/device-apis> — verbatim constraint list: *"no arbitrary pixel drawing, no audio output, no text alignment, no font control, no background colors, no per-item list styling, no programmatic scroll position, no animations, no camera (there is none), and images are greyscale only."* Audio capture: `bridge.audioControl(true|false)` → PCM 16 kHz s16le mono via `audioEvent`.
- **Input & events** — gestures now documented in <https://hub.evenrealities.com/docs/build/device-apis> (the old `guides/input-events` redirects) and <https://hub.evenrealities.com/docs/build/contextual-menu>: press / double-press / swipe-up / swipe-down (`CLICK_EVENT(0)`, `DOUBLE_CLICK_EVENT(3)`, `SCROLL_TOP_EVENT(1)`, `SCROLL_BOTTOM_EVENT(2)`); `LONG_PRESS_EVENT(9)` + `menuObject` since SDK 0.0.14 / Even App 2.2.9, as an extra only (GEST-01 closed by design, Specs changelog v0.12.0).
- **CLI reference** — <https://hub.evenrealities.com/docs/reference/cli> — commands are `login` / `init` / `qr` / `pack` only; **there is NO non-interactive `publish`/`submit`/`upload` command** (portal submission is manual + review-gated). `evenhub pack app.json dist -o myapp.ehpk` (`-c` runs the online package_id availability check).
- **Packaging & App Submission** — <https://hub.evenrealities.com/docs/reference/packaging> · <https://hub.evenrealities.com/docs/reference/app-submission> — `.ehpk` manifest fields + the manual portal review/approval gate.
- **npm packages**: `@evenrealities/even_hub_sdk` 0.0.15 (plugin SDK, used directly with its own types), `@evenrealities/evenhub-simulator` (local preview: `evenhub-simulator http://localhost:5173`), `@evenrealities/evenhub-cli` (init/pack used by the CD).
- **Our runbook**: `docs/release/evenhub.md` operationalizes the above (build into `packages/foundry-module/g2` → `app.json` version = package version → `pack` → artifact + release asset; manual portal submit). Portal **trial uploads expire** — test with the Foundry pairing QR / `evenhub qr` sideload instead. CD: `.github/workflows/evenhub-pack.yml`.

## Working in this repo

- The user's primary language is **Italian**; the spec is mostly Italian with English code/identifiers. Reply in Italian unless they ask otherwise. UI strings target IT (MVP) + EN (canonical fallback) per §7.16.5.
- When asked to make a spec change, **think atomic**: the same prompt usually requires updates to `Specs.md` § + changelog + README (badge + relevant section) + showcase (version + relevant section). Never leave a half-updated state.
- New invariants, ADR placeholders, or open-question resolutions go through the changelog with rationale. Past patterns to study: changelog entries v0.9.6–v0.9.10 (all from 2026-05-10).
- Don't re-litigate constraints already verified upstream. If you suspect a claim has drifted, run a fresh WebFetch round (INV-2) against canonical sources and log the result — don't quietly "correct" without evidence.
- ASCII mockups in `Specs.md` are **load-bearing**: they're the contract for INV-1 snapshot tests. Edit them with character-precision; never let alignment slip when adding a row.
- The user may ask you to invoke `/ultrareview` — that is user-triggered/billed and you cannot launch it yourself.

## Roadmap snapshot

v0.9.11 → v0.9.13 (bridge-based MVP, quick wins, sheet data) and v0.9.14 → v0.11.0 (bridge-era raster HUD substrates, bearer pairing, player-view capture; releases up to `v0.1.55`) are shipped history. **v0.12.0** (current): direct Foundry → G2 streaming ported onto `develop`, player-owned glasses, D&D-sheet HUD on the 2×2 tile grid, pixelated original-art map (Spec Kit `specs/003-direct-streaming/`, release `v0.2.0`). Next: hardware UAT on G2 + R1 (`validate:direct-sideload`, tile geometry, cookie persistence, BLE map pacing), skill/save rolls from the glasses, and — only with a new ADR — voice/MCP as a client of the direct channel.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**EvenFoundryVTT (EVF)**

Un plugin che proietta una sessione di **D&D 5e** ospitata su **FoundryVTT** direttamente sugli occhiali AR **Even Realities G2** (576×288, 4-bit greyscale phosphor green), guidato da gesture dell'anello **Even R1**. Il giocatore non distoglie mai lo sguardo dal tavolo fisico — scheda PG, combat tracker, mappa rasterizzata, log e spellbook appaiono come HUD glanceable in stile Alien Nostromo / VFD / CRT verde, mentre miniature, mappe di carta e DM umano restano al centro dell'esperienza. Il sistema è **deterministico nel core MVP** (ogni azione è gesture esplicita); voice/AI è una stretch V2 opzionale via MCP server, mai dipendenza.

**Core Value:** **Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.** Tutto il resto (fps, raster vs glyph, voice V2, multi-player) è subordinato a questo principio: se una decisione di design forza il giocatore a guardare il telefono o un laptop, è sbagliata.

### Constraints

- **Hardware G2**: 576×288 4-bit greyscale, 4 image + 8 text/list container per pagina, 1 container con `isEventCapture: 1`, image container 20–288 × 20–144 px (SDK 0.0.15) **solo sulla griglia ancorata a (0,0)** sul G2 reale (tile fuori griglia ⇒ pagina rifiutata, d97b12e), immagini sempre sopra al testo, ≥ 100 ms tra update immagine, no speaker, no camera. — *Vincolo Even Realities, non negoziabile.*
- **Hardware R1**: BLE → smartphone Even App → G2; gesture canoniche = `press / double-press / swipe-up / swipe-down`; **long-press solo come extra** (SDK ≥ 0.0.14, Even App ≥ 2.2.9: apre il menu contestuale `menuObject`, mai unico accesso a una funzione); nessun input testuale. — *hub.evenrealities.com/docs/reference/changelog + /build/input (re-verified 2026-09-23). Il drift GEST-01 è chiuso dalla v0.12.0; modello canonico ADR-0012 (Amd 2: il menu si apre col tap).*
- **Plugin execution model**: il g2-app è servito da **Foundry stesso** (`/modules/evenfoundryvtt/g2/index.html`) e caricato dall'Even Realities App via QR sideload nel WebView del telefono. Il G2 firmware NON esegue il nostro codice. — *ADR-0016; hub.evenrealities.com/docs/get-started/architecture.*
- **Network**: Foundry su HTTPS **valido** raggiungibile dal telefono (no self-signed); tutto il traffico è same-origin (`/join` + socket.io), quindi nessuna whitelist/CORS per il sideload. Il `.ehpk` (secondario) resta vincolato alla whitelist `app.json` (origin completo, no wildcards). — *Vincolo Even Hub + ADR-0016.*
- **BLE bandwidth**: ~10–30 KB/s reali (FAQ Even Hub); a 30 fps il G2 reale si saturava ⇒ mappa ≤ 1 fps solo su cambio hash, un'immagine alla volta. — *hub.evenrealities.com/docs/reference/faq + lezione be5167e.*
- **D&D edition**: dual-support PHB 2014 + PHB 2024 via `core.modernRules`. Setting MVP. — *§11.5.1.*
- **License**: MIT su tutti i package del monorepo. — *§11.5.2.*
- **Deployment**: solo il modulo Foundry (zip GitHub Release con `g2/`); niente bridge, niente Docker Compose (rimossi in v0.12.0). Serve un projector online: il client Foundry del giocatore o un GM con la chiave del dispositivo. — *ADR-0016/0017 (supersede §11.5.3).*
- **Auth**: utente Foundry dedicato `"<Giocatore> (G2)"` (password sigillata ECDH P-256 per il giocatore) + chiave AES-256 per dispositivo; QR monouso 5 min (la chiave ruota al primo `welcome`) o codice manuale di 16 caratteri; revoca dalla finestra di associazione; ownership del PG verificata dal vivo. Nessun bearer token. — *ADR-0016/0017 (supersede §11.5.4 e l'ADR-0014 remoto).*
- **Tooling fissato**: TypeScript strict + Biome lint/format + Vitest coverage gate; CI fail su `// TODO` senza issue-link. — *INV-4 §0.1.*
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

> **v0.12.0 (2026-09-23)** — rewritten after [ADR-0016](docs/architecture/0016-direct-foundry-streaming.md). The original research snapshot (GSD `.planning/research/STACK.md`, 2026-05-10, removed with `.planning/` — recoverable from git) described a Node bridge + Docker + `foundry-mcp`; those rows are collapsed into *Removed in v0.12.0* below. Authoritative pins live in the `package.json` files (exact versions, re-check with `npm view` per INV-2).

### Current stack (by package)

| Package | Runtime deps (pinned) | Notes |
|---|---|---|
| `g2-app` | `@evenrealities/even_hub_sdk` 0.0.15 · `@evenrealities/pretext` 0.1.4 · `socket.io-client` 4.8.3 · `upng-js` 2.1.0 · `zod` 4.4.3 · Vite 8.0.11 (dev) | Built into `packages/foundry-module/g2/`, relative `base`, no CDN assets. `app.json` version = package version, `min_sdk_version` ≥ 0.0.14, icon + description for submission. |
| `foundry-module` | `qrcode` 1.5.4 · `@evf/shared-protocol` · `tsup` 8.5.1 (dev) | Foundry ≥ 13.347 (v14 verified), dnd5e ≥ 5.3.3, midi-qol optional (`recommends`). socketlib **not used**. |
| `shared-protocol` | `zod` 4.4.3 · WebCrypto (AES-256-GCM, HKDF-SHA256) | Zod = single source of truth for wire shapes; `direct/` envelope/messages/pairing/map. |
| `shared-render` | — | ASCII grid (`./ascii-grid` browser-safe subpath) + `src/pixel/` renderer + INV-1 matchers (test-only, never in the browser bundle). |
| `validation-harness` | `zod` 4.4.3 · `upng-js` 2.1.0 · `csv-stringify` 6.5.2 · `tsx` | GO/NO-GO scripts, `inv:all`, `validate:direct-sideload`. |
| Workspace tooling | TypeScript 5.8.3 · pnpm 10.33.4 · Node 24 LTS (`.nvmrc`) · Vitest 4.1.5 + `@vitest/coverage-v8` 4.1.5 · happy-dom 20.9.0 · Biome 2.4.15 · Changesets 2.31.0 · Playwright 1.59.1 · commitlint + husky | Stay on TS 5.8.x until the ecosystem (Vitest, Biome) catches up with 6.x. |

### Removed in v0.12.0 (ADR-0016)

`packages/bridge` (Fastify 5, `@fastify/{websocket,cors,rate-limit}`, `ws`, `pino`, `prom-client`, in-memory token/cache, `sharp` portrait renderer), `packages/foundry-mcp` (`@modelcontextprotocol/sdk`, stdio/Streamable HTTP), `deploy/` (Docker Compose, `node:24-alpine` images, GHCR `evf-bridge`), Deepgram voice proxy and g2-app audio capture, socketlib `executeAsGM`, standalone `g2-app-dist.zip`, bearer registry / PairModal, canvas-extractor + headless player-view capture, `image-q` / `xxhash-wasm` raster stack, LayerManager + panel substrates (`showcase`/`canvas`/`hybrid`/`glyph`), `scripts/sim.sh`. Do not reintroduce any of them without a new ADR.

### What NOT to use

| Avoid | Why | Use instead |
|---|---|---|
| A server/bridge between Foundry and the phone | ADR-0016: zero-infrastructure goal; cross-origin fails (whitelist per build, no CORS bypass, v14 cookie-only session) | Same-origin page served by Foundry + `module.evenfoundryvtt` relay |
| Plaintext payloads on `module.evenfoundryvtt` | The relay broadcasts to every client | Sealed envelopes (`@evf/shared-protocol` `direct/envelope.ts`) |
| socketlib / `activity.use()` outside `foundry-module/src/write-path` | ADR-0011 single-workflow-origin; CI Gates 8/9 | `dispatchTool` in the GM-client projector |
| `jimp`, `pngjs`, `fast-png`, `pako`/`fflate` for the map | Wrong dither / bit depth / double compression (§11.5.7) | `upng-js` 4-bit exact palette + per-tile hashes (SDK LZ4 in transit) |
| Image tiles off the (0,0)-anchored 288×144 grid | Real G2 host rejects the page (d97b12e); simulator hides it | 2×2 tile grid (Specs §7.0) |
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

## Planning Workflow — Spec Kit

Planning has migrated from GSD to **Spec Kit**. The old GSD `.planning/` directory was removed
on 2026-06-18 (recoverable from git history); the project constitution lives at
`.specify/memory/constitution.md` (v1.1.0) and feature specs live under `specs/`.

Workflow for substantive features:
- `/speckit.specify` — write/refresh the feature spec (`specs/<NNN>-<slug>/spec.md`).
- `/speckit.clarify` — resolve underspecified areas (optional).
- `/speckit.plan` — produce the implementation plan + design artifacts.
- `/speckit.tasks` — generate the dependency-ordered task list.
- `/speckit.implement` — execute the tasks.

The constitution's principles (code quality, test-first, INV-1 layout, performance budgets,
autonomous debug, source-verified research, doc coherence, repo hygiene, reliable CI/CD,
disciplined subagent use, consistent chapter icons) are the binding quality gates — `/speckit.plan` runs a Constitution
Check against them. Trivial fixes may be made directly; keep changes atomic and tested.

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

<!-- SPECKIT START -->
Active feature: **003-direct-streaming** — port of direct Foundry → G2 streaming onto `develop`
(v0.12.0): bridge/Docker/foundry-mcp removed (ADR-0016), player-owned glasses with hybrid
projector (ADR-0017), D&D-sheet HUD on the pixel renderer and the hardware-proven 2×2 tile grid
(ADR-0018), fixes carried over from the v0.11 line. Read `specs/003-direct-streaming/plan.md`
(spec: `specs/003-direct-streaming/spec.md`; tasks alongside).
<!-- SPECKIT END -->
