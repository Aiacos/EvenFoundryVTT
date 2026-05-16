/**
 * Thin child_process.spawn wrapper for the INV suite.
 *
 * Resolves with captured stdout + stderr + exit code.
 * Supports AbortController-style timeout via opts.timeoutMs.
 *
 * Pattern mirrors scripts/run-all.ts (one process per check so a panic in one
 * check doesn't tank the runner — Phase 0 orchestrator precedent).
 */

import { spawn } from 'node:child_process';

export type SpawnResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SpawnOpts = {
  cwd: string;
  /** Milliseconds before the child process is killed and resolved with exitCode 1. */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

/**
 * Spawns a command and collects stdout + stderr.
 * On timeout kills the child and returns exitCode 1.
 */
export function runSpawn(cmd: string, args: string[], opts: SpawnOpts): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    let timedOut = false;
    const timer =
      opts.timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
          }, opts.timeoutMs)
        : undefined;

    child.on('exit', (code) => {
      if (timer !== undefined) clearTimeout(timer);
      resolve({
        exitCode: timedOut ? 1 : (code ?? 1),
        stdout: stdoutBuf,
        stderr: stderrBuf,
      });
    });

    child.on('error', (err) => {
      if (timer !== undefined) clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout: stdoutBuf,
        stderr: `spawn error: ${String(err)}`,
      });
    });
  });
}
