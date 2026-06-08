---
status: partial
phase: 25-promozione-raster-a-default-boot-fallback-glyph
source: [25-VERIFICATION.md, 25-VALIDATION.md]
started: 2026-06-08
updated: 2026-06-08
---

## Current Test

[awaiting human testing on physical G2 hardware]

## Tests

### 1. Raster default boot su G2 fisico
expected: Avviando senza alcun flag (view.map.mode non-glyph), il G2 mostra la HUD raster di default — 4 tile canvas 200×100 (regione 400×200) renderizzati; gesture R1 funzionanti via container isEventCapture:1.
result: [pending]

### 2. Glyph fallback (BLE-degraded) su G2 fisico
expected: Forzando il verdict glyph (view.map.mode='glyph' o BLE-degraded), lo switch porta al 3-container text schema (header/footer/status-hud) con map-capture come capture provider e gesture corrette; resa byte-identica al comportamento pre-v0.10.0.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
