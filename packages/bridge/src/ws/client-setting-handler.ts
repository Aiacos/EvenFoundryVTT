/**
 * WS `client_setting` handler — queues a glasses-originated display-settings edit.
 *
 * Latency-audit follow-up 2026-06-14. The glasses send a partial settings edit
 * (e.g. `{ dither: true }` or `{ brightness: 40 }`) over the WS as a
 * `client_setting` message. The bridge cannot call the push-only Foundry module
 * directly, so this handler merges the edit into the {@link SettingsStore}
 * pending box; the `/internal/delta` route then returns it on the module's next
 * frame POST response, where the module applies it (see settings-store.ts).
 *
 * Mirrors the {@link handleResume} contract: parse-or-no-op on non-matching
 * input (other message types route to their own handlers), never throws.
 *
 * @see packages/shared-protocol/src/payloads/settings-display.ts (schema)
 * @see packages/bridge/src/settings/settings-store.ts (pending box)
 * @see packages/bridge/src/routes/internal-delta.ts (upstream piggyback)
 */

import { ClientSettingMessageSchema } from '@evf/shared-protocol';
import type { Logger } from 'pino';
import type { SettingsStore } from '../settings/settings-store.js';

/**
 * Handle a parsed-or-not `client_setting` message on an already-handshaked socket.
 *
 * @param settingsStore - Shared display-settings store (pending box).
 * @param rawData       - Raw socket payload (Buffer or string from `ws`).
 * @param logger        - pino logger (redaction config applied at server level).
 */
export function handleClientSetting(
  settingsStore: SettingsStore,
  rawData: Buffer | ArrayBuffer | Buffer[] | string,
  logger: Logger,
): void {
  let parsed: unknown;
  try {
    const text =
      typeof rawData === 'string'
        ? rawData
        : Buffer.isBuffer(rawData)
          ? rawData.toString('utf-8')
          : Array.isArray(rawData)
            ? Buffer.concat(rawData).toString('utf-8')
            : Buffer.from(rawData).toString('utf-8');
    parsed = JSON.parse(text);
  } catch {
    return;
  }

  const result = ClientSettingMessageSchema.safeParse(parsed);
  if (!result.success) {
    // Not a client_setting message — ignore. Other message types route elsewhere.
    return;
  }

  // An empty `settings` object is a no-op edit — skip queuing it.
  const edit = result.data.settings;
  if (Object.keys(edit).length === 0) {
    return;
  }

  settingsStore.queuePending(edit);
  logger.debug(
    { keys: Object.keys(edit) },
    'WS client_setting: queued upstream display-settings edit',
  );
}
