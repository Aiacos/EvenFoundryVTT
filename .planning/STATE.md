---
gsd_state_version: 1.0
milestone: v0.9.11
milestone_name: milestone
status: Awaiting next milestone
stopped_at: Completed 09-05-PLAN.md (Phase 9 CLOSED)
last_updated: "2026-05-17T11:57:39.851Z"
last_activity: 2026-05-17 — Milestone v0.9.11 completed and archived
progress:
  total_phases: 15
  completed_phases: 15
  total_plans: 71
  completed_plans: 71
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-17 after v0.9.11 MVP milestone shipped)

**Core value:** Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.
**Current focus:** Planning next milestone v0.9.12 (via `/gsd-new-milestone`)

## Current Position

Phase: Milestone v0.9.11 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-05-17 — Milestone v0.9.11 completed and archived

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
| Phase 07-foundry-module-write-path P06 | 634 | 4 tasks | 9 files |
| Phase 08 P01 | 90 | 3 tasks | 11 files |
| Phase 08-manual-action-ux P02 | 50m | 2 tasks | 9 files |
| Phase 08-manual-action-ux P03 | 45 | 2 tasks | 10 files |
| Phase 08-manual-action-ux P04 | 75 | 3 tasks | 24 files |
| Phase 09-action-economy-edge-cases P01 | 12 | 3 tasks | 12 files |
| Phase 09-action-economy-edge-cases P02 | 120 | 3 tasks | 13 files |
| Phase 09-action-economy-edge-cases P03 | 16 | 3 tasks | 18 files |
| Phase 09-action-economy-edge-cases P04 | 16m | 3 tasks | 15 files |
| Phase 10-polish-field-test-mvp P01 | 17m | 4 tasks | 13 files |
| Phase 10-polish-field-test-mvp P02 | 11m | 3 tasks | 8 files |
| Phase 10-polish-field-test-mvp P04 | 291 | 3 tasks | 6 files |
| Phase 13-v2-stretch P03 | 75m | 3 tasks | 17 files |

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
| 2026-05-17 | `20260517-voice-intent-research` | _research-only_ | **EvenAI native NON apribile ai dev — confermato INV-2 fresh su 6 fonti canoniche Even Realities (hub.evenrealities.com/docs/* + GitHub even-realities/* + support.evenrealities.com). Specs.md §3.6 regge.** Phase 12 (Deepgram Nova-3 + Claude Desktop MCP) è l'unica architettura praticabile con SDK pubblico — la pipeline GIÀ usa AI per identificare le azioni (esterna, non on-glass). **Quick win disponibile senza cambi architetturali:** Deepgram Keyterm Prompting con i 70 incantesimi di `spell-lookup.ts` (+625% entity-recall lift su nomi esotici). **Ottimizzazione condizionale post SC-12-01:** Picovoice Rhino edge-classifier solo se hardware test misura p50 > 800ms. Nessuna migrazione architettonica necessaria. Re-verified ✓ 2026-05-17 da annotare nel prossimo bump Specs.md. Artefatti: `RESEARCH.md` + `SUMMARY.md` in `.planning/quick/20260517-voice-intent-research/`. |
| 2026-05-17 | `20260517-spell-lookup-foundry-derived` | `856991b` | Push-based Foundry compendium → bridge SpellPackCache → foundry-mcp dynamic resolver. 3 tasks: (1) SpellPackEntrySchema + AvailableSpellsPayloadSchema + readAvailableSpells() + registerSpellPackReader() + module wiring; (2) SpellPackCache + handleSpellPackEnvelope + GET /v1/spells/available + DeltaInterceptFn hook; (3) fetchAvailableSpells (5-min TTL) + lookupSpellIdFromBridge + lookupInDynamic (6-step Levenshtein) + staticLookup offline fallback. socketlib registerComplexHandler count stays 17 (emission via existing /internal/delta channel). T-SP-02: Zod validation before every cache write. 53 new tests; 2476/2476 pass. |

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
- [Phase 08 Plan 04]: MoveDirectionPicker uses gridSizePixels (canvas pixels per square) — computeDelta maps 8 compass directions to absolute canvas delta {dx, dy}
- [Phase 08 Plan 04]: CharacterDeltaEvents widened to string channel to support movement budget subscription alongside character.delta without breaking existing mocks
- [Phase 08 Plan 04]: Row 19 in _buildGrid repurposed for Mov chip — conditionsOverflow takes priority when both conditions overflow AND movement budget exist
- [Phase 08 Plan 04]: combat-movement-tracker uses _lastPosition map per actorId; first updateToken fire always yields delta=0 (Phase 8 broad heuristic)
- [Phase 08 Plan 05]: Double-tap-to-fire semantics: _lastTapIdx stores the NEW (post-advance) index; second tap on same index within 600ms fires — cycle taps need >600ms spacing to avoid premature fire
- [Phase 08 Plan 05]: PanelRouter.setPanelInstanceHandler post-construction injection registry (Map<panelId, callback>) avoids threading handlers through 3-arg constructor signature
- [Phase 08 Plan 05]: currentUserId stub is '<unknown>' — bearer user_id not yet surfaced in handshake; TODO(ADR-0005); T-08-02 filter still active (unknown !== real recipientUserId → silent drop)
- [Phase 08 Plan 05]: ToastQueueLayer mounted at z=1.5 in boot sequence (Step 11e) — was missing from prior boot-engine wiring, added as Rule 2 correctness requirement
- [Phase 10 Plan 01]: Recursive setTimeout for countdown ticks instead of setInterval — avoids vitest runAllTimersAsync infinite-loop on chained retries (pragmatic test-compatibility choice; production behavior identical)
- [Phase 10 Plan 01]: SeqTracker.observe is duck-typed {seq:number} — no Zod parse on hot path (WS envelope already validated upstream by EnvelopeSchema)
- [Phase 10 Plan 01]: onFullRefreshRequired is a console.warn stub in boot-engine-core — REST GET /v1/actor wiring deferred to Plan 10-04 per SC-10-01 (hardware-pending, no actor REST endpoint shipped yet)

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

### Items acknowledged at v0.9.11 milestone close (2026-05-17)

Source: `gsd-sdk query audit-open` (16 items). Acknowledged via `/gsd-complete-milestone` decision *Acknowledge tutto + carry raster a v0.9.12*.

| Category | Item | Status | Resolution path |
|----------|------|--------|-----------------|
| verification_gap | Phase 00 00-VERIFICATION.md | human_needed | ADR-0005 Branch A — `pnpm --filter @evf/validation-harness validate:all` (Even Hub access required) |
| verification_gap | Phase 02 02-VERIFICATION.md | human_needed | ADR-0005 Branch A |
| verification_gap | Phase 03 03-VERIFICATION.md | human_needed | ADR-0005 Branch A |
| verification_gap | Phase 05 05-VERIFICATION.md | human_needed | ADR-0005 Branch A |
| verification_gap | Phase 06 06-VERIFICATION.md | human_needed | ADR-0005 Branch A |
| verification_gap | Phase 08 08-VERIFICATION.md | human_needed | ADR-0005 Branch A |
| verification_gap | Phase 09 09-VERIFICATION.md | human_needed | ADR-0005 Branch A |
| verification_gap | Phase 10 10-VERIFICATION.md | human_needed | ADR-0005 Branch A |
| verification_gap | Phase 12 12-VERIFICATION.md | human_needed | ADR-0005 Branch A |
| verification_gap | Phase 13 13-VERIFICATION.md | human_needed | ADR-0005 Branch A |
| uat_gap | Phase 00 00-HUMAN-UAT.md (8 scenarios) | partial | ADR-0005 Branch A — hardware-pending UAT |
| uat_gap | Phase 02 02-HUMAN-UAT.md (6 scenarios) | partial | ADR-0005 Branch A |
| uat_gap | Phase 03 03-HUMAN-UAT.md (0 scenarios) | resolved | False positive in audit list — all scenarios closed |
| quick_task | 20260517-spell-lookup-foundry-derived | unknown (SDK quirk) | SUMMARY present — task complete; SDK status field unreliable for quick tasks |
| quick_task | 260513-l12-fix-applicationv2-referenceerror-in-foun | missing (SDK quirk) | SUMMARY present — task complete; SDK status field unreliable |
| quick_task | 20260514-raster-dynamic-infill | in-progress | **Carry to v0.9.12** — PLAN already scoped as v0.9.11→v0.9.12 spec bump (z=0.5 idle infill layer). Will become a v0.9.12 requirement during /gsd-new-milestone. |

**Total:** 16 items deferred. 13 hardware-pending (ADR-0005 Branch A), 2 SDK false positives, 1 genuine carry → v0.9.12.

## Session Continuity

Last session: 2026-05-17T09:12:10.947Z
Stopped at: Completed 09-05-PLAN.md (Phase 9 CLOSED)
Resume file: None
Resume cmd: /gsd-execute-phase 10 01

## /gsd-autonomous 2026-05-17 run — Phase 10 closure

**PHASE_10_CLOSED** — 5/5 plans committed 2026-05-17. **MVP SOFTWARE-COMPLETE.**

### Commits per plan

| Plan | Commit | Description |
|------|--------|-------------|
| 10-01 | 730145c + acc4776 + a7305f6 + f98f331 | WsReconnectController (exponential backoff 1s→30s) + SeqTracker + buildSyncLostChip (IT/EN ≤38 cp INV-1) + boot-engine wiring |
| 10-02 | f012e6a + 9ec940f + 6316764 + 397148f + 9e0c745 | PerfProbe (5 stations, T-10-02 SHA-256 hash gate) + PerfSampleEnvelopeSchema + phase-10-latency.md template (TDD) |
| 10-03 | f6c842a + 98382a0 + 62b86a3 | INV-1..5 verification suite orchestrator + inv:all single-command + path fix (TDD) |
| 10-04 | bcb4e91 | 5 MVP docs + Specs.md boot-splash INV-3 atomic coherence fix (v0.9.11→v0.9.12) |
| 10-05 | ee39fb1 + (state commit) | 10-VERIFICATION.md + STATE/ROADMAP/REQUIREMENTS closure flip |

### Test totals

- Phase 10 start (after 09-05): 2036 tests
- Phase 10 end (after 10-05): 2097 tests
- Net Phase 10 addition: +61 tests across 5 plans (+26 Plan 01, +15 Plan 02, +22 Plan 03, +0 Plan 04+05)

### Key invariants confirmed (Phase 10 closure)

- `registerComplexHandler` count = **14** (re-grepped at Phase 10-05 closure: `grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts` = 14)
- ADR-0011 single-workflow-origin discipline: `activity.use(` absent from g2-app + bridge source code (CI Gate 8 green; sole match in slot-picker-panel.ts:29 is a JSDoc comment)
- INV-1..5 verification suite green (Plan 10-03 `inv:all:skip-inv2`): INV-1 ✓ / INV-2 ⚠ skipped / INV-3 ✓ / INV-4 ✓ / INV-5 ✓
- INV-3 atomic doc-coherence verified (Plan 10-04 single commit `bcb4e91` per Phase 1 Plan 03 precedent `671a22d`)

### REQ-ID coverage (Phase 10)

Phase 10 lands NO new v1 REQ-IDs — this is a cross-cutting verification + hardening phase. All 48 v1 REQ-IDs software-closed across Phases 0–9 (REQUIREMENTS.md as SoT).

### Hardware-pending carry-forward (Phase 10 — 3 new SCs)

SC-10-01: Multi-session field test (≥2 real D&D sessions, consenting DM, NASA-TLX + Borg CR-10 recorded, mid-session DM-setting broadcast verified)
SC-10-02: Latency p50 <400 ms end-to-end measured via PerfProbe in real sessions (docs/perf/phase-10-latency.md populated)
SC-10-03: Microwave / 2.4 GHz worst-case RF test — SYNC LOST chip fires + session-state recovery verified on real hardware

Previous hardware-pending running total (Phases 4a + 4b + 5 + 6 + 7 + 8 + 9): 29 SCs
Phase 10 adds: 3 SCs
New running total: **32 hardware-pending SCs** carried to ADR-0005 Branch A human_needed

### MVP software-complete signal

Phase 10 CLOSED. **MVP software-complete.** All 11 MVP phases (0, 1, 2, 3, 4a, 4b, 5, 6, 7, 8, 9, 10) have shipped their software deliverables. 32 hardware-pending SCs carry to ADR-0005 PROVISIONAL Branch A human_needed — close via `pnpm --filter @evf/validation-harness validate:all` once G2 + R1 hardware and a consenting DM are available. v0.9.11 milestone audit unblocked. Recommendation: run `/gsd-cleanup 10` to archive phase artifacts, then `/gsd milestone-audit v0.9.11` (or proceed to hardware field test per `docs/field-test-template.md`).

## /gsd-autonomous 2026-05-16 run — Phase 9 closure

**PHASE_9_CLOSED** — 5/5 plans committed 2026-05-16.

### Commits per plan

| Plan | Commit | Description |
|------|--------|-------------|
| 09-01 | (prior) | ActionEconomyPayloadSchema + combat-action-tracker + action-economy-dispatcher + audit-log attackId dedup |
| 09-02 | (prior) | ActionEconomyWidget + 4 INV-1 economy fixtures + ActionOptionsModal client-side preconditioner |
| 09-03 | (prior) | conc-retry-cache + ConcentrationDropModalPanel dual-emit tap flow + concentration-detector |
| 09-04 | (prior) | SlotPickerPanel SPP-01..12 + ActionOptionsModal requiresSlotPicker branch + cast-spell slot forwarding + 4 INV-1 fixtures |
| 09-05 | 1fe7fa2, 2d9f166 | ISM-W9-01..10 g2-app + FM-ISM-W9-01..10 foundry-module integration smoke |

### Test totals

- Phase 9 start (after 08-05): 1858 tests
- Phase 9 end (after 09-05): 2036 tests
- Net Phase 9 addition: +178 tests across 5 plans (+20 from Plan 05: ISM-W9-01..10 + FM-ISM-W9-01..10)

### Key invariants confirmed (Phase 9 closure)

- `registerComplexHandler` count = **14** (confirmed in ISM-W9-10 + FM-ISM-W9-09 via readFileSync grep of socketlib-handlers.ts)
- ADR-0011 single-workflow-origin discipline: `activity.use(` absent from g2-app + bridge (CI Gate 8 green)
- T-09-01 double trust boundary: outer EnvelopeSchema + inner ActionEconomyPayloadSchema (AED-01..10)
- T-09-03 single-attempt retry invariant: `consumeLatestConfirmed()` deletes on access; ISM-W9-06 confirms null after [Y]
- INV-1 Layout integrity: 8 INV-1 fixtures (4 economy + 4 slot-picker) all pass matchAsciiFixture
- INV-4 Code quality: typecheck + biome ci exit 0; no TODO without issue link

### REQ-ID coverage (Phase 9)

| REQ-ID | Requirement | Plans |
|--------|-------------|-------|
| COMB-02 | Action/Bonus/Reaction enforcement widget + slot consumption | 09-01, 09-02, 09-03, 09-04, 09-05 |

### Hardware-pending carry-forward (Phase 9 — 3 new SCs)

SC-09-01: Action Economy Widget renders character-perfect on real G2 display (INV-1 visual on device; slot icons + row layout hold under phosphor green at 576×288)
SC-09-02: Concentration drop end-to-end on real Foundry world + dnd5e 5.3.3 (Hold Person while concentrating on Bless → modal → [Y] → Bless effect.delete() → Hold Person proceeds)
SC-09-03: SlotPickerPanel scroll-cycle feels right on real R1 ring (scroll up/down advances selection; tap confirms; 3rd-level default for Fireball; upcast to 4th selectable)

Previous hardware-pending running total (Phases 4a + 4b + 5 + 6 + 7 + 8): 26 SCs
Phase 9 adds: 3 SCs
New running total: **29 hardware-pending SCs** carried to ADR-0005 Branch A human_needed

### Phase 10 ready signal

Phase 9 CLOSED. Phase 10 (Polish & Field Test MVP) is unblocked. Resume cmd: `/gsd-execute-phase 10 01`

## /gsd-autonomous 2026-05-16 run — Phase 7 closure

**PHASE_7_CLOSED** — 6/6 plans committed 2026-05-16.

### Commits per plan

| Plan | Commit | Description |
|------|--------|-------------|
| 07-01 | (prior) | Tool Registry + IdempotencyStore + audit-log + foundry-globals.d.ts + ADR-0011 ACCEPTED + CI Gate 8 |
| 07-02 | (prior) | 4 Wave 1 handlers: cast-spell + weapon-attack (single) + use-item + move-token |
| 07-03 | (prior) | AoE template placement: placeTemplateHandler + confirmTemplatePlacementHandler + TemplatePlacementPanel |
| 07-04 | (prior) | Multi-attack Path B: count loop + r1.multiattack.progress + [Atk N/M] chip + INV-1 fixture |
| 07-05 | (prior) | Reaction watcher (dnd5e.preUseActivity) + drop-concentration handler + ConcentrationDropModalPanel |
| 07-06 | e3fe4de, ceb95e9 | Bearer rotation scheduler + ISM-W7-01..08 integration smoke |

### Test totals

- Phase 7 start (after 07-01): ~300 tests
- Phase 7 end (after 07-06): 328 tests (foundry-module only)
- Net Phase 7 addition: ~28 tests across 6 plans (300 baseline + 28 new)

### Key invariants confirmed (Phase 7 closure)

- `registerComplexHandler` count = **14** (never exceeded; 7 renames happened in-place across Plans 01/03/05)
- ADR-0011 single-workflow-origin discipline: `activity.use(` absent from g2-app + bridge (CI Gate 8 green)
- `generateBearer(refresh=true)` infra reused for bearer rotation — NO changes to `validateBearer()` (RESEARCH §Q6)
- TDD: RED→GREEN on all bearer-rotation tests + ISM-W7 integration smoke

### REQ-ID coverage (Phase 7)

| REQ-ID | Requirement | Plan |
|--------|-------------|------|
| FOUN-03 | GM-side executeAsGM write path | 07-01, 07-02 |
| ACT-02 | AoE template placement | 07-03 |
| ACT-03 | activity.use() wrapper | 07-02 |
| MULTI-01 | Multi-attack path B client-side loop | 07-04 |
| REACT-01 | Reaction passive-notification toast | 07-05 |
| CONC-01 | Concentration drop trigger | 07-05 (closure) |

### Hardware-pending carry-forward (Phase 7 — 5 new SCs)

SC-07-01: Real `executeAsGM` round-trip — cast-spell produces real chat card in Foundry test world
SC-07-02: Real Magic Missile (target.count=3) lands 3 MeasuredTemplate documents with correct x/y placement via R1 taps
SC-07-03: Fighter L5+ Extra Attack with MidiQOL autoFastForward produces 2 chat cards + chip ticks [Atk 1/2] → [Atk 2/2] on G2
SC-07-04: Phase 4b conc-drop modal tap → tool.invoke → effect.delete removes concentration in real Foundry world
SC-07-05: Real NPC attack fires dnd5e.preUseActivity → r1.reaction.available envelope → toast visible on G2 ~3s dwell

Previous hardware-pending running total (Phases 4a + 4b + 5 + 6): 18 SCs
Phase 7 adds: 5 SCs
New running total: **23 hardware-pending SCs** carried to ADR-0005 Branch A human_needed

### Hardware-pending carry-forward (Phase 8 — 3 new SCs)

SC-08-01: Real spellbook tap-to-cast round-trip — SpellbookPanel long-press → ActionOptionsModal → tool.invoke → cast-spell handler → real Foundry chat card
SC-08-02: Real combat tracker QA-bar [A][S][I][M] double-tap fires matching flow on real G2 hardware
SC-08-03: Action-result toast renders correctly on real G2 display (d20 + outcome + damage ≤ 38 chars, 3s dwell)

Previous hardware-pending running total (Phases 4a + 4b + 5 + 6 + 7): 23 SCs
Phase 8 adds: 3 SCs
New running total: **26 hardware-pending SCs** carried to ADR-0005 Branch A human_needed

### Hardware-pending carry-forward (Phase 9 — 3 new SCs)

SC-09-01: Action Economy Widget renders character-perfect on real G2 display (INV-1 visual on device; slot icons + row layout hold under phosphor green at 576×288)
SC-09-02: Concentration drop end-to-end on real Foundry world + dnd5e 5.3.3 (Hold Person while concentrating on Bless → modal → [Y] → Bless effect.delete() → Hold Person proceeds)
SC-09-03: SlotPickerPanel scroll-cycle feels right on real R1 ring (scroll up/down advances selection; tap confirms; 3rd-level default for Fireball; upcast to 4th selectable)

Previous hardware-pending running total (Phases 4a + 4b + 5 + 6 + 7 + 8): 26 SCs
Phase 9 adds: 3 SCs
New running total: **29 hardware-pending SCs** carried to ADR-0005 Branch A human_needed

### Phase 10 ready signal

Phase 9 CLOSED. Phase 10 (Polish & Field Test MVP) is unblocked. Resume cmd: `/gsd-execute-phase 10 01`

## /gsd-autonomous 2026-05-17 run — Phase 13 closure

**PHASE_13_CLOSED** — 4/4 plans committed 2026-05-17. V2 Stretch complete. **v0.9.11 MILESTONE-COMPLETE.**

### Commits per plan

| Plan | Commit | Description |
|------|--------|-------------|
| 13-01 | (see SUMMARY) | 3 reaction handlers (cast-shield + cast-counterspell + opportunity-attack) + shared-protocol input schemas + socketlib registrations 14 → 17 + module.test invariant flip |
| 13-02 | (see SUMMARY) | ReactionPromptPanel (z=2) + reaction-prompt-dispatcher (500ms debounce + 5s timeout + concurrent-drop) + combat-action-tracker reaction slot accounting + 3 INV-1 fixtures |
| 13-03 | (see SUMMARY) | character-reader portrait.url + bridge GET /v1/portrait/:actorId (SSRF deny-list + SHA-256 cache + image-q/upng-js dither pipeline) + r1.portrait.ready envelope schema |
| 13-04 | 5e4ece7 + 1109bdb + cb9339a + (docs) | portrait-state cache + portrait-dispatcher + MapBaseLayer.setPortraitOverride + CharacterSheetPanel Bio portrait wiring + boot-engine wiring + ISM-13-01..10 + 13-VERIFICATION.md + INV-3 atomic closure |

### Test totals

- Phase 13 start (after 12-03): ~1263 g2-app + other packages = ~2097 workspace
- Phase 13 end (after 13-04): **2423 tests** (167 test files, all pass)
- Net Phase 13 addition: +326 tests across 4 plans

### Key invariants confirmed (Phase 13 closure)

- `registerComplexHandler` count = **17** (FLIPPED from 14 in Plan 13-01; re-grepped at Phase 13-04 closure: `grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts` = 17)
- ADR-0011 single-workflow-origin discipline: `activity.use(` absent from g2-app + bridge source code (CI Gate 8 green — sole match in slot-picker-panel.ts:29 is JSDoc comment)
- T-13-03 double trust boundary: portrait-dispatcher outer EnvelopeSchema + inner PortraitReadyPayloadSchema; PD-01..06 GREEN
- T-13-04 reaction handler bearer integrity: all 3 handlers via dispatchTool (bearer + idempotency); RH-SHIELD/CS/OA-01..06 GREEN
- Container budget SDK cap (4 image / 8 text) not exceeded: portrait occupies MapBaseLayer image SLOT (no new container); CharacterSheetPanel.getContainerCount stays {image:0, text:1} — D-13-08 final decision
- INV-1 Layout integrity: 5 new INV-1 fixtures (3 reaction prompt + 2 Bio tab portrait states) all pass matchAsciiFixture
- INV-3 atomic doc-coherence: 13-VERIFICATION.md + STATE.md + ROADMAP.md committed in single atomic commit per Phase 10 precedent (ee39fb1) + Phase 12 precedent (4106286)

### REQ-ID coverage (Phase 13)

| REQ-ID | Requirement | Plans |
|--------|-------------|-------|
| ACT-04 | Reaction execution (Shield + Counterspell + OA) | 13-01, 13-02, 13-04 |
| STRETCH-06 | Sheet portrait behind view.features.portrait flag | 13-03, 13-04 |

7 deferred (STRETCH-01..05, 07, 08): explicitly out of v0.9.11 scope per 13-CONTEXT.md.

### Hardware-pending carry-forward (Phase 13 — 2 new SCs)

| SC | Description | Target |
|----|-------------|--------|
| SC-13-01 | Real Foundry world + R1 reaction UAT (Shield / Counterspell / OA) | ACT-04 end-to-end on hardware |
| SC-13-02 | Real G2 portrait fidelity (100×60 4-bit phosphor greyscale) | STRETCH-06 visual on device |

Previous running total: 33 hardware-pending SCs (Phase 12 closure)
Phase 13 adds: 2 SCs (SC-13-01 + SC-13-02)
New running total: **35 hardware-pending SCs** carried to ADR-0005 Branch A human_needed

### v0.9.11 MILESTONE-COMPLETE signal

v0.9.11 MILESTONE-COMPLETE — All 15 phases (0,1,2,3,4a,4b,5,6,7,8,9,10,11,12,13) software-complete. 35 hardware-pending SCs carried to ADR-0005 Branch A human_needed. Close via `pnpm --filter @evf/validation-harness validate:all` once G2 + R1 + Deepgram key + consenting DM + multi-session field test are available. Recommendation: run `/gsd-cleanup 13` to archive phase artifacts, then `/gsd milestone-audit v0.9.11`.

---

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

---

## Phase 11 closure — 2026-05-17

**PHASE_11_CLOSED** — 4/4 plans committed 2026-05-17. V2 MCP server complete.

### Commits per plan

| Plan | Commit | Description |
|------|--------|-------------|
| 11-01 | 038700f | Workspace package scaffold + env-loader + pino logger + McpServer factory + stdio + Streamable HTTP entrypoints |
| 11-02 | d89ce59 | BridgeClient WS proxy + FIFO queue + BridgeAuthExpiredError + 6 MCP tools using Phase 7 Zod .shape schemas |
| 11-03 | 0a19081 | ResourceCache + WS delta subscription + 4 MCP resources + REST fallback + sendResourceUpdated (52 tests) |
| 11-04 | see below | Docker image + docs/mcp-verification.md + Claude Desktop config snippet + smoke test + no-sse-import gate + Phase 11 closure |

11-04 commits: b4d5260 (bridge-soft-fail + /healthz), cc41b6d (smoke test + no-sse-import), 6e21a2a (Docker + compose), fb9b016 (docs)

### Key invariants confirmed (Phase 11 closure)

- `registerComplexHandler` count = 14 (re-grep `packages/foundry-module/src/pair/socketlib-handlers.ts` — Phase 11 touches NOTHING in foundry-module)
- HTTP+SSE deprecation upheld: 0 real imports of `server/sse` or `SSEServerTransport` in packages/foundry-mcp/src/ (Task 2 no-sse-import test GREEN)
- ADR-0004 (voice-via-mcp-not-internal) ratified via shipping foundry-mcp package
- No new auth surface: env-var bearer reuses Phase 7 24h bearer
- 56/56 foundry-mcp tests pass (unit + no-sse-import gate + Inspector smoke test)

### REQ-ID coverage (Phase 11)

| REQ-ID | Requirement | Plans |
|--------|-------------|-------|
| VOICE-02 | MCP tools mirror Tool Registry §5.3 | 11-01, 11-02, 11-04 |
| VOICE-03 | Resources exposed (actor/scene/combat/log) | 11-01, 11-03, 11-04 |

### Hardware-pending carry-forward (Phase 11 — 0 new SCs)

Phase 11 is pure software/Node-side. No G2 hardware involvement. Running hardware-pending total stays at 32 (Phase 10 closure carry).

### V2 readiness signal

Phase 11 CLOSED. Phase 12 (V2 Voice UX Tuning) is unblocked. Resume cmd: `/gsd-plan-phase 12`.

---

## Phase 12 closure — 2026-05-17

**PHASE_12_CLOSED** — 3/3 plans committed 2026-05-17. V2 Voice UX Tuning complete (software-complete; SC-12-01 hardware-pending).

### Commits per plan

| Plan | Commit | Description |
|------|--------|-------------|
| 12-01 | c7e5a9e | Levenshtein + NFD normalisation (levenshtein.ts) |
| 12-01 | 541f8a7 | 70-entry SPELL_LOOKUP table + lookupSpellId (spell-lookup.ts) |
| 12-01 | a2847a3 | SLANG_VERBS + detectClarify + voice-no-secret-leak grep gate (clarify-detector.ts) |
| 12-02 | 8f7c158 | VoiceTranscriptPayloadSchema + R1_VOICE_TRANSCRIPT_TYPE (shared-protocol) |
| 12-02 | afb24bb | WORKED_EXAMPLES A/B/C (worked-examples.ts) |
| 12-02 | c6da916 | GM_AGENT_SYSTEM_PROMPT + buildGmAgentPrompt (gm-agent-prompt.ts) |
| 12-03 | e489cca | Deepgram adapter + /v1/audio/stream route + server.ts wiring + pino redact + deploy/.env.example (Task 1) |
| 12-03 | 38c7763 | audio-capture.ts + boot-engine voice-cap gate + ISM-12-01/06 (Task 2) |

### Key invariants confirmed (Phase 12 closure)

- `registerComplexHandler` count = **14** (re-grep `packages/foundry-module/src/pair/socketlib-handlers.ts` — Phase 12 touches NOTHING in foundry-module)
- `DEEPGRAM_API_KEY` confined to `packages/bridge/src/voice/` and `deploy/.env.example` only (grep confirms 0 runtime occurrences in g2-app/src/, foundry-mcp/src/, shared-protocol/src/)
- Deepgram auth scheme: `Authorization: Token <KEY>` (NOT Bearer) — enforced by DG-06 test
- pino redact extended with 4 new field paths: `apiKey`, `deepgramKey`, `*.apiKey`, `*.deepgramKey` — enforced by VSR-01..05
- T-12-09 mic-state hygiene: defensive audioControl(false) on unexpected WS close — enforced by AC-10
- VOICE-05 (no TTS surface): GP-14 asserts prompt contains no TTS directives

### Test totals (Phase 12)

| Package | Tests before | Tests after | Delta |
|---------|-------------|-------------|-------|
| foundry-mcp | 56 | 56 + 43 = 99 | +43 (Plan 12-01: 24 + Plan 12-02: 19) |
| shared-protocol | (pre-existing) | +7 VP-01..07 | +7 |
| bridge | (pre-existing) | +13 DG-01..13 + 8 ASR-01..08 + 5 VSR-01..05 = +26 | +26 |
| g2-app | 1249 | 1249 + 14 AC-01..14 = 1263 | +14 |

### REQ-ID coverage (Phase 12)

| REQ-ID | Requirement | Plans |
|--------|-------------|-------|
| VOICE-01 | Audio capture via bridge.audioControl() | 12-03 T2 |
| VOICE-04 | External STT — Deepgram Nova-3 + IT↔EN lookup | 12-01, 12-02, 12-03 T1 |
| VOICE-05 | Visual-only output — no TTS | 12-02, 12-03 T1 |

### Hardware-pending carry-forward (Phase 12 — 1 new SC)

| SC | Description | Target |
|----|-------------|--------|
| SC-12-01 | End-to-end voice flow on real G2 + R1 + Deepgram | p50 latency ≤ 800 ms speech-end → toast |

Previous running total: 32 hardware-pending SCs (Phase 10 closure)
Phase 12 adds: 1 SC (SC-12-01)
New running total: **33 hardware-pending SCs** carried to ADR-0005 Branch A human_needed

### V2 closure signal

Phase 12 CLOSED. V2 OPZIONALE voice path is software-complete. SC-12-01 deferred to ADR-0005 Branch A human_needed (requires G2 + R1 hardware + Deepgram key). Phase 13 (V2 Stretch) is unblocked when hardware access becomes available for SC-12-01 verification. Resume cmd: `/gsd-plan-phase 13`.

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
