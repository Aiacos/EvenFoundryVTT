# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**Design-only.** There is no application code yet — no build, no lint, no test. The repo currently contains exactly four artifacts:

- `Specs.md` (~4040 lines, **canonical source of truth**, v0.9.10) — requirements, hardware constraints, APIs, data models, UI/UX with ASCII mockups, layered raster pipeline, optional V2 MCP voice module, 13-week MVP roadmap, risk register
- `README.md` — projection of `Specs.md` for GitHub readers; must stay coherent (see INV-3)
- `docs/showcase/index.html` — animated single-file showcase deployed to GitHub Pages; another projection of the spec
- `docs/index.html` — root redirect to `/showcase/`
- `LICENSE` (MIT)

When code starts landing (Phase 1+), update this file with real build/lint/test commands.

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
