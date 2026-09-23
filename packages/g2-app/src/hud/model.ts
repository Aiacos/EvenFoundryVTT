/**
 * Sheet model — the localised, render-ready projection of {@link AppState} consumed by
 * the image zones (portrait, header, sheet). Pure: the zone renderers never read the
 * store, so golden fixtures pin (model → pixels) and model tests pin (state → model).
 *
 * @see docs/design/g2-sheet-ux.html §Riferimenti (paper sheet / D&D Beyond → G2)
 */
import {
  ABILITY_KEYS,
  type CharacterSnapshot,
  type CombatSnapshot,
  SKILL_KEYS,
  type SkillKey,
} from '@evf/shared-protocol';
import type { AppState } from '../state/app-store.js';
import { CONDITION_KINDS, type ConditionKind, type HudStrings } from './i18n.js';
import type { SheetPage } from './input/ui-state.js';

/** Condition chip of the header's bottom row. */
export interface Chip {
  label: string;
  kind: ConditionKind;
}

/** Portrait fallback emblem, by class family. */
export type Emblem = 'hammer' | 'sword' | 'star';

/** Combat situation shown by the header. */
export interface TurnInfo {
  mine: boolean;
  round: number;
  /** Name of the combatant whose turn it is. */
  current: string;
}

export interface SheetModel {
  name: string;
  /** `NANO DELLE COLLINE · CHIERICO 5`. */
  sub: string;
  level: number;
  inspiration: boolean;
  ac: number;
  hp: number;
  hpMax: number;
  temp: number;
  init: string;
  speed: string;
  prof: string;
  /** Combat situation, or null outside combat. */
  turn: TurnInfo | null;
  /** Action / bonus / reaction still available this turn (combat only). */
  economy: readonly [boolean, boolean, boolean] | null;
  /** Remaining movement this turn (ft), else walking speed. */
  moveFt: number;
  chips: Chip[];
  abilities: Array<{ label: string; mod: string; score: number }>;
  /** Passive perception + darkvision line (page «Caratteristiche»). */
  senses: string;
  saves: Array<{ label: string; prof: boolean; value: string }>;
  skills: Array<{ label: string; prof: 0 | 1 | 2; value: string }>;
  /** Passive insight / investigation line (page «Tiri salvezza · Abilità»). */
  passives: string;
  death: { success: number; failure: number };
  emblem: Emblem;
}

/** Formats a signed modifier: `+3`, `-1`, `+0`. */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** True when the paired actor holds the current combat turn. */
export function isMyTurn(ch: CharacterSnapshot | null, combat: CombatSnapshot | null): boolean {
  if (!ch || !combat) return false;
  return combat.combatants.some((c) => c.isCurrentTurn && c.actorId === ch.actorId);
}

/** Sheet page on screen: death saves at 0 HP override the chosen page. */
export function effectivePage(ch: CharacterSnapshot | null, page: SheetPage): SheetPage | 'death' {
  return ch !== null && ch.hp <= 0 ? 'death' : page;
}

/**
 * Skill selection of the «Tiri salvezza · Abilità» page: proficient skills first (by
 * total, then canonical order), then the most commonly rolled ones, six in all.
 */
const COMMON_SKILLS: readonly SkillKey[] = ['prc', 'ath', 'ste', 'acr', 'inv', 'ins', 'sur', 'per'];
const SHEET_SKILLS = 6;

function pickSkills(ch: CharacterSnapshot): SkillKey[] {
  const proficient = SKILL_KEYS.filter((k) => ch.skills[k].proficient > 0).sort(
    (a, b) => ch.skills[b].total - ch.skills[a].total,
  );
  const rest = [...COMMON_SKILLS, ...SKILL_KEYS].filter((k) => !proficient.includes(k));
  return [...new Set([...proficient, ...rest])].slice(0, SHEET_SKILLS);
}

const HAMMER_CLASSES = new Set(['cleric', 'paladin', 'artificer']);
const SWORD_CLASSES = new Set(['fighter', 'barbarian', 'ranger', 'rogue', 'monk']);

function emblemOf(classId: string | undefined): Emblem {
  if (classId !== undefined && HAMMER_CLASSES.has(classId)) return 'hammer';
  if (classId !== undefined && SWORD_CLASSES.has(classId)) return 'sword';
  return 'star';
}

function chipsOf(ch: CharacterSnapshot, s: HudStrings): Chip[] {
  const rank: Record<ConditionKind, number> = { conc: 0, bad: 1, good: 2 };
  const chips: Chip[] = ch.conditions
    .filter((id) => id !== 'exhaustion')
    .map((id) => ({
      label: (s.conditions as Record<string, string>)[id] ?? id,
      kind: CONDITION_KINDS[id] ?? 'good',
    }));
  if (ch.exhaustion > 0) chips.push({ label: s.exhaustion(ch.exhaustion), kind: 'bad' });
  return chips.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

function subLine(ch: CharacterSnapshot, s: HudStrings): string {
  const d = ch.details;
  const cls = d?.className ? `${d.className} ${ch.level}` : `${s.level} ${ch.level}`;
  return d?.race ? `${d.race} · ${cls}` : cls;
}

function turnInfo(app: AppState): TurnInfo | null {
  const combat = app.combat;
  if (!combat) return null;
  return {
    mine: isMyTurn(app.character, combat),
    round: combat.round,
    current: combat.combatants.find((c) => c.isCurrentTurn)?.name ?? '—',
  };
}

/**
 * Builds the sheet model of the paired character, or null before the first snapshot.
 *
 * Economy/movement payloads of another actor (never expected: the projector routes by
 * actorId) are ignored.
 */
export function sheetModel(app: AppState, s: HudStrings): SheetModel | null {
  const ch = app.character;
  if (!ch) return null;
  const d = ch.details;
  const turn = turnInfo(app);
  const eco = app.actionEconomy?.actorId === ch.actorId ? app.actionEconomy : null;
  const move = app.movement?.actorId === ch.actorId ? app.movement : null;
  const skills = pickSkills(ch);
  const sensesParts = [s.passivePerception(ch.skills.prc.passive)];
  if (d && d.darkvision > 0) sensesParts.push(s.darkvision(d.darkvision));
  return {
    name: ch.name,
    sub: subLine(ch, s),
    level: ch.level,
    inspiration: d?.inspiration === true,
    ac: ch.ac,
    hp: Math.max(0, ch.hp),
    hpMax: ch.maxHp,
    temp: ch.tempHp,
    init: signed(d?.initiative ?? ch.abilities.dex.mod),
    speed: String(d?.speed ?? 30),
    prof: signed(d?.proficiency ?? Math.ceil(ch.level / 4) + 1),
    turn,
    economy:
      turn === null
        ? null
        : [
            (eco?.actionsUsed ?? 0) === 0,
            (eco?.bonusActionsUsed ?? 0) === 0,
            (eco?.reactionsUsed ?? 0) === 0,
          ],
    moveFt: move?.remainingFeet ?? d?.speed ?? 30,
    chips: chipsOf(ch, s),
    abilities: ABILITY_KEYS.map((k) => ({
      label: s.abilities[k],
      mod: signed(ch.abilities[k].mod),
      score: ch.abilities[k].value,
    })),
    senses: sensesParts.join(' · '),
    saves: ABILITY_KEYS.map((k) => ({
      label: s.abilities[k],
      prof: ch.abilities[k].proficient,
      value: signed(ch.abilities[k].save),
    })),
    skills: skills.map((k) => {
      const sk = ch.skills[k];
      return {
        label: s.skills[k],
        prof: sk.proficient === 2 ? 2 : sk.proficient > 0 ? 1 : 0,
        value: signed(sk.total),
      };
    }),
    passives: s.passiveInsight(ch.skills.ins.passive, ch.skills.inv.passive),
    death: ch.death,
    emblem: emblemOf(d?.classId),
  };
}
