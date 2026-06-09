---
"@evf/g2-app": patch
---

Fix doubled/overlapping canvas status-HUD header. Two causes: (CHROME-01) `writeHeaderChrome`/`writeFooterChrome` ran unconditionally in canvas mode, writing glyph chrome into the `hud-capture` text container (id=4) — now guarded behind `getRenderMode() !== 'canvas'`; (FIX-DD-01) `CanvasStatusHudLayer._drawDynamic` used hardcoded x-offsets that overlapped at VT323 16px — now positioned dynamically via `ctx.measureText`. Adds regression tests. Verified clean in the EvenHub simulator: header renders `PF 41/63 CA 18 LV 10` as a single non-overlapping line.
