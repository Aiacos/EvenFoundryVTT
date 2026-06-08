---
status: partial
phase: 21-character-sheet-su-canvas-dati-main-tab
source: [21-VERIFICATION.md, 21-VALIDATION.md]
started: 2026-06-08
updated: 2026-06-08
---

## Current Test

[awaiting human testing on physical G2 + R1 hardware]

## Tests

### 1. Legibilità scheda canvas su G2 fisico
expected: I 6 tab della scheda PG (Main/Skills/Inventory/Spells/Feats/Bio) sono leggibili e glanceable con font VT323 ciclando le tab su hardware G2 reale; il tab strip evidenzia il tab corrente (verifica fix CR-01).
result: [pending]

### 2. Portrait greyscale-dithered su G2
expected: Il ritratto del personaggio è riconoscibile in slot 3, greyscale-dithered, entro i limiti hardware image-container (≤200×100 px); nessun artefatto di rendering.
result: [pending]

### 3. Navigazione gesture R1
expected: press/scroll/double-press su R1 fisico navigano i tab con timing corretto e parity rispetto alla glyph path; double-tap esce/no-op come da design.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
