---
phase: EVF-19-release-distribution
plan: "02"
subsystem: docs
tags: [readme, installation, ghcr, inv-3, release-docs, runbook]

# Dependency graph
requires:
  - phase: EVF-19-01
    provides: "REL-01..04 pipeline artifacts (ghcr.io/aiacos/evf-bridge:<version>+:latest, g2-app-dist.zip, releases/latest/download/module.json)"
provides:
  - "REL-05: README ## Installation documenting all 3 components (foundry-module + bridge + g2-app)"
  - "docs/release/bridge.md: GHCR operator runbook + first-push visibility note"
  - "Specs.md changelog stanza for Phase 19 (REL-01..05)"
  - "INV-3 atomic: README.md + Specs.md + docs/showcase/index.html in one commit"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "INV-3 atomic doc-coherence: README + Specs.md changelog + showcase in single commit (established Phase 14-18 pattern)"
    - "docs/release/bridge.md operator runbook mirroring docs/release/foundry-module.md structure"

key-files:
  created:
    - "docs/release/bridge.md"
    - ".planning/phases/EVF-19-release-distribution/19-02-SUMMARY.md"
  modified:
    - "README.md"
    - "Specs.md"
    - "docs/showcase/index.html"

key-decisions:
  - "README ## Quick install replaced with ## Installation (3 components, single source of truth — no duplicate)"
  - "README uses ghcr.io/aiacos/evf-bridge:latest as user-facing default; version-pinned tags noted on Releases page (resolved RESEARCH Open Q3)"
  - "docs/release/bridge.md documents build: left intact in docker-compose.yml; image: substitution is operator-side opt-in (RESEARCH Pitfall 6 resolved)"
  - "Specs.md changelog stanza: no spec version bump — tooling/distribution only, mirrors 2026-05-25 GitFlow pattern"
  - "docs/showcase closing paragraph prepended with distribution note (Phase 19 artifacts + README link) without altering version stats"

# Metrics
duration: 15min
completed: 2026-05-31
---

# Phase 19 Plan 02: Release & Distribution Docs Summary

**README ## Installation section (3 components), bridge GHCR operator runbook, and INV-3 atomic Specs.md changelog + showcase coherence — REL-05 closed**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-31T00:00:00Z
- **Completed:** 2026-05-31T01:17:00Z
- **Tasks:** 2 (Task 1 = runbook, Task 2 = README + INV-3 atomic)
- **Files modified:** 4 (docs/release/bridge.md created; README.md, Specs.md, docs/showcase/index.html updated)

## Accomplishments

- Created `docs/release/bridge.md` — operator runbook mirroring `docs/release/foundry-module.md` structure, documenting GHCR image location, one-time first-push private→public visibility flip (the key operational note surfaced by Plan 01), `docker pull` + optional compose `image:` substitution (keeping `build:` intact), and env-var contract via `deploy/.env.example`
- Replaced README `## Quick install` with `## Installation` covering all 3 components: (1) Foundry Module via manifest URL `releases/latest/download/module.json`, (2) Bridge via `docker pull ghcr.io/aiacos/evf-bridge:latest` + Docker Compose, (3) G2 App via `g2-app-dist.zip` from GitHub Release → serve `dist/` from HTTPS static host
- Added Specs.md changelog stanza (newest-first) for Phase 19 REL-01..05 with explicit "No spec version bump" line and INV-3 coherence line — mirrors the 2026-05-25 GitFlow entry pattern
- Updated `docs/showcase/index.html` closing paragraph with Phase 19 distribution note (artifact identifiers + README link) without changing version stats
- INV-3 atomic commit verified: `git show --name-only HEAD` lists README.md + Specs.md + docs/showcase/index.html together (commit `23fe555`)

## Task Commits

1. **Task 1 — bridge GHCR runbook** - `ac9d8a0` (docs)
   - `docs/release/bridge.md` created

2. **Task 2 — README Installation + INV-3 atomic** - `23fe555` (docs)
   - `README.md`, `Specs.md`, `docs/showcase/index.html` updated atomically

**Plan metadata:** committed with SUMMARY.md

## Files Created/Modified

- `docs/release/bridge.md` — new GHCR operator runbook: image location, first-push visibility flip, docker pull, compose image: substitution, env contract
- `README.md` — `## Quick install` replaced with `## Installation` (3 components: foundry-module + bridge + g2-app); artifact names match 19-01-SUMMARY exactly
- `Specs.md` — Phase 19 changelog stanza added (newest-first after ## Changelog heading); no version bump
- `docs/showcase/index.html` — closing paragraph prepended with Phase 19 distribution note

## Decisions Made

- README single source of truth: `## Quick install` removed, `## Installation` is the canonical 3-component section; no redundant copy
- `ghcr.io/aiacos/evf-bridge:latest` in README user-facing instruction; version-pinned tags noted on Releases page (RESEARCH Open Q3)
- `docs/release/bridge.md` leaves `build:` in docker-compose.yml untouched; documents `image:` as operator opt-in (RESEARCH Pitfall 6)
- Specs.md changelog stanza format: matches 2026-05-25 GitFlow entry (INV-3 line + Re-verified line + No spec version bump line)
- showcase: prepend only, no version stat changes (no version bump this plan)

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria verified before each commit.

## Known Stubs

None. This plan adds documentation only; no application code or stubs introduced.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Docs-only change.

- **T-19-06** (Information Disclosure / install docs env guidance): Mitigated — `EVF_INTERNAL_SECRET` instructs `openssl rand -base64 32`; no literal secrets; `EVF_PLUGIN_HOST_URL` documented as origin-complete no-wildcards per §3.3
- **T-19-07** (Tampering / INV-3 doc drift): Mitigated — INV-3 atomic commit `23fe555` contains README + Specs.md + showcase in one commit; verified via `git show --name-only`
- **T-19-08** (Spoofing / install-source authenticity): Accepted-with-control — docs point only at `github.com/Aiacos/EvenFoundryVTT` releases + `ghcr.io/aiacos/evf-bridge`; no third-party mirrors
- **T-19-SC** (Supply chain): Mitigated — docs-only; no npm/pip/cargo installs; CI Gate 8 socketlib=17 untouched

## User Setup Required

**GHCR first-push manual step (one-time, post-first-release, documented in `docs/release/bridge.md`):**
After the first real release that pushes the bridge image:
1. Navigate to: GitHub → Profile → Packages → `evf-bridge` → Package settings → Change visibility → Public
2. Verify: `docker pull ghcr.io/aiacos/evf-bridge:latest` succeeds without authentication

End-to-end install validation (Foundry manifest install, `docker pull` of the published image, serving extracted g2-app dist) requires a published release + Even Hub/Foundry runtime — `human_needed` per ADR-0005.

## Self-Check

- [x] `docs/release/bridge.md` exists and has `ghcr.io/aiacos/evf-bridge` + `visibility` + `EVF_INTERNAL_SECRET`
- [x] `README.md` has exactly 1 `## Installation` heading; 3 artifact refs verified (`releases/latest/download/module.json`, `ghcr.io/aiacos/evf-bridge`, `g2-app-dist.zip`)
- [x] `Specs.md` has `Release & Distribution` + "No spec version bump" in changelog
- [x] INV-3 atomicity: `git show --name-only 23fe555` lists README.md + Specs.md + docs/showcase/index.html
- [x] Commit `ac9d8a0` (Task 1) exists in git log
- [x] Commit `23fe555` (Task 2) exists in git log
- [x] 2859 tests pass (`pnpm test` exit 0)
- [x] `pnpm lint:ci` exit 0 (290 warnings, 0 errors)
- [x] `pnpm typecheck` exit 0
- [x] socketlib handler count = 17 (no socketlib files touched)

## Self-Check: PASSED

---
*Phase: EVF-19-release-distribution*
*Completed: 2026-05-31*
