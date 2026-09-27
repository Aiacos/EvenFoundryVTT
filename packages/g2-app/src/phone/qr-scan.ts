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

/** The raw Even App call surface (public in the SDK: `EvenAppBridge.callEvenApp`). */
export interface EvenAppCaller {
  callEvenApp(method: string, params?: unknown): Promise<unknown>;
}

/** A decoded photo: size, and the pixels of a centred crop at a bounded size. */
export interface Photo {
  width: number;
  height: number;
  /**
   * RGBA pixels of the centred square crop of side `crop` × the shorter side (`1` = the
   * whole photo, not squared), downscaled so its longer side is at most `side`.
   */
  pixels(crop: number, side: number): Pixels;
  close(): void;
}

/** Collaborators of {@link scanQr} (browser implementations below; tests inject fakes). */
export interface QrScanDeps {
  /**
   * Decodes an image `data:` URL once.
   *
   * @throws QrScanError('format') when the platform cannot decode the image
   */
  load(dataUrl: string, mimeType: string): Promise<Photo>;
  /** Finds a QR in the pixels; returns its text or null. */
  readQr(pixels: Pixels): Promise<string | null>;
}

/** Why a scan produced no text; `detail` is a short, secret-free description for the UI. */
export class QrScanError extends Error {
  constructor(
    readonly reason: 'no-qr' | 'camera' | 'format',
    readonly detail = '',
  ) {
    super(
      reason === 'camera'
        ? `the camera is not available${detail ? ` (${detail})` : ''}`
        : reason === 'format'
          ? `the photo cannot be decoded${detail ? ` (${detail})` : ''}`
          : `no QR code found in the photo${detail ? ` (${detail})` : ''}`,
    );
    this.name = 'QrScanError';
  }
}

/**
 * Decode attempts, in order, until one reads: `[crop, side]` (see {@link Photo.pixels}).
 *
 * Measured 2026-09-27 on 840 simulated phone photos of the exact Foundry pairing QR
 * (12 MP, perspective, defocus, sensor noise, sub-pixel moiré, JPEG; delivered at 480 px
 * … 12 MP), decoded in Chromium with jsQR: the whole photo at 1024 → 640 → 400 read 580;
 * adding centred crops (the player aims at the QR) read 598 with no photo lost — as many
 * as zxing-cpp (609) without its ~1 MB of wasm. What decides is the QR's size in the photo:
 * ≥ 30 % of the width reads 94–100 %, 10 % only ~25 % — hence «Ingrandisci QR» in Foundry.
 */
export const SCAN_PLAN: ReadonlyArray<readonly [crop: number, side: number]> = [
  [1, 1024],
  [1, 640],
  [1, 400],
  [0.5, 1024],
  [0.5, 640],
  [0.3, 800],
];

/** How long the Even App may keep the camera open before the scan gives up. */
export const CAMERA_TIMEOUT_MS = 120_000;

/** The SDK's `base64` may be bare or already a `data:` URL. */
export function toDataUrl(asset: AppImageAsset): string {
  return asset.base64.startsWith('data:')
    ? asset.base64
    : `data:${asset.mimeType || sniffMime(asset.base64)};base64,${asset.base64}`;
}

/** Image type from the first bytes of a base64 payload (PNG / HEIC), JPEG otherwise. */
function sniffMime(base64: string): string {
  let head: string;
  try {
    head = atob(base64.slice(0, 16));
  } catch {
    return 'image/jpeg'; // not decodable base64: let the decoder report it
  }
  if (head.startsWith('\x89PNG')) return 'image/png';
  // ISO-BMFF: a `ftyp` box at byte 4 = HEIC/HEIF (iPhone photos).
  if (head.slice(4, 8) === 'ftyp') return 'image/heic';
  return 'image/jpeg';
}

/** A string that is a `data:` URL or plausibly bare base64 image data. */
function imageString(value: string): string | null {
  const v = value.trim();
  if (v.startsWith('data:image/')) return v;
  return v.length >= 64 && /^[A-Za-z0-9+/=\r\n]+$/.test(v) ? v.replace(/[\r\n]/g, '') : null;
}

/**
 * Reads the camera result the Even App returns, leniently: the SDK's own parser
 * (`appImageAssetFromJson`) drops the photo unless `path`, `name`, `mimeType`, `size` and
 * `base64` are all present; this accepts the same object, a JSON string of it, a partial
 * object with just `base64` (or `data`), and a bare base64 / `data:` string.
 *
 * @returns the photo, or null when there is none (cancelled / denied / empty)
 */
export function parsePhotoResult(raw: unknown): AppImageAsset | null {
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (text.startsWith('{')) {
      try {
        return parsePhotoResult(JSON.parse(text));
      } catch {
        return null; // not JSON and not image data: no photo
      }
    }
    const data = imageString(text);
    return data === null
      ? null
      : { path: '', name: '', mimeType: '', size: data.length, base64: data };
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const field = [o.base64, o.data, o.bytes].find((v): v is string => typeof v === 'string');
  const data = field === undefined ? null : imageString(field);
  if (data === null) return null;
  const mime = [o.mimeType, o.mime, o.type].find((v): v is string => typeof v === 'string');
  return {
    path: typeof o.path === 'string' ? o.path : '',
    name: typeof o.name === 'string' ? o.name : '',
    mimeType: mime ?? '',
    size: typeof o.size === 'number' ? o.size : data.length,
    base64: data,
  };
}

/** The Even App camera through {@link parsePhotoResult} instead of the SDK's strict parser. */
export function lenientCamera(bridge: EvenAppCaller): CameraLike {
  return {
    captureImageFromCamera: async () =>
      parsePhotoResult(await bridge.callEvenApp('captureImageFromCamera')),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${ms / 1000} s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** «4032×3024 · image/jpeg · 2.1 MB» — what a support screenshot needs, no image content. */
function describePhoto(photo: Photo, asset: AppImageAsset): string {
  const mb = (asset.base64.length * 0.75) / 1_048_576;
  return `${photo.width}×${photo.height} · ${asset.mimeType || sniffMime(asset.base64)} · ${mb.toFixed(1)} MB`;
}

/**
 * Takes a photo and returns the text of the QR in it.
 *
 * @returns the QR text, or null when the camera returned no photo (cancelled)
 * @throws QrScanError('camera') when the camera fails or does not answer in
 *   {@link CAMERA_TIMEOUT_MS}
 * @throws QrScanError('format') when the photo cannot be decoded
 * @throws QrScanError('no-qr') when no step of {@link SCAN_PLAN} reads a QR (detail: size,
 *   type and weight of the photo)
 */
export async function scanQr(
  camera: CameraLike,
  deps: QrScanDeps = BROWSER_DEPS,
  timeoutMs = CAMERA_TIMEOUT_MS,
): Promise<string | null> {
  let asset: AppImageAsset | null;
  try {
    asset = await withTimeout(camera.captureImageFromCamera(), timeoutMs);
  } catch (err) {
    console.warn(`[phone] camera failed: ${String(err)}`);
    throw new QrScanError('camera', String(err).replace(/^Error: /, ''));
  }
  if (asset === null) return null;
  const photo = await deps.load(toDataUrl(asset), asset.mimeType || sniffMime(asset.base64));
  try {
    for (const [crop, side] of SCAN_PLAN) {
      const text = await deps.readQr(photo.pixels(crop, side));
      if (text !== null && text !== '') return text;
    }
    const detail = describePhoto(photo, asset);
    console.warn(`[phone] scan: no QR in the photo (${detail}) after ${SCAN_PLAN.length} attempts`);
    throw new QrScanError('no-qr', detail);
  } finally {
    photo.close();
  }
}

type Drawable = ImageBitmap | HTMLImageElement;

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

/** Decodes through `<img>`: WebKit reads HEIC there even when `createImageBitmap` cannot. */
async function imageElement(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return img;
}

/** Source rectangle and output size of {@link Photo.pixels} (pure; see {@link SCAN_PLAN}). */
export function cropRect(width: number, height: number, crop: number, side: number) {
  const sw = crop >= 1 ? width : Math.round(Math.min(width, height) * crop);
  const sh = crop >= 1 ? height : sw;
  const scale = Math.min(1, side / Math.max(sw, sh));
  return {
    sx: Math.round((width - sw) / 2),
    sy: Math.round((height - sh) / 2),
    sw,
    sh,
    w: Math.max(1, Math.round(sw * scale)),
    h: Math.max(1, Math.round(sh * scale)),
  };
}

function photoOf(source: Drawable, width: number, height: number): Photo {
  return {
    width,
    height,
    pixels(crop, side) {
      const r = cropRect(width, height, crop, side);
      const ctx = canvas2d(r.w, r.h);
      if (ctx === null) throw new Error('canvas 2d context unavailable');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, 0, 0, r.w, r.h);
      return { data: ctx.getImageData(0, 0, r.w, r.h).data, width: r.w, height: r.h };
    },
    close() {
      if ('close' in source) source.close();
    },
  };
}

/** The Shape Detection API, where the WebView ships it (Chromium on Android); not in lib.dom. */
interface BarcodeDetectorLike {
  detect(image: ImageData): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/**
 * Browser implementations: `createImageBitmap` (else `<img>`) + canvas, then the platform
 * QR detector when present, else a lazily loaded `jsqr`.
 */
export const BROWSER_DEPS: QrScanDeps = {
  async load(dataUrl, mimeType) {
    let bitmapError: unknown;
    try {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      return photoOf(bitmap, bitmap.width, bitmap.height);
    } catch (err) {
      bitmapError = err; // e.g. HEIC on a WebView whose createImageBitmap lacks it
    }
    try {
      const img = await imageElement(dataUrl);
      return photoOf(img, img.naturalWidth, img.naturalHeight);
    } catch (err) {
      console.warn(
        `[phone] photo not decodable (${mimeType}): ${String(bitmapError)} / ${String(err)}`,
      );
      throw new QrScanError('format', mimeType);
    }
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
