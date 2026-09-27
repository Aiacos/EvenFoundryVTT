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
- On a plain-http page (phone on `http://<LAN-IP>`, Foundry on `http://192.168.…`) the browser
  hides WebCrypto; the channel then uses an audited software fallback with the same algorithms
  and wire bytes. The key sits in page memory as bytes instead of a non-extractable `CryptoKey`
  — no new exposure, it is already in that browser's pairing storage — and plain http itself
  exposes the page to its network, so https stays the recommended setup. The fallback is only
  algorithmically constant-time: the GCM tag check is constant-time (noble `equalBytes`), but its
  AES table lookups may leak cache timings (noble README §Constant-timeness) — accepted for
  plain-http pages only. The cure53 audits covered earlier noble releases (ciphers v1.0.0, Sep 2024;
  hashes, Jan 2022), not the pinned 2.4.0.
- Closing the pairing window does **not** cancel a shown QR / code: it stays redeemable until it
  expires (`PAIRING_TTL_MS`, 5 min) or is used. A QR that others may have seen (shared screen,
  stream, photo) must be killed with «Annulla QR» (or «Nuovo QR»).

## ✅ Security checklist

Tick when verified; every control links its proof. Re-verify on each release.

- [x] Sealed envelopes: AES-256-GCM, AAD `from>to`, 120 s anti-replay —
      [`envelope.ts`](packages/shared-protocol/src/direct/envelope.ts)
- [x] Crypto without WebCrypto (http pages): AES-256-GCM / HKDF-SHA256 / SHA-256 from the audited
      noble libs (cure53), exact pins `@noble/ciphers` 2.4.0 + `@noble/hashes` 2.4.0, lazily loaded
      only when `crypto.subtle` is missing, byte-identical to WebCrypto —
      [`crypto.ts`](packages/shared-protocol/src/direct/crypto.ts),
      [`crypto-fallback.ts`](packages/shared-protocol/src/direct/crypto-fallback.ts) (tests `crypto.test.ts`)
- [x] Single-use pairing: room + key rotate on the first `welcome`, racing hellos rotate once —
      [`projector.ts`](packages/foundry-module/src/direct/projector.ts) (test PJ-02b)
- [x] 5-minute QR expiry owned by the projector: closing the window does not extend or cancel it,
      a late timer (sleeping laptop) still refuses a frame after `expiresAt` —
      [`projector.ts`](packages/foundry-module/src/direct/projector.ts) (tests PJ-15, PJ-15b)
- [x] «Annulla QR» kills a shown QR / code at once (pending pairing forgotten, channel closed) —
      [`PairG2App.ts`](packages/foundry-module/src/direct/PairG2App.ts) (test PA-17)
- [x] Used-link rule: a spent `#c=` link reopened on the same phone is ignored (stored `from`, plus a
      list of spent code rooms that survives «Scollega» / «Dimentica associazione»), never
      overwriting the rotated pairing; an unanswered code is cleared after `PAIRING_TTL_MS`, and a
      link that replaced a working pairing gives it back —
      [`credentials.ts`](packages/g2-app/src/direct/credentials.ts) (`pairing-bugs.regression.test.ts` BUG-1, H2, H3b, H3c)
- [x] Projector stays under the relay abuse cap: one full push per link, outgoing frames paced to
      40/s — [`relay-connection.ts`](packages/foundry-module/src/direct/relay-connection.ts) (tests RC-06, PJ-17)
- [x] Phone boot line and pairing errors carry no secret (no code, room or key) —
      [`phone-page.ts`](packages/g2-app/src/phone/phone-page.ts)
- [x] Relay limits: 1 MiB frames, 60 frames/s, one socket per role, 128-bit rooms —
      [`packages/relay`](packages/relay/README.md)
- [x] Live ownership check + audit on denial — [`ownership.ts`](packages/foundry-module/src/direct/ownership.ts)
- [x] No Foundry login / socket.io in the app bundle (CI Gate 10) — [`check-relay-origin.mjs`](scripts/check-relay-origin.mjs)
- [x] Even Hub whitelist = relay origin only; camera photo decoded on the phone, never uploaded —
      [`app.json`](packages/g2-app/app.json), [`qr-scan.ts`](packages/g2-app/src/phone/qr-scan.ts)
- [x] No secrets in the repo or bundles (`.env*`, `*.secret.json` ignored) — [`.gitignore`](.gitignore)
- [ ] Private vulnerability reporting enabled on GitHub — [TODO.md](TODO.md)
- [ ] Relay quota / abuse monitoring after deploy (gate G3) — [runbook](docs/runbook.md)
