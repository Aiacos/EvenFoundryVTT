/**
 * Column-C input state machine — pure reducer (docs/design/g2-thirds-layout.md
 * §Modello di input, state diagram):
 *
 * ```
 * root ─tap→ actions ─tap(weapon)→ target ─tap→ result
 *              └─tap(spells)→ spells ─tap→ slot ─tap→ target
 * "reaction available" ─→ reaction (priority, 10 s timeout)
 * ●● = back one level; ●● at root = exit (shutDownPageContainer(1))
 * result: tap → actions, ●● / 8 s → root
 * ```
 *
 * Gestures are the canonical R1/G2 set (press, double-press, swipe up/down); the
 * long-press contextual menu only duplicates entries reachable through
 * `Opzioni…` (Even guidelines: long press is an extra, never the only path).
 */
import type { AppSettings, AppState } from '../../state/app-store.js';
import { type HudStrings, nextLocaleSetting } from '../i18n.js';
import { screenOf } from '../screen.js';
import { GLYPH } from '../text/measure.js';
import { isMyTurn } from '../text/sheet.js';
import { buildEntries, type Intent, MENU_OPS, type MenuOp } from './entries.js';
import type { Advantage, SheetPage, UiState, View } from './ui-state.js';

/** Reaction prompt lifetime cap (design: priority prompt, 10 s). */
export const REACTION_TIMEOUT_MS = 10_000;
/** Result panel auto-close (design M06: timeout 8 s). */
export const RESULT_TIMEOUT_MS = 8_000;

const CELL_SIZES: readonly AppSettings['mapCellPx'][] = [6, 8, 12];
const ADVANTAGE_CYCLE: readonly Advantage[] = ['normal', 'advantage', 'disadvantage'];

export type HudInput =
  | { t: 'tap' }
  | { t: 'double' }
  | { t: 'up' }
  | { t: 'down' }
  /** Contextual-menu item (`menuItemClickEvent.itemID`). */
  | { t: 'menu'; id: number }
  | { t: 'tick' }
  /** App store changed (`prev` = previous state). */
  | { t: 'state'; prev: AppState }
  /** Acknowledgement of the last invoke. */
  | { t: 'invoked'; ok: boolean; error?: string };

export type HudEffect =
  | { t: 'invoke'; tool: string; input: Record<string, unknown> }
  | { t: 'exit' }
  | { t: 'settings'; patch: Partial<AppSettings> }
  | { t: 'reconnect' }
  | { t: 'clearReaction' };

export interface ReduceContext {
  app: AppState;
  now: number;
  strings: HudStrings;
}

export interface ReduceResult {
  ui: UiState;
  effects: HudEffect[];
}

/** Menu item ids (non-zero, unique) — index in {@link MENU_OPS} + 1. */
export function menuIdOf(op: MenuOp): number {
  return MENU_OPS.indexOf(op) + 1;
}

function opOfMenuId(id: number): MenuOp | undefined {
  return MENU_OPS[id - 1];
}

const PARENT: Readonly<Partial<Record<View, View>>> = {
  actions: 'root',
  spells: 'actions',
  items: 'actions',
  options: 'actions',
  slot: 'spells',
  result: 'root',
};

function go(ui: UiState, view: View, patch: Partial<UiState> = {}): UiState {
  return { ...ui, view, cursor: 0, ...patch };
}

/**
 * Ends the paired actor's turn (`end-turn` tool, projector-checked). Outside the
 * player's turn the request is refused locally with visual feedback (no invoke).
 */
function endTurn(ui: UiState, ctx: ReduceContext): ReduceResult {
  const { app, strings: str, now } = ctx;
  const ch = app.character;
  if (!ch || !isMyTurn(ch, app.combat)) {
    return {
      ui: go(ui, 'result', {
        pending: null,
        result: {
          title: str.endTurn,
          shownAt: now,
          ack: { error: str.errors['wrong-turn'] },
          payload: null,
        },
      }),
      effects: [],
    };
  }
  return {
    ui: showResult(ui, str.endTurn, now),
    effects: [{ t: 'invoke', tool: 'end-turn', input: { actor_id: ch.actorId } }],
  };
}

function applyOp(op: MenuOp, ui: UiState, ctx: ReduceContext): ReduceResult {
  const app = ctx.app;
  const s = app.settings;
  const idx = CELL_SIZES.indexOf(s.mapCellPx);
  switch (op) {
    case 'nextPage':
      return { ui: { ...ui, sheetPage: ((ui.sheetPage + 1) % 4) as SheetPage }, effects: [] };
    case 'zoomIn': {
      const next = CELL_SIZES[Math.min(idx + 1, CELL_SIZES.length - 1)] ?? s.mapCellPx;
      return {
        ui,
        effects: next === s.mapCellPx ? [] : [{ t: 'settings', patch: { mapCellPx: next } }],
      };
    }
    case 'zoomOut': {
      const next = CELL_SIZES[Math.max(idx - 1, 0)] ?? s.mapCellPx;
      return {
        ui,
        effects: next === s.mapCellPx ? [] : [{ t: 'settings', patch: { mapCellPx: next } }],
      };
    }
    case 'follow':
      return { ui, effects: [{ t: 'settings', patch: { followToken: !s.followToken } }] };
    case 'advantage': {
      const next = ADVANTAGE_CYCLE[(ADVANTAGE_CYCLE.indexOf(ui.advantage) + 1) % 3] ?? 'normal';
      return { ui: { ...ui, advantage: next }, effects: [] };
    }
    case 'endTurn':
      return endTurn(ui, ctx);
    case 'language':
      return { ui, effects: [{ t: 'settings', patch: { locale: nextLocaleSetting(s.locale) } }] };
    case 'reconnect':
      return { ui, effects: [{ t: 'reconnect' }] };
  }
}

function showResult(ui: UiState, title: string, now: number): UiState {
  return go(ui, 'result', {
    pending: null,
    result: { title, shownAt: now, ack: 'pending', payload: null },
  });
}

function confirm(intent: Intent, ui: UiState, ctx: ReduceContext): ReduceResult {
  const actorId = ctx.app.character?.actorId;
  switch (intent.k) {
    case 'open':
      return { ui: go(ui, intent.view), effects: [] };
    case 'weapon':
      return {
        ui: go(ui, 'target', {
          pending: { kind: 'weapon', itemId: intent.itemId, name: intent.name },
        }),
        effects: [],
      };
    case 'spell': {
      const pending = {
        kind: 'spell' as const,
        spellId: intent.spellId,
        name: intent.name,
        level: intent.level,
        slot: intent.level === 0 ? 0 : null,
      };
      return { ui: go(ui, intent.level === 0 ? 'target' : 'slot', { pending }), effects: [] };
    }
    case 'slot':
      return ui.pending?.kind === 'spell'
        ? { ui: go(ui, 'target', { pending: { ...ui.pending, slot: intent.level } }), effects: [] }
        : { ui, effects: [] };
    case 'target': {
      const p = ui.pending;
      if (!p || !actorId) return { ui, effects: [] };
      const targets = intent.tokenId ? [intent.tokenId] : [];
      const title = intent.tokenId ? `${p.name} ${GLYPH.arrow} ${intent.name}` : p.name;
      const effect: HudEffect =
        p.kind === 'weapon'
          ? {
              t: 'invoke',
              tool: 'weapon-attack',
              input: {
                actor_id: actorId,
                item_id: p.itemId,
                targets,
                advantage: ui.advantage,
                count: 1,
              },
            }
          : {
              t: 'invoke',
              tool: 'cast-spell',
              input: {
                actor_id: actorId,
                spell_id: p.spellId,
                slot_level: p.slot ?? p.level,
                targets,
              },
            };
      return { ui: showResult(ui, title, ctx.now), effects: [effect] };
    }
    case 'item':
      if (!actorId) return { ui, effects: [] };
      return {
        ui: showResult(ui, intent.name, ctx.now),
        effects: [
          {
            t: 'invoke',
            tool: 'use-item',
            input: { actor_id: actorId, item_id: intent.itemId, targets: [] },
          },
        ],
      };
    case 'op': {
      const r = applyOp(intent.op, ui, ctx);
      return { ui: r.ui, effects: r.effects };
    }
    case 'react':
      return {
        ui: { ...showResult(ui, intent.name, ctx.now), reactionDeadline: null },
        effects: [{ t: 'clearReaction' }, { t: 'invoke', tool: intent.tool, input: intent.input }],
      };
    case 'ignore':
      return { ui: go(ui, 'root', { reactionDeadline: null }), effects: [{ t: 'clearReaction' }] };
  }
}

function back(ui: UiState): UiState {
  if (ui.view === 'target') {
    const p = ui.pending;
    if (p?.kind === 'spell') return go(ui, p.level === 0 ? 'spells' : 'slot');
    return go(ui, 'actions', { pending: null });
  }
  return go(ui, PARENT[ui.view] ?? 'root');
}

function onState(ui: UiState, prev: AppState, ctx: ReduceContext): ReduceResult {
  const app = ctx.app;
  let next = ui;
  if (app.settings.autoCombatPage) {
    if (!prev.combat && app.combat) next = { ...next, sheetPage: 1 };
    else if (prev.combat && !app.combat) next = { ...next, sheetPage: 0 };
  }
  if (app.reaction && app.reaction !== prev.reaction && next.view !== 'reaction') {
    const deadline = Math.min(app.reaction.expiresAt, ctx.now + REACTION_TIMEOUT_MS);
    next = go(next, 'reaction', { reactionDeadline: deadline });
  } else if (!app.reaction && next.view === 'reaction') {
    next = go(next, 'root', { reactionDeadline: null });
  }
  if (
    app.lastResult &&
    app.lastResult !== prev.lastResult &&
    next.view === 'result' &&
    next.result
  ) {
    next = { ...next, result: { ...next.result, payload: app.lastResult, shownAt: ctx.now } };
  }
  return { ui: next, effects: [] };
}

function onTick(ui: UiState, ctx: ReduceContext): ReduceResult {
  if (ui.view === 'reaction' && ui.reactionDeadline !== null && ctx.now >= ui.reactionDeadline) {
    return { ui: go(ui, 'root', { reactionDeadline: null }), effects: [{ t: 'clearReaction' }] };
  }
  if (ui.view === 'result' && ui.result && ctx.now - ui.result.shownAt >= RESULT_TIMEOUT_MS) {
    return { ui: go(ui, 'root', { result: null }), effects: [] };
  }
  return { ui, effects: [] };
}

/** Gestures while M09/M10/M11 are shown. */
function reduceStatusScreen(ui: UiState, input: HudInput, offline: boolean): ReduceResult {
  if (input.t === 'double') return { ui, effects: [{ t: 'exit' }] };
  if (offline && input.t === 'tap') return { ui, effects: [{ t: 'reconnect' }] };
  if (offline && input.t === 'menu' && opOfMenuId(input.id) === 'reconnect') {
    return { ui, effects: [{ t: 'reconnect' }] };
  }
  return { ui, effects: [] };
}

/**
 * Applies one input to the UI state.
 *
 * @param ui - Current UI state.
 * @param input - Gesture, menu click, tick, store change or invoke acknowledgement.
 * @param ctx - Current app state, clock and strings (entries are locale-labelled).
 * @returns The next UI state and the side effects to run (in order).
 */
export function reduce(ui: UiState, input: HudInput, ctx: ReduceContext): ReduceResult {
  if (input.t === 'state') return onState(ui, input.prev, ctx);
  if (input.t === 'tick') return onTick(ui, ctx);
  if (input.t === 'invoked') {
    if (!ui.result) return { ui, effects: [] };
    const ack = input.ok ? ('ok' as const) : { error: input.error ?? '' };
    return { ui: { ...ui, result: { ...ui.result, ack, shownAt: ctx.now } }, effects: [] };
  }
  const screen = screenOf(ctx.app);
  if (screen !== 'hud') return reduceStatusScreen(ui, input, screen === 'offline');
  if (input.t === 'menu') {
    const op = opOfMenuId(input.id);
    return op ? applyOp(op, ui, ctx) : { ui, effects: [] };
  }

  switch (ui.view) {
    case 'root':
      if (input.t === 'tap') return { ui: go(ui, 'actions'), effects: [] };
      if (input.t === 'double') return { ui, effects: [{ t: 'exit' }] };
      return {
        ui: { ...ui, scroll: Math.max(0, ui.scroll + (input.t === 'down' ? 1 : -1)) },
        effects: [],
      };
    case 'result':
      if (input.t === 'tap') return { ui: go(ui, 'actions', { result: null }), effects: [] };
      if (input.t === 'double') return { ui: go(ui, 'root', { result: null }), effects: [] };
      return { ui, effects: [] };
    default: {
      const entries = buildEntries(ctx.app, ui, ctx.strings);
      if (input.t === 'up' || input.t === 'down') {
        const max = Math.max(0, entries.length - 1);
        const cursor = Math.min(max, Math.max(0, ui.cursor + (input.t === 'down' ? 1 : -1)));
        return { ui: { ...ui, cursor }, effects: [] };
      }
      if (input.t === 'double') {
        if (ui.view === 'reaction') return confirm({ k: 'ignore' }, ui, ctx);
        return { ui: back(ui), effects: [] };
      }
      const entry = entries[Math.min(ui.cursor, entries.length - 1)];
      return entry ? confirm(entry.intent, ui, ctx) : { ui, effects: [] };
    }
  }
}
