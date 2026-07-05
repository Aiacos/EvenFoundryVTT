/**
 * Per-package Vitest config for @evf/g2-app.
 *
 * Discovered by root `test.projects: ['packages/*']` glob in vitest.config.ts.
 * Coverage thresholds + reporters inherited from root config automatically
 * (Vitest 4 projects API merges with root for shared concerns per
 * vitest.dev/guide/projects). The `name` field enables `--project g2-app` filter.
 *
 * NOTE: `defineProject` from vitest/config does NOT accept `extends: true`
 * (that field lives on TestProjectInlineConfiguration consumed by the ROOT
 * `test.projects` array, not on standalone project configs). Vitest 4 still
 * merges root coverage/reporters by default — Pitfall 3 documented this for
 * INLINE project entries; STANDALONE per-package configs use this pattern.
 */
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'g2-app',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    // Hermetic-fetch guard: boot-engine tests use the sentinel bridge host
    // `test`; happy-dom's window.fetch would otherwise CORS-preflight it over
    // REAL node:http → real DNS (`getaddrinfo EAI_AGAIN test`) → an internal
    // error escaping happy-dom's promise chain at teardown → Vitest exit 1
    // with 0 test failures (the intermittent CI red on quality-gates).
    setupFiles: ['src/test-support/hermetic-fetch.setup.ts'],
  },
});
