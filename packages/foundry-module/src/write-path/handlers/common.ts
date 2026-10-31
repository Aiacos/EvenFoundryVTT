/**
 * Helpers shared by the write-path tool handlers (ADR-0011): error normalization, chat
 * card id extraction and the MidiQOL capability probe. One copy, so every handler maps
 * the same Foundry outcome to the same result.
 *
 * @see docs/architecture/0011-write-path.md
 */

/**
 * True when Foundry/dnd5e rejected an operation because no GM is connected — the
 * handlers turn it into the `no_gm_connected` error code so the glasses can say
 * "GM offline" (Pitfall 5).
 *
 * @param err - Whatever the Foundry call threw or rejected with
 * @returns Whether the error is the "No connected GM" signal
 */
export function isNoGmError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('no_gm_connected') || msg.includes('No connected GM');
}

/**
 * Reads the chat card id from an activity-use result (a `ChatMessage` or a MidiQOL
 * workflow carrying `id`).
 *
 * @param result - The value `activity.use()` / `completeActivityUse()` resolved with
 * @returns The chat message id, or `null` when the result carries none
 */
export function extractChatCardId(result: unknown): string | null {
  if (
    result !== null &&
    typeof result === 'object' &&
    'id' in result &&
    typeof (result as Record<string, unknown>).id === 'string'
  ) {
    return (result as { id: string }).id;
  }
  return null;
}

/** The MidiQOL API surface the handlers call (see `foundry-globals.d.ts`). */
export type MidiQolApi = NonNullable<typeof MidiQOL>;

/**
 * Returns the MidiQOL API when the automation module is present **and** active, else
 * `null`. The `MidiQOL` global can be `undefined` even when the module is
 * active-but-not-yet-initialized, so both the `typeof` check and
 * `game.modules.get('midi-qol')?.active` are required before any dereference
 * (research §6, FIX-B/FIX-C 260529-eer).
 *
 * @returns The live MidiQOL API, or `null` when it must not be used
 */
export function activeMidiQol(): MidiQolApi | null {
  if (typeof MidiQOL === 'undefined' || MidiQOL === undefined) return null;
  return game.modules.get('midi-qol')?.active === true ? MidiQOL : null;
}
