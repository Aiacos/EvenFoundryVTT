/**
 * Per-package Vitest config for @evf/shared-render.
 *
 * Discovered by the root `test.projects: ['packages/*']` glob; the `name` enables
 * `--project shared-render` (same pattern as `packages/g2-app/vitest.config.ts`).
 */
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'shared-render',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
