---
'@evf/foundry-module': patch
'@evf/bridge': patch
'@evf/g2-app': patch
'@evf/shared-protocol': minor
---

Latency-audit follow-up: residual fps fixes + map brightness + bidirectional display-settings sync.

**Performance (residual latency removed):**
- foundry-module: the capture loop no longer awaits the native encode — `runEncodeJob` is fire-and-forget behind the single-flight latest-wins queue, so the loop re-arms after acquire+process only (the encode genuinely overlaps the next capture). Raises the producer ceiling well past 30 fps.
- foundry-module: lossy WebP wire format via `OffscreenCanvas.convertToBlob` (new `mapWebpQuality` world setting, default 75) — ~4–7× smaller than PNG, cutting the per-hop bandwidth from ~22 to ~4 Mbit/s at 30 fps. Transparent PNG fallback on hosts without WebP encoding.
- foundry-module: the `/internal/delta` frame POST is now single-flight latest-wins with a 5 s `AbortSignal.timeout`, so a slow WAN can no longer accumulate unbounded in-flight requests.
- bridge: frame deltas (`frame_png`/`frame_pixels`/`frame_stats`) are excluded from the replay buffer (no ~160 MB/session growth, no stale-frame replay burst on reconnect) and reuse the current seq (gap detection stays correct). Per-session `bufferedAmount` backpressure drops frames for a saturated client instead of queuing unbounded.
- g2-app: the HudDeltaDriver throttle (33 ms ≈ 30 fps cap) is now configurable per boot via `BootEngineOpts.hudMinIntervalMs` / `?hudms=` for lab tuning.

**Map brightness:** new `mapBrightness` client setting (−100..+100 luma gain) applied module-side before the 16-level quantize, with on-glasses `[+]`/`[-]` Quick Action menu rows.

**Bidirectional display-settings sync:** the five map settings (dither, brightness, WebP quality, capture fps, contrast-normalize) stay in sync between Foundry and the glasses and are controllable from both. Downstream over a new `settings.display` delta (cached by the bridge, pushed on connect); upstream over a `client_setting` WS message that the bridge piggybacks on the module's next frame-POST response (no new connection / no polling — the module is push-only). New `@evf/shared-protocol` payload `settings-display.ts`.
