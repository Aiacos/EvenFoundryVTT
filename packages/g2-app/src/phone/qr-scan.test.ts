import type { AppImageAsset } from '@evenrealities/even_hub_sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_DEPS,
  CAMERA_TIMEOUT_MS,
  cropRect,
  lenientCamera,
  type Photo,
  parsePhotoResult,
  QrScanError,
  SCAN_PLAN,
  scanQr,
  toDataUrl,
} from './qr-scan.js';

/** 96 chars of base64 JPEG-ish data (starts like a JPEG: `/9j/`). */
const JPEG_B64 = `/9j/${'A'.repeat(92)}`;
const PNG_B64 = `iVBORw0KGgo${'A'.repeat(85)}`;
const HEIC_B64 = `AAAAHGZ0eXBoZWlj${'A'.repeat(80)}`;

const PHOTO: AppImageAsset = {
  path: '/tmp/p.jpg',
  name: 'p.jpg',
  mimeType: 'image/jpeg',
  size: 72,
  base64: JPEG_B64,
};

const pixels = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

/** A fake decoded photo that records every crop it is asked for. */
function fakePhoto(width = 4032, height = 3024) {
  const asked: Array<[number, number]> = [];
  const photo: Photo & { asked: typeof asked; closed: boolean } = {
    width,
    height,
    asked,
    closed: false,
    pixels(crop, side) {
      asked.push([crop, side]);
      return pixels;
    },
    close() {
      photo.closed = true;
    },
  };
  return photo;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('QR scan (phone page)', () => {
  it('QS-01 builds a data URL from bare or prefixed base64, sniffing the type when missing', () => {
    expect(toDataUrl(PHOTO)).toBe(`data:image/jpeg;base64,${JPEG_B64}`);
    expect(toDataUrl({ ...PHOTO, mimeType: '', base64: PNG_B64 })).toMatch(/^data:image\/png;/);
    expect(toDataUrl({ ...PHOTO, mimeType: '', base64: HEIC_B64 })).toMatch(/^data:image\/heic;/);
    expect(toDataUrl({ ...PHOTO, base64: 'data:image/png;base64,BB' })).toBe(
      'data:image/png;base64,BB',
    );
  });

  it('QS-02 returns the QR text; null when the camera is cancelled', async () => {
    const photo = fakePhoto();
    const load = vi.fn(async () => photo);
    const readQr = vi.fn(async () => 'https://x/#c=7QK3MX9P2HRAC4TE');
    const camera = { captureImageFromCamera: vi.fn(async () => PHOTO) };
    await expect(scanQr(camera, { load, readQr })).resolves.toBe('https://x/#c=7QK3MX9P2HRAC4TE');
    expect(load).toHaveBeenCalledWith(`data:image/jpeg;base64,${JPEG_B64}`, 'image/jpeg');
    expect(photo.closed).toBe(true);
    camera.captureImageFromCamera.mockResolvedValueOnce(null as never);
    await expect(scanQr(camera, { load, readQr })).resolves.toBeNull();
  });

  it('QS-03 no QR at any step → QrScanError(no-qr) naming size, type and weight', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const photo = fakePhoto();
    const camera = { captureImageFromCamera: async () => PHOTO };
    const err = await scanQr(camera, { load: async () => photo, readQr: async () => '' }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(QrScanError);
    expect(err).toMatchObject({ reason: 'no-qr' });
    expect((err as QrScanError).detail).toMatch(/^4032×3024 · image\/jpeg · 0\.0 MB$/);
    expect(photo.closed).toBe(true);
  });

  it('QS-05 walks SCAN_PLAN (whole photo, then centred crops) until one step reads', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const photo = fakePhoto();
    const readQr = vi.fn(async () => null as string | null);
    readQr.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    readQr.mockResolvedValueOnce('https://x/#c=7QK3MX9P2HRAC4TE');
    const camera = { captureImageFromCamera: async () => PHOTO };
    await expect(scanQr(camera, { load: async () => photo, readQr })).resolves.toBe(
      'https://x/#c=7QK3MX9P2HRAC4TE',
    );
    expect(photo.asked).toEqual(SCAN_PLAN.slice(0, 4).map(([c, s]) => [c, s]));
    const all = fakePhoto();
    await expect(
      scanQr(camera, { load: async () => all, readQr: async () => null }),
    ).rejects.toMatchObject({ reason: 'no-qr' });
    expect(all.asked).toEqual(SCAN_PLAN.map(([c, s]) => [c, s]));
    expect(SCAN_PLAN.some(([crop]) => crop < 1)).toBe(true);
  });

  it('QS-06 a camera that fails → QrScanError(camera) with the cause', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const camera = {
      captureImageFromCamera: async () => {
        throw new Error('permission denied');
      },
    };
    const deps = { load: async () => fakePhoto(), readQr: async () => 'x' };
    await expect(scanQr(camera, deps)).rejects.toMatchObject({
      reason: 'camera',
      detail: 'permission denied',
    });
  });

  it('QS-07 a camera that never answers gives up after CAMERA_TIMEOUT_MS (button not stuck)', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const camera = { captureImageFromCamera: () => new Promise<AppImageAsset | null>(() => {}) };
    const scan = scanQr(camera, { load: async () => fakePhoto(), readQr: async () => 'x' });
    const settled = expect(scan).rejects.toMatchObject({ reason: 'camera' });
    await vi.advanceTimersByTimeAsync(CAMERA_TIMEOUT_MS);
    await settled;
  });

  it('QS-08 a photo the platform cannot decode surfaces QrScanError(format)', async () => {
    const camera = { captureImageFromCamera: async () => ({ ...PHOTO, mimeType: 'image/heic' }) };
    const load = async () => {
      throw new QrScanError('format', 'image/heic');
    };
    await expect(scanQr(camera, { load, readQr: async () => 'x' })).rejects.toMatchObject({
      reason: 'format',
      detail: 'image/heic',
    });
  });

  it('QS-04 the lazy jsQR decoder finds nothing in a blank image', async () => {
    const blank = { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 };
    await expect(BROWSER_DEPS.readQr(blank)).resolves.toBeNull();
  });
});

describe('cropRect', () => {
  it('whole photo keeps the aspect; centred square crops of the shorter side', () => {
    expect(cropRect(4032, 3024, 1, 1024)).toEqual({
      sx: 0,
      sy: 0,
      sw: 4032,
      sh: 3024,
      w: 1024,
      h: 768,
    });
    expect(cropRect(4032, 3024, 0.5, 1024)).toEqual({
      sx: 1260,
      sy: 756,
      sw: 1512,
      sh: 1512,
      w: 1024,
      h: 1024,
    });
    // Never upscales: a small crop keeps its own pixels.
    expect(cropRect(1080, 810, 0.3, 800)).toEqual({
      sx: 419,
      sy: 284,
      sw: 243,
      sh: 243,
      w: 243,
      h: 243,
    });
  });
});

describe('parsePhotoResult (lenient host result)', () => {
  it('accepts the SDK shape, a partial object, a JSON string and bare / data-URL strings', () => {
    expect(parsePhotoResult(PHOTO)).toEqual(PHOTO);
    expect(parsePhotoResult({ base64: JPEG_B64 })).toMatchObject({
      base64: JPEG_B64,
      mimeType: '',
    });
    expect(parsePhotoResult({ data: PNG_B64, mime: 'image/png' })).toMatchObject({
      base64: PNG_B64,
      mimeType: 'image/png',
    });
    expect(
      parsePhotoResult(JSON.stringify({ base64: JPEG_B64, mimeType: 'image/jpeg' })),
    ).toMatchObject({
      base64: JPEG_B64,
    });
    expect(parsePhotoResult(JPEG_B64)).toMatchObject({ base64: JPEG_B64 });
    expect(parsePhotoResult(`${JPEG_B64.slice(0, 40)}\n${JPEG_B64.slice(40)}`)).toMatchObject({
      base64: JPEG_B64,
    });
    expect(parsePhotoResult('data:image/png;base64,BB')).toMatchObject({
      base64: 'data:image/png;base64,BB',
    });
  });

  it('no photo: null, undefined, empty, cancelled shapes, non-image text', () => {
    for (const raw of [
      null,
      undefined,
      '',
      '   ',
      {},
      { base64: '' },
      { base64: 42 },
      'cancelled',
      '{oops',
      17,
      true,
    ]) {
      expect(parsePhotoResult(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it('lenientCamera calls the raw host method and parses its answer', async () => {
    const bridge = { callEvenApp: vi.fn(async () => ({ base64: JPEG_B64 })) };
    await expect(lenientCamera(bridge).captureImageFromCamera()).resolves.toMatchObject({
      base64: JPEG_B64,
    });
    expect(bridge.callEvenApp).toHaveBeenCalledWith('captureImageFromCamera');
    bridge.callEvenApp.mockResolvedValueOnce(null as never);
    await expect(lenientCamera(bridge).captureImageFromCamera()).resolves.toBeNull();
  });
});
