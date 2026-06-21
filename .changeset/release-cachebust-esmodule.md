---
"@evf/foundry-module": patch
---

Release CD now version-stamps the Foundry esmodule filename
(`dist/module.js` → `dist/module-<version>.js`) and points `module.json` `esmodules`
at it. The entry-point URL was stable across releases, so a CDN/browser HTTP cache
keyed on `modules/evenfoundryvtt/dist/module.js` kept serving the OLD bundle even
after `module.json`'s version bumped — Foundry reported the new version while still
executing stale code (v0.1.49 spell casts kept hanging with the pre-fix handler
despite the fix shipping in the artifact). A per-version filename guarantees a unique
URL no cache can serve stale. The committed `module.json` keeps `dist/module.js` for
local dev; the rename happens only in the release artifact.
