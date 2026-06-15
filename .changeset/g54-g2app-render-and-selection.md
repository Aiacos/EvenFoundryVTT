---
"@evf/g2-app": minor
---

HUD render completeness + character selection end-to-end (real-pairing session).

Four improvements shipped in tasks e9t, etr, f9s, and flv:

- `createWsEventBus` refactored to a single persistent listener with per-channel last-value
  replay: `subscribe()` synchronously delivers the cached payload before registering for
  futures, and the bus is created at step 5a (before the handshake) so the bridge's
  on-connect `character.delta` is never dropped (e9t). LIVE SIM VERIFIED: first render of
  real character data on connect (Artemis · PF 55/88 · CA 18) with no post-connect push.
- `writeHeaderChrome` + `writeFooterChrome` in `engine/hud-chrome.ts` populate the header
  and footer containers after the bundle flush, replacing the SDK "Text" placeholder with
  the canonical Specs §7.4 content (etr). INV-1 zero fixture drift.
- `finalizeIdleRender(idleInfill, mapBase)` extracted in boot-engine-core and called at
  step 13: `idleInfill.draw()` + `mapBase.draw()` (with raster+no-scene writing an
  empty-string `textContainerUpgrade` to clear `map-capture`) erase the last SDK "Text"
  placeholders from the idle display (f9s). Full clean HUD verified in simulator.
- `BootEngineOpts.characterId` threaded into `performCapabilityHandshake` as `actorId`;
  `launchApp` resolves `?actor=<id>` URL override > Tier3 `session.characterId` > undefined
  so the chosen PC is delivered to the bridge on connect (flv). LIVE SIM VERIFIED: loading
  `?actor=6KWxQXAiJgz4zKlS` (Dante) rendered "Dante Lanzu… · PF 41/63" on the glasses.

No new dependencies. INV-1 zero fixture drift across all four tasks.
