# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**v0.13.0 — relay pairing: the player's own Foundry tab projects, the phone never logs into Foundry** ([ADR-0019](docs/architecture/0019-relay-pairing-player-projector.md) · [ADR-0016](docs/architecture/0016-direct-foundry-streaming.md) sealed protocol · [ADR-0018](docs/architecture/0018-dnd-sheet-hud-pixel-renderer.md) HUD). The bridge era (v0.9.14 → v0.11.0, releases up to `v0.1.55`) and the Foundry-served sideload of v0.12.0 (ADR-0016 §1–4 / ADR-0017: "(G2)" users, GM enablement, ECDH custody, election — broken on Foundry ≥ 14.361, which serves module HTML as `text/plain`) are history in git and the `Specs.md` changelog. Now: the tab that shows «Collega occhiali G2» is the **projector**; it meets the glasses in a room of the **relay** (`packages/relay`, Cloudflare Worker + Durable Object, `wss://evf-relay.aiacos.workers.dev`) with AES-GCM sealed frames. The glasses app is one bundle (`packages/g2-app/dist`) shipped as the Even Hub `.ehpk` (players), on GitHub Pages `/app/` (the page the QR opens) and via Vite in development.

**Config (root):**

- `package.json` — pnpm workspace, `packageManager: pnpm@10.33.4`, scripts for lint/typecheck/test/changeset/release
- `pnpm-workspace.yaml` — `packages/*` glob
- `tsconfig.base.json` — strict + 6 flags
- `biome.jsonc` — Biome 2.4.15 config (recommended + strict rules)
- `vitest.config.ts` — Vitest 4 `test.projects` workspace API + v8 coverage 80%
- `.changeset/config.json` — independent per-package semver
- `commitlint.config.js` + `.husky/{pre-commit,commit-msg}` — Conventional Commits enforcement
- `.nvmrc=24`, `.npmrc`, `.gitattributes`, `.editorconfig`, `.gitignore` (`dist/`, `.wrangler/` are build/dev output, never committed)

**Packages:**

- `packages/foundry-module/` — Foundry module `evenfoundryvtt`: dnd5e readers, write path (`dispatchTool`, ADR-0011; `Activity#use(usage, dialog, message)` with `configure:false` in the **dialog** arg; `skill-check` handler), `src/direct/` projector (relay connection per paired device, Web Lock = one tab per browser, map `asset` pictures) + «Collega occhiali G2» window (Players list right-click, `Alt+G`, settings menu; pairings in a client setting)
- `packages/g2-app/` — glasses app (Vite 8, Even Hub SDK 0.0.16): `src/direct/` (relay client, credentials v2, sealed session), `src/hud/` (D&D-sheet layout on the 2×2 288×144 tile grid, zone renderers + tile sender, input state machine, `map-art/` pixelated scene art), `src/phone/` (phone page P02/P03: «Scansiona QR» via `captureImageFromCamera` + `jsqr`, code entry)
- `packages/relay/` — opaque WebSocket room relay (Cloudflare Worker + one Durable Object per room, Hibernation API; `wrangler dev` / `wrangler deploy`)
- `packages/shared-protocol/` — Zod schemas + `direct/` envelope (WebCrypto AES-GCM), messages (v2: `rotate {room,key}`, `asset`), pairing payload v2, relay contract (`DEFAULT_RELAY_URL`, `DEFAULT_APP_URL`), map snapshot
- `packages/shared-render/` — ASCII grid (browser-safe `./ascii-grid` subpath) + INV-1 matchers, `src/pixel/` 4-bit pixel renderer + bitmap fonts + D&D icons, per-zone golden fixtures `sheet.*.txt`
- `packages/validation-harness/` — GO/NO-GO hardware scripts (defer-hardware pattern), `inv:all`, `validate:relay`

**Architecture:** `docs/architecture/` — ADR-0001…0019 (index with statuses in `docs/architecture/README.md`; 0007 reserved). Current: 0011 write path · **0012 R1 gesture model (canonical, remote)** · 0016 sealed protocol + projector role · 0018 D&D-sheet HUD · **0019 relay pairing**. Superseded: 0017 (→ 0019), 0016 §1–4/§6 (→ 0019), bridge-era 0013 (raster HUD → 0018), 0014 (bearer authz → 0017), 0015 (player-view capture → 0016), 0009/0010 (→ 0018). Plus `INVARIANTS.md` (INV-1…6); design contract `docs/design/g2-sheet-ux.html` («Scheda da tavolo G2», screens S1–S12; screenshots `docs/design/img/`); `docs/design/g2-thirds-layout.md` is superseded history (its pairing mocks P01–P03 still apply).

**Documentation:**

- `Specs.md` (**canonical source of truth**, v0.13.0; superseded sections carry `SUPERSEDED in v0.12.0` / `SUPERSEDED in v0.13.0` banners) — requirements, hardware constraints, APIs, data models, UI/UX mockups, roadmap, risk register
- `README.md` — projection of `Specs.md` for GitHub readers; must stay coherent (see INV-3)
- `docs/showcase/index.html` — animated single-file showcase (GitHub Pages); `docs/index.html` redirects to it; `docs/privacy.md` = Even Hub privacy policy (→ `/privacy.html`)
- `docs/wiki/` — project wiki (Italian, 25 pages), mirrored to the GitHub wiki by `wiki-sync.yml`; check with `node scripts/check-wiki-links.mjs docs/wiki`
- `specs/NNN-*/` — Spec Kit features (`004-relay-pairing` = current; `003-direct-streaming` done, pairing superseded by 004; `002` superseded) · `.specify/memory/constitution.md`
- `docs/setup-guide.md` · `docs/runbook.md` · `docs/firmware-compatibility.md` · `docs/release/{foundry-module,evenhub}.md`
- `LICENSE` (MIT)

**CI:** `.github/workflows/ci.yml` — D-1.10 gates 1–7 + Gate 8 (`activity.use(` only under `foundry-module/src/write-path`) + Gate 9 (no socketlib outside `foundry-module`) + Gate 10 (`scripts/check-relay-origin.mjs --bundle packages/g2-app/dist`: whitelist = `DEFAULT_RELAY_URL`, camera declared, no Foundry login / socket.io in the bundle) + "Relay end-to-end" (`wrangler dev` + real glasses session + `validate:relay`). Release: `release.yml` (Changesets; `scripts/release-tag.mjs` tags `vX.Y.Z` and dispatches) → `foundry-module-release.yml` (module zip **without** `g2/`, version-stamped esmodule filename, `.ehpk` attached), `evenhub-pack.yml` (`.ehpk` validation), `pages.yml` (docs + `/app/`; Pages source = GitHub Actions), `relay-deploy.yml` (`wrangler deploy`, needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`), `wiki-sync.yml`.

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
pnpm --filter @evf/g2-app build                  # vite → packages/g2-app/dist (.ehpk + Pages /app/)
pnpm --filter @evf/foundry-module build          # tsup → dist/module.js
pnpm --filter @evf/relay dev                     # relay on http://127.0.0.1:8787 (wrangler dev)
pnpm dev:glasses                                 # wizard --mode live: app on the LAN for a real pairing
pnpm wizard                                      # demo scenes on the glasses (no Foundry)
pnpm --filter @evf/validation-harness inv:all    # invariant suite
RELAY_URL=ws://127.0.0.1:8787 pnpm --filter @evf/validation-harness validate:relay:skip-hardware   # ADR-0019 software GO/NO-GO
EVF_RELAY_URL=ws://127.0.0.1:8787 pnpm vitest --run packages/g2-app/src/direct/relay.e2e.test.ts  # real-relay E2E
npx @evenrealities/evenhub-cli@0.1.14 pack packages/g2-app/app.json packages/g2-app/dist --sdk-ver 0.0.16 -o evenfoundryvtt.ehpk
pnpm --filter @evf/validation-harness validate:all:skip-hardware    # Phase 0 software-only smoke
```

### Self-test (clean clone)

```bash
pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status
# All exit 0 = healthy
```

## Constitution (READ FIRST, EVERY CHANGE)

**Before any substantive change, read and adhere to the project constitution: `.specify/memory/constitution.md`.** Its principles are BINDING quality gates, not suggestions: I. Code Quality & Zero Dead Code · II. Test-First & Coverage Discipline (≥80%; new behavior MUST be tested, bug fixes MUST add a regression test) · III. Layout & UX Consistency (INV-1) · IV. Performance Budgets · V. Autonomous Debug & Validation · VI. Source-Verified SDK/Library Research (INV-2) · VII. Documentation Coherence (INV-3) · plus VIII repo hygiene · IX reliable CI/CD · X disciplined subagent use · XI consistent chapter icons · XII living tracking files `TODO.md` / `SECURITY.md` / `CHANGELOG.md` (v1.2.0). When in doubt, the constitution wins; it operationalizes the four invariants below.

## Project Invariants (NON-NEGOTIABLE)

`Specs.md` §0.1 ratifies four invariants that govern every change to this repo. Read them before doing anything. Short version:

- **INV-1 Layout integrity** — every ASCII mockup and (future) runtime layout must align character-perfect across all states / contents / locales. Verifiable via §7.1a (8 sub-rules) and §7.14.4 ck 11–15. Frame corners, dividers, columns: same column from top to bottom, always. Variable content (HP=`7` vs `700`, name length, conditions overflow, IT vs EN i18n) gets width-budgeted at build time, never best-effort.
- **INV-2 Online cross-validation** — every technical claim cites a canonical upstream source. Sources allowed: `hub.evenrealities.com/docs/*`, `evenrealities.com/{ai-glasses,smart-glasses,translation-glasses,smart-ring}`, `support.evenrealities.com/specs`, `foundryvtt.com/api/*`, `github.com/foundryvtt/dnd5e`, `modelcontextprotocol.io/specification/*`, `github.com/farling42/foundryvtt-socketlib`, `gitlab.com/tposney/midi-qol`, vendor pricing pages (Deepgram, AssemblyAI). **Aggregator/blog/AI-summary sources are not authoritative.** Re-verify before each bump. Drift is classified CRITICAL / IMPORTANT / NICE-TO-HAVE and logged. Pattern: ≥4 parallel WebFetch on independent domains.
- **INV-3 Documentation coherence** — `Specs.md` + `README.md` + `docs/showcase/index.html` update **in the same commit** for any cross-cutting change (version, fps target, phase count, hardware spec, library version, locale set, ADR list). No half-updated states. Cross-reference integrity is a hard gate.
- **INV-4 Code quality** (binds Phase 1+ when code lands) — clean, optimized, documented, **zero dead/unreachable code** tolerated. Biome + TypeScript strict + Vitest coverage gate enforce in CI. `// TODO` requires `(#issue)` or `(ADR-NNNN)`. JSDoc/TSDoc on every public API. Hot-path benchmarks gate regressions.

## Engineering Constitution (ALWAYS APPLY)

Standing principles that bind every change — code, docs, CI, and agent workflow. They are the working form of the constitution in `.specify/memory/constitution.md` (P1≈I · P2≈II · P3≈III · P4≈IV · P5≈V · P6≈VI · P7≈VII · P8≈VIII · P9≈IX · P10≈X · P11=XI · P12=XII); both must say the same thing. They extend INV-1..4 (never override them); on conflict the invariants and `Specs.md` win. A change that violates a principle is not "done", even if tests pass.

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
- Release flow stays GitFlow + Changesets (`develop` → `main`; the version PR is verified, merged and published hands-off inside `release.yml` (reusable CI + check run), then `main` is back-merged into `develop` the same way). Workflows are tested on a branch before merge; a red `develop` is fixed before new feature work.

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
| Author / Credits | 👤 | Tasks / TODO | ✅ |

### P12 · ✅ Living tracking files (TODO · SECURITY · CHANGELOG)

Three root files are the project's working memory for humans and agents. Keep them short, plain
and cheap to update — checkable lists with references, never prose essays.

- **[`TODO.md`](TODO.md)** — open work only, grouped by area (`##` with the P11 icons): every item is
  `- [ ]` + a reference (spec task, ADR, issue/PR, file path or `Specs.md §`). Tick it in the commit
  that finishes it; when it ships, move the line to `CHANGELOG.md` and delete it from `TODO.md`. A
  code `// TODO` still needs `(#issue)` / `(ADR-NNNN)` (INV-4); larger follow-ups go here.
- **[`SECURITY.md`](SECURITY.md)** — supported versions, how to report (private, never a public
  issue), the threat model in a few bullets, and a checklist of security controls, each `- [x]`
  linked to the code/ADR that proves it. A change that touches auth, crypto, pairing, the relay,
  permissions or secrets updates it in the same commit; re-verify the list at every release.
- **[`CHANGELOG.md`](CHANGELOG.md)** — one line per user-visible change, newest first, each with its
  reference (PR, ADR, spec): `## 🚀 Unreleased` collects the lines as PRs land (`- [x]` done,
  `- [ ]` still to do before the release); the release turns it into `## 📦 vX.Y.Z — date`. It is the
  human index; per-package details stay in the Changesets `CHANGELOG.md`s and design history in the
  `Specs.md` changelog — link, don't duplicate.
- Same rules everywhere: checkboxes, one line per item (wrap with an indented continuation),
  a reference on every item, P11 icons on every `##`, updated in the same commit as the change
  (P7). `scripts/check-tracking-files.mjs` enforces the format in CI (P9).

## Pre-bump checklist (manual until CI lands)

Before bumping `Specs.md` version (e.g., v0.9.10 → v0.9.11):

1. README badge version = Specs.md header version = showcase hero stat version = boot splash mockup version (§7.12)
2. README hardware bullets = §3 hardware spec (display, mics/speaker, R1, networking, Foundry)
3. README roadmap table = §10 note + changelog milestones
4. Showcase stats reflect §3 + §10 + changelog round count
5. `grep -nE '§[0-9]+\.[0-9]+' Specs.md` → every reference exists as a heading
6. New cross-check round: ≥4 parallel WebFetch against canonical upstream, drift logged in changelog with `Re-verified ✓` or `Drift: …` lines

## Architecture mental model

EvenFoundryVTT projects a Foundry VTT D&D 5e session onto Even Realities G2 AR glasses, driven by R1 ring gestures. Since v0.13.0 ([ADR-0019](docs/architecture/0019-relay-pairing-player-projector.md)) the phone **never logs into Foundry**:

```
[ G2 glasses ] ⇄ BLE ⇄ [ Even App: FoundryVTT G2 HUD (.ehpk · Pages /app/ · Vite dev) ]
                                   │ wss — AES-256-GCM sealed frames only
                                   ▼
             [ relay: Cloudflare Worker + Durable Object per room (packages/relay) ]
                                   ▲ wss
                                   │
   [ PROJECTOR = the Foundry tab that showed the QR (the player's; a GM's for a player without a device) ]
     evenfoundryvtt module: dnd5e readers · dispatchTool write path (ADR-0011) · pairing window
```

Crucial constraints baked into the spec (do not re-litigate without upstream evidence):

- **Plugins run on the paired phone WebView, not on G2 firmware.** G2 is a thin client: display + 4-mic + IMU + touchpads. See §3.7.
- **Why a relay** (research `specs/004-relay-pairing/research.md`, verified 2026-09-25): Foundry ≥ 14.361 serves module HTML as `text/plain` (#14375 NOT_PLANNED) — a Foundry-served app page cannot load; players cannot create users and a second login of the same user is bug #14728 (to be fixed) — the phone must not log into Foundry; The Forge private games gate the game host; an Even Hub store app reaches only fixed whitelisted origins (no wildcards, no deep links) and only Beta/Released installs survive the 5-minute phone lock. Foundry therefore needs **no public HTTPS**; only the projector tab must reach the relay.
- **Pairing** («Collega occhiali G2»: right-click own name in the Players list, `Alt+G`, or settings): opening the window checks the relay (`/health`) and shows the QR (`https://aiacos.github.io/EvenFoundryVTT/app/#evf=<{v:2,r,k,l,relay?}>`) + 16-char code (room + key by HKDF) at once; single use (room + key rotate on the first `welcome`), 5 min; the pairing lives in that browser's client setting and reconnects by itself whenever that browser has Foundry open. No GM, no Foundry user, no password.
- **Privacy & authority**: every relay frame is a sealed envelope (AES-256-GCM, AAD `from>to` with `projector`/`glasses`, 120 s anti-replay); the relay forwards opaque frames only (≤ 1 MiB, ≤ 60/s) and stores nothing. Only the projector executes `invoke`, via `dispatchTool` (ADR-0011, INV-6); ownership is re-checked live on every request. Inbound frames are handled one at a time per device (two racing `hello`s must not rotate twice).
- **Map pictures**: the projector loads scene art in its tab (same origin, or Forge CDN with CORS), downsizes each once (background JPEG ≤ 768 px, pieces PNG ≤ 128 px) and sends it as an `asset` message; snapshots reference `evf-asset:<id>`. The phone's pixelation is unchanged.
- **G2 has no speaker / no audio output / no camera** (the *phone* camera is used only for «Scansiona QR»). All feedback is visual (toast, HUD). Voice/MCP removed in v0.12.0; may return as a client of the direct channel via a new ADR. Native EvenAI has no developer API (§3.6).
- **Page geometry is hardware-proven, not simulator-proven** (Specs §7.0): the real G2 host **rejects** pages whose image containers sit off the (0,0)-anchored grid (d97b12e: tiles at (88,44) → `REJECTED`, white glasses); the simulator accepts any offset. Only the 2×2 grid of 288×144 (or 200×100) tiles is proven. Image containers always render **on top of** text regardless of `zOrderIndex`; ids are declared images first, then text; `containerID` is mandatory on updates; the capture container has content `' '` and there is exactly one.
- **Sheet layout** (Specs §7.0): top band 576×144 = portrait 144² · header 288×144 (AC, HP, turn, action economy) · square map 144² (original scene art pixelated, ≤ 1 fps), rendered once and split at x = 288 into two tiles; sheet tile 288×144 at (0,144) (Abilities · Saves & Skills, death saves at 0 HP); context panel 288×144 at (288,144) = firmware text, the only zone that takes input. 3/4 images drawn by our pixel renderer (firmware font lacks D&D glyphs), one at a time ≥ 100 ms apart; 4/8 text. See `docs/design/g2-sheet-ux.html`.
- **Input** (ADR-0012, Amd 2): tap at the base view opens the Actions menu; swipe up/down moves the cursor; double-tap = back, at root exits (`shutDownPageContainer(1)`); long-press is an **extra** (SDK ≥ 0.0.14, Even App ≥ 2.2.9) opening the `menuObject` shortcuts, never the only path. Lifecycle: FOREGROUND_ENTER/EXIT (+ ABNORMAL_EXIT) handled.
- **Foundry/dnd5e facts found live** (keep them): `Activity#use(usage, dialog, message)` — `configure:false` belongs in the dialog arg or every use hangs ~10 s; `hp.temp` may be null; spell `prepared` is a number (0/1/2) since dnd5e 5.1; items can have quantity 0; Foundry caches module JS (esmodule filename is version-stamped at release); the browser bundle must never import `node:fs`.
- **Locale follows Foundry** (`game.i18n.lang`) with device-local override (phone page or glasses menu). See §7.16.
- **Hardware assumptions are gated** by GO/NO-GO harness scripts (defer-hardware pattern), incl. `validate:relay` (G1 relay reachable from Forge/self-hosted tabs, G2 store build: camera scan + 5-minute lock, G3 relay cost). See §10.0.

### Even Hub canonical developer docs (INV-2 source of truth)

The Even Hub developer documentation is the canonical upstream for every G2/plugin claim above. Re-verify against these before any bump (INV-2); aggregator/blog/AI-summary sources are **not** authoritative.

- **Overview / execution model** — <https://hub.evenrealities.com/docs/getting-started/overview> — *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."* Canonical source for: phone-WebView execution, the 5-step dev workflow, and the G2 hardware envelope (576×288 4-bit greyscale, 4-mic 16 kHz PCM, touchpad press/double-press/swipe-up/swipe-down, **no camera, no speaker**).
- **Device APIs** — <https://hub.evenrealities.com/docs/guides/device-apis> — verbatim constraint list: *"no arbitrary pixel drawing, no audio output, no text alignment, no font control, no background colors, no per-item list styling, no programmatic scroll position, no animations, no camera (there is none), and images are greyscale only."* Audio capture: `bridge.audioControl(true|false)` → PCM 16 kHz s16le mono via `audioEvent`.
- **Input & events** — gestures now documented in <https://hub.evenrealities.com/docs/build/device-apis> (the old `guides/input-events` redirects) and <https://hub.evenrealities.com/docs/build/contextual-menu>: press / double-press / swipe-up / swipe-down (`CLICK_EVENT(0)`, `DOUBLE_CLICK_EVENT(3)`, `SCROLL_TOP_EVENT(1)`, `SCROLL_BOTTOM_EVENT(2)`); `LONG_PRESS_EVENT(9)` + `menuObject` since SDK 0.0.14 / Even App 2.2.9, as an extra only (GEST-01 closed by design, Specs changelog v0.12.0).
- **CLI reference** — <https://hub.evenrealities.com/docs/reference/cli> — commands are `login` / `init` / `qr` / `pack` only; **there is NO non-interactive `publish`/`submit`/`upload` command** (portal submission is manual + review-gated). `evenhub pack app.json dist -o myapp.ehpk` (`-c` runs the online package_id availability check).
- **Packaging & App Submission** — <https://hub.evenrealities.com/docs/reference/packaging> · <https://hub.evenrealities.com/docs/reference/app-submission> — `.ehpk` manifest fields + the manual portal review/approval gate.
- **npm packages**: `@evenrealities/even_hub_sdk` 0.0.16 (plugin SDK, used directly with its own types; `index.d.ts` identical to 0.0.15), `@evenrealities/evenhub-simulator` (local preview: `evenhub-simulator http://localhost:5173`), `@evenrealities/evenhub-cli` (init/pack used by the CD).
- **Our runbook**: `docs/release/evenhub.md` operationalizes the above (build `packages/g2-app/dist` → `app.json` version = package version → `pack` → artifact + release asset; manual portal upload → beta group → review). The `.ehpk` is the player distribution (whitelist = relay `https://` + `wss://`, `camera`). Portal **trial uploads expire** — develop with the Foundry QR / `evenhub qr` sideload. CD: `.github/workflows/evenhub-pack.yml`.

## Working in this repo

- The user's primary language is **Italian**; the spec is mostly Italian with English code/identifiers. Reply in Italian unless they ask otherwise. UI strings target IT (MVP) + EN (canonical fallback) per §7.16.5.
- When asked to make a spec change, **think atomic**: the same prompt usually requires updates to `Specs.md` § + changelog + README (badge + relevant section) + showcase (version + relevant section). Never leave a half-updated state.
- New invariants, ADR placeholders, or open-question resolutions go through the changelog with rationale. Past patterns to study: changelog entries v0.9.6–v0.9.10 (all from 2026-05-10).
- Don't re-litigate constraints already verified upstream. If you suspect a claim has drifted, run a fresh WebFetch round (INV-2) against canonical sources and log the result — don't quietly "correct" without evidence.
- ASCII mockups in `Specs.md` are **load-bearing**: they're the contract for INV-1 snapshot tests. Edit them with character-precision; never let alignment slip when adding a row.
- The user may ask you to invoke `/ultrareview` — that is user-triggered/billed and you cannot launch it yourself.

## Roadmap snapshot

v0.9.11 → v0.9.13 (bridge-based MVP, quick wins, sheet data) and v0.9.14 → v0.11.0 (bridge-era raster HUD substrates, bearer pairing, player-view capture; releases up to `v0.1.55`) are shipped history. **v0.12.0**: direct Foundry → G2 streaming, D&D-sheet HUD on the 2×2 tile grid, pixelated original-art map (release `v0.2.0`). **v0.13.0** (current): relay pairing (ADR-0019, Spec Kit `specs/004-relay-pairing/`): no GM, no phone login, one QR, Even Hub listable. Next: maintainer one-time setup (Cloudflare relay deploy, Pages source = Actions, Even Hub beta group), hardware UAT on G2 + R1 (`validate:relay` G1–G3, tile geometry, BLE map pacing), skill/save rolls from the glasses, and — only with a new ADR — voice/MCP as a client of the direct channel.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**EvenFoundryVTT (EVF)**

Un plugin che proietta una sessione di **D&D 5e** ospitata su **FoundryVTT** direttamente sugli occhiali AR **Even Realities G2** (576×288, 4-bit greyscale phosphor green), guidato da gesture dell'anello **Even R1**. Il giocatore non distoglie mai lo sguardo dal tavolo fisico — scheda PG, combat tracker, mappa rasterizzata, log e spellbook appaiono come HUD glanceable in stile Alien Nostromo / VFD / CRT verde, mentre miniature, mappe di carta e DM umano restano al centro dell'esperienza. Il sistema è **deterministico nel core MVP** (ogni azione è gesture esplicita); voice/AI è una stretch V2 opzionale via MCP server, mai dipendenza.

**Core Value:** **Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.** Tutto il resto (fps, raster vs glyph, voice V2, multi-player) è subordinato a questo principio: se una decisione di design forza il giocatore a guardare il telefono o un laptop, è sbagliata.

### Constraints

- **Hardware G2**: 576×288 4-bit greyscale, 4 image + 8 text/list container per pagina, 1 container con `isEventCapture: 1`, image container 20–288 × 20–144 px (SDK 0.0.16) **solo sulla griglia ancorata a (0,0)** sul G2 reale (tile fuori griglia ⇒ pagina rifiutata, d97b12e), immagini sempre sopra al testo, ≥ 100 ms tra update immagine, no speaker, no camera. — *Vincolo Even Realities, non negoziabile.*
- **Hardware R1**: BLE → smartphone Even App → G2; gesture canoniche = `press / double-press / swipe-up / swipe-down`; **long-press solo come extra** (SDK ≥ 0.0.14, Even App ≥ 2.2.9: apre il menu contestuale `menuObject`, mai unico accesso a una funzione); nessun input testuale. — *hub.evenrealities.com/docs/reference/changelog + /build/input (re-verified 2026-09-23). Il drift GEST-01 è chiuso dalla v0.12.0; modello canonico ADR-0012 (Amd 2: il menu si apre col tap).*
- **Plugin execution model**: l'app occhiali gira nel WebView del telefono (Even Realities App): installata da Even Hub (`.ehpk`, per i giocatori — sopravvive al blocco del telefono), oppure aperta dal QR come pagina GitHub Pages `/app/` o dal dev server Vite (sviluppo — muore al blocco). Il G2 firmware NON esegue il nostro codice. Foundry ≥ 14.361 serve l'HTML dei moduli come `text/plain`: nessuna pagina servita da Foundry. — *ADR-0019; hub.evenrealities.com/docs/get-started/architecture, test/beta-testing; foundryvtt.com/releases/14.361.*
- **Network**: il telefono parla **solo** col relay (`wss://evf-relay.aiacos.workers.dev`, whitelist `app.json` `https://` + `wss://`, origin completo, no wildcards); la scheda Foundry del proiettore deve raggiungere lo stesso relay (la finestra mostra «Relay ✗» altrimenti). Foundry **non** serve più HTTPS pubblico. — *Vincolo Even Hub + ADR-0019.*
- **BLE bandwidth**: ~10–30 KB/s reali (FAQ Even Hub); a 30 fps il G2 reale si saturava ⇒ mappa ≤ 1 fps solo su cambio hash, un'immagine alla volta. — *hub.evenrealities.com/docs/reference/faq + lezione be5167e.*
- **D&D edition**: dual-support PHB 2014 + PHB 2024 via `core.modernRules`. Setting MVP. — *§11.5.1.*
- **License**: MIT su tutti i package del monorepo. — *§11.5.2.*
- **Deployment**: modulo Foundry (zip GitHub Release, senza `g2/`) + app occhiali su Even Hub (`.ehpk`, gruppo beta poi store) + pagina GitHub Pages `/app/` + relay Cloudflare (Worker + Durable Object, piano gratuito, gestito dal progetto; self-host opzionale). Serve la scheda Foundry del proiettore aperta (quella del giocatore, o del GM per chi non ha un dispositivo). — *ADR-0019 (supersede §11.5.3 e ADR-0016/0017 per la distribuzione).*
- **Auth**: nessun login Foundry sul telefono, nessun utente "(G2)", nessun GM: stanza del relay (128 bit) + chiave AES-256 per dispositivo nel QR (o derivate da un codice di 16 caratteri via HKDF); monouso 5 min (stanza e chiave ruotano al primo `welcome`); pairing salvato nel browser del proiettore; «Scollega» dalla finestra; ownership del PG verificata dal vivo. — *ADR-0019 (supersede §11.5.4, ADR-0017).*
- **Tooling fissato**: TypeScript strict + Biome lint/format + Vitest coverage gate; CI fail su `// TODO` senza issue-link. — *INV-4 §0.1.*
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

> **v0.13.0 (2026-09-25)** — relay row added, `socket.io-client` removed ([ADR-0019](docs/architecture/0019-relay-pairing-player-projector.md)). **v0.12.0 (2026-09-23)** — rewritten after [ADR-0016](docs/architecture/0016-direct-foundry-streaming.md). The original research snapshot (GSD `.planning/research/STACK.md`, 2026-05-10, removed with `.planning/` — recoverable from git) described a Node bridge + Docker + `foundry-mcp`; those rows are collapsed into *Removed in v0.12.0* below. Authoritative pins live in the `package.json` files (exact versions, re-check with `npm view` per INV-2).

### Current stack (by package)

| Package | Runtime deps (pinned) | Notes |
|---|---|---|
| `g2-app` | `@evenrealities/even_hub_sdk` 0.0.16 · `@evenrealities/pretext` 0.1.4 · `jsqr` 1.4.0 (lazy chunk) · `upng-js` 2.1.0 · `zod` 4.4.3 · Vite 8.0.11 (dev) | Built into `packages/g2-app/dist` (the `.ehpk` + Pages `/app/`), relative `base`, no CDN assets. `app.json` version = package version, `min_sdk_version` 0.0.16, whitelist = relay (`https://` + `wss://`), `camera`. |
| `foundry-module` | `qrcode` 1.5.4 · `zod` 4.4.3 · `@evf/shared-protocol` · `tsup` 8.5.1 (dev) | Foundry ≥ 13.347 (v14 verified), dnd5e ≥ 5.3.3, midi-qol optional (`recommends`). socketlib **not used**. |
| `relay` | — (Workers runtime) · `wrangler` 4.140.0 · `@cloudflare/workers-types` (dev) | Cloudflare Worker + `Room` Durable Object (SQLite class, Hibernation API); free plan: 100k requests/day, outgoing WS free, incoming 20:1. |
| `shared-protocol` | `zod` 4.4.3 · WebCrypto (AES-256-GCM, HKDF-SHA256) | Zod = single source of truth for wire shapes; `direct/` envelope/messages/pairing/map. |
| `shared-render` | — | ASCII grid (`./ascii-grid` browser-safe subpath) + `src/pixel/` renderer + INV-1 matchers (test-only, never in the browser bundle). |
| `validation-harness` | `zod` 4.4.3 · `upng-js` 2.1.0 · `csv-stringify` 6.5.2 · `@evf/shared-protocol` · `tsx` | GO/NO-GO scripts, `inv:all`, `validate:relay`. |
| Workspace tooling | TypeScript 5.8.3 · pnpm 10.33.4 · Node 24 LTS (`.nvmrc`) · Vitest 4.1.5 + `@vitest/coverage-v8` 4.1.5 · happy-dom 20.9.0 · Biome 2.4.15 · Changesets 2.31.0 · Playwright 1.59.1 · commitlint + husky | Stay on TS 5.8.x until the ecosystem (Vitest, Biome) catches up with 6.x. |

### Removed in v0.12.0 (ADR-0016)

`packages/bridge` (Fastify 5, `@fastify/{websocket,cors,rate-limit}`, `ws`, `pino`, `prom-client`, in-memory token/cache, `sharp` portrait renderer), `packages/foundry-mcp` (`@modelcontextprotocol/sdk`, stdio/Streamable HTTP), `deploy/` (Docker Compose, `node:24-alpine` images, GHCR `evf-bridge`), Deepgram voice proxy and g2-app audio capture, socketlib `executeAsGM`, standalone `g2-app-dist.zip`, bearer registry / PairModal, canvas-extractor + headless player-view capture, `image-q` / `xxhash-wasm` raster stack, LayerManager + panel substrates (`showcase`/`canvas`/`hybrid`/`glyph`), `scripts/sim.sh`. Do not reintroduce any of them without a new ADR.

### What NOT to use

| Avoid | Why | Use instead |
|---|---|---|
| A per-table server / bridge, or the phone logging into Foundry | ADR-0019: Foundry ≥ 14.361 won't render module HTML; no GM-free phone identity (#14728); Forge gate; store whitelist is fixed | The shared opaque relay on a fixed origin (`packages/relay`) + the player's tab as projector |
| Plaintext payloads on the relay | The relay is a third party | Sealed envelopes (`@evf/shared-protocol` `direct/envelope.ts`) |
| A Foundry-served page (`/modules/<id>/…html`) | `text/plain` since 14.361 | GitHub Pages `/app/` or the `.ehpk` |
| socketlib / `activity.use()` outside `foundry-module/src/write-path` | ADR-0011 single-workflow-origin; CI Gates 8/9 | `dispatchTool` in the GM-client projector |
| `jimp`, `pngjs`, `fast-png`, `pako`/`fflate` for the map | Wrong dither / bit depth / double compression (§11.5.7) | `upng-js` 4-bit exact palette + per-tile hashes (SDK LZ4 in transit) |
| Image tiles off the (0,0)-anchored 288×144 grid | Real G2 host rejects the page (d97b12e); simulator hides it | 2×2 tile grid (Specs §7.0) |
| React / Vue / Svelte in `g2-app` | Glasses output is SDK container calls; phone page is plain DOM | Plain TS modules + app store |
| ESLint + Prettier, Jest, `ts-node` | Dual tooling / ESM pain / deprecated | Biome, Vitest, `tsx` |
| EvenAI native LLM | No developer API (§3.6) | — (voice/MCP only via a future ADR) |
| Wildcards in `app.json` whitelist | Even Hub forbids them | Origin-complete relay URL (`https://` + `wss://`), checked by CI Gate 10 |

### Version compatibility

| A | Compatible with | Notes |
|---|---|---|
| `@evenrealities/even_hub_sdk` 0.0.16 | Even Realities App ≥ 2.2.10 (packer stamps `min_app_version` 2.2.10) | See `docs/firmware-compatibility.md`. |
| `evenfoundryvtt` module | Foundry ≥ 13.347 (v14 verified) · dnd5e ≥ 5.3.3 | v12 not supported (Activity system). |
| `wrangler` 4.140.0 | Workers runtime `compatibility_date` 2026-09-01 | Relay dev/deploy; the CI E2E runs `wrangler dev`. |
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
Active feature: **004-relay-pairing** (v0.13.0, ADR-0019) — the player's own Foundry tab is the
projector, the phone never logs into Foundry: opaque E2E relay (`packages/relay`, Cloudflare Worker
+ Durable Object), one QR / 16-char code, no GM; glasses app as Even Hub `.ehpk` + GitHub Pages
`/app/` + Vite dev. Implemented; open items = maintainer one-time setup and hardware UAT (tasks
Phase 7). Read `specs/004-relay-pairing/plan.md` (spec, research, tasks alongside).
<!-- SPECKIT END -->
