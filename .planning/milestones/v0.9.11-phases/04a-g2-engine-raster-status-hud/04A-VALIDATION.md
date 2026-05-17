---
phase: 4a
slug: g2-engine-raster-status-hud
status: finalized
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-14
last_revised: 2026-05-15
revision_note: "Per 04A-PLAN-CHECK.md B-3 + W-2 (rev 1) and NF-1 + NF-2 + NF-3 + NF-4 (rev 2): reconciled test paths with finalized PLAN.md files, added per-ck INV-1 named tests, flipped frontmatter to nyquist_compliant: true, then in rev 2 corrected Plan 06 test paths to colocate beside source (shared-protocol payloads/, foundry-module src/) and updated W-4 closure note to reference Option B / NF-2 lock. Per-Task Verification Map now references actual task IDs from revised plans (including new Plan 06)."
---

# Phase 4a — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Hardware-dependent SC inherit `human_needed` gate per ADR-0005 PROVISIONAL Branch A — see Manual-Only section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 (workspace `test.projects`) + happy-dom 20.9.0 for Web Worker / OffscreenCanvas mocks |
| **Config file** | `vitest.config.ts` (root) + `packages/g2-app/vitest.config.ts` + `packages/shared-render/vitest.config.ts` + `packages/foundry-module/vitest.config.ts` + `packages/shared-protocol/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @evf/g2-app test --run` |
| **Full suite command** | `pnpm test:coverage` |
| **Estimated runtime** | ~30 seconds (full workspace; Phase 4a adds ~12s for raster + status-HUD + scene-input + canvas-extractor + adversarial-typecheck suites) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @evf/g2-app test --run` (or `@evf/shared-render` / `@evf/foundry-module` / `@evf/shared-protocol` for cross-package tasks)
- **After every plan wave:** Run `pnpm test:coverage`
- **Before `/gsd-verify-work`:** Full workspace suite must be green (`pnpm lint:ci && pnpm typecheck && pnpm test:coverage`)
- **Max feedback latency:** 30 seconds (35 s including B-1 adversarial typecheck child-process invocation)

---

## Per-Task Verification Map

> Reconciled 2026-05-15 with finalized 04A-NN-PLAN.md task files. Test paths verified against `<files>` field in each plan. Rev 2 (2026-05-15) reflects NF-3 colocation correction for Plan 06.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 4a-01-01 | 01 | 0 | — (scaffolding) | T-4a-W0-01 | npm deps pinned exact; type-check green | unit | `pnpm install --frozen-lockfile && pnpm typecheck` | ☑ planned |
| 4a-01-02 | 01 | 0 | — (scaffolding) | T-4a-W0-02 | ADR-0009 file present (status=proposed); layer-types.ts exports ZIndex + Layer + LayerOp + LayerManagerError + RasterControllerLike (B-4 type-only contract) | source | `test -f docs/architecture/0009-layer-manager-contract.md && grep -c 'RasterControllerLike' packages/g2-app/src/engine/layer-types.ts` | ☑ planned |
| 4a-02-01 | 02 | 1 | DISP-01, DISP-02, NAV-04 | T-4a-02-02 | LayerManager.mount enforces capture-invariant at 0/1/2 counts + capability gating; bundle() single-flush | unit | `pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/layer-manager.test.ts` | ☑ planned |
| 4a-02-02 | 02 | 1 | DISP-01, NAV-04 | T-4a-02-01, T-4a-02-03 | performCapabilityHandshake safeParse + 10s timeout; probeBleThroughput threshold 100 kbps | unit | `pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/page-lifecycle.test.ts src/engine/__tests__/capability-handshake.test.ts src/engine/__tests__/boot-splash.test.ts` | ☑ planned |
| 4a-03-01 | 03 | 2 | MAP-03 | T-4a-03-01 | tile-delta detects 18 sub-tiles/tile (6×3 floor; B-2 user resolution); rle-encoder 4-bit roundtrip | unit | `pnpm --filter @evf/g2-app test --run -- src/raster/__tests__/tile-delta.test.ts src/raster/__tests__/rle-encoder.test.ts` | ☑ planned |
| 4a-03-02 | 03 | 2 | MAP-02 | T-4a-03-02 | glyph-renderer 96×24 AsciiGrid with canonical glyph dictionary; MapBaseLayer routes raster↔glyph via getMapMode + RasterControllerLike type-only import (B-4) | unit | `pnpm --filter @evf/g2-app test --run -- src/raster/__tests__/glyph-renderer.test.ts src/raster/__tests__/map-base-layer.test.ts` | ☑ planned |
| 4a-03-03 | 03 | 2 | MAP-02, MAP-03, MAP-04 | T-4a-03-02, T-4a-03-04 | raster-controller debounce 200 ms + 0.3 fps heartbeat + 3-failure → glyph; implements RasterControllerLike (B-4 closure) | unit | `pnpm --filter @evf/g2-app test --run -- src/raster/__tests__/raster-controller.test.ts` | ☑ planned |
| 4a-04-01 | 04 | 2 | DISP-01, I18N-04 | T-4a-04-02 | StatusHudRenderer 5-field 28×21 corner card + em-dash missing + ellipsis loading; i18n-budgets HUD_WIDTH_BUDGETS satisfies gate | unit | `pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/status-hud-renderer.test.ts src/status-hud/__tests__/i18n-budgets.test.ts` | ☑ planned |
| 4a-04-01b | 04 | 2 | I18N-04 | T-4a-04-02 | **B-1 adversarial typecheck:** tsc --noEmit against budget-bust.fixture.ts exits non-zero with TS error code (proves CI catches budget violations) | unit | `pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/i18n-budgets-adversarial.test.ts` | ☑ planned |
| 4a-04-02 | 04 | 2 | DISP-01, DISP-02 | T-4a-04-01, T-4a-04-03 | StatusHudLayer + IdleInfillLayer Layer-implements + safeParse delta receive + heartbeat | unit | `pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/status-hud-layer.test.ts src/status-hud/__tests__/idle-infill-layer.test.ts` | ☑ planned |
| 4a-04-03-ck11 | 04 | 2 | DISP-03 | T-4a-04-02 | **W-2 INV-1 ck 11:** status-hud.hp-overflow + conditions-overflow fixtures match (numeric + conditions overflow) | snapshot | `pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/snapshot.test.ts -t "INV-1 ck 11"` | ☑ planned |
| 4a-04-03-ck12 | 04 | 2 | DISP-03 | T-4a-04-02 | **W-2 INV-1 ck 12:** glyph-scene.raster-idle fixture matches (default raster baseline) | snapshot | `pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/snapshot.test.ts -t "INV-1 ck 12"` | ☑ planned |
| 4a-04-03-ck13 | 04 | 2 | DISP-03 | T-4a-04-02 | **W-2 INV-1 ck 13:** glyph-scene.glyph-idle fixture matches + [GLY] badge at col 93-95 explicit cell check | snapshot | `pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/snapshot.test.ts -t "INV-1 ck 13"` | ☑ planned |
| 4a-04-03-ck14 | 04 | 2 | DISP-03, I18N-04 | T-4a-04-02 | **W-2 INV-1 ck 14:** raster-idle-it + raster-idle-en + raster-idle-de fixtures match (i18n stress) | snapshot | `pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/snapshot.test.ts -t "INV-1 ck 14"` | ☑ planned |
| 4a-04-03-ck15 | 04 | 2 | DISP-03 | T-4a-04-02 | **W-2 INV-1 ck 15:** status-hud.loading fixture matches (placeholder state) | snapshot | `pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/snapshot.test.ts -t "INV-1 ck 15"` | ☑ planned |
| 4a-06-01 | 06 | 2 | MAP-01 | T-4a-06-02 | FramePixelsSchema bounds (20-288 × 20-144) + base64 encode/decode roundtrip + cross-schema envelope contract (FP-10) via real `EnvelopeSchema` (NF-1 corrected). Test colocated beside source per NF-3. | unit | `pnpm --filter @evf/shared-protocol test --run -- src/payloads/frame.test.ts` | ☑ planned |
| 4a-06-02 | 06 | 2 | MAP-01 | T-4a-06-01 | canvas-extractor registers 4 Foundry hooks + 200 ms debounce + extractCurrentFrame produces valid FramePixels payload (bridge wraps in EnvelopeSchema). Test colocated beside source per NF-3. | unit | `pnpm --filter @evf/foundry-module test --run -- src/canvas-extractor.test.ts` | ☑ planned |
| 4a-06-03 | 06 | 2 | MAP-01 | T-4a-06-02, T-4a-06-05 | scene-input.ts WS receiver: `EnvelopeSchema.safeParse` (outer) + `FramePixelsSchema.safeParse` (`envelope.payload`) double safeParse → controller.requestFrame dispatch (NF-1 corrected — no `WireEnvelopeSchema`, carrier is `payload`); SI-7 verifies transferable-prerequisite only (Plan 03 RC-2 owns end-to-end zero-copy per NF-4) | unit | `pnpm --filter @evf/g2-app test --run -- src/__tests__/scene-input.test.ts` | ☑ planned |
| 4a-05-01 | 05 | 3 | DISP-01, DISP-02, NAV-04, MAP-01..04 | T-4a-05-01..02 | End-to-end smoke: boot → handshake → first raster frame via Plan 06 frame_pixels chain → HUD redraw on delta; W-4 boundary (Option B / NF-2 lock: bootEngineForTest from index.test-support.ts; _bootEngineCore from internal/boot-engine-core.ts) | integration | `pnpm --filter @evf/g2-app test --run -- src/__tests__/scene-renderer-smoke.test.ts` | ☑ planned |
| 4a-05-02 | 05 | 3 | — (doc) | T-4a-05-03 | ADR-0009 ACCEPTed + docs/architecture/README.md row updated + ROADMAP 6/6 plans | source | `grep -c '^status: accepted' docs/architecture/0009-layer-manager-contract.md && grep -c '04A-06-PLAN' .planning/ROADMAP.md` | ☑ planned |

*Status: ⬜ pending · ☑ planned · ✅ green (after execute-plan) · ❌ red · ⚠️ flaky*

**Per-task ID → test file mapping (B-3 + NF-3 reconciliation 2026-05-15):**

Test files referenced above MATCH the `files_modified` field in each finalized PLAN.md:
- Plan 01: `docs/architecture/0009-layer-manager-contract.md` + `packages/g2-app/src/engine/layer-types.ts` (+ 4 scaffold files)
- Plan 02: `packages/g2-app/src/engine/__tests__/{layer-manager,page-lifecycle,capability-handshake,boot-splash}.test.ts`
- Plan 03: `packages/g2-app/src/raster/__tests__/{tile-delta,rle-encoder,raster-controller,glyph-renderer,map-base-layer}.test.ts` (5 files; B-3 corrected from earlier draft references to non-existent `image-q-worker.test.ts` / `delta-hasher.test.ts` / `tile-encoder.test.ts` / `scene-renderer.test.ts`)
- Plan 04: `packages/g2-app/src/status-hud/__tests__/{status-hud-renderer,i18n-budgets,i18n-budgets-adversarial,status-hud-layer,idle-infill-layer,snapshot}.test.ts` (6 files; W-2 + B-1 additions)
- Plan 05: `packages/g2-app/src/__tests__/{example-status-hud,scene-renderer-smoke}.test.ts` + `packages/g2-app/src/internal/boot-engine-core.ts` + `packages/g2-app/src/index.test-support.ts` (NF-2: Option B locked; _bootEngineCore body lives in `internal/` so `index.ts` is grep-gate-clean)
- Plan 06 (NF-3 colocation): `packages/shared-protocol/src/payloads/frame.test.ts` (colocated beside `payloads/frame.ts`) + `packages/foundry-module/src/canvas-extractor.test.ts` (colocated beside `canvas-extractor.ts`) + `packages/g2-app/src/__tests__/scene-input.test.ts` (g2-app's existing `__tests__/` convention preserved — only foundry-module + shared-protocol corrected by NF-3)

---

## Wave 0 Requirements

- [x] `packages/g2-app/package.json` — add `image-q@4.0.0`, `upng-js@2.1.0`, `xxhash-wasm@1.1.0` to dependencies (Plan 01 Task 1)
- [x] `packages/g2-app/vitest.config.ts` — extend with happy-dom env + Worker mock for unit tests (Plan 01 Task 2)
- [x] `packages/g2-app/src/engine/__tests__/`, `packages/g2-app/src/raster/__tests__/`, `packages/g2-app/src/status-hud/__tests__/` — test directories scaffolded with .gitkeep (Plan 01 Task 2)
- [x] `packages/shared-render/src/fixtures/{status-hud,glyph-scene}.*.txt` — 9 INV-1 fixtures populated from UI-SPEC.md (Plan 04 Tasks 1+2)
- [x] `docs/architecture/0009-layer-manager-contract.md` — ADR scaffolded (PROPOSED status) (Plan 01 Task 2); ACCEPTed in Plan 05 Task 2
- [x] Worker mock shim for happy-dom (OffscreenCanvas, postMessage) committed under `packages/g2-app/src/__tests__/test-helpers/worker-mock.ts` (Plan 01 Task 2)
- [x] **RasterControllerLike type-only contract** in layer-types.ts (Plan 01 Task 2 — B-4 forward-cycle mitigation)
- [x] **B-1 adversarial fixture infrastructure:** `packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts` excluded from production tsconfig (Plan 04 Task 1)

---

## Manual-Only Verifications

> These SC carry `human_needed` gate per ADR-0005 PROVISIONAL Branch A. Software-side correctness is fully verifiable above; these require physical G2 hardware + Even Realities phone-side WebView + Foundry desktop running.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Capability handshake on real G2: splash → handshake → main HUD with negotiated `SERVER_CAPS_V1` | DISP-01, DISP-02, NAV-04 | Requires physical G2 paired via QR code from Phase 2 wizard + Even Realities phone-side WebView loading the g2-app plugin host bundle | 1) QR-pair G2 via Phase 2 wizard. 2) Open plugin host URL in Even App. 3) Verify boot splash appears within 3 s. 4) Verify Status HUD card visible at z=1 within 8 s. 5) Check console for `handshake.complete` log line with `caps:` array. |
| Raster sustains ≥5 fps standard with measured BLE p50 latency in Phase 0 envelope | MAP-02, MAP-04 | BLE throughput / latency depend on RF environment + hardware revision; cannot be simulated in CI | 1) Run `pnpm validation-harness sustain --duration 600 --raster-fps 5` against paired G2 in clean RF environment. 2) Verify VALIDATION-HARNESS report: `fps_p50 >= 5`, `frame_latency_p50_ms <= phase0_envelope_p50`. 3) Re-run in `2.4 GHz+microwave` env (matches Phase 0 §10.0.3 protocol) — Branch B/C glyph fallback should auto-engage if p50 drops < 5 fps for 30 s sustained. |
| Branch B/C glyph fallback auto-degrades without operator intervention | MAP-04 | Auto-degradation trigger fires on real BLE throughput probe; mock probe cannot replicate jitter envelope | 1) Pair G2 in degraded RF env (microwave loaded 2.4 GHz). 2) Boot fresh session. 3) Observe handshake probe value < 100 kbps. 4) Verify scene paints in glyph mode (single-char tokens `@`/`M`/`N`/`o`). 5) Verify `[GLY]` badge visible in z=1 corner. 6) Move to clean RF env, restart session, verify Branch A raster engages. |
| INV-1 layout holds character-perfect on real G2 phosphor display | DISP-03, I18N-04 | Foundry-rendered fonts vs G2 firmware monospace require eyeball verification of column alignment under all 3 locales | 1) Switch Foundry world locale to IT. 2) Boot G2. 3) Photograph Status HUD; verify column 68 divider is straight top-to-bottom. 4) Repeat for EN, DE. 5) Force HP=`999/999` (longest numeric) — verify no column drift. |
| PIXI canvas extract via OffscreenCanvas does NOT block Foundry desktop UI (Plan 06 owns the extractor) | MAP-01 (Specs §11.5.7 pitfall 11) | Performance measurement requires real Foundry + real player canvas; CI cannot replicate desktop UI thread contention | 1) Open Foundry desktop with active combat scene + dnd5e PHB 2014 PC. 2) Start G2 raster pipeline. 3) Drag a token across the scene for 30 s. 4) Verify desktop UI remains interactive (no perceptible stutter). 5) Confirm Plan 03 raster pipeline Worker thread maintains ≥5 fps during the test. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (planner reconciled task IDs 2026-05-15 per B-3; NF-3 colocation reconciled 2026-05-15 rev 2)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (npm deps, ADR scaffolding, fixtures, RasterControllerLike contract, budget-bust adversarial fixture)
- [x] No watch-mode flags (all commands use `--run`)
- [x] Feedback latency < 30 s for quick command (< 35 s including adversarial typecheck child-process invocation)
- [x] Manual-Only section verified: 5 `human_needed` entries map to hardware-dependent SC carrying PROVISIONAL gate per ADR-0005
- [x] **B-1 closure:** I18N-04 satisfies gate has dedicated adversarial typecheck test (4a-04-01b row)
- [x] **B-2 closure:** Sub-tile geometry locked to user-resolved 18 (6×3 floor); no 28-ceil references in plans (B-3 reconciliation confirms Plan 03 source/test paths post-revision)
- [x] **B-3 closure:** Per-Task Verification Map references actual test file paths from finalized PLAN.md files; all checkboxes signed off
- [x] **B-4 closure:** RasterControllerLike type-only contract in Plan 01; MapBaseLayer (Plan 03 Task 2) imports type-only; RasterController (Plan 03 Task 3) implements; Plan 03 Task 2 typecheck passes at its commit boundary
- [x] **B-5 closure:** New Plan 06 supplies MAP-01 data source (canvas-extractor + FramePixels protocol + scene-input dispatch); Plan 05 SR-9 smoke test validates the composed chain
- [x] **W-1 closure:** Plan 03 size reduced (extraction moved to Plan 06); Plan 03 file count = 6 source + 5 tests; W-1 follow-up audit at execute-plan time
- [x] **W-2 closure:** INV-1 ck 11/12/13/14/15 each have a dedicated named test in `snapshot.test.ts` per Plan 04 Task 2; Per-Task Verification Map rows 4a-04-03-ck11 through 4a-04-03-ck15
- [x] **W-3 closure:** Plan 03 raster-worker.ts JSDoc references ADR-0006 for the boundary-absorption geometry rationale (no INV-4 untraceable explanatory comment)
- [x] **W-4 closure (NF-2 / Option B locked):** Plan 05 boot-sequence body lives in `packages/g2-app/src/internal/boot-engine-core.ts`; `packages/g2-app/src/index.ts` is a thin wrapper with zero `wsFactory`/`bridgeFactory` substrings (W-4 grep gate enforces); `TestingDependencies` + `bootEngineForTest` re-exported by `packages/g2-app/src/index.test-support.ts` (NOT by package main entry); production `BootEngineOpts` has no DI fields
- [x] **NF-1 closure (rev 2):** Plan 06 uses real `EnvelopeSchema` export from `@evf/shared-protocol` (NOT a non-existent `WireEnvelopeSchema`); carrier field is `envelope.payload` (NOT `.value`); required `session_id: z.string().uuid()` honored in fixtures + tests
- [x] **NF-3 closure (rev 2):** Plan 06 test paths colocated beside source — `packages/shared-protocol/src/payloads/frame.test.ts` + `packages/foundry-module/src/canvas-extractor.test.ts`; g2-app retains its existing `__tests__/` convention for `scene-input.test.ts` (g2-app convention unchanged by NF-3)
- [x] **NF-4 closure (rev 2):** Plan 06 must_haves SI-7 truth describes prerequisite-only scope (scene-input hands a transferable-capable buffer); end-to-end zero-copy Worker handoff is Plan 03 RC-2's responsibility

**Approval:** Finalized 2026-05-15 — planner revision 1 closed all blockers (B-1..B-5) and warnings (W-1..W-4); revision 2 closes NF-1..NF-4 from 04A-PLAN-CHECK.md iteration 2.

---

## Phase Closure Sign-Off

**Closed:** 2026-05-15 via Plan 05 Task 3 (`checkpoint:human-verify`) — operator
issued the `defer-hardware-tests` resume signal. The 5 Manual-Only Verifications
above are formally accepted as **carry-forward** under their `human_needed`
gate per ADR-0005 PROVISIONAL Branch A.

- Software-side verification status: **PASS** — 606 / 606 tests; typecheck +
  Biome + W-4 grep gate all green at HEAD.
- Hardware-side verification status: **deferred** — close via
  `pnpm --filter @evf/validation-harness validate:all` once real-G2 grants
  land. Each Manual-Only row's Test Instructions are the closure script.
- Re-validation triggers (any one re-opens the deferred gates):
  1. ADR-0005 Branch A downgrade to Branch B or C.
  2. Even Realities firmware release that changes the container-budget
     constants (currently 4 image + 8 text/list per page, 1 capture).
  3. INV-2 cross-validation round that flips a canonical claim used by the
     Plan 02 capability handshake or Plan 06 PIXI extractor.

**Phase 4a status:** **COMPLETE** (software-side fully delivered;
hardware-pending SC tracked under `human_needed`).
