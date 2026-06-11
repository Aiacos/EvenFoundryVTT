---
'@evf/g2-app': patch
---

Add on-glasses HUD dither toggle (`[D] Dither` menu item in Quick Action menu).

Users can now switch between Bayer 4×4 ordered-dither (ON, default — smooth gradients) and direct nearest-of-16-level quantization (OFF — crisper/blockier) without a rebuild. The choice persists across reboots via the Even Hub kv store (`view.hud.dither`). The flag is honored by both the Worker tile-build path and the synchronous fallback (byte-identical per mode).
