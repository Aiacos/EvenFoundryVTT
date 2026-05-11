import { defineConfig } from 'tsup';

/**
 * tsup build config for @evf/foundry-module.
 *
 * Foundry VTT v13+ loads ESM natively via the `esmodules` field in module.json.
 * All Foundry globals (game, Hooks, etc.) are declared as ambient types in
 * src/types/foundry-globals.d.ts — they are NOT bundled, they're provided by the
 * Foundry runtime at load time.
 *
 * @see packages/foundry-module/module.json — `esmodules: ["dist/module.js"]`
 * @see ADR-0008 (code quality: tsup ESM output, sourcemap for debuggability)
 */
export default defineConfig({
  entry: ['src/module.ts'],
  format: ['esm'],
  outDir: 'dist',
  // Foundry does not consume .d.ts from the module bundle
  dts: false,
  sourcemap: true,
  // Foundry globals are ambient — nothing to mark external explicitly,
  // but tsup will NOT bundle anything not imported (tree-shaken away).
  external: [],
  // Target ES2022 to align with Foundry v13+ baseline (modern browser/Chrome engine)
  target: 'es2022',
  // Clean dist before each build to avoid stale artefacts
  clean: true,
});
