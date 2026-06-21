---
"@evf/g2-app": minor
---

Canvas Inventory/Spellbook panels now mirror the Skills panel: a `▶` cursor
windows the flat item/spell list (swipe-up/down moves it) and a TAP uses the
highlighted item / casts the highlighted spell DIRECTLY via a `use-item` /
`cast-spell` `tool.invoke` (boot-side `canvasItemDispatch` / `canvasSpellDispatch`),
bypassing the Action-Options confirm modal. This fixes two bugs: the glyph
scroll-offset renderer showed no cursor, and the modal path silently swallowed the
dispatch for any item/spell with `requiresTarget` (no canvas target picker).
Targeting is resolved Foundry-side by `activity.use()`; per-actor write authz
(ADR-0014) is unchanged. Shared cursor-windowing (`windowCursorRows` /
`clampCursorIndex`) is extracted into `canvas-selectable-list.ts` and reused by the
Skills panel (DRY).
