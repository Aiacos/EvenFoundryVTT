/**
 * SettingsDisplay — the bidirectional map/display settings sync payload
 * (latency-audit follow-up 2026-06-14).
 *
 * The Foundry module owns five user-facing display settings (dither, brightness,
 * WebP quality, capture fps, contrast-normalize). They are the canonical source,
 * but the glasses app can both **observe** and **change** them so the two stay
 * in sync. This module defines the single payload used in BOTH directions:
 *
 * 1. **Downstream (module → glasses):** the module pushes a FULL snapshot over
 *    the `settings.display` delta channel on `ready` and on every change. The
 *    bridge caches the latest snapshot and replays it to each session on
 *    connect, so the glasses menu always reflects the live Foundry values.
 *
 * 2. **Upstream (glasses → module):** the glasses send a PARTIAL update inside a
 *    `client_setting` WS message. The bridge accumulates it in a per-world
 *    "pending" box and returns it in the HTTP response of the module's next
 *    `frame_png` POST (the module is push-only / zero-polling, and only the
 *    stream-leader emits frames — so the frame-POST response is a leader-only,
 *    no-new-connection carrier). The module applies it via `game.settings.set`,
 *    which re-triggers the downstream snapshot and confirms the change.
 *
 * Every field is OPTIONAL so the same schema validates a full snapshot
 * (all present) and a partial upstream edit (one key). Bounds mirror the
 * Foundry-side `range` of each setting.
 *
 * @see packages/foundry-module/src/settings.ts (canonical store + getters)
 * @see packages/foundry-module/src/module.ts (downstream emit + upstream apply)
 * @see packages/bridge/src/settings/settings-store.ts (cache + pending box)
 * @see packages/g2-app/src/internal/boot-engine-core.ts (subscribe + upstream send)
 */
import { z } from 'zod';

/** Wire-format type constant for the downstream `settings.display` delta envelope. */
export const SETTINGS_DISPLAY_TYPE = 'settings.display' as const;

/** Wire-format type constant for the upstream `client_setting` WS message. */
export const CLIENT_SETTING_TYPE = 'client_setting' as const;

/**
 * The five display settings, all optional.
 *
 * - `dither`      — Bayer 4×4 ordered dither in the module-side quantize.
 * - `brightness`  — luma gain in percent, −100..+100 (0 = neutral).
 * - `webpQuality` — 0 = lossless PNG, 1–100 = lossy WebP quality.
 * - `captureFps`  — map capture rate, 1–60 fps.
 * - `normalize`   — auto contrast levels-stretch.
 */
export const SettingsDisplaySchema = z
  .object({
    dither: z.boolean(),
    brightness: z.number().int().min(-100).max(100),
    webpQuality: z.number().int().min(0).max(100),
    captureFps: z.number().int().min(1).max(60),
    normalize: z.boolean(),
  })
  .partial();

/** Typed payload — the inner `payload` of a `settings.display` envelope, or a partial edit. */
export type SettingsDisplay = z.infer<typeof SettingsDisplaySchema>;

/**
 * Upstream `client_setting` WS message (glasses → bridge).
 *
 * `z.strictObject` — extra/unknown top-level fields are REJECTED, so the
 * upstream write channel cannot leak unexpected keys into the settings-apply
 * path (mirrors the strict wire payloads r1/combat/action-economy). The
 * `settings` field carries the partial edit the glasses want applied to the
 * Foundry settings; the inner `SettingsDisplaySchema` stays `.partial()`.
 */
export const ClientSettingMessageSchema = z.strictObject({
  type: z.literal(CLIENT_SETTING_TYPE),
  settings: SettingsDisplaySchema,
});

/** Typed `client_setting` WS message. */
export type ClientSettingMessage = z.infer<typeof ClientSettingMessageSchema>;
