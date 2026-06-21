/**
 * CanvasInventoryPanel — canvas-mode INTERACTIVE inventory (cursor + tap-to-use).
 *
 * Opened by the Quick Action `[I] Inventario`. Mirrors the {@link CanvasSkillsPanel}
 * UX exactly: a flat, cursor-windowed list of the actor's items with a `▶` marker
 * (swipe-up/down moves the cursor), and a TAP **uses the highlighted item directly** —
 * it dispatches a `use-item` `tool.invoke` (the boot-side `canvasItemDispatch`), like
 * clicking the item on the sheet. No Action-Options confirm modal and no target picker:
 * `activity.use()` resolves targeting Foundry-side (the player's targeted token / the
 * activity's self-target), and the per-actor write authz (ADR-0014) still applies.
 *
 * (The earlier modal flow silently swallowed the dispatch for any item with
 * `requiresTarget` — equipment, weapons — because the canvas path had no TargetPicker;
 * and the glyph scroll-offset renderer showed no cursor. Both are fixed here.)
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

/** Canvas interactive inventory overlay panel — tap uses the item directly. */
export default class CanvasInventoryPanel extends CanvasSelectableListPanel {
  static meta: PanelMeta = {
    id: 'canvas-inventory',
    title: { it: 'Inventario', en: 'Inventory', de: 'Inventar' },
    navKey: 'I',
    requiredCaps: [],
  };

  public readonly id = 'canvas-inventory';

  protected headerTitle(locale: HudLocale): string {
    return locale === 'it' ? 'INVENTARIO' : locale === 'de' ? 'INVENTAR' : 'INVENTORY';
  }

  /** Flat cursor-windowed item list (`▶ <name>`), identical model to the Skills panel. */
  protected renderRows(
    snapshot: CharacterSnapshot | null,
    _locale: HudLocale,
    cursor: number,
  ): string[] {
    if (snapshot === null) {
      return [];
    }
    return windowCursorRows(snapshot.inventory, cursor, (item) => item.name);
  }

  /**
   * The item under the cursor → a direct `use-item` request. `requiresTarget` is `false`
   * (no glasses target picker — Foundry resolves targeting); the boot dispatch sends the
   * `use-item` tool.invoke with `targets: []`.
   */
  protected resolveRequest(
    snapshot: CharacterSnapshot,
    _locale: HudLocale,
    cursor: number,
  ): ActionOptionsRequest | null {
    const item = snapshot.inventory[clampCursorIndex(cursor, snapshot.inventory.length)];
    if (item === undefined) {
      return null;
    }
    return {
      kind: 'item',
      name: item.name,
      actorId: snapshot.actorId,
      itemId: item.id,
      requiresTarget: false,
    };
  }

  /**
   * Scroll-down clamps the cursor to the item list so the `▶` marker can't run past the
   * window (mirrors {@link CanvasSkillsPanel}); tap (→ resolveRequest → use), scroll-up
   * (incl. over-scroll-to-menu), and double-tap are handled by the base.
   */
  override onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'scroll' && gesture.direction === 'down' && this._snapshot !== null) {
      this._cursor = clampCursorIndex(this._cursor + 1, this._snapshot.inventory.length);
      this._dirty = true;
      return;
    }
    super.onEvent(gesture);
  }
}
