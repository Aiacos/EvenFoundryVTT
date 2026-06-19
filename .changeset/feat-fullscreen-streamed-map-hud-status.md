---
'@evf/g2-app': patch
'@evf/foundry-module': patch
---

Canvas-mode full-screen streamed map + hud-status native container (quick-task 260610-d42)

- canvas-extractor: continuous ~1Hz interval capture + canvasPan hook replaces one-shot request model
- MapCanvasLayer at z=0: full-screen Foundry viewport stream routed from scene-input in canvas mode, replacing the legacy RasterController scene path
- hud-status native G2 text container (id=5): status line (PF/CA/LV) pushed via bridge.textContainerUpgrade on each character.delta; opaque full-frame fill removed so z=0 map shows through
- canvas-mode root double-tap exit restored: root-exit-dispatcher now fires on getTopLayer()===null (both canvas and glyph modes)
