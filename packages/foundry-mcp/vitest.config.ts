/**
 * Per-package Vitest config for @evf/foundry-mcp.
 *
 * Discovered by root `test.projects: ['packages/*']` glob in vitest.config.ts.
 * Coverage thresholds + reporters inherited from root config.
 *
 * Environment: node — foundry-mcp is a Node 24 service, no DOM needed.
 *
 * @see CLAUDE.md INV-4 (80% coverage gate on new source files)
 */
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@evf/foundry-mcp',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
