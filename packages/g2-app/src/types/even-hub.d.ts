/**
 * Ambient type declarations for the Even Hub SDK injected by the Even Realities App WebView.
 *
 * Source: hub.evenrealities.com/docs/guides/device-apis (INV-2 verified 2026-05-11)
 *
 * The `hub` global is provided by the host WebView environment.
 * It is NOT available in Node.js / test environments — mock it in tests.
 *
 * Key constraints (Specs.md §3.1, §3.5, §3.6):
 *   - No speaker / no audio output / no camera (firmware constraint).
 *   - `hub.camera` may be undefined on all or some OS variants — always probe availability.
 *   - `hub.setItem` / `hub.getItem` are the ONLY persistent storage mechanism
 *     available in the sandboxed iframe (no localStorage per Specs.md §3.1).
 *
 * @see Specs.md §3.1 (G2 hardware constraints)
 * @see Specs.md §3.7 (plugin execution model — WebView, not G2 firmware)
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md D-2.08, D-2.09
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
