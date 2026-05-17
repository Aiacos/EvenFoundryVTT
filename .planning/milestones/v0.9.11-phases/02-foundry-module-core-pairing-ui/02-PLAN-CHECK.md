---
phase: 02-foundry-module-core-pairing-ui
checked: 2026-05-11
verdict: concerns
plans_reviewed: [01, 02, 03, 04, 05]
---

# Phase 2 Plan Check — Goal-Backward Audit

**Checked by:** gsd-plan-checker (Claude Sonnet 4.6)
**Date:** 2026-05-11
**Phase goal:** "Players can pair a G2 to Foundry, the module reads character/combat/scene/log state over a versioned WS, and a phone-side wizard onboards the device — without writing anything yet."

---

## 1. Goal-Backward Analysis

| # | Goal Element | Covering Plan(s) | Status | Notes |
|---|-------------|-----------------|--------|-------|
| 1 | DM pair button → 24h bearer + QR generation + revoke registry (CONN-03, CONN-05) | 01 (button stub + locale), 02 (PairModal + bearer-registry + socketlib handlers) | COVERED | Plan 01 registers pair button stub; Plan 02 implements full bearer lifecycle and QR SVG generation via qrcode@1.5.4 |
| 2 | Phone wizard 3-step onboarding + Tier 3 persistence + auto-connect on G2 wear (CONN-01, CONN-02, CONN-04) | 03 | COVERED | tier3-storage.ts + SessionSchema + g2.wear event + WS handshake stub |
| 3 | WS handshake with capability negotiation + locale auto-detect (I18N-01, I18N-03) | 01 (locale detection at module boot), 04 (bridge WS handshake + capability intersection) | COVERED | D-2.13 handshake shape implemented end-to-end; locale propagated in handshake `locale` field |
| 4 | Read APIs: getCharacterState, getCombatState, getSceneViewport, getEventLog, subscribeUpdates (FOUN-01) | 05 | COVERED | All 5 reader functions + 5 REST routes + delta emitter implemented in Plan 05 |
| 5 | TokenLayer.setTargets v13 multi-target reader, read-side only (FOUN-04) | 05 | COVERED | targetToken hook → combat.targets delta; game.user.targets read shape documented in interfaces |
| 6 | module.json with relationships.requires (socketlib, midi-qol, dnd5e) | 01 | COVERED | socket:true + all three relationship entries specified explicitly |
| 7 | Zero polling — push-only via hooks + WS subscribe deltas (D-2.15) | 05 | COVERED | hook-subscribers.ts registers 5 hooks; updateActor guard prevents spurious emits; no setInterval polling anywhere in reader path |
| 8 | Locale catalogs EN + IT served from Foundry module | 01 (lang/*.json) + 04 (GET /v1/i18n/:lang route) | COVERED | 24 keys in en.json + it.json; bridge serves them via /v1/i18n/:lang loaded from foundry-module/lang/ |

**All 8 goal elements are attributable to specific plans.**

---

## 2. Requirement Coverage Table

| Requirement | Plan(s) Claiming It | Frontmatter `requirements:` | Status |
|------------|--------------------|-----------------------------|--------|
| CONN-01 | 03 | ✓ 03 | COVERED |
| CONN-02 | 03 | ✓ 03 | COVERED |
| CONN-03 | 01, 02 | ✓ 01 and 02 | COVERED |
| CONN-04 | 03 | ✓ 03 | COVERED |
| CONN-05 | 02, 04 | ✓ 02 (silent refresh); 04 (CONN-05 in frontmatter) | COVERED |
| FOUN-01 | 01, 05 | ✓ 01 and 05 | COVERED |
| FOUN-02 | 04 | ✓ 04 lists FOUN-02 | COVERED |
| FOUN-04 | 05 | ✓ 05 | COVERED |
| I18N-01 | 01, 03, 04 | ✓ 01, 03, 04 | COVERED |
| I18N-03 | 01, 03 | ✓ 01, 03 | COVERED |

**No orphan requirements.** FOUN-02 (bridge service) is correctly owned by Plan 04, though it was not listed in the original prompt's set — it appears in REQUIREMENTS.md and is claimed in Plan 04's frontmatter.

**Note:** FOUN-03 (write path via activity.use) and I18N-02 (runtime override) are correctly excluded per CONTEXT.md out-of-scope section.

---

## 3. Cross-Plan Interface Verification

### 3a. Handler Name + Signature Alignment (Plans 02 ↔ 04 ↔ 05)

| Handler | Defined in | Consumed in | Signature Match? |
|---------|-----------|-------------|-----------------|
| `evf.validateToken(token)` | Plan 02, socketlib-handlers.ts | Plan 04, token-validator.ts → socketlib.executeAsGM | ALIGNED — Plan 04 interfaces block explicitly documents `ValidateTokenResult` shape matching Plan 02's return value |
| `evf.revokeToken(tokenId)` | Plan 02 | Plan 04 (implicit via cache invalidation) | ALIGNED — Plan 04 `invalidateToken()` exposed for downstream use |
| `evf.getCharacterSnapshot` | Plan 05 (registered in registerSocketlibHandlers update) | Plan 05 bridge routes | CONCERN: Plan 05 Task 2 action says "update `registerSocketlibHandlers()` from Plan 02 to include new handlers." This requires a cross-wave file edit to `packages/foundry-module/src/pair/socketlib-handlers.ts` — a file from Plan 02's Wave 1 output. This is a legitimate Wave 3 → Wave 1 output dependency, but the mechanism is an append/update to an existing function. The action text is explicit, but the `files_modified` in Plan 05's frontmatter does NOT list `packages/foundry-module/src/pair/socketlib-handlers.ts`. **This is a missing file in files_modified.** |
| `evf.getCombatSnapshot` | Plan 05 | Plan 05 bridge routes | Same gap as above |
| `evf.getSceneViewport` | Plan 05 | Plan 05 bridge routes | Same gap |
| `evf.getEventLog` | Plan 05 | Plan 05 bridge routes | Same gap |
| `evf.listCharacters` | Plan 05 | Plan 05 bridge routes | Same gap |

**Finding (MEDIUM):** Plan 05's `files_modified` frontmatter omits `packages/foundry-module/src/pair/socketlib-handlers.ts`, but the action text describes modifying it. This creates a silent cross-wave edit that could surprise the executor. The file is NOT listed in Plan 05's wave 3 file set.

### 3b. Tier 3 Session Schema Cross-Reference (Plan 03 → Plan 04)

Plan 03 defines `SessionSchema` in `tier3-storage.ts`:
```
{ profileId: uuid, bridgeUrl: url, tokenObfuscated: null, characterId: string, savedAt: number }
```

Plan 04 does NOT consume the session schema directly from Plan 03 — Plan 04's bridge does not read Tier 3 at all (the wizard reads Tier 3 client-side; bridge validates bearers via socketlib, not by reading phone storage). This is architecturally correct. The interface gap is only within the wizard itself (Plans 03 is self-contained). **No cross-plan schema conflict.**

However: Plan 03 defines `SessionSchema` locally ("define locally here, move to shared-protocol in Plan 05 refactor if needed"). Plan 05 does NOT include a refactor of SessionSchema into shared-protocol — this is a low-risk deferred cleanup, not a blocker.

### 3c. Cross-Plan File Write Conflicts (Plans 02/01 vs 05)

| File | Written by | Modified by | Risk |
|------|-----------|-------------|------|
| `packages/foundry-module/src/module.ts` | Plan 01 (creates), Plan 02 (updates settings import), Plan 05 (adds registerHookSubscribers in ready hook) | Plans 01 → 02 → 05 (sequential waves) | LOW — waves are sequential (0→1→3); Plan 05 is a non-conflicting append to the `Hooks.once("ready")` callback |
| `packages/foundry-module/src/types/foundry-globals.d.ts` | Plan 01 (creates minimal), Plan 02 (expands: socketlib, ApplicationV2), Plan 05 (expands: hook signatures, game.actors, game.combat, etc.) | Plans 01 → 02 → 05 (sequential waves) | LOW — sequential expansion pattern; each wave adds new declarations without overwriting old ones |
| `packages/foundry-module/src/pair/socketlib-handlers.ts` | Plan 02 (creates), Plan 05 (updates — adds 5 new handlers) | Plan 02 → Plan 05 | **MEDIUM — see 3a: file NOT listed in Plan 05 files_modified but action describes modifying it** |
| `packages/shared-protocol/src/index.ts` | Plan 04 (updates), Plan 05 (adds payload re-exports) | Plans 04 → 05 (sequential) | LOW — additive re-exports, no conflicts |

---

## 4. Wave 1 Parallelism Safety Check

Plans 02 and 03 are both Wave 1, depending only on Plan 01.

**Plan 02 files_modified:**
- `packages/foundry-module/src/pair/PairModal.ts`
- `packages/foundry-module/src/pair/bearer-registry.ts`
- `packages/foundry-module/src/pair/bearer-registry.test.ts`
- `packages/foundry-module/src/pair/PairModal.test.ts`
- `packages/foundry-module/src/pair/socketlib-handlers.ts`
- `packages/foundry-module/src/pair/socketlib-handlers.test.ts`
- `packages/foundry-module/src/settings.ts`
- `packages/foundry-module/src/types/foundry-globals.d.ts`
- `packages/foundry-module/templates/pair-modal.hbs`

**Plan 03 files_modified:**
- `packages/g2-app/src/wizard/wizard.html`
- `packages/g2-app/src/wizard/wizard.ts`
- `packages/g2-app/src/wizard/wizard.css`
- `packages/g2-app/src/wizard/state.ts`
- `packages/g2-app/src/wizard/steps/step1-profile.ts`
- `packages/g2-app/src/wizard/steps/step2-token.ts`
- `packages/g2-app/src/wizard/steps/step3-character.ts`
- `packages/g2-app/src/wizard/steps/completion.ts`
- `packages/g2-app/src/wizard/auto-connect.ts`
- `packages/g2-app/src/wizard/i18n.ts`
- `packages/g2-app/src/wizard/tier3-storage.ts`
- `packages/g2-app/src/wizard/wizard.test.ts`
- `packages/g2-app/vite.config.ts`
- `packages/g2-app/src/types/even-hub.d.ts`

**Intersection:** EMPTY. Plans 02 and 03 touch entirely different packages (`foundry-module` vs `g2-app`). Parallelism is safe.

---

## 5. Internal Secret Lifecycle Audit

The user specifically validated that the QR payload becomes `{ bridge_url, bearer, internal_secret, world, expires }` and the Foundry module pushes deltas via `HTTP POST /internal/delta` authenticated with `EVF_INTERNAL_SECRET`.

| Concern | Plan 02 (pair modal generates) | Plan 04 (bridge stores/validates) | Plan 05 (Foundry module pushes) |
|---------|-------------------------------|----------------------------------|----------------------------------|
| Secret generation | **NOT PRESENT in Plan 02.** The QR payload in Plan 02 Task 2 getData() is: `JSON.stringify({ bridge_url, token, world, expires })` — the `internal_secret` field is ABSENT. | Plan 04 `server.ts` references `EVF_INTERNAL_SECRET` env var for `/internal/delta` auth. Bridge reads it from environment, does not receive it via QR/pair. | Plan 05 `hook-subscribers.ts` sends POST to `/internal/delta` with `EVF_INTERNAL_SECRET` header — described as "env var set at bridge startup, exchanged via Foundry module settings at pair time." |
| Secret distribution mechanism | Not planned | Not planned | Described as "exchanged via Foundry module settings at pair time" but no task implements this exchange |

**HIGH CONCERN: The internal_secret distribution mechanism is architecturally described but has no implementation task in any plan.** 

Specifically:
1. Plan 02's QR payload does NOT include `internal_secret` (contradicts user-validated decision #1 in the prompt).
2. No plan creates a task for: generating `EVF_INTERNAL_SECRET`, storing it in Foundry module settings, or making it available to the module for outbound POSTs.
3. Plan 05 mentions the secret is "exchanged via Foundry module settings at pair time" but Plan 02 (the pair flow) has no task that generates or persists this secret.

The bridge reads `EVF_INTERNAL_SECRET` from an environment variable (set in Docker Compose `.env`), but the Foundry module needs to know the same value to POST to `/internal/delta`. This bootstrapping problem is unaddressed.

**Possible intended architecture:** `EVF_INTERNAL_SECRET` is a static secret shared at deploy time via Docker Compose env injection — NOT passed through QR. If so, Plan 02's QR payload omission is correct and the user-validated decision in the prompt description may have been superseded by the actual plan implementation. However, this creates ambiguity: the prompt says the QR payload includes `internal_secret`, but the plans implement it as a separate env var. This inconsistency must be explicitly resolved before execution.

---

## 6. Threat Coverage Check

| Threat | Plan 01 | Plan 02 | Plan 03 | Plan 04 | Plan 05 |
|--------|---------|---------|---------|---------|---------|
| T-02-01: Bearer token leak in logs | ✓ (scaffolded, N/A Wave 0) | ✓ (generateBearer never logs token; pino redact) | ✓ (token not in Tier 3) | ✓ (pino redact list) | ✓ (internal secret redacted) |
| T-02-02: Replay attack / seq reuse | N/A | ✓ (60s grace on rotation) | N/A | ✓ (seq monotonicity, lastSeq tracking) | ✓ (per-session seq counter) |
| T-02-03: XSS | ✓ (stub, minimal surface) | ✓ (ApplicationV2 escapes; SVG trusted) | ✓ (textContent only, no innerHTML for user data) | N/A | N/A |
| T-02-04: Unauthenticated socketlib calls | N/A | ✓ (handler validates input types) | ✓ (Tier 3 Zod validation) | ✓ (5s timeout on Foundry roundtrip) | ✓ (snapshot handlers validate token first) |
| T-02-05: Revoke registry staleness | N/A | ✓ (DM revoke immediate) | N/A | ✓ (cache invalidation path) | N/A |

All applicable threat entries are addressed in their owning plans. No plan omits a threat it owns.

---

## 7. Concerns List

### HIGH

**H-1: Internal secret QR-payload inconsistency**
- **Where:** Plan 02 (QR payload construction in PairModal.getData()), Plan 05 (EVF_INTERNAL_SECRET usage)
- **What:** The user-validated decision states QR payload = `{ bridge_url, bearer, internal_secret, world, expires }`. Plan 02's PairModal.getData() only constructs `{ bridge_url, token, world, expires }` — `internal_secret` is absent. Plan 05 assumes the module has this secret available "via Foundry module settings" but no plan creates or stores it. The bootstrapping mechanism is missing.
- **Risk:** If Plan 05 executes as written, `bridgeDeltaEmitter` will attempt to POST `/internal/delta` but the Foundry module has no valid `EVF_INTERNAL_SECRET` to authenticate with. All hook-based delta pushes will fail silently (fire-and-forget, logs warning but doesn't throw).
- **Fix required:** Either (a) Plan 02 must generate `EVF_INTERNAL_SECRET` at pair time, include it in the QR payload, and store it in Foundry module settings; or (b) clarify that `EVF_INTERNAL_SECRET` is a static deploy-time env var also injected into the Foundry module's environment (not via QR), and update Plan 05's action text accordingly. Must resolve before execution.

### MEDIUM

**M-1: Plan 05 files_modified missing `socketlib-handlers.ts`**
- **Where:** Plan 05 frontmatter `files_modified` vs Plan 05 Task 2 action text
- **What:** Plan 05 Task 2 action explicitly says "update `registerSocketlibHandlers()` from Plan 02 to include the new handlers" but `packages/foundry-module/src/pair/socketlib-handlers.ts` is not listed in Plan 05's `files_modified`. If the executor uses `files_modified` as the authoritative list (which `execute-plan` workflows typically do), this modification will be skipped.
- **Risk:** The 5 new socketlib handlers (`evf.getCharacterSnapshot`, etc.) will not be registered. All REST snapshot routes in Plan 05 will hang or fail when calling `socketlib.executeAsGM(...)` for handlers that don't exist.
- **Fix required:** Add `packages/foundry-module/src/pair/socketlib-handlers.ts` to Plan 05's `files_modified` frontmatter.

**M-2: `happy-dom` mock-shape risk for Foundry globals**
- **Where:** Plan 05 Task 1, `readers.test.ts`
- **What:** Plan 05 uses happy-dom env + manually mocked Foundry globals (`game.actors`, `game.combat`, etc.). The ambient `.d.ts` shapes are defined by the plan author, not derived from `fvtt-types`. If the mock shape diverges from actual Foundry v13/v14 API (e.g., `actor.statuses` is a `Set<string>` vs `Collection<ActiveEffect>`), tests will pass against the mock but fail at runtime.
- **Risk:** False-green tests. The character reader in particular accesses `actor.system.attributes`, `actor.statuses` (conditions), and `actor.items` — all dnd5e 5.x specific shapes.
- **Mitigation in plan:** Plan 05 includes explicit shape documentation in the interfaces block for dnd5e 5.x actor.system. The ambient .d.ts is manually maintained, not generated from fvtt-types. This is a known acceptable risk for Phase 2, but the plan should add a `// TODO (#XX): validate mock shapes against fvtt-types when package stabilizes` comment on the test file.
- **Severity:** Medium — mitigated by explicit interface documentation but not eliminated.

### LOW

**L-1: `DeltaEnvelopeSchema` payload is `z.unknown()` placeholder — no validation at `/internal/delta`**
- **Where:** Plan 04 and Plan 05 shared-protocol schema
- **What:** `/internal/delta` validates body against `DeltaEnvelopeSchema` which has `payload: z.unknown()`. A malformed payload from a compromised Foundry module (or test bug) passes validation silently. Phase 4a may receive ill-shaped payloads.
- **Risk:** Low for MVP single-tenant; payload schemas are defined in Plan 05 but not connected to the delta endpoint validation.
- **Fix:** Low priority. Consider union-discriminating on `type` field in Phase 3/4a when payload schemas are consumed.

**L-2: Plan 03 `SessionSchema` defined locally, not in `@evf/shared-protocol`**
- **Where:** Plan 03 `tier3-storage.ts`
- **What:** Plan 03 action text says "define SessionSchema locally here, move to shared-protocol in Plan 05 refactor if needed" — but Plan 05 does not include this refactor.
- **Risk:** Schema duplication risk if bridge ever needs to validate sessions (currently it does not). Low for Phase 2.

**L-3: `GET /v1/i18n/:lang` path resolution at runtime**
- **Where:** Plan 04, `routes/i18n.ts`
- **What:** The route loads lang files via `new URL('../../../foundry-module/lang', import.meta.url)` — this path is correct in the monorepo development layout but may break if Docker build copies `dist/` to a different directory structure.
- **Risk:** Low if Docker Compose volume-mounts the entire repo. Medium if bridge is copied as a standalone binary. The plan includes a startup check ("log warning and serve empty object") which degrades gracefully.

---

## 8. Dependency Graph Verification

```
Plan 01 (Wave 0)
  └── Plan 02 (Wave 1) ─────┐
  └── Plan 03 (Wave 1) ─────┤
                              └── Plan 04 (Wave 2)
                                    └── Plan 05 (Wave 3)
```

- Plan 01: `depends_on: []` → Wave 0 ✓
- Plan 02: `depends_on: ["01"]` → Wave 1 ✓
- Plan 03: `depends_on: ["01"]` → Wave 1 ✓ (parallel with 02, disjoint files confirmed)
- Plan 04: `depends_on: ["02", "03"]` → Wave 2 ✓ (waits for both Wave 1 plans)
- Plan 05: `depends_on: ["04"]` → Wave 3 ✓

**No cycles. No missing references. Wave assignments consistent.**

---

## 9. must_haves Validity Assessment

All plan truths are testable post-execution via CLI commands specified in each plan's `<verification>` block:

| Plan | Truths Count | Testability | Notes |
|------|-------------|-------------|-------|
| 01 | 4 | ✓ All verifiable via build + grep commands | |
| 02 | 5 | ✓ All testable via Vitest assertions | Truth "DM can open pair modal" requires runtime Foundry env but is covered by unit tests of modal state machine |
| 03 | 6 | ✓ Build output + unit test assertions | |
| 04 | 7 | ✓ Vitest + Fastify `.inject()` for HTTP; WS handshake test via mock client | |
| 05 | 7 | ✓ Vitest + mock Foundry globals | "WS subscriber receives character.delta within 1s" is tested via mock hook fire + delta-emitter spy, not real timing |

All truths are user/system-observable (not implementation-level like "bcrypt installed"). No vague truths found.

---

## 10. Scope Sanity

| Plan | Tasks | Files Modified | Wave | Assessment |
|------|-------|---------------|------|------------|
| 01 | 3 | 11 | 0 | Within budget (files slightly high but 4 are simple JSON/config) |
| 02 | 2 | 9 | 1 | Good |
| 03 | 2 | 14 | 1 | Warning: 14 files is above the 10 file guidance, but this is a new UI package — most files are small step components; acceptable |
| 04 | 2 | 16 | 2 | Warning: 16 files marginally exceeds guideline (threshold: 15). Bridge infrastructure + shared-protocol + test files. All files are tightly coupled to one objective. Acceptable single-concern plan. |
| 05 | 2 | 24 | 3 | **Concern: 24 files is significantly above guideline.** This plan touches foundry-module readers (8 files), bridge routes (7 files), bridge WS (2 files), shared-protocol payloads (5 files), and changeset. Consider splitting into 05a (shared-protocol payloads + Foundry readers) and 05b (bridge routes + delta-emitter). However, these concerns are tightly interdependent and splitting would create another wave dependency. Acceptable given sequential nature, but executor should exercise care. |

---

## 11. Verdict and Recommendation

**Verdict: CONCERNS (not a blocker on execution, but H-1 must be resolved first)**

### Must resolve before execute-phase (blocking):

**H-1 (Internal Secret bootstrapping gap):** The plans leave the `EVF_INTERNAL_SECRET` distribution mechanism unspecified. This is a critical flow — without it, Plan 05's delta push mechanism will silently fail at runtime. **Clarify the intended mechanism and add a task (to Plan 02 or a new Plan 02b) before running execute-phase.**

### Should fix before execute-phase (non-blocking but high risk):

**M-1 (Plan 05 files_modified):** Add `packages/foundry-module/src/pair/socketlib-handlers.ts` to Plan 05's frontmatter `files_modified` list.

### Can proceed with awareness:

**M-2 (happy-dom mock-shape risk):** Add TODO comment referencing fvtt-types in test file. Acceptable for Phase 2 given documented interface contracts.
**L-1, L-2, L-3:** Log as known tech debt items for Phase 3/4a.

### Summary

Plans 01–05 collectively and coherently deliver all 8 phase goal elements. Dependency graph is clean. Wave 1 parallelism is safe (zero file intersection). All 10 requirements (CONN-01..05, FOUN-01, FOUN-02, FOUN-04, I18N-01, I18N-03) have coverage. Threat model is complete across all plans.

The single high-concern issue (internal secret bootstrapping) represents a genuine missing mechanism that will cause silent runtime failures if unaddressed. All other concerns are medium-to-low and can be addressed with small targeted fixes rather than plan rewrites.

**Recommendation:** Fix H-1 (clarify secret distribution, update Plan 02 or add task), fix M-1 (add file to Plan 05 frontmatter), then proceed to execute-phase.
