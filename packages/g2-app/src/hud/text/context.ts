/**
 * Zone E — context views (docs/design/g2-sheet-ux.html S1–S9, S12): the only
 * interactive zone, drawn with firmware text for instant, flicker-free updates.
 * Pure: `(app state, ui state, strings, now) → { title, right, body, hint }`; the view
 * composer fits them into the head (1 line), body (3 lines) and foot (1 line) regions.
 */
import { getTextWidth } from '@evenrealities/pretext';
import type { CombatSnapshot, LogEventResult, RollRequestPayload } from '@evf/shared-protocol';
import type { AppState } from '../../state/app-store.js';
import type { HudStrings } from '../i18n.js';
import { buildEntries, type Entry, slotPips } from '../input/entries.js';
import type { UiState } from '../input/ui-state.js';
import { signed } from '../model.js';
import { GLYPH, gauge, spread, windowAround } from './measure.js';

/** Body lines of zone E (`TEXT.ctxBody.lines`). */
const CONTEXT_BODY_LINES = 3;

export interface ContextView {
  title: string;
  /** Right-aligned head info (round, slots, countdown…). */
  right: string;
  /** Body lines, already laid out for `budgetPx` (≤ {@link CONTEXT_BODY_LINES}). */
  body: string[];
  hint: string;
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

/** Newest log events first. */
function logLines(app: AppState, s: HudStrings): string[] {
  const events = app.log?.events ?? [];
  if (events.length === 0) return [s.emptyLog];
  return events
    .slice(-12)
    .reverse()
    .map((e) => {
      const r = e.result;
      const res = r
        ? ` ${resultLabel(r.kind, s)}${r.value === undefined ? '' : ` ${r.value}`}`
        : '';
      return `${e.actorName}: ${e.description}${res}`;
    });
}

/** Clamps a scroll offset so the window never scrolls past the last line. */
function scrolled(lines: string[], scroll: number): string[] {
  const max = Math.max(0, lines.length - CONTEXT_BODY_LINES);
  const start = Math.min(scroll, max);
  return lines.slice(start, start + CONTEXT_BODY_LINES);
}

/** Cursor cell: `▶ ` when selected, spaces of the same width otherwise. */
const CURSOR_ON = `${GLYPH.cursor} `;
const CURSOR_OFF = ' '.repeat(Math.round(getTextWidth(CURSOR_ON) / getTextWidth(' ')));

/** One list line: cursor cell + left label + right-aligned value. */
function entryLine(e: Pick<Entry, 'left' | 'right'>, selected: boolean, budget: number): string {
  const cursor = selected ? CURSOR_ON : CURSOR_OFF;
  return cursor + spread(e.left, e.right, budget - getTextWidth(cursor));
}

function listBody(
  entries: readonly Entry[],
  cursor: number,
  capacity: number,
  budget: number,
): string[] {
  const indexed = entries.map((e, i) => ({ e, i }));
  return windowAround(indexed, cursor, capacity).map(({ e, i }) =>
    entryLine(e, i === cursor, budget),
  );
}

function rootExplore(app: AppState, ui: UiState, s: HudStrings, budget: number): ContextView {
  const party = (app.map?.tokens ?? [])
    .filter((t) => t.kind === 'ally')
    .map((t) => spread(t.name, gauge(t.hp, 5), budget));
  return {
    title: app.map?.name ?? s.noScene,
    right: s.exploration,
    body: scrolled([...logLines(app, s), ...party], ui.scroll),
    hint: s.footer.root,
  };
}

function rootCombat(
  app: AppState,
  combat: CombatSnapshot,
  ui: UiState,
  s: HudStrings,
  budget: number,
): ContextView {
  const tokens = app.map?.tokens ?? [];
  const rows = combat.combatants.map((c) => {
    const health =
      c.hp !== null && c.maxHp !== null
        ? `${c.hp}/${c.maxHp}`
        : gauge(tokens.find((t) => t.name === c.name)?.hp, 4);
    return spread(`${c.isCurrentTurn ? `${GLYPH.turn} ` : ''}${c.name}`, health, budget);
  });
  return {
    title: s.initiative,
    right: s.round(combat.round),
    body: scrolled(rows, ui.scroll),
    hint: s.footer.combat,
  };
}

/** 0 PF root: death saves reminder (the sheet shows the circles). */
function rootDown(app: AppState, s: HudStrings): ContextView {
  const d = app.character?.death ?? { success: 0, failure: 0 };
  return {
    title: s.downTitle,
    right: app.combat ? s.round(app.combat.round) : '',
    body: [s.downRoll, s.downTally(d.success, d.failure)],
    hint: app.combat ? s.footer.combat : s.footer.root,
  };
}

/**
 * Remaining spell slots per level for the spells title: `■■■□ ■■□ ■□` (design S5), or
 * `3/4 2/3 1/2` when the pips do not fit next to the title.
 */
function slotsSummary(app: AppState, title: string, budget: number): string {
  const slots = (app.character?.spells.slots ?? []).filter(
    (sl) => sl.level >= 1 && sl.level <= 9 && sl.max > 0,
  );
  const pips = slots.map((sl) => slotPips(sl.value, sl.max)).join(' ');
  if (getTextWidth(`${title} ${pips}`) <= budget) return pips;
  return slots.map((sl) => `${sl.value}/${sl.max}`).join(' ');
}

function listHead(
  app: AppState,
  ui: UiState,
  s: HudStrings,
  budget: number,
): { title: string; right: string } {
  const p = ui.pending;
  switch (ui.view) {
    case 'actions':
      return {
        title: s.actions,
        right: ui.advantage === 'normal' ? (app.character?.name ?? '') : s.advantage[ui.advantage],
      };
    case 'spells':
      return { title: s.spells, right: slotsSummary(app, s.spells, budget) };
    case 'slot':
      return { title: s.slotTitle, right: p?.name ?? '' };
    case 'target': {
      if (p?.kind === 'spell') return { title: s.target, right: `${p.name} ${p.slot ?? p.level}°` };
      const weapon = app.character?.inventory.find(
        (i) => p?.kind === 'weapon' && i.id === p.itemId,
      );
      return { title: s.target, right: `${p?.name ?? ''} ${weapon?.toHit ?? ''}`.trim() };
    }
    case 'items':
      return { title: s.items, right: '' };
    default:
      return { title: s.options, right: '' };
  }
}

function resultView(ui: UiState, s: HudStrings): ContextView {
  const r = ui.result;
  const body: string[] = [];
  if (r?.payload) {
    const p = r.payload;
    if (p.d20 !== null) body.push(`d20 ${p.d20}`);
    body.push(s.outcomes[p.outcome]);
    if (p.errorKind) body.push(s.errors[p.errorKind]);
    else if (p.status !== 'success') body.push(s.failed);
    else if (p.damage) body.push(`${s.damage} ${p.damage}`);
  } else if (r && typeof r.ack === 'object') {
    body.push(s.failed, r.ack.error);
  } else {
    body.push(r?.ack === 'ok' ? s.done : s.pending);
  }
  return { title: s.result, right: r?.title ?? '', body, hint: s.footer.result };
}

function reactionView(
  app: AppState,
  ui: UiState,
  s: HudStrings,
  now: number,
  budget: number,
): ContextView {
  const seconds = Math.ceil(Math.max(0, (ui.reactionDeadline ?? now) - now) / 1000);
  const entries = buildEntries(app, ui, s);
  return {
    title: s.reactionTitle,
    right: s.expiresIn(seconds),
    body: [
      ...listBody(entries, ui.cursor, CONTEXT_BODY_LINES - 1, budget),
      s.reactionTrigger(app.reaction?.sourceName ?? GLYPH.dash),
    ],
    hint: s.footer.reaction,
  };
}

/** Label and modifier of a GM roll request for the paired character. */
function requestLine(req: RollRequestPayload, app: AppState, s: HudStrings): [string, string] {
  const ch = app.character;
  if (req.kind === 'skill' && req.skill) {
    return [s.requestSkill(s.skills[req.skill]), ch ? signed(ch.skills[req.skill].total) : ''];
  }
  const ability = req.ability ?? 'str';
  const a = ch?.abilities[ability];
  if (req.kind === 'save') return [s.requestSave(s.abilities[ability]), a ? signed(a.save) : ''];
  return [s.requestCheck(s.abilities[ability]), a ? signed(a.mod) : ''];
}

function requestView(app: AppState, ui: UiState, s: HudStrings, budget: number): ContextView {
  const req = app.rollRequest;
  const lines: string[] = [];
  if (req) {
    const [label, value] = requestLine(req, app, s);
    lines.push(spread(label, value, budget));
    lines.push(
      req.dc === undefined ? s.requestRoll : `${s.requestDc(req.dc)} ${GLYPH.dot} ${s.requestRoll}`,
    );
  }
  return {
    title: s.requestTitle,
    right: s.requestFrom,
    body: [...lines, ...listBody(buildEntries(app, ui, s), ui.cursor, 1, budget)],
    hint: s.footer.request,
  };
}

/** S12 context (connection lost; sheet, map and portrait frozen and dimmed). */
export function offlineView(app: AppState, s: HudStrings, now: number): ContextView {
  const c = app.connection;
  const body = [s.offlineCauses[c.cause ?? 'network']];
  if (c.retryInMs !== undefined)
    body.push(s.retryIn(Math.ceil(c.retryInMs / 1000), c.attempt ?? 1));
  body.push(s.frozen);
  return {
    title: s.offlineTitle,
    right:
      c.lastSyncAt === undefined
        ? ''
        : s.dataAge(Math.max(0, Math.floor((now - c.lastSyncAt) / 60_000))),
    body,
    hint: s.footer.offline,
  };
}

/**
 * Renders zone E for the online HUD.
 *
 * @param budget - Pixel budget of one body line (`TEXT.ctxBody.budgetPx`).
 */
export function contextView(
  app: AppState,
  ui: UiState,
  s: HudStrings,
  now: number,
  budget: number,
): ContextView {
  switch (ui.view) {
    case 'root':
      if (app.character && app.character.hp <= 0) return rootDown(app, s);
      return app.combat
        ? rootCombat(app, app.combat, ui, s, budget)
        : rootExplore(app, ui, s, budget);
    case 'result':
      return resultView(ui, s);
    case 'reaction':
      return reactionView(app, ui, s, now, budget);
    case 'request':
      return requestView(app, ui, s, budget);
    default: {
      const entries = buildEntries(app, ui, s);
      return {
        ...listHead(app, ui, s, budget),
        body:
          entries.length === 0
            ? [ui.view === 'slot' ? s.noSlots : GLYPH.dash]
            : listBody(entries, ui.cursor, CONTEXT_BODY_LINES, budget),
        hint: ui.view === 'target' ? s.footer.target : s.footer.list,
      };
    }
  }
}
