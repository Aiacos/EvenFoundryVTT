# ✅ TODO

Open work only, as checkable items. Every item links where it comes from (spec task, ADR,
issue, PR or file) — see [CLAUDE.md P12](CLAUDE.md). Tick it in the commit that finishes it; when
the release ships, move the line to [CHANGELOG.md](CHANGELOG.md) and delete it here.

## 🔐 Maintainer — one-time setup (relay pairing, ADR-0019)

- [x] Cloudflare: relay deployed at `wss://evf-relay.evf-relay.workers.dev` (subdomain `evf-relay`,
      `validate:relay` GO, 2026-09-26) — [runbook §Relay and Pages](docs/runbook.md)
- [x] Repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` set 2026-09-26 (automatic redeploys; local copy in `~/.config/evenfoundryvtt/cloudflare.env`) —
      [`relay-deploy.yml`](.github/workflows/relay-deploy.yml)
- [ ] Settings › Pages › Source = **GitHub Actions** — [`pages.yml`](.github/workflows/pages.yml)
- [ ] Even Hub portal: upload the release `.ehpk`, beta group with the table's players, privacy URL
      `https://aiacos.github.io/EvenFoundryVTT/privacy.html` — [docs/release/evenhub.md](docs/release/evenhub.md)
- [ ] Enable GitHub private vulnerability reporting (Settings › Security) — [SECURITY.md](SECURITY.md)
- [ ] Merge PR [#60](https://github.com/Aiacos/EvenFoundryVTT/pull/60) (relay pairing, v0.13.0)

## 🥽 Hardware UAT (defer-hardware gates)

- [ ] G2 — Beta build on iOS + Android: «Scansiona QR», play, lock 5 min, kill/reopen —
      [specs/004 T027](specs/004-relay-pairing/tasks.md)
- [ ] G1 — Forge private v14 game + self-hosted v13: «Relay ✓», pairing, map, action —
      [specs/004 T028](specs/004-relay-pairing/tasks.md)
- [ ] G3 — measure relay requests / GB-s for one real session — [specs/004 T029](specs/004-relay-pairing/tasks.md)
- [ ] 2×2 tile geometry + BLE map pacing on real G2 — [ADR-0005 status note](docs/architecture/0005-phase0-go-no-go.md)

## 🗺️ Next features

- [ ] Skill / save rolls started from the glasses — [Specs §10](Specs.md)
- [ ] Voice / MCP as a client of the direct channel — needs a new ADR ([ADR-0004](docs/architecture/0004-voice-via-mcp-not-internal.md))
