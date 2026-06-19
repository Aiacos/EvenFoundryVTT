/**
 * Shared constants for the combat-tracker panel family.
 *
 * Extracted from `combat-tracker-panel.ts` and `canvas-combat-tracker-panel.ts`
 * to avoid duplication (INV-4 / IN-01, IN-02 from Phase 23 code review).
 *
 * Any phase that needs to tune `QA_KEYS` or `DOUBLE_TAP_WINDOW_MS` changes this
 * single file; both panels import it, so divergence is structurally prevented.
 *
 * @see packages/g2-app/src/panels/combat-tracker-panel.ts
 * @see packages/g2-app/src/panels/canvas-combat-tracker-panel.ts
 */

/**
 * Quick-action bar key order for the combat-tracker QA bar (CTQ-04/05).
 *
 * Index 0=A (Attack), 1=S (Spell), 2=I (Item), 3=M (Move).
 * Matches the `[A][S][I][M]` visual order in UI-SPEC §5.8.
 */
export const QA_KEYS: ReadonlyArray<'A' | 'S' | 'I' | 'M'> = ['A', 'S', 'I', 'M'] as const;

/**
 * Double-tap detection window in milliseconds for QA-bar key fire (CTQ-05).
 *
 * Two consecutive taps on the same QA key within this window are treated as
 * a "double-tap fire" that dispatches the selected action.
 */
export const DOUBLE_TAP_WINDOW_MS = 600;
