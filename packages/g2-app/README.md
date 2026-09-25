# @evf/g2-app — FoundryVTT G2 HUD

## 🎲 Overview

The glasses app of EvenFoundryVTT: a D&D-sheet HUD on Even Realities G2
([ADR-0018](../../docs/architecture/0018-dnd-sheet-hud-pixel-renderer.md)) driven by R1
gestures ([ADR-0012](../../docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md)),
fed by the player's own Foundry tab through the relay
([ADR-0019](../../docs/architecture/0019-relay-pairing-player-projector.md)). It runs in the
Even Realities App WebView on the phone; it never talks to Foundry, only to
`wss://evf-relay.aiacos.workers.dev` with AES-256-GCM sealed frames.

One bundle (`dist/`), three ways to load it:

- **Even Hub package** `evenfoundryvtt.ehpk` (**FoundryVTT G2 HUD**) — players, beta group
  then store; survives the phone lock ([release/evenhub.md](../../docs/release/evenhub.md)).
- **GitHub Pages** `https://aiacos.github.io/EvenFoundryVTT/app/` — the page the pairing QR
  opens in developer mode.
- **Vite dev server** on the LAN — development.

## 🏗️ Architecture

| Path | Role |
|---|---|
| `src/main.ts` | entry: binds the browser/SDK globals, `?demo=` / `?debug=1` surfaces (fail closed) |
| `src/direct/credentials.ts` | pairing from the QR fragment `#evf=…` or the 16-char code (HKDF → room + key); stored in `localStorage` + SDK storage |
| `src/direct/relay-client.ts` | glasses ⇄ relay WebSocket (`/r/<room>?role=glasses`), `peer-up` / `peer-down` |
| `src/direct/session.ts` | sealed session: `hello` → `welcome` (room/key rotation), snapshots, deltas, `invoke`; causes `no-projector` · `network` · `background` |
| `src/direct/app.ts` | wires session, HUD, phone page and lifecycle |
| `src/hud/` | sheet layout on the 2 × 2 grid of 288 × 144 tiles, zone renderers, tile sender (one image at a time, ≥ 100 ms, hash skip), input state machine |
| `src/hud/map-art/` | scene art (`evf-asset:<id>` sent by the projector) pixelated to 4-bit, schematic fallback |
| `src/phone/` | phone page: *Scan QR* (camera, `jsqr` lazy chunk), *Enter code*, Connection, Diagnostics |
| `src/demo/` · `src/debug/` | scripted HUD scenes (`?demo=`), debug channel |
| `app.json` | Even Hub manifest: SDK 0.0.16, whitelist = relay (`https` + `wss`), `camera` |

## 🧪 Development

```bash
pnpm --filter @evf/g2-app dev:demo                # Vite + ?demo=tour in the browser
pnpm --filter @evf/g2-app build                   # → packages/g2-app/dist
node scripts/check-relay-origin.mjs --bundle packages/g2-app/dist   # CI Gate 10 (from the repo root)
pnpm --filter @evf/g2-app test
pnpm --filter @evf/g2-app sim:check               # Even Hub simulator: screenshots + input + console
pnpm wizard                                       # demo scenes on the LAN + QR for real glasses
pnpm dev:glasses                                  # this checkout against your Foundry (live pairing)
```

The relay end-to-end test (`src/direct/relay.e2e.test.ts`) runs in CI against
`wrangler dev`; see [`packages/relay`](../relay/README.md).

## 📚 Documentation

- [Setup guide](../../docs/setup-guide.md) · [Runbook](../../docs/runbook.md)
- [Even Hub packaging](../../docs/release/evenhub.md) · [Firmware compatibility](../../docs/firmware-compatibility.md)
- [G2 sheet UX](../../docs/design/g2-sheet-ux.html)
