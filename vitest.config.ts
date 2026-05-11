// Source: vitest.dev/guide/workspace (verified 2026-05-11)
// NOTE: vitest.workspace.ts is DEPRECATED since Vitest 3.2 — use test.projects only.
//
// WAVE 0 DEVIATION: `test.projects` is intentionally commented-out until Wave 1
// (Plan 02) creates the `packages/*` workspace members. Vitest 4 errors out
// (exit 1) if `projects` glob resolves to zero directories — see
// https://github.com/vitest-dev/vitest/issues (no projects found is fatal).
// Re-enable `projects: ['packages/*']` in Wave 1 after first package lands.
// Tracked in 01-01-SUMMARY.md §Deviations.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // projects: ['packages/*'],  // ⚠ Wave 1 will enable this
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // D-1.06 thresholds — root-level only (per-package not supported per vitest docs)
      thresholds: {
        // Core (lib/utils/business logic) — applied workspace-wide as baseline
        lines: 80,
        branches: 80,
        functions: 80,
        // Boundary packages override via include/exclude or separate `--coverage.thresholds.*`
        // For Phase 1 (zero app code), thresholds apply when packages reach the boundary
      },
      include: ['packages/*/src/**'],
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/__tests__/**', 'packages/*/dist/**'],
    },
  },
});
