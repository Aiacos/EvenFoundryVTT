// @vitest-environment node
/**
 * Even Hub manifest (inventory H13, remote 1fb33ce): `app.json` needs `description`,
 * `icon` (shipped from `src/public/`), no `min_app_version` (optional since SDK 0.0.14 —
 * the packer stamps the SDK floor, hub.evenrealities.com/docs/ship/packaging), a
 * `min_sdk_version` equal to the
 * SDK the bundle is built against, and a `version` equal to the package version (local
 * `.ehpk` packs are rejected otherwise — `scripts/sync-app-json.mjs` keeps it in sync).
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) =>
  JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) as Record<string, unknown>;
const app = read('../app.json');
const pkg = read('../package.json') as {
  version: string;
  dependencies: Record<string, string>;
};

describe('app.json', () => {
  it('matches the package version and the SDK dependency', () => {
    expect(app.version).toBe(pkg.version);
    expect(app.min_sdk_version).toBe(pkg.dependencies['@evenrealities/even_hub_sdk']);
    expect(app.entrypoint).toBe('index.html');
  });

  it('declares the store metadata and ships the icon', () => {
    expect(typeof app.description).toBe('string');
    expect((app.description as string).length).toBeGreaterThan(20);
    // Omitted on purpose: a value below the SDK floor is replaced by the packer with a warning.
    expect(app.min_app_version).toBeUndefined();
    expect(app.icon).toBe('icon.png');
    expect(existsSync(new URL('../src/public/icon.png', import.meta.url))).toBe(true);
  });
});
