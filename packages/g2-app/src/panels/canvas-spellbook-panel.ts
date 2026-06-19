/**
 * CanvasSpellbookPanel — canvas-mode INTERACTIVE spellbook (Feature 001, Option B).
 *
 * Opened by the Quick Action `[B] Libro` in canvas mode. Swipe-up/down moves a
 * cursor through the spells; tap activates the cursor spell (Action Options →
 * slot picker → cast). Reuses the glyph standalone renderer + row→spell map +
 * resolver verbatim, so cursor↔row mapping and the dispatched request match the
 * glyph `SpellbookPanel`.
 *
 * @see packages/g2-app/src/panels/canvas-selectable-list.ts (base)
 * @see packages/g2-app/src/panels/spellbook-panel.ts (selection logic)
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import type { PanelMeta } from '../engine/panel-router.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import type { ActionOptionsRequest } from './action-options-modal.js';
import { CanvasSelectableListPanel } from './canvas-selectable-list.js';
import {
  buildSpellbookRowItemMap,
  renderSpellbookStandaloneContent,
  resolveSpellAtRow,
} from './spellbook-panel.js';

/** Canvas interactive spellbook overlay panel. */
export default class CanvasSpellbookPanel extends CanvasSelectableListPanel {
  static meta: PanelMeta = {
    id: 'canvas-spellbook',
    title: { it: 'Libro', en: 'Spellbook', de: 'Zauberbuch' },
    navKey: 'B',
    requiredCaps: [],
  };

  public readonly id = 'canvas-spellbook';

  protected headerTitle(locale: HudLocale): string {
    return locale === 'it' ? 'LIBRO' : 'SPELLBOOK';
  }

  protected renderRows(
    snapshot: CharacterSnapshot | null,
    locale: HudLocale,
    cursor: number,
  ): string[] {
    return renderSpellbookStandaloneContent(snapshot, locale, cursor);
  }

  protected resolveRequest(
    snapshot: CharacterSnapshot,
    _locale: HudLocale,
    cursor: number,
  ): ActionOptionsRequest | null {
    const rowMap = buildSpellbookRowItemMap(snapshot);
    const spell = resolveSpellAtRow(
      rowMap,
      CanvasSelectableListPanel.clampCursor(cursor, rowMap.length),
    );
    if (spell == null) return null;
    // requiresTarget heuristic mirrors the glyph SpellbookPanel.
    const requiresTarget =
      spell.range !== 'self' && spell.range !== '' && spell.activation !== 'reaction';
    return {
      kind: 'spell',
      name: spell.name,
      actorId: snapshot.actorId,
      itemId: spell.id,
      requiresTarget,
    };
  }
}
