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
 * Wave 1 scope (Plan 02; corrected in Quick Task 260604-lg4):
 * - Register `Hooks.once("socketlib.ready")` → `registerSocketlibHandlers()`.
 *   `socketlib.ready` is socketlib's canonical registration point (the module
 *   obtains its socket via `socketlib.registerModule` and registers handlers on
 *   it). Registration is DECOUPLED from Foundry's `ready` hook so that a
 *   socketlib failure can never abort the `ready` body — the HTTP push readers
 *   (`/internal/delta`) registered there must always run (defense in depth).
 *
 * Wave 3 scope (Plan 05):
 * - `Hooks.once("ready")` also calls `registerHookSubscribers(bridgeDeltaEmitter)`
 *   — wires the 5 Foundry hooks → delta push pipeline (D-2.14).
 * - `bridgeDeltaEmitter` POSTs to bridge `/internal/delta` authenticated with
 *   `EVF_INTERNAL_SECRET` stored in Foundry module settings at pair time.
 *   Fire-and-forget: logs warning on failure but never throws (T-02-01).
 *
 * @see packages/foundry-module/module.json — `esmodules: ["dist/module.js"]`
 * @see Specs.md §3.4 (Foundry compatibility minimum 13.347, verified 14)
 * @see 02-CONTEXT.md D-2.01, D-2.12, D-2.18 (pair button, socketlib, locale)
 */

import {
  R1_ACTION_ECONOMY_TYPE,
  R1_ACTION_RESULT_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
} from '@evf/shared-protocol';
import { registerCanvasExtractor } from './canvas-extractor.js';
// Plan 07-06 — bearer rotation scheduler (24h TTL + 60s grace reuse of generateBearer(refresh=true))
import { BEARER_ROTATED_TYPE, scheduleBearerRotation } from './pair/bearer-rotation.js';
import { registerSocketlibHandlers } from './pair/socketlib-handlers.js';
// Quick Task 260604-eyf — bearer-registry + character-list push (push-based, no new socketlib handler).
// Emits r1.bearers.available envelopes when bearers are generated/revoked/rotated.
// Emits r1.characters.available on ready + actor lifecycle hooks (createActor/updateActor/deleteActor).
// Both registered in Hooks.once('ready') so settings + actors are loaded. Count stays 17.
import { registerBearerRegistryReader } from './readers/bearer-registry-reader.js';
import { registerCharacterListReader } from './readers/character-list-reader.js';
// Quick Task 260517-k2g — entity-pack vocabulary push (parallel additive pipeline, NO new socketlib handler).
// Emits r1.entities.available envelopes via bridgeDeltaEmitter for non-spell Items + Actors (npc/vehicle).
// Registered alongside spell-pack so weapon/armor/monster recognition is available at init time too.
// socketlib count stays 17 (Phase 13 invariant preserved).
import { registerEntityPackReader } from './readers/entity-pack-reader.js';
import { registerHookSubscribers } from './readers/hook-subscribers.js';
// Quick Task 20260517 — spell-pack vocabulary push (push-based, no new socketlib handler).
// Emits r1.spells.available envelopes via bridgeDeltaEmitter on init + updateCompendium.
// Registered in Hooks.once('init') so the vocabulary is available at the earliest point.
// socketlib count stays 17 (Phase 13 invariant preserved).
import { registerSpellPackReader } from './readers/spell-pack-reader.js';
import { registerSettings } from './settings.js';
// Plan 07-02 — side-effect import: registers all 4 Wave 1 ToolHandlers into TOOL_REGISTRY
// before the Hooks.once('ready') fires. This ensures dispatchTool can route to real handlers
// when the socketlib handlers are invoked.
// ADR-0011: single-workflow-origin discipline — all write mutations go through dispatchTool.
import './write-path/handlers/index.js';
// Plan 07-05 — register the dnd5e.preUseActivity reaction watcher (REACT-01).
// Emits r1.reaction.available envelopes via bridgeDeltaEmitter when an NPC uses
// an action that can trigger a player character reaction (shield, counterspell).
// Display-only in Phase 7; handler NEVER returns false (must not cancel NPC action).
import { registerActionResultWatcher } from './write-path/action-result-watcher.js';
// Plan 09-01 — combat action tracker (COMB-02 Wave 0 telemetry).
// Subscribes to createChatMessage + updateCombat; derives per-combatant
// action/bonus/reaction counters from flags.evf.audit entries; emits
// r1.action.economy envelopes via bridgeDeltaEmitter on each state change.
// NO new socketlib handler — count stays 14 (14-socketlib-handler invariant / ADR-0011).
import { registerCombatActionTracker } from './write-path/combat-action-tracker.js';
// Plan 08-04 — combat movement tracker (ACT-01 move variant).
// Subscribes to updateToken + updateCombat; accumulates per-turn movement and emits
// r1.movement.budget envelopes via bridgeDeltaEmitter.
// NO new socketlib handler — count stays 14 (Phase 7 invariant).
import { registerMovementTracker } from './write-path/combat-movement-tracker.js';
// Plan 09-03 — inject the concentration conflict emitter so castSpellHandler can
// emit conc.conflict envelopes via bridgeDeltaEmitter when concentration is blocked.
// NO new socketlib handler registered — count stays 14 (ADR-0011 invariant).
import { setConcConflictEmitter } from './write-path/handlers/cast-spell.js';
// Plan 07-04 — inject the multi-attack progress emitter so weaponAttackHandler can
// emit r1.multiattack.progress envelopes via bridgeDeltaEmitter on each iteration.
// NO new socketlib handler registered — emitter count stays 14.
import { setMultiAttackProgressEmitter } from './write-path/handlers/weapon-attack.js';
import { registerReactionWatcher } from './write-path/reaction-watcher.js';

/**
 * Canonical Foundry module identifier.
 * Used as the first argument to `game.settings.register*` calls throughout
 * the module. Must match the `id` field in module.json exactly.
 */
export const MODULE_ID = 'evenfoundryvtt' as const;

/**
 * Module-level bearer registry re-emit handle.
 *
 * Populated once the `ready` hook fires (via `registerBearerRegistryReader`).
 * Null before ready — callers guard with optional chaining.
 *
 * Quick Task 260604-eyf: `reEmit()` is called by the `scheduleBearerRotation`
 * callback to push a fresh bearer snapshot after rotation, so the bridge cache
 * stays current without a new socketlib handler. The handle is available to
 * future PairModal generate/revoke paths as well.
 */
let bearerRegistryHandle:
  | import('./readers/bearer-registry-reader.js').BearerRegistryReaderHandle
  | null = null;

/**
 * Resolves the internal secret used to authenticate POSTs to /internal/delta.
 *
 * Precedence (Quick Task 260604-hs5):
 * 1. The DM-visible `bridgeInternalSecret` world setting, when it is a non-empty
 *    string. This is the bridge deployment's static `EVF_INTERNAL_SECRET`, the
 *    only value that can match the bridge's auth check for a real Forge world.
 * 2. Otherwise, the first active (non-revoked, non-expired) bearer-registry
 *    entry's `internalSecret` (legacy per-pair value, kept for backward compat).
 * 3. Otherwise null.
 *
 * The secret value is NEVER logged.
 */
function getInternalSecret(): string | null {
  // 260604-hs5: settings-preferred. Treat the setting value as unknown; only a
  // non-empty string wins, so existing tests that return a registry object for
  // every key fall through to the bearer scan below.
  const fromSetting: unknown = game.settings.get(MODULE_ID, 'bridgeInternalSecret');
  if (typeof fromSetting === 'string' && fromSetting !== '') {
    return fromSetting;
  }

  const stored = game.settings.get(MODULE_ID, 'bearerRegistry') as
    | {
        entries: Record<
          string,
          { internalSecret: string; revokedAt: number | null; expiresAt: number }
        >;
      }
    | undefined;

  if (stored === undefined || stored === null) {
    return null;
  }

  const now = Date.now();
  // Use the first active (non-revoked, non-expired) entry's internal secret
  for (const entry of Object.values(stored.entries)) {
    if (entry.revokedAt === null && entry.expiresAt > now) {
      return entry.internalSecret;
    }
  }

  return null;
}

/**
 * Resolves the bridge URL for outbound delta POSTs.
 *
 * Precedence (Quick Task 260604-hs5):
 * 1. The DM-visible `bridgeUrl` world setting, when it is a non-empty string.
 *    This points the world at the actual bridge deployment.
 * 2. Otherwise, the first active (non-revoked, non-expired) bearer-registry
 *    entry's `bridgeUrl` (legacy per-pair value, kept for backward compat).
 * 3. Otherwise null.
 */
function getBridgeUrl(): string | null {
  // 260604-hs5: settings-preferred. Only a non-empty string wins; a registry
  // object (returned by existing tests for every key) falls through.
  const fromSetting: unknown = game.settings.get(MODULE_ID, 'bridgeUrl');
  if (typeof fromSetting === 'string' && fromSetting !== '') {
    return fromSetting;
  }

  const stored = game.settings.get(MODULE_ID, 'bearerRegistry') as
    | {
        entries: Record<string, { bridgeUrl: string; revokedAt: number | null; expiresAt: number }>;
      }
    | undefined;

  if (stored === undefined || stored === null) {
    return null;
  }

  const now = Date.now();
  for (const entry of Object.values(stored.entries)) {
    if (entry.revokedAt === null && entry.expiresAt > now) {
      return entry.bridgeUrl;
    }
  }

  return null;
}

/**
 * Fire-and-forget delta emitter — posts to bridge /internal/delta.
 *
 * Logs a warning on failure but NEVER throws (T-02-01).
 * A failed network call must not interrupt the Foundry session.
 *
 * Auth: `Authorization: Bearer <internal_secret>` header.
 * The internal_secret is the per-pair value stored in the bearer registry
 * at pair time (H-1 fix — included in QR payload; see bearer-registry.ts).
 *
 * @param type    - Delta type discriminant (e.g. "character.delta")
 * @param payload - Delta payload (typed by caller; serialised as JSON)
 */
function bridgeDeltaEmitter(type: string, payload: unknown): void {
  const internalSecret = getInternalSecret();
  const bridgeUrl = getBridgeUrl();

  if (internalSecret === null || bridgeUrl === null) {
    // No active pair — delta silently dropped (not a warning; normal before pairing)
    return;
  }

  // Fire-and-forget
  void (async () => {
    try {
      await fetch(`${bridgeUrl}/internal/delta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${internalSecret}`,
        },
        body: JSON.stringify({ type, payload }),
      });
    } catch (err) {
      // Warning only — bridge unavailability must not crash Foundry session
      // console.warn allowed per biome.jsonc noConsole allow:[error,warn]
      console.warn('[EVF] bridgeDeltaEmitter failed:', (err as Error).message ?? err);
    }
  })();
}

// Bootstrap: register settings + spell-pack vocabulary reader when Foundry's init hook fires.
// `init` is the earliest safe point to call game.settings.registerMenu.
// The spell-pack reader is registered here (not in 'ready') so the vocabulary push reaches
// the bridge cache before any MCP tool call could need it.
// NO new socketlib handler — count stays 17 (Phase 13 invariant).
Hooks.once('init', () => {
  registerSettings();
  // Quick Task 20260517: emit initial spell vocabulary + subscribe to updateCompendium.
  // Wired to bridgeDeltaEmitter so envelopes reach the bridge cache via /internal/delta.
  registerSpellPackReader((type, payload) => bridgeDeltaEmitter(type, payload));
  // Quick Task 260517-k2g: emit initial entity vocabulary (non-spell Items + Actors)
  // via the same bridgeDeltaEmitter channel. Parallel additive pipeline; NO refactor
  // of registerSpellPackReader above. Bridge multiplexes both r1.spells.available and
  // r1.entities.available envelopes in its /internal/delta onDelta callback.
  registerEntityPackReader((type, payload) => bridgeDeltaEmitter(type, payload));
});

// Register socketlib GM-side handlers on socketlib's canonical 'socketlib.ready' hook
// (Quick Task 260604-lg4). The module obtains its socket via socketlib.registerModule
// and registers handlers on it (real farling42/foundryvtt-socketlib API). This is
// DECOUPLED from Foundry's 'ready' hook below so a socketlib failure can never abort
// the push-reader registration that real /internal/delta pairing depends on.
// All bridge→Foundry bearer registry writes go through socketlib handlers (D-2.12).
Hooks.once('socketlib.ready', () => {
  registerSocketlibHandlers();
});

// Register hook subscribers + HTTP push readers on Foundry's "ready" hook.
// These are socketlib-INDEPENDENT: this hook body contains NO direct socketlib
// call (Quick Task 260604-lg4 defense in depth), so even if socketlib is absent
// or broken the push readers (bearer-registry + character-list) STILL register
// and emit /internal/delta — the path real pairing depends on.
// Hook subscribers (Plan 05) push deltas to bridge via bridgeDeltaEmitter (D-2.14).
Hooks.once('ready', () => {
  registerHookSubscribers(bridgeDeltaEmitter);
  // Plan 07-04 — wire multi-attack progress emitter via bridgeDeltaEmitter.
  // Called AFTER registerHookSubscribers (matching pattern from plan spec).
  // No new socketlib handler; emitter uses the existing bridgeDeltaEmitter channel.
  setMultiAttackProgressEmitter((payload) =>
    bridgeDeltaEmitter('r1.multiattack.progress', payload),
  );
  // Plan 07-05 — register the reaction watcher (REACT-01).
  // Must be called AFTER registerHookSubscribers + setMultiAttackProgressEmitter
  // to stay consistent with the module.ts ready-hook assembly order.
  registerReactionWatcher((payload) => bridgeDeltaEmitter('r1.reaction.available', payload));
  // Plan 07-06 — bearer rotation scheduler (24h TTL + 60s grace, reusing generateBearer(refresh=true)).
  // Called AFTER registerReactionWatcher per the ready-hook assembly order.
  // No new socketlib handler registered — count stays at 14.
  // Quick Task 260604-eyf: after rotation, also push a fresh bearer registry snapshot so the bridge
  // cache stays current. bearerRegistryEmit is populated later in this same ready handler — the
  // callback is only invoked asynchronously (after the TTL), so it sees the populated closure.
  scheduleBearerRotation({
    emit: (payload) => {
      bridgeDeltaEmitter(BEARER_ROTATED_TYPE, payload);
      // Quick Task 260604-eyf: re-push the bearer registry after rotation so the bridge
      // cache reflects the new (rotated) token. bearerRegistryHandle.reEmit() is set
      // below in this same ready handler — the rotation callback fires ≥24h later, so
      // bearerRegistryHandle is guaranteed populated.
      bearerRegistryHandle?.reEmit();
    },
  });
  // Plan 08-01 — register the action-result watcher (ACT-01 telemetry).
  // Listens on createChatMessage; filters for flags.evf.audit.idempotencyKey;
  // emits r1.action.result envelopes via bridgeDeltaEmitter for typed toast rendering.
  // NO new socketlib handler — count stays 14 (Phase 7 invariant).
  registerActionResultWatcher((payload) => bridgeDeltaEmitter(R1_ACTION_RESULT_TYPE, payload));
  // Plan 08-04 — register the movement tracker (ACT-01 move variant).
  // Subscribes to updateToken + updateCombat; emits r1.movement.budget on accumulation/reset.
  // Called AFTER registerActionResultWatcher per the ready-hook assembly order.
  // NO new socketlib handler — count stays 14 (Phase 7 invariant).
  registerMovementTracker((payload) => bridgeDeltaEmitter(R1_MOVEMENT_BUDGET_TYPE, payload));
  // Plan 09-01 — register the combat action tracker (COMB-02 Wave 0 telemetry).
  // Listens on createChatMessage (flags.evf.audit toolId filter) + updateCombat
  // (turn/round reset); emits r1.action.economy envelopes via bridgeDeltaEmitter.
  // Called AFTER registerMovementTracker per the ready-hook assembly order.
  // NO new socketlib handler — count stays 14 (ADR-0011 invariant).
  registerCombatActionTracker((payload) => bridgeDeltaEmitter(R1_ACTION_ECONOMY_TYPE, payload));
  // Plan 09-03 — wire the concentration conflict emitter into castSpellHandler.
  // Called AFTER registerCombatActionTracker per the ready-hook assembly order.
  // NO new socketlib handler — count stays 14 (ADR-0011 invariant).
  setConcConflictEmitter((type, payload) => bridgeDeltaEmitter(type, payload));
  // Quick Task 260604-eyf — bearer-registry + character-list push readers.
  // Registered in ready hook so both Foundry settings (world scope) and game.actors are loaded.
  // registerBearerRegistryReader: pushes non-revoked, non-expired bearer registry snapshot.
  // registerCharacterListReader: pushes player-character roster on ready + actor lifecycle hooks.
  // NO new socketlib handler registered for either — count stays 17 (Phase 13 invariant).
  //
  // Quick Task 260604-eyf: register bearer-registry reader, store the handle for
  // rotation re-emit. bearerRegistryHandle.reEmit() is called by scheduleBearerRotation
  // above (the rotation fires ≥24h later, so the handle is always populated).
  bearerRegistryHandle = registerBearerRegistryReader((type, payload) =>
    bridgeDeltaEmitter(type, payload),
  );
  registerCharacterListReader((type, payload) => bridgeDeltaEmitter(type, payload));
  // Plan 04a-06 — raster pipeline data-source ingress.
  // The emit callback dispatches the typed FramePixels payload on the
  // existing `frame_pixels` channel; the bridge wraps it in `EnvelopeSchema`
  // server-side (proto / seq / ts / type / session_id / payload — session_id
  // is populated from the pair registry). No new auth surface (T-4a-06-04).
  registerCanvasExtractor({
    emit: (payload) => bridgeDeltaEmitter('frame_pixels', payload),
  });
});
