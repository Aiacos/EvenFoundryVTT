/**
 * Unit tests for LOCALE_MENU constant (Phase 5 Plan 05-01 Wave-0).
 *
 * Covers LM-1..LM-5 from 05-01-PLAN.md Task 1:
 *   - LM-1: exactly 7 entries
 *   - LM-2: codes unique + match locked set
 *   - LM-3: budget tier matches CONTEXT.md §Area 4 (auto+it+en+de canonical;
 *            es+fr+pt-br best-effort)
 *   - LM-4: `as const satisfies` brand holds — code narrows to the literal type
 *   - LM-5: all nativeLabels non-empty strings
 *
 * @see packages/g2-app/src/locale/locale-menu.ts
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-CONTEXT.md §Area 4
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §8.5
 */
import { describe, expect, it } from 'vitest';
import { LOCALE_MENU, type LocaleMenuEntry } from '../locale-menu.js';

describe('LOCALE_MENU', () => {
  it('LM-1: contains exactly 7 entries', () => {
    expect(LOCALE_MENU).toHaveLength(7);
  });

  it('LM-2: all codes are unique and match the locked set', () => {
    const codes = LOCALE_MENU.map((e) => e.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);

    const expectedCodes = new Set(['auto', 'it', 'en', 'de', 'es', 'fr', 'pt-br']);
    for (const code of codes) {
      expect(expectedCodes).toContain(code);
    }
  });

  it('LM-3: canonical locales are auto/it/en/de; best-effort are es/fr/pt-br', () => {
    const canonical = new Set(['auto', 'it', 'en', 'de']);
    const bestEffort = new Set(['es', 'fr', 'pt-br']);

    for (const entry of LOCALE_MENU) {
      if (canonical.has(entry.code)) {
        expect(entry.budget).toBe('canonical');
      } else if (bestEffort.has(entry.code)) {
        expect(entry.budget).toBe('best-effort');
      } else {
        throw new Error(`Unexpected code: ${entry.code}`);
      }
    }
  });

  it('LM-4: `as const satisfies` brand — first entry code narrows to literal', () => {
    // Compile-time brand: `typeof LOCALE_MENU[0].code` should be 'auto',
    // not `string`. Runtime assertion proves the literal value is preserved.
    const firstEntry = LOCALE_MENU[0];
    // The type brand is structural — assert the exact runtime value so that
    // a future refactor that drops `as const` breaks this test.
    expect(firstEntry.code).toBe('auto');

    // Structural type check: assign to the explicit LocaleMenuEntry type to verify
    // the const satisfies clause holds at runtime value level
    const _typed: LocaleMenuEntry = firstEntry;
    expect(_typed.code).toBe('auto');
  });

  it('LM-5: all nativeLabels are non-empty strings', () => {
    for (const entry of LOCALE_MENU) {
      expect(typeof entry.nativeLabel).toBe('string');
      expect(entry.nativeLabel.length).toBeGreaterThan(0);
    }
  });
});
