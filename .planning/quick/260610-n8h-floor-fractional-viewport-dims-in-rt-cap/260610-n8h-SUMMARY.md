---
status: complete
---

# Summary — 260610-n8h floor fractional viewport dims

**Root cause (live console experiment on the real Forge client, 2026-06-10):** `renderer.screen` is fractional at devicePixelRatio 1.333 (2348.25×824.25). PIXI `RenderTexture.create` floors internally (texture 2348×824 → 7,739,008 bytes) while the extractor computed expected length from the fractional dims (7,742,180.25) → byte-length guard mismatch → every frame skipped ("pixel buffer length mismatch"). The RT capture itself was proven good on the same client (A_rt maxG=255, PIXI 7.4.3).

**Fix:** `vw`/`vh` derivation now floors to integers: `Math.max(1, Math.floor(renderer.screen?.width ?? renderer.width))` (both axes). Test CE-VP-8 covers the fractional fixture (frame emitted; RT.create called with integer dims). Changeset `n8h-floor-fractional-viewport-dims` (patch @evf/foundry-module).

**Gates:** typecheck 0 · 579/579 foundry-module tests · biome clean on the two committed files (workspace lint errors belong to uncommitted TEMP-DIAG g2-app lines, removal scheduled post-live-verify).

**Commit:** e8233b8 (executor died on API ConnectionRefused after writing code+test; orchestrator completed changeset/gates/commit inline).
