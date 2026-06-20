/**
 * CanvasSkillsPanel — canvas-mode INTERACTIVE skill-roll list (Phase 8 write channel).
 *
 * Opened by the Quick Action `[K] Abilità` in canvas mode. Swipe-up/down moves a
 * cursor through the character's 18 D&D 5e skills; a tap rolls the highlighted skill
 * DIRECTLY — it dispatches a `skill-check` `tool.invoke` envelope (like clicking the
 * skill button on the sheet), NOT the ActionOptions modal. The roll always uses
 * `advantage: 'normal'` (advantage/disadvantage selection is a future enhancement).
 *
 * It subclasses {@link CanvasSelectableListPanel} for the canvas plumbing (chrome,
 * gesture/lifecycle, character.delta subscription) but:
 *   - `resolveRequest` returns `null` (the base ActionOptions tap path is unused), and
 *   - `onEvent` is overridden so a tap calls the injected skill-roll handler instead.
 *
 * The skill list ordering + names match the sheet's Skills tab renderer exactly
 * (reuses {@link SKILL_NAMES} + {@link SKILL_KEYS} with the same STR→CHA ability
 * grouping), so the cursor↔row mapping is consistent with what the player sees there.
 *
 * @see packages/g2-app/src/panels/canvas-inventory-panel.ts (canvas selectable template)
 * @see packages/g2-app/src/panels/character-sheet-tab-renderers.ts (SKILL_NAMES + ordering)
 */

import { type CharacterSnapshot, SKILL_KEYS, type SkillKey } from '@evf/shared-protocol';
import type { R1Gesture } from '../engine/layer-types.js';
import type { PanelMeta } from '../engine/panel-router.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import type { ActionOptionsRequest } from './action-options-modal.js';
import { CanvasSelectableListPanel } from './canvas-selectable-list.js';
import { SKILL_NAMES } from './character-sheet-tab-renderers.js';

/**
 * Request passed to the injected skill-roll handler when the player taps a skill.
 *
 * `advantage` is fixed to `'normal'` for the direct-roll affordance; the boot-side
 * dispatch builds the canonical `skill-check` `tool.invoke` envelope from this.
 */
export interface SkillRollRequest {
  /** Foundry actor id performing the check. */
  readonly actorId: string;
  /** dnd5e 3-letter skill key (e.g. `'prc'`). */
  readonly skill: SkillKey;
}

/** Ability column ordering — matches renderSkillsTab's STR→CHA grouping. */
const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/**
 * Number of skill rows the canvas list paints before running out of vertical space
 * (compositor height ÷ line height ≈ 9). The windowing in {@link CanvasSkillsPanel.renderRows}
 * scrolls so the cursor stays within this many rows. Kept in sync with the base
 * `CanvasSelectableListPanel.paint` row budget.
 */
const VISIBLE_ROWS = 9;

/**
 * Build the ordered skill-key list for a snapshot, grouped by ability column then in
 * canonical {@link SKILL_KEYS} order — the SAME projection the sheet Skills tab uses,
 * so a row index maps to the same skill the player sees there.
 *
 * @param snapshot - Character snapshot (its `skills[k].ability` drives the grouping).
 * @returns Ordered skill keys.
 */
function orderedSkillKeys(snapshot: CharacterSnapshot): SkillKey[] {
  return ABILITY_ORDER.flatMap((ab) => SKILL_KEYS.filter((k) => snapshot.skills[k].ability === ab));
}

/** Resolve a localised skill name (it/de else en) — reuses the sheet's SKILL_NAMES. */
function skillName(key: SkillKey, locale: HudLocale): string {
  return locale === 'it'
    ? SKILL_NAMES[key].it
    : locale === 'de'
      ? SKILL_NAMES[key].de
      : SKILL_NAMES[key].en;
}

/** Canvas interactive skills overlay panel — tap rolls the skill directly. */
export default class CanvasSkillsPanel extends CanvasSelectableListPanel {
  static meta: PanelMeta = {
    id: 'canvas-skills',
    title: { it: 'Abilità', en: 'Skills', de: 'Fertigkeiten' },
    navKey: 'K',
    requiredCaps: [],
  };

  public readonly id = 'canvas-skills';

  /** Injected by boot-engine-core: builds + sends the skill-check tool.invoke envelope. */
  private _skillRollHandler: ((req: SkillRollRequest) => void) | null = null;

  /**
   * Inject the direct skill-roll dispatch handler (mirrors setActionOptionsHandler).
   *
   * @param handler - Called on tap with the resolved `{ actorId, skill }`, or null to clear.
   */
  setSkillRollHandler(handler: ((req: SkillRollRequest) => void) | null): void {
    this._skillRollHandler = handler;
  }

  protected headerTitle(locale: HudLocale): string {
    return locale === 'it' ? 'ABILITÀ' : locale === 'de' ? 'FERTIGKEITEN' : 'SKILLS';
  }

  /**
   * Render the WINDOWED skill rows with a cursor marker. Mirrors the sheet ordering:
   * `▶ <Name> <mod>` for the highlighted row, two leading spaces otherwise.
   *
   * The canvas list paints only {@link VISIBLE_ROWS} rows (compositor height / line
   * height), but a level-up character can have all 18 D&D skills. Without windowing
   * the cursor marker (and every skill past the 9th) scrolls off the bottom and is
   * unreachable. We therefore slice a window that FOLLOWS the cursor — the cursor row
   * stays visible, becoming the last visible row once it passes the window bottom.
   */
  protected renderRows(
    snapshot: CharacterSnapshot | null,
    locale: HudLocale,
    cursor: number,
  ): string[] {
    if (snapshot === null) {
      return [];
    }
    const keys = orderedSkillKeys(snapshot);
    if (keys.length === 0) {
      return [];
    }
    // Clamp the cursor to a real row, then compute a scroll offset that keeps it in
    // view: 0 while the cursor is within the first window, then advancing so the
    // cursor sits on the last visible row.
    const clamped = Math.max(0, Math.min(cursor, keys.length - 1));
    const maxOffset = Math.max(0, keys.length - VISIBLE_ROWS);
    const offset = Math.min(Math.max(0, clamped - (VISIBLE_ROWS - 1)), maxOffset);
    return keys.slice(offset, offset + VISIBLE_ROWS).map((key, i) => {
      const idx = offset + i;
      const sk = snapshot.skills[key];
      const mod = sk.total >= 0 ? `+${sk.total}` : `${sk.total}`;
      const marker = idx === clamped ? '▶ ' : '  ';
      return `${marker}${skillName(key, locale)} ${mod}`;
    });
  }

  /**
   * The base ActionOptions tap path is unused — skills dispatch a skill-check directly
   * (see {@link onEvent}). Returning null keeps the abstract contract satisfied.
   */
  protected resolveRequest(
    _snapshot: CharacterSnapshot,
    _locale: HudLocale,
    _cursor: number,
  ): ActionOptionsRequest | null {
    return null;
  }

  /**
   * Gesture dispatch — scroll/double-tap behave like the base; a TAP rolls the skill
   * under the cursor directly (no ActionOptions modal).
   */
  override onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'tap') {
      if (this._skillRollHandler === null || this._snapshot === null) {
        return;
      }
      const keys = orderedSkillKeys(this._snapshot);
      const idx = Math.max(0, Math.min(this._cursor, keys.length - 1));
      const skill = keys[idx];
      if (skill === undefined) {
        console.warn('[EVF] canvas-skills: tap with no skill under cursor — no-op');
        return;
      }
      this._skillRollHandler({ actorId: this._snapshot.actorId, skill });
      return;
    }
    if (gesture.kind === 'scroll' && gesture.direction === 'down' && this._snapshot !== null) {
      // Clamp at the last skill so the ▶ cursor cannot run PAST the windowed list.
      // The base class increments the cursor unbounded; for a finite skill list that
      // would scroll the cursor off the bottom (and force extra up-swipes to return),
      // leaving the lower skills effectively unreachable. Clamp here so down-swipe
      // stops at the last skill and renderRows can keep it in view.
      const keys = orderedSkillKeys(this._snapshot);
      this._cursor = Math.min(this._cursor + 1, Math.max(0, keys.length - 1));
      this._dirty = true;
      return;
    }
    // scroll-up (incl. over-scroll-to-menu at the top) and double-tap (router close)
    // are handled identically to the base selectable list.
    super.onEvent(gesture);
  }
}
