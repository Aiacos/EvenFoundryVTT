/**
 * Unit tests for the INV-1..5 verification suite orchestrator.
 *
 * Tests prove that each INV check correctly classifies pass / fail / skipped
 * without actually running the underlying commands (spawn is mocked).
 *
 * @see docs/architecture/INVARIANTS.md §1..§5
 * @see CLAUDE.md §Pre-bump checklist (INV-3 version-stamp anchors)
 *
 * Test IDs: IS-01..IS-08
 */

import { EventEmitter } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// -------------------------------------------------------------------------------------
// child_process.spawn mock — factory must be sync, no await inside
// -------------------------------------------------------------------------------------
vi.mock('node:child_process', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const EE = (require('node:events') as typeof import('node:events')).EventEmitter;

  const mockSpawn = vi.fn(
    (
      _cmd: string,
      _args: readonly string[],
      _opts?: unknown,
    ): ReturnType<typeof import('node:child_process').spawn> => {
      const emitter = new EE() as ReturnType<typeof import('node:child_process').spawn>;
      (
        emitter as unknown as { stdout: InstanceType<typeof EE>; stderr: InstanceType<typeof EE> }
      ).stdout = new EE();
      (
        emitter as unknown as { stdout: InstanceType<typeof EE>; stderr: InstanceType<typeof EE> }
      ).stderr = new EE();
      process.nextTick(() => emitter.emit('exit', 0));
      return emitter;
    },
  );

  return { spawn: mockSpawn };
});

// Mock fetch globally for INV-2 tests
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

// -------------------------------------------------------------------------------------
// Import after mocks are registered
// -------------------------------------------------------------------------------------
import * as childProcess from 'node:child_process';
import type { InvResult } from '../inv-suite.js';
import { formatTable, runInvSuite } from '../inv-suite.js';

// -------------------------------------------------------------------------------------
// Helper: configure spawn to exit with a given code
// -------------------------------------------------------------------------------------
function setSpawnExitCode(code: number): void {
  vi.mocked(childProcess.spawn).mockImplementation(
    (
      _cmd: string,
      _args: readonly string[],
      _opts?: unknown,
    ): ReturnType<typeof childProcess.spawn> => {
      const emitter = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
      (emitter as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stdout =
        new EventEmitter();
      (emitter as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stderr =
        new EventEmitter();
      process.nextTick(() => emitter.emit('exit', code));
      return emitter;
    },
  );
}

// -------------------------------------------------------------------------------------
// Helper: make minimal fake repo tree with controlled version stamps
// -------------------------------------------------------------------------------------
async function makeVersionDocs(opts: {
  readmeVersion?: string;
  specsHeaderVersion?: string;
  specsBootSplashVersion?: string;
  showcaseHeroVersion?: string;
  showcaseFooterVersion?: string;
  repoRoot: string;
}): Promise<void> {
  const {
    readmeVersion = 'v0.9.12',
    specsHeaderVersion = 'v0.9.12',
    specsBootSplashVersion = 'v0.9.12',
    showcaseHeroVersion = 'v0.9.12',
    showcaseFooterVersion = 'v0.9.12',
    repoRoot,
  } = opts;

  await mkdir(path.join(repoRoot, 'docs', 'showcase'), { recursive: true });

  // README.md — badge at line 1
  await writeFile(
    path.join(repoRoot, 'README.md'),
    `[![spec: ${readmeVersion}](https://img.shields.io/badge/spec-${readmeVersion}-blue)](Specs.md)\n`,
  );

  // Specs.md — header at line 9, boot-splash at line ~2606
  const specsLines: string[] = [];
  for (let i = 1; i <= 8; i++) specsLines.push(`spec preamble line ${i}`);
  specsLines.push(`# EvenFoundryVTT — Project Specification (${specsHeaderVersion})`);
  for (let i = 10; i <= 2605; i++) specsLines.push(`spec body line ${i}`);
  specsLines.push(
    `║                              EVENFOUNDRYVTT  ${specsBootSplashVersion}                                          ║`,
  );
  await writeFile(path.join(repoRoot, 'Specs.md'), specsLines.join('\n'));

  // docs/showcase/index.html
  await writeFile(
    path.join(repoRoot, 'docs', 'showcase', 'index.html'),
    [
      '<html><body>',
      `<div class="stat"><span class="num">${showcaseHeroVersion}</span><span class="lab">4 invariants</span></div>`,
      `<p>EvenFoundryVTT — design specification ${showcaseFooterVersion} (2026-05-14).</p>`,
      '</body></html>',
    ].join('\n'),
  );
}

// -------------------------------------------------------------------------------------
// Setup / teardown
// -------------------------------------------------------------------------------------
let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(tmpdir(), `inv-suite-test-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  setSpawnExitCode(0);
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

// =====================================================================================
// IS-01: runInvSuite returns exactly 5 results with INV-1..INV-5 ids
// =====================================================================================
describe('IS-01: suite shape', () => {
  it('returns { results: InvResult[], allGreen } with exactly 5 results (INV-1..INV-5)', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });

    const suite = await runInvSuite({ repoRoot: tmpDir });

    expect(suite).toHaveProperty('results');
    expect(suite).toHaveProperty('allGreen');
    expect(Array.isArray(suite.results)).toBe(true);
    expect(suite.results).toHaveLength(5);

    const ids = suite.results.map((r) => r.id);
    expect(ids).toEqual(['INV-1', 'INV-2', 'INV-3', 'INV-4', 'INV-5']);

    for (const r of suite.results) {
      expect(['green', 'red', 'skipped']).toContain(r.status);
      expect(typeof r.detail).toBe('string');
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });
});

// =====================================================================================
// IS-02: INV-1 check — fixture pass/fail detection
// =====================================================================================
describe('IS-02: INV-1 (layout integrity)', () => {
  it('is green when vitest run exits 0', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });
    setSpawnExitCode(0);

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv1 = suite.results.find((r) => r.id === 'INV-1');
    expect(inv1?.status).toBe('green');
  });

  it('is red when vitest run exits non-zero (fixture mismatch)', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });

    // Make INV-1's spawn (first spawn) fail; others succeed
    let callCount = 0;
    vi.mocked(childProcess.spawn).mockImplementation(
      (
        _cmd: string,
        _args: readonly string[],
        _opts?: unknown,
      ): ReturnType<typeof childProcess.spawn> => {
        const emitter = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
        (emitter as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stdout =
          new EventEmitter();
        (emitter as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stderr =
          new EventEmitter();
        const code = callCount === 0 ? 1 : 0;
        callCount++;
        process.nextTick(() => emitter.emit('exit', code));
        return emitter;
      },
    );

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv1 = suite.results.find((r) => r.id === 'INV-1');
    expect(inv1?.status).toBe('red');
    expect(suite.allGreen).toBe(false);
  });
});

// =====================================================================================
// IS-03: INV-2 check — network skip on absence, green on success
// =====================================================================================
describe('IS-03: INV-2 (online cross-validation)', () => {
  it('is green when canonical URL responds ok', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv2 = suite.results.find((r) => r.id === 'INV-2');
    expect(inv2?.status).toBe('green');
  });

  it('is skipped when fetch throws (network absent)', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });
    mockFetch.mockRejectedValue(new TypeError('fetch failed: network unreachable'));

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv2 = suite.results.find((r) => r.id === 'INV-2');
    expect(inv2?.status).toBe('skipped');
    expect(inv2?.detail).toContain('manually');
  });

  it('is skipped when skipInv2 opt is true (no fetch called)', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });

    const suite = await runInvSuite({ repoRoot: tmpDir, skipInv2: true });
    const inv2 = suite.results.find((r) => r.id === 'INV-2');
    expect(inv2?.status).toBe('skipped');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skipped INV-2 does NOT flip allGreen to false when others are green', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });
    mockFetch.mockRejectedValue(new TypeError('network absent'));

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv2 = suite.results.find((r) => r.id === 'INV-2');
    expect(inv2?.status).toBe('skipped');
    expect(suite.allGreen).toBe(true);
  });
});

// =====================================================================================
// IS-04: INV-3 check — version stamp coherence
// =====================================================================================
describe('IS-04: INV-3 (documentation coherence)', () => {
  it('is green when all 5 version stamps match', async () => {
    await makeVersionDocs({ repoRoot: tmpDir }); // all v0.9.12

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv3 = suite.results.find((r) => r.id === 'INV-3');
    expect(inv3?.status).toBe('green');
    expect(inv3?.detail).toContain('v0.9.12');
  });

  it('is red when boot-splash version diverges from header (Specs.md L2606 drift)', async () => {
    await makeVersionDocs({
      repoRoot: tmpDir,
      specsBootSplashVersion: 'v0.9.11', // drift!
    });

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv3 = suite.results.find((r) => r.id === 'INV-3');
    expect(inv3?.status).toBe('red');
    expect(inv3?.detail).toContain('v0.9.11');
  });

  it('is red when README badge diverges', async () => {
    await makeVersionDocs({
      repoRoot: tmpDir,
      readmeVersion: 'v0.9.10',
    });

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv3 = suite.results.find((r) => r.id === 'INV-3');
    expect(inv3?.status).toBe('red');
    expect(inv3?.detail).toContain('v0.9.10');
  });

  it('is red when showcase footer diverges from hero stat', async () => {
    await makeVersionDocs({
      repoRoot: tmpDir,
      showcaseFooterVersion: 'v0.9.11',
    });

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv3 = suite.results.find((r) => r.id === 'INV-3');
    expect(inv3?.status).toBe('red');
  });
});

// =====================================================================================
// IS-05: INV-4 check — biome ci + typecheck + dead-code grep
// =====================================================================================
describe('IS-05: INV-4 (code quality)', () => {
  it('is green when all spawn sub-checks exit 0', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv4 = suite.results.find((r) => r.id === 'INV-4');
    expect(inv4?.status).toBe('green');
  });

  it('is red when any spawn sub-check fails', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });
    setSpawnExitCode(1); // all spawns fail including INV-4 sub-checks

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv4 = suite.results.find((r) => r.id === 'INV-4');
    expect(inv4?.status).toBe('red');
    expect(suite.allGreen).toBe(false);
  });
});

// =====================================================================================
// IS-06: INV-5 check — gesture determinism + hook anchor
// =====================================================================================
describe('IS-06: INV-5 (gesture determinism)', () => {
  it('is green when cross-overlay vitest filter exits 0', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });
    setSpawnExitCode(0);

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv5 = suite.results.find((r) => r.id === 'INV-5');
    expect(inv5?.status).toBe('green');
  });

  it('IS-06-FALSE-PASS: is skipped (not green) when vitest exits 0 with "No test files found"', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });
    // The COR- vitest run (identified by the --testNamePattern COR- arg) exits 0
    // but emits the no-tests signal on stdout. vitest exits 0 on "no test files
    // found" → must NOT report green. All other spawns (incl. the grep anchor)
    // exit 0 normally.
    vi.mocked(childProcess.spawn).mockImplementation(
      (
        _cmd: string,
        args: readonly string[],
        _opts?: unknown,
      ): ReturnType<typeof childProcess.spawn> => {
        const emitter = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
        const stdout = new EventEmitter();
        const stderr = new EventEmitter();
        (emitter as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stdout = stdout;
        (emitter as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stderr = stderr;
        const isCorRun = args.includes('COR-');
        process.nextTick(() => {
          if (isCorRun) {
            stdout.emit('data', Buffer.from('No test files found, exiting with code 0\n'));
          }
          emitter.emit('exit', 0);
        });
        return emitter;
      },
    );

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv5 = suite.results.find((r) => r.id === 'INV-5');
    expect(inv5?.status).toBe('skipped');
  });
});

// =====================================================================================
// IS-07: allGreen semantics
// =====================================================================================
describe('IS-07: allGreen semantics', () => {
  it('is true when all 5 spawns succeed and INV-3 stamps match', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const suite = await runInvSuite({ repoRoot: tmpDir });
    expect(suite.allGreen).toBe(true);
  });

  it('is false when INV-3 has a stamp mismatch', async () => {
    await makeVersionDocs({
      repoRoot: tmpDir,
      specsBootSplashVersion: 'v0.9.11',
    });

    const suite = await runInvSuite({ repoRoot: tmpDir });
    expect(suite.allGreen).toBe(false);
  });

  it('is true when only INV-2 is skipped (network absent) and all others green', async () => {
    await makeVersionDocs({ repoRoot: tmpDir });
    mockFetch.mockRejectedValue(new TypeError('no network'));

    const suite = await runInvSuite({ repoRoot: tmpDir });
    const inv2 = suite.results.find((r) => r.id === 'INV-2');
    expect(inv2?.status).toBe('skipped');
    expect(suite.allGreen).toBe(true);
  });
});

// =====================================================================================
// IS-08: formatTable output format
// =====================================================================================
describe('IS-08: formatTable output', () => {
  it('returns header + 5 INV rows with ASCII status symbols (no ANSI escapes)', () => {
    const results: InvResult[] = [
      { id: 'INV-1', status: 'green', detail: 'all fixtures pass' },
      { id: 'INV-2', status: 'skipped', detail: 'run manually per CLAUDE.md §Pre-bump checklist' },
      { id: 'INV-3', status: 'green', detail: 'all 5 sites at v0.9.12' },
      { id: 'INV-4', status: 'red', detail: 'biome ci failed' },
      { id: 'INV-5', status: 'green', detail: 'COR tests pass; hook anchor found' },
    ];

    const table = formatTable(results);

    // Header line present
    expect(table).toContain('INV');
    expect(table).toContain('Status');
    expect(table).toContain('Detail');

    // 5 INV rows present (each appears once)
    for (const id of ['INV-1', 'INV-2', 'INV-3', 'INV-4', 'INV-5']) {
      expect(table).toContain(id);
    }

    // ASCII status symbols
    expect(table).toContain('green');
    expect(table).toContain('skipped');
    expect(table).toContain('red');

    // No ANSI color escape codes -- CI must stay clean
    // Check for ESC character (codepoint 27) to avoid biome noControlCharactersInRegex lint rule
    const hasEscapeChar = table.split('').some((c) => c.charCodeAt(0) === 27);
    expect(hasEscapeChar).toBe(false);
  });
});
