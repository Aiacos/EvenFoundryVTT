/**
 * Vite 8 config for @evf/g2-app.
 *
 * Multi-entry build:
 *   - `main`  → src/index.ts  (Phase 4a G2 plugin host — still a placeholder)
 *   - `wizard` → src/wizard/wizard.html  (Phase 2 phone WebView onboarding wizard)
 *
 * Constraints:
 *   - All wizard assets must be inlineable (Even Hub CDN constraint — no external CDN requests).
 *   - Target: ES2023 (covers all modern iOS/Android WebViews).
 *
 * @see Specs.md §3.3 (Even Hub network constraint — origin whitelist, no wildcards)
 * @see Specs.md §3.7 (static CDN-friendly plugin host)
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 1 (Vite multi-entry)
 */
import { defineConfig } from 'vite';

export default defineConfig({
  // `root: 'src'` makes the HTML entries resolve relative to src/, so Vite emits
  // them at the dist ROOT (dist/index.html, dist/wizard/wizard.html) instead of
  // leaking the source path into the bundle (dist/src/index.html). This keeps the
  // Even Hub manifest entrypoint the canonical `index.html` — see app.json and
  // docs/release/evenhub.md (DIST-EHUB-01).
  root: 'src',
  build: {
    target: 'es2023',
    // outDir is relative to `root`, so '../dist' lands at the package root.
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Phase 4a G2 plugin host entry (placeholder — real implementation Phase 4a)
        main: 'index.html',
        // Phase 2 phone WebView wizard entry
        wizard: 'wizard/wizard.html',
      },
    },
  },
});
