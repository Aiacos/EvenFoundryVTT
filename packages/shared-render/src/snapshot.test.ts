/**
 * Unit tests for the INV-1 `matchAsciiFixture` matcher — specifically the
 * anti-self-heal guard: a missing golden fixture must throw loudly instead of
 * letting Vitest's `toMatchFileSnapshot()` auto-generate (and pass) it locally.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AsciiGrid } from './ascii-grid.js';
import { matchAsciiFixture } from './snapshot.js';

const tmp = mkdtempSync(join(tmpdir(), 'evf-snapshot-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('matchAsciiFixture — anti-self-heal guard', () => {
  it('throws when the golden fixture is absent (does NOT auto-generate)', async () => {
    const grid = AsciiGrid.fromString('abc\ndef');
    const missing = join(tmp, 'does-not-exist.txt');
    await expect(matchAsciiFixture(grid, missing)).rejects.toThrow(/golden fixture missing/);
  });

  it('error message names the missing path and the INV-1 tag', async () => {
    const grid = AsciiGrid.fromString('x');
    const missing = join(tmp, 'still-absent.txt');
    await expect(matchAsciiFixture(grid, missing)).rejects.toThrow(/\[INV-1\]/);
  });

  it('passes when the golden fixture exists and matches', async () => {
    const grid = AsciiGrid.fromString('abc\ndef');
    const present = join(tmp, 'present.txt');
    // Golden is the serialized grid + trailing newline (matcher appends one).
    writeFileSync(present, 'abc\ndef\n');
    await expect(matchAsciiFixture(grid, present)).resolves.toBeUndefined();
  });
});
