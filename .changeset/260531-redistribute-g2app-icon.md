---
"@evf/foundry-module": patch
---

Distribution re-release: bundle the updated g2-app (Even Hub app icon + manifest `description` +
dev-mode docs) into the release assets. No module source change — the foundry-module release is the
distribution anchor that re-packages `g2-app-dist.zip` + the submission-ready `evenfoundryvtt.ehpk`
(now carrying the icon + description) and attaches them to the GitHub Release.
