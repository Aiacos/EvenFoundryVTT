/**
 * @evf/foundry-module — EvenFoundryVTT module entry point.
 *
 * Loaded by Foundry VTT via `esmodules` in module.json. Since ADR-0012 the module is
 * the **projector**: the GM client talks directly to the paired G2 apps over the
 * Foundry socket relay (`module.evenfoundryvtt`) with sealed envelopes — no bridge,
 * no socketlib, no extra server.
 *
 * - `init`  → settings + «Associa occhiali G2» menu (pairing window P01).
 * - `ready` → on GM clients: start the projector and wire every delta source
 *   (hook subscribers + write-path watchers) to `projector.pushDelta`.
 *
 * Write tools are registered by the side-effect import of `write-path/handlers` and
 * executed only through `dispatchTool` (ADR-0011 single-workflow-origin).
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md
 * @see Specs.md §3.4 (Foundry compatibility minimum 13.347, verified 14)
 */

import {
  R1_ACTION_ECONOMY_TYPE,
  R1_ACTION_RESULT_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
  R1_MULTIATTACK_PROGRESS_TYPE,
  R1_REACTION_AVAILABLE_TYPE,
} from '@evf/shared-protocol';
import { listDevices } from './direct/pairing-store.js';
import { Projector } from './direct/projector.js';
import { registerHookSubscribers } from './readers/hook-subscribers.js';
import { registerSettings } from './settings.js';
// Side-effect import: registers every ToolHandler into TOOL_REGISTRY (ADR-0011).
import './write-path/handlers/index.js';
import { registerActionResultWatcher } from './write-path/action-result-watcher.js';
import { registerCombatActionTracker } from './write-path/combat-action-tracker.js';
import { registerMovementTracker } from './write-path/combat-movement-tracker.js';
import { setConcConflictEmitter } from './write-path/handlers/cast-spell.js';
import { setMultiAttackProgressEmitter } from './write-path/handlers/weapon-attack.js';
import { registerReactionWatcher } from './write-path/reaction-watcher.js';

export { MODULE_ID } from './module-id.js';

/** The projector of this client (inert on non-GM clients: never started). */
export const projector = new Projector();

/**
 * Wires every delta source to the projector and starts it. GM clients only — a
 * player client never holds device keys and must not answer on the relay.
 */
export function startProjector(): void {
  if (!game.user.isGM) return;
  projector.start();
  const push = projector.pushDelta;
  const topic =
    (type: string) =>
    (payload: unknown): void =>
      push(type, payload);
  registerHookSubscribers(push);
  setMultiAttackProgressEmitter(topic(R1_MULTIATTACK_PROGRESS_TYPE));
  registerReactionWatcher(topic(R1_REACTION_AVAILABLE_TYPE));
  registerActionResultWatcher(topic(R1_ACTION_RESULT_TYPE));
  // The GM's own character is not what the glasses show: track the paired actors.
  registerMovementTracker(topic(R1_MOVEMENT_BUDGET_TYPE), () =>
    listDevices().map((d) => d.actorId),
  );
  registerCombatActionTracker(topic(R1_ACTION_ECONOMY_TYPE), () =>
    listDevices().map((d) => ({ actorId: d.actorId, recipientUserId: d.playerUserId })),
  );
  setConcConflictEmitter(push);
}

Hooks.once('init', () => {
  registerSettings(projector);
});

Hooks.once('ready', () => {
  startProjector();
});
