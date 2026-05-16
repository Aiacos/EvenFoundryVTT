/**
 * combat-action-tracker — `createChatMessage` + `updateCombat` hook subscribers (Plan 09-01 — COMB-02).
 *
 * Subscribes to two Foundry hooks:
 *   1. `createChatMessage` — fires when a new chat message is created. Inspects
 *      `msg.flags.evf.audit` for tool IDs that consume Action economy slots:
 *      - `'cast-spell'` + `'weapon-attack'` → Action slot (`actionsUsed`)
 *      - `'use-item'` → Bonus Action slot (`bonusActionsUsed`) per Phase 9 heuristic
 *      - Other tools (drop-concentration, move-token, etc.) → ignored (T-09-01).
 *      For weapon-attack: deduplicates by `(actorId, attackId)` composite — multiple
 *      chat-cards from the same multi-attack sequence count as ONE Action (T-09-02).
 *   2. `updateCombat` — fires when the combat document changes. When `change.turn`
 *      is present OR `change.round` is present (turn advance or round advance = new
 *      top of initiative), resets per-combatant counters and emits fresh payloads.
 *
 * ## CRITICAL: NEVER return false
 *
 * Hook handlers MUST NEVER return `false`. Returning `false` from `createChatMessage`
 * or `updateCombat` cancels the Foundry hook chain. TypeScript `void` return type
 * enforces this contract.
 *
 * ## 14-socketlib-handler invariant
 *
 * This module registers NO new socketlib handlers. The total count remains 14.
 * Emission is via the existing `bridgeDeltaEmitter` channel (fire-and-forget
 * POST to bridge). Per ADR-0011 single-workflow-origin discipline.
 *
 * ## Threat model
 *
 * T-09-01 (Tampering): filter strictly on `flags.evf.audit.toolId in
 *   {cast-spell, weapon-attack, use-item}`. All other toolIds are silently ignored.
 * T-09-02 (Spoofing): `_attackIdSeen` keyed by `actorId` → Set<attackId>. Two players
 *   who share an attackId (defensive, never expected with UUID v4) are scoped
 *   to their own actor partition.
 * T-09-05 (DoS / session crash): defensive try/catch wraps BOTH hook bodies.
 *   Throws are swallowed with `console.warn` — never re-thrown into Foundry.
 *
 * @see packages/foundry-module/src/write-path/combat-movement-tracker.ts (pattern reference)
 * @see packages/shared-protocol/src/payloads/action-economy.ts (ActionEconomyPayload)
 * @see packages/foundry-module/src/module.ts (wiring slot — after registerMovementTracker)
 * @see .planning/phases/09-action-economy-edge-cases/09-01-PLAN.md Task 2
 */

import type { ActionEconomyPayload } from '@evf/shared-protocol';

// ─── Module-scoped state ──────────────────────────────────────────────────────

/**
 * Per-actor action economy state for the current combat turn.
 *
 * All counters cap at 1 (standard 5e Action economy — most characters
 * get ONE Action, ONE Bonus Action, ONE Reaction per turn).
 */
interface ActorEconomyState {
  actionsUsed: 0 | 1;
  bonusActionsUsed: 0 | 1;
  reactionsUsed: 0 | 1;
  multiAttackInProgress: boolean;
  recipientUserId: string;
}

/**
 * Action economy accumulator — maps actorId to per-turn economy state.
 *
 * Reset on each combat turn advance (updateCombat with turn/round change).
 * Populated by createChatMessage hook when audit flags indicate an economy slot was consumed.
 */
const _state = new Map<string, ActorEconomyState>();

/**
 * Multi-attack deduplication tracker — maps actorId to the set of attackIds
 * already counted this turn.
 *
 * Scoped by actorId (T-09-02): two players who happen to use the same attackId
 * value are counted independently. UUID v4 makes collision impossible in practice
 * but the composite key makes the invariant structural.
 */
const _attackIdSeen = new Map<string, Set<string>>();

// ─── Tool-to-slot mapping ─────────────────────────────────────────────────────

/**
 * Economy slot that each tool ID consumes.
 *
 * Tools NOT in this map consume no economy slot and are silently ignored (T-09-01).
 * - `'cast-spell'` → Action
 * - `'weapon-attack'` → Action (with multi-attack dedup)
 * - `'use-item'` → Bonus Action (Phase 9 heuristic — all use-item calls are
 *   treated as Bonus Action, which is correct for healing potions, bonus-action
 *   spells, etc.)
 */
type EconomySlot = 'action' | 'bonus';

const TOOL_SLOT_MAP: Readonly<Record<string, EconomySlot>> = {
  'cast-spell': 'action',
  'weapon-attack': 'action',
  'use-item': 'bonus',
} as const;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve the `recipientUserId` from an audit entry + message, following the
 * priority chain:
 *   1. `audit.recipientUserId` (explicit — forward-compat field, Plan 09-01)
 *   2. `msg.user` (Foundry user document id for this message)
 *   3. `'<unknown>'` (sentinel — never leaks cross-user; dispatcher will
 *      SILENTLY drop on userId mismatch)
 */
function resolveRecipientUserId(
  audit: Record<string, unknown>,
  msg: Record<string, unknown>,
): string {
  const fromAudit = audit.recipientUserId;
  if (typeof fromAudit === 'string' && fromAudit.length > 0) return fromAudit;

  const fromMsg = msg.user;
  if (typeof fromMsg === 'string' && fromMsg.length > 0) return fromMsg;

  return '<unknown>';
}

/**
 * Get the current state for an actor, defaulting to zeros.
 */
function getOrInit(actorId: string, recipientUserId: string): ActorEconomyState {
  return (
    _state.get(actorId) ?? {
      actionsUsed: 0,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId,
    }
  );
}

/**
 * Build the emit payload from current actor state.
 */
function buildPayload(actorId: string, state: ActorEconomyState): ActionEconomyPayload {
  return {
    actorId,
    actionsUsed: state.actionsUsed,
    bonusActionsUsed: state.bonusActionsUsed,
    reactionsUsed: state.reactionsUsed,
    multiAttackInProgress: state.multiAttackInProgress,
    recipientUserId: state.recipientUserId,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register the `createChatMessage` + `updateCombat` hook subscribers.
 *
 * Hooks:
 *   - `createChatMessage` — inspects `flags.evf.audit.toolId` to determine which
 *     economy slot was consumed. Deduplicates weapon-attack multi-attack sequences
 *     by `(actorId, attackId)` composite key.
 *   - `updateCombat` — resets all per-actor counters when `change.turn !== undefined`
 *     OR `change.round !== undefined` (both represent "new combatant's turn").
 *
 * @param emit - Callback to emit the action economy payload via bridgeDeltaEmitter.
 *               Fire-and-forget; failures are swallowed with console.warn.
 * @returns Unsubscribe closure — calls `Hooks.off(createChatHookId)` and
 *          `Hooks.off(updateCombatHookId)`. Discarded by module.ts for MVP
 *          (module lifecycle is for-the-session).
 */
export function registerCombatActionTracker(
  emit: (payload: ActionEconomyPayload) => void,
): () => void {
  // ── createChatMessage hook ──────────────────────────────────────────────────
  const createChatHookId = Hooks.on('createChatMessage', (...args: unknown[]): void => {
    try {
      // Hook signature: (message, options, userId)
      // NEVER return false — Foundry hook chain must not be interrupted
      const rawMsg = args[0];
      if (rawMsg === null || typeof rawMsg !== 'object') return;
      const msg = rawMsg as Record<string, unknown>;

      // T-09-01: only process messages with flags.evf.audit
      const flags = msg.flags as Record<string, unknown> | undefined;
      if (flags === null || flags === undefined) return;

      const evf = flags.evf as Record<string, unknown> | undefined;
      if (evf === null || evf === undefined) return;

      const audit = evf.audit as Record<string, unknown> | undefined;
      if (audit === null || audit === undefined) return;

      // Determine toolId and its economy slot
      const toolId = audit.toolId as string | undefined;
      if (typeof toolId !== 'string') return;

      const slot = TOOL_SLOT_MAP[toolId];
      if (slot === undefined) return; // T-09-01: ignore non-economy tools (drop-concentration, move-token, etc.)

      // Resolve actorId (required for state keying)
      const actorId = audit.actorId as string | undefined;
      if (typeof actorId !== 'string' || actorId.length === 0) return;

      // Resolve recipientUserId (CAT-10 priority chain)
      const recipientUserId = resolveRecipientUserId(audit, msg);

      // Get current state for this actor (or initialize to zeros)
      const current = getOrInit(actorId, recipientUserId);
      // Always update recipientUserId in case it was missing on init
      current.recipientUserId = recipientUserId;

      if (slot === 'action') {
        // T-09-02: attackId dedup for weapon-attack multi-attack sequences
        const attackId = audit.attackId as string | undefined;

        if (typeof attackId === 'string' && attackId.length > 0) {
          // Multi-attack path: first card sets actionsUsed=1 + multiAttackInProgress=true
          // Subsequent cards with same (actorId, attackId) are no-ops for actionsUsed
          const actorSeen = _attackIdSeen.get(actorId) ?? new Set<string>();
          _attackIdSeen.set(actorId, actorSeen);

          if (actorSeen.has(attackId)) {
            // Duplicate card — no-op for economy; state unchanged
            // Do NOT emit — transition-driven (state unchanged means no delta)
            return;
          }

          // First card for this attackId: mark as seen + increment Action
          actorSeen.add(attackId);
          current.actionsUsed = 1;
          current.multiAttackInProgress = true;
        } else {
          // Regular action (cast-spell, weapon-attack without attackId): just increment
          current.actionsUsed = 1;
          // multiAttackInProgress stays as-is (no multi-attack group active)
        }
      } else {
        // Bonus action slot (use-item)
        current.bonusActionsUsed = 1;
      }

      // Persist updated state and emit
      _state.set(actorId, current);
      emit(buildPayload(actorId, current));
    } catch (err) {
      // Defensive: swallow ALL throws — a tracker error must never
      // interrupt the Foundry session or hook chain (T-09-05).
      console.warn('[combat-action-tracker] createChatMessage handler threw', err);
    }
    // NEVER return false — TypeScript void return type enforces this contract
  });

  // ── updateCombat hook ───────────────────────────────────────────────────────
  const updateCombatHookId = Hooks.on('updateCombat', (...args: unknown[]): void => {
    try {
      // Hook signature: (combat, change, options, userId)
      const rawChange = args[1];
      if (rawChange === null || typeof rawChange !== 'object') return;
      const change = rawChange as Record<string, unknown>;

      // Only reset on turn advance OR round advance (CAT-06, CAT-07).
      // round advance = new combatant at top of initiative — also a turn change.
      if (change.turn === undefined && change.round === undefined) return;

      // Reset all tracked actors and emit fresh (zeroed) payloads
      for (const [actorId, state] of _state.entries()) {
        const resetState: ActorEconomyState = {
          actionsUsed: 0,
          bonusActionsUsed: 0,
          reactionsUsed: 0,
          multiAttackInProgress: false,
          recipientUserId: state.recipientUserId,
        };
        _state.set(actorId, resetState);
        // Clear attackId dedup for this actor (turn reset = new action pool)
        _attackIdSeen.delete(actorId);
        emit(buildPayload(actorId, resetState));
      }
    } catch (err) {
      console.warn('[combat-action-tracker] updateCombat handler threw', err);
    }
    // NEVER return false — Foundry hook chain must not be interrupted
  });

  // Return unsubscribe closure
  return (): void => {
    Hooks.off(createChatHookId);
    Hooks.off(updateCombatHookId);
  };
}
