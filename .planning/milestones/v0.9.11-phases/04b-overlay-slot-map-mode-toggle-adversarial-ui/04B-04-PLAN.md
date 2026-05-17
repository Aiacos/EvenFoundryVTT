---
phase: 4b
plan: 04
type: execute
wave: 2
depends_on: ["04b-01", "04b-02"]
files_modified:
  - packages/g2-app/src/engine/boot-error-types.ts
  - packages/g2-app/src/engine/boot-error-layer.ts
  - packages/g2-app/src/engine/boot-error-dispatch.ts
  - packages/g2-app/src/engine/boot-engine-error-wrapper.ts
  - packages/g2-app/src/engine/__tests__/boot-error-types.test.ts
  - packages/g2-app/src/engine/__tests__/boot-error-layer.test.ts
  - packages/g2-app/src/engine/__tests__/boot-error-dispatch.test.ts
  - packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts
  - packages/shared-render/src/fixtures/boot-error.handshake-failed.it.txt
  - packages/shared-render/src/fixtures/boot-error.handshake-failed.en.txt
  - packages/shared-render/src/fixtures/boot-error.version-mismatch.it.txt
  - packages/shared-render/src/fixtures/boot-error.version-mismatch.en.txt
  - packages/shared-render/src/fixtures/boot-error.no-character.it.txt
  - packages/shared-render/src/fixtures/boot-error.no-character.en.txt
  - packages/shared-render/src/fixtures/boot-error.bridge-unreachable.it.txt
  - packages/shared-render/src/fixtures/boot-error.bridge-unreachable.en.txt
  - packages/shared-render/src/fixtures/boot-error.token-expired.it.txt
  - packages/shared-render/src/fixtures/boot-error.token-expired.en.txt
autonomous: true
requirements: [BOOT-01]
subsystem: g2-app
user_setup: []
tags: [g2-app, engine, boot-error, dispatch, i18n, inv-1, fixtures, wave-2]
must_haves:
  truths:
    - "BootErrorState enum is the literal union 'handshake_failed' | 'version_mismatch' | 'no_character' | 'bridge_unreachable' | 'token_expired' (5 values, locked by CONTEXT §Area 6)"
    - "bootErrorFromException(err) maps every reachable boot-engine exception to one of the 5 enum values per RESEARCH §Q3 source map; unknown exceptions default to 'handshake_failed' (catch-all)"
    - "BootErrorLayer implements Layer; mounts at z=1; single text container 'boot-error-block' with 8-row newline-separated content (top border + title + blank + 2 hints + blank + close + bottom border) per UI-SPEC §3.3 — the panel frame IS rendered by the layer (Option B from RESEARCH discussion)"
    - "BootErrorLayer constructor takes a BootErrorState + locale ('it'|'en'|'de'); renderer pulls strings from BOOT_ERROR_CONTENT table (5 states × 3 locales)"
    - "10 INV-1 fixtures: 5 states × 2 locales (IT + EN); DE fixtures NOT shipped in Plan 04 per UI-SPEC §9.5 + RESEARCH §Q6 Assumption A6 (best-effort policy)"
    - "i18n-budgets.ts boot-error keys (17 total) are READ-ONLY here — Plan 01 already landed them in Wave 0 with verbatim values from UI-SPEC §4.3. This plan does NOT modify i18n-budgets.ts to avoid Wave-2 file-overlap with Plan 03."
    - "boot-engine-error-wrapper.ts (NEW SEPARATE FILE) exports bootEngineWithErrorUi(opts, deps?) — a try/catch wrapper around _bootEngineCore that mounts BootErrorLayer on exception. The wrapper is in a separate file (NOT in boot-engine-core.ts) to avoid Wave-2 file-overlap with Plan 02 which touched boot-engine-core.ts in Wave 1."
    - "BED-01..BED-14 dispatch unit tests cover every exception → state mapping; BOOT-ERR-INT-01..BOOT-ERR-INT-05 wrapper integration tests in boot-engine-error-wrapper.test.ts cover the 5 distinct exception sources end-to-end (handshake parse_failed, handshake timeout, WS error before open, WS close 1006, proto mismatch)"
    - "Close annotation '[X] Close' / '[X] Chiudi' / '[X] Schließen' is a VISUAL ANNOTATION only — Plan 04 ships no gesture handler; Phase 6 wires the actual close gesture to bootEngine.retry() per UI-SPEC §9.3 resolution"
    - "Canonical type names from boot-engine-core.ts (verified 2026-05-15): `BootEngineOpts` (line 67, NOT `BootEngineOptions`) + `TestingDependencies` (line 86, NOT `BootEngineDeps`) + `BootEngineHandle` (line 100); Plan 04 imports these names VERBATIM"
  artifacts:
    - path: "packages/g2-app/src/engine/boot-error-types.ts"
      provides: "BootErrorState union + BootErrorLocale union + BootErrorContent interface + BOOT_ERROR_CONTENT lookup table (5 states × 3 locales)"
      exports: ["BootErrorState", "BootErrorLocale", "BootErrorContent", "BOOT_ERROR_CONTENT"]
    - path: "packages/g2-app/src/engine/boot-error-dispatch.ts"
      provides: "bootErrorFromException(err: unknown): BootErrorState dispatch function; maps HandshakeError codes + WebSocket error patterns + LayerManagerError + bridge factory rejections to enum states"
      exports: ["bootErrorFromException"]
    - path: "packages/g2-app/src/engine/boot-error-layer.ts"
      provides: "BootErrorLayer class implementing Layer; mounts at z=1; renders title + 2 hint lines + close annotation; getContainerCount returns { image: 0, text: 1 } (single 'boot-error-block' container per UI-SPEC §7)"
      exports: ["BootErrorLayer", "BOOT_ERROR_CONTAINER_NAME"]
    - path: "packages/g2-app/src/engine/boot-engine-error-wrapper.ts"
      provides: "bootEngineWithErrorUi(opts, deps?) — try/catch wrapper around _bootEngineCore that mounts BootErrorLayer on exception; this is a SEPARATE FILE from boot-engine-core.ts to avoid Wave-2 file-overlap with Plan 02. Returns a RejectingErrorModeHandle on the error path (see W-3 resolution below)."
      exports: ["bootEngineWithErrorUi"]
    - path: "packages/shared-render/src/fixtures/boot-error.{state}.{it,en}.txt"
      provides: "10 INV-1 fixtures × 5 states × 2 locales — 96×24 page, centered panel rows 9-14"
      contains: "HANDSHAKE FALLITO / HANDSHAKE FAILED / VERSION MISMATCH / etc."
  key_links:
    - from: "packages/g2-app/src/engine/boot-error-dispatch.ts"
      to: "packages/g2-app/src/engine/capability-handshake.ts (HandshakeError class)"
      via: "instanceof HandshakeError + switch on err.code; maps 'transport_error' → 'bridge_unreachable'; 'parse_failed'|'schema_failed'|'timeout' → 'handshake_failed'"
      pattern: "HandshakeError|err\\.code"
    - from: "packages/g2-app/src/engine/boot-error-layer.ts"
      to: "packages/g2-app/src/engine/boot-error-types.ts"
      via: "imports BOOT_ERROR_CONTENT[state][locale] for render"
      pattern: "BOOT_ERROR_CONTENT"
    - from: "packages/g2-app/src/engine/boot-engine-error-wrapper.ts"
      to: "packages/g2-app/src/internal/boot-engine-core.ts (_bootEngineCore + BootEngineOpts + TestingDependencies + BootEngineHandle)"
      via: "calls _bootEngineCore in try block; falls through to BootErrorLayer mount on catch; signature matches the post-Plan-02 boot-engine-core.ts exports verbatim"
      pattern: "_bootEngineCore|BootEngineOpts|TestingDependencies"
    - from: "packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts"
      to: "packages/g2-app/src/engine/boot-error-dispatch.ts + boot-error-layer.ts"
      via: "BOOT-ERR-INT-01..05: simulate each exception source and verify BootErrorLayer mounts with the correct state"
      pattern: "BOOT-ERR-INT-0[1-5]"

threat_model:
  trust_boundaries:
    - description: "Foundry i18n catalog → boot error content table — translated strings may contain unicode pathologies; AsciiGrid uniform-width discipline neutralizes"
    - description: "External boot-engine exceptions (HandshakeError, WebSocket errors, LayerManagerError) → bootErrorFromException — must default safely on unknown exception shapes"
    - description: "BootErrorLayer replaces StatusHudLayer in error path — capture invariant must still hold; Plan 04 documents that BootErrorLayer bypasses LayerManager.bundle (renders via bridge.textContainerUpgrade directly)"
    - description: "bootEngineWithErrorUi wraps _bootEngineCore — best-effort error rendering must not throw beyond the wrapper unless BOTH original cause AND error UI render fail. The wrapper RETHROWS the original cause on the error path (no degenerate BootEngineHandle) — see W-3 resolution."
  threats:
    - id: "T-4b-04-01"
      category: "T"
      component: "bootErrorFromException receiving unknown exception shape"
      disposition: "mitigate"
      mitigation_plan: "Catch-all default returns 'handshake_failed' (least informative but always renderable); console.warn telemetry on unknown shape with err type + message. No throw."
    - id: "T-4b-04-02"
      category: "T"
      component: "i18n content injection via translation catalog"
      disposition: "mitigate"
      mitigation_plan: "BOOT_ERROR_CONTENT is a static lookup table baked at compile time; no runtime templating from external strings; width-budgeted to 24/50 chars per UI-SPEC §4.3 (validated against HUD_WIDTH_BUDGETS keys landed in Plan 01)"
    - id: "T-4b-04-03"
      category: "D"
      component: "Boot error path leaves stale layers mounted"
      disposition: "accept"
      mitigation_plan: "Wrapper does NOT clean up partial state — it mounts BootErrorLayer over whatever exists. Documented as design choice; Phase 6 retry mounts fresh layers. Edge case is informational, not security/availability critical."
    - id: "T-4b-04-04"
      category: "T"
      component: "BootErrorLayer mounted without capture provider"
      disposition: "mitigate"
      mitigation_plan: "BootErrorLayer.draw() calls bridge.textContainerUpgrade directly; does NOT participate in LayerManager.bundle's _assertCaptureInvariant. The error UI is terminal; user re-pairs. Documented in JSDoc + 04b-04-SUMMARY.md."
    - id: "T-4b-04-05"
      category: "I"
      component: "Boot error UI displays error type info"
      disposition: "accept"
      mitigation_plan: "Each state is intentionally informative (recovery hint requires knowing which gate failed). No PII; no secrets in messages."
---

<objective>
Ship the **boot error UI** (`BootErrorLayer` + `bootErrorFromException` dispatch + `BOOT_ERROR_CONTENT` table) and 10 INV-1 ASCII fixtures (5 states × IT/EN). Wire the boot-engine exception → BootErrorLayer mount path via a NEW `bootEngineWithErrorUi` wrapper in a SEPARATE file (`boot-engine-error-wrapper.ts`) so Plan 04 does NOT modify `boot-engine-core.ts` (which Plan 02 already touched in Wave 1) and Wave-2 file-overlap is avoided.

Purpose: Close BOOT-01 software-side. RESEARCH §Q3 dispatch source map is the contract; this plan implements it line-by-line in `bootErrorFromException`. Each of the 5 SC #4 states ("handshake failed / version mismatch / no character / bridge unreachable / token expired") gets a dedicated fixture proving the boot path's failure-mode UX matches the design contract.

Output: 4 new source modules (boot-error-types.ts + boot-error-layer.ts + boot-error-dispatch.ts + boot-engine-error-wrapper.ts) + 4 new test files + 10 fixture files. Wave-2 parallel-safe with Plan 03 + Plan 06: **zero files_modified overlap** (Plan 03 owns toast-* + 3 toast fixtures; Plan 04 owns boot-error-* + 10 boot-error fixtures; Plan 06 owns shared-protocol/character + concentration + foundry-module reader). i18n-budgets.ts is NOT in files_modified — Plan 01 landed all Phase 4b keys atomically in Wave 0. boot-engine-core.ts is NOT in files_modified — Plan 02 landed the step-9 extension; Plan 04's wrapper is in a separate file but depends_on includes `04b-02` so the wave-scheduler honours the post-Plan-02 file state.

**B-3 resolution (depends_on chain):** Plan 04 imports `_bootEngineCore`, `BootEngineOpts`, `TestingDependencies`, and `BootEngineHandle` from `packages/g2-app/src/internal/boot-engine-core.ts`. Plan 02 modifies that file in Wave 1 (step-9b override insertion). Therefore Plan 04 `depends_on: ["04b-01", "04b-02"]` makes the dependency explicit — wave-bracket scheduling already provides the implicit guarantee, but the explicit chain documents the contract for any future dependency-driven scheduler.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-02-SUMMARY.md
@packages/g2-app/src/engine/capability-handshake.ts
@packages/g2-app/src/engine/layer-types.ts
@packages/g2-app/src/engine/boot-splash.ts
@packages/g2-app/src/engine/page-lifecycle.ts
@packages/g2-app/src/internal/boot-engine-core.ts
@packages/g2-app/src/status-hud/i18n-budgets.ts
@packages/shared-render/src/fixtures/glyph-scene.boot.txt

<interfaces>
<!-- Key types this plan exposes and consumes. -->

From packages/g2-app/src/engine/capability-handshake.ts:
- export class HandshakeError extends Error { code: 'parse_failed' | 'schema_failed' | 'timeout' | 'transport_error'; ... }

From packages/g2-app/src/engine/layer-types.ts (post-Plan-01):
- enum ZIndex { Z0_MAP, Z0_5_IDLE_INFILL, Z1_STATUS_HUD, Z1_5_TOAST, Z2_OVERLAY }
- interface Layer with optional getContainerCount
- LayerManagerError class

From packages/g2-app/src/status-hud/i18n-budgets.ts (post-Plan-01 — READ-ONLY for Plan 04):
- HUD_WIDTH_BUDGETS.boot_error_title_{handshake,version,no_char,bridge,token} = { it, en, de, max:24 }
- HUD_WIDTH_BUDGETS.boot_error_hint_{handshake,version,no_char,bridge,token}_{1,2} = { it, en, de, max:50 }
- HUD_WIDTH_BUDGETS.boot_error_close_label = { it:'[X] Chiudi', en:'[X] Close', de:'[X] Schließen', max:14 }

From packages/g2-app/src/internal/boot-engine-core.ts (post-Plan-02 — Plan 04 IMPORTS, does NOT modify; CANONICAL export names verified 2026-05-15 via grep):
- export async function _bootEngineCore(opts: BootEngineOpts, deps?: TestingDependencies): Promise<BootEngineHandle>   // line 191 — the inner core that Plan 04 wraps
- export interface BootEngineOpts { bridgeUrl: string; token: string; locale: BootEngineLocale }                       // line 67 — NOT `BootEngineOptions`
- export interface TestingDependencies { wsFactory?: (url: string) => WebSocket; bridgeFactory?: () => Promise<EvenAppBridge> }  // line 86 — NOT `BootEngineDeps`
- export interface BootEngineHandle { layerManager: LayerManager; rasterController: RasterController; teardown: () => void }  // line 100
- export type BootEngineLocale = 'it' | 'en' | 'de'                                                                    // line 59

**B-1 resolution (canonical type names):** Earlier draft of Plan 04 used invented names `BootEngineOptions` and `BootEngineDeps`. These DO NOT EXIST in the source. The canonical names — `BootEngineOpts` and `TestingDependencies` — are used VERBATIM throughout this plan's code excerpts, imports, and JSDoc. Plan-checker iteration 2 verifies via `grep "BootEngineOptions\|BootEngineDeps" packages/g2-app/src/engine/boot-engine-error-wrapper.ts` returning 0.

NEW types boot-error-types.ts:
- export type BootErrorState = 'handshake_failed' | 'version_mismatch' | 'no_character' | 'bridge_unreachable' | 'token_expired'
- export type BootErrorLocale = 'it' | 'en' | 'de'
- export interface BootErrorContent { readonly title: string; readonly hintLine1: string; readonly hintLine2: string; readonly closeAnnotation: string }
- export const BOOT_ERROR_CONTENT: Readonly<Record<BootErrorState, Readonly<Record<BootErrorLocale, BootErrorContent>>>>

Per UI-SPEC §3.3 the 5 × 3 = 15 entries are (Plan 04 commits verbatim):

  handshake_failed:
    it: { title: 'HANDSHAKE FALLITO',          hintLine1: 'Risposta del bridge non valida.',     hintLine2: 'Verifica versione del modulo.',         closeAnnotation: '[X] Chiudi' }
    en: { title: 'HANDSHAKE FAILED',           hintLine1: 'Bridge response was invalid.',         hintLine2: 'Check module version.',                  closeAnnotation: '[X] Close' }
    de: { title: 'HANDSHAKE FEHLGESCHLAGEN',   hintLine1: 'Bridge-Antwort ungültig.',             hintLine2: 'Modulversion prüfen.',                   closeAnnotation: '[X] Schließen' }

  version_mismatch:
    it: { title: 'VERSIONE INCOMPATIBILE',     hintLine1: 'Il bridge parla un protocollo diverso.', hintLine2: 'Aggiorna il modulo Foundry.',         closeAnnotation: '[X] Chiudi' }
    en: { title: 'VERSION MISMATCH',           hintLine1: 'Bridge speaks a different protocol.',    hintLine2: 'Update the Foundry module.',           closeAnnotation: '[X] Close' }
    de: { title: 'VERSION INKOMPATIBEL',       hintLine1: 'Bridge nutzt anderes Protokoll.',        hintLine2: 'Foundry-Modul aktualisieren.',         closeAnnotation: '[X] Schließen' }

  no_character:
    it: { title: 'NESSUN PERSONAGGIO',         hintLine1: 'Nessun PG assegnato a questo player.', hintLine2: 'Assegna un PG da Foundry.',             closeAnnotation: '[X] Chiudi' }
    en: { title: 'NO CHARACTER',               hintLine1: 'No PC assigned to this player.',       hintLine2: 'Assign one from Foundry.',              closeAnnotation: '[X] Close' }
    de: { title: 'KEIN CHARAKTER',             hintLine1: 'Kein SC zugewiesen.',                  hintLine2: 'Einen SC in Foundry zuweisen.',         closeAnnotation: '[X] Schließen' }

  bridge_unreachable:
    it: { title: 'BRIDGE NON RAGGIUNGIBILE',   hintLine1: 'Connessione al bridge fallita.',       hintLine2: 'Verifica URL e rete LAN.',              closeAnnotation: '[X] Chiudi' }
    en: { title: 'BRIDGE UNREACHABLE',         hintLine1: 'Connection to bridge failed.',         hintLine2: 'Check URL and LAN.',                    closeAnnotation: '[X] Close' }
    de: { title: 'BRIDGE NICHT ERREICHBAR',    hintLine1: 'Bridge-Verbindung fehlgeschlagen.',    hintLine2: 'URL und LAN prüfen.',                   closeAnnotation: '[X] Schließen' }

  token_expired:
    it: { title: 'TOKEN SCADUTO',              hintLine1: 'La sessione è scaduta (24h).',         hintLine2: 'Riaccoppia con un nuovo QR.',           closeAnnotation: '[X] Chiudi' }
    en: { title: 'TOKEN EXPIRED',              hintLine1: 'Session expired (24h).',               hintLine2: 'Re-pair via the QR.',                   closeAnnotation: '[X] Close' }
    de: { title: 'TOKEN ABGELAUFEN',           hintLine1: 'Sitzung abgelaufen (24h).',            hintLine2: 'Neu pairen via QR.',                    closeAnnotation: '[X] Schließen' }

NEW boot-error-dispatch.ts function (RESEARCH §Q3 source map):
- export function bootErrorFromException(err: unknown): BootErrorState
  - if err instanceof HandshakeError:
    - err.code === 'transport_error' → 'bridge_unreachable'
    - err.code === 'parse_failed' | 'schema_failed' | 'timeout' → 'handshake_failed'
  - if err instanceof LayerManagerError → 'handshake_failed'
  - if typeof err === 'object' && err !== null && 'message' in err:
    - msg.includes('WebSocket') && msg.includes('1006') → 'bridge_unreachable'
    - msg.includes('WebSocket error before open') → 'bridge_unreachable'
    - msg.includes('proto_chosen') → 'version_mismatch'
    - msg.includes('bridgeFactory') → 'bridge_unreachable'
    - msg.toLowerCase().includes('no actor') || msg.toLowerCase().includes('no character') → 'no_character'
    - msg.includes('TokenExpired') || msg.includes('401') || msg.includes('403') → 'token_expired'
  - default → 'handshake_failed' (catch-all; log telemetry warn)

NEW boot-error-layer.ts class:
- export const BOOT_ERROR_CONTAINER_NAME = 'boot-error-block' as const
- export class BootErrorLayer implements Layer {
    readonly id = 'boot-error';
    constructor(bridge: EvenAppBridge, state: BootErrorState, locale: BootErrorLocale);
    async draw(): Promise<void>;
    destroy(): void;
    getContainerCount(): { image: 0; text: 1 };
  }
- render contract: 8-row content (including panel frame chars), see implementation pseudocode in Task 2

NEW boot-engine-error-wrapper.ts function (W-3 resolution: RETHROW on error path — no degenerate BootEngineHandle):

```
export async function bootEngineWithErrorUi(
  opts: BootEngineOpts,
  deps?: TestingDependencies,
): Promise<BootEngineHandle>
  // Try _bootEngineCore.
  // On any thrown error: render BootErrorLayer best-effort, then RETHROW the
  // original cause.  Caller's `await bootEngineWithErrorUi(...)` always either
  // resolves with a valid handle (happy path) OR rejects with the original error
  // (which the caller observes + handles). No degenerate-handle path exists.
```

**W-3 resolution (BootEngineHandle workaround):** Earlier draft of Plan 04 offered a degenerate `makeErrorModeHandle(bridge)` that returned a partial `BootEngineHandle` (missing `rasterController`) — which conflicted with the type's required field. The two workarounds offered (modify boot-engine-core.ts; use `@ts-expect-error`) were both unsatisfactory.

**Decision (locked in this plan):** `bootEngineWithErrorUi` RETHROWS the original cause on the error path AFTER rendering the BootErrorLayer best-effort. The function signature returns `Promise<BootEngineHandle>` — the consumer code (Phase 6 retry handler, or top-level boot caller) `await`s this function and observes either a resolved handle (success) or a rejected promise (failure). The rejected promise carries the ORIGINAL exception (HandshakeError / LayerManagerError / etc.) so the caller's catch block can decide whether to retry or surface the error to the user via the already-rendered BootErrorLayer.

This pattern:
- Avoids the type-mismatch on BootEngineHandle (no degenerate object construction).
- Preserves the original exception for caller observability (Phase 6 retry can route on `err.code`).
- Renders the BootErrorLayer best-effort BEFORE rethrowing (the player sees the panel even though the awaiter rejects).
- Cleanly handles the double-failure case: if BootErrorLayer.draw() rejects, console.error logs the render failure and the original cause is still rethrown.

BOOT-ERR-INT-01..BOOT-ERR-INT-05 wrapper integration tests (in boot-engine-error-wrapper.test.ts — NOT in scene-renderer-smoke.test.ts):
- BOOT-ERR-INT-01: HandshakeError('transport_error') from performCapabilityHandshake → BootErrorLayer state='bridge_unreachable' (verified via bridge.textContainerUpgrade mock), then promise rejects with HandshakeError('transport_error')
- BOOT-ERR-INT-02: HandshakeError('parse_failed') → 'handshake_failed' + rethrow
- BOOT-ERR-INT-03: HandshakeError('timeout') → 'handshake_failed' + rethrow
- BOOT-ERR-INT-04: WS close 1006 mid-handshake → 'bridge_unreachable' + rethrow
- BOOT-ERR-INT-05: proto mismatch error (message includes 'proto_chosen=evf-v0') → 'version_mismatch' + rethrow

These integration tests live in `packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts` so Plan 04 does NOT modify `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` (Plan 02 already modifies it; Wave 1 + Wave 2 same-file write is fine sequentially but the planner-strict rule says zero overlap regardless of wave). Plan 05 (Wave 3) integration smoke (`04b-integration-smoke.test.ts`) may further exercise the wrapper under combined Phase 4b layer scenarios.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: boot-error-types.ts (state enum + content table) + unit tests (table coverage + width budget consistency vs HUD_WIDTH_BUDGETS)</name>
  <read_first>
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.3 (title + hint text per state + locale) + §4.3 (i18n-budgets keys verbatim with max widths — Plan 04 verifies BOOT_ERROR_CONTENT values match these)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 4 (boot-error-types.ts key data shapes) + §Q6 (fixture count Assumption A6 — IT + EN mandatory, DE optional)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 6 (5 states enum + Each state ships table)
    - packages/g2-app/src/status-hud/i18n-budgets.ts (post-Plan-01 — Plan 04 reads boot_error_* keys to verify consistency in tests; does NOT modify)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md (Plan 01 confirmed 17 boot-error keys landed in HUD_WIDTH_BUDGETS — Plan 04 cross-references them)
  </read_first>
  <files>packages/g2-app/src/engine/boot-error-types.ts, packages/g2-app/src/engine/__tests__/boot-error-types.test.ts</files>
  <behavior>
    boot-error-types tests:
    - Test BET-1: BOOT_ERROR_CONTENT['handshake_failed']['it'].title === 'HANDSHAKE FALLITO' (verbatim)
    - Test BET-2: BOOT_ERROR_CONTENT['version_mismatch']['en'].title === 'VERSION MISMATCH'
    - Test BET-3: BOOT_ERROR_CONTENT['no_character']['de'].title === 'KEIN CHARAKTER'
    - Test BET-4: For each of 5 states × 3 locales, BOOT_ERROR_CONTENT has a complete entry (title, hintLine1, hintLine2, closeAnnotation all non-empty strings) — parametric loop
    - Test BET-5: All title strings have .length ≤ HUD_WIDTH_BUDGETS.boot_error_title_*.max (24 per UI-SPEC §4.3)
    - Test BET-6: All hintLine1 / hintLine2 strings have .length ≤ 50
    - Test BET-7: closeAnnotation strings have .length ≤ HUD_WIDTH_BUDGETS.boot_error_close_label.max (14) and start with '[X]'
    - Test BET-8: BOOT_ERROR_CONTENT['handshake_failed'].it.title MATCHES HUD_WIDTH_BUDGETS.boot_error_title_handshake.it (cross-consistency: Plan 04's static content table values match Plan 01's i18n-budgets table values)
    - Test BET-9: BOOT_ERROR_CONTENT is `Readonly` at the TS type level — `BOOT_ERROR_CONTENT['handshake_failed'].it.title = 'X'` is a TS error (compile-time check via `// @ts-expect-error` marker)
  </behavior>
  <action>
    **1. `packages/g2-app/src/engine/boot-error-types.ts`:**

    Module JSDoc cites 04b-CONTEXT.md §Area 6 + 04B-UI-SPEC.md §3.3 + 04B-RESEARCH.md §Approach 4.

    Exports:
    - `export type BootErrorState = 'handshake_failed' | 'version_mismatch' | 'no_character' | 'bridge_unreachable' | 'token_expired'`
    - `export type BootErrorLocale = 'it' | 'en' | 'de'`
    - `export interface BootErrorContent { readonly title: string; readonly hintLine1: string; readonly hintLine2: string; readonly closeAnnotation: string }`
    - `export const BOOT_ERROR_CONTENT: Readonly<Record<BootErrorState, Readonly<Record<BootErrorLocale, BootErrorContent>>>>` — POPULATED VERBATIM from the table in this plan's <interfaces> block. Every string copied character-for-character including non-ASCII.

    Use `as const` on the literal to lock readonly at compile time. JSDoc on every field documenting the 24/50/14 char budgets per UI-SPEC §4.3.

    **2. `packages/g2-app/src/engine/__tests__/boot-error-types.test.ts`:**

    Vitest test file with 9+ tests (BET-1..BET-9). Group with describe blocks per concern (state enum coverage, locale coverage, width budgets, cross-consistency vs HUD_WIDTH_BUDGETS).

    Use a `for (const state of Object.keys(BOOT_ERROR_CONTENT)) for (const locale of ['it','en','de'])` loop to assert completeness (BET-4 + BET-5 + BET-6 in one nested iteration).

    Import HUD_WIDTH_BUDGETS from `../../status-hud/i18n-budgets.js` to verify cross-consistency (BET-8) — Plan 01 landed those keys; this test catches any drift between the two static tables.

    Constraints:
    - INV-4 JSDoc on every public export.
    - boot-error-types.ts is a pure data module (no I/O, no runtime imports beyond TS types).
    - Width budget consistency: BOOT_ERROR_CONTENT values MUST fit the corresponding HUD_WIDTH_BUDGETS max from Plan 01.
    - `pnpm typecheck && pnpm lint:ci` exit 0.
    - This plan does NOT modify i18n-budgets.ts (Plan 01 already did).
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/boot-error-types.test.ts && grep -c 'BOOT_ERROR_CONTENT' packages/g2-app/src/engine/boot-error-types.ts && grep -c "'HANDSHAKE FALLITO'" packages/g2-app/src/engine/boot-error-types.ts && grep -c "'VERSIONE INCOMPATIBILE'" packages/g2-app/src/engine/boot-error-types.ts && grep -c "'KEIN CHARAKTER'" packages/g2-app/src/engine/boot-error-types.ts && grep -c 'BootErrorState' packages/g2-app/src/engine/boot-error-types.ts && grep -cE 'BET-0[1-9]' packages/g2-app/src/engine/__tests__/boot-error-types.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Test file green with 9+ tests; boot-error-types.ts contains BOOT_ERROR_CONTENT with all 5 state × 3 locale × 4 field entries; cross-consistency with HUD_WIDTH_BUDGETS verified; test discriminator markers BET-01..BET-09 grep-match; typecheck + lint:ci exit 0; i18n-budgets.ts UNCHANGED.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: boot-error-layer.ts + boot-error-dispatch.ts + 10 INV-1 fixtures (rendering + dispatch + character-perfect ASCII)</name>
  <read_first>
    - packages/g2-app/src/engine/boot-error-types.ts (Task 1 output — BOOT_ERROR_CONTENT lookup table)
    - packages/g2-app/src/engine/capability-handshake.ts (full file — HandshakeError class + .code values: 'parse_failed' | 'schema_failed' | 'timeout' | 'transport_error')
    - packages/g2-app/src/engine/layer-types.ts (post-Plan-01 — Layer interface, LayerManagerError class)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §5.1 through §5.10 (10 boot-error fixtures verbatim, each 96×24)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q3 (full exception → state mapping table)
    - packages/shared-render/src/fixtures/glyph-scene.boot.txt (96×24 boot page outer frame the boot-error fixtures share)
  </read_first>
  <files>packages/g2-app/src/engine/boot-error-layer.ts, packages/g2-app/src/engine/boot-error-dispatch.ts, packages/g2-app/src/engine/__tests__/boot-error-layer.test.ts, packages/g2-app/src/engine/__tests__/boot-error-dispatch.test.ts, packages/shared-render/src/fixtures/boot-error.handshake-failed.it.txt, packages/shared-render/src/fixtures/boot-error.handshake-failed.en.txt, packages/shared-render/src/fixtures/boot-error.version-mismatch.it.txt, packages/shared-render/src/fixtures/boot-error.version-mismatch.en.txt, packages/shared-render/src/fixtures/boot-error.no-character.it.txt, packages/shared-render/src/fixtures/boot-error.no-character.en.txt, packages/shared-render/src/fixtures/boot-error.bridge-unreachable.it.txt, packages/shared-render/src/fixtures/boot-error.bridge-unreachable.en.txt, packages/shared-render/src/fixtures/boot-error.token-expired.it.txt, packages/shared-render/src/fixtures/boot-error.token-expired.en.txt</files>
  <behavior>
    boot-error-layer tests:
    - Test BEL-1: `new BootErrorLayer(bridge, 'handshake_failed', 'it').id === 'boot-error'`
    - Test BEL-2: BootErrorLayer.getCaptureContainer is undefined (no capture provider)
    - Test BEL-3: BootErrorLayer.getContainerCount() returns { image: 0, text: 1 }
    - Test BEL-4: BootErrorLayer.draw() calls bridge.textContainerUpgrade exactly once with containerName 'boot-error-block'; the content matches the 8-row panel format (top border + title + blank + 2 hints + blank + close + bottom border, each inner row 60 chars wide including `│ ... │`)
    - Test BEL-5: For state='handshake_failed' locale='it', rendered title row contains 'HANDSHAKE FALLITO'; for locale='en' contains 'HANDSHAKE FAILED'
    - Test BEL-6: For state='bridge_unreachable' locale='de', title row contains 'BRIDGE NICHT ERREICHBAR'
    - Test BEL-7: BootErrorLayer.destroy() is idempotent (no throw on second call); does NOT call bridge.textContainerUpgrade
    - Test BEL-8 (matchAsciiFixture for each of 10 fixtures): for each {state, locale} ∈ 5 × 2 set, build the full page (outer 96×24 frame + BootErrorLayer panel content) and matchAsciiFixture against the corresponding fixture file. Parametric loop produces 10 it() blocks.

    boot-error-dispatch tests:
    - Test BED-1: bootErrorFromException(new HandshakeError('transport_error', 'msg')) === 'bridge_unreachable'
    - Test BED-2: bootErrorFromException(new HandshakeError('parse_failed', 'msg')) === 'handshake_failed'
    - Test BED-3: bootErrorFromException(new HandshakeError('schema_failed', 'msg')) === 'handshake_failed'
    - Test BED-4: bootErrorFromException(new HandshakeError('timeout', 'msg')) === 'handshake_failed'
    - Test BED-5: bootErrorFromException(new LayerManagerError('capture_invariant_violated', 'msg')) === 'handshake_failed'
    - Test BED-6: bootErrorFromException(new Error('WebSocket error before open')) === 'bridge_unreachable'
    - Test BED-7: bootErrorFromException(new Error('WebSocket close 1006 abnormal')) === 'bridge_unreachable'
    - Test BED-8: bootErrorFromException(new Error('proto_chosen=evf-v0 not supported')) === 'version_mismatch'
    - Test BED-9: bootErrorFromException(new Error('bridgeFactory rejected')) === 'bridge_unreachable'
    - Test BED-10: bootErrorFromException(new Error('no actor assigned')) === 'no_character'
    - Test BED-11: bootErrorFromException(new Error('401 Unauthorized')) === 'token_expired'
    - Test BED-12: bootErrorFromException(undefined) === 'handshake_failed' (default catch-all); console.warn called once
    - Test BED-13: bootErrorFromException({}) === 'handshake_failed' (no message field — catch-all); console.warn called once
    - Test BED-14: bootErrorFromException(new Error('unrelated random error')) === 'handshake_failed'

    INV-1 fixtures (BEL-8 covers all 10 via parametric test):
    - Each fixture is 96×24 (verified by awk length check in verify step)
    - Each fixture contains the correct title literal (e.g., 'HANDSHAKE FALLITO' in boot-error.handshake-failed.it.txt)
    - Each fixture has the centered panel `┌──...──┐` left edge at col 18, right edge at col 77 (60-char panel)
    - Each fixture preserves the outer `╔═...═╗` frame
  </behavior>
  <action>
    **1. `packages/g2-app/src/engine/boot-error-layer.ts`:**

    Module JSDoc cites 04B-UI-SPEC.md §3.3 + 04B-RESEARCH.md §Approach 4 + ADR-0009 Amendment 1 (replaces StatusHudLayer in error path).

    Imports:
    ```
    import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
    import type { Layer } from './layer-types.js';
    import { BOOT_ERROR_CONTENT, type BootErrorState, type BootErrorLocale } from './boot-error-types.js';
    ```

    Exports:
    - `export const BOOT_ERROR_CONTAINER_NAME = 'boot-error-block' as const`
    - `export class BootErrorLayer implements Layer` with constructor `(bridge, state, locale)`, methods `draw`, `destroy`, `getContainerCount`.

    Implementation of `draw()` (Option B — panel frame INCLUDED in container content):
    ```
    async draw(): Promise<void> {
      const c = BOOT_ERROR_CONTENT[this.state][this.locale];
      const inner = (s: string): string => s.padEnd(58).slice(0, 58);
      const innerWrap = (s: string): string => `│ ${inner(s)} │`;
      const lines = [
        `┌${'─'.repeat(58)}┐`,            // top border (60 chars)
        innerWrap(c.title),                  // row 1
        innerWrap(''),                       // row 2 blank
        innerWrap(c.hintLine1),              // row 3
        innerWrap(c.hintLine2),              // row 4
        innerWrap(''),                       // row 5 blank
        innerWrap(c.closeAnnotation),        // row 6
        `└${'─'.repeat(58)}┘`,            // bottom border
      ];
      const content = lines.join('\n');
      await this.bridge.textContainerUpgrade(new TextContainerUpgrade({ containerName: BOOT_ERROR_CONTAINER_NAME, content }));
    }
    ```

    Note: the OUTER 96×24 page frame is part of the boot page schema (Phase 4a `createBootPage()`) — BootErrorLayer fills the centered panel only. The fixture in §5.1 shows BOTH the outer page frame AND the inner panel — the fixture is the FULL page; the layer test composes the page (outer frame + panel content from BootErrorLayer).

    INV-4 JSDoc on every export. `// TODO(Phase-6): wire [X] close gesture to bootEngine.retry() via panel-gesture-bus` comment near the closeAnnotation render path.

    **2. `packages/g2-app/src/engine/boot-error-dispatch.ts`:**

    Module JSDoc cites 04B-RESEARCH.md §Q3 dispatch source map verbatim.

    Imports:
    ```
    import { HandshakeError } from './capability-handshake.js';
    import { LayerManagerError } from './layer-types.js';
    import type { BootErrorState } from './boot-error-types.js';
    ```

    Exports a single function. Implementation:
    ```
    export function bootErrorFromException(err: unknown): BootErrorState {
      if (err instanceof HandshakeError) {
        if (err.code === 'transport_error') return 'bridge_unreachable';
        return 'handshake_failed';
      }
      if (err instanceof LayerManagerError) {
        return 'handshake_failed';
      }
      if (typeof err === 'object' && err !== null && 'message' in err) {
        const msg = String((err as { message: unknown }).message);
        if (msg.includes('WebSocket') && msg.includes('1006')) return 'bridge_unreachable';
        if (msg.includes('WebSocket error before open')) return 'bridge_unreachable';
        if (msg.includes('proto_chosen')) return 'version_mismatch';
        if (msg.includes('bridgeFactory')) return 'bridge_unreachable';
        if (msg.toLowerCase().includes('no actor') || msg.toLowerCase().includes('no character')) return 'no_character';
        if (msg.includes('TokenExpired') || msg.includes('401') || msg.includes('403')) return 'token_expired';
      }
      console.warn('[boot-error-dispatch] unknown exception shape — defaulting to handshake_failed', err);
      return 'handshake_failed';
    }
    ```

    INV-4 JSDoc explaining matching strategy + catch-all default.

    **3. Ten fixture files in `packages/shared-render/src/fixtures/`:**

    Copy the EXACT ASCII grids from UI-SPEC §5.1 through §5.10. Character precision is mandatory.

    Geometry verification:
    - Each file 96 chars wide × 24 rows tall
    - Outer frame `╔══...══╗` row 0 (96 chars), `╚══...══╝` row 23
    - Outer side borders `║` at col 0 and col 95 on every row
    - Inner panel `┌──...──┐` row 9 (1-indexed row 10 in the §5 fixtures), left edge col 18, right edge col 77
    - Panel content rows 10-14 contain `│ TITLE_OR_HINT_OR_CLOSE │`
    - Inner panel bottom border `└──...──┘` row 15

    Titles per state×locale (verbatim from UI-SPEC §3.3 table). Hints + close annotations per UI-SPEC §3.3.

    Trailing newline. No CR chars.

    **4. Test files:**

    `packages/g2-app/src/engine/__tests__/boot-error-layer.test.ts` — implements BEL-1..BEL-8. BEL-8 is parametric: `for (const state of states) for (const locale of ['it','en']) { it(`renders ${state} ${locale} fixture`, ...) }` — 10 it() blocks. Each builds the full page (outer frame from `glyph-scene.boot.txt` baseline OR composed inline) + BootErrorLayer panel content, then matchAsciiFixture.

    The full-page helper `buildBootErrorPage(state, locale): AsciiGrid` lives in the test file (or in `__tests__/test-helpers/`). It loads the 96×24 outer frame baseline and overlays the BootErrorLayer panel content at rows 9-15 cols 18-77.

    `packages/g2-app/src/engine/__tests__/boot-error-dispatch.test.ts` — implements BED-1..BED-14 (14 tests). Use `vi.spyOn(console, 'warn').mockImplementation(() => {})` for BED-12, BED-13 to silence + assert.

    Constraints:
    - Fixtures: 96-char uniform width verified by awk in verify step.
    - INV-4 JSDoc on all public exports.
    - boot-error-dispatch.ts is PURE (no I/O, no side effects beyond console.warn).
    - BootErrorLayer.draw() consumes BOOT_ERROR_CONTENT at render time (no caching).
    - `pnpm typecheck && pnpm lint:ci` exit 0.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/boot-error-layer.test.ts src/engine/__tests__/boot-error-dispatch.test.ts && test -f packages/shared-render/src/fixtures/boot-error.handshake-failed.it.txt && test -f packages/shared-render/src/fixtures/boot-error.token-expired.en.txt && awk '{ if (length($0) > 0 && length($0) != 96) { print "FAIL: " FILENAME " row " NR " width " length($0); exit 1 } } END { print "OK" }' packages/shared-render/src/fixtures/boot-error.handshake-failed.it.txt packages/shared-render/src/fixtures/boot-error.version-mismatch.en.txt packages/shared-render/src/fixtures/boot-error.bridge-unreachable.it.txt && grep -c 'HANDSHAKE FALLITO' packages/shared-render/src/fixtures/boot-error.handshake-failed.it.txt && grep -c 'BRIDGE UNREACHABLE' packages/shared-render/src/fixtures/boot-error.bridge-unreachable.en.txt && grep -c 'export class BootErrorLayer' packages/g2-app/src/engine/boot-error-layer.ts && grep -c 'export function bootErrorFromException' packages/g2-app/src/engine/boot-error-dispatch.ts && grep -c 'implements Layer' packages/g2-app/src/engine/boot-error-layer.ts && grep -cE 'BED-(0[1-9]|1[0-4])' packages/g2-app/src/engine/__tests__/boot-error-dispatch.test.ts && grep -cE 'BEL-0[1-8]' packages/g2-app/src/engine/__tests__/boot-error-layer.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Two test files green (BEL: 8+ tests, BED: 14 tests); all 10 fixture files exist with uniform 96-char width; boot-error-layer.ts + boot-error-dispatch.ts exist with documented exports; BootErrorLayer implements Layer; fixture grep gates pass; typecheck + lint:ci exit 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: boot-engine-error-wrapper.ts (new file) + integration tests (5 dispatch scenarios → BootErrorLayer mount + rethrow)</name>
  <read_first>
    - packages/g2-app/src/internal/boot-engine-core.ts (post-Plan-02 — CANONICAL exports verified 2026-05-15: `_bootEngineCore` line 191, `BootEngineOpts` line 67, `TestingDependencies` line 86, `BootEngineHandle` line 100. Plan 04 imports these names VERBATIM but does NOT modify the file.)
    - packages/g2-app/src/index.ts (current public surface)
    - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts (post-Plan-02 — Plan 04 does NOT modify; the existing harness pattern is informative reference only)
    - packages/g2-app/src/engine/capability-handshake.ts (HandshakeError class; which boot step throws each variant)
    - packages/g2-app/src/engine/boot-error-dispatch.ts (Task 2 output)
    - packages/g2-app/src/engine/boot-error-layer.ts (Task 2 output)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 4 "Integration points with Phase 4a code" (try/catch wrapper around _bootEngineCore)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-02-SUMMARY.md (Plan 02's boot-engine-core.ts changes; Plan 04 is layered ON TOP, does NOT touch Plan 02's file)
  </read_first>
  <files>packages/g2-app/src/engine/boot-engine-error-wrapper.ts, packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts</files>
  <behavior>
    bootEngineWithErrorUi tests (BOOT-ERR-INT-01..07):
    - Test BOOT-ERR-INT-01: Inject deps with a stubbed `handshakeFn` (or wsFactory + bridgeFactory combination) that throws HandshakeError('transport_error', 'msg') from performCapabilityHandshake → bootEngineWithErrorUi mounts BootErrorLayer state='bridge_unreachable' (verified by bridge.textContainerUpgrade mock receiving BOOT_ERROR_CONTAINER_NAME content containing 'BRIDGE UNREACHABLE') AND rejects with HandshakeError('transport_error') (verified via expect(...).rejects.toThrow)
    - Test BOOT-ERR-INT-02: HandshakeError('parse_failed') → 'handshake_failed' state mounted + rethrow
    - Test BOOT-ERR-INT-03: HandshakeError('timeout') → 'handshake_failed' state mounted + rethrow
    - Test BOOT-ERR-INT-04: WS close event with code 1006 (abnormal) during awaitWsOpen → 'bridge_unreachable' state mounted + rethrow
    - Test BOOT-ERR-INT-05: Synthesize a thrown error with message 'proto_chosen=evf-v0 mismatch' → 'version_mismatch' state mounted + rethrow

    Each error-path test verifies:
    1. bridge.textContainerUpgrade was called with containerName === BOOT_ERROR_CONTAINER_NAME (BootErrorLayer mounted)
    2. Content contains the expected title string for (state, opts.locale)
    3. The promise rejects with the ORIGINAL exception (HandshakeError instance, NOT a wrapper error; checked via `await expect(promise).rejects.toThrow(HandshakeError)`)
    4. console.warn was called once with '[boot-engine] boot failed with state' phrase + state literal

    - Test BOOT-ERR-INT-06: bootEngineWithErrorUi happy path (no exception in _bootEngineCore) → returns the BootEngineHandle from _bootEngineCore unchanged; BootErrorLayer NOT mounted; promise resolves
    - Test BOOT-ERR-INT-07: Double-failure case — _bootEngineCore throws AND the BootErrorLayer mount also throws (e.g., bridge.textContainerUpgrade rejects) → console.error logged the render error; the promise rejects with the ORIGINAL exception (NOT the render error)
  </behavior>
  <action>
    **1. NEW file `packages/g2-app/src/engine/boot-engine-error-wrapper.ts`:**

    Module JSDoc cites 04B-RESEARCH.md §Approach 4 + ADR-0009 Amendment 1 + the rationale that Plan 04 puts this wrapper in a SEPARATE file (NOT in boot-engine-core.ts) to avoid Wave-2 file-overlap with Plan 02.

    Imports (canonical names verified against boot-engine-core.ts on 2026-05-15):
    ```
    import { _bootEngineCore, type BootEngineOpts, type TestingDependencies, type BootEngineHandle } from '../internal/boot-engine-core.js';
    import { bootErrorFromException } from './boot-error-dispatch.js';
    import { BootErrorLayer } from './boot-error-layer.js';
    ```

    Note the names: `BootEngineOpts` (NOT `BootEngineOptions`), `TestingDependencies` (NOT `BootEngineDeps`). These are the actual canonical exports — `grep -nE "^export interface (BootEngine|Testing)" packages/g2-app/src/internal/boot-engine-core.ts` returns lines 67 + 86 + 100 confirming.

    Exports (W-3 resolution: RETHROW on error path):
    ```
    export async function bootEngineWithErrorUi(
      opts: BootEngineOpts,
      deps?: TestingDependencies,
    ): Promise<BootEngineHandle> {
      try {
        return await _bootEngineCore(opts, deps);
      } catch (err) {
        const state = bootErrorFromException(err);
        console.warn(`[boot-engine] boot failed with state '${state}'`, err);
        try {
          // Acquire bridge: prefer deps.bridgeFactory; else import the SDK and call getInstance()
          const bridgeFactory = deps?.bridgeFactory ?? (async () => {
            const { EvenAppBridge } = await import('@evenrealities/even_hub_sdk');
            return EvenAppBridge.getInstance();
          });
          const bridge = await bridgeFactory();
          // Mount BootErrorLayer; bridge.textContainerUpgrade is the direct call (bypasses LayerManager.bundle)
          const layer = new BootErrorLayer(bridge, state, opts.locale);
          await layer.draw();
        } catch (renderErr) {
          console.error('[boot-engine] failed to render boot error UI', renderErr);
          // fall through; original cause is rethrown below
        }
        // W-3 resolution: ALWAYS rethrow the original cause. No degenerate BootEngineHandle is constructed.
        // The caller observes the rejected promise carrying the original error (HandshakeError / LayerManagerError / etc.)
        // AND sees the BootErrorLayer already rendered on the device — the UI is the visible side effect; the rejection
        // is the programmatic signal that the boot did not complete.
        throw err;
      }
    }
    ```

    **W-3 resolution (locked):** `bootEngineWithErrorUi` RETHROWS the original cause on the error path. NO degenerate BootEngineHandle is constructed. This:
    - Avoids the type-mismatch on `BootEngineHandle.rasterController` (no need to make the field optional in boot-engine-core.ts).
    - Avoids `@ts-expect-error` casts (clean strict-mode compilation).
    - Preserves the original exception for caller observability — Phase 6 retry handler can `catch (err)` and route on `err instanceof HandshakeError && err.code === 'token_expired'` etc.
    - Renders the BootErrorLayer best-effort BEFORE rethrowing so the player sees the panel even though the awaiter rejects.

    INV-4 JSDoc on bootEngineWithErrorUi explaining: (a) it does NOT modify boot-engine-core.ts; (b) the error path rethrows the original cause AFTER rendering the BootErrorLayer best-effort; (c) double-failure semantics — both the original cause AND the render error are surfaced via console.error + rethrow of the original.

    **2. `packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts`:**

    Test pattern (paraphrased — adjust to actual TestingDependencies shape after reading boot-engine-core.ts):

    ```
    describe('bootEngineWithErrorUi (BOOT-ERR-INT-*)', () => {
      it('BOOT-ERR-INT-01: HandshakeError transport_error → bridge_unreachable, then rethrow', async () => {
        const bridge = makeMockBridge();
        const ws = makeMockWs({ throwOnOpen: false });
        // Inject a handshakeFn that throws (if TestingDependencies supports it) OR mock performCapabilityHandshake at the module level via vi.mock
        vi.doMock('../capability-handshake.js', async (origImport) => {
          const orig = await origImport<typeof import('../capability-handshake.js')>();
          return { ...orig, performCapabilityHandshake: vi.fn().mockRejectedValue(new orig.HandshakeError('transport_error', 'simulated')) };
        });
        // Re-import bootEngineWithErrorUi after the mock
        const { bootEngineWithErrorUi } = await import('../boot-engine-error-wrapper.js');
        const opts = { bridgeUrl: 'wss://localhost', token: 'test', locale: 'en' as const };
        const deps = { bridgeFactory: async () => bridge, wsFactory: () => ws };
        // W-3: promise rejects with original cause
        await expect(bootEngineWithErrorUi(opts, deps)).rejects.toThrow('simulated');
        // BootErrorLayer was rendered best-effort
        const calls = (bridge.textContainerUpgrade as Mock).mock.calls;
        const bootErrorCall = calls.find(([payload]) => payload.containerName === 'boot-error-block');
        expect(bootErrorCall).toBeDefined();
        expect(bootErrorCall![0].content).toContain('BRIDGE UNREACHABLE');
        vi.doUnmock('../capability-handshake.js');
      });
      // ... BOOT-ERR-INT-02..07 same pattern
    });
    ```

    **Caveat:** module-mocking with `vi.doMock` requires careful import order; alternative is to extend `TestingDependencies` to inject `handshakeFn` as a test-only DI surface. If extending `TestingDependencies` is needed, Plan 04 may add the optional field IN BOOT-ENGINE-CORE.TS — but that conflicts with Plan 02's modifications. **Resolution: use `vi.doMock` pattern.** No `TestingDependencies` extension; no boot-engine-core.ts modification.

    Implement all 7 BOOT-ERR-INT-* tests. Use `vi.spyOn(console, 'warn')` and `vi.spyOn(console, 'error')` to verify telemetry. For BOOT-ERR-INT-07, mock bridge.textContainerUpgrade to reject AFTER the first call succeeds (or always reject) to simulate the BootErrorLayer.draw() failure path; then assert `await expect(bootEngineWithErrorUi(...)).rejects.toThrow(<ORIGINAL ERROR>)` — the assertion is the original cause, NOT the render error.

    Constraints:
    - Plan 04 MUST NOT modify boot-engine-core.ts. The wrapper is a new file (`boot-engine-error-wrapper.ts`); the inner `_bootEngineCore` is imported.
    - Test file uses `vi.doMock` for `capability-handshake` mocking (Wave-2-safe — no shared file modification).
    - JSDoc on bootEngineWithErrorUi.
    - The error path RETHROWS the original cause (W-3 lock); no degenerate BootEngineHandle construction.
    - Test discriminators 'BOOT-ERR-INT-01' through 'BOOT-ERR-INT-07' must appear in test it() names.
    - `pnpm typecheck && pnpm lint:ci` exit 0.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/boot-engine-error-wrapper.test.ts && grep -c 'export async function bootEngineWithErrorUi' packages/g2-app/src/engine/boot-engine-error-wrapper.ts && grep -c 'bootErrorFromException' packages/g2-app/src/engine/boot-engine-error-wrapper.ts && grep -c 'new BootErrorLayer' packages/g2-app/src/engine/boot-engine-error-wrapper.ts && grep -c '_bootEngineCore' packages/g2-app/src/engine/boot-engine-error-wrapper.ts && grep -c 'BootEngineOpts' packages/g2-app/src/engine/boot-engine-error-wrapper.ts && grep -c 'TestingDependencies' packages/g2-app/src/engine/boot-engine-error-wrapper.ts && ! grep -E 'BootEngineOptions|BootEngineDeps' packages/g2-app/src/engine/boot-engine-error-wrapper.ts && grep -cE 'BOOT-ERR-INT-0[1-7]' packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts && grep -c 'rejects.toThrow' packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    boot-engine-error-wrapper.test.ts green with BOOT-ERR-INT-01..07 (7 tests); boot-engine-error-wrapper.ts exports bootEngineWithErrorUi which imports `_bootEngineCore`, `BootEngineOpts`, `TestingDependencies` (CANONICAL names — the grep gate `! grep -E 'BootEngineOptions|BootEngineDeps'` returns success); error path rethrows original cause (verified via `rejects.toThrow`); BOOT-ERR-INT-01..07 grep-match; typecheck + lint:ci exit 0; boot-engine-core.ts NOT modified by this plan.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| External boot-engine exceptions → bootErrorFromException | Unknown exception shapes must default safely; no rethrow inside dispatch |
| Foundry i18n translation strings → BOOT_ERROR_CONTENT | Static lookup table compiled at build time; no runtime templating from external strings |
| BootErrorLayer at z=1 replacing StatusHudLayer in error path | Error UI is a special layout that bypasses LayerManager's main-page capture invariant; documented |
| bootEngineWithErrorUi wraps _bootEngineCore | Best-effort error rendering must not throw beyond the wrapper unless BOTH the original cause AND the error UI render fail. The wrapper RETHROWS the original cause on error paths (W-3 locked decision). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4b-04-01 | T | bootErrorFromException unknown exception shape | mitigate | Catch-all default returns 'handshake_failed'; console.warn logged. No throw. BED-12/BED-13/BED-14 verify. |
| T-4b-04-02 | T | i18n content injection via translation catalog | mitigate | BOOT_ERROR_CONTENT static `as const` lookup table; no runtime templating; width-budgeted to 24/50 chars per UI-SPEC §4.3 |
| T-4b-04-03 | D | Boot error path leaves stale layers mounted | accept | Wrapper does NOT clean up — it mounts BootErrorLayer over whatever exists. Documented; Phase 6 retry mounts fresh layers. |
| T-4b-04-04 | T | BootErrorLayer mounted without capture provider | mitigate | Documented as special layout outside LayerManager's main-page contract. BootErrorLayer.draw() calls bridge.textContainerUpgrade directly; does NOT participate in bundle()'s _assertCaptureInvariant. |
| T-4b-04-05 | I | Boot error UI displays error type info to player | accept | Each state is intentionally informative (recovery hint requires knowing which gate failed). No PII; no secrets in messages. |
| T-4b-04-06 | D | Double-failure: original exception + BootErrorLayer render both fail | mitigate | Inner try/catch around bridge.textContainerUpgrade catches render errors; console.error logs the render error; original exception is RETHROWN (W-3 locked) — the awaiter observes the original error, not the render error. BOOT-ERR-INT-07 verifies. |
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 with boot-error-types.test.ts (9+ tests), boot-error-layer.test.ts (8+ tests), boot-error-dispatch.test.ts (14 tests), boot-engine-error-wrapper.test.ts (7 tests) all green
- `pnpm typecheck && pnpm lint:ci` exit 0
- 10 fixture files exist with uniform 96-char width
- BootErrorLayer implements Layer; bootErrorFromException maps all known exception classes
- BOOT_ERROR_CONTENT covers 5 states × 3 locales (DE entries present even though DE fixtures NOT shipped)
- bootEngineWithErrorUi imports `_bootEngineCore`, `BootEngineOpts`, `TestingDependencies` (CANONICAL names) from boot-engine-core.ts WITHOUT modifying it
- `! grep -E 'BootEngineOptions|BootEngineDeps' packages/g2-app/src/engine/boot-engine-error-wrapper.ts` returns success (NF-1 regression-class prevention)
- bootEngineWithErrorUi error path RETHROWS the original cause (W-3 locked) — verified via `rejects.toThrow` in BOOT-ERR-INT-01..05 + BOOT-ERR-INT-07
- No regressions: Phase 4a tests + Plan 02 tests still pass
- Plan 04 files_modified contains ZERO entries shared with Plan 03's files_modified OR Plan 06's files_modified (verified via frontmatter diff)
- i18n-budgets.ts is UNCHANGED in Plan 04 (Plan 01's domain)
- boot-engine-core.ts is UNCHANGED in Plan 04 (Plan 02's domain — Plan 04 depends_on includes 04b-02)
</verification>

<success_criteria>
Plan 04 closes when:
- BOOT-01 fully addressed software-side: 5 distinct boot error states each render a centered panel with title + recovery hint + [X] close annotation per UI-SPEC §3.3
- Each of the 5 SC #4 states is provably reachable via bootErrorFromException dispatch (BED-01..BED-14)
- 10 INV-1 fixtures (5 states × IT/EN) committed; DE fixtures deferred per UI-SPEC §9.5 (best-effort)
- bootEngineWithErrorUi wraps the existing _bootEngineCore so every reachable exception path now renders error UI AND rethrows the original cause for caller observability — verified by BOOT-ERR-INT-01..07
- Canonical type names used VERBATIM: `BootEngineOpts` + `TestingDependencies` + `BootEngineHandle` (NF-1 regression-class prevention, verified via grep gate)
- Hardware verification (all 5 states on real G2 with live bridge disconnect simulation) deferred to ADR-0005 Branch A human_needed gate
- Phase 6 [X] close gesture wiring is a TODO(ADR-0009) hook — Plan 04 ships the visual annotation only
- Wave-2 parallelism preserved: zero files_modified overlap with Plan 03 OR Plan 06; no modifications to i18n-budgets.ts or boot-engine-core.ts
</success_criteria>

<output>
After completion, create `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-04-SUMMARY.md` capturing:
- Final BootErrorState enum + BOOT_ERROR_CONTENT table (5×3 = 15 entries)
- Test counts: 9+ in boot-error-types.test.ts + 8+ in boot-error-layer.test.ts + 14 in boot-error-dispatch.test.ts + 7 in boot-engine-error-wrapper.test.ts
- 10 fixture file paths
- Option B confirmed: panel frame included in BootErrorLayer's container content (not in page schema)
- W-3 confirmation: error path RETHROWS the original cause AFTER best-effort BootErrorLayer.draw(); no degenerate BootEngineHandle constructed (rationale: avoids type-mismatch on rasterController + cleaner caller semantics)
- B-1 confirmation: canonical type names `BootEngineOpts` + `TestingDependencies` used VERBATIM; grep gate `! grep -E 'BootEngineOptions|BootEngineDeps'` succeeded
- Whether vi.doMock was used for handshake error injection (locked YES per W-3)
- The exact bootErrorFromException catch-all default rationale ('handshake_failed' as least-informative-but-always-renderable)
- Phase 6 wiring hint: `[X] close gesture` is a `// TODO(ADR-0009)` in boot-error-layer.ts
- Wave-2 parallelism confirmation: zero files_modified overlap with Plan 03 OR Plan 06; i18n-budgets.ts and boot-engine-core.ts UNMODIFIED in this plan
- Confirmation that `boot-engine-error-wrapper.ts` lives in `packages/g2-app/src/engine/` (NEW FILE, not in `internal/`) to keep the public surface clean
</output>
</content>
</invoke>