---
"@evf/shared-protocol": patch
"@evf/foundry-module": patch
"@evf/g2-app": patch
---

Fix the scene-frame pipeline dimension contradiction that made every `frame_pixels` payload un-processable: `FramePixelsSchema` capped frames at 288×144 (pre-ADR-0013 SDK-polyfill bound) while `raster-worker.ts` rejects anything that is not the canonical 400×200 raster region. Schema bounds now admit 20–400 × 20–200; `canvas-extractor` always emits exactly 400×200 (center-crop + opaque-black letterbox, pure byte copy); `scene-input` center-pads undersized frames to the canonical region as consumer-side defence. Live-sim verified: a real 400×200 scene frame now dithers and renders on the glasses end-to-end.
