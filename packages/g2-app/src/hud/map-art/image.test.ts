import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtCache, type ArtImage, browserArtDecoder, rgbaToArt } from './image.js';

afterEach(() => vi.restoreAllMocks());

const tiny: ArtImage = { width: 1, height: 1, luma: Uint8Array.of(9), alpha: Uint8Array.of(255) };

describe('rgbaToArt', () => {
  it('keeps straight luminance and alpha', () => {
    const art = rgbaToArt(Uint8Array.of(255, 255, 255, 0, 255, 0, 0, 128), 2, 1);
    expect(Array.from(art.luma)).toEqual([255, 76]);
    expect(Array.from(art.alpha)).toEqual([0, 128]);
  });
});

describe('ArtCache', () => {
  it('decodes once per request, reports failures once, re-renders on settle', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const settled = vi.fn();
    const decode = vi.fn(async (req: { url: string }) => {
      if (req.url === 'bad') throw new Error('404');
      return tiny;
    });
    const cache = new ArtCache(decode, settled);
    const req = (url: string) => ({ url, width: 1, height: 1, fit: 'stretch' as const });
    expect(cache.get(req('a')).state).toBe('loading');
    expect(cache.get(req('bad')).state).toBe('loading');
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.get(req('a'))).toEqual({ state: 'ready', image: tiny });
    expect(cache.get(req('bad'))).toEqual({ state: 'failed' });
    expect(decode).toHaveBeenCalledTimes(2);
    expect(settled).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used entries beyond 64', async () => {
    const decode = vi.fn(async () => tiny);
    const cache = new ArtCache(decode, () => undefined);
    const req = (url: string) => ({ url, width: 1, height: 1, fit: 'stretch' as const });
    for (let i = 0; i < 65; i++) cache.get(req(`u${i}`));
    cache.get(req('u0'));
    expect(decode).toHaveBeenCalledTimes(66);
    // A decode settling after its entry was evicted is dropped silently.
    const late = new ArtCache(async () => tiny, vi.fn());
    for (let i = 0; i < 65; i++) late.get(req(`v${i}`));
    await Promise.resolve();
    await Promise.resolve();
    expect(late.get(req('v64')).state).toBe('ready');
  });
});

describe('browserArtDecoder', () => {
  function deps(ctx: unknown) {
    const close = vi.fn();
    return {
      close,
      d: {
        fetch: vi.fn(
          async () =>
            ({ ok: true, status: 200, blob: async () => new Blob() }) as unknown as Response,
        ),
        createImageBitmap: vi.fn(
          async () => ({ width: 200, height: 100, close }) as unknown as ImageBitmap,
        ),
        OffscreenCanvas: class {
          getContext() {
            return ctx;
          }
        } as unknown as new (
          w: number,
          h: number,
        ) => OffscreenCanvas,
      },
    };
  }

  it('fetches same-origin, stretches or centre-crops, smooths, keeps alpha', async () => {
    const drawImage = vi.fn();
    const ctx = {
      drawImage,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      getImageData: () => ({ data: Uint8ClampedArray.of(255, 255, 255, 10, 0, 0, 0, 255) }),
    };
    const { d, close } = deps(ctx);
    const art = await browserArtDecoder(d)({ url: 'm.webp', width: 2, height: 1, fit: 'stretch' });
    expect(d.fetch).toHaveBeenCalledWith('m.webp', { credentials: 'same-origin' });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 200, 100, 0, 0, 2, 1);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(close).toHaveBeenCalled();
    expect(Array.from(art.alpha)).toEqual([10, 255]);
    await browserArtDecoder(d)({ url: 't', width: 2, height: 2, fit: 'cover' });
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 50, 0, 100, 100, 0, 0, 2, 2);
  });

  it('rejects on HTTP errors and without a 2D context', async () => {
    const { d } = deps(null);
    await expect(
      browserArtDecoder(d)({ url: 'x', width: 1, height: 1, fit: 'stretch' }),
    ).rejects.toThrow('2d context');
    d.fetch.mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response);
    await expect(
      browserArtDecoder(d)({ url: 'x', width: 1, height: 1, fit: 'stretch' }),
    ).rejects.toThrow('404');
  });
});
