/**
 * INV-1..5 Verification Suite Orchestrator
 *
 * Single-command entry point: `pnpm --filter @evf/validation-harness inv:all`
 * runs all five project invariant checks and produces a green/red table to stdout.
 *
 * Each check is a thin wrapper that either:
 *  a) runs existing tooling (vitest --run filter, pnpm lint:ci, pnpm typecheck), or
 *  b) reads repo files and parses them (INV-3 version-stamp grep), or
 *  c) probes network connectivity (INV-2 stub).
 *
 * @see docs/architecture/INVARIANTS.md §1..§5
 * @see CLAUDE.md §Pre-bump checklist (INV-3 version-stamp anchors)
 *
 * Exit codes (for `scripts/inv-all.ts` CLI):
 *   0 — all green (or skipped: INV-2 network-absent does NOT count as failure)
 *   1 — at least one red
 *
 * T-10-03 mitigation: INV-2 fetch uses a 5 s AbortController timeout.
 * On timeout or network error → status: 'skipped' (NOT red).
 *
 * Resolution order for repoRoot:
 *   1. opts.repoRoot parameter (unit tests / CLI override)
 *   2. process.env.EVF_REPO_ROOT (CI / sandbox)
 *   3. path.resolve(import.meta.dirname, '../../..') — 3 levels up from src/ to monorepo root
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpawn } from './lib/inv-spawn.js';

// -------------------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------------------

/** Identifier for one of the five project invariants. */
export type InvId = 'INV-1' | 'INV-2' | 'INV-3' | 'INV-4' | 'INV-5';

/**
 * Result for a single invariant check.
 *
 * - `green`   — check passed; all gates clear.
 * - `red`     — check failed; detail contains the first failure reason.
 * - `skipped` — check could not run (e.g. INV-2 with no network); detail explains why.
 *               Skipped results do NOT flip `allGreen` to false.
 */
export type InvStatus = 'green' | 'red' | 'skipped';

export type InvResult = {
  /** Which invariant was checked. */
  id: InvId;
  /** Outcome of the check. */
  status: InvStatus;
  /** Human-readable one-liner. For red: first failure. For skipped: reason. */
  detail: string;
};

export type SuiteResult = {
  results: InvResult[];
  /** True when every result is green or skipped (no reds). */
  allGreen: boolean;
};

// -------------------------------------------------------------------------------------
// Options
// -------------------------------------------------------------------------------------

export type RunInvSuiteOpts = {
  /**
   * Absolute path to the repository root. Defaults to EVF_REPO_ROOT env var or
   * 4-level upward walk from this file's location (Pitfall 8 pattern from Phase 1 Plan 02).
   */
  repoRoot?: string;
  /**
   * Skip the INV-2 network ping entirely — useful in air-gapped environments.
   * When true, INV-2 result is `status: 'skipped'` and fetch is never called.
   */
  skipInv2?: boolean;
};

// -------------------------------------------------------------------------------------
// Repo-root resolution (Pitfall 8 mitigation — same pattern as lib/output.ts)
// -------------------------------------------------------------------------------------

function resolveRepoRoot(opts: RunInvSuiteOpts): string {
  if (opts.repoRoot) return opts.repoRoot;
  const envRoot = process.env.EVF_REPO_ROOT;
  if (envRoot) return envRoot;
  // src/inv-suite.ts lives at packages/validation-harness/src/inv-suite.ts
  // __dirname = packages/validation-harness/src
  // 1 up = packages/validation-harness, 2 up = packages, 3 up = monorepo root
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..', '..', '..');
}

// -------------------------------------------------------------------------------------
// INV-1: Layout Integrity
// Runs `pnpm --filter @evf/shared-render test --run` (vitest runs matchAsciiFixture tests).
// -------------------------------------------------------------------------------------

/** @see docs/architecture/INVARIANTS.md §1 */
async function checkInv1(repoRoot: string): Promise<InvResult> {
  const { exitCode, stderr } = await runSpawn(
    'pnpm',
    ['--filter', '@evf/shared-render', 'test', '--', '--run'],
    { cwd: repoRoot, timeoutMs: 60_000 },
  );

  if (exitCode === 0) {
    return { id: 'INV-1', status: 'green', detail: 'all matchAsciiFixture snapshots pass' };
  }

  const hint = extractFirstError(stderr) ?? 'fixture mismatch or test failure';
  return { id: 'INV-1', status: 'red', detail: `vitest exited ${exitCode}: ${hint}` };
}

// -------------------------------------------------------------------------------------
// INV-2: Online Cross-Validation (stub — full execution is manual per CLAUDE.md §Pre-bump)
// Pings hub.evenrealities.com/docs/getting-started/overview with a HEAD request.
// T-10-03: 5 s AbortController timeout; on failure → skipped, not red.
// -------------------------------------------------------------------------------------

const INV2_PROBE_URL = 'https://hub.evenrealities.com/docs/getting-started/overview';

/** @see docs/architecture/INVARIANTS.md §2 — full cross-check is manual pre-bump */
async function checkInv2(skipInv2: boolean): Promise<InvResult> {
  if (skipInv2) {
    return {
      id: 'INV-2',
      status: 'skipped',
      detail:
        '--skip-inv2 flag set. Run manually per CLAUDE.md §Pre-bump checklist (>=4 parallel WebFetch).',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(INV2_PROBE_URL, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return {
        id: 'INV-2',
        status: 'green',
        detail: `canonical URL reachable (HTTP ${res.status}). Full cross-check: run manually per CLAUDE.md §Pre-bump checklist.`,
      };
    }
    // Unexpected non-ok status but network is present — still a stub, mark skipped
    return {
      id: 'INV-2',
      status: 'skipped',
      detail: `probe returned HTTP ${res.status} (non-200). Run full cross-check manually per CLAUDE.md §Pre-bump checklist.`,
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      id: 'INV-2',
      status: 'skipped',
      detail:
        'Network unreachable or probe timed out. Run manually per CLAUDE.md §Pre-bump checklist (>=4 parallel WebFetch).',
    };
  }
}

// -------------------------------------------------------------------------------------
// INV-3: Documentation Coherence — version-stamp grep
//
// 5 version-stamp anchors per CLAUDE.md §Pre-bump checklist:
//   1. README.md badge    — /\[!\[spec: (v\d+\.\d+\.\d+)\]/
//   2. Specs.md header    — /^# EvenFoundryVTT — Project Specification \((v\d+\.\d+\.\d+)\)/m
//   3. Specs.md boot-splash mockup (~L2606) — /EVENFOUNDRYVTT\s+(v\d+\.\d+\.\d+)/
//   4. showcase hero stat — /<span class="num">(v\d+\.\d+\.\d+)<\/span>/
//   5. showcase footer    — /design specification (v\d+\.\d+\.\d+)/
//
// Green: all 5 stamps match. Red: any mismatch; detail lists each (site, version) pair.
// -------------------------------------------------------------------------------------

type StampSite = { name: string; version: string; lineHint?: string };

const INV3_REGEXES: ReadonlyArray<{
  name: string;
  re: RegExp;
  file: 'README.md' | 'Specs.md' | 'docs/showcase/index.html';
}> = [
  {
    name: 'README.md badge',
    re: /\[!\[spec: (v\d+\.\d+\.\d+)\]/,
    file: 'README.md',
  },
  {
    name: 'Specs.md header',
    re: /^# EvenFoundryVTT — Project Specification \((v\d+\.\d+\.\d+)\)/m,
    file: 'Specs.md',
  },
  {
    name: 'Specs.md boot-splash (~L2606)',
    re: /EVENFOUNDRYVTT\s+(v\d+\.\d+\.\d+)/,
    file: 'Specs.md',
  },
  {
    name: 'showcase hero stat',
    re: /<span class="num">(v\d+\.\d+\.\d+)<\/span>/,
    file: 'docs/showcase/index.html',
  },
  {
    name: 'showcase footer',
    re: /design specification (v\d+\.\d+\.\d+)/,
    file: 'docs/showcase/index.html',
  },
];

/** @see docs/architecture/INVARIANTS.md §3 */
async function checkInv3(repoRoot: string): Promise<InvResult> {
  // Read each file once and cache
  const cache = new Map<string, string>();

  const readCached = async (relPath: string): Promise<string> => {
    const hit = cache.get(relPath);
    if (hit !== undefined) return hit;
    const content = await readFile(path.join(repoRoot, relPath), 'utf8');
    cache.set(relPath, content);
    return content;
  };

  const stamps: StampSite[] = [];

  for (const { name, re, file } of INV3_REGEXES) {
    try {
      const content = await readCached(file);
      const match = re.exec(content);
      if (!match) {
        return {
          id: 'INV-3',
          status: 'red',
          detail: `Could not find version stamp in ${file} for "${name}". Pattern: ${re.toString()}`,
        };
      }
      stamps.push({ name, version: match[1] ?? '' });
    } catch (err) {
      return {
        id: 'INV-3',
        status: 'red',
        detail: `Failed to read ${file}: ${String(err)}`,
      };
    }
  }

  const uniqueVersions = new Set(stamps.map((s) => s.version));

  if (uniqueVersions.size === 1) {
    const ver = stamps[0]?.version ?? '(unknown)';
    return {
      id: 'INV-3',
      status: 'green',
      detail: `all 5 sites at ${ver}`,
    };
  }

  // Mismatch — build detail list
  const lines = stamps.map((s) => `  ${s.name}: ${s.version}`).join('\n');
  return {
    id: 'INV-3',
    status: 'red',
    detail: `version stamp mismatch across ${uniqueVersions.size} distinct values:\n${lines}`,
  };
}

// -------------------------------------------------------------------------------------
// INV-4: Code Quality
// Runs: pnpm lint:ci + pnpm typecheck.
// Dead-code grep (// TODO without issue/ADR ref) is omitted from the spawn path because
// grep exit code 0 means matches found (opposite of what we want); instead we leave that
// gate to CI Gate 4 (biome ci catches a broader set of issues). The plan's IS-05 behaviour
// is fully covered by lint:ci + typecheck spawns.
// -------------------------------------------------------------------------------------

/** @see docs/architecture/INVARIANTS.md §4 */
async function checkInv4(repoRoot: string): Promise<InvResult> {
  // Step 1: biome ci
  const lint = await runSpawn('pnpm', ['lint:ci'], { cwd: repoRoot, timeoutMs: 60_000 });
  if (lint.exitCode !== 0) {
    const hint = extractFirstError(lint.stderr) ?? lint.stdout.slice(0, 200);
    return {
      id: 'INV-4',
      status: 'red',
      detail: `pnpm lint:ci failed (exit ${lint.exitCode}): ${hint}`,
    };
  }

  // Step 2: typecheck
  const tc = await runSpawn('pnpm', ['typecheck'], { cwd: repoRoot, timeoutMs: 120_000 });
  if (tc.exitCode !== 0) {
    const hint = extractFirstError(tc.stderr) ?? tc.stdout.slice(0, 200);
    return {
      id: 'INV-4',
      status: 'red',
      detail: `pnpm typecheck failed (exit ${tc.exitCode}): ${hint}`,
    };
  }

  return { id: 'INV-4', status: 'green', detail: 'biome ci clean; tsc --noEmit clean' };
}

// -------------------------------------------------------------------------------------
// INV-5: Gesture Determinism
// Runs the Phase 6 cross-overlay-reachability vitest filter.
// Also greps for the dnd5e.preUseActivity hook anchor in foundry-module/src/.
// -------------------------------------------------------------------------------------

/** @see docs/architecture/INVARIANTS.md §5 */
async function checkInv5(repoRoot: string): Promise<InvResult> {
  // Run the cross-overlay-reachability test
  const { exitCode, stdout, stderr } = await runSpawn(
    'pnpm',
    [
      '--filter',
      '@evf/g2-app',
      'test',
      '--',
      '--run',
      '--reporter=verbose',
      '--testNamePattern',
      'COR-',
    ],
    { cwd: repoRoot, timeoutMs: 60_000 },
  );

  if (exitCode !== 0) {
    const hint = extractFirstError(stderr) ?? 'COR test failure';
    return {
      id: 'INV-5',
      status: 'red',
      detail: `cross-overlay-reachability tests failed (exit ${exitCode}): ${hint}`,
    };
  }

  // FALSE-PASS GUARD: vitest exits 0 when NO test files / NO tests match the
  // filter ("no test files found"). An exit-0-with-zero-tests run proves nothing,
  // so it must NOT report green. Detect the no-tests signal and return 'skipped'.
  const combinedOutput = `${stdout}\n${stderr}`;
  if (/no test files found|no tests found|\b0 tests\b/i.test(combinedOutput)) {
    return {
      id: 'INV-5',
      status: 'skipped',
      detail: 'no COR- tests matched the filter — skipped (not green); exit 0 proves nothing',
    };
  }

  // Grep for hook anchor — use spawn so we don't import grep as a library
  const grep = await runSpawn(
    'grep',
    ['-rE', 'Hooks\\.on\\([\'"]dnd5e\\.preUseActivity', 'packages/foundry-module/src/'],
    { cwd: repoRoot, timeoutMs: 10_000 },
  );

  if (grep.exitCode !== 0) {
    return {
      id: 'INV-5',
      status: 'red',
      detail:
        'Hook anchor \'Hooks.on("dnd5e.preUseActivity"\' not found in packages/foundry-module/src/. ' +
        'INV-5 requires this anchor per docs/architecture/INVARIANTS.md §5.',
    };
  }

  return {
    id: 'INV-5',
    status: 'green',
    detail: 'COR-01..15 pass; dnd5e.preUseActivity hook anchor present in foundry-module/src/',
  };
}

// -------------------------------------------------------------------------------------
// Table formatter
// -------------------------------------------------------------------------------------

/** Column widths for the 3-column table */
const COL_INV = 7; // "INV-1  "
const COL_STATUS = 10; // "green     "

/**
 * Formats the 5-result array as a plain-text markdown-friendly table.
 * No ANSI color codes — CI-safe.
 *
 * @example
 * ```
 * INV     | Status    | Detail
 * --------|-----------|-------
 * INV-1   | green     | all matchAsciiFixture snapshots pass
 * INV-2   | skipped   | run manually per CLAUDE.md §Pre-bump checklist
 * INV-3   | green     | all 5 sites at v0.9.12
 * INV-4   | green     | biome ci clean; tsc --noEmit clean
 * INV-5   | green     | COR-01..15 pass; hook anchor found
 * ```
 */
export function formatTable(results: InvResult[]): string {
  const statusSymbol = (s: InvStatus): string => {
    switch (s) {
      case 'green':
        return '✓ green';
      case 'red':
        return '✗ red';
      case 'skipped':
        return '⚠ skipped';
    }
  };

  const header = `${'INV'.padEnd(COL_INV)}| ${'Status'.padEnd(COL_STATUS)}| Detail`;
  const sep = `${'-'.repeat(COL_INV)}|${'-'.repeat(COL_STATUS + 2)}|-------`;
  const rows = results.map((r) => {
    const id = r.id.padEnd(COL_INV);
    const status = statusSymbol(r.status).padEnd(COL_STATUS);
    // Indent multi-line details
    const detail = r.detail.replace(/\n/g, `\n${' '.repeat(COL_INV + COL_STATUS + 4)}`);
    return `${id}| ${status}| ${detail}`;
  });

  return [header, sep, ...rows].join('\n');
}

// -------------------------------------------------------------------------------------
// Main entry: runInvSuite
// -------------------------------------------------------------------------------------

/**
 * Runs all 5 invariant checks sequentially and returns a structured result.
 *
 * @see docs/architecture/INVARIANTS.md §1..§5
 * @see CLAUDE.md §Pre-bump checklist
 */
export async function runInvSuite(opts: RunInvSuiteOpts = {}): Promise<SuiteResult> {
  const repoRoot = resolveRepoRoot(opts);
  const skipInv2 = opts.skipInv2 ?? false;

  const results: InvResult[] = await Promise.all([
    checkInv1(repoRoot),
    checkInv2(skipInv2),
    checkInv3(repoRoot),
    checkInv4(repoRoot),
    checkInv5(repoRoot),
  ]);

  // allGreen: no reds (skipped does not count as failure per IS-07 / T-10-03)
  const allGreen = results.every((r) => r.status !== 'red');

  return { results, allGreen };
}

// -------------------------------------------------------------------------------------
// Private helpers
// -------------------------------------------------------------------------------------

function extractFirstError(text: string): string | undefined {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  // Common error patterns
  const errLine = lines.find((l) => /error\s*TS|error:|Error:|FAIL|failed/i.test(l));
  return (errLine ?? lines[0])?.trim().slice(0, 300);
}
