/**
 * Targets for actions executed on a **player** client (ADR-0013 §Decision 7).
 *
 * Vanilla dnd5e records an activity's targets from `game.user.targets`
 * (`getTargetDescriptors()` in dnd5e 5.3.3 `module/utils.mjs`). When the projector runs
 * on the player's own client, `game.user` IS the acting player, so selecting the
 * glasses' targets as that player's own Foundry targets is exactly what the player would
 * do by hand — unlike on a GM client, where mutating the GM's targets is the documented
 * per-user pitfall the handlers avoid (MidiQOL `targetUuids` is used instead).
 *
 * `Token#setTarget(targeted, { releaseOthers })` — "Set this Token as an active target
 * for the current game User" — only exists for tokens drawn on this client's canvas;
 * tokens not on the viewed scene are skipped with a warning (MidiQOL still receives the
 * UUIDs through the handler).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.canvas.placeables.Token.html#settarget
 * @see https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/utils.mjs (getTargetDescriptors)
 */

/** Minimal canvas surface: the token layer's placeables by document id. */
interface TokenLayerLike {
  tokens?: {
    get(id: string): { setTarget(targeted?: boolean, options?: object): void } | undefined;
  };
}

/**
 * Makes `tokenIds` the current user's targets (replacing previous ones). No-op for an
 * empty list.
 *
 * @returns the ids that could not be targeted (not on this client's canvas)
 */
export function applyOwnTargets(tokenIds: readonly string[]): string[] {
  const layer = (canvas as TokenLayerLike | null | undefined)?.tokens;
  const missing: string[] = [];
  let first = true;
  for (const id of tokenIds) {
    const token = layer?.get(id);
    if (token === undefined) {
      missing.push(id);
      continue;
    }
    token.setTarget(true, { releaseOthers: first });
    first = false;
  }
  if (missing.length > 0) {
    console.warn(`[EVF] targets not on this client's canvas: ${missing.join(', ')}`);
  }
  return missing;
}
