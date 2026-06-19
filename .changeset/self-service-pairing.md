---
"@evf/foundry-module": minor
---

Self-service device pairing: every Foundry user can now mint their OWN G2 bearer
token, bound to their own authenticated identity, without the GM doing anything
manually. The pair menu is no longer GM-restricted (`pairDevice` `restricted:
false`) and the user-picker dropdown is removed — you can only pair your own
device.

Secure by construction (ADR-0014): the bound userId is authenticated, never
client-asserted. A user writes a `pendingPair` flag (with a client-generated
token) on their OWN `User` document — only that user can write their own user
flags — and a GM client auto-ingests it into the world-scope bearer registry,
binding the token to the user the flag belongs to (taken from the User document,
never from the payload), then pushes it to the bridge. socketlib's `executeAsGM`
is deliberately NOT used here because it cannot authenticate the caller (which
would let a player bind a token to another user and read their character). No new
socketlib handler is added (handler count stays 17).

New: `ingestBearer` in bearer-registry (the GM-side write half; idempotent, 60s
refresh grace) and `self-pair-ingestion.ts` (the `updateUser` hook + `ready`
sweep). Note: finalizing a token requires a GM client to be online (world-scope
registry writes are GM-only) — but it is auto-ingested with no manual GM action.
