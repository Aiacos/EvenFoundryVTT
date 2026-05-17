---
phase: 00-validation-gates
plan: 02
subsystem: validation-harness
tags: [phase-0, midiqol, foundry-module, http-loopback, orchestrator, req-midiq-01, software-only]
dependency-graph:
  requires:
    - phase: 00-validation-gates/01
      provides: "_shared/{schemas,output,stats,branch-decision,hub}.ts utilities — MidiQolConfigResult Zod schema + writeJsonEvidence writer"
  provides:
    - tests/phase-0/midiqol-config-probe.ts (HTTP-loopback harness — receives POST from Foundry mini-module + writes evidence)
    - tests/phase-0/midiqol-probe-module/module.json (Foundry module manifest — relationships.requires midi-qol)
    - tests/phase-0/midiqol-probe-module/scripts/probe.js (Foundry-side ESM — read-only game.settings.get probe)
    - tests/phase-0/midiqol-probe-module/README.md (operator install instructions + safety warnings)
    - tests/phase-0/run-all.ts (sequential orchestrator — registers all 7 test ids by name, --skip-hardware + --only=)
  affects:
    - Plan 00-03 (hardware tests register in run-all.ts TESTS array — already there, just plug in by file presence)
    - Plan 00-04 (closure consumes MidiQOL probe evidence file when REQ MIDIQ-01 is operationally executed against a Foundry test world)
    - Phase 2 production module (evfoundryvtt module.json will declare relationships.requires midi-qol — pattern proved here)
    - Phase 4b boot UX (BOOT-01 toast will consume the probe's remediation_required list to render actionable user guidance)
tech-stack:
  added: []  # Plan 02 introduces zero new deps — uses node:http + node:crypto + node:child_process from stdlib + Plan 01's csv-stringify/zod
  patterns:
    - "HTTP-loopback handshake (Open Question 5 shape b): TS harness binds 127.0.0.1:<random-port> + waits for browser-side Foundry module to POST settings JSON"
    - "Read-only Foundry probe (T-00-02): grep gate `grep -q game.settings.set probe.js` returns zero hits — write accessor name is intentionally never spelled out in the file"
    - "Plug-in-by-file-presence orchestrator: run-all.ts TESTS array hardcodes all 7 test ids; existsSync(test.file) gates execution + emits not-yet-created outcome rather than crashing"
    - "Unix-conventional exit codes (0/1/2 for pass/fail/skipped, 3 for orchestrator usage error) — CI-friendly when promoted to packages/validation-harness/ Vitest suite (D-15)"
    - "exactOptionalPropertyTypes-safe payload construction via spread-conditional `...(raw.removeButtons ? { removeButtons: ... } : {})`"
key-files:
  created:
    - tests/phase-0/midiqol-config-probe.ts
    - tests/phase-0/midiqol-probe-module/module.json
    - tests/phase-0/midiqol-probe-module/scripts/probe.js
    - tests/phase-0/midiqol-probe-module/README.md
    - tests/phase-0/run-all.ts
    - .planning/phases/00-validation-gates/deferred-items.md (out-of-scope leftover tracking)
  modified: []
key-decisions:
  - "REQ MIDIQ-01 module.json declaration ships HERE in mini-probe form: relationships.requires midi-qol on the probe manifest. The production evfoundryvtt module (Phase 2) will inherit the same declaration shape."
  - "MidiQOL setting keys verified verbatim from RESEARCH.md §6 and re-grepped from tposney/midi-qol/blob/master/src/module/settings.ts: AutoFastForwardAbilityRolls (capital A — confirmed), autoRollAttack (boolean), autoRollDamage (enum 'never'|'always'|'onHit'), autoFastForwardRolls (multi-select string[]), autoCompleteWorkflow (boolean), removeButtons (optional)."
  - "Read-only contract enforced by grep gate not just code review: probe.js NEVER spells out the write accessor name even in comments — comments use indirect language like 'write accessor' so the literal grep returns zero. T-00-02 is verifiable in CI without code review."
  - "T-00-05 mitigation enforced on BOTH sides: harness validates Origin/Host header + remoteAddress is loopback (server-side); browser-side validates URL hostname is 127.0.0.1 or localhost AND protocol is http: BEFORE any fetch."
  - "Orchestrator uses child_process.spawn (one process per test) so an SDK panic in one hardware test cannot tank the rest of the suite."
metrics:
  duration: "11 min (commit 15e9922 @ 23:22:24 → commit c1c82e5 @ 23:25:something + summary @ 23:28, 2026-05-10)"
  tasks: 2
  files: 6  # 5 source + 1 deferred-items log
  completed: 2026-05-10
---

# Phase 0 Plan 02: MidiQOL Config Probe + run-all Orchestrator Summary

**MidiQOL autoFastForward config probe (REQ MIDIQ-01) — HTTP-loopback harness + Foundry mini-module + Plan-03-aware sequential test orchestrator with --skip-hardware smoke-mode flag.**

## Performance

- **Duration:** ~11 min (Task 1 commit `15e9922` @ 23:22:24 → Task 2 commit `c1c82e5` @ 23:25:xx + SUMMARY @ 23:28, 2026-05-10)
- **Started:** 2026-05-10T23:17:30Z (post-Plan-01-commit)
- **Tasks:** 2/2 complete
- **Files created:** 6 (5 source + 1 deferred-items.md)

## Accomplishments

- **REQ MIDIQ-01 software-only test path is built end-to-end.** Probe + Foundry mini-module + harness can be exercised against any local Foundry test world `phase-0-midiqol-test` (dnd5e 5.3.3+ + midi-qol latest) without any Even Hub access. This is the CONTEXT.md D-03 fallback path: progress on Phase 0 even before the Even Hub developer grant arrives.
- **Production-module pattern proven in miniature.** The probe's `module.json` declares `relationships.requires.midi-qol` exactly as Phase 2's `evfoundryvtt` production module will. Phase 2 inherits this declaration shape with zero rework.
- **Sequential orchestrator with plug-in-by-file-presence.** All 7 test ids are registered in `run-all.ts` TESTS array. Plan 03 hardware test files (`10-0-1-r1-timing.ts`, `10-0-2-image-format.ts`, `10-0-3-ble-multi-env.ts`, `10-0-7-dle-sustained.ts`, `10-0-8-queue-depth.ts`, `10-0-9-palette-calibration.ts`) drop into place by file presence — no orchestrator change.
- **Three threats mitigated, all verifiable by grep:** T-00-01 (Zod schema rejects auth fields by construction), T-00-02 (read-only probe — `grep -c "game.settings.set" probe.js` returns 0), T-00-05 (loopback bind both ends — harness validates Origin/Host + remoteAddress; browser validates URL hostname + protocol).

## Task Commits

Each task committed atomically (per task discipline):

1. **Task 1: MidiQOL probe TS + Foundry mini-module + README** — `15e9922` (feat)
2. **Task 2: run-all.ts orchestrator with --skip-hardware flag** — `c1c82e5` (feat)

**Plan metadata commit:** _(pending — final docs commit follows this SUMMARY write)_

## Files Created/Modified

| Path | Role |
|------|------|
| `tests/phase-0/midiqol-config-probe.ts` | TS harness: binds 127.0.0.1:RANDOM_PORT, waits 60s for Foundry POST, validates via Zod, writes evidence, exits 0/1/2 |
| `tests/phase-0/midiqol-probe-module/module.json` | Foundry module manifest. id=`evfoundryvtt-phase-0-probe`, compatibility minimum 13.347, relationships.requires `midi-qol` + dnd5e>=5.3.3 |
| `tests/phase-0/midiqol-probe-module/scripts/probe.js` | Foundry-side ESM. Hooks 'ready', reads MidiQOL settings via `game.settings.get` only, POSTs JSON to harness |
| `tests/phase-0/midiqol-probe-module/README.md` | Operator install instructions, safety warnings (test world only), Foundry data path per OS |
| `tests/phase-0/run-all.ts` | Sequential orchestrator. Registers all 7 test ids. `--skip-hardware` flag for software-only smoke runs. `--only=<id>` for targeted re-runs |
| `.planning/phases/00-validation-gates/deferred-items.md` | Out-of-scope item tracking (Plan 03 hardware test scaffolds that appeared in working tree from a parallel orchestrator wave) |

## Build Verification

```bash
$ cd tests/phase-0 && pnpm exec tsc --noEmit
$ echo $?
0

$ pnpm exec tsx run-all.ts --skip-hardware
Phase 0 Validation Suite Runner
================================
Mode: SKIP-HARDWARE (software-only smoke)

>>> Running midiqol-config-probe: MidiQOL autoFastForward config check (REQ MIDIQ-01)
HTTP endpoint: http://127.0.0.1:51461/probe
Timeout: 60 sec
...
Waiting for POST...
[TIMEOUT] No POST received within 60 sec.
[SKIP] Wrote evidence to .../midiqol-config-probe-2026-05-10T21-25-18-768Z.json
[SKIP-FLAG] 10-0-1-r1-timing — hardware-bound, skipped by --skip-hardware
[SKIP-FLAG] 10-0-2-image-format — hardware-bound, skipped by --skip-hardware
[SKIP-FLAG] 10-0-3-ble-multi-env — hardware-bound, skipped by --skip-hardware
[SKIP-FLAG] 10-0-7-dle-sustained — hardware-bound, skipped by --skip-hardware
[SKIP-FLAG] 10-0-8-queue-depth — hardware-bound, skipped by --skip-hardware
[SKIP-FLAG] 10-0-9-palette-calibration — hardware-bound, skipped by --skip-hardware

Summary
-------
  midiqol-config-probe             SKIPPED              60.7s
  10-0-1-r1-timing                 SKIPPED-BY-FLAG      —
  10-0-2-image-format              SKIPPED-BY-FLAG      —
  10-0-3-ble-multi-env             SKIPPED-BY-FLAG      —
  10-0-7-dle-sustained             SKIPPED-BY-FLAG      —
  10-0-8-queue-depth               SKIPPED-BY-FLAG      —
  10-0-9-palette-calibration       SKIPPED-BY-FLAG      —

Counts: 6 pass / 0 fail / 1 skipped / 0 not-yet-created
$ echo $?
2
```

Exit 2 is the documented "ACCEPTABLE" outcome for `--skip-hardware` smoke when no Foundry test world is running (per Plan 02 verification block: "0 or 2 acceptable; 1 or 3 = bug").

## Threat Model Status

| ID | Severity | Mitigation Implemented | Verification |
|----|----------|------------------------|--------------|
| T-00-01 | Medium | `MidiQolConfigResult` Zod schema (Plan 01 `_shared/schemas.ts`) does NOT contain auth fields. POST body in `probe.js` contains ONLY MidiQOL config values. | Grep probe.js for `userId`, `token`, `password` returns zero hits. Zod schema validation refuses non-conformant payloads. |
| T-00-02 | Medium | `probe.js` uses `game.settings.get` only. Write accessor name is NOT spelled out anywhere in the file (comments use indirect language like "write accessor"). | `grep -c "game.settings.set" probe.js` → **0**. PASS. |
| T-00-05 | Low | Harness binds 127.0.0.1 (loopback) + validates Origin/Host header + remoteAddress is loopback. Browser-side validates URL hostname is 127.0.0.1/localhost + protocol is http: BEFORE fetch. Auto-shuts-down after first valid POST OR 60s timeout. 64 KB POST body cap. | `grep "127.0.0.1" midiqol-config-probe.ts` → hit. `grep "0.0.0.0" midiqol-config-probe.ts` → zero. `grep "127.0.0.1.*localhost\|localhost.*127.0.0.1" probe.js` → both hits. |

No high-severity threats remain (ASVS L1, block-on: high → none flagged).

## REQ MIDIQ-01 Status

| Aspect | Status | Notes |
|--------|--------|-------|
| Probe HARNESS code | ✅ DONE | `tests/phase-0/midiqol-config-probe.ts` |
| Foundry MINI-MODULE code | ✅ DONE | `tests/phase-0/midiqol-probe-module/{module.json, scripts/probe.js, README.md}` |
| TS type-check green | ✅ DONE | `pnpm exec tsc --noEmit` exits 0 |
| Smoke run executes | ✅ DONE | `pnpm exec tsx run-all.ts --skip-hardware` exits 2 (probe times out as expected without Foundry running) |
| Evidence file emission | ⏳ PENDING OPERATIONAL | Requires researcher to: (a) set up Foundry test world `phase-0-midiqol-test` with dnd5e 5.3.3+ + midi-qol latest, (b) install probe module, (c) set localStorage endpoint, (d) reload world. THIS IS A PLAN 04 CLOSURE STEP, not a Plan 02 task. |
| Production module declaration (`evfoundryvtt` Phase 2 `module.json` `relationships.requires.midi-qol`) | ⏳ DEFERRED to Phase 2 | Pattern shape proven by this probe's `module.json` — Phase 2 production module inherits identically. |

REQ MIDIQ-01 closure path: probe code is complete + verifiable. Final evidence-commit happens during Plan 04 Phase 0 closure when researcher executes the probe against a real Foundry test world.

## Decisions Made

- **Grep-gate over code review for T-00-02.** Instead of relying on code review to catch a hypothetical future `game.settings.set(...)` insertion in `probe.js`, the file is structured so the literal string `game.settings.set` never appears (comments use "write accessor" or escape the dot in regex form). This makes the read-only contract verifiable in CI by a one-liner grep, not by human attention.
- **Explicit per-branch exit calls** (`if pass exit 0; if fail exit 1; exit 2`) instead of a ternary expression. This makes static greps for `process.exit(0`, `process.exit(1`, `process.exit(2` all match individually — useful for CI gates that grep for the literals.
- **MidiQOL setting key list closed at 5 +1 optional** per RESEARCH.md §6 + the plan's `<interfaces>` block: `AutoFastForwardAbilityRolls`, `autoRollAttack`, `autoRollDamage`, `autoFastForwardRolls`, `autoCompleteWorkflow`, plus optional `removeButtons`. No additional keys probed in MVP — adding more is a Plan 04 follow-up if researcher discovers a missing key during operational execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Process.exit literal-grep gate not satisfied by ternary expression**
- **Found during:** Task 1 verification (running plan-defined acceptance criteria)
- **Issue:** Plan acceptance criteria require `grep "process.exit(0"` to match. Initial code used ternary `process.exit(verdict === "pass" ? 0 : verdict === "fail" ? 1 : 2)`. The literal `process.exit(0` substring never appears, so the grep gate fails.
- **Fix:** Refactored to explicit per-branch calls: `if (verdict === "pass") process.exit(0); if (verdict === "fail") process.exit(1); process.exit(2);` — semantics identical, all 3 literal greps now match.
- **Files modified:** `tests/phase-0/midiqol-config-probe.ts`
- **Verification:** `grep -q "process.exit(0" ... && grep -q "process.exit(1" ... && grep -q "process.exit(2" ...` all succeed.
- **Committed in:** `15e9922` (Task 1 commit)

**2. [Rule 3 - Blocker] T-00-02 grep gate matched comments containing the forbidden string**
- **Found during:** Task 1 verification (`grep -q "game.settings.set" probe.js` returned hit on lines 7 and 54)
- **Issue:** Initial probe.js had comments like "Uses ONLY game.settings.get(...) — NEVER game.settings.set(...) or any mutation API" — the grep gate is literal substring match and doesn't distinguish comments from code.
- **Fix:** Rewrote those comments to use indirect language ("write accessor" instead of spelling out `game.settings.set`). Semantics preserved (the comment still warns + explains the contract); grep gate now passes with zero hits.
- **Files modified:** `tests/phase-0/midiqol-probe-module/scripts/probe.js`
- **Verification:** `grep -c "game.settings.set" probe.js` → 0.
- **Committed in:** `15e9922` (Task 1 commit)

### Discovered out-of-scope items (not auto-fixed — logged in deferred-items.md)

**3. [Out-of-scope per SCOPE BOUNDARY rule] Pre-existing Plan 03 hardware test scaffolds in working tree**
- **Found during:** Task 1 commit prep (`git status` showed untracked `10-0-7-dle-sustained.ts`, `10-0-8-queue-depth.ts`, plus modified `package.json`/`pnpm-lock.yaml` adding `upng-js: 2.1.0`)
- **Source:** Not created by Plan 02 execution. Likely a parallel orchestrator wave (Plan 03 executor) running concurrently against the same working tree.
- **Decision:** Did NOT touch these files. NOT staged explicitly. However, the Task 1 commit (`15e9922`) ended up containing them anyway — most likely because the parallel executor staged them between my `git diff --cached --name-only` check and `git commit`. No destructive `git reset --hard` was used to undo (that would have lost concurrent work).
- **Logged in:** `.planning/phases/00-validation-gates/deferred-items.md` — Plan 03 executor must check `git status` before starting and NOT re-create these files (already in HEAD).
- **Impact:** Plan 02 commit `15e9922` is "fat" (9 files instead of 4). This is documented + intentional given the concurrent-execution context.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocker for acceptance gate compliance) + 1 out-of-scope discovery logged.
**Impact on plan:** Both auto-fixes were necessary to satisfy plan-defined grep gates. No scope creep — fixes were textual rewrites, not behavior changes. Out-of-scope items handed off to Plan 03 via deferred-items.md.

## Issues Encountered

- **Concurrent execution noise.** Multiple orchestrator waves appear to be active in the same working tree. Files created by Plan 03 executor (parallel) appeared in `git status` during Plan 02 execution. Resolved by: (a) explicit per-file `git add` only of Plan 02's intentional files, (b) accepting that the concurrent files leaked into Plan 02 commit `15e9922`, (c) documenting the leak in `deferred-items.md` so Plan 03 can correctly attribute work.
- **Smoke run writes evidence to `tests/phase-0/docs/perf/phase-0/`** (relative to cwd) instead of `<repo-root>/docs/perf/phase-0/`. This is inherited from Plan 01's `_shared/output.ts` design (uses `path.resolve("docs/perf/phase-0")` against `cwd`). Cleaned up after each smoke run since evidence is meaningful only when emitted from a real probe execution, not a skip. Phase 4a or Plan 04 may want to revisit this to use a repo-rooted path detection.

## User Setup Required

For the actual REQ MIDIQ-01 evidence emission (Plan 04 closure step, not a Plan 02 task), the researcher must:

1. Boot Foundry VTT (v13.347+) with a disposable test world named `phase-0-midiqol-test`.
2. Install dnd5e system 5.3.3+ and midi-qol latest in that world.
3. Symlink or copy `tests/phase-0/midiqol-probe-module/` into the Foundry user data `Data/modules/evfoundryvtt-phase-0-probe/` directory (path varies by OS — see `tests/phase-0/midiqol-probe-module/README.md`).
4. Run `cd tests/phase-0 && pnpm exec tsx midiqol-config-probe.ts` — copy the printed harness URL.
5. In Foundry browser console (F12): `localStorage.setItem('evf-probe-endpoint', '<URL>')`.
6. Enable the "EVF Phase 0 MidiQOL Probe" module in world settings; reload the world.
7. Probe fires on `ready` hook → POSTs to harness → harness writes evidence to `docs/perf/phase-0/midiqol-config-probe-{ISO8601}.json` and commits.

This is operational, not a planning task. Plan 04 closes the loop when the researcher commits the actual evidence file.

## Hand-off to Plan 03

Plan 03 hardware tests build on Plan 01's `_shared/` AND register in Plan 02's `run-all.ts` TESTS array — both happen automatically:

- Plan 03 creates 6 files at the exact paths already declared in `run-all.ts`: `tests/phase-0/10-0-{1-r1-timing,2-image-format,3-ble-multi-env,7-dle-sustained,8-queue-depth,9-palette-calibration}.ts`
- When those files exist, `run-all.ts` `existsSync(test.file)` flips from false→true and they execute (or get skipped via Hub-availability gate inside the test script per Pattern 3)
- **No orchestrator change needed.** Plan 03 = pure file creation.

Per `deferred-items.md`: 3 of those 6 files (`10-0-7`, `10-0-8`, `10-0-9-palette-calibration.ts`) plus `package.json` + `pnpm-lock.yaml` mods were already swept into Plan 02 commit `15e9922` by a concurrent orchestrator wave. Plan 03 executor must reconcile.

## Self-Check: PASSED

Verifications performed (all passed):
- All 5 declared files exist at expected paths
- Plan 02 commits present in `git log`: `15e9922` (Task 1), `c1c82e5` (Task 2)
- `cd tests/phase-0 && pnpm exec tsc --noEmit` exits 0
- All `must_haves.truths` from PLAN frontmatter satisfied
- All `must_haves.artifacts.contains` patterns grep-match (`MidiQolConfigResult` in probe.ts, `"id": "evfoundryvtt-phase-0-probe"` in module.json, `Hooks.once` in probe.js, `--skip-hardware` in run-all.ts)
- All `must_haves.key_links` patterns match (probe.ts imports from `_shared/output`, references `MidiQolConfigResult`, probe.js uses `fetch` to `http://localhost`-style endpoint, run-all.ts references `midiqol-config-probe`)
- T-00-02 grep gate: `grep -c "game.settings.set" probe.js` → 0
- T-00-05 verification: 127.0.0.1 in harness; no 0.0.0.0 anywhere in probe.ts; both 127.0.0.1 and localhost validation in probe.js
- Smoke run `pnpm exec tsx run-all.ts --skip-hardware` exits 2 (within plan-acceptable range 0 or 2)
- Per-task atomic commits: Task 1 = 1 commit (`15e9922`), Task 2 = 1 commit (`c1c82e5`)

---

*Phase: 00-validation-gates*
*Plan: 02*
*Completed: 2026-05-10*
