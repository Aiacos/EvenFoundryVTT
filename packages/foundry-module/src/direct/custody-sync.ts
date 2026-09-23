/**
 * Keeps key custody consistent across clients (ADR-0013), on `ready` and whenever a
 * user's public identity key changes (`updateUser`):
 *
 * - every client publishes its identity key ({@link ensureIdentity});
 * - GM clients stamp legacy ADR-0012 records with their `keyHolder`, re-seal enabled
 *   players' passwords for new player keys (designated GM only) and start the actor
 *   ownership mirror;
 * - player clients fix `playerHasKey` and re-seal their device key for new GM keys.
 *
 * Failures are logged and never block the rest of the module: a client that cannot
 * publish its key simply cannot take part in sealed delivery (GM pairing on behalf
 * still works).
 *
 * @see https://foundryvtt.com/api/v13/functions/hookEvents.updateDocument.html — `updateUser(document, changed, options, userId)`
 * @see docs/architecture/0013-player-owned-glasses-hybrid-projector.md
 */
import { MODULE_ID } from '../module-id.js';
import { refreshSealedPasswords, registerOwnershipMirror } from './glasses-access.js';
import { ensureIdentity, PUB_FLAG } from './identity-keys.js';
import { migrateKeyHolders } from './pairing-store.js';
import { reconcileSelfCustody, resealForGms } from './self-pairing.js';

/** True when an `updateUser` change set touches `flags.evenfoundryvtt.pub`. */
export function changesPublicKey(changes: unknown): boolean {
  if (typeof changes !== 'object' || changes === null) return false;
  const flags = (changes as { flags?: Record<string, unknown> }).flags?.[MODULE_ID];
  return typeof flags === 'object' && flags !== null && PUB_FLAG in flags;
}

function report(task: string): (err: unknown) => void {
  return (err) => console.error(`[EVF] custody sync: ${task} failed`, err);
}

/** Reaction to another user publishing a new public key. */
export async function onPublicKeyChanged(user: Pick<FoundryUser, 'isGM'>): Promise<void> {
  if (game.user.isGM) {
    if (!user.isGM) await refreshSealedPasswords();
    return;
  }
  if (user.isGM) await resealForGms();
}

/**
 * Runs the `ready` tasks and subscribes to `updateUser`. Call once on `ready`.
 *
 * @returns the Foundry hook ids registered
 */
export async function startCustodySync(): Promise<number[]> {
  await ensureIdentity().catch(report('publishing the identity key'));
  const hooks: number[] = [];
  if (game.user.isGM) {
    await migrateKeyHolders().catch(report('legacy key-holder migration'));
    await refreshSealedPasswords().catch(report('password re-sealing'));
    hooks.push(...registerOwnershipMirror());
  } else {
    await reconcileSelfCustody().catch(report('custody reconciliation'));
    await resealForGms().catch(report('GM key re-sealing'));
  }
  hooks.push(
    Hooks.on('updateUser', (user: unknown, changes: unknown) => {
      if (!changesPublicKey(changes)) return;
      onPublicKeyChanged(user as FoundryUser).catch(report('re-sealing after a key change'));
    }),
  );
  return hooks;
}
