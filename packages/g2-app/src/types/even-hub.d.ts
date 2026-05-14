/**
 * Ambient type declarations for the legacy `hub.*` API surface used by the
 * Phase 2 wizard. **This `hub` global is NOT injected by the Even Realities
 * App WebView.** The canonical runtime API is `EvenAppBridge` from
 * `@evenrealities/even_hub_sdk@0.0.10` (envelope-based dispatch via
 * `flutterBridge.callHandler('evenAppMessage', json({type, method, data}))`).
 *
 * The discrepancy was discovered 2026-05-14 via live probing of the official
 * `@evenrealities/evenhub-simulator@0.7.3`:
 *   - Only `flutterBridge.callHandler` is injected at runtime
 *   - No `hub.setItem` / `hub.getItem` / `hub.eventBus` / `hub.camera` globals
 *   - Original "INV-2 verified 2026-05-11" claim was not runtime-validated
 *
 * To preserve Phase 2 wizard code without rewriting it, a **runtime polyfill**
 * (`packages/g2-app/src/hub-polyfill.ts`) installs `globalThis.hub` by mapping
 * to `EvenAppBridge` calls. Phase 4a+ code should use `EvenAppBridge` directly,
 * not this legacy surface.
 *
 * Mapping:
 *   - `hub.setItem(k, v)`      → `bridge.setLocalStorage(k, v)`
 *   - `hub.getItem(k)`         → `bridge.getLocalStorage(k)` (`""` from SDK → `null`)
 *   - `hub.removeItem(k)`      → `bridge.setLocalStorage(k, '')` (no explicit delete in SDK)
 *   - `hub.eventBus.on('g2.wear'|'g2.unwear', cb)` → derived from `bridge.onDeviceStatusChanged`
 *   - `hub.camera`             → `undefined` (camera APIs are phone-side WebView, not in EvenHub SDK)
 *
 * Tests typically `vi.stubGlobal('hub', mockHub)` to bypass the polyfill;
 * the polyfill is idempotent and respects prior installations.
 *
 * @see packages/g2-app/src/hub-polyfill.ts (the runtime installer)
 * @see .planning/quick/20260514-raster-dynamic-infill/EVIDENCE.md § Appendix C — OQ-INV2-4
 * @see docs/architecture/0005-phase0-go-no-go.md § OQ-INV2-4
 * @see Specs.md §3.1 / §3.5 / §3.7 (pending v0.9.13 amendment for envelope-based dispatch)
 */
declare const hub: {
  /**
   * Persist a string value under `key` in the Even Hub host-managed key-value store.
   * This is Tier 3 storage (Specs.md §11.5.5) — survives kill/restart/reboot of the WebView.
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Retrieve a string value by `key` from the Even Hub kv store.
   * Returns `null` if the key does not exist.
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Removes a key from the Even Hub kv store.
   */
  removeItem(key: string): Promise<void>;

  /** Event bus for G2 hardware lifecycle events. */
  eventBus: {
    /**
     * Subscribe to an event.
     * @param event `"g2.wear"` fires when G2 is put on; `"g2.unwear"` when removed.
     */
    on(event: 'g2.wear' | 'g2.unwear', callback: () => void): void;

    /** Remove a previously registered callback. */
    off(event: string, callback: () => void): void;
  };

  /**
   * Camera API — only present on some OS variants.
   * Always probe `hub.camera?.requestAccess()` before use.
   * G2 has no camera (Specs.md §3.1); this API is for the paired phone camera.
   */
  camera?: {
    /** Request camera permission. Returns true if granted. */
    requestAccess(): Promise<boolean>;

    /**
     * Open a QR code scanner overlay.
     * Returns the decoded string content, or rejects on cancel / scan error.
     */
    scanQRCode(): Promise<string>;
  };
};
