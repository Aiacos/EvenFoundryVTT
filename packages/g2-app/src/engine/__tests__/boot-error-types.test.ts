/**
 * Unit tests for `boot-error-types.ts` (Phase 4b Plan 04 Task 1).
 *
 * Asserts the 5 × 3 × 4 BOOT_ERROR_CONTENT table is:
 *   - Spot-correct for verbatim title strings per UI-SPEC §3.3 (BET-1..BET-3)
 *   - Fully populated — every (state, locale) pair has non-empty fields (BET-4)
 *   - Width-budgeted — titles ≤ 24, hints ≤ 50, close labels ≤ 14 per UI-SPEC §4.3 (BET-5..BET-7)
 *   - Cross-consistent with `HUD_WIDTH_BUDGETS.boot_error_*` keys landed in Plan 01 (BET-8)
 *   - Compile-time readonly — assignment is a TS error (BET-9, `// @ts-expect-error`)
 *
 * Test discriminator markers `BET-01`..`BET-09` are embedded verbatim in the
 * `it()` titles so the plan-checker grep gate (`grep -cE 'BET-0[1-9]'`) returns
 * exactly 9 matches.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-04-PLAN.md Task 1
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.3 + §4.3
 */
import { describe, expect, it } from 'vitest';
import { HUD_WIDTH_BUDGETS } from '../../status-hud/i18n-budgets.js';
import {
  BOOT_ERROR_CONTENT,
  type BootErrorLocale,
  type BootErrorState,
} from '../boot-error-types.js';

// All 5 states + all 3 locales, used by parametric loops below.
const ALL_STATES: readonly BootErrorState[] = [
  'handshake_failed',
  'version_mismatch',
  'no_character',
  'bridge_unreachable',
  'token_expired',
];

const ALL_LOCALES: readonly BootErrorLocale[] = ['it', 'en', 'de'];

// Map BootErrorState → corresponding HUD_WIDTH_BUDGETS title key (BET-8 input).
const STATE_TO_TITLE_BUDGET_KEY = {
  handshake_failed: 'boot_error_title_handshake',
  version_mismatch: 'boot_error_title_version',
  no_character: 'boot_error_title_no_char',
  bridge_unreachable: 'boot_error_title_bridge',
  token_expired: 'boot_error_title_token',
} as const satisfies Record<BootErrorState, keyof typeof HUD_WIDTH_BUDGETS>;

describe('boot-error-types — BOOT_ERROR_CONTENT lookup table', () => {
  describe('Spot checks (verbatim string contract)', () => {
    it('BET-01: handshake_failed.it.title is "HANDSHAKE FALLITO" (verbatim)', () => {
      expect(BOOT_ERROR_CONTENT.handshake_failed.it.title).toBe('HANDSHAKE FALLITO');
    });

    it('BET-02: version_mismatch.en.title is "VERSION MISMATCH" (verbatim)', () => {
      expect(BOOT_ERROR_CONTENT.version_mismatch.en.title).toBe('VERSION MISMATCH');
    });

    it('BET-03: no_character.de.title is "KEIN CHARAKTER" (verbatim)', () => {
      expect(BOOT_ERROR_CONTENT.no_character.de.title).toBe('KEIN CHARAKTER');
    });
  });

  describe('Coverage — every (state, locale) populated', () => {
    it('BET-04: every (state, locale) entry has all 4 fields populated non-empty', () => {
      for (const state of ALL_STATES) {
        for (const locale of ALL_LOCALES) {
          const entry = BOOT_ERROR_CONTENT[state][locale];
          expect(typeof entry.title).toBe('string');
          expect(entry.title.length).toBeGreaterThan(0);
          expect(typeof entry.hintLine1).toBe('string');
          expect(entry.hintLine1.length).toBeGreaterThan(0);
          expect(typeof entry.hintLine2).toBe('string');
          expect(entry.hintLine2.length).toBeGreaterThan(0);
          expect(typeof entry.closeAnnotation).toBe('string');
          expect(entry.closeAnnotation.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Width budgets (UI-SPEC §4.3)', () => {
    it('BET-05: every title fits within 24 chars (HUD_WIDTH_BUDGETS.boot_error_title_*.max)', () => {
      for (const state of ALL_STATES) {
        for (const locale of ALL_LOCALES) {
          const title = BOOT_ERROR_CONTENT[state][locale].title;
          // 24 is the boot_error_title_*.max budget per UI-SPEC §4.3 (Plan 01).
          expect(title.length).toBeLessThanOrEqual(24);
        }
      }
    });

    it('BET-06: every hintLine1 and hintLine2 fits within 50 chars', () => {
      for (const state of ALL_STATES) {
        for (const locale of ALL_LOCALES) {
          const entry = BOOT_ERROR_CONTENT[state][locale];
          expect(entry.hintLine1.length).toBeLessThanOrEqual(50);
          expect(entry.hintLine2.length).toBeLessThanOrEqual(50);
        }
      }
    });

    it('BET-07: every closeAnnotation starts with "[X]" and fits within 14 chars', () => {
      const closeMax = HUD_WIDTH_BUDGETS.boot_error_close_label.max;
      expect(closeMax).toBe(14);
      for (const state of ALL_STATES) {
        for (const locale of ALL_LOCALES) {
          const close = BOOT_ERROR_CONTENT[state][locale].closeAnnotation;
          expect(close.startsWith('[X]')).toBe(true);
          expect(close.length).toBeLessThanOrEqual(closeMax);
        }
      }
    });
  });

  describe('Cross-consistency with HUD_WIDTH_BUDGETS (Plan 01)', () => {
    it('BET-08: every title equals its HUD_WIDTH_BUDGETS.boot_error_title_* counterpart in all 3 locales', () => {
      for (const state of ALL_STATES) {
        const budgetKey = STATE_TO_TITLE_BUDGET_KEY[state];
        const budgetRow = HUD_WIDTH_BUDGETS[budgetKey];
        for (const locale of ALL_LOCALES) {
          const ourTitle = BOOT_ERROR_CONTENT[state][locale].title;
          const budgetTitle = budgetRow[locale];
          // Drift between the two static tables is the regression target —
          // this assertion catches any future divergence between Plan 01's
          // width-budget registry and Plan 04's content table.
          expect(ourTitle).toBe(budgetTitle);
        }
      }
      // Also lock the closeAnnotation cross-check — Plan 01's
      // boot_error_close_label row is the canonical source.
      const closeRow = HUD_WIDTH_BUDGETS.boot_error_close_label;
      expect(BOOT_ERROR_CONTENT.handshake_failed.it.closeAnnotation).toBe(closeRow.it);
      expect(BOOT_ERROR_CONTENT.handshake_failed.en.closeAnnotation).toBe(closeRow.en);
      expect(BOOT_ERROR_CONTENT.handshake_failed.de.closeAnnotation).toBe(closeRow.de);
    });
  });

  describe('Compile-time readonly enforcement', () => {
    it('BET-09: BOOT_ERROR_CONTENT is Readonly at the TS type level (assignment is a TS error)', () => {
      // The runtime assertion below is a sanity check; the LOAD-BEARING part of
      // this test is the `// @ts-expect-error` directive — if the readonly
      // discipline is ever relaxed, tsc will refuse the comment because the
      // assignment would become legal. That is the strict gate Plan 04 ships.

      // @ts-expect-error — readonly: cannot assign to 'title' (TS2540 / readonly property)
      BOOT_ERROR_CONTENT.handshake_failed.it.title = 'X';
      // The mutation above is a TS compile error — but at the JS layer it does
      // mutate because `as const` is type-level only. Re-assert the verbatim
      // contract by reading the field back. The // @ts-expect-error directive
      // is the actual invariant.
      expect(BOOT_ERROR_CONTENT.handshake_failed.it.title).toBe('X');
      // Restore so subsequent tests / other suites running in the same process
      // do not observe the side effect.
      // @ts-expect-error — readonly: restore for hermetic test isolation
      BOOT_ERROR_CONTENT.handshake_failed.it.title = 'HANDSHAKE FALLITO';
    });
  });
});
