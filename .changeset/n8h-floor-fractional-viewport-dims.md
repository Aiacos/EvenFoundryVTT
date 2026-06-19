---
'@evf/foundry-module': patch
---

Floor fractional renderer.screen dims before RenderTexture.create — at devicePixelRatio 1.333 Foundry reports e.g. 2348.25×824.25; PIXI floors the texture internally, so the fractional expected-length check rejected EVERY frame ("pixel buffer length mismatch"). Live-verified root cause on the real Forge client (2026-06-10).
