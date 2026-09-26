---
title: FoundryVTT G2 HUD — Privacy
---

# 🔐 FoundryVTT G2 HUD — Privacy policy

_Last updated: 2026-09-25 · applies to the Even Hub app **FoundryVTT G2 HUD**
(`io.github.aiacos.foundryvtt`) and the hosted page `https://aiacos.github.io/EvenFoundryVTT/app/`._

## 💡 In one sentence

The app shows **your own** Foundry VTT character on your Even Realities G2 glasses. It
has no account, collects nothing about you, and everything it exchanges with your
Foundry tab is end-to-end encrypted.

## 🏗️ What travels where

- **Your Foundry tab ⇄ the relay ⇄ the app.** Your Foundry browser tab (the
  EvenFoundryVTT module) and the app meet in a random "room" on the relay
  **`evf-relay.evf-relay.workers.dev`** (a Cloudflare Worker operated by the
  EvenFoundryVTT project, source: `packages/relay`). Every message is sealed with
  AES-256-GCM using a key that only your Foundry tab and your phone know (it is in the
  pairing QR / code and rotates on first use). The relay forwards opaque bytes: it cannot
  read your character, map or actions.
- **What the relay sees:** the random room id, the time and size of messages, and the
  network address of the two connections (as any web server does). It stores nothing:
  rooms exist only while connected. Cloudflare may keep standard request logs under its
  own policy.
- **The app never contacts your Foundry server** and never asks for a Foundry login.

## ⚙️ Permissions

| Permission | Why | What happens to the data |
|---|---|---|
| **Network** — `https://` and `wss://evf-relay.evf-relay.workers.dev` only | To exchange the encrypted messages with your Foundry tab | Encrypted end-to-end; nothing stored by the relay |
| **Camera** | «Scansiona QR / Scan QR»: to read the pairing QR shown in Foundry | The photo is decoded on the phone and discarded; it is never uploaded |

## 📦 Stored on your phone

The pairing (room id + encryption key), and your display preferences (language, map zoom).
They stay in the app's storage on your phone until you tap «Forget pairing» or uninstall.

## 👤 Contact

Questions or requests: open an issue at
<https://github.com/Aiacos/EvenFoundryVTT/issues>. The project is open source (MIT).
