/**
 * target-resolver.ts — pure-function helper for resolving valid targets.
 *
 * Exposes `resolveValidTargets` which filters the CombatSnapshot + scene token
 * list down to a `TargetCandidate[]` that the TargetPickerPanel can display and
 * the player can select via R1 scroll + tap.
 *
 * ## Phase 8 Range Heuristic (RESEARCH §Q3)
 *
 * Phase 8 uses a broad heuristic: all non-self, non-defeated combatants are
 * included regardless of grid position. Phase 9 (COMB-02) will refine with
 * precise grid-distance checks when Action Economy enforcement lands.
 *
 * ## Shared consumer note
 *
 * This module is consumed by:
 *   - `TargetPickerPanel` (Plan 08-02) — renders the picker list
 *   - `ActionOptionsModal` (Plan 08-03) — shows available targets count
 *   - Phase 08-05 boot wiring — validates target list before action dispatch
 *
 * ## No side effects
 *
 * This module is intentionally pure: no bridge, no WebSocket, no DOM. Safe to
 * call in tests without any mocking infrastructure.
 *
 * @see .planning/phases/08-manual-action-ux/08-02-PLAN.md Task 1
 * @see .planning/phases/08-manual-action-ux/08-CONTEXT.md §Area 1 (target picker)
 * @see .planning/research/STACK.md §Q3 (Phase 8 broad range heuristic)
 * @see packages/g2-app/src/panels/target-picker-panel.ts (primary consumer)
 * @see packages/shared-protocol/src/payloads/combat.ts (CombatSnapshot shape)
 */

import type { CombatSnapshot } from '@evf/shared-protocol';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single resolved target candidate ready for display in the TargetPickerPanel.
 *
 * All fields are `readonly` — TargetCandidate is immutable after construction.
 * Phase 9 (COMB-02) may add `range` and `conditions` fields; this Phase 8
 * minimal shape is stable without breakage.
 */
export interface TargetCandidate {
  /** Foundry combatant id (from combat) or token id (from scene). */
  readonly tokenId: string;
  /** Linked Foundry actor id. Never null (null-actorId combatants are excluded). */
  readonly actorId: string;
  /** Display name from the combatant or token. */
  readonly name: string;
  /** Current HP (null if actor not linked). */
  readonly hp: number | null;
  /** Maximum HP (null if actor not linked). */
  readonly maxHp: number | null;
  /** Armour class (null if not available on combatant). */
  readonly ac: number | null;
  /**
   * Whether this combatant's turn is currently active in combat.
   *
   * True when `combatant.id === combat.currentCombatantId`.
   * Always false for scene-only tokens.
   */
  readonly isActiveTurn: boolean;
  /**
   * Index of this candidate within the full resolved list (0-based).
   *
   * Used by `describeTargetRow` for the numbering label.
   */
  readonly sourceIdx: number;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the list of valid targets visible from the player's position.
 *
 * ## Filtering logic
 *
 * Combat snapshot candidates:
 *   - `actorId !== callerActorId` (exclude self)
 *   - `actorId !== null` (exclude token-only combatants without an actor link)
 *   - `(hp ?? 0) > 0` (exclude defeated combatants)
 *
 * Scene token candidates (used when combat is null, or to supplement combat):
 *   - `actorId !== callerActorId` (exclude self)
 *   - `actorId !== null` (exclude unlinked tokens)
 *
 * ## Ordering
 *
 * 1. Active-turn combatant FIRST (id === combat.currentCombatantId).
 * 2. Remaining combat candidates in descending initiative order.
 * 3. Scene-only tokens (not already in combat) in original scene order.
 *
 * ## Range heuristic (Phase 8 broad, RESEARCH §Q3)
 *
 * When `rangeHint` is provided, all combatants are included regardless of grid
 * position. Phase 9 COMB-02 refines with precise grid-distance filtering.
 *
 * @param combatSnapshot  Active combat state (null if no combat).
 * @param sceneTokens     Visible scene tokens (undefined or empty if none).
 * @param callerActorId   The player's own actor id (excluded from results).
 * @param rangeHint       Optional range in feet (Phase 8: no filtering applied).
 * @returns Ordered, deduplicated list of valid target candidates.
 */
export function resolveValidTargets(
  combatSnapshot: CombatSnapshot | null,
  sceneTokens: ReadonlyArray<{ id: string; name: string; actorId: string | null }> | undefined,
  callerActorId: string,
  _rangeHint?: number,
): TargetCandidate[] {
  const results: TargetCandidate[] = [];
  // Track actor IDs already added (dedup across combat + scene).
  const addedActorIds = new Set<string>();

  // ── Combat candidates ────────────────────────────────────────────────────
  if (combatSnapshot !== null) {
    const { combatants, currentCombatantId } = combatSnapshot;

    // Separate active-turn combatant from the rest.
    const activeCombatant = combatants.find(
      (c) =>
        c.id === currentCombatantId &&
        c.actorId !== null &&
        c.actorId !== callerActorId &&
        (c.hp ?? 0) > 0,
    );

    // Remaining non-active combat candidates (filtered + ordered by initiative desc).
    const otherCombatants = combatants
      .filter(
        (c) =>
          c.id !== currentCombatantId &&
          c.actorId !== null &&
          c.actorId !== callerActorId &&
          (c.hp ?? 0) > 0,
      )
      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));

    // Build ordered list: active first, then others.
    const ordered = activeCombatant ? [activeCombatant, ...otherCombatants] : otherCombatants;

    for (const combatant of ordered) {
      // actorId cannot be null here (filtered above) — safe non-null cast.
      const actorId = combatant.actorId as string;
      if (addedActorIds.has(actorId)) continue;
      addedActorIds.add(actorId);

      results.push({
        // Pass the token UUID (what MidiQOL `targetUuids` needs), NOT the combatant id —
        // a cast/attack on a combatant id resolves no target. Fall back to the combatant
        // id only for pre-tokenUuid module builds (degraded, but no worse than before).
        tokenId: combatant.tokenUuid ?? combatant.id,
        actorId,
        name: combatant.name,
        hp: combatant.hp,
        maxHp: combatant.maxHp,
        ac: null, // CombatantSchema has no ac field — populated from scene tokens where available
        isActiveTurn: combatant.id === currentCombatantId,
        sourceIdx: results.length,
      });
    }
  }

  // ── Scene-only candidates ────────────────────────────────────────────────
  if (sceneTokens !== undefined && sceneTokens.length > 0) {
    for (const token of sceneTokens) {
      if (token.actorId === null) continue;
      if (token.actorId === callerActorId) continue;
      if (addedActorIds.has(token.actorId)) continue; // already in combat candidates
      addedActorIds.add(token.actorId);

      results.push({
        tokenId: token.id,
        actorId: token.actorId,
        name: token.name,
        hp: null,
        maxHp: null,
        ac: null,
        isActiveTurn: false,
        sourceIdx: results.length,
      });
    }
  }

  // Re-assign sourceIdx sequentially after ordering + dedup.
  return results.map((c, idx) => ({ ...c, sourceIdx: idx }));
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

/**
 * Render a single target row for display in the TargetPickerPanel.
 *
 * Format (IT): `  N. NAME  PF hp/maxHp  CA ac`
 * Format (EN): `  N. NAME  HP hp/maxHp  AC ac`
 *
 * When `isSelected` is true, the leading `  ` is replaced with `▶ `.
 *
 * The output is clamped to `width` code-points via truncation with `…`.
 *
 * @param candidate   Target candidate to render.
 * @param locale      Active HUD locale.
 * @param idx         1-based display index for the row.
 * @param isSelected  Whether this row has the scroll indicator.
 * @param width       Maximum code-point width of the rendered row.
 * @returns A string of at most `width` code-points.
 */
export function describeTargetRow(
  candidate: TargetCandidate,
  locale: HudLocale,
  idx: number,
  isSelected: boolean,
  width: number,
): string {
  const hpLabel = getLabel('target_picker_hp_label', locale);
  const acLabel = getLabel('target_picker_ac_label', locale);

  const hpStr =
    candidate.hp !== null && candidate.maxHp !== null ? `${candidate.hp}/${candidate.maxHp}` : '--';
  const acStr = candidate.ac !== null ? String(candidate.ac) : '--';

  const prefix = isSelected ? '▶ ' : '  ';
  const numberPart = `${idx + 1}.`;
  // Assemble: `▶ 1. NAME  PF 5/15  CA 13`
  const row = `${prefix}${numberPart} ${candidate.name}  ${hpLabel} ${hpStr}  ${acLabel} ${acStr}`;

  // Clamp to `width` code-points.
  const cps = [...row];
  if (cps.length <= width) {
    return row;
  }
  return `${cps.slice(0, width - 1).join('')}…`;
}
