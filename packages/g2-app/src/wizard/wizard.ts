/**
 * Wizard SPA entry point — orchestrates step rendering and state transitions.
 *
 * Responsibilities:
 *   1. Load i18n catalog from bridge (or fall back gracefully).
 *   2. Initialize auto-connect handler.
 *   3. Subscribe to the wizard store — render the correct step on each change.
 *   4. Manage step lifecycle: call `step.destroy()` before switching.
 *
 * All 24 UI-B i18n keys from 02-UI-SPEC.md are wired through the `t` function.
 * Key wiring is validated at load time via `checkRequiredKeys`.
 *
 * Security (T-02-03): step titles rendered via textContent; step indicators via aria attributes.
 * No innerHTML used for user-supplied or dynamic data.
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-UI-SPEC.md UI-B spec
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 2
 * @see docs/architecture/0002-protocol-versioning.md ADR-0002 (WS envelope)
 */

// Install the legacy `hub` global polyfill BEFORE any wizard module reads it.
// See `hub-polyfill.ts` header for OQ-INV2-4 discovery + rationale.
import { installHubPolyfill } from '../hub-polyfill.js';

import { initAutoConnect } from './auto-connect.js';
import { clearI18nCache, detectLocale, loadI18n, makeT } from './i18n.js';
import { defaultWizardCatalog } from './i18n-catalog.js';
import { createInitialState, createStore, WizardStep } from './state.js';
import * as Completion from './steps/completion.js';
import * as Step1 from './steps/step1-profile.js';
import * as Step2 from './steps/step2-token.js';
import * as Step3 from './steps/step3-character.js';

// Idempotent — returns early when tests have stubbed `globalThis.hub` first.
installHubPolyfill();

/**
 * All 24 UI-B i18n keys from 02-UI-SPEC.md.
 * This array is the compile-time source of truth for key coverage.
 * If a key is missing from the bridge catalog, `t(key)` returns the key itself.
 */
export const ALL_I18N_KEYS = [
  'evf.wizard.step_indicator',
  'evf.wizard.step1.title',
  'evf.wizard.step1.saved_profiles_label',
  'evf.wizard.step1.no_profiles',
  'evf.wizard.step1.manual_url_label',
  'evf.wizard.step1.url_hint',
  'evf.wizard.step1.url_error_format',
  'evf.wizard.step1.profile_corrupt',
  'evf.wizard.step2.title',
  'evf.wizard.step2.paste_label',
  'evf.wizard.step2.show_toggle',
  'evf.wizard.step2.hide_toggle',
  'evf.wizard.step2.paste_btn',
  'evf.wizard.step2.connecting',
  'evf.wizard.step2.error.401',
  'evf.wizard.step2.error.403',
  'evf.wizard.step2.error.unreachable',
  'evf.wizard.step2.error.timeout',
  'evf.wizard.step2.error.version_mismatch',
  'evf.wizard.step2.cta',
  'evf.wizard.step2.short_token_hint',
  'evf.wizard.step3.title',
  'evf.wizard.step3.loading',
  'evf.wizard.step3.empty',
  'evf.wizard.step3.empty.retry',
  'evf.wizard.step3.error.fetch',
  'evf.wizard.step3.error.go_back',
  'evf.wizard.step3.cta',
  'evf.wizard.complete.heading',
  'evf.wizard.complete.character',
  'evf.wizard.complete.bridge',
  'evf.wizard.complete.instructions',
  'evf.wizard.complete.repair',
  'evf.autoconnect.connecting',
  'evf.autoconnect.repair.title',
  'evf.autoconnect.repair.body',
  'evf.autoconnect.repair.reason',
  'evf.autoconnect.repair.cta',
  'evf.autoconnect.error.unreachable',
  'evf.btn.back',
  'evf.btn.continue',
  'evf.btn.retry',
  'evf.btn.edit_url',
] as const;

/** Verify that all 24 UI-B keys from 02-UI-SPEC.md are present. Called at init. */
export function checkRequiredKeys(catalog: Record<string, string>): string[] {
  return ALL_I18N_KEYS.filter((key) => !(key in catalog));
}

/**
 * Initialize the wizard SPA.
 *
 * Called from wizard.html `<script type="module">`.
 * Reads the DOM root elements, loads i18n, and starts the step machine.
 */
export async function initWizard(): Promise<void> {
  const stepContent = document.getElementById('step-content');
  const stepIndicatorList = document.querySelector<HTMLOListElement>(
    'nav[aria-label="Setup progress"] ol',
  );
  const stepTitle = document.getElementById('evf-step-title');

  if (!stepContent) {
    console.warn('[EVF] wizard: #step-content not found — aborting init.');
    return;
  }

  // Capture as non-null for use inside closures (already guarded above)
  const content: HTMLElement = stepContent;

  // Create store with initial state
  const store = createStore(createInitialState());
  const { profileId } = store.get();

  // Quick Task 260604-cwa: dev-only debug agent — wire behind dynamic import gate so
  // the entire debug-agent module is tree-shaken from the production bundle.
  // T-cwa-05: the dynamic import is guarded by the SAME boolean flag that the
  // debug-agent module itself checks, so Rollup sees both branches as dead in prod.
  if (import.meta.env.DEV || import.meta.env.VITE_EVF_DEBUG) {
    import('../debug/debug-agent.js').then(({ installDebugAgent }) => {
      installDebugAgent({ store });
    }).catch(() => {
      // Soft-fail — debug agent unavailable does not break the wizard
    });
  }

  // Load i18n. The bundled catalog is the BASE so every step (incl. Step 1, which runs
  // before any bridge is known) is readable; the bridge-fetched catalog is merged on top
  // and may override/extend it. Missing-everywhere keys still fall back to the key name.
  const bundled = defaultWizardCatalog(detectLocale());
  let t = makeT(bundled);
  const { bridgeUrl } = store.get();
  if (bridgeUrl) {
    const bridgeCatalog = await loadI18n(bridgeUrl, undefined);
    t = makeT({ ...bundled, ...bridgeCatalog });
    // Informational: which keys the BRIDGE did not serve (the bundle still covers them, so
    // the UI is fully translated — this just flags drift between bridge + bundle for devs).
    const missingFromBridge = checkRequiredKeys(bridgeCatalog);
    if (missingFromBridge.length > 0) {
      console.warn(
        '[EVF] wizard: keys not served by bridge (using bundled fallback):',
        missingFromBridge,
      );
    }
  }

  // Store i18n fn in state
  store.set({ i18n: t });

  // Initialize auto-connect
  try {
    initAutoConnect(store, profileId);
  } catch {
    // Even Hub may not be available in dev environment — not fatal
    console.warn('[EVF] wizard: hub.eventBus not available — auto-connect disabled.');
  }

  // Track current step component for cleanup
  let currentStepName: WizardStep | null = null;

  /** Destroy the currently rendered step and clear the content area. */
  function destroyCurrentStep(): void {
    if (currentStepName === null) {
      return;
    }
    switch (currentStepName) {
      case WizardStep.STEP1:
        Step1.destroy();
        break;
      case WizardStep.STEP2:
        Step2.destroy();
        break;
      case WizardStep.STEP3:
        Step3.destroy();
        break;
      case WizardStep.COMPLETION:
      case WizardStep.REPAIR:
        Completion.destroy();
        break;
    }
    currentStepName = null;
  }

  /** Render the correct step based on store state. */
  function renderStep(step: WizardStep): void {
    if (step === currentStepName) {
      return;
    }

    destroyCurrentStep();
    currentStepName = step;

    // Update step indicator
    _updateStepIndicator(stepIndicatorList, step, t);

    // Update step title
    _updateStepTitle(stepTitle, step, t);

    // Render step component
    switch (step) {
      case WizardStep.STEP1:
        Step1.render(content, store, t);
        break;
      case WizardStep.STEP2:
        Step2.render(content, store, t);
        break;
      case WizardStep.STEP3:
        Step3.render(content, store, t);
        break;
      case WizardStep.COMPLETION: {
        const selected = Step3.getSelectedCharacter();
        Completion.render(content, store, t, {
          characterName: selected.name || store.get().characterId,
          characterClass: selected.characterClass,
        });
        break;
      }
      case WizardStep.REPAIR:
        Completion.render(content, store, t);
        break;
    }

    // Move focus to step heading (accessibility — WCAG 2.4.3)
    if (stepTitle) {
      stepTitle.focus();
    }
  }

  // Subscribe to state changes
  store.subscribe((state) => {
    renderStep(state.step);
  });

  // Initial render
  renderStep(store.get().step);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const STEP_NUMBERS: Partial<Record<WizardStep, number>> = {
  [WizardStep.STEP1]: 1,
  [WizardStep.STEP2]: 2,
  [WizardStep.STEP3]: 3,
};

const STEP_TITLES: Partial<Record<WizardStep, string>> = {
  [WizardStep.STEP1]: 'evf.wizard.step1.title',
  [WizardStep.STEP2]: 'evf.wizard.step2.title',
  [WizardStep.STEP3]: 'evf.wizard.step3.title',
  [WizardStep.COMPLETION]: 'evf.wizard.complete.heading',
  [WizardStep.REPAIR]: 'evf.autoconnect.repair.title',
};

function _updateStepIndicator(
  list: HTMLOListElement | null,
  step: WizardStep,
  t: (key: string, vars?: Record<string, string>) => string,
): void {
  if (!list) {
    return;
  }

  const currentNum = STEP_NUMBERS[step];
  if (currentNum === undefined) {
    return; // Completion / Repair — hide step indicator
  }

  const items = Array.from(list.querySelectorAll('li'));
  items.forEach((item: Element, index: number) => {
    const stepNum = index + 1;
    const dot = item.querySelector('.evf-step-dot');
    if (stepNum === currentNum) {
      item.setAttribute('aria-current', 'step');
      dot?.classList.add('evf-step-dot--active');
      dot?.classList.remove('evf-step-dot--future');
    } else {
      item.removeAttribute('aria-current');
      dot?.classList.remove('evf-step-dot--active');
      if (stepNum < currentNum) {
        dot?.classList.add('evf-step-dot--past');
      } else {
        dot?.classList.add('evf-step-dot--future');
      }
    }

    // Update aria-label with step indicator text
    const label = t('evf.wizard.step_indicator', { n: String(stepNum), total: '3' });
    item.setAttribute('aria-label', label);
  });
}

function _updateStepTitle(
  titleEl: HTMLElement | null,
  step: WizardStep,
  t: (key: string, vars?: Record<string, string>) => string,
): void {
  if (!titleEl) {
    return;
  }
  const key = STEP_TITLES[step];
  if (key) {
    // Safe: textContent (T-02-03)
    titleEl.textContent = t(key);
  } else {
    titleEl.textContent = '';
  }
}

// Export clearI18nCache for test environments
export { clearI18nCache };
