// Phase 4a placeholder — minimal Vite 8 config so `pnpm --filter @evf/g2-app build` works.
// Real config (workers, OffscreenCanvas, raster pipeline bundling) lands Phase 4a.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2023',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
