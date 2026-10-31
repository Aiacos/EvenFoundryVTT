import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/merge-when-ready.sh',
);

let dir = '';

/** Runs the script with a fake `gh` that answers `pr view` with `states` in order. */
function run(states: string[]) {
  dir = mkdtempSync(path.join(tmpdir(), 'evf-merge-'));
  writeFileSync(path.join(dir, 'states'), `${states.join('\n')}\n`);
  writeFileSync(
    path.join(dir, 'gh'),
    `#!/usr/bin/env bash
echo "$*" >> "${dir}/calls"
if [ "$1 $2" = "pr view" ]; then
  head -n1 "${dir}/states"; [ "$(wc -l < "${dir}/states")" -gt 1 ] && sed -i 1d "${dir}/states"
fi
exit 0
`,
  );
  chmodSync(path.join(dir, 'gh'), 0o755);
  const res = spawnSync('bash', [SCRIPT, '76', 'abc123', 'chore(release): sync (#76)'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      REPO: 'o/r',
      MERGE_POLL_SECONDS: '0',
      MERGE_WAIT_SECONDS: '2',
    },
  });
  const calls = readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n');
  return { ...res, merges: calls.filter((c) => c.startsWith('pr merge')) };
}

afterEach(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true });
});

describe('scripts/merge-when-ready.sh', () => {
  it('waits while the branch policy blocks, then merges the exact head (regression)', () => {
    const r = run(['BLOCKED', 'BLOCKED', 'CLEAN']);
    expect(r.status).toBe(0);
    expect(r.merges).toEqual([
      'pr merge 76 --repo o/r --merge --match-head-commit abc123 --subject chore(release): sync (#76)',
    ]);
  });

  it('fails fast without merging on conflicts', () => {
    const r = run(['DIRTY']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('merge conflicts');
    expect(r.merges).toEqual([]);
  });

  it('gives up with an actionable error when still blocked after the wait', () => {
    const r = run(['BLOCKED']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('still BLOCKED');
    expect(r.merges).toEqual([]);
  });
});
