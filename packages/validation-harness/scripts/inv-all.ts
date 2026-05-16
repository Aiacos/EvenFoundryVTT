/**
 * INV-1..5 Verification Suite — CLI orchestrator
 *
 * Invoked by: `pnpm --filter @evf/validation-harness inv:all`
 *             `pnpm --filter @evf/validation-harness inv:all:skip-inv2`
 *
 * Flags:
 *   --skip-inv2   Skip the INV-2 network ping (useful in air-gapped environments).
 *                 INV-2 result will be 'skipped'; does NOT affect allGreen.
 *
 * Exit codes:
 *   0 — all green (skipped counts as green for CI purposes)
 *   1 — at least one red
 *
 * Output format (IS-08 table spec):
 *
 *   EVF Invariant Suite
 *   ===================
 *   INV     | Status    | Detail
 *   --------|-----------|-------
 *   INV-1   | green     | all matchAsciiFixture snapshots pass
 *   INV-2   | skipped   | run manually per CLAUDE.md §Pre-bump checklist
 *   INV-3   | green     | all 5 sites at v0.9.12
 *   INV-4   | green     | biome ci clean; tsc --noEmit clean
 *   INV-5   | green     | COR-01..15 pass; hook anchor found
 *
 *   Result: ALL GREEN
 *
 * @see packages/validation-harness/src/inv-suite.ts — runInvSuite() + formatTable()
 * @see docs/architecture/INVARIANTS.md §1..§5
 * @see CLAUDE.md §Pre-bump checklist
 */

import { formatTable, runInvSuite } from '../src/inv-suite.js';

function parseArgs(argv: string[]): { skipInv2: boolean } {
  return { skipInv2: argv.includes('--skip-inv2') };
}

async function main(): Promise<void> {
  const { skipInv2 } = parseArgs(process.argv.slice(2));

  console.log('EVF Invariant Suite');
  console.log('===================');
  if (skipInv2) {
    console.log('Mode: --skip-inv2 (INV-2 network probe skipped)');
  }
  console.log();

  const { results, allGreen } = await runInvSuite({ skipInv2 });

  console.log(formatTable(results));
  console.log();

  if (allGreen) {
    console.log('Result: ALL GREEN');
  } else {
    const reds = results.filter((r) => r.status === 'red');
    console.log(`Result: ${reds.length} RED — ${reds.map((r) => r.id).join(', ')}`);
  }

  process.exit(allGreen ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('[inv-all] fatal:', err);
  process.exit(1);
});
