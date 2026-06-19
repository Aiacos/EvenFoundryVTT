---
"@evf/foundry-module": patch
---

Fix character snapshots being silently dropped for any actor with no temporary HP.
dnd5e leaves `hp.temp` as `null` (not 0) when there is no temp HP; character-reader
passed it through as `tempHp: null`, failing the bridge's `CharacterSnapshotSchema`
(`tempHp: number().nonnegative()`). The bridge still 200s the `/internal/delta` POST
but never caches the snapshot → `GET /v1/character/:id` 404 → empty glasses sheet.
Coerced to 0.
