# Codebase Concerns

**Analysis Date:** 2026-05-14

## Phase 0 Hardware-Gating (STRUCTURAL RISK)

**Issue:** Almost all critical Phase 0 validation tests (§10.0) cannot execute without physical G2 + R1 + Even Hub developer access. This is a structural blockers for CI test coverage.

**Files:**
- `packages/validation-harness/` — entire package hardware-bound
- `packages/validation-harness/scripts/10-0-*.ts` — R1 timing, image format, BLE multi-env, DLE sustained, queue depth, palette calibration
- `packages/validation-harness/README.md` — documents `--skip-hardware` pattern for software-only smoke (exit code 2 on capability-negotiation skip)

**Impact:** Phase 0 testing (§10.0.1 through §10.0.9, plus MidiQOL probe) is manual-only until Even Hub access. Phase 1 CI gates **cannot fully pass** without hardware. Branch A/B/C decision (ADR-0005) remains TBD until Phase 0 Plan 04 closure.

**Blocks:** Phase 4a raster pipeline default decision depends on Phase 0 §10.0.2 (image format) + §10.0.3 (BLE bandwidth) + §10.0.6 (partial-update API) + §10.0.7 (DLE). If these fail, raster MVP degrades to glyph-only (Branch C), requiring Phase 4a scope cut.

**Current state:** ADR-0005 is PROPOSED stub template (TBD verdict fields). Evidence files in `docs/perf/phase-0/` do not yet exist.

## Known Drift: TypeScript Version Pin (MINOR)

**Issue:** Spec CLAUDE.md §Technology Stack cited TypeScript `5.8.5`; actual npm registry does not have `5.8.5` — only `5.8.3` exists.

**Files:**
- `package.json` `devDependencies.typescript: "5.8.3"` (correct)
- `CLAUDE.md` §Drift corrections (2026-05-11) — documents the fix: "research cited 5.8.5; actual pinned version is **5.8.3**. Re-verified ✓ 2026-05-11."

**Severity:** MINOR. TypeScript 5.8.3 is the correct stable pin; the spec documentation was out of sync. CI builds and typecheck work correctly.

**Impact:** None on functionality. Documentation only. Next major version bump should audit all transitive version claims against `npm view` live queries.

## Known Drift: pnpm Version Pin (MINOR)

**Issue:** Spec CLAUDE.md §Technology Stack cited pnpm `10.3.1`; actual npm registry does not have `10.3.1`.

**Files:**
- `package.json` `packageManager: "pnpm@10.33.4"` (correct)
- `CLAUDE.md` §Drift corrections (2026-05-11) — documents the fix: "research cited 10.3.1; actual pinned version is **10.33.4** (10.3.1 does not exist; current `latest-10` dist-tag). Re-verified ✓ 2026-05-11."

**Severity:** MINOR. pnpm 10.33.4 is current `latest-10`. Lock works correctly.

**Impact:** None. Version pin is correct. INV-2 drift audit is complete for this package.

## Foundry API Surface Instability (MODERATE RISK)

**Issue:** Foundry v13 moved `ApplicationV2` from a bare global to `foundry.applications.api.ApplicationV2`. This was discovered during Phase 2 implementation when `PairModal` (the pairing UI modal) failed at runtime.

**Files:**
- `packages/foundry-module/src/pair/PairModal.ts:35` — now correctly uses `const { ApplicationV2 } = foundry.applications.api;`
- Recent commits: `3fee9dd` (fix), `27f3cbc` (pre-dispatch plan), `1a61276` (docs summary)

**Symptoms:** Runtime error on Foundry v13+: `ApplicationV2 is not defined` (trying to access bare global).

**Trigger:** Module loads in Foundry v13 or v14.

**Workaround:** Already applied in commit `3fee9dd`.

**Fragility notes:**
- Foundry's JavaScript API surface changes across minor versions (v12 → v13 namespace shift, dnd5e 5.3.0 advancement shape change from array → object).
- Code calling Foundry APIs must accommodate version drift. No upstream stability guarantee.
- `packages/foundry-module/src/types/foundry-globals.d.ts` (332 lines) is hand-typed, not auto-generated from `fvtt-types`. Manual type defs **drift** when Foundry changes.

**Mitigation in place:** Comments in `PairModal.ts:33–35` document the v13+ requirement. Tests mock Foundry globals, so they can catch some breaks.

**Future risk:** Phase 7+ code (Activity + spell casting via dnd5e API) will be similarly exposed. MidiQOL signature changes (noted in Specs.md §12.A item 12) require Phase 0 §10.0.10 validation.

## Type Definition Drift: fvtt-types Not Yet Integrated (QUALITY DEBT)

**Issue:** Hand-typed `foundry-globals.d.ts` is maintained manually. `fvtt-types` npm package exists but is not yet adopted.

**Files:**
- `packages/foundry-module/src/types/foundry-globals.d.ts` (332 lines) — hand-typed for dnd5e actor/combat/scene shapes
- `packages/foundry-module/src/readers/readers.test.ts:10` — `TODO (#44): validate mock shapes against fvtt-types when package stabilises.`
- `packages/foundry-module/src/module.test.ts:14` — `TODO (ADR-0003): validate mock shapes against fvtt-types when package stabilises.`

**Impact:** Mocks in unit tests do not validate against canonical Foundry types. If hand-typed defs drift from Foundry reality, tests pass but runtime fails.

**Priority:** MEDIUM. Phase 2 closure should adopt `fvtt-types` as part of module maturation (Phase 3 or Phase 4a) to avoid large refactor debt.

## Open TODOs Without Tracker Links

**Files and items:**

| File | Line | TODO | Issue/ADR | Status |
|------|------|------|-----------|--------|
| `packages/bridge/src/server.ts` | 126 | `enforce EVF_PLUGIN_HOST_URL as required in Docker entrypoint` | #42 | Referenced as issue |
| `packages/bridge/src/server.ts` | 137 | `lower max to 60 req/min once Phase 3 action endpoints land` | #44 | Referenced as issue |
| `packages/bridge/src/routes/internal-delta.ts` | 13 | `restrict /internal/delta to Docker internal network in production` | #43 | Referenced as issue |
| `packages/g2-app/src/wizard/auto-connect.ts` | 114 | `Plan 04 wires real WS connect` | ADR-0002 | Cross-ref to ADR |

**Severity:** LOW. All TODOs have tracker references (#42, #43, #44) or ADR cross-refs (ADR-0002). CI gates will enforce this in Phase 2+ per INV-4.

## Security: Bearer Token 24h TTL + No Wildcard Origins (SPEC CONSTRAINT)

**Risk Areas:**

### Bearer Token Expiry (24h)
- **Files:** `packages/foundry-module/src/pair/bearer-registry.ts` + `packages/bridge/src/auth/token-cache.ts`
- **Pattern:** Opaque 24-hour bearer tokens generated at pair time, encoded into QR code, stored in `Tier 2` (Foundry registry settings)
- **Risk:** Token expiry forces re-pairing after 24h. No refresh mechanism (Specs.md §11.5.4 — *"opaque 24h"*).
  - **Mitigation:** PairModal detects TTL < 1h and shows "Refresh" CTA. UI allows DM to re-generate + re-scan QR before expiry.
  - **Impact if absent:** Player loses connection, requires DM re-pair.

### CORS Origin Whitelist (No Wildcards)
- **Files:** `packages/bridge/src/server.ts:124–131` — CORS origin set to `process.env.EVF_PLUGIN_HOST_URL` only (Specs.md §3.3 — *"Even Hub network constraint forbids wildcards"*)
- **Risk:** Plugin host URL must be exact origin (e.g., `https://plugin.example.com`). No `*.example.com` allowed by Even Hub firewall.
  - **Mitigation:** Env var enforcement + fallback to dev `http://localhost:5173`.
  - **Gap:** TODO #42 suggests Docker entrypoint should validate this is set. Currently it falls back silently.

### Internal Secret (EVF_INTERNAL_SECRET)
- **Files:** `packages/bridge/src/routes/internal-delta.ts:66–81` — constant-time comparison via `crypto.timingSafeEqual`
- **Pattern:** Shared secret for Foundry module → bridge push channel. NOT a bearer token; server-to-server only.
- **Mitigation:** Redacted from pino logs (T-02-01). Timing-safe comparison prevents oracle attacks.
- **Gap:** TODO #43 — route should be restricted to Docker internal network only in production.

**Overall:** Security baseline is sound (constant-time secrets, no wildcards, bearer TTL forcing re-pair). Production deployment must still gate /internal/delta to internal network and validate EVF_PLUGIN_HOST_URL before launch.

## Performance Risk: 5 fps Committed vs 15 fps Stretch (BLOCKING PHASE 4A)

**Issue:** Raster pipeline frame rate commitment depends on Phase 0 GO/NO-GO.

**Specifications:**
- **Committed:** 5 fps standard (always achievable per Specs.md §7.4b.6.1 Layer 1+3+4+6)
- **Stretch:** 15 fps aspirational (requires Layers 2+5 from Phase 0 §10.0.6 + §10.0.7)

**Preconditions:**

| Layer | Requirement | Phase 0 Test | Status |
|-------|-------------|--------------|--------|
| Layer 1 (per-tile xxHash delta) | Always | §10.0.2 image format | TBD |
| Layer 2 (sub-tile delta) | Phase 0 §10.0.6 PASS | partial-update API | TBD (blocks 15 fps) |
| Layer 3 (static tile cache) | Always | — | Design complete |
| Layer 4 (custom RLE 4-bit) | Always | — | Phase 4a implementation |
| Layer 5 (BLE 5.x DLE) | Phase 0 §10.0.7 PASS | §10.0.7 DLE sustained | TBD (blocks 15 fps) |
| Layer 6 (adaptive frame rate) | Always | — | Design complete |

**BLE Bandwidth Gate:**
- **Target:** ≥200 kbps p50 sustained → 5 fps committed (Specs.md §11.5.7.1)
- **Requirement:** Verified by Phase 0 §10.0.3 (BLE multi-env real-world test)
- **Failure mode:** <100 kbps → degrade to glyph-only (Branch C per Specs.md §10.0.5)

**Risk:** If Phase 0 BLE tests fail or partial-update API unavailable:
- 15 fps stretch becomes impossible (defers to Phase 13)
- 5 fps committed still viable if bandwidth ≥100 kbps
- Fallback raster mode (Glyph-only) remains viable at all BLE speeds

**Status:** Phase 0 pending. Phase 4a implementation **must gate on Phase 0 verdict** per ADR-0005.

## Library Selection Exposure: Raster Pipeline Dependencies (MODERATE RISK)

**Issue:** Raster pipeline relies on three npm libraries with narrow adoption and limited upstream activity.

**Libraries:**

| Library | Version | Status | Risk |
|---------|---------|--------|------|
| `image-q` | 4.0.0 | Last release 2022-06-19 (3+ years) | Only library with FS+Atkinson+Bayer dither + custom palette. No alternatives viable. |
| `upng-js` | 2.1.0 | Last release 2023-11 (maintained) | Only library with 4-bit indexed PNG encode. `pngjs` (8-bit only), `fast-png` (decode-only). No alternatives viable. |
| `xxhash-wasm` | 1.1.0 | Last release 2024-01 (actively maintained) | WASM port of xxHash; used for sub-tile hashing. Risk: WASM integration is new surface. |

**Mitigation (Specs.md §11.5.7):**
- Evaluated alternatives in decision table; confirmed these are the only options meeting spec (4-bit indexed PNG + FS dither + custom palette + WASM).
- If library breaks: Phase 1 contingency is hand-roll custom dither + PNG encoder (adds 2-3 weeks dev time, acceptable for Phase 13 stretch).

**Contingency:** Specs.md §11.5.8.4 documents worker crash → fallback to glyph mode. This makes the raster pipeline optional; glyph-only mode ships in Phase 4a as MVP fallback.

## Test Coverage Gaps: Mock Shapes Unvalidated

**Issue:** Test mocks for Foundry shapes are hand-crafted and not validated against actual Foundry types.

**Files:**
- `packages/foundry-module/src/readers/readers.test.ts` — 510 lines of manual mocks (actors, combat, scenes)
- `packages/foundry-module/src/module.test.ts` — 718 lines including mocks

**Risk:** Mocks may not reflect actual Foundry runtime shapes, especially after dnd5e upgrades.

**Known Drift:**
- dnd5e 5.3.0 changed advancement from **array** → **object** per Specs.md §3.4.
- If Phase 7 readers iterate advancement data, they must use object iteration (not array `.map()`).

**Gap:** No snapshot tests of actual Foundry actor shapes. Phase 2 should add a "live fixture" test that exercises real Foundry instances (requires Foundry test runner or E2E).

**Priority:** MEDIUM. Phase 2 closure should integrate `fvtt-types` + live fixtures.

## Circular Import Risk: No Linting Enforced

**Issue:** TypeScript strict mode does NOT catch circular imports (Specs.md INV-4 §0.1 mentions `noUnusedLocals`/`noUnusedParameters`, but **no explicit circular-import rule**).

**Files:** No `.eslintrc` or biome rule for circular imports visible in config.

**Risk:** Circular imports (e.g., `a.ts` → `b.ts` → `a.ts`) will **compile** in TypeScript but fail at **runtime** in module loaders that don't support them (ESM strict mode).

**Current codebase:** No obvious circular patterns found in grep search, but no linting prevents regressions.

**Mitigation:** Biome 2.4.15 includes `useExhaustiveDependencies` rule for hooks (React-style). General circular import detection via `madge` or similar not configured.

**Action:** Phase 2 should add eslint-plugin-import or equivalent to CI gates, or document the expectation that developers test ESM import order.

## WS Handshake Stub (PHASE 4A BLOCKER)

**Issue:** Auto-connect WebSocket handshake is a stub awaiting Phase 4a implementation.

**Files:**
- `packages/g2-app/src/wizard/auto-connect.ts:110–126` — function logs warning + returns without connecting
- Comment: `// TODO (ADR-0002): Plan 04 wires real WS connect. This stub logs the session and returns.`

**Current Flow:**
1. `g2.wear` event fires (G2 put on)
2. `loadSession(profileId)` retrieves stored bridge URL + token
3. `openHandshakeWebSocket()` should open WS, but currently logs warning and exits

**Impact:** Phase 2 wizard UI works; Phase 4a renders HUD. **Connection between them (WS handshake + message loop) is missing.**

**Blocking:** Phase 4a G2 Engine. Once written, the stub will call:
   - `WebSocket(${bridgeUrl}/v1/ws)`
   - Send `WsHandshakeClient` envelope
   - Parse `WsHandshakeServer` response
   - Emit to G2 display layer

**ADR:** Handshake shape defined in ADR-0002 (WsHandshakeClient / WsHandshakeServer types in `auto-connect.ts:30–47`).

## MidiQOL Dependency Validation Pending (PHASE 7 BLOCKER)

**Issue:** Phase 0 MIDIQ-01 probe must validate MidiQOL `completeActivityUse` signature and availability.

**Files:**
- `packages/validation-harness/foundry-modules/midiqol-probe-module/` — probe module for Phase 0 validation
- `packages/validation-harness/scripts/midiqol-config-probe.ts` — Phase 0 script
- `packages/foundry-module/src/pair/socketlib-handlers.ts` — Phase 7 will call `MidiQOL.completeActivityUse` if available

**Risk:** Specs.md §12.A item 12 notes: *"MidiQOL `completeActivityUse` signature: validate if diversa from `completeItemUse`. Deferred a §10.0.10 P2 row 1."*

**Status:** Phase 0 pending. Phase 7 write path **must gate on Phase 0 MIDIQ-01 passing** to confirm API shape.

**Fallback:** If MidiQOL unavailable, Phase 7 falls back to vanilla `activity.use({configure: false})` (weaker automation but functional).

## Version Pin Lag: Deferring TypeScript 6.0.x (ACCEPTED RISK)

**Issue:** TypeScript 6.0.x is `latest` on npm (verified 2026-05-10), but project pins 5.8.3.

**Decision:** CLAUDE.md explicitly defers to 5.8.x *"for Phase 1 until 6.0 has a quarter of ecosystem catch-up"* (§1.1 Why column, TypeScript row).

**Rationale:** 
- TypeScript 6.0 is very new (days old at research time)
- Vitest, Biome, fvtt-types, and other critical deps have not updated yet
- Waiting one quarter avoids cascading version updates across entire toolchain

**Risk:** Zero. Conservative pin is intentional design decision (CLAUDE.md Confidence Assessment table, TypeScript row = MEDIUM-HIGH confidence in deferral decision).

**Timeline:** Phase 5+ can reconsider if ecosystem adoption is sufficient.

## ADR-0005 Branch Decision Pending (CRITICAL GATE)

**Issue:** ADR-0005 (Phase 0 GO/NO-GO verdict) is a PROPOSED stub template with all verdict fields TBD.

**Files:**
- `docs/architecture/0005-phase0-go-no-go.md` — template with placeholder rows

**Current state:**
- Threshold table locked (Branch A/B/C numeric bounds set)
- Per-test verdict table empty (Branch will populate at Phase 0 closure)
- Branch selector: `Selected Branch: TBD`

**Consequences if Branch selected:**
- **Branch A:** Raster default 5 fps committed; Phase 4a full scope
- **Branch B:** Raster opt-in + glyph default; adaptive FPS warning chip
- **Branch C:** Raster deferred to Phase 13; glyph-only MVP; Phase 4a scope cut

**Blocker:** Phase 4a (G2 Engine + Raster) entry gate cites this ADR per D-16. Cannot plan Phase 4a detailed tasks until Branch verdict published.

**Timeline:** Phase 0 Plan 04 (closure) executes hardware tests and derives verdict.

## Documentation Coherence: Specs.md Version vs README (VERIFIABLE)

**Risk:** INV-3 requires `Specs.md` version = `README.md` version = showcase version at all times.

**Files:**
- `Specs.md` header: `# EvenFoundryVTT — Project Specification (v0.9.11)`
- `README.md` badge: should match
- `docs/showcase/index.html` hero stat: should match

**Check command (per INV-3 pre-bump checklist):**
```bash
grep -E "^#.*\(v[0-9]\.[0-9]\.[0-9]" Specs.md README.md
grep -o 'v[0-9]\.[0-9]\.[0-9]' docs/showcase/index.html
```

**Current status:** Assumed aligned (last bump v0.9.11 on 2026-05-10), but no automated gate enforces this.

**Debt:** Phase 2+ should add CI check for version coherence (scan file patterns, fail if count ≠ expected).

---

*Concerns audit: 2026-05-14*
