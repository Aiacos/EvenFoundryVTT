---
"@evf/bridge": minor
---

On-connect character data delivery + session-scoped character selection (real-pairing session).

Adds three bridge features shipped in tasks d0v, dog, and flv:

- `DeltaEmitter.sendInitialToSession` pushes a targeted `character.delta` to a single session
  on WS connect, reusing `DELTA_CAP_MAP` cap-gating and the replay buffer (d0v).
- `CharacterSnapshotCache` (`Map<actorId, CharacterSnapshot>`) stores incoming `character.delta`
  envelopes from `/internal/delta` so `GET /v1/character/:actorId` and the on-connect push work
  without a live Foundry roundtrip (dog).
- Per-session `selectedActorId` persisted at handshake time; `pushInitialCharacterDelta` uses
  it to target the correct actor; `emitDelta` applies a three-present AND-guard to prevent
  `character.delta` from reaching sessions that selected a different PC (flv).

`buildServer` remains fully backward-compatible (options additive). socketlib handler count
unchanged at 17. No new dependencies.
