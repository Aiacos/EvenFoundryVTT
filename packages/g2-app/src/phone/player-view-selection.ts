/**
 * Pure mapping: unified roster selection → player-view request.
 *
 * Feature 001 (D2): the settings panel exposes ONE selector — the roster — with a
 * synthetic top **"Party"** entry. Selecting "Party" requests the streaming/overview
 * source; selecting a real player character requests that PC's owner-elected view.
 * This module holds the side-effect-free mapping so it can be unit-tested in
 * isolation (Constitution II) and reused by both boot-time and change-time emission.
 *
 * The result is emitted as the existing `client_player_view` WS message
 * (`shared-protocol` `ClientPlayerViewMessageSchema`) — no new wire field.
 *
 * @see specs/001-foundry-g2-hud/contracts/player-view-selection.md
 */

/** Sentinel value for the synthetic top "Party" roster entry. */
export const PARTY_SELECTION = 'party' as const;

/**
 * The minimal player-view request derived from a roster selection — the `mode`
 * (+ optional `actorId`) carried by the `client_player_view` message. The `type`
 * literal is added by the caller when it builds the wire message.
 */
export interface PlayerViewRequest {
  /** `streaming` for Party (overview); `actor` for a specific PC. */
  readonly mode: 'streaming' | 'actor';
  /** Present only when a real PC is selected. */
  readonly actorId?: string;
}

/**
 * Map a roster selection to a player-view request.
 *
 * - `"party"` → `{ mode: "streaming" }`
 * - a non-empty `actorId` → `{ mode: "actor", actorId }`
 * - empty / whitespace-only / nullish → `null` (no request emitted)
 *
 * @param selection The roster entry value (`"party"` or an `actorId`).
 * @returns The request to emit, or `null` when the selection is empty/invalid.
 */
export function toPlayerViewRequest(
  selection: string | null | undefined,
): PlayerViewRequest | null {
  if (selection == null) {
    return null;
  }
  const value = selection.trim();
  if (value === '') {
    return null;
  }
  if (value === PARTY_SELECTION) {
    return { mode: 'streaming' };
  }
  return { mode: 'actor', actorId: value };
}
