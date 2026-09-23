// @vitest-environment node
/**
 * Build test (inventory H10, remote 9cb5130): the real G2 WebView blanked at boot when
 * the bundle referenced `node:fs` (a test-only matcher leaked through a barrel). Builds
 * the g2 bundle exactly as `vite build` does (same config; only `outDir` redirected to a
 * temp dir) and asserts no chunk references Node built-ins or test tooling.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

const CONFIG = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
const FORBIDDEN = /node:fs|node:path|["']vitest["']|vitest\/|happy-dom|toMatchFileSnapshot/;

describe('g2 bundle', () => {
  let out: string | null = null;
  afterAll(async () => {
    if (out !== null) await rm(out, { recursive: true, force: true });
  });

  it('contains no node:fs, vitest or happy-dom reference', async () => {
    out = await mkdtemp(join(tmpdir(), 'evf-g2-bundle-'));
    await build({
      configFile: CONFIG,
      logLevel: 'silent',
      build: { outDir: out, emptyOutDir: true },
    });
    const assets = join(out, 'assets');
    const scripts = (await readdir(assets)).filter((f) => f.endsWith('.js'));
    expect(scripts.length).toBeGreaterThan(0);
    expect(await readdir(out)).toContain('index.html');
    for (const f of scripts) {
      const src = await readFile(join(assets, f), 'utf8');
      expect(FORBIDDEN.exec(src)?.[0] ?? null, f).toBeNull();
    }
  }, 60_000);
});
