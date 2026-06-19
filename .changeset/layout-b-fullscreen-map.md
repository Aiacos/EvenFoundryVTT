---
'@evf/g2-app': minor
'@evf/foundry-module': minor
'@evf/shared-protocol': minor
---

Layout B — full-screen 576×288 map: 4 image tiles of 288×144 (SDK verbatim max, INV-2 drift corrected from 200×100) cover the entire G2 display; the extractor emits 576×288 frames; status/fps move into a translucent raster corner card (top-right) drawn over the map; the native hud-status container is removed (the host renders image containers over text).
