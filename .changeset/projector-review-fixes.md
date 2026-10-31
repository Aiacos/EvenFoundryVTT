---
"@evf/foundry-module": patch
"@evf/shared-protocol": patch
---

Projector review fixes. Privacy: the glasses' combat tracker leaves out hidden combatants and shows exact HP/AC only for friendly or owned ones; pushes stop as soon as the tab loses ownership; on a GM tab the glasses see the player's chat, never the GM's whispers; ownership follows Foundry's `testUserPermission` (an explicit lower level wins over an OWNER default). Write path: `move-token` keeps `actor_id` and moves only the paired actor's token, `drop-concentration` deletes only the concentration effect, a replayed `invoke` no longer resets the player's targets, pending template placements are bounded. Performance: the map is re-sent only when it changed (hooks of other scenes ignored), character snapshots are built only for projected actors, pictures encode 4 at a time and the hello push no longer stalls later requests. Races: a tab queued behind the projector lock dials the current room; a QR expiring mid-rotation no longer forgets the new pairing.
