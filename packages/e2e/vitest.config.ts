/**
 * Per-package Vitest config for @evf/e2e (discovered by the root `test.projects`).
 *
 * The suites are skipped unless `EVF_RELAY_URL` points at a relay (CI: the "Relay
 * end-to-end" step runs them against `wrangler dev`); the browser suite also needs
 * `EVF_CHROMIUM`. Each file picks its own environment (`@vitest-environment`).
 */
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@evf/e2e',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
