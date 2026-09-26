/**
 * @evf/foundry-module — EvenFoundryVTT module entry point.
 *
 * Loaded by Foundry VTT via `esmodules` in module.json. The module is the **projector**
 * (ADR-0019): the Foundry tab that showed a pairing QR serves those glasses through a
 * relay room with sealed envelopes. The phone never logs into Foundry; no GM, no extra
 * Foundry user, no socketlib.
 *
 * - `init`  → settings + «Collega occhiali G2» (settings menu, Players list, `Alt+G`).
 * - `ready` → on every client: start the projector (reconnects the glasses paired in this
 *   browser) and wire every delta source (hook subscribers + write-path watchers) to
 *   `projector.pushDelta`.
 *
 * Write tools are registered by the side-effect import of `write-path/handlers` and
 * executed only through `dispatchTool` (ADR-0011 single-workflow-origin).
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 * @see Specs.md §3.4 (Foundry compatibility minimum 13.347, verified 14)
 */

import {
  R1_ACTION_ECONOMY_TYPE,
  R1_ACTION_RESULT_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
  R1_MULTIATTACK_PROGRESS_TYPE,
  R1_REACTION_AVAILABLE_TYPE,
} from '@evf/shared-protocol';
import { Projector } from './direct/projector.js';
import { registerHookSubscribers } from './readers/hook-subscribers.js';
import { pairingEndpoints, registerSettings } from './settings.js';
// Side-effect import: registers every ToolHandler into TOOL_REGISTRY (ADR-0011).
import './write-path/handlers/index.js';
import { registerActionResultWatcher } from './write-path/action-result-watcher.js';
import { registerCombatActionTracker } from './write-path/combat-action-tracker.js';
import { registerMovementTracker } from './write-path/combat-movement-tracker.js';
import { setConcConflictEmitter } from './write-path/handlers/cast-spell.js';
import { setMultiAttackProgressEmitter } from './write-path/handlers/weapon-attack.js';
import { registerReactionWatcher } from './write-path/reaction-watcher.js';

export { MODULE_ID } from './module-id.js';

/** The projector of this tab (serves the glasses paired in this browser). */
export const projector = new Projector({ relayBase: () => pairingEndpoints().relayUrl });

/** Wires every delta source to the projector and starts it (every client). */
export async function startProjector(): Promise<void> {
  await projector.start();
  const push = projector.pushDelta;
  const topic =
    (type: string) =>
    (payload: unknown): void =>
      push(type, payload);
  registerHookSubscribers(push);
  setMultiAttackProgressEmitter(topic(R1_MULTIATTACK_PROGRESS_TYPE));
  registerReactionWatcher(topic(R1_REACTION_AVAILABLE_TYPE));
  registerActionResultWatcher(topic(R1_ACTION_RESULT_TYPE));
  // Track the actors shown on the glasses paired in this browser.
  registerMovementTracker(topic(R1_MOVEMENT_BUDGET_TYPE), () => projector.projectedActors());
  registerCombatActionTracker(topic(R1_ACTION_ECONOMY_TYPE), () =>
    projector.projectedActors().map((actorId) => ({ actorId, recipientUserId: game.user.id })),
  );
  setConcConflictEmitter(push);
}

Hooks.once('init', () => {
  registerSettings(projector);
});

Hooks.once('ready', () => {
  startProjector().catch((err: unknown) => {
    console.error('[EVF] projector failed to start', err);
  });
});
