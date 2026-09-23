/**
 * Vite 8 config for @evf/g2-app — single entry, emitted into the Foundry module.
 *
 * ADR-0016: Foundry serves the bundle at `<foundry>[/<prefix>]/modules/evenfoundryvtt/g2/`,
 * so the output goes to `packages/foundry-module/g2/` (shipped in the module zip) with a
 * relative `base` — the same build works under any routePrefix. No external CDN assets.
 *
 * The `.ehpk` package is secondary (sideload-first): `evenhub pack app.json
 * ../foundry-module/g2` packs the same output (`app.json` entrypoint `index.html`).
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md §Decision Outcome 1
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const appJson = JSON.parse(readFileSync(here('./app.json'), 'utf8')) as { version: string };
/** The module this bundle ships in: the app warns when Foundry runs another version. */
const modulePkg = JSON.parse(readFileSync(here('../foundry-module/package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  root: here('./src'),
  base: './',
  define: {
    __EVF_APP_VERSION__: JSON.stringify(appJson.version),
    __EVF_MODULE_VERSION__: JSON.stringify(modulePkg.version),
  },
  build: {
    target: 'es2023',
    outDir: here('../foundry-module/g2'),
    emptyOutDir: true,
    rollupOptions: {
      input: here('./src/index.html'),
    },
  },
});
