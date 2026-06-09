---
slug: canvas-body-blank-ws-drop
status: resolved
trigger: "v0.10.0 canvas raster HUD: in the EvenHub simulator the canvas-mode status-hud header renders DOUBLED/overlapping (same PF/LV content painted twice with a slight x-offset). [REOPENED] The blank-body and WS-drop symptoms were correctly ruled NON-bugs (expected Phase 20 behavior). The CHROME-01 fix did NOT eliminate the doubled header on a verified-clean fresh boot — re-investigate."
created: 2026-06-08
updated: 2026-06-08
---

# Debug: canvas character-sheet body blank + data WS drops after boot

## Symptoms

- **Expected behavior:** On boot in the EvenHub sim, the default canvas raster HUD (v0.10.0 "Raster UI Substrate", shipped 2026-06-08) should composite the full character sheet for the seeded actor (Aiacos Stormborn, PF 41/63, LV 10, Wizard 10) inside the HUD frame, and live `character.delta` / `combat.state` pushes should recompose the canvas (~5fps xxhash delta loop).
- **Actual behavior:** Only the **header + frame chrome** render — glyph-mode text `PF 41/63 · LV 10` (so the on-connect snapshot DID flow and reached the header). The **canvas body stays blank** (white inside the green frame). Header glyphs render **doubled/overlapping** ("PF 41/68" superimposed — looks like a double draw). After boot the **data WS drops and stops retrying**; subsequent `/internal/delta` re-seeds produce **0 new console events** (no recompose).
- **Error messages:** Bridge log shows clean `/ws` upgrades, **no error/close reason** (only non-fatal `deepgram-stt: voice path disabled` warn + a `module.register()` deprecation notice). g2-app console shows `[EVF/debug-agent] WebSocket error — debug agent connection lost / closed` (this is the SEPARATE dev debug-agent WS, likely non-fatal) and 5 panel lazy-load exclusions (`quick-action-menu`, `reaction-prompt`, `slot-picker`, `target-picker`, `template-placement` — known non-fatal dev lazy-load failures). NO main-data-WS error logged, NO canvas/render error logged.
- **Timeline:** First-ever live-sim smoke test of the NEW canvas raster path. The prior memory note "HUD production-clean" (2026-06-05) refers to the OLD 27px glyph HUD, which v0.10.0 (Phases 19–26) REPLACED entirely. v0.10.0 milestone close (2026-06-08) included BLOCKER-01 fix `19e02c8 fix(audit): wire character.delta → CanvasCharacterSheetPanel.onSnapshot` — so the canvas-sheet wiring was just touched. Hardware/visual UAT was DEFERRED at milestone close (ADR-0005 Branch A), so this path was never visually verified end-to-end.
- **Reproduction (recipe, this box):**
  1. Bridge: `EVF_DEV_NO_AUTH=true EVF_INTERNAL_SECRET=dev-secret PORT=8911 corepack pnpm --filter @evf/bridge exec tsx src/index.ts` (currently RUNNING this session).
  2. Seed: `cd packages/bridge && SEED_BRIDGE=http://localhost:8911 SEED_SECRET=dev-secret corepack pnpm exec tsx _seed.ts` (pushes `r1.characters.available` + `character.delta` + `combat.state`).
  3. g2-app: `VITE_EVF_NO_AUTH=true VITE_EVF_DEV_BRIDGE_URL=http://localhost:8911 corepack pnpm --filter @evf/g2-app dev` (:5173, RUNNING).
  4. Sim (headless): xvfb + GTK env per memory `evenhub-simulator-headless-launch`, pointed at `http://localhost:5173/?actor=pc-aiacos`, `--automation-port 9898` (RUNNING).
  5. Capture: `GET http://127.0.0.1:9898/api/screenshot/glasses` (576×288 RGBA) → header-only/blank-body. Console: `GET :9898/api/console[?since_id=N]`.

## Evidence (from orchestrator live investigation 2026-06-08)

- timestamp 2026-06-08: 14 frames captured at a fresh sim boot are BYTE-IDENTICAL (5236 bytes each) → blank body is NOT a timing/race artifact; the canvas body simply never draws.
- timestamp 2026-06-08: Bridge log shows 4× `GET /ws` over the session with backing-off intervals (req-4 @ +28s, req-5 @ +59s, req-6 @ +100s) = WsReconnectController reconnect loop early, then NO further `/ws` attempts during a 48s steady poll (stuck at connect-count 4) → after the boot connect the WS is gone and not retrying.
- timestamp 2026-06-08: Pushing a fresh `character.delta` to a session-active bridge produces 0 new g2-app console events (`since_id` delta empty) → the live push is NOT fanned to / received by the app (WS closed, or DeltaEmitter not targeting the session).
- timestamp 2026-06-08: At BOOT, console ids 19–25 are `evenAppMessage` intercepts (the boot page draw incl. header) → SDK draw calls DO fire at boot and the header gets seed data. So data flowed at least once; the canvas body did NOT draw even then.
- timestamp 2026-06-08: Header text renders DOUBLED ("PF 41/68" overlap) — possible double-draw (glyph + raster both?) or stale-frame composite.
- timestamp 2026-06-08 (debug session): Full source trace confirms root cause — see below.
- timestamp 2026-06-08 (REOPEN by orchestrator): The CHROME-01 fix (guard `writeHeaderChrome`/`writeFooterChrome` behind `getRenderMode() !== 'canvas'`) is CONFIRMED in source (`boot-engine-core.ts:1497`), BUT the doubled header STILL renders on a **guaranteed-clean fresh boot**. Clean-environment proof: (1) the prior verification almost certainly read a STALE vite — a pre-fix `vite` process (pid 1681660) survived `pkill -f vite` and stayed bound to :5173; the subagent's "after-fix" screenshot hit that stale instance. (2) Orchestrator killed it by PID, started ONE clean vite on :5173 (no port collision, no `--force` error), launched a brand-new sim (pid 1761492) pointed at `:5173/?actor=pc-aiacos`, re-seeded, captured `/tmp/glasses_CLEAN.png` (5222 bytes). Doubling PERSISTS.
- timestamp 2026-06-08 (REOPEN): Zoomed header crop (`/tmp/header_zoom2.png`, 6× nearest) reads `PF 41/6〔3⊕8〕 〔L⊕1〕8V 10` — i.e. the **same status content painted TWICE** with a small x-offset (the `3` and `8` glyphs superimposed; the `L` and `1` superimposed). This is NOT a "MAP·—·raster TURNO" chrome line overlapping the status line (those are different strings). So CHROME-01 (writeHeaderChrome → id=4) was at most ONE layer; a SECOND source renders the same `PF 41/63 … LV 10` status line again. Suspects to trace: (a) `CanvasStatusHudLayer._drawDynamic` drawing on the canvas image tile AND a glyph `StatusHudLayer` ALSO writing the status line to a text container (both visible); (b) the status line drawn twice within the canvas compositor (e.g. _drawStatic + _drawDynamic both painting it, or a stale tile not cleared before redraw); (c) two text containers at overlapping geometry both receiving the status string.
- timestamp 2026-06-08 (FIX-DD-01): Pixel-level analysis of `/tmp/glasses_test.png` confirmed the real root cause: `_drawDynamic` in `canvas-status-hud-layer.ts` used three independent `fillText` calls with hardcoded x offsets (4, 60, 100). At VT323 16px, "PF 41/63" renders ~75px wide, extending past x=60 where "CA 18" starts — causing both strings to OVERLAP at x=60-79. The `3`/`C`, `6`/`A`, `/`/`space` glyph shapes superimposed produce the visual signature of "same string twice with slight x-offset". Fixed by replacing hardcoded offsets with `ctx.measureText`-based dynamic positioning (`acX = 4 + hpWidth + STATUS_FIELD_GAP_PX`, `lvX = acX + acWidth + STATUS_FIELD_GAP_PX`). Verified: clean fresh boot after fix shows `PF 41/63 CA 18 LV 10` with no overlap.

## Current Focus

hypothesis: RESOLVED — FIX-DD-01 applied and verified.
test: n/a
expecting: n/a
next_action: n/a
reasoning_checkpoint: Both CHROME-01 and FIX-DD-01 are applied. The doubled glyph was caused entirely by hardcoded x offsets in _drawDynamic. The CHROME-01 fix was also correct (guards glyph chrome writes in canvas mode) and is kept.
tdd_checkpoint:

## Eliminated

- WS dropping after boot: MISDIAGNOSIS. The earlier backoff connects (req-4..6) were from prior boot sessions this workspace session. The current session connect (req-a) persists. The "0 new console events" after re-seed is correct — `HudDeltaDriver._runCycle` runs silently on success (no console.log in the happy path). WS is alive and delta pipeline is functioning.
- CanvasCharacterSheetPanel not receiving data: This panel is a z=2 overlay opened only via Quick Action gesture. It is NEVER mounted at boot. The "blank body" for the full character sheet is correct Phase 20 behavior — the canvas HUD at boot shows only `CanvasStatusHudLayer` (minimal HP status line). Users open the full sheet via gesture.
- BLOCKER-01 wire regression: The `character.delta → CanvasCharacterSheetPanel.onSnapshot` wire is correct and works — but the panel is never opened at boot (it's a gesture-opened overlay). Not a boot-time blank issue.
- CHROME-01 as sole cause: The chrome guard fix was correct and is kept, but the doubled glyph artifact persisted after it because the real cause was hardcoded x offsets in `_drawDynamic` (two separate overlapping `fillText` calls, not two separate render paths).

## Resolution

root_cause: |
  FIX-DD-01 (real root cause of doubled glyph artifact):
  `_drawDynamic` in `canvas-status-hud-layer.ts` used three independent `fillText`
  calls with HARDCODED x offsets: `fillText(hpText, 4, 18)`, `fillText(acText, 60, 18)`,
  `fillText(lvText, 100, 18)`. At VT323 16px font, "PF 41/63" renders approximately
  75px wide (measured: x=4 to x≈79). The "CA 18" call started at x=60, OVERLAPPING
  the last ~19px of hpText (the `/`, `6`, `3` characters overlap with `C`, `A`, ` `
  from "CA 18"). Similarly "LV 10" at x=100 overlapped the tail of "CA 18". The
  combined shape of overlapping glyphs at x=60-79 (specifically `3`+`C`, `6`+`A`)
  created the visual signature of "the same status line drawn twice with a slight
  x-offset" — which is how the human-readable content appeared doubled without
  actually being two separate render paths.

  CHROME-01 (also correct, kept separately):
  `writeHeaderChrome` / `writeFooterChrome` in `boot-engine-core.ts` step 12a were
  called unconditionally in canvas mode, writing glyph chrome text into `hud-capture`
  (id=4). This was a real bug — also fixed, but its symptom was a different string
  ("MAP · — · raster TURNO —/—") superimposed on the canvas, not the glyph doubling.

fix: |
  FIX-DD-01: Replace hardcoded x offsets (60, 100) in `_drawDynamic` with dynamic
  positioning using `ctx.measureText`. Each field now starts at:
    hpText at x=4
    acText at x = 4 + ctx.measureText(hpText).width + STATUS_FIELD_GAP_PX (8px)
    lvText at x = acX + ctx.measureText(acText).width + STATUS_FIELD_GAP_PX (8px)
  `STATUS_FIELD_GAP_PX = 8` exported as a named constant for test assertions.
  Also: `_drawDynamic` exported as a named export for direct unit testing.

  CHROME-01 (kept): Guard `writeHeaderChrome` / `writeFooterChrome` behind
  `layerManager.getRenderMode() !== 'canvas'` in boot-engine-core.ts step 12a.

verification: |
  After FIX-DD-01: fresh sim boot (PID 1980088, xvfb-run, new session), vite pid
  1759521 (confirmed only listener on :5173), re-seed via _seed.ts, screenshot
  /tmp/after_fix_clean.png (5547 bytes) shows `PF 41/63 CA 18 LV 10` in a single
  clean phosphor-green line with NO superimposed glyphs.

  Test suite: 239 test files, 3306 tests passed (0 failures). 6 new FIX-DD-01
  regression guard tests added to `canvas-status-hud-layer.test.ts`:
    - non-overlap assertion at 50px measured width
    - non-overlap assertion at 75px measured width (the actual multi-digit HP failure case)
    - correct field text content
    - null snapshot idle placeholder (single fillText, no measureText calls)
    - STATUS_FIELD_GAP_PX is positive
    - all fields at y=18 baseline

files_changed:
  - packages/g2-app/src/status-hud/canvas-status-hud-layer.ts (FIX-DD-01: _drawDynamic measureText positioning; STATUS_FIELD_GAP_PX and _drawDynamic exported)
  - packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts (measureText added to makeFakeCtx; 6 FIX-DD-01 regression guard tests added; _drawDynamic and STATUS_FIELD_GAP_PX imported)
