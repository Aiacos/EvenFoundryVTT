# ✅ TODO

Open work only, as checkable items. Every item links where it comes from (spec task, ADR,
issue, PR or file) — see [CLAUDE.md P12](CLAUDE.md). Tick it in the commit that finishes it; when
the release ships, move the line to [CHANGELOG.md](CHANGELOG.md) and delete it here.

## 🔐 Maintainer — one-time setup (relay pairing, ADR-0019)

- [x] Cloudflare: relay deployed at `wss://evf-relay.evf-relay.workers.dev` (subdomain `evf-relay`,
      `validate:relay` GO, 2026-09-26) — [runbook §Relay and Pages](docs/runbook.md)
- [x] Repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` set 2026-09-26 (automatic redeploys; local copy in `~/.config/evenfoundryvtt/cloudflare.env`) —
      [`relay-deploy.yml`](.github/workflows/relay-deploy.yml)
- [x] Settings › Pages › Source = **GitHub Actions** (2026-09-26; `/app/` live) — [`pages.yml`](.github/workflows/pages.yml)
- [ ] Even Hub portal: upload the release `.ehpk`, beta group with the table's players, privacy URL
      `https://aiacos.github.io/EvenFoundryVTT/privacy.html` — [docs/release/evenhub.md](docs/release/evenhub.md)
- [ ] Enable GitHub private vulnerability reporting (Settings › Security) — [SECURITY.md](SECURITY.md)
- [x] Merge PR [#60](https://github.com/Aiacos/EvenFoundryVTT/pull/60) — released as module
      [v0.3.0](https://github.com/Aiacos/EvenFoundryVTT/releases/tag/v0.3.0) (2026-09-26)
- [ ] Cloudflare API token: add permission **Account › Workers Scripts › Edit** (today it can read
      only — Relay Deploy fails with "No access to the specified resource") —
      [`relay-deploy.yml`](.github/workflows/relay-deploy.yml)

## 🚀 CI/CD

- [ ] `release.yml` should trigger `pages.yml` after a release, so `/app/` never lags the tag (the
      live Pages bundle said 0.4.1 with older code) — [`release.yml`](.github/workflows/release.yml),
      [`pages.yml`](.github/workflows/pages.yml)
- [ ] `sim:check`: a `#c=` start-up scenario (and a `hashchange`) — [`sim-check.ts`](packages/g2-app/scripts/sim-check.ts)

- [ ] Release `sync-merge`: the bot's sync PR CI stays *action_required* and the posted
      `quality-gates` check-run is not counted, so the merge is refused (v0.3.0 needed a manual
      run approval) — [`release.yml`](.github/workflows/release.yml) job `sync-merge`

## 🥽 Hardware UAT (defer-hardware gates)

- [ ] G2 — Beta build on iOS + Android: «Scansiona QR», play, lock 5 min, kill/reopen —
      [specs/004 T027](specs/004-relay-pairing/tasks.md)
- [ ] G1 — Forge private v14 game + self-hosted v13: «Relay ✓», pairing, map, action —
      [specs/004 T028](specs/004-relay-pairing/tasks.md)
- [ ] G3 — measure relay requests / GB-s for one real session — [specs/004 T029](specs/004-relay-pairing/tasks.md)
- [ ] 2×2 tile geometry + BLE map pacing on real G2 — [ADR-0005 status note](docs/architecture/0005-phase0-go-no-go.md)
- [ ] Even App developer «Scan QR»: does `#c=` (and `?query`) reach the page? A second scan: fresh page or
      only a `hashchange`? Does a relaunch reload the scanned URL? (boot line `link …`) —
      [ADR-0019 Amd 2](docs/architecture/0019-relay-pairing-player-projector.md)
- [ ] Secure context of the sideloaded Pages page and of the installed `.ehpk` on iOS + Android (boot line
      `secure yes/no · crypto …`) — [ADR-0019 Amd 2](docs/architecture/0019-relay-pairing-player-projector.md)
- [ ] Camera (`captureImageFromCamera`) on a sideloaded page; log the raw result shape once —
      [`qr-scan.ts`](packages/g2-app/src/phone/qr-scan.ts)
- [ ] The Forge v14: ESC/✕ on the pairing window, `wss` to the relay under Forge's CSP, pairing after
      window close — [specs/004 T028](specs/004-relay-pairing/tasks.md)

## 🔐 Pairing hardening (deferred from the ADR-0019 Amd 2 investigation)

- [ ] Browser guard (H8): treat the page as inside the Even App only once `flutter_inappwebview.callHandler`
      appears; outside it, don't spend the code without «Collega comunque questo browser» —
      [`main.ts`](packages/g2-app/src/main.ts), [ADR-0019 Amd 2](docs/architecture/0019-relay-pairing-player-projector.md)
- [ ] Two-step rotation (old room kept until the glasses confirm the new one) —
      [`projector.ts`](packages/foundry-module/src/direct/projector.ts)
- [ ] Timeouts on SDK storage calls; don't wait on the mirror write —
      [`credentials.ts`](packages/g2-app/src/direct/credentials.ts)
- [ ] Another open Foundry tab picks up a pairing created in a different tab (storage event) —
      [`pairing-store.ts`](packages/foundry-module/src/direct/pairing-store.ts)
- [ ] PA-RACE ordering in the pairing window (fake-timing only today) —
      [`PairG2App.ts`](packages/foundry-module/src/direct/PairG2App.ts)
- [ ] Decide foundry-module chunks: `dist/` now ships `module.js` + hashed runtime + lazy `crypto-fallback-*.js`
      (or `splitting: false`, ~+32 KB inlined); install smoke on The Forge —
      [`tsup.config.ts`](packages/foundry-module/tsup.config.ts)
- [ ] Benchmark envelope sealing on the crypto fallback under `docs/perf/` (P4) —
      [`crypto-fallback.ts`](packages/shared-protocol/src/direct/crypto-fallback.ts)
- [ ] Phone text «causeCodePending» still says to keep the window open, but closing it no longer
      cancels the QR: reword to «keep the Foundry tab open» — [`i18n.ts`](packages/g2-app/src/phone/i18n.ts)

## 🗺️ Next features

- [ ] Skill / save rolls started from the glasses — [Specs §10](Specs.md)
- [ ] Voice / MCP as a client of the direct channel — needs a new ADR ([ADR-0004](docs/architecture/0004-voice-via-mcp-not-internal.md))
