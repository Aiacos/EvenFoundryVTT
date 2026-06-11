---
"@evf/shared-protocol": minor
"@evf/foundry-module": minor
"@evf/g2-app": patch
---

Add frame_png wire format (greyscale lossless PNG ~1-5KB vs 427KB RGBA) for the map stream: new FramePngSchema in shared-protocol, DM-configurable captureIntervalMs + leading+trailing hook throttle + identical-frame hash-skip + PNG encode in foundry-module v0.1.15, frame_png decode in g2-app (frame_pixels back-compat retained).
