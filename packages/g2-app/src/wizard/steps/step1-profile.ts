/**
 * Step 1 — Bridge Profile / URL
 *
 * Renders into `#step-content`. Allows the player to:
 *   1. Select a saved bridge profile from Tier 3 (populated via `listProfiles()`).
 *   2. Enter a bridge URL manually with live validation.
 *
 * On valid URL + Continue: `store.set({ bridgeUrl, step: WizardStep.STEP2 })`.
 *
 * Security (T-02-03): all dynamic content rendered via textContent — no innerHTML for user data.
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-UI-SPEC.md Step 1 spec
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 2
 */

import { isWizardNoAuth } from '../is-dev-no-auth.js';
import type { WizardState } from '../state.js';
import { type Store, WizardStep } from '../state.js';
import { listProfiles } from '../tier3-storage.js';

/** Bridge URL validation regex from 02-UI-SPEC.md Step 1 Input Affordances. */
export const BRIDGE_URL_REGEX = /^https?:\/\/[^/]+:\d{1,5}(\/.*)?$/;

/**
 * All i18n keys used by Step 1.
 * Compile-time check: every key must appear here before being passed to t().
 */
export type Step1Keys =
  | 'evf.wizard.step_indicator'
  | 'evf.wizard.step1.title'
  | 'evf.wizard.step1.saved_profiles_label'
  | 'evf.wizard.step1.no_profiles'
  | 'evf.wizard.step1.manual_url_label'
  | 'evf.wizard.step1.url_hint'
  | 'evf.wizard.step1.url_error_format'
  | 'evf.wizard.step1.profile_corrupt'
  | 'evf.btn.continue';

let _cleanup: (() => void) | null = null;

/**
 * Render Step 1 into the given container.
 *
 * @param container - The `#step-content` element to render into.
 * @param store - Wizard state store.
 * @param t - i18n translation function.
 */
export function render(
  container: HTMLElement,
  store: Store<WizardState>,
  t: (key: string, vars?: Record<string, string>) => string,
): void {
  destroy();

  const state = store.get();

  // Build DOM
  const form = document.createElement('div');
  form.setAttribute('role', 'form');

  // --- Profile select ---
  const profileLabel = document.createElement('label');
  profileLabel.setAttribute('for', 'evf-profile-select');
  profileLabel.textContent = t('evf.wizard.step1.saved_profiles_label');

  const profileSelect = document.createElement('select');
  profileSelect.id = 'evf-profile-select';
  profileSelect.className = 'evf-select';
  profileSelect.setAttribute('aria-describedby', 'evf-profile-corrupt-msg');

  const noProfileOption = document.createElement('option');
  noProfileOption.value = '';
  noProfileOption.textContent = t('evf.wizard.step1.no_profiles');
  profileSelect.appendChild(noProfileOption);

  // Corrupt profile warning (hidden by default)
  const corruptMsg = document.createElement('div');
  corruptMsg.id = 'evf-profile-corrupt-msg';
  corruptMsg.setAttribute('role', 'alert');
  corruptMsg.setAttribute('aria-live', 'assertive');
  corruptMsg.className = 'evf-error-msg evf-hidden';

  // --- Manual URL input ---
  const urlLabel = document.createElement('label');
  urlLabel.setAttribute('for', 'evf-bridge-url');
  urlLabel.textContent = t('evf.wizard.step1.manual_url_label');

  const urlWrapper = document.createElement('div');
  urlWrapper.className = 'evf-input-wrapper';

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.id = 'evf-bridge-url';
  urlInput.className = 'evf-input';
  urlInput.placeholder = 'https://bridge.local:8910';
  urlInput.setAttribute('autocomplete', 'url');
  urlInput.setAttribute('aria-describedby', 'evf-url-hint evf-url-error');
  if (state.bridgeUrl) {
    urlInput.value = state.bridgeUrl;
  }

  const urlValidIcon = document.createElement('span');
  urlValidIcon.className = 'evf-valid-icon evf-hidden';
  urlValidIcon.setAttribute('aria-hidden', 'true');
  // Inline SVG checkmark (no CDN dependency — §3.3 Even Hub constraint)
  urlValidIcon.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 8l4 4 6-7" stroke="var(--evf-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const urlHint = document.createElement('div');
  urlHint.id = 'evf-url-hint';
  urlHint.className = 'evf-hint';
  urlHint.textContent = t('evf.wizard.step1.url_hint');

  const urlError = document.createElement('div');
  urlError.id = 'evf-url-error';
  urlError.setAttribute('role', 'alert');
  urlError.setAttribute('aria-live', 'assertive');
  urlError.className = 'evf-error-msg evf-hidden';

  // Continue button
  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.className = 'evf-btn evf-btn-primary';
  continueBtn.textContent = t('evf.btn.continue');
  continueBtn.disabled = !BRIDGE_URL_REGEX.test(state.bridgeUrl);
  continueBtn.setAttribute('aria-label', t('evf.btn.continue'));

  // Assemble
  urlWrapper.appendChild(urlInput);
  urlWrapper.appendChild(urlValidIcon);

  form.appendChild(profileLabel);
  form.appendChild(profileSelect);
  form.appendChild(corruptMsg);
  form.appendChild(urlLabel);
  form.appendChild(urlWrapper);
  form.appendChild(urlHint);
  form.appendChild(urlError);

  container.innerHTML = '';
  container.appendChild(form);
  container.appendChild(continueBtn);

  // --- Load saved profiles ---
  listProfiles()
    .then((profiles) => {
      for (const profile of profiles) {
        const opt = document.createElement('option');
        opt.value = profile.profileId;
        // Safe: textContent only (T-02-03)
        opt.textContent = profile.bridgeUrl;
        opt.dataset.profileId = profile.profileId;
        opt.dataset.bridgeUrl = profile.bridgeUrl;
        profileSelect.appendChild(opt);
      }
    })
    .catch(() => {
      // Corrupt profile — show warning (T-02-04)
      corruptMsg.textContent = t('evf.wizard.step1.profile_corrupt');
      corruptMsg.classList.remove('evf-hidden');
    });

  // --- Event listeners ---
  function validateUrl(): boolean {
    const url = urlInput.value.trim();
    const valid = BRIDGE_URL_REGEX.test(url);
    if (valid) {
      urlInput.classList.remove('evf-input-error');
      urlInput.classList.add('evf-input-valid');
      urlValidIcon.classList.remove('evf-hidden');
      urlError.classList.add('evf-hidden');
      urlError.textContent = '';
    } else if (url.length > 0) {
      urlInput.classList.add('evf-input-error');
      urlInput.classList.remove('evf-input-valid');
      urlValidIcon.classList.add('evf-hidden');
      urlError.textContent = t('evf.wizard.step1.url_error_format');
      urlError.classList.remove('evf-hidden');
    } else {
      urlInput.classList.remove('evf-input-error', 'evf-input-valid');
      urlValidIcon.classList.add('evf-hidden');
      urlError.classList.add('evf-hidden');
      urlError.textContent = '';
    }
    continueBtn.disabled = !valid;
    return valid;
  }

  function onUrlBlur() {
    validateUrl();
  }

  function onUrlInput() {
    // Validate on input to update Continue button state, but only show error on blur
    const url = urlInput.value.trim();
    const valid = BRIDGE_URL_REGEX.test(url);
    continueBtn.disabled = !valid;
    if (valid) {
      urlInput.classList.remove('evf-input-error');
      urlInput.classList.add('evf-input-valid');
      urlValidIcon.classList.remove('evf-hidden');
      urlError.classList.add('evf-hidden');
    }
  }

  function onProfileChange() {
    const selected = profileSelect.value;
    if (selected === '') {
      urlInput.disabled = false;
      urlInput.value = '';
      validateUrl();
      return;
    }
    const opt = profileSelect.options[profileSelect.selectedIndex];
    const savedUrl = opt?.dataset.bridgeUrl ?? '';
    // Safe: value assignment (not innerHTML)
    urlInput.value = savedUrl;
    urlInput.disabled = true;
    continueBtn.disabled = false;
    urlValidIcon.classList.remove('evf-hidden');
  }

  function onContinue() {
    const url = urlInput.value.trim();
    if (!BRIDGE_URL_REGEX.test(url)) {
      return;
    }
    // DEV-ONLY: when the access token is removed (isWizardNoAuth), skip Step 2
    // (token entry) and go straight to Step 3 (character selection). The empty
    // bearer is accepted by a bridge started with EVF_DEV_NO_AUTH.
    const nextStep = isWizardNoAuth() ? WizardStep.STEP3 : WizardStep.STEP2;
    store.set({ bridgeUrl: url, step: nextStep, error: null });
  }

  urlInput.addEventListener('blur', onUrlBlur);
  urlInput.addEventListener('input', onUrlInput);
  profileSelect.addEventListener('change', onProfileChange);
  continueBtn.addEventListener('click', onContinue);

  // Focus the heading of this step (accessibility — focus management on step advance)
  // The heading is managed by wizard.ts, not here.

  _cleanup = () => {
    urlInput.removeEventListener('blur', onUrlBlur);
    urlInput.removeEventListener('input', onUrlInput);
    profileSelect.removeEventListener('change', onProfileChange);
    continueBtn.removeEventListener('click', onContinue);
  };
}

/** Remove event listeners — called by wizard.ts before switching steps. */
export function destroy(): void {
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }
}
