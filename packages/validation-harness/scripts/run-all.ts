// tests/phase-0/run-all.ts
// Sequential orchestrator for all 7 Phase 0 validation tests.
//
// Usage:
//   cd tests/phase-0 && pnpm exec tsx run-all.ts                # full suite (requires hardware + Foundry test world)
//   cd tests/phase-0 && pnpm exec tsx run-all.ts --skip-hardware # software-only smoke (Plan 02 sampling rate)
//   cd tests/phase-0 && pnpm exec tsx run-all.ts --only=midiqol-config-probe  # single test by name
//
// Exit codes:
//   0 — all attempted tests passed (or were correctly skipped with explicit RF_ENV=skip)
//   1 — at least one test failed
//   2 — at least one test was skipped due to missing prereqs (Hub unavailable, Foundry off, etc.)
//   3 — orchestrator usage error
//
// One process per test (child_process.spawn) so an SDK panic in one test doesn't tank the runner.
//
// Plan 03 hardware test scripts plug in by file presence — when 10-0-1, 10-0-2, 10-0-3 land,
// run-all.ts picks them up with no orchestrator change.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

type TestPlan = {
  id: string;
  file: string;
  hardware: boolean;
  envs?: ReadonlyArray<'clean' | '5ghz-loaded' | '2-4ghz-microwave'>;
  description: string;
};

const TESTS: ReadonlyArray<TestPlan> = [
  {
    id: 'midiqol-config-probe',
    file: 'midiqol-config-probe.ts',
    hardware: false,
    description: 'MidiQOL autoFastForward config check (REQ MIDIQ-01)',
  },
  {
    id: '10-0-1-r1-timing',
    file: '10-0-1-r1-timing.ts',
    hardware: true,
    description: 'R1 gesture timing windows (Specs §10.0.1, n=150 per gesture)',
  },
  {
    id: '10-0-2-image-format',
    file: '10-0-2-image-format.ts',
    hardware: true,
    description: 'updateImageRawData byte format probe (Specs §10.0.2)',
  },
  {
    id: '10-0-3-ble-multi-env',
    file: '10-0-3-ble-multi-env.ts',
    hardware: true,
    envs: ['clean', '5ghz-loaded', '2-4ghz-microwave'],
    description: 'BLE bandwidth multi-env (Specs §10.0.3 + Pitfall 2)',
  },
  {
    id: '10-0-7-dle-sustained',
    file: '10-0-7-dle-sustained.ts',
    hardware: true,
    description: 'DLE 30-min sustained (Specs §10.0.7 + Pitfall 10)',
  },
  {
    id: '10-0-8-queue-depth',
    file: '10-0-8-queue-depth.ts',
    hardware: true,
    description: 'Queue depth empirical table (Specs §10.0.8)',
  },
  {
    id: '10-0-9-palette-calibration',
    file: '10-0-9-palette-calibration.ts',
    hardware: true,
    description: 'Palette calibration ramp + perceptual derivation (Pitfall 15)',
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
    const child = spawn('pnpm', ['exec', 'tsx', file], {
      cwd: path.resolve('.'),
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
    if (skipHardware && test.hardware) {
      console.log(`[SKIP-FLAG] ${test.id} — hardware-bound, skipped by --skip-hardware`);
      runs.push({ id: test.id, outcome: 'skipped-by-flag', exitCode: 0, durationMs: 0 });
      continue;
    }
    if (!existsSync(test.file)) {
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
  console.log(
    `Counts: ${runs.length - failed - skipped - notCreated} pass / ${failed} fail / ${skipped} skipped / ${notCreated} not-yet-created`,
  );

  if (failed > 0) process.exit(1);
  if (skipped > 0) process.exit(2);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Orchestrator fatal:', err);
  process.exit(3);
});
