---
"@evf/foundry-module": patch
---

Stop reading the deprecated dnd5e `SpellData#preparation.{mode,prepared}` getters
in `extractSpellbook` (they logged a compatibility-warning flood on every
character snapshot for any spellcaster on dnd5e 5.1+). Now read the new top-level
`SpellData#method` / `SpellData#prepared` fields, falling back to the legacy
`preparation` object only for dnd5e < 5.1. No behavior change to the emitted
spellbook; removes the console-warning spam.
dnd5e 5.3 `prepared` is a number (0 unprepared, 1 prepared, 2 always): a spell counts as
prepared when `prepared >= 1` (or it is a cantrip / innate / at-will) and as always
prepared when `prepared === 2` (or innate); a legacy boolean is still accepted.
