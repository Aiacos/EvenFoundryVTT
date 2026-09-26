/**
 * «Scansiona QR» on the phone page (ADR-0019 §Decision Outcome 6): the installed Even Hub
 * app cannot receive the pairing QR as a URL (no deep links — hub.evenrealities.com/docs/
 * reference/faq), so it takes a photo of the QR shown in Foundry and decodes it here.
 *
 * `captureImageFromCamera()` (Even Hub SDK ≥ 0.0.11, `camera` permission) returns the
 * photo as base64; the SDK has no QR decoder, so `jsqr` (Apache-2.0, pure JS) reads it.
 * The decoder is loaded lazily: it only costs bytes when the user actually scans.
 *
 * @see node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts — `captureImageFromCamera(): Promise<AppImageAsset | null>`
 * @see https://github.com/cozmo/jsQR
 */
import type { AppImageAsset } from '@evenrealities/even_hub_sdk';

/** The camera surface of the Even App bridge. */
export interface CameraLike {
  captureImageFromCamera(): Promise<AppImageAsset | null>;
}

/** Decoded pixels of a photo. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Collaborators of {@link scanQr} (browser implementations below; tests inject fakes). */
export interface QrScanDeps {
  /** Decodes an image `data:` URL into RGBA pixels (downscaled for speed). */
  decodeImage(dataUrl: string): Promise<Pixels>;
  /** Finds a QR in the pixels; returns its text or null. */
  readQr(pixels: Pixels): Promise<string | null>;
}

/** Why a scan produced no text. */
export class QrScanError extends Error {
  constructor(readonly reason: 'no-qr') {
    super('no QR code found in the photo');
    this.name = 'QrScanError';
  }
}

/** Longest side the photo is decoded at: plenty for a QR filling part of the frame. */
const MAX_SIDE = 1024;

/** The SDK's `base64` may be bare or already a `data:` URL. */
export function toDataUrl(asset: AppImageAsset): string {
  return asset.base64.startsWith('data:')
    ? asset.base64
    : `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
}

/**
 * Takes a photo and returns the text of the QR in it.
 *
 * @returns the QR text, or null when the user cancelled the camera
 * @throws QrScanError('no-qr') when the photo holds no readable QR
 */
export async function scanQr(
  camera: CameraLike,
  deps: QrScanDeps = BROWSER_DEPS,
): Promise<string | null> {
  const photo = await camera.captureImageFromCamera();
  if (photo === null) return null;
  const text = await deps.readQr(await deps.decodeImage(toDataUrl(photo)));
  if (text === null || text === '') throw new QrScanError('no-qr');
  return text;
}

/** Browser implementations: `createImageBitmap` + canvas, then a lazily loaded `jsqr`. */
export const BROWSER_DEPS: QrScanDeps = {
  async decodeImage(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      bitmap.close();
      throw new Error('OffscreenCanvas 2d context unavailable');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  },
  async readQr({ data, width, height }) {
    const { default: jsQR } = await import('jsqr');
    return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  },
};
