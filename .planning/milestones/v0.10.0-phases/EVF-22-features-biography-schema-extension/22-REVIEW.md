---
phase: EVF-22-features-biography-schema-extension
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - packages/foundry-module/src/readers/character-reader.ts
  - packages/foundry-module/src/types/foundry-globals.d.ts
  - packages/g2-app/src/panels/canvas-character-sheet-panel.ts
  - packages/g2-app/src/panels/character-sheet-tab-renderers.ts
  - packages/shared-protocol/src/index.ts
  - packages/shared-protocol/src/payloads/character.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase EVF-22: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 22 adds `FeatEntrySchema`/`BiographySnapshotSchema` to the shared protocol, `extractFeats`/`extractBiography` readers in `character-reader.ts`, Feats/Bio canvas tab renderers with within-tab scroll (`_scrollOffset`), and the `isScrollableTab` dispatch in `CanvasCharacterSheetPanel.onEvent`. The core logic is structurally sound: the `trait` vs. `personality` naming pitfall is correctly handled, biography is HTML-stripped reader-side with a renderer-side second pass, and the scroll-offset bounds are clamped by the renderers. No critical correctness bugs or security vulnerabilities were found.

Four warnings are raised: an unbounded `_scrollOffset` increment that grows without ceiling until the user changes tabs, a `_persistLastTab` call issued on every within-tab scroll gesture (wasted storage write when the tab ID has not changed), HTML paragraph/line-break tags stripped without inserting whitespace (causing word merging at sentence boundaries), and the `@internal` annotation in conflict with `export` on `extractFeats`/`extractBiography` (INV-4 API-surface violation). Four informational findings are also listed.

---

## Warnings

### WR-01: `_scrollOffset` grows without upper bound at the gesture layer

**File:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts:449`

**Issue:** The `scroll-down` branch for scrollable tabs (bio, feats) unconditionally increments `_scrollOffset` with no upper-bound guard at the gesture level:

```typescript
if (isScrollableTab) {
  // Within-tab scroll down (renderer clamps over-scroll)
  this._scrollOffset++;   // no ceiling
}
```

The renderers do clamp in `Math.min(scrollOffset, Math.max(0, lines.length - (ROW_COUNT - 1)))`, so there is no out-of-bounds array access or render crash. However `_scrollOffset` can grow to an arbitrarily large integer if the user holds swipe-down. After the user switches tabs (which resets to 0) and returns to bio/feats, the stored tab index is 0 — but if the panel instance is reused without remounting (edge case during rapid gesture sequences), the accumulated `_scrollOffset` may cause a jarring jump to the scroll floor position on the first paint instead of showing the top of content.

More practically, the comment "renderer clamps over-scroll" is only a partial mitigation: it prevents crashes but does not prevent a large accumulated offset from persisting invisibly in memory across snapshot updates, which is confusing to debug.

**Fix:** Clamp at the gesture site using content length derived from the snapshot, or apply a reasonable compile-time ceiling (e.g. `MAX_SCROLL_OFFSET = 200`) that is far above any realistic content length:

```typescript
const MAX_SCROLL_OFFSET = 200; // far above any realistic bio/feats line count
if (isScrollableTab) {
  this._scrollOffset = Math.min(this._scrollOffset + 1, MAX_SCROLL_OFFSET);
}
```

---

### WR-02: `_persistLastTab` called on every within-tab scroll (wasted Even Hub writes)

**File:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts:456`

**Issue:** `void this._persistLastTab()` is placed at the bottom of the entire `case 'scroll'` block — it fires on every scroll gesture, including within-tab `_scrollOffset++` scrolls on bio and feats tabs where `_activeTabIndex` has NOT changed. This writes the same tab-ID value to Even Hub storage on every swipe-down, which is a no-op semantically but generates unnecessary async I/O on every gesture. Given G2 gestures fire at up to 5 fps sustained and Even Hub's `setLocalStorage` is an async BLE-channel write, this can saturate the storage path during fast scrolling.

```typescript
// Current (always persists, even when tab index unchanged):
void this._persistLastTab();  // line 456 — bottom of entire 'scroll' case

// Fix: only persist when _activeTabIndex actually changed:
if (!isScrollableTab || (gesture.direction === 'up' && this._scrollOffset === 0) ||
    (gesture.direction === 'up' && !isScrollableTab)) {
  void this._persistLastTab();
}
```

Or more cleanly, track whether the tab index changed before persisting:

```typescript
const prevTabIndex = this._activeTabIndex;
// ... mutation logic ...
if (this._activeTabIndex !== prevTabIndex) {
  void this._persistLastTab();
}
```

---

### WR-03: HTML block-level tags stripped without injecting whitespace — adjacent sentence content merges

**File:** `packages/foundry-module/src/readers/character-reader.ts:522` and `packages/g2-app/src/panels/character-sheet-tab-renderers.ts:820`

**Issue:** Both `stripHtml` implementations use `html.replace(/<[^>]*>/g, '')`. This correctly removes tag markup but does not insert a space or newline at tag boundaries. Foundry's biography HTMLField typically uses `<p>`, `</p>`, `<br>`, and `<li>` as structural separators. After stripping:

- `<p>Grew up in Waterdeep.</p><p>Later adventured.</p>` → `"Grew up in Waterdeep.Later adventured."` — no space between sentences.
- `Line 1<br>Line 2` → `"Line 1Line 2"` — no space at line break.

The `wordWrap` function in the renderer splits on `\s+`, so merged text is treated as a single long word and will be hard-wrapped mid-word if it exceeds `INNER_WIDTH`. For feat descriptions the same merge happens via the reader-side strip.

This is a content-fidelity defect, not a security issue. The biography editor in Foundry almost universally uses `<p>` and `<br>` for structure.

**Fix:** Replace block-level closing/self-closing tags with a space before removing all remaining tags:

```typescript
function stripHtml(html: string): string {
  // Insert space at block-level boundaries to prevent word merging.
  return html
    .replace(/<\/?(p|br|li|ul|ol|h[1-6]|div|blockquote)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s{2,}/g, ' ')  // collapse multiple spaces
    .trim();
}
```

This fix must be applied identically in both `character-reader.ts` (reader-side) and `character-sheet-tab-renderers.ts` (renderer-side defence-in-depth), and the duplication comment in the reader should be updated accordingly.

---

### WR-04: `extractFeats` and `extractBiography` are `export`ed but annotated `@internal` — INV-4 API-surface violation

**File:** `packages/foundry-module/src/readers/character-reader.ts:542,581`

**Issue:** Both `extractFeats` and `extractBiography` carry a `@internal` JSDoc tag but are declared with the `export` keyword. INV-4 requires zero dead/unreachable code and a clean public API surface. An `@internal` symbol that is `export`ed is a contradiction: it is visible to any code that imports from the file path, even though the `@internal` tag signals it should not be part of the public contract.

The only callers outside the file are in `readers.test.ts` (same package, test-only). Exporting purely for test access without a package-level re-export is an acceptable pattern when documented, but the `@internal` annotation makes this ambiguous.

**Fix:** Either:

1. Keep `export` and remove `@internal`, replacing it with `@testonly` or a `@remarks` explaining the export exists solely for unit-test access within the `foundry-module` package.
2. Use a module-augmentation pattern or re-export from a `_test-exports.ts` shim so the production reader surface is free of test-only exports.

The simplest compliant fix under INV-4 conventions is option 1 with an explicit `@remarks`:

```typescript
/**
 * Extract character feats/features from `actor.items.contents` (Phase 22 Plan 22-02;
 * RDATA-03).
 * ...
 * @remarks Exported for unit-test access within the `foundry-module` package only.
 *          Not part of the stable public API — prefer {@link getCharacterSnapshot}.
 */
export function extractFeats(actor: ...): FeatEntry[] {
```

---

## Info

### IN-01: `getCharacterSnapshot` JSDoc does not document Phase 22 additions

**File:** `packages/foundry-module/src/readers/character-reader.ts:688`

**Issue:** The `getCharacterSnapshot` function has a pattern of documenting each phase's additions in its JSDoc (Phase 4b, Phase 5, Phase 5 Plan 05-04, Phase 21 Plan 21-01). Phase 22 adds `feats: extractFeats(actor)` and `biography: extractBiography(actor)` at lines 746–747 but the JSDoc block has no corresponding Phase 22 addition note. This breaks the documentation pattern and makes it harder to trace the changelog from the function's docs.

**Fix:** Add a Phase 22 addition paragraph matching the existing pattern:

```typescript
 * Phase 22 Plan 22-02 addition: reads `actor.items` feats via {@link extractFeats}
 * and `actor.system.details.*` biography via {@link extractBiography} (RDATA-03,
 * RDATA-04). Both fields are OPTIONAL on the schema — absent when all content is
 * empty or actor not yet synced (D-22.1/D-22.4 contract).
```

---

### IN-02: `PASSIVE_ABBR[locale] ?? PASSIVE_ABBR.en` fallback is unreachable dead code (INV-4)

**File:** `packages/g2-app/src/panels/character-sheet-tab-renderers.ts:427`

**Issue:** `PASSIVE_ABBR` is typed as `Record<HudLocale, ...>` and contains entries for all six `HudLocale` values (`it`, `en`, `de`, `es`, `fr`, `pt-br`). The expression `PASSIVE_ABBR[locale] ?? PASSIVE_ABBR.en` therefore has an unreachable `?? PASSIVE_ABBR.en` fallback — `PASSIVE_ABBR[locale]` is always defined for a valid `HudLocale`. INV-4 prohibits dead code.

**Fix:** Remove the unreachable fallback:

```typescript
const abbr = PASSIVE_ABBR[locale];
```

If a future locale is added to `HudLocale` before being added to `PASSIVE_ABBR`, TypeScript will catch the missing key at compile time (since `Record<HudLocale, ...>` requires all keys).

---

### IN-03: `TABS[this._activeTabIndex] ?? 'main'` fallback in `_persistLastTab` is unreachable (INV-4)

**File:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts:593`

**Issue:** `_activeTabIndex` is always in `[0, TABS.length - 1]` via modulo arithmetic in every mutation site. `TABS[i]` for `i` in that range is always defined. The `?? 'main'` fallback is dead code under INV-4.

**Fix:**

```typescript
await this._bridge.setLocalStorage(PERSIST_KEY, TABS[this._activeTabIndex]);
```

If `noUncheckedIndexedAccess` is enabled (it is per CLAUDE.md INV-4), TypeScript would flag `TABS[this._activeTabIndex]` as `string | undefined`. The correct mitigation is a non-null assertion with a comment:

```typescript
// _activeTabIndex is always in [0, TABS.length-1] via modulo — never undefined.
// biome-ignore lint/style/noNonNullAssertion: invariant enforced by all mutation sites
await this._bridge.setLocalStorage(PERSIST_KEY, TABS[this._activeTabIndex]!);
```

---

### IN-04: `FeatEntrySchema.category` has no `min(1)` constraint — schema accepts empty string

**File:** `packages/shared-protocol/src/payloads/character.ts:488`

**Issue:** `category: z.string()` accepts the empty string `''`. The reader guarantees non-empty (it applies `typeValue.length > 0 ? typeValue : 'general'`), and the renderer also re-normalizes empty to `'general'`. But a third-party or future caller that constructs a `FeatEntry` object directly and passes `category: ''` on the wire would pass Zod validation, producing a feat bucketed silently under 'general'. The schema does not enforce the documented invariant that `category` is the non-empty dnd5e featureType key or `'general'`.

**Fix:** Add `min(1)` to match `FeatEntrySchema.name`:

```typescript
category: z.string().min(1),
```

The reader already guarantees this; adding it to the schema closes the contract at the validation boundary.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
