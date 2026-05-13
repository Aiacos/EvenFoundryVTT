/**
 * tsup build config for @evf/bridge.
 *
 * Why `noExternal: ['@evf/shared-protocol']`:
 *   `@evf/shared-protocol`'s package.json points main/types/exports at
 *   `./src/index.ts` (workspace-link dev pattern). For Docker deployment,
 *   `pnpm deploy` copies that TS source into node_modules, but Node 24
 *   refuses to strip types from files under node_modules
 *   (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). Bundling shared-protocol
 *   into bridge's dist/index.js side-steps this — the deployed runtime
 *   never imports the workspace package at all. Caught by deploy/smoke.sh.
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  // Bundle the workspace shared-protocol package (its package.json points
  // main/exports at src/*.ts, which Node 24 cannot type-strip from node_modules).
  noExternal: ['@evf/shared-protocol'],
  clean: true,
  sourcemap: true,
});
