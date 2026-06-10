---
"@evf/foundry-module": patch
---

`canvas-extractor` now fit-downscales the WHOLE Foundry scene (box-average, aspect preserved, letterboxed) onto the canonical 400×200 frame instead of center-cropping a 400×200 window (~4% of a 1920×1080 render). Pure-JS filter — no OffscreenCanvas dependency; 1920×1080 → 400×200 in ~18 ms. Live-sim verified with the production extractor: full battlemap (3 rooms, corridor, water, columns, tokens) renders on the glasses.
