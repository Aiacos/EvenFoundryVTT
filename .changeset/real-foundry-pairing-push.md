---
"@evf/shared-protocol": patch
"@evf/foundry-module": patch
"@evf/bridge": patch
---

Wire push-based bridge↔Foundry bearer-registry + character-list path enabling real pairing.

Adds two new push envelopes (`r1.bearers.available`, `r1.characters.available`) that the Foundry
module emits on `ready` and on bearer/actor lifecycle events. The bridge caches both and uses
them to validate bearer tokens (`GET /v1/health`) and serve the player-character roster
(`GET /v1/characters`) without a socketlib roundtrip. `buildServer({})` now works with NO
options — real token validation and character listing are wired internally.

Security: bearer tokens are pushed over the EVF_INTERNAL_SECRET-gated /internal/delta channel
(homelab trust model). Tokens are Zod-validated at the handler boundary before cache write and
never logged (T-RFP-01 / T-RFP-02). A never-pushed cache returns `foundry_unreachable` (503)
distinguishable from `unknown_token` (401) — T-RFP-03.
