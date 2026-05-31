---
"@evf/g2-app": patch
---

Fix `app.json` `entrypoint` to `src/index.html` — Vite emits the entry at
`dist/src/index.html`, so the Even Hub `pack` step now resolves it correctly
(verified: `Successfully packed ... (99940 bytes)`).
