# ADR-0006: Raster Pipeline Library Stack

**Date:** TBD (Phase 0 closure date)
**Deciders:** Single-developer (project owner)
**Depends on:** ADR-0005 (Branch verdict)

## Status

**PROPOSED** — template stub. Content is **conditional on ADR-0005 Branch verdict** per CONTEXT.md D-14. Will move to ACCEPTED at Phase 0 closure (Plan 04) once the Branch verdict resolves whether to commit to the lib stack (A/B path) or declare it moot (C path).

## Context

Phase 4a raster pipeline (Specs.md §11.5.7) requires a 4-bit indexed PNG encoder + Floyd-Steinberg/Atkinson dither + sub-tile delta hash. This ADR commits to a specific library stack OR declares the stack moot if Branch C is selected.

## Decision (populate at closure per Branch verdict from ADR-0005)

### If Branch A or B (raster ships as default OR opt-in)

**Library stack — pinned versions verified 2026-05-10 via `npm view`:**

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `image-q` | 4.0.0 | Floyd-Steinberg / Atkinson / Bayer dither + custom 16-step palette | `npm view image-q@4.0.0` (CLAUDE.md §11.5.7) |
| `upng-js` | 2.1.0 | 4-bit indexed-palette PNG encode | `npm view upng-js@2.1.0` |
| `xxhash-wasm` | 1.1.0 | Sub-tile hash for delta encoding (Layer 1 + Layer 2) | `npm view xxhash-wasm@1.1.0` |

**Drift signal (verified 2026-05-10):** `image-q@4.0.0` last-published 2022-06-19 (no newer release on npm). Repository reference is `git+https://github.com/ibezkrovnyi/image-quantization.git`. **Mitigation:** pin-by-hash in `pnpm-lock.yaml` so a sudden npm yank/republish cannot silently shift the bundle. Re-verify before Phase 4a entry gate.

**Why these libraries (CLAUDE.md §11.5.7 + research):**
- `image-q` is the only npm library with FS+Atkinson+Bayer **and** custom palette support; ~60 KB gz; worker-safe (no DOM dep)
- `upng-js` is the only mature npm encoder supporting `depth: 4` indexed palette (matches G2 wire format §3.1); ~25 KB gz; Photopea-maintained
- `xxhash-wasm` provides ~1 GB/s WASM throughput → 5-10× faster than custom JS murmur/FNV; critical for 15 fps stretch (CLAUDE.md §11.5.7.1); 1.3 KB gz

**Alternatives rejected (CLAUDE.md §11.5.7 + research §"Don't Hand-Roll"):**
- `jimp` — Bayer 565 dither only, no FS/Atkinson, no 4-bit indexed PNG
- `pngjs` — 8-bit only
- `fast-png` — decode-only at 4-bit
- Hand-rolled MurmurHash3 in JS — 5-10× slower than xxhash-wasm

### If Branch C (glyph-only, raster deferred)

**Decision:** Raster pipeline library stack is **DEFERRED to Phase 13 stretch** (expanded STRETCH-07 scope). MVP ships glyph-only mode per Specs.md §11.5.8.2.

**Rationale:** With BLE p99 <100 kbps in any tested environment OR queue depth ≥4, raster cannot meet the 5 fps committed floor (D-11). Glyph mode (text grid 96×24 char) refreshes on event, no fps target, no encoding pipeline needed.

**Library decision moot for MVP.** Re-evaluate in Phase 13 if Even Realities ships firmware/hardware revision improving BLE throughput envelope.

## Sources

- ADR-0005 (Branch verdict)
- CLAUDE.md §11.5.7 (raster pipeline lib stack rationale)
- CLAUDE.md §11.5.7.1 (xxhash-wasm performance critical for 15 fps)
- CLAUDE.md §11.5.8.2 (Branch C glyph-only architecture)
- CONTEXT.md D-14 (ADR-0006 conditional content protocol)
- `npm view image-q time --json` 2026-05-10 (drift signal verification)
