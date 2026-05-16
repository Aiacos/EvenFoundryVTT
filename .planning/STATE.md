---
gsd_state_version: 1.0
milestone: v0.9.11
milestone_name: milestone
status: PHASE_7_IN_PROGRESS — Plans 07-01/02/03/04 committed; 2 remaining plans pending.
stopped_at: Completed 06-02-PLAN.md
last_updated: "2026-05-16T13:13:07.029Z"
last_activity: "2026-05-16 — Plan 07-04 complete: MULTI-01 (Path B client-side loop + r1.multiattack.progress envelope + [Atk N/M] CombatTracker chip + multi-attack-progress-dispatcher double trust boundary). 1532 tests pass. socketlib count stays 14. INV-1 fixture generated. SC-07-04 hardware-pending."
progress:
  total_phases: 15
  completed_phases: 8
  total_plans: 45
  completed_plans: 44
  percent: 53
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-10)

**Core value:** Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.
**Current focus:** Phase 4b — overlay-slot-map-mode-toggle-adversarial-ui (next phase; unblocked by Phase 4a closure)

## Current Position

Phase: 7 (foundry-module-write-path — IN PROGRESS)
Plan: 07-04 complete — Wave 2 MULTI-01 multi-attack loop + progress chip. Next: Plan 07-05 (or equivalent).
Status: PHASE_7_IN_PROGRESS — Plans 07-01/02/03/04 committed; 2 remaining plans pending.

Last activity: 2026-05-16 — Plan 07-04 complete: MULTI-01 (Path B client-side loop + r1.multiattack.progress envelope + [Atk N/M] CombatTracker chip + multi-attack-progress-dispatcher double trust boundary). 1532 tests pass. socketlib count stays 14. INV-1 fixture generated. SC-07-04 hardware-pending.

Previous activity: 2026-05-16 — Plan 07-03 complete: AoE template placement (ACT-02). placeTemplateHandler + confirmTemplatePlacementHandler + TemplatePlacementPanel + template-placement-dispatcher. 1492 tests pass. evf.skillCheck slot renamed → evf.confirmTemplatePlacement (socketlib count stays 14).

Previous activity: 2026-05-15 — Phase 4b CLOSED via `defer-hardware-tests` (same pattern as Phase 4a):

  - Planning (3 iterations): NEEDS_REVISION → APPROVED via orchestrator inline fix for B-2 fan-out (commit c6946a7).
  - Wave 0 Plan 01: overlay slot machinery + Panel API + Z1_5_TOAST + panel-gesture-bus + ADR-0009 Amd 1 + 27 i18n keys (+46 tests; merged 41d4741).
  - Wave 1 Plan 02: map mode toggle + Even Hub setLocalStorage persistence + boot read-back SR-11..13 (+17 tests; merged 3faca33).
  - Wave 2 Plans 03/04/06 (sequential foreground; zero `files_modified` overlap):
    - 03 ToastQueueLayer z=1.5 + FIFO + [+N] squash + 3 INV-1 fixtures (+25 tests; merged 774da8f).
    - 04 BootErrorLayer 5 states + dispatch + bootEngineWithErrorUi RETHROW + 10 INV-1 fixtures + B-1 grep gate (+47 tests; merged 8808142).
    - 06 ATOMIC schema: CharacterSnapshotSchema.death + concentration.ts + character-reader + 6-file workspace fan-out in single commit + CN-9/10 EnvelopeSchema round-trip (+23 tests; merged 510cde5).
  - Wave 3 Plan 05: StatusHudRenderer death-saves pivot + ConcentrationDropModalPanel (first real OverlayPanel) + conc-conflict-dispatcher (B-4 closure) + 04b-integration-smoke ISM-01..10 (W-4 closure ISM-05) + 4 INV-1 fixtures (+48 tests; merged 2cb9862).
  - Phase test totals: 669 → 812 (+143 across 6 plans + ADR-0009 Amendment 1 documented). All gates green: typecheck, biome, B-1/W-4 grep gates, 59/59 test files.

Hardware-pending carry-forward (`human_needed` per ADR-0005 PROVISIONAL Branch A — close via `pnpm --filter @evf/validation-harness validate:all`):
  Phase 4b adds 5 manual-only stress cases to the ADR-0005 carry:

  6. Overlay slot z=2 panel renders on real G2 without visual artifacts (MAP-05)
  7. Toast queue survives overlay open under real BLE latency (TOAST-01 + ADR-0009 Amd 1 Rule 2)
  8. Boot error UI renders correctly across all 5 states on real G2 (BOOT-01)
  9. Death-saves pivot triggers on real Foundry HP=0 event (DEATH-01)
  10. Concentration-drop modal emits canonical bridge event consumed by Phase 7 (CONC-01)

Phase 4a carry (5 items) + Phase 4b carry (5 items) = 10 hardware-pending SC.

Progress: [██████████] 98%

Phase 4a closure detail — preserved here for historical reference:

  - Planning revision (3 iterations): NEEDS_REVISION → APPROVED (commit 8ae2533).
  - Wave 0 Plan 01: scaffolding + type contracts + RasterControllerLike (merged 9f0d5ae).
  - Wave 1 Plan 02: engine modules — LayerManager, capability-handshake, page-lifecycle, boot-splash (+27 tests; merged 1dfc128).
  - Wave 2 Plans 03/04/06 (sequential foreground; zero `files_modified` overlap):
    - 03 raster pipeline + glyph fallback + MapBaseLayer (+34 tests; merged a84bc7b).
    - 04 status HUD + i18n width budgets + INV-1 ck 11-15 fixtures (+50 tests; merged c46d9c8).
    - 06 Foundry PIXI extractor + WS `frame_pixels` protocol + scene-input dispatcher (+31 tests; merged 311dc53).
  - Wave 3 Plan 05:
    - Task 1 boot orchestrator + Option B W-4 split (commit e862d40 — recovered from a locked worktree after the executor agent hit the monthly usage limit; 2→32 microtask flush fix applied to `bootWithMocks` before commit).
    - Task 2 ADR-0009 PROPOSED → ACCEPTED + README ADR index + ROADMAP reconciliation (commit 54577c6).
    - SUMMARY committed (cf015ad).
    - Task 3 human-verify checkpoint resolved 2026-05-15 via operator-issued `defer-hardware-tests` resume signal.
  - Phase test totals: 451 → 606 (+155 across the 6 plans). All gates green: typecheck, biome, W-4 grep, 45/45 test files.

Hardware-pending carry-forward (`human_needed` per ADR-0005 PROVISIONAL Branch A — close via `pnpm --filter @evf/validation-harness validate:all`):

  1. Capability handshake on real G2 firmware (DISP-01, DISP-02, NAV-04).
  2. Raster sustains ≥5 fps standard / 15 fps stretch with measured BLE p50 latency (MAP-02, MAP-04).
  3. Branch B/C glyph fallback auto-degrades below 100 kbps PROVISIONAL threshold (MAP-04).
  4. INV-1 layout holds character-perfect on real G2 phosphor display under IT / EN / DE (DISP-03, I18N-04).
  5. PIXI canvas extract via OffscreenCanvas does NOT block Foundry desktop UI (Specs §11.5.7 pitfall 11).

Progress: [██████████] 95% (milestone) / Phase 4a: 6/6 plans complete (hardware tests deferred).

## Performance Metrics

**Velocity:**

- Total plans completed: 16
- Average duration: 12.33 min
- Total execution time: 74 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 0 | 3 | 43 min | 14 min |
| 1 | 3 | 30 min | 10 min |
| 02 | 5 | - | - |
| 03 | 5 | - | - |

**Recent Trend:**

- 2026-05-11 — Phase 1 Plan 03 (Wave 2 — ADRs + snapshot framework + CI + INV-3 atomic closure): ~12 min, 13 files created + 5 modified, 5 commits (d68d7fe / fcb17ef / 5e13149 / 938c6f2 / 671a22d INV-3 atomic), all 5 WAVE-2-G1..G5 gates green + INV-3 verified (CLAUDE.md + STACK.md in single commit HEAD). TDD on AsciiGrid (11 unit tests RED-then-GREEN). 5 MADR ADRs ACCEPTED (0001-0004 + 0008). GHA workflow with 7 quality gates + T-01-03/T-01-04 hardening. Deviations: Vitest 4 defineProject rejects extends:true (Rule 3 — TS strict catches it; dropped from per-package config; Vitest 4 merges root via test.projects glob automatically); AsciiGrid runtime guard for row===undefined (Rule 3 — noUncheckedIndexedAccess); Biome auto-format on test files (cosmetic).
- 2026-05-11 — Phase 1 Plan 02 (Wave 1 packages + validation-harness fold-in): ~10 min, 25 files created + 11 modified + 16 moved via git mv + 6 deleted, 3 commits (e5641cc / 0fa1364 / b67a029), all 5 WAVE-1-G1..G5 gates green; tests/phase-0/ entirely removed; Pitfall 8 path-resolution fix (fileURLToPath + EVF_REPO_ROOT) with 4-test smoke suite. Deviations: shared-render vitest devDep added for workspace visibility (Rule 3); package test script delegates to root vitest with --project filter (Pitfall 3 — Rule 3); Biome auto-formatted 15 Phase 0 files post-fold-in (cosmetic).
- 2026-05-11 — Phase 1 Plan 01 (Wave 0 tooling foundation): ~8 min, 16 files, 3 commits (5096129 / e448e0d / 06819bf), all 6 WAVE-0-G1..G6 gates green; vitest test.projects deviation documented (Wave 1 re-enables); Biome `useBiomeIgnoreFolder` rule + design-asset exclusions auto-fixed (Rule 3).
- 2026-05-10 — Phase 0 Plan 03 (6 hardware test scripts pre-grant scaffold): ~25 min, 9 files, 3 commits (15e9922 absorbed Task 1 / 3b2578d Task 2 / 8670b0c fix-up), tsc green at exit 0, smoke run all 6 → exit 2 (Pattern 3 skip uniform).
- 2026-05-10 — Phase 0 Plan 02 (MidiQOL probe + run-all orchestrator): 11 min, 6 files, 2 task commits (15e9922 / c1c82e5), tsc green at exit 0, smoke run exits 2 (within plan-acceptable 0/2 range).
- 2026-05-10 — Phase 0 Plan 01 (test infrastructure scaffolding): 7 min, 16 files, 3 commits (40732fe / f301aaf / 96f4c85), type-check green at exit 0.

*Updated after each plan completion.*
| Phase 02-foundry-module-core-pairing-ui P02 | ~60 min | 2 tasks | 12 files |
| Phase 05-panel-plugin-system-read-only-panels P03 | 45min | 3 tasks | 10 files |
| Phase 05-panel-plugin-system-read-only-panels P05 | 120 | 3 tasks | 15 files |
| Phase 06 P01 | 65 | 3 tasks | 17 files |
| Phase 06 P02 | 95 | 2 tasks | 10 files |
| Phase 07-foundry-module-write-path P02 | 10 minutes | 2 tasks | 14 files |
| Phase 07-foundry-module-write-path P03 | 25 minutes | 2 tasks | 18 files |
| Phase 07 P05 | 762 | 2 tasks | 19 files |

## Quick Tasks Completed

| Date       | Slug                                                  | Commit    | Notes                                                                                |
|------------|-------------------------------------------------------|-----------|--------------------------------------------------------------------------------------|
| 2026-05-11 | `260511-kqh-fix-ci-coverage-gate-exclude-phase-2-pla` | `2800995` | CI green restored: coverage.include narrowed to `.{ts,tsx}` + 4 placeholder index.ts excludes + `validation-harness/src/lib/**` excluded. Migration policy documented. ~10 min. |
| 2026-05-13 | `260513-l12-fix-applicationv2-referenceerror-in-foun` | `3fee9dd` | Foundry v13+ runtime fix: `ApplicationV2` no longer a bare global — added `const { ApplicationV2 } = foundry.applications.api;` destructure in PairModal.ts; replaced ambient `declare class ApplicationV2` with `declare namespace foundry.applications.api { class ApplicationV2 }` (modeled actual v13 shape, removed unused `declare class Application`); migrated 19 `vi.stubGlobal('ApplicationV2', …)` calls across 4 test files to namespace-shape stub. Unblocks `registerSettings` (init hook was aborting on `ReferenceError`). |
| 2026-05-14 | `20260514-raster-dynamic-infill` | `ee82b83` | Specs v0.9.11 → v0.9.12: introduced `z=0.5 Idle Content Infill` layer (new §7.4c, 8 sub-sections) to fill previously-empty raster-mode map-area rows when no overlay z=2 is mounted. INV-2 spot-check ran on `hub.evenrealities.com/docs/guides/device-apis` 2026-05-14 — drift NEUTRO (canonical *"no arbitrary pixel drawing"* confirmed; specific 200×100 number flagged as INV-2 follow-up). User originally asked to push past 400×200 raster max → corrected approach: 4-image hardware budget is hard-capped, but text/list budget supports +3 idle infill containers (combat log strip · z=0.5 label · stats strip) with auto-demolish on overlay open. ADR-0001 amended. Atomic INV-3 commit: Specs.md + README + showcase + ADR + STATE. Quick artifact: `.planning/quick/20260514-raster-dynamic-infill/` (PLAN.md + EVIDENCE.md). |
| 2026-05-14 | `adr-0005-provisional-closure` | `140f1de` | ADR-0005 Phase 0 GO/NO-GO: PROPOSED template stub → **PROVISIONAL-ACCEPTED** Branch A (presumed via INV-2 literature review). Triggered by `/gsd-autonomous --to 5` blocking on unmet Phase 4a dependency. INV-2 round 2 (6 WebFetch parallel) revealed: (a) G1 canonical protocol `github.com/even-realities/EvenDemoApp`: 1-bit 576×136 BMP @ 194-byte packets, audio LC3 max 30s — strongly suggests G2 inherits chunked-transfer model, (b) BxNxM/even-dev simulator MIT v0.1.0 March 2026 actively maintained, (c) **CRITICAL OQ-INV2-1**: Specs §3.1 "4 image container 200×100" claim NOT verbatim findable on canonical primary 2026-05-14 — could be (60%) multi-container as Specs says, (30%) single full-frame BMP like G1, (10%) different shape. Gating-critical for Phase 4a — resolution requires Even Hub dev access or simulator probe. ADR documents 8 per-test PROVISIONAL verdicts with confidence levels + 3 re-validation triggers + branch downgrade rework estimates. Phase 4a unblocked under PROVISIONAL with explicit `human_needed` gating on §10.0.3-9 hardware-dependent SC. |
| 2026-05-14 | `adr-0005-oq-inv2-1-resolution-via-simulator` | `b9fe6f1` | **OQ-INV2-1 RESOLVED empirically** via live probe of `@evenrealities/evenhub-simulator@0.7.3` (official npm). Setup: simulator already installed; local probe HTML at http://127.0.0.1:8765 + simulator pointing at it with `--automation-port 9900`; 6 iterative probes extracted: (1) **bridge mechanism**: `flutterBridge.callHandler('evenAppMessage', json)` is the ONLY entry point; full JS source captured verbatim. (2) **envelope contract**: `{type: 'call_even_app_method' \| 'listen_even_app_data', method, data}` dispatched via Tauri `invoke("even_app_method")`. (3) **10-method enum** (extracted from Rust deserialization error): `getUserInfo · getGlassesInfo · setLocalStorage · getLocalStorage · createStartUpPageContainer · rebuildPageContainer · shutDownPageContainer · updateImageRawData · textContainerUpgrade · audioControl`. (4) **`getGlassesInfo`** returns `{model:"g2", sn:"S200...", status:{batteryLevel,connectType,isCharging,isInCase,isWearing,sn}}` empirically. (5) **Image API is PAGE-BASED DECLARATIVE** not per-container imperative — `createImageContainer` does NOT exist; image slots are defined in `createStartUpPageContainer.data` (= `rebuildPageContainer.data`, same struct!) and updated via `updateImageRawData`. Resolution: interpretation (3) NEW — neither (1) multi-container nor (2) single-frame as previously hypothesized. **Implications**: Specs.md §3.5/§4.3/§7.2/§7.4c flagged for v0.9.13 amendment. Phase 4a unblocked w/ correct API contract; Plan 02 (raster wire path) must use envelope-based dispatch, not `bridge.createImageContainer`. Full evidence in EVIDENCE.md Appendix B. |
| 2026-05-14 | `oq-inv2-4-hub-polyfill-via-evenrealities-sdk` | _pending_ | **OQ-INV2-4 RESOLVED** via Path A polyfill. Discovered `@evenrealities/even_hub_sdk@0.0.10` (MIT, by Whiskee Chen @ Even Realities) already installed on dev machine under `/home/aiacos/node_modules/`. Read full 1292-line `index.d.ts` — canonical SDK exposes `EvenAppBridge` singleton with typed methods (`getUserInfo` / `getDeviceInfo` / `setLocalStorage` / `getLocalStorage` / `createStartUpPageContainer` / `rebuildPageContainer` / `updateImageRawData` / `textContainerUpgrade` / `audioControl` / `imuControl` / `shutDownPageContainer`) + subscriptions (`onLaunchSource`, `onDeviceStatusChanged`, `onEvenHubEvent`). Hardware limits confirmed verbatim: **image width 20-288, height 20-144** (NOT 200×100 as Specs §3.1 said — DOUBLE the area possible!). Container budget: containerTotalNum 1-12, textObject max 8, imageObject max 4. Solution: added `@evenrealities/even_hub_sdk@0.0.10` to g2-app dependencies + created `packages/g2-app/src/hub-polyfill.ts` runtime shim that maps legacy `hub.setItem/getItem/removeItem/eventBus` to `EvenAppBridge` envelope calls. Wizard.ts entry calls `installHubPolyfill()` after import. Polyfill is idempotent (skips if `globalThis.hub` already set by tests). All 451 workspace tests pass, typecheck clean. `even-hub.d.ts` updated with cross-refs to polyfill source. Triggers Specs v0.9.13 amendment: §3.1 should document the **actual** image limits (20-288×20-144) + envelope-based API contract. |
| 2026-05-14 | `adr-0005-oq-inv2-1.a-struct-shapes-via-simulator-v7-v8` | `b543ec9` | **OQ-INV2-1.a partially RESOLVED + NEW OQ-INV2-4 discovered**. Probe v7 (field-walk) + v8 (targeted candidates) extracted: (a) Complete struct shapes for simple methods — `getLocalStorage{key:String}→String` · `setLocalStorage{key:String, value:String}→bool` · `shutDownPageContainer{exitMode:u64 ∈ {0,1}}→bool` (any other ExitMode value rejected verbatim "unknown ExitMode value: 2") · `audioControl{isOpen:bool}→bool`. (b) Lenient-deserializer methods (`createStartUpPageContainer`, `rebuildPageContainer`, `updateImageRawData`, `textContainerUpgrade`) accept `data:{}` — return values reveal stub behavior: 0/1 for create, true for rebuild, "sendfailed" for updateImageRawData (needs prior page), false for textContainerUpgrade. (c) `listen_even_app_data` accepts same 10-method enum, returns `{status:"success"}` on subscribe. (d) Simulator README v0.7.x confirms: text containers cap **999 bytes**, list containers max **20 items × 63 bytes**, image w/h capped (specific values TBD on real hardware). **CRITICAL NEW finding OQ-INV2-4**: Phase 2 wizard (`packages/g2-app/src/wizard/`) uses `hub.setItem/getItem/removeItem/eventBus/camera` global that **DOES NOT EXIST** on canonical simulator — only `flutterBridge.callHandler` is injected. Wizard's 451 unit tests mock `hub`, so they pass; real-hardware/simulator runtime would fail with `ReferenceError`. Recommended path before Phase 4a: investigate whether Even Realities App phone-side WebView injects a `hub` polyfill, or refactor wizard to use envelope dispatch. Full detail in EVIDENCE.md Appendix C. |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- Phase 0 (pre-planning): Specs.md v0.9.11 §10 plan adopted verbatim with 4 research-SUMMARY adjustments (Phase 0 scope expansion, monolithic Plugin Host phase split into Phase 4a + Phase 4b, CONN pulled forward to Phase 2, INV-5 ratification at Phase 6, Phase 10 field-test extension).
- Phase 0 (pre-planning): MidiQOL declared *required* for MVP (`relationships.requires` in module.json) — without `autoFastForward` mode, manual writes stall on chat-card buttons.
- Phase 0 (pre-planning): Phase 4a + 4b combined carry 6 of 17 research pitfalls — highest risk concentration; allocated 4 weeks split into 4a (weeks 4-5) + 4b (weeks 6-7) instead of a single monolithic 4-week phase.
- Phase 0 (pre-planning): Single-workflow-origin discipline option A (`socketlib.executeAsGM` only; player client never invokes `activity.use()` directly) — locked for Phase 7 (research Pitfall 6).
- Phase 0 Plan 01 deviation: TypeScript pinned at `5.8.3` (latest 5.8 stable on npm) instead of plan-cited `5.8.5` — `5.8.5` does not exist on npm registry. STACK.md and CLAUDE.md "TypeScript 5.8.5" references should be corrected to `5.8.3` in next INV-3 cross-cutting commit.
- Phase 0 Plan 01 deviation: pnpm tooling at `10.33.4` (latest-10 dist-tag) instead of cited `10.3.1` (does not exist on npm). Affects only global tooling, not committed package.json.
- Phase 0 Plan 02 decision: REQ MIDIQ-01 production module declaration (`relationships.requires.midi-qol` in `evfoundryvtt` `module.json`) shape proven via probe mini-module — Phase 2 production module inherits identically. Probe code complete; evidence emission pending operational execution against Foundry test world (Plan 04 closure step).
- Phase 0 Plan 02 decision: T-00-02 read-only contract enforced by literal grep gate (`grep -c "game.settings.set" probe.js` MUST return 0) instead of relying on code review — verifiable in CI.
- Phase 0 Plan 02 decision: explicit per-branch `process.exit(0/1/2)` calls (instead of ternary expression) so static literal greps for each exit code all match — accommodates plan-defined acceptance gates and future CI grep checks.
- Phase 0 Plan 03 decision: upng-js@2.1.0 ambient module declaration moved to standalone `tests/phase-0/upng-js.d.ts` since inline `declare module` was rejected by TypeScript with TS2665 ("Invalid module name in augmentation. Module 'upng-js' resolves to an untyped module"). Standalone .d.ts files are picked up by tsconfig include='**/*.ts' globbing.
- Phase 0 Plan 03 decision: skip-case payloads use `1` for all `z.number().int().positive()` schema fields (sessions, samples_per_gesture, duration_sec, initial_mtu_bytes, iterations) — semantic "no measurement performed" sentinel; the `verdict: "skipped"` field carries the operational signal. Avoids 0-rejection by Zod's `positive()` constraint.
- Phase 0 Plan 03 decision: Task 1 deliverables (10-0-7/8/9 + package.json upng-js add) bundled into Plan 02 commit `15e9922` due to parallel Wave 1 execution sharing the `tests/phase-0/` working tree. Plan 04 closure must reference 3 commits for full Plan 03 history (15e9922 + 3b2578d + 8670b0c). Documented in 00-03-SUMMARY.md Deviations §5.
- Phase 0 Plan 03 decision: `tests/phase-0/.gitignore` extended with `docs/` to exclude runtime evidence written when scripts execute with cwd=tests/phase-0/ (smoke testing); real evidence under repo-root `docs/perf/phase-0/` when Plan 04 runs scripts from repo root.
- Phase 1 Plan 01 decision (D-1.03 D-1.15): TS 5.8.3, pnpm 10.33.4, Biome 2.4.15, Vitest 4.1.5, Changesets 2.31.0, Node 24 LTS pinned exactly (T-01-01 mitigation); ghost-version drift from STACK.md/CLAUDE.md (5.8.5/10.3.1) still pending Wave 2 closure.
- Phase 1 Plan 01 decision (D-1.06): Vitest 4 test.projects API used; temporarily commented during Wave 0 (zero packages exist; Vitest 4 errors on empty glob); Wave 1 re-enables. `passWithNoTests: true` added as safeguard.
- Phase 1 Plan 01 decision (D-1.14): commitlint scope-enum severity 1 (warn) per RESEARCH OQ4 — allows phase plan-ID scopes (NN-NN) until regex-pattern plugin lands; subject-case disabled for Italian commits.
- Phase 1 Plan 02 decision (D-1.01 honored): 6 @evf/* private workspace packages scaffolded (g2-app, bridge, foundry-module, shared-protocol, shared-render + validation-harness folded from tests/phase-0/) at version 0.1.0-alpha.0; foundry-mcp deliberately omitted (V2 OPZIONALE Phase 11).
- Phase 1 Plan 02 decision (D-1.02 / Phase 0 D-15): tests/phase-0/ folded into packages/validation-harness/ via git mv (history-preserving); tests/ parent dir also removed. Hardware scripts stay tsx-executable in scripts/ (RESEARCH Open Question 1 — NOT converted to Vitest).
- Phase 1 Plan 02 decision (Pitfall 8): validation-harness/src/lib/output.ts computes REPO_ROOT via fileURLToPath(import.meta.url) + 4-level-up walk, with EVF_REPO_ROOT env override priority. Smoke test (tests/path-resolution.test.ts) asserts both branches. Evidence writes still target repo-root docs/perf/phase-0/ regardless of cwd.
- Phase 1 Plan 02 deviation: package test script uses `vitest --run --project @evf/validation-harness --root ../..` so sub-package invocation resolves the root projects config (Pitfall 3 — Vitest 4 projects glob only resolved from cwd). Plan 03 g2-app test script must follow same pattern.
- Phase 1 Plan 03 decision (D-1.07 honored): 5 MADR ADRs ACCEPTED — 0001 layered-ui-model (z=0 map / z=1 status HUD / z=2 overlay + single capture container; binds Phase 4a/4b/5), 0002 protocol-versioning (WS envelope + 60s LRU idempotency + 60s replay buffer; binds Phase 2/3/7/11), 0003 tool-registry-pattern (Zod-typed shared dispatch table consumed by Bridge + foundry-mcp; binds Phase 3/7/8/11), 0004 voice-via-mcp-not-internal (Streamable HTTP only; HTTP+SSE deprecated 2025-03-26; binds Phase 11/12), 0008 code-quality-configuration (Biome+TS+Vitest+7-gate CI + Conventional Commits; binds every Phase 1+ commit).
- Phase 1 Plan 03 decision (D-1.11 honored): @evf/shared-render exports AsciiGrid (char-precision grid, noUncheckedIndexedAccess compliant) + matchAsciiFixture (Vitest 4 expect.toMatchFileSnapshot wrapper). TDD discipline: 11 unit tests RED-then-GREEN. Example INV-1 wire-up test in g2-app proves end-to-end before Phase 4a.
- Phase 1 Plan 03 decision (D-1.09 + D-1.10): GitHub Actions workflow .github/workflows/ci.yml with 7 quality gates (frozen-lockfile + ignore-scripts, biome ci, typecheck, test:coverage, TODO discipline grep, snapshot drift, changeset:status PR-only) + parallel commit-lint-pr-title job. T-01-03 hardening: PR title via env: block, NOT inlined in run: bash. T-01-04 hardening: server-side commitlint cannot be bypassed by local --no-verify.
- Phase 1 Plan 03 decision (INV-3 atomic closure): single commit 671a22d propagated drift correction back to docs layer — CLAUDE.md §Repository state "Design-only" → "Phase 1 active" + STACK.md TS 5.8.5→5.8.3 + pnpm 10.3.1→10.33.4 + Drift Corrections Log §11. `git log -1 --name-only HEAD` shows both CLAUDE.md + STACK.md (INV-3 verified).
- Phase 1 Plan 03 deviation: Vitest 4 `defineProject` rejects `extends: true` under TS strict (UserProjectConfigExport type does not include the field — only TestProjectInlineConfiguration consumed by ROOT test.projects array does). Dropped from per-package vitest.config.ts; Vitest 4 still merges root coverage/reporters via test.projects glob discovery automatically (Rule 3).
- [Phase 02-foundry-module-core-pairing-ui]: PairModalData extends Record<string, unknown> to satisfy ApplicationV2 covariant return type
- [Phase 02-foundry-module-core-pairing-ui]: internalSecret included in QR payload for Plan 05 /internal/delta POST auth (H-1 fix)
- [Phase 05 Plan 01]: ADR-0010 ACCEPTED — PanelRouter uses import.meta.glob (Option C); filesystem scan (A) and parallel registry (B) rejected. Panels autodiscovered via '../panels/**/*-panel.ts' glob at boot.
- [Phase 05 Plan 01]: WorldStateSchema.world is REQUIRED on CharacterSnapshotSchema (not optional) — atomic commit closes drift window; Phase 4b precedent. All consumer fixtures back-filled in same commit.
- [Phase 05 Plan 01]: ConcentrationSchema and WorldStateSchema use z.object (not z.strictObject) — open for Phase 7+ extension (spellId, worldEdition) without breaking Phase 5 consumers.
- [Phase 05 Plan 01]: HudLocale widened from 3 (it/en/de) to 6 (+ es/fr/pt-br best-effort); per-key EN fallback for best-effort locales per I18N-05 (width budget constraint).
- [Phase 05 Plan 01]: TestablePanelRouter subclass overrides discoverPanels() with _mockModules injection to test Vite import.meta.glob discovery without Vite runtime.
- [Phase ?]: padRightUnicode/truncateUnicode use [...str].length (code-point counting), guards multi-byte glyphs in G2 panel output
- [Phase ?]: modernRules boolean branch per renderer, no strategy objects — simpler mental model for single-function tab renderers
- [Phase ?]: Fixtures generated by running real renderers via tsx — ensures fixture-production alignment at creation time, not hand-authored
- [Phase 05 Plan 04]: InventoryPanel column layout: indent(3)+glyph(1)+space(1)+name(18/14)+mastery(5/0)+damage(22)+tags(19)=66cp; mastery column only shown when modernRules=true
- [Phase 05 Plan 04]: SpellbookPanel column layout: indent(3)+prepared(1)+conc(1)+name(20)+activation(6)+gap(2)+range(7)+effect(26)=66cp; slot bar MAX_BAR_LENGTH=4 with ▓/░ chars
- [Phase 05 Plan 04]: sheet.spell.level_section i18n key uses literal 'N' suffix (regex /N$/ replacement); standalone spell.level_section uses '{N}' template — two separate patterns in same i18n table
- [Phase 05 Plan 04]: Standalone panels omit decorative prefixes (◆/⚖) that the sheet-tab renderer uses; headers are plain-capitalized (EQUIPAGGIAMENTO vs ◆ EQUIPAGGIAMENTO)
- [Phase ?]: Double trust boundary for R1 events: outer EnvelopeSchema + inner R1GesturePayloadSchema
- [Phase ?]: LocaleEventEmitter separate from PanelGestureBus — locale.changed is not an R1Gesture variant (RESEARCH Pitfall 7)
- [Phase ?]: getTopLayer() explicitly sorts Map<ZIndex> entries by z descending (Map insertion-order pitfall, RESEARCH Pitfall 2)
- [Phase ?]: INV-5 Gesture Determinism ratified in INVARIANTS.md — zero-handler is console.warn no-op, never silent drop
- [Phase 06 Plan 02]: PanelMetaSchema.navKey relaxed to z.string().max(1) — empty string marks system overlays (not user-navigable); discoverPanels() filters silently (no console.warn)
- [Phase 06 Plan 02]: PanelRouter.overlayStack suspension stack — single atomic bundle([destroy z2, mount z2]) eliminates flicker window (RESEARCH Pitfall 3); popOverlay restores suspended panel or destroys and clears activePanel
- [Phase 06 Plan 02]: QuickActionMenuPanel Strategy A — single 'overlay-block' text container (same as ConcentrationDropModalPanel); long-press in lang sub-menu returns to main (not closes), preserving progressive disclosure
- [Phase 07 Plan 03]: AbilityTemplate.fromActivity() called synchronously (never awaited); drawPreview() never called — confirmed incompatible with R1 input model per RESEARCH §Q2
- [Phase 07 Plan 03]: PLACEMENT_CONTEXTS Map module-scoped singleton with 60s TTL; eviction is lazy (on confirmTemplatePlacement access), not proactive — acceptable for MVP single-tenant
- [Phase 07 Plan 03]: evf.skillCheck stub slot renamed in-place to evf.confirmTemplatePlacement — socketlib count stays at exactly 14

### Pending Todos

(none — Phase 1 complete; Phase 2 entry is the next planning step)

### Blockers/Concerns

- **Phase 0 hardware access dependency:** Even Hub developer access required for §10.0.1-10.0.9 tests. Timeline estimate: 1-2 weeks request → grant. Tracks to Phase 0 entry.
- **Phase 0 Branch A/B/C decision gates everything:** §10.0.5 binary decision tree must produce ADR-0005 before Phase 1 applicative code. Branch C (glyph-only) would defer raster pipeline to Phase 13 stretch and reshape Phase 4a/4b scope significantly.
- **Research-flagged Phase 7 open questions (Specs §12.B q.11-12, q.15):** MidiQOL `completeActivityUse` signature + Fighter Extra Attack route (`activity.use({count: 2})` vs client-loop) need empirical verification — gate on Phase 7 entry.

## Deferred Items

Items acknowledged and carried forward from project init:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| V2 | VOICE-01..05 (voice/AI via MCP) | Phase 11-12 | Init 2026-05-10 |
| V2 | ACT-04 (reaction execution) | Phase 13 | Init 2026-05-10 |
| V2 stretch | STRETCH-01..08 (multi-player, headless Foundry, DSN raster, dnd5e v6, PF2e, portraits, biometrics, cloud SaaS) | Phase 13 | Init 2026-05-10 |

## Session Continuity

Last session: 2026-05-16T13:13:07.019Z
Stopped at: Completed 06-02-PLAN.md
Resume file: None
Resume cmd: /gsd-execute-phase 6 03

## /gsd-autonomous 2026-05-15 run — Phase 4a checkpoint

Commits landed this session (8 total):

- c132929 docs(roadmap): tick checkboxes for Phases 0, 2, 3 (doc drift)
- 51ab505 docs(04A): smart discuss context for Phase 4a (4 grey areas)
- 89b4914 docs(04A): UI design contract (6/6 dimensions, FLAG resolved)
- 038dce3 docs(04A): fix UI-SPEC typo (scroll=pana → scroll=pan)
- e488df0 docs(04A): RESEARCH.md (Branch A pipeline, 9 INV-1 fixtures, ADR-0009 planned)
- 303a185 docs(04A): VALIDATION.md (11-task Nyquist scaffold + 5 human_needed hardware entries)
- (pattern-mapper commit) docs(04A): PATTERNS.md (22 files classified, 20/22 analogs)
- 508e30b docs(04A): 5 PLAN.md drafts (wave 0..3) + ROADMAP wave annotations
- 6523857 docs(04A): plan-check report — NEEDS_REVISION (5 blockers, 4 warnings)

User decisions this session:

- Skip already-complete-on-disk phases 0/2/3; start at 4a (doc-drift fix)
- Scope: --to 10 (MVP, skip OPZIONALE V2 phases 11-13)
- All 4 smart-discuss grey areas: Accept Recommended
- UI-SPEC FLAG (scroll=pana): fix inline
- B-2 sub-tile geometry override: KEEP 18 (floor, original CONTEXT.md lock) — planner revision must revert from 28-ceil to 18-floor

Remaining for Phase 4a (resume work):

1. /gsd-plan-phase 4a --gaps  → planner revision applying user decisions (1 iteration max recommended; PLAN-CHECK.md has explicit fix-hints for B-1, B-3, B-4, B-5 + W-1..4)
2. /gsd-execute-phase 4a  → 5 plans × ~2-3 tasks each, Wave 0..3
3. /gsd-code-review 4a (+ --fix --auto if findings)
4. /gsd-ui-review 4a
5. Phase 4a verification with 5 human_needed entries surfaced for user testing

Then /gsd-autonomous --from 4b --to 10 continues the milestone.
