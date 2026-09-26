import type { AppImageAsset } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { BROWSER_DEPS, QrScanError, scanQr, toDataUrl } from './qr-scan.js';

const PHOTO: AppImageAsset = {
  path: '/tmp/p.jpg',
  name: 'p.jpg',
  mimeType: 'image/jpeg',
  size: 4,
  base64: 'AAAA',
};

const pixels = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

describe('QR scan (phone page)', () => {
  it('QS-01 builds a data URL from bare or prefixed base64', () => {
    expect(toDataUrl(PHOTO)).toBe('data:image/jpeg;base64,AAAA');
    expect(toDataUrl({ ...PHOTO, mimeType: '' })).toBe('data:image/jpeg;base64,AAAA');
    expect(toDataUrl({ ...PHOTO, base64: 'data:image/png;base64,BB' })).toBe(
      'data:image/png;base64,BB',
    );
  });

  it('QS-02 returns the QR text; null when the camera is cancelled', async () => {
    const decodeImage = vi.fn(async () => pixels);
    const readQr = vi.fn(async () => 'https://x/#evf=abc');
    const camera = { captureImageFromCamera: vi.fn(async () => PHOTO) };
    await expect(scanQr(camera, { decodeImage, readQr })).resolves.toBe('https://x/#evf=abc');
    expect(decodeImage).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA');
    camera.captureImageFromCamera.mockResolvedValueOnce(null as never);
    await expect(scanQr(camera, { decodeImage, readQr })).resolves.toBeNull();
  });

  it('QS-03 no QR in the photo → QrScanError(no-qr)', async () => {
    const camera = { captureImageFromCamera: async () => PHOTO };
    const deps = { decodeImage: async () => pixels, readQr: async () => null };
    await expect(scanQr(camera, deps)).rejects.toBeInstanceOf(QrScanError);
    await expect(scanQr(camera, { ...deps, readQr: async () => '' })).rejects.toMatchObject({
      reason: 'no-qr',
    });
  });

  it('QS-04 the lazy jsQR decoder finds nothing in a blank image', async () => {
    const blank = { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 };
    await expect(BROWSER_DEPS.readQr(blank)).resolves.toBeNull();
  });
});
