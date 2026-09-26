# Firmware & SDK Compatibility

Which SDK, app, firmware and Foundry versions EvenFoundryVTT is verified against, and the
forward-compat policy for each.

**INV-2 note:** every pin below cites a canonical upstream source. Re-verify before each
version bump (≥ 4 parallel WebFetch on canonical domains, per `CLAUDE.md` §Pre-bump
checklist). Aggregator, blog and AI-summary sources are not authoritative.

---

## 🔬 Verified versions

| Component | Version | Verified | Source |
|---|---|---|---|
| `@evenrealities/even_hub_sdk` | **0.0.16** (exact pin, `packages/g2-app/package.json`) | 2026-09-25 | npm registry: 0.0.16 published 2026-09-24 (`npm view @evenrealities/even_hub_sdk time`); timer fix, `index.d.ts` identical to 0.0.15 |
| `app.json` `min_sdk_version` | **0.0.16** | 2026-09-25 | `packages/g2-app/app.json` = the pinned SDK. The API floor stays 0.0.14 (long-press, `menuObject`, 100 ms `updateImageRawData` pacing). |
| Even Realities App | **≥ 2.2.10** | 2026-09-25 | `npm view @evenrealities/even_hub_sdk@0.0.16 minAppVersion` → 2.2.10; the packer stamps it into the `.ehpk` (`evenhub-cli pack … --sdk-ver 0.0.16` prints `min_app_version 2.2.10`). Long-press / context menu alone need 2.2.9 ([hub changelog](https://hub.evenrealities.com/docs/reference/changelog)). |
| `@evenrealities/evenhub-cli` | 0.1.14 (pinned in the workflows) | 2026-09-25 | `.github/workflows/{evenhub-pack,foundry-module-release}.yml`; packs the player `.ehpk` ([release/evenhub.md](release/evenhub.md)) |
| `@evenrealities/pretext` | 0.1.4 | 2026-09-23 | `packages/g2-app/package.json` (pixel text budgets, INV-1) |
| `jsqr` | 1.4.0 | 2026-09-25 | `packages/g2-app/package.json` (in-app **Scan QR**, lazy chunk; `camera` permission) |
| `socket.io-client` | **removed** in v0.13.0 | — | The app no longer talks to Foundry; it joins the relay over a plain WebSocket ([ADR-0019](architecture/0019-relay-pairing-player-projector.md)). |
| G2 model identifier | `"g2"` | 2026-05-14 | `getGlassesInfo()` probe on the simulator |
| FoundryVTT | ≥ v13.347 (v14 verified) | 2026-09-25 | `packages/foundry-module/module.json` → `compatibility`. Foundry ≥ [14.361](https://foundryvtt.com/releases/14.361) serves module HTML as `text/plain`, so the glasses app is no longer served by Foundry; the phone never connects to Foundry ([ADR-0019](architecture/0019-relay-pairing-player-projector.md)). |
| dnd5e | ≥ 5.3.3 | 2026-05-07 | [github.com/foundryvtt/dnd5e/releases](https://github.com/foundryvtt/dnd5e/releases). Live findings kept from the bridge era: `Activity#use(usage, dialog, message)` takes `configure:false` in the **dialog** argument (otherwise every cast/attack waits ~10 s); spells use `method` / `prepared` (a number 0/1/2) since 5.1; `hp.temp` may be `null`. |
| midi-qol | optional (`relationships.recommends`) | 2026-05-10 | [gitlab.com/tposney/midi-qol](https://gitlab.com/tposney/midi-qol) |
| socketlib | **not used** since v0.12.0 | — | The projector runs in the Foundry tab that paired (the player's, or a GM's for a player without a device — ADR-0019), so no `executeAsGM` round-trip is left. |

### 📝 SDK changes that matter to us

From [hub.evenrealities.com/docs/reference/changelog](https://hub.evenrealities.com/docs/reference/changelog) (fetched 2026-09-23) and the npm registry (0.0.15–0.0.16, checked 2026-09-25):

| SDK | Shipped | Change used by EVF |
|---|---|---|
| 0.0.12 | 2026-07-10 | `zOrderIndex` on containers (unique per page, all-or-nothing); image payloads LZ4-compressed in transit |
| 0.0.13 | 2026-07-31 | `minAppVersion` published in npm metadata (2.2.6) |
| 0.0.14 | 2026-08-20 | `textColor` (5 brightness levels) · `updateImageRawData` holds the image path for 100 ms · `menuObject` context menu (≤ 10 items) · `LONG_PRESS_EVENT` (9) / `LONG_PRESS_RELEASE_EVENT` (10) |
| 0.0.15 | 2026-09-07 (npm) | no hub changelog entry; `minAppVersion` 2.2.10 |
| 0.0.16 | 2026-09-24 (npm) | **current pin**: timer fix, `index.d.ts` identical to 0.0.15; `minAppVersion` 2.2.10 |

---

## 🥽 Hardware limits used by the sheet layout

Sources: [hub.evenrealities.com/docs/build/display](https://hub.evenrealities.com/docs/build/display) ·
[/build/device-apis](https://hub.evenrealities.com/docs/build/device-apis) (input events) (fetched 2026-09-23;
`/build/input` now redirects to Get Started).

| Parameter | Limit | EVF usage |
|---|---|---|
| Canvas | 576 × 288, 4-bit greyscale green | five zones: portrait 144² · header 288×144 · map 144² · sheet 288×144 · context 288×144 (zones, not containers) |
| Image containers | ≤ 4 per page, each 20–288 × 20–144 (SDK types) | 3 / 4 on the hardware-proven 2 × 2 grid of 288 × 144 tiles: top band 576 × 144 (portrait · header · map) rendered once and split at x = 288 into tiles (0,0) + (288,0); sheet tile (0,144). Full-screen states use all 4 tiles |
| Tile placement | real host **rejects** `rebuildPageContainer` with image tiles at off-grid offsets (0 containers → white glasses); the simulator accepts any offset (finding `d97b12e`, 2026-07-07) | images only at (0,0) (288,0) (0,144) (288,144) |
| Container ids / z-order | host uses one id namespace per page, images first then text; images always draw **over** text regardless of `zOrder` | image ids first, then text ids; no text container under an image |
| Text / list containers | ≤ 8 per page | 4 / 8: context title · body · hint + background capture |
| Event capture | exactly 1 container with `isEventCapture: 1` | full-screen background text |
| Image pacing | ≥ 100 ms between image updates (SDK 0.0.14); BLE ~10–30 KB/s | one image at a time, per-tile hash, header/map tiles first; map ≤ 1 fps (a 30 fps raster stream flooded the real G2 in the bridge era) |
| Input | press · double-press · swipe up/down; long-press is an **extra** (0.0.14, app ≥ 2.2.9) | long-press opens the `menuObject` shortcuts. Every shortcut can also be reached with a tap. |
| Audio out / camera | none | all feedback is visual |

Full budget table: [`docs/design/g2-sheet-ux.html`](design/g2-sheet-ux.html) §Architettura della schermata · `Specs.md` §7.0.

---

## 🛡️ Forward-compat policy

`@evenrealities/even_hub_sdk` is **pre-1.0**, so treat every bump as potentially breaking:

- Keep the **exact pin** (no `^`/`~`) in `packages/g2-app/package.json`.
- Before upgrading, read the hub changelog and diff `index.d.ts`. Look at container
  limits, `OsEventTypeList`, image pacing, storage and lifecycle events.
- Raise `min_sdk_version` in `packages/g2-app/app.json` only when the code needs the new API.
- Re-run the tests (`pnpm test`), repack the `.ehpk` with the new `--sdk-ver` and run the
  relay harness (`pnpm --filter @evf/validation-harness validate:relay`, gates G1–G2) on real
  hardware when you can. Otherwise follow the defer-hardware pattern.
- Update this file and log drift (`Re-verified ✓` / `Drift: …`) in the `Specs.md`
  changelog. Update `README.md` and the showcase in the same commit (INV-3).

---

## 📚 See also

- [ADR-0019 — Relay pairing](architecture/0019-relay-pairing-player-projector.md) · [Even Hub packaging](release/evenhub.md)
- [G2 sheet UX](design/g2-sheet-ux.html) · [G2 thirds layout (superseded)](design/g2-thirds-layout.md)
- [Setup guide](setup-guide.md) · [Runbook](runbook.md)
