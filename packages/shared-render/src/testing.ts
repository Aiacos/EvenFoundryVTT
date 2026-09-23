/**
 * `@evf/shared-render/testing` — TEST-ONLY INV-1 matchers.
 *
 * These wrap Vitest's `toMatchFileSnapshot()` and statically import `vitest` and
 * `node:fs`. They live behind this subpath (never the root barrel) so browser bundles
 * such as the g2-app can never drag them in: the real G2 WebView blanks at boot when a
 * bundle references `node:fs` (remote 9cb5130, inventory H10). A build test asserts the
 * g2 bundle stays free of `node:fs` / `vitest` / `happy-dom`.
 *
 * @see Specs.md §7.1a (Layout Integrity Invariants)
 */
export { matchPixelFixture } from './pixel/fixture.js';
export { matchAsciiFixture } from './snapshot.js';
