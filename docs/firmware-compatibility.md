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
| `@evenrealities/even_hub_sdk` | **0.0.15** (exact pin, `packages/g2-app/package.json`) | 2026-09-23 | npm registry: 0.0.15 published 2026-09-07 (`npm view @evenrealities/even_hub_sdk time`) |
| `app.json` `min_sdk_version` | **0.0.14** | 2026-09-23 | `packages/g2-app/app.json`. 0.0.14 is the floor for long-press, `menuObject` and 100 ms `updateImageRawData` pacing. |
| Even Realities App | **≥ 2.2.9** for long-press / context menu | 2026-09-23 | [hub.evenrealities.com/docs/reference/changelog](https://hub.evenrealities.com/docs/reference/changelog): the context menu needs app 2.2.9; the SDK 0.0.13 floor is 2.2.6 |
| Even Realities App (SDK 0.0.15 metadata) | `minAppVersion` **2.2.10** | 2026-09-23 | `npm view @evenrealities/even_hub_sdk@0.0.15 minAppVersion`. The hub changelog still lists 0.0.14 as the latest entry. Re-verify when the changelog catches up. |
| `@evenrealities/pretext` | 0.1.4 | 2026-09-23 | `packages/g2-app/package.json` (pixel text budgets, INV-1) |
| `socket.io-client` | 4.8.3 | 2026-09-23 | `packages/g2-app/package.json` (Foundry socket, EIO 4) |
| G2 model identifier | `"g2"` | 2026-05-14 | `getGlassesInfo()` probe on the simulator |
| FoundryVTT | ≥ v13.347 (v14 verified) | 2026-09-23 | `packages/foundry-module/module.json` → `compatibility`. v14 accepts the socket session only from the `session` cookie, so the page must be same-origin ([ADR-0012](architecture/0012-direct-foundry-streaming.md)). |
| dnd5e | ≥ 5.3.3 | 2026-05-07 | [github.com/foundryvtt/dnd5e/releases](https://github.com/foundryvtt/dnd5e/releases) |
| midi-qol | optional (`relationships.recommends`) | 2026-05-10 | [gitlab.com/tposney/midi-qol](https://gitlab.com/tposney/midi-qol) |
| socketlib | **not used** since v0.10.0 | — | The projector runs in the GM client, so no `executeAsGM` round-trip is left (ADR-0012). |

### 📝 SDK changes that matter to us

From [hub.evenrealities.com/docs/reference/changelog](https://hub.evenrealities.com/docs/reference/changelog) (fetched 2026-09-23):

| SDK | Shipped | Change used by EVF |
|---|---|---|
| 0.0.12 | 2026-07-10 | `zOrderIndex` on containers (unique per page, all-or-nothing); image payloads LZ4-compressed in transit |
| 0.0.13 | 2026-07-31 | `minAppVersion` published in npm metadata (2.2.6) |
| 0.0.14 | 2026-08-20 | `textColor` (5 brightness levels) · `updateImageRawData` holds the image path for 100 ms · `menuObject` context menu (≤ 10 items) · `LONG_PRESS_EVENT` (9) / `LONG_PRESS_RELEASE_EVENT` (10) |
| 0.0.15 | 2026-09-07 (npm) | current pin. No hub changelog entry yet; `minAppVersion` 2.2.10 |

---

## 🥽 Hardware limits used by the sheet layout

Sources: [hub.evenrealities.com/docs/build/display](https://hub.evenrealities.com/docs/build/display) ·
[/build/device-apis](https://hub.evenrealities.com/docs/build/device-apis) ·
[/build/input](https://hub.evenrealities.com/docs/build/input) (fetched 2026-09-23).

| Parameter | Limit | EVF usage |
|---|---|---|
| Canvas | 576 × 288, 4-bit greyscale green | five zones: portrait 144² · header 288×144 · map 144² · sheet 288×144 · context 288×144 |
| Image containers | ≤ 4 per page, each ≤ 288 × 144 | 4 / 4: portrait, header, map, sheet (pixel renderer) |
| Text / list containers | ≤ 8 per page | 4 / 8: context title · body · hint + background capture |
| Event capture | exactly 1 container with `isEventCapture: 1` | full-screen background text |
| Image pacing | ≥ 100 ms between image updates (SDK 0.0.14) | one image at a time, per-zone hash, priority header > map > sheet > portrait; map ≤ 1 fps |
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
- Re-run the tests (`pnpm test`) and the sideload harness
  (`pnpm --filter @evf/validation-harness validate:direct-sideload`) on real hardware when
  you can. Otherwise follow the defer-hardware pattern.
- Update this file and log drift (`Re-verified ✓` / `Drift: …`) in the `Specs.md`
  changelog. Update `README.md` and the showcase in the same commit (INV-3).

---

## 📚 See also

- [ADR-0012 — Direct Foundry → G2 streaming](architecture/0012-direct-foundry-streaming.md)
- [G2 sheet UX](design/g2-sheet-ux.html) · [G2 thirds layout (superseded)](design/g2-thirds-layout.md)
- [Setup guide](setup-guide.md) · [Runbook](runbook.md)
