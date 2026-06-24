---
"@evf/g2-app": minor
---

Canvas Inventory/Spellbook taps now open the glasses-native **TargetPicker** when
the tapped weapon/spell needs a target, instead of always dispatching with
`targets: []` (which made MidiQOL fire "at nothing"). `resolveRequest` now derives
`requiresTarget` from the same heuristic the glyph panels use — spells with a real
range that are not reactions, and inventory items that are not consumables. The
boot-side `canvasItemDispatch` / `canvasSpellDispatch` branch on that flag: when a
target is required they open the new `CanvasTargetPickerPanel` (z=2 overlay,
combatants-only MVP) built from a cached `CombatSnapshot` (boot subscribes to
`combat.turn` / `combat.state` on the stable `wsEventBus`); the picker appends
`targets: [chosen]` to the `tool.invoke`. Self/area/reaction spells and consumables
still dispatch directly. The existing glyph `TargetPickerPanel` renders to a TEXT
container (`{image:0,text:1}`) and trips LayerManager's canvas container-budget
assertion in canvas mode, so a canvas-rendered picker (`{0,0}`, paints to the shared
compositor) was added, reusing `resolveValidTargets` + `describeTargetRow`. Per-actor
write authz (ADR-0014) is unchanged.
