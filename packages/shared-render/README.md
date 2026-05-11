# @evf/shared-render

ASCII grid model + INV-1 layout integrity snapshot matcher for Vitest 4.

**Status:** Phase 1 scaffold. Real implementation (`ascii-grid.ts` + `snapshot.ts` + `fixtures/`) lands in Plan 03 (Wave 2).

## Pattern (D-1.11 + INV-1)

- Character-precision rectangular grid (`AsciiGrid` class — every row exactly `width` cells)
- LF line endings, no BOM, no trailing whitespace (enforced by `.gitattributes` + `.editorconfig` from Plan 01)
- Wraps Vitest 4's built-in `expect.toMatchFileSnapshot()` via custom matcher `matchAsciiFixture(grid, fixturePath)`
- Phase 4a expands to full column-misalignment reporting per INV-1 ck 11

## Consumers

- `@evf/g2-app` Phase 4a (real Status HUD + raster panel snapshots)
- `@evf/foundry-module` Phase 2 (less critical — module UI is Foundry-shaped, not G2 ASCII)
- `packages/g2-app/src/__tests__/example-status-hud.test.ts` (Plan 03 D-1.16 wire-up demo)

## See also

- `Specs.md` §7.1a, §7.14.4 ck 11-15
- `docs/architecture/0001-layered-ui-model.md` (Wave 2)
