---
phase: quick-260605-hd5
plan: "01"
subsystem: tooling
tags: [simulator, dev-loop, fixtures, harness, g2-app]
dependency_graph:
  requires: [packages/bridge/src/routes/character.test.ts, packages/shared-protocol/src/payloads/character.ts]
  provides: [scripts/sim.sh, scripts/sim-fixtures/, docs/simulator-testing.md]
  affects: [package.json, README.md, .gitignore]
tech_stack:
  added: []
  patterns: [bash harness, fuser-k teardown, xvfb headless GTK, schema-valid JSON fixtures]
key_files:
  created:
    - scripts/sim.sh
    - scripts/sim-fixtures/roster.json
    - scripts/sim-fixtures/character-artemis.json
    - scripts/sim-fixtures/character-dante.json
    - scripts/sim-fixtures/character-karius.json
    - scripts/sim-fixtures/character-shin.json
    - scripts/sim-fixtures/README.md
    - docs/simulator-testing.md
  modified:
    - package.json
    - README.md
    - .gitignore
decisions:
  - "Teardown via fuser -k PORT/tcp, not process-name kill (self-match footgun)"
  - "GTK env block exported only when DISPLAY is unset — no-op on desktop"
  - "roster.json seeded before character files so the list is always available"
  - "DEV_SECRET=dev-secret committed as throwaway local value per threat model T-hd5-02"
metrics:
  duration: "12 min"
  completed: "2026-06-05"
  tasks: 3
  files_changed: 11
---

# Phase quick-260605-hd5 Plan 01: Sim Harness Summary

One-command `pnpm sim start` harness encoding the proven EvenHub simulator dev/test recipe
(bridge no-auth + fixture seeding + vite + GTK headless launch) with 4 schema-valid PC fixtures.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema-valid sim fixtures | 620cb2b | 6 files in scripts/sim-fixtures/ |
| 2 | sim.sh harness + package.json/README/.gitignore | f64b074 | scripts/sim.sh, package.json, README.md, .gitignore |
| 3 | Live verify + docs/simulator-testing.md | e87981b | docs/simulator-testing.md (chmod +x sim.sh) |

## What Was Built

**scripts/sim.sh** (165 lines, `set -euo pipefail`) — start/stop/seed/shot subcommands:
- `start`: idempotent `fuser -k` teardown, bridge + vite + simulator launch with `wait_http` gates
- `stop`: `fuser -k 8911/tcp 5173/tcp 9898/tcp` (no process-name kill)
- `seed`: POST all 5 fixtures to `/internal/delta` in order (roster first)
- `shot`: `curl /api/screenshot/glasses` to a PNG path

**scripts/sim-fixtures/** — 5 committed JSON files:
- `roster.json`: `r1.characters.available`, 4 level-10 PCs, `source: foundry-world`, `count: 4`
- `character-artemis.json`: hp 55/88, ac 18, actorId E14Tfh9Ba07cpPyM
- `character-dante.json`: hp 41/63, ac 16, actorId 6KWxQXAiJgz4zKlS
- `character-karius.json`: hp 70/70, ac 20, actorId 4GXG7ufxylS4H1Pk
- `character-shin.json`: hp 12/48, ac 14, actorId VoNfASW4hQ4dG4cv

**docs/simulator-testing.md** — prerequisites, one-command loop, observation API, no-auth model, teardown.

## Live Verification Results

All verified live in-session (2026-06-05):

- `pnpm sim start`: bridge up on :8911, fixtures seeded (all `"ok":true`), vite up on :5173, EvenHub simulator up on :9898
- 4x `GET /v1/character/:actorId` → HTTP 200 (authoritative schema-validity proof)
- `pnpm sim shot /tmp/glasses-artemis.png` → 6842 bytes
- `pnpm sim start --actor 6KWxQXAiJgz4zKlS` (Dante) → `pnpm sim shot /tmp/glasses-dante.png` → 6942 bytes
- `pnpm sim stop` → ports 8911/5173/9898 freed (curl fails with "Could not connect")
- `pnpm lint:ci` → exit 0 (313 warnings, 0 errors — pre-existing in the workspace)

## Deviations from Plan

**1. [Rule 1 - Bug] Removed pkill -f from comments to pass verification grep**
- Found during: Task 2 automated verification
- Issue: the plan's verification check uses `grep -q 'pkill -f' scripts/sim.sh` as a negative gate (if present → FAIL). The script's JSDoc comments included the literal `pkill -f` as documentation of the footgun to avoid.
- Fix: Rephrased comments to use "process-name-based kill" wording without the literal `pkill -f` string.
- Files: scripts/sim.sh

**No other deviations** — plan executed as written.

## Known Stubs

None. All fixtures are fully populated schema-valid JSON. The harness produces real bridge
responses (HTTP 200 with full CharacterSnapshot bodies).

## Threat Flags

None. This plan is additive operational tooling (scripts + docs + fixtures). No new network
endpoints, auth paths, or trust boundaries introduced. Bridge runs in dev-no-auth mode per
existing `isDevNoAuth()` contract. See PLAN.md threat model for T-hd5-01/02/SC dispositions.

## Self-Check: PASSED

- scripts/sim.sh: EXISTS, executable, bash -n clean
- scripts/sim-fixtures/roster.json: EXISTS
- scripts/sim-fixtures/character-artemis.json: EXISTS
- scripts/sim-fixtures/character-dante.json: EXISTS
- scripts/sim-fixtures/character-karius.json: EXISTS
- scripts/sim-fixtures/character-shin.json: EXISTS
- docs/simulator-testing.md: EXISTS, >60 lines
- package.json: valid JSON, contains `"sim": "bash scripts/sim.sh"`
- Commits 620cb2b, f64b074, e87981b: all present in git log
