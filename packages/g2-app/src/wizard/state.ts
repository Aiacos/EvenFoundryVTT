/**
 * Wizard state machine — hand-rolled observable store.
 *
 * No external state library (D-2.04, CLAUDE.md — no React/Vue/Svelte).
 * The store is the single coordination mechanism between wizard.ts and step components.
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md D-2.04
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 1
 */

import { resolveBridgeUrl } from './is-dev-no-auth.js';

/** Steps in the 3-step pairing wizard. */
export enum WizardStep {
  STEP1 = 'STEP1',
  STEP2 = 'STEP2',
  STEP3 = 'STEP3',
  COMPLETION = 'COMPLETION',
  /** Shown when auto-connect detects a stale/broken session. */
  REPAIR = 'REPAIR',
}

/** Typed error states from Step 2 connection test + auto-connect. */
export type ErrorType = '401' | '403' | 'unreachable' | 'timeout' | 'version_mismatch';

/** A wizard error payload with type discrimination. */
export interface WizardError {
  readonly type: ErrorType;
  /** The URL that was contacted (for display in error messages). */
  readonly url?: string;
  /** Human-readable reason from bridge (optional). */
  readonly reason?: string;
}

/** Full wizard state snapshot. */
export interface WizardState {
  readonly step: WizardStep;
  /** Bridge URL entered in Step 1 (validated, no trailing slash). */
  readonly bridgeUrl: string;
  /**
   * Bearer token entered in Step 2.
   * Held in memory ONLY for the wizard session; NEVER persisted to Tier 3 (T-02-01).
   */
  readonly token: string;
  /** Character ID selected in Step 3. */
  readonly characterId: string;
  /** UUID profile identifier — used as Tier 3 key suffix. */
  readonly profileId: string;
  /** i18n lookup function — set once i18n is loaded. */
  readonly i18n: (key: string, vars?: Record<string, string>) => string;
  /** Current error state, if any. Cleared on step advance. */
  readonly error: WizardError | null;
}

/** Subscriber callback. */
type Subscriber<T> = (state: T) => void;

/** Unsubscribe function returned by `subscribe`. */
type Unsubscribe = () => void;

/** Reactive observable store. */
export interface Store<T> {
  /** Get the current state snapshot. */
  get(): T;
  /** Merge a partial update; notifies all subscribers. */
  set(partial: Partial<T>): void;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(fn: Subscriber<T>): Unsubscribe;
}

/**
 * Create a reactive store with an initial state value.
 *
 * The `set` method performs a shallow merge (spread) of partial updates.
 * All subscribers are notified synchronously after each `set`.
 *
 * @example
 * ```ts
 * const store = createStore<WizardState>(initialState);
 * store.subscribe((s) => renderStep(s.step));
 * store.set({ step: WizardStep.STEP2, bridgeUrl: 'https://bridge.local:8910' });
 * ```
 */
export function createStore<T>(initial: T): Store<T> {
  let state: T = initial;
  const subscribers = new Set<Subscriber<T>>();

  return {
    get(): T {
      return state;
    },

    set(partial: Partial<T>): void {
      state = { ...state, ...partial };
      for (const fn of subscribers) {
        fn(state);
      }
    },

    subscribe(fn: Subscriber<T>): Unsubscribe {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
  };
}

/**
 * Default i18n function used before i18n strings are loaded.
 * Returns the key itself as a fallback — the UI will display the key name,
 * which is acceptable during development and bridge-unavailable scenarios.
 */
export function defaultI18n(key: string, vars?: Record<string, string>): string {
  if (!vars) {
    return key;
  }
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), key);
}

/** Generate a UUID v4 using the Web Crypto API. */
export function generateProfileId(): string {
  return crypto.randomUUID();
}

/** Build the initial wizard state. */
export function createInitialState(): WizardState {
  return {
    step: WizardStep.STEP1,
    // Single ConnectionProfile source-of-truth (Feature 001 D1): the initial
    // bridgeUrl is resolved with no implicit `localhost` — it is empty in
    // production builds and unit tests, and only pre-filled when an explicit dev
    // override (`VITE_EVF_DEV_BRIDGE_URL`) is set. A saved-profile bridgeUrl is
    // applied later in Step 1 when the user picks it. See ./is-dev-no-auth.ts.
    bridgeUrl: resolveBridgeUrl(),
    token: '',
    characterId: '',
    profileId: generateProfileId(),
    i18n: defaultI18n,
    error: null,
  };
}
