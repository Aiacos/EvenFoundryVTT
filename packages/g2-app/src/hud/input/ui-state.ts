/**
 * HUD-local UI state (column C state machine + sheet page + advantage toggle).
 * Never persisted and never written to the {@link AppStore}.
 *
 * @see docs/design/g2-thirds-layout.md §Modello di input
 */
import type { ActionResultPayload } from '@evf/shared-protocol';

export type View =
  | 'root'
  | 'actions'
  | 'spells'
  | 'slot'
  | 'target'
  | 'items'
  | 'options'
  | 'result'
  | 'reaction';

export type Advantage = 'normal' | 'advantage' | 'disadvantage';

/** Action being composed while navigating spells → slot → target. */
export type Pending =
  | { kind: 'weapon'; itemId: string; name: string }
  | { kind: 'spell'; spellId: string; name: string; level: number; slot: number | null };

/** M06 result panel. */
export interface ResultState {
  title: string;
  /** Epoch ms when the panel was (re)shown; drives the 8 s auto-close. */
  shownAt: number;
  /** Invoke acknowledgement from the projector. */
  ack: 'pending' | 'ok' | { error: string };
  /** Roll outcome relayed by Foundry (`r1.action.result`), when it arrives. */
  payload: ActionResultPayload | null;
}

export type SheetPage = 0 | 1 | 2 | 3;

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
  /** Epoch ms when the reaction prompt expires (M07). */
  reactionDeadline: number | null;
}

export function initialUi(): UiState {
  return {
    view: 'root',
    cursor: 0,
    scroll: 0,
    sheetPage: 0,
    advantage: 'normal',
    pending: null,
    result: null,
    reactionDeadline: null,
  };
}
