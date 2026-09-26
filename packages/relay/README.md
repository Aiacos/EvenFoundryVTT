# @evf/relay

## 🎲 Overview

Opaque WebSocket room relay between a player's Foundry tab (the **projector**) and the G2 app
(the **glasses**), per [ADR-0019](../../docs/architecture/0019-relay-pairing-player-projector.md).
It runs as a Cloudflare Worker with one Durable Object per room (WebSocket Hibernation API, so
idle rooms cost nothing). Application frames are AES-GCM sealed envelopes: the relay forwards
them verbatim and never parses them.

**Contract**

| Request | Response |
|---|---|
| `GET /r/<room>?role=projector\|glasses` + `Upgrade: websocket` | `101`, socket joins room `<room>` (`/^[A-Za-z0-9_-]{22,64}$/`) |
| same, without `Upgrade: websocket` | `426` |
| bad path / room id / role, other methods | `404` |
| `GET /health` | `200 ok`, `Access-Control-Allow-Origin: *` |
| `OPTIONS` any path | `204` + CORS headers |

Inside a room:

- One socket per role: a newer socket closes the previous one with `4000 replaced`.
- When both roles are connected, **both** sides receive `{"relay":"peer-up"}`.
- A real close/error of the current socket sends `{"relay":"peer-down"}` to the peer; a replaced
  socket never does.
- Every frame (text or binary) goes to the other role only; with no peer it is dropped.
- Frames > 1 MiB (UTF-8 bytes for text) close the sender with `1009`; more than 60 frames in any
  rolling second close it with `1008`.
- Relay control frames are always JSON `{"relay":"…"}`.

## ⚙️ Configuration

`wrangler.toml` declares the Worker `evf-relay` and the `ROOM` Durable Object binding (class
`Room`, SQLite-backed migration `v1`). There are no secrets or variables.

```bash
pnpm --filter @evf/relay dev        # wrangler dev → http://localhost:8787
```

## 🚀 Deploy

```bash
CLOUDFLARE_API_TOKEN=… pnpm --filter @evf/relay deploy   # → https://evf-relay.<account>.workers.dev
```

The token needs *Workers Scripts: Edit* on the target account. **Self-hosting:** deploy the same
package to your own Cloudflare account (or run it under `wrangler dev`/workerd) and point the
Foundry module's relay URL override at it; the QR payload carries the override to the glasses.

## 🔐 Security

The relay sees room ids, timing and frame sizes, never content: end-to-end confidentiality and
authenticity come from the sealed envelope (AES-256-GCM, AAD `from>to`, anti-replay) whose key
only the paired projector and glasses hold. A room id is a 128-bit+ random secret; anyone who
learns it can join a role but cannot read or forge frames. Size and rate caps bound abuse.

## 🧪 Testing

```bash
pnpm vitest --run --project relay                            # unit tests (Node, fake DO state)
pnpm --filter @evf/relay dev &                               # then, against the local relay:
EVF_RELAY_IT=1 pnpm vitest --run --project relay src/relay.it
```

`EVF_RELAY_URL` retargets the integration test (default `http://127.0.0.1:8787`).
