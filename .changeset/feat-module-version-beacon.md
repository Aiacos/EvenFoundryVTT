---
"@evf/foundry-module": minor
"@evf/bridge": patch
---

Add a module-version beacon so an operator can see which module build each connected
Foundry client is actually running (stale browser cache vs current). The tool-invocation
poller tags its drain GET with `&mv=<module version>` (resolved live from
`game.modules.get('evenfoundryvtt').version`); the bridge ignores the param for draining
but logs it once per client on change (`EVF client module version beacon`). Because it's
an ordinary query param, the running module version is visible in the bridge's request
access log even before the bridge itself is updated.
