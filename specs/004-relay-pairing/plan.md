# Implementation Plan: Relay pairing — player-owned projector, phone never logs into Foundry

**Branch**: `docs/relay-pairing-research` (implemented 2026-09-25) | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)
| **Research**: [research.md](./research.md) | **ADR**: [0019](../../docs/architecture/0019-relay-pairing-player-projector.md) (proposed)

## Summary

Replace "phone logs into Foundry as a GM-created (G2) user and loads a page Foundry serves"
(ADR-0016/0017 — broken on Foundry v14 ≥ 14.361, needs a GM, blocked by Forge private games,
impossible to list on Even Hub) with **"the player's own Foundry tab projects to the glasses
through an opaque, E2E-sealed room relay on a fixed origin"**. The app is one bundle served
three ways (Even Hub `.ehpk`, GitHub Pages, Vite dev). Pairing = one QR in the player's
Foundry; no GM, no Foundry credential on the phone, the browser session is never touched.

```
[G2] ⇄ BLE ⇄ [Even App: FoundryVTT G2 HUD (.ehpk | Pages | Vite)]
                         │ wss  (sealed envelopes, room = 128-bit id)
                         ▼
              [evf-relay: Cloudflare Worker + Durable Object per room]   ← fixed origin
                         ▲ wss
                         │
   [PROJECTOR = player's own logged-in Foundry tab (or a GM's, story 5)]
     readers · map tile renderer · dispatchTool (ADR-0011) · pairing window
```

## Technical Context

**Language/Version**: TypeScript 5.8 strict; relay on Cloudflare Workers runtime (ES modules)
**Primary Dependencies**: kept — Even Hub SDK (bump 0.0.15 → 0.0.16, timer fix), Zod 4,
`upng-js`, `qrcode`; **new** — `wrangler` 4.140 (dev), a QR decoder for the camera path
(`jsqr` 1.4.0, Apache-2.0, `npm view` 2026-09-25 — MIT-compatible; lazy-loaded only on the scan screen); **removed** —
`socket.io-client` (g2-app)
**Storage**: projector pairings in `game.settings` `scope:'client'`; phone in `localStorage` +
`bridge.setLocalStorage`; relay stores nothing
**Testing**: Vitest (units + relay room logic), Miniflare/`wrangler dev` integration (two WS
peers), sealed round-trip on a fake relay, INV-1 fixtures unchanged, simulator `sim:check`,
harness `validate:relay` (G1–G3, `--skip-hardware`)
**Target Platform**: Even Realities App WebView (iOS/Android), Foundry v13.347+/v14 browser
clients (self-hosted + The Forge), Cloudflare Workers free plan
**Performance Goals**: map ≤ 1 update/s, changed tiles only, image sends ≥ 100 ms apart;
pairing ≤ 30 s (SC-001)
**Constraints**: relay frame ≤ 1 MiB, 60 frames/s per socket; Even Hub whitelist fixed at pack time

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I Code quality / zero dead code | Old login path deleted, not flagged off: `foundry-client.ts`, `/join`, `g2-user`, `glasses-access`, `identity-keys`, `custody*`, `election`, `ecdh`, GM enablement UI, CI Gate 10. | PLANNED |
| II Test-first | Regression test for F1 (no code path loads HTML from Foundry); relay room tests incl. spike fixes (newcomer `peer-up`, no `peer-down` on replace); tab-lock test; payload v2 round-trip. | PLANNED |
| III INV-1 | HUD layouts untouched; new S12 causes (`no-projector`, `relay`) width-budgeted IT/EN. | PLANNED |
| IV Performance | Tile hashing moves to projector; bench `docs/perf/` for pixelate+encode on a desktop CPU. | PLANNED |
| V Auto-debug | `?demo=` unchanged; `?relay=` dev override; pairing window shows relay ✓/✗; debug events for relay up/down. | PLANNED |
| VI INV-2 | research.md: every claim quoted + URL; drift F1 logged CRITICAL. | PASS |
| VII INV-3 | On acceptance: Specs (v0.13.0) + README + showcase + wiki + setup guide in one commit; ADR-0016/0017 status notes. | PLANNED |
| VIII Hygiene | `packages/foundry-module/g2/` output dir and `.gitignore` entry removed; stale perf JSON handled. | PLANNED |
| IX CI/CD | Gate 10 → "g2-app builds to `packages/g2-app/dist`"; new relay test job; Pages deploy + `wrangler deploy` jobs pinned; `.ehpk` whitelist = relay origin (checked by a gate). | PLANNED |
| X Subagents | Parallel agents per package once tasks are cut. | PLANNED |
| XI Icons | New/edited headings use the canonical map. | PLANNED |

## Design

### 1. Relay — `packages/relay` (new, ~80 LOC + tests)

- `GET /r/<room>?role=projector|glasses` + `Upgrade: websocket` → Durable Object
  `idFromName(room)`; else 404/426. Room = base64url 22–64 chars.
- DO uses the **Hibernation API** (`acceptWebSocket(ws,[role])`, `webSocketMessage`,
  `webSocketClose`); forwards frames to the other role only; one socket per role (new one
  replaces old with close 4000); newcomer gets `{"relay":"peer-up"}` if its peer is present;
  `peer-down` only on a real close (not 4000); frame > 1 MiB → close 1009; rate cap
  60 frames/s/socket → close 1008. Control frames are plain JSON `{relay:…}`; app frames are
  sealed envelopes (opaque).
- `GET /health` → `200 ok` + CORS `*` (used by the pairing window check, G1).
- Deploy: `wrangler deploy` from CI with `CLOUDFLARE_API_TOKEN` (maintainer secret, one-time);
  origin `https://evf-relay.<account>.workers.dev` (custom domain optional). Self-host: the
  same file runs under `wrangler dev`/workerd; documented override.

### 2. Shared protocol — `packages/shared-protocol/src/direct`

- `pairing.ts` → payload **v2** `{v:2, r, k, l?, relay?}` (Zod), `encode/readPairingFragment`;
  manual code: `room = HKDF(code,'evf-room')`, `key = HKDF(code,'evf-key')`.
- `messages.ts`: `hello` without user id; `welcome.rotate` = `{room, key}`; `DIRECT_PROTOCOL_VERSION = 2`;
  map snapshot gains `tiles: [{i, hash, png}]` (base64 4-bit PNG) replacing image URLs.
- `envelope.ts` unchanged (AES-GCM, AAD `from>to`, anti-replay). Delete `ecdh.ts`, `custody.ts`.

### 3. Foundry module — `packages/foundry-module/src/direct`

- `transport.ts` (new): `DeviceTransport` interface `{send(env), onFrame(cb), onPeer(cb), close()}`;
  `RelayTransport` = one `WebSocket` per paired device, exponential back-off reconnect,
  `navigator.locks.request('evf-proj-'+deviceId, {ifAvailable:true})` so one tab per browser
  projects (FR-008).
- `projector.ts`: replace `game.socket` (lines 159–176, 649) with the transport; drop the
  election/GM-custody branches; `invoke` executes locally (the projector *is* the elected one).
- `pairing-store.ts` → client-scoped `Pairing[]`; `PairG2App.ts` → one window for players and
  GMs: actor picker → relay check → QR + code + countdown → "connected ✓" → list with
  «Scollega». Delete `g2-user`, `glasses-access`, `identity-keys`, `custody-sync`, `election`,
  `self-pairing` (merged), `glasses-flags` (unless reused), GM enablement menu.
- `map-assets.ts` (new): load each scene picture in the tab (same origin, or Forge CDN with
  CORS), downsize once (background JPEG ≤ 768 px, pieces PNG ≤ 128 px), send as `asset`
  (once per connection), snapshot references `evf-asset:<id>`; the phone renderer is untouched.
- Settings (client scope, hidden unless `debug`): `appUrl` (default Pages URL), `relayUrl`
  (default production relay) — dev/self-host overrides embedded in the QR payload.

### 4. G2 app — `packages/g2-app`

- `src/direct/relay-client.ts` replaces `foundry-client.ts`: WS to relay room as `glasses`,
  reconnect on `FOREGROUND_ENTER`/online, back-off; `peer-down` → S12 cause `no-projector`.
- `credentials.ts` → `{room, key, label, relay?}`; still `localStorage` + SDK mirror.
- Phone page P02/P03: **Scansiona QR** (`captureImageFromCamera` → canvas → `jsqr`) and code
  field; no Foundry user list. P01 text updated.
- Map zone hydrates `evf-asset:` references from `asset` messages instead of fetching art;
  schematic fallback kept.
- Build: `vite build` → `packages/g2-app/dist` with `VITE_RELAY_URL`; `app.json` whitelist =
  `["https://<relay>", "wss://<relay>"]` (gate G2 decides which spelling stays) + `camera`
  permission; drop Gate 10 output dir.

### 5. Distribution

| Channel | Who | How | Lock-safe |
|---|---|---|---|
| **Even Hub beta → store** | players | `.ehpk` from release; maintainer uploads, adds table players to the beta group; later submits for review (privacy policy page on Pages names the relay domain) | ✅ |
| **GitHub Pages** `https://aiacos.github.io/EvenFoundryVTT/app/` | dev-mode phones, reviewers, QR target | Pages switches to an Actions deploy: `docs/` + built app under `/app/` on every release | ❌ (sideload) |
| **Dev** | contributors | `pnpm dev:glasses` = `wrangler dev` :8787 + `vite --host` + `evenhub qr --url http://<lan>:5173/?relay=ws://<lan>:8787`; local Foundry module setting `appUrl/relayUrl` → LAN | ❌ |

Release pipeline additions (release.yml → foundry-module-release.yml): module zip **without**
`g2/`; `wrangler deploy` (relay, only when `packages/relay` changed); Pages deploy of `app/`;
`.ehpk` packed with the production relay whitelist and attached. Portal upload stays manual
(CLI has no upload — reference/cli).

### 6. Migration (v0.2.x → next minor)

Old pairings are dropped: the glasses show "re-pair from Foundry"; the module removes the
old world setting/user flags once (GM client) and leaves "(G2)" users for the GM to delete
(listed in a one-time notice). CHANGELOG + setup guide explain it.

## Phases

1. **Relay** (package, tests, `wrangler dev` integration, deploy workflow) — unblocks G1/G3.
2. **Protocol v2** (payload, messages, map tiles schema) + delete ECDH/custody.
3. **Projector** (transport, tab lock, pairing window, map tile renderer, deletions).
4. **G2 app** (relay client, credentials v2, phone page scan/code, tile consumer, remove
   socket.io).
5. **Distribution** (Pages deploy, `.ehpk` whitelist/camera, `dev:glasses`, wizard update).
6. **Docs/INV-3** (ADR-0019 accepted, 0016/0017 status notes, Specs v0.13.0, README,
   showcase, wiki, setup guide, runbook) + harness `validate:relay` (G1–G3).
7. **Hardware UAT**: beta build on iOS + Android, Forge private v14 game, 5-minute lock.
