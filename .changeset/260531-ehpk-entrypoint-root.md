---
"@evf/g2-app": patch
---

Emit the Vite HTML entry at the dist root (`dist/index.html`) via `root: 'src'` +
`outDir: '../dist'`, and restore the Even Hub manifest `entrypoint` to the canonical
`index.html`. This supersedes the earlier `src/index.html` band-aid (which leaked
Vite's source path into the published manifest) and re-aligns `app.json` with the
documented entrypoint in `docs/release/evenhub.md`, `.planning/REQUIREMENTS.md`
(DIST-EHUB-01) and `Specs.md`. Verified: `evenhub pack` succeeds against
`dist/index.html`.
