/**
 * B-1 adversarial typecheck test (04A-PLAN-CHECK.md §B-1).
 *
 * Spawns `pnpm exec tsc --noEmit` against `fixtures/budget-bust.fixture.ts` (a
 * deliberately broken file that violates the `WidthBudgetRow.max: number`
 * constraint via `max: 'NotANumber'`) and asserts:
 *
 *   1. `tsc` exits with a non-zero status code.
 *   2. The combined stderr+stdout contains at least one of the satisfies-class
 *      error codes: TS2322, TS2741, TS2769, TS2353.
 *
 * This proves the I18N-04 build-time gate works adversarially — CI would catch
 * a budget-busting WidthBudgetRow literal at the type level, not just at runtime.
 *
 * Cost: ~5-15 s wall time per run (a full `tsc --noEmit` invocation). Kept in the
 * default suite per the plan; if CI feedback latency suffers we can move it to a
 * `:slow` suite per RESEARCH.md feedback-latency policy.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-1
 * @see ./fixtures/budget-bust.fixture.ts (adversarial fixture)
 * @see ../i18n-budgets.ts (real `WidthBudgetRow` import)
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('I18N-04 satisfies gate adversarial typecheck (B-1)', () => {
  it('rejects budget-busting WidthBudgetRow literal at compile time', () => {
    // packages/g2-app/src/status-hud/__tests__/ → 5 dirs up = repo root.
    const repoRoot = resolve(__dirname, '../../../../..');
    // Standalone tsconfig that intentionally INCLUDES budget-bust.fixture.ts.
    // The package-level tsconfig EXCLUDES the same file so the production
    // typecheck stays green; this adversarial tsconfig opts the fixture in
    // and runs tsc against it.
    const adversarialTsconfig = resolve(__dirname, 'fixtures/tsconfig.adversarial.json');

    const result = spawnSync(
      'pnpm',
      ['exec', 'tsc', '--noEmit', '--project', adversarialTsconfig],
      {
        encoding: 'utf-8',
        timeout: 30_000,
        cwd: repoRoot,
      },
    );

    // Binary fact: tsc must exit non-zero on the bad fixture.
    expect(result.status, `tsc unexpectedly exited 0; stdout=${result.stdout}`).not.toBe(0);

    // Accept any of the satisfies-failure TS error codes.
    const acceptableErrorCodes = ['TS2322', 'TS2741', 'TS2769', 'TS2353'];
    const stderrOrStdout = `${result.stderr ?? ''}${result.stdout ?? ''}`;
    const matchedCode = acceptableErrorCodes.find((c) => stderrOrStdout.includes(c));
    expect(
      matchedCode,
      `expected tsc to emit one of ${acceptableErrorCodes.join('/')}; got: ${stderrOrStdout.slice(0, 800)}`,
    ).toBeDefined();
  }, 30_000);
});
