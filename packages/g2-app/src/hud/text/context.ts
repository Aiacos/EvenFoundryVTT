/**
 * Column C — context views (root explore/combat, lists, result, reaction, offline).
 * Pure: `(app state, ui state, strings, now) → { head, body, foot }` line arrays.
 *
 * @see docs/design/g2-thirds-layout.md M01–M07, M11
 */
import type { CombatSnapshot, LogEventResult } from '@evf/shared-protocol';
import type { AppState } from '../../state/app-store.js';
import type { HudStrings } from '../i18n.js';
import { buildEntries, CURSOR_PX } from '../input/entries.js';
import { REACTION_TIMEOUT_MS } from '../input/state-machine.js';
import type { UiState } from '../input/ui-state.js';
import { GLYPH, gauge, row, windowAround } from './measure.js';
import { economyLine, isMyTurn, slotsLine, turnBudget } from './sheet.js';

/** Column C body capacity (`TEXT.cBody.lines`). */
const CONTEXT_BODY_LINES = 7;

export interface ContextView {
  head: string[];
  body: string[];
  foot: string;
}

function resultLabel(kind: LogEventResult['kind'], s: HudStrings): string {
  switch (kind) {
    case 'hit':
      return s.outcomes.hit;
    case 'miss':
      return s.outcomes.miss;
    case 'pass':
      return s.outcomes.save_success;
    case 'fail':
      return s.outcomes.save_fail;
    case 'concentrating':
      return s.concentration;
  }
}

function logLines(app: AppState, s: HudStrings, max: number): string[] {
  const events = app.log?.events ?? [];
  if (events.length === 0) return [` ${s.emptyLog}`];
  return events.slice(-max).map((e) => {
    const r = e.result;
    const res = r ? ` ${resultLabel(r.kind, s)}${r.value === undefined ? '' : ` ${r.value}`}` : '';
    return ` ${e.actorName}: ${e.description}${res}`;
  });
}

/** Clamps a scroll offset so the window never scrolls past the last line. */
function scrolled(lines: string[], scroll: number): string[] {
  const max = Math.max(0, lines.length - CONTEXT_BODY_LINES);
  const start = Math.min(scroll, max);
  return lines.slice(start, start + CONTEXT_BODY_LINES);
}

function rootExplore(app: AppState, ui: UiState, s: HudStrings): ContextView {
  const allies = (app.map?.tokens ?? [])
    .filter((t) => t.kind === 'ally')
    .map((t) =>
      row([
        [` ${t.name}`, 112],
        [gauge(t.hp, 3), 74],
      ]),
    );
  const body = [s.log, ...logLines(app, s, 12), ...(allies.length > 0 ? [s.party, ...allies] : [])];
  return {
    head: [`${s.scene} ${app.map?.name ?? s.noScene}`, s.exploration],
    body: scrolled(body, ui.scroll),
    foot: s.footer.root,
  };
}

function rootCombat(
  app: AppState,
  combat: CombatSnapshot,
  ui: UiState,
  s: HudStrings,
): ContextView {
  const current = combat.combatants.find((c) => c.isCurrentTurn);
  const combatants = combat.combatants.map((c) =>
    row([
      [c.isCurrentTurn ? GLYPH.cursor : '', CURSOR_PX],
      [c.name, 72],
      [c.initiative === null ? GLYPH.dash : String(Math.round(c.initiative)), 28],
      [c.hp !== null && c.maxHp !== null ? `${c.hp}/${c.maxHp}` : '', 64],
    ]),
  );
  return {
    head: [
      row([
        [s.initiative, 130],
        [`R${combat.round}`, 56],
      ]),
      isMyTurn(app.character, combat)
        ? `${GLYPH.turn} ${s.yourTurn}`
        : `${s.turnOf}: ${current?.name ?? GLYPH.dash}`,
    ],
    body: scrolled([...combatants, s.recent, ...logLines(app, s, 3)], ui.scroll),
    foot: s.footer.root,
  };
}

function listHead(app: AppState, ui: UiState, s: HudStrings): string[] {
  const p = ui.pending;
  switch (ui.view) {
    case 'actions':
      return [`${s.actions} ${GLYPH.dot} ${app.character?.name ?? ''}`, s.advantage[ui.advantage]];
    case 'spells':
      return [s.spells, (app.character && slotsLine(app.character, s)) ?? ''];
    case 'slot':
      return [`${s.slotTitle} ${GLYPH.dot} ${p?.name ?? ''}`, ''];
    case 'target':
      return [
        `${s.target} ${GLYPH.dot} ${p?.name ?? ''}`,
        p?.kind === 'spell' ? `${s.slotTitle} ${p.slot ?? p.level}°` : s.advantage[ui.advantage],
      ];
    case 'items':
      return [s.items, ''];
    default:
      return [s.options, ''];
  }
}

function listBody(app: AppState, ui: UiState, s: HudStrings, capacity: number): string[] {
  const entries = buildEntries(app, ui, s);
  if (entries.length === 0) return [ui.view === 'slot' ? s.noSlots : GLYPH.dash];
  const indexed = entries.map((e, i) => ({ e, i }));
  return windowAround(indexed, ui.cursor, capacity).map(({ e, i }) =>
    row([[i === ui.cursor ? GLYPH.cursor : '', CURSOR_PX], ...e.cells]),
  );
}

function resultView(app: AppState, ui: UiState, s: HudStrings): ContextView {
  const r = ui.result;
  const body: string[] = [];
  if (r?.payload) {
    const p = r.payload;
    if (p.d20 !== null) body.push(`d20 ${p.d20}`);
    body.push(s.outcomes[p.outcome]);
    if (p.damage) body.push(`${s.damage} ${p.damage}`);
    if (p.errorKind) body.push(s.errors[p.errorKind]);
    else if (p.status !== 'success') body.push(s.failed);
  } else if (r && typeof r.ack === 'object') {
    body.push(s.failed, r.ack.error);
  } else {
    body.push(r?.ack === 'ok' ? s.done : s.pending);
  }
  // M06: what is left of the turn after this action.
  const economy = turnBudget(app)?.economy;
  if (economy) body.push('', economyLine(economy, s));
  return { head: [s.result, r?.title ?? ''], body, foot: s.footer.result };
}

function reactionView(app: AppState, ui: UiState, s: HudStrings, now: number): ContextView {
  const remaining = Math.max(0, (ui.reactionDeadline ?? now) - now);
  const seconds = Math.ceil(remaining / 1000);
  const body = listBody(app, ui, s, CONTEXT_BODY_LINES - 2);
  body.push('', `${s.expiresIn} ${gauge(remaining / REACTION_TIMEOUT_MS, 3)} ${seconds} s`);
  return {
    head: [
      `${GLYPH.turn} ${s.reactionTitle}`,
      `${s.reactionTrigger}: ${app.reaction?.sourceName ?? ''}`,
    ],
    body,
    foot: s.footer.reaction,
  };
}

/** M11 column C (connection lost; sheet and map frozen). */
export function offlineView(app: AppState, s: HudStrings, now: number): ContextView {
  const c = app.connection;
  const body: string[] = [];
  if (c.retryInMs !== undefined) {
    body.push(s.retryIn(Math.ceil(c.retryInMs / 1000), c.attempt ?? 1));
  }
  if (c.lastSyncAt !== undefined) {
    body.push(s.dataAge(Math.max(0, Math.floor((now - c.lastSyncAt) / 60_000))));
  }
  body.push(s.frozen);
  return {
    head: [`${GLYPH.turn} ${s.offlineTitle}`, s.offlineCauses[c.cause ?? 'network']],
    body,
    foot: s.footer.offline,
  };
}

/**
 * Renders column C for the online HUD.
 *
 * @param app - App state (read-only).
 * @param ui - HUD UI state.
 * @param s - Locale strings.
 * @param now - Epoch ms (reaction countdown).
 */
export function contextView(app: AppState, ui: UiState, s: HudStrings, now: number): ContextView {
  switch (ui.view) {
    case 'root':
      return app.combat ? rootCombat(app, app.combat, ui, s) : rootExplore(app, ui, s);
    case 'result':
      return resultView(app, ui, s);
    case 'reaction':
      return reactionView(app, ui, s, now);
    default:
      return {
        head: listHead(app, ui, s),
        body: listBody(app, ui, s, CONTEXT_BODY_LINES),
        foot: ui.view === 'target' ? s.footer.target : s.footer.list,
      };
  }
}
