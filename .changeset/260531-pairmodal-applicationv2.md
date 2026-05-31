---
"@evf/foundry-module": patch
---

Fix the "Pair Device" dialog crashing on Foundry v13+ with *"PairModal … is not renderable
because it does not implement _renderHTML and _replaceHTML"*. `PairModal` mixed v1 `Application`
patterns (`defaultOptions.template`, `getData`, `_activateListeners`) onto the abstract
`ApplicationV2` base. Converted it to the real v13 API: `HandlebarsApplicationMixin(ApplicationV2)`
+ `static DEFAULT_OPTIONS`/`PARTS`, `_prepareContext()`, `_onRender()` (reads `this.element`),
and `render({ force: true })`. The hand-rolled `foundry.applications.api` type declaration gained
`HandlebarsApplicationMixin` + the v13 ApplicationV2 surface.
