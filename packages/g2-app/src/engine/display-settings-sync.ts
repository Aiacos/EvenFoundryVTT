/**
 * display-settings-sync — glasses-side half of the bidirectional settings sync
 * (latency audit 2026-06-14).
 *
 * The Foundry module owns the five map/display settings (dither, brightness,
 * WebP quality, capture fps, contrast-normalize). This module keeps the glasses
 * in sync with them:
 *
 * - **Downstream:** subscribes to the `settings.display` WS channel. The bridge
 *   replays the cached snapshot on connect and fans out every change, so
 *   `get()` always returns the live Foundry values for the menu to display.
 *
 * - **Upstream:** `sendEdit(partial)` sends a `client_setting` WS message; the
 *   bridge queues it and returns it on the module's next frame POST, where the
 *   module applies it via `game.settings.set` (which echoes back downstream).
 *
 * The class holds no DOM/SDK state — it is a thin state + transport adapter so
 * the boot engine and menu stay decoupled from the wire format.
 *
 * @see packages/shared-protocol/src/payloads/settings-display.ts (schema)
 * @see packages/bridge/src/settings/settings-store.ts (cache + pending box)
 */

import {
  CLIENT_SETTING_TYPE,
  SETTINGS_DISPLAY_TYPE,
  type SettingsDisplay,
  SettingsDisplaySchema,
} from '@evf/shared-protocol';

/** Minimal outbound transport — satisfied by `WsSender`. */
interface SettingsSender {
  send(data: string): void;
}

/** Minimal inbound bus — satisfied by the boot engine's `wsEventBus`. */
interface SettingsBus {
  subscribe(channel: string, fn: (raw: unknown) => void): () => void;
}

/** Handle returned by {@link createDisplaySettingsSync}. */
export interface DisplaySettingsSync {
  /** Latest known Foundry display settings (merged from every downstream push). */
  get(): SettingsDisplay;
  /** Send a partial edit upstream (glasses → bridge → module). */
  sendEdit(edit: SettingsDisplay): void;
  /** Unsubscribe from the downstream channel (boot teardown). */
  dispose(): void;
}

/**
 * Wire the glasses-side settings sync.
 *
 * @param bus      - The boot engine's WS event bus (cached-replay on subscribe).
 * @param sender   - The boot engine's `WsSender` (redirected across reconnects).
 * @param onUpdate - Called after each downstream merge with the new full state,
 *                   so the caller can realign local mirrors (e.g. the menu's
 *                   dither flag) and trigger a re-render.
 */
export function createDisplaySettingsSync(
  bus: SettingsBus,
  sender: SettingsSender,
  onUpdate?: (settings: SettingsDisplay) => void,
): DisplaySettingsSync {
  let current: SettingsDisplay = {};

  const unsubscribe = bus.subscribe(SETTINGS_DISPLAY_TYPE, (raw) => {
    // The bus hands us the envelope's `payload`. Validate defensively.
    const parsed = SettingsDisplaySchema.safeParse((raw as { payload?: unknown })?.payload ?? raw);
    if (!parsed.success) {
      return;
    }
    current = { ...current, ...parsed.data };
    onUpdate?.(current);
  });

  return {
    get: () => current,
    sendEdit: (edit: SettingsDisplay): void => {
      // Optimistically merge so the menu reflects the change before the
      // downstream echo arrives; the module's echo is authoritative.
      current = { ...current, ...edit };
      try {
        sender.send(JSON.stringify({ type: CLIENT_SETTING_TYPE, settings: edit }));
      } catch {
        // A failed send only loses this edit — the next one (or a downstream
        // push) re-aligns. Never throw out of a menu callback.
      }
    },
    dispose: unsubscribe,
  };
}
