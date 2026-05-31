---
"@evf/g2-app": patch
---

Add Even Hub manifest (`app.json`) for the g2-app plugin + CI packaging pipeline
(`evenhub-pack.yml`) that builds and packs a submission-ready `.ehpk` on every merge
to main. Closes DIST-EHUB-01 (portal submission remains manual — Even Hub has no
non-interactive CI submit). See `docs/release/evenhub.md`.
