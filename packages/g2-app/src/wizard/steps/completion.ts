/**
 * Completion screen — shown after Step 3 confirms a character.
 *
 * Terminal screen: no navigation buttons.
 * If the wizard is re-opened with an existing valid session, this screen
 * is shown with a "Repair / Re-pair" link that re-launches from Step 1.
 *
 * Security (T-02-03): all content via textContent — no innerHTML for user data.
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-UI-SPEC.md Completion Screen spec
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 2
 */

import type { WizardState } from '../state.js';
import { type Store, WizardStep } from '../state.js';

/**
 * All i18n keys used by the Completion screen.
 */
export type CompletionKeys =
  | 'evf.wizard.complete.heading'
  | 'evf.wizard.complete.character'
  | 'evf.wizard.complete.bridge'
  | 'evf.wizard.complete.instructions'
  | 'evf.wizard.complete.repair';

let _cleanup: (() => void) | null = null;

/**
 * Delay before the COMPLETION → engine handoff redirect fires, so the user
 * briefly sees the success screen before `index.html` takes over.
 */
const HANDOFF_REDIRECT_MS = 1500;

/**
 * Engine entry path relative to `dist/wizard/wizard.html` (vite emits the engine
 * entry at `dist/index.html`, one directory up from the wizard).
 */
const ENGINE_ENTRY_PATH = '../index.html';

/**
 * Render the Completion screen into the given container.
 *
 * @param container - The `#step-content` element.
 * @param store - Wizard state store.
 * @param t - i18n translation function.
 * @param opts - Optional character display info.
 *   `opts.handoff === true` (set only by the COMPLETION branch in wizard.ts,
 *   NOT by the REPAIR re-entry branch) schedules a redirect to the engine entry
 *   after a short delay so `index.html`'s `launchApp` picks up the freshly-saved
 *   session. The timer is cleared by {@link destroy} so a torn-down screen never
 *   triggers a stray navigation (keeps existing wizard tests throwless).
 */
export function render(
  container: HTMLElement,
  store: Store<WizardState>,
  t: (key: string, vars?: Record<string, string>) => string,
  opts?: { characterName?: string; characterClass?: string; handoff?: boolean },
): void {
  destroy();

  const state = store.get();

  const screen = document.createElement('div');
  screen.className = 'evf-completion';
  screen.setAttribute('role', 'status');

  // Checkmark icon (inline SVG — no CDN, §3.3)
  const iconEl = document.createElement('div');
  iconEl.className = 'evf-completion__icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerHTML =
    '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="22" stroke="var(--evf-success)" stroke-width="3"/><path d="M14 24l8 8 12-14" stroke="var(--evf-success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const heading = document.createElement('h2');
  heading.className = 'evf-completion__heading';
  heading.textContent = t('evf.wizard.complete.heading');

  const charName = opts?.characterName ?? state.characterId;
  const charClass = opts?.characterClass ?? '';

  const charEl = document.createElement('p');
  charEl.className = 'evf-completion__detail';
  charEl.textContent = t('evf.wizard.complete.character', {
    name: charName,
    class: charClass,
  });

  const bridgeEl = document.createElement('p');
  bridgeEl.className = 'evf-completion__detail';
  // Strip protocol for brevity (safe: textContent)
  const bridgeDisplay = state.bridgeUrl.replace(/^https?:\/\//, '');
  bridgeEl.textContent = t('evf.wizard.complete.bridge', { url: bridgeDisplay });

  const instructionsEl = document.createElement('p');
  instructionsEl.className = 'evf-completion__instructions';
  instructionsEl.textContent = t('evf.wizard.complete.instructions');

  // Repair link
  const repairLink = document.createElement('button');
  repairLink.type = 'button';
  repairLink.className = 'evf-btn evf-btn-ghost evf-completion__repair';
  repairLink.textContent = t('evf.wizard.complete.repair');

  screen.appendChild(iconEl);
  screen.appendChild(heading);
  screen.appendChild(charEl);
  screen.appendChild(bridgeEl);
  screen.appendChild(instructionsEl);
  screen.appendChild(repairLink);

  container.innerHTML = '';
  container.appendChild(screen);

  // --- Event listeners ---
  function onRepair() {
    store.set({ step: WizardStep.STEP1, error: null });
  }

  repairLink.addEventListener('click', onRepair);

  // COMPLETION → engine handoff. Only fires when the COMPLETION branch requests
  // it (opts.handoff === true); the REPAIR re-entry path passes no handoff so it
  // never redirects. The timer is stored and cleared by destroy() so a torn-down
  // screen (e.g. in unit tests) never navigates after teardown.
  let handoffTimer: ReturnType<typeof setTimeout> | null = null;
  if (opts?.handoff === true) {
    handoffTimer = setTimeout(() => {
      window.location.href = ENGINE_ENTRY_PATH;
    }, HANDOFF_REDIRECT_MS);
  }

  _cleanup = () => {
    repairLink.removeEventListener('click', onRepair);
    if (handoffTimer !== null) {
      clearTimeout(handoffTimer);
      handoffTimer = null;
    }
  };
}

/** Remove event listeners. */
export function destroy(): void {
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }
}
