// Source: vitest.dev/guide/workspace (verified 2026-05-11)
// NOTE: vitest.workspace.ts is DEPRECATED since Vitest 3.2 — use test.projects only.
//
// WAVE 1 (Plan 02): re-enabled `test.projects: ['packages/*']` now that the 6
// workspace packages exist (5 scaffolded + validation-harness folded from
// tests/phase-0/). `passWithNoTests: true` kept as belt-and-suspenders for
// packages that contain no test files yet (Phase 2+ wires real tests).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
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
