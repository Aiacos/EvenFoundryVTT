---
phase: 05
slug: panel-plugin-system-read-only-panels
status: findings
critical_count: 3
warning_count: 5
info_count: 3
reviewed_at: 2026-05-15
files_reviewed: 19
files_reviewed_list:
  - packages/g2-app/src/engine/panel-router.ts
  - packages/g2-app/src/locale/locale-menu.ts
  - packages/g2-app/src/locale/locale-override.ts
  - packages/g2-app/src/panels/character-sheet-panel.ts
  - packages/g2-app/src/panels/character-sheet-tab-renderers.ts
  - packages/g2-app/src/panels/inventory-panel.ts
  - packages/g2-app/src/panels/spellbook-panel.ts
  - packages/g2-app/src/panels/combat-tracker-panel.ts
  - packages/g2-app/src/panels/log-panel.ts
  - packages/shared-protocol/src/payloads/log.ts
  - packages/foundry-module/src/readers/log-reader.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/engine/boot-engine-error-wrapper.ts
  - packages/g2-app/src/status-hud/i18n-budgets.ts
  - packages/shared-protocol/src/payloads/character.ts
  - packages/shared-protocol/src/payloads/combat.ts
  - packages/foundry-module/src/readers/character-reader.ts
  - packages/foundry-module/src/readers/combat-reader.ts
  - packages/foundry-module/src/types/foundry-globals.d.ts
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 5 delivers a substantial panel system: PanelRouter auto-discovery, five overlay panels (CharacterSheet, CombatTracker, Log, Inventory, Spellbook), locale override persistence, and protocol schema extensions. The overall architecture is sound — Strategy A single-container discipline is consistent, the gesture bus subscription/unsubscription pattern is idempotent throughout, and the i18n budget table entries are correctly within their declared budgets.

Three blockers were found: a logic inversion in the spell-slot bar display (filled/empty bars are backwards, and the numeric counter shows remaining instead of spent), a malformed ternary expression in the inventory damage-formula extraction (the `base.formula` value is used as a truthiness gate but the *value* it guards is `parts[0]`, not `base.formula` itself), and a combat tracker HP display that left-slices the HP string instead of applying ellipsis truncation for characters with HP ≥ 100 — diverging from the UI-SPEC contract and showing wrong numeric values (e.g., `210/220` → `0/220`).

Five warnings cover: the YOU-marker nameField producing a 67-code-point combat row in EN locale (INV-1 violation), an unbounded `scrollOffset` accumulation pattern in LogPanel and CombatTrackerPanel, dead code in `extractInventory` that can never execute, dead code in the exported `renderLogFilterBar` that is never called from the render path, and an incorrect log event description template that appends "roll" to every event kind regardless of whether a roll occurred.

Three informational items: `PanelMetaSchema` using `z.object` rather than `z.strictObject` at the discovery boundary, a column-layout JSDoc discrepancy in `inventory-panel.ts`, and a `void slots` dead-variable suppression in `renderSpellsTabContent`.

---

## Critical Issues

### CR-01: Spell-slot bar is inverted — remaining shown as spent

**File:** `packages/g2-app/src/panels/spellbook-panel.ts:232`

**Issue:** `SpellSlot.value` is defined as "Remaining spell slots" (see `character.ts:132`). `renderSlotBar` treats its first parameter as "spent" slots and fills `▓` bars proportionally to `spent/max`. Passing `slot.value` (remaining) as the `spent` argument inverts the bar: when all slots are available (`value === max`), all bars show as filled (`▓▓▓▓ 4/4`) with the "← available" marker — contradictory; when one slot is used (`value=3, max=4`), three bars show filled (`▓▓▓░`) instead of one (`▓░░░`). The counter `N/M` also shows remaining/max rather than spent/max, conflicting with the `renderSlotBar` JSDoc examples.

**Fix:**
```typescript
// spellbook-panel.ts line 232 — pass (max - value) as the spent count
const slotBar =
  slot !== undefined && slot.max > 0
    ? renderSlotBar(slot.max - slot.value, slot.max)
    : '';

// allFree logic (line 234) is already correct when value === max means no slots spent:
// renderSlotBar(0, max) → ░░░░ 0/4 ← available  ✓
```

The same inversion exists in `renderLevelSection` which also calls `renderSlotBar(slot.value, slot.max)` at line 232 — apply the same fix there.

---

### CR-02: Damage-formula ternary discards `base.formula` value — always reads `parts[0]`

**File:** `packages/foundry-module/src/readers/character-reader.ts:94-98`

**Issue:** The ternary expression on lines 94–98 is logically malformed. The condition is:

```
(base?.formula ?? (parts?.[0] !== undefined))
```

The true branch is `String(parts[0])`. This means:
- When `base.formula` is a non-`undefined` string (e.g., `'1d8'`): the condition is `'1d8'` (truthy), so the result is `String(parts[0])` — `base.formula` is used only as a gating value and its content is silently discarded.
- When `base.formula` is `undefined`: the condition becomes the boolean `(parts[0] !== undefined)`, and if truthy the result is `String(parts[0])`.

In both paths the returned value is always from `parts[0]`, never from `base.formula`. For dnd5e 5.x actors that use `damage.base.formula` (the modern field), the correct damage string is lost and `parts[0]` (a `[string, string]` tuple) is stringified instead, producing display strings like `"1d8,slashing"` or `""` depending on the item.

**Fix:**
```typescript
// character-reader.ts lines 94-98 — replace the malformed ternary:
const baseFormula =
  (damage.base as Record<string, unknown>)?.formula as string | undefined;
const partsFirst = ((damage as Record<string, unknown>).parts as unknown[] | undefined)?.[0];
const damageFormula: string | undefined =
  baseFormula !== undefined
    ? baseFormula
    : partsFirst !== undefined
      ? String(partsFirst)
      : undefined;
```

---

### CR-03: Combat tracker HP field left-slices for HP ≥ 100, displaying wrong current HP

**File:** `packages/g2-app/src/panels/combat-tracker-panel.ts:225`

**Issue:** `_rjust(str, width)` on strings longer than `width` returns `cps.slice(-width)` — the rightmost `width` characters. The HP value is formatted as `"${hp}/${maxHp}"`. For characters with HP ≥ 100 or max HP ≥ 100, this string exceeds 5 characters and the leftmost (most significant) digits of current HP are silently dropped: `"210/220"` → `"0/220"`, making it appear the character has 0 HP. The UI-SPEC §5.8 (line 441-442) explicitly mandates ellipsis truncation (`"1…/1…"` or `"100/…"`) for this case, not left-slicing.

This is a correctness bug: a player viewing the combat tracker for a high-level character will see `0/xxx` as current HP, potentially triggering wrong tactical decisions.

**Fix:**
```typescript
// combat-tracker-panel.ts line 225 — apply spec-compliant HP truncation:
function _formatHpField(hp: number, maxHp: number, width: number): string {
  const full = `${hp}/${maxHp}`;
  if ([...full].length <= width) return full.padStart(width);
  // Truncate each part with ellipsis to fit budget
  const half = Math.floor((width - 1) / 2); // chars per side minus separator
  const hpStr = hp >= 1000 ? `${String(hp).slice(0, half)}…` : String(hp);
  const mhStr = maxHp >= 1000 ? `${String(maxHp).slice(0, half)}…` : String(maxHp);
  return _pad(`${hpStr}/${mhStr}`, width);
}

const hpValue =
  c.hp !== null && c.maxHp !== null
    ? _formatHpField(c.hp, c.maxHp, 5)
    : '  ---';
```

---

## Warnings

### WR-01: YOU-marker nameField produces 67-code-point row in EN locale (INV-1 violation)

**File:** `packages/g2-app/src/panels/combat-tracker-panel.ts:209-213`

**Issue:** The YOU-marker nameField is assembled as `name(12) + "  "(2) + youMarker`. `youMarker` for EN locale is `"◀ YOU"` (5 code-points, `max: 6`), producing a nameField of 19 code-points instead of the 18-code-point budget. The resulting `mainRow` is 67 code-points. The defensive `console.warn` at lines 275-279 fires but the row is returned as-is — no correction is applied. The over-wide row is passed directly to `bridge.textContainerUpgrade`, violating INV-1 layout integrity.

**Fix:**
```typescript
// combat-tracker-panel.ts lines 208-214 — pad youMarker to exactly 4 code-points:
if (isYou) {
  const youMarkerRaw = getLabel('combat.tracker.you_marker', locale);
  // Truncate/pad to exactly 4 chars so nameField stays 12+2+4 = 18 always
  const youMarker = _pad(youMarkerRaw, 4);
  const name = _pad(_truncate(c.name, 12), 12);
  nameField = `${name}  ${youMarker}`;
}
```

---

### WR-02: `scrollOffset` unbounded in LogPanel and CombatTrackerPanel

**File:** `packages/g2-app/src/panels/log-panel.ts:419` and `packages/g2-app/src/panels/combat-tracker-panel.ts:543`

**Issue:** Both panels increment `scrollOffset` on `scroll-down` without an upper bound. `LogPanel.onEvent` does `this.scrollOffset += 1` with no clamp. `CombatTrackerPanel.onEvent` does `this.scrollOffset += gesture.direction === 'down' ? 1 : -1` with no positive clamp. After enough `scroll-down` events, `scrollOffset` grows to values far exceeding the content length. Rendering gracefully shows empty/end-of-content (no crash), but the panel is "stuck" scrolled past all content with no visual indicator, and only repeated `scroll-up` gestures can recover. Compare: `CharacterSheetPanel` and `InventoryPanel` apply proper clamping at render time.

**Fix:**
```typescript
// log-panel.ts — clamp after increment:
case 'scroll':
  if (gesture.direction === 'down') {
    const maxOffset = Math.max(0, (this.snapshot?.events.length ?? 0) - 1);
    this.scrollOffset = Math.min(this.scrollOffset + 1, maxOffset);
  } else {
    this.scrollOffset = Math.max(0, this.scrollOffset - 1);
  }
  void this.draw();
  break;

// combat-tracker-panel.ts — similarly clamp to combatants.length - 3 (window center range):
case 'scroll':
  const maxOff = Math.max(0, (this.snapshot?.combatants.length ?? 0) - 3);
  this.scrollOffset = Math.max(-maxOff, Math.min(this.scrollOffset + (gesture.direction === 'down' ? 1 : -1), maxOff));
  void this.draw();
  break;
```

---

### WR-03: Dead code in `extractInventory` — spell-type filter at line 90 is unreachable

**File:** `packages/foundry-module/src/readers/character-reader.ts:90`

**Issue:** `'spell'` is not in `INVENTORY_ITEM_TYPES`. Therefore `mapItemType('spell')` returns `null`, and the guard at line 87 (`if (type === null) continue`) already skips all spell items before reaching line 90. The expression `type === ('spell' as string)` can never be true. INV-4 mandates zero dead/unreachable code.

**Fix:**
```typescript
// Remove lines 89-91:
// if (type === ('spell' as string)) continue;  // DELETE — unreachable after mapItemType null-guard
```

---

### WR-04: `renderLogFilterBar` is exported but never called from the render path

**File:** `packages/g2-app/src/panels/log-panel.ts:214-225`

**Issue:** `renderLogFilterBar` is a named export in `log-panel.ts` and is tested in isolation, but `renderLogContent` — the sole function called by `LogPanel.draw()` — does not use it. `renderLogContent` builds its own `topBorder` inline (line 251) using a simpler `getLabel('log.panel_title', locale)` call, bypassing the filter bar entirely. The active-filter visual differentiation (`[▶TUTTI]` vs `[TUTTI]`) is therefore never rendered in the production code path. INV-4 mandates zero dead/unreachable code.

**Fix:** Either wire `renderLogFilterBar` into `renderLogContent` (replacing the inline `topBorder` on line 251 with a call to `renderLogFilterBar(activeFilter, locale)` — the `LogPanel` would need to expose its `activeFilter` to `renderLogContent`), or remove `renderLogFilterBar` and its tests if the filter UI is a Phase 6 concern.

---

### WR-05: Log event `description` appends "roll" to all non-empty-actor events

**File:** `packages/foundry-module/src/readers/log-reader.ts:197`

**Issue:** The description construction `actorName !== '' ? \`${kind} roll\` : kind` unconditionally suffixes `" roll"` for every event kind when an actor name is present. This produces nonsensical display strings: `"spell roll"`, `"feature roll"`, `"chat roll"` — none of which reflect a roll. Only `"attack roll"` and `"roll roll"` (save) are semantically correct. The `LogPanel` renders this string in the 40-char description column where it is the primary human-readable event description; incorrect labels mislead the player.

**Fix:**
```typescript
// log-reader.ts line 197 — use kind-appropriate description:
const description =
  actorName !== ''
    ? kind === 'attack' || kind === 'roll' || kind === 'damage'
      ? `${actorName} — ${kind}`
      : actorName  // for spell/feature/chat, actor name is sufficient
    : kind;
```

---

## Info

### IN-01: `PanelMetaSchema` uses `z.object` rather than `z.strictObject`

**File:** `packages/g2-app/src/engine/panel-router.ts:58`

**Issue:** The project convention is `z.strictObject` at all protocol/validation boundaries. `PanelMetaSchema` uses `z.object`, meaning extra fields on a panel's `static meta` object are silently stripped rather than rejected. While `PanelMeta` is internal (not a wire payload), a strict parse would catch copy-paste mistakes in panel declarations (e.g., an unexpected field indicating a wrong meta shape). No functional impact in Phase 5 since all panels have the correct field set.

**Fix:** Change `PanelMetaSchema = z.object({` to `PanelMetaSchema = z.strictObject({` — no downstream change needed since `PanelMeta = z.infer<typeof PanelMetaSchema>` stays the same.

---

### IN-02: `inventory-panel.ts` file-level column-layout JSDoc contradicts implementation

**File:** `packages/g2-app/src/panels/inventory-panel.ts:17`

**Issue:** The module-level JSDoc column layout comment states `"cols 5-21 (17 chars) + space + [M] (2024 weapons only)"` for the 2024 name column, but `NAME_WIDTH_2024 = 14` (line 64) and the internal `renderInventoryRow` JSDoc correctly states 14 chars. The file-level comment is stale — it describes 17 chars (cols 5-21) which does not match the actual 14-char constant. This discrepancy would mislead a reviewer or future editor of the column layout.

**Fix:** Update the file-level column layout JSDoc line 17 to read:
```
 *             OR cols 5-18 (14 chars) + " [M] " (5 chars, 2024 weapons only)
```

---

### IN-03: `void slots` suppression in `renderSpellsTabContent` is dead-variable boilerplate

**File:** `packages/g2-app/src/panels/spellbook-panel.ts:344-345`

**Issue:** `slots` is destructured from `snapshot.spells` at line 297 but only used in `renderSpellbookStandaloneContent`. In `renderSpellsTabContent`, `slots` is unused, and `void slots` is added on lines 344-345 to suppress the TypeScript `noUnusedLocals` error. Per INV-4, the correct fix is to not destructure the unused variable, keeping the code free of dead-variable suppressions.

**Fix:**
```typescript
// spellbook-panel.ts line 297 — do not destructure slots in renderSpellsTabContent:
const { spells: spellList } = snapshot.spells;
// Remove: const { spells: spellList, slots } = snapshot.spells;
// Remove lines 344-345: void slots;
```

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
