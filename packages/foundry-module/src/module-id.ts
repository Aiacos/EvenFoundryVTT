/**
 * Canonical Foundry module identifier — must match `id` in module.json.
 *
 * Kept in a side-effect-free file so every submodule can import it without pulling
 * in `module.ts` (which registers Foundry hooks at import time).
 */
export const MODULE_ID = 'evenfoundryvtt' as const;
