---
"@evf/foundry-module": patch
---

Lower the default `captureFps` 30 → **5** (the spec's committed frame-rate target,
Specs.md §7.4b.6.1) for real-glasses performance. 30 fps was tuned for the dev simulator
(powerful CPU, no real BLE); on physical G2 it floods the phone→glasses BLE link
(~540 KB/s vs ~25 KB/s sustained) and the phone's per-frame canvas/raster decode, causing
HUD lag. 5 fps keeps the map glanceable with BLE + CPU headroom; the identical-frame skip
means a static map still costs ~0, so the cap only bounds the burst during map motion.
DMs with spare bandwidth can raise it live (1–60) in the module settings. Bumps the
Foundry module to v0.1.55.
