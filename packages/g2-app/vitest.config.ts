/**
 * Per-package Vitest config for @evf/g2-app.
 *
 * extends:true CRITICAL — inherits root coverage thresholds + reporters per Pitfall 3
 * (RESEARCH.md lines 419-425). Without it, package would lose coverage configuration silently.
 */
import { defineProject } from 'vitest/config';

export default defineProject({
  extends: true,
  test: {
    name: 'g2-app',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
});
