# Codebase Concerns

**Analysis Date:** 2026-05-24

## Phase 0 Hardware-Gating (STRUCTURAL RISK)

**Issue:** 35 success criteria (SC) across Phases 4a–13 remain marked `human_needed` under ADR-0005 PROVISIONAL Branch A, awaiting physical G2 + R1 + Even Hub developer access.

**Files:**
- `packages/validation-harness/` — entire package hardware-bound
- `packages/validation-harness/scripts/10-0-*.ts` — R1 timing, image format, BLE multi-env, DLE sustained, queue depth, palette calibration
- `packages/validation-harness/README.md` — documents `--skip-hardware` pattern for software-only smoke (exit code 2)
- `docs/architecture/0005-phase0-go-no-go.md` — ADR-0005 PROVISIONAL template with 8 per-test verdicts TBD

**Impact:** Phase 0 testing (§10.0.1 through §10.0.9, plus MidiQOL probe) is manual-only until Even Hub access. v0.9.11 software shipped with MVP commitments met; v0.9.12–v0.9.13 added zero new hardware-pending SCs.

**Blocking:** Future hardware validation requires actual Even Realities G2/R1 hardware + paired Foundry world. No CI-level blocker; MVP software is complete. Closure path: `pnpm --filter @evf/validation-harness validate:all` once hardware available.

**Current state:** ADR-0005 is PROVISIONAL-ACCEPTED Branch A. Evidence files in `docs/perf/phase-0/` do not yet exist (would be populated at hardware UAT closure).

## Known Drift: TypeScript Version Pin (MINOR — FIXED)

**Issue:** Spec CLAUDE.md cited TypeScript `5.8.5`; actual npm registry pins `5.8.3`.

**Files:**
- `package.json` `devDependencies.typescript: "5.8.3"` (correct)
- `CLAUDE.md` §Drift corrections (2026-05-11) — documents the fix

**Severity:** MINOR. TypeScript 5.8.3 is the correct stable pin; documentation was out of sync. CI builds and typecheck work correctly.

**Status:** FIXED. Re-verified on 2026-05-11.

## Known Drift: pnpm Version Pin (MINOR — FIXED)

**Issue:** Spec cited pnpm `10.3.1`; actual registry pins `10.33.4` (latest-10 dist-tag).

**Files:**
- `package.json` `packageManager: "pnpm@10.33.4"` (correct)
- `CLAUDE.md` §Drift corrections (2026-05-11)

**Severity:** MINOR. pnpm 10.33.4 is current `latest-10`. Lock works correctly.

**Status:** FIXED. Re-verified on 2026-05-11.

## Foundry API Surface Instability (MODERATE RISK)

**Issue:** Foundry v13 moved `ApplicationV2` from bare global to `foundry.applications.api.ApplicationV2`. Discovered during Phase 2 implementation.

**Files:**
- `packages/foundry-module/src/pair/PairModal.ts:35` — correctly destructures `const { ApplicationV2 } = foundry.applications.api;`
- Recent commit: `3fee9dd` (fix), `27f3cbc` (pre-dispatch plan)

**Symptoms:** Runtime error on Foundry v13+: `ReferenceError: ApplicationV2 is not defined`.

**Trigger:** Module loads in Foundry v13 or v14.

**Workaround:** Already applied in commit `3fee9dd`.

**Fragility notes:**
- Foundry's JavaScript API surface changes across minor versions (v12 → v13 namespace shift, dnd5e 5.3.0 advancement array → object).
- Code calling Foundry APIs must accommodate version drift. No upstream stability guarantee.
- `packages/foundry-module/src/types/foundry-globals.d.ts` (1069 lines) is hand-typed, not auto-generated from `fvtt-types`. Manual defs **drift** when Foundry changes.

**Mitigation in place:** Comments in `PairModal.ts:33–35` document the v13+ requirement. Tests mock Foundry globals, so they can catch some breaks.

**Future risk:** Phase 7 code (Activity + spell casting via dnd5e API) is similarly exposed. MidiQOL signature changes (noted in Specs.md §12.A) require Phase 0 §10.0.10 validation.

## Type Definition Drift: fvtt-types Not Yet Integrated (QUALITY DEBT)

**Issue:** Hand-typed `foundry-globals.d.ts` is maintained manually. `fvtt-types` npm package exists but is not yet adopted.

**Files:**
- `packages/foundry-module/src/types/foundry-globals.d.ts` (1069 lines) — hand-typed for dnd5e actor/combat/scene shapes
- `packages/foundry-module/src/readers/readers.test.ts:10` — `TODO (#44): validate mock shapes against fvtt-types when package stabilises.`
- `packages/foundry-module/src/module.test.ts:14` — `TODO (ADR-0003): validate mock shapes against fvtt-types when package stabilises.`

**Impact:** Mocks in unit tests do not validate against canonical Foundry types. If hand-typed defs drift from Foundry reality, tests pass but runtime fails.

**Priority:** MEDIUM. Phase 2 closure (v0.9.11) should have adopted `fvtt-types` as module maturation; now recommended for v0.9.14+ polish cycle to avoid large refactor debt.

## Test Coverage Gap: Branch Coverage (CURRENT BLOCKER)

**Issue:** Workspace branch coverage is **78.11%** (below 80% CI gate requirement). Statements/Functions/Lines all green; branches are the bottleneck.

**Files with gaps (>20% branch uncovered):**
- `packages/g2-app/src/raster/` — 59.14% branch coverage (raster-worker.ts is 0%; worker thread isolation)
- `packages/g2-app/src/panels/action-options-modal.test.ts` — 75% branches
- `packages/g2-app/src/panels/reaction-prompt-panel.ts` — 75% branches
- `packages/bridge/src/voice/deepgram-stt.test.ts` — branch gaps in error paths
- `packages/foundry-module/src/readers/` — mocks have edge-case branches untested

**Root cause:** 
1. **Raster worker isolation** — `raster-worker.ts` runs in a separate thread; branch testing requires message-passing mocks or integration tests
2. **Error path testing** — defensive try-catch blocks have untested fallback branches (network failures, malformed data)
3. **Modal state machines** — action-options and reaction prompts have multi-branch conditionals for rare cases

**Impact:** CI gate fails if coverage < 80%. No release possible without fixing.

**Recommended fixes (priority order):**
1. `raster-worker.ts` — add inline message-passing unit tests for quantization + encoding branches (~15 lines, +5% gain)
2. Error paths — expand Deepgram adapter tests with 3–4 synthetic error scenarios (+3% gain)
3. Modal branches — add edge-case state tests (extreme values, race conditions) (+2% gain)

**Status:** Blocking next release. Total gap ~5–7 points to reach 80%.

## Security: Bearer Token 24h TTL + No Wildcard Origins (SPEC CONSTRAINT)

**Risk Areas:**

### Bearer Token Expiry (24h)
- **Files:** `packages/foundry-module/src/pair/bearer-registry.ts` + `packages/bridge/src/auth/token-cache.ts`
- **Pattern:** Opaque 24-hour bearer tokens generated at pair time, encoded into QR code
- **Risk:** Token expiry forces re-pairing after 24h. No refresh mechanism (Specs.md §11.5.4 — *"opaque 24h"*).
  - **Mitigation:** PairModal detects TTL < 1h and shows "Refresh" CTA. UI allows DM to re-generate + re-scan QR before expiry.
  - **Impact if absent:** Player loses connection, requires DM re-pair.

### CORS Origin Whitelist (No Wildcards)
- **Files:** `packages/bridge/src/server.ts:124–131` — CORS origin set to `process.env.EVF_PLUGIN_HOST_URL` only
- **Risk:** Plugin host URL must be exact origin (e.g., `https://plugin.example.com`). No `*.example.com` allowed by Even Hub.
  - **Mitigation:** Env var enforcement + fallback to dev `http://localhost:5173`.
  - **Gap:** TODO #42 suggests Docker entrypoint should validate this is set. Currently silent fallback.

### Internal Secret (EVF_INTERNAL_SECRET)
- **Files:** `packages/bridge/src/routes/internal-delta.ts:66–81` — constant-time comparison via `crypto.timingSafeEqual`
- **Pattern:** Shared secret for Foundry module → bridge /internal/delta push channel. Server-to-server only.
- **Mitigation:** Redacted from pino logs. Timing-safe comparison prevents oracle attacks.
- **Gap:** TODO #43 — route should be restricted to Docker internal network in production.

**Overall:** Security baseline is sound (constant-time secrets, no wildcards, bearer TTL). Production deployment must still gate /internal/delta to internal network and validate EVF_PLUGIN_HOST_URL before launch.

## Performance Risk: 5 fps Committed vs 15 fps Stretch (ADR-0005 BRANCH A)

**Issue:** Raster pipeline frame rate commitment depends on ADR-0005 Branch verdict (PROVISIONAL-ACCEPTED Branch A).

**Specifications:**
- **Committed:** 5 fps standard (always achievable per Specs.md §7.4b.6.1 Layers 1+3+4+6)
- **Stretch:** 15 fps aspirational (requires Layers 2+5 conditional on Phase 0 hardware tests)

**Preconditions (ADR-0005 PROVISIONAL verdicts):**

| Layer | Requirement | Phase 0 Test | Status |
|-------|-------------|--------------|--------|
| Layer 1 (per-tile xxHash delta) | Always | §10.0.2 image format | PROVISIONAL (Branch A) |
| Layer 2 (sub-tile delta) | Phase 0 §10.0.6 PASS | partial-update API | PROVISIONAL (Branch A) |
| Layer 3 (static tile cache) | Always | — | Design complete ✓ |
| Layer 4 (custom RLE 4-bit) | Always | — | Phase 4a complete ✓ |
| Layer 5 (BLE 5.x DLE) | Phase 0 §10.0.7 PASS | §10.0.7 DLE sustained | PROVISIONAL (Branch A) |
| Layer 6 (adaptive frame rate) | Always | — | Design complete ✓ |

**BLE Bandwidth Gate:**
- **Target:** ≥200 kbps p50 sustained → 5 fps committed (Specs.md §11.5.7.1)
- **Requirement:** Verified by Phase 0 §10.0.3 (BLE multi-env real-world test)
- **Failure mode:** <100 kbps → degrade to glyph-only (Branch C fallback)

**Risk:** If Phase 0 BLE tests eventually fail or partial-update API unavailable:
- 15 fps stretch deferred (not a regression — never shipped)
- 5 fps committed still viable if bandwidth ≥100 kbps
- Fallback glyph-only mode viable at all BLE speeds (already implemented)

**Status:** v0.9.11–v0.9.13 shipped under PROVISIONAL Branch A assumptions. Hardware UAT will empirically validate.

## Library Selection Exposure: Raster Pipeline Dependencies (MODERATE RISK)

**Issue:** Raster pipeline relies on three npm libraries with narrow adoption and limited upstream activity.

**Libraries:**

| Library | Version | Status | Risk |
|---------|---------|--------|------|
| `image-q` | 4.0.0 | Last release 2022-06-19 (4 years) | Only library with FS+Atkinson+Bayer dither + custom palette. No alternatives viable. |
| `upng-js` | 2.1.0 | Last release 2023-11 (maintained) | Only library with 4-bit indexed PNG encode. Photopea-maintained. |
| `xxhash-wasm` | 1.1.0 | Last release 2024-01 (actively maintained) | WASM port; 5-10× faster than JS murmur. Integration is new surface. |

**Mitigation (Specs.md §11.5.7):**
- Evaluated alternatives in decision table; confirmed these are the only options meeting spec (4-bit indexed PNG + FS dither + custom palette + WASM).
- If library breaks: Phase 1 contingency is hand-roll custom dither + PNG encoder (adds 2-3 weeks dev time, acceptable for Phase 13+ stretch).

**Contingency:** Specs.md §11.5.8.4 documents worker crash → fallback to glyph mode. This makes raster optional; glyph-only MVP is default safe mode.

## Test Coverage Gaps: Mock Shapes Unvalidated (QUALITY DEBT)

**Issue:** Test mocks for Foundry shapes are hand-crafted and not validated against actual Foundry types.

**Files:**
- `packages/foundry-module/src/readers/readers.test.ts` — 1494 lines of manual mocks (actors, combat, scenes)
- `packages/foundry-module/src/module.test.ts` — 1033 lines including mocks

**Risk:** Mocks may not reflect actual Foundry runtime shapes, especially after dnd5e upgrades.

**Known Drift:**
- dnd5e 5.3.0 changed advancement from **array** → **object** per Specs.md §3.4.
- If Phase 7+ readers iterate advancement data, they must use object iteration (not array `.map()`).

**Gap:** No snapshot tests of actual Foundry actor shapes. Phase 2 should have added "live fixture" tests via Foundry test runner or E2E.

**Priority:** MEDIUM. Next polish cycle should integrate `fvtt-types` + live fixtures to lock shapes.

## Raster Worker Isolation: Coverage Blindspot (CURRENT BLOCKER)

**Issue:** `packages/g2-app/src/raster/raster-worker.ts` is 0% covered. Worker runs in isolated thread context; traditional unit tests cannot instrument.

**Files:**
- `packages/g2-app/src/raster/raster-worker.ts` (319 lines) — quantize + dither + RLE + PNG encode pipeline
- `packages/g2-app/src/engine/raster-controller.ts:123–140` — Worker instantiation and message dispatch

**Current workaround:** None. Tests mock the Worker via `vi.mock('worker_threads')` but don't exercise internal branches.

**Impact on CI:** Coverage is **59.14%** in raster/ dir, pulling overall branches below 80% gate.

**Recommended fix:**
1. Extract deterministic parts (quantize, dither, RLE, PNG encode) into pure functions in separate `raster-pipeline.ts` (test-safe)
2. Keep Worker thread wrapper thin (just message dispatch + error handling)
3. Add unit tests for `raster-pipeline.ts` branches
4. Worker.ts becomes a thin adapter — acceptable to exclude from coverage via `.nycrc` or inline `c8: ignore`

**Timeline:** Required for next release (blocks CI gate).

## Circular Import Risk: No Linting Enforced (LOW RISK)

**Issue:** TypeScript strict mode does NOT catch circular imports (Specs.md INV-4 mentions `noUnusedLocals`/`noUnusedParameters`, but **no explicit circular-import rule**).

**Files:** No eslint-plugin-import or madge rules configured in CI gates.

**Risk:** Circular imports (e.g., `a.ts` → `b.ts` → `a.ts`) will **compile** in TypeScript but fail at **runtime** in ESM strict mode.

**Current codebase:** No obvious circular patterns found in grep search, but no linting prevents regressions.

**Mitigation:** Biome 2.4.15 includes `useExhaustiveDependencies` rule for hooks (React). General circular import detection via `madge` or eslint-plugin-import not configured.

**Action:** Phase 2+ should add circular-import check to CI gates, or document expectation that developers test ESM import order locally.

## WS Handshake Stub (PHASE 4A BLOCKER — RESOLVED)

**Issue:** Auto-connect WebSocket handshake was a stub awaiting Phase 4a implementation.

**Files:**
- `packages/g2-app/src/wizard/auto-connect.ts` — handshake implementation complete

**Status:** ✅ RESOLVED in Phase 4a. WS connection fully wired; handshake pattern defined in ADR-0002 and implemented.

## MidiQOL Dependency Validation (PHASE 0 PENDING)

**Issue:** Phase 0 MIDIQ-01 probe must validate MidiQOL `completeActivityUse` signature and availability.

**Files:**
- `packages/validation-harness/foundry-modules/midiqol-probe-module/` — probe module for Phase 0 validation
- `packages/foundry-module/src/pair/socketlib-handlers.ts` — Phase 7 calls `MidiQOL.completeActivityUse` if available

**Risk:** Specs.md §12.A item 12 notes: *"MidiQOL `completeActivityUse` signature: validate if different from `completeItemUse`. Deferred to §10.0.10 P2 row 1."*

**Status:** Phase 0 pending. Phase 7 write path **gates on Phase 0 MIDIQ-01 passing** to confirm API shape (already implemented safely with fallback).

**Fallback:** If MidiQOL unavailable, Phase 7 falls back to vanilla `activity.use({configure: false})` (weaker automation but functional). ✓ Implemented.

## Version Pin Lag: Deferring TypeScript 6.0.x (ACCEPTED RISK)

**Issue:** TypeScript 6.0.x is `latest` on npm, but project pins 5.8.3.

**Decision:** CLAUDE.md explicitly defers to 5.8.x *"for Phase 1 until 6.0 has a quarter of ecosystem catch-up"* (§1.1 Why column, TypeScript row).

**Rationale:** 
- TypeScript 6.0 is newer (still adoption ramping)
- Vitest, Biome, fvtt-types, and other critical deps haven't updated yet
- Waiting for ecosystem stability avoids cascading updates

**Risk:** Zero. Conservative pin is intentional design decision (CLAUDE.md Confidence Assessment table = MEDIUM-HIGH).

**Timeline:** Phase 5+ can reconsider if ecosystem adoption is sufficient.

## ADR-0005 Branch Decision Pending (PROVISIONAL-ACCEPTED)

**Issue:** ADR-0005 (Phase 0 GO/NO-GO verdict) is now PROVISIONAL-ACCEPTED Branch A (from PROPOSED stub template).

**Files:**
- `docs/architecture/0005-phase0-go-no-go.md` — PROVISIONAL Branch A selected with 8 per-test verdicts marked `human_needed`

**Current state:**
- Threshold table locked (Branch A/B/C numeric bounds set)
- Per-test verdict table: 8 tests → PROVISIONAL verdicts + `human_needed` gating
- Branch selector: **Branch A** (provisional)

**Consequences of Branch A (selected):**
- Raster default 5 fps committed; Phase 4a full scope shipped ✓
- 15 fps stretch conditional on hardware validation
- Glyph-only fallback available at all BLE speeds ✓

**Blocker status:** Phase 4a (G2 Engine + Raster) entry gate cited this ADR per D-16. Phase 4a shipped under PROVISIONAL Branch A. Hardware validation required for final ACCEPTED verdict.

**Timeline:** Phase 0 closure will execute hardware tests and derive empirical verdict (deferred pending Even Hub access).

## Hub Polyfill API Contract (PARTIAL RESOLUTION)

**Issue:** Phase 2 wizard code uses `hub.setItem/getItem/eventBus` global that doesn't exist on canonical Even Realities simulator.

**Files:**
- `packages/g2-app/src/hub-polyfill.ts` — runtime shim mapping legacy `hub` API to `EvenAppBridge` envelope calls
- `packages/g2-app/src/wizard/wizard.ts` — calls `installHubPolyfill()` at boot

**Resolution:** ✓ RESOLVED in Phase 14 (commit `b9fe6f1`). Polyfill wraps `@evenrealities/even_hub_sdk@0.0.10` and maps legacy API calls to envelope-based dispatch. Polyfill is idempotent.

**Spec implication:** Specs.md §3.1 image limits corrected from "200×100" (assumed) to actual SDK limits: 20–288 w × 20–144 h. Envelope-based API contract documented.

**Status:** Phase 2 passes all tests; hardware validation needed to confirm envelope dispatch works on real G2.

## Documentation Coherence: Specs.md Version vs README (VERIFIABLE)

**Risk:** INV-3 requires `Specs.md` version = `README.md` version = showcase version at all times (atomic commits).

**Files:**
- `Specs.md` header: `# EvenFoundryVTT — Project Specification (v0.9.13)`
- `README.md` badge: `![v0.9.13](…)`
- `.planning/STATE.md` frontmatter: `milestone: v0.9.13`
- `docs/showcase/index.html` hero stat: `v0.9.13`

**Check command (per INV-3 pre-bump checklist):**
```bash
grep -E "v[0-9]\.[0-9]\.[0-9]" Specs.md README.md .planning/STATE.md
grep -o 'v[0-9]\.[0-9]\.[0-9]' docs/showcase/index.html
```

**Current status:** v0.9.13 shipped 2026-05-18 via atomic INV-3 commit `df4ea02`. All cross-references aligned.

**Debt:** Phase 2+ should add CI check for version coherence (scan file patterns, fail if count ≠ expected). Currently manual gate in pre-bump checklist.

## Performance Regression Risk: Branch Coverage Hard Limit

**Issue:** 80% branch coverage is a hard CI gate. Current state: 78.11%. Cannot merge PRs without fixing.

**Root causes:**
1. Raster worker (0% coverage) — 319 lines isolated in worker thread
2. Error paths — async error scenarios in Deepgram adapter, modal fallback chains
3. Modal state branches — rare edge cases (concentration conflict, reaction deferral)

**Workaround:** Exclude raster-worker.ts from coverage via `.nycrc` / `c8` config (blanket exclusion for worker threads is standard practice). Then focus on error-path fixes.

**Timeline:** Blocking next release. Estimated 2–4 hours of test additions to reach 80%.

## Socketlib Handler Count Invariant (CI GATE 8)

**Issue:** CI Gate 8 enforces **exactly 17** socketlib.registerComplexHandler calls across the codebase.

**Rationale:** Socketlib handlers are the write-path boundary layer. Each handler is a cross-network async protocol — counting them verifies no handler leakage and no missing handlers.

**Current state:** v0.9.11 Phase 13 closed at **17 handlers**. v0.9.12 (Phases 14–15) preserved count = **17**. v0.9.13 (Phases 16–18) preserved count = **17** (read-path-only extensions, no new socketlib handlers).

**Files:**
- `packages/foundry-module/src/pair/socketlib-handlers.ts` — central dispatch
- CI grep gate: `.github/workflows/ci.yml` — step `ci-gate-8-socketlib-count`

**Pattern:**
```bash
grep -r "registerComplexHandler\|registerSimpleHandler" packages/ | wc -l
# Must output: 17
```

**Constraint:** Any new action dispatch (Phase 14+) must either:
1. Reuse existing handler (add new tool branch to dispatch table), or
2. Add handler + update CI gate threshold with justification

**Current count breakdown (Phase 13 closed):**
- 1× initialState handshake
- 1× delta (world state)
- 3× action dispatch (cast_spell, weapon_attack, use_item)
- 3× skill/save/check dispatch
- 2× modal confirmation (concentration_conflict, reaction_prompt)
- 2× concentration management
- 2× chat-message logging
- 2× custom Phase 12–13 additions (voice STT + entity-pack)

**Future risk:** Phase 14+ phases must not accidentally add duplicate handlers without intent.

---

*Codebase concerns audit: 2026-05-24*
