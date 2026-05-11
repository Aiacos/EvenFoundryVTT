// JSON+CSV evidence writer (D-07). Filename pattern: {test_id}-{env?}-{ISO8601}.json
// Path: repo-root docs/perf/phase-0/ (Pitfall 8 mitigation per .planning/phases/01-foundation/
// 01-RESEARCH.md Pitfall 8 + Open Question 8 — after the Phase 0 → packages/validation-harness/
// fold-in this file lives 4 levels deep from repo root, so cwd-relative paths would silently
// write to packages/validation-harness/docs/perf/phase-0/ instead of the canonical repo-root
// location cited by ADR-0005 / ADR-0006).
//
// Resolution order:
//   1. process.env.EVF_REPO_ROOT (CI / sandbox override)
//   2. path.resolve(import.meta.dirname, '../../../..') — 4 levels up from src/lib/output.ts
//
// Zod-validated payload only — refuses anything that doesn't conform to AnyResult.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'csv-stringify/sync';
import type { AnyResult } from './schemas.js';

/**
 * Pure helper exposed for unit testing (Pitfall 8 smoke test).
 * Computes the absolute repo-root path given an env snapshot + the current module's directory.
 *
 * EVF_REPO_ROOT env var takes priority (CI / sandbox); otherwise walk 4 levels up
 * from src/lib/output.ts to reach repo root.
 */
export function computeRepoRoot(env: NodeJS.ProcessEnv, currentDir: string): string {
  const override = env['EVF_REPO_ROOT'];
  if (override !== undefined && override !== '') return override;
  // currentDir is packages/validation-harness/src/lib → 4 levels up = repo root
  return path.resolve(currentDir, '..', '..', '..', '..');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = computeRepoRoot(process.env, __dirname);

/** Resolved evidence directory — exported for the path-resolution smoke test (Pitfall 8). */
export const OUTPUT_DIR = path.join(REPO_ROOT, 'docs', 'perf', 'phase-0');

function safeFilename(payload: AnyResult): string {
  const tsSafe = payload.timestamp.replace(/[:.]/g, '-');
  const envPart = payload.env ? `-${payload.env}` : '';
  return `${payload.test_id}${envPart}-${tsSafe}`;
}

export async function writeJsonEvidence(payload: AnyResult): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const fname = `${safeFilename(payload)}.json`;
  const fpath = path.join(OUTPUT_DIR, fname);
  await writeFile(fpath, JSON.stringify(payload, null, 2), 'utf8');
  return fpath;
}

// CSV emitted only for tests with `samples_kbps` numeric arrays (BLE, DLE).
// Other tests skip CSV (no array data to flatten).
export async function writeCsvEvidence(payload: AnyResult): Promise<string | null> {
  if (!('samples_kbps' in payload)) return null;
  const samples = payload.samples_kbps;
  if (!Array.isArray(samples) || samples.length === 0) return null;
  await mkdir(OUTPUT_DIR, { recursive: true });
  const fname = `${safeFilename(payload)}.csv`;
  const fpath = path.join(OUTPUT_DIR, fname);
  const rows = samples.map((kbps, i) => ({ sample_idx: i, kbps }));
  const csv = stringify(rows, { header: true, columns: ['sample_idx', 'kbps'] });
  await writeFile(fpath, csv, 'utf8');
  return fpath;
}
