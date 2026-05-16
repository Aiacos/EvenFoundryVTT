/**
 * handlers/index.ts — side-effect barrel: registers all Phase 7 Wave 1 handlers.
 *
 * This module has ONE purpose: call `registerToolHandler` for each of the 4
 * Wave 1 handlers at module-load time. It is imported as a side-effect from
 * `packages/foundry-module/src/module.ts` (before the Hooks.once('ready') fires)
 * so that TOOL_REGISTRY is populated before any `dispatchTool` call can arrive.
 *
 * Handler count: this module registers 4 handlers (Wave 1).
 * Plans 07-03 and 07-05 will extend this file with the remaining 2 handlers
 * (place-template, drop-concentration) in later waves.
 *
 * # Single-workflow-origin (ADR-0011)
 * All registrations go through `registerToolHandler` — the canonical write-path
 * entry point. Direct `TOOL_REGISTRY[id] = handler` assignments outside this
 * pattern are forbidden.
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts (registerToolHandler)
 * @see packages/foundry-module/src/module.ts (import site — side-effect at module load)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */

import { registerToolHandler } from '../tool-registry.js';
import { castSpellHandler } from './cast-spell.js';
import { moveTokenHandler } from './move-token.js';
import { useItemHandler } from './use-item.js';
import { weaponAttackHandler } from './weapon-attack.js';

/**
 * Register all Wave 1 write-path handlers into TOOL_REGISTRY.
 *
 * Called at module-load time (side-effect import from module.ts).
 * Registration is idempotent — calling twice replaces the handler, which is
 * intentional per the `registerToolHandler` contract (test isolation benefit).
 */
registerToolHandler('cast-spell', castSpellHandler);
registerToolHandler('weapon-attack', weaponAttackHandler);
registerToolHandler('use-item', useItemHandler);
registerToolHandler('move-token', moveTokenHandler);
