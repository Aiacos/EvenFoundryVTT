/**
 * Per-package Vitest config for @evf/relay.
 *
 * Discovered by the root `test.projects: ['packages/*']` glob; the `name` enables
 * `--project relay`. Node environment: the Worker logic is tested against hand-written
 * fakes of the Durable Object state and WebSocket (no Workers runtime needed).
 */
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'relay',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
