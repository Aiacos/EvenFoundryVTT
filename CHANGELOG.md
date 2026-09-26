# 📝 Changelog

One line per user-visible change, newest first, each with its reference (PR, ADR, spec). Package
details: Changesets changelogs of [foundry-module](packages/foundry-module/CHANGELOG.md),
[g2-app](packages/g2-app/CHANGELOG.md), [shared-protocol](packages/shared-protocol/CHANGELOG.md).
Design history: [Specs.md changelog](Specs.md). Rules: [CLAUDE.md P12](CLAUDE.md).

## 🚀 Unreleased

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
