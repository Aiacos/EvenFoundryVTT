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
  // Foundry globals (game, Hooks, ApplicationV2, etc.) come from the Foundry
  // runtime — those are ambient TS types in src/types/foundry-globals.d.ts,
  // not real imports, so tsup never touches them.
  //
  // BUT: pnpm workspace deps + node_modules deps MUST be bundled into the
  // single dist/module.js because the Foundry data folder has no node_modules.
  // @evf/shared-protocol points main/exports at src/index.ts (workspace-link
  // pattern), and Foundry's ESM loader can't resolve npm-style imports anyway —
  // so bundle everything required at runtime. Caught the same way as the bridge
  // image's deploy/smoke.sh first run (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING).
  noExternal: ['@evf/shared-protocol', 'qrcode'],
  // Target ES2022 to align with Foundry v13+ baseline (modern browser/Chrome engine)
  target: 'es2022',
  // CRITICAL: Foundry modules run in the BROWSER (Foundry's Electron-wrapped Chromium).
  // `qrcode@1.5.4` has dual entry points: lib/server.js (Node — uses fs, Sharp) and
  // lib/browser.js (Canvas). Without platform: 'browser', tsup/esbuild bundles the
  // Node entry → `require('fs')` throws at module-load time → entire module init
  // crashes silently → Hooks.once('init') never registers → settings missing.
  // Caught by HUMAN-UAT first install (user reported empty settings list).
  platform: 'browser',
  // Clean dist before each build to avoid stale artefacts
  clean: true,
});
