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

import { MODULE_ID } from './module.js';
import { BridgeConfigModal } from './pair/BridgeConfigModal.js';
import { PairModal } from './pair/PairModal.js';

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
export function registerSettings(): void {
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

  // Map contrast normalization — per-client display preference (Quick Task 260610-evs).
  // When enabled (default), luminance levels-stretch is applied to dark map frames
  // before the 4-bit dither, so the G2's greyscale display shows readable contrast
  // even in pitch-dark dungeon scenes. Toggle applies live on the next frame capture
  // without re-pairing or module reload (getNormalize is evaluated per capture).
  game.settings.register(MODULE_ID, 'mapContrastNormalize', {
    name: 'evf.settings.map_contrast_normalize.name',
    hint: 'evf.settings.map_contrast_normalize.hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true,
  });
}
