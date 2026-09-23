---
"@evf/foundry-module": patch
---

Fix character snapshots being silently dropped for any actor with no temporary HP.
dnd5e leaves `hp.temp` as `null` (not 0) when there is no temp HP; character-reader
passed it through as `tempHp: null`, failing `CharacterSnapshotSchema`
(`tempHp: number().nonnegative()`), so the snapshot never reached the glasses → empty
sheet. Coerced to 0.
