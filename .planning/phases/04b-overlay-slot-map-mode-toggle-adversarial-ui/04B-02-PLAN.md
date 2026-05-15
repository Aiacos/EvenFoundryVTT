---
phase: 4b
plan: 02
type: execute
wave: 1
depends_on: ["04b-01"]
files_modified:
  - packages/g2-app/src/engine/map-mode-toggle.ts
  - packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts
autonomous: true
requirements: [MAP-05]
subsystem: g2-app
user_setup: []
tags: [g2-app, engine, map-mode, persistence, even-hub, wave-1, boot-engine]
must_haves:
  truths:
    - "toggleMapMode(bridge, layerManager, rasterController, newMode) applies the new mode in-memory FIRST (layerManager.setMapMode + rasterController.setBleVerdict for 'raster'|'glyph'; no setBleVerdict for 'auto') AND THEN persists via bridge.setLocalStorage('view.map.mode', newMode) — persistence is best-effort"
    - "setLocalStorage failure (resolves false OR throws) does NOT roll back the in-memory toggle — the live session always succeeds; only the next-session boot fallback is affected (Q8 failure-mode policy)"
    - "loadPersistedMapMode(bridge) returns 'auto' on missing key, on invalid stored value, or on getLocalStorage rejection — never throws"
    - "boot-engine-core.ts step 9 reads the persisted map mode AFTER the BLE probe verdict; if the persisted value is 'raster' or 'glyph', it OVERRIDES the BLE verdict (calls rasterController.setBleVerdict + layerManager.setMapMode with the persisted value). If the persisted value is 'auto', the BLE verdict wins."
    - "Original BLE verdict is captured before any override so a future toggle back to 'auto' (Pitfall 7) can restore it; for Phase 4b the original verdict is stored in a closure variable inside boot-engine-core and threaded into the runtime via an exported reference (no new global state)"
    - "scene-renderer-smoke.test.ts gets a new SR-11 case: synthesize bridge.getLocalStorage returning 'glyph' BEFORE the BLE probe, run bootEngine, and assert rasterController.setBleVerdict('glyph') was called (override path verified)"
    - "STORAGE_KEY constant 'view.map.mode' is exported from map-mode-toggle.ts and matches the format Phase 2 hub-polyfill uses (dot-separated, ASCII alphanumeric) per Q8 key-format constraints"
  artifacts:
    - path: "packages/g2-app/src/engine/map-mode-toggle.ts"
      provides: "toggleMapMode + loadPersistedMapMode + STORAGE_KEY const + MapMode re-export; best-effort persistence pattern; @internal dev hook documented"
      exports: ["toggleMapMode", "loadPersistedMapMode", "STORAGE_KEY"]
    - path: "packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts"
      provides: "Unit tests covering: in-memory toggle, persistence round-trip, failure-mode fallback ('auto'), key validation, invalid stored value defensive fallback"
      contains: "loadPersistedMapMode"
    - path: "packages/g2-app/src/internal/boot-engine-core.ts"
      provides: "Step 9 extended: after probeBleThroughput, await loadPersistedMapMode(bridge) and override the verdict if 'raster' or 'glyph'; capture original BLE verdict in a closure for future toggleMapMode('auto') restoration"
      contains: "loadPersistedMapMode"
    - path: "packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts"
      provides: "Extended with SR-11 (boot override path: persisted 'glyph' overrides BLE 'auto' verdict)"
      contains: "SR-11"
  key_links:
    - from: "packages/g2-app/src/engine/map-mode-toggle.ts"
      to: "@evenrealities/even_hub_sdk EvenAppBridge.setLocalStorage / getLocalStorage"
      via: "Direct bridge calls (NOT via hub-polyfill — Pitfall 1)"
      pattern: "bridge\\.(setLocalStorage|getLocalStorage)"
    - from: "packages/g2-app/src/engine/map-mode-toggle.ts"
      to: "packages/g2-app/src/engine/layer-manager.ts (LayerManager.setMapMode + MapMode type)"
      via: "imports MapMode union and calls setMapMode on the injected LayerManager"
      pattern: "layerManager\\.setMapMode|MapMode"
    - from: "packages/g2-app/src/engine/map-mode-toggle.ts"
      to: "packages/g2-app/src/raster/raster-controller.ts (RasterController.setBleVerdict)"
      via: "calls setBleVerdict for 'raster' | 'glyph' only (not 'auto')"
      pattern: "rasterController\\.setBleVerdict"
    - from: "packages/g2-app/src/internal/boot-engine-core.ts"
      to: "packages/g2-app/src/engine/map-mode-toggle.ts"
      via: "imports loadPersistedMapMode for step-9 override read"
      pattern: "loadPersistedMapMode"

threat_model:
  trust_boundaries:
    - description: "Even Hub kv store (bridge.getLocalStorage) → toggleMapMode → in-memory state — untrusted stored value must be whitelist-validated before being applied"
    - description: "bridge.setLocalStorage Promise → toggle persistence — failures must NOT corrupt in-memory state"
  threats:
    - id: "T-4b-02-01"
      category: "T"
      component: "loadPersistedMapMode reading bridge.getLocalStorage('view.map.mode')"
      disposition: "mitigate"
      mitigation_plan: "Strict whitelist check `raw === 'raster' || raw === 'glyph' || raw === 'auto'` before returning; any other value (including the SDK empty-string-for-missing-key behavior) returns 'auto' (safe default). getLocalStorage rejection is caught and logged; returns 'auto'."
    - id: "T-4b-02-02"
      category: "D"
      component: "setLocalStorage rejection corrupting in-memory toggle"
      disposition: "mitigate"
      mitigation_plan: "Best-effort policy (Q8): in-memory state mutation happens FIRST; setLocalStorage runs AFTER inside its own try/catch. Toggle never rolls back on persistence failure. Verified by unit test simulating setLocalStorage throw."
    - id: "T-4b-02-03"
      category: "T"
      component: "Forbidden characters in storage key"
      disposition: "mitigate"
      mitigation_plan: "STORAGE_KEY is a module-level constant 'view.map.mode' (dot-separated ASCII alphanumeric only — matches Phase 2 hub-polyfill key format). No interpolation, no user input. Static."
---

<objective>
Ship the runtime `toggleMapMode(newMode)` function + Even Hub `setLocalStorage` persistence + `bootEngine` step-9 boot read-back integration. This is the MAP-05 toggle-portion that Plan 01 left open. Phase 6 Quick Action `[M]` will wire its tap handler to `toggleMapMode` without touching this code again.

Purpose: Close MAP-05 SC #2 software-side ("Quick Action [M] Map ctrl hot-swaps raster ↔ glyph at runtime without re-handshake; setting view.map.mode persists device-local"). Phase 6 finishes the user-facing gesture wiring; Phase 4b's commitment is the toggle primitive + persistence policy + boot read-back.

Output: 1 new source module (map-mode-toggle.ts) + 1 new test file (map-mode-toggle.test.ts) + boot-engine-core.ts extended with the step-9 override read + scene-renderer-smoke.test.ts extended with the SR-11 override-path assertion. No new dependencies. `pnpm typecheck && pnpm lint:ci && pnpm --filter @evf/g2-app test --run` exit 0.
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
@packages/g2-app/src/engine/layer-manager.ts
@packages/g2-app/src/raster/raster-controller.ts
@packages/g2-app/src/internal/boot-engine-core.ts
@packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts
@packages/g2-app/src/hub-polyfill.ts

<interfaces>
<!-- Key types this plan consumes (post-Plan-01) and exposes. -->

From @evenrealities/even_hub_sdk (canonical SDK index.d.ts):
- EvenAppBridge.setLocalStorage(key: string, value: string): Promise<boolean>  // resolves true on success, false on host rejection; NEVER throws on simulator
- EvenAppBridge.getLocalStorage(key: string): Promise<string>  // resolves '' (empty string, NOT null) on missing key

From packages/g2-app/src/engine/layer-manager.ts:
- export type MapMode = 'auto' | 'raster' | 'glyph'
- LayerManager.setMapMode(mode: MapMode): void  // pure state mutation, no bridge call
- LayerManager.getMapMode(): MapMode

From packages/g2-app/src/raster/raster-controller.ts (RasterControllerLike contract):
- setBleVerdict(v: 'raster' | 'glyph'): void  // accepts ONLY 'raster' or 'glyph' (NOT 'auto')
- getBleVerdict(): 'raster' | 'glyph' | null

From packages/g2-app/src/internal/boot-engine-core.ts (BEFORE Plan 02):
- Line ~236: `const verdict = probeBleThroughput(0, 0);`
- Line ~237-239: `if (verdict !== 'auto') { rasterController.setBleVerdict(verdict); }`
- Line ~240: `layerManager.setMapMode(verdict === 'auto' ? 'auto' : verdict);`

Plan 02 inserts BETWEEN line 240 and line 242 (the rasterController construction at line 230 stays; the verdict + setMapMode lines stay; the override is appended):
```
// Phase 4b: persisted map mode override (MAP-05 boot read-back).
const persistedMode = await loadPersistedMapMode(bridge);
const originalBleVerdict = verdict;  // captured for future 'auto' restoration (Pitfall 7)
if (persistedMode === 'raster' || persistedMode === 'glyph') {
  rasterController.setBleVerdict(persistedMode);
  layerManager.setMapMode(persistedMode);
}
// If persistedMode === 'auto', the BLE verdict already applied above wins.
```

NEW exports from packages/g2-app/src/engine/map-mode-toggle.ts (Plan 02):
- const STORAGE_KEY = 'view.map.mode' as const
- export async function loadPersistedMapMode(bridge: EvenAppBridge): Promise<MapMode>
- export async function toggleMapMode(
    bridge: EvenAppBridge,
    layerManager: LayerManager,
    rasterController: RasterControllerLike,
    newMode: MapMode,
  ): Promise<void>

Q8 failure-mode policy (best-effort persistence) — verbatim from 04B-RESEARCH.md:
  1. Apply the new mode to LayerManager.setMapMode + RasterController.setBleVerdict FIRST (in-memory state).
  2. Call setLocalStorage SECOND.
  3. If setLocalStorage returns false OR rejects → log warning, do NOT roll back the in-memory toggle.

Pitfall 1 (Phase 4a): import EvenAppBridge from '@evenrealities/even_hub_sdk' directly. NEVER reference hub.* in engine/raster/status-hud modules. map-mode-toggle.ts is engine code; calls bridge.setLocalStorage directly.

Pitfall 7 (Phase 4b research): toggleMapMode('auto') after a manual 'glyph' override should ideally restore the BLE-probe verdict. Plan 02 captures the original verdict in boot-engine-core.ts as a closure variable; Phase 4b's `toggleMapMode` does NOT restore it (documented limitation — Phase 6 Quick Action wiring may add this restoration if user feedback demands). Document the limitation in JSDoc + 04b-02-SUMMARY.md.

SR-11 scene-renderer-smoke.test.ts extension pattern (mirrors SR-1..SR-10 existing harness):
- Stub bridge.getLocalStorage to resolve 'glyph' BEFORE the bootEngine call.
- Run bootEngine.
- Assert rasterController.setBleVerdict was called with 'glyph' AND layerManager.getMapMode() === 'glyph' AFTER boot.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: map-mode-toggle.ts module + unit tests (in-memory + persistence + failure-mode)</name>
  <read_first>
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 2 + §Q8 (full failure-mode policy + SDK empirical behavior table — bridge.setLocalStorage returns true/false, getLocalStorage returns '' for missing key)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 3 (locked decisions on persistence key + boot read priority)
    - packages/g2-app/src/engine/layer-manager.ts (full file — MapMode type + setMapMode signature)
    - packages/g2-app/src/raster/raster-controller.ts (setBleVerdict signature; note: does NOT accept 'auto')
    - packages/g2-app/src/hub-polyfill.ts (lines 70-105 — graceful-degradation pattern Phase 2 used; Plan 02 mirrors the spirit but calls bridge directly per Pitfall 1)
    - @evenrealities/even_hub_sdk type definitions (setLocalStorage / getLocalStorage signatures — Phase 4b research §Q8 cites SDK index.d.ts line 1135-1157; verify before implementing)
  </read_first>
  <files>packages/g2-app/src/engine/map-mode-toggle.ts, packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts</files>
  <behavior>
    loadPersistedMapMode:
    - Test MMT-LP-01: bridge.getLocalStorage('view.map.mode') resolves 'raster' → loadPersistedMapMode returns 'raster'
    - Test MMT-LP-02: bridge.getLocalStorage resolves 'glyph' → returns 'glyph'
    - Test MMT-LP-03: bridge.getLocalStorage resolves 'auto' → returns 'auto'
    - Test MMT-LP-04: bridge.getLocalStorage resolves '' (empty string — missing key per SDK) → returns 'auto' (defensive fallback)
    - Test MMT-LP-05: bridge.getLocalStorage resolves 'invalid-value' → returns 'auto' (whitelist rejection, defensive fallback)
    - Test MMT-LP-06: bridge.getLocalStorage rejects with Error → returns 'auto' (no throw); console.warn was called once
    - Test MMT-LP-07: STORAGE_KEY constant exported and equals 'view.map.mode' literal (grep gate; structural)

    toggleMapMode:
    - Test MMT-TG-01: toggleMapMode(bridge, lm, rc, 'raster') → layerManager.setMapMode('raster') called; rasterController.setBleVerdict('raster') called; bridge.setLocalStorage('view.map.mode', 'raster') called
    - Test MMT-TG-02: toggleMapMode(..., 'glyph') → same shape, with 'glyph' through each call
    - Test MMT-TG-03: toggleMapMode(..., 'auto') → layerManager.setMapMode('auto') called; rasterController.setBleVerdict NOT called (auto is not a valid setBleVerdict input — verified via vi.spyOn assertion not.toHaveBeenCalled); bridge.setLocalStorage('view.map.mode', 'auto') called
    - Test MMT-TG-04 (call order — best-effort policy): in-memory mutations (setMapMode + setBleVerdict) execute BEFORE setLocalStorage (use vi.fn invocationCallOrder)
    - Test MMT-TG-05 (failure-mode — setLocalStorage returns false): bridge.setLocalStorage resolves false → toggleMapMode resolves without throwing; layerManager.setMapMode was still called; console.warn was called once with a message containing 'setLocalStorage returned false'
    - Test MMT-TG-06 (failure-mode — setLocalStorage rejects): bridge.setLocalStorage rejects with Error → toggleMapMode resolves without throwing; layerManager.setMapMode was still called; console.warn was called once with a message containing 'setLocalStorage threw'
    - Test MMT-TG-07 (idempotent toggle): calling toggleMapMode(..., 'glyph') twice in a row → 2× setMapMode calls + 2× setBleVerdict calls + 2× setLocalStorage calls (no de-duplication; spec doesn't require it)
  </behavior>
  <action>
    Implement `packages/g2-app/src/engine/map-mode-toggle.ts` and `packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts` atomically.

    **1. `packages/g2-app/src/engine/map-mode-toggle.ts`:**

    Module JSDoc cites 04b-CONTEXT.md §Area 3 + 04B-RESEARCH.md §Approach 2 + §Q8 (failure-mode policy) + Pitfall 7 (toggleMapMode('auto') limitation note).

    Imports:
    ```
    import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
    import type { LayerManager, MapMode } from './layer-manager.js';
    import type { RasterControllerLike } from './layer-types.js';
    ```

    Exports:
    - `export const STORAGE_KEY = 'view.map.mode' as const` — JSDoc: "Even Hub kv-store key for the persisted map mode. Format matches Phase 2 hub-polyfill convention (dot-separated ASCII alphanumeric) per 04B-RESEARCH §Q8 key constraints. Device-local; does NOT modify Foundry world settings."

    - `export async function loadPersistedMapMode(bridge: EvenAppBridge): Promise<MapMode>` — JSDoc explains the defensive fallback (missing key, invalid value, rejection → 'auto'). Implementation:
      ```
      export async function loadPersistedMapMode(bridge: EvenAppBridge): Promise<MapMode> {
        try {
          const raw = await bridge.getLocalStorage(STORAGE_KEY);
          if (raw === 'raster' || raw === 'glyph' || raw === 'auto') return raw;
          return 'auto';
        } catch (err) {
          console.warn('[map-mode-toggle] loadPersistedMapMode failed — defaulting to auto', err);
          return 'auto';
        }
      }
      ```

    - `export async function toggleMapMode(bridge, layerManager, rasterController, newMode): Promise<void>` — JSDoc explains: (a) best-effort persistence policy (Q8); (b) the 'auto' case skips setBleVerdict; (c) Pitfall 7 limitation that 'auto' after override does NOT re-run the BLE probe (Phase 6 may extend). Implementation:
      ```
      export async function toggleMapMode(
        bridge: EvenAppBridge,
        layerManager: LayerManager,
        rasterController: RasterControllerLike,
        newMode: MapMode,
      ): Promise<void> {
        // STEP 1 — In-memory state mutation FIRST. Always succeeds.
        layerManager.setMapMode(newMode);
        if (newMode === 'raster' || newMode === 'glyph') {
          rasterController.setBleVerdict(newMode);
        }
        // 'auto' intentionally does NOT call setBleVerdict — Pitfall 7: BLE re-probe is a Phase 6 enhancement; for now the previous verdict stays in the controller.

        // STEP 2 — Persistence is best-effort (Q8).
        try {
          const ok = await bridge.setLocalStorage(STORAGE_KEY, newMode);
          if (!ok) {
            console.warn(`[map-mode-toggle] setLocalStorage returned false for ${STORAGE_KEY}=${newMode}`);
          }
        } catch (err) {
          console.warn('[map-mode-toggle] setLocalStorage threw — toggle applied in-memory only', err);
        }
      }
      ```

    No `@internal` dev hook function — the production `toggleMapMode` is the test surface; Phase 4b plan-02 tests invoke it directly with mock bridge + lm + rc. Phase 6 Quick Action [M] wires the same function to its gesture handler.

    INV-4 JSDoc on every export. Include `// TODO(ADR-0009): Phase 6 toggleMapMode('auto') re-probe — currently leaves previous verdict in controller. Pitfall 7 documented in 04B-RESEARCH.md` comment near the 'auto' branch.

    **2. `packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts`:**

    Use vi.fn() for the bridge / layerManager / rasterController mocks. Pattern (paraphrased):
    ```
    const bridge = { setLocalStorage: vi.fn().mockResolvedValue(true), getLocalStorage: vi.fn().mockResolvedValue('') } as unknown as EvenAppBridge;
    const layerManager = { setMapMode: vi.fn(), getMapMode: vi.fn().mockReturnValue('auto') } as unknown as LayerManager;
    const rasterController = { setBleVerdict: vi.fn(), getBleVerdict: vi.fn().mockReturnValue(null) } as unknown as RasterControllerLike;
    ```

    Implement all 14 tests (MMT-LP-01..07, MMT-TG-01..07). For MMT-TG-04 use `vi.fn` call ordering: `expect(layerManager.setMapMode.mock.invocationCallOrder[0]).toBeLessThan(bridge.setLocalStorage.mock.invocationCallOrder[0])`.

    For MMT-LP-06 + MMT-TG-05 + MMT-TG-06 use `vi.spyOn(console, 'warn')` and restore in afterEach. Assert exactly one warn call.

    Constraints:
    - NO usage of `hub-polyfill.ts` — Pitfall 1 mandates direct bridge calls in engine code.
    - JSDoc on every public export.
    - `pnpm typecheck && pnpm lint:ci` must exit 0.
    - The test file uses `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'` — no other test framework imports.
    - Vitest happy-dom env (default in g2-app vitest.config.ts).
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/map-mode-toggle.test.ts && grep -c "STORAGE_KEY = 'view.map.mode'" packages/g2-app/src/engine/map-mode-toggle.ts && grep -c 'export async function loadPersistedMapMode' packages/g2-app/src/engine/map-mode-toggle.ts && grep -c 'export async function toggleMapMode' packages/g2-app/src/engine/map-mode-toggle.ts && grep -c "newMode === 'auto'\|newMode === 'raster'" packages/g2-app/src/engine/map-mode-toggle.ts && grep -c 'console.warn' packages/g2-app/src/engine/map-mode-toggle.ts && grep -cE 'MMT-(LP|TG)-0[0-9]' packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Test file green with 14 tests (7 LP + 7 TG); map-mode-toggle.ts contains the STORAGE_KEY literal, both exported functions, the 'auto' branch with no setBleVerdict, and console.warn for failure-mode paths; test discriminator markers MMT-LP-01..MMT-TG-07 grep-match; typecheck + lint:ci exit 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: boot-engine-core.ts step-9 override read + scene-renderer-smoke.test.ts SR-11 (override-path integration)</name>
  <read_first>
    - packages/g2-app/src/internal/boot-engine-core.ts (full file — lines 230-265 are the integration point; preserve all existing logic, INSERT the override after line 240)
    - packages/g2-app/src/engine/map-mode-toggle.ts (Task 1 output — loadPersistedMapMode signature)
    - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts (full file — SR-1..SR-10 pattern; Plan 02 adds SR-11; test harness uses mock bridge + simulated WS)
    - packages/g2-app/src/index.test-support.ts (test-only DI surface from Phase 4a Plan 05 — Plan 02 uses the same hook for SR-11)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 2 ("Integration points with Phase 4a code" section — boot-engine-core insertion location)
  </read_first>
  <files>packages/g2-app/src/internal/boot-engine-core.ts, packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts</files>
  <behavior>
    SR-11 (boot persisted-override path):
    - Test SR-11: With a mock bridge whose `getLocalStorage('view.map.mode')` resolves 'glyph' BEFORE bootEngine is invoked, run bootEngine; after boot completes assert:
        a) rasterController.setBleVerdict was called with 'glyph' (at least once after the BLE probe — exact count depends on insertion order, but the FINAL call is 'glyph')
        b) layerManager.getMapMode() === 'glyph'
        c) The original BLE verdict was 'auto' (from probeBleThroughput(0,0) returning 'auto' for the zero-duration synthetic probe — preserved Phase 4a behavior)
        d) No exception thrown; boot completes normally
    - Test SR-12 (fallback when persisted is 'auto'): mock bridge.getLocalStorage resolves 'auto' → after boot, layerManager.getMapMode() === 'auto' (BLE verdict wins because both are 'auto')
    - Test SR-13 (fallback when persisted read fails): mock bridge.getLocalStorage rejects → loadPersistedMapMode returns 'auto' defensively → after boot, layerManager.getMapMode() === 'auto'

    Existing scene-renderer-smoke tests SR-1..SR-10 must continue to pass — regression-safe.
  </behavior>
  <action>
    **1. Modify `packages/g2-app/src/internal/boot-engine-core.ts`:**

    Add the import near the top (alongside existing engine imports):
    ```
    import { loadPersistedMapMode } from '../engine/map-mode-toggle.js';
    ```

    Modify step 9 (around line 232-240). The existing lines are:
    ```
    // 9. BLE-probe → mode verdict. ...
    const verdict = probeBleThroughput(0, 0);
    if (verdict !== 'auto') {
      rasterController.setBleVerdict(verdict);
    }
    layerManager.setMapMode(verdict === 'auto' ? 'auto' : verdict);
    ```

    APPEND immediately after (preserving the existing 5 lines verbatim):
    ```
    // 9b. Phase 4b: persisted map mode override (MAP-05 boot read-back).
    //     The persisted value (set by Phase 4b toggleMapMode + Phase 6 Quick Action [M])
    //     OVERRIDES the BLE verdict when 'raster' or 'glyph'. 'auto' (or missing key,
    //     or invalid stored value, or read failure — all map to 'auto' via
    //     loadPersistedMapMode's defensive fallback) lets the BLE verdict win.
    //     04b-CONTEXT.md §Area 3 + 04B-RESEARCH.md §Approach 2.
    const persistedMode = await loadPersistedMapMode(bridge);
    // Capture original BLE verdict for Phase 6 toggleMapMode('auto') re-probe restoration
    // (Pitfall 7 — currently a follow-up; the variable is retained for future wiring).
    // TODO(ADR-0009): expose originalBleVerdict in BootEngineHandle so Phase 6 Quick Action
    // can restore it on toggleMapMode('auto').
    const originalBleVerdict = verdict;
    void originalBleVerdict; // suppress unused-locals strict flag for Phase 4b; consumer lands in Phase 6
    if (persistedMode === 'raster' || persistedMode === 'glyph') {
      rasterController.setBleVerdict(persistedMode);
      layerManager.setMapMode(persistedMode);
    }
    ```

    The `void originalBleVerdict` line is a deliberate no-op to suppress the `noUnusedLocals` strict flag without removing the value (it threads into the future Phase 6 enhancement). Document in 04b-02-SUMMARY.md why this is acceptable vs removing it outright. Alternative: omit the local entirely and add the TODO without the void line — implementer's choice; document the chosen approach.

    No other lines change. The buildBootSteps array, the createBootPage call, the handshake, the LayerManager construction, the RasterController construction, and the bundle of 3 layers all stay verbatim.

    **2. Extend `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts`:**

    Locate the existing SR-1..SR-10 test block (search for `it('SR-` or `describe('Scene renderer smoke'`). Append three new test cases SR-11, SR-12, SR-13 using the same harness pattern.

    The harness mocks the bridge — for Plan 02 it must additionally mock `getLocalStorage` (Phase 4a probably already stubs it; if not, add the stub). For SR-11:
    ```
    it('SR-11: persisted map mode override — glyph wins over BLE auto verdict', async () => {
      const mocks = createPhase4aMocks();  // existing helper, or inline harness
      mocks.bridge.getLocalStorage = vi.fn().mockImplementation(async (key: string) => {
        if (key === 'view.map.mode') return 'glyph';
        return '';
      });
      const handle = await bootEngine({ /* same opts as SR-10 */ }, { /* test-support DI */ });
      expect(mocks.rasterController.setBleVerdict).toHaveBeenCalledWith('glyph');
      expect(handle.layerManager.getMapMode()).toBe('glyph');
      await handle.teardown();
    });
    ```

    For SR-12 (persisted 'auto') the assertion changes to `expect(handle.layerManager.getMapMode()).toBe('auto')` and `expect(mocks.rasterController.setBleVerdict).not.toHaveBeenCalledWith('raster')` and `not.toHaveBeenCalledWith('glyph')` (only setMapMode('auto') happened; setBleVerdict was untouched because BLE verdict was 'auto' and persisted was 'auto').

    For SR-13 (persisted read rejection) mock `getLocalStorage` to reject with `new Error('simulated kv failure')`. Same assertions as SR-12 (defensive fallback to 'auto').

    Inspect the existing scene-renderer-smoke.test.ts to determine the exact mock-construction helper (likely a `createMocks()` or inline factory). Reuse it; do NOT introduce parallel harness machinery.

    Constraints:
    - Do NOT regress any SR-1..SR-10 test. Run the FULL smoke suite locally before declaring done.
    - Test discriminator strings 'SR-11', 'SR-12', 'SR-13' must appear in the test `it()` names so grep gates can verify.
    - The override happens INSIDE bootEngine. Tests stub the bridge BEFORE calling bootEngine; no public toggleMapMode call inside the harness (those go in map-mode-toggle.test.ts in Task 1).
    - JSDoc on the added imports + the override block in boot-engine-core.ts.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/__tests__/scene-renderer-smoke.test.ts && grep -c "loadPersistedMapMode" packages/g2-app/src/internal/boot-engine-core.ts && grep -c "view.map.mode" packages/g2-app/src/internal/boot-engine-core.ts && grep -c "persistedMode === 'raster' || persistedMode === 'glyph'" packages/g2-app/src/internal/boot-engine-core.ts && grep -cE "SR-1[123]" packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Scene renderer smoke test green for SR-1..SR-13 (all 13 cases pass); boot-engine-core.ts imports loadPersistedMapMode and contains the persistedMode override branch; SR-11/SR-12/SR-13 grep-match in the smoke test file; pnpm typecheck + pnpm lint:ci exit 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Even Hub kv store value → loadPersistedMapMode → in-memory state | Stored value is untrusted; whitelist-validated before being applied to layerManager.setMapMode |
| bridge.setLocalStorage Promise → toggle persistence | Failures isolated by try/catch; do not corrupt in-memory state |
| boot-engine-core.ts step-9 override branch → live raster controller | Override must run AFTER the BLE probe so the original verdict is captured before mutation |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4b-02-01 | T | loadPersistedMapMode reading bridge.getLocalStorage('view.map.mode') | mitigate | Strict whitelist `raw === 'raster' || raw === 'glyph' || raw === 'auto'`; any other value (including SDK empty-string-for-missing-key) returns 'auto'. Rejection caught + logged; returns 'auto'. |
| T-4b-02-02 | D | setLocalStorage rejection corrupting in-memory toggle | mitigate | Q8 best-effort policy: in-memory mutation FIRST; setLocalStorage SECOND, wrapped in try/catch. Toggle never rolls back on persistence failure. MMT-TG-05 + MMT-TG-06 verify. |
| T-4b-02-03 | T | Forbidden characters in storage key | mitigate | STORAGE_KEY is a module-level `as const` literal 'view.map.mode' — no interpolation, no user input. Static. |
| T-4b-02-04 | D | boot-engine step-9 override regresses SR-1..SR-10 | mitigate | SR-12/SR-13 prove the existing 'auto' path is unaffected when persisted value is missing or unreadable; full smoke suite re-run after Task 2. |
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 with map-mode-toggle.test.ts (14 tests) + scene-renderer-smoke.test.ts (SR-1..SR-13 = 13 tests) all green
- `pnpm typecheck && pnpm lint:ci` exit 0
- `grep -c "STORAGE_KEY = 'view.map.mode'" packages/g2-app/src/engine/map-mode-toggle.ts` returns 1
- `grep -c 'loadPersistedMapMode' packages/g2-app/src/internal/boot-engine-core.ts` returns ≥1
- Phase 4a SR-1..SR-10 tests still pass (no regression)
- toggleMapMode's 'auto' branch does NOT call setBleVerdict (Pitfall 7 documented)
</verification>

<success_criteria>
Plan 02 closes when:
- MAP-05 toggle-portion fully addressed software-side: `toggleMapMode(bridge, lm, rc, newMode)` mutates in-memory state FIRST, persists best-effort SECOND, never rolls back on persistence failure
- Phase 6 Quick Action `[M] Map ctrl` can wire to `toggleMapMode` without any changes to this plan's outputs
- bootEngine reads the persisted map mode at step 9 and overrides the BLE verdict if 'raster' or 'glyph'; 'auto' lets the BLE verdict win
- The MAP-05 success criterion ("Quick Action [M] hot-swaps raster ↔ glyph at runtime without re-handshake; setting view.map.mode persists device-local") is verifiable software-side via map-mode-toggle.test.ts; hardware-side persistence round-trip across real device reboots is gated by Phase 0/4a `human_needed` (no new hardware SC introduced by Plan 02)
- Pitfall 7 limitation (toggleMapMode('auto') does NOT re-probe BLE) is documented in JSDoc + summary; Phase 6 may extend
</success_criteria>

<output>
After completion, create `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-02-SUMMARY.md` capturing:
- Final `loadPersistedMapMode` + `toggleMapMode` JSDoc summaries
- The exact bootEngine step-9 insertion (line numbers before + after)
- Test counts: 14 in map-mode-toggle.test.ts + 3 new in scene-renderer-smoke.test.ts
- Whether `originalBleVerdict` was retained via `void` no-op or omitted (rationale)
- Pitfall 7 disposition: documented as known limitation; Phase 6 will revisit
- Whether the `// TODO(ADR-0009)` comment lands in boot-engine-core.ts or in map-mode-toggle.ts (both acceptable; pick one)
- Confirmation that SR-1..SR-10 still pass after the boot-engine extension
</output>
