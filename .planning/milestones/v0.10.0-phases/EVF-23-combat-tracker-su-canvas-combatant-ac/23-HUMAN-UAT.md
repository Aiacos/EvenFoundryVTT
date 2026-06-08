---
status: partial
phase: 23-combat-tracker-su-canvas-combatant-ac
source: [23-VERIFICATION.md, 23-VALIDATION.md]
started: 2026-06-08
updated: 2026-06-08
---

## Current Test

[awaiting human testing on physical G2 + R1 hardware]

## Tests

### 1. Combat tracker canvas + finestra 5-combattenti + auto-follow su G2 fisico
expected: Avviando un combattimento in Foundry, il combat tracker raster appare su G2 con finestra a 5 combattenti; il turno corrente è evidenziato full-contrast (fillRect invertito leggibile su 4-bit greyscale) e la finestra lo segue automaticamente all'avanzare del turno; scroll manuale R1 ispeziona gli altri.
result: [pending]

### 2. AC reale vs fallback su display G2
expected: La colonna AC mostra l'AC reale dei combattenti (allineata INV-1) e ' --' per i combattenti senza AC; nessun disallineamento colonna su hardware.
result: [pending]

### 3. Double-press close gesture su hardware
expected: La gesture double-press chiude il pannello combat tracker su G2 esattamente come nella versione glyph (PanelGestureBus↔router a runtime).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
