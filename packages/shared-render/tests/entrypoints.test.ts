/**
 * Entry-point hygiene (inventory H10, remote 9cb5130): the root barrel is imported by
 * the g2-app browser bundle, so it must never expose the test-only matchers (they pull
 * `vitest` + `node:fs`, which blank the real G2 WebView at boot). They live behind the
 * `./testing` subpath.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as root from '../src/index.js';
import * as testing from '../src/testing.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, unknown>;
};

describe('shared-render entry points', () => {
  it('keeps the test-only matchers out of the root barrel', () => {
    expect(Object.keys(root)).not.toContain('matchAsciiFixture');
    expect(Object.keys(root)).not.toContain('matchPixelFixture');
    expect(typeof root.pixmapGrid).toBe('function');
  });

  it('exposes the matchers from the ./testing subpath', () => {
    expect(typeof testing.matchAsciiFixture).toBe('function');
    expect(typeof testing.matchPixelFixture).toBe('function');
    expect(Object.keys(pkg.exports)).toEqual(
      expect.arrayContaining(['.', './ascii-grid', './testing']),
    );
  });

  it('never imports the test runner or node built-ins from browser-safe modules', () => {
    for (const file of ['index.ts', 'ascii-grid.ts', 'pixel/grid.ts', 'pixel/pixmap.ts']) {
      const src = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      expect(src, file).not.toMatch(/from '(vitest|node:[a-z]+)'|snapshot\.js|fixture\.js/);
    }
  });
});
