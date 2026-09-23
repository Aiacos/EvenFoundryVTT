import { describe, expect, it } from 'vitest';
import { DEMO_MAP_URL, DEMO_TOKEN_ART, mapSnap } from './fixtures.js';
import { cryptLuma, demoArtDecoder, demoArtPicture } from './map-art.js';

describe('demo map art', () => {
  it('carves the crypt: dark rock, stone floor, bright masonry and columns', () => {
    expect(cryptLuma(2, 2)).toBeLessThan(80); // rock
    expect(cryptLuma(10.4, 16.4)).toBeGreaterThan(90); // floor
    expect(cryptLuma(9, 12)).toBeGreaterThan(150); // west wall
    expect(cryptLuma(11.15, 10)).toBeGreaterThan(220); // column
    expect(cryptLuma(18.3, 12.3)).toBeGreaterThan(90); // corridor floor
  });

  it('serves the scene and every fixture token at the requested size', async () => {
    const map = await demoArtDecoder({ url: DEMO_MAP_URL, width: 90, height: 60, fit: 'stretch' });
    expect([map.width, map.height, map.luma.length]).toEqual([90, 60, 5400]);
    expect(Math.min(...map.alpha)).toBe(255);
    for (const t of mapSnap().tokens) {
      expect(t.img).toBeDefined();
      const pic = demoArtPicture({ url: t.img ?? '', width: 12, height: 12, fit: 'stretch' });
      expect(pic?.alpha[0]).toBe(0); // round token: transparent corner
      expect(pic?.alpha[6 * 12 + 6]).toBe(255);
    }
    expect(Object.keys(DEMO_TOKEN_ART)).toHaveLength(4);
  });

  it('rejects unknown URLs (→ documented fallbacks)', async () => {
    await expect(
      demoArtDecoder({ url: 'nope.webp', width: 1, height: 1, fit: 'stretch' }),
    ).rejects.toThrow('nope.webp');
  });
});
