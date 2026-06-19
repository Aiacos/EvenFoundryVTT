/**
 * Step 2 — Bearer Token Entry
 *
 * Renders into `#step-content`. Provides:
 *   - Password input (masked by default) with Show/Hide toggle.
 *   - Paste from Clipboard button (graceful degradation if Clipboard API unavailable).
 *   - "Connect" button fires `GET {bridgeUrl}/v1/health` with 10-second timeout.
 *
 * The DM generates the bearer token in the Foundry PairModal (Settings → EvenFoundryVTT →
 * "Pair a G2 device"), reveals/copies it there, and hands it to the player who pastes it
 * here. There is NO QR-scan path: the Even Hub platform exposes no camera/QR-scan API to
 * apps (canonical: hub.evenrealities.com/docs/guides/device-apis — "no camera (there is
 * none)"), so the only viable token-transfer is paste + manual entry. See ADR-0005
 * §OQ-INV2-4 (resolved) and Specs.md §11.5.4.
 *
 * Error mapping (T-02-03):
 *   - 200 → STEP3
 *   - 401 → error.type = "401"
 *   - 403 → error.type = "403"
 *   - 426 → error.type = "version_mismatch"
 *   - Network / timeout → error.type = "unreachable" | "timeout"
 *
 * Security (T-02-03): user input rendered via value/textContent only — never innerHTML.
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-UI-SPEC.md Step 2 spec
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 2
 */

import type { WizardState } from '../state.js';
import { type Store, type WizardError, WizardStep } from '../state.js';

/** Connection test timeout in milliseconds (10 seconds per spec). */
const CONNECT_TIMEOUT_MS = 10_000;

/** Minimum token length hint threshold. */
const TOKEN_MIN_LENGTH = 32;

/**
 * All i18n keys used by Step 2.
 */
export type Step2Keys =
  | 'evf.wizard.step2.title'
  | 'evf.wizard.step2.paste_label'
  | 'evf.wizard.step2.show_toggle'
  | 'evf.wizard.step2.hide_toggle'
  | 'evf.wizard.step2.paste_btn'
  | 'evf.wizard.step2.connecting'
  | 'evf.wizard.step2.error.401'
  | 'evf.wizard.step2.error.403'
  | 'evf.wizard.step2.error.unreachable'
  | 'evf.wizard.step2.error.timeout'
  | 'evf.wizard.step2.error.version_mismatch'
  | 'evf.wizard.step2.cta'
  | 'evf.wizard.step2.short_token_hint'
  | 'evf.btn.back';

let _cleanup: (() => void) | null = null;

/**
 * Render Step 2 into the given container.
 *
 * @param container - The `#step-content` element.
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

  const form = document.createElement('div');
  form.setAttribute('role', 'form');

  // Paste instruction label
  const pasteLabel = document.createElement('label');
  pasteLabel.setAttribute('for', 'evf-token-input');
  pasteLabel.textContent = t('evf.wizard.step2.paste_label');

  // Token input
  const tokenInput = document.createElement('input');
  tokenInput.type = 'password';
  tokenInput.id = 'evf-token-input';
  tokenInput.className = 'evf-input';
  tokenInput.setAttribute('autocomplete', 'one-time-code');
  tokenInput.setAttribute('aria-describedby', 'evf-token-hint evf-connect-error');

  // Show/Hide toggle
  const showToggle = document.createElement('button');
  showToggle.type = 'button';
  showToggle.className = 'evf-btn evf-btn-ghost';
  showToggle.textContent = t('evf.wizard.step2.show_toggle');

  // Paste button
  const pasteBtn = document.createElement('button');
  pasteBtn.type = 'button';
  pasteBtn.className = 'evf-btn evf-btn-ghost';
  pasteBtn.textContent = t('evf.wizard.step2.paste_btn');

  // Short token hint
  const tokenHint = document.createElement('div');
  tokenHint.id = 'evf-token-hint';
  tokenHint.className = 'evf-hint evf-hidden';
  tokenHint.textContent = t('evf.wizard.step2.short_token_hint');

  // Error region
  const errorRegion = document.createElement('div');
  errorRegion.id = 'evf-connect-error';
  errorRegion.setAttribute('role', 'alert');
  errorRegion.setAttribute('aria-live', 'assertive');
  errorRegion.className = 'evf-error-msg evf-hidden';

  // Status region (connecting spinner)
  const statusRegion = document.createElement('div');
  statusRegion.setAttribute('aria-live', 'polite');
  statusRegion.className = 'evf-status evf-hidden';

  // CTA row
  const ctaRow = document.createElement('div');
  ctaRow.className = 'wizard-cta';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'evf-btn evf-btn-ghost';
  backBtn.textContent = t('evf.btn.back');

  const connectBtn = document.createElement('button');
  connectBtn.type = 'button';
  connectBtn.id = 'evf-connect-btn';
  connectBtn.className = 'evf-btn evf-btn-primary';
  connectBtn.textContent = t('evf.wizard.step2.cta');
  connectBtn.disabled = true;

  ctaRow.appendChild(backBtn);
  ctaRow.appendChild(connectBtn);

  // Show existing error from store if re-entering step
  if (state.error) {
    _showError(errorRegion, state.error, tokenInput, t);
  }

  // Assemble
  form.appendChild(pasteLabel);
  form.appendChild(tokenInput);
  form.appendChild(showToggle);
  form.appendChild(pasteBtn);
  form.appendChild(tokenHint);
  form.appendChild(errorRegion);
  form.appendChild(statusRegion);

  container.innerHTML = '';
  container.appendChild(form);
  container.appendChild(ctaRow);

  // --- Event listeners ---
  function onTokenInput() {
    const token = tokenInput.value;
    const hasToken = token.length > 0;
    connectBtn.disabled = !hasToken;

    // Short token hint (non-blocking)
    if (hasToken && token.length < TOKEN_MIN_LENGTH) {
      tokenHint.classList.remove('evf-hidden');
    } else {
      tokenHint.classList.add('evf-hidden');
    }

    // Clear error on input
    errorRegion.classList.add('evf-hidden');
    errorRegion.textContent = '';
    tokenInput.classList.remove('evf-input-error');
  }

  function onShowToggle() {
    const isPassword = tokenInput.type === 'password';
    tokenInput.type = isPassword ? 'text' : 'password';
    showToggle.textContent = isPassword
      ? t('evf.wizard.step2.hide_toggle')
      : t('evf.wizard.step2.show_toggle');
  }

  function onPaste() {
    if (!navigator.clipboard?.readText) {
      return;
    }
    navigator.clipboard
      .readText()
      .then((text) => {
        tokenInput.value = text.trim();
        onTokenInput();
      })
      .catch(() => {
        // Clipboard permission denied — hint user to paste manually
        // (no error shown; paste affordance is supplemental)
      });
  }

  function onBack() {
    store.set({ step: WizardStep.STEP1, error: null });
  }

  async function onConnect() {
    const token = tokenInput.value.trim();
    if (!token) {
      return;
    }

    connectBtn.disabled = true;
    errorRegion.classList.add('evf-hidden');
    statusRegion.textContent = t('evf.wizard.step2.connecting');
    statusRegion.classList.remove('evf-hidden');

    const { bridgeUrl } = store.get();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(`${bridgeUrl}/v1/health`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      statusRegion.classList.add('evf-hidden');

      if (response.status === 200 || response.status === 201) {
        store.set({ token, step: WizardStep.STEP3, error: null });
        return;
      }

      let errorType: WizardError['type'];
      if (response.status === 401) {
        errorType = '401';
      } else if (response.status === 403) {
        errorType = '403';
      } else if (response.status === 426) {
        errorType = 'version_mismatch';
      } else {
        errorType = 'unreachable';
      }

      const error: WizardError = { type: errorType, url: bridgeUrl };
      store.set({ error });
      _showError(errorRegion, error, tokenInput, t);
      connectBtn.disabled = false;
    } catch (err) {
      statusRegion.classList.add('evf-hidden');

      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      const error: WizardError = {
        type: isTimeout ? 'timeout' : 'unreachable',
        url: bridgeUrl,
      };
      store.set({ error });
      _showError(errorRegion, error, tokenInput, t);
      connectBtn.disabled = false;
    }
  }

  tokenInput.addEventListener('input', onTokenInput);
  showToggle.addEventListener('click', onShowToggle);
  pasteBtn.addEventListener('click', onPaste);
  backBtn.addEventListener('click', onBack);
  connectBtn.addEventListener('click', onConnect);

  _cleanup = () => {
    tokenInput.removeEventListener('input', onTokenInput);
    showToggle.removeEventListener('click', onShowToggle);
    pasteBtn.removeEventListener('click', onPaste);
    backBtn.removeEventListener('click', onBack);
    connectBtn.removeEventListener('click', onConnect);
  };
}

/** Remove event listeners. */
export function destroy(): void {
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _showError(
  errorRegion: HTMLElement,
  error: WizardError,
  tokenInput: HTMLInputElement,
  t: (key: string, vars?: Record<string, string>) => string,
): void {
  const keyMap: Record<WizardError['type'], string> = {
    '401': 'evf.wizard.step2.error.401',
    '403': 'evf.wizard.step2.error.403',
    unreachable: 'evf.wizard.step2.error.unreachable',
    timeout: 'evf.wizard.step2.error.timeout',
    version_mismatch: 'evf.wizard.step2.error.version_mismatch',
  };

  const key = keyMap[error.type];
  const msg = t(key, error.url ? { url: error.url } : undefined);
  // Safe: textContent (T-02-03)
  errorRegion.textContent = msg;
  errorRegion.classList.remove('evf-hidden');
  tokenInput.classList.add('evf-input-error');
}
