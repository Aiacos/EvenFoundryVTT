---
"@evf/foundry-module": patch
---

Fix every write-path handler that called `activity.use({ configure: false, ... })`
with the dialog-suppression flag in the WRONG (usage) argument. dnd5e 5.x
`Activity#use(usage, dialog, message)` reads `configure` from the **dialog (2nd)**
argument and defaults it to `true` (INV-2: foundryvtt/dnd5e
`module/documents/activity/mixin.mjs` — `if (dialogConfig.configure && …)`), so the
configuration dialog stayed enabled and `activity.use` awaited a dialog no one can
answer from the glasses → every spell cast / item use / attack hung until the
bridge's 10s `foundry_timeout`. Verified live in the EvenHub simulator: cast-spell
timed out at exactly 10s; skill-check (which already used the 2nd arg) worked.

Corrected `cast-spell`, `use-item`, `cast-shield`, `cast-counterspell`,
`weapon-attack`, and `opportunity-attack` to `use(usage, { configure: false }[, message])`
(opportunity-attack's `opportunityAttack` chat flag moved to its proper message arg).
Widened the `Activity#use` type to the real 3-arg signature. Tests updated to assert
the corrected call shape (regression).
