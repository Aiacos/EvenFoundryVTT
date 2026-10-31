import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RELAY_MAX_FRAME_BYTES } from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';

describe('relay frame limit contract', () => {
  it('RELAY_MAX_FRAME_BYTES mirrors the Worker MAX_FRAME_BYTES (ASSET_DATA_MAX is sized on it)', () => {
    // The Worker has no dependencies, so the number is duplicated; read its source.
    const limits = readFileSync(
      fileURLToPath(new URL('../../relay/src/limits.ts', import.meta.url)),
      'utf8',
    );
    const worker = /export const MAX_FRAME_BYTES = ([\d_]+);/.exec(limits)?.[1];
    expect(Number(worker?.replaceAll('_', ''))).toBe(RELAY_MAX_FRAME_BYTES);
  });
});
