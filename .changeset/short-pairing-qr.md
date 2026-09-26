---
"@evf/foundry-module": patch
"@evf/g2-app": patch
"@evf/shared-protocol": patch
---

Pairing QR now carries only the 16-character code (`…/app/#c=<CODE>`, about 63 characters instead of 201): the QR is small enough for the Even Realities App to scan from a screen, and the link is short enough to type. The window also shows the plain app address for developer mode (open it, then type the code). Pairings made with v0.3.0 keep working.
