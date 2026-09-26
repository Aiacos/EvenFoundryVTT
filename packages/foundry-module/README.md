# @evf/foundry-module (`evenfoundryvtt`)

## 🎲 Overview

The Foundry VTT module is the Foundry side of EvenFoundryVTT
([ADR-0019](../../docs/architecture/0019-relay-pairing-player-projector.md)). It runs in
every client, and the tab that showed a pairing QR becomes the **projector** of those
glasses: it reads the character, combat, chat log and map, runs every glasses action through
`dispatchTool` ([ADR-0011](../../docs/architecture/0011-foundry-write-path-single-workflow-origin.md))
and streams sealed messages through an opaque relay room
([`packages/relay`](../relay/README.md), `wss://evf-relay.evf-relay.workers.dev`). The phone
never logs into Foundry: no GM step, no extra Foundry user, no password.

The glasses app is **not** in this module any more: it ships as the Even Hub package
**FoundryVTT G2 HUD** (`packages/g2-app`, [release/evenhub.md](../../docs/release/evenhub.md))
and on GitHub Pages (`https://aiacos.github.io/EvenFoundryVTT/app/`, the page the QR opens).

## 🧰 Compatibility

- Foundry VTT: minimum 13.347, verified 14 (`module.json` → `compatibility`); self-hosted
  (HTTP or HTTPS) or The Forge. No public HTTPS needed.
- dnd5e: ≥ 5.3.3.
- MidiQOL: optional at runtime. When MidiQOL is active, handlers call
  `MidiQOL.completeActivityUse` (advantage + explicit targets). Otherwise they fall back
  to vanilla `activity.use()`.
- socketlib: **not used**.
- The projector tab must reach the relay over `wss://` (the pairing window checks it).

## 📦 Installation / Setup

1. Install the module from the manifest URL
   (`https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json`) and
   enable it in your world. Nothing else to configure.
2. A player opens **Connect G2 glasses** (IT: **Collega occhiali G2**): right-click their own
   name in the *Players* list, **Alt+G**, or *Configure Settings ▸ EvenFoundryVTT*. A GM can
   open it on any player's row to pair for a player without a device (the GM tab projects).
3. The window opens ready: character preselected, relay checked, QR + 16-character code
   (5 minutes, single use). The player scans it with **FoundryVTT G2 HUD › Scan QR** or types
   the code in **Enter code**; the window switches to **Glasses connected** by itself.
4. The list **Glasses connected to this browser** shows each pairing (*online* / *waiting
   for the glasses* / *relay unreachable*) with **Disconnect**.

Full walkthrough: [setup guide](../../docs/setup-guide.md).

### ⚙️ Settings

| Key | Scope | Default | Purpose |
|---|---|---|---|
| `pairG2` (menu) | — | — | «Connect G2 glasses» window, open to every user |
| `g2Pairings` | client, hidden | `{}` | pairings of **this browser** (room, key, actor, label) |
| `appUrl` — *Glasses app page (advanced)* | client | `https://aiacos.github.io/EvenFoundryVTT/app/` | page the QR opens (dev: the LAN URL printed by `pnpm dev:glasses`) |
| `relayUrl` — *Relay (advanced)* | client | `wss://evf-relay.evf-relay.workers.dev` | self-hosted relay (sideloaded app only; carried by the QR, not by the code) |

## 🔐 Security / Auth

- **No Foundry credential leaves the browser.** The phone holds only a relay room id and an
  AES-256 device key. The projector acts as the Foundry user of its own tab, so it can do
  only what that user can do.
- **Sealed envelopes**: every frame is AES-256-GCM encrypted with the device key, AAD
  `from>to`, a `ts` inside the ciphertext bounds replay. The relay sees room ids, timing and
  sizes, never content (`@evf/shared-protocol` `direct/envelope.ts`).
- **Single-use pairing**: the 16-char code (Crockford base32, 80 bits) and the QR carry the
  same secret; room and key are derived by HKDF. On the first `hello` the projector rotates
  both and sends the new ones in the sealed `welcome`, so the QR is spent. Unused sessions
  expire after 5 minutes.
- **Storage**: pairings live only in a hidden `scope: 'client'` setting of the browser that
  paired — no world setting, no user flag, nothing on the Foundry server.
- **One projector per device**: a Web Lock per device lets only one tab of the browser
  project; a newer projector socket in the same room replaces the old one (`4000 replaced`).
- **Live ownership check**: every request re-checks that this tab's user still owns the
  projected actor; `invoke` for any other actor → `forbidden_actor` (audited). `rid` is the
  idempotency key.
- **Privacy filters**: whispers and blind rolls never reach the glasses. The map leaves out
  hidden tokens, shows secret doors as plain walls, and sends HP only for your own token and
  allies.
- **Disconnect**: the glasses first receive a sealed `{t:'revoked'}`, then the pairing is
  forgotten.

## 🏗️ Architecture

| Path | Role |
|---|---|
| `src/module.ts` | `init` → settings, menu, Players-list entry, `Alt+G`; `ready` → start the projector on every client and wire deltas |
| `src/settings.ts` | settings registration, `pairingEndpoints()` (app page + relay) |
| `src/direct/projector.ts` | per-pairing relay channel: `hello`/`get`/`invoke`/`ping`, rotation, delta fan-out, map throttle (≤ 1/s per device) |
| `src/direct/relay-connection.ts` | projector ⇄ relay WebSocket, backoff 1 → 30 s, `peer-up`/`peer-down`, per-device Web Lock |
| `src/direct/pairing-flow.ts` | pairing session (code, room, key, QR), relay `/health` check, expiry, revocation |
| `src/direct/pairing-store.ts` | client-scope pairing registry (re-validated on read) |
| `src/direct/PairG2App.ts` + `templates/pair-g2.hbs` + `styles/pair-g2.css` | ApplicationV2 «Connect G2 glasses» window |
| `src/direct/players-menu.ts` | Players-list context entry + `Alt+G` keybinding |
| `src/direct/ownership.ts` | owned/assigned characters, live ownership check |
| `src/direct/map-reader.ts` · `map-assets.ts` | `MapSnapshot` from scene data; scene art downsized in the tab and sent once as `asset` (`evf-asset:<id>`) |
| `src/direct/own-targets.ts` · `roll-request.ts` | glasses targets as the tab user's own Foundry targets; GM roll requests → `r1.roll.request` deltas |
| `src/readers/*` | character / combat / chat-log snapshots, hook subscribers |
| `src/write-path/*` | tool registry, handlers, idempotency, audit log, combat watchers |

## 🚀 CI/CD / Release

```bash
pnpm --filter @evf/foundry-module build        # tsup → dist/module.js (bundles @evf/shared-protocol + qrcode)
pnpm --filter @evf/foundry-module test
pnpm --filter @evf/foundry-module typecheck
pnpm dev:glasses                               # app from this checkout on the LAN + relay check + its QR
```

For development, symlink this folder into `<FoundryData>/Data/modules/evenfoundryvtt`. The
release zip holds `module.json`, `dist/`, `lang/`, `templates/` and `styles/`
(`.github/workflows/foundry-module-release.yml`); the `.ehpk` is a separate release asset
([release/foundry-module.md](../../docs/release/foundry-module.md)).

## 📚 Documentation

- [ADR-0019 — Relay pairing, player's tab projects](../../docs/architecture/0019-relay-pairing-player-projector.md)
- [Setup guide](../../docs/setup-guide.md) · [Runbook](../../docs/runbook.md)
- [G2 sheet UX — glasses HUD design](../../docs/design/g2-sheet-ux.html)
- [ADR-0011 — Single-workflow-origin write path](../../docs/architecture/0011-foundry-write-path-single-workflow-origin.md)
