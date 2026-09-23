---
status: accepted
date: 2026-09-23
deciders: maintainer
consulted: foundryvtt.com/article/users (user management rights, verbatim re-check 2026-09-23)
informed: foundry-module, g2-app, shared-protocol
---

# ADR-0013: Player-Owned Glasses — Self-Service Pairing + Hybrid Projector

## Status

> **ERRATUM** — 2026-09-23: the Context quote from foundryvtt.com/article/users was a paraphrase, not the page text; replaced with the verbatim sentence (which also grants Assistant GMs user configuration). The decision is unchanged.

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
- Foundry lets **only GMs (and Assistant GMs)** configure other users, passwords included —
  *"If you are a user with the player or trusted player role you can only open your own
  user configuration, but gamemasters and assistant gamemasters can configure any user
  they want"* (foundryvtt.com/article/users, re-fetched 2026-09-23). A dedicated "(G2)"
  user is still required (concurrent logins of one user are being blocked — foundryvtt
  issue #14728).

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

### Confirmation — implementation (2026-09-23)

Tests covering the items above:

- ECDH seal/open (round trip, wrong key, tampering, context binding, malformed input),
  custody record schemas, key-only `rotate`: `packages/shared-protocol/src/direct/ecdh.test.ts`
- Election matrix (player active/inactive × GM active/none × key present/absent,
  multi-GM preference, stale GM key, unowned actor): `packages/foundry-module/src/direct/election.test.ts`
- Enablement, sealed password delivery, re-seal on new player key, regeneration,
  ownership mirroring: `packages/foundry-module/src/direct/glasses-access.test.ts`
- Self-service pairing, key custody for multiple GMs, expiry, custody reconciliation:
  `packages/foundry-module/src/direct/self-pairing.test.ts`
- Hybrid projector (player answers + key-only rotation, GM fallback via `gmKeys`,
  only-elected-executes, takeover on `userConnected`, player-own targets, ADR-0012
  migration via `keyHolder`, on-behalf pairing of an enabled player):
  `packages/foundry-module/src/direct/projector-hybrid.test.ts`
- Identity keys, self flags, custody sync hooks, player targets:
  `packages/foundry-module/src/direct/custody-sync.test.ts`
- Pairing window GM/player modes and enablement UI: `packages/foundry-module/src/direct/PairG2App.test.ts`;
  player menu entry: `players-menu.test.ts`; GM-only world writers + migration: `pairing-store.test.ts`
- G2 app: `to: "projector"`, sender-agnostic authentication, key-only rotation persisted:
  `packages/g2-app/src/direct/session.test.ts`, `credentials.test.ts`
