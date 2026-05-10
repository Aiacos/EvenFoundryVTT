# Palette Calibration Methodology (§10.0.9 + Pitfall 15)

**Goal:** Verify perceptually-spaced 16-step greyscale palette renders within ±10% L\* uniformity on G2 phosphor. Without this, midtone tokens (NPCs in normal lighting) render nearly-invisible against dungeon stone (Pitfall 15: sRGB-vs-linear Floyd-Steinberg pushes midtones darker than perceptually correct).

## Camera Settings (smartphone, locked manual mode)

| Setting | Value | Why |
|---------|-------|-----|
| ISO | 100 | Lowest noise; baseline reference |
| Exposure | 1/30 s | Fixed shutter — no auto-adjust between ramp steps |
| White Balance | Daylight (≈5500K) | Locked — no auto-adjust per shot |
| Focus | Manual, locked on G2 display center | Auto-focus drift introduces variance |
| Aperture | Native (smartphone usually fixed f/1.7-f/2.0) | — |

## Ambient Light Protocol

- Single LED desk lamp, ~3000K, ~150 lux measured at G2 surface (use phone lux meter app or visual estimate dim-room)
- No overhead lighting
- No direct light on the G2 display (eliminates spec reflections)
- Same room + same setup for all 3 ramp captures (uniform → derived-v1 → derived-v2)

## Capture Procedure

1. Mount phone in fixed position (tripod or stable stand) ~30 cm from G2 worn or held in fixture
2. Run `tests/phase-0/10-0-9-palette-calibration.ts` (created in Plan 03) — script renders uniform 16-step ramp on G2
3. Photograph 3× per ramp (allow recovery between shots)
4. Iteration: derive perceptual palette via `pow(srgb/255, 2.2)` linearization + inverse CIE L\* mapping, re-render, re-photograph
5. Stop when L\* spacing within ±10% of uniform spacing in L\* space (max 3 iterations per CONTEXT.md D-13 rationale)

## L\* Derivation (per ramp photo)

For each of the 16 steps:
1. Crop central 50×50 px region (avoids edge artifacts)
2. Compute mean RGB (or just G channel — phosphor is monochrome green)
3. Convert to relative luminance: `Y = G/255` (G2 is monochrome — skip Rec. 709 weighting)
4. Apply CIE L\*: `L* = 116 · (Y/Yn)^(1/3) − 16` for `Y/Yn > 0.008856`; else `L* = 903.3 · (Y/Yn)`
5. `Yn` = max measured Y across all 16 steps (acts as white-reference normalizer)

## Output

`calibration/ramp-uniform-{ISO8601}.png` — photo of uniform ramp on G2
`calibration/ramp-perceptual-vN-{ISO8601}.png` — photo after iteration N
`calibration/ramp-measurement.csv` — `step_idx, measured_g_mean, measured_y, derived_lstar, target_lstar, deviation_pct`

## ΔE76 vs CIEDE2000

ΔE76 (simple Euclidean L\*a\*b\*) sufficient for Phase 0 binary GO/NO-GO (G2 is monochrome, a\* and b\* dimensions don't apply). Defer CIEDE2000 to Phase 4a if midtone visibility remains borderline after Phase 0.

## Sources

- Wikipedia "Floyd-Steinberg dithering" — verbatim "all values should be linearized first" (verified 2026-05-10)
- Pitfall 15 mitigation 2 (`.planning/research/PITFALLS.md` §15)
- Specs.md §10.0.9
- CONTEXT.md D-13
