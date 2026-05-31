/**
 * LocaleEventEmitter — typed pub/sub bus for the `locale.changed` in-process signal.
 *
 * SEPARATE from `PanelGestureBus` by design (planner-locked resolution of
 * RESEARCH.md Pitfall 7): the `R1Gesture` discriminated union is reserved for
 * ACTUAL R1 hardware gesture events (tap, scroll, double-tap).
 * Locale changes are in-process synthetic signals with a distinct type surface —
 * they must NOT pollute the R1Gesture union with artificial `kind: 'locale.changed'`
 * variants. A dedicated emitter keeps both type surfaces clean and testable
 * in isolation.
 *
 * Usage pattern:
 * ```ts
 * const localeEmitter = new LocaleEventEmitter();
 *
 * // Subscribe — returns idempotent unsubscribe closure
 * const off = localeEmitter.on('changed', (code) => { ... });
 *
 * // Emit after locale selection (Phase 6 Quick Action [N] Language handler)
 * localeEmitter.emit('changed', 'it');
 *
 * // Unsubscribe in onUnmount (panel lifecycle contract T-4b-01-03)
 * off();
 * ```
 *
 * # Error isolation
 *
 * Per-listener `try/catch` (mirroring `PanelGestureBus.publish` T-4b-01-03
 * pattern): a throwing listener does NOT prevent subsequent listeners from
 * running. The throw is captured as `console.warn` telemetry.
 *
 * # Idempotent unsubscribe
 *
 * The closure returned by `on()` is idempotent — double-call is a no-op
 * (matching `AbortSignal.aborted` + `PanelGestureBus` conventions).
 *
 * @see packages/g2-app/src/engine/panel-gesture-bus.ts (R1Gesture bus — kept separate)
 * @see packages/g2-app/src/locale/locale-override.ts (persistLocaleOverride — writes kv store)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md Pitfall 7 (separation rationale)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-01-PLAN.md Task 1
 */
import type { HudLocale } from '../status-hud/i18n-budgets.js';

/**
 * Listener type for `'changed'` events.
 *
 * Receives the new locale code (`HudLocale` for a specific locale, or `'auto'`
 * to restore automatic detection from `game.i18n.lang`).
 */
export type LocaleChangedListener = (code: HudLocale | 'auto') => void;

/**
 * Typed pub/sub emitter for in-process locale change signals.
 *
 * Supports only the `'changed'` event. Thread model: single-threaded (browser
 * main thread). No buffering — `emit` invokes every active listener synchronously
 * before returning. Zero-listener `emit` is a no-op.
 */
export class LocaleEventEmitter {
  /**
   * Active listeners keyed by subscription order. `Set` gives O(1) removal
   * and deterministic insertion-order iteration — mirrors `PanelGestureBus`.
   */
  private readonly listeners = new Set<LocaleChangedListener>();

  /**
   * Subscribe to locale change events.
   *
   * Returns an idempotent unsubscribe closure. Calling the closure more than
   * once is safe — subsequent calls are no-ops.
   *
   * Panel lifecycle contract (T-4b-01-03 carry): invoke the unsubscribe
   * closure in `onUnmount` to prevent stale listeners.
   *
   * @param event Must be `'changed'` (sole event kind)
   * @param fn    Listener invoked synchronously on each `emit`
   * @returns     Idempotent unsubscribe closure
   */
  on(_event: 'changed', fn: LocaleChangedListener): () => void {
    this.listeners.add(fn);
    let removed = false;
    return () => {
      if (!removed) {
        removed = true;
        this.listeners.delete(fn);
      }
    };
  }

  /**
   * Emit a locale change to every active listener in subscription order.
   *
   * Per-listener `try/catch` isolation: a throwing listener does NOT propagate
   * the throw out of `emit` and does NOT block subsequent listeners. The throw
   * is captured into a `console.warn` telemetry call.
   *
   * @param event Must be `'changed'` (sole event kind)
   * @param code  New locale code (`HudLocale` or `'auto'`)
   */
  emit(_event: 'changed', code: HudLocale | 'auto'): void {
    // Snapshot to prevent modification-during-iteration issues
    const snapshot = Array.from(this.listeners);
    for (const fn of snapshot) {
      try {
        fn(code);
      } catch (err) {
        console.warn('[locale-events] listener threw; continuing fan-out', err);
      }
    }
  }

  /**
   * Active listener count.
   *
   * Exposed for tests and diagnostics (parity with `PanelGestureBus.size()`).
   * Production code MUST NOT gate behavior on `size()`.
   */
  size(): number {
    return this.listeners.size;
  }
}
