/**
 * Pairing entries in the Players list context menu.
 *
 * - **GM**: right-clicking a player offers *Pair G2 glasses*, which opens the GM
 *   pairing window (mock P01) with that player — and their assigned character
 *   `user.character` — preselected.
 * - **Player** (ADR-0017): right-clicking **themselves** offers *Pair my glasses*
 *   (self-service window), once the GM enabled glasses for them.
 *
 * The settings menus stay the canonical paths; these only save the trip through
 * *Configure Settings*.
 *
 * Hook: `getUserContextOptions(application, menuItems)` — the `getDocumentContextOptions`
 * hook family with `Document` = `User`, fired by the Players application (v13 + v14
 * `foundry.applications.ui.Players#_getContextMenuOptions`). Menu entries changed shape
 * between generations:
 * - v13 `ContextMenuEntry`: `{ name, icon: '<i …>', condition(li), callback(li) }`
 * - v14 `ContextMenuEntry`: `{ label, icon: 'fa-…' class, visible(target), onClick(event, target) }`
 *
 * Both `li` / `target` are the user row element carrying `data-user-id`. If the hook
 * never fires (API change), nothing breaks: the settings menu still opens the window.
 *
 * @see https://foundryvtt.com/api/v13/functions/hookEvents.getDocumentContextOptions.html (verified 2026-09-23)
 * @see https://foundryvtt.com/api/v14/functions/hookEvents.getDocumentContextOptions.html (verified 2026-09-23)
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.ui.Players.html — `_getContextMenuOptions`
 * @see https://foundryvtt.com/api/v13/interfaces/foundry.ContextMenuEntry.html — name / icon / condition / callback
 * @see https://foundryvtt.com/api/v14/interfaces/foundry.ContextMenuEntry.html — label / icon / visible / onClick
 * @see docs/design/g2-thirds-layout.md §P01
 */

import { userOwnsActor } from './election.js';
import { isG2User } from './g2-user.js';
import { getAccess } from './glasses-access.js';

/** Hook fired while the Players list builds its per-user context menu. */
export const USER_CONTEXT_HOOK = 'getUserContextOptions' as const;

/** Font Awesome class of the menu entry (same icon as the settings menu). */
const ICON_CLASS = 'fas fa-glasses';

/** Who to pair: the player and the actor to preselect (their assigned character). */
export interface PairTarget {
  playerUserId: string;
  actorId: string | null;
}

/** Opens the GM pairing window preselected on `target`. */
export type OpenPairWindow = (target: PairTarget) => void;

/** Opens the player's own (self-service) pairing window. */
export type OpenSelfPairWindow = () => void;

/**
 * Row element as handed to condition/callback: an `HTMLElement` (v13 with
 * `jQuery: false`, v14) or a jQuery wrapper (v13 legacy menus).
 */
type RowLike = HTMLElement | { 0?: HTMLElement } | null | undefined;

/** `data-user-id` of the row the menu was opened on, if any. */
export function rowUserId(row: RowLike): string | null {
  const el = row instanceof HTMLElement ? row : (row?.[0] ?? null);
  if (!(el instanceof HTMLElement)) return null;
  const holder = el.dataset.userId !== undefined ? el : el.closest<HTMLElement>('[data-user-id]');
  return holder?.dataset.userId ?? null;
}

/**
 * The pairing target for a user id, or null when that user cannot own glasses
 * (unknown, a GM, or itself a "(G2)" user). The assigned character is preselected only
 * when the player owns it.
 */
export function pairTargetFor(userId: string | null): PairTarget | null {
  if (userId === null) return null;
  const user = game.users.get(userId);
  if (user === undefined || user.isGM || isG2User(user)) return null;
  const character = user.character?.id;
  const actorId = character !== undefined && userOwnsActor(character, user.id) ? character : null;
  return { playerUserId: user.id, actorId };
}

/** Foundry major version (`game.release.generation`); 13 when unknown. */
function generation(): number {
  // `game.release` exists on v13+ but is not part of our minimal global typings.
  const release = (game as { release?: { generation?: number } }).release;
  return release?.generation ?? 13;
}

/** Context-menu entry in the shape expected by Foundry `gen` (see module docs). */
function menuEntry(
  label: string,
  visible: (row: RowLike) => boolean,
  run: (row: RowLike) => void,
  gen: number,
): Record<string, unknown> {
  if (gen >= 14) {
    return {
      label,
      icon: ICON_CLASS,
      visible,
      onClick: (_event: Event, row: HTMLElement): void => run(row),
    };
  }
  return { name: label, icon: `<i class="${ICON_CLASS}"></i>`, condition: visible, callback: run };
}

/**
 * Builds the GM entry *Pair G2 glasses*.
 *
 * @param open - opens the pairing window
 * @param gen  - Foundry major version (13 → legacy keys, ≥ 14 → label/visible/onClick)
 */
export function buildPairMenuEntry(open: OpenPairWindow, gen: number): Record<string, unknown> {
  const visible = (row: RowLike): boolean =>
    game.user.isGM && pairTargetFor(rowUserId(row)) !== null;
  const run = (row: RowLike): void => {
    const target = pairTargetFor(rowUserId(row));
    if (target !== null) open(target);
  };
  return menuEntry('evf.players_menu.pair', visible, run, gen);
}

/**
 * Builds the player entry *Pair my glasses*: only on the player's own row, only once
 * the GM enabled glasses for them.
 *
 * @param open - opens the self-service window
 * @param gen  - Foundry major version
 */
export function buildSelfMenuEntry(open: OpenSelfPairWindow, gen: number): Record<string, unknown> {
  const visible = (row: RowLike): boolean =>
    !game.user.isGM && rowUserId(row) === game.user.id && getAccess(game.user.id) !== null;
  const run = (row: RowLike): void => {
    if (visible(row)) open();
  };
  return menuEntry('evf.players_menu.pair_self', visible, run, gen);
}

/**
 * Subscribes to {@link USER_CONTEXT_HOOK}. Call once during `init`. GM clients get the
 * GM entry, player clients the self-service entry.
 *
 * @returns the Foundry hook id
 */
export function registerPlayersMenu(open: OpenPairWindow, openSelf: OpenSelfPairWindow): number {
  return Hooks.on(USER_CONTEXT_HOOK, (_app: unknown, menuItems: unknown) => {
    if (!Array.isArray(menuItems)) return;
    menuItems.push(
      game.user.isGM
        ? buildPairMenuEntry(open, generation())
        : buildSelfMenuEntry(openSelf, generation()),
    );
  });
}
