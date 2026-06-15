/**
 * VT323 font loader — loads the VT323 pixel font from the bundled WOFF2 asset
 * before the first canvas frame is rendered.
 *
 * The font URL is resolved at bundle time via the Vite `?url` import suffix,
 * so the path is a hashed asset URL that is never user-controlled (T-20-FONT
 * mitigation — RFONT-01 input-validation requirement).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1)
 * @see .planning/phases/EVF-20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline/20-RESEARCH.md
 *   (§Pattern 1: FontFace + self.fonts.add)
 */

// Vite ?url import resolves the asset to a hashed URL at bundle time — never
// built from user input, satisfying the T-20-FONT threat-model mitigation (RFONT-01).
import fontUrl from '@fontsource/vt323/files/vt323-latin-400-normal.woff2?url';

/**
 * Ensure the VT323 pixel font is loaded in the current rendering context
 * (canvas Worker or WebView main thread) before the first frame is painted.
 *
 * Loads `@fontsource/vt323` via the `FontFace` API and registers it with
 * `self.fonts`. If loading fails for any reason — including environments where
 * `self.fonts` (`FontFaceSet`) is unavailable, such as the happy-dom test
 * environment or iOS 16 WKWebView workers — the function returns `'16px monospace'`
 * as a safe fallback. The function NEVER throws.
 *
 * # Fallback contract (RFONT-01 SC1)
 *
 * - On success: returns `'16px VT323'` — the `ctx.font` value for the pixel font.
 * - On any failure: returns `'16px monospace'` — a universally-available font.
 *
 * The returned string is suitable for direct assignment to `CanvasRenderingContext2D.font`
 * (or `OffscreenCanvasRenderingContext2D.font`).
 *
 * # Usage
 *
 * Call this function once from `CanvasLayer.attachCanvas()` before the first
 * `composite()` / `paint()` call. The returned font-family string should be
 * stored and reused for all subsequent `ctx.font` assignments in the layer.
 *
 * ```ts
 * async attachCanvas(canvas) {
 *   const ctx = canvas.getContext('2d');
 *   this._fontFamily = await ensureVt323Loaded();
 *   // ... pre-bake chrome with this._fontFamily ...
 * }
 * ```
 *
 * @returns A Promise that resolves to a CSS font string (`'16px VT323'` on
 *   success, `'16px monospace'` on any failure). Never rejects.
 *
 * @see ADR-0013 Amendment 1 §RFONT-01 (VT323 load requirement)
 */
export async function ensureVt323Loaded(): Promise<string> {
  try {
    const face = new FontFace('VT323', `url(${fontUrl})`);
    await face.load();
    // self.fonts is the FontFaceSet available on both main thread and Web Worker.
    // In happy-dom and some iOS 16 WKWebView Worker contexts, self.fonts may be
    // undefined — the catch block handles this case transparently.
    self.fonts.add(face);
    return '16px VT323';
  } catch {
    // Fallback: self.fonts may not exist in happy-dom or iOS 16 WKWebView Worker.
    // FontFace.load() may also fail in restricted environments. Return monospace
    // as the universally-available fallback (RFONT-01 SC1 tested explicitly).
    return '16px monospace';
  }
}
