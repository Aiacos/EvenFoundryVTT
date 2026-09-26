# 🔐 Security

## 📦 Supported versions

| Component | Supported |
|---|---|
| Foundry module `evenfoundryvtt` | latest release ([releases](https://github.com/Aiacos/EvenFoundryVTT/releases/latest)) |
| Glasses app «FoundryVTT G2 HUD» | latest Even Hub build / GitHub Pages `/app/` |
| Relay `wss://evf-relay.evf-relay.workers.dev` | always the `main` deployment |

## 🐞 Reporting a vulnerability

Use GitHub's private report: **Security › Report a vulnerability** on this repository. Please do
not open a public issue for security problems. Expect a first answer within a week (solo project).

## 🏗️ Threat model in short

- The phone never holds a Foundry credential; it knows only a relay room id and an AES-256 key
  ([ADR-0019](docs/architecture/0019-relay-pairing-player-projector.md)).
- The relay is a third party: it forwards opaque sealed frames and sees only metadata (room id,
  timing, sizes, IP addresses) — [privacy policy](docs/privacy.md).
- The pairing QR / code is a secret for 5 minutes and single use; whoever scans it first gets the
  glasses channel for that character.
- Every glasses request is re-checked against the live actor ownership of the projecting user;
  writes go only through `dispatchTool` ([ADR-0011](docs/architecture/0011-foundry-write-path-single-workflow-origin.md)).

## ✅ Security checklist

Tick when verified; every control links its proof. Re-verify on each release.

- [x] Sealed envelopes: AES-256-GCM, AAD `from>to`, 120 s anti-replay —
      [`envelope.ts`](packages/shared-protocol/src/direct/envelope.ts)
- [x] Single-use pairing: room + key rotate on the first `welcome`, racing hellos rotate once —
      [`projector.ts`](packages/foundry-module/src/direct/projector.ts) (test PJ-02b)
- [x] Relay limits: 1 MiB frames, 60 frames/s, one socket per role, 128-bit rooms —
      [`packages/relay`](packages/relay/README.md)
- [x] Live ownership check + audit on denial — [`ownership.ts`](packages/foundry-module/src/direct/ownership.ts)
- [x] No Foundry login / socket.io in the app bundle (CI Gate 10) — [`check-relay-origin.mjs`](scripts/check-relay-origin.mjs)
- [x] Even Hub whitelist = relay origin only; camera photo decoded on the phone, never uploaded —
      [`app.json`](packages/g2-app/app.json), [`qr-scan.ts`](packages/g2-app/src/phone/qr-scan.ts)
- [x] No secrets in the repo or bundles (`.env*`, `*.secret.json` ignored) — [`.gitignore`](.gitignore)
- [ ] Private vulnerability reporting enabled on GitHub — [TODO.md](TODO.md)
- [ ] Relay quota / abuse monitoring after deploy (gate G3) — [runbook](docs/runbook.md)
