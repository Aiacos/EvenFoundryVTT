/**
 * R1 hint string parser — converts the pre-composed i18n chip string format
 * used in {@link ../i18n-budgets.ts | HUD_WIDTH_BUDGETS} into the structured
 * `{ tap, scroll, quickActionLabel }` object consumed by the StatusHudRenderer
 * chip render path (Phase 6 Plan 03; `quick=` slot per ADR-0012).
 *
 * ## Format contract (UI-SPEC §6 + RESEARCH Pitfall 6)
 *
 * The i18n-budgets table stores pre-composed, pre-truncated chip strings for
 * each panel state. This avoids runtime truncation logic (RESEARCH Pitfall 6
 * mitigation). The canonical format for each chip string is:
 *
 * ```
 * "tap=<tap-value>  scroll=<scroll-value>  qa=<quick-action-value>"
 * ```
 *
 * Token parsing is whitespace-split — tokens starting with `tap=`, `scroll=`,
 * or `qa=` are extracted by prefix. Order is flexible; extra tokens are
 * ignored. Defensive: malformed input returns three empty strings without
 * throwing. Extra whitespace is trimmed. (The `qa=` quick-action slot replaced
 * the retired `long=` long-press slot — ADR-0012; `qa` is 2 chars shorter than
 * `long`, so existing INV-1 width budgets keep headroom.)
 *
 * @module r1-hint-parser
 *
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-03-PLAN.md Task 1
 * @see packages/g2-app/src/status-hud/i18n-budgets.ts (HUD_WIDTH_BUDGETS `hud_r1_*` keys)
 * @see packages/g2-app/src/status-hud/status-hud-renderer.ts (renderContextChip consumer)
 */

/** Structured R1 hint object consumed by StatusHudRenderer. */
export interface R1HintObject {
  readonly tap: string;
  readonly scroll: string;
  readonly quickActionLabel: string;
}

/** Sentinel empty-string default for when a token is absent from input. */
const EMPTY = '' as const;

/**
 * Parse a pre-composed R1 chip string into a structured hint object.
 *
 * The input format is a whitespace-separated list of `key=value` tokens.
 * Three token prefixes are recognised: `tap=`, `scroll=`, `qa=`. The
 * function is order-independent and defensive:
 *
 * - Missing token → corresponding field defaults to `''`.
 * - Malformed input (null, empty, no recognised tokens) → `{ tap: '', scroll: '', quickActionLabel: '' }`.
 * - Extra whitespace between tokens → tolerated (split on `/\s+/`).
 *
 * @param raw Pre-composed chip string, e.g. `"scroll=iniz tap=rapida qa=q[combat]"`.
 * @returns Parsed hint object.
 *
 * @example
 * parseR1HintString('tap=cycle  scroll=nav  qa=quick')
 * // → { tap: 'cycle', scroll: 'nav', quickActionLabel: 'quick' }
 *
 * @example
 * parseR1HintString('scroll=iniz tap=rapida qa=q[combat]')
 * // → { tap: 'rapida', scroll: 'iniz', quickActionLabel: 'q[combat]' }
 */
export function parseR1HintString(raw: string): R1HintObject {
  if (!raw || raw.trim().length === 0) {
    return { tap: EMPTY, scroll: EMPTY, quickActionLabel: EMPTY };
  }

  const tokens = raw.trim().split(/\s+/);
  let tap: string = EMPTY;
  let scroll: string = EMPTY;
  let quickActionLabel: string = EMPTY;

  for (const token of tokens) {
    if (token.startsWith('tap=')) {
      tap = token.slice(4);
    } else if (token.startsWith('scroll=')) {
      scroll = token.slice(7);
    } else if (token.startsWith('qa=')) {
      quickActionLabel = token.slice(3);
    }
    // Extra tokens (unrecognised prefixes) are silently ignored.
  }

  return { tap, scroll, quickActionLabel };
}
