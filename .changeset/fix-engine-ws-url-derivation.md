---
"@evf/g2-app": patch
---

fix(engine): derive the bridge WebSocket connect URL from the REST base URL

`bootEngine` opened `new WebSocket(opts.bridgeUrl)` against the raw REST base
(e.g. `https://host:443`) — wrong scheme, no `/ws` path — so the WebSocket never
connected and the engine threw at step 5 ("[EVF] launch: bootEngine failed"),
leaving the glasses black.

Added a pure, unit-tested `toWsConnectUrl(baseUrl)` helper
(`engine/ws-url.ts`): `http→ws` / `https→wss`, trailing slashes stripped, `/ws`
appended, idempotent for already-`ws`-scheme and already-`/ws` inputs. Both
WS-open sites in `boot-engine-core.ts` (initial connect + the
`WsReconnectController` url) now route through it. `opts.bridgeUrl` stays the
REST base URL contract; the displayop and audio consumers keep using it as the
HTTP(S) base unchanged.
