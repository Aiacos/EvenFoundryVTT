/**
 * @evf/foundry-module — EvenFoundryVTT module entry point.
 *
 * Loaded by Foundry VTT via the `esmodules` field in module.json. Registers the
 * `init` hook listener to bootstrap the settings panel. All further Wave 1+ logic
 * (pair modal, bearer registry, reader hooks) is added to this file in subsequent
 * plans as imports from their respective submodules.
 *
 * Wave 0 scope (Plan 01):
 * - Export MODULE_ID constant
 * - Register `Hooks.once("init")` → `registerSettings()`
 *
 * Wave 1 scope (Plan 02):
 * - Register `Hooks.once("ready")` → `registerSocketlibHandlers()`
 *   socketlib is guaranteed available on "ready" (farling42/foundryvtt-socketlib README).
 *
 * @see packages/foundry-module/module.json — `esmodules: ["dist/module.js"]`
 * @see Specs.md §3.4 (Foundry compatibility minimum 13.347, verified 14)
 * @see 02-CONTEXT.md D-2.01, D-2.12, D-2.18 (pair button, socketlib, locale)
 */

import { registerSocketlibHandlers } from './pair/socketlib-handlers.js';
import { registerSettings } from './settings.js';

/**
 * Canonical Foundry module identifier.
 * Used as the first argument to `game.settings.register*` calls throughout
 * the module. Must match the `id` field in module.json exactly.
 */
export const MODULE_ID = 'evenfoundryvtt' as const;

// Bootstrap: register settings when Foundry's init hook fires.
// `init` is the earliest safe point to call game.settings.registerMenu.
Hooks.once('init', () => {
  registerSettings();
});

// Register socketlib GM-side handlers on "ready".
// socketlib is guaranteed available on "ready" (before "ready" it may not yet be initialised).
// All bridge→Foundry bearer registry writes go through these handlers (D-2.12).
Hooks.once('ready', () => {
  registerSocketlibHandlers();
});
