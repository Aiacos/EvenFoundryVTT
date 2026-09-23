/**
 * HUD-local UI state (zone E state machine + sheet page + advantage toggle).
 * Never persisted and never written to the {@link AppStore}.
 *
 * @see docs/design/g2-sheet-ux.html §Interazione
 */
import type { ActionResultPayload } from '@evf/shared-protocol';

export type View =
  | 'root'
  | 'actions'
  | 'spells'
  | 'slot'
  | 'target'
  | 'items'
  | 'feats'
  | 'options'
  | 'result'
  | 'reaction'
  | 'request';

export type Advantage = 'normal' | 'advantage' | 'disadvantage';

/** Action being composed while navigating spells → slot → target (or item → target). */
export type Pending =
  | { kind: 'weapon'; itemId: string; name: string }
  | { kind: 'item'; itemId: string; name: string }
  | { kind: 'spell'; spellId: string; name: string; level: number; slot: number | null };

/** S6 result panel. */
export interface ResultState {
  title: string;
  /** Epoch ms when the panel was (re)shown; drives the 8 s auto-close. */
  shownAt: number;
  /** Invoke acknowledgement from the projector. */
  ack: 'pending' | 'ok' | { error: string };
  /** Roll outcome relayed by Foundry (`r1.action.result`), when it arrives. */
  payload: ActionResultPayload | null;
}

/** Zone D page chosen by the player or the automatic rule (0 PF shows death saves). */
export type SheetPage = 'abilities' | 'saves';

export interface UiState {
  view: View;
  /** Cursor index in list views. */
  cursor: number;
  /** Scroll offset (lines) of the root log / initiative body. */
  scroll: number;
  sheetPage: SheetPage;
  advantage: Advantage;
  pending: Pending | null;
  result: ResultState | null;
  /** Epoch ms when the reaction prompt expires (S7). */
  reactionDeadline: number | null;
}

export function initialUi(): UiState {
  return {
    view: 'root',
    cursor: 0,
    scroll: 0,
    sheetPage: 'abilities',
    advantage: 'normal',
    pending: null,
    result: null,
    reactionDeadline: null,
  };
}
