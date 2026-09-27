# 📝 Changelog

One line per user-visible change, newest first, each with its reference (PR, ADR, spec). Package
details: Changesets changelogs of [foundry-module](packages/foundry-module/CHANGELOG.md),
[g2-app](packages/g2-app/CHANGELOG.md), [shared-protocol](packages/shared-protocol/CHANGELOG.md).
Design history: [Specs.md changelog](Specs.md). Rules: [CLAUDE.md P12](CLAUDE.md).

## 🚀 Unreleased

- [x] «Scansiona QR» measured on 840 simulated phone photos of the real Foundry QR: centred-crop
      decode steps (+18 photos, none lost), camera result read leniently (the SDK dropped partial
      host answers), 120 s camera timeout, `<img>` fallback for HEIC, photo size/type in the error;
      Foundry «Ingrandisci QR» (QR about 2× larger: ~40 % → ~90 % reads from 30 cm) —
      [`qr-scan.ts`](packages/g2-app/src/phone/qr-scan.ts), [`PairG2App.ts`](packages/foundry-module/src/direct/PairG2App.ts)

- [x] Pairing works on plain-http pages too (phone on `http://<LAN-IP>`, Foundry on `http://192.168…`):
      audited `@noble` crypto fallback when WebCrypto is hidden, same bytes on the wire —
      [ADR-0019 Amd 2](docs/architecture/0019-relay-pairing-player-projector.md), [`crypto.ts`](packages/shared-protocol/src/direct/crypto.ts)
- [x] Reopening an already-used QR/link no longer breaks a working pairing («Codice già usato su
      questo telefono»); an unanswered code is cleared after 5 min with a notice —
      [`credentials.ts`](packages/g2-app/src/direct/credentials.ts), [ADR-0019 Amd 2](docs/architecture/0019-relay-pairing-player-projector.md)
- [x] Phone: «Collega di nuovo» card on the Connection page, boot line `app · secure · crypto · link · relay`,
      precise pairing errors; the link is read on `hashchange`, from `?c=` and in any case; legacy `#evf=` named —
      [`phone-page.ts`](packages/g2-app/src/phone/phone-page.ts)
- [x] Glasses + phone: new states «Codice in attesa di Foundry», «Personaggio non disponibile», «Presi da
      un'altra app», S10 «NESSUNA RISPOSTA AL CODICE» (+ `?demo=` scenarios) —
      [`session.ts`](packages/g2-app/src/direct/session.ts)
- [x] Foundry: closing «Collega occhiali G2» keeps the QR (projector-owned expiry); live status under the
      QR; «Ripristina predefinito» for a non-default app page / relay (undo of the v0.3.0/0.3.1
      `dev:glasses` advice) — [`PairG2App.ts`](packages/foundry-module/src/direct/PairG2App.ts)
- [x] Foundry: «Annulla QR» kills a shown QR at once; reopening the window from the Players list
      keeps the QR of that character; each pairing stays on the relay it was made on —
      [`PairG2App.ts`](packages/foundry-module/src/direct/PairG2App.ts), [`pairing-store.ts`](packages/foundry-module/src/direct/pairing-store.ts)
- [x] Phone: the pairing link is read before it is stripped from the (live) address — every QR
      was «senza codice valido» in a real browser; spent codes stay spent after «Scollega» /
      «Dimentica associazione»; a link over an older pairing gives it back if unanswered;
      notices for a used / invalid / old link on P02 and P03 — [`credentials.ts`](packages/g2-app/src/direct/credentials.ts)
- [x] Glasses say `hello` again on a `peer-up` while connected (projector socket replaced: no
      frozen HUD); one failing inbound frame no longer blocks the next ones —
      [`session.ts`](packages/g2-app/src/direct/session.ts)
- [x] Pairing E2E in its own package (`packages/e2e`): real projector + real session + the built
      bundle in Chromium on `http://127.0.0.1` and `http://<LAN-IP>`, all against `wrangler dev`
      in CI — [`pairing.e2e.test.ts`](packages/e2e/src/pairing.e2e.test.ts)
- [x] Glasses: before any character arrives (code pending, character refused, Foundry closed at the
      first pairing) the full S11 screen names the cause instead of an empty dimmed sheet —
      [`screen.ts`](packages/g2-app/src/hud/screen.ts)
- [x] One full push per link and outgoing frames paced to 40/s: no relay 1008 after pairing on
      big scenes — [`relay-connection.ts`](packages/foundry-module/src/direct/relay-connection.ts)
- [x] `pnpm dev:glasses` tells v0.3.0/0.3.1 users to reset «Glasses app page (advanced)»; docs no
      longer point that setting at a LAN URL — [`scripts/wizard.sh`](scripts/wizard.sh), [runbook](docs/runbook.md)

## 📦 v0.3.2 — 2026-09-26

- [x] «Scansiona QR» reads photos of a screen far more reliably (1024 → 640 → 400 px ladder,
      native `BarcodeDetector` when present: 7/16 → 14/16 simulated photos) and explains a
      missing camera instead of doing nothing — [g2-app qr-scan](packages/g2-app/src/phone/qr-scan.ts)
- [x] The code field takes the whole pairing link too: no 24-character cap, no forced capitals
      — [g2-app phone page](packages/g2-app/src/phone/phone-page.ts)
- [x] `pnpm dev:glasses` prints the QR of the LAN app (`--code` pairs in one scan) —
      [scripts/wizard.sh](scripts/wizard.sh)

## 📦 v0.3.1 — 2026-09-26

- [x] Short pairing QR: only the code (`…/app/#c=<CODE>`, ~63 chars) — scannable by the Even
      Realities App and short enough to type — [ADR-0019 Amd 1](docs/architecture/0019-relay-pairing-player-projector.md)

## 📦 v0.3.0 — 2026-09-26 (spec v0.13.0)

- [x] Relay pairing: one QR or code, no GM, no Foundry login on the phone; «Collega occhiali G2»
      via right-click on your name or Alt+G — [PR #60](https://github.com/Aiacos/EvenFoundryVTT/pull/60),
      [ADR-0019](docs/architecture/0019-relay-pairing-player-projector.md)
- [x] Glasses app on Even Hub («Scansiona QR» with the phone camera) and GitHub Pages `/app/`;
      no longer inside the module zip — [PR #60](https://github.com/Aiacos/EvenFoundryVTT/pull/60)
- [x] Map art from The Forge CDN now shows on the glasses — [PR #60](https://github.com/Aiacos/EvenFoundryVTT/pull/60)
- [x] Migration note for players: pair the glasses again once; old "(G2)" users can be deleted —
      [release notes](https://github.com/Aiacos/EvenFoundryVTT/releases/tag/v0.3.0)

## 📦 v0.2.2 — 2026-09-24

- [x] The Forge login wall reported clearly instead of raw HTML — [release](https://github.com/Aiacos/EvenFoundryVTT/releases/tag/v0.2.2)

## 📦 v0.2.1 — 2026-09-24

- [x] `pnpm wizard` for one-command hardware tests; ordered projector sends — [release](https://github.com/Aiacos/EvenFoundryVTT/releases/tag/v0.2.1)

## 📦 v0.2.0 — 2026-09-24

- [x] Direct Foundry → G2 streaming, D&D-sheet HUD, bridge and Docker removed —
      [release](https://github.com/Aiacos/EvenFoundryVTT/releases/tag/v0.2.0), [ADR-0016](docs/architecture/0016-direct-foundry-streaming.md)

## 📦 Earlier

- [x] Bridge era up to `v0.1.55` — [releases](https://github.com/Aiacos/EvenFoundryVTT/releases?q=v0.1)
