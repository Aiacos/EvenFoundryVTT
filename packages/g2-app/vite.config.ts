/**
 * Vite 8 config for @evf/g2-app — one bundle, three ways to run it (ADR-0019):
 *
 * - Even Hub package: `evenhub pack app.json dist` (the store / beta install);
 * - hosted page: the same `dist/` published by GitHub Pages under `/app/` (the page the
 *   pairing QR opens in the Even Realities App);
 * - development: `vite --host` on the LAN, sideloaded with `evenhub qr`.
 *
 * Relative `base` so the bundle works under any path. No external CDN assets.
 * `VITE_RELAY_URL` bakes a non-default relay in (dev / self-host builds).
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md §Decision Outcome 6
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const appJson = JSON.parse(readFileSync(here('./app.json'), 'utf8')) as { version: string };

export default defineConfig({
  root: here('./src'),
  base: './',
  define: {
    __EVF_APP_VERSION__: JSON.stringify(appJson.version),
    __EVF_RELAY_URL__: JSON.stringify(process.env.VITE_RELAY_URL ?? ''),
  },
  build: {
    target: 'es2023',
    outDir: here('./dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: here('./src/index.html'),
    },
  },
});
