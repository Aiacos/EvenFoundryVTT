/**
 * Selectable entries of the context zone (E) lists — shared by the renderer
 * (`text/context.ts`) and the input reducer (`state-machine.ts`) so the cursor
 * index always maps to the entry the player sees.
 *
 * Each entry is a `left` label and a right-aligned `right` value — attacks carry bonus
 * and damage like the paper «Attacchi» table, spells their level and range (S3, S5).
 *
 * Tool names/inputs match the GM projector's `dispatchTool` registry
 * (`packages/foundry-module/src/write-path/handlers/index.ts`: kebab-case ids) and
 * the Zod input schemas in `@evf/shared-protocol` tools.
 *
 * @see docs/design/g2-sheet-ux.html §Interazione (S3–S5, S7, S8)
 */
import type { AppState } from '../../state/app-store.js';
import type { HudStrings } from '../i18n.js';
import { isMyTurn } from '../model.js';
import { GLYPH } from '../text/measure.js';
import type { Pending, UiState } from './ui-state.js';

/** Contextual-menu / options operations (all reachable by tap via "Opzioni…"). */
export type MenuOp =
  | 'nextPage'
  | 'zoomIn'
  | 'zoomOut'
  | 'follow'
  | 'advantage'
  | 'endTurn'
  | 'language'
  | 'reconnect';

/**
 * Contextual-menu order (design §Modello di input). The menu is static per page, so
 * `endTurn` is always listed there and refused locally when it is not the player's
 * turn; the tap-reachable lists show it only during the player's turn.
 */
export const MENU_OPS: readonly MenuOp[] = [
  'nextPage',
  'zoomIn',
  'zoomOut',
  'follow',
  'advantage',
  'endTurn',
  'language',
  'reconnect',
];

/** What confirming an entry does. */
export type Intent =
  | { k: 'weapon'; itemId: string; name: string }
  | { k: 'open'; view: 'spells' | 'items' | 'options' }
  | { k: 'spell'; spellId: string; name: string; level: number }
  | { k: 'slot'; level: number }
  | { k: 'target'; tokenId: string | null; name: string }
  | { k: 'item'; itemId: string; name: string }
  | { k: 'op'; op: MenuOp }
  | { k: 'react'; tool: string; input: Record<string, unknown>; name: string }
  | { k: 'ignore' }
  | { k: 'dismissRequest' };

export interface Entry {
  left: string;
  /** Right-aligned value (bonus · damage, level · range, distance); '' for none. */
  right: string;
  intent: Intent;
}

function label(text: string, intent: Intent): Entry {
  return { left: text, right: '', intent };
}

/** `+6 · 1d8+3` (either part may be missing). */
function attackSummary(toHit: string | undefined, damage: string | undefined): string {
  return [toHit, damage].filter((p) => p !== undefined && p !== '').join(` ${GLYPH.dot} `);
}

/** Spell-slot pips `■■■□` (value filled of max, capped at 6 each). */
export function slotPips(value: number, max: number): string {
  return (
    GLYPH.barFull.repeat(Math.min(Math.max(0, value), 6)) +
    GLYPH.barEmpty.repeat(Math.min(Math.max(0, max - value), 6))
  );
}

/** Distance in feet (5 ft per cell, Chebyshev) between two token top-left cells. */
function distanceFt(ax: number, ay: number, bx: number, by: number): number {
  return Math.round(Math.max(Math.abs(ax - bx), Math.abs(ay - by))) * 5;
}

function actionEntries(app: AppState, s: HudStrings): Entry[] {
  const ch = app.character;
  const out: Entry[] = [];
  if (ch) {
    for (const it of ch.inventory) {
      if (it.type !== 'weapon') continue;
      out.push({
        left: it.name,
        right: attackSummary(it.toHit, it.damage),
        intent: { k: 'weapon', itemId: it.id, name: it.name },
      });
    }
    if (ch.spells.spells.length > 0) {
      out.push(label(s.spellsMenu, { k: 'open', view: 'spells' }));
    }
    if (ch.inventory.some((i) => i.type === 'consumable')) {
      out.push(label(s.itemsMenu, { k: 'open', view: 'items' }));
    }
    if (isMyTurn(ch, app.combat)) {
      out.push(label(s.endTurn, { k: 'op', op: 'endTurn' }));
    }
  }
  out.push(label(s.optionsMenu, { k: 'open', view: 'options' }));
  return out;
}

function spellEntries(app: AppState, s: HudStrings): Entry[] {
  const spells = app.character?.spells.spells ?? [];
  return spells
    .filter((sp) => sp.level === 0 || sp.prepared || sp.alwaysPrepared)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((sp) => {
      // Cantrips show only «trucchetto» (design S5); leveled spells level · range.
      const level = sp.level === 0 ? s.cantrip : `${sp.level}°`;
      const range =
        sp.level > 0 && sp.range !== '' && sp.range !== '--' ? ` ${GLYPH.dot} ${sp.range}` : '';
      return {
        left: sp.concentration ? `${sp.name}  ${s.concentration}` : sp.name,
        right: `${level}${range}`,
        intent: { k: 'spell', spellId: sp.id, name: sp.name, level: sp.level },
      };
    });
}

function slotEntries(app: AppState, pending: Pending | null): Entry[] {
  if (pending?.kind !== 'spell') return [];
  const slots = app.character?.spells.slots ?? [];
  return (
    slots
      // Level 10 = pact magic: `cast-spell` accepts 0–9 only (CastSpellInputSchema).
      .filter((sl) => sl.level >= pending.level && sl.level <= 9 && sl.value > 0)
      .map((sl) => ({
        left: `${sl.level}°`,
        right: slotPips(sl.value, sl.max),
        intent: { k: 'slot', level: sl.level },
      }))
  );
}

function targetEntries(app: AppState, s: HudStrings): Entry[] {
  const map = app.map;
  const noTarget = label(s.noTarget, { k: 'target', tokenId: null, name: '' });
  if (!map) return [noTarget];
  const self = map.tokens.find((t) => t.id === map.selfTokenId);
  const order = { enemy: 0, neutral: 1, ally: 2, self: 3 } as const;
  const tokens = map.tokens
    .filter((t) => t.id !== map.selfTokenId)
    .map((t) => ({ t, ft: self ? distanceFt(self.x, self.y, t.x, t.y) : null }))
    .sort((a, b) => order[a.t.kind] - order[b.t.kind] || (a.ft ?? 0) - (b.ft ?? 0));
  return [
    ...tokens.map(
      ({ t, ft }): Entry => ({
        left: t.name,
        right: ft === null ? '' : `${ft} ft`,
        intent: { k: 'target', tokenId: t.id, name: t.name },
      }),
    ),
    noTarget,
  ];
}

function itemEntries(app: AppState): Entry[] {
  return (app.character?.inventory ?? [])
    .filter((i) => i.type === 'consumable')
    .map((i) => ({
      left: i.name,
      right: i.quantity && i.quantity > 1 ? `×${i.quantity}` : '',
      intent: { k: 'item', itemId: i.id, name: i.name },
    }));
}

/** Options-list label of an operation, including its current value. */
function opLabel(op: MenuOp, app: AppState, ui: UiState, s: HudStrings): string {
  switch (op) {
    case 'nextPage':
      return s.option.nextPage;
    case 'zoomIn':
      return s.option.zoom('+', app.settings.mapCellPx);
    case 'zoomOut':
      return s.option.zoom('-', app.settings.mapCellPx);
    case 'follow':
      return s.option.follow(app.settings.followToken);
    case 'advantage':
      return s.advantage[ui.advantage];
    case 'endTurn':
      return s.endTurn;
    case 'language':
      return s.option.language(app.settings.locale);
    case 'reconnect':
      return s.menu.reconnect;
  }
}

function optionEntries(app: AppState, ui: UiState, s: HudStrings): Entry[] {
  const myTurn = isMyTurn(app.character, app.combat);
  return MENU_OPS.filter((op) => op !== 'endTurn' || myTurn).map((op) =>
    label(opLabel(op, app, ui, s), { k: 'op', op }),
  );
}

function reactionEntries(app: AppState, s: HudStrings): Entry[] {
  const r = app.reaction;
  const ch = app.character;
  const ignore = label(s.ignore, { k: 'ignore' });
  if (!r || !ch) return [ignore];
  const source = app.map?.tokens.find((t) => t.name === r.sourceName)?.id ?? r.sourceName;
  const actor = ch.actorId;
  const react = (
    name: string,
    tool: string,
    input: Record<string, unknown>,
    right = '',
  ): Entry => ({
    left: name,
    right,
    intent: { k: 'react', tool, input, name },
  });
  switch (r.kind) {
    case 'opportunity-attack':
      return [
        ...ch.inventory
          .filter((i) => i.type === 'weapon')
          .map((w) =>
            react(
              `${s.opportunityAttack}: ${w.name}`,
              'opportunity-attack',
              { actor_id: actor, item_id: w.id, target_id: source },
              w.toHit ?? '',
            ),
          ),
        ignore,
      ];
    case 'shield':
      return [react(s.shield, 'cast-shield', { actor_id: actor, slot_level: 1 }), ignore];
    case 'counterspell':
      return [
        react(s.counterspell, 'cast-counterspell', {
          actor_id: actor,
          slot_level: 3,
          target_caster_id: source,
        }),
        ignore,
      ];
  }
}

/**
 * Returns the selectable entries of the current list view (empty for non-list views).
 */
export function buildEntries(app: AppState, ui: UiState, s: HudStrings): Entry[] {
  switch (ui.view) {
    case 'actions':
      return actionEntries(app, s);
    case 'spells':
      return spellEntries(app, s);
    case 'slot':
      return slotEntries(app, ui.pending);
    case 'target':
      return targetEntries(app, s);
    case 'items':
      return itemEntries(app);
    case 'options':
      return optionEntries(app, ui, s);
    case 'reaction':
      return reactionEntries(app, s);
    case 'request':
      return [label(s.requestOk, { k: 'dismissRequest' })];
    case 'root':
    case 'result':
      return [];
  }
}
