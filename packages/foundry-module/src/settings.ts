/**
 * @evf/foundry-module — Settings panel registration.
 *
 * Registers the EvenFoundryVTT settings menu entry in the Foundry Settings panel
 * under "Module Settings → EvenFoundryVTT". Wave 1 (Plan 02) replaces the
 * `PairModalStub` placeholder with the full `PairModal` ApplicationV2 implementation.
 *
 * Also reads and exports `detectedLocale` from `game.i18n.lang` at call time,
 * satisfying I18N-01 (locale detection at module boot).
 *
 * Also registers the bearer registry setting (scope: "world", config: false —
 * programmatic access only, not shown in the Foundry UI settings form).
 *
 * Quick Task 260604-hs5: additionally registers two world settings —
 * `bridgeUrl` and `bridgeInternalSecret` — that link this world to a specific
 * bridge deployment. The DM enters the bridge URL plus the bridge's actual
 * `EVF_INTERNAL_SECRET` so that outbound `/internal/delta` pushes authenticate
 * against the bridge's single static secret (a real Forge-hosted world otherwise
 * generates random per-pair secrets that can never match the bridge). The secret
 * value is NEVER logged.
 *
 * Quick Task 260604-mjr: those two settings are now `config: false` (no longer
 * loose fields in the generic "Configure Settings" panel) and are managed solely
 * through the dedicated "EVF — Bridge Configuration" dialog (`BridgeConfigModal`),
 * registered via a second `registerMenu`. The dialog reliably pre-loads, displays,
 * validates and persists both values on an explicit Save.
 *
 * Quick Task 260610-evs: registers `mapContrastNormalize` (client scope,
 * config:true, Boolean, default:true) — enables luminance levels-stretch on
 * dark map frames before dithering so the G2's 4-bit greyscale shows usable
 * contrast. Per-client display preference; can be toggled without re-pairing or
 * reload. Wired into `registerCanvasExtractor` via the `getNormalize` hook in
 * `module.ts`.
 *
 * @see Specs.md §7.14.7.3 (pair flow — QR + bearer)
 * @see 02-CONTEXT.md D-2.01 (pair-button location: Settings panel)
 * @see 02-CONTEXT.md D-2.18 (locale detection: game.i18n.lang at boot)
 * @see 02-UI-SPEC.md §UI-A I18N keys table (evf.settings.pair_button)
 */

import type { SettingsDisplay } from '@evf/shared-protocol';
import { MODULE_ID } from './module.js';
import { BridgeConfigModal } from './pair/BridgeConfigModal.js';
import { PairModal } from './pair/PairModal.js';

/** Options for {@link registerSettings}. */
export interface RegisterSettingsOptions {
  /**
   * Called whenever any of the five display settings (dither, brightness, WebP,
   * captureFps, normalize) changes via Foundry's per-setting `onChange`. Wired
   * in `module.ts` to push a fresh `settings.display` snapshot downstream so the
   * glasses menu stays in sync. Optional — absent in tests that don't sync.
   */
  readonly onDisplaySettingChange?: () => void;
}

/**
 * Locale detected from `game.i18n.lang` at module init time.
 * Normalised to primary subtag only (e.g. "it-IT" → "it").
 * Propagated in the WS handshake `locale` field (Plan 04).
 */
export let detectedLocale: string = 'en';

/**
 * Registers the EvenFoundryVTT settings menu in the Foundry Settings panel.
 *
 * Must be called inside the `Hooks.once("init")` callback to ensure
 * `game.settings` is available. Reads `game.i18n.lang` immediately and
 * stores the result in `detectedLocale` for downstream consumers.
 *
 * Registers the bearer registry and internal secrets as hidden world-scope
 * settings (Tier 3 DM-authoritative storage per D-2.12).
 *
 * Quick Task 260604-hs5/260604-mjr: also registers two world settings
 * (`bridgeUrl`, `bridgeInternalSecret`, both config: false + restricted: true)
 * that the DM fills with the bridge deployment URL and its matching
 * `EVF_INTERNAL_SECRET`. These take precedence in `getBridgeUrl()` /
 * `getInternalSecret()` over the per-pair bearer-registry values. They are managed
 * via the dedicated "EVF — Bridge Configuration" dialog (registered as a second
 * `registerMenu`), not the generic settings panel. The secret value is never logged.
 *
 * @example
 * ```ts
 * Hooks.once('init', () => {
 *   registerSettings();
 * });
 * ```
 */
export function registerSettings(opts?: RegisterSettingsOptions): void {
  // Per-setting onChange → notify the display-settings sync (downstream push).
  const onDisplayChange = (): void => opts?.onDisplaySettingChange?.();
  // I18N-01: detect locale at module boot, normalise to primary tag.
  // Guard against `game.i18n` being undefined at the `init` hook (Foundry v13
  // re-ordered some globals; this function used to throw silently before
  // reaching the register calls below, leaving zero settings registered —
  // observed in production after manifest install. Caught by HUMAN-UAT).
  try {
    const lang = game.i18n?.lang ?? 'en';
    detectedLocale = lang.split('-')[0] ?? 'en';
  } catch {
    detectedLocale = 'en';
  }

  // Bearer registry — world scope, hidden from UI (programmatic only)
  game.settings.register(MODULE_ID, 'bearerRegistry', {
    scope: 'world',
    config: false,
    type: Object,
    default: { entries: {}, version: 1 },
  });

  // Bridge deployment URL. World scope, GM-restricted. When non-empty it takes
  // precedence over the per-pair bearer-registry bridgeUrl in getBridgeUrl().
  // Quick Task 260604-mjr: now config: false — no longer a loose field in the
  // generic "Configure Settings" panel; managed solely via the BridgeConfigModal
  // dialog ("EVF — Bridge Configuration"), which reliably pre-loads + persists it.
  game.settings.register(MODULE_ID, 'bridgeUrl', {
    name: 'evf.settings.bridge_url.name',
    hint: 'evf.settings.bridge_url.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: String,
    default: '',
  });

  // Bridge internal secret — the bridge's EVF_INTERNAL_SECRET value used to
  // authenticate this world's outbound /internal/delta pushes. World scope,
  // GM-restricted. When non-empty it takes precedence over the per-pair
  // bearer-registry internalSecret in getInternalSecret(). The value is NEVER logged.
  // Quick Task 260604-mjr: now config: false — managed solely via the
  // BridgeConfigModal dialog (masked input + explicit Save), not the generic panel.
  game.settings.register(MODULE_ID, 'bridgeInternalSecret', {
    name: 'evf.settings.bridge_internal_secret.name',
    hint: 'evf.settings.bridge_internal_secret.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: String,
    default: '',
  });

  // Pair button in Module Settings panel — opens PairModal (Wave 1).
  // Cast required: PairModal(bridgeUrl, worldId) has typed args but Foundry's registerMenu
  // type declaration accepts a generic constructor. Runtime call uses no-arg `new type()`.
  game.settings.registerMenu(MODULE_ID, 'pairDevice', {
    name: 'evf.settings.pair_button',
    label: 'evf.settings.pair_button',
    icon: 'fas fa-qrcode',
    type: PairModal as unknown as new (...args: unknown[]) => object,
    restricted: true,
  });

  // Quick Task 260604-mjr: dedicated "EVF — Bridge Configuration" dialog. Opens the
  // BridgeConfigModal, which pre-loads + displays the saved bridgeUrl + (masked)
  // internalSecret and persists both on an explicit Save with success feedback. This
  // replaces the easy-to-miss loose fields in the generic "Configure Settings" panel
  // (both settings demoted to config: false above). registerMenu instantiates with
  // `new type()` (no args); the same generic-constructor cast as pairDevice applies.
  game.settings.registerMenu(MODULE_ID, 'bridgeConfig', {
    name: 'evf.settings.bridge_config_button',
    label: 'evf.settings.bridge_config_button',
    hint: 'evf.settings.bridge_config_hint',
    icon: 'fas fa-sliders-h',
    type: BridgeConfigModal as unknown as new (...args: unknown[]) => object,
    restricted: true,
  });

  // TODO (#32): mapContrastNormalize/mapDither/mapBrightness are client-scope, so a
  // stream-leader change makes the synced glasses values jump. Consider world-scope.

  // Map contrast normalization — per-client display preference (Quick Task 260610-evs).
  // When enabled, luminance levels-stretch is applied to dark map frames before the
  // 4-bit dither, so the G2's greyscale display shows readable contrast even in
  // pitch-dark dungeon scenes. Default OFF (user decision 2026-06-10: faithful
  // tones by default, normalization is an opt-in). Toggle applies live on the next
  // frame capture without re-pairing or module reload (getNormalize per capture).
  game.settings.register(MODULE_ID, 'mapContrastNormalize', {
    name: 'evf.settings.map_contrast_normalize.name',
    hint: 'evf.settings.map_contrast_normalize.hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    onChange: onDisplayChange,
  });

  // Map dithering — per-client display preference (2026-06-11). When enabled,
  // a Bayer 4×4 ordered dither is applied during the module-side 16-level
  // quantization, so gradients render as a stippled pattern instead of flat
  // bands on the glasses. Default OFF (user decision 2026-06-11: clean flat
  // tones by default). Client scope so EVERY user sees the toggle (no GM
  // needed). Applies live on the next capture (getDither per capture). The
  // dither is deterministic (pure function of position+value), so the
  // identical-frame skip keeps working on static scenes.
  game.settings.register(MODULE_ID, 'mapDither', {
    name: 'evf.settings.map_dither.name',
    hint: 'evf.settings.map_dither.hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    onChange: onDisplayChange,
  });

  // Map brightness — per-client display preference (2026-06-14). A luma gain in
  // percent (−100..+100, 0 = neutral) applied module-side just before the
  // 16-level quantize, so the fixed-brightness G2 phosphor display can be tuned
  // per viewer without touching scene lighting. Client scope (like mapDither):
  // each player adjusts their own glasses. Applies live on the next capture
  // (getBrightness per capture). Deterministic → identical-frame skip survives.
  game.settings.register(MODULE_ID, 'mapBrightness', {
    name: 'evf.settings.map_brightness.name',
    hint: 'evf.settings.map_brightness.hint',
    scope: 'client',
    config: true,
    type: Number,
    default: DEFAULT_BRIGHTNESS,
    range: { min: -100, max: 100, step: 5 },
    onChange: onDisplayChange,
  });

  // Capture frame rate (fps) — DM-visible world setting controlling how often the
  // canvas is captured and emitted as a frame_png envelope (Quick Task 260611-e71,
  // FPS redesign 2026-06-11: the user configures FRAMES PER SECOND, not ms).
  // Default 30 fps (v0.1.21 — matches the glasses-side 33 ms render cap; the
  // 16-level quantized PNG is ~18 KB/frame, so 30 fps costs ~540 KB/s upstream
  // worst-case and far less in practice thanks to the identical-frame skip).
  // Range 1–60 fps, step 1. Read live on every
  // capture cycle — no module reload needed. The real upper bound is the
  // client GPU readback + upstream bandwidth, not this setting.
  game.settings.register(MODULE_ID, 'captureFps', {
    name: 'evf.settings.capture_fps.name',
    hint: 'evf.settings.capture_fps.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: DEFAULT_CAPTURE_FPS,
    range: { min: 1, max: 60, step: 1 },
    onChange: onDisplayChange,
  });

  // Frame compression quality — DM-visible world setting (v0.1.27).
  // 0 = lossless PNG (DEFAULT); 1–100 = lossy WebP at that quality.
  //
  // Default lowered to 0 after a measured perf audit (2026-06-14): frames are
  // already quantized to 16 grey levels before encode, so DEFLATE (PNG) packs
  // the flat regions extremely well. On a real Foundry frame, lossy WebP gave
  // only ~1.1× at q75 and was LARGER than PNG at q90 — i.e. the worst of both
  // worlds (lossy artefacts with no size win). PNG (0) is the right default;
  // q≈50 (~1.4×) is the only WebP setting worth using if bandwidth is tight.
  // World scope (bandwidth belongs to the stream host); read live every capture.
  // Hosts whose canvas encoder cannot produce WebP fall back to PNG transparently.
  game.settings.register(MODULE_ID, 'mapWebpQuality', {
    name: 'evf.settings.map_webp_quality.name',
    hint: 'evf.settings.map_webp_quality.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: DEFAULT_WEBP_QUALITY,
    range: { min: 0, max: 100, step: 5 },
    onChange: onDisplayChange,
  });
}

/** Default capture rate (fps) — used for the setting default and as the unreadable-setting fallback. */
const DEFAULT_CAPTURE_FPS = 30;

/** Default WebP quality — 0 = lossless PNG (perf audit 2026-06-14; WebP barely helps on 16-level frames). */
const DEFAULT_WEBP_QUALITY = 0;

/** Default brightness gain (percent, 0 = neutral) — setting default + unreadable fallback. */
const DEFAULT_BRIGHTNESS = 0;

/**
 * Read the DM-configured `captureFps` world setting and convert it to the
 * capture interval in milliseconds expected by the canvas extractor.
 *
 * fps is clamped to [1, 60]; the returned interval is `round(1000 / fps)`
 * (4 fps → 250 ms, 30 fps → 33 ms, 60 fps → 17 ms).
 *
 * Evaluated live on EVERY capture cycle (like `getNormalize`) so a DM setting
 * change takes effect on the next capture without re-registering or reloading
 * the module.
 *
 * Returns the default (33 ms = 30 fps) on any read error (e.g., called before
 * settings are ready at startup) — defensive try/catch mirrors the
 * `getNormalize` wiring pattern used in `module.ts`.
 */
export function getCaptureIntervalMs(): number {
  try {
    const raw = game.settings.get(MODULE_ID, 'captureFps') as unknown;
    const fps = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_CAPTURE_FPS;
    const clamped = Math.max(1, Math.min(60, fps));
    return Math.round(1000 / clamped);
  } catch {
    return Math.round(1000 / DEFAULT_CAPTURE_FPS);
  }
}

/**
 * Read the DM-configured `mapWebpQuality` world setting (0 = lossless PNG,
 * 1–100 = lossy WebP quality), clamped to [0, 100].
 *
 * Evaluated live on EVERY capture (like `getCaptureIntervalMs`) so a DM
 * setting change takes effect on the next frame without module reload.
 * Returns the default (75) on any read error — same defensive pattern as
 * `getCaptureIntervalMs`.
 */
export function getWebpQuality(): number {
  try {
    const raw = game.settings.get(MODULE_ID, 'mapWebpQuality') as unknown;
    const q = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_WEBP_QUALITY;
    return Math.max(0, Math.min(100, Math.round(q)));
  } catch {
    return DEFAULT_WEBP_QUALITY;
  }
}

/**
 * Read the per-client `mapBrightness` setting (luma gain in percent), clamped
 * to [−100, 100]. 0 = neutral. Evaluated live on every capture (like
 * `getWebpQuality`); returns the default (0) on any read error.
 */
export function getBrightness(): number {
  try {
    const raw = game.settings.get(MODULE_ID, 'mapBrightness') as unknown;
    const b = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_BRIGHTNESS;
    return Math.max(-100, Math.min(100, Math.round(b)));
  } catch {
    return DEFAULT_BRIGHTNESS;
  }
}

/** Read `captureFps` (1–60) directly; default 30 on any read error. */
export function getCaptureFps(): number {
  try {
    const raw = game.settings.get(MODULE_ID, 'captureFps') as unknown;
    const fps = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_CAPTURE_FPS;
    return Math.max(1, Math.min(60, Math.round(fps)));
  } catch {
    return DEFAULT_CAPTURE_FPS;
  }
}

/** Read the per-client `mapDither` boolean; false on any read error. */
export function getDither(): boolean {
  try {
    return game.settings.get(MODULE_ID, 'mapDither') === true;
  } catch {
    return false;
  }
}

/** Read the per-client `mapContrastNormalize` boolean; false on any read error. */
export function getNormalize(): boolean {
  try {
    return game.settings.get(MODULE_ID, 'mapContrastNormalize') === true;
  } catch {
    return false;
  }
}

/**
 * Build the FULL display-settings snapshot pushed downstream over the
 * `settings.display` delta (latency audit 2026-06-14). Reads the five live
 * settings via their canonical getters so the glasses always reflect Foundry.
 */
export function buildDisplaySettingsSnapshot(): SettingsDisplay {
  return {
    dither: getDither(),
    brightness: getBrightness(),
    webpQuality: getWebpQuality(),
    captureFps: getCaptureFps(),
    normalize: getNormalize(),
  };
}

/** Maps a {@link SettingsDisplay} key to its Foundry setting id. */
const DISPLAY_SETTING_KEYS: ReadonlyArray<readonly [keyof SettingsDisplay, string]> = [
  ['dither', 'mapDither'],
  ['brightness', 'mapBrightness'],
  ['webpQuality', 'mapWebpQuality'],
  ['captureFps', 'captureFps'],
  ['normalize', 'mapContrastNormalize'],
];

/**
 * Apply a PARTIAL display-settings edit received UPSTREAM from the glasses
 * (latency audit 2026-06-14). Writes each present key via `game.settings.set`,
 * which fires the setting's `onChange` → re-pushes the downstream snapshot,
 * confirming the change. Per-set errors are swallowed (a malformed value must
 * never crash the capture pipeline); the returned promise settles when all
 * writes complete.
 *
 * @param edit - Partial settings from the bridge's frame-POST `pendingSettings`.
 */
export async function applyDisplaySettings(edit: SettingsDisplay): Promise<void> {
  await Promise.all(
    DISPLAY_SETTING_KEYS.map(async ([key, settingId]) => {
      const value = edit[key];
      if (value === undefined) {
        return;
      }
      try {
        await game.settings.set(MODULE_ID, settingId, value);
      } catch (err) {
        console.warn(`[EVF] applyDisplaySettings: failed to set ${settingId}:`, err);
      }
    }),
  );
}
