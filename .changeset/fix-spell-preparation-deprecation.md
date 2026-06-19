---
"@evf/foundry-module": patch
---

Stop reading the deprecated dnd5e `SpellData#preparation.{mode,prepared}` getters
in `extractSpellbook` (they logged a compatibility-warning flood on every
character snapshot for any spellcaster on dnd5e 5.1+). Now read the new top-level
`SpellData#method` / `SpellData#prepared` fields, falling back to the legacy
`preparation` object only for dnd5e < 5.1. No behavior change to the emitted
spellbook; removes the console-warning spam.
