---
"@evf/g2-app": patch
"@evf/bridge": patch
---

Fix 3 G2 SDK-conformance findings: portrait image-tile target (CRITICAL), audio-stream WS bearer auth for WKWebView (IMPORTANT), and R1 wire-kind provenance comment (INV-2).

**B1 — CRITICAL (g2-app):** Portrait override in `map-base-layer.ts` was targeting `'map-capture'` (the TEXT capture container) with a non-existent `index` field hidden behind an `as unknown as` cast. Fixed to use a typed `ImageRawDataUpdate({ containerName: 'map-tile-${slot}', imageData: bytes })` targeting the correct IMAGE tile container, and check `ImageRawDataUpdateResult.isSuccess(result)` with a `console.warn` on failure. INV-4 cast removed.

**B2 — IMPORTANT production bug (g2-app + bridge):** Browser/WKWebView WebSocket ignores the `headers` option — the bearer was silently dropped in production, causing close 1008 on every audio-stream WS upgrade. Fixed both sides: `audio-capture.ts` appends `?token=<encoded>` to the WS URL (with the Authorization header retained for the Node-ws test path); `audio-stream-route.ts` reads `?token=` as a header fallback, routing both through the same `tokenCache.validate` gate. Token is never logged. New test ASR-09 asserts query-param auth succeeds without an Authorization header.

**B3 — INV-2 doc drift (g2-app):** `r1-event-source.ts` comment incorrectly attributed wire kinds to "flat string enums from the Even Hub SDK". Corrected to state they are the bridge's server-side-normalized strings mapped from `OsEventTypeList` + `EventSourceType.TOUCH_EVENT_FROM_RING`. Comment-only change.
