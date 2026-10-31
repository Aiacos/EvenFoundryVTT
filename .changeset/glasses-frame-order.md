---
"@evf/g2-app": patch
---

Glasses → Foundry frames now leave in call order: sealing is async, so a later frame could overtake an earlier one (e.g. two quick actions arriving swapped). Same per-device queue the Foundry projector already used.
