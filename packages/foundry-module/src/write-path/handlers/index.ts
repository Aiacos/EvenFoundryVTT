/**
 * handlers/index.ts — side-effect barrel: registers all Phase 7 Wave 1+2 handlers.
 *
 * This module has ONE purpose: call `registerToolHandler` for each of the
 * Wave 1 + Wave 2 handlers at module-load time. It is imported as a side-effect from
 * `packages/foundry-module/src/module.ts` (before the Hooks.once('ready') fires)
 * so that TOOL_REGISTRY is populated before any `dispatchTool` call can arrive.
 *
 * Handler count:
 * - Wave 1 (Plan 07-02): 4 handlers (cast-spell, weapon-attack, use-item, move-token)
 * - Wave 2 (Plan 07-03): 2 handlers (place-template, confirm-template-placement)
 * - Wave 3 (Plan 07-05): 1 handler (drop-concentration, replacing evf.setTargets stub)
 * - Phase 13 (Plan 13-01): 3 handlers (cast-shield, cast-counterspell, opportunity-attack)
 *   → socketlib `socket.register` count FLIPS 14 → 17 (Phase 13 INVARIANT)
 *
 * # Single-workflow-origin (ADR-0011)
 * All registrations go through `registerToolHandler` — the canonical write-path
 * entry point. Direct `TOOL_REGISTRY[id] = handler` assignments outside this
 * pattern are forbidden.
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts (registerToolHandler)
 * @see packages/foundry-module/src/module.ts (import site — side-effect at module load)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1 (Wave 1)
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1 (Wave 2)
 */

import { registerToolHandler } from '../tool-registry.js';
import { castCounterspellHandler } from './cast-counterspell.js';
import { castShieldHandler } from './cast-shield.js';
import { castSpellHandler } from './cast-spell.js';
import { dropConcentrationHandler } from './drop-concentration.js';
import { moveTokenHandler } from './move-token.js';
import { opportunityAttackHandler } from './opportunity-attack.js';
import { confirmTemplatePlacementHandler, placeTemplateHandler } from './place-template.js';
import { useItemHandler } from './use-item.js';
import { weaponAttackHandler } from './weapon-attack.js';

/**
 * Register all Wave 1 + Wave 2 write-path handlers into TOOL_REGISTRY.
 *
 * Called at module-load time (side-effect import from module.ts).
 * Registration is idempotent — calling twice replaces the handler, which is
 * intentional per the `registerToolHandler` contract (test isolation benefit).
 */

// ─── Wave 1 handlers (Plan 07-02) ────────────────────────────────────────────
registerToolHandler('cast-spell', castSpellHandler);
registerToolHandler('weapon-attack', weaponAttackHandler);
registerToolHandler('use-item', useItemHandler);
registerToolHandler('move-token', moveTokenHandler);

// ─── Wave 2 handlers (Plan 07-03) ────────────────────────────────────────────
// place-template: mints placementId + returns AbilityTemplate array description
// confirm-template-placement: commits R1-confirmed position via createEmbeddedDocuments
// Both bypass drawPreview() (RESEARCH §Q2 Pitfall 3 — incompatible with R1 input).
registerToolHandler('place-template', placeTemplateHandler);
registerToolHandler('confirm-template-placement', confirmTemplatePlacementHandler);

// ─── Wave 3 handlers (Plan 07-05) ────────────────────────────────────────────
// drop-concentration: resolves actor + concentration effect → calls effect.delete()
// Replaces evf.setTargets stub in socketlib-handlers.ts (slot rename, count stays 14).
registerToolHandler('drop-concentration', dropConcentrationHandler);

// ─── Phase 13 ACT-04 reaction handlers (Plan 13-01) ─────────────────────────
// These 3 new handlers FLIP the socketlib count from 14 → 17.
// cast-shield: level-1 Shield spell reaction (D-13-01)
// cast-counterspell: level-3+ Counterspell reaction with upcast (D-13-02)
// opportunity-attack: melee weapon attack triggered by OA Reaction (D-13-03)
registerToolHandler('cast-shield', castShieldHandler);
registerToolHandler('cast-counterspell', castCounterspellHandler);
registerToolHandler('opportunity-attack', opportunityAttackHandler);
