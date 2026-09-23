/**
 * Debug / demo query flags. Parsed strictly so debug surfaces fail closed (P5): anything
 * but the exact values below leaves the production path untouched.
 *
 * - `?debug=1` — debug channel + `window.__evf` on the real (Foundry-connected) app.
 * - `?demo=<scenario>|tour` — offline demo (never contacts Foundry); implies debug.
 * - `?dwell=<ms>` — demo tour auto-advance period (≥ 1000 ms); manual otherwise.
 */

/** Parsed flags. */
export interface DebugFlags {
  /** Debug channel requested (`debug=1` or any demo). */
  debug: boolean;
  /** Raw demo request (validated by the demo module), or `null`. */
  demo: string | null;
  /** Tour auto-advance period, or `null` (advance with a real double-press). */
  dwellMs: number | null;
}

/** Shortest tour dwell accepted (a HUD scene settles in ≈ 1 s). */
export const MIN_DWELL_MS = 1000;

/**
 * Parses `location.search`.
 *
 * @param search - Query string, with or without the leading `?`.
 */
export function parseDebugFlags(search: string): DebugFlags {
  const params = new URLSearchParams(search);
  const rawDemo = params.get('demo');
  const demo = rawDemo === null || rawDemo.trim() === '' ? null : rawDemo.trim();
  const dwell = Number(params.get('dwell'));
  return {
    debug: params.get('debug') === '1' || demo !== null,
    demo,
    dwellMs: Number.isInteger(dwell) && dwell >= MIN_DWELL_MS ? dwell : null,
  };
}
