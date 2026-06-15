/**
 * makeWizardCommandHandlers — command handlers that drive the wizard store + DOM.
 *
 * Quick Task 260604-cwa: Dev-only whole-system debug/control harness.
 *
 * DEV-ONLY. Called by {@link installDebugAgent} (debug-agent.ts) when `opts.store`
 * is provided. Exported for direct test use.
 *
 * Exposed commands (all async, returns the new store snapshot or a structured value):
 *
 * - `getState`       — returns the current {@link WizardState} snapshot.
 * - `setBridgeUrl`   — sets store.bridgeUrl, returns snapshot.
 * - `setToken`       — finds `#evf-token-input`, sets value + fires 'input' event
 *                      (enables the connect button per Step 2 logic).
 * - `goStep(n)`      — maps number 1/2/3 → WizardStep.STEP1/2/3 and sets store.step.
 * - `click(target)`  — resolves an action alias (connect/back) or CSS selector, then
 *                      dispatches a MouseEvent('click') on the resolved element.
 * - `reveal`         — finds the show/hide toggle (#evf-token-input show/hide) and
 *                      clicks it; returns snapshot.
 * - `dumpDom`        — returns `#step-content` outerHTML string.
 * - `snapshot`       — returns `{step, visibleButtons, inputs}` summary.
 *
 * # Security note (T-02-01)
 *
 * Token values are held in the DOM input + store only. Handlers NEVER log or
 * persist the token. Log frames produced by installDebugAgent() flow through the
 * DebugEventBus which scrubs known tokens via structural redaction.
 *
 * @see ./debug-agent.ts (consumer)
 * @see ../wizard/state.ts (WizardState + Store<T>)
 * @see ../wizard/wizard.ts (entry that calls installDebugAgent behind the dev gate)
 */
import { type Store, type WizardState, WizardStep } from '../wizard/state.js';

// ─── Action alias map ─────────────────────────────────────────────────────────

/** Map of friendly action names to DOM selectors. */
const ACTION_ALIAS: Record<string, string> = {
  connect: '#evf-connect-btn',
  back: '[data-action="back"], .evf-btn-ghost',
  reveal: '[data-action="show-hide"]',
};

// ─── Step number map ──────────────────────────────────────────────────────────

/** Map wizard step numbers (1/2/3) to WizardStep enum values. */
const STEP_NUMBER_MAP: Record<number, WizardStep> = {
  1: WizardStep.STEP1,
  2: WizardStep.STEP2,
  3: WizardStep.STEP3,
};

// ─── Handler map type ─────────────────────────────────────────────────────────

/**
 * The record of async command handlers returned by {@link makeWizardCommandHandlers}.
 *
 * Each handler is callable by name from the debug agent dispatcher
 * (`installDebugAgent`'s WS command router) and from `window.__EVF_DEBUG__`.
 */
export interface WizardCommandHandlers {
  /** Return the current wizard store snapshot. */
  getState(): Promise<WizardState>;
  /**
   * Set the bridge URL in the store.
   *
   * @param args - `{url: string}` — the new bridge URL.
   * @returns The updated store snapshot.
   */
  setBridgeUrl(args: { url: string }): Promise<WizardState>;
  /**
   * Set the token input value and enable the connect button.
   *
   * T-02-01: token held in-memory only — handler never logs or persists it.
   *
   * @param args - `{t: string}` — the bearer token.
   * @returns The updated store snapshot.
   */
  setToken(args: { t: string }): Promise<WizardState>;
  /**
   * Advance to a numbered wizard step.
   *
   * @param args - `{n: number}` — step number (1=STEP1, 2=STEP2, 3=STEP3).
   * @returns The updated store snapshot.
   */
  goStep(args: { n: number }): Promise<WizardState>;
  /**
   * Click a button identified by action alias or CSS selector.
   *
   * Aliases: `'connect'` → `#evf-connect-btn`, `'back'` → back button.
   * Generic: any CSS selector string.
   *
   * @param args - `{target: string}` — alias or CSS selector.
   * @returns The current store snapshot.
   */
  click(args: { target: string }): Promise<WizardState>;
  /**
   * Toggle the show/hide toggle on the token input (Step 2).
   *
   * @returns The current store snapshot.
   */
  reveal(): Promise<WizardState>;
  /**
   * Return the outer HTML of `#step-content`.
   *
   * @returns HTML string of the current step container.
   */
  dumpDom(): Promise<string>;
  /**
   * Return a compact snapshot of the current visible wizard state.
   *
   * @returns `{step, visibleButtons, inputs}`.
   */
  snapshot(): Promise<{ step: string; visibleButtons: string[]; inputs: string[] }>;
}

/**
 * Create the wizard command handler map bound to a store reference.
 *
 * @param store - The wizard reactive store (created in initWizard or bootEngine).
 * @returns Record of async handlers callable by the debug agent dispatcher.
 */
export function makeWizardCommandHandlers(store: Store<WizardState>): WizardCommandHandlers {
  /** Internal: resolve an action alias or treat as CSS selector. */
  function resolveSelector(target: string): Element | null {
    const alias = ACTION_ALIAS[target];
    if (alias !== undefined) {
      return document.querySelector(alias);
    }
    // Generic CSS selector
    return document.querySelector(target);
  }

  return {
    async getState(): Promise<WizardState> {
      return store.get();
    },

    async setBridgeUrl(args: { url: string }): Promise<WizardState> {
      store.set({ bridgeUrl: args.url });
      return store.get();
    },

    async setToken(args: { t: string }): Promise<WizardState> {
      const input = document.querySelector<HTMLInputElement>('#evf-token-input');
      if (input !== null) {
        // Set value and fire 'input' event so the connect button enables (T-02-01)
        input.value = args.t;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return store.get();
    },

    async goStep(args: { n: number }): Promise<WizardState> {
      const step = STEP_NUMBER_MAP[args.n];
      if (step !== undefined) {
        store.set({ step });
      }
      return store.get();
    },

    async click(args: { target: string }): Promise<WizardState> {
      const el = resolveSelector(args.target);
      if (el !== null) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
      return store.get();
    },

    async reveal(): Promise<WizardState> {
      // Find the show/hide toggle button — it doesn't have a fixed id in Step 2,
      // so we fall back to querying by text content or class.
      const toggle =
        document.querySelector<HTMLButtonElement>('[data-action="show-hide"]') ??
        document.querySelector<HTMLButtonElement>('button.evf-btn-ghost:first-of-type');
      if (toggle !== null) {
        toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
      return store.get();
    },

    async dumpDom(): Promise<string> {
      const container = document.getElementById('step-content');
      return container?.outerHTML ?? '';
    },

    async snapshot(): Promise<{ step: string; visibleButtons: string[]; inputs: string[] }> {
      const state = store.get();
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button:not(.evf-hidden)'),
      )
        .filter((b) => !b.disabled || b.offsetParent !== null)
        .map((b) => b.id || b.textContent?.trim() || b.className)
        .filter(Boolean);
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'))
        .map((i) => i.id || i.name || i.type)
        .filter(Boolean);
      return { step: state.step, visibleButtons: buttons as string[], inputs: inputs as string[] };
    },
  };
}
