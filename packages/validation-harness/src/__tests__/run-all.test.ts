import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('run-all --skip-hardware (software-only smoke)', () => {
  it('skips every live test, exits 0 quickly and reports honest counts (regression)', () => {
    const t0 = Date.now();
    const run = spawnSync('pnpm', ['exec', 'tsx', 'scripts/run-all.ts', '--skip-hardware'], {
      cwd: HARNESS,
      encoding: 'utf8',
      timeout: 30_000,
    });
    // Before the fix the MidiQOL probe waited 60 s for a live Foundry, wrote an evidence
    // file into docs/perf/ and made the smoke exit 2 while the summary said "7 pass".
    expect(run.status).toBe(0);
    expect(Date.now() - t0).toBeLessThan(20_000);
    expect(run.stdout).toContain('[SKIP-FLAG] midiqol-config-probe');
    expect(run.stdout).toMatch(/Counts: 0 pass \/ 0 fail \/ 0 skipped \/ 8 skipped-by-flag/);
  }, 30_000);
});
