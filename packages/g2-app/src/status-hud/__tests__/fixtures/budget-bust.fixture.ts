/**
 * Adversarial fixture for IB-6 (04A-PLAN-CHECK.md §B-1).
 *
 * This file is INTENTIONALLY broken TypeScript. The colocated test
 * `i18n-budgets-adversarial.test.ts` spawns `tsc --noEmit` against this file
 * (against the workspace's `tsconfig.base.json`) and asserts a non-zero exit
 * plus an error code from the {TS2322, TS2741, TS2769, TS2353} class — the
 * `satisfies`-failure class. The binary fact (`tsc` exits non-zero) proves the
 * I18N-04 build-time gate works adversarially, not just structurally.
 *
 * The fixture is excluded from the package's normal `tsc --noEmit` include glob
 * (see `packages/g2-app/tsconfig.json` `exclude` entry) so the production
 * typecheck remains green. The adversarial test runs tsc directly against this
 * file and expects failure.
 *
 * DESIGN: rather than rely on a string-length brand (template-literal length
 * operators are too fragile under TS 5.8.3), we violate the simpler
 * `WidthBudgetRow.max: number` constraint by declaring `max` as a string literal
 * `'NotANumber'`. The `satisfies Record<string, WidthBudgetRow>` clause then
 * fails because `'NotANumber'` is not assignable to `number` — producing a
 * TS2322 / TS2353 / TS2741 / TS2769-class error.
 *
 * DO NOT add any TypeScript suppression pragmas here — the failure IS the assertion.
 *
 * @see ../i18n-budgets-adversarial.test.ts (spawns tsc + asserts non-zero exit)
 * @see ../../../i18n-budgets.ts (real exports — `WidthBudgetRow`)
 */
import type { WidthBudgetRow } from '../../i18n-budgets.js';

// Intentionally invalid: `max: 'NotANumber'` violates `WidthBudgetRow.max: number`.
// The `as const satisfies Record<string, WidthBudgetRow>` clause forces the
// typechecker to verify the structural shape — and it MUST fail.
const bad = {
  hp_label: { it: 'PF', en: 'HP', de: 'TP', max: 'NotANumber' },
} as const satisfies Record<string, WidthBudgetRow>;

export { bad };
