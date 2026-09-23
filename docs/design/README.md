# 🎨 Design — EvenFoundryVTT G2 HUD

Design sources for the glasses HUD and the pairing flow. The **executable** layout
contract is the per-zone pixel fixtures in
[`packages/shared-render/src/fixtures/`](../../packages/shared-render/src/fixtures/)
(INV-1); the documents below explain *why* the screens look the way they do.

## 📚 Documents

| Document | Status | What it covers |
|---|---|---|
| [`g2-sheet-ux.html`](g2-sheet-ux.html) | **current** (UX round 2, implemented) | Brief, principles, paper-sheet / D&D Beyond mapping, 5-zone architecture + SDK budget, visual language and icons, gestures, 12 screens, pixelated original-art map, per-player pairing (ADR-0017), real simulator screenshots |
| [`img/`](img/) | current | Real `evenhub-simulator` 0.9.5 screenshots of S1–S12 (576 × 288, 16 levels) |
| [`g2-thirds-layout.md`](g2-thirds-layout.md) | superseded (UX round 1) | First v0.12 layout in three columns. Still the reference for the pairing mocks P01–P03 and the phone page |

## 🏗️ Related decisions

- [ADR-0016](../architecture/0016-direct-foundry-streaming.md) — direct Foundry → G2 streaming, QR sideload
- [ADR-0017](../architecture/0017-player-owned-glasses-hybrid-projector.md) — every player owns their glasses key; hybrid projector
- [ADR-0018](../architecture/0018-dnd-sheet-hud-pixel-renderer.md) — D&D-sheet HUD on a pure-TypeScript pixel renderer

## 🐞 Verifying a design change

1. Update the renderer in `packages/g2-app/src/hud/` and the demo states in `src/demo/`.
2. Regenerate fixtures deliberately (`pnpm vitest --run --project g2-app -u`) and review the diff.
3. Run the simulator loop: `pnpm --filter @evf/g2-app sim:check -- --sim "npx -y @evenrealities/evenhub-simulator@0.9.5"` (needs a display).
4. Refresh the screenshots in `img/` and, if the UX changes, this folder's documents — in the same commit as the code (INV-3).
