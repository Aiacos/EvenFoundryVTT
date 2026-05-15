/**
 * @internal Test-only DI surface.
 *
 * This module is NOT re-exported from the package main entry (`./index.ts`).
 * Production code MUST NOT import from this file. The package's `package.json`
 * does not declare it under any `exports` subpath, so cross-package consumers
 * cannot reach it through the public API. Test files inside this package's
 * own `src/__tests__/` tree import via relative path
 * (`../index.test-support.js`) — that's the only legal access route.
 *
 * **Why this lives in a separate file (W-4 / NF-2 closure):**
 *
 * The boot-sequence body lives in `./internal/boot-engine-core.ts`
 * (Option B locked per 04A-PLAN-CHECK.md §NF-2). That file contains the
 * only `wsFactory` / `bridgeFactory` literal references in the package.
 * `./index.ts` is a thin production wrapper with zero DI literals
 * (enforced by the W-4 grep gate). This file re-exports the
 * `TestingDependencies` type for test ergonomics + a thin
 * `bootEngineForTest(opts, deps?)` wrapper that calls `_bootEngineCore`
 * directly with the test-injected dependencies.
 *
 * Test usage:
 * ```ts
 * import { bootEngineForTest, type TestingDependencies } from '../index.test-support.js';
 *
 * const handle = await bootEngineForTest(
 *   { bridgeUrl, token, locale: 'it' },
 *   { wsFactory: () => mockSocket, bridgeFactory: async () => mockBridge },
 * );
 * ```
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §W-4 + §NF-2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-05-PLAN.md Task 1
 * @see ./internal/boot-engine-core.ts (the actual boot-sequence body)
 * @see ./index.ts (production wrapper — has no DI surface)
 */
import {
  _bootEngineCore,
  type TestingDependencies as _TestingDependencies,
  type BootEngineHandle,
  type BootEngineOpts,
} from './internal/boot-engine-core.js';

/** Re-export so test consumers can `import { TestingDependencies } from '../index.test-support.js'`. */
export type TestingDependencies = _TestingDependencies;

/** Re-export the production options type for test ergonomics. */
export type { BootEngineOpts } from './internal/boot-engine-core.js';

/**
 * @internal Test-only `bootEngine` variant that accepts mock factories.
 *
 * Thin wrapper over `_bootEngineCore`. Tests pass mock `wsFactory` and/or
 * `bridgeFactory` callbacks to substitute the SDK + `new WebSocket(...)`
 * constructors with happy-dom-compatible shims (PATTERNS.md §makeMockBridge
 * + §MockSocket). Production code MUST NOT call this function — it is
 * structurally unreachable from `./index.ts` and absent from the package
 * `exports` table.
 *
 * Identity check: `bootEngine` (production) and `bootEngineForTest`
 * (this function) are distinct function values. SR-10 in the smoke test
 * asserts `bootEngine !== bootEngineForTest` to prove the W-4 surface
 * separation is not just nominal.
 */
export async function bootEngineForTest(
  opts: BootEngineOpts,
  deps?: TestingDependencies,
): Promise<BootEngineHandle> {
  return _bootEngineCore(opts, deps);
}
