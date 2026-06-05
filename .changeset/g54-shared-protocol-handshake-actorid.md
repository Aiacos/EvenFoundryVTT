---
"@evf/shared-protocol": minor
---

Optional `actorId` added to `HandshakeClientSchema` (task flv).

The field is additive (optional string, no default, no migration required). It lets the
g2-app pass the player's chosen character ID at WS connect time so the bridge can target
the initial `character.delta` push to that actor's snapshot. Sessions that omit `actorId`
fall back to `roster.characters[0]` (existing behaviour preserved).
