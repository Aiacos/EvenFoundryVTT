---
"@evf/foundry-module": patch
"@evf/shared-protocol": minor
---

Combat snapshots now carry each combatant's **token UUID** (`tokenUuid`, e.g.
`Scene.X.Token.Y`) read from `combatant.token?.uuid`. The combatant `id` is the
Combatant document id, NOT a token UUID, so the glasses target picker — which forwards
the selected target into MidiQOL's `midiOptions.targetUuids` — was passing a value
MidiQOL could not resolve, silently producing no attack/cast on the chosen token (only
the EVF Audit card appeared). `CombatantSchema` gains an optional+nullable `tokenUuid`
field (back-compat with pre-tokenUuid module builds) and the combat reader emits it.
