---
phase: 14-raster-z-0-5-idle-content-infill
reviewed: 2026-05-17T18:30:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
  - packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts
  - packages/shared-render/src/fixtures/raster-overlay-open.it.txt
  - packages/shared-render/src/fixtures/raster-overlay-open.en.txt
  - packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt
  - packages/foundry-module/src/readers/spell-pack-reader.ts
findings:
  critical: 0
  warning: 4
  info: 7
  total: 11
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-05-17T18:30:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 14 ships test-only changes plus three new INV-1 ASCII fixtures and a single semantic-neutral auto-format on `spell-pack-reader.ts:168`. The substantive payload is:

- 1 new test in `layer-manager.test.ts` (LMT-DD-07, four assertions on atomicity / reference round-trip / toast carve-out).
- 7 new tests in `z05-state-machine-fixtures.test.ts` (Z05-FX-01..03 fixture round-trip + Z05-INV-01..04 cross-state invariants).
- 3 new 96×24 fixtures, all confirmed character-precise via codepoint-count probe.

## Narrative Findings (AI reviewer)

### Adversarial checks that PASSED

I confirmed the following load-bearing properties by direct inspection of the fixtures and by running the suites:

1. **Codepoint width**: every row of every new fixture is exactly 96 cells when sliced with `[...string]` (the same iterator `AsciiGrid.fromString` uses). All 7 active fixtures match. No surrogate / multi-codepoint regressions.
2. **Frame column reconciliation**: the PLAN cited `║` at cols `{0, 71, 95}` but the frozen baselines (and every fixture, including the new ones) put `║` at cols `{0, 68, 95}`. The deviation note in `14-01-SUMMARY.md` is factually correct; tests use the real columns. I verified row 0/2/21/23 corners across all 7 fixtures and `║` at col 68 across rows 3, 17, 18, 19, 20 in every fixture. The reconciliation is sound.
3. **Z05-INV-02 byte-identity claim**: I diffed cols 69..95 across rows 3..20 between `glyph-scene.raster-idle.txt` and `raster-overlay-open.en.txt` — 0 mismatches. Same comparison for the IT pair: 0 mismatches (though no test asserts it — see WR-01).
4. **Z05-INV-04 literal anchors**: `gridB[18][4..14]` = `"┌─[ SHEET ·"` and `gridB[18][71..82]` = `"▶ Bless (7r)"` — both exact matches against the fixtures, off-by-one safe.
5. **LMT-DD-07 assertions**: cumulative `bridge.rebuildPageContainer` call count = 2 across both bundles in the EN scenario (matches the assertion). Reference-equality round-trip of `idle` is exercised correctly. Toast carve-out sub-scenario uses a fresh `LayerManager`/`bridge` so state isolation is clean.
6. **spell-pack-reader.ts:168 auto-format**: git diff confirms the change is whitespace-only — a single-line function signature split across three lines per Biome `lineWidth: 100`. Zero semantic impact, zero runtime risk.
7. **Suites green**: `vitest run -t "Z05"` → 7 passed; `vitest run -t "LMT-DD-07"` → 1 passed.

No BLOCKERS. The findings below are coverage gaps and quality issues that degrade the strength of the contract, not bugs in shipped code.

## Warnings

### WR-01: Z05-INV-02 leaves IT locale Status HUD column unbound

**File:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts:132-146`
**Issue:** Z05-INV-02 only asserts byte-identity of the right Status HUD column (cols 69..95, rows 3..20) for the EN pair (`glyph-scene.raster-idle.txt` ↔ `raster-overlay-open.en.txt`). The corresponding IT pair (`glyph-scene.raster-idle-it.txt` ↔ `raster-overlay-open.it.txt`) is **not asserted**. UI-SPEC §8.2 invariant 2 ("byte-identical in A and B") is a per-locale property — a future regression that mutates IT-locale Status HUD on overlay mount would silently pass CI. The IT locale is the project's primary locale per CLAUDE.md, which makes this gap material rather than cosmetic. I verified empirically that today's IT pair has 0 mismatches; the test should lock that.
**Fix:**
```typescript
it('Z05-INV-02b (UI-SPEC §8.2 invariant 2): right Status HUD column (cols 69..95) is byte-identical between State A IT and State B IT for rows 3..20', () => {
  const gridA = loadSceneFixture('glyph-scene.raster-idle-it.txt');
  const gridB = loadSceneFixture('raster-overlay-open.it.txt');
  for (let row = 3; row <= 20; row++) {
    for (let col = 69; col <= 95; col++) {
      expect(gridA.at(col, row), `IT Status HUD col ${col} row ${row}`).toBe(gridB.at(col, row));
    }
  }
});
```

### WR-02: Z05-INV-01 cross-state assertion mixes locales — diagnostic value diluted

**File:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts:110-130`
**Issue:** The test compares frame chars across `glyph-scene.raster-idle.txt` (canonical/EN), `raster-overlay-open.en.txt` (EN) and `glyph-scene.glyph-idle-z05.it.txt` (IT). Because frame characters are locale-independent in the current fixtures, this works today, but the heterogeneous locale set makes the assertion semantically weaker than the UI-SPEC §8.2 invariant 1 contract ("same column in every fixture, every locale"). A future planner who adds `glyph-scene.glyph-idle-z05.en.txt` with a different frame would not be flagged because no test compares same-locale pairs across all three states.
**Fix:** Either (a) explicitly document the canonical/EN/IT mix in the test name and the JSDoc so it's clear the test exercises locale-shared frame contract only, or (b) parameterize over locale pairs (EN-EN-EN and IT-IT-IT) once a `glyph-scene.glyph-idle-z05.en.txt` exists.

### WR-03: Z05-INV-01 only samples 12 cells; internal frame columns 1..67 / 67-95 on rows 3-20 unbound

**File:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts:115-129`
**Issue:** The test samples only `FRAME_COLS × FRAME_ROWS` = 3 × 4 = 12 cells per pair. The UI-SPEC §8.2 invariant 1 says "frame chars at cols 0, 71 (effective 68), 95 and rows 0, 2, 21, 23". A regression that shifts the central `║` only on internal rows (e.g., rows 4..20) — for instance a frame redraw bug that moves col 68 → col 67 across the middle band — would silently pass Z05-INV-01 because rows 4-20 are not sampled. Z05-INV-02 partially mitigates this for cols 69..95 (EN only — see WR-01), but cols 1..67 are wholly unbound.
**Fix:** Extend the cross-state frame assertion to all 24 rows for cols 0, 68, 95:
```typescript
for (let row = 0; row < 24; row++) {
  for (const col of FRAME_COLS) {
    const a = gridA.at(col, row);
    const b = gridB.at(col, row);
    expect(a, `frame col ${col} row ${row} A↔B`).toBe(b);
    expect(a, `frame col ${col} row ${row} A↔C`).toBe(gridC.at(col, row));
  }
}
```

### WR-04: LMT-DD-07 conflates four behavioral assertions into one `it` block — granularity loss on failure

**File:** `packages/g2-app/src/engine/__tests__/layer-manager.test.ts:485-555`
**Issue:** Four distinct UI-SPEC contracts (atomicity, no-transient-state, suspended-z05 round-trip, toast carve-out under race) collapse into a single `it(...)` block. When the suite fails, the first failing `expect` aborts the test and the remaining contracts' state is not surfaced. The cumulative call-count assertion at line 528 (`toBe(2)`) is especially fragile: if Assertion 3 ever needs an additional bundle (e.g., to cover a stash-tombstone variant), the magic `2` must change. Also, Assertion 4 builds an entire second `LayerManager`/`bridge` inline rather than in a nested `describe`/`beforeEach`, which makes the four-in-one block harder to reason about and trivially harder to bisect with `-t "LMT-DD-07-..."` filters.
**Fix:** Split into four sibling `it(LMT-DD-07a/b/c/d, …)` blocks, each with a focused arrange-act-assert. Suggested split:
- `LMT-DD-07a`: single-bundle atomicity (one flush, post-condition exclusivity).
- `LMT-DD-07b`: inverse bundle reference-equality round-trip, cumulative flush count = 2.
- `LMT-DD-07c`: toast carve-out under overlay-mount race (fresh `lm`/`bridge`).

## Info

### IN-01: Magic-number slice lengths in Z05-INV-04 should be derived from the asserted literal

**File:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts:168, 175`
**Issue:** `sliceCells(gridB, 18, 4, 11)` and `sliceCells(gridB, 18, 71, 12)` pass `11` and `12` as bare integers. Both lengths are derivable from the asserted literal — `'┌─[ SHEET ·'.length === 11`, `'▶ Bless (7r)'.length === 12`. Drift between the length parameter and the asserted literal (e.g., changing the literal to `'┌─[ SHEET '` without adjusting `11`) would produce a confusing diff rather than a clean "off-by-one" failure.
**Fix:** Inline `const` near the assertion:
```typescript
const expectedHeader = '┌─[ SHEET ·';
const expectedHud = '▶ Bless (7r)';
expect(sliceCells(gridB, 18, 4, expectedHeader.length)).toBe(expectedHeader);
expect(sliceCells(gridB, 18, 71, expectedHud.length)).toBe(expectedHud);
```

### IN-02: `loadSceneFixture` duplicated across test files

**File:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts:46-50`
**Issue:** The helper re-implements the loader already present in `packages/shared-render/.../snapshot.test.ts` (acknowledged in the file header). Two copies of a `resolve(__dirname, '../../../../shared-render/src/fixtures', filename)` path mean any future move of the fixtures directory requires updating both. A shared utility in `@evf/shared-render/src/test-utils.ts` (or extending the public `matchAsciiFixture` to also expose a `loadAsciiFixture(filename)`) would consolidate.
**Fix:** Extract to `packages/shared-render/src/test-utils.ts` and re-export from the package index; both test files import from there.

### IN-03: `sliceCells` parameter order `(grid, row, col, len)` flips the `(col, row)` convention used by `AsciiGrid.at`

**File:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts:59`
**Issue:** `AsciiGrid.at(col, row)` puts column first; `sliceCells(grid, row, col, len)` puts row first. The file uses both APIs in adjacent assertions (Z05-INV-01 uses `at(col, row)`, Z05-INV-04 uses `sliceCells(grid, row, col, len)`). Cognitive cost is low but non-zero. If the project ever introduces a generic `sliceRow(grid, col, row, len)` it should match `.at`'s convention.
**Fix:** Rename signature to `sliceCells(grid, col, row, len)` and adjust both call sites; or wrap in a thin `grid.sliceRow(col, row, len)` method on `AsciiGrid` (preferable — co-located with the model that owns `.at()`).

### IN-04: Test names omit locale qualifier despite testing locale-shared content

**File:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts:164`
**Issue:** Z05-INV-04's test name says "State B row 18 has z=2 panel header at cols 4..14 (`┌─[ SHEET ·`)" without saying which locale. The test loads `raster-overlay-open.en.txt`. The literal `▶ Bless (7r)` happens to be locale-shared in the current fixtures, but adding `(EN)` to the test name removes the ambiguity for future readers.
**Fix:** Rename to `Z05-INV-04 (EN): State B row 18 …`.

### IN-05: FRAME_COLS and Status HUD slice ranges are not linked by a single source of truth

**File:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts:66-67, 137, 175`
**Issue:** The central divider column appears as `68` in `FRAME_COLS`, `69` in the Status HUD start (Z05-INV-02), and `71` in Z05-INV-04 (left edge of `▶ Bless`). All three values are mutually derived (divider at 68; status content starts at 69; specific HUD literal starts at 71). A single re-confirmation would require touching three magic numbers.
**Fix:** Hoist all column anchors into named constants at the top of the file:
```typescript
const CENTRAL_DIVIDER_COL = 68;
const STATUS_HUD_FIRST_CONTENT_COL = CENTRAL_DIVIDER_COL + 1;     // 69
const STATUS_HUD_LAST_COL = 95;
const Z2_PANEL_FIRST_COL = 4;
```

### IN-06: Z05-FX-01..03 fixture round-trip with `matchAsciiFixture` is a tautology on `toMatchFileSnapshot` semantics

**File:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts:74-102`
**Issue:** `matchAsciiFixture` is defined as `expect(grid.toString() + '\n').toMatchFileSnapshot(fixturePath)`. On first run it WRITES the fixture; on subsequent runs it diffs. Z05-FX-01..03 load each new fixture, serialize it back through `AsciiGrid.fromString` → `.toString()`, and assert against the same file — i.e., they verify the round-trip preserves bytes. This catches AsciiGrid serializer regressions but does NOT catch fixture content drift (because the matcher would overwrite on `-u`). The protection is real but narrower than the test name suggests ("matches its own canonical bytes"). Worth annotating in the JSDoc to avoid future false confidence.
**Fix:** Add to JSDoc on each Z05-FX-* test:
```typescript
/** Note: verifies AsciiGrid round-trip stability, NOT byte-stability of the fixture itself.
 *  Fixture byte-stability is guarded by git diff + INV-1 cross-state tests below. */
```

### IN-07: spell-pack-reader.ts:168 auto-format — verified semantic-neutral

**File:** `packages/foundry-module/src/readers/spell-pack-reader.ts:168-170`
**Issue:** No defect. Git diff confirms a 1-line single-statement signature split across three lines per Biome `lineWidth: 100`. No control-flow change, no behavioral change, no runtime risk. Recorded for traceability only.
**Fix:** None.

---

## Out-of-scope observations (NOT findings — informational only)

The pre-existing test patterns in `layer-manager.test.ts` Tests 3-7 (try/catch + `throw new Error('expected mount to throw')`) are an anti-pattern relative to Vitest's `expect(() => …).toThrow()`, but they pre-date Phase 14 by many commits. Out of scope for this review.

---

_Reviewed: 2026-05-17T18:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
