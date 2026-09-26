---
"@evf/foundry-module": minor
"@evf/g2-app": minor
"@evf/shared-protocol": minor
"@evf/validation-harness": minor
"@evf/relay": minor
---

Relay pairing (ADR-0019): connect the glasses alone, with one QR, without a GM and without any Foundry login on the phone.

- «Collega occhiali G2» / «Connect G2 glasses» (right-click your name in the Players list, Alt+G, or Settings): opening the window shows the QR and a 16-character code at once; the glasses reconnect by themselves whenever that browser has Foundry open. «Scollega» to forget them.
- Your Foundry tab streams the sheet, the map (scene pictures now work on The Forge CDN too) and your actions through an end-to-end encrypted relay (`packages/relay`, Cloudflare Worker); Foundry no longer needs public HTTPS.
- The glasses app ships on Even Hub (FoundryVTT G2 HUD: «Scansiona QR» with the phone camera, or the code) and on GitHub Pages `/app/`; it is no longer inside the module zip (Foundry ≥ 14.361 serves module HTML as text).
- Migration: pair the glasses again once. The "(G2)" users of the previous version are no longer used — the GM may delete them.
