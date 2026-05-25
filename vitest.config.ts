// Source: vitest.dev/guide/workspace (verified 2026-05-11)
// NOTE: vitest.workspace.ts is DEPRECATED since Vitest 3.2 — use test.projects only.
//
// WAVE 1 (Plan 02): re-enabled `test.projects: ['packages/*']` now that the 6
// workspace packages exist (5 scaffolded + validation-harness folded from
// tests/phase-0/). `passWithNoTests: true` kept as belt-and-suspenders for
// packages that contain no test files yet (Phase 2+ wires real tests).
//
// Coverage policy (Phase 1+):
//   The 80% threshold targets packages that ship real source code. Placeholder
//   index.ts files (single `export const PACKAGE_NAME = ...` re-export, no logic)
//   and hardware-test utilities under validation-harness/src/lib/ are EXCLUDED
//   until they ship behavior verifiable from CI. Migration rule: when a package
//   gains executable logic, its exclude entry below is removed AND tests must
//   bring its file-level coverage to ≥80% in the same PR.
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
        // Applied to files that pass include/exclude filters (see below).
        lines: 80,
        branches: 80,
        functions: 80,
      },
      // Narrow to .ts/.tsx — excludes incidental .txt/.md fixtures under src/
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/*/src/__tests__/**',
        'packages/*/dist/**',
        // Phase 2+ placeholders (single export-only stubs; remove when logic lands)
        'packages/bridge/src/index.ts', // Phase 3
        // foundry-module/src/index.ts removed — Phase 2 Plan 01 replaced it with
        // module.ts + settings.ts which carry real logic and are covered by tests.
        'packages/g2-app/src/index.ts', // Phase 4a
        'packages/shared-protocol/src/index.ts', // Phase 2 (real schemas land then)
        // Hardware-test utilities — exercised by packages/validation-harness/scripts/
        // which require Even Hub access (Phase 0 closure). Unit tests for pure
        // helpers can land in tests/ to lift these exclusions incrementally.
        'packages/validation-harness/src/lib/**',
        // g2-app raster Web Worker — body runs in a separate thread via
        // `new Worker(new URL('./raster-worker.ts', import.meta.url))` and is
        // never imported under Vitest (raster-controller tests inject a workerFactory
        // mock; the happy-dom environment has no `self` worker scope). v8 cannot
        // instrument worker-thread code. Pure helper extraction to raster-pipeline.ts
        // is logged future debt (CONCERNS.md §Raster Worker Isolation).
        'packages/g2-app/src/raster/raster-worker.ts',
        // foundry-mcp Streamable HTTP entry — top-level `(async () => { … })()` IIFE
        // that binds 0.0.0.0:port + connects MCP transport on import; un-instrumentable
        // as a unit (mirrors bridge/src/index.ts). Its testable security primitive
        // `bearerEquals` was extracted to `security/bearer-equals.ts` and is
        // unit-tested (Task 1, quick task 260525-owx).
        'packages/foundry-mcp/src/http.ts',
        // foundry-mcp stdio entry — top-level `(async () => { … })()` IIFE connecting
        // StdioServerTransport on import; un-instrumentable as a unit (mirrors
        // bridge/src/index.ts). The 2 branches are BootError catch arms.
        'packages/foundry-mcp/src/index.ts',
      ],
    },
  },
});
