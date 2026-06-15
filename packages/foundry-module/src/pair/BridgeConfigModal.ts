/**
 * @evf/foundry-module — BridgeConfigModal ApplicationV2 implementation.
 *
 * A dedicated, foolproof "EVF — Bridge Configuration" dialog for the two world
 * settings that link this Foundry world to a specific bridge deployment:
 *   - `bridgeUrl`            — full origin of the EVF bridge
 *   - `bridgeInternalSecret` — the bridge's `EVF_INTERNAL_SECRET` value
 *
 * Why a dedicated dialog (Quick Task 260604-mjr):
 * The two settings used to be loose `config: true` fields inside Foundry's generic
 * "Configure Settings" panel. The DM filled them in but the panel's global
 * "Save Changes" was easy to miss, so the values appeared not to persist and had to
 * be set from the dev console. This dialog removes that footgun: it PRE-LOADS and
 * DISPLAYS the currently-saved values on open, and writes BOTH settings atomically
 * on an explicit "Save" with a success notification. The two settings are now
 * `config: false` (managed solely through this dialog).
 *
 * Opened from Foundry Settings → Module Settings → EvenFoundryVTT →
 * "EVF — Bridge Configuration" (registered via `game.settings.registerMenu` in settings.ts).
 *
 * Security:
 * - The internal secret is rendered into a masked (`type="password"`) input pre-filled
 *   with the current value, revealed only on explicit "Reveal". The secret value is
 *   NEVER passed to `console.*` and is written only via `game.settings.set`. It is not
 *   trimmed or transformed — the exact entered value is preserved.
 *
 * Template boolean flags:
 * - Foundry VTT does not register an `eq` Handlebars helper. The template uses
 *   `{{#if hasSecret}}` only and renders all values through pre-resolved `{{i18n.*}}`
 *   strings (computed in `_prepareContext`).
 *
 * Mirrors the existing PairModal ApplicationV2 + HandlebarsApplicationMixin pattern.
 *
 * @see 260604-mjr-PLAN.md (BridgeConfigModal specification)
 * @see packages/foundry-module/src/pair/PairModal.ts (the pattern this mirrors)
 */

import { MODULE_ID } from '../module.js';

// Foundry v13+: ApplicationV2 + HandlebarsApplicationMixin live under foundry.applications.api.
// ApplicationV2 is abstract about rendering — a renderable subclass MUST provide `_renderHTML`/
// `_replaceHTML`, which HandlebarsApplicationMixin supplies (it renders `static PARTS` templates).
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Template context returned by _prepareContext(). */
export interface BridgeConfigData extends Record<string, unknown> {
  /** Currently-saved bridge URL, coerced to a string (''). */
  bridgeUrl: string;
  /** Currently-saved internal secret, coerced to a string (''). */
  internalSecret: string;
  /** true when a non-empty secret is currently saved (used in template, not the `eq` helper). */
  hasSecret: boolean;
  /** Pre-localised string map — keys consumed by bridge-config.hbs template. */
  i18n: Record<string, string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Bridge URL shape rule, copied VERBATIM from
 * `packages/g2-app/src/wizard/steps/step1-profile.ts` (`BRIDGE_URL_REGEX`), the
 * single source of truth for the wizard's URL affordance. It is duplicated here
 * (rather than imported) to avoid a cross-package import from the g2-app bundle into
 * the Foundry module bundle — both enforce the SAME shape: scheme + host + port.
 */
const BRIDGE_URL_REGEX = /^https?:\/\/[^/]+:\d{1,5}(\/.*)?$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reads a string setting from the module's settings store, coercing any non-string
 * (corrupted / unexpected) value to an empty string so it never leaks into the DOM.
 */
function readStringSetting(key: string): string {
  const value = game.settings.get(MODULE_ID, key);
  return typeof value === 'string' ? value : '';
}

// ─── I18N helper ─────────────────────────────────────────────────────────────

/**
 * Returns the pre-localised i18n object for the template.
 * All keys are resolved via `game.i18n.localize()` here so the template uses
 * `{{i18n.key}}` (pre-resolved string), never raw key lookup.
 */
function buildI18n(): Record<string, string> {
  const l = (key: string) => game.i18n.localize(key);
  return {
    title: l('evf.bridgecfg.title'),
    urlLabel: l('evf.bridgecfg.url.label'),
    urlHint: l('evf.bridgecfg.url.hint'),
    secretLabel: l('evf.bridgecfg.secret.label'),
    secretHint: l('evf.bridgecfg.secret.hint'),
    reveal: l('evf.bridgecfg.reveal'),
    hide: l('evf.bridgecfg.hide'),
    save: l('evf.bridgecfg.save'),
    cancel: l('evf.bridgecfg.cancel'),
    saved: l('evf.bridgecfg.saved'),
    invalidUrl: l('evf.bridgecfg.invalid_url'),
  };
}

// ─── BridgeConfigModal ──────────────────────────────────────────────────────────

/**
 * ApplicationV2 bridge-configuration dialog.
 *
 * Lifecycle:
 * 1. `render(true)` — opens and calls `_prepareContext()` → pre-loads the saved values
 * 2. `_onRender(context, options)` — binds Save / Cancel / Reveal handlers
 * 3. Save → validates URL → writes both settings → info notification → close()
 * 4. Cancel → close() with no write
 *
 * Registered via `game.settings.registerMenu(..., { type: BridgeConfigModal })`, which
 * instantiates it with `new type()` (no args) — hence the no-arg construction path.
 */
export class BridgeConfigModal extends HandlebarsApplicationMixin(ApplicationV2) {
  /** ApplicationV2 window/position config. */
  static override DEFAULT_OPTIONS = {
    id: 'evf-bridge-config',
    classes: ['evf-bridge-config'],
    position: { width: 540, height: 'auto' as const },
    // ApplicationV2 localises `window.title` automatically when it is an i18n key.
    window: { title: 'evf.bridgecfg.title', resizable: false },
  };

  /** HandlebarsApplicationMixin renders these template parts. */
  static override PARTS = {
    main: { template: 'modules/evenfoundryvtt/templates/bridge-config.hbs' },
  };

  /**
   * Builds the template context, pre-loading the currently-saved values so the dialog
   * DISPLAYS them on open (the core requirement). Non-string values coerce to ''.
   *
   * @returns BridgeConfigData template context
   */
  override async _prepareContext(_options: unknown): Promise<BridgeConfigData> {
    const bridgeUrl = readStringSetting('bridgeUrl');
    const internalSecret = readStringSetting('bridgeInternalSecret');
    return {
      bridgeUrl,
      internalSecret,
      hasSecret: internalSecret !== '',
      i18n: buildI18n(),
    };
  }

  /**
   * Binds the Save / Cancel / Reveal click handlers (mirrors PairModal._onRender's
   * addEventListener binding style, not a static action map).
   *
   * @param context - Prepared render context (unused here)
   * @param options - Render options (unused here)
   */
  override _onRender(context: unknown, options: unknown): void {
    super._onRender(context as never, options as never);

    const html = this.element;

    const saveBtn = html.querySelector('[data-action="save"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', (event) => {
        void this._onClickSave(event);
      });
    }

    const cancelBtn = html.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (event) => this._onClickCancel(event));
    }

    const revealBtn = html.querySelector('[data-action="reveal-secret"]');
    if (revealBtn) {
      revealBtn.addEventListener('click', (event) => this._onClickReveal(event));
    }
  }

  /**
   * Handles "Save": validates the URL against the shared shape rule, and on success
   * writes BOTH settings, shows a success notification, then closes.
   *
   * The secret value is read exactly as entered (NOT trimmed) and is never logged.
   *
   * @param event - DOM click event
   */
  async _onClickSave(event: Event): Promise<void> {
    event.preventDefault();
    const html = this.element;
    const urlInput = html.querySelector<HTMLInputElement>('input[name="bridgeUrl"]');
    const secretInput = html.querySelector<HTMLInputElement>('input[name="bridgeInternalSecret"]');
    const url = (urlInput?.value ?? '').trim();
    // Preserve the secret EXACTLY as entered — do not trim.
    const secret = secretInput?.value ?? '';

    const i18n = buildI18n();
    if (!BRIDGE_URL_REGEX.test(url)) {
      ui.notifications?.error(i18n.invalidUrl ?? 'Enter a valid URL including scheme and port.');
      return;
    }

    await game.settings.set(MODULE_ID, 'bridgeUrl', url);
    await game.settings.set(MODULE_ID, 'bridgeInternalSecret', secret);
    ui.notifications?.info(i18n.saved ?? 'Bridge configuration saved.');
    await this.close();
  }

  /**
   * Handles "Cancel": closes the dialog without writing any setting.
   *
   * @param event - DOM click event
   */
  _onClickCancel(event: Event): void {
    event.preventDefault();
    void this.close();
  }

  /**
   * Toggles the secret input between masked ('password') and revealed ('text'),
   * swapping the button label between the i18n reveal/hide strings.
   *
   * @param event - DOM click event
   */
  _onClickReveal(event: Event): void {
    event.preventDefault();
    const html = this.element;
    const secretInput = html.querySelector<HTMLInputElement>('input[name="bridgeInternalSecret"]');
    const btn = event.currentTarget as HTMLElement | null;
    if (!secretInput || !btn) return;

    const i18n = buildI18n();
    if (secretInput.type === 'password') {
      secretInput.type = 'text';
      btn.textContent = i18n.hide ?? 'Hide';
    } else {
      secretInput.type = 'password';
      btn.textContent = i18n.reveal ?? 'Reveal';
    }
  }
}
