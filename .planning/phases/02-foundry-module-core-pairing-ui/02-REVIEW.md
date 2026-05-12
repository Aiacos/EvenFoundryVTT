---
status: fixed
phase: 02-foundry-module-core-pairing-ui
depth: standard
files_reviewed: 73
diff_base: 2ae246a51e4f025afaf776c8197097c30837d00d^
generated: 2026-05-12
fixed: 2026-05-12
findings:
  critical: 2
  warning: 4
  info: 5
  total: 11
fixed_findings:
  CR-01: "SceneViewportSchema sceneId relaxed to z.string() — zero-state '' now valid"
  CR-02: "internal-delta.ts uses crypto.timingSafeEqual via secretsEqual() helper"
  WR-01: "CORS fallback changed from `true` to 'http://localhost:5173' (explicit dev URL)"
  WR-02: "Rate-limit keyGenerator added — per-token (Authorization header) with IP fallback"
  WR-03: "vi.mock() removed from beforeEach and test bodies in PairModal.test.ts"
  WR-04: "_onClickRefresh propagates listBearers()[0]?.alias to generateBearer"
  IN-03: "handleUpdateCombat JSDoc corrected — no longer claims to emit combat.state"
---

# Code Review — Phase 02

## Summary

Phase 02 delivers a well-structured, security-conscious implementation. The bearer token lifecycle (`generateBearer`, `validateBearer`, `revokeBearer`) is cryptographically correct — 32-byte `crypto.getRandomValues` base64url output with no JWT structure, no logging of raw token values, and a correctly implemented 60-second grace period on refresh. The read-only contract is strictly honoured: no `actor.update()`, `combat.advance()`, `game.settings.set()`, or `setTargets()` calls are present in any reader file. The five Foundry hook subscribers are cleanly written with appropriate change-guards. The shared-protocol Zod schemas are structurally sound and dual-edition aware at the level required for Phase 2.

Two critical issues require fixes before this can be marked complete. The most important is a schema mismatch between `SceneViewportSchema` (which requires `sceneId: z.string().min(1)`) and the zero-state fallback paths in both `scene-reader.ts` and `scene.ts` (which emit `sceneId: ''`). This will silently discard the zero-state response, yielding a misleading Zod warn instead of the intended 200 OK. The second critical issue is the non-constant-time string comparison in `POST /internal/delta` authentication, which is a timing-attack surface for a secret-comparison path. Both are fixable in one or two lines.

Four warnings address security posture (CORS wildcard fallback, per-IP rate-limiting instead of per-token, vi.mock hoisting pattern in PairModal tests, empty alias on QR refresh). Five informational items cover JSDoc gaps, a process note on commit scopes, and minor schema-design observations.

---

## Findings

### Critical

#### CR-01: `SceneViewportSchema` rejects the zero-state (empty `sceneId: ''`)

- **File:** `packages/foundry-module/src/readers/scene-reader.ts:30` and `packages/bridge/src/routes/scene.ts:60`
- **Severity:** critical
- **Issue:** `SceneViewportSchema` (shared-protocol `payloads/scene.ts:21`) declares `sceneId: z.string().min(1)`. Both the Foundry-side reader and the bridge fallback path emit `sceneId: ''` when no active scene exists. In `scene-reader.ts` the zero-state is returned directly by `getSceneViewport()`, then the bridge route in `scene.ts` calls `SceneViewportSchema.safeParse(viewport)` on it — which will always fail (`min(1)` rejects empty string). The failure branch returns the hardcoded fallback object (also with `sceneId: ''`), which is not validated, so the client receives `{ sceneId: '' }` inconsistently: sometimes from Zod, sometimes from the raw fallback. Additionally, the `handleGetSceneViewport` socketlib handler in `socketlib-handlers.ts` returns `getSceneViewport()` directly without further validation, so bridge routes and socketlib callers observe different zero-state shapes.
- **Fix:** Change `sceneId: z.string().min(1)` to `z.string()` in `SceneViewportSchema` to permit the empty-string zero-state. Alternatively, document that an empty string is the canonical zero-state and remove `min(1)`. Either choice should be propagated to the hardcoded fallback in `scene.ts:60` and verified in tests.
- **Ref:** `packages/shared-protocol/src/payloads/scene.ts:21`, `packages/foundry-module/src/readers/scene-reader.ts:29-36`, `packages/bridge/src/routes/scene.ts:55-68`

---

#### CR-02: Non-constant-time string comparison for `EVF_INTERNAL_SECRET`

- **File:** `packages/bridge/src/routes/internal-delta.ts:61`
- **Severity:** critical
- **Issue:** The authentication check `providedSecret !== internalSecret` is a plain string inequality that short-circuits on the first differing character. On a local network homelab an attacker who can observe response timing can theoretically recover the secret byte-by-byte via a timing oracle. Node.js ships `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` precisely for this use case. While risk is low in the homelab MVP, this is a secret-comparison path and the fix is trivial.
- **Fix:** Replace `providedSecret !== internalSecret` with a constant-time comparison:
  ```ts
  import { timingSafeEqual } from 'node:crypto';
  const safeEq = (a: string, b: string): boolean => {
    try {
      return timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false; // Buffer.from throws on non-utf8 or different lengths
    }
  };
  // Use: !safeEq(providedSecret ?? '', internalSecret)
  ```
- **Ref:** CLAUDE.md Security constraint §11.5.4, T-02-01 threat model

---

### Warning

#### WR-01: CORS `origin: true` when `EVF_PLUGIN_HOST_URL` is not set

- **File:** `packages/bridge/src/server.ts:84`
- **Severity:** warning
- **Issue:** `await app.register(cors, { origin: pluginHostUrl ?? true, ... })` — when `EVF_PLUGIN_HOST_URL` is not set in the environment (which is the case in all current tests and the default Docker Compose template), `origin: true` enables CORS for **all origins**. This contradicts Specs.md §3.3 ("no wildcards — origin-complete URLs only"). The `TODO (#42)` comment acknowledges this, but the wildcard default creates a surface in CI and staging builds where the bridge would accept requests from any origin.
- **Fix:** Change the fallback from `true` to `false` (no CORS for unrecognised origins), or to `'http://localhost:5173'` as an explicit dev-only fallback. Add documentation that `EVF_PLUGIN_HOST_URL` is required in production. The `TODO (#42)` already tracks this — update it to note that the fallback must not be `true`.
- **Ref:** Specs.md §3.3 (no wildcard origins in Even Hub whitelist), CLAUDE.md Technology Stack §1.2 `@fastify/cors`

---

#### WR-02: Rate-limit is per-IP, not per-token (spec says per-token)

- **File:** `packages/bridge/src/server.ts:89-92`
- **Severity:** warning
- **Issue:** The comment on line 10 reads `@fastify/rate-limit — 100 req/min per IP` and the registration `{ max: 100, timeWindow: '1 minute' }` uses the default IP-based key. CLAUDE.md §1.2 states `Per-token rate limit on action endpoints`. Per-IP is weaker for a homelab where all devices share a LAN IP (NAT). A compromised token cannot be rate-limited independently from a legitimate token at the same IP.
- **Fix:** Add a `keyGenerator` that extracts the bearer token from `Authorization` header, or falls back to IP. `@fastify/rate-limit` supports this:
  ```ts
  keyGenerator: (req) => req.headers.authorization?.slice(7) ?? req.ip
  ```
  This is a Phase 3 task anyway (the spec says "will fully configure"), but the incorrect comment should be corrected now and a `TODO (#XX)` added.
- **Ref:** CLAUDE.md §1.2 `@fastify/rate-limit` rationale

---

#### WR-03: `vi.mock('qrcode', ...)` inside `beforeEach` is not hoisted — Vitest 4 warning

- **File:** `packages/foundry-module/src/pair/PairModal.test.ts:102, 158, 193, 370, 401, 432, 463`
- **Severity:** warning
- **Issue:** Vitest 4 (like Jest) hoists `vi.mock(...)` calls to the top of the module at compile time when they appear at module scope. Calls inside `beforeEach` or other function bodies are **not** hoisted and generate a runtime warning: _"vi.mock() called inside a function is not hoisted"_. The top-level `vi.mock('qrcode', ...)` at line 82 is correctly placed; the repeated calls inside `beforeEach` (line 102) and within test cases after `vi.resetModules()` (lines 158, 193, 370, 401, 432, 463) will emit warnings. The mock may or may not apply depending on module registration order.
- **Fix:** Remove all `vi.mock('qrcode', ...)` calls from inside `beforeEach` and test bodies. The single top-level `vi.mock` at line 82 is sufficient and will be correctly hoisted. When `vi.resetModules()` is used to re-import the module under test, the top-level mock is re-applied automatically. If the mock factory needs to vary per test, use `vi.mocked(QRCode.toString).mockResolvedValue(...)` inside the test body instead of re-calling `vi.mock`.
- **Ref:** Vitest 4 docs — `vi.mock` hoisting, CLAUDE.md §1.6 Vitest 4

---

#### WR-04: `_onClickRefresh` passes empty alias `''` to `generateBearer`

- **File:** `packages/foundry-module/src/pair/PairModal.ts:392`
- **Severity:** warning
- **Issue:** `_onClickRefresh` calls `generateBearer('', this._bridgeUrl, this._worldId, true)`. An empty alias is stored in the new `BearerEntry.alias`, which appears in the paired devices table as an empty cell. This is a UX regression — the refreshed token loses the device label. The alias should be propagated from the existing active entry (available from `listBearers()[0]?.alias`).
- **Fix:** In `_onClickRefresh`, retrieve the current active entry's alias before calling `generateBearer`:
  ```ts
  const currentAlias = listBearers()[0]?.alias ?? '';
  generateBearer(currentAlias, this._bridgeUrl, this._worldId, true)
  ```
- **Ref:** 02-UI-SPEC.md §Revoke Flow (alias label is DM-set at pairing time, must survive refresh)

---

### Info

#### IN-01: `SceneViewportSchema` `sceneName` has no `min(1)` — inconsistent with zero-state semantics

- **File:** `packages/shared-protocol/src/payloads/scene.ts:24`
- **Severity:** info
- **Issue:** `sceneName: z.string()` (no min) is intentionally permissive and works correctly for the zero-state `sceneName: ''`. However, when paired with CR-01's fix (relaxing `sceneId` to `z.string()`), the schema will accept any empty-string combination. This is semantically correct but worth noting as a design observation: a future consumer wanting to distinguish "no active scene" from "active scene with empty name" will need to use `sceneId === ''` as the zero-state discriminant.
- **Ref:** `packages/shared-protocol/src/payloads/scene.ts`

---

#### IN-02: `handleUpdateActor` guard has an unreachable branch after the early `systemChanged` check

- **File:** `packages/foundry-module/src/readers/hook-subscribers.ts:104-112`
- **Severity:** info
- **Issue:** Lines 104–112 re-check `!attributesChanged && !statusesChanged` inside the `if (systemChanged)` block. However, `statusesChanged` was already confirmed false at this point (because the outer `if (!systemChanged && !statusesChanged) return` already filtered the case where only statuses changed). If `systemChanged` is true and `attributesChanged` is false, the handler returns early — this is correct and intended. The check is not wrong but is slightly confusing to read; a comment would help. No dead code flag under strict analysis.
- **Ref:** `packages/foundry-module/src/readers/hook-subscribers.ts:97-113`

---

#### IN-03: Missing JSDoc on `handleUpdateCombat` — does not emit `combat.state`

- **File:** `packages/foundry-module/src/readers/hook-subscribers.ts:128-134`
- **Severity:** info
- **Issue:** The comment on `handleUpdateCombat` says "Emits combat.turn on every update" and "Emits combat.state as an alias for the full snapshot." However, the function only calls `emitFn(COMBAT_TURN_DELTA_TYPE, snapshot)`. The `combat.state` emission is handled separately by the `combatStart` hook lambda (lines 274–278), not by `handleUpdateCombat`. The JSDoc is therefore misleading — `handleUpdateCombat` only emits `combat.turn`.
- **Fix:** Update the JSDoc to remove the "Emits combat.state as an alias" line. The `combatStart` hook separately emits `combat.state`.
- **Ref:** `packages/foundry-module/src/readers/hook-subscribers.ts:128-134`

---

#### IN-04: `DeltaEnvelopeSchema` `payload: z.unknown()` — acknowledged but no discriminated union in sight

- **File:** `packages/shared-protocol/src/envelope.ts:45`
- **Severity:** info
- **Issue:** `DeltaEnvelopeSchema` is a type alias for `EnvelopeSchema` with `payload: z.unknown()`. The plan-check (L-1) and code both acknowledge this is a Phase 5 placeholder. The body of `POST /internal/delta` is validated against this schema, which means a malformed payload from a Foundry bug or a test regression passes schema validation silently. This is acceptable for Phase 2 but the limitation should be tracked.
- **Ref:** 02-PLAN-CHECK.md §7 L-1, `packages/shared-protocol/src/envelope.ts`

---

#### IN-05: Process note — commit scope convention deviated in Plan 02-02

- **File:** N/A (historical, non-fixable)
- **Severity:** info
- **Issue:** Per 02-02-SUMMARY, three commits in Plan 02-02 used scope `feat(foundry-module):` instead of the `feat(02-02):` pattern established in other plans. The commitlint config does not explicitly enforce a `0N-NN` pattern, so this did not break CI. Future executors should use the phase-plan scope (`02-05:`, etc.) to maintain consistent changelog grouping.
- **Fix:** No code fix needed. Update the commitlint `rules.scope-enum` to include both patterns, or document the convention in CLAUDE.md §Conventions.
- **Ref:** CLAUDE.md §Conventions (currently empty — conventions not yet established)

---

## Strengths

- **Cryptographic correctness of bearer tokens.** `generateOpaqueToken()` correctly uses `crypto.getRandomValues(new Uint8Array(32))` in the browser context. The `bytesToBase64url` implementation correctly uses `btoa()` + RFC 4648 §5 alphabet substitution. The token contains no dots (confirmed by test `'token contains NO dots'`), ensuring it can never be mistaken for a JWT. `token` and `internalSecret` are generated as separate calls so they are statistically independent.

- **Read-only contract strictly upheld.** No `actor.update()`, `combat.advance()`, `game.settings.set()`, or `TokenLayer.setTargets()` calls appear in any reader file. All Foundry writes remain deferred to Phase 7 as specified. The `void token; void targeted;` suppression in `handleTargetToken` demonstrates careful discipline.

- **H-1 plan-check gap fully resolved.** The `internal_secret` is correctly generated per-pair in `generateBearer`, included in the `BearerEntry`, emitted in the QR payload via `buildQrPayload`, and read at emit time by `getInternalSecret()` in `module.ts`. The bridge reads the secret from `EVF_INTERNAL_SECRET` env var at startup, and tests cover both the match and mismatch cases.

- **M-1 plan-check gap fully resolved.** `socketlib-handlers.ts` now contains all 7 handlers (2 original + 5 new), resolving the missing-file issue flagged in the plan check. All bridge snapshot routes have matching socketlib counterparts.

- **Test coverage breadth.** The `PairModal.test.ts` exercises all 5 modal states including the edge cases (`refresh-needed`, `expired`, `pairing-in-progress`) and the countdown timer lifecycle. `readers.test.ts` fires all 7 hooks via a `fireHook` helper and asserts on the emitted payload shapes. The `server.test.ts` integration suite covers all 8 HTTP routes with auth/no-auth/503 variants.

---

## Process Notes

1. **`vi.mock` hoisting (WR-03).** The pattern of calling `vi.mock('qrcode', ...)` inside `beforeEach` after `vi.resetModules()` appears in 6 test cases and will emit Vitest 4 runtime warnings. It works in practice because Vitest still applies the mock — but the warnings may mask real errors in CI output. The executor fixing WR-03 should verify with `pnpm test 2>&1 | grep "vi.mock"` after the fix.

2. **Commit scope convention (IN-05).** Plan 02-02 used `feat(foundry-module):` scope; other plans used `feat(02-NN):`. The project CLAUDE.md §Conventions section is currently empty. The Phase 03 kickoff is a good opportunity to establish a written convention.

3. **`extends: true` in `defineProject` (already avoided).** The g2-app vitest.config.ts explicitly documents that `extends: true` is not accepted by `defineProject` (line 9 comment). All three per-package configs correctly use `defineProject` without `extends`. The Phase 1 lesson was learned and applied.

4. **CORS wildcard risk (WR-01) surfaces in CI.** All server tests use `buildServer({ langDirOverride: LANG_DIR })` without `EVF_PLUGIN_HOST_URL` in the environment, meaning `origin: true` is active during test runs. This does not affect test correctness but means no test exercises the correct production CORS path. A follow-up test with `process.env.EVF_PLUGIN_HOST_URL = 'https://plugin.example.com'` and a cross-origin inject would close this gap.
