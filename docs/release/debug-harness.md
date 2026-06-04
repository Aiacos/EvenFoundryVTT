# Debug/Control Harness — Developer Guide

> **SECURITY: DEV-ONLY.** This entire debug surface is gated behind `EVF_DEBUG=1`
> (bridge) and `VITE_EVF_DEBUG=1` (g2-app). Routes are **not registered at all**
> when the flag is off — every `/debug/*` path returns Fastify's default 404 (route
> literally absent, not 403). An additional `EVF_INTERNAL_SECRET` timing-safe check
> gates every request (HTTP) or WS upgrade (WebSocket).
>
> **Production Docker images MUST NOT set `EVF_DEBUG`.** If for any reason you need
> to enable debug in a production deployment, a SECOND explicit opt-in is required:
> `EVF_DEBUG_ALLOW_PROD=true`. Never set either flag beyond a local LAN.
>
> The bridge binds `0.0.0.0` (Docker requirement) — **do not expose port 8910 beyond
> your LAN.** The debug surface can drive real Foundry writes, inject envelopes, and
> command the g2-app's pairing wizard.

---

## 1. What this provides

The debug/control harness (Quick Task 260604-cwa) extends the existing observability
backend (Quick Tasks 260529-h5e + 260529-icd) with a **bidirectional agent control
channel**: a WebSocket endpoint where the g2-app connects as a named agent, a command
relay (`POST /debug/cmd`) that routes commands to named agents and correlates results,
an agent roster (`GET /debug/agents`), and an aggregated log reader (`GET /debug/logs`).

Together these endpoints enable **headless end-to-end driving** of the full wizard
pairing flow from a curl/wscat orchestrator: `setBridgeUrl → goStep(2) → setToken →
click(connect)` while reading aggregated bridge + g2-app logs via `/debug/logs`.

---

## 2. How to enable

### 2.1 Bridge

```bash
EVF_DEBUG=true \
EVF_INTERNAL_SECRET=<your-secret> \
  corepack pnpm --filter @evf/bridge dev
```

### 2.2 g2-app (Vite dev server + Even Hub simulator)

```bash
VITE_EVF_DEBUG=true \
VITE_EVF_DEBUG_HUB=ws://localhost:8910/debug/agent \
VITE_EVF_DEBUG_SECRET=<your-secret> \
  corepack pnpm --filter @evf/g2-app dev
```

Once the app is running, load it in the Even Hub simulator:

```bash
# Start the Even Hub simulator (local preview on Chromium WebView)
npx --yes @evenrealities/evenhub-simulator http://localhost:5173

# OR pair a physical G2 device via QR code
corepack pnpm --filter @evf/g2-app dev:qr
```

When the g2-app is loaded in the WebView and `VITE_EVF_DEBUG` is set, it automatically:
1. Opens a WebSocket to `ws://localhost:8910/debug/agent?secret=<secret>`.
2. Sends `{kind:'register', role:'g2-app', name:'main'}`.
3. Mirrors `console.*` + `window.error` + unhandled rejections as `{kind:'log'}` frames.
4. Exposes `window.__EVF_DEBUG__` in the browser console with all command handlers.

---

## 3. Endpoint reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `WS /debug/agent` | GET (WS upgrade) | Agent connects, registers `{role,name}`, receives command frames, sends result frames back. Secret via `?secret=` query param (WS cannot set headers). |
| `GET /debug/agents` | GET | Returns roster of currently connected agents. `Authorization: Bearer <secret>`. |
| `POST /debug/cmd` | POST | Relays a command to the named agent; optionally waits for result (`wait:true`). `Authorization: Bearer <secret>`. |
| `GET /debug/logs?since=<id>` | GET | Returns ring-buffer events (bridge pino logs + agent log/result events) with id > since. `latestId` in response enables polling. `Authorization: Bearer <secret>`. |

**Pre-existing endpoints** (Quick Task 260529-h5e — still available):

| Endpoint | Description |
|----------|-------------|
| `GET /debug/state` | Redacted bridge snapshot (sessions, caches, metrics). |
| `GET /debug/events` | Filtered ring-buffer events (tail/type/direction filters). |
| `POST /debug/inject` | Fan any envelope to one or all sessions. |
| `POST /debug/dispatch-tool` | Drive a real Foundry tool via ADR-0011 dispatch fn. |
| `POST /debug/simulate-gesture` | Emit an `r1.gesture` envelope to a session. |
| `POST /debug/displayop` | Record a g2-app render op mirror. |
| `WS /debug/stream` | Live event feed (all bus events, secret via `?secret=`). |
| `GET /debug/console` | Single-file CRT dashboard HTML. |

---

## 4. Available wizard commands (via `POST /debug/cmd`)

When the g2-app debug agent is connected (`role: 'g2-app'`), the following commands
are available via the `cmd` field:

| Command | `args` | Description |
|---------|--------|-------------|
| `getState` | `{}` | Returns the wizard store snapshot (step, bridgeUrl, token, ...). |
| `setBridgeUrl` | `{url: string}` | Sets `store.bridgeUrl`. |
| `setToken` | `{t: string}` | Sets `#evf-token-input` value and fires 'input' event (enables connect btn). |
| `goStep` | `{n: 1\|2\|3}` | Sets `store.step` to STEP1/2/3. |
| `click` | `{target: string}` | Resolves alias (`connect`→`#evf-connect-btn`, `back`→back btn) or CSS selector, dispatches MouseEvent. |
| `reveal` | `{}` | Clicks the show/hide toggle on the token input. |
| `dumpDom` | `{}` | Returns `#step-content` outerHTML string. |
| `snapshot` | `{}` | Returns `{step, visibleButtons, inputs}` compact summary. |

---

## 5. End-to-end headless pairing recipe (curl/wscat)

The following sequence drives the wizard from STEP1 → STEP2 → authenticate → STEP3
headlessly, using `Authorization: Bearer <secret>` on every HTTP call:

```bash
SECRET=<your-secret>
BASE=http://localhost:8910

# 1. Confirm the g2-app agent is connected
curl -s -H "Authorization: Bearer $SECRET" "$BASE/debug/agents" | jq .

# 2. Set the bridge URL in the wizard store
curl -s -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"target":"main","cmd":"setBridgeUrl","args":{"url":"http://localhost:8910"}}' \
  "$BASE/debug/cmd" | jq .

# 3. Advance to Step 2 (token entry)
curl -s -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"target":"main","cmd":"goStep","args":{"n":2}}' \
  "$BASE/debug/cmd" | jq .

# 4. Enter the bearer token (enables the connect button)
curl -s -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"target":"main","cmd":"setToken","args":{"t":"<bearer-token>"}}' \
  "$BASE/debug/cmd" | jq .

# 5. Click the connect button, wait for the result (store → STEP3 on 200)
curl -s -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"target":"main","cmd":"click","args":{"target":"connect"},"wait":true}' \
  "$BASE/debug/cmd" | jq .

# 6. Poll aggregated logs (replace 0 with the latestId from previous response)
curl -s -H "Authorization: Bearer $SECRET" "$BASE/debug/logs?since=0" | jq .
```

**WebSocket connect example** (wscat or websocat):

```bash
# Connect as observer (Authorization header)
wscat --header "Authorization: Bearer $SECRET" ws://localhost:8910/debug/stream

# Connect as agent (query param — WS cannot set headers)
wscat "ws://localhost:8910/debug/agent?secret=$SECRET"
```

---

## 6. Security notes

- **Double opt-in for prod**: `EVF_DEBUG=true` alone does NOT enable debug in
  `NODE_ENV=production`. You must also set `EVF_DEBUG_ALLOW_PROD=true`.
- **EVF_INTERNAL_SECRET**: reused from the `/internal/delta` route. Use a strong
  random value (32+ bytes hex). Never commit to source control.
- **Redaction**: all agent log events and command results flow through the
  `DebugEventBus` structural redaction — known session tokens and fields named
  `token`, `bearer`, `secret`, `authorization`, `apiKey` are scrubbed to hints.
- **Prod dist tree-shake**: the g2-app debug agent code is absent from the production
  `.ehpk` bundle. The `EVF_DEBUG_AGENT_MARKER` (`__EVF_DEBUG_AGENT_v1__`) is verified
  absent from `packages/g2-app/dist/**/*.js` by the CI Task 3 grep gate.

---

## 7. Foundry-module log forwarding (future work)

Forwarding Foundry-module logs to the `/debug/agent` hub is out of scope for this
task. When implemented, it would allow the aggregated `/debug/logs` feed to include
Foundry-side output alongside bridge pino logs and g2-app console mirrors.
