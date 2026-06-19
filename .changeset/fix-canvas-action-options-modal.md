---
"@evf/g2-app": patch
---

Fix canvas-mode crash when activating an item/spell from the interactive
Inventario/Libro panels (Feature 001 Option B). Tapping an entry pushed the
glyph `ActionOptionsModal` (a native text container), which violates the
canvas-layer contract (`{ image: 0, text: 0 }`, ADR-0013 Amendment 1) and threw
`canvas mode: layer 'action-options-modal' declared non-zero container count`,
falling back to the map. Added `CanvasActionOptionsModal` — a canvas-composited
subclass that reuses the parent's gesture + `tool.invoke` envelope logic verbatim
and only swaps the rendering surface (compact centred box, `draw()` no-op,
`getContainerCount()` → `{ image: 0, text: 0 }`). Wired both `canvasItemDispatch`
and `canvasSpellDispatch` in boot-engine-core to the new modal.
