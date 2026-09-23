/**
 * Foundry-side chat log reader.
 *
 * Maps `game.messages.contents` (Foundry ChatMessage collection) to an array of
 * {@link LogEvent} payloads consumed by {@link LogPanel} in `packages/g2-app`.
 *
 * ## Chat message kind detection (Assumption A4)
 *
 * Flag paths are assumed from dnd5e 5.x conventions and verified defensively at
 * runtime — unknown shapes fall back to `kind: 'chat'`. Assumption A4 is documented
 * in `.planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md`.
 *
 * Verified assumptions (RESEARCH §Assumption A4):
 * - Attack rolls: `message.flags?.dnd5e?.roll?.type === 'attack'`
 * - Damage rolls: `message.flags?.dnd5e?.roll?.type === 'damage'`
 * - Spell casts:  `message.flags?.dnd5e?.use?.type === 'spell'`
 * - Feature uses: `message.flags?.dnd5e?.use?.type === 'feat'`
 * - Saving throws: `message.flags?.dnd5e?.roll?.type === 'save'`
 * - Unknown → `kind: 'chat'` (defensive fallback)
 *
 * ## DoS mitigation (T-05-05-03)
 *
 * `maxCount` caps the number of messages read from the collection. Default is 50.
 * The panel applies a secondary scroll-windowing clamp on top of this cap.
 *
 * ## Read-only contract
 *
 * This reader NEVER mutates `game.messages`. It is a pure snapshot producer.
 * Write path (message deletion, log clear) is out of Phase 5 scope.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-05-PLAN.md
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Assumption A4
 * @see packages/shared-protocol/src/payloads/log.ts (LogEvent schema)
 * @see packages/g2-app/src/panels/log-panel.ts (consumer)
 */

import type { LogEvent, LogEventKind, LogEventResult } from '@evf/shared-protocol';

// ─── Internal type helpers ────────────────────────────────────────────────────

/**
 * Loose shape of the dnd5e flag namespace on a ChatMessage.
 *
 * Typed as `unknown` at the runtime boundary — all field access is guarded
 * by defensive narrowing. This type exists to document the assumed shape
 * without creating a hard dependency on fvtt-types (not yet adopted per STACK.md).
 */
interface Dnd5eFlags {
  roll?: { type?: string; isCritical?: boolean };
  use?: { type?: string };
}

/**
 * Minimal ChatMessage shape we rely on for log mapping.
 *
 * Source: `game.messages.contents` (EvenFoundryVTT foundry-globals.d.ts).
 * Using `unknown` for the `flags` field — accessed via defensive narrowing.
 */
export interface ChatMessageLike {
  id: string;
  /** Recipient user ids; empty for public messages. */
  whisper?: string[];
  /** Blind roll (hidden from the roller). */
  blind?: boolean;
  timestamp?: number;
  speaker?: { alias?: string };
  flags?: { dnd5e?: Dnd5eFlags };
  rolls?: Array<{ total?: number }>;
}

// ─── Kind detection ───────────────────────────────────────────────────────────

/**
 * Defensive accessor for the dnd5e flag namespace.
 *
 * Returns the `dnd5e` sub-object if present and object-shaped; undefined otherwise.
 * Never throws — all access is via optional chaining and type guards.
 */
function getDnd5eFlags(message: ChatMessageLike): Dnd5eFlags | undefined {
  const flags = message.flags;
  if (flags === undefined || flags === null || typeof flags !== 'object') return undefined;
  const dnd5e = (flags as { dnd5e?: unknown }).dnd5e;
  if (dnd5e === undefined || dnd5e === null || typeof dnd5e !== 'object') return undefined;
  return dnd5e as Dnd5eFlags;
}

/**
 * Get the first roll total from the message's `rolls` array.
 *
 * Used for attack/save result values.
 */
function getFirstRollTotal(message: ChatMessageLike): number | undefined {
  const rolls = message.rolls;
  if (!Array.isArray(rolls) || rolls.length === 0) return undefined;
  const first = rolls[0];
  if (first === undefined || typeof first.total !== 'number') return undefined;
  return first.total;
}

/**
 * Detect the event kind and optional result sub-line from a ChatMessage.
 *
 * Priority: roll.type → use.type → fallback 'chat'.
 * All flag access is defensive — any missing field yields the 'chat' fallback.
 */
function detectKindAndResult(message: ChatMessageLike): {
  kind: LogEventKind;
  result?: LogEventResult;
} {
  const flags = getDnd5eFlags(message);

  if (flags !== undefined) {
    const rollType = flags.roll?.type;
    const useType = flags.use?.type;

    if (rollType === 'attack') {
      const total = getFirstRollTotal(message);
      // Heuristic: critical hit → hit; otherwise can't know without target CA.
      // Default to 'hit' when total is present, otherwise omit result.
      const attackResult: LogEventResult | undefined =
        total !== undefined ? { kind: 'hit', value: total } : undefined;
      return {
        kind: 'attack',
        ...(attackResult !== undefined ? { result: attackResult } : {}),
      };
    }

    if (rollType === 'damage') {
      const total = getFirstRollTotal(message);
      const damage = total !== undefined ? String(total) : undefined;
      const damageResult: LogEventResult | undefined =
        damage !== undefined ? { kind: 'hit', damage } : undefined;
      return {
        kind: 'damage',
        ...(damageResult !== undefined ? { result: damageResult } : {}),
      };
    }

    if (rollType === 'save') {
      const total = getFirstRollTotal(message);
      // Without knowing the DC we can't determine pass/fail — default to 'pass'.
      const saveResult: LogEventResult | undefined =
        total !== undefined ? { kind: 'pass', value: total } : undefined;
      return {
        kind: 'roll',
        ...(saveResult !== undefined ? { result: saveResult } : {}),
      };
    }

    if (typeof useType === 'string') {
      if (useType === 'spell') return { kind: 'spell' };
      if (useType === 'feat') return { kind: 'feature' };
    }
  }

  return { kind: 'chat' };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Whether a chat message may be shown to any of `viewerIds` (the player and the
 * player's "(G2)" user). Public messages are visible; whispers only to recipients;
 * blind rolls never (the GM client holds every message, so this filter is what keeps
 * GM-only content off the glasses — ADR-0012 §Decision Drivers 4).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.BaseChatMessage.html (`whisper`, `blind`)
 */
export function isMessageVisibleTo(
  message: ChatMessageLike,
  viewerIds: readonly string[],
): boolean {
  if (message.blind === true) return false;
  const whisper = Array.isArray(message.whisper) ? message.whisper : [];
  return whisper.length === 0 || whisper.some((id) => viewerIds.includes(id));
}

/**
 * Maps one ChatMessage to a {@link LogEvent}; null when the message has no id.
 */
export function toLogEvent(message: ChatMessageLike): LogEvent | null {
  const id = message.id;
  if (id === undefined || id === '' || id === null) return null;

  const timestamp = typeof message.timestamp === 'number' ? message.timestamp : Date.now();

  // Actor name from speaker.alias; defensive empty string if missing.
  const actorName = typeof message.speaker?.alias === 'string' ? message.speaker.alias : '';

  const { kind, result } = detectKindAndResult(message);

  // Description: minimal speaker + kind label for the log row.
  // WR-05 fix: only append " roll" suffix for kinds that are actual dice rolls
  // (attack, damage, save). For spell/feature/chat the actor name alone is
  // sufficient — "spell roll" and "feature roll" are semantically wrong.
  const isRollKind = kind === 'attack' || kind === 'roll' || kind === 'damage';
  const description = actorName !== '' ? (isRollKind ? `${actorName} — ${kind}` : actorName) : kind;

  return {
    id,
    timestamp,
    actorName,
    kind,
    description,
    ...(result !== undefined ? { result } : {}),
  };
}

/**
 * Read the tail of the Foundry chat log and map it to typed {@link LogEvent}s.
 *
 * Returns up to `maxCount` of the newest messages (visible to `viewerIds` when
 * given), in chronological order (oldest first).
 *
 * **DoS mitigation (T-05-05-03):** The `maxCount` cap (default 50) bounds the
 * output; the scan walks backwards and stops as soon as the cap is reached.
 *
 * @param maxCount  Maximum number of events to return (default 50).
 * @param viewerIds When set, only messages {@link isMessageVisibleTo} these users.
 * @returns Array of {@link LogEvent} objects, oldest-first.
 */
export function getLogEventTail(maxCount = 50, viewerIds?: readonly string[]): LogEvent[] {
  // Defensive: game is declared as a module-level global but may be undefined
  // in test environments (vitest stubs game via vi.stubGlobal).
  const messages: ChatMessageLike[] =
    typeof game !== 'undefined' && game.messages != null
      ? (game.messages.contents as ChatMessageLike[])
      : [];

  const events: LogEvent[] = [];
  for (let i = messages.length - 1; i >= 0 && events.length < maxCount; i--) {
    const message = messages[i];
    if (message === undefined) continue;
    if (viewerIds !== undefined && !isMessageVisibleTo(message, viewerIds)) continue;
    const event = toLogEvent(message);
    if (event !== null) events.push(event);
  }
  return events.reverse();
}
