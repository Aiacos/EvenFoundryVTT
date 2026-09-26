/**
 * Shortcuts to the pairing window («Collega occhiali G2», ADR-0019) — the fewest clicks:
 *
 * - **Players list** context menu: a player right-clicks **their own** row; a GM
 *   right-clicks any player (their assigned character is preselected).
 * - **Keybinding** «Collega occhiali G2» (default `Alt+G`, rebindable in *Configure
 *   Controls*): opens the window from anywhere.
 *
 * The settings menu stays the canonical path; these only save the trip through
 * *Configure Settings*.
 *
 * Hook: `getUserContextOptions(application, menuItems)` — the `getDocumentContextOptions`
 * hook family with `Document` = `User`, fired by the Players application. Menu entries
 * changed shape between generations:
 * - v13 `ContextMenuEntry`: `{ name, icon: '<i …>', condition(li), callback(li) }`
 * - v14 `ContextMenuEntry`: `{ label, icon: 'fa-…' class, visible(target), onClick(event, target) }`
 *
 * @see https://foundryvtt.com/api/v13/functions/hookEvents.getDocumentContextOptions.html (verified 2026-09-23)
 * @see https://foundryvtt.com/api/v14/functions/hookEvents.getDocumentContextOptions.html (verified 2026-09-23)
 * @see https://foundryvtt.com/api/v13/interfaces/foundry.ContextMenuEntry.html — name / icon / condition / callback
 * @see https://foundryvtt.com/api/v14/interfaces/foundry.ContextMenuEntry.html — label / icon / visible / onClick
 * @see https://foundryvtt.com/api/v13/classes/foundry.helpers.interaction.ClientKeybindings.html#register
 */
import { MODULE_ID } from '../module-id.js';
import { userOwnsActor } from './ownership.js';

/** Hook fired while the Players list builds its per-user context menu. */
export const USER_CONTEXT_HOOK = 'getUserContextOptions' as const;

/** Font Awesome class of the menu entry (same icon as the settings menu). */
const ICON_CLASS = 'fas fa-glasses';

/** Opens the pairing window, optionally preselecting a character. */
export type OpenPairWindow = (actorId: string | null) => void;

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
 * Whether the current user may open the window from `userId`'s row: a player on their
 * own row, a GM on any non-GM player.
 */
export function canPairFrom(userId: string | null): boolean {
  if (userId === null) return false;
  const user = game.users.get(userId);
  if (user === undefined) return false;
  return game.user.isGM ? !user.isGM : userId === game.user.id;
}

/** The character to preselect for `userId`'s row: their assigned one, if they own it. */
export function characterOf(userId: string | null): string | null {
  if (userId === null) return null;
  const user = game.users.get(userId);
  const character = user?.character?.id;
  return character !== undefined && userOwnsActor(character, userId) ? character : null;
}

/** Foundry major version (`game.release.generation`); 13 when unknown. */
function generation(): number {
  // `game.release` exists on v13+ but is not part of our minimal global typings.
  const release = (game as { release?: { generation?: number } }).release;
  return release?.generation ?? 13;
}

/**
 * Builds the context-menu entry in the shape expected by Foundry `gen`.
 *
 * @param open - opens the pairing window
 * @param gen  - Foundry major version (13 → legacy keys, ≥ 14 → label/visible/onClick)
 */
export function buildPairMenuEntry(open: OpenPairWindow, gen: number): Record<string, unknown> {
  const visible = (row: RowLike): boolean => canPairFrom(rowUserId(row));
  const run = (row: RowLike): void => {
    const userId = rowUserId(row);
    if (canPairFrom(userId)) open(characterOf(userId));
  };
  const label = 'evf.players_menu.pair';
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
 * Subscribes to {@link USER_CONTEXT_HOOK} and registers the keybinding. Call once during
 * `init`.
 *
 * @returns the Foundry hook id
 */
export function registerPairShortcuts(open: OpenPairWindow): number {
  game.keybindings.register(MODULE_ID, 'pairGlasses', {
    name: 'evf.keybinding.pair',
    hint: 'evf.keybinding.pair_hint',
    editable: [{ key: 'KeyG', modifiers: ['Alt'] }],
    onDown: () => {
      open(null);
      return true;
    },
  });
  return Hooks.on(USER_CONTEXT_HOOK, (_app: unknown, menuItems: unknown) => {
    if (!Array.isArray(menuItems)) return;
    menuItems.push(buildPairMenuEntry(open, generation()));
  });
}
