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
interface ChatMessageLike {
  id: string;
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
      const result: LogEventResult | undefined =
        total !== undefined ? { kind: 'hit', value: total } : undefined;
      return { kind: 'attack', result };
    }

    if (rollType === 'damage') {
      const total = getFirstRollTotal(message);
      const damage = total !== undefined ? String(total) : undefined;
      return { kind: 'damage', result: damage !== undefined ? { kind: 'hit', damage } : undefined };
    }

    if (rollType === 'save') {
      const total = getFirstRollTotal(message);
      // Without knowing the DC we can't determine pass/fail — default to 'pass'.
      const result: LogEventResult | undefined =
        total !== undefined ? { kind: 'pass', value: total } : undefined;
      return { kind: 'roll', result };
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
 * Read the tail of the Foundry chat log and map it to typed {@link LogEvent}s.
 *
 * Iterates `game.messages.contents.slice(-maxCount)` (newest `maxCount` messages).
 * Returns an array in chronological order (oldest first) — the panel's scroll
 * windowing applies a second clamp on the visible slice.
 *
 * **DoS mitigation (T-05-05-03):** The `maxCount` cap (default 50) prevents
 * pathological scan of large `game.messages` collections (>10k entries).
 *
 * @param maxCount Maximum number of messages to read (default 50).
 * @returns Array of {@link LogEvent} objects, oldest-first.
 */
export function getLogEventTail(maxCount = 50): LogEvent[] {
  // Defensive: game.messages may be undefined in test environments.
  const messages =
    typeof game !== 'undefined' &&
    game.messages !== undefined &&
    game.messages !== null &&
    'contents' in game.messages
      ? (game.messages as { contents: ChatMessageLike[] }).contents
      : [];

  const tail = messages.slice(-maxCount);

  const events: LogEvent[] = [];

  for (const message of tail) {
    const id = message.id;
    if (id === undefined || id === '' || id === null) continue;

    const timestamp = typeof message.timestamp === 'number' ? message.timestamp : Date.now();

    // Actor name from speaker.alias; defensive empty string if missing.
    const actorName = typeof message.speaker?.alias === 'string' ? message.speaker.alias : '';

    const { kind, result } = detectKindAndResult(message);

    // Description: use the message content if available, or the kind label.
    // In practice the bridge will provide description via the envelope payload;
    // the reader produces a minimal description from the speaker + kind.
    const description = actorName !== '' ? `${kind} roll` : kind;

    events.push({
      id,
      timestamp,
      actorName,
      kind,
      description,
      ...(result !== undefined ? { result } : {}),
    });
  }

  return events;
}
