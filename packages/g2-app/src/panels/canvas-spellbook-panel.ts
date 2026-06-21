/**
 * CanvasSpellbookPanel — canvas-mode INTERACTIVE spellbook (cursor + tap-to-cast).
 *
 * Opened by the Quick Action `[B] Libro`. Mirrors the {@link CanvasSkillsPanel} UX: a
 * flat, cursor-windowed list of the actor's spells with a `▶` marker (swipe-up/down
 * moves the cursor), and a TAP **casts the highlighted spell directly** — it dispatches
 * a `cast-spell` `tool.invoke` (the boot-side `canvasSpellDispatch`) at the lowest
 * available slot ≥ the spell's level (cantrips → slot 0). No Action-Options confirm
 * modal and no target picker: `activity.use()` resolves targeting Foundry-side, and the
 * per-actor write authz (ADR-0014) still applies. (Upcast slot selection is a future
 * enhancement, mirroring skills' fixed `advantage: 'normal'`.)
 *
 * @see packages/g2-app/src/panels/canvas-skills-panel.ts (the shared cursor/tap template)
 * @see packages/g2-app/src/panels/canvas-selectable-list.ts (base + windowCursorRows)
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import type { R1Gesture } from '../engine/layer-types.js';
import type { PanelMeta } from '../engine/panel-router.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import type { ActionOptionsRequest } from './action-options-modal.js';
import {
  CanvasSelectableListPanel,
  clampCursorIndex,
  windowCursorRows,
} from './canvas-selectable-list.js';

/** Canvas interactive spellbook overlay panel — tap casts the spell directly. */
export default class CanvasSpellbookPanel extends CanvasSelectableListPanel {
  static meta: PanelMeta = {
    id: 'canvas-spellbook',
    title: { it: 'Libro', en: 'Spellbook', de: 'Zauberbuch' },
    navKey: 'B',
    requiredCaps: [],
  };

  public readonly id = 'canvas-spellbook';

  protected headerTitle(locale: HudLocale): string {
    return locale === 'it' ? 'LIBRO' : locale === 'de' ? 'ZAUBERBUCH' : 'SPELLBOOK';
  }

  /** Flat cursor-windowed spell list (`▶ <name> L<n>`; cantrips show no level tag). */
  protected renderRows(
    snapshot: CharacterSnapshot | null,
    _locale: HudLocale,
    cursor: number,
  ): string[] {
    if (snapshot === null) {
      return [];
    }
    return windowCursorRows(snapshot.spells.spells, cursor, (spell) =>
      spell.level === 0 ? spell.name : `${spell.name} L${spell.level}`,
    );
  }

  /**
   * The spell under the cursor → a direct `cast-spell` request. `requiresTarget` is
   * `false` (Foundry resolves targeting); the boot dispatch picks the default slot.
   */
  protected resolveRequest(
    snapshot: CharacterSnapshot,
    _locale: HudLocale,
    cursor: number,
  ): ActionOptionsRequest | null {
    const spell = snapshot.spells.spells[clampCursorIndex(cursor, snapshot.spells.spells.length)];
    if (spell === undefined) {
      return null;
    }
    return {
      kind: 'spell',
      name: spell.name,
      actorId: snapshot.actorId,
      itemId: spell.id,
      requiresTarget: false,
    };
  }

  /**
   * Scroll-down clamps the cursor to the spell list so the `▶` marker can't run past the
   * window; tap (→ resolveRequest → cast), scroll-up (incl. over-scroll-to-menu), and
   * double-tap are handled by the base.
   */
  override onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'scroll' && gesture.direction === 'down' && this._snapshot !== null) {
      this._cursor = clampCursorIndex(this._cursor + 1, this._snapshot.spells.spells.length);
      this._dirty = true;
      return;
    }
    super.onEvent(gesture);
  }
}
