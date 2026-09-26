/**
 * Relay wire contract (ADR-0019): how both peers reach a room of `packages/relay`, and
 * the control frames the relay itself emits. App frames are sealed envelopes the relay
 * never reads.
 *
 * @see packages/relay/README.md
 * @see docs/architecture/0019-relay-pairing-player-projector.md §Decision Outcome 2
 */
import { z } from 'zod';

/** The two ends of a room. */
export type RelayRole = 'projector' | 'glasses';

/** Largest frame the relay forwards (bytes); bigger frames close the sender (1009). */
export const MAX_RELAY_FRAME_BYTES = 1_048_576;

/** Close code the relay uses when a newer socket of the same role replaced this one. */
export const RELAY_CLOSE_REPLACED = 4000;

/**
 * WebSocket URL of `room` for `role` on the relay at `relayBase`.
 *
 * @param relayBase - `wss://host[/prefix]` (or `ws://` in development); a trailing slash
 *   and an `https://`/`http://` spelling are accepted.
 */
export function relayRoomUrl(relayBase: string, room: string, role: RelayRole): string {
  const base = relayBase.replace(/\/+$/, '').replace(/^http(s?):\/\//, 'ws$1://');
  return `${base}/r/${encodeURIComponent(room)}?role=${role}`;
}

/** HTTP health endpoint of the relay (pairing-window reachability check). */
export function relayHealthUrl(relayBase: string): string {
  return `${relayBase.replace(/\/+$/, '').replace(/^ws(s?):\/\//, 'http$1://')}/health`;
}

/** Control frame emitted by the relay: the other end of the room came or went. */
export const RelayControlSchema = z.strictObject({
  relay: z.enum(['peer-up', 'peer-down']),
});
export type RelayControl = z.infer<typeof RelayControlSchema>;

/**
 * Production relay (`packages/relay`, `wrangler deploy`). Must match the deployed Worker
 * and the `.ehpk` whitelist (checked by `scripts/check-relay-origin.mjs`).
 */
export const DEFAULT_RELAY_URL = 'wss://evf-relay.evf-relay.workers.dev' as const;

/** Hosted glasses app (GitHub Pages, `/app/`): the page the pairing QR opens. */
export const DEFAULT_APP_URL = 'https://aiacos.github.io/EvenFoundryVTT/app/' as const;
