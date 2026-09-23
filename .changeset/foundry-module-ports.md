---
"@evf/foundry-module": minor
"@evf/shared-protocol": minor
---

Direct-channel hardening and ports:

- The projector re-checks on every hello / get / invoke that the paired player still owns
  the actor (revoking ownership in Foundry takes effect at once; denials are audited).
- Pairing lists only characters the chosen player owns (Players-list shortcut and GM
  pairing window) and refuses a stale selection.
- `welcome.moduleVersion` reports the running `evenfoundryvtt` version to the glasses.
- `details.classLabel` carries the multiclass label (e.g. «Fighter / Wizard»).
- Removed payload schemas nothing used any more (`r1`, `frame`, `perf-probe`, template /
  scene / concentration leftovers, combatant `tokenUuid`) and stale bridge-era wording.
