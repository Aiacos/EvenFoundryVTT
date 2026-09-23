---
status: accepted
date: 2026-09-23
deciders: maintainer
consulted: research agents (Even Hub docs 2026-09, Foundry v13/v14 socket protocol)
informed: all packages
---

# ADR-0016: Direct Foundry → G2 Streaming (bridge + Docker removed)

## Status

> **AMENDED** — 2026-09-23 by [ADR-0017](./0017-player-owned-glasses-hybrid-projector.md) (pairing, key custody, projector location) and [ADR-0018](./0018-dnd-sheet-hud-pixel-renderer.md) (point 6, map rendering).

**ACCEPTED** — 2026-09-23. Supersedes the deployment topology of Specs.md §11.5.3
(Docker Compose bridge) and the transport sections of [ADR-0002](./0002-protocol-versioning.md)
(bridge WS envelope). Partially supersedes [ADR-0004](./0004-voice-via-mcp-not-internal.md):
the bridge-hosted Deepgram proxy and `foundry-mcp` (which dialled the bridge) are removed;
voice/MCP may return later as a client of the same direct channel (new ADR required).
[ADR-0011](./0011-foundry-write-path-single-workflow-origin.md) stays in force: every
mutation still originates in the GM client's `dispatchTool` pipeline.

## Context

- The Node bridge (`packages/bridge`) was mostly stubs in production: token validation,
  snapshots and tool dispatch returned placeholders; only `POST /internal/delta` was live.
  Running it required Docker Compose, a public HTTPS origin, a shared secret and a bearer.
- Even Hub networking (hub.evenrealities.com/docs/build/networking, 2026-08): outbound
  origins are **fixed in `app.json`, no wildcards**, and the whitelist **does not bypass
  CORS**. A packaged plugin therefore cannot reach an arbitrary user-typed Foundry URL.
- Even Hub supports **QR sideload** (get-started/architecture): the Even Realities App
  scans a QR that encodes a plain URL and loads that page as the plugin WebView, with the
  `EvenAppBridge` injected (`evenhub-cli@0.1.14` `qr` command encodes the URL verbatim).
- Foundry serves every module's files statically at `/modules/<id>/…`, and relays
  `module.<id>` socket messages "between the sending client and all other connected
  clients" (foundryvtt.com/article/module-development). Foundry v14 accepts the socket
  session **only from the `session` cookie** — first-party context required.
- dnd5e derived data (AC, modifiers, slot max) and `activity.use()` only exist inside a
  full Foundry browser client; module code cannot run server-side.

## Decision Drivers

1. Zero extra infrastructure for the table (no Docker, no bridge, no second origin).
2. Pairing in one gesture: "scan the QR shown in Foundry".
3. Works on Foundry v13 **and** v14 (cookie-only session).
4. Privacy: the module socket relay broadcasts to every client.
5. Keep ADR-0011 single-workflow-origin for all writes.

## Considered Options

| Option | Verdict |
|---|---|
| A. Keep a slimmed bridge (relay/CORS proxy) | Rejected — still a server to deploy; the goal is removal. |
| B. Packaged `.ehpk` talking cross-origin to Foundry | Rejected — whitelist is per-build, Foundry sends no CORS, v14 needs first-party cookie. |
| C. Hidden iframe running full Foundry `/game` on the phone | Rejected — full PIXI canvas + world payload + all modules on a phone WebView. |
| D. WebRTC data channel | Rejected — signalling still needs D's socket; adds NAT/TURN. |
| **E. g2-app bundled inside the Foundry module, served same-origin, QR-sideloaded; raw socket.io client as a dedicated "(G2)" user; GM-client *projector* answers over `module.evenfoundryvtt` with AES-GCM sealed envelopes** | **Chosen.** |

## Decision Outcome

**Option E.**

```
[G2 glasses] ⇄ BLE ⇄ [Even App WebView ── page served by Foundry: /modules/evenfoundryvtt/g2/]
                                   │  same-origin HTTPS: POST /join (cookie) + socket.io
                                   ▼
                           [Foundry server]  relays module.evenfoundryvtt
                                   │
                                   ▼
             [GM browser: evenfoundryvtt module = PROJECTOR]
               readers (derived dnd5e data) · dispatchTool (ADR-0011) · pairing registry
```

1. **Hosting** — `pnpm --filter @evf/g2-app build` emits into
   `packages/foundry-module/g2/`; the module zip ships it. Entry URL:
   `https://<foundry>[/<routePrefix>]/modules/evenfoundryvtt/g2/index.html`.
2. **Identity** — one Foundry user per paired player, named `"<Player> (G2)"`, role
   PLAYER, OWNER only on the chosen actor. Never reuse the player's own user (Foundry
   issue #14728 will reject concurrent logins of one user).
3. **Pairing** — GM opens *Associa occhiali G2* (module settings). The module creates or
   refreshes the G2 user with a random password and a random 256-bit key `K`, then shows a
   QR of `…/g2/index.html#evf=<base64url(json{v:1,u:userId,p:password,k:K})>`. The
   fragment never reaches the server. Manual fallback: pick the "(G2)" user from `/join`
   and type a 16-char code (password; `K` = HKDF(code)). QR expires after 5 min.
4. **Transport** — the g2-app logs in with `POST /join` (same origin → first-party
   cookie) and opens socket.io (`/socket.io/`, EIO 4). All app traffic uses
   `module.evenfoundryvtt` with a **sealed envelope**
   `{evf:1, to, from, iv, ct}` = AES-GCM(K, json message, AAD=`from>to`). Other clients
   see only ciphertext.
5. **Projector** — the GM client module decrypts, serves `hello → welcome` (rotates the
   G2 password after first use — one-time QR), snapshots (character / combat / scene),
   pushes deltas from the existing hook subscribers, and executes `tool.invoke` through
   the existing `dispatchTool` (ADR-0011). Keys live **only** in GM client storage
   (`scope: 'client'`); the world setting holds public metadata (userId, actorId, label).
6. **Map** — rendered on the phone from the `scene` snapshot (grid, walls, lights,
   visible tokens, background URL fetched same-origin) into a 192×288 4-bit pixel map
   (2 image containers 192×144), ≈1 fps budget (BLE 10–30 KB/s, 100 ms image pacing).
7. **Removed** — `packages/bridge`, `packages/foundry-mcp`, `deploy/`, bridge-only
   protocol (handshake/resume/debug-events), g2-app bridge wizard + audio capture.

## Consequences

- ➕ No server to run; pairing = one QR scan; works on v13 and v14; privacy via E2E seal.
- ➕ ~10 k LOC of bridge/MCP/Docker removed; one fewer release artefact (GHCR image).
- ➖ A GM browser must be online (true before too: socketlib `executeAsGM`).
- ➖ Foundry must be reachable over **valid HTTPS** from the phone (LAN self-signed fails).
- ➖ Relies on the undocumented `/join` + socket.io handshake → guarded by a version probe
  and a GO/NO-GO hardware gate (below).
- ➖ Voice (Deepgram) and MCP are out of scope until a new ADR.

### Confirmation / GO-NO-GO gates (defer-hardware pattern)

- `validation-harness`: `validate:direct-sideload` — the Even App loads a QR URL served
  by Foundry, the SDK bridge is injected, first-party cookies persist across foreground
  exit/enter. If NO-GO → fallback: same-site reverse-proxy subdomain (documented).
- Unit/integration tests: sealed envelope round-trip, projector request/response,
  pairing payload encode/decode, `/join` + socket client against a fake server.

## More Information

- Design & mocks: [`docs/design/g2-thirds-layout.md`](../design/g2-thirds-layout.md)
- Sources: hub.evenrealities.com/docs/build/networking · /get-started/architecture ·
  /build/display · /build/device-apis (fetched 2026-09-23); `@evenrealities/even_hub_sdk`
  0.0.15; foundryvtt.com/article/module-development; foundryvtt.com/api/v13
  `foundry.Game`; github.com/foundryvtt/foundryvtt/issues/14728.
