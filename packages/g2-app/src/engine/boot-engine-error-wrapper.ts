/**
 * bootEngineWithErrorUi — try/catch wrapper around `_bootEngineCore` that mounts
 * `BootErrorLayer` best-effort on the failure path, then RETHROWS the original
 * cause for caller observability (W-3 resolution, locked).
 *
 * **Why this wrapper lives in a SEPARATE file (NOT in `boot-engine-core.ts`):**
 *
 * Plan 02 (Wave 1) modified `boot-engine-core.ts` to add the step-9b persisted
 * map-mode override read-back. Plan 04 (Wave 2) MUST NOT modify the same file
 * — the planner-strict zero-overlap policy forbids it. Placing the wrapper in
 * `boot-error-*` siblings keeps Plan 04's file footprint disjoint from Plan 02
 * even though the wrapper still imports `_bootEngineCore` + `BootEngineOpts` +
 * `TestingDependencies` + `BootEngineHandle` from the internal core. The plan's
 * `depends_on: ["04b-01", "04b-02"]` documents the dependency.
 *
 * **W-3 resolution (RETHROW + render best-effort):**
 *
 * The wrapper returns `Promise<BootEngineHandle>`. On the happy path it
 * resolves with the handle from `_bootEngineCore` unchanged. On the error
 * path it:
 *   1. Maps the thrown exception to a `BootErrorState` via
 *      `bootErrorFromException` (Plan 04 Task 2).
 *   2. Acquires an `EvenAppBridge` (preferring `deps?.bridgeFactory`, else
 *      the SDK singleton via `waitForEvenAppBridge`).
 *   3. Constructs a `BootErrorLayer` and calls `draw()` best-effort —
 *      catching any render-time rejection in an INNER try/catch so the
 *      bridge call's own failure cannot mask the original cause.
 *   4. RETHROWS the original exception. No degenerate `BootEngineHandle` is
 *      constructed; callers `await` this function and observe either a
 *      resolved handle (success) OR a rejected promise carrying the
 *      original `HandshakeError` / `LayerManagerError` / generic `Error`.
 *
 * The player sees the panel rendered on the device; the awaiter's `catch`
 * block receives the original exception and can route on `err.code` /
 * `err instanceof HandshakeError` etc. — this is what Phase 6's retry
 * handler will hook into.
 *
 * **Double-failure semantics (T-4b-04-06):** when both the original cause
 * AND `BootErrorLayer.draw()` reject, the wrapper:
 *   - Logs `console.error` with the render failure (telemetry).
 *   - RETHROWS the original cause, NOT the render error.
 *
 * The render error is an availability incident — surfacing it would mask
 * the actual bug Phase 6 retry needs to handle.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-04-PLAN.md Task 3
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 4
 * @see ./boot-error-types.ts (BootErrorState enum + content table)
 * @see ./boot-error-dispatch.ts (bootErrorFromException source-map function)
 * @see ./boot-error-layer.ts (BootErrorLayer + BOOT_ERROR_CONTAINER_NAME)
 * @see ../internal/boot-engine-core.ts (_bootEngineCore + BootEngineOpts + TestingDependencies + BootEngineHandle)
 */

import {
  _bootEngineCore,
  type BootEngineHandle,
  type BootEngineOpts,
  type TestingDependencies,
} from '../internal/boot-engine-core.js';
import { bootErrorFromException } from './boot-error-dispatch.js';
import { BootErrorLayer } from './boot-error-layer.js';
import type { BootErrorLocale } from './boot-error-types.js';

/**
 * Boot the G2 engine with best-effort error-UI rendering on the failure path.
 *
 * Happy-path semantics are identical to `_bootEngineCore` — the function
 * resolves with the `BootEngineHandle` returned by the inner core.
 *
 * Error-path semantics (W-3 locked):
 *   - Maps the exception via `bootErrorFromException` → one of the 5
 *     {@link BootErrorState} enum values.
 *   - Acquires a bridge handle (test injection via `deps?.bridgeFactory`
 *     first; falls back to the SDK singleton).
 *   - Constructs a `BootErrorLayer` with (bridge, state, opts.locale)
 *     and calls `draw()` best-effort.
 *   - RETHROWS the ORIGINAL exception (NOT the render error).
 *
 * The caller's `await bootEngineWithErrorUi(...)` thus either resolves with
 * a valid handle (happy path) or rejects with the original cause (failure
 * path), with the side effect that the BootErrorLayer panel has been
 * mounted on the device before the rejection surfaces.
 *
 * @param opts Production boot options (bridgeUrl + token + locale).
 * @param deps Test-only DI surface — production callers pass `undefined`.
 * @returns A `BootEngineHandle` on success; rejects with the original
 *          exception on failure.
 */
export async function bootEngineWithErrorUi(
  opts: BootEngineOpts,
  deps?: TestingDependencies,
): Promise<BootEngineHandle> {
  try {
    return await _bootEngineCore(opts, deps);
  } catch (err) {
    const state = bootErrorFromException(err);
    console.warn(`[boot-engine] boot failed with state '${state}'`, err);

    // Best-effort render. Any failure here is logged via console.error but
    // does NOT replace the original cause — the awaiter receives the
    // ORIGINAL exception so Phase 6 retry can discriminate on it.
    try {
      // Acquire a bridge handle. Prefer the test-injected factory; else
      // fall back to the SDK singleton. The dynamic import keeps the
      // production bundle small (the SDK is the heaviest import in the
      // happy path, but on the boot-error path the SDK is almost certainly
      // already loaded by `_bootEngineCore`'s step 2). The import is local
      // so the wrapper's static surface stays disjoint from the SDK type
      // tree — making the wrapper unit-testable without mocking the SDK.
      const bridgeFactory =
        deps?.bridgeFactory ??
        (async () => {
          const sdk = await import('@evenrealities/even_hub_sdk');
          // `waitForEvenAppBridge()` is the production singleton accessor.
          return sdk.waitForEvenAppBridge();
        });
      const bridge = await bridgeFactory();
      // BootErrorLayer only has IT/EN/DE content (BootErrorLocale). Best-effort
      // locales (es/fr/pt-br) from the widened BootEngineLocale fall back to 'en'
      // for error UI rendering (I18N-05 best-effort policy applied to error path).
      const errorLocale: BootErrorLocale =
        opts.locale === 'it' || opts.locale === 'de' ? opts.locale : 'en';
      const layer = new BootErrorLayer(bridge, state, errorLocale);
      await layer.draw();
    } catch (renderErr) {
      // T-4b-04-06 mitigation: double failure — original cause + render
      // failure. Log telemetry and continue to the rethrow below.
      console.error('[boot-engine] failed to render boot error UI', renderErr);
    }

    // W-3 lock: RETHROW the original cause unconditionally. The caller's
    // `await` site sees the original exception; the BootErrorLayer (if
    // it rendered) is a side effect already visible on the device.
    throw err;
  }
}
