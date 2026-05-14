---
phase: 4a
slug: g2-engine-raster-status-hud
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 4a — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Hardware-dependent SC inherit `human_needed` gate per ADR-0005 PROVISIONAL Branch A — see Manual-Only section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 (workspace `test.projects`) + happy-dom 20.9.0 for Web Worker / OffscreenCanvas mocks |
| **Config file** | `vitest.config.ts` (root) + `packages/g2-app/vitest.config.ts` + `packages/shared-render/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @evf/g2-app test --run` |
| **Full suite command** | `pnpm test:coverage` |
| **Estimated runtime** | ~25 seconds (full workspace; Phase 4a adds ~10s for raster + status-HUD suites) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @evf/g2-app test --run` (or `@evf/shared-render` if fixture-only change)
- **After every plan wave:** Run `pnpm test:coverage`
- **Before `/gsd-verify-work`:** Full workspace suite must be green (`pnpm lint:ci && pnpm typecheck && pnpm test:coverage`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Filled by planner from PLAN tasks. Initial scaffold below — planner replaces with actual task IDs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4a-01-01 | 01 | 0 | — | — | npm deps installed; type-check green | unit | `pnpm install --frozen-lockfile && pnpm typecheck` | ❌ W0 | ⬜ pending |
| 4a-01-02 | 01 | 0 | — | — | ADR-0009 file present | source | `test -f docs/architecture/0009-layer-manager-contract.md` | ❌ W0 | ⬜ pending |
| 4a-02-01 | 02 | 1 | DISP-01, DISP-02 | — | Layer Manager mounts z=0/0.5/1; isEventCapture invariant holds | unit | `pnpm vitest --run packages/g2-app/src/engine/__tests__/layer-manager.test.ts` | ❌ W0 | ⬜ pending |
| 4a-02-02 | 02 | 1 | DISP-01 | — | Splash → handshake → main HUD lifecycle | unit | `pnpm vitest --run packages/g2-app/src/engine/__tests__/capability-handshake.test.ts` | ❌ W0 | ⬜ pending |
| 4a-03-01 | 03 | 2 | MAP-01, MAP-03 | — | image-q FS dither produces 4-bit greyscale palette indices | unit | `pnpm vitest --run packages/g2-app/src/raster/__tests__/image-q-worker.test.ts` | ❌ W0 | ⬜ pending |
| 4a-03-02 | 03 | 2 | MAP-01 | — | xxhash sub-tile delta detects identical and changed sub-tiles | unit | `pnpm vitest --run packages/g2-app/src/raster/__tests__/delta-hasher.test.ts` | ❌ W0 | ⬜ pending |
| 4a-03-03 | 03 | 2 | MAP-01 | — | upng-js 4-bit indexed PNG round-trip preserves palette | unit | `pnpm vitest --run packages/g2-app/src/raster/__tests__/tile-encoder.test.ts` | ❌ W0 | ⬜ pending |
| 4a-03-04 | 03 | 2 | MAP-03, MAP-04 | — | Branch B/C glyph fallback auto-activates when BLE probe < 100 kbps | unit | `pnpm vitest --run packages/g2-app/src/raster/__tests__/scene-renderer.test.ts -t "glyph fallback"` | ❌ W0 | ⬜ pending |
| 4a-04-01 | 04 | 2 | DISP-03, I18N-04 | — | Status HUD renders 5 fields with em-dash placeholder for missing data | unit | `pnpm vitest --run packages/g2-app/src/status-hud/__tests__/hud-renderer.test.ts` | ❌ W0 | ⬜ pending |
| 4a-04-02 | 04 | 2 | I18N-04 | — | IT/EN/DE width-budget snapshot fixtures match (INV-1 ck11-15) | snapshot | `pnpm vitest --run packages/shared-render/src/__tests__/status-hud-fixtures.test.ts` | ❌ W0 | ⬜ pending |
| 4a-05-01 | 05 | 3 | DISP-01, MAP-01, NAV-04 | — | End-to-end smoke: boot → handshake → first raster frame → HUD redraw on delta | integration | `pnpm vitest --run packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/g2-app/package.json` — add `image-q@4.0.0`, `upng-js@2.1.0`, `xxhash-wasm@1.1.0` to dependencies
- [ ] `packages/g2-app/vitest.config.ts` — extend with happy-dom env + Worker mock for unit tests
- [ ] `packages/g2-app/src/engine/__tests__/`, `packages/g2-app/src/raster/__tests__/`, `packages/g2-app/src/status-hud/__tests__/` — test directories scaffolded
- [ ] `packages/shared-render/src/fixtures/{status-hud,glyph-scene}.{it,en,de}.txt` — INV-1 fixtures populated from UI-SPEC.md
- [ ] `docs/architecture/0009-layer-manager-contract.md` — ADR scaffolded (PROPOSED status)
- [ ] Worker mock shim for happy-dom (OffscreenCanvas, postMessage) committed under `packages/g2-app/src/__tests__/test-helpers/worker-mock.ts`

---

## Manual-Only Verifications

> These SC carry `human_needed` gate per ADR-0005 PROVISIONAL Branch A. Software-side correctness is fully verifiable above; these require physical G2 hardware + Even Realities phone-side WebView + Foundry desktop running.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Capability handshake on real G2: splash → handshake → main HUD with negotiated `SERVER_CAPS_V1` | DISP-01, DISP-02, NAV-04 | Requires physical G2 paired via QR code from Phase 2 wizard + Even Realities phone-side WebView loading the g2-app plugin host bundle | 1) QR-pair G2 via Phase 2 wizard. 2) Open plugin host URL in Even App. 3) Verify boot splash appears within 3 s. 4) Verify Status HUD card visible at z=1 within 8 s. 5) Check console for `handshake.complete` log line with `caps:` array. |
| Raster sustains ≥5 fps standard with measured BLE p50 latency in Phase 0 envelope | MAP-02, MAP-04 | BLE throughput / latency depend on RF environment + hardware revision; cannot be simulated in CI | 1) Run `pnpm validation-harness sustain --duration 600 --raster-fps 5` against paired G2 in clean RF environment. 2) Verify VALIDATION-HARNESS report: `fps_p50 >= 5`, `frame_latency_p50_ms <= phase0_envelope_p50`. 3) Re-run in `2.4 GHz+microwave` env (matches Phase 0 §10.0.3 protocol) — Branch B/C glyph fallback should auto-engage if p50 drops < 5 fps for 30 s sustained. |
| Branch B/C glyph fallback auto-degrades without operator intervention | MAP-04 | Auto-degradation trigger fires on real BLE throughput probe; mock probe cannot replicate jitter envelope | 1) Pair G2 in degraded RF env (microwave loaded 2.4 GHz). 2) Boot fresh session. 3) Observe handshake probe value < 100 kbps. 4) Verify scene paints in glyph mode (single-char tokens `@`/`M`/`N`/`o`). 5) Verify `[GLY]` badge visible in z=1 corner. 6) Move to clean RF env, restart session, verify Branch A raster engages. |
| INV-1 layout holds character-perfect on real G2 phosphor display | DISP-03, I18N-04 | Foundry-rendered fonts vs G2 firmware monospace require eyeball verification of column alignment under all 3 locales | 1) Switch Foundry world locale to IT. 2) Boot G2. 3) Photograph Status HUD; verify column 68 divider is straight top-to-bottom. 4) Repeat for EN, DE. 5) Force HP=`999/999` (longest numeric) — verify no column drift. |
| PIXI canvas extract via OffscreenCanvas does NOT block Foundry desktop UI | (Specs §11.5.7 pitfall 11) | Performance measurement requires real Foundry + real player canvas; CI cannot replicate desktop UI thread contention | 1) Open Foundry desktop with active combat scene + dnd5e PHB 2014 PC. 2) Start G2 raster pipeline. 3) Drag a token across the scene for 30 s. 4) Verify desktop UI remains interactive (no perceptible stutter). 5) Confirm raster pipeline Worker thread maintains ≥5 fps during the test. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (planner fills task IDs)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (npm deps, ADR scaffolding, fixtures)
- [ ] No watch-mode flags (all commands use `--run`)
- [ ] Feedback latency < 30 s for quick command
- [ ] `nyquist_compliant: true` set in frontmatter after planner consolidates task IDs
- [ ] Manual-Only section verified: 5 `human_needed` entries map to hardware-dependent SC carrying PROVISIONAL gate per ADR-0005

**Approval:** pending (planner consolidates per-task IDs after PLAN.md files land)
