---
"@evf/g2-app": patch
"@evf/foundry-module": patch
---

Login errors on The Forge: a login wall (private game) or Forge Automatic User Management taking over `/join` is now reported as a clear "The Forge is intercepting the login" cause (credentials kept) instead of showing a raw HTML page. Setup guide + wiki explain the private-game requirements.
