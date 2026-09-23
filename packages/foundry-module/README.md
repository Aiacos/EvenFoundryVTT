# @evf/foundry-module (`evenfoundryvtt`)

## 🎲 Overview

The Foundry VTT module is the whole server side of EvenFoundryVTT
([ADR-0016](../../docs/architecture/0016-direct-foundry-streaming.md)). It runs in the
GM's browser as the **projector**: it reads the character, combat, chat log and map, and
runs every glasses action through `dispatchTool`
([ADR-0011](../../docs/architecture/0011-foundry-write-path-single-workflow-origin.md)).
It talks to the G2 app directly over the Foundry socket relay `module.evenfoundryvtt`.
The module also ships the G2 app itself under `g2/`. Foundry serves it at
`https://<foundry>[/<prefix>]/modules/evenfoundryvtt/g2/index.html`. You don't need a
bridge, Docker or a second server.

## 🧰 Compatibility

- Foundry VTT: minimum 13.347, verified 14 (`module.json` → `compatibility`).
- dnd5e: ≥ 5.3.3.
- MidiQOL: optional at runtime. When MidiQOL is active, handlers call
  `MidiQOL.completeActivityUse` (advantage + explicit targets). Otherwise they fall back
  to vanilla `activity.use()`.
- socketlib: **no longer needed**. The projector already runs in the GM client, so no
  `executeAsGM` round-trip is left.
- Foundry must be served over **valid HTTPS**. The Even Realities App loads the glasses
  app from Foundry's own origin.

## 📦 Installation / Setup

1. Install the module from the manifest URL
   (`https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json`) and
   enable it in your world.
2. As GM, go to *Game Settings ▸ Configure Settings ▸ EvenFoundryVTT* and open
   **Associa occhiali G2** (EN: *Pair G2 glasses*).
3. Pick the player and the character, then press **Genera nuovo QR**. The window shows:
   - the QR. It works once and expires after 5 minutes; after that it is hidden and the
     credentials are rotated.
   - the 16-character **manual code** under the QR.
   - the checks *HTTPS valido · modulo servito · socket attivo*.
   - the paired devices, with their last contact and a **Revoca** button.
4. The player scans the QR with the Even Realities App, and the glasses connect.

Manual fallback (mock P03): open the same URL on the phone, pick the `"<Player> (G2)"`
user and type the code. The code is the Foundry password of that user, without the
dashes. The device key is `HKDF-SHA256(code, salt = userId)`.

## 🔐 Security / Auth

- **One user per paired player**: `"<Player> (G2)"`, role PLAYER, OWNER only on the
  chosen actor. It is tagged `flags.evenfoundryvtt.g2For = <playerId>`, so pairing again
  refreshes the same user. It is never TRUSTED, ASSISTANT or GM.
- **Sealed envelopes**: every message on the relay is AES-256-GCM encrypted with the
  device key. The AAD is `from>to`, and a `ts` inside the ciphertext bounds replay.
  Other clients only see ciphertext (`@evf/shared-protocol` `direct/envelope.ts`).
- **Key storage**: keys live only in a hidden `scope: 'client'` setting of the GM
  browser that did the pairing. The world setting `g2Devices` holds public metadata
  only (user, player, actor, label, timestamps, `pendingRotation`).
- **One-time pairing**: on the first `hello` the projector sets a random 144-bit
  password on the G2 user. It sends the new password and a new 256-bit key in `welcome.rotate`,
  sealed with the old key. The old key is still accepted for 60 s.
- **Privacy filters**: whispers and blind rolls never reach the glasses. The map
  leaves out hidden tokens, shows secret doors as plain walls, and sends HP only for
  your own token and allies.
- **Write guard**: `invoke` may only act for the paired actor (`actor_id` is forced,
  and a foreign actor is rejected). `rid` is the idempotency key.
- **Revoke**: the device first receives a sealed `{t:'revoked'}`. Then the G2 user is
  deleted and the key is forgotten.

## 🏗️ Architecture

| Path | Role |
|---|---|
| `src/module.ts` | `init` → settings + menu; `ready` → start the projector (GM only) and wire deltas |
| `src/direct/projector.ts` | relay listener: `hello`/`get`/`invoke`/`ping`, delta fan-out, map throttle (≤ 1/s per device) |
| `src/direct/pairing-store.ts` | device registry (client-scope secrets / world-scope metadata) |
| `src/direct/g2-user.ts` | create / refresh / delete the "(G2)" user, grant actor ownership |
| `src/direct/pairing-flow.ts` | pairing session (code, key, QR), expiry, revocation, environment checks |
| `src/direct/PairG2App.ts` + `templates/pair-g2.hbs` | ApplicationV2 window (mock P01) |
| `src/direct/map-reader.ts` | `MapSnapshot` from scene data (cells, walls, visible tokens) |
| `src/readers/*` | character / combat / chat-log snapshots, hook subscribers |
| `src/write-path/*` | tool registry, handlers, idempotency, audit log, combat watchers |

Only the client of the active GM (`game.users.activeGM`) answers on the relay. That GM
must be the one who paired the devices, because the keys are stored in that browser.

## 🚀 CI/CD / Release

```bash
pnpm --filter @evf/foundry-module build:all   # g2-app → g2/, then tsup → dist/module.js
pnpm --filter @evf/foundry-module test
pnpm --filter @evf/foundry-module typecheck
```

The release zip holds `module.json`, `dist/`, `g2/`, `lang/` and `templates/`
(`.github/workflows/foundry-module-release.yml`). `g2/` is build output and is git-ignored.

## 📚 Documentation

- [ADR-0016 — Direct Foundry → G2 streaming](../../docs/architecture/0016-direct-foundry-streaming.md)
- [G2 sheet UX — glasses HUD design](../../docs/design/g2-sheet-ux.html)
- [Pairing flow + mocks P01–P03](../../docs/design/g2-thirds-layout.md) (in the superseded thirds-layout doc)
- [ADR-0011 — Single-workflow-origin write path](../../docs/architecture/0011-foundry-write-path-single-workflow-origin.md)
