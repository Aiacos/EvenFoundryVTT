/**
 * Runtime polyfill that bridges the legacy `hub.*` API surface declared in
 * `types/even-hub.d.ts` (Phase 2) to the canonical Even Realities SDK
 * `EvenAppBridge` envelope dispatch (`@evenrealities/even_hub_sdk@0.0.10`).
 *
 * # Why this exists
 *
 * Phase 2 wizard code (`packages/g2-app/src/wizard/`) calls `hub.setItem`,
 * `hub.getItem`, `hub.removeItem`, and `hub.eventBus.on('g2.wear'|'g2.unwear', cb)`
 * as if `hub` were a global injected by the Even Realities App WebView.
 *
 * **It is not.** Live probing of the official simulator
 * `@evenrealities/evenhub-simulator@0.7.3` (2026-05-14) showed that the only
 * global injected on the WebView is `flutterBridge.callHandler('evenAppMessage', ...)`,
 * dispatched through a `{type, method, data}` envelope. The 11 canonical
 * methods are enumerated in the `EvenAppMethod` enum from the SDK.
 *
 * Without this polyfill, every wizard call (e.g. `hub.setItem(...)`) throws
 * `ReferenceError: hub is not defined` on the simulator and on real hardware.
 * Phase 2 unit tests pass because they `vi.stubGlobal('hub', mockHub)`, but
 * production code paths break.
 *
 * # What this does
 *
 * Calling `installHubPolyfill()` from the wizard / Phase 4a entry script
 * installs a `globalThis.hub` shim backed by `EvenAppBridge.getInstance()`:
 *
 * - `hub.setItem(k, v)`     → `bridge.setLocalStorage(k, v)`
 * - `hub.getItem(k)`         → `bridge.getLocalStorage(k)` (`""` from SDK normalized to `null`)
 * - `hub.removeItem(k)`      → `bridge.setLocalStorage(k, '')` (no explicit delete in SDK)
 * - `hub.eventBus.on('g2.wear' | 'g2.unwear', cb)` → derived from
 *   `bridge.onDeviceStatusChanged(status => ...)` by comparing `status.isWearing` transitions.
 * - `hub.camera`             → not provided. There is NO camera / QR-scan API exposed to
 *   apps (canonical hub.evenrealities.com/docs/guides/device-apis: "no camera (there is
 *   none)"); confirmed empirically 2026-05-14 that `EvenAppMethod` has no camera surface.
 *   ADR-0005 §OQ-INV2-4 resolved — the wizard uses paste / manual token entry only.
 *
 * # When NOT to use this
 *
 * - In **tests** that already `vi.stubGlobal('hub', ...)` — the polyfill is
 *   idempotent (returns early if `globalThis.hub` is already truthy), so it
 *   will not overwrite the mock if the mock is installed first.
 * - In **Phase 4a+ code** that writes directly against `EvenAppBridge` — use
 *   the SDK API directly; this polyfill is a Phase 2 compatibility shim.
 *
 * # Cross-references
 *
 * - `.planning/quick/20260514-raster-dynamic-infill/EVIDENCE.md` § Appendix C.4 — OQ-INV2-4 discovery
 * - `docs/architecture/0005-phase0-go-no-go.md` § OQ-INV2-4
 * - `types/even-hub.d.ts` — legacy ambient declaration
 * - SDK: `https://www.npmjs.com/package/@evenrealities/even_hub_sdk`
 *
 * @see Specs.md §3.5 / §4.3 / §7.2 (pending v0.9.13 amendment for envelope-based dispatch)
 */

import { type DeviceStatus, EvenAppBridge } from '@evenrealities/even_hub_sdk';

/** Surface that the legacy `hub` global is expected to provide (subset used by wizard). */
type HubLikeGlobal = {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  eventBus: {
    on(event: 'g2.wear' | 'g2.unwear', callback: () => void): void;
    off(event: string, callback: () => void): void;
  };
};

let installed = false;

/**
 * Install the `globalThis.hub` polyfill backed by `EvenAppBridge` from
 * `@evenrealities/even_hub_sdk`. Idempotent — safe to call multiple times.
 *
 * Returns `true` if the polyfill was installed by this call, `false` if it
 * was already present (mocked by tests, installed previously, or
 * `globalThis` is unavailable).
 */
export function installHubPolyfill(): boolean {
  if (installed) return false;
  if (typeof globalThis === 'undefined') return false;
  // Respect any prior installation (test stubs, real WebView injection, etc.)
  const existing = (globalThis as { hub?: unknown }).hub;
  if (existing !== undefined && existing !== null) {
    installed = true;
    return false;
  }

  // Install bridge + DeviceStatus subscription. Wrap in try/catch so a
  // missing-or-broken SDK environment (happy-dom test runner without a
  // real Even App, dev preview before bridge is ready, etc.) does NOT
  // crash module load — the wizard will see `hub.setItem` reject when
  // actually called, which the existing graceful-degradation in
  // `wizard.ts:132` (logs "hub.eventBus not available — auto-connect
  // disabled") and `tier3-storage.ts` (catches storage errors) handle.
  let bridge: EvenAppBridge | null = null;
  try {
    bridge = EvenAppBridge.getInstance();
  } catch (e) {
    console.warn('[hub-polyfill] EvenAppBridge.getInstance() threw — bridge unavailable:', e);
  }

  // Track wear/unwear transitions derived from DeviceStatus updates.
  const wearListeners = new Map<'g2.wear' | 'g2.unwear', Set<() => void>>([
    ['g2.wear', new Set()],
    ['g2.unwear', new Set()],
  ]);
  let prevWearing: boolean | undefined;
  if (bridge !== null) {
    try {
      bridge.onDeviceStatusChanged((status: DeviceStatus) => {
        const wearing = status.isWearing === true;
        if (prevWearing === undefined) {
          prevWearing = wearing;
          return;
        }
        if (wearing && !prevWearing) {
          wearListeners.get('g2.wear')?.forEach((cb) => {
            try {
              cb();
            } catch (e) {
              console.warn('[hub-polyfill] g2.wear listener threw:', e);
            }
          });
        } else if (!wearing && prevWearing) {
          wearListeners.get('g2.unwear')?.forEach((cb) => {
            try {
              cb();
            } catch (e) {
              console.warn('[hub-polyfill] g2.unwear listener threw:', e);
            }
          });
        }
        prevWearing = wearing;
      });
    } catch (e) {
      console.warn('[hub-polyfill] bridge.onDeviceStatusChanged threw:', e);
    }
  }

  const hub: HubLikeGlobal = {
    async setItem(key: string, value: string): Promise<void> {
      if (bridge === null) throw new Error('hub.setItem: EvenAppBridge unavailable');
      await bridge.setLocalStorage(key, value);
    },
    async getItem(key: string): Promise<string | null> {
      if (bridge === null) throw new Error('hub.getItem: EvenAppBridge unavailable');
      const value = await bridge.getLocalStorage(key);
      // SDK returns "" when the key does not exist; legacy contract expects `null`.
      return value === '' ? null : value;
    },
    async removeItem(key: string): Promise<void> {
      if (bridge === null) throw new Error('hub.removeItem: EvenAppBridge unavailable');
      // SDK has no explicit delete; clearing the value is the canonical clear.
      await bridge.setLocalStorage(key, '');
    },
    eventBus: {
      on(event: 'g2.wear' | 'g2.unwear', callback: () => void): void {
        wearListeners.get(event)?.add(callback);
      },
      off(event: string, callback: () => void): void {
        const set = wearListeners.get(event as 'g2.wear' | 'g2.unwear');
        set?.delete(callback);
      },
    },
  };

  (globalThis as { hub?: HubLikeGlobal }).hub = hub;
  installed = true;
  return true;
}

/** Test-only helper to reset the installation flag between tests. */
export function _resetHubPolyfillForTests(): void {
  installed = false;
  if (typeof globalThis !== 'undefined') {
    delete (globalThis as { hub?: unknown }).hub;
  }
}
