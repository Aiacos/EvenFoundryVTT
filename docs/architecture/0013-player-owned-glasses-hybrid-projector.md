---
status: accepted
date: 2026-09-23
deciders: maintainer
consulted: foundryvtt.com/article/users (user management rights)
informed: foundry-module, g2-app, shared-protocol
---

# ADR-0013: Player-Owned Glasses — Self-Service Pairing + Hybrid Projector

## Status

**ACCEPTED** — 2026-09-23. Amends [ADR-0012](./0012-direct-foundry-streaming.md) (pairing,
key custody, projector location) and [ADR-0011](./0011-foundry-write-path-single-workflow-origin.md)
(the single workflow origin becomes *the elected projector client*, still one per device
at a time, still through `dispatchTool`).

## Context

- ADR-0012 put every device key in the browser of the GM that paired it, and made the
  active GM the only projector. Every pairing needed the GM; changing the GM browser
  lost all keys.
- Several players may wear glasses; at a physical table **some** players also have
  Foundry open on their own device, others don't (maintainer, 2026-09-23).
- Foundry allows **only the GM** to create users and set passwords — *"Players and
  Trusted Players cannot create new user accounts or change passwords"*
  (foundryvtt.com/article/users). A dedicated "(G2)" user is still required (concurrent
  logins of one user are being blocked — foundryvtt issue #14728).

## Decision

1. **One-time GM enablement.** *«Abilita occhiali per i giocatori»* creates a "(G2)" user
   per player (role PLAYER) with a random password, and keeps the G2 user's actor
   ownership mirrored from its player (GM client, on `updateActor` / enablement).
2. **Key pairs.** Every participating client (players and GMs) holds an ECDH P-256 key
   pair: private key in `scope:'client'` storage, public key (JWK) in its own User flag
   `flags.evenfoundryvtt.pub`.
3. **Password delivery.** The GM seals the G2 password for the player's public key
   (ECDH → HKDF → AES-GCM) and stores the ciphertext in a public world record. Only the
   player's browser can open it. The GM can regenerate it at any time.
4. **Self-service pairing.** From their own Foundry, the player opens *«Associa i miei
   occhiali»*: their client generates the device AES key, shows the QR
   (`u`, `p`, `k` as in ADR-0012) and rotates the device key after the first `hello`
   (single-use QR). The password rotates only when the GM regenerates it.
5. **GM fallback custody.** The player's client seals the device key for each GM's
   public key and publishes the ciphertexts in its own User flags, so any GM browser
   (including a new one, after it publishes its public key) can serve as fallback.
6. **Projector election (per device).** Glasses address `to: "projector"`. The
   **player's own client** answers when its user is active; otherwise the **active GM**
   answers if it holds the device key. The non-elected client ignores the message. Only
   the elected client executes `invoke` (ADR-0011: one origin per device at a time).
7. **Actions from the player's client** run as that player (chat cards show the player);
   dnd5e `activity.use()` is allowed for owned actors; MidiQOL delegates GM-only steps
   through its own GM socket.

## Consequences

- ➕ No GM involvement after the one-time enablement; GM browser changes no longer
  lose keys; players with Foundry open get their own actions attributed to them.
- ➕ Players without Foundry open still work through the GM fallback.
- ➖ More crypto moving parts (ECDH + sealed blobs); covered by round-trip tests.
- ➖ Brief double-projector window on active/inactive transitions: guarded by the
  "only elected executes `invoke`" rule and the app's request timeout + retry.
- ➖ The G2 password can't be single-use without the GM; device key rotation keeps the
  QR single-use for the encrypted channel.

## Confirmation

Unit tests: ECDH seal/open, password delivery, key custody for multiple GMs, election
matrix (player active/inactive × GM active/none × key present/absent), self-service
pairing UI, ownership mirroring. Docs: Specs changelog + README + showcase (INV-3).
