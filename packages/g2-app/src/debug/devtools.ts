/**
 * `window.__evf` — console/automation handle for the debug channel (P5: drivable without
 * glasses). Installed by `main.ts` ONLY with `?debug=1` or `?demo=…`; absent otherwise
 * (fail-closed: no global, no way to inject input in a normal session).
 *
 * ```js
 * __evf.state()            // { app, display, scenario? }
 * __evf.events(20)         // last 20 debug entries
 * __evf.dispatch('down')   // 'tap' | 'double' | 'up' | 'down' | { menu: id }
 * ```
 */
import type { AppState } from '../state/app-store.js';
import type { TapGesture } from './bridge-tap.js';
import type { DebugEntry } from './debug-log.js';

/** Snapshot returned by `__evf.state()`. */
export interface DevtoolsState {
  /** App store state, or `null` before the store exists. */
  app: AppState | null;
  /** Text container name → content currently on the glasses (empty without a bridge). */
  display: Record<string, string>;
  /** Demo scenario on screen (demo mode only). */
  scenario?: string;
}

export interface EvfDevtools {
  state(): DevtoolsState;
  events(limit?: number): readonly DebugEntry[];
  /** Injects a gesture; returns `false` when no glasses bridge is attached. */
  dispatch(gesture: TapGesture): boolean;
}

/** Host object that receives the handle (`window` in the app). */
export type DevtoolsHost = { __evf?: EvfDevtools };

const GESTURES: readonly string[] = ['tap', 'double', 'up', 'down'];

/**
 * Validates untrusted console input into a {@link TapGesture}.
 *
 * @returns The gesture, or `null` when `value` is not one.
 */
export function toTapGesture(value: unknown): TapGesture | null {
  if (typeof value === 'string') return GESTURES.includes(value) ? (value as TapGesture) : null;
  if (typeof value === 'object' && value !== null && 'menu' in value) {
    const id = (value as { menu: unknown }).menu;
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? { menu: id } : null;
  }
  return null;
}

/**
 * Installs `host.__evf`. `dispatch` validates its argument (console input is untrusted).
 *
 * @returns Removes the handle.
 */
export function installDevtools(
  host: DevtoolsHost,
  api: {
    state: () => DevtoolsState;
    events: (limit?: number) => readonly DebugEntry[];
    /** Current gesture injector, or `null` while no glasses bridge is attached. */
    injector: () => ((gesture: TapGesture) => void) | null;
  },
): () => void {
  host.__evf = {
    state: api.state,
    events: api.events,
    dispatch(value) {
      const gesture = toTapGesture(value);
      if (gesture === null) {
        throw new TypeError(`__evf.dispatch: unknown gesture ${JSON.stringify(value)}`);
      }
      const inject = api.injector();
      if (inject === null) return false;
      inject(gesture);
      return true;
    },
  };
  return () => {
    delete host.__evf;
  };
}
