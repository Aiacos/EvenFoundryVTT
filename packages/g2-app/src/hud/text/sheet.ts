/**
 * Column A — character sheet, 4 pages (Principale, Combattimento, Abilità & TS,
 * Incantesimi/Inventario). Pure: `(snapshot, combat, page, strings) → lines`.
 *
 * Body = 7 content lines + 1 page-indicator line (8 lines, `TEXT.aBody.lines`).
 *
 * @see docs/design/g2-thirds-layout.md M01, M02, M05, M08
 */
import {
  type ABILITY_KEYS,
  type ActionEconomyPayload,
  type CharacterSnapshot,
  type CombatSnapshot,
  type MovementBudgetPayload,
  SKILL_KEYS,
} from '@evf/shared-protocol';
import type { AppState } from '../../state/app-store.js';
import type { HudStrings } from '../i18n.js';
import type { SheetPage } from '../input/ui-state.js';
import { GLYPH, gauge, row, signed } from './measure.js';

/** Content lines above the page indicator (`TEXT.aBody.lines` − 1). */
const SHEET_CONTENT_LINES = 7;

/** True when the paired actor holds the current combat turn. */
export function isMyTurn(ch: CharacterSnapshot | null, combat: CombatSnapshot | null): boolean {
  if (!ch || !combat) return false;
  return combat.combatants.some((c) => c.isCurrentTurn && c.actorId === ch.actorId);
}

/** Per-turn budget of the paired actor shown in combat (M02, M06). */
export interface TurnBudget {
  economy: ActionEconomyPayload | null;
  movement: MovementBudgetPayload | null;
}

/**
 * The paired actor's turn budget, or null outside combat. Payloads for another actor
 * (never expected: the projector routes by actorId) are ignored.
 */
export function turnBudget(app: AppState): TurnBudget | null {
  const ch = app.character;
  if (!ch || !app.combat) return null;
  const mine = <T extends { actorId: string }>(p: T | null): T | null =>
    p !== null && p.actorId === ch.actorId ? p : null;
  const economy = mine(app.actionEconomy);
  const movement = mine(app.movement);
  return economy || movement ? { economy, movement } : null;
}

/** `Az ●  Bon ●  Rea ●` — ● slot still free, ○ used this turn (3 × 62 px cells). */
export function economyLine(e: ActionEconomyPayload, s: HudStrings): string {
  const slot = (label: string, used: number): readonly [string, number] => [
    `${label} ${used > 0 ? GLYPH.empty : GLYPH.full}`,
    62,
  ];
  return row([
    slot(s.economy.action, e.actionsUsed),
    slot(s.economy.bonus, e.bonusActionsUsed),
    slot(s.economy.reaction, e.reactionsUsed),
  ]);
}

/** `Mov 25/30 ft` — remaining / walking speed (negative when over budget). */
export function movementLine(m: MovementBudgetPayload, s: HudStrings): string {
  return `${s.movement} ${m.remainingFeet}/${m.walkSpeed} ${s.ft}`;
}

function currentCombatantName(combat: CombatSnapshot): string {
  return combat.combatants.find((c) => c.isCurrentTurn)?.name ?? GLYPH.dash;
}

/** Two header lines: identity + situation (turn / exploration). */
export function sheetHeader(
  ch: CharacterSnapshot | null,
  combat: CombatSnapshot | null,
  s: HudStrings,
): string[] {
  if (!ch) return [GLYPH.dash, ''];
  const id = `${ch.name.toUpperCase()}  ${s.level} ${ch.level}`;
  if (combat) {
    const situation = isMyTurn(ch, combat)
      ? `${GLYPH.turn} ${s.yourTurn}  R${combat.round}`
      : `${s.turnOf}: ${currentCombatantName(combat)}`;
    return [id, situation];
  }
  return [id, `${s.exploration} ${GLYPH.dot} ${ch.world.modernRules ? 'PHB24' : 'PHB14'}`];
}

function hpLine(ch: CharacterSnapshot, s: HudStrings): string {
  const frac = ch.maxHp > 0 ? ch.hp / ch.maxHp : undefined;
  return row([
    [`${s.hp} ${ch.hp}/${ch.maxHp}`, 112],
    [gauge(frac, 3), 74],
  ]);
}

function acLine(ch: CharacterSnapshot, s: HudStrings): string {
  const temp = ch.tempHp > 0 ? `${s.temp} +${ch.tempHp}` : '';
  return row([
    [`${s.ac} ${ch.ac}`, 64],
    [temp, 120],
  ]);
}

function abilityLines(ch: CharacterSnapshot, s: HudStrings): string[] {
  const cell = (k: (typeof ABILITY_KEYS)[number]): readonly [string, number] => [
    `${s.abilities[k]}${signed(ch.abilities[k].mod)}`,
    62,
  ];
  return [
    row([cell('str'), cell('dex'), cell('con')]),
    row([cell('int'), cell('wis'), cell('cha')]),
  ];
}

/** `Slot 1°3/4 2°1/3` summary of levels 1–9, or null for non-casters. */
export function slotsLine(ch: CharacterSnapshot, s: HudStrings): string | null {
  const slots = ch.spells.slots.filter((sl) => sl.max > 0 && sl.level >= 1 && sl.level <= 9);
  if (slots.length === 0) return null;
  return `${s.slots} ${slots.map((sl) => `${sl.level}°${sl.value}/${sl.max}`).join(' ')}`;
}

function vitalsLine(ch: CharacterSnapshot, s: HudStrings): string {
  if (ch.hp <= 0) {
    const d = ch.death;
    return `${s.deathSaves} ${GLYPH.full.repeat(d.success)}${GLYPH.empty.repeat(3 - d.success)} / ${GLYPH.full.repeat(d.failure)}${GLYPH.empty.repeat(3 - d.failure)}`;
  }
  if (ch.exhaustion > 0) return `${s.exhaustion} ${ch.exhaustion}`;
  return `${s.passivePerception} ${ch.skills.prc.passive}`;
}

function conditionsLine(ch: CharacterSnapshot, s: HudStrings): string {
  return `${s.conditions}: ${ch.conditions.length > 0 ? ch.conditions.join(', ') : s.noConditions}`;
}

function mainPage(ch: CharacterSnapshot, s: HudStrings): string[] {
  const lines = [hpLine(ch, s), acLine(ch, s), ...abilityLines(ch, s)];
  const slots = slotsLine(ch, s);
  if (slots) lines.push(slots);
  lines.push(vitalsLine(ch, s), conditionsLine(ch, s));
  return lines;
}

function combatPage(ch: CharacterSnapshot, turn: TurnBudget | null, s: HudStrings): string[] {
  const weapons = ch.inventory
    .filter((i) => i.type === 'weapon')
    .map((w) =>
      row([
        [` ${w.name}`, 110],
        [w.damage ?? '', 76],
      ]),
    );
  const budget = [
    ...(turn?.economy ? [economyLine(turn.economy, s)] : []),
    ...(turn?.movement ? [movementLine(turn.movement, s)] : []),
  ];
  // With the turn budget on screen, passive perception yields its line; death saves
  // and exhaustion stay (they change what the player may do).
  const vitals = budget.length === 0 || ch.hp <= 0 || ch.exhaustion > 0 ? [vitalsLine(ch, s)] : [];
  const fixed = [hpLine(ch, s), acLine(ch, s), ...budget, ...vitals, conditionsLine(ch, s)];
  const room = SHEET_CONTENT_LINES - fixed.length;
  if (weapons.length === 0) return fixed;
  // The "Weapons" heading only when at least two weapon lines still fit under it.
  return room >= 3
    ? [...fixed, s.weapons, ...weapons.slice(0, room - 1)]
    : [...fixed, ...weapons.slice(0, room)];
}

function skillsPage(ch: CharacterSnapshot, s: HudStrings): string[] {
  const save = (k: (typeof ABILITY_KEYS)[number]): readonly [string, number] => [
    `${ch.abilities[k].proficient ? GLYPH.full : GLYPH.empty}${s.abilities[k]}${signed(ch.abilities[k].save)}`,
    93,
  ];
  const skills = SKILL_KEYS.filter((k) => ch.skills[k].proficient > 0)
    .sort((a, b) => ch.skills[b].total - ch.skills[a].total)
    .map((k) =>
      row([
        [`${ch.skills[k].proficient === 2 ? GLYPH.expert : GLYPH.full}${s.skills[k]}`, 150],
        [signed(ch.skills[k].total), 36],
      ]),
    );
  const saves = [
    row([save('str'), save('dex')]),
    row([save('con'), save('int')]),
    row([save('wis'), save('cha')]),
  ];
  const passive = `${s.passivePerception} ${ch.skills.prc.passive}`;
  return [...saves, ...skills.slice(0, SHEET_CONTENT_LINES - saves.length - 1), passive];
}

function spellsItemsPage(ch: CharacterSnapshot, s: HudStrings): string[] {
  const slots = slotsLine(ch, s);
  const spells = ch.spells.spells
    .filter((sp) => sp.prepared || sp.alwaysPrepared || sp.level === 0)
    .sort((a, b) => a.level - b.level)
    .map((sp) => ` ${sp.level === 0 ? s.cantrip : `${sp.level}°`} ${sp.name}`);
  const items = ch.inventory
    .filter((i) => i.type !== 'weapon' && i.type !== 'currency')
    .map((i) => ` ${i.name}${i.quantity && i.quantity > 1 ? ` ×${i.quantity}` : ''}`);
  const spellBlock =
    spells.length > 0 ? [slots ?? s.spells, ...spells.slice(0, 3)] : [`${s.spells}: ${s.noSpells}`];
  return [...spellBlock, s.items, ...items.slice(0, SHEET_CONTENT_LINES - spellBlock.length - 1)];
}

/**
 * Body lines of column A (7 content lines padded + page indicator).
 *
 * @param ch - Character snapshot (null → empty body).
 * @param page - Sheet page index 0–3.
 * @param s - Locale strings.
 * @param turn - Paired actor's turn budget (page 2 Combat only; null outside combat).
 * @returns Exactly 8 lines.
 */
export function sheetBody(
  ch: CharacterSnapshot | null,
  page: SheetPage,
  s: HudStrings,
  turn: TurnBudget | null = null,
): string[] {
  const content = !ch
    ? []
    : page === 0
      ? mainPage(ch, s)
      : page === 1
        ? combatPage(ch, turn, s)
        : page === 2
          ? skillsPage(ch, s)
          : spellsItemsPage(ch, s);
  const padded = [...content.slice(0, SHEET_CONTENT_LINES)];
  while (padded.length < SHEET_CONTENT_LINES) padded.push('');
  padded.push(`${page + 1}/4 ${s.pages[page]}`);
  return padded;
}
