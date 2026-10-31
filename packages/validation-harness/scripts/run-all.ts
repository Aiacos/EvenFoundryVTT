// packages/validation-harness/scripts/run-all.ts
// Sequential orchestrator for the GO/NO-GO validation scripts (defer-hardware pattern).
//
// Usage (from the repo root):
//   pnpm --filter @evf/validation-harness validate:all                 # full suite (G2/R1 + live Foundry world)
//   pnpm --filter @evf/validation-harness validate:all:skip-hardware   # software-only smoke: every `live` test skipped
//   pnpm --filter @evf/validation-harness exec tsx scripts/run-all.ts --only=midiqol-config-probe
//
// Exit codes:
//   0 — all attempted tests passed (or were skipped by --skip-hardware / not yet created)
//   1 — at least one test failed
//   2 — at least one test was skipped due to missing prereqs (Hub unavailable, Foundry off, etc.)
//   3 — orchestrator usage error
//
// One process per test (child_process.spawn) so an SDK panic in one test doesn't tank the runner.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

type TestPlan = {
  id: string;
  file: string;
  /** Needs the G2/R1 hardware or a live Foundry world — skipped by `--skip-hardware`. */
  live: boolean;
  envs?: ReadonlyArray<'clean' | '5ghz-loaded' | '2-4ghz-microwave'>;
  description: string;
};

const TESTS: ReadonlyArray<TestPlan> = [
  {
    id: 'midiqol-config-probe',
    file: 'midiqol-config-probe.ts',
    // Waits up to 60 s for a POST from a running Foundry world: not software-only.
    live: true,
    description: 'MidiQOL autoFastForward config check (REQ MIDIQ-01)',
  },
  {
    id: '10-0-1-r1-timing',
    file: '10-0-1-r1-timing.ts',
    live: true,
    description: 'R1 gesture timing windows (Specs §10.0.1, n=150 per gesture)',
  },
  {
    id: '10-0-2-image-format',
    file: '10-0-2-image-format.ts',
    live: true,
    description: 'updateImageRawData byte format probe (Specs §10.0.2)',
  },
  {
    id: '10-0-3-ble-multi-env',
    file: '10-0-3-ble-multi-env.ts',
    live: true,
    envs: ['clean', '5ghz-loaded', '2-4ghz-microwave'],
    description: 'BLE bandwidth multi-env (Specs §10.0.3 + Pitfall 2)',
  },
  {
    id: '10-0-7-dle-sustained',
    file: '10-0-7-dle-sustained.ts',
    live: true,
    description: 'DLE 30-min sustained (Specs §10.0.7 + Pitfall 10)',
  },
  {
    id: '10-0-8-queue-depth',
    file: '10-0-8-queue-depth.ts',
    live: true,
    description: 'Queue depth empirical table (Specs §10.0.8)',
  },
  {
    id: '10-0-9-palette-calibration',
    file: '10-0-9-palette-calibration.ts',
    live: true,
    description: 'Palette calibration ramp + perceptual derivation (Pitfall 15)',
  },
  {
    id: 'adr-0019-relay',
    file: 'relay-check.ts',
    live: true,
    description: 'ADR-0019 room relay + pairing (RELAY_URL optional; Foundry + phone + G2)',
  },
];

type TestOutcome = 'pass' | 'fail' | 'skipped' | 'not-yet-created' | 'skipped-by-flag';

type TestRun = {
  id: string;
  env?: string;
  outcome: TestOutcome;
  exitCode: number;
  durationMs: number;
};

function parseArgs(argv: string[]): { skipHardware: boolean; only?: string } {
  const skipHardware = argv.includes('--skip-hardware');
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1] : undefined;
  return { skipHardware, ...(only !== undefined ? { only } : {}) };
}

function runOne(
  file: string,
  env: Record<string, string>,
): Promise<{ exitCode: number; durationMs: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn('pnpm', ['exec', 'tsx', path.join(SCRIPT_DIR, file)], {
      cwd: SCRIPT_DIR,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      resolve({ exitCode: code ?? 1, durationMs: Date.now() - t0 });
    });
    child.on('error', (err) => {
      console.error(`[run-all] spawn error for ${file}:`, err);
      resolve({ exitCode: 1, durationMs: Date.now() - t0 });
    });
  });
}

function outcomeFromExitCode(code: number): TestOutcome {
  if (code === 0) return 'pass';
  if (code === 2) return 'skipped';
  return 'fail';
}

async function main(): Promise<void> {
  const { skipHardware, only } = parseArgs(process.argv.slice(2));
  console.log(`Phase 0 Validation Suite Runner`);
  console.log(`================================`);
  console.log(
    `Mode: ${skipHardware ? 'SKIP-HARDWARE (software-only smoke)' : 'FULL'}${only ? ` filtered to --only=${only}` : ''}`,
  );
  console.log();

  const runs: TestRun[] = [];

  for (const test of TESTS) {
    if (only && test.id !== only) continue;
    if (skipHardware && test.live) {
      console.log(
        `[SKIP-FLAG] ${test.id} — needs hardware or a live Foundry world, skipped by --skip-hardware`,
      );
      runs.push({ id: test.id, outcome: 'skipped-by-flag', exitCode: 0, durationMs: 0 });
      continue;
    }
    if (!existsSync(path.join(SCRIPT_DIR, test.file))) {
      console.log(
        `[NOT-YET-CREATED] ${test.id} — file ${test.file} does not exist (Plan 03 will create)`,
      );
      runs.push({ id: test.id, outcome: 'not-yet-created', exitCode: 0, durationMs: 0 });
      continue;
    }
    if (test.envs) {
      for (const env of test.envs) {
        console.log(`>>> Running ${test.id} [RF_ENV=${env}]: ${test.description}`);
        const { exitCode, durationMs } = await runOne(test.file, { RF_ENV: env });
        runs.push({
          id: test.id,
          env,
          outcome: outcomeFromExitCode(exitCode),
          exitCode,
          durationMs,
        });
      }
    } else {
      console.log(`>>> Running ${test.id}: ${test.description}`);
      const { exitCode, durationMs } = await runOne(test.file, {});
      runs.push({
        id: test.id,
        outcome: outcomeFromExitCode(exitCode),
        exitCode,
        durationMs,
      });
    }
  }

  // Summary
  console.log();
  console.log(`Summary`);
  console.log(`-------`);
  const colWidth =
    Math.max(30, ...runs.map((r) => (r.id + (r.env ? `[${r.env}]` : '')).length)) + 2;
  for (const r of runs) {
    const label = (r.id + (r.env ? `[${r.env}]` : '')).padEnd(colWidth);
    const dur = r.durationMs > 0 ? `${(r.durationMs / 1000).toFixed(1)}s` : '—';
    console.log(`  ${label} ${r.outcome.toUpperCase().padEnd(20)} ${dur}`);
  }
  console.log();

  const failed = runs.filter((r) => r.outcome === 'fail').length;
  const skipped = runs.filter((r) => r.outcome === 'skipped').length;
  const notCreated = runs.filter((r) => r.outcome === 'not-yet-created').length;
  const byFlag = runs.filter((r) => r.outcome === 'skipped-by-flag').length;
  const passed = runs.filter((r) => r.outcome === 'pass').length;
  console.log(
    `Counts: ${passed} pass / ${failed} fail / ${skipped} skipped / ${byFlag} skipped-by-flag / ${notCreated} not-yet-created`,
  );

  if (failed > 0) process.exit(1);
  if (skipped > 0) process.exit(2);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Orchestrator fatal:', err);
  process.exit(3);
});
