/**
 * Per-package Vitest config for @evf/foundry-module.
 *
 * Discovered by root `test.projects: ['packages/*']` glob in vitest.config.ts.
 * Coverage thresholds + reporters inherited from root config automatically
 * (Vitest 4 projects API merges with root for shared concerns).
 *
 * Environment: happy-dom provides a lightweight DOM environment suitable for
 * Foundry globals mocking. Game globals (game, Hooks) are declared ambient in
 * src/types/foundry-globals.d.ts and set up via vi.stubGlobal in each test.
 *
 * @see packages/foundry-module/src/types/foundry-globals.d.ts
 * @see CLAUDE.md INV-4 (80% coverage gate on new source files)
 */
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@evf/foundry-module',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
});
