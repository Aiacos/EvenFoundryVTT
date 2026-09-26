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
  /** Decodes an image `data:` URL into RGBA pixels, downscaled to at most `maxSide`. */
  decodeImage(dataUrl: string, maxSide: number): Promise<Pixels>;
  /** Finds a QR in the pixels; returns its text or null. */
  readQr(pixels: Pixels): Promise<string | null>;
}

/** Why a scan produced no text. */
export class QrScanError extends Error {
  constructor(readonly reason: 'no-qr' | 'camera') {
    super(reason === 'camera' ? 'the camera is not available' : 'no QR code found in the photo');
    this.name = 'QrScanError';
  }
}

/**
 * Longest sides the photo is decoded at, tried in order until one reads. A phone photo of a
 * laptop screen carries sensor noise and moiré that defeat any single size: on 16 simulated
 * photos of the pairing QR (QR version 4 at 12–60 % of a 2016×1512 frame, blur + noise),
 * decoded by Chromium's canvas + jsQR, 1024 px alone read 7, the 1024 → 640 → 400 ladder 14
 * (the misses: a tiny *and* blurred QR). Measured 2026-09-26.
 */
export const SCAN_SIDES = [1024, 640, 400] as const;

/** The SDK's `base64` may be bare or already a `data:` URL. */
export function toDataUrl(asset: AppImageAsset): string {
  return asset.base64.startsWith('data:')
    ? asset.base64
    : `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
}

/**
 * Takes a photo and returns the text of the QR in it.
 *
 * @returns the QR text, or null when the camera returned no photo (cancelled)
 * @throws QrScanError('camera') when the camera cannot be used (e.g. no permission)
 * @throws QrScanError('no-qr') when the photo holds no readable QR at any size
 */
export async function scanQr(
  camera: CameraLike,
  deps: QrScanDeps = BROWSER_DEPS,
): Promise<string | null> {
  let photo: AppImageAsset | null;
  try {
    photo = await camera.captureImageFromCamera();
  } catch (err) {
    console.warn(`[phone] camera failed: ${String(err)}`);
    throw new QrScanError('camera');
  }
  if (photo === null) return null;
  const dataUrl = toDataUrl(photo);
  for (const side of SCAN_SIDES) {
    const text = await deps.readQr(await deps.decodeImage(dataUrl, side));
    if (text !== null && text !== '') return text;
  }
  throw new QrScanError('no-qr');
}

/** A 2D canvas: `OffscreenCanvas` where the WebView has it (iOS ≥ 16.4), else a DOM canvas. */
function canvas2d(width: number, height: number) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height).getContext('2d');
  }
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  return el.getContext('2d');
}

/** The Shape Detection API, where the WebView ships it (Chromium on Android); not in lib.dom. */
interface BarcodeDetectorLike {
  detect(image: ImageData): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/**
 * Browser implementations: `createImageBitmap` + canvas, then the platform QR detector when
 * present, else a lazily loaded `jsqr`.
 */
export const BROWSER_DEPS: QrScanDeps = {
  async decodeImage(dataUrl, maxSide) {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas2d(width, height);
    if (ctx === null) {
      bitmap.close();
      throw new Error('canvas 2d context unavailable');
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  },
  async readQr({ data, width, height }) {
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (Detector !== undefined) {
      try {
        const found = await new Detector({ formats: ['qr_code'] }).detect(
          new ImageData(data, width, height),
        );
        if (found[0] !== undefined) return found[0].rawValue;
      } catch (err) {
        // Degrade: some WebViews expose the class but not the QR format — jsQR below.
        console.warn(`[phone] BarcodeDetector failed, using jsQR: ${String(err)}`);
      }
    }
    const { default: jsQR } = await import('jsqr');
    return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  },
};
