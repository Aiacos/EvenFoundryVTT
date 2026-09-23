# @evf/shared-render

ASCII grid model + INV-1 layout integrity snapshot matcher for Vitest 4.

## Pattern (INV-1)

- Character-precision rectangular grid (`AsciiGrid` — every row exactly `width` cells)
- `frameColumns(columns, width)` frames N fixed-width columns side by side (the G2
  thirds layout: sheet │ map │ context); `columnBoundaries(grid)` returns the
  boundary indices per row so tests can assert they never move between states
- `matchAsciiFixture(grid, fixturePath)` wraps Vitest's `expect.toMatchFileSnapshot()`
- LF line endings, no BOM, no trailing whitespace (`.gitattributes` + `.editorconfig`)

Characters stand in for the proportional G2 firmware font: pixel budgets are enforced
by the renderer (`@evenrealities/pretext` measurement in `packages/g2-app/src/hud`),
the grid checks structure (regions, line counts, column boundaries).

## Fixtures

`src/fixtures/thirds.<mock>.<locale>.<variant>.txt` — mocks M01–M11 of
`docs/design/g2-thirds-layout.md`, rendered by
`packages/g2-app/src/hud/__tests__/inv1-layout.test.ts` (IT min content, EN max
content). The same test asserts identical boundaries for every state × IT/EN × min/max.

## See also

- `Specs.md` §7.1a
- `docs/design/g2-thirds-layout.md`
