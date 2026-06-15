---
"@evf/foundry-module": patch
---

fix(foundry-module): use the real socketlib registerModule/register API and register socketlib handlers on socketlib.ready, decoupled from the Foundry ready hook so the /internal/delta push readers always register — restores real Forge pairing.
